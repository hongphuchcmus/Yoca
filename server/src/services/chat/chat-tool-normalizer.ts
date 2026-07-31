import { TOOL_ALLOWED_KEYS } from "./chat.tools.js";
import type { ChatToolCall, ToolDataReference } from "./chat.types.js";

const DEFAULT_TX_LOOKBACK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const DETAILED_LIMITS = new Set(["get_wallet_swaps", "get_wallet_transfers"]);
const COMPACT_LIMITS = new Set(["get_wallet_swaps_compact", "get_wallet_transfers_compact"]);
const RANGE_TOOLS = new Set([
  "get_wallet_swaps",
  "get_wallet_transfers",
  "get_wallet_swaps_compact",
  "get_wallet_transfers_compact",
]);

export interface NormalizeToolOptions {
  query: string;
  nowMs?: number;
}

export interface ToolResolveSpec {
  tool: string;
  input: Record<string, unknown>;
  pick: string;
}

export interface ToolDataResolveInput {
  refs: ToolDataReference[];
}

export const RESOLVABLE_TOOLS = new Set(["search_token"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stripAddressKeys(input: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...input };
  delete copy.address;
  delete copy.addresses;
  return copy;
}

export function makeToolCallKey(call: Pick<ChatToolCall, "name" | "input">): string {
  return `${call.name}:${stableStringify(stripAddressKeys(call.input))}`;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function clampLimit(toolName: string, value: unknown): number | undefined {
  const parsed = coerceNumber(value);
  if (DETAILED_LIMITS.has(toolName)) return Math.min(Math.max(Math.trunc(parsed ?? 20), 1), 100);
  if (COMPACT_LIMITS.has(toolName)) return Math.min(Math.max(Math.trunc(parsed ?? 500), 1), 500);
  return parsed == null ? undefined : Math.max(Math.trunc(parsed), 1);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

function extractRelativeRangeMs(query: string, nowMs: number): { fromMs: number; toMs: number } | null {
  const q = query.toLowerCase();
  const lastDays = q.match(/(?:last|past)\s+(\d{1,3})\s+days?/);
  if (lastDays) {
    const days = Math.max(1, Math.min(Number(lastDays[1]), 365));
    return { fromMs: nowMs - days * DAY_MS, toMs: nowMs };
  }
  const lastHours = q.match(/(?:last|past)\s+(\d{1,3})\s+hours?/);
  if (lastHours) {
    const hours = Math.max(1, Math.min(Number(lastHours[1]), 24 * 30));
    return { fromMs: nowMs - hours * 60 * 60 * 1000, toMs: nowMs };
  }
  if (/\byesterday\b/.test(q)) {
    const today = startOfUtcDay(nowMs);
    return { fromMs: today - DAY_MS, toMs: today - 1 };
  }
  if (/\btoday\b/.test(q)) {
    return { fromMs: startOfUtcDay(nowMs), toMs: nowMs };
  }
  if (/\blast\s+week\b/.test(q)) return { fromMs: nowMs - 7 * DAY_MS, toMs: nowMs };
  if (/\blast\s+month\b/.test(q)) return { fromMs: nowMs - 30 * DAY_MS, toMs: nowMs };
  return null;
}

function normalizeTimePeriod(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (["7D", "30D"].includes(normalized)) return normalized;
  return undefined;
}

function sortRecord(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (isRecord(value)) out[key] = sortRecord(value);
    else if (Array.isArray(value)) out[key] = value.map((item) => isRecord(item) ? sortRecord(item) : item);
    else out[key] = value;
  }
  return out;
}

export function normalizeToolInput(
  toolName: string,
  input: Record<string, unknown>,
  options: NormalizeToolOptions,
): Record<string, unknown> {
  const allowed = TOOL_ALLOWED_KEYS[toolName];
  if (!allowed) return sortRecord(input);

  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "limit") {
      const limit = clampLimit(toolName, value);
      if (limit != null) out.limit = limit;
      continue;
    }
    if (key === "fromMs" || key === "toMs" || key === "minAmountUsd" || key === "maxAmountUsd" || key === "days" || key === "count") {
      const n = coerceNumber(value);
      if (n != null) out[key] = n;
      continue;
    }
    if (key === "timePeriod") {
      const period = normalizeTimePeriod(value);
      if (period) out.timePeriod = period;
      continue;
    }
    out[key] = value;
  }

  if (RANGE_TOOLS.has(toolName)) {
    const range = extractRelativeRangeMs(options.query, options.nowMs ?? Date.now());
    if (out.fromMs == null && range) out.fromMs = range.fromMs;
    if (out.toMs == null && range) out.toMs = range.toMs;
    if (out.fromMs == null && out.toMs == null) {
      const toMs = options.nowMs ?? Date.now();
      out.fromMs = toMs - DEFAULT_TX_LOOKBACK_DAYS * DAY_MS;
      out.toMs = toMs;
    }
  }

  if ((DETAILED_LIMITS.has(toolName) || COMPACT_LIMITS.has(toolName)) && out.limit == null) {
    out.limit = COMPACT_LIMITS.has(toolName) ? 500 : 20;
  }

  return sortRecord(out);
}

export function normalizeToolCalls(
  calls: ChatToolCall[],
  options: NormalizeToolOptions,
): ChatToolCall[] {
  return calls.map((call) => ({
    ...call,
    input: normalizeToolInput(call.name, call.input, options),
  }));
}

export function buildToolDataReference(
  id: string,
  toolName: string,
  input: Record<string, unknown>,
  query: string,
  generatedAt: string,
): ToolDataReference {
  return {
    id,
    toolName,
    input: sortRecord(input),
    query,
    generatedAt,
  };
}

export function getResolveSpec(value: unknown): ToolResolveSpec | null {
  if (!isRecord(value)) return null;
  const spec = value.resolveFrom;
  if (!isRecord(spec)) return null;
  if (typeof spec.tool !== "string" || !isRecord(spec.input) || typeof spec.pick !== "string") return null;
  return { tool: spec.tool, input: spec.input, pick: spec.pick };
}

const BRACKET_PARTS = /^(\w*)\[(\d+|first)\]$/;

function tryResolvePart(current: unknown, part: string): unknown {
  if (part === "first") {
    return Array.isArray(current) ? current[0] : undefined;
  }

  const bracket = BRACKET_PARTS.exec(part);
  if (bracket) {
    const key = bracket[1];
    const idx = bracket[2] === "first" ? 0 : parseInt(bracket[2], 10);
    let resolved = current;
    if (key) {
      if (!isRecord(resolved)) return undefined;
      resolved = resolved[key];
    }
    if (!Array.isArray(resolved) || idx < 0 || idx >= resolved.length) return undefined;
    return resolved[idx];
  }

  if (!isRecord(current)) return undefined;
  return current[part];
}

export function pickResolvedValue(data: unknown, pick: string): unknown {
  const parts = pick.split(".").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    current = tryResolvePart(current, part);
    if (current === undefined) return undefined;
  }
  return current;
}

export function filterDuplicateToolCalls(
  calls: ChatToolCall[],
  seenKeys: Set<string>,
): { fresh: ChatToolCall[]; duplicateCount: number } {
  const fresh: ChatToolCall[] = [];
  let duplicateCount = 0;
  for (const call of calls) {
    const key = makeToolCallKey(call);
    if (seenKeys.has(key)) {
      duplicateCount++;
      continue;
    }
    seenKeys.add(key);
    fresh.push(call);
  }
  return { fresh, duplicateCount };
}

export function getToolAllowedKeys(toolName: string): readonly string[] | undefined {
  return TOOL_ALLOWED_KEYS[toolName];
}
