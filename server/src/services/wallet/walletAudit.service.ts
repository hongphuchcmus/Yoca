/**
 * AI Wallet Forensic Audit service.
 *
 * Pulls a small window of recent Helius transactions for a wallet, asks
 * Gemini to classify the wallet's behavioural archetype, and caches the
 * structured result in `wallet_audit_cache` for 24 hours so we don't pay
 * the model cost on repeated views.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  WALLET_AUDIT_MODEL,
  WALLET_AUDIT_TTL_MS,
  WALLET_AUDIT_TX_SAMPLE_SIZE,
} from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { walletAuditCache } from "@sv/db/schema.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { trackGemini } from "@sv/services/tracking/gemini-metrics.js";

import type { WalletTransactionHelius } from "./dtos/walletDataObjects.js";
import { getWalletTransactionHelius } from "./walletHistory.service.js";
import env from "@sv/util/load-env.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export const WALLET_AUDIT_PERSONAS = [
  "Sniper",
  "Whale",
  "DCA",
  "LP",
  "Retail",
  "Unknown",
] as const;
export type WalletAuditPersona = (typeof WALLET_AUDIT_PERSONAS)[number];

export interface WalletAuditReport {
  address: string;
  persona: WalletAuditPersona;
  trustScore: number;
  summary: string;
  observations: string[];
  transactionCount: number;
  model: string;
  fetchedAt: string;
  cached: boolean;
}

export class WalletAuditServiceError extends Error {
  constructor(
    public readonly code:
      | "missing_api_key"
      | "no_transactions"
      | "model_error"
      | "invalid_model_response",
    message: string,
  ) {
    super(message);
    this.name = "WalletAuditServiceError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Blockchain Forensic Analyst. Audit the provided Solana transaction history.
STRICT RULES:
- DO NOT guess trading strategies or technical indicators.
- ONLY describe observable behavioral patterns.
- Archetypes to use: Sniper (fast launches), Whale (large volume), DCA (regular intervals), LP (liquidity provider), or Retail.
- Identify Red Flags: Wash trading, interacting with known scams, or fund source from mixers.
- Output MUST be a structured JSON with these keys: 'persona', 'trust_score' (0-100), 'summary', and 'observations' (array of strings).`;

const geminiResponseSchema = z.object({
  persona: z.string().trim().min(1),
  trust_score: z.coerce.number().min(0).max(100),
  summary: z.string().trim().min(1),
  observations: z.array(z.string().trim().min(1)).max(20),
});

let cachedClient: GoogleGenAI | null = null;
let cachedClientKey: string | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = env.GOOGLE_AI_KEY;
  if (!apiKey) {
    throw new WalletAuditServiceError(
      "missing_api_key",
      "GOOGLE_AI_KEY is not configured on the server.",
    );
  }
  if (!cachedClient || cachedClientKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedClientKey = apiKey;
  }
  return cachedClient;
}

function normalizePersona(raw: string): WalletAuditPersona {
  const upper = raw.trim().toLowerCase();
  if (upper.includes("snip")) return "Sniper";
  if (upper.includes("whale")) return "Whale";
  if (upper.includes("dca")) return "DCA";
  if (upper.includes("lp") || upper.includes("liquidity")) return "LP";
  if (upper.includes("retail")) return "Retail";
  return "Unknown";
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Compact transaction shape we feed to Gemini. Smaller is cheaper + faster. */
interface AuditTransactionInput {
  signature: string;
  timestamp: string;
  fee: number;
  feePayer: string;
  balanceChanges: Array<{
    mint: string;
    symbol: string | null;
    amount: number;
    valueUsd: number | null;
  }>;
}

function projectTransactionsForAudit(
  transactions: WalletTransactionHelius[],
): AuditTransactionInput[] {
  return transactions
    .slice(0, WALLET_AUDIT_TX_SAMPLE_SIZE)
    .map((tx) => ({
      signature: tx.signature,
      timestamp: tx.timestamp,
      fee: tx.fee,
      feePayer: tx.feePayer,
      balanceChanges: (tx.balanceChanges ?? []).slice(0, 6).map((change) => ({
        mint: change.mint,
        symbol: change.symbol ?? null,
        amount: Number(change.amount ?? 0),
        valueUsd:
          change.valueUsd != null && Number.isFinite(Number(change.valueUsd))
            ? Number(change.valueUsd)
            : null,
      })),
    }));
}

async function readCachedAudit(
  address: string,
): Promise<WalletAuditReport | null> {
  const threshold = new Date(Date.now() - WALLET_AUDIT_TTL_MS);
  const rows = await db
    .select()
    .from(walletAuditCache)
    .where(and(eq(walletAuditCache.address, address)))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  if (row.fetchedAt < threshold) {
    return null;
  }

  return {
    address: row.address,
    persona: normalizePersona(row.persona),
    trustScore: clampScore(row.trustScore),
    summary: row.summary,
    observations: Array.isArray(row.observations) ? row.observations : [],
    transactionCount: row.transactionCount,
    model: row.model,
    fetchedAt: row.fetchedAt.toISOString(),
    cached: true,
  };
}

async function writeCachedAudit(
  report: Omit<WalletAuditReport, "fetchedAt" | "cached">,
): Promise<Date> {
  const fetchedAt = new Date();
  await db
    .insert(walletAuditCache)
    .values({
      address: report.address,
      persona: report.persona,
      trustScore: report.trustScore,
      summary: report.summary,
      observations: report.observations,
      transactionCount: report.transactionCount,
      model: report.model,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: [walletAuditCache.address],
      set: {
        persona: report.persona,
        trustScore: report.trustScore,
        summary: report.summary,
        observations: report.observations,
        transactionCount: report.transactionCount,
        model: report.model,
        fetchedAt,
      },
    });

  return fetchedAt;
}

async function callGemini(
  address: string,
  transactions: AuditTransactionInput[],
): Promise<{
  persona: WalletAuditPersona;
  trustScore: number;
  summary: string;
  observations: string[];
}> {
  const client = getGeminiClient();

  const userPrompt = [
    `Wallet address: ${address}`,
    `Chain: Solana`,
    `Transaction sample size: ${transactions.length}`,
    "",
    "Transactions (most recent first):",
    JSON.stringify(transactions, null, 2),
  ].join("\n");

  let response;
  try {
    response = await trackGemini("gemini.svc.wallet_audit", WALLET_AUDIT_MODEL, () => client.models.generateContent({
      model: WALLET_AUDIT_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            persona: { type: Type.STRING },
            trust_score: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            observations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["persona", "trust_score", "summary", "observations"],
        },
      },
    }));
  } catch (err) {
    throw new WalletAuditServiceError(
      "model_error",
      `Gemini call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const rawText = response.text;
  if (!rawText) {
    throw new WalletAuditServiceError(
      "invalid_model_response",
      "Gemini returned an empty response.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new WalletAuditServiceError(
      "invalid_model_response",
      `Gemini returned non-JSON output: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const validation = geminiResponseSchema.safeParse(parsed);
  if (!validation.success) {
    throw new WalletAuditServiceError(
      "invalid_model_response",
      `Gemini response failed schema validation: ${validation.error.message}`,
    );
  }

  return {
    persona: normalizePersona(validation.data.persona),
    trustScore: clampScore(validation.data.trust_score),
    summary: validation.data.summary,
    observations: validation.data.observations,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get an AI-generated forensic audit for a wallet.
 *
 * Returns the cached report when one was generated in the last 24 hours.
 * Otherwise fetches recent Helius transactions, asks Gemini to classify
 * the wallet, and persists the result.
 *
 * Pass `force: true` to bypass the cache.
 */
export async function getWalletAudit(
  address: string,
  options?: { force?: boolean },
): Promise<WalletAuditReport> {
  if (options?.force) {
    dataUsage.record("forced_refresh");
  }

  if (!options?.force) {
    const cached = await readCachedAudit(address);
    if (cached) {
      dataUsage.record("db_result");
      return cached;
    }
  }

  const history = await getWalletTransactionHelius(address, {
    limit: WALLET_AUDIT_TX_SAMPLE_SIZE,
  });

  const recent = [...history.transactions].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );

  if (recent.length === 0) {
    throw new WalletAuditServiceError(
      "no_transactions",
      "No transactions are available for this wallet to audit.",
    );
  }

  const projected = projectTransactionsForAudit(recent);
  const aiResult = await callGemini(address, projected);

  const fetchedAt = await writeCachedAudit({
    address,
    persona: aiResult.persona,
    trustScore: aiResult.trustScore,
    summary: aiResult.summary,
    observations: aiResult.observations,
    transactionCount: projected.length,
    model: WALLET_AUDIT_MODEL,
  });

  return {
    address,
    persona: aiResult.persona,
    trustScore: aiResult.trustScore,
    summary: aiResult.summary,
    observations: aiResult.observations,
    transactionCount: projected.length,
    model: WALLET_AUDIT_MODEL,
    fetchedAt: fetchedAt.toISOString(),
    cached: false,
  };
}
