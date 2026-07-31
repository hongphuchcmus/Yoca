import { z } from "zod";

const cg_NumberByCurrencySchema = z.record(z.string(), z.number().nullable());
const cg_StringByCurrencySchema = z.record(z.string(), z.string().nullable());

export const cg_TokenMarketChartSchema = z.object({
  prices: z.array(z.tuple([z.number(), z.number()])),
  market_caps: z.array(z.tuple([z.number(), z.number()])),
  total_volumes: z.array(z.tuple([z.number(), z.number()])),
});
export type CG_TokenMarketChart = z.infer<typeof cg_TokenMarketChartSchema>;

export const mrl_tokenMetadataSchema = z.object({
  symbol: z.string().trim().nullish(),
  name: z.string().trim().nullish(),
  logo: z.string().trim().nullish(),
});
export type MRL_TokenMetadata = z.infer<typeof mrl_tokenMetadataSchema>;

export const cg_CoinListItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  platforms: z.record(z.string(), z.string().nullable()).optional(),
});
export type CG_Token = z.infer<typeof cg_CoinListItemSchema>;

export const cg_CoinListSchema = z.array(cg_CoinListItemSchema);
export type CG_CoinList = z.infer<typeof cg_CoinListSchema>;

export const cg_CoinMarketSchema = z.object({
  id: z.string(),
  symbol: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  current_price: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  market_cap_rank: z.number().nullable().optional(),
  fully_diluted_valuation: z.number().nullable().optional(),
  total_volume: z.number().nullable().optional(),
  high_24h: z.number().nullable().optional(),
  low_24h: z.number().nullable().optional(),
  price_change_24h: z.number().nullable().optional(),
  price_change_percentage_24h: z.number().nullable().optional(),
  market_cap_change_24h: z.number().nullable().optional(),
  market_cap_change_percentage_24h: z.number().nullable().optional(),
  circulating_supply: z.number().nullable().optional(),
  total_supply: z.number().nullable().optional(),
  max_supply: z.number().nullable().optional(),
  ath: z.number().nullable().optional(),
  ath_change_percentage: z.number().nullable().optional(),
  ath_date: z.string().nullable().optional(),
  atl: z.number().nullable().optional(),
  atl_change_percentage: z.number().nullable().optional(),
  atl_date: z.string().nullable().optional(),
  roi: z.unknown().nullable().optional(),
  last_updated: z.string().nullable().optional(),
  sparkline_in_7d: z.object({ price: z.array(z.number()) }).optional(),
  price_change_percentage_1h_in_currency: z.number().nullable().optional(),
  price_change_percentage_24h_in_currency: z.number().nullable().optional(),
  price_change_percentage_7d_in_currency: z.number().nullable().optional(),
  price_change_percentage_14d_in_currency: z.number().nullable().optional(),
  price_change_percentage_30d_in_currency: z.number().nullable().optional(),
  price_change_percentage_200d_in_currency: z.number().nullable().optional(),
  price_change_percentage_1y_in_currency: z.number().nullable().optional(),
});

export const cg_CoinMarketsSchema = z.array(cg_CoinMarketSchema);
export type CG_CoinMarkets = z.infer<typeof cg_CoinMarketsSchema>;

export const cg_ExchangeListSchema = z.array(
  z.object({
    id: z.string(),
    image: z.string().optional(),
  }),
);
export type CG_ExchangeList = z.infer<typeof cg_ExchangeListSchema>;

export const cg_CoinDetailSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  platforms: z.record(z.string(), z.string().nullable()),
  detail_platforms: z
    .record(
      z.string(),
      z.object({
        decimal_place: z.number().nullable(),
        contract_address: z.string().nullable(),
      }),
    )
    .optional(),
  description: z.record(z.string(), z.string()).optional(),
  categories: z.array(z.string()).optional(),
  categories_details: z
    .array(z.object({ id: z.string().nullable().optional() }))
    .optional(),
  links: z
    .object({
      homepage: z.array(z.string()).optional(),
      blockchain_site: z.array(z.string()).optional(),
      chat_url: z.array(z.string()).optional(),
      telegram_channel_identifier: z.string().nullable().optional(),
      twitter_screen_name: z.string().nullable().optional(),
    })
    .optional(),
  image: z
    .object({
      thumb: z.string().nullable().optional(),
      small: z.string().nullable().optional(),
      large: z.string().nullable().optional(),
    })
    .optional(),
  market_data: z
    .object({
      current_price: cg_NumberByCurrencySchema.optional(),
      market_cap: cg_NumberByCurrencySchema.optional(),
      market_cap_rank: z.number().nullable().optional(),
      fully_diluted_valuation: cg_NumberByCurrencySchema.optional(),
      total_volume: cg_NumberByCurrencySchema.optional(),
      high_24h: cg_NumberByCurrencySchema.optional(),
      low_24h: cg_NumberByCurrencySchema.optional(),
      ath: cg_NumberByCurrencySchema.optional(),
      ath_change_percentage: cg_NumberByCurrencySchema.optional(),
      ath_date: cg_StringByCurrencySchema.optional(),
      atl: cg_NumberByCurrencySchema.optional(),
      atl_change_percentage: cg_NumberByCurrencySchema.optional(),
      atl_date: cg_StringByCurrencySchema.optional(),
      circulating_supply: z.number().nullable().optional(),
      max_supply: z.number().nullable().optional(),
      total_supply: z.number().nullable().optional(),
      price_change_24h: z.number().nullable().optional(),
      price_change_percentage_1h_in_currency:
        cg_NumberByCurrencySchema.optional(),
      price_change_percentage_24h: z.number().nullable().optional(),
      price_change_percentage_7d: z.number().nullable().optional(),
      price_change_percentage_14d: z.number().nullable().optional(),
      price_change_percentage_30d: z.number().nullable().optional(),
      price_change_percentage_200d: z.number().nullable().optional(),
      price_change_percentage_1y: z.number().nullable().optional(),
      market_cap_change_24h: z.number().nullable().optional(),
      market_cap_change_percentage_24h: z.number().nullable().optional(),
    })
    .optional(),
});
export type CG_CoinDetail = z.infer<typeof cg_CoinDetailSchema>;

export const cg_SearchSchema = z.object({
  coins: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable().optional(),
      api_symbol: z.string().nullable().optional(),
      symbol: z.string().nullable().optional(),
      market_cap_rank: z.number().nullable().optional(),
      thumb: z.string().nullable().optional(),
      large: z.string().nullable().optional(),
    }),
  ),
  exchanges: z.array(z.unknown()).optional(),
  icos: z.array(z.unknown()).optional(),
  categories: z.array(z.unknown()).optional(),
  nfts: z.array(z.unknown()).optional(),
});
export type CG_Search = z.infer<typeof cg_SearchSchema>;

const cg_PoolTimeframeStatsSchema = z.object({
  m5: z.string(),
  m15: z.string(),
  m30: z.string(),
  h1: z.string(),
  h6: z.string(),
  h24: z.string(),
});

const cg_PoolTransactionStatsSchema = z.object({
  buys: z.number(),
  sells: z.number(),
  buyers: z.number(),
  sellers: z.number(),
});

const cg_PoolTransactionsSchema = z.object({
  m5: cg_PoolTransactionStatsSchema,
  m15: cg_PoolTransactionStatsSchema,
  m30: cg_PoolTransactionStatsSchema,
  h1: cg_PoolTransactionStatsSchema,
  h6: cg_PoolTransactionStatsSchema,
  h24: cg_PoolTransactionStatsSchema,
});

const cg_PoolResourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.object({
    base_token_price_usd: z.string(),
    base_token_price_native_currency: z.string(),
    quote_token_price_usd: z.string(),
    quote_token_price_native_currency: z.string(),
    base_token_price_quote_token: z.string().nullable(),
    quote_token_price_base_token: z.string().nullable(),
    address: z.string(),
    name: z.string(),
    pool_created_at: z.string(),
    token_price_usd: z.string().nullable().optional(),
    fdv_usd: z.string().nullable().optional(),
    market_cap_usd: z.string().nullable().optional(),
    price_change_percentage: cg_PoolTimeframeStatsSchema,
    transactions: cg_PoolTransactionsSchema,
    volume_usd: cg_PoolTimeframeStatsSchema,
    reserve_in_usd: z.string().nullable(),
    sentiment_vote_positive_percentage: z.number().optional(),
    sentiment_vote_negative_percentage: z.number().optional(),
    community_sus_report: z.number().optional(),
  }),
  relationships: z.object({
    base_token: z.object({
      data: z.object({ id: z.string(), type: z.string() }),
    }),
    quote_token: z.object({
      data: z.object({ id: z.string(), type: z.string() }),
    }),
    dex: z.object({ data: z.object({ id: z.string(), type: z.string() }) }),
  }),
});

const cg_PoolIncludedResourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.object({
    address: z.string().optional(),
    name: z.string(),
    symbol: z.string().optional(),
    decimals: z.number().optional(),
    image_url: z.string().nullable().optional(),
    coingecko_coin_id: z.string().nullable().optional(),
  }),
});

export const cg_TopPoolDataSchema = z.object({
  data: z.array(cg_PoolResourceSchema),
  included: z.array(cg_PoolIncludedResourceSchema).optional(),
});
export type CG_TopPoolData = z.infer<typeof cg_TopPoolDataSchema>;

const cg_TopPoolRelationshipSchema = z.object({
  data: z.array(z.object({ id: z.string(), type: z.literal("pool") })),
});

export const cg_MultiTokenTopPoolsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      type: z.literal("token"),
      attributes: z.object({
        address: z.string(),
        name: z.string(),
        symbol: z.string(),
        decimals: z.number(),
        image_url: z.string().nullable(),
        coingecko_coin_id: z.string().nullable(),
        total_supply: z.string().nullable(),
        normalized_total_supply: z.string().nullable(),
        price_usd: z.string().nullable(),
        fdv_usd: z.string().nullable(),
        total_reserve_in_usd: z.string().nullable(),
        volume_usd: z.object({ h24: z.string().nullable() }),
        market_cap_usd: z.string().nullable(),
        last_trade_timestamp: z.number().optional(),
        launchpad_details: z
          .object({
            graduation_percentage: z.number().nullable(),
            completed: z.boolean(),
            completed_at: z.string().nullable(),
            migrated_destination_pool_address: z.string().nullable(),
          })
          .optional(),
      }),
      relationships: z.object({
        top_pools: cg_TopPoolRelationshipSchema,
      }),
    }),
  ),
  included: z.array(cg_PoolResourceSchema).optional(),
});
export type CG_MultiTokenTopPools = z.infer<typeof cg_MultiTokenTopPoolsSchema>;

export const cg_OnchainPoolSearchSchema = cg_TopPoolDataSchema;
export type CG_OnchainPoolSearch = z.infer<typeof cg_OnchainPoolSearchSchema>;

export const cg_PoolDataSchema = z.object({
  data: cg_PoolResourceSchema.extend({
    attributes: cg_PoolResourceSchema.shape.attributes.extend({
      base_token_balance: z.string().optional(),
      base_token_liquidity_usd: z.string().optional(),
      quote_token_balance: z.string().optional(),
      quote_token_liquidity_usd: z.string().optional(),
      pool_name: z.string().optional(),
      pool_fee_percentage: z.unknown().nullable().optional(),
      net_buy_volume_usd: cg_PoolTimeframeStatsSchema.optional(),
      buy_volume_usd: cg_PoolTimeframeStatsSchema.optional(),
      sell_volume_usd: cg_PoolTimeframeStatsSchema.optional(),
      locked_liquidity_percentage: z.unknown().nullable().optional(),
    }),
  }),
  included: z.array(cg_PoolIncludedResourceSchema).optional(),
});
export type CG_PoolData = z.infer<typeof cg_PoolDataSchema>;

export const cg_24hPoolTradesSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      attributes: z.object({
        block_number: z.number(),
        tx_hash: z.string(),
        tx_from_address: z.string(),
        from_token_amount: z.string(),
        to_token_amount: z.string(),
        price_from_in_currency_token: z.string(),
        price_to_in_currency_token: z.string(),
        price_from_in_usd: z.string(),
        price_to_in_usd: z.string(),
        block_timestamp: z.string(),
        kind: z.string(),
        volume_in_usd: z.string(),
        from_token_address: z.string(),
        to_token_address: z.string(),
      }),
    }),
  ),
});
export type CG_24hPoolTrades = z.infer<typeof cg_24hPoolTradesSchema>;

export type BDS_TrendingList = {
  success: boolean;
  data: {
    updateUnixTime: number;
    updateTime: string;
    tokens: Array<{
      address: string;
      decimals: number;
      liquidity: number;
      logoURI: string;
      name: string;
      symbol: string;
      volume24hUSD: number;
      volume24hChangePercent: number;
      rank: number;
      price: number;
      price24hChangePercent: number;
      fdv: number;
      marketcap: number;
    }>;
    total: number;
  };
};

export type MRL_TopHolders = {
  result: Array<{
    balance: string;
    balanceFormatted: string;
    isContract: string;
    ownerAddress: string;
    usdValue: string;
    percentageRelativeToTotalSupply: string;
  }>;
  cursor: string;
  page: string;
  pageSize: string;
  totalSupply: string;
};

export const tokenSideSchema = z.object({
  symbol: z.string().optional(),
  address: z.string(),
  decimals: z.number(),
  price: z.number().nullable(),
  amount: z.string(),
  ui_amount: z.number(),
  ui_change_amount: z.number(),
  type_swap: z.enum(["from", "to"]),
  is_scaled_ui_token: z.boolean(),
  multiplier: z.number().nullable(),
});

export const swapItemSchema = z.object({
  base: tokenSideSchema,
  quote: tokenSideSchema,
  tx_type: z.literal("swap"),
  tx_hash: z.string(),
  ins_index: z.number().nullable(),
  inner_ins_index: z.number().nullable(),
  block_unix_time: z.number(),
  block_number: z.number(),
  volume_usd: z.number(),
  volume: z.number(),
  owner: z.string(),
  signers: z.array(z.string()),
  source: z.string(),
  interacted_program_id: z.string(),
  pool_id: z.string(),
});

export const bds_RecentTradesSchema = z.object({
  data: z.object({
    items: z.array(swapItemSchema),
  }),
});

export type BDS_RecentTrades = z.infer<typeof bds_RecentTradesSchema>;

export const bds_HistoryPriceSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(
      z.object({
        unixTime: z.number(),
        value: z.number(),
      }),
    ),
  }),
});

export type BDS_HistoryPrice = z.infer<typeof bds_HistoryPriceSchema>;

export const bds_PriceAtTimestampSchema = z.strictObject({
  success: z.boolean().optional(),
  data: z
    .strictObject({
      value: z.number().optional(),
      price: z.number().optional(),
      updateUnixTime: z.number().optional(),
      updateHumanTime: z.string().optional(),
      priceChange24h: z.number().optional(),
      items: z
        .array(
          z.strictObject({
            value: z.number().optional(),
            price: z.number().optional(),
            unixTime: z.number().optional(),
            time: z.number().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export type BDS_PriceAtTimestamp = z.infer<typeof bds_PriceAtTimestampSchema>;

export const zrn_FungiblesResponseSchema = z.object({
  links: z.object({ self: z.string() }).optional(),
  data: z.array(
    z.object({
      type: z.literal("fungibles"),
      id: z.string(), // Zerion fungible_id (UUID)
      attributes: z.object({
        name: z.string(),
        symbol: z.string(),
        implementations: z.array(
          z.object({
            chain_id: z.string(),
            address: z.string().nullable(),
            decimals: z.number(),
          }),
        ),
      }),
    }),
  ),
});

export type ZRN_FungiblesResponse = z.infer<typeof zrn_FungiblesResponseSchema>;

const mbl_TokenTopHoldersMetadataSchema = z
  .object({
    entityName: z.string().nullable(),
    entityLogo: z.string().nullable(),
    entityLabels: z.array(z.string()),
    entityType: z.string().nullable(),
    entityDescription: z.string().nullable(),
    entityTwitter: z.string().nullable(),
    entityWebsite: z.string().nullable(),
    entityGithub: z.string().nullable(),
    entityDiscord: z.string().nullable(),
    entityTelegram: z.string().nullable(),
  })
    .nullable();

const mbl_TokenAllocationSchema = z.object({
  name: z.string(),
  percentage: z.coerce.number(),
});

const mbl_TokenUnlockEventSchema = z.object({
  unlock_date: z.coerce.number(),
  tokens_to_unlock: z.coerce.number().nullish().transform((value) => value ?? 0),
  allocation_details: z
    .record(z.string(), z.coerce.number())
    .nullish()
    .transform((value) => value ?? {}),
});

const mbl_TokenInvestorSchema = z.object({
  name: z.string(),
  type: z.string().nullish().transform((value) => value ?? ""),
  image: z.string().nullish().transform((value) => value ?? ""),
  country_name: z.string().nullish().transform((value) => value ?? ""),
  description: z.string().nullish().transform((value) => value ?? ""),
  lead: z.boolean().nullish().transform((value) => value ?? false),
});

export const mbl_TokenFundamentalsResponseSchema = z.object({
  data: z.object({
    distribution: z
      .array(mbl_TokenAllocationSchema)
      .nullable()
      .transform((value) => value ?? [])
      .optional(),
    release_schedule: z
      .array(mbl_TokenUnlockEventSchema)
      .nullable()
      .transform((value) => value ?? [])
      .optional(),
    investors: z
      .array(mbl_TokenInvestorSchema)
      .nullable()
      .transform((value) => value ?? [])
      .optional(),
  }),
});

export type MBL_TokenFundamentalsResponse = z.infer<
  typeof mbl_TokenFundamentalsResponseSchema
>;

export const mbl_TokenTopHoldersSchema = z.object({
  data: z.array(
    z.object({
      chainId: z.string(),
      walletAddress: z.string(),
      tokenAddress: z.string(),
      tokenAmount: z.string(),
      tokenAmountRaw: z.string(),
      tokenAmountUSD: z.string(),
      percentageOfTotalSupply: z.string(),
      pnlUSD: z.string(),
      realizedPnlUSD: z.string(),
      unrealizedPnlUSD: z.string(),
      totalPnlUSD: z.string(),
      totalFeesPaidUSD: z.string(),
      buyFeesPaidUSD: z.string(),
      sellFeesPaidUSD: z.string(),
      buys: z.number(),
      sells: z.number(),
      volumeBuyToken: z.string(),
      volumeSellToken: z.string(),
      volumeBuyUSD: z.string(),
      volumeSellUSD: z.string(),
      avgBuyPriceUSD: z.string(),
      avgSellPriceUSD: z.string(),
      nativeBalance: z.string(),
      nativeBalanceRaw: z.string(),
      walletFundAt: z.string().nullable(),
      lastActivityAt: z.string().nullable(),
      firstTradeAt: z.string().nullable(),
      lastTradeAt: z.string().nullable(),
      labels: z.array(z.string()),
      walletMetadata: mbl_TokenTopHoldersMetadataSchema,
      platform: z
        .object({
          id: z.string(),
          name: z.string(),
          logo: z.string().nullable(),
        })
        .nullable(),
      fundingInfo: z
        .object({
          from: z.string().nullable(),
          date: z.string().nullable(),
          chainId: z.string().nullable(),
          txHash: z.string().nullable(),
          amount: z.string().nullable(),
          formattedAmount: z.number().nullable(),
          currency: z
            .object({
              name: z.string(),
              symbol: z.string(),
              logo: z.string().nullable(),
              decimals: z.number(),
              address: z.string(),
            })
            .nullable(),
          fromWalletLogo: z.string().nullable(),
          fromWalletTag: z.string().nullable(),
          fromWalletMetadata: mbl_TokenTopHoldersMetadataSchema,
        })
        .nullable(),
    }),
  ),
  totalCount: z.number(),
});

export type MBL_TokenTopHolderSchema = z.infer<
  typeof mbl_TokenTopHoldersSchema
>;

export const bds_TrendingListSchema = z.object({
  success: z.boolean(),
  data: z.object({
    updateUnixTime: z.number(),
    updateTime: z.string(),
    tokens: z.array(
      z.object({
        address: z.string(),
        decimals: z.number(),
        liquidity: z.number(),
        logoURI: z.string().nullable().optional(),
        name: z.string(),
        symbol: z.string(),
        volume24hUSD: z.number(),
        volume24hChangePercent: z.number(),
        rank: z.number(),
        price: z.number(),
        price24hChangePercent: z.number(),
        fdv: z.number(),
        marketcap: z.number(),
      }),
    ),
    total: z.number(),
  }),
});

export type BDS_TrendingListSchema = z.infer<typeof bds_TrendingListSchema>;

const helius_WalletPaginationSchema = z.strictObject({
  nextCursor: z.string().nullish(),
  hasMore: z.boolean().nullish(),
});

const helius_WalletHistoryBalanceChangeSchema = z.strictObject({
  mint: z.string().nullish(),
  amount: z.coerce.number().nullish(),
  decimals: z.coerce.number().nullish(),
});

export const helius_WalletHistorySchema = z.strictObject({
  data: z.array(
    z.strictObject({
      signature: z.string(),
      slot: z.coerce.number().nullish(),
      fee: z.coerce.number().nullish(),
      feePayer: z.string().nullish(),
      timestamp: z.number(),
      type: z.string().nullish(),
      source: z.string().nullish(),
      description: z.string().nullish(),
      balanceChanges: z
        .array(helius_WalletHistoryBalanceChangeSchema)
        .nullish(),
      tokenTransfers: z.array(z.unknown()).nullish(),
      nativeTransfers: z.array(z.unknown()).nullish(),
      accountData: z.array(z.unknown()).nullish(),
      instructions: z.array(z.unknown()).nullish(),
      events: z.unknown().nullish(),
      transactionError: z.unknown().nullish(),
    }),
  ),
  pagination: helius_WalletPaginationSchema.nullish(),
});

export type HL_WalletHistory = z.infer<typeof helius_WalletHistorySchema>;

export const helius_WalletTransfersSchema = z.strictObject({
  data: z.array(
    z.strictObject({
      signature: z.string(),
      timestamp: z.number(),
      direction: z.string().nullish(),
      counterparty: z.string().nullish(),
      amountRaw: z.union([z.string(), z.number()]).nullish(),
      amount: z.union([z.string(), z.number()]).nullish(),
      decimal: z.union([z.string(), z.number()]).nullish(),
      decimals: z.union([z.string(), z.number()]).nullish(),
      mint: z.string().nullish(),
      symbol: z.string().nullish(),
      type: z.string().nullish(),
      source: z.string().nullish(),
      description: z.string().nullish(),
      fee: z.union([z.string(), z.number()]).nullish(),
      feePayer: z.string().nullish(),
      slot: z.union([z.string(), z.number()]).nullish(),
      from: z.string().nullish(),
      to: z.string().nullish(),
      fromUserAccount: z.string().nullish(),
      toUserAccount: z.string().nullish(),
      tokenTransfers: z.array(z.unknown()).nullish(),
      nativeTransfers: z.array(z.unknown()).nullish(),
    }),
  ),
  pagination: helius_WalletPaginationSchema.nullish(),
});

export type HL_WalletTransfers = z.infer<typeof helius_WalletTransfersSchema>;

export const helius_WalletFundedBySchema = z.strictObject({
  funder: z.string(),
  funderName: z.string().nullable(),
  funderType: z.string().nullable(),
  mint: z.string(),
  symbol: z.string(),
  amount: z.number(),
  amountRaw: z.string(),
  decimals: z.number(),
  date: z.string(),
  signature: z.string(),
  timestamp: z.number(),
  slot: z.number(),
  explorerUrl: z.string(),
});

export type HL_WalletFundedBy = z.infer<typeof helius_WalletFundedBySchema>;

const helius_EnhancedRawTokenAmountSchema = z.object({
  tokenAmount: z.string().optional(),
  decimals: z.number().optional(),
});

const helius_EnhancedSwapLegSchema = z.object({
  mint: z.string().optional(),
  tokenAmount: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  userAccount: z.string().optional(),
  tokenAccount: z.string().optional(),
  fromUserAccount: z.string().optional(),
  toUserAccount: z.string().optional(),
  fromTokenAccount: z.string().optional(),
  toTokenAccount: z.string().optional(),
  source: z.string().optional(),
  destination: z.string().optional(),
  sourceTokenAccount: z.string().optional(),
  destinationTokenAccount: z.string().optional(),
  rawTokenAmount: helius_EnhancedRawTokenAmountSchema.optional(),
});

const helius_EnhancedSwapNativeLegSchema = z.object({
  amount: z.coerce.number().optional(),
  userAccount: z.string().optional(),
  account: z.string().optional(),
  source: z.string().optional(),
  destination: z.string().optional(),
});

const helius_EnhancedSwapEventSchema = z.object({
  user: z.string().optional(),
  userAccount: z.string().optional(),
  tokenInputs: z.array(helius_EnhancedSwapLegSchema).optional(),
  tokenOutputs: z.array(helius_EnhancedSwapLegSchema).optional(),
  nativeInput: helius_EnhancedSwapNativeLegSchema.optional(),
  nativeOutput: helius_EnhancedSwapNativeLegSchema.optional(),
  source: z.string().optional(),
  destination: z.string().optional(),
  programId: z.string().optional(),
  innerSwaps: z
    .array(
      z.object({
        user: z.string().optional(),
        userAccount: z.string().optional(),
        tokenInputs: z.array(helius_EnhancedSwapLegSchema).optional(),
        tokenOutputs: z.array(helius_EnhancedSwapLegSchema).optional(),
        nativeInput: helius_EnhancedSwapNativeLegSchema.optional(),
        nativeOutput: helius_EnhancedSwapNativeLegSchema.optional(),
        source: z.string().optional(),
        destination: z.string().optional(),
        programId: z.string().optional(),
      }),
    )
    .optional(),
});

const helius_EnhancedInstructionSchema = z.object({
  accounts: z.array(z.string()).optional(),
  data: z.string().optional(),
  programId: z.string().optional(),
  innerInstructions: z
    .array(
      z.object({
        accounts: z.array(z.string()).optional(),
        data: z.string().optional(),
        programId: z.string().optional(),
      }),
    )
    .optional(),
});

const helius_EnhancedTokenTransferSchema = z.object({
  mint: z.string().optional(),
  tokenMint: z.string().optional(),
  tokenAmount: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  rawAmount: z
    .union([z.string(), helius_EnhancedRawTokenAmountSchema])
    .optional(),
  rawTokenAmount: helius_EnhancedRawTokenAmountSchema.optional(),
  decimals: z.number().optional(),
  fromUserAccount: z.string().optional(),
  toUserAccount: z.string().optional(),
  fromTokenAccount: z.string().optional(),
  toTokenAccount: z.string().optional(),
  symbol: z.string().optional(),
  tokenSymbol: z.string().optional(),
  tokenName: z.string().optional(),
  tokenStandard: z.string().nullable().optional(),
});

const helius_EnhancedNativeTransferSchema = z.object({
  amount: z.coerce.number().optional(),
  fromUserAccount: z.string().optional(),
  toUserAccount: z.string().optional(),
  fromWallet: z.string().optional(),
  toWallet: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const helius_EnhancedTransactionsSchema = z.array(
  z.object({
    signature: z.string(),
    feePayer: z.string().optional(),
    fee: z.number().optional(),
    slot: z.number().optional(),
    timestamp: z.number().optional(),
    source: z.string().optional(),
    type: z.string().optional(),
    description: z.string().optional(),
    programName: z.string().optional(),
    instructions: z.array(helius_EnhancedInstructionSchema).optional(),
    events: z
      .object({
        swap: helius_EnhancedSwapEventSchema.optional(),
        nft: z.object({
          mint: z.string().optional(),
          tokenMint: z.string().optional(),
          nftMint: z.string().optional(),
          action: z.string().optional(),
          type: z.string().optional(),
          eventType: z.string().optional(),
          name: z.string().optional(),
          collection: z.string().optional(),
          collectionName: z.string().optional(),
          priceUsd: z.number().optional(),
          salePriceUsd: z.number().optional(),
          amountUsd: z.number().optional(),
          marketplace: z.string().optional(),
          source: z.string().optional(),
        }).optional(),
        compressed: z.unknown().optional(),
      })
      .optional(),
    transactionEvents: z
      .object({
        swap: helius_EnhancedSwapEventSchema.optional(),
      })
      .optional(),
    accountData: z.array(z.unknown()).optional(),
    transactionError: z.unknown().optional(),
    info: z
      .object({
        feePayer: z.string().optional(),
        fee: z.number().optional(),
        slot: z.number().optional(),
        timestamp: z.number().optional(),
      })
      .optional(),
    tokenTransfers: z.array(helius_EnhancedTokenTransferSchema).optional(),
    nativeTransfers: z.array(helius_EnhancedNativeTransferSchema).optional(),
  }),
);

export type HL_EnhancedTransactions = z.infer<
  typeof helius_EnhancedTransactionsSchema
>;

export const dex_TopPoolsSchema = z.object({
  data: z.array(
    z.object({
      address: z.string(),
      name: z.string().nullable(),
      baseToken: z
        .object({
          address: z.string(),
          name: z.string().nullable(),
          symbol: z.string().nullable(),
        })
        .nullable(),
      quoteToken: z
        .object({
          address: z.string(),
          name: z.string().nullable(),
          symbol: z.string().nullable(),
        })
        .nullable(),
      price: z.number().nullable(),
      lastPrice24h: z.number().nullable(),
      lastPriceChange24hPercent: z.number().nullable(),
      fdv: z.number().nullable(),
      volumeUsd24h: z.number().nullable(),
      uniqueWallets24h: z.number().nullable(),
      txs24h: z.number().nullable(),
    }),
  ),
  pagination: z
    .object({
      page: z.number().optional(),
      pageSize: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
});

export type DEX_TopPools = z.infer<typeof dex_TopPoolsSchema>;

export const bds_TokenListV3Schema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(
      z.object({
        address: z.string(),
        price_change_24h_percent: z.number(),
      }),
    ),
  }),
});
export type BDS_TokenListV3 = z.infer<typeof bds_TokenListV3Schema>;

export const mrl_WalletSwapsSchema = z.object({
  result: z
    .array(
      z.object({
        transactionHash: z.string(),
        fromAddress: z.string(),
        toAddress: z.string(),
        blockNumber: z.number(),
        blockTimestamp: z.number(),
        fromTokenSymbol: z.string().nullable(),
        fromTokenName: z.string().nullable(),
        fromTokenDecimals: z.number().nullable(),
        fromTokenAddress: z.string(),
        toTokenSymbol: z.string().nullable(),
        toTokenName: z.string().nullable(),
        toTokenDecimals: z.number().nullable(),
        toTokenAddress: z.string(),
        fromTokenAmount: z.string(),
        toTokenAmount: z.string(),
        fromTokenAmountUSD: z.string().nullable(),
        toTokenAmountUSD: z.string().nullable(),
        dexName: z.string().nullable(),
        routerAddress: z.string().nullable(),
      }),
    )
    .nullable(),
  pagination: z
    .object({
      page: z.number().optional(),
      pageSize: z.number().optional(),
      pageCount: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
});

export type MRL_WalletSwaps = z.infer<typeof mrl_WalletSwapsSchema>;
