import { TOKEN_MARKET_DATA_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { tokenMarketData, type TokenMarketDataInsert } from "@sv/db/schema.js";
import { excludedAuto } from "@sv/util/orm-sql.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import * as cg from "@sv/util/util-coingecko.js";
import {
    cg_CoinMarketsSchema,
    type CG_CoinMarkets,
} from "../_types/token-raw-responses.js";
import { and, gte, inArray } from "drizzle-orm";
import { getCoinGeckoIdsByAddresses } from "./token-list.js";
import { dataUsage } from "@sv/middlewares/request-context.js";

function isCgRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  return Number(status) === 429;
}

export async function fetchCgMarketDataBatched(
  cgIds: string[],
): Promise<CG_CoinMarkets> {
  if (cgIds.length == 0) {
    return [];
  }

  const cgBatchSize = 50;

  const chunks: string[][] = [];
  for (let i = 0; i < cgIds.length; i += cgBatchSize) {
    chunks.push(cgIds.slice(i, i + cgBatchSize));
  }

  const settled = await Promise.allSettled(
    chunks.map(
      async (chunk) => {
        const endpoint = cg.getEndpoint("/coins/markets");
        endpoint.search = new URLSearchParams({
          ids: chunk.join(","),
          vs_currency: "usd",
          order: "market_cap_desc",
          sparkline: "true",
          price_change_percentage: "1h,24h,7d,14d,30d,200d,1y",
        }).toString();

        const resp = await pFetch(cg.spec, "coingecko.svc.token_market_data", endpoint, {
          method: "GET",
          headers: cg.getRequiredHeaders(),
        });

        if (!resp.ok) {
          return [];
        }

        const data = await validateApiResult(cg_CoinMarketsSchema, resp);
        return data || [];
      }
    ),
  );

  const allRes: CG_CoinMarkets = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }

    allRes.push(...result.value);
  }

  return allRes;
}

export function getMarketDataFromRaw(
  address: string,
  raw: CG_CoinMarkets[number],
): TokenMarketDataInsert | null {
  const priceFromSparkline =
    raw.sparkline_in_7d && Array.isArray(raw.sparkline_in_7d.price)
      ? raw.sparkline_in_7d.price[raw.sparkline_in_7d.price.length - 1]
      : null;

  const price = raw.current_price ?? priceFromSparkline ?? null;

  // If we don't have a price, skip this entry to avoid inserting null into
  // the not-null `price_usd` column.
  if (price == null) return null;

  return {
    address,
    fullyDilutedValuation:
      raw.fully_diluted_valuation ??
      (raw.max_supply && price
        ? raw.max_supply * price
        : raw.total_supply && price
          ? raw.total_supply * price
          : 0),
    marketCap: raw.market_cap ?? 0,
    priceUsd: price,
    totalSupply: raw.total_supply,
    updatedAt: new Date(),
    marketCapRank: raw.market_cap_rank,
    high24h: raw.high_24h,
    low24h: raw.low_24h,
    priceChangePercentage1h: raw.price_change_percentage_1h_in_currency,
    priceChange24h: raw.price_change_24h,
    priceChangePercentage24h: raw.price_change_percentage_24h_in_currency,
    priceChangePercentage7d: raw.price_change_percentage_7d_in_currency,
    priceChangePercentage14d: raw.price_change_percentage_14d_in_currency,
    priceChangePercentage30d: raw.price_change_percentage_30d_in_currency,
    priceChangePercentage200d: raw.price_change_percentage_200d_in_currency,
    priceChangePercentage1y: raw.price_change_percentage_1y_in_currency,
    marketCapChange24h: raw.market_cap_change_24h,
    marketCapChangePercentage24h: raw.market_cap_change_percentage_24h,
    circulatingSupply: raw.circulating_supply,
    maxSupply: raw.max_supply,
    ath: raw.ath,
    athChangePercentage: raw.ath_change_percentage,
    athDate: raw.ath_date ? new Date(raw.ath_date) : null,
    atl: raw.atl,
    atlChangePercentage: raw.atl_change_percentage,
    atlDate: raw.atl_date ? new Date(raw.atl_date) : null,
    volume24h: raw.total_volume ?? 0,
    sparkline7d: raw.sparkline_in_7d?.price,
  };
}

async function fetchCgMarketData(cgIdToAddress: Record<string, string>) {
  const cgIds = Object.keys(cgIdToAddress);
  if (cgIds.length == 0) {
    return {};
  }

  const res = await fetchCgMarketDataBatched(cgIds);

  const entries = res
    .map((raw) => {
      const addr = cgIdToAddress[raw.id!];
      const md = getMarketDataFromRaw(addr, raw);
      if (!md) return null;
      return [addr, md] as [string, TokenMarketDataInsert];
    })
    .filter(Boolean) as [string, TokenMarketDataInsert][];

  return Object.fromEntries(entries);
}

async function fetchTokenMarketData(tokenAddresses: string[]) {
  if (tokenAddresses.length == 0) {
    return null;
  }
  const addressToCgId = await getCoinGeckoIdsByAddresses(tokenAddresses);

  const idToAddress = Object.fromEntries(
    Object.entries(addressToCgId).map(([address, id]) => [id, address]),
  );
  const addressToMarketData = await fetchCgMarketData(idToAddress);

  if (!addressToMarketData) {
    return null;
  }

  const marketDataList = Object.values(addressToMarketData);

  // Return empty array if no tokens found on CoinGecko
  if (marketDataList.length == 0) {
    return [];
  }

  return await db
    .insert(tokenMarketData)
    .values(marketDataList)
    .onConflictDoUpdate({
      target: [tokenMarketData.address],
      set: excludedAuto(tokenMarketData, tokenMarketData.address),
    })
    .returning();
}

export async function getTokenMarketData(tokenAddresses: string[]) {
  if (tokenAddresses.length == 0) {
    return {};
  }

  const thresholdDate = new Date(Date.now() - TOKEN_MARKET_DATA_TTL_MS);
  const res = await db
    .select()
    .from(tokenMarketData)
    .where(
      and(
        gte(tokenMarketData.updatedAt, thresholdDate),
        inArray(tokenMarketData.address, tokenAddresses),
      ),
    )
    .limit(tokenAddresses.length);

  const addressToMarketData = Object.fromEntries(
    res.map((item) => [item.address, item]),
  );

  const staleAddresses = tokenAddresses.filter(
    (address) => !addressToMarketData[address],
  );

  if (staleAddresses.length == 0) {
    dataUsage.record("db_result");
    return addressToMarketData;
  }

  let refreshed: Awaited<ReturnType<typeof fetchTokenMarketData>> = null;
  try {
    refreshed = await fetchTokenMarketData(staleAddresses);
  } catch (error) {
    if (isCgRateLimitError(error)) {
      const staleRes = await db
        .select()
        .from(tokenMarketData)
        .where(inArray(tokenMarketData.address, staleAddresses));

      for (const row of staleRes) {
        addressToMarketData[row.address] = row;
      }

      if (Object.keys(addressToMarketData).length > 0) {
        dataUsage.record("db_result", "stale_fallback");
      }
      return addressToMarketData;
    }

    throw error;
  }

  if (!refreshed || refreshed.length == 0) {
    if (Object.keys(addressToMarketData).length > 0) {
      dataUsage.record("db_result");
    }
    return addressToMarketData;
  }

  for (const data of refreshed) {
    addressToMarketData[data.address] = data;
  }

  if (res.length > 0) {
    dataUsage.record("db_result");
  }
  return addressToMarketData;
}
