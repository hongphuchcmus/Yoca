import { WALLET_PORTFOLIO_TTL_MS } from "@sv/config/constants.js";
import type { WalletPortfolioItem } from "./dtos/walletDataObjects.js";
import {
  enrichWalletPortfolioMetadata,
  isValidPortfolioTokenAddress,
  normalizePortfolioLookupAddress,
  normalizePortfolioText,
} from "./walletData.core.js";
import { db } from "@sv/db/index.js";
import {
  tokenMeta,
  type TokenMetaInsert,
  walletPortfolioCache,
} from "@sv/db/schema.js";
import { excludedAutoNonNullFromInsert } from "@sv/util/orm-sql.js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fetchHeliusSolanaPortfolio } from "./fetchers/walletDataFetcher.service.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { singleFlight } from "@sv/services/util/single-flight.js";

const walletPortfolioCacheSchema = z.array(
  z.object({
    tokenAddress: z.string(),
    symbol: z.string(),
    name: z.string().optional(),
    logoUri: z.string().optional(),
    amount: z.number(),
    priceUsd: z.number().optional(),
    valueUsd: z.number(),
    change24hPercent: z.number().optional(),
  }),
);

async function syncPortfolioTokenMeta(portfolio: WalletPortfolioItem[]) {
  const valuesByAddress = new Map<string, TokenMetaInsert>();

  for (const item of portfolio) {
    if (!isValidPortfolioTokenAddress(item.tokenAddress)) {
      continue;
    }

    const address = normalizePortfolioLookupAddress(item.tokenAddress);
    const symbol = normalizePortfolioText(item.symbol);
    const name = normalizePortfolioText(item.name);
    const imageUrl = normalizePortfolioText(item.logoUri);

    if (!symbol && !name && !imageUrl) {
      continue;
    }

    valuesByAddress.set(address, {
      address,
      symbol,
      name,
      imageUrl,
    });
  }

  const values = Array.from(valuesByAddress.values());
  if (values.length == 0) {
    return;
  }

  await db
    .insert(tokenMeta)
    .values(values)
    .onConflictDoUpdate({
      target: [tokenMeta.address],
      set: excludedAutoNonNullFromInsert(tokenMeta, tokenMeta.address, values),
    });
}

async function refreshWalletPortfolio(
  address: string,
  cachedData: WalletPortfolioItem[],
): Promise<WalletPortfolioItem[]> {
  let selectedPortfolio: WalletPortfolioItem[] = [];
  try {
    selectedPortfolio = await fetchHeliusSolanaPortfolio(address);
  } catch (err) {
    console.error("Failed to fetch Solana portfolio from Helius", err);
  }

  if (selectedPortfolio.length == 0) {
    if (cachedData.length > 0) {
      dataUsage.record("db_result", "stale_fallback");
      await syncPortfolioTokenMeta(cachedData);
      const enrichedStale = await enrichWalletPortfolioMetadata(cachedData, {
        address,
        source: "stale-cache",
      });
      return enrichedStale.portfolio;
    }

    return [];
  }

  await syncPortfolioTokenMeta(selectedPortfolio);
  const enrichedPortfolio = await enrichWalletPortfolioMetadata(
    selectedPortfolio,
    {
      address,
      source: "helius",
    },
  );

  await db
    .insert(walletPortfolioCache)
    .values({ address, data: enrichedPortfolio.portfolio })
    .onConflictDoUpdate({
      target: [walletPortfolioCache.address],
      set: { data: enrichedPortfolio.portfolio, fetchedAt: new Date() },
    });
  return enrichedPortfolio.portfolio;
}

const walletPortfolioFlight = singleFlight(refreshWalletPortfolio);

export async function getWalletPortfolio(
  address: string,
  options?: { force?: boolean },
): Promise<WalletPortfolioItem[]> {
  if (options?.force) {
    dataUsage.record("forced_refresh");
  }

  // 0) DB-first: use cached portfolio if fresh
  const portfolioThreshold = new Date(Date.now() - WALLET_PORTFOLIO_TTL_MS);
  const cachedPortfolio = await db
    .select()
    .from(walletPortfolioCache)
    .where(and(eq(walletPortfolioCache.address, address)))
    .limit(1);
  const cachedDataResult = walletPortfolioCacheSchema.safeParse(
    cachedPortfolio[0]?.data,
  );
  const cachedData: WalletPortfolioItem[] = cachedDataResult.success
    ? cachedDataResult.data
    : [];
  if (
    !options?.force &&
    cachedPortfolio.length > 0 &&
    cachedDataResult.success &&
    cachedPortfolio[0].fetchedAt >= portfolioThreshold
  ) {
    dataUsage.record("db_result");
    await syncPortfolioTokenMeta(cachedData);
    const enrichedCached = await enrichWalletPortfolioMetadata(cachedData, {
      address,
      source: "cache-hit",
    });

    if (enrichedCached.changed) {
      await db
        .insert(walletPortfolioCache)
        .values({ address, data: enrichedCached.portfolio })
        .onConflictDoUpdate({
          target: [walletPortfolioCache.address],
          set: { data: enrichedCached.portfolio, fetchedAt: new Date() },
        });
    }

    return enrichedCached.portfolio;
  }

  return walletPortfolioFlight
    .key(`wallet_portfolio:${address}`)
    .run(address, cachedData);
}
