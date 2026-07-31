import { validateApiResult } from "@sv/middlewares/validation.js";
import type { WalletTimePeriod } from "@sv/services/wallet/dtos/walletDataObjects.js";
import { zrn_WalletBalanceChartSchema } from "../_types/wallet-raw-responses.js";
import { db } from "@sv/db/index.js";
import {
    walletTokenBalanceMonthHistory,
    walletTokenBalanceWeekHistory,
    zerionTokenList,
} from "@sv/db/schema.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import dayjs from "dayjs";
import { and, between, eq, inArray } from "drizzle-orm";
import {
    WALLET_BALANCE_HISTORY_STORED_TTL_MS,
    ZRN_SOL_FUNGIBLE_ID,
} from "@sv/config/constants.js";
import * as zrn from "@sv/util/util-zerion.js";
import { zrn_FungiblesResponseSchema } from "../_types/token-raw-responses.js";
import { SOL_NATIVE_ALIAS_MINT } from "./wallet.constants.js";

type WalletTokenBalanceHistory = Record<
  string,
  {
    usdValue: number;
    timestampMs: number;
  }[]
> | null;

async function getZerionId(
  tokenAddresses: string[],
): Promise<Record<string, string>> {
  const fungibleImplementationAddresses = tokenAddresses.filter(
    (tokenAddress) => tokenAddress !== SOL_NATIVE_ALIAS_MINT,
  );
  const nativeSolId: Record<string, string> = {};
  if (tokenAddresses.includes(SOL_NATIVE_ALIAS_MINT)) {
    nativeSolId[SOL_NATIVE_ALIAS_MINT] = ZRN_SOL_FUNGIBLE_ID;
  }

  if (fungibleImplementationAddresses.length == 0) {
    return nativeSolId;
  }

  const res = await db
    .select()
    .from(zerionTokenList)
    .where(
      inArray(
        zerionTokenList.tokenAddress,
        fungibleImplementationAddresses,
      ),
    );

  if (res.length == 0) {
    return {
      ...(await fetchZerionId(fungibleImplementationAddresses)),
      ...nativeSolId,
    };
  }
  return {
    ...Object.fromEntries(
      res.map((entry) => [entry.tokenAddress, entry.zerionId]),
    ),
    ...nativeSolId,
  };
}

async function fetchZerionId(
  tokenAddresses: string[],
): Promise<Record<string, string>> {
  // TODO: warn about token addresses limit of 25
  const url = zrn.getEndpoint("/fungibles/");
  const req = new URL(url);

  // Filter by chain and addresses (comma-separated)
  req.search = new URLSearchParams({
    "filter[chain_ids]": "solana",
    "filter[fungible_implementations]": tokenAddresses
      .map((addr) => `solana:${addr}`)
      .join(","),
  }).toString();

  const resp = await pFetch(zrn.spec, "zerion.svc.wallet_token_balances", req, {
    method: "GET",
    headers: zrn.getRequiredHeaders(),
  });

  const res = await validateApiResult(zrn_FungiblesResponseSchema, resp);

  if (!res) {
    // TODO: Consider more robust error handling
    return {};
  }

  // Build a map: token address (from implementations) -> Zerion ID (uuid)
  const idMap: Record<string, string> = {};
  for (const item of res.data) {
    const zerionId = item.id;
    // Find the Solana implementation address
    const solImpl = item.attributes.implementations.find(
      (impl) => impl.chain_id == "solana" && impl.address != null,
    );
    if (solImpl?.address) {
      idMap[solImpl.address] = zerionId;
    }
  }

  const insertValues = Object.entries(idMap).map(([addr, id]) => ({
    tokenAddress: addr,
    zerionId: id,
  }));

  await db.insert(zerionTokenList).values(insertValues).onConflictDoNothing();

  return idMap;
}

export async function getWalletTokenBalanceHistory(
  address: string,
  tokenAddresses: string[],
  timePeriod: WalletTimePeriod = "30D",
): Promise<WalletTokenBalanceHistory> {
  // TODO: enforce this
  const toZrnChartPeriod: Partial<Record<WalletTimePeriod, "week" | "month">> = {
    "7D": "week",
    "30D": "month",
  };

  const zrnPeriod = toZrnChartPeriod[timePeriod] ?? "month";

  const nowUtc = dayjs().utc();
  const end = nowUtc.valueOf();
  const start = nowUtc.subtract(1, zrnPeriod).valueOf();
  const thresholdDateMs = end - WALLET_BALANCE_HISTORY_STORED_TTL_MS;

  const balanceTable =
    zrnPeriod == "week"
      ? walletTokenBalanceWeekHistory
      : walletTokenBalanceMonthHistory;

  const res = await db
    .select()
    .from(balanceTable)
    .where(
      and(
        between(balanceTable.timestampMs, start, end),
        eq(balanceTable.walletAddress, address),
        inArray(balanceTable.tokenAddress, tokenAddresses),
      ),
    )
    .orderBy(balanceTable.tokenAddress, balanceTable.timestampMs);

  if (res.length == 0) {
    const fetched = await fetchWalletTokenBalanceHistory(
      address,
      tokenAddresses,
      zrnPeriod,
    );
    if (!fetched) {
      return null;
    }
    const normalizedGrouped = normalizeByDay(fetched);
    return alignEndTimestamps(normalizedGrouped);
  }

  const grouped = {} as NonNullable<WalletTokenBalanceHistory>;
  const latestUpdateByToken = new Map<string, number | null>();

  for (const value of res) {
    if (!grouped[value.tokenAddress]) {
      grouped[value.tokenAddress] = [];
    }

    grouped[value.tokenAddress].push({
      timestampMs: value.timestampMs,
      usdValue: value.usdValue,
    });

    const currentUpdatedAtMs = latestUpdateByToken.get(value.tokenAddress);
    const nextUpdatedAtMs = value.updatedAtMs;

    if (
      currentUpdatedAtMs == null ||
      (nextUpdatedAtMs != null && nextUpdatedAtMs > currentUpdatedAtMs)
    ) {
      latestUpdateByToken.set(value.tokenAddress, nextUpdatedAtMs);
    }
  }

  const missingTokens = tokenAddresses.filter((addr) => {
    const latestUpdatedAtMs = latestUpdateByToken.get(addr);
    return latestUpdatedAtMs == null || latestUpdatedAtMs < thresholdDateMs;
  });

  if (missingTokens.length > 0) {
    const fetched = await fetchWalletTokenBalanceHistory(
      address,
      missingTokens,
      zrnPeriod,
    );
    const merged = { ...grouped, ...fetched };
    const normalizedGrouped = normalizeByDay(merged);
    dataUsage.record("db_result");
    return alignEndTimestamps(normalizedGrouped);
  }

  const normalizedGrouped = normalizeByDay(grouped);
  dataUsage.record("db_result");
  return alignEndTimestamps(normalizedGrouped);
}

export async function fetchWalletTokenBalanceHistory(
  address: string,
  tokenAddresses: string[] = [],
  timePeriod: "week" | "month",
): Promise<WalletTokenBalanceHistory> {
  const idLookup = await getZerionId(tokenAddresses);

  if (Object.keys(idLookup).length == 0) {
    return null;
  }

  const zerionIdMap = tokenAddresses
    .map((addr) => ({ addr, id: idLookup[addr] }))
    .filter((item) => item.id);

  const resArray = await Promise.all(
    zerionIdMap.map(async ({ addr, id }) => {
      // TODO: warn about token addresses limit of 25
      const url = zrn.getEndpoint(`/wallets/${address}/charts/${timePeriod}`);
      const req = new URL(url);
      req.search = new URLSearchParams({
        currency: "usd",
        "filter[positions]": "only_simple",
        "filter[chain_ids]": "solana",
        "filter[fungible_ids]": id,
      }).toString();

      // Use the shared limiter
      const resp = await pFetch(zrn.spec, "zerion.svc.wallet_token_chart", req, {
        method: "GET",
        headers: zrn.getRequiredHeaders(),
        rlRetries: 3,
        rlRetryDelayMs: 500,
        rlTimeoutMs: 30000,
      });

      const res = await validateApiResult(zrn_WalletBalanceChartSchema, resp);
      if (!res) {
        return res;
      }

      return { ...res, addr };
    }),
  );

  const insertValues = resArray
    .filter((entry) => !!entry)
    .flatMap((entry) =>
      entry.data.attributes.points.map((point) => ({
        walletAddress: address,
        tokenAddress: entry.addr,
        // s -> ms
        timestampMs: point[0] * 1000,
        usdValue: point[1],
      })),
    );

  const balanceTable =
    timePeriod == "week"
      ? walletTokenBalanceWeekHistory
      : walletTokenBalanceMonthHistory;

  await db.insert(balanceTable).values(insertValues).onConflictDoNothing();

  const grouped = insertValues.reduce((acc, value) => {
    if (!acc[value.tokenAddress]) {
      acc[value.tokenAddress] = [];
    }
    acc[value.tokenAddress].push({
      timestampMs: value.timestampMs,
      usdValue: value.usdValue,
    });
    return acc;
  }, {} as NonNullable<WalletTokenBalanceHistory>);

  return grouped;
}

// Group data points by UTC day, keeping only the latest point per day.
function normalizeByDay(
  grouped: NonNullable<WalletTokenBalanceHistory>,
): NonNullable<WalletTokenBalanceHistory> {
  const normalized: NonNullable<WalletTokenBalanceHistory> = {};

  for (const [tokenAddress, points] of Object.entries(grouped)) {
    const groupedByDay = new Map<
      number,
      { usdValue: number; timestampMs: number }
    >();

    for (const point of points) {
      const dayStartMs = dayjs.utc(point.timestampMs).startOf("day").valueOf();
      const existing = groupedByDay.get(dayStartMs);

      if (!existing || point.timestampMs > existing.timestampMs) {
        groupedByDay.set(dayStartMs, point);
      }
    }

    normalized[tokenAddress] = Array.from(groupedByDay.values()).sort(
      (a, b) => a.timestampMs - b.timestampMs,
    );
  }

  return normalized;
}

// Align all token series to the same oldest common timestamp.
// Truncates newer data points so all tokens have data from the same time window.
function alignEndTimestamps(
  grouped: NonNullable<WalletTokenBalanceHistory>,
): WalletTokenBalanceHistory {
  // Get all timestamp sets per token
  const tokenTimestamps = Object.values(grouped).map(
    (points) => new Set(points.map((p) => p.timestampMs)),
  );

  if (tokenTimestamps.length == 0) return grouped;

  // Find the largest timestamp that exists in every token
  let commonMax: number | null = null;
  const firstSet = tokenTimestamps[0];
  for (const ts of firstSet) {
    if (tokenTimestamps.every((set) => set.has(ts))) {
      if (commonMax == null || ts > commonMax) commonMax = ts;
    }
  }

  if (commonMax == null) {
    // No common timestamp – you may want to return empty or throw
    return null;
  }

  // Keep only points up to that common max (including it)
  const aligned: NonNullable<WalletTokenBalanceHistory> = {};
  for (const [tokenAddress, points] of Object.entries(grouped)) {
    aligned[tokenAddress] = points.filter((p) => p.timestampMs <= commonMax);
  }
  return aligned;
}
