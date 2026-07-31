import {
    TOKEN_POOL_DATA_TTL_MS,
    TOKEN_POOLS_TTL_MS as TOKEN_TOP_POOLS_TTL_MS,
} from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import {
    tokenPoolData,
    tokenTopPools,
    type TokenPoolDataInsert,
    type TokenTopPoolInsert,
} from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { excludedAuto, excludedAutoFromInsert } from "@sv/util/orm-sql.js";
import * as cg from "@sv/util/util-coingecko.js";
import { and, eq, gt } from "drizzle-orm";
import {
    cg_ExchangeListSchema,
    cg_PoolDataSchema,
    cg_TopPoolDataSchema,
} from "../_types/token-raw-responses.js";

const DEX_ID_ALIASES: Record<string, string> = {
  raydium: "raydium2",
  raydium_clmm: "raydium2",
  raydium_cpmm: "raydium2",
  raydium_clamm: "raydium2",
  orca_whirlpools: "orca",
  meteora_dlmm: "meteora",
};

function resolveDexLogo(
  dexId: string | null | undefined,
  dexLogos: Map<string, string>,
): string | null {
  if (!dexId) return null;
  // Normalize dexId: lowercase and convert hyphens to underscores
  const normalizedDexId = dexId
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  // Look up through alias chain (may have multiple hops)
  const currentId = normalizedDexId;
  let resolvedId = DEX_ID_ALIASES[currentId] ?? currentId;
  // Follow the chain if alias maps to another alias
  while (DEX_ID_ALIASES[resolvedId] && DEX_ID_ALIASES[resolvedId] !== resolvedId) {
    resolvedId = DEX_ID_ALIASES[resolvedId];
  }
  // Try to find in the fetched logos map.
  return dexLogos.get(resolvedId) ?? null;
}

async function fetchDexLogos(): Promise<Map<string, string>> {
  const pageSize = 250;
  const result = new Map<string, string>();

  for (let page = 1; ; page += 1) {
    const cgEndpoint = cg.getEndpoint("/exchanges");
    cgEndpoint.search = new URLSearchParams({
      per_page: String(pageSize),
      page: String(page),
    }).toString();

    const resp = await pFetch(cg.spec, "coingecko.svc.exchange_list", cgEndpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });

    if (!resp.ok) {
      break;
    }

    const exchanges = await validateApiResult(cg_ExchangeListSchema, resp);
    if (!exchanges) {
      // TODO: Consider more robust error handling
      break;
    }

    for (const exchange of exchanges) {
      if (exchange.id && exchange.image) {
        result.set(exchange.id, exchange.image);
      }
    }

    if (exchanges.length < pageSize) {
      break;
    }
  }

  return result;
}

function trimIdPrefix(id: string, prefix: string = "solana_"): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

// https://docs.coingecko.com/v3.0.1/reference/top-pools-contract-address
async function fetchTokenTopPools(tokenAddress: string) {
  const cgEndpoint = cg.getEndpoint(
    `/onchain/networks/solana/tokens/${tokenAddress}/pools`,
  );

  cgEndpoint.search = new URLSearchParams({
    include: "base_token,quote_token,dex",
    sort: "h24_volume_usd_desc",
    page: "1",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.token_top_pools", cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  if (!resp.ok) {
    console.error(`fetchTokenTopPools failed for ${tokenAddress}: ${resp.status} ${resp.statusText} - URL: ${cgEndpoint.toString()}`);
    return [];
  }

  const res = await validateApiResult(cg_TopPoolDataSchema, resp);
  if (!res) {
    // TODO: Consider more robust error handling
    return [];
  }

  const dexLogos = await fetchDexLogos();
  const tokenLookup = new Map<string, string | null>();
  for (const item of res.included ?? []) {
    if (item.type == "token") {
      tokenLookup.set(item.id, item.attributes.image_url ?? null);
    }
  }

  const poolDataList = res.data.map(
    (
      raw,
      idx,
    ): { rankInfo: TokenTopPoolInsert; data: TokenPoolDataInsert } => ({
      rankInfo: {
        tokenAddress: tokenAddress,
        poolAddress: raw.attributes.address,
        rank: idx,
      },
      data: {
        poolAddress: raw.attributes.address,
        poolName: raw.attributes.name,

        baseAddress: trimIdPrefix(raw.relationships.base_token.data.id),
        baseImageUrl: tokenLookup.get(raw.relationships.base_token.data.id) ?? null,
        quoteAddress: trimIdPrefix(raw.relationships.quote_token.data.id),
        quoteImageUrl: tokenLookup.get(raw.relationships.quote_token.data.id) ?? null,

        dexId: raw.relationships.dex.data.id,
        dexImageUrl: resolveDexLogo(raw.relationships.dex.data.id, dexLogos),

        poolCreatedAt: new Date(raw.attributes.pool_created_at),
        liquidityUsd: Number(raw.attributes.reserve_in_usd),

        marketCapUsd: Number(raw.attributes.market_cap_usd && raw.attributes.market_cap_usd !== "0"
          ? raw.attributes.market_cap_usd
          : raw.attributes.fdv_usd),
        fdvUsd: Number(raw.attributes.fdv_usd),

        baseTokenPriceUsd: Number(raw.attributes.base_token_price_usd),
        quoteTokenPriceUsd: Number(raw.attributes.quote_token_price_usd),

        baseTokenPriceSol: Number(
          raw.attributes.base_token_price_native_currency,
        ),
        quoteTokenPriceSol: Number(
          raw.attributes.quote_token_price_native_currency,
        ),

        priceChangePercentage5m: Number(
          raw.attributes.price_change_percentage.m5,
        ),
        priceChangePercentage1h: Number(
          raw.attributes.price_change_percentage.h1,
        ),
        priceChangePercentage6h: Number(
          raw.attributes.price_change_percentage.h6,
        ),
        priceChangePercentage24h: Number(
          raw.attributes.price_change_percentage.h24,
        ),

        buys1h: raw.attributes.transactions.h1.buys,
        buys6h: raw.attributes.transactions.h6.buys,
        buys24h: raw.attributes.transactions.h24.buys,

        sells1h: raw.attributes.transactions.h1.sells,
        sells6h: raw.attributes.transactions.h6.sells,
        sells24h: raw.attributes.transactions.h24.sells,

        buyers1h: raw.attributes.transactions.h1.buyers,
        buyers6h: raw.attributes.transactions.h6.buyers,
        buyers24h: raw.attributes.transactions.h24.buyers,

        sellers1h: raw.attributes.transactions.h1.sellers,
        sellers6h: raw.attributes.transactions.h6.sellers,
        sellers24h: raw.attributes.transactions.h24.sellers,

        volumeUsd1h: Number(raw.attributes.volume_usd.h1),
        volumeUsd6h: Number(raw.attributes.volume_usd.h6),
        volumeUsd24h: Number(raw.attributes.volume_usd.h24),

        buyVolumeUsd1h: null,
        buyVolumeUsd6h: null,
        buyVolumeUsd24h: null,

        sellVolumeUsd1h: null,
        sellVolumeUsd6h: null,
        sellVolumeUsd24h: null,

        topPoolsUpdatedAt: new Date(),
      },
    }),
  );

  await db
    .delete(tokenTopPools)
    .where(eq(tokenTopPools.tokenAddress, tokenAddress));

  const rankInfo = await db
    .insert(tokenTopPools)
    .values(
      poolDataList.map((pool) => ({ ...pool.rankInfo, updatedAt: new Date() })),
    )
    .onConflictDoUpdate({
      target: [tokenTopPools.tokenAddress, tokenTopPools.rank],
      set: excludedAuto(tokenTopPools, [
        tokenTopPools.tokenAddress,
        tokenTopPools.rank,
      ]),
    })
    .returning();

  const poolDataValues = poolDataList.map((poolData) => poolData.data);
  const data = await db
    .insert(tokenPoolData)
    .values(poolDataValues)
    .onConflictDoUpdate({
      target: [tokenPoolData.poolAddress],
      set: excludedAutoFromInsert(
        tokenPoolData,
        tokenPoolData.poolAddress,
        poolDataValues,
      ),
    })
    .returning();
  const addressToPoolRank = Object.fromEntries(
    rankInfo.map((poolRank) => [poolRank.poolAddress, poolRank]),
  );
  const addressToPoolData = Object.fromEntries(
    data.map((poolData) => [poolData.poolAddress, poolData]),
  );

  return Object.keys(addressToPoolRank)
    .filter((address) => addressToPoolData[address])
    .map((address) => ({
      rankInfo: addressToPoolRank[address],
      data: addressToPoolData[address],
    }));
}

export async function getTokenTopPools(tokenAddress: string) {
  const listThresholdDate = new Date(Date.now() - TOKEN_TOP_POOLS_TTL_MS);

  const freshCheck = await db
    .select({ updatedAt: tokenTopPools.updatedAt })
    .from(tokenTopPools)
    .where(
      and(
        eq(tokenTopPools.tokenAddress, tokenAddress),
        gt(tokenTopPools.updatedAt, listThresholdDate),
      ),
    )
    .limit(1);

  if (freshCheck.length == 0) {
    return await fetchTokenTopPools(tokenAddress);
  }

  const pools = await db
    .select({
      rankInfo: tokenTopPools,
      data: tokenPoolData,
    })
    .from(tokenTopPools)
    .innerJoin(
      tokenPoolData,
      eq(tokenTopPools.poolAddress, tokenPoolData.poolAddress),
    )
    .where(eq(tokenTopPools.tokenAddress, tokenAddress))
    .orderBy(tokenTopPools.rank);

  const hasMissingDexLogo = pools.some((pool) => !pool.data.dexImageUrl);
  if (hasMissingDexLogo) {
    // Backfill dexImageUrl for older rows written before logo support.
    return await fetchTokenTopPools(tokenAddress);
  }

  dataUsage.record("db_result");
  return pools;
}

async function fetchPoolData(poolAddress: string) {
  const cgEndpoint = cg.getOnchainEndpoint(
    `/networks/solana/pools/${poolAddress}`,
  );

  cgEndpoint.search = new URLSearchParams({
    include: "base_token,quote_token,dex",
    include_volume_breakdown: "true",
    include_composition: "true",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.pool_details", cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  if (!resp.ok) {
    console.error(`fetchPoolData failed for ${poolAddress}: ${resp.status} ${resp.statusText} - URL: ${cgEndpoint.toString()}`);
    return null;
  }

  const res = await validateApiResult(cg_PoolDataSchema, resp);
  if (!res) {
    // TODO: Consider more robust error handling
    return null;
  }

  const dexLogos = await fetchDexLogos();
  const tokenLookup = new Map<string, string | null>();
  for (const item of res.included ?? []) {
    if (item.type == "token") {
      tokenLookup.set(item.id, item.attributes.image_url ?? null);
    }
  }

  const raw = res.data;
  const poolData: TokenPoolDataInsert = {
    poolAddress: raw.attributes.address,
    poolName: raw.attributes.name,

    baseAddress: trimIdPrefix(raw.relationships.base_token.data.id),
    baseImageUrl: tokenLookup.get(raw.relationships.base_token.data.id) ?? null,
    quoteAddress: trimIdPrefix(raw.relationships.quote_token.data.id),
    quoteImageUrl: tokenLookup.get(raw.relationships.quote_token.data.id) ?? null,

    dexId: raw.relationships.dex.data.id,
    dexImageUrl: resolveDexLogo(raw.relationships.dex.data.id, dexLogos),

    poolCreatedAt: new Date(raw.attributes.pool_created_at),
    liquidityUsd: Number(raw.attributes.reserve_in_usd),

    marketCapUsd: Number(raw.attributes.market_cap_usd && raw.attributes.market_cap_usd !== "0"
      ? raw.attributes.market_cap_usd
      : raw.attributes.fdv_usd),
    fdvUsd: Number(raw.attributes.fdv_usd),

    baseTokenPriceUsd: Number(raw.attributes.base_token_price_usd),
    quoteTokenPriceUsd: Number(raw.attributes.quote_token_price_usd),

    baseTokenPriceSol: Number(raw.attributes.base_token_price_native_currency),
    quoteTokenPriceSol: Number(
      raw.attributes.quote_token_price_native_currency,
    ),

    priceChangePercentage5m: Number(raw.attributes.price_change_percentage?.m5 || 0),
    priceChangePercentage1h: Number(raw.attributes.price_change_percentage?.h1 || 0),
    priceChangePercentage6h: Number(raw.attributes.price_change_percentage?.h6 || 0),
    priceChangePercentage24h: Number(
      raw.attributes.price_change_percentage?.h24 || 0,
    ),

    buys1h: raw.attributes.transactions?.h1?.buys || 0,
    buys6h: raw.attributes.transactions?.h6?.buys || 0,
    buys24h: raw.attributes.transactions?.h24?.buys || 0,

    sells1h: raw.attributes.transactions?.h1?.sells || 0,
    sells6h: raw.attributes.transactions?.h6?.sells || 0,
    sells24h: raw.attributes.transactions?.h24?.sells || 0,

    buyers1h: raw.attributes.transactions?.h1?.buyers || 0,
    buyers6h: raw.attributes.transactions?.h6?.buyers || 0,
    buyers24h: raw.attributes.transactions?.h24?.buyers || 0,

    sellers1h: raw.attributes.transactions?.h1?.sellers || 0,
    sellers6h: raw.attributes.transactions?.h6?.sellers || 0,
    sellers24h: raw.attributes.transactions?.h24?.sellers || 0,

    volumeUsd1h: Number(raw.attributes.volume_usd?.h1 || 0),
    volumeUsd6h: Number(raw.attributes.volume_usd?.h6 || 0),
    volumeUsd24h: Number(raw.attributes.volume_usd?.h24 || 0),

    buyVolumeUsd1h: Number(raw.attributes.buy_volume_usd?.h1 || 0),
    buyVolumeUsd6h: Number(raw.attributes.buy_volume_usd?.h6 || 0),
    buyVolumeUsd24h: Number(raw.attributes.buy_volume_usd?.h24 || 0),

    sellVolumeUsd1h: Number(raw.attributes.sell_volume_usd?.h1 || 0),
    sellVolumeUsd6h: Number(raw.attributes.sell_volume_usd?.h6 || 0),
    sellVolumeUsd24h: Number(raw.attributes.sell_volume_usd?.h24 || 0),

    updatedAt: new Date(),
  };

  const [inserted] = await db
    .insert(tokenPoolData)
    .values(poolData)
    .onConflictDoUpdate({
      target: [tokenPoolData.poolAddress],
      set: excludedAuto(tokenPoolData, tokenPoolData.poolAddress),
    })
    .returning();

  return inserted || null;
}

export async function getTokenPoolData(poolAddress: string, forceRefresh: boolean = false) {
  if (forceRefresh) {
    dataUsage.record("forced_refresh");
  }

  if (!forceRefresh) {
    const thresholdDate = new Date(Date.now() - TOKEN_POOL_DATA_TTL_MS);

    const poolData = await db
      .select()
      .from(tokenPoolData)
      .where(
        and(
          eq(tokenPoolData.poolAddress, poolAddress),
          gt(tokenPoolData.updatedAt, thresholdDate),
        ),
      )
      .limit(1);

    if (poolData.length > 0) {
      dataUsage.record("db_result");
      return poolData[0];
    }
  }

  return await fetchPoolData(poolAddress);
}

export async function getTokenPoolDataList(poolAddresses: string[], forceRefresh: boolean = false) {
  const results = await Promise.all(
    poolAddresses.map((address) => getTokenPoolData(address, forceRefresh)),
  );

  return results.filter((pool) => pool != null);
}
