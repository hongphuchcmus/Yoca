import { validateApiResult } from "@sv/middlewares/validation.js";
import { db } from "@sv/db/index.js";
import { marketPoolLists } from "@sv/db/schema.js";
import {
    bds_TokenListV3Schema,
    cg_MultiTokenTopPoolsSchema,
    cg_TopPoolDataSchema,
    type BDS_TokenListV3,
    type CG_TopPoolData,
} from "@sv/services/_types/token-raw-responses.js";
import { pFetch } from "@sv/util/rate-limit.js";
import type { MarketPoolItem } from "@sv/types/market-pool.js";
import * as bds from "@sv/util/util-birdeye.js";
import * as cg from "@sv/util/util-coingecko.js";
import { eq } from "drizzle-orm";
import { dataUsage } from "@sv/middlewares/request-context.js";

const INCLUDE = "base_token,quote_token,dex";
const TARGET_POOL_COUNT = 100;
const GAINER_TOKEN_COUNT = 50;
const CG_DEMO_BATCH_SIZE = 30;
const MAX_PAGE_ROUNDS = 12;
const MIN_LIQUIDITY_USD = 500;
const MARKET_POOL_LIST_TTL_MS = {
  trending: 2 * 60 * 1000,
  top: 5 * 60 * 1000,
  gainers: 5 * 60 * 1000,
  newPairs: 1 * 60 * 1000,
};

export type PoolDuration = "5m" | "1h" | "6h" | "24h";
export type PoolTopSort = "volume" | "txns" | "marketCap";

export type { MarketPoolItem } from "@sv/types/market-pool.js";

async function getStoredMarketPools(
  listKey: string,
  ttlMs: number,
  fetchPools: () => Promise<MarketPoolItem[]>,
): Promise<MarketPoolItem[]> {
  const [existingList] = await db
    .select()
    .from(marketPoolLists)
    .where(eq(marketPoolLists.listKey, listKey))
    .limit(1);

  if (existingList && existingList.expiresAt > new Date()) {
    dataUsage.record("db_result");
    return existingList.responseJson;
  }

  try {
    const fetchedPools = await fetchPools();
    const now = new Date();
    await db
      .insert(marketPoolLists)
      .values({
        listKey,
        responseJson: fetchedPools,
        expiresAt: new Date(now.getTime() + ttlMs),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marketPoolLists.listKey,
        set: {
          responseJson: fetchedPools,
          expiresAt: new Date(now.getTime() + ttlMs),
          updatedAt: now,
        },
      });
    return fetchedPools;
  } catch (error) {
    if (existingList) {
      dataUsage.record("db_result", "stale_fallback");
      console.warn(
        `Using stored market pool list after refresh failure: ${listKey}`,
      );
      return existingList.responseJson;
    }
    throw error;
  }
}

function toNumber(input: string | number | null | undefined): number | null {
  if (input == null) {
    return null;
  }

  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function trimIdPrefix(id: string, prefix: string = "solana_"): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

async function fetchCgPools(
  path: string,
  query: Record<string, string>,
): Promise<MarketPoolItem[]> {
  const candidates: MarketPoolItem[] = [];
  const seenPools = new Set<string>();

  for (let page = 1; page <= MAX_PAGE_ROUNDS; page += 1) {
    const cgEndpoint = cg.getOnchainEndpoint(path);
    cgEndpoint.search = new URLSearchParams({
      include: INCLUDE,
      page: String(page),
      ...query,
    }).toString();

    const resp = await pFetch(cg.spec, "coingecko.svc.market_pools", cgEndpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });

    if (!resp.ok) {
      console.error(
        `FetchPools: Error ${resp.status} for URL: ${cgEndpoint.toString()}`,
      );
      break;
    }

    const res = await validateApiResult(cg_TopPoolDataSchema, resp);
    if (!res) {
      // TODO: Consider more robust error handling
      break;
    }
    const pageItems = mapCgPools(res);

    if (pageItems.length == 0) {
      // Log for debugging empty responses
      console.warn(
        `FetchPools: Page ${page} returned 0 items for URL: ${cgEndpoint.toString()}`,
      );
      // Don't break immediately on page 1, try a few more if it's a list fetch
      if (page > 3) break;
      continue;
    }

    for (const item of pageItems) {
      if (seenPools.has(item.poolAddress)) {
        continue;
      }

      seenPools.add(item.poolAddress);
      candidates.push(item);
    }

    if (candidates.length >= TARGET_POOL_COUNT) {
      break;
    }
  }

  if (candidates.length == 0) {
    return [];
  }

  // The list endpoints (trending, pools, top) already return the full pool data
  // (volume, liquidity, price changes, etc.) so we don't need to enrich them again.
  return candidates.slice(0, TARGET_POOL_COUNT);
}

function mapCgPools(res: CG_TopPoolData): MarketPoolItem[] {
  const tokenLookup = new Map<
    string,
    { address: string; name: string; symbol: string; imageUrl: string | null }
  >();
  const dexLookup = new Map<string, { name: string }>();

  for (const item of res.included ?? []) {
    if (item.type == "token") {
      tokenLookup.set(item.id, {
        address: item.attributes.address ?? "",
        name: item.attributes.name,
        symbol: item.attributes.symbol ?? "",
        imageUrl: item.attributes.image_url ?? null,
      });
      continue;
    }

    if (item.type == "dex") {
      dexLookup.set(item.id, {
        name: item.attributes.name,
      });
    }
  }

  return res.data.map((pool) => {
    const baseTokenId = pool.relationships.base_token.data.id;
    const quoteTokenId = pool.relationships.quote_token.data.id;
    const dexId = pool.relationships.dex.data.id;

    const baseToken = tokenLookup.get(baseTokenId);
    const quoteToken = tokenLookup.get(quoteTokenId);
    const dex = dexLookup.get(dexId);

    const buys24h = pool.attributes.transactions?.h24?.buys ?? 0;
    const sells24h = pool.attributes.transactions?.h24?.sells ?? 0;

    return {
      id: pool.id,
      poolAddress: pool.attributes.address,
      poolName: pool.attributes.name,
      dexId,
      dexName: dex?.name ?? dexId,
      baseAddress: baseToken?.address || trimIdPrefix(baseTokenId),
      baseName: baseToken?.name ?? "",
      baseSymbol: baseToken?.symbol ?? "",
      baseImageUrl: baseToken?.imageUrl ?? null,
      quoteAddress: quoteToken?.address || trimIdPrefix(quoteTokenId),
      quoteName: quoteToken?.name ?? "",
      quoteSymbol: quoteToken?.symbol ?? "",
      quoteImageUrl: quoteToken?.imageUrl ?? null,
      priceUsd: toNumber(pool.attributes.base_token_price_usd),
      marketCapUsd: toNumber(
        pool.attributes.market_cap_usd && pool.attributes.market_cap_usd !== "0"
          ? pool.attributes.market_cap_usd
          : pool.attributes.fdv_usd,
      ),
      fdvUsd: toNumber(pool.attributes.fdv_usd),
      txns24h: buys24h + sells24h,
      volume24h: toNumber(pool.attributes.volume_usd?.h24),
      priceChange5m: toNumber(pool.attributes.price_change_percentage?.m5),
      priceChange1h: toNumber(pool.attributes.price_change_percentage?.h1),
      priceChange6h: toNumber(pool.attributes.price_change_percentage?.h6),
      priceChange24h: toNumber(pool.attributes.price_change_percentage?.h24),
      liquidityUsd: toNumber(pool.attributes.reserve_in_usd),
      poolCreatedAt: pool.attributes.pool_created_at ?? null,
    };
  });
}

async function fetchTrendingMarketPools(duration: PoolDuration) {
  const result = await fetchCgPools("/networks/solana/trending_pools", {
    duration,
  });

  if (result.length > 0 || duration == "5m") {
    return result;
  }

  // Fallback for demo-tier data sparsity on longer durations.
  return await fetchCgPools("/networks/solana/trending_pools", {
    duration: "5m",
  });
}

export async function getTrendingMarketPools(duration: PoolDuration) {
  return await getStoredMarketPools(
    `trending:${duration}`,
    MARKET_POOL_LIST_TTL_MS.trending,
    () => fetchTrendingMarketPools(duration),
  );
}

async function fetchNewMarketPools() {
  // Với New Pools, chúng ta chỉ cần fetch 2 trang đầu (40 pools) để đảm bảo độ tươi (freshness)
  // và tránh việc lấy quá nhiều dữ liệu cũ từ các trang sau.
  const cgEndpoint = cg.getOnchainEndpoint("/networks/solana/new_pools");
  const allResults: MarketPoolItem[] = [];

  for (let page = 1; page <= 2; page++) {
    cgEndpoint.search = new URLSearchParams({
      include: INCLUDE,
      page: String(page),
    }).toString();

    const resp = await pFetch(cg.spec, "coingecko.svc.trending_pools", cgEndpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });

    if (resp.ok) {
      const res = await validateApiResult(cg_TopPoolDataSchema, resp);
      if (res) {
        allResults.push(...mapCgPools(res));
      }
    } else {
      break;
    }
  }

  // Ép sắp xếp theo thời gian tạo mới nhất lên đầu (Newest First)
  return allResults.sort((a, b) => {
    const timeA = a.poolCreatedAt ? new Date(a.poolCreatedAt).getTime() : 0;
    const timeB = b.poolCreatedAt ? new Date(b.poolCreatedAt).getTime() : 0;
    return timeB - timeA;
  });
}

export async function getNewMarketPools() {
  return await getStoredMarketPools(
    "new-pairs",
    MARKET_POOL_LIST_TTL_MS.newPairs,
    fetchNewMarketPools,
  );
}

async function fetchTopMarketPools(sortBy: PoolTopSort) {
  const sortCandidates: Record<PoolTopSort, string[]> = {
    volume: ["h24_volume_usd_desc"],
    txns: ["h24_tx_count_desc", "tx_count_desc", "h24_txns_desc"],
    marketCap: ["market_cap_usd_desc"],
  };

  for (const sort of sortCandidates[sortBy]) {
    const result = await fetchCgPools("/networks/solana/pools", { sort });

    if (result.length > 0) {
      return result;
    }
  }

  return [];
}

export async function getTopMarketPools(sortBy: PoolTopSort) {
  return await getStoredMarketPools(
    `top:${sortBy}`,
    MARKET_POOL_LIST_TTL_MS.top,
    () => fetchTopMarketPools(sortBy),
  );
}

function chunkStrings(values: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchBirdeyeGainers(): Promise<
  BDS_TokenListV3["data"]["items"]
> {
  const endpoint = bds.getEndpoint("/defi/v3/token/list");
  endpoint.search = new URLSearchParams({
    sort_by: "price_change_24h_percent",
    sort_type: "desc",
    min_liquidity: "50000",
    min_market_cap: "100000",
    min_volume_24h_usd: "10000",
    limit: String(GAINER_TOKEN_COUNT),
  }).toString();

  const resp = await pFetch(bds.spec, "birdeye.svc.market_gainers", endpoint, {
    method: "GET",
    headers: bds.getRequiredHeaders(),
  });

  if (!resp.ok) {
    throw new Error(`Birdeye top gainers request failed: ${resp.status}`);
  }

  const payload = await validateApiResult(bds_TokenListV3Schema, resp);
  if (!payload) {
    throw new Error("Birdeye top gainers response validation failed");
  }

  return payload.data.items;
}

async function fetchTopGainerMarketPools(): Promise<MarketPoolItem[]> {
  const gainers = await fetchBirdeyeGainers();
  const poolAddressByToken = new Map<string, string>();

  for (const batch of chunkStrings(
    gainers.map((token) => token.address),
    CG_DEMO_BATCH_SIZE,
  )) {
    const endpoint = cg.getOnchainEndpoint(
      `/networks/solana/tokens/multi/${batch.join(",")}`,
    );
    endpoint.search = new URLSearchParams({ include: "top_pools" }).toString();

    const resp = await pFetch(cg.spec, "coingecko.svc.token_market_batch", endpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });
    if (!resp.ok) {
      throw new Error(`CoinGecko token pool resolution failed: ${resp.status}`);
    }

    const payload = await validateApiResult(cg_MultiTokenTopPoolsSchema, resp);
    if (!payload) {
      throw new Error("CoinGecko token pool resolution validation failed");
    }

    for (const token of payload.data) {
      const topPool = token.relationships.top_pools.data[0];
      if (topPool) {
        poolAddressByToken.set(
          token.attributes.address,
          trimIdPrefix(topPool.id),
        );
      }
    }
  }

  const poolAddresses = Array.from(new Set(poolAddressByToken.values()));
  const poolPayloads: CG_TopPoolData[] = [];

  for (const batch of chunkStrings(poolAddresses, CG_DEMO_BATCH_SIZE)) {
    const endpoint = cg.getOnchainEndpoint(
      `/networks/solana/pools/multi/${batch.join(",")}`,
    );
    endpoint.search = new URLSearchParams({ include: INCLUDE }).toString();

    const resp = await pFetch(cg.spec, "coingecko.svc.pool_market_batch", endpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });
    if (!resp.ok) {
      throw new Error(`CoinGecko pool enrichment failed: ${resp.status}`);
    }

    const payload = await validateApiResult(cg_TopPoolDataSchema, resp);
    if (!payload) {
      throw new Error("CoinGecko pool enrichment validation failed");
    }
    poolPayloads.push(payload);
  }

  const mappedPools = new Map<string, MarketPoolItem>();
  for (const payload of poolPayloads) {
    for (const pool of mapCgPools(payload)) {
      mappedPools.set(pool.poolAddress, pool);
    }
  }

  const result: MarketPoolItem[] = [];
  for (const token of gainers) {
    const poolAddress = poolAddressByToken.get(token.address);
    const pool = poolAddress ? mappedPools.get(poolAddress) : undefined;
    if (!pool) {
      continue;
    }
    result.push({
      ...pool,
      priceChange24h: token.price_change_24h_percent,
    });
  }
  return result;
}

export async function getTopGainerMarketPools(): Promise<MarketPoolItem[]> {
  return await getStoredMarketPools(
    "gainers",
    MARKET_POOL_LIST_TTL_MS.gainers,
    fetchTopGainerMarketPools,
  );
}
