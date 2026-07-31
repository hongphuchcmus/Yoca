import {
    TOKEN_DETAILS_TTL_MS,
    TOP_TOKEN_HOLDERS_TTL_MS,
} from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import {
    TokenDetailedInfoSelect,
    tokenDetails,
    tokenHolderStats,
    tokenMarketData,
    tokenMeta,
    TokenMetaSelect,
    type TokenDetailedInfoInsert,
    type TokenMarketDataInsert,
    type TokenMetaInsert,
} from "@sv/db/schema.js";
import {
    excludedAutoFromInsert,
    excludedAutoNonNullFromInsert,
} from "@sv/util/orm-sql.js";
import * as cg from "@sv/util/util-coingecko.js";
import * as moralis from "@sv/util/util-moralis.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import {
    cg_CoinDetailSchema,
    mrl_tokenMetadataSchema,
} from "../_types/token-raw-responses.js";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getCoinGeckoIdsByAddresses } from "./token-list.js";
import { fetchCgMarketDataBatched } from "./token-market-data.js";
import { refreshTokenHolderSnapshot } from "./token-holders.js";

function isCgRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  return Number(status) === 429;
}

async function fetchTokenDetails(tokenAddresses: string[]) {
  if (tokenAddresses.length == 0) {
    return {
      meta: [],
      details: [],
      market: [],
    };
  }

  const addressToCgIds = await getCoinGeckoIdsByAddresses(tokenAddresses);

  const rawInfoSettled = await Promise.allSettled(
    tokenAddresses
      .filter((address) => addressToCgIds[address])
      .map(async (address) => {
        const endpoint = cg.getEndpoint(
          `/coins/${addressToCgIds[address]}`
        );
        endpoint.search = new URLSearchParams({
          localization: "false",
          tickers: "false",
          market_data: "true",
          community_data: "true",
          developer_data: "true",
          include_categories_details: "true",
        }).toString();

        const resp = await pFetch(cg.spec, "coingecko.svc.token_metadata", endpoint, {
          method: "GET",
          headers: cg.getRequiredHeaders(),
        });

        if (!resp.ok) {
          return null;
        }

        const data = await validateApiResult(cg_CoinDetailSchema, resp);
        return data;
      }),
  );

  const rawInfoList = rawInfoSettled.flatMap((result) =>
    result.status === "fulfilled" && result.value != null ? [result.value] : [],
  );

  const details = rawInfoList.map(
    (
      raw,
    ): {
      meta: TokenMetaInsert;
      detailedInfo: TokenDetailedInfoInsert;
      market: TokenMarketDataInsert;
    } => ({
      meta: {
        address: raw.platforms.solana!,
        name: raw.name,
        symbol: raw.symbol,
        imageUrl: raw.image?.small,
      },
      detailedInfo: {
        coingeckoId: raw.id,
        decimals: raw.detail_platforms?.solana?.decimal_place ?? 0,
        address: raw.platforms.solana!,
        description: raw.description?.en ?? '',
        categories: raw.categories_details?.map(
          (detail: { id?: string | null }) => detail.id!,
        ),
        linkBlockchainSites: raw.links?.blockchain_site,
        linkDiscord: raw.links?.chat_url?.find((url: string) =>
          url.startsWith("https://discord.com/invite/"),
        ),
        linkHomepage: raw.links?.homepage?.at(0),
        telegramChannel: raw.links?.telegram_channel_identifier,
        twitterScreenName: raw.links?.twitter_screen_name,
      },
      market: {
        address: raw.platforms.solana!,
        fullyDilutedValuation: raw.market_data?.fully_diluted_valuation?.usd ?? null,
        marketCap: raw.market_data?.market_cap?.usd ?? 0,
        marketCapRank: raw.market_data?.market_cap_rank ?? null,
        priceUsd: raw.market_data?.current_price?.usd ?? 0,
        volume24h: raw.market_data?.total_volume?.usd ?? 0,
        ath: raw.market_data?.ath?.usd ?? null,
        athChangePercentage: raw.market_data?.ath_change_percentage?.usd ?? null,
        athDate: raw.market_data?.ath_date?.usd ? new Date(raw.market_data.ath_date.usd) : null,
        atl: raw.market_data?.atl?.usd ?? null,
        atlChangePercentage: raw.market_data?.atl_change_percentage?.usd ?? null,
        atlDate: raw.market_data?.atl_date?.usd ? new Date(raw.market_data.atl_date.usd) : null,
        circulatingSupply: raw.market_data?.circulating_supply,
        high24h: raw.market_data?.high_24h?.usd ?? null,
        low24h: raw.market_data?.low_24h?.usd ?? null,
        priceChangePercentage1h:
          raw.market_data?.price_change_percentage_1h_in_currency?.usd,
        priceChange24h: raw.market_data?.price_change_24h,
        priceChangePercentage24h: raw.market_data?.price_change_percentage_24h,
        priceChangePercentage7d: raw.market_data?.price_change_percentage_7d,
        priceChangePercentage14d: raw.market_data?.price_change_percentage_14d,
        priceChangePercentage30d: raw.market_data?.price_change_percentage_30d,
        priceChangePercentage200d:
          raw.market_data?.price_change_percentage_200d,
        priceChangePercentage1y: raw.market_data?.price_change_percentage_1y,
        marketCapChange24h: raw.market_data?.market_cap_change_24h,
        marketCapChangePercentage24h:
          raw.market_data?.market_cap_change_percentage_24h,
        maxSupply: raw.market_data?.max_supply,
        totalSupply: raw.market_data?.total_supply,
      },
    }),
  );

  const metaValues = details.map((detail) => detail.meta);
  const detailedInfoValues = details.map((detail) => detail.detailedInfo);
  const marketDataValues = details.map((detail) => detail.market);

  if (
    metaValues.length == 0 ||
    detailedInfoValues.length == 0 ||
    marketDataValues.length == 0
  ) {
    return {
      meta: [],
      details: [],
      market: [],
    };
  }

  return {
    meta: await db
      .insert(tokenMeta)
      .values(metaValues)
      .onConflictDoUpdate({
        target: [tokenMeta.address],
        set: excludedAutoNonNullFromInsert(
          tokenMeta,
          tokenMeta.address,
          metaValues,
        ),
      })
      .returning(),
    details: await db
      .insert(tokenDetails)
      .values(detailedInfoValues)
      .onConflictDoUpdate({
        target: [tokenDetails.address],
        set: excludedAutoFromInsert(
          tokenDetails,
          tokenDetails.address,
          detailedInfoValues,
        ),
      })
      .returning(),
    market: await db
      .insert(tokenMarketData)
      .values(marketDataValues)
      .onConflictDoUpdate({
        target: [tokenMarketData.address],
        set: excludedAutoFromInsert(
          tokenMarketData,
          tokenMarketData.address,
          marketDataValues,
        ),
      })
      .returning(),
  };
}

async function fetchTokenMeta(tokenAddresses: string[]) {
  if (tokenAddresses.length == 0) {
    return [];
  }

  // We cheat and use market data here as it allow get multiple tokens info in one request
  // Potential extra 1 API here, but better than fetch each addresses.
  const addressToCgId = await getCoinGeckoIdsByAddresses(tokenAddresses);
  const cgIds = Object.values(addressToCgId);

  if (cgIds.length == 0) {
    return [];
  }

  const res = await fetchCgMarketDataBatched(cgIds);

  const cgIdToAddress = Object.fromEntries(
    Object.entries(addressToCgId).map(([address, id]) => [id, address]),
  );

  const metaValues = res
    .filter((raw) => cgIdToAddress[raw.id!])
    .map(
      (raw): TokenMetaInsert => ({
        address: cgIdToAddress[raw.id!],
        name: raw.name!,
        symbol: raw.symbol!,
        imageUrl: raw.image,
      }),
    );

  if (metaValues.length == 0) {
    return [];
  }

  return db
    .insert(tokenMeta)
    .values(metaValues)
    .onConflictDoUpdate({
      target: [tokenMeta.address],
      set: excludedAutoNonNullFromInsert(
        tokenMeta,
        tokenMeta.address,
        metaValues,
      ),
    })
    .returning();
}

export async function getTokenMeta(tokenAddresses: string[]) {
  const uniqueAddresses = Array.from(
    new Set(tokenAddresses.map((address) => address.trim()).filter(Boolean)),
  );
  if (uniqueAddresses.length == 0) {
    return [];
  }

  const thresholdDate = new Date(Date.now() - TOKEN_DETAILS_TTL_MS);
  const cachedRows = await db
    .select()
    .from(tokenMeta)
    .where(inArray(tokenMeta.address, uniqueAddresses))
    .limit(uniqueAddresses.length);
  dataUsage.record("db_result");
  const cachedByAddress = new Map(
    cachedRows.map((meta) => [meta.address, meta]),
  );
  const resolvedByAddress = new Map<string, TokenMetaSelect>();

  for (const meta of cachedRows) {
    if (meta.updatedAt >= thresholdDate) {
      resolvedByAddress.set(meta.address, meta);
    }
  }

  const staleAddresses = uniqueAddresses.filter(
    (address) => !resolvedByAddress.has(address),
  );
  let coinGeckoRows: Awaited<ReturnType<typeof fetchTokenMeta>> = [];
  try {
    coinGeckoRows = await fetchTokenMeta(staleAddresses);
  } catch (error) {
    if (!isCgRateLimitError(error)) {
      console.warn("Failed to refresh token metadata from CoinGecko", error);
    }
  }

  for (const meta of coinGeckoRows) {
    resolvedByAddress.set(meta.address, meta);
  }

  const moralisAddresses = uniqueAddresses.filter(
    (address) => !resolvedByAddress.has(address),
  );
  const moralisValues = await Promise.all(
    moralisAddresses.map(async (address): Promise<TokenMetaInsert | null> => {
      try {
        const endpoint = moralis.getEndpoint(
          `/token/mainnet/${address}/metadata`,
        );
        const response = await pFetch(moralis.spec, "moralis.svc.token_metadata", endpoint, {
          method: "GET",
          headers: moralis.getRequiredHeaders(),
        });
        const parsed = await validateApiResult(
          mrl_tokenMetadataSchema,
          response,
        );
        if (!parsed) return null;

        return {
          address,
          symbol: parsed.symbol || null,
          name: parsed.name || null,
          imageUrl: parsed.logo || null,
        };
      } catch {
        return null;
      }
    }),
  );
  const validMoralisValues = moralisValues.filter(
    (value): value is TokenMetaInsert => value != null,
  );
  if (validMoralisValues.length > 0) {
    const moralisRows = await db
      .insert(tokenMeta)
      .values(validMoralisValues)
      .onConflictDoUpdate({
        target: [tokenMeta.address],
        set: excludedAutoNonNullFromInsert(
          tokenMeta,
          tokenMeta.address,
          validMoralisValues,
        ),
      })
      .returning();
    for (const meta of moralisRows) {
      resolvedByAddress.set(meta.address, meta);
    }
  }

  for (const address of uniqueAddresses) {
    if (resolvedByAddress.has(address)) continue;
    const stale = cachedByAddress.get(address);
    if (stale) {
      resolvedByAddress.set(address, stale);
    }
  }

  return uniqueAddresses
    .map((address) => resolvedByAddress.get(address))
    .filter((meta): meta is TokenMetaSelect => meta != null);
}

export async function getTokenDetails(tokenAddresses: string[]) {
  const thresholdDate = new Date(Date.now() - TOKEN_DETAILS_TTL_MS);

  const res = await db
    .select({
      address: tokenMeta.address,
      meta: tokenMeta,
      details: tokenDetails,
    })
    .from(tokenMeta)
    .innerJoin(tokenDetails, eq(tokenMeta.address, tokenDetails.address))
    .where(
      and(
        inArray(tokenMeta.address, tokenAddresses),
        gte(tokenMeta.updatedAt, thresholdDate),
        gte(tokenDetails.updatedAt, thresholdDate),
      ),
    );
  if (res.length == tokenAddresses.length) {
    dataUsage.record("db_result");
    return res;
  }

  const addressToRes = Object.fromEntries(res.map((row) => [row.address, row]));

  const staleAddresses = tokenAddresses.filter(
    (address) => !addressToRes[address],
  );
  let refreshedMeta: TokenMetaSelect[] = [];
  let refreshedDetails: TokenDetailedInfoSelect[] = [];
  try {
    const fetched = await fetchTokenDetails(staleAddresses);
    refreshedMeta = fetched.meta;
    refreshedDetails = fetched.details;
  } catch (error) {
    if (isCgRateLimitError(error)) {
      if (res.length > 0) {
        dataUsage.record("db_result", "stale_fallback");
      }
      return res;
    }
    throw error;
  }
  const addressToRefreshedDetails = Object.fromEntries(
    refreshedDetails.map((detail) => [detail.address, detail]),
  );

  const refreshed = refreshedMeta
    .filter((meta) => addressToRefreshedDetails[meta.address])
    .map((meta) => ({
      address: meta.address,
      meta,
      details: addressToRefreshedDetails[meta.address],
    }));
  const full = [...res, ...refreshed];

  if (res.length > 0) {
    dataUsage.record("db_result");
  }
  if (refreshed.length > 0) {
    dataUsage.record("provider_result");
  }

  return full;
}

export async function getTokenHolderStats(tokenAddresses: string[]) {
  const thresholdDate = new Date(Date.now() - TOP_TOKEN_HOLDERS_TTL_MS);

  const res = await db
    .select()
    .from(tokenHolderStats)
    .where(
      and(
        gte(tokenHolderStats.updatedAt, thresholdDate),
        inArray(tokenHolderStats.address, tokenAddresses),
      ),
    );

  const addressToStats = Object.fromEntries(
    res.map((holderStat) => [holderStat.address, holderStat]),
  );

  const staleAddresses = tokenAddresses.filter(
    (address) => !addressToStats[address],
  );

  if (staleAddresses.length == 0) {
    dataUsage.record("db_result");
    return res;
  }

  const refreshed = await Promise.all(
    staleAddresses.map((address) => refreshTokenHolderSnapshot(address)),
  );
  const refreshedStats = refreshed.flatMap((snapshot) =>
    snapshot ? [snapshot.stats] : [],
  );

  if (res.length > 0) {
    dataUsage.record("db_result");
  }
  if (refreshedStats.length > 0) {
    dataUsage.record("provider_result");
  }

  return [...res, ...refreshedStats];
}
