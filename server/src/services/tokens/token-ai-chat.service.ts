import { createHash } from "node:crypto";

import { GoogleGenAI, Type } from "@google/genai";
import { WALLET_AUDIT_MODEL } from "@sv/config/constants.js";
import { trackGemini } from "@sv/services/tracking/gemini-metrics.js";
import { z } from "zod";

import {
  buildTokenAiContext,
  hashTokenAiContext,
  type TokenAiContext,
  type TokenAiEvidence,
  type TokenAiIntent,
  type TokenAiLanguage,
  type TokenAiSource,
  type TokenAiTimeframe,
} from "./token-ai-context.js";
import {
  getTokenAiChatCacheExpiresAt,
  readLastSuccessfulGeminiCache,
  readTokenAiChatCache,
  writeLastSuccessfulGeminiCache,
  writeTokenAiChatCache,
} from "./token-ai-chat-cache.js";
import env from "@sv/util/load-env.js";

export type {
  TokenAiEvidence,
  TokenAiIntent,
  TokenAiLanguage,
  TokenAiSource,
  TokenAiTimeframe,
} from "./token-ai-context.js";

export interface TokenAiChatRequest {
  address: string;
  symbol?: string;
  name?: string;
  question: string;
  timeframe: TokenAiTimeframe;
  language: TokenAiLanguage;
  includeNews: boolean;
  includeVolatility: boolean;
  modelMode?: TokenAiModelMode;
}

export type TokenAiModelMode = "fast" | "balanced" | "deep";

export interface TokenAiSection {
  title: string;
  kind:
    | "market_snapshot"
    | "key_drivers"
    | "deep_dive"
    | "latest_headlines"
    | "why_it_matters"
    | "bullish_signals"
    | "bearish_signals"
    | "risk_factors"
    | "what_to_watch"
    | "simple_explanation"
    | "scenario_analysis"
    | "practical_framework"
    | "conclusion"
    | "custom";
  content?: string;
  bullets?: string[];
  table?: Array<Record<string, string | number | null>>;
}

export interface TokenAiChatData {
  token: {
    address: string;
    symbol?: string;
    name?: string;
    yocaUrl: string;
  };
  question: string;
  intent: TokenAiIntent;
  tldr: string[];
  sections: TokenAiSection[];
  evidence: TokenAiEvidence[];
  sources: TokenAiSource[];
  warnings: string[];
  confidence: "Low" | "Medium" | "High";
  asOf: string;
  disclaimer: string;
  generatedAt: string;
  provider:
    | "gemini"
    | "gemini_model_fallback"
    | "cached_gemini"
    | "analyst_fallback"
    | "deterministic";
  fallbackReason?: string;
  modelModeRequested?: TokenAiModelMode;
  modelModeUsed?: TokenAiModelMode;
  modelRequested?: string;
  modelUsed?: string;
  stale?: boolean;
  cache?: {
    hit: boolean;
    expiresAt?: string;
  };
}

const TOKEN_AI_CHAT_MODEL =
  process.env.TOKEN_AI_CHAT_MODEL?.trim() ||
  process.env.GEMINI_AUDIT_MODEL?.trim() ||
  WALLET_AUDIT_MODEL;
const TOKEN_AI_CHAT_BALANCED_MODEL =
  process.env.TOKEN_AI_CHAT_BALANCED_MODEL?.trim() ||
  process.env.TOKEN_AI_CHAT_FALLBACK_MODEL?.trim() ||
  "gemini-3.1-flash-lite";
const TOKEN_AI_CHAT_FAST_MODEL =
  process.env.TOKEN_AI_CHAT_FAST_MODEL?.trim() ||
  "gemini-3.1-flash-lite";
const TOKEN_AI_CHAT_PROMPT_VERSION =
  process.env.TOKEN_AI_CHAT_PROMPT_VERSION?.trim() || "v4";
const ANALYST_FALLBACK_CACHE_TTL_MS = 3 * 60 * 1000;
const LAST_SUCCESSFUL_GEMINI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const TOKEN_AI_RESPONSE_LIMITS = {
  tldrItems: 3,
  tldrBulletChars: 280,
  sectionItems: 6,
  sectionTitleChars: 120,
  sectionContentChars: 1200,
  sectionBulletItems: 6,
  sectionBulletChars: 700,
  sectionTableRows: 8,
  evidenceItems: 12,
  evidenceLabelChars: 160,
  evidenceValueChars: 240,
  evidenceDetailChars: 500,
  sourceItems: 8,
  sourceTitleChars: 240,
  sourceSnippetChars: 500,
  warningItems: 5,
  warningChars: 350,
  disclaimerChars: 500,
} as const;

const TRUNCATION_ELLIPSIS = "\u2026";

const sectionKinds = [
  "market_snapshot",
  "key_drivers",
  "deep_dive",
  "latest_headlines",
  "why_it_matters",
  "bullish_signals",
  "bearish_signals",
  "risk_factors",
  "what_to_watch",
  "simple_explanation",
  "scenario_analysis",
  "practical_framework",
  "conclusion",
  "custom",
] as const;

const NOISY_UNAVAILABLE_PATTERNS = [
  /security information such as mint authority, freeze authority, deployer, creator, honeypot status, and other security flags are not available[^.]*\.?/gi,
  /mint authority, freeze authority, deployer, creator, honeypot status, and security flags are not available[^.]*\.?/gi,
  /the market capitalization rank for this token is currently unavailable[^.]*\.?/gi,
  /market cap(?:italization)? rank (?:is )?(?:currently )?unavailable[^.]*\.?/gi,
  /fdv rank (?:is )?(?:currently )?unavailable[^.]*\.?/gi,
] as const;

const WEAK_UNAVAILABLE_WARNING_PATTERNS = [
  /\b(?:market cap|market capitalization|fdv)?\s*rank\b.*\bunavailable\b/i,
  /\brank unavailable\b/i,
  /\bcreator\b.*\bunavailable\b/i,
  /\bdeployer\b.*\bunavailable\b/i,
  /\bhoneypot\b.*\bunavailable\b/i,
  /\bsecurity flags?\b.*\bunavailable\b/i,
  /\bmint authority\b.*\bfreeze authority\b.*\b(?:deployer|creator|honeypot)\b/i,
  /\bsecurity (?:fields?|information)\b.*\b(?:unavailable|missing|not available)\b/i,
] as const;

type TokenAiFallbackReason =
  | "missing_api_key"
  | "gemini_api_error"
  | "gemini_retryable_error"
  | "preferred_model_retry_failed"
  | "preferred_model_429"
  | "preferred_model_500"
  | "preferred_model_502"
  | "preferred_model_503"
  | "preferred_model_504"
  | "fallback_model_failed"
  | "gemini_unavailable_using_recent_success"
  | "all_gemini_models_unavailable"
  | "gemini_invalid_json"
  | "gemini_zod_validation_error_after_normalization"
  | "cached_deterministic_response"
  | "cached_analyst_fallback_ignored_gemini_available"
  | "cached_deterministic_ignored_gemini_available"
  | "deterministic_fallback";

function shouldExposeTokenAiDiagnostics() {
  return process.env.NODE_ENV !== "production";
}

function exposeFallbackReason(reason?: TokenAiFallbackReason) {
  return reason;
}

function logGeminiFallback(
  reason: TokenAiFallbackReason,
  details?: Record<string, unknown>,
) {
  if (!shouldExposeTokenAiDiagnostics()) return;

  console.warn("[token-ai-chat] Gemini fallback", {
    reason,
    model: TOKEN_AI_CHAT_MODEL,
    hasGoogleAiKey: Boolean(process.env.GOOGLE_AI_KEY?.trim()),
    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    ...details,
  });
}

function modelForMode(mode: TokenAiModelMode) {
  if (mode === "fast") return TOKEN_AI_CHAT_FAST_MODEL;
  if (mode === "balanced") return TOKEN_AI_CHAT_BALANCED_MODEL;
  return TOKEN_AI_CHAT_MODEL;
}

function fallbackModelCandidate(
  requestedMode: TokenAiModelMode,
  requestedModel: string,
) {
  const candidates: Array<{ mode: TokenAiModelMode; model: string }> =
    requestedMode === "deep"
      ? [
          { mode: "balanced", model: TOKEN_AI_CHAT_BALANCED_MODEL },
          { mode: "fast", model: TOKEN_AI_CHAT_FAST_MODEL },
        ]
      : [
          { mode: "fast", model: TOKEN_AI_CHAT_FAST_MODEL },
          { mode: "balanced", model: TOKEN_AI_CHAT_BALANCED_MODEL },
          { mode: "deep", model: TOKEN_AI_CHAT_MODEL },
        ];

  return candidates.find((candidate) => candidate.model !== requestedModel);
}

function retryDelayMs() {
  return 700 + Math.floor(Math.random() * 801);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function parseGeminiError(error: unknown) {
  const text = errorText(error);
  let status: number | undefined;
  let providerStatus: string | undefined;
  let message = text;

  const record = error && typeof error === "object"
    ? (error as Record<string, unknown>)
    : {};
  if (typeof record.status === "number") status = record.status;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        error?: { code?: number; status?: string; message?: string };
      };
      status = parsed.error?.code ?? status;
      providerStatus = parsed.error?.status;
      message = parsed.error?.message ?? message;
    } catch {
      // Keep the safe raw message fallback.
    }
  }

  const normalized = `${providerStatus ?? ""} ${message}`.toLowerCase();
  const retryable =
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    normalized.includes("unavailable") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("high demand") ||
    normalized.includes("try again later") ||
    normalized.includes("overloaded");

  const reason: TokenAiFallbackReason =
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
      ? `preferred_model_${status}`
      : retryable
        ? "gemini_retryable_error"
        : "gemini_api_error";

  return {
    status,
    providerStatus,
    message,
    retryable,
    reason,
  };
}

function logRetryableGeminiError(
  model: string,
  details: ReturnType<typeof parseGeminiError>,
) {
  if (!shouldExposeTokenAiDiagnostics()) return;
  console.warn("[token-ai-chat] Gemini retryable error", {
    model,
    status: details.status ?? details.providerStatus ?? "unknown",
    reason: details.reason,
  });
}

const sectionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(TOKEN_AI_RESPONSE_LIMITS.sectionTitleChars),
  kind: z.preprocess(
    (value) =>
      typeof value === "string" &&
      sectionKinds.includes(value as (typeof sectionKinds)[number])
        ? value
        : "custom",
    z.enum(sectionKinds),
  ),
  content: z
    .string()
    .trim()
    .max(TOKEN_AI_RESPONSE_LIMITS.sectionContentChars)
    .optional(),
  bullets: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(TOKEN_AI_RESPONSE_LIMITS.sectionBulletChars),
    )
    .max(TOKEN_AI_RESPONSE_LIMITS.sectionBulletItems)
    .optional(),
  table: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
    .max(TOKEN_AI_RESPONSE_LIMITS.sectionTableRows)
    .optional(),
});

const geminiResponseSchema = z.object({
  tldr: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(TOKEN_AI_RESPONSE_LIMITS.tldrBulletChars),
    )
    .min(1)
    .max(TOKEN_AI_RESPONSE_LIMITS.tldrItems),
  sections: z
    .array(sectionSchema)
    .min(1)
    .max(TOKEN_AI_RESPONSE_LIMITS.sectionItems),
  warnings: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(TOKEN_AI_RESPONSE_LIMITS.warningChars),
    )
    .max(TOKEN_AI_RESPONSE_LIMITS.warningItems),
  confidence: z.enum(["Low", "Medium", "High"]),
  disclaimer: z
    .string()
    .trim()
    .min(1)
    .max(TOKEN_AI_RESPONSE_LIMITS.disclaimerChars),
});

function getGeminiApiKey() {
  return env.GOOGLE_AI_KEY;
}

function hashQuestion(question: string) {
  return createHash("sha256")
    .update(question.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex");
}

export function inferTokenAiLanguage(
  question: string,
  language?: "en" | "vi",
): TokenAiLanguage {
  if (language) return language;
  const normalized = question.toLowerCase();
  if (
    /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(
      question,
    ) ||
    /\b(token này|rủi ro|không|tin tức|giải thích|nên mua|bán|giữ)\b/.test(
      normalized,
    )
  ) {
    return "vi";
  }
  if (
    /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(
      question,
    ) ||
    /\b(token này|rủi ro|không|tin tức|giải thích|nên mua|bán|giữ)\b/.test(
      normalized,
    )
  ) {
    return "vi";
  }
  return "en";
}

export function classifyTokenAiIntent(question: string): TokenAiIntent {
  const q = question.toLowerCase();
  if (
    /\b(risk|risks|risky|safe|security|scam|dangerous|honeypot|freeze|mint authority|freeze authority|deployer|creator|rug|rug pull|owner|contract)\b/.test(
      q,
    )
  ) {
    return "risk_overview";
  }
  if (/\b(nên mua|nên bán|giữ|chốt lời)\b/.test(q)) {
    return "investment_guidance";
  }
  if (/\b(giảm|tăng|biến động)\b/.test(q)) {
    return "price_move_explanation";
  }
  if (/\b(tin tức|mới nhất|thông báo)\b/.test(q)) {
    return "latest_news";
  }
  if (/\b(rủi ro|an toàn|lừa đảo|nguy hiểm|bảo mật|đóng băng|chủ sở hữu)\b/.test(q)) {
    return "risk_overview";
  }
  if (/\b(tích cực|tiêu cực)\b/.test(q)) {
    return "bullish_bearish";
  }
  if (/\b(giải thích|là gì|đơn giản)\b/.test(q)) {
    return "simple_explanation";
  }
  if (/\b(theo dõi|tiếp theo)\b/.test(q)) {
    return "what_to_watch";
  }
  if (
    /\b(should i buy|buy now|sell now|hold|entry|dca|take profit|nên mua|nên bán|giữ|chốt lời)\b/.test(
      q,
    )
  ) {
    return "investment_guidance";
  }
  if (/\b(why|down|up|pump|dump|move|moving|spike|giảm|tăng|biến động)\b/.test(q)) {
    return "price_move_explanation";
  }
  if (/\b(news|latest|announcement|headline|tin tức|mới nhất|thông báo)\b/.test(q)) {
    return "latest_news";
  }
  if (
    /\b(risk|safe|security|scam|dangerous|honeypot|freeze|mint authority|freeze authority|deployer|creator|rug|rug pull|owner|contract|rủi ro|an toàn|lừa đảo|nguy hiểm|bảo mật|đóng băng|chủ sở hữu)\b/.test(
      q,
    )
  ) {
    return "risk_overview";
  }
  if (/\b(bullish|bearish|upside|downside|tích cực|tiêu cực)\b/.test(q)) {
    return "bullish_bearish";
  }
  if (/\b(explain|what is|simple|giải thích|là gì|đơn giản)\b/.test(q)) {
    return "simple_explanation";
  }
  if (/\b(watch|next|monitor|theo dõi|tiếp theo)\b/.test(q)) {
    return "what_to_watch";
  }
  return "custom";
}

function compactCurrency(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(number) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(number) >= 1 ? 2 : 8,
  }).format(number);
}

function percent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "unavailable";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function tokenLabel(context: TokenAiContext) {
  return (
    context.token.name ||
    context.token.symbol ||
    `${context.token.address.slice(0, 4)}...${context.token.address.slice(-4)}`
  );
}

function marketRecord(context: TokenAiContext) {
  return (context.market ?? {}) as Record<string, unknown>;
}

function isSecuritySensitiveIntent(intent: TokenAiIntent) {
  return intent === "risk_overview";
}

function hasSecurityEvidence(context: TokenAiContext) {
  return context.evidence.some((item) => item.type === "security");
}

function securityEvidenceBullets(context: TokenAiContext) {
  return context.evidence
    .filter((item) => item.type === "security")
    .slice(0, 4)
    .map((item) =>
      [item.label, item.detail].filter((value) => value?.trim()).join(": "),
    );
}

function conciseSecurityLimitation(language: TokenAiLanguage) {
  return language === "vi"
    ? "Yoca có thể đánh giá rủi ro thị trường, thanh khoản, holder, pool và tin tức. Kiểm tra bảo mật contract còn giới hạn nếu không có dữ liệu mint/freeze authority."
    : "Yoca can assess visible market, liquidity, holder, pool, and news risks. Contract-level security checks are limited unless mint/freeze authority data is available.";
}

function removeNoisyUnavailableText(text: string) {
  return NOISY_UNAVAILABLE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, " "),
    text,
  )
    .replace(/\s+/g, " ")
    .trim();
}

function warningKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWeakUnavailableWarning(value: string) {
  return WEAK_UNAVAILABLE_WARNING_PATTERNS.some((pattern) => pattern.test(value));
}

function evidenceWarning(
  context: TokenAiContext,
  language: TokenAiLanguage,
  intent: TokenAiIntent,
) {
  const warnings: string[] = [];

  if (isSecuritySensitiveIntent(intent) && !hasSecurityEvidence(context)) {
    warnings.push(conciseSecurityLimitation(language));
  }
  if (context.latestNews.length === 0) {
    warnings.push(
      language === "vi"
        ? "Không có tin tức gần đây trong bằng chứng Yoca cho token này."
        : "No recent token news was available in the Yoca evidence bundle.",
    );
  }
  if (!context.market) {
    warnings.push(
      language === "vi"
        ? "Dữ liệu thị trường hiện không khả dụng."
        : "Current market data is unavailable.",
    );
  }
  return normalizeWarningsForResponse(warnings);
}

function confidenceFor(context: TokenAiContext, intent: TokenAiIntent) {
  if (intent === "risk_overview") {
    return context.market && (context.holderStats || context.pools.length > 0)
      ? "Medium"
      : "Low";
  }
  if (context.market && context.latestNews.length >= 3 && context.volatilityEvents.length > 0) {
    return "High";
  }
  if (context.market || context.latestNews.length > 0) return "Medium";
  return "Low";
}

function lastSuccessfulGeminiWindowMs(intent: TokenAiIntent) {
  switch (intent) {
    case "price_move_explanation":
    case "latest_news":
    case "investment_guidance":
      return 15 * 60 * 1000;
    case "bullish_bearish":
      return 30 * 60 * 1000;
    case "risk_overview":
    case "what_to_watch":
      return 60 * 60 * 1000;
    case "simple_explanation":
      return 24 * 60 * 60 * 1000;
    case "custom":
    default:
      return 15 * 60 * 1000;
  }
}

function staleGeminiWarning(language: TokenAiLanguage) {
  return language === "vi"
    ? "Gemini tạm thời không khả dụng, nên Yoca đang hiển thị một phân tích AI gần đây. Hãy kiểm tra lại dữ liệu thị trường trực tiếp trước khi ra quyết định."
    : "Gemini is temporarily unavailable, so Yoca is showing a recent AI analysis. Verify live market data before making decisions.";
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function poolDataRecord(pool: unknown) {
  const record = asRecord(pool);
  return asRecord(record.data ?? pool);
}

function topPoolData(context: TokenAiContext) {
  return context.pools.length > 0 ? poolDataRecord(context.pools[0]) : {};
}

function topPoolLiquidity(context: TokenAiContext) {
  return finiteNumber(topPoolData(context).liquidityUsd);
}

function topPoolTradeCounts(context: TokenAiContext) {
  const data = topPoolData(context);
  return {
    buys: finiteNumber(data.buys24h),
    sells: finiteNumber(data.sells24h),
  };
}

function tradeFlowInterpretation(context: TokenAiContext) {
  const { buys, sells } = topPoolTradeCounts(context);
  if (buys == null || sells == null) {
    return "Top-pool buy/sell counts are unavailable, so trade-flow balance cannot be confirmed.";
  }

  const total = buys + sells;
  const difference = buys - sells;
  const threshold = Math.max(5, total * 0.15);
  if (Math.abs(difference) <= threshold) {
    return `Top-pool flow looks relatively balanced with ${buys.toLocaleString("en-US")} buys vs ${sells.toLocaleString("en-US")} sells in 24h.`;
  }

  return difference > 0
    ? `Top-pool flow leans buy-side with ${buys.toLocaleString("en-US")} buys vs ${sells.toLocaleString("en-US")} sells in 24h, which supports demand but does not prove sustained accumulation.`
    : `Top-pool flow leans sell-side with ${sells.toLocaleString("en-US")} sells vs ${buys.toLocaleString("en-US")} buys in 24h, which can explain pressure even without a direct news catalyst.`;
}

function holderTop10Percent(context: TokenAiContext) {
  return finiteNumber(asRecord(context.holderStats).top10Percent);
}

function holderCount(context: TokenAiContext) {
  return finiteNumber(asRecord(context.holderStats).holdersCount);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSearchTerms(context: TokenAiContext) {
  return [context.token.symbol, context.token.name]
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 3);
}

function countDirectNews(context: TokenAiContext) {
  const terms = tokenSearchTerms(context);
  if (terms.length === 0) return 0;

  return context.latestNews.filter((article) => {
    const haystack = normalizeText(
      `${article.title} ${article.description ?? ""}`,
    );
    return terms.some((term) => haystack.includes(term));
  }).length;
}

function isWrappedToken(context: TokenAiContext) {
  const symbol = normalizeText(context.token.symbol);
  const name = normalizeText(context.token.name);
  return (
    name.includes("wrapped") ||
    symbol.startsWith("w") ||
    context.token.address === "So11111111111111111111111111111111111111112"
  );
}

function priceMove(context: TokenAiContext) {
  const market = marketRecord(context);
  const change = finiteNumber(market.priceChangePercentage24h);
  if (change == null) {
    return {
      change,
      direction: "unknown" as const,
      phrase: "price direction is unavailable",
    };
  }

  const direction =
    Math.abs(change) < 0.5 ? "flat" : change > 0 ? "up" : "down";
  const phrase =
    direction === "flat"
      ? `roughly flat over 24h (${percent(change)})`
      : `${direction} ${percent(Math.abs(change))} over 24h`;
  return { change, direction, phrase };
}

function volumeInterpretation(context: TokenAiContext) {
  const volume = finiteNumber(marketRecord(context).volume24h);
  if (volume == null) {
    return "24h volume is unavailable, so trading activity cannot be judged from market data.";
  }
  if (volume >= 5_000_000) {
    return `${compactCurrency(volume)} in 24h volume points to active trading rather than an idle market.`;
  }
  if (volume >= 250_000) {
    return `${compactCurrency(volume)} in 24h volume suggests meaningful trading activity, but not necessarily broad demand.`;
  }
  return `${compactCurrency(volume)} in 24h volume is thin, so smaller flows may move price more sharply.`;
}

function liquidityInterpretation(context: TokenAiContext) {
  const liquidity = topPoolLiquidity(context);
  if (liquidity == null) {
    return "Pool liquidity is unavailable, so slippage risk is harder to estimate.";
  }
  if (liquidity >= 1_000_000) {
    return `${compactCurrency(liquidity)} in top-pool liquidity can reduce ordinary slippage risk, but it does not prevent strong price moves.`;
  }
  if (liquidity >= 100_000) {
    return `${compactCurrency(liquidity)} in top-pool liquidity is usable but still sensitive to larger orders.`;
  }
  return `${compactCurrency(liquidity)} in top-pool liquidity is thin and can increase slippage and volatility risk.`;
}

function holderInterpretation(context: TokenAiContext) {
  const top10 = holderTop10Percent(context);
  const count = holderCount(context);
  if (top10 == null) {
    return "Holder concentration data is unavailable, so distribution risk is not visible from Yoca holder stats.";
  }

  const countText = count == null ? "an unknown holder count" : `${count.toLocaleString("en-US")} holders`;
  if (top10 >= 50) {
    return `Top 10 holders control ${percent(top10)} with ${countText}; that concentration can raise distribution risk, but it is not proof of manipulation.`;
  }
  if (top10 >= 25) {
    return `Top 10 holders control ${percent(top10)} with ${countText}; this is a meaningful concentration signal to monitor.`;
  }
  return `Top 10 holders control ${percent(top10)} with ${countText}; concentration risk is visible but not dominant from this single metric.`;
}

function newsInterpretation(context: TokenAiContext) {
  const total = context.latestNews.length;
  if (total === 0) {
    return "No recent token news was found in the Yoca evidence bundle, so price moves should not be over-attributed to headlines.";
  }

  const direct = countDirectNews(context);
  const label = tokenLabel(context);
  if (direct === 0) {
    return `${total} headline(s) were found, but they look broader ecosystem or market-related rather than direct ${label} catalysts.`;
  }
  if (direct < total) {
    return `${direct} of ${total} headline(s) directly reference ${label}; the rest are broader context, so news support is mixed.`;
  }
  return `${total} recent headline(s) directly reference ${label}, giving the narrative context more weight.`;
}

function catalystInterpretation(context: TokenAiContext) {
  const move = priceMove(context);
  const directNews = countDirectNews(context);
  if (move.direction === "down" && directNews === 0) {
    return "Price is down and no direct negative news catalyst appears in the evidence, so the move looks more market/liquidity-driven than news-driven.";
  }
  if (move.direction === "down" && directNews > 0) {
    return "Price is down while token-related headlines exist; treat news as context, not proven causation.";
  }
  if (move.direction === "up" && directNews === 0) {
    return "Price is up without a clear direct news catalyst, so the move may be flow, liquidity, or broader-market driven.";
  }
  if (directNews > 0) {
    return "Token-related news is present, but Yoca evidence does not prove it caused the price move.";
  }
  return "The evidence does not show a direct headline catalyst.";
}

function chartInterpretation(context: TokenAiContext) {
  if (context.chartSummary?.changePercent == null) {
    return "Chart data is thin for the selected timeframe, so the 24h market snapshot carries more weight than trend analysis.";
  }
  return `${context.timeframe} chart data shows ${percent(context.chartSummary.changePercent)} across ${context.chartSummary.points} points, which helps confirm whether the 24h move is isolated or part of a wider trend.`;
}

function volatilityInterpretation(context: TokenAiContext) {
  if (context.volatilityEvents.length === 0) {
    return "No bounded volatility event was detected in the selected context, so there is no separate spike/drop marker to explain.";
  }
  return `${context.volatilityEvents.length} volatility event(s) were detected; use them as timing markers, not proof of why traders acted.`;
}

function wrappedTokenInterpretation(context: TokenAiContext) {
  if (!isWrappedToken(context)) return null;
  return "This appears to be a wrapped token. Its market behavior may mostly reflect the underlying asset and wrapper liquidity, rather than an independent project narrative.";
}

function lowDataInterpretation(context: TokenAiContext) {
  const missing = [];
  if (!context.market) missing.push("market data");
  if (!context.chartSummary || context.chartSummary.points < 2) {
    missing.push("usable chart history");
  }
  if (context.latestNews.length === 0) missing.push("recent news");
  if (!context.holderStats) missing.push("holder concentration");
  if (context.pools.length === 0) missing.push("pool liquidity");

  if (missing.length === 0) {
    return "The evidence bundle has enough market, liquidity, holder, and news context for a medium-confidence read.";
  }

  return `Missing or thin data: ${missing.join(", ")}. The assistant can still infer visible market/liquidity/news risk, but confidence should stay limited.`;
}

function headlineBullets(context: TokenAiContext) {
  if (context.latestNews.length === 0) {
    return ["No recent token-specific headlines were available from Yoca news evidence."];
  }

  return context.latestNews.slice(0, 5).map((article) => {
    const publisher = article.source ? ` (${article.source})` : "";
    const publishedMs = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
    const timing = Number.isFinite(publishedMs)
      ? `, ${new Date(publishedMs).toISOString().slice(0, 10)}`
      : "";
    return `${article.title}${publisher}${timing}.`;
  });
}

function watchSignalBullets(context: TokenAiContext) {
  return [
    tradeFlowInterpretation(context),
    "If price falls while 24h volume rises, selling pressure, liquidation, or rotation may still be active.",
    "If liquidity drops sharply, slippage and volatility risk increase even when headline news is neutral.",
    "If new headlines are unrelated to the token, avoid over-attributing price moves to news.",
    "If holder concentration increases, distribution risk may rise; do not treat that as proof of manipulation.",
    "If chart direction, volume, and direct news start agreeing, confidence in the narrative improves.",
  ];
}

function viPriceMovePhrase(context: TokenAiContext) {
  const move = priceMove(context);
  if (move.change == null) return "chưa có dữ liệu hướng giá";
  if (move.direction === "flat") return `đi ngang trong 24h (${percent(move.change)})`;
  return `${move.direction === "up" ? "tăng" : "giảm"} ${percent(Math.abs(move.change))} trong 24h`;
}

function viVolumeInterpretation(context: TokenAiContext) {
  const volume = finiteNumber(marketRecord(context).volume24h);
  if (volume == null) {
    return "Chưa có volume 24h, nên khó đánh giá mức độ hoạt động giao dịch.";
  }
  if (volume >= 5_000_000) {
    return `Volume 24h ${compactCurrency(volume)} cho thấy giao dịch đang hoạt động mạnh, không phải thị trường đứng yên.`;
  }
  if (volume >= 250_000) {
    return `Volume 24h ${compactCurrency(volume)} cho thấy có hoạt động giao dịch đáng kể, nhưng chưa đủ để kết luận lực mua bền vững.`;
  }
  return `Volume 24h ${compactCurrency(volume)} khá mỏng, nên dòng tiền nhỏ cũng có thể làm giá biến động mạnh.`;
}

function viLiquidityInterpretation(context: TokenAiContext) {
  const liquidity = topPoolLiquidity(context);
  if (liquidity == null) {
    return "Chưa có dữ liệu thanh khoản pool, nên khó ước lượng rủi ro trượt giá.";
  }
  if (liquidity >= 1_000_000) {
    return `Thanh khoản pool cao khoảng ${compactCurrency(liquidity)} có thể giảm trượt giá thông thường, nhưng giá vẫn có thể biến động mạnh.`;
  }
  if (liquidity >= 100_000) {
    return `Thanh khoản pool khoảng ${compactCurrency(liquidity)} là mức có thể giao dịch, nhưng lệnh lớn vẫn dễ tạo biến động.`;
  }
  return `Thanh khoản pool chỉ khoảng ${compactCurrency(liquidity)}, làm rủi ro trượt giá và biến động tăng lên.`;
}

function viHolderInterpretation(context: TokenAiContext) {
  const top10 = holderTop10Percent(context);
  const count = holderCount(context);
  if (top10 == null) {
    return "Chưa có dữ liệu tập trung holder, nên chưa thấy rõ rủi ro phân phối từ holder lớn.";
  }
  const countText = count == null ? "số holder chưa rõ" : `${count.toLocaleString("en-US")} holder`;
  if (top10 >= 50) {
    return `Top 10 holder nắm ${percent(top10)} nguồn cung với ${countText}; mức tập trung này làm rủi ro phân phối cao hơn, nhưng không phải bằng chứng thao túng.`;
  }
  if (top10 >= 25) {
    return `Top 10 holder nắm ${percent(top10)} nguồn cung với ${countText}; đây là tín hiệu tập trung đáng theo dõi.`;
  }
  return `Top 10 holder nắm ${percent(top10)} nguồn cung với ${countText}; có rủi ro tập trung nhưng chưa phải tín hiệu nổi bật từ một chỉ số.`;
}

function viNewsInterpretation(context: TokenAiContext) {
  const total = context.latestNews.length;
  if (total === 0) {
    return "Không có tin tức gần đây trong bằng chứng Yoca, nên không nên gán biến động giá cho tin tức.";
  }
  const direct = countDirectNews(context);
  const label = tokenLabel(context);
  if (direct === 0) {
    return `${total} tin được tìm thấy nhưng có vẻ là bối cảnh hệ sinh thái/thị trường, không phải catalyst trực tiếp cho ${label}.`;
  }
  if (direct < total) {
    return `${direct}/${total} tin nhắc trực tiếp đến ${label}; phần còn lại là bối cảnh rộng hơn, nên tín hiệu tin tức ở mức pha trộn.`;
  }
  return `${total} tin gần đây nhắc trực tiếp đến ${label}, nên narrative có trọng lượng hơn nhưng vẫn không chứng minh nguyên nhân giá.`;
}

function viCatalystInterpretation(context: TokenAiContext) {
  const move = priceMove(context);
  const directNews = countDirectNews(context);
  if (move.direction === "down" && directNews === 0) {
    return "Giá đang giảm nhưng không có tin xấu trực tiếp trong bằng chứng, nên biến động có vẻ thiên về thị trường/thanh khoản hơn là do tin tức.";
  }
  if (move.direction === "down") {
    return "Giá đang giảm trong khi có tin liên quan; hãy xem tin tức là bối cảnh, không phải bằng chứng nguyên nhân.";
  }
  if (move.direction === "up" && directNews === 0) {
    return "Giá đang tăng nhưng chưa có catalyst tin tức trực tiếp, nên có thể là dòng tiền, thanh khoản hoặc thị trường rộng hơn.";
  }
  return "Bằng chứng hiện tại chưa chứng minh một nguyên nhân duy nhất cho biến động giá.";
}

function viLowDataInterpretation(context: TokenAiContext) {
  const missing = [];
  if (!context.market) missing.push("dữ liệu thị trường");
  if (!context.chartSummary || context.chartSummary.points < 2) {
    missing.push("lịch sử chart đủ dùng");
  }
  if (context.latestNews.length === 0) missing.push("tin tức gần đây");
  if (!context.holderStats) missing.push("tập trung holder");
  if (context.pools.length === 0) missing.push("thanh khoản pool");

  if (missing.length === 0) {
    return "Bằng chứng đủ để đọc rủi ro thị trường, thanh khoản, holder và tin tức ở mức trung bình.";
  }
  return `Dữ liệu còn thiếu hoặc mỏng: ${missing.join(", ")}. Yoca vẫn có thể suy luận rủi ro nhìn thấy được, nhưng độ tin cậy nên thấp hơn.`;
}

function viWatchSignalBullets() {
  return [
    "Nếu giá giảm trong khi volume 24h tăng, lực bán, liquidation hoặc rotation có thể vẫn đang hoạt động.",
    "Nếu thanh khoản giảm mạnh, rủi ro trượt giá và biến động tăng lên.",
    "Nếu tin mới không liên quan trực tiếp đến token, đừng gán biến động giá cho tin tức.",
    "Nếu tập trung holder tăng, rủi ro phân phối có thể tăng; không xem đó là bằng chứng thao túng.",
  ];
}

function bullishBullets(context: TokenAiContext) {
  const move = priceMove(context);
  const market = marketRecord(context);
  const volume = finiteNumber(market.volume24h);
  const liquidity = topPoolLiquidity(context);
  const bullets: string[] = [];

  if (move.direction === "up") {
    bullets.push(`Price strength is visible: ${move.phrase}.`);
  }
  if (volume != null && volume >= 250_000) {
    bullets.push(`${compactCurrency(volume)} in 24h volume shows active trading interest.`);
  }
  const flow = topPoolTradeCounts(context);
  if (flow.buys != null && flow.sells != null && flow.buys > flow.sells) {
    bullets.push(tradeFlowInterpretation(context));
  }
  if (liquidity != null && liquidity >= 100_000) {
    bullets.push(liquidityInterpretation(context));
  }
  if (context.latestNews.length > 0) {
    bullets.push(newsInterpretation(context));
  }
  if (wrappedTokenInterpretation(context)) {
    bullets.push("For a wrapped asset, broad relevance of the underlying asset can support continued monitoring.");
  }

  return bullets.length > 0
    ? bullets.slice(0, 5)
    : ["No clear positive market, liquidity, or news signal is visible in the current Yoca evidence."];
}

function bearishBullets(context: TokenAiContext) {
  const move = priceMove(context);
  const liquidity = topPoolLiquidity(context);
  const bullets: string[] = [];

  if (move.direction === "down") {
    bullets.push(`Price weakness is visible: ${move.phrase}.`);
  }
  if (liquidity != null && liquidity < 100_000) {
    bullets.push(liquidityInterpretation(context));
  }
  const flow = topPoolTradeCounts(context);
  if (flow.buys != null && flow.sells != null && flow.sells > flow.buys) {
    bullets.push(tradeFlowInterpretation(context));
  }
  if (context.latestNews.length === 0 || countDirectNews(context) === 0) {
    bullets.push("News evidence is missing or indirect, so there is no clear headline support for the move.");
  }
  bullets.push(holderInterpretation(context));

  return [...new Set(bullets)].slice(0, 5);
}

function localizedDisclaimer(language: TokenAiLanguage) {
  return language === "vi"
    ? "Chỉ dùng cho mục đích thông tin, không phải lời khuyên tài chính. Hãy tự kiểm chứng dữ liệu và cân nhắc rủi ro trước mọi quyết định."
    : "For information only, not financial advice. Verify the data and consider your own risk before making decisions.";
}

function localizedEvidenceWarning(
  context: TokenAiContext,
  language: TokenAiLanguage,
  intent: TokenAiIntent,
) {
  if (language !== "vi") return evidenceWarning(context, language, intent);

  const warnings: string[] = [];
  if (isSecuritySensitiveIntent(intent) && !hasSecurityEvidence(context)) {
    warnings.push(conciseSecurityLimitation(language));
  }
  if (context.latestNews.length === 0) {
    warnings.push("Không có tin tức gần đây trong bằng chứng Yoca cho token này.");
  }
  if (!context.market) {
    warnings.push("Dữ liệu thị trường hiện không khả dụng.");
  }
  return normalizeWarningsForResponse(warnings);
}

function buildFallbackTldr(
  context: TokenAiContext,
  intent: TokenAiIntent,
  language: TokenAiLanguage,
) {
  const label = tokenLabel(context);
  const move = priceMove(context);
  const includeSecurityLimitation =
    isSecuritySensitiveIntent(intent) && !hasSecurityEvidence(context);

  if (language === "vi") {
    return [
      `${label}: ${viPriceMovePhrase(context)}; cần đọc cùng volume, thanh khoản và tin tức thay vì chỉ nhìn giá.`,
      `${viCatalystInterpretation(context)} ${viVolumeInterpretation(context)}`,
      ...(includeSecurityLimitation ? [conciseSecurityLimitation(language)] : []),
    ].slice(0, 3);
  }

  if (intent === "latest_news") {
    return [
      `${headlineBullets(context).length} recent headline item(s) are available in the answer.`,
      newsInterpretation(context),
      catalystInterpretation(context),
    ];
  }

  return [
    `${label} is ${move.phrase}; the useful read is what that implies alongside volume, liquidity, holders, and news.`,
    `${catalystInterpretation(context)} ${volumeInterpretation(context)}`,
    ...(includeSecurityLimitation ? [conciseSecurityLimitation(language)] : []),
  ].slice(0, 3);
}

function buildVietnameseFallbackSections(
  context: TokenAiContext,
  intent: TokenAiIntent,
): TokenAiSection[] {
  const label = tokenLabel(context);
  const wrapped = wrappedTokenInterpretation(context);

  if (intent === "risk_overview") {
    return [
      {
        title: "Rủi Ro Thị Trường",
        kind: "risk_factors",
        bullets: [
          `${label} đang ${viPriceMovePhrase(context)}; biến động này cần đọc cùng volume và thanh khoản.`,
          viCatalystInterpretation(context),
          viLowDataInterpretation(context),
        ],
      },
      {
        title: "Rủi Ro Thanh Khoản Và Giao Dịch",
        kind: "risk_factors",
        bullets: [viVolumeInterpretation(context), viLiquidityInterpretation(context)],
      },
      {
        title: "Rủi Ro Holder",
        kind: "risk_factors",
        bullets: [viHolderInterpretation(context)],
      },
      {
        title: "Rủi Ro Tin Tức Và Narrative",
        kind: "risk_factors",
        bullets: [
          viNewsInterpretation(context),
          ...(wrapped
            ? [
                "Đây có vẻ là wrapped token, nên biến động có thể phản ánh tài sản gốc và thanh khoản wrapper hơn là narrative độc lập.",
              ]
            : []),
        ],
      },
      {
        title: "Cần Theo Dõi",
        kind: "what_to_watch",
        bullets: viWatchSignalBullets(),
      },
    ];
  }

  return [
    {
      title: "Tóm Tắt Phân Tích",
      kind: "market_snapshot",
      bullets: [
        `${label} đang ${viPriceMovePhrase(context)}.`,
        viVolumeInterpretation(context),
        viLiquidityInterpretation(context),
      ],
    },
    {
      title: "Ý Nghĩa Của Tín Hiệu",
      kind: "deep_dive",
      bullets: [
        viCatalystInterpretation(context),
        viNewsInterpretation(context),
        viHolderInterpretation(context),
        ...(wrapped
          ? [
              "Vì đây có vẻ là wrapped token, hãy đọc dữ liệu như phản ánh tài sản gốc và thanh khoản wrapper.",
            ]
          : []),
      ],
    },
    {
      title: "Cần Theo Dõi",
      kind: "what_to_watch",
      bullets: viWatchSignalBullets(),
    },
  ];
}

function buildImprovedFallbackSections(
  context: TokenAiContext,
  intent: TokenAiIntent,
  language: TokenAiLanguage,
): TokenAiSection[] {
  const label = tokenLabel(context);
  const wrapped = wrappedTokenInterpretation(context);

  if (language === "vi") {
    return buildVietnameseFallbackSections(context, intent);
  }

  switch (intent) {
    case "price_move_explanation":
      return [
        {
          title: "What The Move Implies",
          kind: "key_drivers",
          bullets: [
            `${label} is ${priceMove(context).phrase}.`,
            catalystInterpretation(context),
            volumeInterpretation(context),
            liquidityInterpretation(context),
            holderInterpretation(context),
          ],
        },
        {
          title: "Evidence Behind The Read",
          kind: "deep_dive",
          bullets: [
            chartInterpretation(context),
            volatilityInterpretation(context),
            newsInterpretation(context),
            lowDataInterpretation(context),
          ],
        },
        {
          title: "Watch Signals",
          kind: "what_to_watch",
          bullets: watchSignalBullets(context).slice(0, 3),
        },
        {
          title: "Bottom Line",
          kind: "conclusion",
          content:
            "The move can be framed with market, liquidity, holder, and news evidence, but the data does not prove a single cause.",
        },
      ];
    case "latest_news":
      return [
        {
          title: "Latest Headlines",
          kind: "latest_headlines",
          bullets: headlineBullets(context),
        },
        {
          title: "How Direct The News Looks",
          kind: "why_it_matters",
          content: newsInterpretation(context),
        },
        {
          title: "Why It Matters",
          kind: "why_it_matters",
          bullets: [
            catalystInterpretation(context),
            "Direct token-specific news can support a narrative; broad ecosystem news should be treated as context only.",
            "If price moves without direct token news, market structure and liquidity deserve more weight than headlines.",
          ],
        },
        {
          title: "What To Watch",
          kind: "what_to_watch",
          bullets: watchSignalBullets(context).slice(2, 5),
        },
      ];
    case "bullish_bearish":
      return [
        {
          title: "Bullish Case",
          kind: "bullish_signals",
          bullets: bullishBullets(context),
        },
        {
          title: "Bearish Case",
          kind: "bearish_signals",
          bullets: bearishBullets(context),
        },
        {
          title: "Balanced Conclusion",
          kind: "conclusion",
          content:
            "The useful conclusion is not a trade command: weigh price direction against volume quality, liquidity depth, holder distribution, news relevance, and any available authority evidence.",
        },
        {
          title: "Confirmation Signals",
          kind: "what_to_watch",
          bullets: watchSignalBullets(context),
        },
      ];
    case "risk_overview": {
      const securityBullets = securityEvidenceBullets(context);
      return [
        {
          title: "Market Risk",
          kind: "risk_factors",
          bullets: [
            `${label} is ${priceMove(context).phrase}.`,
            catalystInterpretation(context),
            chartInterpretation(context),
          ],
        },
        {
          title: "Liquidity And Trading Risk",
          kind: "risk_factors",
          bullets: [volumeInterpretation(context), liquidityInterpretation(context)],
        },
        {
          title: "Holder Concentration Risk",
          kind: "risk_factors",
          bullets: [holderInterpretation(context)],
        },
        {
          title: "News And Narrative Risk",
          kind: "risk_factors",
          bullets: [newsInterpretation(context), ...(wrapped ? [wrapped] : [])],
        },
        ...(securityBullets.length > 0
          ? [
              {
                title: "Mint / Freeze Authority Evidence",
                kind: "risk_factors" as const,
                bullets: securityBullets,
              },
            ]
          : []),
        {
          title: "Risk Signals To Watch",
          kind: "what_to_watch",
          bullets: watchSignalBullets(context).slice(0, 4),
        },
      ];
    }
    case "simple_explanation":
      return [
        {
          title: "What This Token Is",
          kind: "simple_explanation",
          content: wrapped
            ? `${label} appears to be a wrapped token, meaning it represents another underlying asset on this chain or venue. Its price action may mostly track that underlying asset plus local liquidity.`
            : `${label} is a token Yoca can inspect through available market, chart, news, liquidity, and holder evidence.`,
        },
        {
          title: "Why Users Track It",
          kind: "why_it_matters",
          bullets: [
            "Price and volume show whether traders are actively repricing it.",
            "Liquidity shows how costly larger trades may become through slippage.",
            "Holder concentration shows whether distribution risk is worth monitoring.",
            "News helps separate direct project catalysts from broad ecosystem noise.",
          ],
        },
        {
          title: "One-Line Takeaway",
          kind: "conclusion",
          content: `${label} is best read through market activity, liquidity depth, holder distribution, and direct news relevance; security claims need separate evidence.`,
        },
      ];
    case "what_to_watch":
      return [
        {
          title: "Concrete Signals",
          kind: "what_to_watch",
          bullets: watchSignalBullets(context),
        },
        {
          title: "How To Interpret Them",
          kind: "deep_dive",
          bullets: [
            volumeInterpretation(context),
            liquidityInterpretation(context),
            holderInterpretation(context),
            newsInterpretation(context),
          ],
        },
        {
          title: "Takeaway",
          kind: "conclusion",
          content:
            "The strongest read comes when price, volume, liquidity, holders, and direct news all point in the same direction.",
        },
      ];
    case "investment_guidance":
      return [
        {
          title: "Market Context",
          kind: "market_snapshot",
          bullets: [
            `${label} is ${priceMove(context).phrase}.`,
            volumeInterpretation(context),
            liquidityInterpretation(context),
            catalystInterpretation(context),
          ],
        },
        {
          title: "Bullish Case",
          kind: "bullish_signals",
          bullets: bullishBullets(context),
        },
        {
          title: "Bearish Case",
          kind: "bearish_signals",
          bullets: bearishBullets(context),
        },
        {
          title: "Risk Framework",
          kind: "practical_framework",
          bullets: [
            "Do not treat this as a buy/sell instruction.",
            "Wait for confirmation from price direction, volume quality, liquidity stability, direct news, and holder concentration.",
            "Keep market signals separate from contract-security checks; use mint/freeze authority evidence only when it is present.",
          ],
        },
      ];
    default:
      return [
        {
          title: "Market Snapshot",
          kind: "market_snapshot",
          bullets: [
            `${label} is ${priceMove(context).phrase}.`,
            volumeInterpretation(context),
            liquidityInterpretation(context),
          ],
        },
        {
          title: "Interpretation",
          kind: "deep_dive",
          bullets: [
            catalystInterpretation(context),
            newsInterpretation(context),
            holderInterpretation(context),
            lowDataInterpretation(context),
          ],
        },
        {
          title: "What To Watch",
          kind: "what_to_watch",
          bullets: watchSignalBullets(context).slice(0, 4),
        },
      ];
  }
}


function buildDeterministicAnswer(
  request: TokenAiChatRequest,
  context: TokenAiContext,
  intent: TokenAiIntent,
  fallbackReason: TokenAiFallbackReason = "deterministic_fallback",
): TokenAiChatData {
  const warnings = localizedEvidenceWarning(context, request.language, intent);

  return {
    token: context.token,
    question: request.question,
    intent,
    tldr: buildFallbackTldr(context, intent, request.language).slice(0, 3),
    sections: buildImprovedFallbackSections(context, intent, request.language),
    evidence: normalizeEvidenceForResponse(context.evidence),
    sources: normalizeSourcesForResponse(context.sources),
    warnings: normalizeWarningsForResponse(warnings),
    confidence:
      confidenceFor(context, intent) === "High"
        ? "Medium"
        : confidenceFor(context, intent),
    asOf: context.builtAt,
    disclaimer: localizedDisclaimer(request.language),
    generatedAt: new Date().toISOString(),
    provider: "analyst_fallback",
    fallbackReason: exposeFallbackReason(fallbackReason),
    modelModeRequested: request.modelMode ?? "deep",
    modelModeUsed: undefined,
    modelRequested: modelForMode(request.modelMode ?? "deep"),
    modelUsed: undefined,
  };
}

function compactContextForPrompt(context: TokenAiContext) {
  return {
    token: context.token,
    timeframe: context.timeframe,
    market: context.market,
    metadata: context.metadata,
    chartSummary: context.chartSummary,
    latestNews: context.latestNews.map((article) => ({
      title: article.title,
      source: article.source,
      publishedAt: article.publishedAt,
      description: article.description?.slice(0, 320),
      url: article.url,
    })),
    chartNewsMarkers: context.chartNewsMarkers,
    volatilityEvents: context.volatilityEvents,
    holderStats: context.holderStats,
    topHolders: context.topHolders.slice(0, 5),
    pools: context.pools.slice(0, 3),
    recentTrades: context.recentTrades.slice(0, 5),
    security: context.security,
    missingSections: context.missingSections,
    evidence: context.evidence,
    sources: context.sources,
    builtAt: context.builtAt,
  };
}

function buildPrompt({
  request,
  context,
  intent,
}: {
  request: TokenAiChatRequest;
  context: TokenAiContext;
  intent: TokenAiIntent;
}) {
  return [
    `Question: ${request.question}`,
    `Language: ${request.language}`,
    `Intent: ${intent}`,
    `Timeframe: ${request.timeframe}`,
    "",
    "Use only the provided Yoca evidence. Separate facts from interpretation.",
    "Do not simply list the available evidence. Synthesize it into a useful analyst answer.",
    "Minimum usefulness rule: every non-empty section must contain at least one concrete implication or decision-useful interpretation, not just a repeated metric.",
    "For every important metric, explain what it implies. For every conclusion, point to the evidence that supports it.",
    "Prefer specific interpretation over generic advice. Avoid phrases like watch price and volume, track changes over time, or do your own research unless followed by the concrete pattern that matters.",
    "If price is down but no direct negative news is found, say the move appears more likely market/liquidity-driven than news-driven.",
    "If volume is high while price falls, explain possible sell pressure, liquidation, or rotation context, but do not claim causation without evidence.",
    "If holder concentration is high, explain that it can increase distribution risk, but do not claim manipulation.",
    "If liquidity is high, explain that slippage risk may be lower, but price can still move strongly.",
    "If only wrapped-token data is available, explain that the token may reflect the underlying asset rather than an independent project.",
    "Never invent unavailable data. Never claim mint authority, freeze authority, deployer, creator, honeypot status, token security, or private insider behavior unless the evidence explicitly includes it.",
    "If mint/freeze authority evidence is supplied, use it carefully as evidence only; do not call the token safe or unsafe based only on that.",
    "Do not mention unavailable security fields unless the user asks about risk, safety, security, scam, honeypot, freeze authority, creator, or deployer.",
    "Do not list every missing security field. If contract security data is limited, say it once as a concise limitation.",
    "If the user asks whether the token is a honeypot, say honeypot detection is not included unless direct honeypot evidence is supplied; then discuss visible market, liquidity, holder, pool, and trading warning signs.",
    "Do not mention market cap rank or FDV rank when it is missing.",
    "Do not put missing-security limitations in TLDR unless the user specifically asked a security or risk question.",
    "Do not give direct buy, sell, or hold instructions. Do not use guaranteed, will pump, risk-free, or equivalent certainty.",
    "If the user asks risk, safe, scam, or honeypot, clearly separate available market/liquidity/holder/news risks from contract-security limitations.",
    "If the user asks whether to buy, do not give a buy/sell command. Give market context, bullish case, bearish case, risk framework, and confirmation signals to wait for.",
    "For investment-like questions, use scenario framing, risk framework, and watch-next items.",
    "Sound like a crypto analyst explaining the situation to a normal user. Be direct, concrete, and careful about uncertainty.",
    "Use intent-specific sections. Keep TLDR to 2-3 bullets. Warnings must be short, deduped, and limited to material data limitations.",
    "Keep TLDR bullets under 280 characters.",
    "Keep section bullets concise, ideally under 500 characters.",
    "Use section content for longer explanations instead of oversized bullets.",
    "If language is vi, answer in Vietnamese.",
    "Return JSON only with keys: tldr, sections, warnings, confidence, disclaimer.",
    "",
    JSON.stringify(compactContextForPrompt(context), null, 2),
  ].join("\n");
}

interface GeminiAnswerResult {
  data: Omit<TokenAiChatData, "cache"> | null;
  fallbackReason: TokenAiFallbackReason;
  retryable: boolean;
  modelRequested?: string;
  modelUsed?: string;
  modeRequested?: TokenAiModelMode;
  modeUsed?: TokenAiModelMode;
}

function geminiDataFromParsed({
  request,
  context,
  intent,
  parsed,
  provider,
  fallbackReason,
  modelRequested,
  modelUsed,
  modeRequested,
  modeUsed,
}: {
  request: TokenAiChatRequest;
  context: TokenAiContext;
  intent: TokenAiIntent;
  parsed: z.infer<typeof geminiResponseSchema>;
  provider: TokenAiChatData["provider"];
  fallbackReason?: TokenAiFallbackReason;
  modelRequested: string;
  modelUsed: string;
  modeRequested: TokenAiModelMode;
  modeUsed: TokenAiModelMode;
}): Omit<TokenAiChatData, "cache"> {
  return {
    token: context.token,
    question: request.question,
    intent,
    tldr: parsed.tldr,
    sections: parsed.sections,
    evidence: normalizeEvidenceForResponse(context.evidence),
    sources: normalizeSourcesForResponse(context.sources),
    warnings: normalizeWarningsForResponse([
      ...new Set([
        ...parsed.warnings,
        ...localizedEvidenceWarning(context, request.language, intent),
      ]),
    ]),
    confidence:
      intent === "risk_overview" && parsed.confidence === "High"
        ? "Medium"
        : parsed.confidence,
    asOf: context.builtAt,
    disclaimer: parsed.disclaimer || localizedDisclaimer(request.language),
    generatedAt: new Date().toISOString(),
    provider,
    fallbackReason: fallbackReason
      ? exposeFallbackReason(fallbackReason)
      : undefined,
    modelModeRequested: modeRequested,
    modelModeUsed: modeUsed,
    modelRequested,
    modelUsed,
  };
}

function parseGeminiJsonText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true as const, value: {} };

  try {
    return { ok: true as const, value: JSON.parse(trimmed) as unknown };
  } catch (firstError) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try {
        return { ok: true as const, value: JSON.parse(fenced) as unknown };
      } catch {
        // Fall through to the concise parse error below.
      }
    }

    return {
      ok: false as const,
      error: firstError instanceof Error ? firstError.message : String(firstError),
    };
  }
}

interface TokenAiNormalizationStats {
  truncatedFields: number;
  removedEmptySections: number;
  removedEmptyBullets: number;
}

function createTokenAiNormalizationStats(): TokenAiNormalizationStats {
  return {
    truncatedFields: 0,
    removedEmptySections: 0,
    removedEmptyBullets: 0,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function truncateText(
  text: string,
  maxLength: number,
  stats?: TokenAiNormalizationStats,
) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  if (stats) stats.truncatedFields += 1;
  if (maxLength <= TRUNCATION_ELLIPSIS.length) {
    return TRUNCATION_ELLIPSIS.slice(0, maxLength);
  }

  return `${trimmed
    .slice(0, maxLength - TRUNCATION_ELLIPSIS.length)
    .trimEnd()}${TRUNCATION_ELLIPSIS}`;
}

function normalizeTextValue(
  value: unknown,
  maxLength: number,
  stats?: TokenAiNormalizationStats,
): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const cleaned = removeNoisyUnavailableText(String(value));
  if (!cleaned) return undefined;
  const text = truncateText(cleaned, maxLength, stats);
  return text.length > 0 ? text : undefined;
}

function normalizeTextArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
  stats?: TokenAiNormalizationStats,
) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string" || typeof value === "number"
      ? [value]
      : [];
  const normalized: string[] = [];

  for (const item of values) {
    if (normalized.length >= maxItems) break;
    const text = normalizeTextValue(item, maxLength, stats);
    if (text) {
      normalized.push(text);
    } else if (stats) {
      stats.removedEmptyBullets += 1;
    }
  }

  return normalized;
}

function normalizeConfidence(value: unknown): "Low" | "Medium" | "High" {
  if (typeof value !== "string") return "Low";
  const normalized = value.trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return "Low";
}

function normalizeSectionKind(value: unknown): TokenAiSection["kind"] {
  return typeof value === "string" &&
    sectionKinds.includes(value as (typeof sectionKinds)[number])
    ? (value as TokenAiSection["kind"])
    : "custom";
}

function normalizeSectionTable(
  value: unknown,
  stats?: TokenAiNormalizationStats,
): TokenAiSection["table"] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows: Array<Record<string, string | number | null>> = [];
  for (const row of value.slice(0, TOKEN_AI_RESPONSE_LIMITS.sectionTableRows)) {
    const rowRecord = toRecord(row);
    const normalizedRow: Record<string, string | number | null> = {};

    for (const [key, rawCell] of Object.entries(rowRecord).slice(0, 8)) {
      const normalizedKey = truncateText(key, 80, stats);
      if (typeof rawCell === "number" && Number.isFinite(rawCell)) {
        normalizedRow[normalizedKey] = rawCell;
      } else if (rawCell == null) {
        normalizedRow[normalizedKey] = null;
      } else if (typeof rawCell === "string" || typeof rawCell === "boolean") {
        normalizedRow[normalizedKey] = truncateText(
          String(rawCell),
          TOKEN_AI_RESPONSE_LIMITS.sectionBulletChars,
          stats,
        );
      }
    }

    if (Object.keys(normalizedRow).length > 0) rows.push(normalizedRow);
  }

  return rows.length > 0 ? rows : undefined;
}

function normalizeRawEvidenceForValidation(
  value: unknown,
  stats?: TokenAiNormalizationStats,
) {
  if (!Array.isArray(value)) return undefined;

  const evidenceTypes = new Set<TokenAiEvidence["type"]>([
    "market",
    "chart",
    "news",
    "volatility",
    "holders",
    "pool",
    "trades",
    "security",
    "metadata",
    "internal",
  ]);

  const evidence: TokenAiEvidence[] = [];
  for (const item of value.slice(0, TOKEN_AI_RESPONSE_LIMITS.evidenceItems)) {
    const record = toRecord(item);
    const label = normalizeTextValue(
      record.label,
      TOKEN_AI_RESPONSE_LIMITS.evidenceLabelChars,
      stats,
    );
    if (!label) continue;

    const type =
      typeof record.type === "string" &&
      evidenceTypes.has(record.type as TokenAiEvidence["type"])
        ? (record.type as TokenAiEvidence["type"])
        : "internal";
    const evidenceValue = normalizeTextValue(
      record.value,
      TOKEN_AI_RESPONSE_LIMITS.evidenceValueChars,
      stats,
    );
    const evidenceDetail = normalizeTextValue(
      record.detail,
      TOKEN_AI_RESPONSE_LIMITS.evidenceDetailChars,
      stats,
    );

    evidence.push({
      type,
      label,
      ...(evidenceValue ? { value: evidenceValue } : {}),
      ...(evidenceDetail ? { detail: evidenceDetail } : {}),
      ...(typeof record.url === "string" && record.url.trim()
        ? { url: record.url.trim() }
        : {}),
      ...(typeof record.timestamp === "string" && record.timestamp.trim()
        ? { timestamp: record.timestamp.trim() }
        : {}),
      ...(typeof record.source === "string" && record.source.trim()
        ? { source: record.source.trim() }
        : {}),
    });
  }

  return evidence;
}

function normalizeRawSourcesForValidation(
  value: unknown,
  stats?: TokenAiNormalizationStats,
) {
  if (!Array.isArray(value)) return undefined;

  const sources: TokenAiSource[] = [];
  for (const item of value.slice(0, TOKEN_AI_RESPONSE_LIMITS.sourceItems)) {
    const record = toRecord(item);
    const title = normalizeTextValue(
      record.title,
      TOKEN_AI_RESPONSE_LIMITS.sourceTitleChars,
      stats,
    );
    if (!title || typeof record.url !== "string" || !record.url.trim()) {
      continue;
    }
    const snippet = normalizeTextValue(
      record.snippet,
      TOKEN_AI_RESPONSE_LIMITS.sourceSnippetChars,
      stats,
    );

    sources.push({
      title,
      url: record.url.trim(),
      ...(typeof record.publisher === "string" && record.publisher.trim()
        ? { publisher: record.publisher.trim() }
        : {}),
      ...(typeof record.publishedAt === "string" && record.publishedAt.trim()
        ? { publishedAt: record.publishedAt.trim() }
        : {}),
      ...(snippet ? { snippet } : {}),
      ...(record.sourceType === "internal" || record.sourceType === "external"
        ? { sourceType: record.sourceType }
        : {}),
    });
  }

  return sources;
}

function normalizeTokenAiResponseForValidation(
  raw: unknown,
  stats = createTokenAiNormalizationStats(),
) {
  const record = toRecord(raw);
  const tldr = normalizeTextArray(
    record.tldr,
    TOKEN_AI_RESPONSE_LIMITS.tldrItems,
    TOKEN_AI_RESPONSE_LIMITS.tldrBulletChars,
    stats,
  );
  const warnings = normalizeTextArray(
    record.warnings,
    TOKEN_AI_RESPONSE_LIMITS.warningItems,
    TOKEN_AI_RESPONSE_LIMITS.warningChars,
    stats,
  );
  const rawSections = Array.isArray(record.sections) ? record.sections : [];
  const sections: TokenAiSection[] = [];

  for (const rawSection of rawSections) {
    if (sections.length >= TOKEN_AI_RESPONSE_LIMITS.sectionItems) break;

    const sectionRecord = toRecord(rawSection);
    const content = normalizeTextValue(
      sectionRecord.content,
      TOKEN_AI_RESPONSE_LIMITS.sectionContentChars,
      stats,
    );
    const bullets = normalizeTextArray(
      sectionRecord.bullets,
      TOKEN_AI_RESPONSE_LIMITS.sectionBulletItems,
      TOKEN_AI_RESPONSE_LIMITS.sectionBulletChars,
      stats,
    );
    const table = normalizeSectionTable(sectionRecord.table, stats);

    if (!content && bullets.length === 0 && (!table || table.length === 0)) {
      stats.removedEmptySections += 1;
      continue;
    }

    sections.push({
      title:
        normalizeTextValue(
          sectionRecord.title,
          TOKEN_AI_RESPONSE_LIMITS.sectionTitleChars,
          stats,
        ) ?? "Analysis",
      kind: normalizeSectionKind(sectionRecord.kind),
      ...(content ? { content } : {}),
      ...(bullets.length > 0 ? { bullets } : {}),
      ...(table && table.length > 0 ? { table } : {}),
    });
  }

  const evidence = normalizeRawEvidenceForValidation(record.evidence, stats);
  const sources = normalizeRawSourcesForValidation(record.sources, stats);

  return {
    tldr,
    sections,
    ...(evidence ? { evidence } : {}),
    ...(sources ? { sources } : {}),
    warnings,
    confidence: normalizeConfidence(record.confidence),
    disclaimer:
      normalizeTextValue(
        record.disclaimer,
        TOKEN_AI_RESPONSE_LIMITS.disclaimerChars,
        stats,
      ) ?? "For information only, not financial advice.",
  };
}

function logGeminiNormalization(stats: TokenAiNormalizationStats) {
  if (!shouldExposeTokenAiDiagnostics()) return;
  if (stats.truncatedFields === 0 && stats.removedEmptySections === 0) return;

  console.debug("[token-ai-chat] Gemini response normalized", {
    truncatedFields: stats.truncatedFields,
    removedEmptySections: stats.removedEmptySections,
  });
}

function normalizeWarningsForResponse(warnings: string[]) {
  const normalized = normalizeTextArray(
    warnings,
    TOKEN_AI_RESPONSE_LIMITS.warningItems * 2,
    TOKEN_AI_RESPONSE_LIMITS.warningChars,
  );
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const warning of normalized) {
    if (isWeakUnavailableWarning(warning)) continue;
    const key = warningKey(warning);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(warning);
    if (deduped.length >= 3) break;
  }

  return deduped;
}

function isWeakUnavailableEvidence(item: TokenAiEvidence) {
  const text = [item.label, item.value, item.detail].filter(Boolean).join(" ");
  return isWeakUnavailableWarning(text);
}

function normalizeEvidenceForResponse(evidence: TokenAiEvidence[]) {
  return evidence
    .filter((item) => !isWeakUnavailableEvidence(item))
    .slice(0, TOKEN_AI_RESPONSE_LIMITS.evidenceItems)
    .map((item) => ({
    ...item,
    label:
      normalizeTextValue(
        item.label,
        TOKEN_AI_RESPONSE_LIMITS.evidenceLabelChars,
      ) ?? item.label,
    ...(item.value
      ? {
          value:
            normalizeTextValue(
              item.value,
              TOKEN_AI_RESPONSE_LIMITS.evidenceValueChars,
            ) ?? item.value,
        }
      : {}),
    ...(item.detail
      ? {
          detail:
            normalizeTextValue(
              item.detail,
              TOKEN_AI_RESPONSE_LIMITS.evidenceDetailChars,
            ) ?? item.detail,
        }
      : {}),
  }));
}

function normalizeSourcesForResponse(sources: TokenAiSource[]) {
  return sources.slice(0, TOKEN_AI_RESPONSE_LIMITS.sourceItems).map((source) => ({
    ...source,
    title:
      normalizeTextValue(
        source.title,
        TOKEN_AI_RESPONSE_LIMITS.sourceTitleChars,
      ) ?? source.title,
    ...(source.snippet
      ? {
          snippet:
            normalizeTextValue(
              source.snippet,
              TOKEN_AI_RESPONSE_LIMITS.sourceSnippetChars,
            ) ?? source.snippet,
        }
      : {}),
  }));
}

async function generateGeminiAnswerForModel(
  request: TokenAiChatRequest,
  context: TokenAiContext,
  intent: TokenAiIntent,
  model: string,
  mode: TokenAiModelMode,
  requestedModel: string,
  requestedMode: TokenAiModelMode,
  provider: TokenAiChatData["provider"],
  fallbackReason?: TokenAiFallbackReason,
): Promise<GeminiAnswerResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    logGeminiFallback("missing_api_key");
    return {
      data: null,
      fallbackReason: "missing_api_key",
      retryable: false,
      modelRequested: requestedModel,
      modelUsed: model,
      modeRequested: requestedMode,
      modeUsed: mode,
    };
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await trackGemini("gemini.svc.token_ai_chat", model, () => client.models.generateContent({
      model,
      contents: buildPrompt({ request, context, intent }),
      config: {
        temperature: 0.25,
        responseMimeType: "application/json",
        systemInstruction: [
          "You are Yoca AI, a careful token evidence analyst.",
          "You answer custom questions about one token using only supplied Yoca evidence.",
          "You avoid direct financial advice and unsupported token security claims.",
          "Return strict JSON only.",
        ].join(" "),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tldr: { type: Type.ARRAY, items: { type: Type.STRING } },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  content: { type: Type.STRING },
                  bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                  table: {
                    type: Type.ARRAY,
                    items: { type: Type.OBJECT },
                  },
                },
                required: ["title", "kind"],
              },
            },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: { type: Type.STRING },
            disclaimer: { type: Type.STRING },
          },
          required: ["tldr", "sections", "warnings", "confidence", "disclaimer"],
        },
      },
    }));

    const rawText = response.text ?? "";
    const json = parseGeminiJsonText(rawText);
    if (!json.ok) {
      logGeminiFallback("gemini_invalid_json", {
        error: json.error,
        responseLength: rawText.length,
      });
      return {
        data: null,
        fallbackReason: "gemini_invalid_json",
        retryable: false,
        modelRequested: requestedModel,
        modelUsed: model,
        modeRequested: requestedMode,
        modeUsed: mode,
      };
    }

    const normalizationStats = createTokenAiNormalizationStats();
    const normalized = normalizeTokenAiResponseForValidation(
      json.value,
      normalizationStats,
    );
    logGeminiNormalization(normalizationStats);

    const parsed = geminiResponseSchema.safeParse(normalized);
    if (!parsed.success) {
      logGeminiFallback("gemini_zod_validation_error_after_normalization", {
        issues: parsed.error.issues
          .slice(0, 8)
          .map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
      });
      return {
        data: null,
        fallbackReason: "gemini_zod_validation_error_after_normalization",
        retryable: false,
        modelRequested: requestedModel,
        modelUsed: model,
        modeRequested: requestedMode,
        modeUsed: mode,
      };
    }

    return {
      data: geminiDataFromParsed({
        request,
        context,
        intent,
        parsed: parsed.data,
        provider,
        fallbackReason,
        modelRequested: requestedModel,
        modelUsed: model,
        modeRequested: requestedMode,
        modeUsed: mode,
      }),
      fallbackReason: "deterministic_fallback",
      retryable: false,
      modelRequested: requestedModel,
      modelUsed: model,
      modeRequested: requestedMode,
      modeUsed: mode,
    };
  } catch (err) {
    const parsedError = parseGeminiError(err);
    if (parsedError.retryable) {
      logRetryableGeminiError(model, parsedError);
    } else {
      logGeminiFallback("gemini_api_error", {
        status: parsedError.status ?? parsedError.providerStatus,
        retryable: false,
      });
    }
    return {
      data: null,
      fallbackReason: parsedError.reason as TokenAiFallbackReason,
      retryable: parsedError.retryable,
      modelRequested: requestedModel,
      modelUsed: model,
      modeRequested: requestedMode,
      modeUsed: mode,
    };
  }
}

async function generateGeminiAnswer(
  request: TokenAiChatRequest,
  context: TokenAiContext,
  intent: TokenAiIntent,
): Promise<GeminiAnswerResult> {
  const requestedMode = request.modelMode ?? "deep";
  const requestedModel = modelForMode(requestedMode);
  const preferred = await generateGeminiAnswerForModel(
    request,
    context,
    intent,
    requestedModel,
    requestedMode,
    requestedModel,
    requestedMode,
    "gemini",
  );

  if (preferred.data || !preferred.retryable) return preferred;

  if (shouldExposeTokenAiDiagnostics()) {
    console.warn("[token-ai-chat] Retrying Gemini preferred model", {
      model: requestedModel,
    });
  }
  await sleep(retryDelayMs());

  const retry = await generateGeminiAnswerForModel(
    request,
    context,
    intent,
    requestedModel,
    requestedMode,
    requestedModel,
    requestedMode,
    "gemini",
  );

  if (retry.data || !retry.retryable) {
    return retry.data
      ? retry
      : { ...retry, fallbackReason: "preferred_model_retry_failed" };
  }

  const fallbackCandidate = fallbackModelCandidate(requestedMode, requestedModel);
  if (fallbackCandidate) {
    if (shouldExposeTokenAiDiagnostics()) {
      console.warn("[token-ai-chat] Trying fallback Gemini model", {
        fromModel: requestedModel,
        toModel: fallbackCandidate.model,
      });
    }
    const fallback = await generateGeminiAnswerForModel(
      request,
      context,
      intent,
      fallbackCandidate.model,
      fallbackCandidate.mode,
      requestedModel,
      requestedMode,
      "gemini_model_fallback",
      retry.fallbackReason,
    );
    if (fallback.data) return fallback;
    return {
      ...fallback,
      fallbackReason: fallback.retryable
        ? "fallback_model_failed"
        : fallback.fallbackReason,
    };
  }

  return {
    ...retry,
    fallbackReason: "preferred_model_retry_failed",
  };
}

export async function askTokenAiChat(
  request: TokenAiChatRequest,
): Promise<TokenAiChatData> {
  const intent = classifyTokenAiIntent(request.question);
  const modelModeRequested = request.modelMode ?? "deep";
  const modelRequested = modelForMode(modelModeRequested);
  const context = await buildTokenAiContext({
    address: request.address,
    symbol: request.symbol,
    name: request.name,
    timeframe: request.timeframe,
    includeNews: request.includeNews,
    includeVolatility: request.includeVolatility,
  });
  const evidenceHash = hashTokenAiContext(compactContextForPrompt(context));
  const cacheKey = {
    tokenAddress: request.address,
    normalizedQuestionHash: hashQuestion(request.question),
    timeframe: request.timeframe,
    language: request.language,
    promptVersion: TOKEN_AI_CHAT_PROMPT_VERSION,
    model: modelRequested,
    evidenceHash,
  };
  const geminiConfigured = Boolean(getGeminiApiKey());
  const normalizedQuestionHash = hashQuestion(request.question);

  const cached = await readTokenAiChatCache(cacheKey);
  if (cached) {
    if (
      (cached.data.provider === "deterministic" ||
        cached.data.provider === "analyst_fallback") &&
      geminiConfigured
    ) {
      logGeminiFallback(
        cached.data.provider === "analyst_fallback"
          ? "cached_analyst_fallback_ignored_gemini_available"
          : "cached_deterministic_ignored_gemini_available",
      );
    } else {
      const fallbackReason =
        cached.data.provider === "deterministic" ||
        cached.data.provider === "analyst_fallback"
          ? cached.data.fallbackReason ??
            exposeFallbackReason("cached_deterministic_response")
          : undefined;
      return {
        ...cached.data,
        fallbackReason,
        cache: {
          hit: true,
          expiresAt: cached.expiresAt,
        },
      };
    }
  }

  const gemini = await generateGeminiAnswer(request, context, intent);
  let fresh: Omit<TokenAiChatData, "cache">;

  if (gemini.data) {
    fresh = gemini.data;
  } else {
    const lastGood = await readLastSuccessfulGeminiCache({
      tokenAddress: request.address,
      intent,
      normalizedQuestionHash,
      timeframe: request.timeframe,
      language: request.language,
      promptVersion: TOKEN_AI_CHAT_PROMPT_VERSION,
    });
    const ageMs = lastGood?.updatedAt
      ? Date.now() - Date.parse(lastGood.updatedAt)
      : Number.POSITIVE_INFINITY;
    if (lastGood && ageMs <= lastSuccessfulGeminiWindowMs(intent)) {
      if (shouldExposeTokenAiDiagnostics()) {
        console.warn("[token-ai-chat] Using cached Gemini fallback", {
          ageMs,
          intent,
        });
      }
      fresh = {
        ...lastGood.data,
        token: context.token,
        question: request.question,
        intent,
        evidence: normalizeEvidenceForResponse(context.evidence),
        sources: normalizeSourcesForResponse(context.sources),
        warnings: normalizeWarningsForResponse([
          ...lastGood.data.warnings,
          staleGeminiWarning(request.language),
        ]),
        provider: "cached_gemini",
        fallbackReason: exposeFallbackReason(
          "gemini_unavailable_using_recent_success",
        ),
        asOf: lastGood.data.asOf,
        generatedAt: new Date().toISOString(),
        stale: true,
        modelModeRequested,
        modelRequested,
      };
    } else {
      if (shouldExposeTokenAiDiagnostics()) {
        console.warn("[token-ai-chat] Using Yoca Analyst Fallback", {
          reason: gemini.fallbackReason,
          intent,
        });
      }
      fresh = buildDeterministicAnswer(
        { ...request, modelMode: modelModeRequested },
        context,
        intent,
        gemini.fallbackReason || "all_gemini_models_unavailable",
      );
    }
  }

  const expiresAt =
    fresh.provider === "analyst_fallback"
      ? new Date(Date.now() + ANALYST_FALLBACK_CACHE_TTL_MS)
      : getTokenAiChatCacheExpiresAt(request.timeframe);
  const data: TokenAiChatData = {
    ...fresh,
    cache: {
      hit: false,
      expiresAt: expiresAt.toISOString(),
    },
  };

  try {
    await writeTokenAiChatCache(cacheKey, data, expiresAt);
    if (
      data.provider === "gemini" ||
      data.provider === "gemini_model_fallback"
    ) {
      await writeLastSuccessfulGeminiCache(
        {
          tokenAddress: request.address,
          intent,
          normalizedQuestionHash,
          timeframe: request.timeframe,
          language: request.language,
          promptVersion: TOKEN_AI_CHAT_PROMPT_VERSION,
        },
        { ...data, cache: undefined },
        new Date(Date.now() + LAST_SUCCESSFUL_GEMINI_CACHE_TTL_MS),
      );
    }
  } catch (err) {
    console.warn("[token-ai-chat] cache write failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return data;
}
