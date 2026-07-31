import { POOL_TRADES_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { poolTrades24h, type PoolTrade24hInsert } from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as cg from "@sv/util/util-coingecko.js";
import { and, desc, eq, gte } from "drizzle-orm";
import { cg_24hPoolTradesSchema } from "../_types/token-raw-responses.js";

async function fetchPoolTrades(
  poolAddress: string,
): Promise<PoolTrade24hInsert[]> {
  const cgEndpoint = cg.getEndpoint(
    `/onchain/networks/solana/pools/${poolAddress}/trades`,
  );

  cgEndpoint.search = new URLSearchParams({
    token: "base",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.token_trades", cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  if (!resp.ok) {
    return [];
  }

  const res = await validateApiResult(cg_24hPoolTradesSchema, resp);
  if (!res) {
    // TODO: Consider more robust error handling
    return [];
  }

  const trades = res.data.map(
    (raw): PoolTrade24hInsert => ({
      id: raw.id,
      poolAddress: poolAddress,

      signerAddress: raw.attributes.tx_from_address,
      transactionHash: raw.attributes.tx_hash,

      blockTimestamp: new Date(raw.attributes.block_timestamp),

      sellTokenAddress: raw.attributes.from_token_address,
      buyTokenAddress: raw.attributes.to_token_address,

      sellTokenAmount: Number(raw.attributes.from_token_amount),
      buyTokenAmount: Number(raw.attributes.to_token_amount),

      sellTokenPriceUsd: Number(raw.attributes.price_from_in_usd),
      buyTokenPriceUsd: Number(raw.attributes.price_to_in_usd),

      volumeInUsd: Number(raw.attributes.volume_in_usd),
    }),
  );

  return await db
    .insert(poolTrades24h)
    .values(trades)
    .onConflictDoUpdate({
      target: [poolTrades24h.id],
      set: {
        updatedAt: new Date(),
      },
    })
    .returning();
}

export async function getPoolTrades24h(poolAddress: string) {
  const from = new Date(Date.now() - 86_400_000);

  const res = await db
    .select()
    .from(poolTrades24h)
    .where(
      and(
        eq(poolTrades24h.poolAddress, poolAddress),
        gte(poolTrades24h.blockTimestamp, from),
      ),
    )
    .orderBy(desc(poolTrades24h.blockTimestamp))
    .limit(100);

  let stale = false;

  if (res.length > 0) {
    const latestUpdate = res.reduce((latest, cur) =>
      cur.updatedAt > latest.updatedAt ? cur : latest,
    );

    const thresholdDate = new Date(Date.now() - POOL_TRADES_TTL_MS);
    stale = latestUpdate.updatedAt < thresholdDate;
  } else {
    stale = true;
  }

  if (stale) {
    const fresh = await fetchPoolTrades(poolAddress);
    if (fresh.length > 0) {
      dataUsage.record("provider_result");
    }
    // fresh is already sorted descending by GeckoTerminal usually, limit to 100
    return fresh.slice(0, 100);
  }
  dataUsage.record("db_result");
  return res;
}
