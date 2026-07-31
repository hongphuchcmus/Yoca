import { TOP_TOKEN_HOLDERS_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import {
    tokenHolderStats,
    topTokenHolders,
    type TokenHolderStatsInsert,
    type TokenTopHolderInsert,
} from "@sv/db/schema.js";
import {
    mbl_TokenTopHoldersSchema,
    type MBL_TokenTopHolderSchema,
} from "@sv/services/_types/token-raw-responses.js";
import { singleFlight } from "@sv/services/util/single-flight.js";
import { excludedAutoFromInsert } from "@sv/util/orm-sql.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as mobula from "@sv/util/util-mobula.js";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { dataUsage } from "@sv/middlewares/request-context.js";

export async function fetchTokenHolderPositions(
  tokenAddress: string,
): Promise<MBL_TokenTopHolderSchema | null> {
  const endpoint = mobula.getEndpoint("/2/token/holder-positions");
  endpoint.search = new URLSearchParams({
    chainId: "solana:solana",
    address: tokenAddress,
    limit: "1000",
  }).toString();

  const resp = await pFetch(mobula.spec, "mobula.svc.token_holders", endpoint, {
    method: "GET",
    headers: mobula.getRequiredHeaders(),
  });

  if (!resp.ok) {
    return null;
  }
  const res = await validateApiResult(mbl_TokenTopHoldersSchema, resp);

  if (!res) {
    return null;
  }

  return res;
}

async function fetchAndStoreTokenHolderSnapshot(tokenAddress: string) {
  const positions = await fetchTokenHolderPositions(tokenAddress);

  if (!positions) {
    return null;
  }

  const topHolders = positions.data
    .filter((raw) => Number(raw.tokenAmountRaw) > 0)
    .sort(
      (a, b) =>
        Number(b.percentageOfTotalSupply) -
        Number(a.percentageOfTotalSupply),
    )
    .map(
      (raw, idx): TokenTopHolderInsert => ({
        holderAddress: raw.walletAddress,
        tokenAddress: tokenAddress,
        rank: idx,
        percentage: Number(raw.percentageOfTotalSupply),
        balance: Number(raw.tokenAmount) || Number(raw.tokenAmountRaw) || 0,
      }),
    );

  const stats: TokenHolderStatsInsert = {
    address: tokenAddress,
    holdersCount: positions.totalCount,
    top10Percent: topHolders
      .slice(0, 10)
      .reduce((sum, holder) => sum + Number(holder.percentage), 0),
    rank11To20Percent: topHolders
      .slice(10, 20)
      .reduce((sum, holder) => sum + Number(holder.percentage), 0),
    rank21To40Percent: topHolders
      .slice(20, 40)
      .reduce((sum, holder) => sum + Number(holder.percentage), 0),
  };

  return await db.transaction(async (tx) => {
    await tx
      .delete(topTokenHolders)
      .where(eq(topTokenHolders.tokenAddress, tokenAddress));

    const holders =
      topHolders.length > 0
        ? await tx
            .insert(topTokenHolders)
            .values(topHolders)
            .onConflictDoUpdate({
              target: [topTokenHolders.tokenAddress, topTokenHolders.rank],
              set: {
                ...excludedAutoFromInsert(
                  topTokenHolders,
                  [topTokenHolders.tokenAddress, topTokenHolders.rank],
                  topHolders,
                ),
                updatedAt: dayjs.utc().toDate(),
              },
            })
            .returning()
        : [];

    const persistedStats = await tx
      .insert(tokenHolderStats)
      .values(stats)
      .onConflictDoUpdate({
        target: [tokenHolderStats.address],
        set: excludedAutoFromInsert(
          tokenHolderStats,
          tokenHolderStats.address,
          stats,
        ),
      })
      .returning();

    if (!persistedStats[0]) {
      return null;
    }

    return {
      holders,
      stats: persistedStats[0],
    };
  });
}

export const refreshTokenHolderSnapshot = singleFlight(
  fetchAndStoreTokenHolderSnapshot,
).by((tokenAddress) => `token_holders:${tokenAddress}`);

export async function getTopTokenHolders(tokenAddress: string) {
  const res = await db
    .select()
    .from(topTokenHolders)
    .where(eq(topTokenHolders.tokenAddress, tokenAddress))
    .orderBy(topTokenHolders.rank);

  let stale = false;

  if (res.length > 0) {
    const latestUpdate = res.reduce((latest, cur) =>
      cur.updatedAt > latest.updatedAt ? cur : latest,
    );

    const thresholdDate = new Date(Date.now() - TOP_TOKEN_HOLDERS_TTL_MS);
    stale = latestUpdate.updatedAt < thresholdDate;
  } else {
    stale = true;
  }

  if (stale) {
    dataUsage.record("provider_result");
    const refreshed = await refreshTokenHolderSnapshot(tokenAddress);
    return refreshed?.holders ?? null;
  }
  dataUsage.record("db_result");
  return res;
}
