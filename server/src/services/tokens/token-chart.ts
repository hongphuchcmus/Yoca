import {
    DAY_MS,
    TOKEN_CHART_24H_UPDATE_THRESHOLD,
    TOKEN_CHART_DAILY_INTERVAL_MS,
    TOKEN_CHART_HOURLY_INTERVAL_MS,
    TOKEN_CHART_HOURLY_MIN_POINTS,
    TOKEN_CHART_HOURLY_MIN_SPAN_MS,
    TOKEN_CHART_HOURLY_UPDATE_THRESHOLD,
} from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import {
    tokenMarketChart24h,
    tokenMarketChartDaily,
    tokenMarketChartHourly,
    type TokenMarketChart24hInsert,
    type TokenMarketChartDailyInsert,
    type TokenMarketChartHourlyInsert,
} from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { excluded } from "@sv/util/orm-sql.js";
import * as bds from "@sv/util/util-birdeye.js";
import * as cg from "@sv/util/util-coingecko.js";
import { pFetch } from "@sv/util/rate-limit.js";
import dayjs from "dayjs";
import { and, eq, gte, lte } from "drizzle-orm";
import {
    bds_HistoryPriceSchema,
    cg_TokenMarketChartSchema
} from "../_types/token-raw-responses.js";
import { getCoinGeckoIdsByAddresses } from "./token-list.js";

type TokenChartCacheRow = {
  unixTimestampMs: number;
};

function toUnixSecondsString(timestampMs: number): string {
  return Math.floor(timestampMs / 1000).toString();
}

function getChartBucket(timestampMs: number, intervalMs: number): number {
  return Math.floor(timestampMs / intervalMs);
}

function isRangeCacheIncomplete(
  rows: TokenChartCacheRow[],
  fromMs: number,
  toMs: number,
  intervalMs: number,
): boolean {
  if (rows.length === 0) return true;

  const startBucket = getChartBucket(fromMs, intervalMs);
  const currentOpenBucket = getChartBucket(toMs, intervalMs);
  const endBucket = Math.max(startBucket, currentOpenBucket - 1);
  const expectedBucketCount = endBucket - startBucket + 1;

  const availableBuckets = new Set(
    rows
      .map((row) => getChartBucket(row.unixTimestampMs, intervalMs))
      .filter((bucket) => bucket >= startBucket && bucket <= endBucket),
  );

  const minimumCoverage = Math.max(1, Math.floor(expectedBucketCount * 0.8));
  return availableBuckets.size < minimumCoverage;
}

// https://docs.coingecko.com/v3.0.1/reference/coins-id-market-chart-range
export async function fetch24hTokenMarketChart(
  tokenAddress: string,
  latestUpdateUnixMs: number | null = null,
) {
  if (!tokenAddress) {
    return [];
  }

  const cgIdLookup = await getCoinGeckoIdsByAddresses([tokenAddress]);
  const cgId = cgIdLookup ? cgIdLookup[tokenAddress] : null;

  if (!cgId) {
    return [];
  }

  const cgEndpoint = cg.getEndpoint(`/coins/${cgId}/market_chart/range`);

  const to = new Date().getTime();
  let from = to - DAY_MS;

  if (latestUpdateUnixMs && from < latestUpdateUnixMs) {
    from = latestUpdateUnixMs;
  }

  cgEndpoint.search = new URLSearchParams({
    vs_currency: "usd",
    from: toUnixSecondsString(from),
    to: toUnixSecondsString(to),
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.token_price_chart", cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  if (!resp.ok) {
    return [];
  }

  const res = await validateApiResult(cg_TokenMarketChartSchema, resp);

  if (!res) {
    return [];
  }

  const chartDataPoints = res.prices.map(
    ([timestamp, price], index): TokenMarketChart24hInsert => ({
      address: tokenAddress,
      unixTimestampMs: timestamp,
      price: price,
      marketCap: res.market_caps[index][1],
      totalVolume: res.total_volumes[index][1],
    }),
  );
  if (chartDataPoints.length == 0) {
    return [];
  }

  const chartData = await db
    .insert(tokenMarketChart24h)
    .values(chartDataPoints)
    .onConflictDoUpdate({
      target: [
        tokenMarketChart24h.address,
        tokenMarketChart24h.unixTimestampMs,
      ],
      set: {
        price: excluded(tokenMarketChart24h.price),
        marketCap: excluded(tokenMarketChart24h.marketCap),
        totalVolume: excluded(tokenMarketChart24h.totalVolume),
      },
    })
    .returning();

  return chartData;
}

export async function get24hTokenMarketChart(tokenAddress: string) {
  const to = new Date().getTime();
  const from = to - DAY_MS;

  const chartData = await db
    .select()
    .from(tokenMarketChart24h)
    .where(
      and(
        eq(tokenMarketChart24h.address, tokenAddress),
        gte(tokenMarketChart24h.unixTimestampMs, from),
        lte(tokenMarketChart24h.unixTimestampMs, to),
      ),
    )
    .orderBy(tokenMarketChart24h.unixTimestampMs);

  if (chartData.length == 0) {
    const freshChartData = await fetch24hTokenMarketChart(tokenAddress);
    if (freshChartData.length > 0) {
      dataUsage.record("provider_result");
    }
    return freshChartData;
  }

  dataUsage.record("db_result");

  const latestUpdate = chartData[chartData.length - 1].unixTimestampMs;
  const isStale =
    new Date().getTime() - latestUpdate > TOKEN_CHART_24H_UPDATE_THRESHOLD;

  if (isStale) {
    const newerChartData = await fetch24hTokenMarketChart(
      tokenAddress,
      latestUpdate,
    );

    if (newerChartData.length > 0) {
      dataUsage.record("provider_result");
      return [...chartData, ...newerChartData];
    }
  }

  return chartData;
}

// Fetch chart data from CoinGecko for a specific time range and store in DB
async function fetchAndCacheChartRange(
  tokenAddress: string,
  cgId: string,
  table: typeof tokenMarketChartHourly | typeof tokenMarketChartDaily,
  fromMs: number,
  toMs: number,
  interval: "hourly" | "daily",
): Promise<void> {
  const cgEndpoint = cg.getEndpoint(`/coins/${cgId}/market_chart/range`);
  cgEndpoint.search = new URLSearchParams({
    from: toUnixSecondsString(fromMs),
    to: toUnixSecondsString(toMs),
    interval,
    vs_currency: "usd",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.pool_price_chart", cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  if (!resp.ok) {
    return;
  }

  const res = await validateApiResult(cg_TokenMarketChartSchema, resp);

  if (!res || res.prices.length == 0) {
    return;
  }

  const unixUpdatedAtMs = Date.now();
  const points = res.prices.map(
    (
      [timestamp, price],
      index,
    ): TokenMarketChartHourlyInsert | TokenMarketChartDailyInsert => ({
      address: tokenAddress,
      unixTimestampMs: timestamp,
      price: price,
      marketCap: res.market_caps[index][1],
      totalVolume: res.total_volumes[index][1],
      unixUpdatedAtMs,
    }),
  );

  await db
    .insert(table)
    .values(points)
    .onConflictDoUpdate({
      target: [table.address, table.unixTimestampMs],
      set: {
        price: excluded(table.price),
        marketCap: excluded(table.marketCap),
        totalVolume: excluded(table.totalVolume),
        unixUpdatedAtMs: excluded(table.unixUpdatedAtMs),
      },
    });
}

export async function getHourlyTokenMarketChart(
  tokenAddress: string,
  days: number,
  cgIdByAddress?: Record<string, string> | null,
) {
  if (!tokenAddress) return [];

  let cgId: string | null = null;
  if (cgIdByAddress != null) {
    cgId = cgIdByAddress[tokenAddress] ?? null;
  } else {
    const cgIdLookup = await getCoinGeckoIdsByAddresses([tokenAddress]);
    cgId = cgIdLookup[tokenAddress] ?? null;
  }
  if (!cgId) return [];

  const now = Date.now();
  const requestedFromMs = now - days * DAY_MS;

  // Query existing hourly data in requested range
  const existing = await db
    .select()
    .from(tokenMarketChartHourly)
    .where(
      and(
        eq(tokenMarketChartHourly.address, tokenAddress),
        gte(tokenMarketChartHourly.unixTimestampMs, requestedFromMs),
      ),
    )
    .orderBy(tokenMarketChartHourly.unixTimestampMs);

  const hasGaps = isRangeCacheIncomplete(
    existing,
    requestedFromMs,
    now,
    TOKEN_CHART_HOURLY_INTERVAL_MS,
  );

  // If gaps detected or no data exists, fetch the missing range
  if (hasGaps || existing.length == 0) {
    // Fetch from requested start to now to fill gaps
    await fetchAndCacheChartRange(
      tokenAddress,
      cgId,
      tokenMarketChartHourly,
      requestedFromMs,
      now,
      "hourly",
    );

    // Re-query after fetch to return combined data
    return db
      .select()
      .from(tokenMarketChartHourly)
      .where(
        and(
          eq(tokenMarketChartHourly.address, tokenAddress),
          gte(tokenMarketChartHourly.unixTimestampMs, requestedFromMs),
        ),
      )
      .orderBy(tokenMarketChartHourly.unixTimestampMs);
  }

  return existing;
}

export async function getDailyTokenMarketChart(
  tokenAddress: string,
  days: number,
  cgIdByAddress?: Record<string, string> | null,
) {
  if (!tokenAddress) return [];

  let cgId: string | null = null;
  if (cgIdByAddress != null) {
    cgId = cgIdByAddress[tokenAddress] ?? null;
  } else {
    const cgIdLookup = await getCoinGeckoIdsByAddresses([tokenAddress]);
    cgId = cgIdLookup[tokenAddress] ?? null;
  }
  if (!cgId) return [];

  const now = Date.now();
  const requestedFromMs = now - days * DAY_MS;

  // Query existing daily data in requested range
  const existing = await db
    .select()
    .from(tokenMarketChartDaily)
    .where(
      and(
        eq(tokenMarketChartDaily.address, tokenAddress),
        gte(tokenMarketChartDaily.unixTimestampMs, requestedFromMs),
      ),
    )
    .orderBy(tokenMarketChartDaily.unixTimestampMs);

  const hasGaps = isRangeCacheIncomplete(
    existing,
    requestedFromMs,
    now,
    TOKEN_CHART_DAILY_INTERVAL_MS,
  );

  // If gaps detected or no data exists, fetch the missing range
  if (hasGaps || existing.length == 0) {
    // Fetch from requested start to now to fill gaps
    await fetchAndCacheChartRange(
      tokenAddress,
      cgId,
      tokenMarketChartDaily,
      requestedFromMs,
      now,
      "daily",
    );

    // Re-query after fetch to return combined data
    return db
      .select()
      .from(tokenMarketChartDaily)
      .where(
        and(
          eq(tokenMarketChartDaily.address, tokenAddress),
          gte(tokenMarketChartDaily.unixTimestampMs, requestedFromMs),
        ),
      )
      .orderBy(tokenMarketChartDaily.unixTimestampMs);
  }

  return existing;
}

async function fetchHistoricalRange(
  tokenAddress: string,
  fromSec: number,
  toSec: number,
): Promise<void> {
  const url = bds.getEndpoint("/defi/history_price");
  url.searchParams.set("address", tokenAddress);

  url.search = new URLSearchParams({
    address: tokenAddress,
    address_type: "token",
    type: "15m",
    time_from: fromSec.toString(),
    time_to: toSec.toString(),
    ui_amount_mode: "raw",
  }).toString();

  const resp = await pFetch(bds.spec, "birdeye.svc.token_history_price", url, {
    method: "GET",
    headers: bds.getRequiredHeaders(),
  });

  const res = await validateApiResult(bds_HistoryPriceSchema, resp);

  if (!res) return;

  const items = res.data.items;
  if (items.length == 0) return;

  const nowMs = Date.now();
  const points: TokenMarketChartHourlyInsert[] = items.map((item) => ({
    address: tokenAddress,
    unixTimestampMs: item.unixTime * 1000,
    price: item.value,
    marketCap: 0,
    totalVolume: 0,
    unixUpdatedAtMs: nowMs,
  }));

  await db
    .insert(tokenMarketChartHourly)
    .values(points)
    .onConflictDoUpdate({
      target: [
        tokenMarketChartHourly.address,
        tokenMarketChartHourly.unixTimestampMs,
      ],
      set: {
        price: excluded(tokenMarketChartHourly.price),
        marketCap: excluded(tokenMarketChartHourly.marketCap),
        totalVolume: excluded(tokenMarketChartHourly.totalVolume),
        unixUpdatedAtMs: excluded(tokenMarketChartHourly.unixUpdatedAtMs),
      },
    });
}

export async function getTokenPriceChartForDay(
  tokenAddress: string,
  dayMs: number,
): Promise<{ timestampMs: number; price: number }[] | null> {
  if (!tokenAddress) return null;

  // Use dayjs to handle day boundary calculation with timezone awareness
  const dayStart = dayjs(dayMs).startOf("day");
  const fromMs = dayStart.valueOf();
  const toMs = dayStart.add(1, "day").valueOf();

  // Query existing data for the day
  const existing = await db
    .select({
      unixTimestampMs: tokenMarketChartHourly.unixTimestampMs,
      price: tokenMarketChartHourly.price,
      unixUpdatedAtMs: tokenMarketChartHourly.unixUpdatedAtMs,
    })
    .from(tokenMarketChartHourly)
    .where(
      and(
        eq(tokenMarketChartHourly.address, tokenAddress),
        gte(tokenMarketChartHourly.unixTimestampMs, fromMs),
        lte(tokenMarketChartHourly.unixTimestampMs, toMs),
      ),
    )
    .orderBy(tokenMarketChartHourly.unixTimestampMs);

  // Check if we have complete hourly data for the day using functional check
  const isComplete =
    existing.length >= TOKEN_CHART_HOURLY_MIN_POINTS &&
    (existing.at(-1)?.unixTimestampMs ?? 0) -
      (existing.at(0)?.unixTimestampMs ?? 0) >=
      TOKEN_CHART_HOURLY_MIN_SPAN_MS;

  if (isComplete) {
    return existing.map((r) => ({
      timestampMs: r.unixTimestampMs,
      price: Number(r.price),
    }));
  }

  // Check if existing data is stale
  const latestUpdatedAt = existing.at(-1)?.unixUpdatedAtMs ?? 0;
  const isStale =
    Date.now() - latestUpdatedAt > TOKEN_CHART_HOURLY_UPDATE_THRESHOLD;

  // If incomplete or stale, fetch from Birdeye for this specific day
  if (existing.length == 0 || isStale) {
    await fetchHistoricalRange(
      tokenAddress,
      Math.floor(fromMs / 1000),
      Math.floor(toMs / 1000),
    );

    // Re-query after fetch
    const refreshed = await db
      .select({
        unixTimestampMs: tokenMarketChartHourly.unixTimestampMs,
        price: tokenMarketChartHourly.price,
        unixUpdatedAtMs: tokenMarketChartHourly.unixUpdatedAtMs,
      })
      .from(tokenMarketChartHourly)
      .where(
        and(
          eq(tokenMarketChartHourly.address, tokenAddress),
          gte(tokenMarketChartHourly.unixTimestampMs, fromMs),
          lte(tokenMarketChartHourly.unixTimestampMs, toMs),
        ),
      )
      .orderBy(tokenMarketChartHourly.unixTimestampMs);

    // Verify completeness after fetch
    if (
      refreshed.length < TOKEN_CHART_HOURLY_MIN_POINTS ||
      (refreshed.at(-1)?.unixTimestampMs ?? 0) -
        (refreshed.at(0)?.unixTimestampMs ?? 0) <
        TOKEN_CHART_HOURLY_MIN_SPAN_MS
    ) {
      return null;
    }

    return refreshed.map((r) => ({
      timestampMs: r.unixTimestampMs,
      price: Number(r.price),
    }));
  }

  return existing.map((r) => ({
    timestampMs: r.unixTimestampMs,
    price: Number(r.price),
  }));
}
