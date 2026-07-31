import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

import {
  GEMINI_MODEL,
  SWAPS_SAMPLE_SIZE,
  SYSTEM_PROMPT_TOKEN_EN,
  SYSTEM_PROMPT_TOKEN_VN,
  TOKEN_ANALYSIS_TTL_MS,
} from "@sv/config/constants.js";
import { getWalletSwaps } from "@sv/services/wallet/walletTransfersSwaps.service.js";
import { isValidSolanaAddress } from "@sv/services/wallet/walletIdentity.service.js";

import type { WalletSwap } from "./dtos/walletDataObjects.js";
import {
  type TokenDeepAnalysisErrorCode,
  type TokenDeepAnalysisResponse,
  type TokenTradeEvent,
  type TokenPnlDistribution,
} from "./dtos/walletTokenAnalysisObjects.js";
import env from "@sv/util/load-env.js";
import { statusCode } from "@sv/util/responses.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { trackGemini } from "@sv/services/tracking/gemini-metrics.js";
// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class WalletTokenAnalysisServiceError extends Error {
  readonly code: TokenDeepAnalysisErrorCode;
  readonly status: number;

  constructor(message: string, code: TokenDeepAnalysisErrorCode, status: number) {
    super(message);
    this.name = "WalletTokenAnalysisServiceError";
    this.code = code;
    this.status = status;
  }
}

export function mapWalletTokenAnalysisStatus(
  code: WalletTokenAnalysisServiceError["code"],
): 400 | 409 | 502 {
  const statusByCode: Record<
    WalletTokenAnalysisServiceError["code"],
    400 | 409 | 502
  > = {
    invalid_address: statusCode.BadRequest,
    invalid_token: statusCode.BadRequest,
    no_data: statusCode.Conflict,
    model_error: statusCode.BadGateway,
    invalid_model_response: statusCode.BadGateway,
    provider_unknown: statusCode.BadGateway,
  };

  return statusByCode[code];
}

// ---------------------------------------------------------------------------
// Gemini response schema
// ---------------------------------------------------------------------------

const GEMINI_TOKEN_RESPONSE_SCHEMA = z.object({
  analysis: z.string().min(1),
  riskNotes: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const cache = new Map<string, { data: TokenDeepAnalysisResponse; expiresAt: number }>();

function cacheKey(address: string, tokenAddress: string, language: string): string {
  return `${address}::${tokenAddress}::${language}`;
}

function readCached(address: string, tokenAddress: string, language: string): TokenDeepAnalysisResponse | null {
  const key = cacheKey(address, tokenAddress, language);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCached(address: string, tokenAddress: string, language: string, data: TokenDeepAnalysisResponse): void {
  const key = cacheKey(address, tokenAddress, language);
  cache.set(key, { data, expiresAt: Date.now() + TOKEN_ANALYSIS_TTL_MS });
}

// ---------------------------------------------------------------------------
// Single-token FIFO PnL computation
// ---------------------------------------------------------------------------

interface SingleTokenTradeEventRaw {
  timestampMs: number;
  type: "buy" | "sell";
  price: number;
  amount: number;
  valueUsd: number;
  pnlUsd?: number;
  pnlPercent?: number;
  holdingTimeMs?: number;
}

interface SingleTokenAccumulator {
  entryQueue: Array<{ amount: number; price: number; remaining: number; timestampMs: number }>;
  realizedPnl: number;
  wins: number;
  exits: number;
  buyCount: number;
  sellCount: number;
  totalBoughtUsd: number;
  totalSoldUsd: number;
  tradeEvents: SingleTokenTradeEventRaw[];
}

function computeSingleTokenEvents(swaps: WalletSwap[], tokenAddress: string): SingleTokenAccumulator {
  const sorted = [...swaps]
    .filter((s) => {
      const bought = s.bought;
      const sold = s.sold;
      if (!bought || !sold) return false;
      return bought.address === tokenAddress || sold.address === tokenAddress;
    })
    .sort((a, b) => new Date(a.blockTimestampIso).getTime() - new Date(b.blockTimestampIso).getTime());

  const acc: SingleTokenAccumulator = {
    entryQueue: [],
    realizedPnl: 0,
    wins: 0,
    exits: 0,
    buyCount: 0,
    sellCount: 0,
    totalBoughtUsd: 0,
    totalSoldUsd: 0,
    tradeEvents: [],
  };

  for (const swap of sorted) {
    const bought = swap.bought;
    const sold = swap.sold;
    if (!bought || !sold) continue;

    const swapTimeMs = new Date(swap.blockTimestampIso).getTime();

    if (bought.address === tokenAddress) {
      const entryPrice = swap.totalValueUsd && bought.amount > 0 ? swap.totalValueUsd / bought.amount : 0;
      acc.entryQueue.push({
        amount: bought.amount,
        price: entryPrice,
        remaining: bought.amount,
        timestampMs: swapTimeMs,
      });
      acc.totalBoughtUsd += swap.totalValueUsd ?? 0;
      acc.buyCount += 1;

      acc.tradeEvents.push({
        timestampMs: swapTimeMs,
        type: "buy",
        price: entryPrice,
        amount: bought.amount,
        valueUsd: swap.totalValueUsd ?? 0,
      });
    }

    if (sold.address === tokenAddress) {
      const exitPrice = swap.totalValueUsd && sold.amount > 0 ? swap.totalValueUsd / sold.amount : 0;
      let remainingExit = sold.amount;
      acc.totalSoldUsd += swap.totalValueUsd ?? 0;
      acc.sellCount += 1;
      while (remainingExit > 0 && acc.entryQueue.length > 0) {
        const lot = acc.entryQueue[0];
        const matched = Math.min(remainingExit, lot.remaining);
        lot.remaining -= matched;
        remainingExit -= matched;

        const contribution = matched * (exitPrice - lot.price);
        acc.realizedPnl += contribution;
        if (contribution > 0) acc.wins += 1;
        acc.exits += 1;

        const holdMs = swapTimeMs - lot.timestampMs;
        const pnlPercent = lot.price > 0 ? (exitPrice - lot.price) / lot.price : 0;

        acc.tradeEvents.push({
          timestampMs: swapTimeMs,
          type: "sell",
          price: exitPrice,
          amount: matched,
          valueUsd: matched * exitPrice,
          pnlUsd: contribution,
          pnlPercent,
          holdingTimeMs: holdMs,
        });

        if (lot.remaining <= 1e-12) {
          acc.entryQueue.shift();
        }
      }
    }
  }

  return acc;
}

// ---------------------------------------------------------------------------
// PnL distribution
// ---------------------------------------------------------------------------

function computePnlDistribution(events: SingleTokenTradeEventRaw[]): TokenPnlDistribution {
  const dist: TokenPnlDistribution = { extremeProfit: 0, highProfit: 0, profit: 0, lowLoss: 0, highLoss: 0 };

  for (const e of events) {
    if (e.type !== "sell" || e.pnlPercent == null) continue;
    const pct = e.pnlPercent * 100;
    if (pct > 500) dist.extremeProfit += 1;
    else if (pct > 100) dist.highProfit += 1;
    else if (pct > 0) dist.profit += 1;
    else if (pct > -50) dist.lowLoss += 1;
    else dist.highLoss += 1;
  }

  return dist;
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

let cachedGenAiClient: GoogleGenAI | null = null;
let cachedGenAiClientKey: string | null = null;

function getGenAiClient(): GoogleGenAI {
  const key = env.GOOGLE_AI_KEY;
  if (!key) {
    throw new WalletTokenAnalysisServiceError("GOOGLE_AI_KEY is not configured on the server.", "model_error", 502);
  }
  if (!cachedGenAiClient || cachedGenAiClientKey !== key) {
    cachedGenAiClient = new GoogleGenAI({ apiKey: key });
    cachedGenAiClientKey = key;
  }
  return cachedGenAiClient;
}

async function callGeminiForToken(
  payload: Record<string, unknown>,
  language: "en" | "vn",
): Promise<{ analysis: string; riskNotes: string[] }> {
  const client = getGenAiClient();
  const year = new Date().getFullYear();
  const systemPrompt = (language === "vn" ? SYSTEM_PROMPT_TOKEN_VN : SYSTEM_PROMPT_TOKEN_EN).replace(/\{CURRENT_YEAR\}/g, String(year));

  let response;
  try {
    response = await trackGemini("gemini.svc.wallet_token_analysis", GEMINI_MODEL, () => client.models.generateContent({
      model: GEMINI_MODEL,
      contents: JSON.stringify(payload, null, 2),
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            riskNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["analysis", "riskNotes"],
        },
      },
    }));
  } catch (err) {
    throw new WalletTokenAnalysisServiceError(
      `Gemini call failed: ${err instanceof Error ? err.message : String(err)}`,
      "model_error",
      502,
    );
  }

  const rawText = response.text;
  if (!rawText) {
    throw new WalletTokenAnalysisServiceError("Gemini returned an empty response.", "invalid_model_response", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new WalletTokenAnalysisServiceError(
      `Gemini returned non-JSON output: ${err instanceof Error ? err.message : String(err)}`,
      "invalid_model_response",
      502,
    );
  }

  const validation = GEMINI_TOKEN_RESPONSE_SCHEMA.safeParse(parsed);
  if (!validation.success) {
    throw new WalletTokenAnalysisServiceError(
      `Gemini response failed schema validation: ${validation.error.message}`,
      "invalid_model_response",
      502,
    );
  }

  return validation.data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getTokenDeepAnalysis(
  address: string,
  tokenAddress: string,
  language: "en" | "vn" = "en",
  beforeGenerate?: () => Promise<void>,
): Promise<TokenDeepAnalysisResponse> {
  const normalizedAddress = address.trim();
  const normalizedToken = tokenAddress.trim();

  if (!normalizedAddress || !isValidSolanaAddress(normalizedAddress)) {
    throw new WalletTokenAnalysisServiceError("Invalid Solana wallet address", "invalid_address", 400);
  }
  if (!normalizedToken || !isValidSolanaAddress(normalizedToken)) {
    throw new WalletTokenAnalysisServiceError("Invalid token address", "invalid_token", 400);
  }

  const cached = readCached(normalizedAddress, normalizedToken, language);
  if (cached) {
    dataUsage.record("memory_result");
    return cached;
  }

  const swapsResult = await getWalletSwaps(normalizedAddress);
  const recent = (swapsResult.swaps ?? []).slice(0, SWAPS_SAMPLE_SIZE);

  if (recent.length < 2) {
    throw new WalletTokenAnalysisServiceError(
      "Not enough swap data to generate analysis (need at least 2 swaps).",
      "no_data",
      409,
    );
  }

  const acc = computeSingleTokenEvents(recent, normalizedToken);

  if (acc.buyCount === 0 && acc.sellCount === 0) {
    throw new WalletTokenAnalysisServiceError(
      "No trades found for this token in the wallet's recent swaps.",
      "no_data",
      409,
    );
  }

  const pnlDistribution = computePnlDistribution(acc.tradeEvents);
  const tradeCount = acc.buyCount + acc.sellCount;
  const winningPercentage = acc.exits > 0 ? Math.round((acc.wins / acc.exits) * 100 * 100) / 100 : 0;

  const realizedPnlUsd = Math.round(acc.realizedPnl * 100) / 100;

  const tokenInfo = findTokenInfo(recent, normalizedToken);

  const now = new Date();
  const geminiPayload = {
    timestampContext: {
      currentYear: now.getFullYear(),
      analysisDate: now.toISOString(),
    },
    token: {
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
    },
    walletContext: {
      overallTradeCount: recent.length,
      overallRealizedPnl: Math.round(recent.reduce((s, sw) => {
        if (!sw.bought || !sw.sold) return s;
        const boughtVal = sw.bought.valueUsd ?? 0;
        const soldVal = sw.sold.valueUsd ?? 0;
        return s + soldVal - boughtVal;
      }, 0) * 100) / 100,
    },
    tokenAnalysis: {
      tradeCount,
      realizedPnlUsd,
      winningPercentage,
      totalBoughtUsd: Math.round(acc.totalBoughtUsd * 100) / 100,
      totalSoldUsd: Math.round(acc.totalSoldUsd * 100) / 100,
      pnlDistribution,
      tradeTimeline: acc.tradeEvents.map((e) => ({
        timestampMs: e.timestampMs,
        type: e.type,
        price: Math.round(e.price * 100000000) / 100000000,
        amount: Math.round(e.amount * 100000000) / 100000000,
        valueUsd: Math.round(e.valueUsd * 100) / 100,
        pnlUsd: e.pnlUsd != null ? Math.round(e.pnlUsd * 100) / 100 : undefined,
        pnlPercent: e.pnlPercent != null ? Math.round(e.pnlPercent * 10000) / 100 : undefined,
        holdingTimeMs: e.holdingTimeMs,
      })),
    },
  };

  getGenAiClient();
  await beforeGenerate?.();

  const { analysis, riskNotes } = await callGeminiForToken(geminiPayload, language);

  const uniqueTimestamps = new Set<number>();
  const tradeTimeline: TokenTradeEvent[] = [];
  for (const e of acc.tradeEvents) {
    const key = Math.floor(e.timestampMs / 1000);
    if (uniqueTimestamps.has(key)) continue;
    uniqueTimestamps.add(key);
    tradeTimeline.push({
      timestampMs: e.timestampMs,
      type: e.type,
      price: Math.round(e.price * 100000000) / 100000000,
      amount: Math.round(e.amount * 100000000) / 100000000,
      valueUsd: Math.round(e.valueUsd * 100) / 100,
      pnlUsd: e.pnlUsd != null ? Math.round(e.pnlUsd * 100) / 100 : undefined,
      pnlPercent: e.pnlPercent != null ? Math.round(e.pnlPercent * 10000) / 100 : undefined,
      holdingTimeMs: e.holdingTimeMs,
    });
  }

  const result: TokenDeepAnalysisResponse = {
    address: normalizedAddress,
    tokenAddress: normalizedToken,
    symbol: tokenInfo.symbol,
    name: tokenInfo.name,
    logoUri: tokenInfo.logoUri,
    analysis,
    riskNotes,
    tradeCount,
    realizedPnlUsd,
    totalBoughtUsd: Math.round(acc.totalBoughtUsd * 100) / 100,
    totalSoldUsd: Math.round(acc.totalSoldUsd * 100) / 100,
    tradeTimeline,
    pnlDistribution,
    winningPercentage,
    model: GEMINI_MODEL,
    cached: false,
  };

  writeCached(normalizedAddress, normalizedToken, language, result);

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findTokenInfo(swaps: WalletSwap[], tokenAddress: string): { symbol: string | null; name: string | null; logoUri: string | null } {
  for (const swap of swaps) {
    if (swap.bought?.address === tokenAddress && swap.bought.symbol) {
      return { symbol: swap.bought.symbol, name: swap.bought.name ?? null, logoUri: swap.bought.logoUri ?? null };
    }
    if (swap.sold?.address === tokenAddress && swap.sold.symbol) {
      return { symbol: swap.sold.symbol, name: swap.sold.name ?? null, logoUri: swap.sold.logoUri ?? null };
    }
  }
  return { symbol: null, name: null, logoUri: null };
}
