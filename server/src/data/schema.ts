export interface TokenBalance {
  name: string;
  symbol: string;
  // "native" for SOL
  address: string;
  price_usd?: number;
  // in lamports
  amount: number;
  // in SOLs
  balance: number;
  // in SOLs, usually = balance, unless token has custom scaling logic
  rawBalance: number;
  // digit count after the decimal point in lamports. SOL has decimals of 9.
  decimals: number;
  valueUsd: number;
}

export interface TokenMeta {
  name: string;
  symbol: string;
  address: string;
  isNative?: boolean;
  isWrapped?: boolean;
  imageUrl?: string;
  description?: string;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
  amountUsd: number;
  time: number;
  tokenMeta: TokenMeta;
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
