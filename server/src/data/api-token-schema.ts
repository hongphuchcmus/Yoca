export class SolanaToken {
  id: string = "";
  symbol: string = "";
  name: string = "";
  tokenAddress: string = "";
}

export class TokenPrice {
  usd = 0;
  usd_market_cap? = 0;
  usd_24h_vol?: number = 0;
  usd_24h_change?: number;
  last_updated_at?: number = 0;
}

export class MarketData {
  id: string = "";
  symbol: string = "";
  name: string = "";
  image?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  fully_diluted_valuation?: number;
  total_volume?: number;
  high_24h?: number;
  low_24h?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
  market_cap_change_24h?: number;
  market_cap_change_percentage_24h?: number;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number;
  ath?: number;
  ath_change_percentage?: number;
  atl?: number;
  atl_change_percentage?: number;
  last_updated?: string;
}

export class TokenBalance {
  name: string = "";
  symbol: string = "";
  address: string = "";
  amount: string = "";
  balance: string = "";
  valueUsd: number = 0;
  rawBalance: string = "";
  decimals: number = 0;
}
