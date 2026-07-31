import type {
    BirdeyeNetworthDirection,
    BirdeyeNetworthHistoryPoint,
    BirdeyeNetworthHistoryResult,
    BirdeyeNetworthType,
    BirdeyePortfolioSnapshotResult,
    BirdeyeSortType,
    HeliusWalletFirstFund,
    WalletPortfolioItem,
    WalletSwap,
    WalletTransactionHelius,
    WalletTransfer
} from "@sv/services/wallet/dtos/walletDataObjects.js";
import {
    runCursorPagination
} from "@sv/services/wallet/fetchers/walletPagination.js";
import {
    getNextCursor,
    getTokenLogoUri,
    mapHeliusTransferEntry,
    mapMoralisSwapEntry,
    toFiniteNumber,
    toIsoTimestamp,
    toOptionalNumber,
} from "@sv/services/wallet/fetchers/walletProviderMappers.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import {
    hls_WalletBalancesSchema,
    bds_WalletNetAssetsSchema,
    bds_WalletNetworthHistorySchema,
    mrl_WalletTokenSwapsSchema,
    type MRL_WalletTokenSwaps,
} from "@sv/services/_types/wallet-raw-responses.js";
import {
    helius_WalletFundedBySchema,
    helius_WalletHistorySchema,
    helius_WalletTransfersSchema,
} from "@sv/services/_types/token-raw-responses.js";
import { pFetch } from "@sv/util/rate-limit.js";
import {
    getEndpoint as getBirdeyeEndpoint,
    getRequiredHeaders as getBirdeyeHeaders,
    spec as birdeyeSpec,
    normalizeBirdeyeTimeParam,
} from "@sv/util/util-birdeye.js";
import {
    getEndpoint,
    getRequiredHeaders,
    spec as heliusSpec,
} from "@sv/util/util-helius.js";
import * as moralis from "@sv/util/util-moralis.js";


const MAX_HELIUS_PORTFOLIO_BALANCE_PAGES = 250;
const MAX_HELIUS_PORTFOLIO_ITEMS = 5_000;
const MAX_HELIUS_PORTFOLIO_STAGNANT_PAGES = 3;

export type HeliusHistoryRange = {
  fromSec: number;
  toSec?: number;
};

export type FetchAllTransactionHistoryOptions = {
  beforeCursor?: string;
  stopAtKnownSignatures?: Set<string>;
};

export type FetchAllTransactionHistoryChunkOptions =
  FetchAllTransactionHistoryOptions & {
    maxPages?: number;
    maxTransactions?: number;
  };

export type FetchAllTransactionHistoryChunkResult = {
  transactions: WalletTransactionHelius[];
  nextCursor: string | null;
  hasMore: boolean;
  pagesFetched: number;
  stopReason:
  | "provider-end"
  | "range-cutoff"
  | "known-signature"
  | "max-pages"
  | "max-transactions"
  | "empty-page";
};

const HELIUS_HISTORY_PAGE_LIMIT = 100;
const DEFAULT_HELIUS_HISTORY_CHUNK_MAX_PAGES = 5;
const MAX_HELIUS_HISTORY_CHUNK_MAX_PAGES = 50;
const DEFAULT_HELIUS_HISTORY_CHUNK_MAX_TRANSACTIONS = 500;
const MAX_HELIUS_HISTORY_CHUNK_MAX_TRANSACTIONS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getUtcStartOfDayMs(tsMs: number): number {
  const date = new Date(tsMs);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  );
}

function resolveHistoryWindow(
  from: HeliusHistoryFrom | number | HeliusHistoryRange,
): { fromSec: number; toSec: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const daySec = 24 * 60 * 60;

  const fromSec =
    typeof from === "number"
      ? from
      : typeof from === "object"
        ? from.fromSec
        : nowSec - daySec * (from === "24h" ? 1 : 7);
  const toSec =
    typeof from === "object" && from.toSec != null ? from.toSec : nowSec;

  return {
    fromSec,
    toSec,
  };
}

export async function fetchAllTransactionHistoryChunk(
  address: string,
  from: HeliusHistoryFrom | number | HeliusHistoryRange = "7d",
  options?: FetchAllTransactionHistoryChunkOptions,
): Promise<FetchAllTransactionHistoryChunkResult> {
  const { fromSec, toSec } = resolveHistoryWindow(from);
  const maxPages = Math.min(
    Math.max(
      Math.floor(options?.maxPages ?? DEFAULT_HELIUS_HISTORY_CHUNK_MAX_PAGES),
      1,
    ),
    MAX_HELIUS_HISTORY_CHUNK_MAX_PAGES,
  );
  const maxTransactions = Math.min(
    Math.max(
      Math.floor(
        options?.maxTransactions ??
        DEFAULT_HELIUS_HISTORY_CHUNK_MAX_TRANSACTIONS,
      ),
      1,
    ),
    MAX_HELIUS_HISTORY_CHUNK_MAX_TRANSACTIONS,
  );

  const knownSignatures = options?.stopAtKnownSignatures;
  const transactions: WalletTransactionHelius[] = [];

  let cursor: string | null = options?.beforeCursor ?? null;
  let pagesFetched = 0;
  let hasMoreFromProvider = false;
  let stopReason: FetchAllTransactionHistoryChunkResult["stopReason"] =
    "provider-end";

  while (pagesFetched < maxPages && transactions.length < maxTransactions) {
    pagesFetched += 1;

    let json;
    try {
      const endpoint = getEndpoint(`/v1/wallet/${address}/history`);
      endpoint.searchParams.set("tokenAccounts", "balanceChanged");
      endpoint.searchParams.set("limit", String(HELIUS_HISTORY_PAGE_LIMIT));
      if (cursor) {
        endpoint.searchParams.set("before", cursor);
      }

      const response = await pFetch(heliusSpec, "helius.svc.wallet_history", endpoint, {
        method: "GET",
        headers: getRequiredHeaders(),
      });

      if (!response.ok) {
        // TODO: Consider more robust error handling
        break;
      }

      json = await validateApiResult(helius_WalletHistorySchema, response);
      if (!json) {
        // TODO: Consider more robust error handling
        break;
      }
    } catch (err) {
      console.error("Helius wallet transaction chunk request failed", err);
      // TODO: Consider more robust error handling
      break;
    }

    const data = json.data;
    if (data.length == 0) {
      stopReason = "empty-page";
      hasMoreFromProvider = false;
      cursor = null;
      break;
    }

    let reachedRangeCutoff = false;
    let reachedKnownSignature = false;

    for (const entry of data) {
      const tsSec =
        typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)
          ? entry.timestamp
          : null;

      if (tsSec == null) {
        continue;
      }

      if (tsSec > toSec) {
        continue;
      }

      if (tsSec < fromSec) {
        reachedRangeCutoff = true;
        break;
      }

      const signature = String(entry.signature ?? "").trim();
      if (!signature) {
        continue;
      }

      if (knownSignatures?.has(signature)) {
        reachedKnownSignature = true;
        break;
      }

      const mappedBalanceChanges = entry.balanceChanges
        ? entry.balanceChanges
          .map((change) => ({
            mint: String(change?.mint ?? ""),
            amount: Number(change?.amount ?? 0),
            decimals: Number(change?.decimals ?? 0),
          }))
          .filter(
            (change: { mint: string; amount: number; decimals: number }) =>
              change.mint.length > 0 &&
              Number.isFinite(change.amount) &&
              Number.isFinite(change.decimals),
          )
        : [];

      transactions.push({
        walletAddress: address,
        signature,
        timestamp: new Date(tsSec * 1000).toISOString(),
        slot: Number(entry.slot ?? 0),
        fee: Number(entry.fee ?? 0),
        feePayer: String(entry.feePayer ?? ""),
        balanceChanges: mappedBalanceChanges,
      });

      if (transactions.length >= maxTransactions) {
        break;
      }
    }

    hasMoreFromProvider = Boolean(json?.pagination?.hasMore);
    cursor = hasMoreFromProvider ? getNextCursor(json?.pagination) : null;

    if (reachedKnownSignature) {
      stopReason = "known-signature";
      break;
    }

    if (reachedRangeCutoff) {
      stopReason = "range-cutoff";
      break;
    }

    if (transactions.length >= maxTransactions) {
      stopReason = "max-transactions";
      break;
    }

    if (!hasMoreFromProvider || !cursor) {
      stopReason = "provider-end";
      break;
    }
  }

  if (
    stopReason === "provider-end" &&
    hasMoreFromProvider &&
    cursor &&
    pagesFetched >= maxPages &&
    transactions.length < maxTransactions
  ) {
    stopReason = "max-pages";
  }

  return {
    transactions,
    nextCursor: hasMoreFromProvider ? cursor : null,
    hasMore: Boolean(hasMoreFromProvider && cursor),
    pagesFetched,
    stopReason,
  };
}

export async function fetchHeliusSolanaPortfolio(
  address: string,
): Promise<WalletPortfolioItem[]> {
  const portfolio: WalletPortfolioItem[] = [];
  const seenPortfolioKeys = new Set<string>();

  let page = 1;
  const limit = 100;
  let hasMore = true;
  let pageCount = 0;
  let stagnantPageCount = 0;

  while (hasMore) {
    pageCount += 1;
    if (pageCount > MAX_HELIUS_PORTFOLIO_BALANCE_PAGES) {
      console.warn("[wallet-portfolio-fetch] Max balances page limit reached", {
        address,
        pageCount,
        itemCount: portfolio.length,
      });
      break;
    }

    const url = getEndpoint(`/v1/wallet/${address}/balances`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("showZeroBalance", "false");
    url.searchParams.set("showNative", "true");
    // NFTs are not our current focus; exclude them to reduce payload size.
    url.searchParams.set("showNfts", "false");

    try {
      const headers = getRequiredHeaders();
      const resp = await pFetch(heliusSpec, "helius.svc.wallet_balances", url, {
        method: "GET",
        headers,
      });

      if (!resp.ok) {
        console.error(
          "Helius wallet balances error",
          resp.status,
          resp.statusText,
        );
        break;
      }

      const json = await validateApiResult(hls_WalletBalancesSchema, resp);
      if (!json) {
        break;
      }

      const balances = json.balances;
      if (balances.length === 0) {
        break;
      }

      let addedOnPage = 0;

      for (const token of balances) {
        const amount = Number(token.balance ?? 0);
        if (!(amount > 0) || Number.isNaN(amount)) continue;

        const tokenAddress = String(token.mint ?? "");
        const tokenAddressKey = tokenAddress.trim().toLowerCase();
        const fallbackKey = `${String(token.symbol ?? "")
          .trim()
          .toLowerCase()}::${String(token.name ?? "")
            .trim()
            .toLowerCase()}`;
        const dedupeKey = tokenAddressKey || fallbackKey;

        if (dedupeKey && seenPortfolioKeys.has(dedupeKey)) {
          continue;
        }

        if (dedupeKey) {
          seenPortfolioKeys.add(dedupeKey);
        }

        const pricePerToken =
          token.pricePerToken != null &&
            !Number.isNaN(Number(token.pricePerToken))
            ? Number(token.pricePerToken)
            : undefined;
        const usdValue =
          token.usdValue != null && !Number.isNaN(Number(token.usdValue))
            ? Number(token.usdValue)
            : 0;

        portfolio.push({
          tokenAddress,
          symbol: String(token.symbol ?? ""),
          name: token.name ? String(token.name) : undefined,
          logoUri: getTokenLogoUri(token),
          amount,
          priceUsd: pricePerToken,
          valueUsd: usdValue,
        });

        addedOnPage += 1;
        if (portfolio.length >= MAX_HELIUS_PORTFOLIO_ITEMS) {
          console.warn(
            "[wallet-portfolio-fetch] Max portfolio item limit reached",
            {
              address,
              pageCount,
              itemCount: portfolio.length,
            },
          );
          hasMore = false;
          break;
        }
      }

      if (!hasMore) {
        break;
      }

      if (addedOnPage === 0) {
        stagnantPageCount += 1;
        if (stagnantPageCount >= MAX_HELIUS_PORTFOLIO_STAGNANT_PAGES) {
          console.warn(
            "[wallet-portfolio-fetch] Stagnant pagination detected; stopping fetch",
            {
              address,
              pageCount,
              itemCount: portfolio.length,
            },
          );
          break;
        }
      } else {
        stagnantPageCount = 0;
      }

      const pagination = json.pagination;
      hasMore = Boolean(pagination?.hasMore);
      const currentPageRaw = Number(pagination?.page);
      const nextPage = Number.isFinite(currentPageRaw)
        ? Math.max(page + 1, Math.floor(currentPageRaw) + 1)
        : page + 1;
      page = nextPage;
    } catch (err) {
      console.error("Helius wallet balances request failed", err);
      break;
    }
  }

  return portfolio;
}

export async function fetchHeliusSolanaTransfers(
  address: string,
  from?: number,
  to?: number,
  startCursor?: string,
  endCursor?: string,
): Promise<WalletTransfer[]> {
  const nowMs = Date.now();
  const resolvedToMs = to ?? nowMs;
  const resolvedFromMs = from ?? getUtcStartOfDayMs(resolvedToMs - 30 * DAY_MS);

  const rangeFromMs = Math.min(resolvedFromMs, resolvedToMs);
  const rangeToMs = Math.max(resolvedFromMs, resolvedToMs);

  const paged = await runCursorPagination<WalletTransfer>({
    initialCursor: startCursor,
    maxPages: 50,
    maxItems: Number.MAX_SAFE_INTEGER,
    fetchPage: async (cursor, page) => {
      let json;
      try {
        const endpoint = getEndpoint(`/v1/wallet/${address}/transfers`);
        endpoint.searchParams.set("limit", "100");
        if (cursor) {
          endpoint.searchParams.set("cursor", cursor);
        }

        const response = await pFetch(heliusSpec, "helius.svc.wallet_transfers", endpoint, {
          method: "GET",
          headers: getRequiredHeaders(),
        });

        if (!response.ok) {
          // TODO: Consider more robust error handling
          return {
            pageItems: [],
            nextCursor: null,
            hasMore: false,
          };
        }

        json = await validateApiResult(helius_WalletTransfersSchema, response);
        if (!json) {
          // TODO: Consider more robust error handling
          return {
            pageItems: [],
            nextCursor: null,
            hasMore: false,
          };
        }
      } catch (err) {
        console.error("Helius wallet transfers request failed", err);
        // TODO: Consider more robust error handling
        return {
          pageItems: [],
          nextCursor: null,
          hasMore: false,
        }
      }

      const data = json.data;
      if (data.length == 0) {
        return {
          pageItems: [],
          nextCursor: null,
          hasMore: false,
        };
      }

      const transactions: WalletTransfer[] = [];

      let reachedRangeCutoff = false;
      for (const entry of data) {
        const mapped = mapHeliusTransferEntry(entry, address);
        if (!mapped) {
          continue;
        }

        const tsMs = Date.parse(mapped.timestamp);
        if (!Number.isFinite(tsMs)) {
          continue;
        }

        if (tsMs > rangeToMs) {
          continue;
        }

        if (tsMs < rangeFromMs || mapped.transactionSignature == endCursor) {
          reachedRangeCutoff = true;
          break;
        }

        transactions.push(mapped);
      }

      const nextCursor = getNextCursor(json?.pagination);
      const hasMore = Boolean(json?.pagination?.hasMore && nextCursor);

      return {
        pageItems: transactions,
        nextCursor,
        hasMore,
      };
    },
  });

  return paged.items
}

export async function fetchMoralisSolanaSwap(
  address: string,
  from?: number,
  to?: number,
): Promise<WalletSwap[]> {
  const nowMs = Date.now();
  const resolvedToMs = to ?? nowMs;
  const resolvedFromMs = from ?? getUtcStartOfDayMs(resolvedToMs - 30 * DAY_MS);

  const rangeFromMs = Math.min(resolvedFromMs, resolvedToMs);
  const rangeToMs = Math.max(resolvedFromMs, resolvedToMs);
  const fromDateIso = new Date(rangeFromMs).toISOString();
  const toDateIso = new Date(rangeToMs).toISOString();

  const paged = await runCursorPagination<WalletSwap>({
    initialCursor: null,
    maxPages: 50,
    maxItems: Number.MAX_SAFE_INTEGER,
    fetchPage: async (cursor, page) => {
      const url = moralis.getEndpoint(`/account/mainnet/${address}/swaps`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("fromDate", fromDateIso);
      url.searchParams.set("toDate", toDateIso);

      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      let json: MRL_WalletTokenSwaps;
      try {
        const response = await pFetch(moralis.spec, "moralis.svc.wallet_swaps", url, {
          method: "GET",
          headers: moralis.getRequiredHeaders(),
        });

        if (!response.ok) {
          console.error(
            "Moralis wallet-swaps error",
            response.status,
            response.statusText,
          );
          return {
            pageItems: [],
            nextCursor: null,
            hasMore: false,
          };
        }

        const parsed = await validateApiResult(mrl_WalletTokenSwapsSchema, response);
        if (!parsed) {
          return {
            pageItems: [],
            nextCursor: null,
            hasMore: false,
          };
        }

        json = parsed;
        // console.log(
        //   `[fetchMoralisSolanaSwap] Fetched page ${page} with ${Array.isArray(json?.result) ? json.result.length : 0} swaps, cursor: ${json?.cursor}`,
        //   {
        //     url: url.toString(),
        //     responseStatus: response.status,
        //   },
        // );
      } catch (err) {
        console.error("Moralis wallet-swaps request failed", err);
        return {
          pageItems: [],
          nextCursor: null,
          hasMore: false,
        };
      }

      const rows = Array.isArray(json?.result)
        ? json.result
        : [];

      const pageItems: WalletSwap[] = [];
      let reachedRangeCutoff = false;

      for (const row of rows) {
        const mapped = mapMoralisSwapEntry(row, address);
        if (!mapped) {
          continue;
        }

        const tsMs = Date.parse(mapped.blockTimestampIso);
        if (!Number.isFinite(tsMs)) {
          continue;
        }

        if (tsMs > rangeToMs) {
          continue;
        }

        if (tsMs < rangeFromMs) {
          reachedRangeCutoff = true;
          break;
        }

        pageItems.push(mapped);
      }

      // console.log(
      //   `[fetchMoralisSolanaSwap] Page ${page}: Collected ${pageItems.length} swaps on page`,
      // );

      const nextCursor = json.cursor || null;
      const hasMore = reachedRangeCutoff ? false : Boolean(nextCursor);

      return {
        pageItems,
        nextCursor,
        hasMore,
      };
    },
  });

  return paged.items;
}

export type HeliusHistoryFrom = "24h" | "7d";

export function timePeriodToFromSec(
  timePeriod: "7D" | "30D" | "60D" | "90D" | "1Y" | "All",
): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const daySec = 24 * 60 * 60;
  switch (timePeriod) {
    case "7D":
      return nowSec - 7 * daySec;
    case "30D":
      return nowSec - 30 * daySec;
    case "60D":
      return nowSec - 60 * daySec;
    case "90D":
      return nowSec - 90 * daySec;
    case "1Y":
      return nowSec - 365 * daySec;
    case "All":
      return 0;
  }
}

export async function fetchAllTransactionHistory(
  address: string,
  from: HeliusHistoryFrom | number | HeliusHistoryRange = "7d",
  options?: FetchAllTransactionHistoryOptions,
) {
  const { fromSec, toSec } = resolveHistoryWindow(from);

  const knownSignatures = options?.stopAtKnownSignatures;

  const paged = await runCursorPagination<WalletTransactionHelius>({
    initialCursor: options?.beforeCursor ?? null,
    maxPages: MAX_HELIUS_HISTORY_CHUNK_MAX_PAGES,
    maxItems: MAX_HELIUS_HISTORY_CHUNK_MAX_TRANSACTIONS,
    fetchPage: async (cursor, page) => {
      let json;
      try {
        const endpoint = getEndpoint(`/v1/wallet/${address}/history`);
        endpoint.searchParams.set("tokenAccounts", "balanceChanged");
        endpoint.searchParams.set("limit", String(HELIUS_HISTORY_PAGE_LIMIT));
        if (cursor) {
          endpoint.searchParams.set("before", cursor);
        }

        const response = await pFetch(heliusSpec, "helius.svc.wallet_history", endpoint, {
          method: "GET",
          headers: getRequiredHeaders(),
        });

        if (!response.ok) {
          // TODO: Consider more robust error handling
          return {
            pageItems: [],
            nextCursor: null,
            hasMore: false,
          };
        }

        json = await validateApiResult(helius_WalletHistorySchema, response);
        if (!json) {
          // TODO: Consider more robust error handling
          return {
            pageItems: [],
            nextCursor: null,
            hasMore: false,
          };
        }
      } catch (err) {
        console.error("Helius wallet transaction request failed", err);
        // TODO: Consider more robust error handling
        return {
          pageItems: [],
          nextCursor: null,
          hasMore: false,
        };
      }

      const data = json.data;
      const pageItems: WalletTransactionHelius[] = [];
      let stopByRange = false;
      let stopByKnownSignature = false;

      for (const entry of data) {
        const tsSec =
          typeof entry.timestamp === "number" &&
            Number.isFinite(entry.timestamp)
            ? entry.timestamp
            : null;

        if (tsSec == null) {
          continue;
        }

        if (tsSec > toSec) {
          continue;
        }

        if (tsSec < fromSec) {
          stopByRange = true;
          break;
        }

        const signature = String(entry.signature ?? "").trim();
        if (!signature) {
          continue;
        }

        if (knownSignatures?.has(signature)) {
          stopByKnownSignature = true;
          break;
        }

        const mappedBalanceChanges = entry.balanceChanges
          ? entry.balanceChanges
            .map((change) => ({
              mint: String(change?.mint ?? ""),
              amount: Number(change?.amount ?? 0),
              decimals: Number(change?.decimals ?? 0),
            }))
            .filter(
              (change: { mint: string; amount: number; decimals: number }) =>
                change.mint.length > 0 &&
                Number.isFinite(change.amount) &&
                Number.isFinite(change.decimals),
            )
          : [];

        pageItems.push({
          walletAddress: address,
          signature,
          timestamp: new Date(tsSec * 1000).toISOString(),
          slot: Number(entry.slot ?? 0),
          fee: Number(entry.fee ?? 0),
          feePayer: String(entry.feePayer ?? ""),
          balanceChanges: mappedBalanceChanges,
        });
      }

      console.log(
        `[fetchAllTransactionHistory] Page ${page}: Collected ${pageItems.length} transactions on page`,
      );

      const nextCursor = getNextCursor(json?.pagination);
      const hasMore =
        !stopByRange &&
        !stopByKnownSignature &&
        Boolean(json?.pagination?.hasMore && nextCursor);

      return {
        pageItems,
        nextCursor,
        hasMore,
      };
    },
  });

  return paged.items;
}

export async function fetchBirdeyeNetworthHistory(
  address: string,
  options?: {
    count?: number;
    direction?: BirdeyeNetworthDirection;
    time?: string;
    type?: BirdeyeNetworthType;
    sortType?: BirdeyeSortType;
  },
): Promise<BirdeyeNetworthHistoryResult> {
  const count = Math.min(Math.max(Math.floor(options?.count ?? 7), 1), 30);
  const direction = options?.direction ?? "back";
  const type = options?.type ?? "1d";
  const sortType = options?.sortType ?? "desc";
  const time = normalizeBirdeyeTimeParam(options?.time);

  let json;
  try {
    const endpoint = getBirdeyeEndpoint("/wallet/v2/net-worth");
    endpoint.searchParams.set("wallet", address);
    endpoint.searchParams.set("count", String(count));
    endpoint.searchParams.set("direction", direction);
    endpoint.searchParams.set("type", type);
    endpoint.searchParams.set("sort_type", sortType);
    if (time) {
      endpoint.searchParams.set("time", time);
    }

    const response = await pFetch(birdeyeSpec, "birdeye.svc.wallet_networth_history", endpoint, {
      method: "GET",
      headers: getBirdeyeHeaders(),
    });

    if (!response.ok) {
      // TODO: Consider more robust error handling
      return {
        address,
        currency: "usd",
        currentTimestamp: null,
        pastTimestamp: null,
        history: [],
      };
    }

    json = await validateApiResult(bds_WalletNetworthHistorySchema, response);
    if (!json) {
      // TODO: Consider more robust error handling
      return {
        address,
        currency: "usd",
        currentTimestamp: null,
        pastTimestamp: null,
        history: [],
      };
    }
  } catch (err) {
    console.error("Birdeye net-worth history request failed", err);
    // TODO: Consider more robust error handling
    return {
      address,
      currency: "usd",
      currentTimestamp: null,
      pastTimestamp: null,
      history: [],
    };
  }

  const data = json.data;
  const rows = data.history;
  const currentTimestamp = toIsoTimestamp(data.current_timestamp);
  const pastTimestamp = toIsoTimestamp(data.past_timestamp);

  const history = rows
    .map((row) => ({
      timestamp: toIsoTimestamp(row.timestamp),
      netWorthUsd: toOptionalNumber(row.net_worth),
      netWorthChangeUsd: toOptionalNumber(row.net_worth_change),
      netWorthChangePercent: toOptionalNumber(row.net_worth_change_percent),
    }))
    .filter(
      (row): row is BirdeyeNetworthHistoryPoint =>
        row.timestamp != null && row.netWorthUsd != null,
    );

  if (history.length === 0) {
    const snapshotTimestamp =
      currentTimestamp ??
      toIsoTimestamp(data.requested_timestamp) ??
      toIsoTimestamp(data.resolved_timestamp);
    const snapshotValue = toOptionalNumber(
      data.total_value ?? data.net_worth,
    );

    if (snapshotTimestamp != null && snapshotValue != null) {
      history.push({
        timestamp: snapshotTimestamp,
        netWorthUsd: snapshotValue,
        netWorthChangeUsd: null,
        netWorthChangePercent: null,
      });
    }
  }

  return {
    address: data.wallet_address,
    currency: data.currency,
    currentTimestamp: currentTimestamp,
    pastTimestamp: pastTimestamp,
    history,
  };
}

export async function fetchBirdeyePortfolioSnapshot(
  address: string,
  options?: {
    time?: string;
    type?: BirdeyeNetworthType;
    sortType?: BirdeyeSortType;
    limit?: number;
    offset?: number;
  },
): Promise<BirdeyePortfolioSnapshotResult> {
  const limit = Math.min(Math.max(Math.floor(options?.limit ?? 100), 1), 100);
  const offset = Math.max(Math.floor(options?.offset ?? 0), 0);
  const type = options?.type ?? "1d";
  const sortType = options?.sortType ?? "desc";
  const time = normalizeBirdeyeTimeParam(options?.time);

  let json;
  try {
    const endpoint = getBirdeyeEndpoint("/wallet/v2/net-worth-details");
    endpoint.searchParams.set("wallet", address);
    endpoint.searchParams.set("type", type);
    endpoint.searchParams.set("sort_type", sortType);
    endpoint.searchParams.set("limit", String(limit));
    endpoint.searchParams.set("offset", String(offset));
    if (time) {
      endpoint.searchParams.set("time", time);
    }

    const response = await pFetch(birdeyeSpec, "birdeye.svc.wallet_portfolio", endpoint, {
      method: "GET",
      headers: getBirdeyeHeaders(),
    });

    if (!response.ok) {
      // TODO: Consider more robust error handling
      return {
        address,
        currency: "usd",
        netWorthUsd: 0,
        requestedTimestamp: null,
        resolvedTimestamp: null,
        assets: [],
      };
    }

    json = await validateApiResult(bds_WalletNetAssetsSchema, response);
    if (!json) {
      // TODO: Consider more robust error handling
      return {
        address,
        currency: "usd",
        netWorthUsd: 0,
        requestedTimestamp: null,
        resolvedTimestamp: null,
        assets: [],
      };
    }
  } catch (err) {
    console.error("Birdeye portfolio snapshot request failed", err);
    // TODO: Consider more robust error handling
    return {
      address,
      currency: "usd",
      netWorthUsd: 0,
      requestedTimestamp: null,
      resolvedTimestamp: null,
      assets: [],
    };
  }

  const data = json.data;
  const rows = data.net_assets;

  return {
    address: data.wallet_address,
    currency: data.currency,
    netWorthUsd: toFiniteNumber(data.net_worth, 0),
    requestedTimestamp: toIsoTimestamp(data.requested_timestamp),
    resolvedTimestamp: toIsoTimestamp(data.resolved_timestamp),
    assets: rows.map((asset) => ({
      symbol: asset.symbol,
      tokenAddress: asset.token_address,
      decimals: Math.max(0, Math.floor(toFiniteNumber(asset.decimal, 0))),
      balanceRaw: String(asset.balance),
      priceUsd: toOptionalNumber(asset.price),
      valueUsd: toFiniteNumber(asset.value, 0),
    })),
  };
}

export async function fetchHeliusWalletFirstFund(
  address: string,
): Promise<HeliusWalletFirstFund> {
  const endpoint = getEndpoint(`/v1/wallet/${address}/funded-by`);
  const response = await pFetch(heliusSpec, "helius.svc.wallet_first_fund", endpoint, {
    method: "GET",
    headers: getRequiredHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Helius funded-by request failed: ${response.status}`);
  }

  const json = await validateApiResult(helius_WalletFundedBySchema, response);
  if (!json) {
    throw new Error("Helius funded-by response validation failed");
  }

  return {
    reciepient: address,
    funder: json.funder,
    funderName: json.funderName,
    funderType: json.funderType,
    mint: json.mint,
    symbol: json.symbol,
    amount: json.amount,
    amountRaw: json.amountRaw,
    decimals: json.decimals,
    date: json.date,
    signature: json.signature,
    timestamp: json.timestamp,
    slot: json.slot,
    explorerUrl: json.explorerUrl,
  };
}
