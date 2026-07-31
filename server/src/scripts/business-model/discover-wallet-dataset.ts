import env from "@sv/util/load-env.js";
import { db } from "@sv/db/index.js";
import { recentTrades, topTokenHolders, topTraders } from "@sv/db/schema.js";
import { helius_EnhancedTransactionsSchema } from "@sv/services/_types/token-raw-responses.js";
import "@sv/util/date.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as helius from "@sv/util/util-helius.js";
import dayjs from "dayjs";
import { asc, desc, gte, inArray, sql } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type ActivityBucket = "high" | "medium" | "low" | "inactive";
type ResultClassification =
  | "data"
  | "empty_valid"
  | "unsupported"
  | "timeout"
  | "network_error"
  | "validation_error"
  | "upstream_error"
  | "server_error";

type WalletCoverage = {
  status: number | null;
  durationMs: number;
  classification: ResultClassification;
  payloadBytes: number;
};

type WalletCandidate = {
  address: string;
  source: string;
  relatedToken?: string;
  holderRank?: number;
  observedTradeCount?: number;
  observedVolumeUsd?: number;
  traderRank?: number;
  providerPnlUsd?: number;
  transactionSampleCount?: number;
  latestTransactionAt?: string | null;
  activity?: ActivityBucket;
  swapScreening?: WalletCoverage;
};

const excludedWallets = new Set([
  // Known active arbitrage bot, but Mobula does not provide stable coverage.
  "3nMNd89AxwHUa1AFvQGqohRkxFEQsTsgiEyEyqXFHyyH",
]);

const walletOverviewBenchmarkSchema = z.object({
  totalAssetValueUsd: z.number(),
  tokensHoldingCount: z.number(),
  periods: z.record(
    z.string(),
    z.object({
      source: z.string(),
    }),
  ),
});

const walletPortfolioBenchmarkSchema = z.array(z.unknown());

const walletHistoryBenchmarkSchema = z.object({
  transactions: z.array(z.unknown()),
});

const walletIdentityBenchmarkSchema = z.object({}).passthrough();

function classifyWalletPayload(
  module: string,
  payload: unknown,
): ResultClassification {
  if (module == "overview") {
    const parsed = walletOverviewBenchmarkSchema.safeParse(payload);
    if (!parsed.success) return "validation_error";

    const hasProviderData = Object.values(parsed.data.periods).some(
      (period) => period.source != "none",
    );
    return parsed.data.totalAssetValueUsd > 0 ||
      parsed.data.tokensHoldingCount > 0 ||
      hasProviderData
      ? "data"
      : "empty_valid";
  }

  if (module == "portfolio") {
    const parsed = walletPortfolioBenchmarkSchema.safeParse(payload);
    if (!parsed.success) return "validation_error";
    return parsed.data.length > 0 ? "data" : "empty_valid";
  }

  if (module == "transfers" || module == "swaps") {
    const parsed = walletHistoryBenchmarkSchema.safeParse(payload);
    if (!parsed.success) return "validation_error";
    return parsed.data.transactions.length > 0 ? "data" : "empty_valid";
  }

  const parsed = walletIdentityBenchmarkSchema.safeParse(payload);
  if (!parsed.success) return "validation_error";
  return Object.keys(parsed.data).length > 0 ? "data" : "empty_valid";
}

async function inspectWalletModule(
  baseUrl: string,
  module: string,
  route: string,
): Promise<WalletCoverage> {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let classification: ResultClassification | null = null;
    if (response.status == 404) {
      classification = "unsupported";
    } else if (response.status == 422) {
      classification = "validation_error";
    } else if (response.status >= 500 && response.status <= 599) {
      classification =
        response.status == 502 ? "upstream_error" : "server_error";
    } else if (!response.ok) {
      classification = "upstream_error";
    } else {
      let payload: unknown = null;
      try {
        payload = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        classification = "validation_error";
      }
      if (!classification) {
        classification = classifyWalletPayload(module, payload);
      }
    }
    return {
      status: response.status,
      durationMs: Date.now() - startedAt,
      classification,
      payloadBytes: Buffer.byteLength(text),
    };
  } catch (error) {
    return {
      status: null,
      durationMs: Date.now() - startedAt,
      classification:
        error instanceof Error && error.name == "TimeoutError"
          ? "timeout"
          : "network_error",
      payloadBytes: 0,
    };
  }
}

async function writeCheckpoint(filePath: string, payload: unknown): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function main(): Promise<void> {
  const lockPath = path.resolve("/tmp/yoca-wallet-discovery.lock");
  let lock: Awaited<ReturnType<typeof open>>;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    throw new Error(
      `Another wallet discovery process is running, or stale lock exists at ${lockPath}`,
    );
  }

  try {
    const baseUrl = env.YOCA_BENCHMARK_BASE_URL;
    const currentFile = fileURLToPath(import.meta.url);
    const outputDir = path.resolve(
      path.dirname(currentFile),
      "../../../../docs/plans/business/benchmark-results/datasets",
    );
    await mkdir(outputDir, { recursive: true });
    const checkpointPath = path.join(outputDir, "wallet-discovery-checkpoint.json");
    const candidates = new Map<string, WalletCandidate>();
    const seeds: WalletCandidate[] = [
      {
        address: "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt",
        source: "required_seed",
      },
      {
        address: "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk",
        source: "project_seed",
      },
    ];
    for (const seed of seeds) {
      candidates.set(seed.address, seed);
    }

    const recentTraderRows = await db
      .select({
        address: recentTrades.owner,
        tradeCount: sql<number>`count(*)::int`,
        volumeUsd: sql<number>`coalesce(sum(${recentTrades.volumeUsd}), 0)::double precision`,
      })
      .from(recentTrades)
      .where(gte(recentTrades.volumeUsd, 1))
      .groupBy(recentTrades.owner)
      .orderBy(desc(sql`count(*)`), desc(sql`sum(${recentTrades.volumeUsd})`))
      .limit(100);

    for (const trader of recentTraderRows) {
      if (!excludedWallets.has(trader.address) && !candidates.has(trader.address)) {
        candidates.set(trader.address, {
          address: trader.address,
          source: "recent_swap_owner",
          observedTradeCount: trader.tradeCount,
          observedVolumeUsd: trader.volumeUsd,
        });
      }
    }

    const profitableTraderRows = await db
      .select()
      .from(topTraders)
      .where(gte(topTraders.tradeCount, 10))
      .orderBy(asc(topTraders.rank));

    for (const trader of profitableTraderRows) {
      if (!excludedWallets.has(trader.address) && !candidates.has(trader.address)) {
        candidates.set(trader.address, {
          address: trader.address,
          source: "birdeye_profitable_trader",
          observedTradeCount: trader.tradeCount,
          observedVolumeUsd: Number(trader.volume),
          traderRank: trader.rank,
          providerPnlUsd: Number(trader.pnl),
        });
      }
    }

    const holderRows = await db
      .select({
        address: topTokenHolders.holderAddress,
        tokenAddress: topTokenHolders.tokenAddress,
        rank: topTokenHolders.rank,
      })
      .from(topTokenHolders)
      .where(inArray(topTokenHolders.rank, [0, 1, 5, 10, 25, 100, 500, 999]))
      .orderBy(asc(topTokenHolders.rank), asc(topTokenHolders.tokenAddress))
      .limit(160);

    for (const row of holderRows) {
      if (!excludedWallets.has(row.address) && !candidates.has(row.address)) {
        candidates.set(row.address, {
          address: row.address,
          source: "token_holder",
          relatedToken: row.tokenAddress,
          holderRank: row.rank,
        });
      }
    }

    const preflighted: WalletCandidate[] = [];
    for (const candidate of Array.from(candidates.values()).slice(0, 80)) {
      const endpoint = helius.getEndpoint(
        `/v0/addresses/${candidate.address}/transactions`,
      );
      endpoint.searchParams.set("limit", "100");
      const response = await pFetch(
        helius.spec,
        "helius.svc.wallet_candidate_preflight",
        endpoint,
        {
          headers: helius.getRequiredHeaders(),
        },
      );
      if (!response.ok) {
        continue;
      }

      const payload: unknown = await response.json();
      const parsed = helius_EnhancedTransactionsSchema.safeParse(payload);
      if (!parsed.success) {
        continue;
      }

      const transactionSampleCount = parsed.data.length;
      let activity: ActivityBucket = "inactive";
      if (transactionSampleCount >= 80) {
        activity = "high";
      } else if (transactionSampleCount >= 20) {
        activity = "medium";
      } else if (transactionSampleCount > 0) {
        activity = "low";
      }
      const latestTimestamp = parsed.data[0]?.timestamp;
      preflighted.push({
        ...candidate,
        transactionSampleCount,
        latestTransactionAt:
          latestTimestamp == undefined
            ? null
            : dayjs.unix(latestTimestamp).utc().toISOString(),
        activity,
      });
      console.log(
        `[wallet-discovery] preflight ${preflighted.length}/80 ${candidate.address} ${activity}`,
      );
    }

    for (let batchStart = 0; batchStart < preflighted.length; batchStart += 2) {
      await Promise.all(
        preflighted.slice(batchStart, batchStart + 2).map(async (candidate, offset) => {
          const address = encodeURIComponent(candidate.address);
          candidate.swapScreening = await inspectWalletModule(
            baseUrl,
            "swaps",
            `/api/wallets/swaps/history/${address}?limit=20`,
          );
          console.log(
            `[wallet-discovery] swap-screen ${batchStart + offset + 1}/${preflighted.length} ${candidate.address} ${candidate.swapScreening.classification}`,
          );
        }),
      );
      await writeCheckpoint(checkpointPath, {
        phase: "swap_screening",
        completed: Math.min(batchStart + 2, preflighted.length),
        total: preflighted.length,
        candidates: preflighted,
      });
    }

    const selected = preflighted
      .toSorted((left, right) => {
        const leftHasSwaps = left.swapScreening?.classification == "data" ? 1 : 0;
        const rightHasSwaps = right.swapScreening?.classification == "data" ? 1 : 0;
        return (
          rightHasSwaps - leftHasSwaps ||
          (right.transactionSampleCount ?? 0) - (left.transactionSampleCount ?? 0)
        );
      })
      .slice(0, 24);

    for (const candidate of preflighted) {
      if (
        selected.length < 24 &&
        !selected.some((selectedWallet) => selectedWallet.address == candidate.address)
      ) {
        selected.push(candidate);
      }
    }

    if (selected.length < 24) {
      throw new Error(
        `Only ${selected.length} compatible wallet candidates were found`,
      );
    }

    const results = [];
    const selectedWallets = selected.slice(0, 24);
    for (let batchStart = 0; batchStart < selectedWallets.length; batchStart += 2) {
      const batchResults = await Promise.all(
        selectedWallets.slice(batchStart, batchStart + 2).map(async (wallet, offset) => {
          const index = batchStart + offset;
          const address = encodeURIComponent(wallet.address);
          const endpoints = {
            overview: `/api/wallets/overview?address=${address}&period=24H`,
            portfolio: `/api/wallets/portfolio?address=${address}`,
            transfers: `/api/wallets/transfers/history/${address}?limit=20`,
            swaps: `/api/wallets/swaps/history/${address}?limit=20`,
            identity: `/api/wallets/identity?address=${address}`,
          };
          const coverage: Record<string, WalletCoverage> = {};

          for (const [module, route] of Object.entries(endpoints)) {
            coverage[module] = await inspectWalletModule(baseUrl, module, route);
          }

          console.log(
            `[wallet-discovery] compatibility ${index + 1}/24 ${wallet.address}`,
          );
          return {
            resourceId: `wallet_${String(index + 1).padStart(3, "0")}`,
            ...wallet,
            coverage,
          };
        }),
      );
      results.push(...batchResults);
      await writeCheckpoint(checkpointPath, {
        phase: "compatibility",
        completed: results.length,
        total: selectedWallets.length,
        wallets: results,
      });
    }

    const generatedAt = dayjs.utc().toISOString();
    const outputPath = path.join(
      outputDir,
      `wallet-candidates-${generatedAt.slice(0, 10)}.json`,
    );
    const coverageQualifiedWallets = results.filter(
      (wallet) =>
        wallet.coverage.overview?.classification == "data" &&
        wallet.coverage.portfolio?.classification == "data" &&
        wallet.coverage.transfers?.classification == "data" &&
        wallet.coverage.swaps?.classification == "data" &&
        wallet.coverage.identity?.classification == "data",
    );
    await writeFile(
      outputPath,
      `${JSON.stringify({
        generatedAt,
        baseUrl,
        candidateCount: candidates.size,
        preflightCount: preflighted.length,
        selectedCount: results.length,
        coverageQualifiedCount: coverageQualifiedWallets.length,
        excludedWallets: Array.from(excludedWallets),
        screenedCandidates: preflighted,
        wallets: results,
        coverageQualifiedWallets,
      }, null, 2)}\n`,
      "utf8",
    );
    await unlink(checkpointPath).catch(() => undefined);
    console.log(`[wallet-discovery] wrote ${outputPath}`);
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error("[wallet-discovery] failed", error);
  throw error;
});
