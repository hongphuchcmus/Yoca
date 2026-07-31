import { CG_TOKEN_LIST_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import {
    coinGeckoTokenList,
    coinGeckoTokenListMeta,
    type CoingeckoTokenListInsert,
} from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { excluded } from "@sv/util/orm-sql.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as cg from "@sv/util/util-coingecko.js";
import {
    cg_CoinListSchema
} from "@sv/services/_types/token-raw-responses.js";
import { inArray } from "drizzle-orm";

export async function getCoinGeckoIdsByAddresses(
  tokenAddresses: string[],
): Promise<Record<string, string>> {
  if (tokenAddresses.length == 0) {
    return {};
  }

  const freshCheck = await db
    .select({
      lastRefresh: coinGeckoTokenListMeta.lastRefresh,
    })
    .from(coinGeckoTokenListMeta)
    .limit(1);

  const thresholdDate = new Date(Date.now() - CG_TOKEN_LIST_TTL_MS);

  if (freshCheck.length == 0 || freshCheck[0].lastRefresh < thresholdDate) {
    const addressToCgId = await fetchCoinGeckoIdsByAddresses(tokenAddresses);
    await db.insert(coinGeckoTokenListMeta).values({
      key: "global",
      lastRefresh: new Date(),
    }).onConflictDoUpdate({
      target: [coinGeckoTokenListMeta.key],
      set: { lastRefresh: new Date() },
    });
    return addressToCgId;
  } else {
    const res = await db
      .select({
        id: coinGeckoTokenList.coinGeckoId,
        address: coinGeckoTokenList.tokenAddress,
      })
      .from(coinGeckoTokenList)
      .where(inArray(coinGeckoTokenList.tokenAddress, tokenAddresses))
      .limit(tokenAddresses.length);
    const addressToCgId = Object.fromEntries(
      res.map(({ id, address }) => [address, id]),
    );
    return addressToCgId;
  }
}

export async function getAddressesByCoinGeckoIds(
  coinGeckoIds: string[],
): Promise<Record<string, string>> {
  if (coinGeckoIds.length == 0) {
    return {};
  }

  const res = await db
    .select({
      id: coinGeckoTokenList.coinGeckoId,
      address: coinGeckoTokenList.tokenAddress,
    })
    .from(coinGeckoTokenList)
    .where(inArray(coinGeckoTokenList.coinGeckoId, coinGeckoIds))
    .limit(coinGeckoIds.length);

  if (res.length == 0) {
    const cgIdToAddress = await fetchAddressesByCoinGeckoIds(coinGeckoIds);
    await db.insert(coinGeckoTokenListMeta).values({
      key: "global",
      lastRefresh: new Date(),
    }).onConflictDoUpdate({
      target: [coinGeckoTokenListMeta.key],
      set: { lastRefresh: new Date() },
    });
    return cgIdToAddress;
  }

  const cgIdToAddress = Object.fromEntries(
    res.map(({ id, address }) => [id, address]),
  );
  return cgIdToAddress;
}

let refreshPromise: Promise<void> | null = null;

async function syncCoinGeckoList() {
  const endpoint = cg.getEndpoint("/coins/list");
  endpoint.search = new URLSearchParams({
    include_platform: "true",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.token_list", endpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  if (!resp.ok) {
    return;
  }

  const res = await validateApiResult(cg_CoinListSchema, resp);

  if (!res) {
    return;
  }

  const solanaTokens = res
    .filter((raw) => raw.platforms?.["solana"])
    .map(
      (rawToken): CoingeckoTokenListInsert => ({
        coinGeckoId: rawToken.id,
        tokenAddress: rawToken.platforms!["solana"]!,
      }),
    );

  if (solanaTokens.length > 0) {
    for (let i = 0; i < solanaTokens.length; i += 1000) {
      await db
        .insert(coinGeckoTokenList)
        .values(solanaTokens.slice(i, i + 1000))
        .onConflictDoUpdate({
          target: [coinGeckoTokenList.tokenAddress],
          set: { 
            coinGeckoId: excluded(coinGeckoTokenList.coinGeckoId),
            tokenAddress: excluded(coinGeckoTokenList.tokenAddress)
          },
        });
    }
  }
}

export async function fetchCoinGeckoIdsByAddresses(
  tokenAddresses: string[],
): Promise<Record<string, string>> {
  if (tokenAddresses.length == 0) {
    return {};
  }

  if (!refreshPromise) {
    refreshPromise = syncCoinGeckoList().finally(() => { refreshPromise = null; });
  }
  await refreshPromise;

  const res = await db
    .select({
      id: coinGeckoTokenList.coinGeckoId,
      address: coinGeckoTokenList.tokenAddress,
    })
    .from(coinGeckoTokenList)
    .where(inArray(coinGeckoTokenList.tokenAddress, tokenAddresses));

  return Object.fromEntries(
    res.map(({ id, address }) => [address, id]),
  );
}

async function fetchAddressesByCoinGeckoIds(
  coinGeckoIds: string[],
): Promise<Record<string, string>> {
  if (coinGeckoIds.length == 0) {
    return {};
  }

  if (!refreshPromise) {
    refreshPromise = syncCoinGeckoList().finally(() => { refreshPromise = null; });
  }
  await refreshPromise;

  const res = await db
    .select({
      id: coinGeckoTokenList.coinGeckoId,
      address: coinGeckoTokenList.tokenAddress,
    })
    .from(coinGeckoTokenList)
    .where(inArray(coinGeckoTokenList.coinGeckoId, coinGeckoIds));

  return Object.fromEntries(
    res.map(({ id, address }) => [id, address]),
  );
}
