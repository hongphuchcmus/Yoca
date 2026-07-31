import {
    getEndpoint as getBirdeyeEndpoint,
    getRequiredHeaders as getBirdeyeHeaders,
    spec as birdeyeSpec,
} from "@sv/util/util-birdeye.js";
import { db } from "@sv/db/index.js";
import {
    tokenMarketChart24h,
    tokenMarketChartHourly,
    tokenMarketChartDaily,
    type TokenMarketChartHourlyInsert,
    type TokenMarketChartDailyInsert,
} from "@sv/db/schema.js";
import { bds_HistoryPriceSchema } from "@sv/services/_types/token-raw-responses.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { excluded } from "@sv/util/orm-sql.js";
import { and, eq, gte, lte } from "drizzle-orm";
import {
    get24hTokenMarketChart,
    getHourlyTokenMarketChart,
    getDailyTokenMarketChart,
} from "@sv/services/tokens/token-chart.js";
import { DAY_MS } from "@sv/config/constants.js";

export type BirdeyeInterval = "15m" | "1H" | "4H" | "1D";
type ChartPoint = { unixTimestampMs: number; price: number };

const CHUNK_DAYS: Record<BirdeyeInterval, number> = {
  "15m": 3,
  "1H": 14,
  "4H": 30,
  "1D": 90,
};

async function fetchAndStoreBirdeyeRange(
  address: string,
  fromMs: number,
  toMs: number,
  interval: BirdeyeInterval,
): Promise<void> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);

  const url = getBirdeyeEndpoint("/defi/history_price");
  url.searchParams.set("address", address);
  url.searchParams.set("address_type", "token");
  url.searchParams.set("type", interval);
  url.searchParams.set("time_from", String(fromSec));
  url.searchParams.set("time_to", String(toSec));
  url.searchParams.set("ui_amount_mode", "raw");

  const resp = await pFetch(birdeyeSpec, "birdeye.svc.token_price_chart", url, {
    method: "GET",
    headers: getBirdeyeHeaders(),
  });

  const res = await validateApiResult(bds_HistoryPriceSchema, resp);
  if (!res) return;

  const items = res.data.items;
  if (items.length === 0) return;

  const nowMs = Date.now();
  const is24h = interval === "15m";
  const isDaily = interval === "1D";

  if (is24h) {
    type Insert24h = typeof tokenMarketChart24h.$inferInsert;
    const points: Insert24h[] = items.map((item) => ({
      address,
      unixTimestampMs: item.unixTime * 1000,
      price: item.value,
      marketCap: 0,
      totalVolume: 0,
    }));
    await db
      .insert(tokenMarketChart24h)
      .values(points)
      .onConflictDoUpdate({
        target: [tokenMarketChart24h.address, tokenMarketChart24h.unixTimestampMs],
        set: {
          price: excluded(tokenMarketChart24h.price),
          marketCap: excluded(tokenMarketChart24h.marketCap),
          totalVolume: excluded(tokenMarketChart24h.totalVolume),
        },
      });
    return;
  }

  if (isDaily) {
    const points: TokenMarketChartDailyInsert[] = items.map((item) => ({
      address,
      unixTimestampMs: item.unixTime * 1000,
      price: item.value,
      marketCap: 0,
      totalVolume: 0,
      unixUpdatedAtMs: nowMs,
    }));
    await db
      .insert(tokenMarketChartDaily)
      .values(points)
      .onConflictDoUpdate({
        target: [tokenMarketChartDaily.address, tokenMarketChartDaily.unixTimestampMs],
        set: {
          price: excluded(tokenMarketChartDaily.price),
          marketCap: excluded(tokenMarketChartDaily.marketCap),
          totalVolume: excluded(tokenMarketChartDaily.totalVolume),
          unixUpdatedAtMs: excluded(tokenMarketChartDaily.unixUpdatedAtMs),
        },
      });
    return;
  }

  const points: TokenMarketChartHourlyInsert[] = items.map((item) => ({
    address,
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
      target: [tokenMarketChartHourly.address, tokenMarketChartHourly.unixTimestampMs],
      set: {
        price: excluded(tokenMarketChartHourly.price),
        marketCap: excluded(tokenMarketChartHourly.marketCap),
        totalVolume: excluded(tokenMarketChartHourly.totalVolume),
        unixUpdatedAtMs: excluded(tokenMarketChartHourly.unixUpdatedAtMs),
      },
    });
}

async function fetchBirdeyePriceHistory(
  address: string,
  fromMs: number,
  toMs: number,
  interval: BirdeyeInterval,
): Promise<void> {
  const chunkDays = CHUNK_DAYS[interval];
  const chunkMs = chunkDays * DAY_MS;

  let cursor = fromMs;
  const promises: Promise<void>[] = [];
  while (cursor < toMs) {
    const chunkEnd = Math.min(cursor + chunkMs, toMs);
    promises.push(fetchAndStoreBirdeyeRange(address, cursor, chunkEnd, interval));
    cursor = chunkEnd;
  }
  await Promise.all(promises);
}

async function queryDbCache(
  address: string,
  fromMs: number,
  toMs: number,
  interval: BirdeyeInterval,
): Promise<ChartPoint[] | null> {
  if (interval === "15m") {
    const rows = await db
      .select({ unixTimestampMs: tokenMarketChart24h.unixTimestampMs, price: tokenMarketChart24h.price })
      .from(tokenMarketChart24h)
      .where(
        and(
          eq(tokenMarketChart24h.address, address),
          gte(tokenMarketChart24h.unixTimestampMs, fromMs),
          lte(tokenMarketChart24h.unixTimestampMs, toMs),
        ),
      )
      .orderBy(tokenMarketChart24h.unixTimestampMs);
    if (rows.length === 0) return null;
    return rows.map((r) => ({ unixTimestampMs: r.unixTimestampMs, price: Number(r.price) }));
  }

  if (interval === "1D") {
    const rows = await db
      .select({ unixTimestampMs: tokenMarketChartDaily.unixTimestampMs, price: tokenMarketChartDaily.price })
      .from(tokenMarketChartDaily)
      .where(
        and(
          eq(tokenMarketChartDaily.address, address),
          gte(tokenMarketChartDaily.unixTimestampMs, fromMs),
          lte(tokenMarketChartDaily.unixTimestampMs, toMs),
        ),
      )
      .orderBy(tokenMarketChartDaily.unixTimestampMs);
    if (rows.length === 0) return null;
    return rows.map((r) => ({ unixTimestampMs: r.unixTimestampMs, price: Number(r.price) }));
  }

  const rows = await db
    .select({ unixTimestampMs: tokenMarketChartHourly.unixTimestampMs, price: tokenMarketChartHourly.price })
    .from(tokenMarketChartHourly)
    .where(
      and(
        eq(tokenMarketChartHourly.address, address),
        gte(tokenMarketChartHourly.unixTimestampMs, fromMs),
        lte(tokenMarketChartHourly.unixTimestampMs, toMs),
      ),
    )
    .orderBy(tokenMarketChartHourly.unixTimestampMs);
  if (rows.length === 0) return null;
  return rows.map((r) => ({ unixTimestampMs: r.unixTimestampMs, price: Number(r.price) }));
}

export async function getBirdeyeChartData(
  address: string,
  interval: BirdeyeInterval,
  days?: number,
): Promise<ChartPoint[]> {
  if (!address) return [];

  const d = days ?? CHUNK_DAYS[interval];
  const toMs = Date.now();
  const fromMs = toMs - d * DAY_MS;

  const cached = await queryDbCache(address, fromMs, toMs, interval);
  if (cached !== null && cached.length > 1) return cached;

  await fetchBirdeyePriceHistory(address, fromMs, toMs, interval);

  const fromDb = await queryDbCache(address, fromMs, toMs, interval);
  if (fromDb !== null && fromDb.length > 1) return fromDb;

  if (interval === "15m") {
    try {
      const cgData = await get24hTokenMarketChart(address);
      if (Array.isArray(cgData) && cgData.length > 0) {
        return cgData.map((r: Record<string, unknown>) => ({
          unixTimestampMs: Number(r.unixTimestampMs),
          price: Number(r.price),
        }));
      }
    } catch {
      // CoinGecko 24h fallback failed
    }
  } else if (interval === "1H" || interval === "4H") {
    try {
      const cgData = await getHourlyTokenMarketChart(address, d);
      if (Array.isArray(cgData) && cgData.length > 0) {
        return cgData.map((r: Record<string, unknown>) => ({
          unixTimestampMs: Number(r.unixTimestampMs),
          price: Number(r.price),
        }));
      }
    } catch {
      // CoinGecko hourly fallback failed
    }
  } else {
    try {
      const cgData = await getDailyTokenMarketChart(address, d);
      if (Array.isArray(cgData) && cgData.length > 0) {
        return cgData.map((r: Record<string, unknown>) => ({
          unixTimestampMs: Number(r.unixTimestampMs),
          price: Number(r.price),
        }));
      }
    } catch {
      // CoinGecko daily fallback failed
    }
  }

  return [];
}
