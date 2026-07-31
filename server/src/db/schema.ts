import { sql } from "drizzle-orm";
import {
    bigint,
    boolean,
    date,
    decimal as dec,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    serial,
    smallint,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import dayjs from "dayjs";
import type { MarketPoolItem } from "@sv/types/market-pool.js";
export * from "./alerts";
export * from "./users";
export * from "./payment";
export * from "./wallets";
export * from "./meta";

// Decimal has "string" mode by default, due to how node-postgres saves
// decimal numbers to keep precisions, this overrides that so you can pass
// number into the inferred types of these fields
function decimal(name: string) {
  return dec(name, { mode: "number" });
}

// #region Enums
export const enumTradeAction = pgEnum("trade_action", ["buy", "sell"]);

export const enumAlertRuleAction = pgEnum("alert_rule_action", [
  "SWAP",
  "TRANSFER",
  "ALL",
]);

export const enumAlertRuleTrigger = pgEnum("alert_rule_trigger", [
  "ONCE",
  "ALWAYS",
]);

export const enumAlertRuleVolumeUnit = pgEnum("alert_rule_volume_unit", [
  "USD",
  "SOL",
]);

// #endregion

// #region Table definitions

export const tokenMeta = pgTable("token_meta", {
  address: varchar("address", { length: 44 }).primaryKey(),
  name: varchar("name"),
  symbol: varchar("symbol"),
  imageUrl: varchar("image_url"),

  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const tokenDetails = pgTable("token_details", {
  address: varchar("address", { length: 44 }).primaryKey(),
  decimals: integer("decimals").notNull(),
  coingeckoId: varchar("coingecko_id"),
  description: varchar("description"),
  linkHomepage: varchar("homepage"),
  linkDiscord: varchar("link_discord"),
  twitterScreenName: varchar("twitter_screen_name"),
  telegramChannel: varchar("telegram_channel"),
  linkBlockchainSites: varchar("link_blockchain_sites").array(),
  categories: varchar("categories").array(),

  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const tokenFundamentals = pgTable("token_fundamentals", {
  tokenAddress: varchar("token_address", { length: 44 }).primaryKey(),
  allocationsObservedAt: timestamp("allocations_observed_at"),
  unlockScheduleObservedAt: timestamp("unlock_schedule_observed_at"),
  investorsObservedAt: timestamp("investors_observed_at"),
});

export const tokenAllocations = pgTable(
  "token_allocations",
  {
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    category: varchar("category", { length: 128 }).notNull(),
    percentage: decimal("percentage").notNull(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$onUpdate(() => dayjs.utc().toDate()),
  },
  (table) => [
    primaryKey({ columns: [table.tokenAddress, table.category] }),
  ],
);

export const tokenUnlockEvents = pgTable(
  "token_unlock_events",
  {
    id: serial("id").primaryKey(),
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    unlockAt: timestamp("unlock_at").notNull(),
    tokensToUnlock: decimal("tokens_to_unlock").notNull(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$onUpdate(() => dayjs.utc().toDate()),
  },
  (table) => [
    uniqueIndex("token_unlock_events_token_date_uq").on(
      table.tokenAddress,
      table.unlockAt,
    ),
  ],
);

export const tokenUnlockAllocations = pgTable(
  "token_unlock_allocations",
  {
    unlockEventId: integer("unlock_event_id")
      .notNull()
      .references(() => tokenUnlockEvents.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 128 }).notNull(),
    tokenAmount: decimal("token_amount").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.unlockEventId, table.category] }),
  ],
);

export const investors = pgTable("investors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull().unique(),
  type: varchar("type", { length: 128 }),
  imageUrl: varchar("image_url"),
  countryName: varchar("country_name", { length: 128 }),
  description: text("description"),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => dayjs.utc().toDate()),
});

export const tokenInvestors = pgTable(
  "token_investors",
  {
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    lead: boolean("lead").notNull().default(false),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$onUpdate(() => dayjs.utc().toDate()),
  },
  (table) => [
    primaryKey({ columns: [table.tokenAddress, table.investorId] }),
  ],
);

export const tokenMarketData = pgTable("token_market_data", {
  address: varchar("address", { length: 44 }).primaryKey(),

  priceUsd: decimal("price_usd").notNull(),

  marketCapRank: integer("market_cap_rank"),
  high24h: decimal("high_24h"),
  low24h: decimal("low_24h"),

  priceChange24h: decimal("price_change_24h"),
  priceChangePercentage1h: decimal("price_change_percentage_1h"),
  priceChangePercentage24h: decimal("price_change_percentage_24h"),
  priceChangePercentage7d: decimal("price_change_percentage_7d"),
  priceChangePercentage14d: decimal("price_change_percentage_14d"),
  priceChangePercentage30d: decimal("price_change_percentage_30d"),
  priceChangePercentage200d: decimal("price_change_percentage_200d"),
  priceChangePercentage1y: decimal("price_change_percentage_1y"),

  marketCap: decimal("market_cap").notNull(),
  marketCapChange24h: decimal("mark_cap_change_24h"),
  marketCapChangePercentage24h: decimal("market_cap_change_percentage_24h"),
  fullyDilutedValuation: decimal("fully_diluted_valuation"),

  volume24h: decimal("volume_24h").notNull(),
  circulatingSupply: decimal("circulating_supply"),
  maxSupply: decimal("max_supply"),
  totalSupply: decimal("total_supply"),

  ath: decimal("ath"),
  athChangePercentage: decimal("ath_change_percentage"),
  athDate: timestamp("ath_date"),
  atl: decimal("atl"),
  atlChangePercentage: decimal("atl_change_percentage"),
  atlDate: timestamp("atl_date"),

  sparkline7d: decimal("sparkline_7d").array(),

  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => dayjs.utc().toDate()),
});

export const tokenPoolData = pgTable("token_pool_data", {
  poolAddress: varchar("address", { length: 44 }).primaryKey(),
  poolName: varchar("name"),

  baseAddress: varchar("base_address", { length: 44 }).notNull(),
  baseImageUrl: varchar("base_image_url"),
  quoteAddress: varchar("quote_address", { length: 44 }).notNull(),
  quoteImageUrl: varchar("quote_image_url"),

  dexId: varchar("dex_id"),
  dexImageUrl: varchar("dex_image_url"),

  poolCreatedAt: timestamp("pool_created_at"),
  liquidityUsd: decimal("liquidity_usd"),

  baseTokenPriceUsd: decimal("base_token_price_usd"),
  quoteTokenPriceUsd: decimal("quote_token_price_usd"),

  baseTokenPriceSol: decimal("base_token_price_sol"),
  quoteTokenPriceSol: decimal("quote_token_price_sol"),

  marketCapUsd: decimal("market_cap_usd"),
  fdvUsd: decimal("fdv_usd"),

  priceChangePercentage5m: decimal("price_change_percentage_5m"),
  priceChangePercentage1h: decimal("price_change_percentage_1h"),
  priceChangePercentage6h: decimal("price_change_percentage_6h"),
  priceChangePercentage24h: decimal("price_change_percentage_24h"),

  buys1h: decimal("buys_1h"),
  buys6h: decimal("buys_6h"),
  buys24h: decimal("buys_24h"),

  sells1h: decimal("sells_1h"),
  sells6h: decimal("sells_6h"),
  sells24h: decimal("sells_24h"),

  buyers1h: decimal("buyers_1h"),
  buyers6h: decimal("buyers_6h"),
  buyers24h: decimal("buyers_24h"),

  sellers1h: decimal("sellers_1h"),
  sellers6h: decimal("sellers_6h"),
  sellers24h: decimal("sellers_24h"),

  volumeUsd1h: decimal("volume_usd_1h"),
  volumeUsd6h: decimal("volume_usd_6h"),
  volumeUsd24h: decimal("volume_usd_24h"),

  buyVolumeUsd1h: decimal("buy_volume_usd_1h"),
  buyVolumeUsd6h: decimal("buy_volume_usd_6h"),
  buyVolumeUsd24h: decimal("buy_volume_usd_24h"),

  sellVolumeUsd1h: decimal("sell_volume_usd_1h"),
  sellVolumeUsd6h: decimal("sell_volume_usd_6h"),
  sellVolumeUsd24h: decimal("sell_volume_usd_24h"),

  updatedAt: timestamp("updated_at"),
  topPoolsUpdatedAt: timestamp("top_pools_updated_at"),
});

export const marketPoolLists = pgTable("market_pool_lists", {
  listKey: varchar("list_key", { length: 64 }).primaryKey(),
  responseJson: jsonb("response_json").$type<MarketPoolItem[]>().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const tokenTopPools = pgTable(
  "token_tops_pool",
  {
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    poolAddress: varchar("pool_address", { length: 44 }).notNull(),
    rank: integer("rank").notNull(),

    updatedAt: timestamp("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.tokenAddress, table.rank],
    }),
  ],
);

export const tokenMarketChart24h = pgTable(
  "token_market_chart_24h",
  {
    address: varchar("address", { length: 44 }).notNull(),
    unixTimestampMs: bigint("unix_timestamp_ms", { mode: "number" }).notNull(),
    price: decimal("price").notNull(),
    marketCap: decimal("market_cap").notNull(),
    totalVolume: decimal("total_volume").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.address, table.unixTimestampMs],
    }),
  ],
);

export const tokenMarketChartHourly = pgTable(
  "token_market_chart_hourly",
  {
    address: varchar("address", { length: 44 }).notNull(),
    unixTimestampMs: bigint("unix_timestamp_ms", { mode: "number" }).notNull(),
    price: decimal("price").notNull(),
    marketCap: decimal("market_cap").notNull(),
    totalVolume: decimal("total_volume").notNull(),
    unixUpdatedAtMs: bigint("unix_updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.address, table.unixTimestampMs],
    }),
  ],
);

export const tokenMarketChartDaily = pgTable(
  "token_market_chart_daily",
  {
    address: varchar("address", { length: 44 }).notNull(),
    unixTimestampMs: bigint("unix_timestamp_ms", { mode: "number" }).notNull(),
    price: decimal("price").notNull(),
    marketCap: decimal("market_cap").notNull(),
    totalVolume: decimal("total_volume").notNull(),
    unixUpdatedAtMs: bigint("unix_updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.address, table.unixTimestampMs],
    }),
  ],
);

export const tokenVolatilityNewsCache = pgTable(
  "token_volatility_news_cache",
  {
    id: serial("id").primaryKey(),
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    thresholdPercent: decimal("threshold_percent").notNull(),
    timeframe: varchar("timeframe", { length: 16 }).notNull(),
    detectionWindow: varchar("detection_window", { length: 16 }).notNull(),
    maxEventsWithNews: integer("max_events_with_news").notNull(),
    includeSummary: boolean("include_summary").notNull().default(false),
    responseJson: jsonb("response_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("token_volatility_news_cache_key_uq").on(
      table.tokenAddress,
      table.thresholdPercent,
      table.timeframe,
      table.detectionWindow,
      table.maxEventsWithNews,
      table.includeSummary,
    ),
  ],
);

export const tokenChartNewsEventsCache = pgTable(
  "token_chart_news_events_cache",
  {
    id: serial("id").primaryKey(),
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    timeframe: varchar("timeframe", { length: 16 }).notNull(),
    eventDate: varchar("event_date", { length: 10 }).notNull().default(""),
    includeSummary: boolean("include_summary").notNull().default(false),
    responseJson: jsonb("response_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("token_chart_news_events_cache_key_uq").on(
      table.tokenAddress,
      table.symbol,
      table.name,
      table.timeframe,
      table.eventDate,
      table.includeSummary,
    ),
  ],
);

export const tokenAiChatCache = pgTable(
  "token_ai_chat_cache",
  {
    id: serial("id").primaryKey(),
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    normalizedQuestionHash: varchar("normalized_question_hash", {
      length: 64,
    }).notNull(),
    timeframe: varchar("timeframe", { length: 16 }).notNull(),
    language: varchar("language", { length: 8 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    responseJson: jsonb("response_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("token_ai_chat_cache_key_uq").on(
      table.tokenAddress,
      table.normalizedQuestionHash,
      table.timeframe,
      table.language,
      table.promptVersion,
      table.model,
      table.evidenceHash,
    ),
  ],
);

export const aiDailyUsage = pgTable(
  "ai_daily_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feature: varchar("feature", { length: 64 }).notNull(),
    usageDate: date("usage_date", { mode: "string" }).notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.feature, table.usageDate],
    }),
  ],
);

// Token holders info
export const tokenHolderStats = pgTable("token_holder_stats", {
  address: varchar("address", { length: 44 }).primaryKey(),
  holdersCount: integer("holders_count").notNull(),
  // Percentage of market cap held by top 10%
  top10Percent: decimal("top_10_percent").notNull(),
  rank11To20Percent: decimal("rank_11_to_20_percent").notNull(),
  rank21To40Percent: decimal("rank_21_to_40_percent").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const topTokenHolders = pgTable(
  "top_token_holders",
  {
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    holderAddress: varchar("holder_address", { length: 44 }).notNull(),
    rank: integer("rank").notNull(),
    percentage: decimal("percentage").notNull(),
    balance: decimal("balance"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.tokenAddress, table.rank],
    }),
  ],
);

// Trending tokens
export const trendingTokens = pgTable("trending_tokens", {
  address: varchar("address", { length: 44 }).primaryKey(),
  rank: integer("rank").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

// Top tokens by market cap
export const topTokensByMarketCap = pgTable("top_tokens_by_marketcap", {
  address: varchar("address", { length: 44 }).primaryKey(),
  rank: integer("rank").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const topTraders = pgTable("top_traders", {
  address: varchar("address", { length: 66 }).primaryKey(),
  rank: integer("rank").notNull(),
  pnl: decimal("pnl").notNull(),
  volume: decimal("volume").notNull(),
  tradeCount: integer("trade_count").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const topLosers = pgTable("top_losers", {
  address: varchar("address", { length: 66 }).primaryKey(),
  rank: integer("rank").notNull(),
  pnl: decimal("pnl").notNull(),
  volume: decimal("volume").notNull(),
  tradeCount: integer("trade_count").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const poolTrades24h = pgTable("pool_trades_24h", {
  id: varchar("id", { length: 128 }).primaryKey(),

  poolAddress: varchar("pool_address", { length: 44 }).notNull(),
  transactionHash: varchar("transaction_hash", { length: 88 }).notNull(),

  signerAddress: varchar("signer_address", { length: 44 }).notNull(),

  sellTokenAmount: decimal("sell_token_amount").notNull(),
  buyTokenAmount: decimal("buy_token_amount").notNull(),

  sellTokenAddress: varchar("sell_token_address", { length: 44 }).notNull(),
  buyTokenAddress: varchar("buy_token_address", { length: 44 }).notNull(),

  sellTokenPriceUsd: decimal("sell_token_price_usd").notNull(),
  buyTokenPriceUsd: decimal("buy_token_price_usd").notNull(),

  blockTimestamp: timestamp("block_timestamp").notNull(),

  volumeInUsd: decimal("volume_in_usd").notNull(),

  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const recentTrades = pgTable("recent_trades", {
  // Underscore before name to signal this is synthetic field and is not
  // inferred from the actual data by any means (which usually discouraged)
  _tradeId: uuid("_trade_id").primaryKey().defaultRandom(),

  transactionHash: varchar("transaction_hash", { length: 88 }).notNull(),
  instructionIndex: integer("instruction_index"),
  // If instruction index is null, it doesn't mean the trade happened at top
  // leve instruction, Birdeye might just didn't have that information
  innerInstructionIndex: integer("inner_instruction_index"),

  tradeAction: enumTradeAction("trade_action").notNull(),

  baseAddress: varchar("base_address", { length: 44 }).notNull(),
  basePrice: decimal("base_price"),
  baseAmount: decimal("base_amount"),

  quoteAddress: varchar("quote_address", { length: 44 }).notNull(),
  quotePrice: decimal("quote_price"),
  quoteAmount: decimal("quote_amount"),

  blockUnixTime: integer("block_unix_time").notNull(),
  volumeUsd: decimal("volume_usd").notNull(),

  owner: varchar("owner", { length: 44 }).notNull(),
  source: varchar("source").notNull(),
  poolAddress: varchar("pool_address", { length: 44 }).notNull(),

  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

// / --- Wallet API cache (DB-first: use cache if fresh, else fetch from Moralis/Birdeye) ---

export const walletOverviewCache = pgTable(
  "wallet_overview_cache",
  {
    address: varchar("address", { length: 66 }).notNull(),
    totalAssetValueUsd: decimal("total_asset_value_usd").notNull(),
    totalAssetValueChange24hPercent: decimal(
      "total_asset_value_change_24h_percent",
    ),
    tradingVolumeUsd24h: decimal("trading_volume_usd_24h"),
    tradingVolumeUsd7d: decimal("trading_volume_usd_7d"),
    tradingVolumeUsd30d: decimal("trading_volume_usd_30d"),
    tradingVolumeUsd90d: decimal("trading_volume_usd_90d"),
    tradingVolumeUsdAll: decimal("trading_volume_usd_all"),
    pnlUsdTotal: decimal("pnl_usd_total"),
    pnlTotalUsd24h: decimal("pnl_total_usd_24h"),
    pnlTotalUsd7d: decimal("pnl_total_usd_7d"),
    pnlTotalUsd30d: decimal("pnl_total_usd_30d"),
    pnlTotalUsd90d: decimal("pnl_total_usd_90d"),
    pnlTotalUsdAll: decimal("pnl_total_usd_all"),
    pnlRealizedUsd24h: decimal("pnl_realized_usd_24h"),
    pnlRealizedUsd7d: decimal("pnl_realized_usd_7d"),
    pnlRealizedUsd30d: decimal("pnl_realized_usd_30d"),
    pnlRealizedUsd90d: decimal("pnl_realized_usd_90d"),
    pnlRealizedUsdAll: decimal("pnl_realized_usd_all"),
    pnlUnrealizedUsd24h: decimal("pnl_unrealized_usd_24h"),
    pnlUnrealizedUsd7d: decimal("pnl_unrealized_usd_7d"),
    pnlUnrealizedUsd30d: decimal("pnl_unrealized_usd_30d"),
    pnlUnrealizedUsd90d: decimal("pnl_unrealized_usd_90d"),
    pnlUnrealizedUsdAll: decimal("pnl_unrealized_usd_all"),
    transactionCount24h: integer("transaction_count_24h"),
    transactionCount7d: integer("transaction_count_7d"),
    transactionCount30d: integer("transaction_count_30d"),
    transactionCount90d: integer("transaction_count_90d"),
    transactionCountAll: integer("transaction_count_all"),
    tokensTradedCount: integer("tokens_traded_count"),
    tokensTradedCount24h: integer("tokens_traded_count_24h"),
    tokensTradedCount7d: integer("tokens_traded_count_7d"),
    tokensTradedCount30d: integer("tokens_traded_count_30d"),
    tokensTradedCount90d: integer("tokens_traded_count_90d"),
    tokensTradedCountAll: integer("tokens_traded_count_all"),
    buyTxCount24h: integer("buy_tx_count_24h"),
    buyTxCount7d: integer("buy_tx_count_7d"),
    buyTxCount30d: integer("buy_tx_count_30d"),
    buyTxCount90d: integer("buy_tx_count_90d"),
    buyTxCountAll: integer("buy_tx_count_all"),
    sellTxCount24h: integer("sell_tx_count_24h"),
    sellTxCount7d: integer("sell_tx_count_7d"),
    sellTxCount30d: integer("sell_tx_count_30d"),
    sellTxCount90d: integer("sell_tx_count_90d"),
    sellTxCountAll: integer("sell_tx_count_all"),
    buyVolumeUsd24h: decimal("buy_volume_usd_24h"),
    buyVolumeUsd7d: decimal("buy_volume_usd_7d"),
    buyVolumeUsd30d: decimal("buy_volume_usd_30d"),
    buyVolumeUsd90d: decimal("buy_volume_usd_90d"),
    buyVolumeUsdAll: decimal("buy_volume_usd_all"),
    sellVolumeUsd24h: decimal("sell_volume_usd_24h"),
    sellVolumeUsd7d: decimal("sell_volume_usd_7d"),
    sellVolumeUsd30d: decimal("sell_volume_usd_30d"),
    sellVolumeUsd90d: decimal("sell_volume_usd_90d"),
    sellVolumeUsdAll: decimal("sell_volume_usd_all"),
    tokensHoldingCount: integer("tokens_holding_count").notNull(),
    holdingsFetchedAt: timestamp("holdings_fetched_at"),
    activityFetchedAt: timestamp("activity_fetched_at"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address] })],
);

export const walletPortfolioCache = pgTable(
  "wallet_portfolio_cache",
  {
    address: varchar("address", { length: 66 }).notNull(),
    data: jsonb("data")
      .$type<
        Array<{
          tokenAddress: string;
          symbol: string;
          name?: string;
          logoUri?: string;
          amount: number;
          priceUsd?: number;
          valueUsd: number;
          change24hPercent?: number;
        }>
      >()
      .notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address] })],
);

export const walletHistoricalPortfolioCache = pgTable(
  "wallet_historical_portfolio_cache",
  {
    address: varchar("address", { length: 66 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    data: jsonb("data")
      .$type<
        Array<{
          tokenAddress: string;
          symbol: string;
          name?: string;
          logoUri?: string;
          amount: number;
          priceUsd?: number;
          valueUsd: number;
          change24hPercent?: number;
        }>
      >()
      .notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address, t.date] })],
);

export const walletTransactionsMeta = pgTable(
  "wallet_transactions_meta",
  {
    address: varchar("address", { length: 66 }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    // Explicit persisted bounds for coverage checks.
    // Nullable so pre-migration rows don't break existing reads.
    coveredFromSec: integer("covered_from_sec"),
    coveredToSec: integer("covered_to_sec"),
  },
  (t) => [primaryKey({ columns: [t.address] })],
);

export const walletSwapMeta = pgTable(
  "wallet_swap_meta",
  {
    address: varchar("address", { length: 66 }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    coveredFromSec: integer("covered_from_sec"),
    coveredToSec: integer("covered_to_sec"),
  },
  (t) => [primaryKey({ columns: [t.address] })],
);

export const walletHeliusTransactions = pgTable(
  "wallet_helius_transactions",
  {
    address: varchar("address", { length: 66 }).notNull(),
    signature: text("signature").notNull(),
    timestamp: timestamp("block_timestamp").notNull(),
    slot: decimal("slot"),
    fee: decimal("fee"),
    feePayer: varchar("fee_payer", { length: 66 }).notNull(),
    balanceChanges: jsonb("transaction_balance_changes")
      .$type<Array<{ mint: string; amount: number; decimals: number }>>()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.address, t.signature] })],
);

export const walletEnhancedTransactions = pgTable(
  "wallet_enhanced_transactions",
  {
    address: varchar("address", { length: 66 }).notNull(),
    signature: text("signature").notNull(),
    blockTimestampMs: bigint("block_timestamp_ms", {
      mode: "number",
    }).notNull(),
    slot: bigint("slot", { mode: "number" }),
    fee: bigint("fee", { mode: "number" }),
    feePayer: varchar("fee_payer", { length: 66 }).notNull(),
    source: text("source"),
    type: text("type"),
    programId: varchar("program_id", { length: 66 }),
  },
  (t) => [primaryKey({ columns: [t.address, t.signature] })],
);

export const walletEnhancedTokenTransfers = pgTable(
  "wallet_enhanced_token_transfers",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 66 }).notNull(),
    signature: text("signature").notNull(),
    mint: varchar("mint", { length: 66 }).notNull(),
    tokenAmount: decimal("token_amount").notNull(),
    fromUserAccount: varchar("from_user_account", { length: 66 }).notNull(),
    toUserAccount: varchar("to_user_account", { length: 66 }).notNull(),
    fromTokenAccount: varchar("from_token_account", { length: 66 }),
    toTokenAccount: varchar("to_token_account", { length: 66 }),
    symbol: text("symbol"),
    tokenSymbol: text("token_symbol"),
    instructionIndex: integer("instruction_index").notNull(),
  },
  (t) => [
    uniqueIndex("uq_enh_token_tx").on(
      t.address,
      t.signature,
      t.instructionIndex,
    ),
  ],
);

export const walletEnhancedNativeTransfers = pgTable(
  "wallet_enhanced_native_transfers",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 66 }).notNull(),
    signature: text("signature").notNull(),
    amount: decimal("amount").notNull(),
    fromUserAccount: varchar("from_user_account", { length: 66 }).notNull(),
    toUserAccount: varchar("to_user_account", { length: 66 }).notNull(),
    transferIndex: integer("transfer_index").notNull(),
  },
  (t) => [
    uniqueIndex("uq_enh_native_tx").on(t.address, t.signature, t.transferIndex),
  ],
);

export const walletEnhancedInstructions = pgTable(
  "wallet_enhanced_instructions",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 66 }).notNull(),
    signature: text("signature").notNull(),
    instructionIndex: integer("instruction_index").notNull(),
    programId: varchar("program_id", { length: 66 }).notNull(),
    data: text("data"),
    accounts: varchar("accounts").array(),
  },
  (t) => [
    uniqueIndex("uq_enh_ins_tx").on(t.address, t.signature, t.instructionIndex),
  ],
);

export const walletEnhancedInnerInstructions = pgTable(
  "wallet_enhanced_inner_instructions",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 66 }).notNull(),
    signature: text("signature").notNull(),
    instructionIndex: integer("instruction_index").notNull(),
    innerIndex: integer("inner_index").notNull(),
    programId: varchar("program_id", { length: 66 }).notNull(),
    data: text("data"),
    accounts: varchar("accounts").array(),
  },
  (t) => [
    uniqueIndex("uq_enh_inner_ins_tx").on(
      t.address,
      t.signature,
      t.instructionIndex,
      t.innerIndex,
    ),
  ],
);

export const walletEnhancedTxMeta = pgTable(
  "wallet_enhanced_tx_meta",
  {
    address: varchar("address", { length: 66 }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    coveredFromMs: bigint("covered_from_ms", { mode: "number" }),
    coveredToMs: bigint("covered_to_ms", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.address] })],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    address: varchar("address", { length: 66 }).notNull(),
    hash: text("hash").notNull(),
    blockTimestamp: timestamp("block_timestamp").notNull(),
    fromAddress: varchar("from_address", { length: 66 }).notNull(),
    toAddress: varchar("to_address", { length: 66 }).notNull(),
    receiptStatus: smallint("receipt_status"), // 1 success, 0 fail, null unknown
    fee: decimal("fee"),
    mainAction: text("main_action"),
    direction: text("direction"), // in | out | self | unknown
    primaryTokenSymbol: text("primary_token_symbol"),
    primaryTokenAmount: decimal("primary_token_amount"),
    primaryTokenAddress: varchar("primary_token_address", { length: 66 }),
    priceUsd: decimal("price_usd"),
    totalUsd: decimal("total_usd"),
    tokens: jsonb("tokens").$type<string[]>(),
  },
  (t) => [primaryKey({ columns: [t.address, t.hash] })],
);

export const walletSwap = pgTable(
  "wallet_swap",
  {
    transactionHash: text("transaction_hash").notNull(),
    transactionType: text("transaction_type").notNull(),
    blockTimestampMs: bigint("block_timestamp_ms", {
      mode: "number",
    }).notNull(),

    subcategory: text("subcategory"),

    walletAddress: varchar("wallet_address", { length: 66 }).notNull(),
    pairAddress: varchar("pair_address", { length: 66 }).notNull(),

    tokensInvoled: text("tokens_involved").notNull(),

    boughtTokenAddress: varchar("bought_token_address", {
      length: 66,
    }).notNull(),
    boughtTokenAmount: decimal("bought_token_amount").notNull(),
    boughtTokenPriceUsd: decimal("bought_token_price_usd").notNull(),

    soldTokenAddress: varchar("sold_token_address", { length: 66 }).notNull(),
    soldTokenAmount: decimal("sold_token_amount").notNull(),
    soldTokenPriceUsd: decimal("sold_token_price_usd").notNull(),

    totalValueUsd: decimal("total_value_usd"),
    baseQuotePrice: decimal("base_quote_price_usd"),

    providerSource: text("provider_source"),
  },
  (t) => [primaryKey({ columns: [t.transactionHash] })],
);

export const walletIdentityCache = pgTable(
  "wallet_identity_cache",
  {
    address: varchar("address", { length: 66 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    type: varchar("type", { length: 64 }),
    name: varchar("name", { length: 255 }),
    category: varchar("category", { length: 255 }),
    tags: jsonb("tags").$type<string[]>().notNull(),
    domainNames: jsonb("domain_names").$type<string[]>().notNull(),
    raw: jsonb("raw").$type<Record<string, unknown> | null>(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address] })],
);

export const walletAiAnalysisCache = pgTable(
  "wallet_ai_analysis_cache",
  {
    key: varchar("key", { length: 256 }).primaryKey(),
    address: varchar("address", { length: 66 }).notNull(),
    language: varchar("language", { length: 10 }).notNull(),
    modelVersion: varchar("model_version", { length: 64 }),
    promptVersion: varchar("prompt_version", { length: 64 }),
    raw: jsonb("raw").notNull(),
    normalized: jsonb("normalized").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("wallet_ai_analysis_cache_address_lang_ver_uq").on(
      t.address,
      t.language,
      t.modelVersion,
      t.promptVersion,
    ),
  ],
);

export const walletUserTags = pgTable(
  "wallet_user_tags",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletAddress: varchar("wallet_address", { length: 66 }).notNull(),
    tags: jsonb("tags").$type<string[]>().notNull(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.walletAddress] })],
);

/** Wallets followed for Helius webhook-driven alerts */
export const followedWallets = pgTable(
  "followed_wallets",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.address)],
);

/**
 * User-defined alert predicates (Observer stream + server-side filtering).
 * Helius delivers raw events; matching rows determine Discord/email fan-out.
 */
export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }),
  walletAddress: text("wallet_address").notNull(),
  actionType: enumAlertRuleAction("action_type").notNull(),
  minVolume: dec("min_volume", { mode: "number" }).notNull(),
  maxVolume: dec("max_volume", { mode: "number" }),
  volumeUnit: enumAlertRuleVolumeUnit("volume_unit").notNull().default("USD"),
  triggerType: enumAlertRuleTrigger("trigger_type").notNull(),
  expiryDate: timestamp("expiry_date", { withTimezone: true }).notNull(),
  oneShotFiredAt: timestamp("one_shot_fired_at", { withTimezone: true }),
  useDefaultDelivery: boolean("use_default_delivery").notNull().default(true),
  discordWebhookOverride: text("discord_webhook_override"),
  emailOverride: text("email_override"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Managed Helius webhook for wallet alert address fan-out. */
export const heliusWebhooks = pgTable("helius_webhooks", {
  id: serial("id").primaryKey(),
  heliusWebhookId: text("helius_webhook_id").notNull().unique(),
  webhookUrl: text("webhook_url").notNull(),
  webhookType: text("webhook_type").notNull().default("enhanced"),
  transactionTypes: text("transaction_types")
    .array()
    .notNull()
    .default(sql`ARRAY['ANY']::text[]`),
  accountAddresses: text("account_addresses")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => dayjs.utc().toDate()),
});

export const heliusWebhookAddresses = pgTable(
  "helius_webhook_addresses",
  {
    id: serial("id").primaryKey(),
    heliusWebhookId: text("helius_webhook_id")
      .notNull()
      .references(() => heliusWebhooks.heliusWebhookId, {
        onDelete: "cascade",
      }),
    walletAddress: text("wallet_address").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.heliusWebhookId, t.walletAddress)],
);

export const walletRecentTradedDescBreakdown = pgTable(
  "wallet_recent_traded_desc_breakdown",
  {
    address: varchar("address", { length: 44 }).notNull(),
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    symbol: varchar("symbol"),

    lastTradeUnixTime: integer("last_trade_unix_time").notNull(),

    // Counts
    totalBuyCount: integer("total_buy_count").notNull(),
    totalSellCount: integer("total_sell_count").notNull(),
    totalTradeCount: integer("total_trade_count").notNull(),

    // Quantity
    totalBoughtAmount: decimal("total_bought_amount").notNull(),
    totalSoldAmount: decimal("total_sold_amount").notNull(),
    balanceAmount: decimal("balance_amount").notNull(),

    // Cashflow
    costOfQuantitySold: decimal("cost_of_quantity_sold").notNull(),
    totalBoughtUsd: decimal("total_bought_usd").notNull(),
    totalSoldUsd: decimal("total_sold_usd").notNull(),
    currentValue: decimal("current_value").notNull(),

    // PnL
    realizedProfitUsd: decimal("realized_profit_usd").notNull(),
    realizedProfitPercent: decimal("realized_profit_percent").notNull(),
    unrealizedProfitUsd: decimal("unrealized_profit_usd").notNull(),
    unrealizedProfitPercent: decimal("unrealized_profit_percent").notNull(),

    // Pricing
    avgBuyCost: decimal("avg_buy_cost").notNull(),
    avgSellCost: decimal("avg_sell_cost").notNull(),

    updatedAtMs: bigint("updated_at_ms", { mode: "number" })
      .notNull()
      .$onUpdate(() => dayjs.utc().valueOf()),
  },
  (t) => [primaryKey({ columns: [t.address, t.tokenAddress] })],
);

export const walletRealizedPnlDescBreakdown = pgTable(
  "wallet_realized_pnl_desc_breakdown",
  {
    address: varchar("address", { length: 44 }).notNull(),
    tokenAddress: varchar("token_address", { length: 44 }).notNull(),
    symbol: varchar("symbol"),
    lastTradeUnixTime: integer("last_trade_unix_time").notNull(),
    totalBuyCount: integer("total_buy_count").notNull(),
    totalSellCount: integer("total_sell_count").notNull(),
    totalTradeCount: integer("total_trade_count").notNull(),
    totalBoughtAmount: decimal("total_bought_amount").notNull(),
    totalSoldAmount: decimal("total_sold_amount").notNull(),
    balanceAmount: decimal("balance_amount").notNull(),
    costOfQuantitySold: decimal("cost_of_quantity_sold").notNull(),
    totalBoughtUsd: decimal("total_bought_usd").notNull(),
    totalSoldUsd: decimal("total_sold_usd").notNull(),
    currentValue: decimal("current_value").notNull(),
    realizedProfitUsd: decimal("realized_profit_usd").notNull(),
    realizedProfitPercent: decimal("realized_profit_percent").notNull(),
    unrealizedProfitUsd: decimal("unrealized_profit_usd").notNull(),
    unrealizedProfitPercent: decimal("unrealized_profit_percent").notNull(),
    avgBuyCost: decimal("avg_buy_cost").notNull(),
    avgSellCost: decimal("avg_sell_cost").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.address, t.tokenAddress] })],
);

export const walletFirstFund = pgTable(
  "wallet_first_fund",
  {
    reciepient: varchar("recipient", { length: 44 }).notNull(),
    funder: varchar("funder", { length: 44 }).notNull(),
    funderName: varchar("funder_name", { length: 256 }),
    funderType: varchar("funder_type", { length: 256 }),
    mint: varchar("mint", { length: 44 }),
    symbol: varchar("symbol", { length: 64 }),
    amount: decimal("amount"),
    amountRaw: varchar("amount_raw", { length: 256 }),
    decimals: integer("decimals").notNull(),
    date: varchar("date", { length: 256 }),
    signature: varchar("signature", { length: 256 }),
    timestamp: integer("timestamp").notNull(),
    slot: integer("slot").notNull(),
    explorerUrl: varchar("explorer_url", { length: 256 }),
  },
  (t) => [primaryKey({ columns: [t.reciepient] })],
);

/**
 * AI Wallet Forensic Audit cache.
 *
 * Stores Gemini-generated behavioural reports per wallet so we don't pay the
 * model cost on every page view. Read path checks `fetchedAt >= now - 24h`.
 */
export const walletAuditCache = pgTable(
  "wallet_audit_cache",
  {
    address: varchar("address", { length: 66 }).notNull(),
    persona: varchar("persona", { length: 64 }).notNull(),
    trustScore: integer("trust_score").notNull(),
    summary: text("summary").notNull(),
    observations: jsonb("observations").$type<string[]>().notNull(),
    transactionCount: integer("transaction_count").notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address] })],
);

/**
 * AI Swap Summary cache.
 *
 * Stores Gemini-generated swap trading summaries per wallet+language so we
 * don't pay the model cost on repeated views. Read path checks
 * `fetchedAt >= now - 24h`.
 */
export const walletAiSwapSummaryCache = pgTable(
  "wallet_ai_swap_summary_cache",
  {
    address: varchar("address", { length: 66 }).notNull(),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    response: jsonb("response").$type<WalletAiSwapSummaryPersisted>().notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address, t.language] })],
);

export type WalletAiSwapSummaryPersisted = {
  tradeCount: number;
  realizedPnlUsd: number;
  winningPercentage: number;
  totalBoughtUsd: number;
  totalSoldUsd: number;
  topProfitable: TokenPnlBreakdownPersisted | null;
  topLoser: TokenPnlBreakdownPersisted | null;
  allTokenBreakdowns: TokenPnlBreakdownPersisted[];
  riskNotes: string[];
  summary: string;
};
export type TokenPnlBreakdownPersisted = {
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
};

/**
 * Wash-Trading AI verdict cache.
 *
 * Stores the Gemini-generated narrative (verdict/summary/findings/etc.) for
 * a given (mint, timeframe, algorithm, language) combination so we don't pay
 * the model cost on every request. The deterministic graph/GNN analysis
 * (circularPatterns, suspiciousWallets, summary stats) is not cached here —
 * only the narrative produced by tryGeminiAnalysis. Read path checks
 * `fetchedAt >= now - WASH_TRADING_VERDICT_TTL_MS`.
 */
export const washTradingVerdictCache = pgTable(
  "wash_trading_verdict_cache",
  {
    mint: varchar("mint", { length: 44 }).notNull(),
    timeframe: varchar("timeframe", { length: 8 }).notNull(),
    algorithm: varchar("algorithm", { length: 16 }).notNull(),
    language: varchar("language", { length: 10 }).notNull(),
    aiAnalysis: jsonb("ai_analysis").$type<WashTradingVerdictPersisted>().notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.timeframe, t.algorithm, t.language] })],
);

export type WashTradingVerdictPersisted = {
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

// --- News tables (Phase 1: news-fetching AI filter integration) ---
export const newsBatches = pgTable("news_batches", {
  id: serial("id").primaryKey(),
  address: varchar("address", { length: 44 }).notNull(),
  symbol: varchar("symbol").notNull(),
  name: varchar("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsArticles = pgTable(
  "news_articles",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => newsBatches.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 512 }).notNull(),
    url: varchar("url", { length: 1024 }).notNull(),
    description: text("description"),
    publishedAt: timestamp("published_at"),
    sourceName: varchar("source_name"),
    faviconUrl: varchar("favicon_url"),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    extraSnippets: jsonb("extra_snippets").$type<string[] | null>(),
    // raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("news_articles_url_uq").on(t.url),
    uniqueIndex("news_articles_content_hash_uq").on(t.contentHash),
  ],
);

// #endregion

// #region Types
export type TokenMetaInsert = typeof tokenMeta.$inferInsert;
export type TokenMetaSelect = typeof tokenMeta.$inferSelect;
export type TokenDetailedInfoInsert = typeof tokenDetails.$inferInsert;
export type TokenDetailedInfoSelect = typeof tokenDetails.$inferSelect;
export type TokenMarketDataInsert = typeof tokenMarketData.$inferInsert;
export type PoolTrade24hInsert = typeof poolTrades24h.$inferInsert;
export type TokenMarketChart24hInsert = typeof tokenMarketChart24h.$inferInsert;
export type TokenMarketChartHourlyInsert =
  typeof tokenMarketChartHourly.$inferInsert;
export type TokenMarketChartDailyInsert =
  typeof tokenMarketChartDaily.$inferInsert;
export type TokenTopPoolInsert = typeof tokenTopPools.$inferInsert;
export type TrendingTokenInsert = typeof trendingTokens.$inferInsert;
export type TokenHolderStatsInsert = typeof tokenHolderStats.$inferInsert;
export type RecentTradeInsert = typeof recentTrades.$inferInsert;
export type TokenPoolDataInsert = typeof tokenPoolData.$inferInsert;
export type TokenTopHolderInsert = typeof topTokenHolders.$inferInsert;
export type TopTokensByMarketCapInsert =
  typeof topTokensByMarketCap.$inferInsert;
export type TopTraderInsert = typeof topTraders.$inferInsert;
export type TopLoserInsert = typeof topLosers.$inferInsert;
export type WalletOverviewCacheInsert = typeof walletOverviewCache.$inferInsert;
export type WalletPortfolioCacheInsert =
  typeof walletPortfolioCache.$inferInsert;
export type WalletHistoricalPortfolioCacheInsert =
  typeof walletHistoricalPortfolioCache.$inferInsert;
export type WalletTransactionsMetaInsert =
  typeof walletTransactionsMeta.$inferInsert;
export type WalletTransactionInsert = typeof walletTransactions.$inferInsert;
export type WalletSwapInsert = typeof walletSwap.$inferInsert;

export type WalletIdentityCacheInsert = typeof walletIdentityCache.$inferInsert;
export type walletHeliusTransactionsInsert =
  typeof walletHeliusTransactions.$inferInsert;
export type WalletEnhancedTransactionsInsert =
  typeof walletEnhancedTransactions.$inferInsert;
export type WalletEnhancedTokenTransfersInsert =
  typeof walletEnhancedTokenTransfers.$inferInsert;
export type WalletEnhancedNativeTransfersInsert =
  typeof walletEnhancedNativeTransfers.$inferInsert;
export type WalletEnhancedInstructionsInsert =
  typeof walletEnhancedInstructions.$inferInsert;
export type WalletEnhancedInnerInstructionsInsert =
  typeof walletEnhancedInnerInstructions.$inferInsert;
export type WalletEnhancedTxMetaInsert =
  typeof walletEnhancedTxMeta.$inferInsert;
export type walletSwapMetaInsert = typeof walletSwapMeta.$inferInsert;
export type WalletUserTagsInsert = typeof walletUserTags.$inferInsert;
export type WalletRecentTradedDescBreakdownInsert = typeof walletRecentTradedDescBreakdown.$inferInsert;
export type WalletRecentTradedDescBreakdownSelect = typeof walletRecentTradedDescBreakdown.$inferSelect;
export type WalletRealizedPnlDescBreakdownInsert = typeof walletRealizedPnlDescBreakdown.$inferInsert;
export type WalletRealizedPnlDescBreakdownSelect = typeof walletRealizedPnlDescBreakdown.$inferSelect;
export type WalletFirstFundInsert = typeof walletFirstFund.$inferInsert;
export type FollowedWalletInsert = typeof followedWallets.$inferInsert;
export type FollowedWalletRow = typeof followedWallets.$inferSelect;
export type AlertRuleInsert = typeof alertRules.$inferInsert;
export type AlertRuleRow = typeof alertRules.$inferSelect;
export type HeliusWebhookInsert = typeof heliusWebhooks.$inferInsert;
export type HeliusWebhookRow = typeof heliusWebhooks.$inferSelect;
export type HeliusWebhookAddressInsert =
  typeof heliusWebhookAddresses.$inferInsert;
export type HeliusWebhookAddressRow =
  typeof heliusWebhookAddresses.$inferSelect;
export type WalletAuditCacheInsert = typeof walletAuditCache.$inferInsert;
export type WalletAuditCacheRow = typeof walletAuditCache.$inferSelect;
export type NewsBatchInsert = typeof newsBatches.$inferInsert;
export type NewsArticleInsert = typeof newsArticles.$inferInsert;

// #region Chatbot
export const chatAnalysisCache = pgTable(
  "chat_analysis_cache",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    walletAddress: varchar("wallet_address", { length: 44 }).notNull(),
    query: text("query").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    dataFingerprint: varchar("data_fingerprint", { length: 64 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    ttlMs: integer("ttl_ms").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    toolsUsed: varchar("tools_used", { length: 64 }).array().notNull().default([]),
    hasErrors: boolean("has_errors").notNull().default(false),
    responseType: varchar("response_type", { length: 16 }).notNull().default("tool_generated"),
  },
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    walletAddresses: jsonb("wallet_addresses").$type<string[]>().notNull().default([]),
    contextType: varchar("context_type", { length: 32 }).notNull().default("wallet"),
    contextHash: varchar("context_hash", { length: 64 }).notNull().default(""),
    title: varchar("title", { length: 255 }),
    messages: jsonb("messages").$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("chat_sessions_user_id_idx").on(table.userId),
  ],
);

export const chatPrompts = pgTable(
  "chat_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }).notNull(),
    query: text("query").notNull(),
    contextTypes: jsonb("context_types").$type<string[]>().notNull().default(["wallet"]),
    walletAddress: varchar("wallet_address", { length: 44 }),
    forkedFrom: uuid("forked_from"),
    isPublic: boolean("is_public").notNull().default(false),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("chat_prompts_user_id_idx").on(table.userId),
    index("chat_prompts_public_usage_idx").on(table.isPublic, table.usageCount),
  ],
);

export type ChatPromptInsert = typeof chatPrompts.$inferInsert;
export type ChatPromptRow = typeof chatPrompts.$inferSelect;
// #endregion
