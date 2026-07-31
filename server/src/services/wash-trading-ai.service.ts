import { GOOGLE_AI_KEY, WALLET_AUDIT_MODEL, WASH_TRADING_VERDICT_TTL_MS } from "@sv/config/constants.js";
import { GoogleGenAI } from "@google/genai";
import { and, eq } from "drizzle-orm";
import { db } from "@sv/db/index.js";
import { washTradingVerdictCache, type WashTradingVerdictPersisted } from "@sv/db/schema.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { pFetch, type ServiceOperationId } from "@sv/util/rate-limit.js";
import * as helius from "@sv/util/util-helius.js";
import { trackGemini } from "@sv/services/tracking/gemini-metrics.js";

export type Timeframe = "1h" | "24h" | "7d" | "30d";
export type GnnAlgorithm = "GCN" | "GAT" | "GraphSAGE";
export type WashTradingLanguage = "en" | "vi";
export type WashTradingDataSource =
  | "helius-rpc-token-accounts"
  | "helius-enhanced-api"
  | "demo-fallback";

export interface RawTransaction {
  signature?: string;
  feePayer?: string;
  timestamp?: number;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number;
    mint?: string;
  }>;
}

export interface NormalizedTx {
  signature: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  mint: string;
}

export interface CircularPattern {
  cycle: string[];
  hops: number;
  amounts: number[];
  timestamps: number[];
  intervalMs: number;
  confidence: number;
}

export interface GNNScore {
  wallet: string;
  score: number;
  features: {
    circularPattern: number;
    timeRegularity: number;
    amountSimilarity: number;
    selfLoopDegree: number;
    hubness: number;
    volumeSignal: number;
  };
  riskLevel: "High" | "Medium" | "Low";
  pattern: string;
  txCount: number;
  volume: number;
}

export interface WashTradingAIResult {
  mint: string;
  symbol: string;
  timeframe: Timeframe;
  analyzedAt: string;
  dataSource: WashTradingDataSource;
  dataSourceReason: string;
  algorithm: GnnAlgorithm;
  summary: {
    totalTransactions: number;
    uniqueWallets: number;
    totalVolume: number;
    washVolumeEstimate: number;
    washVolumePercent: number;
    circularTradeCount: number;
    suspiciousWalletCount: number;
    overallRiskScore: number;
    gnnConfidence: number;
  };
  circularPatterns: CircularPattern[];
  suspiciousWallets: GNNScore[];
  graphData: {
    nodes: Array<{ id: string; type: "wash" | "bridge" | "normal"; label: string; score?: number }>;
    edges: Array<{ from: string; to: string; amount: number; suspicious: boolean }>;
  };
  aiAnalysis: {
    verdict: "HIGH_RISK" | "MEDIUM_RISK" | "LOW_RISK" | "CLEAN";
    summary: string;
    detailedFindings: string[];
    suspiciousPatterns: Array<{
      patternName: string;
      description: string;
      affectedWallets: string[];
      severity: "HIGH" | "MEDIUM" | "LOW";
    }>;
    recommendation: string;
    confidenceNote: string;
  };
  detectionLog: Array<{
    time: string;
    message: string;
    severity: "high" | "medium" | "info" | "success";
  }>;
}

interface RpcTokenAccount {
  address: string;
  amount?: string;
  decimals?: number;
  uiAmount?: number | null;
  uiAmountString?: string;
}

interface RpcTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: {
    uiAmount?: number | null;
    uiAmountString?: string;
    decimals?: number;
  };
}

interface RpcParsedTransaction {
  slot?: number;
  blockTime?: number | null;
  transaction?: {
    signatures?: string[];
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean; writable?: boolean }>;
    };
  };
  meta?: {
    err?: unknown;
    preTokenBalances?: RpcTokenBalance[];
    postTokenBalances?: RpcTokenBalance[];
  };
}

const HELIUS_ENHANCED_BASE = "https://api.helius.xyz";
const HELIUS_RPC_BASE = "https://mainnet.helius-rpc.com";

const CACHE_TTL_MS = 5 * 60 * 1000;
const RPC_MIN_REQUIRED_TRANSFERS = 8;
const API_LIMIT_BY_TIMEFRAME: Record<Timeframe, number> = {
  "1h": 50,
  "24h": 80,
  "7d": 120,
  "30d": 160,
};

const transferCache = new Map<string, {
  createdAt: number;
  txs: NormalizedTx[];
  source: WashTradingDataSource;
  reason: string;
}>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimitLike(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("429") || text.includes("rate limited") || text.includes("too many requests") || text.includes("overloaded");
}

function getSafeApiLimit(limit: number, timeframe: Timeframe): number {
  return Math.min(Math.max(limit || 50, 20), API_LIMIT_BY_TIMEFRAME[timeframe]);
}

function getTransferCacheKey(mint: string, timeframe: Timeframe): string {
  return `${mint}:${timeframe}`;
}

function getHeliusApiKey(): string | null {
  const raw = process.env.HELIUS_API_KEY?.trim();
  if (!raw) return null;
  return raw.split(",").map((key) => key.trim()).find(Boolean) ?? null;
}

export function getWashTradingRuntimeStatus() {
  return {
    hasHeliusApiKey: Boolean(getHeliusApiKey()),
    hasGoogleAiKey: Boolean(GOOGLE_AI_KEY?.trim()),
    heliusMode: "RPC token accounts + Enhanced Transactions fallback",
    geminiModel: WALLET_AUDIT_MODEL || "gemini-3.1-flash-lite",
  };
}

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRandom(seedInput: string): () => number {
  let seed = hashSeed(seedInput) || 1;
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return (seed >>> 0) / 4294967296;
  };
}

function fakeWallet(prefix: string, index: number, seed: string): string {
  const base = `${prefix}${index}${seed}`.replace(/[^a-zA-Z0-9]/g, "");
  return `${base.slice(0, 8).padEnd(8, "X")}${hashSeed(base).toString(36).padEnd(24, "0")}`.slice(0, 32);
}

function timeframeToSeconds(timeframe: Timeframe): number {
  if (timeframe === "1h") return 60 * 60;
  if (timeframe === "7d") return 7 * 24 * 60 * 60;
  if (timeframe === "30d") return 30 * 24 * 60 * 60;
  return 24 * 60 * 60;
}

function filterByTimeframe(txs: NormalizedTx[], timeframe: Timeframe): NormalizedTx[] {
  const now = Math.floor(Date.now() / 1000);
  const minTs = now - timeframeToSeconds(timeframe);
  const filtered = txs.filter((tx) => tx.timestamp >= minTs);
  // Nếu timeframe quá ngắn và Helius chỉ trả giao dịch cũ, vẫn giữ dữ liệu thật thay vì rơi về demo.
  return filtered.length >= 8 ? filtered : txs;
}

async function fetchHeliusJson<T>(
  trackingId: ServiceOperationId<"helius">,
  url: URL,
  init: RequestInit = {},
  timeoutMs = 35_000,
): Promise<T> {
  const response = await pFetch(helius.spec, trackingId, url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    rlRetries: 2,
    rlTimeoutMs: timeoutMs,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`);
  }

  return JSON.parse(await response.text());
}

type HeliusRpcResponse<T> =
  | { result: T; error?: never }
  | { result?: never; error: { message?: string; code?: number } };

async function heliusRpc<T>(
  trackingId: ServiceOperationId<"helius">,
  method: string,
  params: unknown[],
): Promise<T> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) throw new Error("HELIUS_API_KEY is not set");

  const url = new URL(HELIUS_RPC_BASE);
  url.searchParams.set("api-key", apiKey);
  const payload = await fetchHeliusJson<HeliusRpcResponse<T>>(
    trackingId,
    url,
    {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `wash-${Date.now()}`,
        method,
        params,
      }),
    },
    45_000,
  );

  if (payload.error) {
    throw new Error(`Helius RPC ${method} failed: ${payload.error.message ?? payload.error.code}`);
  }

  return payload.result;
}

async function heliusEnhancedAddressTransactions(address: string, limit: number): Promise<RawTransaction[]> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) throw new Error("HELIUS_API_KEY is not set");

  const url = new URL(`${HELIUS_ENHANCED_BASE}/v0/addresses/${address}/transactions`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));

  return fetchHeliusJson<RawTransaction[]>(
    "helius.svc.wash_trading_enhanced_transactions",
    url,
    { method: "GET" },
    35_000,
  );
}

function getUiAmount(balance?: RpcTokenBalance): number {
  if (!balance?.uiTokenAmount) return 0;
  const raw = balance.uiTokenAmount.uiAmountString;
  if (raw != null && raw.length > 0) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const ui = balance.uiTokenAmount.uiAmount;
  return typeof ui === "number" && Number.isFinite(ui) ? ui : 0;
}

function parseRpcTransactionToTokenTransfer(tx: RpcParsedTransaction | null, mint: string): NormalizedTx | null {
  if (!tx || tx.meta?.err) return null;
  const signature = tx.transaction?.signatures?.[0];
  if (!signature) return null;

  const preBalances = (tx.meta?.preTokenBalances ?? []).filter((b) => b.mint === mint && b.owner);
  const postBalances = (tx.meta?.postTokenBalances ?? []).filter((b) => b.mint === mint && b.owner);

  if (preBalances.length === 0 && postBalances.length === 0) return null;

  const byOwner = new Map<string, number>();
  for (const pre of preBalances) {
    byOwner.set(pre.owner!, (byOwner.get(pre.owner!) ?? 0) - getUiAmount(pre));
  }
  for (const post of postBalances) {
    byOwner.set(post.owner!, (byOwner.get(post.owner!) ?? 0) + getUiAmount(post));
  }

  const deltas = [...byOwner.entries()].filter(([, delta]) => Math.abs(delta) > 0);
  const negative = deltas.filter(([, delta]) => delta < 0).sort((a, b) => a[1] - b[1])[0];
  const positive = deltas.filter(([, delta]) => delta > 0).sort((a, b) => b[1] - a[1])[0];

  if (!negative || !positive) return null;
  const amount = Math.min(Math.abs(negative[1]), positive[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    signature,
    from: negative[0],
    to: positive[0],
    amount,
    timestamp: Number(tx.blockTime ?? Math.floor(Date.now() / 1000)),
    mint,
  };
}

async function fetchHeliusRpcTokenAccountTransactions(
  mint: string,
  limit: number,
  timeframe: Timeframe,
): Promise<NormalizedTx[]> {
  const safeLimit = getSafeApiLimit(limit, timeframe);

  const largestAccounts = await heliusRpc<{ value?: RpcTokenAccount[] }>(
    "helius.svc.wash_trading_get_token_largest_accounts",
    "getTokenLargestAccounts",
    [mint],
  );

  const tokenAccounts = (largestAccounts.value ?? [])
    .map((account) => account.address)
    .filter(Boolean)
    .slice(0, 5);

  if (tokenAccounts.length === 0) return [];

  const perAccountLimit = Math.min(18, Math.max(6, Math.ceil(safeLimit / tokenAccounts.length)));
  const signatureSet = new Set<string>();

  for (const tokenAccount of tokenAccounts) {
    try {
      await sleep(320);
      const signatures = await heliusRpc<Array<{ signature: string; blockTime?: number | null }>>(
        "helius.svc.wash_trading_get_signatures_for_address",
        "getSignaturesForAddress",
        [tokenAccount, { limit: perAccountLimit }],
      );

      for (const item of signatures ?? []) {
        if (item.signature) signatureSet.add(item.signature);
      }
    } catch (error) {
      console.warn("[WashTradingAI] getSignaturesForAddress skipped:", tokenAccount, error instanceof Error ? error.message : error);
    }
  }

  const signatures = [...signatureSet].slice(0, Math.min(safeLimit, 70));
  const parsed: NormalizedTx[] = [];
  let consecutiveRateLimitFailures = 0;

  for (const signature of signatures) {
    try {
      await sleep(230);
      const tx = await heliusRpc<RpcParsedTransaction | null>(
        "helius.svc.wash_trading_get_transaction",
        "getTransaction",
        [
          signature,
          {
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          },
        ],
      );

      const normalized = parseRpcTransactionToTokenTransfer(tx, mint);
      if (normalized) parsed.push(normalized);
      consecutiveRateLimitFailures = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[WashTradingAI] getTransaction skipped:", signature, message);
      if (isRateLimitLike(message)) {
        consecutiveRateLimitFailures += 1;
        await sleep(1_200 + consecutiveRateLimitFailures * 350);
      }

      // Khi đã có đủ dữ liệu cho demo/analysis nhưng RPC đang rate limit liên tục,
      // dừng sớm để không đốt quota và không làm backend chậm.
      if (consecutiveRateLimitFailures >= 4 && parsed.length >= RPC_MIN_REQUIRED_TRANSFERS) {
        console.warn("[WashTradingAI] Stopping RPC getTransaction early because Helius is rate limiting repeatedly.");
        break;
      }
    }
  }

  const unique = new Map<string, NormalizedTx>();
  for (const tx of parsed) unique.set(tx.signature, tx);

  return filterByTimeframe([...unique.values()].sort((a, b) => a.timestamp - b.timestamp), timeframe).slice(0, safeLimit);
}

async function fetchHeliusEnhancedMintTransactions(mint: string, limit: number, timeframe: Timeframe): Promise<NormalizedTx[]> {
  const raw = await heliusEnhancedAddressTransactions(
    mint,
    Math.min(getSafeApiLimit(limit, timeframe), 100),
  );
  const normalized: NormalizedTx[] = [];

  for (const tx of Array.isArray(raw) ? raw : []) {
    for (const transfer of tx.tokenTransfers ?? []) {
      const amount = Number(transfer.tokenAmount ?? 0);
      if (
        transfer.mint === mint &&
        transfer.fromUserAccount &&
        transfer.toUserAccount &&
        amount > 0
      ) {
        normalized.push({
          signature: tx.signature ?? `unknown_${normalized.length}`,
          from: transfer.fromUserAccount,
          to: transfer.toUserAccount,
          amount,
          timestamp: Number(tx.timestamp ?? Math.floor(Date.now() / 1000)),
          mint,
        });
      }
    }
  }

  return filterByTimeframe(normalized.sort((a, b) => a.timestamp - b.timestamp), timeframe).slice(0, limit);
}

function createDemoTransactions(mint: string, symbol: string, limit: number, timeframe: Timeframe): NormalizedTx[] {
  const rand = createRandom(`${mint}:${symbol}`);
  const now = Math.floor(Date.now() / 1000);
  const txs: NormalizedTx[] = [];
  const spanSeconds = timeframeToSeconds(timeframe);

  const washA = [0, 1, 2, 3].map((i) => fakeWallet("washA", i, mint));
  const washB = [0, 1, 2].map((i) => fakeWallet("washB", i, mint));
  const normal = Array.from({ length: 18 }, (_, i) => fakeWallet("normal", i, mint));

  let sigCounter = 0;
  const pushTx = (from: string, to: string, amount: number, timestamp: number) => {
    txs.push({
      signature: `demo_${hashSeed(`${mint}_${sigCounter}_${from}_${to}`).toString(36)}`,
      from,
      to,
      amount,
      timestamp,
      mint,
    });
    sigCounter++;
  };

  for (let round = 0; round < 10; round++) {
    const start = now - Math.min(spanSeconds, 3600) + round * 210;
    const baseAmount = 38_000 + Math.round(rand() * 1500);
    for (let i = 0; i < washA.length; i++) {
      pushTx(
        washA[i],
        washA[(i + 1) % washA.length],
        baseAmount + Math.round((rand() - 0.5) * 600),
        start + i * 9,
      );
    }
  }

  for (let round = 0; round < 6; round++) {
    const start = now - Math.min(spanSeconds, 7200) + round * 330;
    const baseAmount = 14_000 + Math.round(rand() * 1200);
    for (let i = 0; i < washB.length; i++) {
      pushTx(
        washB[i],
        washB[(i + 1) % washB.length],
        baseAmount + Math.round((rand() - 0.5) * 380),
        start + i * 15,
      );
    }
  }

  for (let i = 0; i < Math.max(35, limit - txs.length); i++) {
    const from = rand() > 0.18 ? normal[Math.floor(rand() * normal.length)] : washA[Math.floor(rand() * washA.length)];
    const to = normal[Math.floor(rand() * normal.length)];
    const amount = 200 + Math.round(rand() * 6_500);
    const timestamp = now - Math.round(rand() * Math.max(3600, Math.min(spanSeconds, 30 * 24 * 3600)));
    pushTx(from, to, amount, timestamp);
  }

  return txs.sort((a, b) => a.timestamp - b.timestamp).slice(0, limit);
}

async function fetchTokenTransactions(
  mint: string,
  symbol: string,
  limit: number,
  timeframe: Timeframe,
): Promise<{ txs: NormalizedTx[]; source: WashTradingDataSource; reason: string; servedFromCache: boolean }> {
  const apiKey = getHeliusApiKey();
  const safeLimit = getSafeApiLimit(limit, timeframe);
  const cacheKey = getTransferCacheKey(mint, timeframe);
  const cached = transferCache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    dataUsage.record("memory_result");
    return {
      txs: cached.txs.slice(0, safeLimit),
      source: cached.source,
      // Do not append a hard-coded English sentence here.
      // The cache notice is appended later by localizeDataSourceReason(...),
      // so English/Vietnamese mode always displays the right language.
      reason: cached.reason,
      servedFromCache: true,
    };
  }

  const saveCache = (txs: NormalizedTx[], source: WashTradingDataSource, reason: string) => {
    transferCache.set(cacheKey, {
      createdAt: Date.now(),
      txs,
      source,
      reason,
    });
  };

  if (!apiKey) {
    const txs = createDemoTransactions(mint, symbol, safeLimit, timeframe);
    const reason = "HELIUS_API_KEY chưa được load trong backend process.";
    saveCache(txs, "demo-fallback", reason);
    return { txs, source: "demo-fallback", reason, servedFromCache: false };
  }

  // Ưu tiên Enhanced API trước vì chỉ cần ít request hơn, ổn định hơn cho demo.
  // RPC token-account strategy chỉ chạy khi Enhanced API không lấy đủ token transfer.
  try {
    const enhancedTxs = await fetchHeliusEnhancedMintTransactions(mint, safeLimit, timeframe);
    if (enhancedTxs.length >= RPC_MIN_REQUIRED_TRANSFERS) {
      const reason = `Lấy ${enhancedTxs.length} giao dịch từ Helius Enhanced Transactions API cho address/mint.`;
      saveCache(enhancedTxs, "helius-enhanced-api", reason);
      return {
        txs: enhancedTxs,
        source: "helius-enhanced-api",
        reason,
        servedFromCache: false,
      };
    }
  } catch (error) {
    console.warn("[WashTradingAI] Helius Enhanced strategy failed:", error instanceof Error ? error.message : error);
  }

  try {
    const rpcTxs = await fetchHeliusRpcTokenAccountTransactions(mint, safeLimit, timeframe);
    if (rpcTxs.length >= RPC_MIN_REQUIRED_TRANSFERS) {
      const reason = `Lấy ${rpcTxs.length} giao dịch thật từ Helius RPC bằng token accounts với throttling/retry/backoff.`;
      saveCache(rpcTxs, "helius-rpc-token-accounts", reason);
      return {
        txs: rpcTxs,
        source: "helius-rpc-token-accounts",
        reason,
        servedFromCache: false,
      };
    }
  } catch (error) {
    console.warn("[WashTradingAI] Helius RPC token account strategy failed:", error instanceof Error ? error.message : error);
  }

  const txs = createDemoTransactions(mint, symbol, safeLimit, timeframe);
  const reason =
    "Helius API key có tồn tại nhưng không lấy đủ token transfers cho mint này. Có thể token ít giao dịch gần đây, mint address không xuất hiện trong swap, hoặc key bị giới hạn/rate limit.";
  saveCache(txs, "demo-fallback", reason);
  return {
    txs,
    source: "demo-fallback",
    reason,
    servedFromCache: false,
  };
}

function detectCircularPatterns(txs: NormalizedTx[]): CircularPattern[] {
  const patterns: CircularPattern[] = [];
  const byFrom = new Map<string, NormalizedTx[]>();

  for (const tx of txs) {
    const list = byFrom.get(tx.from) ?? [];
    list.push(tx);
    byFrom.set(tx.from, list);
  }

  const TIME_WINDOW_SECONDS = 2 * 60 * 60;
  const AMOUNT_TOLERANCE = 0.12;

  const dfs = (
    start: string,
    current: string,
    path: string[],
    amounts: number[],
    timestamps: number[],
    startAmount: number,
    startTime: number,
    visited: Set<string>,
  ) => {
    if (path.length > 6) return;

    const outgoing = byFrom.get(current) ?? [];
    for (const tx of outgoing) {
      if (tx.timestamp < startTime) continue;
      if (tx.timestamp - startTime > TIME_WINDOW_SECONDS) continue;
      const diff = Math.abs(tx.amount - startAmount) / Math.max(startAmount, 1);
      if (diff > AMOUNT_TOLERANCE) continue;

      if (tx.to === start && path.length >= 3) {
        const hopCount = path.length;
        const allTimestamps = [...timestamps, tx.timestamp];
        const intervalMs = ((allTimestamps[allTimestamps.length - 1] - allTimestamps[0]) / Math.max(hopCount, 1)) * 1000;
        const confidence = Math.min(0.98, Math.max(0.45, 1 - diff * 3.2 - Math.max(0, intervalMs - 90_000) / 900_000));
        patterns.push({
          cycle: [...path, start],
          hops: hopCount,
          amounts: [...amounts, tx.amount],
          timestamps: allTimestamps,
          intervalMs,
          confidence,
        });
        continue;
      }

      if (!visited.has(tx.to)) {
        visited.add(tx.to);
        dfs(start, tx.to, [...path, tx.to], [...amounts, tx.amount], [...timestamps, tx.timestamp], startAmount, tx.timestamp, visited);
        visited.delete(tx.to);
      }
    }
  };

  const topWallets = [...byFrom.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 80);

  for (const [wallet, outgoing] of topWallets) {
    for (const tx of outgoing.slice(0, 14)) {
      const visited = new Set<string>([wallet, tx.to]);
      dfs(wallet, tx.to, [wallet, tx.to], [tx.amount], [tx.timestamp], tx.amount, tx.timestamp, visited);
    }
  }

  const seen = new Set<string>();
  return patterns
    .sort((a, b) => b.confidence - a.confidence)
    .filter((p) => {
      const key = p.cycle.slice(0, -1).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function computeGNNScores(txs: NormalizedTx[], circularPatterns: CircularPattern[], algorithm: GnnAlgorithm): GNNScore[] {
  const wallets = new Map<string, {
    inDegree: number;
    outDegree: number;
    txCount: number;
    volume: number;
    timestamps: number[];
    amounts: number[];
    selfLoop: boolean;
    circular: boolean;
  }>();

  const ensure = (wallet: string) => {
    const existing = wallets.get(wallet);
    if (existing) return existing;
    const created = { inDegree: 0, outDegree: 0, txCount: 0, volume: 0, timestamps: [], amounts: [], selfLoop: false, circular: false };
    wallets.set(wallet, created);
    return created;
  };

  for (const tx of txs) {
    const from = ensure(tx.from);
    const to = ensure(tx.to);
    from.outDegree++;
    from.txCount++;
    from.volume += tx.amount;
    from.timestamps.push(tx.timestamp);
    from.amounts.push(tx.amount);
    to.inDegree++;
    to.txCount++;
    to.volume += tx.amount;
    to.timestamps.push(tx.timestamp);
    to.amounts.push(tx.amount);
    if (tx.from === tx.to) from.selfLoop = true;
  }

  const circularWallets = new Set(circularPatterns.flatMap((p) => p.cycle));
  for (const wallet of circularWallets) ensure(wallet).circular = true;

  const maxDegree = Math.max(1, ...[...wallets.values()].map((w) => w.inDegree + w.outDegree));
  const maxVolume = Math.max(1, ...[...wallets.values()].map((w) => w.volume));
  const scores: GNNScore[] = [];

  for (const [wallet, f] of wallets) {
    if (f.txCount < 2 && !f.circular) continue;

    const sortedTimes = [...f.timestamps].sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < sortedTimes.length; i++) intervals.push((sortedTimes[i] - sortedTimes[i - 1]) * 1000);
    const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 900_000;

    const mean = f.amounts.length ? f.amounts.reduce((a, b) => a + b, 0) / f.amounts.length : 0;
    const variance = f.amounts.length ? f.amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / f.amounts.length : 0;
    const coeffVar = mean > 0 ? Math.sqrt(variance) / mean : 1;

    const circularScore = f.circular ? 0.94 : 0;
    const timeRegularity = intervals.length >= 3 ? Math.max(0, Math.min(1, 1 - avgInterval / 900_000)) : 0;
    const amountSimilarity = f.amounts.length >= 3 ? Math.max(0, Math.min(1, 1 - coeffVar)) : 0;
    const selfLoopDegree = f.selfLoop ? 0.85 : 0;
    const hubness = Math.min(1, (f.inDegree + f.outDegree) / Math.max(1, maxDegree));
    const volumeSignal = Math.min(1, f.volume / maxVolume);

    const weights = algorithm === "GAT"
      ? { circular: 0.36, time: 0.17, amount: 0.27, selfLoop: 0.05, hubness: 0.10, volume: 0.05 }
      : algorithm === "GraphSAGE"
      ? { circular: 0.24, time: 0.18, amount: 0.17, selfLoop: 0.06, hubness: 0.25, volume: 0.10 }
      : { circular: 0.32, time: 0.21, amount: 0.21, selfLoop: 0.06, hubness: 0.14, volume: 0.06 };

    const score = Math.min(0.97,
      circularScore * weights.circular +
      timeRegularity * weights.time +
      amountSimilarity * weights.amount +
      selfLoopDegree * weights.selfLoop +
      hubness * weights.hubness +
      volumeSignal * weights.volume,
    );

    if (score < 0.22 && !f.circular) continue;

    const riskLevel: GNNScore["riskLevel"] = score >= 0.72 ? "High" : score >= 0.45 ? "Medium" : "Low";
    const pattern = f.circular ? "Circular Trade" : hubness > 0.7 ? "Hub Wallet" : timeRegularity > 0.65 ? "Bot-like Timing" : amountSimilarity > 0.75 ? "Amount Mirror" : "Anomalous Activity";

    scores.push({
      wallet,
      score,
      riskLevel,
      pattern,
      txCount: f.txCount,
      volume: f.volume,
      features: { circularPattern: circularScore, timeRegularity, amountSimilarity, selfLoopDegree, hubness, volumeSignal },
    });
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, 25);
}

const CACHE_REASON_EN = "served from 5-minute backend cache to avoid Helius rate limit";
const CACHE_REASON_VI = "lấy từ cache backend 5 phút để tránh giới hạn tần suất Helius";

function splitCacheReason(reason: string): { baseReason: string; servedFromCache: boolean } {
  const cachePatterns = [
    /\s*·\s*served from 5-minute backend cache to avoid Helius rate limit\.?/i,
    /\s*·\s*lấy từ cache backend 5 phút để tránh giới hạn tần suất Helius\.?/i,
  ];

  let baseReason = reason;
  let servedFromCache = false;

  for (const pattern of cachePatterns) {
    if (pattern.test(baseReason)) {
      servedFromCache = true;
      baseReason = baseReason.replace(pattern, "").trim();
    }
  }

  return { baseReason, servedFromCache };
}

function localizeDataSourceReason(reason: string, language: WashTradingLanguage, cacheHit = false): string {
  const { baseReason, servedFromCache: parsedCacheHit } = splitCacheReason(reason);
  const servedFromCache = cacheHit || parsedCacheHit;
  let localizedReason = baseReason;

  if (language === "en") {
    if (baseReason.includes("HELIUS_API_KEY")) {
      localizedReason = "HELIUS_API_KEY is not loaded in the backend process.";
    } else if (baseReason.includes("Enhanced Transactions API")) {
      const count = baseReason.match(/\d+/)?.[0] ?? "the requested";
      localizedReason = `Fetched ${count} transaction(s) from Helius Enhanced Transactions API for this address/mint.`;
    } else if (baseReason.includes("Helius RPC")) {
      const count = baseReason.match(/\d+/)?.[0] ?? "the requested";
      localizedReason = `Fetched ${count} real transaction(s) from Helius RPC using token accounts with throttling/retry/backoff.`;
    } else if (baseReason.includes("không lấy đủ token transfers")) {
      localizedReason = "A Helius API key exists, but there were not enough token transfers for this mint. The token may have low recent activity, the mint may not appear in swaps, or the key may be rate-limited.";
    }
  }

  if (servedFromCache) {
    localizedReason += ` · ${language === "vi" ? CACHE_REASON_VI : CACHE_REASON_EN}.`;
  }

  return localizedReason;
}

function buildGraphData(txs: NormalizedTx[], suspiciousWallets: GNNScore[]): WashTradingAIResult["graphData"] {
  const suspiciousSet = new Set(suspiciousWallets.slice(0, 14).map((w) => w.wallet));
  const highRiskSet = new Set(suspiciousWallets.filter((w) => w.riskLevel === "High").map((w) => w.wallet));
  const scoreMap = new Map(suspiciousWallets.map((w) => [w.wallet, w.score]));

  const relevant = txs
    .filter((tx) => suspiciousSet.has(tx.from) || suspiciousSet.has(tx.to))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 70);

  const walletSet = new Set<string>();
  for (const tx of relevant) {
    walletSet.add(tx.from);
    walletSet.add(tx.to);
  }

  // Nếu không có ví suspicious, vẫn hiển thị graph thật theo top transfer để tránh cảm giác code cứng.
  if (walletSet.size === 0) {
    for (const tx of [...txs].sort((a, b) => b.amount - a.amount).slice(0, 30)) {
      walletSet.add(tx.from);
      walletSet.add(tx.to);
    }
  }

  const nodes = [...walletSet].slice(0, 35).map((id) => ({
    id,
    label: shortAddress(id),
    type: highRiskSet.has(id) ? "wash" as const : suspiciousSet.has(id) ? "bridge" as const : "normal" as const,
    score: scoreMap.get(id),
  }));

  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges = (relevant.length > 0 ? relevant : txs)
    .filter((tx) => nodeSet.has(tx.from) && nodeSet.has(tx.to))
    .slice(0, 70)
    .map((tx) => ({
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      suspicious: suspiciousSet.has(tx.from) && suspiciousSet.has(tx.to),
    }));

  return { nodes, edges };
}

function buildLocalAIAnalysis(
  symbol: string,
  circularPatterns: CircularPattern[],
  suspiciousWallets: GNNScore[],
  riskScore: number,
  dataSource: WashTradingDataSource,
  dataSourceReason: string,
  algorithm: GnnAlgorithm,
  language: WashTradingLanguage,
): WashTradingAIResult["aiAnalysis"] {
  const verdict: WashTradingAIResult["aiAnalysis"]["verdict"] = riskScore >= 75 ? "HIGH_RISK" : riskScore >= 45 ? "MEDIUM_RISK" : riskScore >= 20 ? "LOW_RISK" : "CLEAN";
  const highRisk = suspiciousWallets.filter((w) => w.riskLevel === "High");
  const isVi = language === "vi";

  if (!isVi) {
    return {
      verdict,
      summary: `Token ${symbol} has a risk score of ${riskScore}/100. The system analyzed the transaction graph using the ${algorithm} configuration and detected ${circularPatterns.length} circular cluster(s) and ${suspiciousWallets.length} wallet(s) with abnormal signals.`,
      detailedFindings: [
        circularPatterns.length > 0
          ? `Circular trading: detected ${circularPatterns.length} 3-6 hop trading loop(s) with similar amounts and close timing.`
          : "Circular trading: no sufficiently strong closed-loop trading cycle was detected in the current dataset.",
        highRisk.length > 0
          ? `GNN score: ${highRisk.length} wallet(s) reached High risk, led by ${shortAddress(highRisk[0].wallet)} with score ${(highRisk[0].score * 100).toFixed(0)}/100.`
          : "GNN score: no wallet crossed the High risk threshold; the result is closer to monitoring than a strong alert.",
        `Algorithm: ${algorithm}. GCN prioritizes circular flow, GAT prioritizes amount similarity/attention, and GraphSAGE prioritizes hubness and neighborhood aggregation.`,
        dataSource === "demo-fallback"
          ? `Data source: demo fallback. Reason: ${dataSourceReason}`
          : `Data source: real data from ${dataSource}. ${dataSourceReason}`,
      ],
      suspiciousPatterns: suspiciousWallets.slice(0, 6).map((w) => ({
        patternName: w.pattern,
        description: `Wallet ${shortAddress(w.wallet)} has ${w.txCount} transaction(s), volume ${Math.round(w.volume).toLocaleString("en-US")} token(s), and GNN score ${(w.score * 100).toFixed(0)}/100.`,
        affectedWallets: [w.wallet],
        severity: w.riskLevel.toUpperCase() as "HIGH" | "MEDIUM" | "LOW",
      })),
      recommendation: verdict === "HIGH_RISK"
        ? "Warn users, review pool/liquidity data, and do not rely solely on this token's 24h volume."
        : verdict === "MEDIUM_RISK"
        ? "Continue monitoring because there are some artificial-volume signals, but they are not strong enough for a confident conclusion."
        : "No severe wash trading signal was found in the current data; combine this with holder distribution, pool liquidity, and top trader behavior.",
      confidenceNote: `This is a ${algorithm} GNN-inspired model using graph features: circularity, time regularity, amount similarity, self-loop, and hubness. The output is an alert signal, not a legal conclusion.`,
    };
  }

  return {
    verdict,
    summary: `Token ${symbol} có risk score ${riskScore}/100. Hệ thống phân tích graph giao dịch bằng cấu hình ${algorithm}, phát hiện ${circularPatterns.length} circular cluster và ${suspiciousWallets.length} ví có tín hiệu bất thường.`,
    detailedFindings: [
      circularPatterns.length > 0
        ? `Circular trading: phát hiện ${circularPatterns.length} vòng giao dịch 3-6 hop với amount tương đồng và khoảng thời gian gần nhau.`
        : "Circular trading: chưa phát hiện vòng giao dịch khép kín đủ mạnh trong tập dữ liệu hiện tại.",
      highRisk.length > 0
        ? `GNN score: ${highRisk.length} ví đạt mức High risk, nổi bật là ${shortAddress(highRisk[0].wallet)} với score ${(highRisk[0].score * 100).toFixed(0)}/100.`
        : "GNN score: chưa có ví nào vượt ngưỡng High risk; kết quả nghiêng về theo dõi hơn là cảnh báo mạnh.",
      `Algorithm: ${algorithm}. GCN ưu tiên circular flow, GAT ưu tiên amount similarity/attention, GraphSAGE ưu tiên hubness và neighborhood aggregation.`,
      dataSource === "demo-fallback"
        ? `Data source: demo fallback. Lý do: ${dataSourceReason}`
        : `Data source: dữ liệu thật từ ${dataSource}. ${dataSourceReason}`,
    ],
    suspiciousPatterns: suspiciousWallets.slice(0, 6).map((w) => ({
      patternName: w.pattern,
      description: `Ví ${shortAddress(w.wallet)} có ${w.txCount} giao dịch, volume ${Math.round(w.volume).toLocaleString("vi-VN")} token, GNN score ${(w.score * 100).toFixed(0)}/100.`,
      affectedWallets: [w.wallet],
      severity: w.riskLevel.toUpperCase() as "HIGH" | "MEDIUM" | "LOW",
    })),
    recommendation: verdict === "HIGH_RISK"
      ? "Nên cảnh báo người dùng, kiểm tra thêm pool/liquidity và không nên tin hoàn toàn vào volume 24h của token này."
      : verdict === "MEDIUM_RISK"
      ? "Nên theo dõi thêm vì đã có một số tín hiệu volume nhân tạo nhưng chưa đủ mạnh để kết luận chắc chắn."
      : "Chưa thấy dấu hiệu wash trading nghiêm trọng trong dữ liệu hiện tại; nên kết hợp thêm holder distribution, pool liquidity và top trader behavior.",
    confidenceNote: `Đây là mô hình ${algorithm} GNN-inspired dùng graph features: circularity, time regularity, amount similarity, self-loop và hubness. Kết quả là tín hiệu cảnh báo, không phải kết luận pháp lý.`,
  };
}

async function readCachedVerdict(
  mint: string,
  timeframe: Timeframe,
  algorithm: GnnAlgorithm,
  language: WashTradingLanguage,
): Promise<WashTradingAIResult["aiAnalysis"] | null> {
  const threshold = new Date(Date.now() - WASH_TRADING_VERDICT_TTL_MS);
  const rows = await db
    .select()
    .from(washTradingVerdictCache)
    .where(
      and(
        eq(washTradingVerdictCache.mint, mint),
        eq(washTradingVerdictCache.timeframe, timeframe),
        eq(washTradingVerdictCache.algorithm, algorithm),
        eq(washTradingVerdictCache.language, language),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.fetchedAt < threshold) return null;

  return row.aiAnalysis as WashTradingAIResult["aiAnalysis"];
}

async function writeCachedVerdict(
  mint: string,
  timeframe: Timeframe,
  algorithm: GnnAlgorithm,
  language: WashTradingLanguage,
  aiAnalysis: WashTradingAIResult["aiAnalysis"],
): Promise<void> {
  const fetchedAt = new Date();
  const model = WALLET_AUDIT_MODEL || "gemini-3.1-flash-lite";
  await db
    .insert(washTradingVerdictCache)
    .values({
      mint,
      timeframe,
      algorithm,
      language,
      aiAnalysis: aiAnalysis as WashTradingVerdictPersisted,
      model,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: [
        washTradingVerdictCache.mint,
        washTradingVerdictCache.timeframe,
        washTradingVerdictCache.algorithm,
        washTradingVerdictCache.language,
      ],
      set: {
        aiAnalysis: aiAnalysis as WashTradingVerdictPersisted,
        model,
        fetchedAt,
      },
    });
}

async function tryGeminiAnalysis(base: WashTradingAIResult["aiAnalysis"], params: {
  mint: string;
  symbol: string;
  summary: WashTradingAIResult["summary"];
  circularPatterns: CircularPattern[];
  suspiciousWallets: GNNScore[];
  dataSource: WashTradingDataSource;
  dataSourceReason: string;
  algorithm: GnnAlgorithm;
  language: WashTradingLanguage;
}): Promise<WashTradingAIResult["aiAnalysis"]> {
  const apiKey = GOOGLE_AI_KEY?.trim();
  if (!apiKey) return base;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const intro = params.language === "vi"
      ? "Bạn là chuyên gia phân tích wash trading Solana cho dashboard fintech. Hãy trả về JSON thuần bằng tiếng Việt"
      : "You are a Solana wash-trading analyst for a fintech dashboard. Return plain JSON in English";
    const requirements = params.language === "vi"
      ? [
          "Yêu cầu:",
          "- Không bịa rằng chắc chắn có gian lận nếu dữ liệu không đủ.",
          "- Nếu dataSource là demo-fallback, phải nói rõ chỉ là demo UX.",
          "- Giải thích dựa trên graph/GNN features, không nói chung chung.",
          "- detailedFindings phải là câu văn ngắn, dễ đọc trên dashboard; không dùng Markdown, backtick, bullet Markdown hay tên biến camelCase như circularPattern. Hãy dùng cụm từ thân thiện như mẫu vòng lặp hoặc độ đều thời gian.",
        ].join("\n")
      : [
          "Requirements:",
          "- Do not claim certain fraud if the data is insufficient.",
          "- If dataSource is demo-fallback, clearly say it is only a UX demo.",
          "- Explain using graph/GNN features, not generic wording.",
          "- detailedFindings must be short dashboard-ready sentences. Do not use Markdown, backticks, Markdown bullets, or camelCase variable names such as circularPattern; use user-facing phrases instead.",
        ].join("\n");

    const model = WALLET_AUDIT_MODEL || "gemini-3.1-flash-lite";
    const response = await trackGemini("gemini.svc.wash_trading_analysis", model, () => ai.models.generateContent({
      model,
      contents: `${intro} theo cấu trúc: {"verdict":"HIGH_RISK|MEDIUM_RISK|LOW_RISK|CLEAN","summary":"...","detailedFindings":["..."],"suspiciousPatterns":[{"patternName":"...","description":"...","affectedWallets":["..."],"severity":"HIGH|MEDIUM|LOW"}],"recommendation":"...","confidenceNote":"..."}.\n\n${requirements}\n\nData: ${JSON.stringify({
        mint: params.mint,
        symbol: params.symbol,
        dataSource: params.dataSource,
        dataSourceReason: params.dataSourceReason,
        algorithm: params.algorithm,
        language: params.language,
        summary: params.summary,
        circularPatterns: params.circularPatterns.slice(0, 5),
        suspiciousWallets: params.suspiciousWallets.slice(0, 8),
      })}`,
      config: { temperature: 0.2, responseMimeType: "application/json" },
    }));

    const text = response.text?.replace(/```json|```/g, "").trim() ?? "";
    const parsed = JSON.parse(text) as Partial<WashTradingAIResult["aiAnalysis"]>;
    return {
      verdict: parsed.verdict ?? base.verdict,
      summary: typeof parsed.summary === "string" ? parsed.summary : base.summary,
      detailedFindings: Array.isArray(parsed.detailedFindings) ? parsed.detailedFindings.filter((x): x is string => typeof x === "string") : base.detailedFindings,
      suspiciousPatterns: Array.isArray(parsed.suspiciousPatterns) ? parsed.suspiciousPatterns as WashTradingAIResult["aiAnalysis"]["suspiciousPatterns"] : base.suspiciousPatterns,
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : base.recommendation,
      confidenceNote: typeof parsed.confidenceNote === "string" ? parsed.confidenceNote : base.confidenceNote,
    };
  } catch (error) {
    console.warn("[WashTradingAI] Gemini failed, using local analysis:", error instanceof Error ? error.message : error);
    return base;
  }
}

function buildOverallRiskScore(input: {
  circularPatterns: CircularPattern[];
  suspiciousWallets: GNNScore[];
  washVolumePercent: number;
  uniqueWallets: number;
}): number {
  const highRiskCount = input.suspiciousWallets.filter((w) => w.riskLevel === "High").length;
  const avgSuspiciousScore = input.suspiciousWallets.length > 0
    ? input.suspiciousWallets.reduce((sum, wallet) => sum + wallet.score, 0) / input.suspiciousWallets.length
    : 0;
  const circularSignal = Math.min(1, input.circularPatterns.reduce((sum, p) => sum + p.confidence, 0) / 4);
  const washVolumeSignal = Math.min(1, input.washVolumePercent / 75);
  const highRiskSignal = input.suspiciousWallets.length > 0 ? highRiskCount / input.suspiciousWallets.length : 0;
  const densitySignal = input.uniqueWallets > 0 ? Math.min(1, (input.suspiciousWallets.length / input.uniqueWallets) * 2) : 0;

  return Math.max(0, Math.min(98, Math.round(
    100 * (
      circularSignal * 0.30 +
      avgSuspiciousScore * 0.25 +
      washVolumeSignal * 0.20 +
      highRiskSignal * 0.15 +
      densitySignal * 0.10
    ),
  )));
}

export async function analyzeWashTradingWithAI(params: {
  mint: string;
  symbol?: string;
  timeframe?: Timeframe;
  algorithm?: GnnAlgorithm;
  language?: WashTradingLanguage;
  limit?: number;
  /**
   * Skip the Gemini verdict-generation call when another server feature already
   * needs the deterministic graph analysis as context (for example the scoped
   * wash-trading chat). The graph/risk calculation remains identical.
   */
  generateNarrative?: boolean;
}): Promise<WashTradingAIResult> {
  const mint = params.mint.trim();
  const symbol = (params.symbol ?? "TOKEN").trim() || "TOKEN";
  const timeframe = params.timeframe ?? "24h";
  const algorithm: GnnAlgorithm = params.algorithm ?? "GCN";
  const language: WashTradingLanguage = params.language ?? "en";
  const requestedLimit = Math.min(Math.max(params.limit ?? 80, 20), 200);
  const limit = getSafeApiLimit(requestedLimit, timeframe);
  const analyzedAt = new Date().toISOString();
  const detectionLog: WashTradingAIResult["detectionLog"] = [];

  const addLog = (message: string, severity: WashTradingAIResult["detectionLog"][number]["severity"]) => {
    detectionLog.push({
      time: new Date().toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" }),
      message,
      severity,
    });
  };

  addLog(language === "vi"
    ? `Bắt đầu phân tích AI Wash Trading cho ${symbol} bằng ${algorithm}`
    : `Started AI Wash Trading analysis for ${symbol} with ${algorithm}`, "info");
  const { txs, source, reason, servedFromCache } = await fetchTokenTransactions(mint, symbol, limit, timeframe);
  const localizedReason = localizeDataSourceReason(reason, language, servedFromCache);
  addLog(`Data source: ${source} — ${localizedReason}`, source === "demo-fallback" ? "medium" : "success");
  addLog(language === "vi"
    ? `Đã chuẩn hóa ${txs.length} giao dịch token transfer`
    : `Normalized ${txs.length} token transfer transaction(s)`, "info");

  const circularPatterns = detectCircularPatterns(txs);
  addLog(
    circularPatterns.length > 0
      ? (language === "vi" ? `Phát hiện ${circularPatterns.length} circular trade cluster` : `Detected ${circularPatterns.length} circular trade cluster(s)`)
      : (language === "vi" ? "Không tìm thấy circular cluster rõ ràng" : "No clear circular cluster found"),
    circularPatterns.length > 0 ? "high" : "success",
  );

  const suspiciousWallets = computeGNNScores(txs, circularPatterns, algorithm);
  const highRiskCount = suspiciousWallets.filter((w) => w.riskLevel === "High").length;
  addLog(language === "vi"
    ? `${algorithm} GNN-inspired scoring hoàn tất: ${suspiciousWallets.length} ví đáng ngờ`
    : `${algorithm} GNN-inspired scoring completed: ${suspiciousWallets.length} suspicious wallet(s)`, highRiskCount > 0 ? "high" : "success");

  const graphData = buildGraphData(txs, suspiciousWallets);
  addLog(`Graph built: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`, graphData.edges.length > 0 ? "success" : "medium");

  const totalVolume = txs.reduce((sum, tx) => sum + tx.amount, 0);
  const uniqueWallets = new Set(txs.flatMap((tx) => [tx.from, tx.to])).size;
  const washWalletSet = new Set(circularPatterns.flatMap((p) => p.cycle));
  const washVolumeEstimate = txs
    .filter((tx) => washWalletSet.has(tx.from) || washWalletSet.has(tx.to))
    .reduce((sum, tx) => sum + tx.amount, 0);
  const washVolumePercent = totalVolume > 0 ? (washVolumeEstimate / totalVolume) * 100 : 0;
  const avgSuspiciousScore = suspiciousWallets.length > 0
    ? suspiciousWallets.reduce((sum, wallet) => sum + wallet.score, 0) / suspiciousWallets.length
    : 0;

  const overallRiskScore = buildOverallRiskScore({
    circularPatterns,
    suspiciousWallets,
    washVolumePercent,
    uniqueWallets,
  });

  const summary: WashTradingAIResult["summary"] = {
    totalTransactions: txs.length,
    uniqueWallets,
    totalVolume,
    washVolumeEstimate,
    washVolumePercent,
    circularTradeCount: circularPatterns.length,
    suspiciousWalletCount: suspiciousWallets.length,
    overallRiskScore,
    gnnConfidence: avgSuspiciousScore,
  };

  const localAI = buildLocalAIAnalysis(symbol, circularPatterns, suspiciousWallets, overallRiskScore, source, localizedReason, algorithm, language);
  addLog(language === "vi" ? "Tạo AI explanation cho kết quả phân tích" : "Generating AI explanation for analysis result", "info");

  let aiAnalysis: WashTradingAIResult["aiAnalysis"];
  if (params.generateNarrative === false) {
    aiAnalysis = localAI;
  } else {
    const cachedVerdict = await readCachedVerdict(mint, timeframe, algorithm, language);
    if (cachedVerdict) {
      aiAnalysis = cachedVerdict;
    } else {
      aiAnalysis = await tryGeminiAnalysis(localAI, {
        mint,
        symbol,
        summary,
        circularPatterns,
        suspiciousWallets,
        dataSource: source,
        dataSourceReason: localizedReason,
        algorithm,
        language,
      });
      await writeCachedVerdict(mint, timeframe, algorithm, language, aiAnalysis);
    }
  }
  addLog(language === "vi"
    ? `Hoàn tất phân tích — Verdict: ${aiAnalysis.verdict}`
    : `Analysis completed — Verdict: ${aiAnalysis.verdict}`, aiAnalysis.verdict === "HIGH_RISK" ? "high" : aiAnalysis.verdict === "MEDIUM_RISK" ? "medium" : "success");

  return {
    mint,
    symbol,
    timeframe,
    analyzedAt,
    dataSource: source,
    dataSourceReason: localizedReason,
    algorithm,
    summary,
    circularPatterns,
    suspiciousWallets,
    graphData,
    aiAnalysis,
    detectionLog,
  };
}
