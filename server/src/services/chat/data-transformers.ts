import { z } from "zod";

type DataTransformer = (fullData: unknown) => unknown;

const balanceHistoryTransformer: DataTransformer = (data) => {
  const points = Array.isArray(data) ? data : [];
  return {
    labels: (points as Array<{ usdValue: number; timestampMs: number }>).map((p) =>
      new Date(p.timestampMs).toISOString().slice(0, 10),
    ),
    datasets: [
      {
        name: "Balance",
        values: (points as Array<{ usdValue: number; timestampMs: number }>).map((p) => [p.timestampMs, p.usdValue]),
      },
    ],
  };
};

const pnlChartTransformer: DataTransformer = (data) => {
  const d = (data as { dailyPnL?: Array<{ timestamp: number; value: number }>; cumulativePnL?: Array<{ timestamp: number; value: number }> }) ?? {};
  const daily = d.dailyPnL ?? [];
  const cumulative = d.cumulativePnL ?? [];
  const allTimestamps = [...new Set([...daily.map((p) => p.timestamp), ...cumulative.map((p) => p.timestamp)])].sort();
  return {
    labels: allTimestamps.map((ts) => new Date(ts).toISOString().slice(0, 10)),
    datasets: [
      {
        name: "Daily PnL",
        values: allTimestamps.map((ts) => [ts, daily.find((p) => p.timestamp === ts)?.value ?? null]),
      },
      {
        name: "Cumulative PnL",
        values: allTimestamps.map((ts) => [ts, cumulative.find((p) => p.timestamp === ts)?.value ?? null]),
      },
    ],
  };
};

const tokenPrice24hTransformer: DataTransformer = (data) => {
  const points = Array.isArray(data) ? data : [];
  const typed = points as Array<{ unixTimestampMs: number; price: number }>;
  const labels = typed.map((p) => new Date(p.unixTimestampMs).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
  return {
    labels,
    datasets: [{ name: "Price", values: typed.map((p) => [p.unixTimestampMs, p.price]) }],
  };
};

const tokenPriceDailyTransformer: DataTransformer = (data) => {
  const points = Array.isArray(data) ? data : [];
  const typed = points as Array<{ unixTimestampMs: number; price: number }>;
  return {
    labels: typed.map((p) => new Date(p.unixTimestampMs).toISOString().slice(0, 10)),
    datasets: [{ name: "Price", values: typed.map((p) => [p.unixTimestampMs, p.price]) }],
  };
};

const drawdownChartTransformer: DataTransformer = (data) => {
  const points = Array.isArray(data) ? data : [];
  const typed = points as Array<{ timestamp: number; drawdown: number }>;
  return {
    labels: typed.map((p) => new Date(p.timestamp).toISOString().slice(0, 10)),
    datasets: [{
      name: "Drawdown",
      values: typed.map((p) => [p.timestamp, p.drawdown]),
    }],
  };
};

const swapFieldMap: Record<string, string> = {
  transactionHash: "txHash",
  blockTimestampIso: "timestamp",
  subcategory: "dex",
};

const transferFieldMap: Record<string, string> = {
  tokenSymbol: "token",
};

const portfolioFieldMap: Record<string, string> = {
  symbol: "token",
  change24hPercent: "change24h",
  tokenAddress: "address",
};

function normalizeArray(arr: unknown[], fieldMap: Record<string, string>): unknown[] {
  return (arr as Record<string, unknown>[]).map((item) => {
    const copy = { ...item };
    for (const [from, to] of Object.entries(fieldMap)) {
      if (from in copy && !(to in copy)) {
        copy[to] = copy[from];
      }
    }
    return copy;
  });
}

const swapsTransformer: DataTransformer = (data) => {
  const d = data as { swaps?: unknown[] } | null;
  const arr = d?.swaps ?? [];
  return normalizeArray(arr, swapFieldMap);
};

const transfersTransformer: DataTransformer = (data) => {
  const d = data as { transfers?: unknown[] } | null;
  const arr = d?.transfers ?? [];
  return normalizeArray(arr, transferFieldMap);
};

const compactTokensTransformer: DataTransformer = (data) => {
  const d = data as { compact?: { tokens?: unknown[] } } | null;
  return Array.isArray(d?.compact?.tokens) ? d.compact.tokens : [];
};
const portfolioTransformer: DataTransformer = (data) => {
  if (!Array.isArray(data)) return [];
  return normalizeArray(data, portfolioFieldMap);
};

const realizedPnlBreakdownTransformer: DataTransformer = (data) => {
  const parsed = z.array(z.object({
    tokenAddress: z.string(),
    symbol: z.string().nullable(),
    realizedProfitUsd: z.number(),
    unrealizedProfitUsd: z.number(),
    totalTradeCount: z.number(),
    totalBoughtUsd: z.number(),
    totalSoldUsd: z.number(),
  })).safeParse(data);

  if (!parsed.success) return [];

  return parsed.data.map((row) => ({
    tokenAddress: row.tokenAddress,
    token: row.symbol ?? row.tokenAddress,
    symbol: row.symbol,
    realizedPnlUsd: row.realizedProfitUsd,
    realizedProfitUsd: row.realizedProfitUsd,
    pnlUsd: row.realizedProfitUsd,
    unrealizedPnlUsd: row.unrealizedProfitUsd,
    totalPnlUsd: row.realizedProfitUsd + row.unrealizedProfitUsd,
    trades: row.totalTradeCount,
    tradeCount: row.totalTradeCount,
    totalTradeCount: row.totalTradeCount,
    totalBoughtUsd: row.totalBoughtUsd,
    totalSoldUsd: row.totalSoldUsd,
  }));
};

const tokenPriceTransformer: DataTransformer = (data) => {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, Record<string, unknown>>;
  return Object.entries(record).map(([addr, entry]) => ({
    tokenAddress: addr,
    priceUsd: entry.priceUsd,
    change24hPercent: entry.priceChangePercentage24h,
    marketCap: entry.marketCap,
    volume24hUsd: entry.volume24h,
    marketCapRank: entry.marketCapRank,
  }));
};

const tokenDetailsTransformer: DataTransformer = (data) => {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      const meta = (item as Record<string, unknown>).meta as Record<string, unknown> | undefined;
      const details = (item as Record<string, unknown>).details as Record<string, unknown> | undefined;
      if (!meta) return null;
      return {
        address: meta.address,
        name: meta.name,
        symbol: meta.symbol,
        imageUrl: meta.imageUrl,
        decimals: details?.decimals,
        description: details?.description,
        homepage: details?.linkHomepage,
      };
    })
    .filter(Boolean);
};

const washTradeRiskTransformer: DataTransformer = (data) => {
  if (!data || typeof data !== "object") return [];
  const d = data as {
    riskScore?: number;
    patterns?: { circularTrades?: number; sameAmountTransactions?: number; tightTimingClusters?: number; starTopology?: boolean; volumeAnomaly?: boolean };
    summary?: { totalVolume?: number; volumeAnomalies?: number; circularTrades?: number };
    suspiciousWallets?: Array<{ wallet: string; confidence: number; pattern: string; gnnScore: number }>;
  };
  return {
    riskScore: d.riskScore ?? 0,
    patterns: d.patterns,
    summary: d.summary,
    topSuspiciousWallets: (d.suspiciousWallets ?? []).slice(0, 5).map((w) => ({
      wallet: w.wallet,
      confidence: w.confidence,
      pattern: w.pattern,
    })),
  };
};

const intelligenceTransformer: DataTransformer = (data) => {
  if (!data || typeof data !== "object") return [];
  const d = data as {
    address?: string;
    identity?: { status?: string; category?: string | null; type?: string | null; name?: string | null; tags?: string[] };
    analysis?: { riskScore?: number; riskLevel?: string; signals?: string[] };
  };
  return {
    address: d.address,
    identity: {
      status: d.identity?.status ?? "unknown",
      category: d.identity?.category,
      type: d.identity?.type,
      name: d.identity?.name,
    },
    analysis: {
      riskScore: d.analysis?.riskScore ?? 50,
      riskLevel: d.analysis?.riskLevel ?? "medium",
      signals: d.analysis?.signals ?? [],
    },
  };
};

export const DATA_TRANSFORMERS: Record<string, DataTransformer> = {
  get_balance_history: balanceHistoryTransformer,
  get_drawdown_chart: drawdownChartTransformer,
  get_wallet_pnl_history: pnlChartTransformer,
  get_token_price: tokenPriceTransformer,
  get_token_price_24h: tokenPrice24hTransformer,
  get_token_price_hourly: tokenPrice24hTransformer,
  get_token_price_daily: tokenPriceDailyTransformer,
  get_token_details: tokenDetailsTransformer,
  get_wallet_swaps: swapsTransformer,
  get_wallet_transfers: transfersTransformer,
  get_wallet_swaps_compact: compactTokensTransformer,
  get_wallet_transfers_compact: compactTokensTransformer,
  get_wallet_portfolio: portfolioTransformer,
  get_wallet_realized_pnl_desc_breakdown: realizedPnlBreakdownTransformer,
  get_token_wash_trade_risk: washTradeRiskTransformer,
  get_wallet_intelligence: intelligenceTransformer,
};
