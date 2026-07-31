import {
  WALLET_OVERVIEW_TTL_MS,
} from "@sv/config/constants.js";
// wallet-overview-multi-period marker
import { db } from "@sv/db/index.js";
import {
  walletOverviewCache,
} from "@sv/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getTokenMeta } from "../tokens/token-info.js";
import { getWalletAnalysis } from "@sv/services/wallet/wallet-analysis.js";
import type { WalletAnalysisSelect } from "@sv/db/schema.js";
import type {
  ChartAggregation,
  PnLAggregation,
  WalletPageInfo,
  WalletOverview,
  WalletOverviewPeriodKey,
  WalletOverviewPeriodStats,
  WalletOverviewTimePeriod,
  WalletPortfolioItem,
  WalletTimePeriodInput,
  WalletTimePeriod,
  PriceTimelinePoint,
  WalletOverviewCacheRow,
  OverviewHoldingsSnapshot,
  OverviewActivitySnapshot,
  WalletProviderPolicy,
  WalletOverviewWinRateStats,
} from "@sv/services/wallet/dtos/walletDataObjects.js";
import {
  DAY_MS,
  DAY_SEC,
  DEFAULT_HELIUS_HISTORY_CHUNK_TRANSACTIONS,
  DEFAULT_OVERVIEW_TIME_PERIOD,
  DEFAULT_WALLET_PROVIDER_POLICY,
  MAX_HELIUS_HISTORY_CHUNK_TRANSACTIONS,
  MAX_PNL_SNAPSHOT_POINTS,
  SOL_MINT,
  SOL_NATIVE_ALIAS_MINT,
  SOL_SYSTEM_PROGRAM_ADDRESS,
  WALLET_TABLE_PAGE_SIZE,
} from "@sv/services/wallet/wallet.constants.js";

export type { WalletOverviewTimePeriod, WalletTimePeriod };

export function toWalletPageInfo(input: {
  hasMore: boolean;
  nextCursor: string | null;
  source: WalletPageInfo["source"];
}): WalletPageInfo {
  return {
    pageSize: WALLET_TABLE_PAGE_SIZE,
    hasMore: input.hasMore,
    nextCursor: input.nextCursor,
    source: input.source,
  };
}



export function resolveWalletProviderPolicy(envKey: string): WalletProviderPolicy {
  const raw = String(process.env[envKey] ?? DEFAULT_WALLET_PROVIDER_POLICY)
    .trim()
    .toLowerCase();

  if (raw === "birdeye") {
    return "birdeye";
  }

  if (raw === "fallback") {
    return "fallback";
  }

  return "helius";
}


export function mapTimePeriodToBirdeyeDuration(
  timePeriod: WalletTimePeriod,
): "all" | "90d" | "30d" | "7d" | "24h" {
  switch (timePeriod) {
    case "24H":
      return "24h";
    case "7D":
      return "7d";
    case "30D":
      return "30d";
    case "60D":
    case "90D":
      return "90d";
    case "1Y":
    case "All":
      return "all";
    default:
      return "30d";
  }
}

const PORTFOLIO_METADATA_PLACEHOLDERS = new Set([
  "",
  "unknown",
  "unk",
  "n/a",
  "na",
  "null",
  "undefined",
  "-",
  "--",
  "?",
]);

export function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
  }

  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  return new Date().toISOString();
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function startOfUtcDaySec(inputSec: number): number {
  const date = new Date(Math.max(0, inputSec) * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
}

export function toIsoFromSec(inputSec: number): string {
  return new Date(Math.max(0, inputSec) * 1000).toISOString();
}

export function getDailySnapshotSecRange(fromSec: number, toSec: number): number[] {
  const startDay = startOfUtcDaySec(fromSec);
  const endDay = startOfUtcDaySec(toSec);

  const values: number[] = [];
  for (let cursor = endDay; cursor >= startDay; cursor -= DAY_SEC) {
    values.push(cursor);
  }

  return values;
}



export function normalizeOverviewTimePeriod(
  timePeriod?: WalletOverviewTimePeriod,
): WalletOverviewTimePeriod {
  const normalized = String(timePeriod ?? DEFAULT_OVERVIEW_TIME_PERIOD).trim();
  const upper = normalized.toUpperCase();

  if (upper === "24H") {
    return "24H";
  }
  if (upper === "7D") {
    return "7D";
  }
  if (upper === "30D") {
    return "30D";
  }
  if (upper === "60D") {
    return "60D";
  }
  if (upper === "90D") {
    return "90D";
  }
  if (upper === "1Y") {
    return "1Y";
  }
  if (upper === "ALL") {
    return "All";
  }

  return DEFAULT_OVERVIEW_TIME_PERIOD;
}

export const OVERVIEW_PERIOD_KEYS: WalletOverviewPeriodKey[] = ["24H", "7D", "30D", "90D"];
const DEFAULT_OVERVIEW_SELECTION: WalletOverviewPeriodKey = "24H";

export function normalizeOverviewSelection(timePeriod?: WalletOverviewTimePeriod): WalletOverviewPeriodKey {
  const normalized = normalizeOverviewTimePeriod(timePeriod);
  if (normalized == "24H") {
    return "24H";
  }
  if (normalized == "7D") {
    return "7D";
  }
  if (normalized == "30D") {
    return "30D";
  }
  if (normalized == "90D") {
    return "90D";
  }
  if (normalized == "1Y") {
    return "90D";
  }
  if (normalized == "60D") {
    return "90D";
  }
  if (normalized == "All") {
    return "90D";
  }
  return DEFAULT_OVERVIEW_SELECTION;
}

export function mapPeriodToCacheColumnSuffix(period: WalletOverviewPeriodKey): "24h" | "7d" | "30d" | "90d" {
  if (period == "24H") {
    return "24h";
  }
  if (period == "7D") {
    return "7d";
  }
  if (period == "30D") {
    return "30d";
  }
  if (period == "90D") {
    return "90d";
  }
  return "90d";
}

export function mapOverviewTimePeriodToPeriodSec(timePeriod: WalletOverviewTimePeriod): number {
  switch (timePeriod) {
    case "24H":
      return DAY_SEC;
    case "7D":
      return 7 * DAY_SEC;
    case "30D":
      return 30 * DAY_SEC;
    case "60D":
      return 60 * DAY_SEC;
    case "90D":
      return 90 * DAY_SEC;
    case "1Y":
      return 365 * DAY_SEC;
    case "All":
      return 365 * DAY_SEC;
    default:
      return DAY_SEC;
  }
}

export function mapOverviewTimePeriodToBirdeyeDuration(
  timePeriod: WalletOverviewTimePeriod,
): "all" | "90d" | "30d" | "7d" | "24h" {
  const selectedPeriod = normalizeOverviewSelection(timePeriod);
  return mapPeriodToCacheColumnSuffix(selectedPeriod);
}

export function normalizeShortHistoryPeriod(
  timePeriod?: WalletTimePeriodInput,
): "24h" | "7d" | undefined {
  if (!timePeriod) {
    return undefined;
  }

  return timePeriod === "24H" ? "24h" : "7d";
}

export function formatOverviewMetricsPeriod(periodSec: number): string {
  if (periodSec === DAY_SEC) {
    return "24h";
  }

  const days = Math.floor(periodSec / DAY_SEC);
  if (days * DAY_SEC === periodSec) {
    return `${days}d`;
  }

  const hours = Math.max(1, Math.round(periodSec / 3600));
  return `${hours}h`;
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOverviewPeriodCacheFields(row: WalletOverviewCacheRow, period: WalletOverviewPeriodKey): {
  tradingVolumeUsd: unknown;
  transactionCount: number | null | undefined;
  tokensTradedCount: number | null | undefined;
  buyTxCount: number | null | undefined;
  buyVolumeUsd: unknown;
  sellTxCount: number | null | undefined;
  sellVolumeUsd: unknown;
  pnlTotalUsd: unknown;
  pnlRealizedUsd: unknown;
  pnlUnrealizedUsd: unknown;
  fetchedAt: Date | null | undefined;
} {
  const activityFetchedAt = row.activityFetchedAt;

  if (period === "24H") {
    return {
      tradingVolumeUsd: row.tradingVolumeUsd24h,
      transactionCount: row.transactionCount24h,
      tokensTradedCount: row.tokensTradedCount24h ?? row.tokensTradedCount,
      buyTxCount: row.buyTxCount24h,
      buyVolumeUsd: row.buyVolumeUsd24h,
      sellTxCount: row.sellTxCount24h,
      sellVolumeUsd: row.sellVolumeUsd24h,
      pnlTotalUsd: row.pnlTotalUsd24h ?? row.pnlUsdTotal,
      pnlRealizedUsd: row.pnlRealizedUsd24h,
      pnlUnrealizedUsd: row.pnlUnrealizedUsd24h,
      fetchedAt: activityFetchedAt,
    };
  }

  if (period === "7D") {
    return {
      tradingVolumeUsd: row.tradingVolumeUsd7d,
      transactionCount: row.transactionCount7d,
      tokensTradedCount: row.tokensTradedCount7d,
      buyTxCount: row.buyTxCount7d,
      buyVolumeUsd: row.buyVolumeUsd7d,
      sellTxCount: row.sellTxCount7d,
      sellVolumeUsd: row.sellVolumeUsd7d,
      pnlTotalUsd: row.pnlTotalUsd7d,
      pnlRealizedUsd: row.pnlRealizedUsd7d,
      pnlUnrealizedUsd: row.pnlUnrealizedUsd7d,
      fetchedAt: activityFetchedAt,
    };
  }

  if (period === "30D") {
    return {
      tradingVolumeUsd: row.tradingVolumeUsd30d,
      transactionCount: row.transactionCount30d,
      tokensTradedCount: row.tokensTradedCount30d,
      buyTxCount: row.buyTxCount30d,
      buyVolumeUsd: row.buyVolumeUsd30d,
      sellTxCount: row.sellTxCount30d,
      sellVolumeUsd: row.sellVolumeUsd30d,
      pnlTotalUsd: row.pnlTotalUsd30d,
      pnlRealizedUsd: row.pnlRealizedUsd30d,
      pnlUnrealizedUsd: row.pnlUnrealizedUsd30d,
      fetchedAt: activityFetchedAt,
    };
  }

  if (period === "90D") {
    return {
      tradingVolumeUsd: row.tradingVolumeUsd90d,
      transactionCount: row.transactionCount90d,
      tokensTradedCount: row.tokensTradedCount90d,
      buyTxCount: row.buyTxCount90d,
      buyVolumeUsd: row.buyVolumeUsd90d,
      sellTxCount: row.sellTxCount90d,
      sellVolumeUsd: row.sellVolumeUsd90d,
      pnlTotalUsd: row.pnlTotalUsd90d,
      pnlRealizedUsd: row.pnlRealizedUsd90d,
      pnlUnrealizedUsd: row.pnlUnrealizedUsd90d,
      fetchedAt: activityFetchedAt,
    };
  }

  return {
    tradingVolumeUsd: row.tradingVolumeUsdAll,
    transactionCount: row.transactionCountAll,
    tokensTradedCount: row.tokensTradedCountAll,
    buyTxCount: row.buyTxCountAll,
    buyVolumeUsd: row.buyVolumeUsdAll,
    sellTxCount: row.sellTxCountAll,
    sellVolumeUsd: row.sellVolumeUsdAll,
    pnlTotalUsd: row.pnlTotalUsdAll,
    pnlRealizedUsd: row.pnlRealizedUsdAll,
    pnlUnrealizedUsd: row.pnlUnrealizedUsdAll,
    fetchedAt: activityFetchedAt,
  };
}

export function getOverviewPeriodStatsFromCache(
  row: WalletOverviewCacheRow,
  period: WalletOverviewPeriodKey,
): WalletOverviewPeriodStats {
  const fields = getOverviewPeriodCacheFields(row, period);
  const transactionCount = fields.transactionCount ?? null;
  const buyTxCount = fields.buyTxCount ?? null;
  const sellTxCount = fields.sellTxCount ?? null;

  return {
    tradingVolumeUsd: toNullableFiniteNumber(fields.tradingVolumeUsd),
    buy: {
      transactionCount: buyTxCount,
      volumeUsd: toNullableFiniteNumber(fields.buyVolumeUsd),
    },
    sell: {
      transactionCount: sellTxCount,
      volumeUsd: toNullableFiniteNumber(fields.sellVolumeUsd),
    },
    tokensTradedCount: fields.tokensTradedCount ?? null,
    transactionCount:
      transactionCount != null
        ? transactionCount
        : buyTxCount != null || sellTxCount != null
          ? (buyTxCount ?? 0) + (sellTxCount ?? 0)
          : null,
    pnl: {
      totalUsd: toNullableFiniteNumber(fields.pnlTotalUsd),
      realizedUsd: toNullableFiniteNumber(fields.pnlRealizedUsd),
      unrealizedUsd: toNullableFiniteNumber(fields.pnlUnrealizedUsd),
    },
    source: "overview-cache",
  };
}

export function isPeriodStatsPopulated(stats: WalletOverviewPeriodStats): boolean {
  return (
    stats.tradingVolumeUsd != null ||
    stats.transactionCount != null ||
    stats.tokensTradedCount != null ||
    stats.pnl.totalUsd != null ||
    stats.pnl.realizedUsd != null ||
    stats.pnl.unrealizedUsd != null ||
    stats.buy.transactionCount != null ||
    stats.buy.volumeUsd != null ||
    stats.sell.transactionCount != null ||
    stats.sell.volumeUsd != null
  );
}

export function buildLegacyOverviewFromSelectedPeriod(input: {
  selectedPeriod: WalletOverviewPeriodKey;
  periodStats: WalletOverviewPeriodStats;
  holdingsSnapshot: OverviewHoldingsSnapshot;
}): {
  totalAssetValueUsd: number;
  tradingVolumeUsd24h: number | null;
  pnlUsdTotal: number | null;
  transactionCount24h: number | null;
  tokensTradedCount: number | null;
  tokensHoldingCount: number;
  metricsPeriod: string;
} {
  return {
    totalAssetValueUsd: input.holdingsSnapshot.totalAssetValueUsd,
    tradingVolumeUsd24h: input.periodStats.tradingVolumeUsd,
    pnlUsdTotal: input.periodStats.pnl.totalUsd,
    transactionCount24h: input.periodStats.transactionCount,
    tokensTradedCount: input.periodStats.tokensTradedCount,
    tokensHoldingCount: input.holdingsSnapshot.tokensHoldingCount,
    metricsPeriod: input.selectedPeriod.toLowerCase(),
  };
}

export function mapOverviewCacheRowToDto(
  row: WalletOverviewCacheRow,
  address: string,
  selectedPeriod: WalletOverviewPeriodKey,
): WalletOverview {
  const holdingsSnapshot: OverviewHoldingsSnapshot = {
    totalAssetValueUsd: toFiniteNumber(row.totalAssetValueUsd, 0),
    change24hPercent: toNullableFiniteNumber(row.totalAssetValueChange24hPercent),
    tokensHoldingCount: toFiniteNumber(row.tokensHoldingCount, 0),
    source: "overview-cache",
  };

  const periodStats = OVERVIEW_PERIOD_KEYS.reduce((acc, period) => {
    acc[period] = getOverviewPeriodStatsFromCache(row, period);
    return acc;
  }, {} as Record<WalletOverviewPeriodKey, WalletOverviewPeriodStats>);

  const selectedStats = periodStats[selectedPeriod];
  const legacy = buildLegacyOverviewFromSelectedPeriod({
    selectedPeriod,
    periodStats: selectedStats,
    holdingsSnapshot,
  });

  return {
    address,
    availablePeriods: [...OVERVIEW_PERIOD_KEYS],
    selectedPeriod,
    holdings: {
      totalAssetValueUsd: holdingsSnapshot.totalAssetValueUsd,
      change24hPercent: holdingsSnapshot.change24hPercent,
      tokensHoldingCount: holdingsSnapshot.tokensHoldingCount,
      source: holdingsSnapshot.source,
    },
    periods: periodStats,
    legacy,
    totalAssetValueUsd: legacy.totalAssetValueUsd,
    tradingVolumeUsd24h: legacy.tradingVolumeUsd24h,
    pnlUsdTotal: legacy.pnlUsdTotal,
    transactionCount24h: legacy.transactionCount24h,
    tokensTradedCount: legacy.tokensTradedCount,
    tokensHoldingCount: legacy.tokensHoldingCount,
    tradingVolumeUsdWindow: legacy.tradingVolumeUsd24h,
    pnlUsdWindow: legacy.pnlUsdTotal,
    metricsPeriod: legacy.metricsPeriod,
  };
}

export async function getLatestOverviewCacheRow(address: string): Promise<WalletOverviewCacheRow | null> {
  const cached = await db
    .select()
    .from(walletOverviewCache)
    .where(
      and(
        eq(walletOverviewCache.address, address),
      ),
    )
    .limit(1);

  if (cached.length === 0) {
    return null;
  }

  return cached[0] as WalletOverviewCacheRow;
}

export function getOverviewFromFreshCache(
  cacheRow: WalletOverviewCacheRow | null,
  address: string
): WalletOverview | null {
  if (!cacheRow) {
    return null;
  }

  const overviewThreshold = new Date(Date.now() - WALLET_OVERVIEW_TTL_MS);
  const holdingsFetchedAt = cacheRow.holdingsFetchedAt ?? cacheRow.fetchedAt;
  if (holdingsFetchedAt < overviewThreshold) {
    return null;
  }

  const activityFetchedAt = cacheRow.activityFetchedAt ?? new Date(0);

  if (activityFetchedAt < overviewThreshold) {
    return null;
  }

  return mapOverviewCacheRowToDto(cacheRow, address, DEFAULT_OVERVIEW_SELECTION);
}

export async function buildHoldingsSnapshotFromPortfolio(
  portfolio: WalletPortfolioItem[],
  cacheRow: WalletOverviewCacheRow | null,
): Promise<OverviewHoldingsSnapshot> {
  const totalAssetValueUsd = portfolio.reduce(
    (sum, item) => sum + Number(item.valueUsd ?? 0),
    0,
  );
  if (portfolio.length > 0 || totalAssetValueUsd > 0) {
    return {
      totalAssetValueUsd,
      change24hPercent: null,
      tokensHoldingCount: portfolio.length,
      source: "helius-portfolio-fallback",
    };
  }

  if (cacheRow) {
    return {
      totalAssetValueUsd: toFiniteNumber(cacheRow.totalAssetValueUsd, 0),
      change24hPercent: toNullableFiniteNumber(cacheRow.totalAssetValueChange24hPercent),
      tokensHoldingCount: toFiniteNumber(cacheRow.tokensHoldingCount, 0),
      source: "overview-cache",
    };
  }

  return {
    totalAssetValueUsd: 0,
    change24hPercent: null,
    tokensHoldingCount: 0,
    source: "none",
  };
}

export async function buildActivitySnapshotFromProviders(
  address: string,
  cacheRow: WalletOverviewCacheRow | null,
): Promise<{
  periodSnapshots: Record<WalletOverviewPeriodKey, OverviewActivitySnapshot>;
  providerFailuresByPeriod: Record<WalletOverviewPeriodKey, boolean>;
}> {
  const maxConcurrency = 2;
  const results = new Array<PromiseSettledResult<Awaited<ReturnType<typeof getWalletAnalysis>>>>(
    OVERVIEW_PERIOD_KEYS.length,
  );

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;

      if (current >= OVERVIEW_PERIOD_KEYS.length) {
        return;
      }

      const period = OVERVIEW_PERIOD_KEYS[current];
      try {
        const value = await getWalletAnalysis(address, period);
        results[current] = { status: "fulfilled", value };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(maxConcurrency, OVERVIEW_PERIOD_KEYS.length) },
      () => worker(),
    ),
  );

  const periodSnapshots = {} as Record<WalletOverviewPeriodKey, OverviewActivitySnapshot>;
  const providerFailuresByPeriod = {} as Record<WalletOverviewPeriodKey, boolean>;

  OVERVIEW_PERIOD_KEYS.forEach((period, index) => {
    const result = results[index];

    if (result.status === "fulfilled") {
      periodSnapshots[period] = mapWalletAnalysisToPeriodStats(result.value);
      providerFailuresByPeriod[period] = false;
      return;
    }

    console.error("[wallet-overview] Failed to load Mobula wallet analysis", {
      address,
      period,
      error: result.reason,
    });

    providerFailuresByPeriod[period] = true;
    if (cacheRow) {
      periodSnapshots[period] = mapPeriodStatsToActivitySnapshot(
        getOverviewPeriodStatsFromCache(cacheRow, period),
      );
      return;
    }

    periodSnapshots[period] = {
      tradingVolumeUsd: null,
      buyTransactionCount: null,
      buyVolumeUsd: null,
      sellTransactionCount: null,
      sellVolumeUsd: null,
      transactionCount: null,
      tokensTradedCount: null,
      pnlTotalUsd: null,
      pnlRealizedUsd: null,
      pnlUnrealizedUsd: null,
      source: "none",
    };
  });

  return {
    periodSnapshots,
    providerFailuresByPeriod,
  };
}

export function mapWalletAnalysisToPeriodStats(
  analysis: WalletAnalysisSelect,
): OverviewActivitySnapshot {
  return {
    tradingVolumeUsd: analysis.buyVolumeUsd + analysis.sellVolumeUsd,
    buyTransactionCount: analysis.buyTransactionCount,
    buyVolumeUsd: analysis.buyVolumeUsd,
    sellTransactionCount: analysis.sellTransactionCount,
    sellVolumeUsd: analysis.sellVolumeUsd,
    transactionCount: analysis.transactionCount,
    tokensTradedCount: analysis.tokensTradedCount,
    pnlTotalUsd: analysis.pnlTotalUsd,
    pnlRealizedUsd: analysis.pnlRealizedUsd,
    pnlUnrealizedUsd: analysis.pnlUnrealizedUsd,
    source: "mobula-wallet-analysis",
  };
}

function mapPeriodStatsToActivitySnapshot(stats: WalletOverviewPeriodStats): OverviewActivitySnapshot {
  return {
    tradingVolumeUsd: stats.tradingVolumeUsd,
    buyTransactionCount: stats.buy.transactionCount,
    buyVolumeUsd: stats.buy.volumeUsd,
    sellTransactionCount: stats.sell.transactionCount,
    sellVolumeUsd: stats.sell.volumeUsd,
    transactionCount: stats.transactionCount,
    tokensTradedCount: stats.tokensTradedCount,
    pnlTotalUsd: stats.pnl.totalUsd,
    pnlRealizedUsd: stats.pnl.realizedUsd,
    pnlUnrealizedUsd: stats.pnl.unrealizedUsd,
    source: stats.source,
  };
}

export function buildOverviewResponse(input: {
  address: string;
  holdingsSnapshot: OverviewHoldingsSnapshot;
  periodSnapshots: Record<WalletOverviewPeriodKey, OverviewActivitySnapshot>;
}): WalletOverview {
  const {
    address,
    holdingsSnapshot,
    periodSnapshots,
  } = input;

  const periods = OVERVIEW_PERIOD_KEYS.reduce((acc, period) => {
    const snapshot = periodSnapshots[period];
    acc[period] = {
      tradingVolumeUsd: snapshot.tradingVolumeUsd,
      buy: {
        transactionCount: snapshot.buyTransactionCount,
        volumeUsd: snapshot.buyVolumeUsd,
      },
      sell: {
        transactionCount: snapshot.sellTransactionCount,
        volumeUsd: snapshot.sellVolumeUsd,
      },
      tokensTradedCount: snapshot.tokensTradedCount,
      transactionCount: snapshot.transactionCount,
      pnl: {
        totalUsd: snapshot.pnlTotalUsd,
        realizedUsd: snapshot.pnlRealizedUsd,
        unrealizedUsd: snapshot.pnlUnrealizedUsd,
      },
      source: snapshot.source,
    };
    return acc;
  }, {} as Record<WalletOverviewPeriodKey, WalletOverviewPeriodStats>);

  const selectedStats = periods[DEFAULT_OVERVIEW_SELECTION];
  const legacy = buildLegacyOverviewFromSelectedPeriod({
    selectedPeriod: DEFAULT_OVERVIEW_SELECTION,
    periodStats: selectedStats,
    holdingsSnapshot,
  });

  return {
    address,
    availablePeriods: [...OVERVIEW_PERIOD_KEYS],
    selectedPeriod: DEFAULT_OVERVIEW_SELECTION,
    holdings: {
      totalAssetValueUsd: holdingsSnapshot.totalAssetValueUsd,
      change24hPercent: holdingsSnapshot.change24hPercent,
      tokensHoldingCount: holdingsSnapshot.tokensHoldingCount,
      source: holdingsSnapshot.source,
    },
    periods,
    legacy,
    totalAssetValueUsd: legacy.totalAssetValueUsd,
    tradingVolumeUsd24h: legacy.tradingVolumeUsd24h,
    pnlUsdTotal: legacy.pnlUsdTotal,
    transactionCount24h: legacy.transactionCount24h,
    tokensTradedCount: legacy.tokensTradedCount,
    tokensHoldingCount: legacy.tokensHoldingCount,
    tradingVolumeUsdWindow: legacy.tradingVolumeUsd24h,
    pnlUsdWindow: legacy.pnlUsdTotal,
    metricsPeriod: legacy.metricsPeriod,
  };
}


export function normalizePortfolioText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizePortfolioAddressKey(tokenAddress: string): string {
  return tokenAddress.trim().toLowerCase();
}

export function normalizePortfolioLookupAddress(tokenAddress: string): string {
  const normalized = tokenAddress.trim();
  const lower = normalized.toLowerCase();

  if (
    lower === "native" ||
    lower === "sol" ||
    lower === SOL_MINT.toLowerCase() ||
    lower === SOL_SYSTEM_PROGRAM_ADDRESS.toLowerCase() ||
    lower === SOL_NATIVE_ALIAS_MINT.toLowerCase()
  ) {
    return SOL_MINT;
  }

  return normalized;
}

export function shouldFillPortfolioText(value: string | undefined): boolean {
  const normalized = normalizePortfolioText(value);
  if (!normalized) {
    return true;
  }

  return PORTFOLIO_METADATA_PLACEHOLDERS.has(normalized.toLowerCase());
}

export function isMissingPortfolioLogoUri(value: string | undefined): boolean {
  return normalizePortfolioText(value) == null;
}

export function isValidPortfolioTokenAddress(tokenAddress: string | undefined): boolean {
  const normalized = normalizePortfolioText(tokenAddress);
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (PORTFOLIO_METADATA_PLACEHOLDERS.has(lower)) {
    return false;
  }

  return normalized.length >= 4;
}

export async function enrichWalletPortfolioMetadata(
  portfolio: WalletPortfolioItem[],
  context: { address: string; source: string },
): Promise<{ portfolio: WalletPortfolioItem[]; changed: boolean }> {
  const candidateAddressByKey = new Map<string, string>();

  for (const item of portfolio) {
    if (!isValidPortfolioTokenAddress(item.tokenAddress)) {
      continue;
    }

    const needsSymbol = shouldFillPortfolioText(item.symbol);
    const needsName = shouldFillPortfolioText(item.name);
    const needsLogoUri = isMissingPortfolioLogoUri(item.logoUri);
    if (!needsSymbol && !needsName && !needsLogoUri) {
      continue;
    }

    const rawAddress = String(item.tokenAddress).trim();
    // CoinGecko uses the WSOL mint for SOL metadata; normalize known SOL aliases.
    const lookupAddress = normalizePortfolioLookupAddress(rawAddress);
    const addressKey = normalizePortfolioAddressKey(lookupAddress);
    if (!candidateAddressByKey.has(addressKey)) {
      candidateAddressByKey.set(addressKey, lookupAddress);
    }
  }

  if (candidateAddressByKey.size === 0) {
    return { portfolio, changed: false };
  }

  type TokenMetaRow = {
    address: string;
    symbol: string;
    name: string;
    imageUrl: string | null;
  };

  let tokenMeta: TokenMetaRow[] = [];
  try {
    tokenMeta = await getTokenMeta(Array.from(candidateAddressByKey.values())) as TokenMetaRow[];
  } catch (err) {
    console.warn("[wallet-portfolio] Token metadata enrichment failed", {
      address: context.address,
      error: err,
    });
    return { portfolio, changed: false };
  }

  if (tokenMeta.length === 0) {
    return { portfolio, changed: false };
  }

  const tokenMetaByKey = new Map<
    string,
    {
      symbol?: string;
      name?: string;
      logoUri?: string;
    }
  >();

  for (const meta of tokenMeta) {
    const address = normalizePortfolioText(meta.address);
    if (!address) {
      continue;
    }

    tokenMetaByKey.set(normalizePortfolioAddressKey(address), {
      symbol: normalizePortfolioText(meta.symbol),
      name: normalizePortfolioText(meta.name),
      logoUri: normalizePortfolioText(meta.imageUrl ?? undefined),
    });
  }

  let changed = false;
  const enrichedPortfolio = portfolio.map((item) => {
    if (!isValidPortfolioTokenAddress(item.tokenAddress)) {
      return item;
    }

    const rawAddress = String(item.tokenAddress).trim();
    const lookupAddress = normalizePortfolioLookupAddress(rawAddress);
    const meta = tokenMetaByKey.get(normalizePortfolioAddressKey(lookupAddress));
    if (!meta) {
      return item;
    }

    const shouldFillSymbol = shouldFillPortfolioText(item.symbol) && Boolean(meta.symbol);
    const shouldFillName = shouldFillPortfolioText(item.name) && Boolean(meta.name);
    const shouldFillLogo = isMissingPortfolioLogoUri(item.logoUri) && Boolean(meta.logoUri);

    if (!shouldFillSymbol && !shouldFillName && !shouldFillLogo) {
      return item;
    }

    changed = true;
    return {
      ...item,
      symbol: shouldFillSymbol ? String(meta.symbol) : item.symbol,
      name: shouldFillName ? String(meta.name) : item.name,
      logoUri: shouldFillLogo ? String(meta.logoUri) : item.logoUri,
    };
  });

  return {
    portfolio: changed ? enrichedPortfolio : portfolio,
    changed,
  };
}




export function getRangeStartMs(
  nowMs: number,
  timePeriod: WalletTimePeriod,
): number {
  if (timePeriod === "All") {
    return 0;
  }

  if (timePeriod === "24H") {
    return nowMs - DAY_MS;
  }

  const dayCountByPeriod: Record<"7D" | "30D" | "60D" | "90D" | "1Y", number> = {
    "7D": 7,
    "30D": 30,
    "60D": 60,
    "90D": 90,
    "1Y": 365,
  };

  return nowMs - dayCountByPeriod[timePeriod] * DAY_MS;
}

export function getAggregationIntervalMs(aggregation: PnLAggregation): number {
  if (aggregation === "weekly") {
    return 7 * DAY_MS;
  }
  if (aggregation === "monthly") {
    return 30 * DAY_MS;
  }
  return DAY_MS;
}

export function normalizeMint(mint: unknown): string {
  const raw = String(mint ?? "").trim();
  if (!raw) {
    return "";
  }

  const rawLower = raw.toLowerCase();

  if (
    raw.toUpperCase() === "SOL" ||
    raw === SOL_SYSTEM_PROGRAM_ADDRESS ||
    rawLower === SOL_MINT.toLowerCase() ||
    rawLower === SOL_NATIVE_ALIAS_MINT.toLowerCase()
  ) {
    return SOL_MINT;
  }

  return raw;
}

export function isSolSymbol(symbol: unknown): boolean {
  return String(symbol ?? "").trim().toUpperCase() === "SOL";
}

export function buildSnapshotTimestamps(
  startMs: number,
  endMs: number,
  intervalMs: number,
): number[] {
  if (endMs <= startMs) {
    return [endMs];
  }

  const totalRangeMs = endMs - startMs;
  const expectedPointCount = Math.floor(totalRangeMs / intervalMs) + 1;
  const effectiveIntervalMs =
    expectedPointCount > MAX_PNL_SNAPSHOT_POINTS
      ? Math.max(intervalMs, Math.ceil(totalRangeMs / (MAX_PNL_SNAPSHOT_POINTS - 1)))
      : intervalMs;

  const points: number[] = [];
  for (let ts = startMs; ts <= endMs; ts += effectiveIntervalMs) {
    points.push(ts);
  }

  if (points.length === 0 || points[points.length - 1] !== endMs) {
    points.push(endMs);
  }

  return points;
}

export function normalizePriceTimeline(
  rows: Array<{ unixTimestampMs: number; price: unknown }>,
): PriceTimelinePoint[] {
  return rows
    .map((row) => ({
      timestampMs: Number(row.unixTimestampMs),
      price: Number(row.price),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.timestampMs) &&
        Number.isFinite(point.price) &&
        point.price > 0,
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function findPriceAtOrBefore(
  timeline: PriceTimelinePoint[],
  timestampMs: number,
): number | null {
  if (timeline.length === 0) {
    return null;
  }

  let left = 0;
  let right = timeline.length - 1;
  let foundIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const point = timeline[mid];

    if (point.timestampMs <= timestampMs) {
      foundIndex = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (foundIndex >= 0) {
    return timeline[foundIndex].price;
  }

  return null;
}

export function toCurrentPriceFallback(
  marketData: Record<string, { priceUsd?: number | string }>,
): Record<string, number> {
  const fallback: Record<string, number> = {};
  for (const [tokenAddress, entry] of Object.entries(marketData)) {
    const value = Number(entry?.priceUsd ?? Number.NaN);
    if (Number.isFinite(value) && value > 0) {
      fallback[tokenAddress] = value;
    }
  }
  return fallback;
}

export function calculatePortfolioValueUsd(
  balances: Map<string, number>,
  timelinesByToken: Map<string, PriceTimelinePoint[]>,
  currentPriceFallback: Record<string, number>,
  timestampMs: number,
): number {
  let totalValueUsd = 0;

  for (const [tokenAddress, rawBalance] of balances.entries()) {
    const normalizedBalance = Number(rawBalance);
    if (!Number.isFinite(normalizedBalance) || normalizedBalance <= 0) {
      continue;
    }

    const timeline = timelinesByToken.get(tokenAddress) ?? [];
    const historicalPrice = findPriceAtOrBefore(timeline, timestampMs);
    const priceUsd = historicalPrice ?? currentPriceFallback[tokenAddress] ?? 0;

    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      continue;
    }

    totalValueUsd += normalizedBalance * priceUsd;
  }

  return totalValueUsd;
}

export function resolveChartTransactionLimit(pointLimit: number): number {
  const estimated = Math.max(
    DEFAULT_HELIUS_HISTORY_CHUNK_TRANSACTIONS,
    pointLimit * 20,
  );

  return Math.min(estimated, MAX_HELIUS_HISTORY_CHUNK_TRANSACTIONS);
}

export function resolveBalanceAggregationByGapSec(gapSec: number): ChartAggregation {
  if (gapSec > 2 * 365 * DAY_SEC) {
    return "monthly";
  }

  if (gapSec > 120 * DAY_SEC) {
    return "weekly";
  }

  return "daily";
}

export function getBalanceAggregationIntervalMs(aggregation: ChartAggregation): number {
  if (aggregation === "monthly") {
    return 30 * DAY_MS;
  }

  if (aggregation === "weekly") {
    return 7 * DAY_MS;
  }

  return DAY_MS;
}

export function resolvePnLAggregationByGap(
  aggregation: PnLAggregation,
  gapSec: number,
): PnLAggregation {
  if (gapSec > 2 * 365 * DAY_SEC) {
    return "monthly";
  }

  if (gapSec > 180 * DAY_SEC && aggregation === "daily") {
    return "weekly";
  }

  return aggregation;
}

// Thêm hàm helper tính Win Rate
export function calculateWinRateStats(tokenPnls: Array<{ realizedPnl: number }>): WalletOverviewWinRateStats {
  let winCount = 0;
  let lossCount = 0;
  let totalWinUsd = 0;
  let totalLossUsd = 0;

  for (const token of tokenPnls) {
      // Chỉ xét các token có PnL đã chốt (Realized PnL khác 0)
      if (token.realizedPnl > 0) {
          winCount++;
          totalWinUsd += token.realizedPnl;
      } else if (token.realizedPnl < 0) {
          lossCount++;
          // Lấy giá trị tuyệt đối để tính trung bình lỗ
          totalLossUsd += Math.abs(token.realizedPnl); 
      }
  }

  const totalTraded = winCount + lossCount;
  const winRate = totalTraded > 0 ? (winCount / totalTraded) * 100 : 0;
  const avgWinUsd = winCount > 0 ? totalWinUsd / winCount : 0;
  const avgLossUsd = lossCount > 0 ? totalLossUsd / lossCount : 0;

  return {
      winRate,
      winCount,
      lossCount,
      totalTraded,
      avgWinUsd,
      avgLossUsd
  };
}

// Khi build WalletOverviewPeriodStats, bạn gọi hàm này và gán vào winRateStats:
// const periodWinRate = calculateWinRateStats(periodTokenPnls);
// return { ...stats, winRateStats: periodWinRate }
