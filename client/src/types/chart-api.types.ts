/**
 * Chart API Response Types
 *
 * Defines TypeScript interfaces for API endpoint responses.
 *
 * @module chart-api.types
 */

import type { DistributionPoint, TimeSeriesPoint } from "./chart-data.types";

export interface BalanceRequestParams extends ChartResponseBase {
  /** Time period filter */
  timePeriod?: string;

  /** Comma-separated token list */
  tokens?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  /** Timezone for timestamp formatting */
  timezone?: string;

  /** Aggregation level */
  aggregation?: "hourly" | "daily" | "weekly" | "monthly";

  [key: string]: string | number | undefined;
}

/**
 * Base interface for all responses
 */
export interface ChartResponseBase {
  _base?: never;
}

/**
 * Common API response metadata
 */
export interface ApiResponseMetadata extends ChartResponseBase {
  /** Display currency (e.g., 'USD') */
  currency?: string;

  /** Timezone used for timestamps */
  timezone?: string;

  /** Data aggregation granularity */
  aggregation?: "hourly" | "daily" | "weekly" | "monthly";

  /** Response timestamp */
  timestamp?: number;
}

/**
 * Balance trend API response
 * GET /api/charts/balance
 */
export interface BalanceTrendResponse extends ChartResponseBase {
  /** Data series for each token or wallet */
  series: {
    /** Token symbol, wallet identifier, or "Total" */
    name: string;

    /** Time series data points */
    data: TimeSeriesPoint[];

    /** ECharts series render type */
    seriesType?: "line" | "bar";

    /** Unit of the series values */
    unit?: "TOKEN" | "USD";
  }[];

  /** Wallet addresses when multi-wallet view (optional) */
  wallets?: string[];

  /** Response metadata */
  metadata: ApiResponseMetadata & {
    currency: string;
    timezone: string;
    aggregation: string;
    mode?: "total" | "token" | "composite";
    tokens?: string[];
    primaryYAxis?: "TOKEN" | "USD";
    tokenMeta?: Record<
      string,
      {
        symbol: string;
        logoUri?: string;
        tokenAddress?: string;
      }
    >;
    walletMeta?: Record<
      string,
      {
        label: string;
        identityName?: string;
      }
    >;
  };
}

/**
 * Asset distribution API response
 * GET /api/charts/distribution
 *
 * Returns either aggregated data (when no wallets or single wallet)
 * or per-wallet data (when multiple wallets specified)
 */
/**
 * Additive metadata fields included in enriched distribution points.
 * All fields are optional to maintain backward-compatibility with
 * legacy payloads that do not carry enriched token data.
 */
export interface DistributionPointMeta {
  /** Raw token holding amount */
  rawAmount?: number;
  /** On-chain token address */
  tokenAddress?: string;
  /** Token ticker symbol */
  symbol?: string;
  /** Logo image URL – may be absent if metadata enrichment was unavailable */
  logoUri?: string;
}

export interface AssetDistributionResponse extends ChartResponseBase {
  /** Distribution data points (for aggregated/single wallet) */
  data?: (DistributionPoint & {
    /** Percentage of total (calculated) */
    percentage: number;
  } & DistributionPointMeta)[];

  /** Total portfolio value (for aggregated/single wallet) */
  totalValue?: number;

  /** Per-wallet distribution data (for multiple wallets) */
  wallets?: {
    /** Wallet address */
    walletAddress: string;

    /** Distribution data for this wallet */
    data: (DistributionPoint & {
      /** Percentage of total (calculated) */
      percentage: number;
    } & DistributionPointMeta)[];

    /** Total value for this wallet */
    totalValue: number;
  }[];

  /** Response metadata */
  metadata: {
    currency: string;
    timestamp: number;
  };
}

/**
 * P&L chart API response
 * GET /api/charts/pnl
 *
 * Returns either aggregated data (when no wallets or single wallet)
 * or per-wallet data (when multiple wallets specified)
 */
export interface PnLChartResponse extends ChartResponseBase {
  /** Daily P&L data (for aggregated/single wallet) */
  dailyPnL?: TimeSeriesPoint[];

  /** Cumulative P&L data (for aggregated/single wallet) */
  cumulativePnL?: TimeSeriesPoint[];

  /** Per-wallet P&L data (for multiple wallets) */
  wallets?: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName?: string;

    /** Daily P&L data for this wallet */
    dailyPnL: TimeSeriesPoint[];

    /** Cumulative P&L data for this wallet */
    cumulativePnL: TimeSeriesPoint[];

    /** Start balance for this wallet */
    startBalance: number;

    /** End balance for this wallet */
    endBalance: number;
  }[];

  /** Response metadata */
  metadata: {
    currency: string;
    startBalance?: number;
    endBalance?: number;
  };
}

/**
 * Transaction distribution API response
 * GET /api/charts/transactions/distribution
 */
export interface TransactionDistributionResponse extends ChartResponseBase {
  /** Transaction count by wallet over time */
  transactionCounts: {
    /** Wallet identifier */
    walletId: string;

    /** Wallet display name */
    walletName: string;

    /** Time series data */
    data: TimeSeriesPoint[];
  }[];

  /** Unique token counts per day */
  uniqueTokenCounts: TimeSeriesPoint[];

  /** Response metadata */
  metadata: {
    period: string;
    transactionType: string;
  };
}

/**
 * Holding durations API response
 * GET /api/charts/holdings
 */
export interface HoldingDurationsResponse extends ChartResponseBase {
  /** Holdings data by wallet */
  wallets: {
    /** Wallet identifier */
    id: string;

    /** Wallet display name */
    name: string;

    /** Holdings data */
    holdings: {
      /** Token symbol */
      tokenSymbol: string;

      /** Holding duration in days */
      durationDays: number;
    }[];
  }[];

  /** Response metadata */
  metadata: {
    unit: "days" | "weeks" | "months";
  };
}

/**
 * Volume benchmark API response
 * GET /api/charts/volume-benchmark
 */
export interface VolumeBenchmarkResponse extends ChartResponseBase {
  /** Volume data for each wallet */
  wallets: {
    /** Wallet identifier */
    id: string;

    /** Wallet display name */
    name: string;

    /** Time series data points with volume */
    dataPoints: {
      /** Timestamp in milliseconds */
      timestamp: number;

      /** Trading volume in USD */
      volume: number;
    }[];
  }[];

  /** Response metadata */
  metadata: {
    period: string;
    currency: string;
    timezone: string;
  };
}

/**
 * Trading volume distribution API response
 * GET /api/charts/trading-volume-distribution
 *
 * Returns trading volume distribution by token for each wallet
 */
export interface TradingVolumeDistributionResponse extends ChartResponseBase {
  /** Per-wallet trading volume distribution data */
  wallets: {
    /** Wallet address */
    walletAddress: string;

    /** Distribution data for this wallet */
    data: (DistributionPoint & {
      /** Percentage of total trading volume (calculated) */
      percentage: number;
    })[];

    /** Total trading volume for this wallet */
    totalVolume: number;
  }[];

  /** Response metadata */
  metadata: {
    currency: string;
    timestamp: number;
  };
}

/**
 * Box plot data point (min, Q1, median, Q3, max)
 */
export interface BoxPlotDataPoint {
  /** Minimum value */
  min: number;
  /** First quartile (25th percentile) */
  q1: number;
  /** Median (50th percentile) */
  median: number;
  /** Third quartile (75th percentile) */
  q3: number;
  /** Maximum value */
  max: number;
}

/**
 * Trading volume per transaction API response
 * GET /api/charts/trading-volume-per-transaction
 *
 * Returns box plot data for trading volume per transaction by wallet and type
 */
export interface TradingVolumePerTransactionResponse extends ChartResponseBase {
  /** Per-wallet trading volume per transaction data */
  wallets: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName: string;

    /** Deposit transaction statistics */
    deposit: BoxPlotDataPoint;

    /** Withdrawal transaction statistics */
    withdraw: BoxPlotDataPoint;

    /** Total transaction count */
    transactionCount: number;
  }[];

  /** Response metadata */
  metadata: {
    currency: string;
    period: string;
    timestamp: number;
  };
}

/**
 * Rolling annual return API response
 * GET /api/charts/rolling-annual-return
 *
 * Returns rolling annual return data with cumulative values over time.
 * Supports either aggregated data (when no wallets or single wallet)
 * or per-wallet data (when multiple wallets specified)
 */
export interface RollingAnnualReturnResponse extends ChartResponseBase {
  /** Rolling annual return data points (for aggregated/single wallet) */
  rollingReturn?: TimeSeriesPoint[];

  /** Cumulative return data points (for aggregated/single wallet) */
  cumulativeReturn?: TimeSeriesPoint[];

  /** Per-wallet rolling annual return data (for multiple wallets) */
  wallets?: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName?: string;

    /** Rolling annual return data points for this wallet */
    rollingReturn: TimeSeriesPoint[];

    /** Cumulative return data points for this wallet */
    cumulativeReturn: TimeSeriesPoint[];

    /** Start return for this wallet */
    startReturn: number;

    /** End return for this wallet */
    endReturn: number;

    /** Total return percentage for this wallet */
    totalReturnPercent: number;
  }[];

  /** Response metadata */
  metadata: {
    currency: string;
    timeUnit: "month" | "quarter" | "year" | "custom";
    windowSize?: number; // For custom time unit (in days)
    startReturn?: number;
    endReturn?: number;
    totalReturnPercent?: number;
  };
}

/**
 * Rolling Profit & Loss (period-based) API response
 *
 * Some backends return period-summary P&L (not timeseries). This normalized
 * shape represents either a per-wallet array of metrics or an aggregated metrics object.
 */
export interface RollingProfitAndLossWalletMetrics {
  total?: number;
  realized?: number;
  unrealized?: number;
}

export interface RollingProfitAndLossWallet {
  walletAddress: string;
  walletName?: string;
  metrics: RollingProfitAndLossWalletMetrics;
}

export interface RollingProfitAndLossResponse extends ChartResponseBase {
  /** Per-wallet metrics when multiple wallets are returned */
  wallets?: RollingProfitAndLossWallet[];

  /** Aggregated/summary metrics when backend returns an aggregated object */
  metrics?: RollingProfitAndLossWalletMetrics;

  metadata: {
    timestamp: number;
    currency?: string;
    availableValueTypes: ("total" | "realized" | "unrealized")[];
  };
}

/**
 * Average rolling annual return API response
 * GET /api/charts/average-rolling-annual-return
 *
 * Returns box plot data for average rolling annual returns by wallet
 */
export interface AverageRollingAnnualReturnResponse extends ChartResponseBase {
  /** Per-wallet rolling annual return statistics */
  wallets: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName: string;

    /** Rolling annual return statistics */
    returns: BoxPlotDataPoint;

    /** Average annual return percentage */
    averageReturn: number;
  }[];

  /** Response metadata */
  metadata: {
    period: string;
    timeUnit: "month" | "quarter" | "year" | "custom";
    windowSize?: number; // For custom time unit (in days)
    timestamp: number;
  };
}

/**
 * Generic API error response
 */
export interface ApiErrorResponse extends ChartResponseBase {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Detailed error information */
  details?: unknown;

  /** Timestamp of error */
  timestamp: number;
}

/**
 * API request parameters for distribution endpoint
 */
export interface DistributionRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for P&L endpoint
 */
export interface PnLRequestParams extends ChartResponseBase {
  /** Fixed time period for P&L endpoint */
  period?: "7D" | "30D";

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for transaction distribution endpoint
 */
export interface TransactionDistributionRequestParams
  extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  /** Transaction type filter */
  type?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for holdings endpoint
 */
export interface HoldingsRequestParams extends ChartResponseBase {
  /** Comma-separated wallet list */
  wallets?: string;

  /** Limit to top N tokens */
  limit?: number;

  /** Time unit for duration */
  unit?: "days" | "weeks" | "months";

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for volume benchmark endpoint
 */
export interface VolumeBenchmarkRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}

/**
 * Price history API response
 * GET /api/charts/price-history
 */
export interface PriceHistoryResponse extends ChartResponseBase {
  /** Price data series for each token */
  series: {
    /** Token symbol */
    symbol: string;

    /** Token name */
    name: string;

    /** Time series price data points */
    data: TimeSeriesPoint[];
  }[];

  /** Response metadata */
  metadata: ApiResponseMetadata & {
    currency: string;
    timezone: string;
    aggregation: string;
  };
}

/**
 * API request parameters for price history endpoint
 */
export interface PriceHistoryRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated token list */
  tokens?: string;

  /** Aggregation level */
  aggregation?: "hourly" | "daily" | "weekly" | "monthly";

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for trading volume distribution endpoint
 */
export interface TradingVolumeDistributionRequestParams
  extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for trading volume per transaction endpoint
 */
export interface TradingVolumePerTransactionRequestParams
  extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  /** Transaction type filter: 'all', 'deposits', 'withdrawals' */
  type?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for rolling annual return endpoint
 */
export interface RollingAnnualReturnRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  /** Time unit for rolling window: 'month', 'quarter', 'year', or 'custom' */
  timeUnit?: "month" | "quarter" | "year" | "custom";

  /** Window size in days (for custom time unit) */
  windowSize?: number;

  /** Timezone string */
  timezone?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for average rolling annual return endpoint
 */
export interface AverageRollingAnnualReturnRequestParams
  extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  /** Time unit for rolling window: 'month', 'quarter', 'year', or 'custom' */
  timeUnit?: "month" | "quarter" | "year" | "custom";

  /** Window size in days (for custom time unit) */
  windowSize?: number;

  [key: string]: string | number | undefined;
}

/**
 * Winrate chart API response
 * GET /api/charts/winrate
 */
export interface WinrateResponse extends ChartResponseBase {
  /** Per-wallet winrate data */
  wallets: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName?: string;

    /** Overall winrate percentage (0-100) */
    winrate: number;

    /** Total number of active tokens analyzed */
    totalTokens: number;

    /** Number of tokens with positive PnL */
    profitableTokens: number;

    /** Number of tokens without positive PnL */
    unprofitableTokens: number;

    /** Winning magnitude distribution (bins) */
    winningDistribution: {
      /** Bin range label (e.g., "0-10%", "10-20%") */
      range: string;

      /** Count of trades in this bin */
      count: number;

      /** Lower bound of bin (%) */
      min: number;

      /** Upper bound of bin (%) */
      max: number;
    }[];

    /** Losing magnitude distribution (bins) */
    losingDistribution: {
      /** Bin range label (e.g., "0-10%", "10-20%") */
      range: string;

      /** Count of trades in this bin */
      count: number;

      /** Lower bound of bin (%) */
      min: number;

      /** Upper bound of bin (%) */
      max: number;
    }[];

  }[];

  /** Response metadata */
  metadata: {
    period: string;
    timestamp: number;
  };
}

/**
 * Drawdown chart API response
 * GET /api/charts/drawdown
 */
export interface DrawdownResponse extends ChartResponseBase {
  /** Per-wallet drawdown data */
  wallets: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName?: string;

    /** Drawdown time series data (percentage) */
    data: TimeSeriesPoint[];

    /** Maximum drawdown percentage (negative value) */
    maxDrawdown: number;

    /** Timestamp when maximum drawdown occurred */
    maxDrawdownTimestamp: number;

    /** Days since maximum drawdown */
    daysSinceMaxDrawdown: number;

    /** Current drawdown percentage (negative value or 0) */
    currentDrawdown: number;
  }[];

  /** Response metadata */
  metadata: {
    period: string;
    timestamp: number;
    currency: string;
  };
}

/**
 * API request parameters for winrate endpoint
 */
export interface WinrateRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for drawdown endpoint
 */
export interface DrawdownRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}

/**
 * Total trading volume chart API response
 * GET /api/charts/total-trading-volume
 */
export interface TotalTradingVolumeResponse extends ChartResponseBase {
  /** Per-wallet trading volume data */
  wallets: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName?: string;

    /** Total trading volume (USD) */
    totalVolume: number;

    /** Deposit volume (USD) */
    depositVolume: number;

    /** Withdrawal volume (USD) */
    withdrawalVolume: number;

    /** Trade count */
    tradeCount: number;

    /** Ranking position (1-based) */
    rank: number;
  }[];

  /** Response metadata */
  metadata: {
    period: string;
    timestamp: number;
    currency: string;
  };
}

/**
 * Stablecoin ratio chart API response
 * GET /api/charts/stablecoin-ratio
 */
export interface StablecoinRatioResponse extends ChartResponseBase {
  /** Per-wallet stablecoin ratio data */
  wallets: {
    /** Wallet address */
    walletAddress: string;

    /** Wallet display name */
    walletName?: string;

    /** Time series of stablecoin ratio (percentage) */
    data: TimeSeriesPoint[];

    /** Current stablecoin ratio (%) */
    currentRatio: number;

    /** Average stablecoin ratio over period (%) */
    averageRatio: number;
  }[];

  /** Response metadata */
  metadata: {
    period: string;
    timestamp: number;
    currency: string;
  };
}

/**
 * API request parameters for total trading volume endpoint
 */
export interface TotalTradingVolumeRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}

/**
 * API request parameters for stablecoin ratio endpoint
 */
export interface StablecoinRatioRequestParams extends ChartResponseBase {
  /** Time period filter */
  period?: string;

  /** Comma-separated wallet list */
  wallets?: string;

  [key: string]: string | number | undefined;
}
