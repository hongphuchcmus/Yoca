/**
 * Shared API types and interfaces
 */

export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

export interface PaginationParams {
  limit: number;
  offset?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    timestamp: string;
    pagination?: PaginationParams;
  };
}

export interface RawBalance {
  name: string;
  symbol: string;
  address: string;
  amount: string;
  balance: string;
  value_usd: string;
  raw_balance: string;
  decimals: number;
}

export interface RawTokenPrice {
  usd: number;
  usd_market_cap: number;
  usd_24h_vol: number;
  usd_24h_change: number;
}

export interface RawCoinListItem {
  name: string;
  symbol: string;
  platforms?: {
    solana?: string;
  };
}

export interface RawMarketData {
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  ath: number;
  ath_change_percentage: number;
  atl: number;
  atl_change_percentage: number;
}
