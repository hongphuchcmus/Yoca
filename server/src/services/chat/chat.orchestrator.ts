import { GoogleGenAI } from "@google/genai";
import {
  GOOGLE_AI_KEY,
  CHAT_MODEL,
} from "@sv/config/constants.js";
import { createHash } from "node:crypto";
import type {
  ChatResponse,
  ChatToolCall,
  ChatToolResult,
  HistoryMessage,
  PriorContext,
} from "./chat.types.js";
import { TOOL_DEFINITIONS, TOOL_HANDLERS, hasTool, isWalletTool } from "./chat.tools.js";
import {
  buildToolSelectionPrompt,
  buildResponseGenerationPrompt,
  CHAT_SYSTEM_INSTRUCTION,
} from "./chat.prompts.js";
import { getCachedResponse, setCachedResponse } from "./chat.cache.js";
import { chatInfo, chatWarn, chatError, chatDebug } from "./chat.logger.js";
import { DATA_TRANSFORMERS } from "./data-transformers.js";
import { sanitizeText, sanitizeResponse } from "./chat-sanitizer.js";
import { getMessage } from "./chat.localization.js";
import { classifyWalletChatIntent, inferWalletChatLanguage } from "./chat-intent.js";
import { buildWalletFallbackResponse } from "./chat-fallback.js";
import { getTokenTopPools } from "@sv/services/tokens/token-pools.js";
import {
  buildToolDataReference,
  filterDuplicateToolCalls,
  getResolveSpec,
  getToolAllowedKeys,
  normalizeToolInput,
  pickResolvedValue,
  RESOLVABLE_TOOLS,
  stableStringify,
} from "./chat-tool-normalizer.js";
import type { ActionSpec, ChartSpec, ChatSource, TableSpec, ToolDataReference, WalletConfidence, WalletWarning, WalletChatSection, WebSearchArticle } from "./chat.types.js";
import { z } from "zod";
import { WALLET_CHAT_RESPONSE_LIMITS as L } from "./chat-fallback.js";
import {
  trackGemini,
  type GeminiOperationId,
} from "@sv/services/tracking/gemini-metrics.js";

const MAX_ITERATIONS = 3;

let cachedClient: GoogleGenAI | null = null;

function trunc(v: unknown, max = 500): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s.length <= max) return s;
  return s.slice(0, max) + `... (truncated, ${s.length} total)`;
}

function getClient(): GoogleGenAI {
  if (!GOOGLE_AI_KEY) {
    chatError("GOOGLE_AI_KEY not configured");
    throw new Error("GOOGLE_AI_KEY is not configured");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: GOOGLE_AI_KEY });
  }
  return cachedClient;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  const candidate = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function callGemini(
  operation: GeminiOperationId,
  prompt: string,
  systemInstruction?: string,
): Promise<string | null> {
  const client = getClient();
  chatDebug("Gemini call start", { promptLength: prompt.length, hasSystemInstruction: !!systemInstruction });
  const start = performance.now();
  try {
    const response = await trackGemini(operation, CHAT_MODEL, () => client.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    }));
    const duration = Math.round(performance.now() - start);
    const text = response.text ?? null;
    chatDebug("Gemini call success", { durationMs: duration, responseLength: text?.length ?? 0 });
    return text;
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    chatError("Gemini call failed", { durationMs: duration, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function stripAddressKeys(input: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...input };
  delete copy.address;
  delete copy.addresses;
  return copy;
}


async function selectTool(
  query: string,
  addresses: string[],
  language?: string,
  context?: PriorContext,
  history?: HistoryMessage[],
): Promise<ChatToolCall[] | { type: "no_tool" | "general"; message: string }> {
  const prompt = buildToolSelectionPrompt(query, TOOL_DEFINITIONS, addresses, context, history, language);
  const raw = await callGemini(
    "gemini.svc.chat_tool_selection",
    prompt,
  );

  if (!raw) {
    chatWarn("selectTool: Gemini returned null", { addresses });
    return { type: "general", message: getMessage(language, "noResponse") };
  }

  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    chatWarn("selectTool: failed to parse JSON from Gemini", { raw: trunc(raw, 300) });
    return { type: "general", message: getMessage(language, "noUnderstand") };
  }

  const p = parsed as Record<string, unknown>;

  if (p.type === "no_tool" || p.type === "general") {
    chatInfo("selectTool: no more tools needed", { type: p.type, message: trunc(p.message as string ?? "", 200) });
    return {
      type: p.type as "no_tool" | "general",
      message: sanitizeText((p.message as string) ?? ""),
    };
  }

  if (p.type === "tool_use") {
    const toolsRaw = p.tools;
    if (Array.isArray(toolsRaw) && toolsRaw.length > 0) {
      const tools: ChatToolCall[] = [];
      for (const t of toolsRaw) {
        if (t && typeof t === "object" && typeof (t as Record<string, unknown>).name === "string" && hasTool((t as Record<string, unknown>).name as string)) {
          tools.push({
            type: "tool_use",
            name: (t as Record<string, unknown>).name as string,
            input: ((t as Record<string, unknown>).input as Record<string, unknown>) ?? {},
          });
        }
      }
      if (tools.length > 0) {
        chatInfo("selectTool: tools selected", {
          count: tools.length,
          names: tools.map((t) => t.name),
          inputs: tools.map((t) => trunc(t.input, 200)),
        });
        return tools;
      }
      chatWarn("selectTool: tool_use declared but no valid tools parsed", { raw: trunc(p, 300) });
    }
  }

  chatWarn("selectTool: unrecognized response shape", { raw: trunc(p, 300) });
  return { type: "general", message: getMessage(language, "noTool") };
}

function mergeAddressData(perAddress: Array<{ address: string; data: unknown }>): unknown {
  const dataList = perAddress.map((r) => r.data).filter((d) => d != null);
  if (dataList.length <= 1) return dataList[0] ?? null;

  const first = dataList[0];

  // Array to concatenate (portfolio, balance_history, etc.)
  if (Array.isArray(first)) {
    return dataList.flatMap((d) => (Array.isArray(d) ? d : []));
  }

  // Object to merge array-valued properties (swaps/transfers/pnl_chart)
  if (typeof first === "object" && first !== null) {
    const keys = new Set<string>();
    for (const d of dataList) {
      if (d && typeof d === "object" && !Array.isArray(d)) {
        Object.keys(d as Record<string, unknown>).forEach((k) => keys.add(k));
      }
    }
    const merged: Record<string, unknown> = {};
    for (const key of keys) {
      const values = dataList
        .map((d) => (d as Record<string, unknown>)[key])
        .filter((v) => v != null);
      if (values.every((v) => Array.isArray(v))) {
        merged[key] = values.flatMap((v) => v as unknown[]);
      } else {
        merged[key] = values[values.length - 1];
      }
    }
    return merged;
  }

  return first;
}

async function resolveToolDependencies(
  tools: ChatToolCall[],
  query: string,
): Promise<{ tools: ChatToolCall[]; resolverResults: ChatToolResult[] }> {
  const resolvedTools: ChatToolCall[] = [];
  const resolverResults: ChatToolResult[] = [];
  const resolverCache = new Map<string, { data: unknown; llmData: unknown }>();
  const resolverKeys = new Set<string>();

  for (const tool of tools) {
    const input: Record<string, unknown> = { ...tool.input };
    let failed = false;

    for (const [key, value] of Object.entries(input)) {
      const spec = getResolveSpec(value);
      if (!spec) continue;

      if (!RESOLVABLE_TOOLS.has(spec.tool)) {
        resolverResults.push({
          name: spec.tool,
          input: spec.input,
          data: null,
          error: `Resolver tool '${spec.tool}' is not allowed`,
        });
        failed = true;
        break;
      }

      const handler = TOOL_HANDLERS[spec.tool];
      if (!handler) {
        resolverResults.push({
          name: spec.tool,
          input: spec.input,
          data: null,
          error: `Resolver tool '${spec.tool}' not found`,
        });
        failed = true;
        break;
      }

      const normalizedResolverInput = normalizeToolInput(spec.tool, spec.input, { query });
      const cacheKey = `${spec.tool}:${stableStringify(normalizedResolverInput)}`;
      try {
        let data: unknown;
        let llmData: unknown;
        const cached = resolverCache.get(cacheKey);
        if (cached) {
          data = cached.data;
          llmData = cached.llmData;
        } else {
          const result = await handler(normalizedResolverInput);
          data = result.data;
          llmData = result.llmData;
          resolverCache.set(cacheKey, { data, llmData });
        }
        resolverKeys.add(cacheKey);

        const picked = pickResolvedValue(llmData, spec.pick) ?? pickResolvedValue(data, spec.pick);
        resolverResults.push({
          name: spec.tool,
          input: normalizedResolverInput,
          data: llmData,
          fullData: data,
        });
        if (picked == null) {
          failed = true;
          resolverResults.push({
            name: tool.name,
            input: tool.input,
            data: null,
            error: `Could not resolve '${key}' from ${spec.tool}.${spec.pick}`,
          });
          break;
        }
        input[key] = picked;
      } catch (err) {
        failed = true;
        resolverResults.push({
          name: spec.tool,
          input: normalizedResolverInput,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }

    if (!failed) {
      resolvedTools.push({
        ...tool,
        input: normalizeToolInput(tool.name, input, { query }),
      });
    }
  }

  // Remove tools that already ran as resolvers (standalone dedup)
  const filtered = resolvedTools.filter((tool) => {
    const key = `${tool.name}:${stableStringify(tool.input)}`;
    return !resolverKeys.has(key);
  });

  return { tools: filtered, resolverResults };
}
async function executeToolsForAllAddresses(
  addresses: string[],
  tools: ChatToolCall[],
): Promise<ChatToolResult[]> {
  const results = await Promise.all(
    tools.map(async (tool) => {
      const handler = TOOL_HANDLERS[tool.name];
      const start = performance.now();

      if (!handler) {
        chatWarn("executeToolsForAllAddresses: handler not found", { tool: tool.name });
        return { name: tool.name, input: tool.input, data: null, error: `Tool '${tool.name}' not found` };
      }

      try {
        if (isWalletTool(tool.name)) {
          const restInput = stripAddressKeys(tool.input as Record<string, unknown>);
          const perAddress = await Promise.all(
            addresses.map(async (addr) => {
              const { data: rawData, llmData } = await handler({ ...restInput, address: addr });
              return { address: addr, data: rawData, llmData };
            }),
          );

          const duration = Math.round(performance.now() - start);
          chatInfo("executeToolsForAllAddresses: fan-out success", {
            tool: tool.name,
            addresses: addresses.length,
            durationMs: duration,
          });

          const mergedData: Record<string, unknown> = {};
          for (const pa of perAddress) {
            mergedData[pa.address] = pa.llmData;
          }

          const mergedFullData = mergeAddressData(perAddress);

          return {
            name: tool.name,
            input: { ...tool.input, addresses },
            data: mergedData,
            fullData: mergedFullData,
          };
        }

        const { data: fullData, llmData } = await handler(tool.input);
        const duration = Math.round(performance.now() - start);
        chatInfo("executeToolsForAllAddresses: global tool success", {
          tool: tool.name,
          durationMs: duration,
        });
        return { name: tool.name, input: tool.input, data: llmData, fullData };
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        const msg = err instanceof Error ? err.message : String(err);
        chatError("executeToolsForAllAddresses: failed", { tool: tool.name, durationMs: duration, error: msg });
        return { name: tool.name, input: tool.input, data: null, error: msg };
      }
    }),
  );
  return results;
}

// Zod Validation for Structured Response

function getRefAddresses(ref: ToolDataReference): string[] {
  const addresses = ref.input.addresses;
  if (Array.isArray(addresses)) {
    return addresses.filter((addr): addr is string => typeof addr === "string" && addr.length > 0);
  }
  const address = ref.input.address;
  return typeof address === "string" && address.length > 0 ? [address] : [];
}

export async function resolveToolDataReferences(refs: ToolDataReference[]): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {};

  for (const ref of refs) {
    if (!hasTool(ref.toolName) || !getToolAllowedKeys(ref.toolName)) {
      throw new Error(`Tool '${ref.toolName}' cannot be resolved`);
    }

    const normalizedInput = normalizeToolInput(ref.toolName, ref.input, { query: ref.query });
    const call: ChatToolCall = { type: "tool_use", name: ref.toolName, input: normalizedInput };
    const addresses = getRefAddresses({ ...ref, input: normalizedInput });
    const results = isWalletTool(ref.toolName)
      ? await executeToolsForAllAddresses(addresses, [call])
      : await executeToolsForAllAddresses([], [call]);
    const result = results[0];
    if (!result || result.error || result.fullData == null) continue;
    const transformer = DATA_TRANSFORMERS[result.name];
    resolved[ref.id] = transformer ? transformer(result.fullData) : result.fullData;
  }

  return resolved;
}

const walletSectionSchema = z.object({
  title: z.string().trim().min(1).max(L.sectionTitleChars),
  kind: z.enum(["market_snapshot", "key_findings", "pnl_summary", "trading_activity", "top_holdings", "risk_factors", "what_to_watch", "conclusion", "custom"]),
  content: z.string().trim().max(L.sectionContentChars).optional(),
  bullets: z.array(z.string().trim().min(1).max(L.sectionBulletChars)).max(L.sectionBulletItems).optional(),
  table: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).max(8).optional(),
});

const walletResponseSchema = z.object({
  text: z.string(),
  tldr: z.array(z.string().trim().min(1).max(L.tldrBulletChars)).min(1).max(L.tldrItems).optional(),
  sections: z.array(walletSectionSchema).min(1).max(L.sectionItems).optional(),
  warnings: z.array(z.object({ text: z.string(), severity: z.enum(["info", "warning", "error"]) })).max(L.warningItems).optional(),
  confidence: z.enum(["Low", "Medium", "High"]).optional(),
});

function normalizeWalletResponse(raw: unknown): Record<string, unknown> {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const out: Record<string, unknown> = { text: record.text ?? "" };

  if (Array.isArray(record.tldr)) {
    out.tldr = (record.tldr as unknown[]).filter((s): s is string => typeof s === "string").slice(0, L.tldrItems);
  }
  if (Array.isArray(record.sections)) {
    const valid: Record<string, unknown>[] = [];
    for (const s of (record.sections as unknown[])) {
      if (valid.length >= L.sectionItems) break;
      if (s && typeof s === "object" && typeof (s as Record<string, unknown>).title === "string") {
        valid.push(s as Record<string, unknown>);
      }
    }
    if (valid.length > 0) out.sections = valid;
  }
  if (Array.isArray(record.warnings)) {
    out.warnings = (record.warnings as Array<Record<string, unknown>>).filter(
      (w): w is Record<string, unknown> =>
        w !== null && typeof (w as Record<string, unknown>).text === "string" && typeof w === "object",
    ).slice(0, L.warningItems);
  }
  if (typeof record.confidence === "string" && ["Low", "Medium", "High"].includes(record.confidence)) {
    out.confidence = record.confidence;
  }
  return out;
}

function isUsableToolResult(result: ChatToolResult | undefined): result is ChatToolResult {
  return result !== undefined && !result.error && result.fullData != null;
}

function specHintText(spec: ChartSpec | TableSpec): string {
  const parts = [spec.id];
  if ("title" in spec && spec.title) parts.push(spec.title);
  if ("columns" in spec) parts.push(spec.columns);
  if ("type" in spec) parts.push(spec.type);
  return parts.join(" ").toLowerCase();
}

function transformedResultIsArray(result: ChatToolResult): boolean {
  try {
    const transformer = DATA_TRANSFORMERS[result.name];
    const transformed = transformer ? transformer(result.fullData) : result.fullData;
    return Array.isArray(transformed);
  } catch {
    return false;
  }
}

function resultMatchesSpecHint(result: ChatToolResult, spec: ChartSpec | TableSpec): boolean {
  const hint = specHintText(spec);
  const name = result.name.toLowerCase();
  if ((hint.includes("swap") || hint.includes("trade")) && name.includes("swap")) return true;
  if (hint.includes("transfer") && name.includes("transfer")) return true;
  if ((hint.includes("portfolio") || hint.includes("holding")) && name.includes("portfolio")) return true;
  if (hint.includes("pnl") && name.includes("pnl")) return true;
  if ((hint.includes("balance") || hint.includes("drawdown")) && (name.includes("balance") || name.includes("drawdown"))) return true;
  if ((hint.includes("price") || hint.includes("token")) && name.includes("token")) return true;
  return false;
}

function inferDataRefForSpec(spec: ChartSpec | TableSpec, allResults: ChatToolResult[]): string | null {
  const usable = allResults
    .map((result, index) => ({ result, index }))
    .filter((entry): entry is { result: ChatToolResult; index: number } => isUsableToolResult(entry.result));

  if (usable.length === 0) return null;
  if (usable.length === 1) return String(usable[0].index);

  const hinted = usable.find(({ result }) => resultMatchesSpecHint(result, spec));
  if (hinted) return String(hinted.index);

  if ("columns" in spec) {
    const tabular = usable.find(({ result }) => transformedResultIsArray(result));
    if (tabular) return String(tabular.index);
  }

  if ("type" in spec && spec.type === "geckoterminal") {
    const price = usable.find(({ result }) => result.name.startsWith("get_token_price_"));
    if (price) return String(price.index);
  }

  return String(usable[0].index);
}

export function repairMissingDataRefs(
  charts: ChartSpec[],
  tables: TableSpec[],
  allResults: ChatToolResult[],
): number {
  let repaired = 0;
  const specs: Array<ChartSpec | TableSpec> = [...charts, ...tables];

  for (const spec of specs) {
    if (typeof spec.dataRef === "string" && spec.dataRef.trim() !== "") continue;
    const inferred = inferDataRefForSpec(spec, allResults);
    if (!inferred) continue;
    spec.dataRef = inferred;
    repaired += 1;
    chatWarn("generateResponse: repaired missing dataRef", { specId: spec.id, dataRef: inferred });
  }

  return repaired;
}


function visitValues(value: unknown, visitor: (record: Record<string, unknown>) => boolean): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some((item) => visitValues(item, visitor));
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (visitor(record)) return true;
  return Object.values(record).some((item) => visitValues(item, visitor));
}

export function hasCappedToolResults(allResults: ChatToolResult[]): boolean {
  return allResults.some((result) => visitValues(result.data, (record) => {
    const coverage = record.coverage;
    if (coverage && typeof coverage === "object" && !Array.isArray(coverage)) {
      return (coverage as Record<string, unknown>).isCapped === true;
    }
    return record.isCapped === true || record.scope === "limited_filtered_sample";
  }));
}

export function computeFallbackConfidence(allResults: ChatToolResult[]): WalletConfidence {
  if (allResults.some((result) => result.error) || hasCappedToolResults(allResults)) return "Low";
  return "Medium";
}

function collectTokenSymbols(value: unknown, out: string[]): void {
  if (out.length >= 4 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) collectTokenSymbols(item, out);
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const symbol = record.symbol ?? record.token;
  if (typeof symbol === "string" && symbol.trim() && !out.includes(symbol.trim())) {
    out.push(symbol.trim());
  }
  for (const item of Object.values(record)) collectTokenSymbols(item, out);
}

function firstTokenSymbols(allResults: ChatToolResult[]): string[] {
  const symbols: string[] = [];
  for (const result of allResults) collectTokenSymbols(result.data, symbols);
  return symbols;
}

export function synthesizeFollowUpActions(allResults: ChatToolResult[]): ActionSpec[] {
  const toolNames = new Set(allResults.map((result) => result.name));
  const symbols = firstTokenSymbols(allResults);
  const actions: ActionSpec[] = [];

  const add = (label: string, query: string): void => {
    if (actions.length >= 5 || actions.some((action) => action.label === label)) return;
    actions.push({ label, href: `#ask:${query}`, index: null });
  };

  if (symbols.length >= 2) add(`Compare ${symbols[0]} vs ${symbols[1]}`, `Compare ${symbols[0]} and ${symbols[1]} performance in this wallet`);
  if (symbols.length >= 1) add(`Analyze ${symbols[0]} driver`, `What drove the ${symbols[0]} result for this wallet?`);
  if ([...toolNames].some((name) => name.includes("pnl"))) {
    add("Break down PnL drivers", "Break down the realized PnL by biggest winners, losers, and concentration risk");
  }
  if ([...toolNames].some((name) => name.includes("swap") || name.includes("transfer"))) {
    add("Inspect recent activity", "Which recent transactions best explain this wallet activity?");
  }
  if ([...toolNames].some((name) => name.includes("portfolio") || name.includes("balance"))) {
    add("Check portfolio risk", "Which holdings create the most portfolio concentration or drawdown risk?");
  }
  add("Expand the time window", "Compare this result with the previous 30 days for the same wallet");
  add("Find weakest signal", "What is the weakest or least reliable signal in this analysis?");

  return actions.slice(0, 5);
}
async function generateResponse(
  query: string,
  allResults: ChatToolResult[],
  language?: string,
  history?: HistoryMessage[],
): Promise<ChatResponse> {
  const allFailed = allResults.every((r) => r.error);
  if (allFailed) {
    const firstError = allResults.find((r) => r.error)!.error;
    chatWarn("generateResponse: all tools failed", { firstError, resultCount: allResults.length });
    return {
      text: getMessage(language, "allToolsFailed", { error: firstError ?? "unknown" }),
      data: {},
      charts: [],
      tables: [],
    };
  }

  const prompt = buildResponseGenerationPrompt(query, allResults, history);
  chatDebug("generateResponse: prompt built", { resultCount: allResults.length });

  const raw = await callGemini(
    "gemini.svc.chat_response",
    prompt,
    CHAT_SYSTEM_INSTRUCTION,
  );
  if (!raw) {
    chatWarn("generateResponse: Gemini returned null");
    return {
      text: getMessage(language, "dataError"),
      data: {},
      charts: [],
      tables: [],
    };
  }

  chatDebug("generateResponse: raw response", { raw: trunc(raw, 2000) });

  const sanitized = sanitizeResponse(raw);

  const text = sanitized.text;
  const charts = sanitized.charts;
  const tables = sanitized.tables;
  const actions = sanitized.actions;
  // Extract real sources from search tool results instead of using LLM-fabricated ones
  const realSources: ChatSource[] = [];
  for (const result of allResults) {
    if (!result.fullData || result.error) continue;
    if (result.name === "search_web" || result.name === "search_news") {
      const articles = (result.fullData as { articles?: WebSearchArticle[] }).articles ?? [];
      for (const a of articles) {
        realSources.push({
          title: a.title,
          url: a.url,
          source: a.source,
          snippet: a.description,
          publishedAt: a.publishedAt ?? undefined,
        });
      }
    }
  }
  const sources: ChatSource[] | undefined = realSources.length > 0 ? realSources : undefined;

  // Validate structured fields from Gemini
  const parsedJson = extractJsonObject(raw);
  let validatedTldr: string[] | undefined;
  let validatedSections: WalletChatSection[] | undefined;
  let validatedWarnings: WalletWarning[] | undefined;
  let validatedConfidence: WalletConfidence | undefined;

  if (parsedJson && typeof parsedJson === "object") {
    const normalized = normalizeWalletResponse(parsedJson);
    const parsed = walletResponseSchema.safeParse(normalized);
    if (parsed.success) {
      validatedTldr = parsed.data.tldr;
      validatedSections = parsed.data.sections as WalletChatSection[] | undefined;
      validatedWarnings = parsed.data.warnings as WalletWarning[] | undefined;
      validatedConfidence = parsed.data.confidence;
    }
  }

  if (!text && charts.length === 0 && tables.length === 0 && actions.length === 0) {
    chatWarn("generateResponse: sanitizeResponse returned empty", { raw: trunc(raw, 300) });
    return {
      text: getMessage(language, "dataError"),
      data: {},
      charts: [],
      tables: [],
    };
  }

  const generatedAt = new Date().toISOString();
  const dataRefs = allResults
    .map((result, index) => result.fullData == null || result.error
      ? null
      : buildToolDataReference(String(index), result.name, result.input ?? {}, query, generatedAt))
    .filter((ref): ref is ToolDataReference => ref != null);

  repairMissingDataRefs(charts, tables, allResults);

  const resolvedData: Record<string, unknown> = {};
  const allSpecs = [...charts, ...tables];
  for (const spec of allSpecs) {
    if (!spec.dataRef || resolvedData[spec.dataRef] !== undefined) continue;
    const idx = parseInt(spec.dataRef, 10);
    if (isNaN(idx) || idx < 0 || idx >= allResults.length) {
      chatWarn("generateResponse: invalid dataRef", { dataRef: spec.dataRef });
      continue;
    }
    const result = allResults[idx];
    if (!result || result.error || result.fullData == null) continue;
    const transformer = DATA_TRANSFORMERS[result.name];
    resolvedData[spec.dataRef] = transformer ? transformer(result.fullData) : result.fullData;
  }

  // Ensure tables with unresolvable dataRef still have a fallback entry
  for (const table of tables) {
    if (table.dataRef && resolvedData[table.dataRef] == null) {
      chatWarn("generateResponse: table dataRef has no resolved data, injecting empty array", { tableId: table.id, dataRef: table.dataRef });
      resolvedData[table.dataRef] = [];
    }
  }

  // Ensure every chart has pointActions for interactive drill-down
  for (const chart of charts) {
    if (!chart.pointActions) {
      chart.pointActions = {
        label: `Analyze {label}`,
        query: chart.title
          ? `tell me more about {label} (${chart.title})`
          : `tell me more about {label}`,
      };
    }
  }

  // Ensure every table has rowActions with full row context
  for (const table of tables) {
    if (!table.rowActions) {
      const fieldNames = table.columns.split(",").map((col) => col.trim().split(":")[0]!.trim());
      table.rowActions = {
        label: `View details`,
        query: `{${fieldNames.map((f) => `${f}: {${f}}`).join(", ")}}`,
      };
    }
  }

  // Auto-set xAxisType to "time" for time-series chart tools that produce [timestamp, value][] pairs
  const TIME_SERIES_TOOLS = new Set([
    "get_balance_history",
    "get_drawdown_chart",
    "get_wallet_pnl_history",
    "get_token_price_24h",
    "get_token_price_hourly",
    "get_token_price_daily",
  ]);
  for (const chart of charts) {
    if (chart.xAxisType || chart.type === "pie" || chart.type === "geckoterminal") continue;
    const idx = parseInt(chart.dataRef, 10);
    if (!isNaN(idx) && idx < allResults.length) {
      const result = allResults[idx];
      if (result && !result.error && TIME_SERIES_TOOLS.has(result.name)) {
        chart.xAxisType = "time";
      }
    }
  }

  for (const chart of charts) {
    if ((chart.type === "line" || chart.type === "area") && chart.dataRef) {
      const idx = parseInt(chart.dataRef, 10);
      if (!isNaN(idx) && idx < allResults.length) {
        const result = allResults[idx];
        if (result && !result.error && result.name?.startsWith("get_token_price_")) {
          const tokenAddress = (result.input as Record<string, string> | undefined)?.tokenAddress;
          if (tokenAddress) {
            chart.type = "geckoterminal";
            chart.tokenAddress = tokenAddress;
            chatInfo("generateResponse: auto-converted line/area chart to geckoterminal", {
              dataRef: chart.dataRef, tokenAddress,
            });
          }
        }
      }
    }
  }

  for (const chart of charts) {
    if (chart.type === "geckoterminal" && chart.tokenAddress && !chart.poolAddress) {
      try {
        const pools = await getTokenTopPools(chart.tokenAddress);
        const topPool = pools[0]?.data as { poolAddress?: string } | undefined;
        if (topPool?.poolAddress) {
          chart.poolAddress = topPool.poolAddress;
        }
      } catch {
        chatWarn("generateResponse: failed to resolve pool for geckoterminal chart", { tokenAddress: chart.tokenAddress });
      }
    }
  }

  const response: ChatResponse = {
    text: text || getMessage(language, "hereData"),
    data: resolvedData,
    dataRefs,
    charts,
    tables,
    actions: actions.length > 0 ? actions : synthesizeFollowUpActions(allResults),
    sources,
    tldr: validatedTldr,
    sections: validatedSections,
    warnings: validatedWarnings,
    confidence: validatedConfidence ?? computeFallbackConfidence(allResults),
    asOf: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  };

  chatInfo("generateResponse: success", {
    textLength: response.text.length,
    chartsCount: response.charts.length,
    tablesCount: response.tables.length,
    dataKeys: Object.keys(response.data),
    hasSections: !!validatedSections,
    hasTldr: !!validatedTldr,
  });

  return response;
}

export async function answerChatQuery(
  addresses: string[],
  query: string,
  language?: string,
  history?: HistoryMessage[],
  skipCache?: boolean,
): Promise<ChatResponse> {
  const model = CHAT_MODEL;
  const historyHash = history?.length
    ? createHash("sha256").update(JSON.stringify(history)).update(language ?? "en").digest("hex").slice(0, 8)
    : undefined;

  chatInfo("answerChatQuery: entry", { addresses, query: trunc(query, 200), language: language ?? "en", historyTurns: history?.length ?? 0 });

  const intent = classifyWalletChatIntent(query);
  const detectedLang = inferWalletChatLanguage(query, language);
  chatInfo("answerChatQuery: intent + language", { intent, detectedLang, originalLang: language ?? "en" });

  const cached = skipCache ? null : await getCachedResponse(addresses, query, model, historyHash, intent);
  if (cached) {
    chatInfo("answerChatQuery: cache hit", {
      textLength: cached.text.length,
      chartsCount: cached.charts.length,
      tablesCount: cached.tables.length,
    });
    return cached;
  }
  chatDebug("answerChatQuery: cache miss");

  const allResults: ChatToolResult[] = [];
  const seenToolKeys = new Set<string>();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    chatInfo("answerChatQuery: iteration start", { iteration: i + 1, max: MAX_ITERATIONS, accumulatedResults: allResults.length });

    const context: PriorContext | undefined = allResults.length
      ? { previousResults: allResults.map((r) => ({ name: r.name, input: r.input ?? {}, data: r.data, error: r.error })) }
      : undefined;

    const toolSelection = await selectTool(query, addresses, language, context, history);

    if (!Array.isArray(toolSelection)) {
      if (i === 0) {
        chatInfo("answerChatQuery: no tools needed, responding directly", { type: toolSelection.type, message: trunc(toolSelection.message, 200) });
        const response: ChatResponse = {
          text: toolSelection.message || getMessage(language, "noData"),
          data: {},
          charts: [],
          tables: [],
        };
        try {
          await setCachedResponse(addresses, query, response, model, historyHash, intent, [], false, "direct");
          chatDebug("answerChatQuery: direct-answer cached");
        } catch {
          chatWarn("answerChatQuery: direct-answer cache write failed");
        }
        return response;
      }
      chatInfo("answerChatQuery: LLM signaled enough data", { iteration: i + 1 });
      break;
    }

    if (toolSelection.length === 0) {
      chatWarn("answerChatQuery: empty tool list, breaking", { iteration: i + 1 });
      break;
    }
    const resolvedSelection = await resolveToolDependencies(toolSelection, query);
    if (resolvedSelection.resolverResults.length > 0) {
      allResults.push(...resolvedSelection.resolverResults);
    }

    const duplicateFiltered = filterDuplicateToolCalls(resolvedSelection.tools, seenToolKeys);
    if (duplicateFiltered.fresh.length === 0) {
      chatWarn("answerChatQuery: duplicate tool calls detected, breaking loop", {
        iteration: i + 1,
        tools: resolvedSelection.tools.map((t) => t.name),
        duplicateCount: duplicateFiltered.duplicateCount,
      });
      allResults.push({
        name: "_loop_guard",
        input: {},
        data: null,
        error: "Loop detected: same tools requested again",
      });
      break;
    }

    const results = await executeToolsForAllAddresses(addresses, duplicateFiltered.fresh);
    allResults.push(...results);

    if (results.length > 0 && results.every((r) => r.error)) {
      chatWarn("answerChatQuery: all tools in batch failed, breaking", {
        iteration: i + 1,
        errors: results.map((r) => r.error),
      });
      break;
    }

    chatInfo("answerChatQuery: iteration complete", {
      iteration: i + 1,
      newResults: results.length,
      totalResults: allResults.length,
    });
  }

  if (allResults.length >= MAX_ITERATIONS * 2) {
    chatWarn("answerChatQuery: max iterations reached", {
      iterations: MAX_ITERATIONS,
      totalResults: allResults.length,
    });
  }

  const response = await generateResponse(query, allResults, language, history);

  if (!response.text && response.charts.length === 0 && response.tables.length === 0) {
    chatWarn("answerChatQuery: Gemini response empty, using deterministic fallback");
    return buildWalletFallbackResponse(query, intent, allResults, detectedLang);
  }

  const toolsUsed = [...new Set(allResults.map((r) => r.name))];
  const hasErrors = allResults.some((r) => r.error);

  try {
    await setCachedResponse(addresses, query, response, model, historyHash, intent, toolsUsed, hasErrors, "tool_generated");
    chatDebug("answerChatQuery: cache write succeeded", { toolsUsed, hasErrors });
  } catch {
    chatWarn("answerChatQuery: cache write failed");
  }

  chatInfo("answerChatQuery: return", {
    textLength: response.text.length,
    chartsCount: response.charts.length,
    tablesCount: response.tables.length,
    totalResults: allResults.length,
  });

  return response;
}
