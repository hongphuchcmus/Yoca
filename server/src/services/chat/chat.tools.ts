import { getWalletOverview } from "@sv/services/wallet/walletOverview.service.js";
import { getWalletSwaps, getWalletTransfers } from "@sv/services/wallet/walletTransfersSwaps.service.js";
import { getWalletBalanceHistory } from "@sv/services/wallet/walletCharts.service.js";
import {
    getWalletPnlHistory,
    type WalletPnlHistoryData,
} from "@sv/services/wallet/wallet-analysis/wallet-pnl-history.js";
import { getWalletPortfolio } from "@sv/services/wallet/walletPortfolio.service.js";
import { getWalletRealizedPnlDescBreakdown } from "@sv/services/wallet/wallet-realized-pnl-desc-breakdown.js";
import { getWinrateData } from "@sv/services/wallet/wallet-analysis.js";
import { getTokenMarketData } from "@sv/services/tokens/token-market-data.js";
import { getTokenMeta, getTokenDetails } from "@sv/services/tokens/token-info.js";
import { searchToken } from "./chat-token-search.js";
import { searchNews, searchWeb } from "./chat-web-search.js";
import { getMobulaChartData, type MobulaTimeframe } from "@sv/services/tokens/mobula-chart-data.js";
import type { ChatToolDefinition, ToolCachePolicy } from "./chat.types.js";
import { compactWalletSwaps, compactWalletTransfers } from "@sv/services/wallet/walletTxCompaction.service.js";
import { washTradingService } from "@sv/services/wash-trading.service.js";
import { composeWalletIntelligence } from "@sv/services/wallet/walletIntelligence.service.js";
import { z } from "zod";

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DETAILED_TX_LIMIT = 100;
const COMPACT_TX_LIMIT = 500;

interface TransactionCoverage {
  limit: number;
  availableCount: number;
  analyzedCount: number;
  returnedCount: number;
  isCapped: boolean;
  hasMore: boolean;
  scope: "complete_filtered_result" | "limited_filtered_sample";
  note: string;
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    name: "get_wallet_overview",
    description:
      "Fetch wallet overview snapshot: current total balance in USD, 24h change, trading volume, token holdings count, activity metrics, and PnL snapshots across fixed periods (24H, 7D, 30D, 90D). Use with get_wallet_realized_pnl_desc_breakdown to identify provider-reported per-token realized PnL drivers, and with get_wallet_portfolio to explain current exposure.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_swaps",
    description:
      "Fetch recent swap transactions for a wallet. Returns list of trades with bought/sold token details, USD value, and timestamps. Supports filtering by token, swap direction, and time range to narrow results.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        limit: { type: "number", description: "Max number of swaps to return (default 20, max 100)" },
        tokenAddress: { type: "string", description: "Token mint address (base58) to filter swaps. NOT the symbol/name. Example: 'So11111111111111111111111111111111111111112' for SOL. Call search_token first if you only have a symbol." },
        type: { type: "string", enum: ["buy", "sell"], description: "Filter by swap direction: buy = token enters wallet, sell = token leaves wallet" },
        fromMs: { type: "number", description: "Start of time window (milliseconds since epoch). Defaults to 30 days ago." },
        toMs: { type: "number", description: "End of time window (milliseconds since epoch). Defaults to now." },
        minAmountUsd: { type: "number", description: "Minimum USD value to include (skips dust transfers)" },
        maxAmountUsd: { type: "number", description: "Maximum USD value to include (excludes large outliers)" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_transfers",
    description:
      "Fetch recent token transfers for a wallet. Returns incoming/outgoing transfers with amount, USD value, token info, and timestamps. Supports filtering by token, direction, amount, and time range to narrow results.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        limit: { type: "number", description: "Max number of transfers to return (default 20, max 100)" },
        tokenAddress: { type: "string", description: "Token mint address (base58) to filter transfers. NOT the symbol/name. Example: 'So11111111111111111111111111111111111111112' for SOL. Call search_token first if you only have a symbol." },
        direction: { type: "string", enum: ["in", "out"], description: "Filter by transfer direction: in = funds arriving, out = funds leaving" },
        fromMs: { type: "number", description: "Start of time window (milliseconds since epoch). Defaults to 30 days ago." },
        toMs: { type: "number", description: "End of time window (milliseconds since epoch). Defaults to now." },
        minAmountUsd: { type: "number", description: "Minimum USD value to include (skips dust transfers)" },
        maxAmountUsd: { type: "number", description: "Maximum USD value to include (excludes large outliers)" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_swaps_compact",
    description:
      "Fetch up to 500 wallet swaps and return a compact aggregate overview by token and buy/sell action. Prefer this for broad trading activity analysis, behavior summaries, and token activity instead of raw trade rows. Pair with get_wallet_realized_pnl_desc_breakdown when the user asks whether trading behavior produced gains or losses.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        limit: { type: "number", description: "Max number of swaps to analyze (default 500, max 500)" },
        tokenAddress: { type: "string", description: "Token mint address (base58) to filter swaps. Call search_token first if you only have a symbol." },
        type: { type: "string", enum: ["buy", "sell"], description: "Filter by swap direction" },
        fromMs: { type: "number", description: "Start of absolute historical time window (milliseconds since epoch)." },
        toMs: { type: "number", description: "End of absolute historical time window (milliseconds since epoch)." },
        minAmountUsd: { type: "number", description: "Minimum USD value to include" },
        maxAmountUsd: { type: "number", description: "Maximum USD value to include" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_transfers_compact",
    description:
      "Fetch up to 500 wallet transfers and return a compact aggregate overview by token and direction. Prefer this for broad funding, deposit/withdrawal, and flow analysis instead of raw transfer rows. Pair with swap/PnL tools when external flows may explain balance or performance changes.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        limit: { type: "number", description: "Max number of transfers to analyze (default 500, max 500)" },
        tokenAddress: { type: "string", description: "Token mint address (base58) to filter transfers. Call search_token first if you only have a symbol." },
        direction: { type: "string", enum: ["in", "out"], description: "Filter by transfer direction" },
        fromMs: { type: "number", description: "Start of absolute historical time window (milliseconds since epoch)." },
        toMs: { type: "number", description: "End of absolute historical time window (milliseconds since epoch)." },
        minAmountUsd: { type: "number", description: "Minimum USD value to include" },
        maxAmountUsd: { type: "number", description: "Maximum USD value to include" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_balance_history",
    description:
      "Fetch wallet balance over time (USD). Returns daily balance data points for trend context, not token-level drivers. Supports time periods (7D, 30D) or custom fromMs/toMs range. Pair with get_wallet_overview for summary metrics or get_drawdown_chart for risk framing.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        timePeriod: {
          type: "string",
          enum: ["7D", "30D"],
          description: "Time period for balance history (default 30D). Ignored if fromMs/toMs are provided.",
        },
        fromMs: { type: "number", description: "Start of time window (epoch ms). Overrides timePeriod when provided." },
        toMs: { type: "number", description: "End of time window (epoch ms). Defaults to now if fromMs is provided." },
      },
      required: ["address"],
    },
  },
  // {
  //   name: "get_trading_volume",
  //   description:
  //     "Fetch daily trading volume (USD) for a wallet. Returns volume data series by date. Useful for volume trend charts.",
  //   input_schema: {
  //     type: "object",
  //     properties: {
  //       address: { type: "string", description: "Solana wallet address (base58)" },
  //       period: {
  //         type: "string",
  //         enum: ["7D", "30D", "60D", "90D", "1Y"],
  //         description: "Time period for volume data (default 30D)",
  //       },
  //     },
  //     required: ["address"],
  //   },
  // },
  {
    name: "get_drawdown_chart",
    description:
      "Fetch drawdown (peak-to-trough decline) chart data for a wallet over time. Returns daily drawdown percentages showing how far the balance has fallen from its most recent peak. Use for risk/stability context, not as a replacement for overview or PnL driver tools. Pair with get_wallet_overview and get_wallet_realized_pnl_desc_breakdown for risk questions.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        timePeriod: {
          type: "string",
          enum: ["7D", "30D"],
          description: "Time period for drawdown data (default 30D). Ignored if fromMs/toMs are provided.",
        },
        fromMs: { type: "number", description: "Start of time window (epoch ms). Overrides timePeriod when provided." },
        toMs: { type: "number", description: "End of time window (epoch ms). Defaults to now if fromMs is provided." },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_realized_pnl_desc_breakdown",
    description:
      "Fetch Mobula per-token positions ordered by realized PnL descending. Use this to identify the most profitable realized-PnL tokens. This dataset is not period-bounded and does not provide ascending/loss ranking.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        limit: { type: "number", description: "Number of top realized-PnL token positions to return (default 20, max 500)" },
        tokenAddress: { type: "string", description: "Optional token mint address to select from the realized-PnL breakdown" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_winrate",
    description:
      "Fetch winrate (win/loss ratio) for a wallet. Returns winrate %, total trades, winning/losing trade counts, and average win/loss amounts in USD. Data is sourced from Mobula for a bounded period. Supports time periods: 24H, 7D, 30D, 90D.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        period: { type: "string", enum: ["24H", "7D", "30D", "90D"], description: "Time period for winrate calculation (default 30D)" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_pnl_history",
    description:
      "Fetch daily PnL time series for a wallet over a fixed period. Returns daily and cumulative PnL plus daily buy/sell swap counts and USD volumes when Mobula provides calendar breakdown data. Periods: 7D, 30D. Compare with get_wallet_realized_pnl_desc_breakdown for token-level realized PnL drivers.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        timePeriod: {
          type: "string",
          enum: ["7D", "30D"],
          description: "Time period for PnL data (default 30D).",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_portfolio",
    description:
      "Fetch current token holdings for a wallet. Returns tokens with amount, USD value, and metadata. Use for current exposure, concentration, and unrealized portfolio context. Pair with get_wallet_overview for balance/activity summary and with get_wallet_realized_pnl_desc_breakdown when holdings may explain gains or losses.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
        minValueUsd: { type: "number", description: "Only include holdings above this USD value threshold" },
        search: { type: "string", description: "Search token by symbol or name (case-insensitive substring)" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_token_price",
    description:
      "Fetch available market data for a token: price in USD, 24h change percentage, market cap, 24h volume, and market cap rank. If current price data is unavailable, return an unavailable result rather than estimating it. When showing this data in a chart spec, PREFER type 'geckoterminal' over 'line'/'area'.",
    input_schema: {
      type: "object",
      properties: {
        tokenAddress: { type: "string", description: "Token mint address (base58)" },
      },
      required: ["tokenAddress"],
    },
  },
  {
    name: "get_token_price_24h",
    description:
      "Fetch 24-hour intra-day price chart for a token. Returns timestamp-price points. In the chart spec, ALWAYS use type 'geckoterminal' (not 'line'/'area') — set tokenAddress to show an interactive iframe. Powered by Mobula.",
    input_schema: {
      type: "object",
      properties: {
        tokenAddress: { type: "string", description: "Token mint address (base58)" },
      },
      required: ["tokenAddress"],
    },
  },
  {
    name: "get_token_price_hourly",
    description:
      "Fetch hourly price chart for a token over a number of days (max 90). Returns hourly timestamp-price points. In the chart spec, ALWAYS use type 'geckoterminal' (not 'line'/'area') — set tokenAddress to show an interactive iframe. Powered by Mobula.",
    input_schema: {
      type: "object",
      properties: {
        tokenAddress: { type: "string", description: "Token mint address (base58)" },
        days: { type: "number", description: "Number of days of hourly data (max 90)" },
      },
      required: ["tokenAddress"],
    },
  },
  {
    name: "get_token_price_daily",
    description:
      "Fetch daily price chart for a token over a number of days (max 365). Returns daily timestamp-price points. In the chart spec, ALWAYS use type 'geckoterminal' (not 'line'/'area') — set tokenAddress to show an interactive iframe. Powered by Mobula.",
    input_schema: {
      type: "object",
      properties: {
        tokenAddress: { type: "string", description: "Token mint address (base58)" },
        days: { type: "number", description: "Number of days of daily data (max 365)" },
      },
      required: ["tokenAddress"],
    },
  },
  {
    name: "get_token_meta",
    description:
      "Fetch token metadata (name, symbol, logo image URL) for a token mint address. Useful for resolving what a token address represents.",
    input_schema: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "Token mint address (base58)",
        },
      },
      required: ["tokenAddress"],
    },
  },
  {
    name: "get_token_details",
    description:
      "Fetch detailed token information including description, links (homepage, discord, twitter, telegram), categories, decimals, and metadata (name, symbol, logo) for a token address.",
    input_schema: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "Token mint address (base58)",
        },
      },
      required: ["tokenAddress"],
    },
  },
  {
    name: "search_token",
    description:
      "Search for a Solana token by symbol or name (case-insensitive). Returns matching tokens with their base58 mint address, symbol, name, and image URL. Use this when you need to resolve a token symbol (e.g. 'SOL', 'USDC', 'BONK') to a base58 mint address before calling other tools.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Token symbol or name to search for (e.g. 'SOL', 'USDC', 'BONK', 'Wojak'). Case-insensitive." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_news",
    description:
      "Search cryptocurrency news articles for current events about a token, project, or market topic. Returns news headlines with links and publication dates. Use this when you need recent news context about a token or project the wallet holds. Not for general web content — use search_web for that.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "News search query (e.g. 'Jupiter aggregator latest news 2025', 'Solana DeFi updates')" },
        count: { type: "number", description: "Number of results (max 10, default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_web",
    description:
      "Search the web for any topic — token analysis, project documentation, market research, technical info, or general knowledge. Returns web page snippets with links. Use this for general web content that news articles wouldn't cover — e.g. project docs, GitHub repos, analysis pieces, announcements. For recent news, prefer search_news.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Web search query (e.g. 'Jupiter DEX documentation', 'BONK tokenomics analysis', 'Solana staking guide 2025')" },
        count: { type: "number", description: "Number of results (max 10, default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "navigate_to_page",
    description:
      "Suggest navigating the user to another page on the site. Call this when the user asks to 'go to', 'show me', 'open', or 'take me to' a wallet, token, market, or transactions page. Returns a suggested navigation action for the frontend to render as a clickable button.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["wallet", "token", "token_history", "market", "transactions"],
          description: "Target page type",
        },
        params: {
          type: "object",
          description: "Route parameters as JSON (e.g. {\"address\": \"...\"} for wallet/token pages, {\"txHash\": \"...\"} for transactions page)",
        },
      },
      required: ["page"],
    },
  },
  {
    name: "get_token_wash_trade_risk",
    description:
      "Detect wash trading patterns for a token: circular trades (A\u2192B\u2192C\u2192A), same-amount transaction clusters, star-topology hub wallets, and volume anomalies (z-score outliers). Returns a risk score (0\u2013100), pattern flags, and GNN-based suspicious wallet scores. Use this when the user asks if a token\u2019s volume is organic, whether wash trading is happening, or to assess token market manipulation risk.",
    input_schema: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "Token mint address (base58) to analyze for wash trading patterns",
        },
      },
      required: ["tokenAddress"],
    },
  },
  {
    name: "get_wallet_intelligence",
    description:
      "Fetch composed wallet intelligence: identity (known entity name/type/category), risk score/level, risk signals (e.g. exchange interactions, high tx count, known/unknown entity), first fund insight (funder, wallet age), and user tags. Use this when the user asks \u2018who owns this wallet?\u2019, \u2018is this wallet risky?\u2019, or for wallet reputation/trust assessment.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Solana wallet address (base58)",
        },
      },
      required: ["address"],
    },
  },
];

// ─── Tool Allowed Keys (derived from definitions) ──────────────────────────

const MULTI_ADDRESS_TOOLS = new Set([
  "get_wallet_swaps", "get_wallet_transfers",
  "get_wallet_swaps_compact", "get_wallet_transfers_compact",
  "get_balance_history", "get_drawdown_chart",
  "get_wallet_realized_pnl_desc_breakdown", "get_wallet_winrate", "get_wallet_pnl_history",
  "get_wallet_portfolio",
  "get_wallet_intelligence",
]);

const EXTRA_ALLOWED_KEYS: Record<string, readonly string[]> = {};

export const TOOL_ALLOWED_KEYS: Record<string, readonly string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const def of TOOL_DEFINITIONS) {
    if (!def.name) continue;
    const keys = Object.keys(def.input_schema.properties);
    if (MULTI_ADDRESS_TOOLS.has(def.name) && !keys.includes("addresses")) {
      keys.push("addresses");
    }
    map[def.name] = keys;
  }
  for (const [name, keys] of Object.entries(EXTRA_ALLOWED_KEYS)) {
    map[name] = [...keys];
  }
  return map;
})();

// ─── Tool Execution ─────────────────────────────────────────────────────────

function extractSwapsForLLM(
  swaps: unknown,
  limit: number,
): unknown {
  if (!swaps || typeof swaps !== "object") return { coverage: buildTransactionCoverage(0, limit), swaps: [] };
  const s = swaps as { swaps?: unknown[]; pageInfo?: { hasMore?: boolean } };
  if (!Array.isArray(s.swaps)) return { coverage: buildTransactionCoverage(0, limit), swaps: [] };
  const hasMore = s.pageInfo?.hasMore ?? false;

  return {
    coverage: buildTransactionCoverage(s.swaps.length, limit, hasMore),
    swaps: s.swaps.slice(0, limit).map((swap) => {
      const r = swap as Record<string, unknown>;
      return {
        txHash: r.transactionHash,
        timestamp: r.blockTimestampIso,
        bought: r.bought,
        sold: r.sold,
        totalValueUsd: r.totalValueUsd,
        dex: r.subcategory,
      };
    }),
  };
}
function extractTransfersForLLM(
  transfers: unknown,
  limit: number,
): unknown {
  if (!transfers || typeof transfers !== "object") return { coverage: buildTransactionCoverage(0, limit), transfers: [] };
  const t = transfers as { transfers?: unknown[]; pageInfo?: { hasMore?: boolean } };
  if (!Array.isArray(t.transfers)) return { coverage: buildTransactionCoverage(0, limit), transfers: [] };
  const hasMore = t.pageInfo?.hasMore ?? false;

  return {
    coverage: buildTransactionCoverage(t.transfers.length, limit, hasMore),
    transfers: t.transfers.slice(0, limit).map((tr) => {
      const r = tr as Record<string, unknown>;
      return {
        from: r.from,
        to: r.to,
        amount: r.amount,
        amountUsd: r.amountUsd,
        token: r.tokenSymbol,
        tokenAddress: r.tokenAddress,
        timestamp: r.timestamp,
      };
    }),
  };
}

export function buildTransactionCoverage(availableCount: number, limit: number, hasMore = false): TransactionCoverage {
  const normalizedLimit = Math.max(1, Math.trunc(limit));
  const analyzedCount = Math.min(availableCount, normalizedLimit);
  const isCapped = availableCount >= normalizedLimit;
  return {
    limit: normalizedLimit,
    availableCount,
    analyzedCount,
    returnedCount: analyzedCount,
    isCapped,
    hasMore,
    scope: isCapped ? "limited_filtered_sample" : "complete_filtered_result",
    note: isCapped
      ? `Analyzed ${analyzedCount}/${availableCount}+ rows — capped at limit (${normalizedLimit}). Do not treat as complete history.`
      : hasMore
        ? `Analyzed all ${analyzedCount} rows for this query window; more exist beyond the query range.`
        : `Analyzed all ${analyzedCount} available rows for this query window.`,
  };
}
function extractPortfolioForLLM(
  portfolio: unknown,
  filters?: {
    minValueUsd?: number;
    search?: string;
  },
): unknown {
  if (!Array.isArray(portfolio)) return [];

  let filtered = portfolio as Record<string, unknown>[];

  if (filters?.minValueUsd != null || filters?.search != null) {
    filtered = filtered.filter((item) => {
      if (filters?.minValueUsd != null) {
        const value = item.valueUsd as number | undefined;
        if (value == null || value < filters.minValueUsd) return false;
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        const symbol = (item.symbol as string ?? "").toLowerCase();
        const name = (item.name as string ?? "").toLowerCase();
        if (!symbol.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }

  filtered = [...filtered].sort((left, right) => {
    const leftValue = Number(left.valueUsd);
    const rightValue = Number(right.valueUsd);
    return (Number.isFinite(rightValue) ? rightValue : 0) -
      (Number.isFinite(leftValue) ? leftValue : 0);
  });

  return filtered.slice(0, 20).map((item) => ({
    token: item.symbol,
    name: item.name,
    amount: item.amount,
    valueUsd: item.valueUsd,
    change24h: item.change24hPercent,
    address: item.tokenAddress,
  }));
}

function extractOverviewForLLM(overview: unknown, address: string): unknown {
  if (!overview || typeof overview !== "object") return null;
  const o = overview as Record<string, unknown>;
  return {
    address,
    totalBalance: o.totalAssetValueUsd,
    holdingsCount: o.tokensHoldingCount,
    tradingVolume24h: o.tradingVolumeUsd24h,
    pnlTotal: o.pnlUsdTotal,
    txCount24h: o.transactionCount24h,
    tokensTraded: o.tokensTradedCount,
    periods: o.periods,
  };
}

function extractBalanceHistoryForLLM(data: unknown, address: string): unknown {
  if (!Array.isArray(data)) return { address, points: [] };
  return {
    address,
    points: data.map((point: Record<string, unknown>) => ({
      date: new Date(point.timestampMs as number).toISOString().slice(0, 10),
      value: point.usdValue,
    })),
  };
}

function extractDrawdownForLLM(data: unknown): unknown {
  if (!Array.isArray(data)) return null;
  const typed = data as Array<{ timestamp: number; value: number; drawdown: number }>;
  if (typed.length === 0) return null;
  const maxDrawdown = Math.min(...typed.map((p) => p.drawdown));
  const latestDrawdown = typed[typed.length - 1]?.drawdown ?? 0;
  return {
    dataPoints: typed.map((p) => ({
      date: new Date(p.timestamp).toISOString().slice(0, 10),
      drawdownPercent: p.drawdown,
    })),
    maxDrawdownPercent: maxDrawdown,
    currentDrawdownPercent: latestDrawdown,
    startDate: new Date(typed[0].timestamp).toISOString().slice(0, 10),
    endDate: new Date(typed[typed.length - 1].timestamp).toISOString().slice(0, 10),
  };
}

function extractPnlHistoryForLLM(data: WalletPnlHistoryData): unknown {
  return {
    walletAddress: data.walletAddress,
    totalPnlUsd: data.totalPnL,
    realizedPnlUsd: data.realizedPnL,
    unrealizedPnlUsd: data.unrealizedPnL,
    dailyPnL: data.dailyPnL.map((point) => ({
      date: new Date(point.timestamp).toISOString().slice(0, 10),
      pnl: point.value,
      buyCount: point.buyCount,
      sellCount: point.sellCount,
      swapCount: point.swapCount,
      buyVolumeUsd: point.buyVolumeUsd,
      sellVolumeUsd: point.sellVolumeUsd,
      totalVolumeUsd: point.totalVolumeUsd,
    })),
    cumulativePnL: data.cumulativePnL.map((point) => ({
      date: new Date(point.timestamp).toISOString().slice(0, 10),
      pnl: point.value,
    })),
  };
}

function extractAuditForLLM(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const a = data as Record<string, unknown>;
  return {
    persona: a.persona,
    trustScore: a.trustScore,
    summary: a.summary,
    observations: a.observations,
    txCount: a.transactionCount,
  };
}

function extractTokenPriceForLLM(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return null;
  const tokenAddress = keys[0];
  const entry = record[tokenAddress] as Record<string, unknown> | undefined;
  if (!entry) return null;
  return {
    tokenAddress,
    priceUsd: entry.priceUsd,
    change24hPercent: entry.priceChangePercentage24h,
    marketCap: entry.marketCap,
    volume24hUsd: entry.volume24h,
    marketCapRank: entry.marketCapRank,
  };
}

function extractChartForLLM(data: unknown, tokenAddress?: string): unknown {
  if (!Array.isArray(data)) return { tokenAddress, points: [] };
  return {
    tokenAddress,
    points: data.slice(0, 500).map((point: Record<string, unknown>) => ({
      timestamp: point.unixTimestampMs,
      price: point.price,
      marketCap: point.marketCap,
      volume: point.totalVolume,
    })),
  };
}

function extractWinrateForLLM(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const r = data as { wallets?: unknown[] };
  if (!Array.isArray(r.wallets) || r.wallets.length === 0) return null;
  const w = r.wallets[0] as Record<string, unknown>;
  return {
    winrate: w.winrate,
    totalTrades: w.totalTrades,
    winningTrades: w.winningTrades,
    losingTrades: w.losingTrades,
    avgWinUsd: w.avgWinUsd,
    avgLossUsd: w.avgLossUsd,
  };
}

const ROUTE_MAP: Record<string, (params?: Record<string, string>) => { path: string; label: string }> = {
  wallet: (params) => ({ path: `/wallets/${params?.address ?? ""}`, label: "View Wallet" }),
  token: (params) => ({ path: `/tokens/${params?.address ?? ""}`, label: "View Token" }),
  token_history: (params) => ({ path: `/historical-data/${params?.address ?? ""}`, label: "View Historical Data" }),
  market: () => ({ path: "/market", label: "Go to Market" }),
  transactions: (params) => ({
    path: params?.txHash ? `/transactions/${params.txHash}` : "/transactions",
    label: params?.txHash ? "View Transaction" : "View Transactions",
  }),
};

function extractNavigationForLLM(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const d = data as { path?: string; label?: string };
  return { path: d.path ?? "", label: d.label ?? "" };
}

function extractTokenMetaForLLM(data: unknown): unknown {
  if (!Array.isArray(data)) return [];
  return data.map((m: Record<string, unknown>) => ({
    address: m.address,
    name: m.name,
    symbol: m.symbol,
    imageUrl: m.imageUrl,
  }));
}

function extractTokenDetailsForLLM(data: unknown): unknown {
  if (!Array.isArray(data) || data.length === 0) return null;
  const item = data[0] as Record<string, unknown> | undefined;
  if (!item) return null;
  const meta = item.meta as Record<string, unknown> | undefined;
  const details = item.details as Record<string, unknown> | undefined;
  if (!meta || !details) return null;
  return {
    address: meta.address,
    name: meta.name,
    symbol: meta.symbol,
    imageUrl: meta.imageUrl,
    decimals: details.decimals,
    description: details.description,
    homepage: details.linkHomepage,
    discord: details.linkDiscord,
    twitter: details.twitterScreenName,
    telegram: details.telegramChannel,
    categories: details.categories,
  };
}

function extractWashTradeForLLM(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
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
    suspiciousWalletCount: d.suspiciousWallets?.length ?? 0,
    topSuspiciousWallets: (d.suspiciousWallets ?? []).slice(0, 5).map((w) => ({
      wallet: w.wallet,
      confidence: w.confidence,
      pattern: w.pattern,
      gnnScore: w.gnnScore,
    })),
  };
}

function extractIntelligenceForLLM(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const d = data as {
    address?: string;
    identity?: {
      status?: string;
      category?: string | null;
      type?: string | null;
      name?: string | null;
      tags?: string[];
    };
    analysis?: {
      riskScore?: number;
      riskLevel?: string;
      signals?: string[];
      firstFund?: {
        funderLabel?: string | null;
        funderAddress?: string | null;
        walletAgeLabel?: string | null;
        walletAgeDays?: number | null;
        firstFundDate?: string | null;
      } | null;
    };
  };
  return {
    address: d.address,
    identity: {
      status: d.identity?.status ?? "unknown",
      category: d.identity?.category ?? null,
      type: d.identity?.type ?? null,
      name: d.identity?.name ?? null,
      tags: d.identity?.tags ?? [],
    },
    analysis: {
      riskScore: d.analysis?.riskScore ?? 50,
      riskLevel: d.analysis?.riskLevel ?? "medium",
      signals: d.analysis?.signals ?? [],
      firstFund: d.analysis?.firstFund ?? null,
    },
  };
}

// ─── Handler Map ────────────────────────────────────────────────────────────

const fromToMsRefinement = <T extends { fromMs?: number; toMs?: number }>(
  input: T,
): boolean => input.fromMs == null || input.toMs == null || input.fromMs < input.toMs;

const swapsFilterSchema = z.object({
  address: z.string().min(1),
  limit: z.number().int().positive().max(DETAILED_TX_LIMIT).optional().default(20),
  tokenAddress: z.string().regex(BASE58_REGEX, "Must be a valid base58 token mint address").optional(),
  type: z.enum(["buy", "sell"]).optional(),
  fromMs: z.number().optional(),
  toMs: z.number().optional(),
  minAmountUsd: z.number().optional(),
  maxAmountUsd: z.number().optional(),
}).refine(fromToMsRefinement, { message: "fromMs must be less than toMs" });

const transfersFilterSchema = z.object({
  address: z.string().min(1),
  limit: z.number().int().positive().max(DETAILED_TX_LIMIT).optional().default(20),
  tokenAddress: z.string().regex(BASE58_REGEX, "Must be a valid base58 token mint address").optional(),
  direction: z.enum(["in", "out"]).optional(),
  fromMs: z.number().optional(),
  toMs: z.number().optional(),
  minAmountUsd: z.number().optional(),
  maxAmountUsd: z.number().optional(),
}).refine(fromToMsRefinement, { message: "fromMs must be less than toMs" });

const compactSwapsFilterSchema = swapsFilterSchema.safeExtend({
  limit: z.number().int().positive().max(COMPACT_TX_LIMIT).optional().default(COMPACT_TX_LIMIT),
});

const compactTransfersFilterSchema = transfersFilterSchema.safeExtend({
  limit: z.number().int().positive().max(COMPACT_TX_LIMIT).optional().default(COMPACT_TX_LIMIT),
});

const portfolioFilterSchema = z.object({
  address: z.string().min(1),
  minValueUsd: z.number().optional(),
  search: z.string().optional(),
});

const periodSchema = z.object({
  address: z.string().min(1),
  timePeriod: z.enum(["7D", "30D"]).optional().default("30D"),
  fromMs: z.number().optional(),
  toMs: z.number().optional(),
}).refine(fromToMsRefinement, { message: "fromMs must be less than toMs" });

const addressOnlySchema = z.object({
  address: z.string().min(1),
});

const tokenAddressSchema = z.object({
  tokenAddress: z.string().regex(BASE58_REGEX, "Must be a valid base58 token mint address"),
});

const tokenAddressDaysSchema = z.object({
  tokenAddress: z.string().regex(BASE58_REGEX, "Must be a valid base58 token mint address"),
  days: z.number().int().positive().max(365).optional().default(7),
});

const navigatePageSchema = z.object({
  page: z.enum(["wallet", "token", "token_history", "market", "transactions"]),
  params: z.object({
    address: z.string().optional(),
    txHash: z.string().optional(),
  }).optional().default({}),
});

export const TOOL_HANDLERS: Record<
  string,
  (input: Record<string, unknown>) => Promise<{ data: unknown; llmData: unknown }>
> = {
  get_wallet_overview: async (input) => {
    const { address } = addressOnlySchema.parse(input);
    const data = await getWalletOverview(address);
    return { data, llmData: extractOverviewForLLM(data, address) };
  },

  get_wallet_swaps: async (input) => {
    const { address, limit, tokenAddress, type, fromMs, toMs, minAmountUsd, maxAmountUsd } = swapsFilterSchema.parse(input);
    const data = await getWalletSwaps(address, fromMs, toMs, tokenAddress, type, minAmountUsd, maxAmountUsd);
    const coverage = buildTransactionCoverage(data.swaps.length, limit, data.pageInfo?.hasMore);
    const limited = data.swaps.slice(0, limit);
    return { data: { ...data, swaps: limited, coverage }, llmData: extractSwapsForLLM(data, limit) };
  },

  get_wallet_transfers: async (input) => {
    const { address, limit, tokenAddress, direction, fromMs, toMs, minAmountUsd, maxAmountUsd } = transfersFilterSchema.parse(input);
    const data = await getWalletTransfers(address, fromMs, toMs, tokenAddress, direction, minAmountUsd, maxAmountUsd);
    const coverage = buildTransactionCoverage(data.transfers.length, limit, data.pageInfo?.hasMore);
    const limited = data.transfers.slice(0, limit);
    return { data: { ...data, transfers: limited, coverage }, llmData: extractTransfersForLLM(data, limit) };
  },

  get_wallet_swaps_compact: async (input) => {
    const { address, limit, tokenAddress, type, fromMs, toMs, minAmountUsd, maxAmountUsd } = compactSwapsFilterSchema.parse(input);
    const data = await getWalletSwaps(address, fromMs, toMs, tokenAddress, type, minAmountUsd, maxAmountUsd);
    const coverage = buildTransactionCoverage(data.swaps.length, limit, data.pageInfo?.hasMore);
    const limited = data.swaps.slice(0, limit);
    const isCapped = coverage.isCapped || coverage.hasMore;
    const coveragePercent = coverage.availableCount > 0 ? Math.round((coverage.analyzedCount / coverage.availableCount) * 100) : 100;
    const coverageSummary = isCapped
      ? `${coverage.analyzedCount} of \u2265${coverage.availableCount} swaps (\u2264${Math.min(coveragePercent, 100)}%)`
      : `All ${coverage.analyzedCount} swaps`;
    const compact = {
      ...compactWalletSwaps(limited), coverage, analyzedTrades: coverage.analyzedCount,
      availableTrades: coverage.availableCount, coverageSummary, coveragePercent: Math.min(coveragePercent, 100),
    };
    return { data: { ...data, swaps: limited, coverage, compact }, llmData: compact };
  },
  get_wallet_transfers_compact: async (input) => {
    const { address, limit, tokenAddress, direction, fromMs, toMs, minAmountUsd, maxAmountUsd } = compactTransfersFilterSchema.parse(input);
    const data = await getWalletTransfers(address, fromMs, toMs, tokenAddress, direction, minAmountUsd, maxAmountUsd);
    const coverage = buildTransactionCoverage(data.transfers.length, limit, data.pageInfo?.hasMore);
    const limited = data.transfers.slice(0, limit);
    const isCapped = coverage.isCapped || coverage.hasMore;
    const coveragePercent = coverage.availableCount > 0 ? Math.round((coverage.analyzedCount / coverage.availableCount) * 100) : 100;
    const coverageSummary = isCapped
      ? `${coverage.analyzedCount} of \u2265${coverage.availableCount} transfers (\u2264${Math.min(coveragePercent, 100)}%)`
      : `All ${coverage.analyzedCount} transfers`;
    const compact = {
      ...compactWalletTransfers(limited, address), coverage, analyzedTransfers: coverage.analyzedCount,
      availableTransfers: coverage.availableCount, coverageSummary, coveragePercent: Math.min(coveragePercent, 100),
    };
    return { data: { ...data, transfers: limited, coverage, compact }, llmData: compact };
  },
  get_balance_history: async (input) => {
    const { address, timePeriod, fromMs, toMs } = periodSchema.parse(input);
    const data = await getWalletBalanceHistory(address, timePeriod, fromMs, toMs);
    return { data, llmData: extractBalanceHistoryForLLM(data, address) };
  },

  get_drawdown_chart: async (input) => {
    const { address, timePeriod, fromMs, toMs } = periodSchema.parse(input);
    const balanceHistory = await getWalletBalanceHistory(address, timePeriod, fromMs, toMs);
    if (!balanceHistory?.length) {
      return { data: [], llmData: null };
    }

    let peak = balanceHistory[0].usdValue;
    let trough = balanceHistory[0].usdValue;
    const data = balanceHistory.map((point) => {
      if (point.usdValue > peak) { peak = point.usdValue; trough = point.usdValue; }
      if (point.usdValue < trough) { trough = point.usdValue; }
      const drawdown = peak === 0 ? 0 : (point.usdValue - peak) / peak;
      return {
        timestamp: point.timestampMs,
        date: new Date(point.timestampMs).toISOString(),
        value: point.usdValue,
        drawdown,
      };
    });

    return { data, llmData: extractDrawdownForLLM(data) };
  },

  get_wallet_realized_pnl_desc_breakdown: async (input) => {
    const { address, limit, tokenAddress } = z.object({
      address: z.string().min(1),
      limit: z.number().int().positive().max(500).optional().default(20),
      tokenAddress: z.string().regex(BASE58_REGEX, "Must be a valid base58 token mint address").optional(),
    }).parse(input);
    const stored = await getWalletRealizedPnlDescBreakdown(address) ?? [];
    const data = (tokenAddress
      ? stored.filter((row) => row.tokenAddress == tokenAddress)
      : stored
    ).slice(0, limit);
    const realizedPnlUsd = data.reduce(
      (total, row) => total + row.realizedProfitUsd,
      0,
    );
    const tradeCount = data.reduce(
      (total, row) => total + row.totalTradeCount,
      0,
    );
    const totalBoughtUsd = data.reduce(
      (total, row) => total + row.totalBoughtUsd,
      0,
    );
    const totalSoldUsd = data.reduce(
      (total, row) => total + row.totalSoldUsd,
      0,
    );
    const top = data[0];
    return {
      data,
      llmData: {
        source: "mobula_wallet_positions",
        ordering: "realized_pnl_desc",
        aggregateScope: `top_${data.length}_returned_tokens`,
        realizedPnlUsd,
        tradeCount,
        totalBoughtUsd,
        totalSoldUsd,
        topProfitable: top
          ? {
              tokenAddress: top.tokenAddress,
              token: top.symbol,
              pnlUsd: top.realizedProfitUsd,
            }
          : null,
        tokenBreakdowns: data.map((row) => ({
          tokenAddress: row.tokenAddress,
          token: row.symbol,
          realizedPnlUsd: row.realizedProfitUsd,
          unrealizedPnlUsd: row.unrealizedProfitUsd,
          totalPnlUsd: row.realizedProfitUsd + row.unrealizedProfitUsd,
          trades: row.totalTradeCount,
          totalBoughtUsd: row.totalBoughtUsd,
          totalSoldUsd: row.totalSoldUsd,
        })),
      },
    };
  },

  get_wallet_winrate: async (input) => {
    const { address, period } = z.object({
      address: z.string().min(1),
      period: z.enum(["24H", "7D", "30D", "90D"]).optional().default("30D"),
    }).parse(input);
    const data = await getWinrateData([address], period);
    return { data, llmData: extractWinrateForLLM(data) };
  },

  get_wallet_pnl_history: async (input) => {
    const { address, timePeriod } = z.object({
      address: z.string().min(1),
      timePeriod: z.enum(["7D", "30D"]).optional().default("30D"),
    }).parse(input);
    const data = await getWalletPnlHistory(address, timePeriod);
    return { data, llmData: extractPnlHistoryForLLM(data) };
  },

  // get_top_tokens: async (input) => {
  //   const { address } = addressOnlySchema.parse(input);
  //   const data = await getWalletPortfolio(address);
  //   return { data, llmData: extractPortfolioForLLM(data) };
  // },

  get_wallet_audit: async (input) => {
    const { address } = addressOnlySchema.parse(input);
    const { getWalletAudit } = await import(
      "@sv/services/wallet/walletAudit.service.js"
    );
    const data = await getWalletAudit(address);
    return { data, llmData: extractAuditForLLM(data) };
  },

  get_wallet_portfolio: async (input) => {
    const { address, minValueUsd, search } = portfolioFilterSchema.parse(input);
    const data = await getWalletPortfolio(address);
    return { data, llmData: extractPortfolioForLLM(data, { minValueUsd, search }) };
  },

  get_token_price: async (input) => {
    const { tokenAddress } = tokenAddressSchema.parse(input);
    const data = await getTokenMarketData([tokenAddress]);
    return { data, llmData: extractTokenPriceForLLM(data) };
  },

  get_token_price_24h: async (input) => {
    const { tokenAddress } = tokenAddressSchema.parse(input);
    const data = await getMobulaChartData(tokenAddress, "24h");
    return { data, llmData: extractChartForLLM(data, tokenAddress) };
  },

  get_token_price_hourly: async (input) => {
    const { tokenAddress, days } = tokenAddressDaysSchema.parse(input);
    const tf: MobulaTimeframe = days <= 7 ? "7d" : days <= 30 ? "30d" : "1y";
    const data = await getMobulaChartData(tokenAddress, tf);
    return { data, llmData: extractChartForLLM(data, tokenAddress) };
  },

  get_token_price_daily: async (input) => {
    const { tokenAddress, days } = tokenAddressDaysSchema.parse(input);
    const tf: MobulaTimeframe = days <= 30 ? "30d" : "1y";
    const data = await getMobulaChartData(tokenAddress, tf);
    return { data, llmData: extractChartForLLM(data, tokenAddress) };
  },

  get_token_meta: async (input) => {
    const { tokenAddress } = tokenAddressSchema.parse(input);
    const data = await getTokenMeta([tokenAddress]);
    return { data, llmData: extractTokenMetaForLLM(data) };
  },

  get_token_details: async (input) => {
    const { tokenAddress } = tokenAddressSchema.parse(input);
    const data = await getTokenDetails([tokenAddress]);
    return { data, llmData: extractTokenDetailsForLLM(data) };
  },

  search_token: async (input) => {
    const { query } = z.object({
      query: z.string().min(1, "Search query is required"),
    }).parse(input);
    const data = await searchToken(query);
    return { data, llmData: data };
  },

  search_news: async (input) => {
    const { query, count } = z.object({
      query: z.string().min(1, "Search query is required"),
      count: z.number().int().min(1).max(10).optional().default(5),
    }).parse(input);
    const data = await searchNews(query, count);
    return { data, llmData: data.articles };
  },

  search_web: async (input) => {
    const { query, count } = z.object({
      query: z.string().min(1, "Search query is required"),
      count: z.number().int().min(1).max(10).optional().default(5),
    }).parse(input);
    const data = await searchWeb(query, count);
    return { data, llmData: data.articles };
  },

  navigate_to_page: async (input) => {
    const { page, params } = navigatePageSchema.parse(input);
    const resolved = ROUTE_MAP[page](params);
    return { data: resolved, llmData: extractNavigationForLLM(resolved) };
  },
  get_token_wash_trade_risk: async (input) => {
    const { tokenAddress } = tokenAddressSchema.parse(input);
    const data = await washTradingService.analyzeWashTrading(tokenAddress);
    return { data, llmData: extractWashTradeForLLM(data) };
  },

  get_wallet_intelligence: async (input) => {
    const { address } = addressOnlySchema.parse(input);
    const data = await composeWalletIntelligence(address);
    return { data, llmData: extractIntelligenceForLLM(data) };
  },
};

// ─── Cache Policy ────────────────────────────────────────────────────────────

/**
 * Per-tool cache TTL + cacheability policy.
 * Used by chat.cache.ts to compute effective cache expiry.
 */
export const TOOL_CACHE_POLICY: Record<string, ToolCachePolicy> = {
  // Price data — very volatile
  get_token_price: { ttlMs: 10_000, cacheable: true },
  get_token_price_24h: { ttlMs: 30_000, cacheable: true },
  get_token_price_hourly: { ttlMs: 60_000, cacheable: true },
  get_token_price_daily: { ttlMs: 120_000, cacheable: true },
  // Web/news — live external, never cache
  search_web: { ttlMs: 0, cacheable: false },
  search_news: { ttlMs: 0, cacheable: false },
  // On-chain wallet data — stable, medium TTL
  get_wallet_swaps: { ttlMs: 300_000, cacheable: true },
  get_wallet_transfers: { ttlMs: 300_000, cacheable: true },
  get_wallet_swaps_compact: { ttlMs: 300_000, cacheable: true },
  get_wallet_transfers_compact: { ttlMs: 300_000, cacheable: true },
  get_wallet_realized_pnl_desc_breakdown: { ttlMs: 300_000, cacheable: true },
  get_wallet_winrate: { ttlMs: 300_000, cacheable: true },
  get_wallet_pnl_history: { ttlMs: 300_000, cacheable: true },
  get_wallet_audit: { ttlMs: 300_000, cacheable: true },
  // Wallet data — short TTL
  get_wallet_overview: { ttlMs: 60_000, cacheable: true },
  get_balance_history: { ttlMs: 60_000, cacheable: true },
  get_wallet_portfolio: { ttlMs: 30_000, cacheable: true },
  // Token metadata — very stable
  get_token_meta: { ttlMs: 600_000, cacheable: true },
  get_token_details: { ttlMs: 600_000, cacheable: true },
  search_token: { ttlMs: 600_000, cacheable: true },
  // Navigation — static
  navigate_to_page: { ttlMs: 600_000, cacheable: true },
  // On-chain + wash trading analysis — medium TTL
  get_token_wash_trade_risk: { ttlMs: 300_000, cacheable: true },
  // Wallet intelligence — medium TTL (identity data changes slowly)
  get_wallet_intelligence: { ttlMs: 300_000, cacheable: true },
};

/**
 * Compute effective cache TTL from a set of tools used.
 * Returns null if any tool is uncacheable.
 */
export function getEffectiveCacheTtl(tools: string[]): number | null {
  if (tools.length === 0) return 30_000; // direct-answer TTL
  let minTtl = Infinity;
  for (const name of tools) {
    const policy = TOOL_CACHE_POLICY[name];
    if (!policy || !policy.cacheable) return null;
    if (policy.ttlMs < minTtl) minTtl = policy.ttlMs;
  }
  return minTtl;
}

/**
 * Returns true if the set of tools includes any uncacheable tool.
 */
export function hasUncacheableTools(tools: string[]): boolean {
  return tools.some((name) => {
    const policy = TOOL_CACHE_POLICY[name];
    return !policy || !policy.cacheable;
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────

export function findTool(name: string): ChatToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export function hasTool(name: string): boolean {
  return name in TOOL_HANDLERS;
}

const WALLET_SCOPED_TOOLS = new Set([
  "get_wallet_overview",
  "get_wallet_swaps",
  "get_wallet_transfers",
  "get_wallet_swaps_compact",
  "get_wallet_transfers_compact",
  "get_balance_history",
  "get_drawdown_chart",
  "get_wallet_realized_pnl_desc_breakdown",
  "get_wallet_winrate",
  "get_wallet_pnl_history",
  "get_wallet_portfolio",
  "get_wallet_audit",
  "get_wallet_intelligence",
]);

export function isWalletTool(name: string): boolean {
  return WALLET_SCOPED_TOOLS.has(name);
}
