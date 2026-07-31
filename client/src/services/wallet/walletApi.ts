import client from "@/api/main";

export interface WalletPortfolioItem {
  tokenAddress: string;
  symbol: string;
  name?: string;
  logoUri?: string;
  amount: number;
  priceUsd?: number;
  valueUsd: number;
  change24hPercent?: number;
}
// Thêm interface mới cho Win Rate
export interface WalletOverviewWinRateStats {
    winRate: number;       // VD: 68.4
    winCount: number;      // Số token lãi
    lossCount: number;     // Số token lỗ
    totalTraded: number;   // Tổng số token có giao dịch chốt lời/lỗ
    avgWinUsd: number;     // Trung bình số tiền lãi
    avgLossUsd: number;    // Trung bình số tiền lỗ
}

export interface WalletSwap {
  transactionHash: string;
  transactionType: string;
  blockTimestampIso: string;

  subcategory: string | null;

  walletAddress: string;
  pairAddress: string;

  tokensInvolved: string;

  bought: WalletSwapTokenChange;
  sold: WalletSwapTokenChange;

  totalValueUsd: number | null;
  baseQuotePrice: number | null;
}

export interface WalletSwapTokenChange {
  address: string;
  amount: number;
  symbol: string | null;
  name: string | null;
  logoUri: string | null;
  priceUsd: number;
  valueUsd: number;
}

export interface WalletSwapTokenInfo {
  address: string;
  amount: number;
  symbol: string | null;
  name: string | null;
  logoUri: string | null;
  priceUsd: number;
  valueUsd: number;
}

export interface WalletPageInfo {
  pageSize: 100;
  hasMore: boolean;
  nextCursor: string | null;
  source: "cache" | "provider" | "mixed";
}

export interface TokenHourlyVolume {
  hour: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
}

export interface WalletDayToken {
  address: string;
  symbol: string;
  logoUri: string | null;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  buyAmount: number;
  sellAmount: number;
  totalVolumeUsd: number;
  hourlyVolumes: TokenHourlyVolume[];
  priceHistory?: { timestampMs: number; price: number }[];
}

export interface WalletDaySwapSummary {
  transactionHash: string;
  timestamp: string;
  pair: string;
  valueUsd: number;
  action: "buy" | "sell";
  soldSymbol: string | null;
  boughtSymbol: string | null;
  soldTokenAddress: string | null;
  boughtTokenAddress: string | null;
  soldAmount: number;
  boughtAmount: number;
}

export interface WalletDayActivitySummary {
  walletAddress: string;
  date: string;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  buyTxCount: number;
  sellTxCount: number;
  allTokens: WalletDayToken[];
  totalTokensTraded: number;
  swaps: WalletDaySwapSummary[];
}

export interface WalletInnerInstruction {
  index: number;
  programId: string;
  programLabel: string | null;
  accounts: string[];
}

export interface WalletInstruction {
  index: number;
  programId: string;
  programLabel: string | null;
  accounts: string[];
  innerInstructions: WalletInnerInstruction[];
}

export interface WalletTxInstructionDetail {
  transactionHash: string;
  instructions: WalletInstruction[];
}

export interface WalletSwapsResponse {
  address: string;
  swaps: WalletSwap[];
  pageInfo: WalletPageInfo;
}
export interface WalletTransfer {
  from: string;
  to: string;
  amount: number;
  amountUsd?: number;
  timestamp: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  tokenLogoUri?: string;
  priceUsd?: number;
  transactionSignature: string;
  instructionIndex: number;
}

export interface WalletTransfersResponse {
  address: string;
  chain?: string;
  transfers: WalletTransfer[];
  pageInfo: WalletPageInfo;
}

export interface WalletFirstFundInsight {
  targetAddress: string;
  funderAddress: string | null;
  funderName: string | null;
  funderType: string | null;
  funderLabel: string | null;
  firstFundDate: string | null;
  firstFundTimestampSec: number | null;
  walletAgeDays: number | null;
  walletAgeLabel: string | null;
  signature: string | null;
}

export interface WalletIdentityAnalysis {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  signals: string[];
  firstFund: WalletFirstFundInsight | null;
  userTags?: string[];
}

export interface WalletIdentityNormalized {
  status: "known" | "unknown" | "unavailable";
  type: string | null;
  name: string | null;
  category: string | null;
  tags: string[];
  domainNames: string[];
  provider: "helius";
  providerVersion: "wallet-api-beta";
  resolvedAt: string;
}

export interface WalletIdentityProviderMetadata {
  statusCode?: number;
  errorCode?: string;
}

export interface WalletIntelligenceResponse {
  address: string;
  identity: WalletIdentityNormalized;
  analysis: WalletIdentityAnalysis;
  metadata: {
    cache: {
      identityHit: boolean;
      analysisHit: boolean;
      ttlSec: number;
      staleIdentity: boolean;
    };
    provider: WalletIdentityProviderMetadata;
  };
}

export type WalletAiAnalysisLanguage = "en" | "vn";

export type WalletAiFeature =
  | "wallet_ai_analysis"
  | "wash_trading_ai_analysis"
  | "general_ai_chat"
  | "token_chart_news_summary";

export interface WalletAiUsage {
  feature: WalletAiFeature;
  tier: "Free" | "Lite" | "Plus" | "Pro";
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  requiredTier?: "Lite" | "Plus" | "Pro";
  disabled?: boolean;
}

export class WalletAiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode?: string,
    public readonly usage?: WalletAiUsage,
    public readonly upgradePath?: string,
  ) {
    super(message);
    this.name = "WalletAiApiError";
  }
}

async function walletAiError(response: Response, fallback: string) {
  let message = fallback;
  let errorCode: string | undefined;
  let usage: WalletAiUsage | undefined;
  let upgradePath: string | undefined;

  try {
    const errorData = await response.json() as {
      error?: string;
      message?: string;
      errorCode?: string;
      feature?: WalletAiFeature;
      tier?: WalletAiUsage["tier"];
      limit?: number;
      used?: number;
      remaining?: number;
      resetsAt?: string;
      requiredTier?: WalletAiUsage["requiredTier"];
      disabled?: boolean;
      upgradePath?: string;
    };
    message =
      errorData.message?.trim() ||
      errorData.error?.trim() ||
      message;
    errorCode = errorData.errorCode;
    usage =
      errorData.feature &&
      errorData.tier &&
      typeof errorData.limit === "number" &&
      typeof errorData.used === "number" &&
      typeof errorData.remaining === "number" &&
      errorData.resetsAt
        ? {
            feature: errorData.feature,
            tier: errorData.tier,
            limit: errorData.limit,
            used: errorData.used,
            remaining: errorData.remaining,
            resetsAt: errorData.resetsAt,
            requiredTier: errorData.requiredTier,
            disabled: errorData.disabled,
          }
        : undefined;
    upgradePath = errorData.upgradePath;
  } catch {
    // Keep the status-based fallback when the response body is not JSON.
  }

  return new WalletAiApiError(
    message,
    response.status,
    errorCode,
    usage,
    upgradePath,
  );
}

export interface WalletAiSwapSummaryTokenPnl {
  address: string;
  symbol: string | null;
  name: string | null;
  logoUri: string | null;
  pnlUsd: number;
  trades: number;
  wins: number;
  exits: number;
  buyCount: number;
  sellCount: number;
  totalEntered: number;
  totalExited: number;
  totalEnteredAmount: number;
  totalExitedAmount: number;
  entryPrices: number[] | null;
  exitPrices: number[] | null;
  totalBoughtVolumeUsd: number;
  totalSoldVolumeUsd: number;
  longestHoldingTimeMs: number | null;
  maxTolerableLossPercent: number;
}

export interface WalletAiSwapSummaryResponse {
  address: string;
  language: "en" | "vn";
  tradeCount: number;
  realizedPnlUsd: number;
  winningPercentage: number;
  totalBoughtUsd: number;
  totalSoldUsd: number;
  topProfitable: WalletAiSwapSummaryTokenPnl | null;
  topLoser: WalletAiSwapSummaryTokenPnl | null;
  allTokenBreakdowns: WalletAiSwapSummaryTokenPnl[];
  riskNotes: string[];
  summary: string;
  model: string;
  fetchedAt: string;
  cached: boolean;
}

export async function fetchWalletAiSwapSummary(
  address: string,
  language?: WalletAiAnalysisLanguage,
): Promise<WalletAiSwapSummaryResponse> {
  const response = await client.api.wallets["ai-swap-summary"].$post({
    json: { address, language },
  });

  if (!response.ok) {
    throw await walletAiError(
      response,
      `Failed to fetch wallet AI swap summary (${response.status})`,
    );
  }

  const data = await response.json();
  return data as WalletAiSwapSummaryResponse;
}

export interface WalletTokenTradeEvent {
  timestampMs: number;
  type: "buy" | "sell";
  price: number;
  amount: number;
  valueUsd: number;
  pnlUsd?: number;
  pnlPercent?: number;
  holdingTimeMs?: number;
}

export interface WalletTokenPnlDistribution {
  extremeProfit: number;
  highProfit: number;
  profit: number;
  lowLoss: number;
  highLoss: number;
}

export interface TokenDeepAnalysisResponse {
  address: string;
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  logoUri: string | null;
  analysis: string;
  riskNotes: string[];
  tradeCount: number;
  realizedPnlUsd: number;
  totalBoughtUsd: number;
  totalSoldUsd: number;
  tradeTimeline: WalletTokenTradeEvent[];
  pnlDistribution: WalletTokenPnlDistribution;
  winningPercentage: number;
  model: string;
  cached: boolean;
}

export async function fetchTokenDeepAnalysis(
  walletAddress: string,
  tokenAddress: string,
  language?: WalletAiAnalysisLanguage,
): Promise<TokenDeepAnalysisResponse> {
  const response = await client.api.wallets["ai-swap-summary"]["token"].$post({
    json: { address: walletAddress, tokenAddress, language },
  });

  if (!response.ok) {
    throw await walletAiError(
      response,
      `Failed to fetch token deep analysis (${response.status})`,
    );
  }

  const data = await response.json();
  return data as TokenDeepAnalysisResponse;
}

export interface WalletAiReferenceEntry {
  ref_id: number;
  type: "wallet" | "exchange" | "token";
  address?: string;
  name?: string;
  symbol?: string;
  logoUri?: string;
}

export interface WalletAiAnalysisResponse {
  wallet_address: string;
  version?: string;
  data: {
    swaps: "ok" | "insufficient_data";
    portfolio: "ok" | "insufficient_data";
    first_funder: "ok" | "insufficient_data";
    identity: "ok" | "insufficient_data";
  };
  activity_profile: {
    archetype: string;
    activity_level: "dormant" | "low" | "moderate" | "high";
    last_active: string;
  };
  interaction_fingerprint: {
    preferred_protocols: string[];
    transaction_timing: "uniform" | "burst_mode" | "sporadic";
    preffered_trading_tokens: string[];
    preffered_holding_tokens: string[];
    trading_volume_range: string;
  };
  funder: {
    type: string;
    notes: string;
  };
  wallet_age: {
    category: "new" | "mid" | "old" | "unknown";
    first_seen: string;
    consistency: string;
  };
  summary: string;
  signals: string[];
  reference?: WalletAiReferenceEntry[];
  usage?: WalletAiUsage;
  counted?: boolean;
}

export type WalletOverviewPeriodKey = "24H" | "7D" | "30D" | "90D";

export interface WalletOverviewPeriodStats {
  tradingVolumeUsd: number | null;
  buy: {
    transactionCount: number | null;
    volumeUsd: number | null;
  };
  sell: {
    transactionCount: number | null;
    volumeUsd: number | null;
  };
  tokensTradedCount: number | null;
  transactionCount: number | null;
  pnl: {
    totalUsd: number | null;
    realizedUsd: number | null;
    unrealizedUsd: number | null;
  };
  source:
    | "mobula-wallet-analysis"
    | "birdeye-overall-pnl"
    | "overview-cache"
    | "none";
  winRateStats?: WalletOverviewWinRateStats;
}

export interface WalletOverviewHoldingsStats {
  totalAssetValueUsd: number;
  change24hPercent: number | null;
  tokensHoldingCount: number;
  source:
    | "mobula-wallet-analysis" 
    | "birdeye-portfolio"
    | "helius-portfolio-fallback"
    | "overview-cache"
    | "none";
}

export interface WalletOverviewMultiPeriodResponse {
  address: string;
  availablePeriods: WalletOverviewPeriodKey[];
  selectedPeriod: WalletOverviewPeriodKey;
  holdings: WalletOverviewHoldingsStats;
  periods: Record<WalletOverviewPeriodKey, WalletOverviewPeriodStats>;
  legacy: {
    totalAssetValueUsd: number;
    tradingVolumeUsd24h: number | null;
    pnlUsdTotal: number | null;
    transactionCount24h: number | null;
    tokensTradedCount: number | null;
    tokensHoldingCount: number;
    metricsPeriod: string;
  };
  // Legacy top-level fields during migration window.
  totalAssetValueUsd: number;
  tradingVolumeUsd24h: number | null;
  pnlUsdTotal: number | null;
  transactionCount24h: number | null;
  tokensTradedCount: number | null;
  tokensHoldingCount: number;
  tradingVolumeUsdWindow?: number | null;
  pnlUsdWindow?: number | null;
  metricsPeriod?: string;
}

/**
 * Fetch wallet overview data
 * GET /api/wallets/overview
 */
export function fetchWalletOverview(
  address: string,
): Promise<WalletOverviewMultiPeriodResponse> {
  return client.api.wallets.overview.$get({
    query: {
      address,
      period: "24H",
    },
  }).then(async (resp) => {
    if (resp.ok) return resp.json();

    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch wallet portfolio data
 * GET /api/wallets/portfolio
 */
export function fetchWalletPortfolio(
  address: string,
  chain?: string,
): Promise<WalletPortfolioItem[]> {
  return client.api.wallets.portfolio.$get({
    query: { address, ...(chain && { chain }) },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch wallet transfers
 * GET /api/wallets/transfers/history/:address
 */
export function fetchWalletTransfers(
  address: string,
  params?: {
    chain?: string;
    limit?: number;
    cursor?: string;
    minValueUsd?: number;
    before?: string;
  },
): Promise<WalletTransfersResponse> {
  return client.api.wallets.transfers.history[":address"].$get({
    param: { address },
    query: {
      limit: params?.limit,
      cursor: params?.cursor,
      minValueUsd: params?.minValueUsd,
    },
  }).then(resp => {
    if (resp.ok) {
      return resp.json().then(transfers => ({
        address,
        chain: params?.chain,
        transfers: transfers.transactions.map(transfer => ({
          from:
            transfer.direction === "send"
              ? address
              : transfer.counterpartyAddress,
          to:
            transfer.direction === "receive"
              ? address
              : transfer.counterpartyAddress,
          amount: transfer.token.amount,
          amountUsd: transfer.valueUsd,
          timestamp: new Date(transfer.blockTimestampMs).toISOString(),
          tokenAddress: transfer.token.address,
          tokenSymbol: transfer.token.symbol ?? "",
          tokenName: transfer.token.name ?? undefined,
          tokenLogoUri: transfer.token.logoUri ?? undefined,
          priceUsd: transfer.token.priceUsd ?? undefined,
          transactionSignature: transfer.transactionHash,
          instructionIndex: 0,
        })),
        pageInfo: {
          pageSize: 100,
          hasMore: false,
          nextCursor: null,
          source: "cache",
        },
      }));
    }
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch wallet swaps
 * GET /api/wallets/swaps/history/:address
 */
export function fetchWalletSwaps(
  address: string,
  params?: {
    chain?: string;
    limit?: number;
    cursor?: string;
    minValueUsd?: number;
    before?: string;
  },
): Promise<WalletSwapsResponse> {
  return client.api.wallets.swaps.history[":address"].$get({
    param: { address },
    query: {
      limit: params?.limit,
      cursor: params?.cursor,
      minValueUsd: params?.minValueUsd,
    },
  }).then(resp => {
    if (resp.ok) {
      return resp.json().then(swaps => ({
        address,
        swaps: swaps.transactions.map(swap => {
          const boughtLabel =
            swap.bought.symbol ?? swap.bought.name ?? swap.bought.address;
          const soldLabel =
            swap.sold.symbol ?? swap.sold.name ?? swap.sold.address;

          return {
            transactionHash: swap.transactionHash,
            transactionType: "SWAP",
            blockTimestampIso: new Date(
              swap.blockTimestampMs,
            ).toISOString(),
            subcategory: null,
            walletAddress: address,
            pairAddress: "",
            tokensInvolved: `${soldLabel},${boughtLabel}`,
            bought: {
              ...swap.bought,
              priceUsd: swap.bought.priceUsd ?? 0,
              valueUsd:
                swap.bought.priceUsd == null
                  ? 0
                  : swap.bought.amount * swap.bought.priceUsd,
            },
            sold: {
              ...swap.sold,
              priceUsd: swap.sold.priceUsd ?? 0,
              valueUsd:
                swap.sold.priceUsd == null
                  ? 0
                  : swap.sold.amount * swap.sold.priceUsd,
            },
            totalValueUsd: swap.totalValueUsd,
            baseQuotePrice: null,
          };
        }),
        pageInfo: {
          pageSize: 100,
          hasMore: false,
          nextCursor: null,
          source: "cache",
        },
      }));
    }
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch wallet asset distribution
 * GET /api/wallets/distribution
 */
export function fetchWalletDistribution(address: string, chain?: string) {
  return client.api.wallets.distribution.$get({
    query: { address, ...(chain && { chain }) },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch wallet identity data
 * GET /api/wallets/identity
 */
export function fetchWalletIdentity(address: string) {
  return client.api.wallets.identity.$get({
    query: { address },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch wallet identity batch data
 * POST /api/wallets/identity/batch
 */
export function fetchWalletIdentityBatch(
  addresses: string[],
  chain?: string,
) {
  return client.api.wallets.identity.batch.$post({
    json: { addresses, ...(chain && { chain }) },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch composed wallet intelligence data
 * GET /api/wallets/intelligence
 */
export function fetchWalletIntelligence(
  address: string,
  chain?: string,
): Promise<WalletIntelligenceResponse> {
  return client.api.wallets.intelligence.$get({
    query: { address, ...(chain && { chain }) },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

/**
 * Fetch wallet AI analysis
 * POST /api/wallets/ai-analysis
 */
export function fetchWalletAiAnalysis(
  address: string,
  language: WalletAiAnalysisLanguage,
): Promise<WalletAiAnalysisResponse> {
  return client.api.wallets["ai-analysis"].$post({
    json: { address, language },
  }).then(async resp => {
    if (resp.ok) return (await resp.json()) as WalletAiAnalysisResponse;
    throw await walletAiError(
      resp,
      `Failed to fetch wallet AI analysis (${resp.status})`,
    );
  });
}

/**
 * AI Wallet Forensic Audit response.
 *
 * Mirrors the shape returned by `GET /api/wallets/:address/audit`.
 * The backend caches results for 24 hours; `cached: true` indicates the
 * report came straight from cache (no Gemini call was made).
 */
export type WalletAuditPersona =
  | "Sniper"
  | "Whale"
  | "DCA"
  | "LP"
  | "Retail"
  | "Unknown";

export interface WalletRecentTradedDescBreakdown {
  symbol: string | null;
  address: string;
  tokenAddress: string;
  lastTradeUnixTime: number;
  totalBuyCount: number;
  totalSellCount: number;
  totalTradeCount: number;
  totalBoughtAmount: number;
  totalSoldAmount: number;
  balanceAmount: number;
  costOfQuantitySold: number;
  totalBoughtUsd: number;
  totalSoldUsd: number;
  currentValue: number;
  realizedProfitUsd: number;
  realizedProfitPercent: number;
  unrealizedProfitUsd: number;
  unrealizedProfitPercent: number;
  avgBuyCost: number;
  avgSellCost: number;
}

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

/**
 * Fetch AI Wallet Forensic Audit
 * GET /api/wallets/:address/audit
 *
 * Pass `force: true` to bypass the 24-hour cache and re-run Gemini.
 */
export function fetchWalletAudit(
  address: string,
  options?: { force?: boolean },
): Promise<WalletAuditReport> {
  return client.api.wallets[":address"].audit.$get({
    param: { address },
    query: { force: options?.force ? "true" : undefined },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

export async function fetchWalletRecentTradedDescBreakdown(address: string): Promise<WalletRecentTradedDescBreakdown[]> {
  return client.api.wallets[":address"]["recent-traded-desc-breakdown"].$get({
    param: { address }
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}


export async function fetchDayActivitySummary(
  address: string,
  dayMs: number,
): Promise<WalletDayActivitySummary> {
  return client.api.wallets["day-activity"].$get({
    query: { address, dayMs: String(dayMs) },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

export interface TokenPriceChartPoint {
  timestampMs: number;
  price: number;
}

export function fetchTokenPriceChartForDay(
  tokenAddress: string,
  dayMs: number,
) {
  return client.api.wallets["token-price-chart"].$get({
    query: { address: tokenAddress, dayMs: String(dayMs) },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}

export function fetchTxInstructions(
  address: string,
  signature: string,
): Promise<WalletTxInstructionDetail> {
  return client.api.wallets["tx-instructions"].$get({
    query: { address, signature },
  }).then(resp => {
    if (resp.ok) return resp.json();
    console.error(`API Error: ${resp.status}`);
    throw new Error(`API Error: ${resp.status}`);
  });
}
