import {
    RECENT_TRADES_TTL_MS,
    TRADER_GAINEERS_LOSERS_TTL_MS as TRADER_GAINERS_LOSERS_TTL_MS,
} from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import {
    recentTrades,
    topLosers,
    topTraders,
    type RecentTradeInsert,
} from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { bds_TopTradersSchema } from "@sv/services/_types/trade-raw-responses.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as bds from "@sv/util/util-birdeye.js";
import { and, asc, desc, gte } from "drizzle-orm";
import { bds_RecentTradesSchema } from "./_types/token-raw-responses.js";

type TimeWindow = "6h" | "12h" | "24h";
type SortBy = "volume" | "time";

interface GetRecentTradesOptions {
  timeWindow?: TimeWindow;
  usdThreshold?: number;
  sortBy?: SortBy;
}

async function fetchRecentTrades() {
  const bdsEndpoint = bds.getEndpoint("/defi/v3/txs/recent");

  bdsEndpoint.search = new URLSearchParams({
    limit: "50",
    tx_type: "swap",
  }).toString();

  const resp = await pFetch(bds.spec, "birdeye.svc.token_trades", bdsEndpoint, {
    method: "GET",
    headers: bds.getRequiredHeaders(),
  });

  const res = await validateApiResult(bds_RecentTradesSchema, resp);

  if (!res) {
    return null;
  }

  const trades = res.data.items.map(
    (raw): RecentTradeInsert => ({
      transactionHash: raw.tx_hash,
      instructionIndex: raw.ins_index,
      innerInstructionIndex: raw.inner_ins_index,

      baseAddress: raw.base.address,
      basePrice: raw.base.price,
      baseAmount: Number(raw.base.amount),

      quoteAddress: raw.quote.address,
      quotePrice: raw.quote.price,
      quoteAmount: Number(raw.quote.amount),

      blockUnixTime: raw.block_unix_time,
      volumeUsd: raw.volume_usd,

      owner: raw.owner,
      source: raw.source,
      poolAddress: raw.pool_id,

      tradeAction: raw.base.type_swap == "from" ? "sell" : "buy",
    }),
  );

  await db.delete(recentTrades);
  return await db.insert(recentTrades).values(trades).returning();
}

export async function getRecentTrades(options: GetRecentTradesOptions = {}) {
  const { timeWindow = "24h", usdThreshold = 1, sortBy = "volume" } = options;

  const existing = await db
    .select()
    .from(recentTrades)
    .orderBy(desc(recentTrades.blockUnixTime))
    .limit(50);

  let isStale = false;

  if (existing.length == 0) {
    isStale = true;
  } else {
    const latestUpdate = existing.reduce((latest, cur) =>
      cur.updatedAt > latest.updatedAt ? cur : latest,
    );

    const thresholdDate = new Date(Date.now() - RECENT_TRADES_TTL_MS);
    isStale = latestUpdate.updatedAt < thresholdDate;
  }

  if (isStale) {
    await fetchRecentTrades();
  }

  const timeWindowMs = getTimeWindowMs(timeWindow);
  const cutoffTime = new Date(Date.now() - timeWindowMs);
  const cutoffUnixTime = Math.floor(cutoffTime.getTime() / 1000);

  // Determine sort order based on sortBy parameter
  const orderBy =
    sortBy == "volume"
      ? desc(recentTrades.volumeUsd)
      : desc(recentTrades.blockUnixTime);

  const trades = await db
    .select()
    .from(recentTrades)
    .where(
      and(
        gte(recentTrades.blockUnixTime, cutoffUnixTime),
        gte(recentTrades.volumeUsd, usdThreshold),
      ),
    )
    .orderBy(orderBy)
    .limit(50);

  return trades;
}

function getTimeWindowMs(timeWindow: TimeWindow): number {
  const timeWindowMap: Record<TimeWindow, number> = {
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
  };
  return timeWindowMap[timeWindow];
}

async function fetchTraderGainersLosers(
  sortType: "asc" | "desc",
  type: "today" | "1W" | "30d" | "90d" = "1W",
) {
  const bdsEndpoint = bds.getEndpoint("/trader/gainers-losers");

  bdsEndpoint.search = new URLSearchParams({
    type,
    sort_by: "PnL",
    sort_type: sortType,
  }).toString();

  const resp = await pFetch(bds.spec, "birdeye.svc.pool_trades", bdsEndpoint, {
    method: "GET",
    headers: bds.getRequiredHeaders(),
  });
  const res = await validateApiResult(bds_TopTradersSchema, resp);

  if (!res) {
    return null;
  }

  return res.data.items.map((trader, index) => ({
    address: trader.address,
    rank: index + 1,
    pnl: trader.pnl,
    volume: trader.volume,
    tradeCount: trader.trade_count,
  }));
}

export async function getTopGainers(
  type: "today" | "1W" | "30d" | "90d" = "1W",
) {
  // For non-default types, bypass cache and fetch directly
  if (type !== "1W") {
    return await fetchTraderGainersLosers("desc", type);
  }

  const cached = await db
    .select()
    .from(topTraders)
    .orderBy(asc(topTraders.rank));

  const thresholdTime = new Date(Date.now() - TRADER_GAINERS_LOSERS_TTL_MS);

  if (cached.length > 0 && cached[0].updatedAt > thresholdTime) {
    return cached;
  }

  const items = await fetchTraderGainersLosers("desc", "1W");
  if (items == null) return null;
  if (items.length == 0) return [];

  await db.delete(topTraders);
  await db.insert(topTraders).values(items);

  return await db.select().from(topTraders).orderBy(asc(topTraders.rank));
}

export async function getTopLosers(
  type: "today" | "1W" | "30d" | "90d" = "1W",
) {
  // For non-default types, bypass cache and fetch directly
  if (type !== "1W") {
    return await fetchTraderGainersLosers("asc", type);
  }

  const existing = await db
    .select()
    .from(topLosers)
    .orderBy(asc(topLosers.rank));

  const thresholdTime = new Date(Date.now() - TRADER_GAINERS_LOSERS_TTL_MS);

  if (existing.length > 0 && existing[0].updatedAt > thresholdTime) {
    return existing;
  }

  const items = await fetchTraderGainersLosers("asc", "1W");
  if (!items) {
    return existing.length > 0 ? existing : null;
  }

  await db.delete(topLosers);
  await db.insert(topLosers).values(items);

  return await db.select().from(topLosers).orderBy(asc(topLosers.rank));
}
