import type {
    BalanceDataPoint,
    WalletTimePeriod,
    WalletCumulativePnLResult,
    PnLDataPoint,
} from "./dtos/walletDataObjects.js";
import { getRangeStartMs } from "@sv/services/wallet/walletData.core.js";
import { roundUsd } from "./walletNormalization.utils.js";
import { getWalletTransfers } from "./walletTransfersSwaps.service.js";
import { getWalletOverview } from "./walletOverview.service.js";
import { db } from "@sv/db/index.js";
import { walletBalanceHistory } from "@sv/db/schema.js";
import { and, between, eq } from "drizzle-orm";
import * as mobula from "@sv/util/util-mobula.js";
import { mbl_WalletHistorySchema } from "../_types/wallet-raw-responses.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import dayjs from "dayjs";
import {
    DAY_MS,
    WALLET_BALANCE_HISTORY_FETCH_TIMEOUT_MS,
    WALLET_BALANCE_HISTORY_STORED_TTL_MS,
    MOBULA_WALLET_ACTIVITY_BACKWARD_OVERLAP_MS,
} from "@sv/config/constants.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { singleFlight } from "@sv/services/util/single-flight.js";
import { excluded } from "@sv/util/orm-sql.js";

/**
 * Get UTC start-of-day timestamp (ms) for a given timestamp.
 */
function getUtcStartOfDayMs(tsMs: number): number {
  const d = new Date(tsMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Build daily balance anchors for PnL computation.
 * Returns array of {dayStartMs, balanceAtStart, balanceAtEnd} for each day.
 * Uses linear interpolation if no data point exists at exact day boundary.
 * For the current/last day, uses the final balance point as end-of-day.
 */
function buildDailyBalanceAnchors(balanceHistory: BalanceDataPoint[]): Array<{
  dayStartMs: number;
  balanceAtStart: number;
  balanceAtEnd: number;
}> {
  if (balanceHistory.length == 0) {
    return [];
  }

  const anchors: Array<{
    dayStartMs: number;
    balanceAtStart: number;
    balanceAtEnd: number;
  }> = [];
  const sortedHistory = [...balanceHistory].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  for (let index = 0; index < sortedHistory.length - 1; index++) {
    const point = sortedHistory[index];
    const nextPoint = sortedHistory[index + 1];

    anchors.push({
      dayStartMs: point.timestamp,
      balanceAtStart: point.value,
      balanceAtEnd: nextPoint.value,
    });
  }

  return anchors;
}

/**
 * Compute daily net inflow (inflow - outflow) per UTC day.
 * Returns map of dayStartMs -> netInflowUsd.
 *
 * Direction is inferred from transfer.from vs address:
 * - transfer.from == address: outflow (negative)
 * - transfer.to == address: inflow (positive)
 */
async function computeDailyNetInflow(
  address: string,
  fromMs: number,
  toMs: number,
): Promise<Map<number, number>> {
  const dailyNetInflow = new Map<number, number>();

  try {
    const transfersResponse = await getWalletTransfers(address, fromMs, toMs);
    const transfers = transfersResponse?.transfers ?? [];

    // console.log("[computeDailyNetInflow] transfers: ")
    // console.info(transfers)

    for (const transfer of transfers) {
      if (!transfer.amountUsd) {
        continue; // Skip transfers without USD value
      }

      const tsMs = Date.parse(transfer.timestamp);
      if (!Number.isFinite(tsMs)) {
        continue;
      }

      // Only include transfers within the requested range
      if (tsMs < fromMs || tsMs > toMs) {
        continue;
      }

      const dayStartMs = getUtcStartOfDayMs(tsMs);

      // Determine direction: inflow (+) or outflow (-)
      const isInflow = transfer.to == address;
      const isOutflow = transfer.from == address;

      let flowAmount = 0;
      if (isInflow) {
        flowAmount = transfer.amountUsd; // positive
      } else if (isOutflow) {
        flowAmount = -transfer.amountUsd; // negative
      }

      // Accumulate into daily total
      const current = dailyNetInflow.get(dayStartMs) ?? 0;
      dailyNetInflow.set(dayStartMs, current + flowAmount);
    }
  } catch (error) {
    console.error("[computeDailyNetInflow] failed to fetch/compute transfers", {
      address,
      error,
    });
  }

  return dailyNetInflow;
}

type WalletBalanceHistory =
  | {
      usdValue: number;
      timestampMs: number;
    }[]
  | null;

export async function getWalletBalanceHistory(
  address: string,
  timePeriod: WalletTimePeriod = "30D",
  fromMs?: number,
  toMs?: number,
): Promise<WalletBalanceHistory> {
  // TODO: enforce this
  const toBalanceChartPeriod: Record<string, "week" | "month"> = {
    "7D": "week",
    "30D": "month",
  };
  const balanceChartPeriod = toBalanceChartPeriod[timePeriod] ?? "month";

  const end = toMs ?? dayjs.utc().valueOf() - MOBULA_WALLET_ACTIVITY_BACKWARD_OVERLAP_MS;
  const start = fromMs ?? dayjs.utc(end).subtract(1, balanceChartPeriod).valueOf();
  const storedThresholdMs = end - WALLET_BALANCE_HISTORY_STORED_TTL_MS;
  const expectedDailyPoints = balanceChartPeriod == "week" ? 7 : 30;
  const minCoveragePoints = Math.max(1, expectedDailyPoints - 2);

  const res = await db
    .select()
    .from(walletBalanceHistory)
    .where(
      and(
        eq(walletBalanceHistory.address, address),
        between(walletBalanceHistory.timestampMs, start, end),
      ),
    )
    .orderBy(walletBalanceHistory.timestampMs);

  if (res.length == 0) {
    dataUsage.record("provider_result");
    return walletBalanceHistoryFlight
      .key(`wallet_balance_history:${address}:${start}:${end}`)
      .run(address, start, end);
  }

  const storedPoints = normalizeByDay(
    res.map((point) => ({
      timestampMs: point.timestampMs,
      usdValue: point.usdValue,
    })),
  );
  const firstStoredPoint = storedPoints[0];
  const lastStoredPoint = storedPoints[storedPoints.length - 1];
  const newestStoredUpdateMs = res.reduce((latest, point) => {
    const updatedAtMs = point.updatedAtMs ?? 0;
    return updatedAtMs > latest ? updatedAtMs : latest;
  }, 0);
  const hasRangeCoverage =
    firstStoredPoint != null &&
    lastStoredPoint != null &&
    firstStoredPoint.timestampMs <= start + DAY_MS &&
    storedPoints.length >= minCoveragePoints;
  const hasFreshTail =
    lastStoredPoint != null && lastStoredPoint.timestampMs >= end - DAY_MS;
  const storedUpdatedRecently = newestStoredUpdateMs >= storedThresholdMs;

  if (hasRangeCoverage && hasFreshTail && storedUpdatedRecently) {
    dataUsage.record("db_result");
    return storedPoints;
  }

  if (hasRangeCoverage && lastStoredPoint != null) {
    const partialStart = Math.max(start, lastStoredPoint.timestampMs - DAY_MS);
    dataUsage.record("provider_result");
    const fetched = await walletBalanceHistoryFlight
      .key(`wallet_balance_history:${address}:${partialStart}:${end}`)
      .run(address, partialStart, end);
    if (!fetched) {
      dataUsage.record("db_result", "stale_fallback");
      return storedPoints;
    }

    dataUsage.record("db_result");
    return normalizeByDay([...storedPoints, ...fetched]);
  }

  dataUsage.record("provider_result");
  return walletBalanceHistoryFlight
    .key(`wallet_balance_history:${address}:${start}:${end}`)
    .run(address, start, end);
}

async function fetchWalletBalanceHistory(
  address: string,
  startMs: number,
  endMs: number,
): Promise<WalletBalanceHistory> {
  const endpoint = mobula.getEndpoint("/1/wallet/history");
  endpoint.search = new URLSearchParams({
    wallet: address,
    blockchains: "solana:solana",
    from: String(startMs),
    to: String(endMs),
    period: "1d",
    filterSpam: "true",
    unlistedAssets: "false",
  }).toString();

  const resp = await pFetch(mobula.spec, "mobula.svc.wallet_balance_chart", endpoint, {
    method: "GET",
    headers: mobula.getRequiredHeaders(),
    rlTimeoutMs: WALLET_BALANCE_HISTORY_FETCH_TIMEOUT_MS,
  });

  const res = await validateApiResult(mbl_WalletHistorySchema, resp);
  if (!res) {
    return null;
  }

  const fetchedAtMs = dayjs.utc().valueOf();
  // Mobula period defines the baseline grid only. Balance-changing transfers
  // are returned as extra points, so high-activity wallets can still produce
  // very large responses. Keep the latest point per UTC day before storing.
  const normalizedPoints = normalizeByDay(
    res.data.balance_history.map((point) => ({
      timestampMs: point[0],
      usdValue: point[1],
    })),
  );
  const insertValues = normalizedPoints.map((point) => ({
    address: address,
    timestampMs: point.timestampMs,
    usdValue: point.usdValue,
    updatedAtMs: fetchedAtMs,
  }));

  if (insertValues.length == 0) {
    return [];
  }

  await db.insert(walletBalanceHistory).values(insertValues).onConflictDoUpdate({
    target: [walletBalanceHistory.address, walletBalanceHistory.timestampMs],
    set: {
      usdValue: excluded(walletBalanceHistory.usdValue),
      updatedAtMs: excluded(walletBalanceHistory.updatedAtMs),
    },
  });

  return normalizedPoints;
}

const walletBalanceHistoryFlight = singleFlight(fetchWalletBalanceHistory);

// Group data points by UTC day, keeping only the latest point per day.
function normalizeByDay(
  dataPoints: NonNullable<WalletBalanceHistory>,
): NonNullable<WalletBalanceHistory> {
  const normalized = dataPoints
    .reduce((acc, point) => {
      const dayMs = dayjs.utc(point.timestampMs).startOf("day").valueOf();
      if (!acc.has(dayMs) || acc.get(dayMs)!.timestampMs < point.timestampMs) {
        acc.set(dayMs, point);
      }
      return acc;
    }, new Map<number, NonNullable<WalletBalanceHistory>[number]>())
    .values();

  return [...normalized];
}

export async function getCumulativePnL(
  address: string,
  timePeriod: WalletTimePeriod = "30D",
  fromMs?: number,
  toMs?: number,
): Promise<WalletCumulativePnLResult> {
  const nowMs = Date.now();
  const effectiveFromMs = fromMs ?? getRangeStartMs(toMs ?? nowMs, timePeriod);
  const effectiveToMs = toMs ?? nowMs;

  try {
    // Get balance history and build daily anchors
    const balanceHistory = await getWalletBalanceHistory(address, timePeriod, effectiveFromMs, effectiveToMs);

    // get Current balance
    const currentBalance = (await getWalletOverview(address)).holdings
      .totalAssetValueUsd;
    const historyPoint: BalanceDataPoint = {
      timestamp: Date.now(),
      value: currentBalance,
      date: "", // this value is not used to calculate so can be left as ''
    };
    const fullBalanceHistory = [
      ...(balanceHistory?.map((point) => ({
        timestamp: point.timestampMs,
        value: point.usdValue,
        date: dayjs.utc(point.timestampMs).toISOString(),
      })) || []),
      historyPoint,
    ];

    const dailyAnchors = buildDailyBalanceAnchors(fullBalanceHistory);
    if (dailyAnchors.length == 0) {
      return emptyPnL();
    }

    // Compute daily net inflow
    const dailyNetInflowMap = await computeDailyNetInflow(
      address,
      effectiveFromMs,
      effectiveToMs,
    );
    // console.log("[getCumulativePnL] dailyNetInflowMap")
    // console.info(dailyNetInflowMap)

    // Apply formula: dailyPnL[i] = (balanceEnd - balanceStart) - netInflow[i]
    const dailyPnLArray: PnLDataPoint[] = [];
    let cumulativePnL = 0;
    const cumulativePnLArray: PnLDataPoint[] = [];

    for (const anchor of dailyAnchors) {
      const dayStartMs = anchor.dayStartMs;
      const balanceDelta = anchor.balanceAtEnd - anchor.balanceAtStart;
      const netInflow = dailyNetInflowMap.get(dayStartMs) ?? 0;

      // Formula: dailyPnL = dayDelta - netInflow
      const dayPnL = roundUsd(balanceDelta - netInflow);
      // const dayPnL = roundUsd(balanceDelta);
      // const dayPnL = roundUsd(netInflow);

      dailyPnLArray.push({
        timestamp: dayStartMs,
        value: dayPnL,
      });

      // Cumulative as prefix sum
      cumulativePnL += dayPnL;
      cumulativePnLArray.push({
        timestamp: dayStartMs,
        value: roundUsd(cumulativePnL),
      });
    }

    // startBalance and endBalance from day-anchor balances
    const startBalance =
      dailyAnchors.length > 0 ? roundUsd(dailyAnchors[0]!.balanceAtStart) : 0;
    const endBalance =
      dailyAnchors.length > 0
        ? roundUsd(dailyAnchors[dailyAnchors.length - 1]!.balanceAtEnd)
        : 0;

    return {
      dailyPnL: dailyPnLArray,
      cumulativePnL: cumulativePnLArray,
      startBalance,
      endBalance,
    };
  } catch (error) {
    console.error("[WalletCumulativePnL] failed to compute series", {
      address,
      timePeriod,
      // aggregation,
      error,
    });
    return emptyPnL();
  }
}

export function resolveWalletTimeRangeSec(
  timePeriod: WalletTimePeriod,
  nowSec = Math.floor(Date.now() / 1000),
): { fromSec: number; toSec: number } {
  const nowMs = nowSec * 1000;
  const fromMs = getRangeStartMs(nowMs, timePeriod);
  return {
    fromSec: Math.max(0, Math.floor(fromMs / 1000)),
    toSec: nowSec,
  };
}

function emptyPnL(): WalletCumulativePnLResult {
  return {
    dailyPnL: [],
    cumulativePnL: [],
    startBalance: 0,
    endBalance: 0,
  };
}
