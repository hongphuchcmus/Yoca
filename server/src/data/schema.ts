/**
 * Schema definitions for token-related data structures
 */

export interface TokenMeta {
  name: string;
  symbol: string;
  address: string;
}

export interface TokenPrice {
  usd: number;
  usdMarketCap?: number;
  usd24hVol?: number;
  usd24hChange?: number;
}

export interface TokenMarketData {
  currentPrice?: number;
  marketCap?: number;
  marketCapRank?: number;
  fullyDilutedValuation?: number;
  totalVolume?: number;
  high24h?: number;
  low24h?: number;
  priceChange24h?: number;
  priceChangePercentage24h?: number;
  marketCapChange24h?: number;
  marketCapChangePercentage24h?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
  ath?: number;
  athChangePercentage?: number;
  atl?: number;
  atlChangePercentage?: number;
}
