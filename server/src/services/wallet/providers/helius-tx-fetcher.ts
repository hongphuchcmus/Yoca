import type { HeliusEnhancedTransaction } from "@sv/services/transactions.js";
import { runCursorPagination } from "@sv/services/wallet/fetchers/walletPagination.js";
import { TRANSACTION_FETCH_MAX_ITEM_COUNT, TRANSACTION_FETCH_MAX_PAGE_COUNT } from "@sv/config/constants.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { helius_EnhancedTransactionsSchema } from "@sv/services/_types/token-raw-responses.js";
import {
  getEndpoint,
  getRequiredHeaders,
  spec as heliusSpec,
} from "@sv/util/util-helius.js";
import { pFetch } from "@sv/util/rate-limit.js";

export type HeliusTxFetcherResult = {
  transactions: HeliusEnhancedTransaction[];
  cursor: string | null;
  hasMore: boolean;
  pagesFetched: number;
};

export async function fetchHeliusAddressTransactions(
  address: string,
  options?: {
    limit?: number;
    before?: string;
    fromMs?: number;
    toMs?: number;
  },
): Promise<HeliusTxFetcherResult> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100);
  const rangeToMs = options?.toMs ?? Date.now();
  const rangeFromMs = options?.fromMs ?? 0;

  const paged = await runCursorPagination<HeliusEnhancedTransaction>({
    initialCursor: options?.before ?? null,
    maxPages: TRANSACTION_FETCH_MAX_PAGE_COUNT,
    maxItems: TRANSACTION_FETCH_MAX_ITEM_COUNT,
    fetchPage: async (cursor) => {
      let data: HeliusEnhancedTransaction[];
      try {
        const endpoint = getEndpoint(`/v0/addresses/${address}/transactions`);
        endpoint.searchParams.set("limit", String(limit));
        if (cursor) {
          endpoint.searchParams.set("before", cursor);
        }

        const response = await pFetch(heliusSpec, "helius.svc.wallet_transactions", endpoint, {
          method: "GET",
          headers: getRequiredHeaders(),
        });

        if (!response.ok) {
          // TODO: Consider more robust error handling
          return { pageItems: [], nextCursor: null, hasMore: false };
        }

        const payload = await validateApiResult(helius_EnhancedTransactionsSchema, response);
        if (!payload) {
          // TODO: Consider more robust error handling
          return { pageItems: [], nextCursor: null, hasMore: false };
        }

        data = payload;
      } catch (err) {
        console.error("Helius address transactions request failed", err);
        // TODO: Consider more robust error handling
        return { pageItems: [], nextCursor: null, hasMore: false };
      }

      if (data.length == 0) {
        return { pageItems: [], nextCursor: null, hasMore: false };
      }

      const pageItems: HeliusEnhancedTransaction[] = [];
      let reachedLowerBound = false;

      for (const tx of data) {
        const tsSec = Number(tx.timestamp ?? tx.info?.timestamp ?? 0);
        if (!tsSec) continue;

        const tsMs = tsSec * 1000;
        if (tsMs > rangeToMs) continue;
        if (tsMs < rangeFromMs) {
          reachedLowerBound = true;
          break;
        }

        pageItems.push(tx);
      }

      const lastTx = data[data.length - 1];
      const nextCursor =
        lastTx?.signature && !reachedLowerBound ? lastTx.signature : null;
      const hasMore = !reachedLowerBound && data.length >= limit;

      return { pageItems, nextCursor, hasMore };
    },
  });

  return {
    transactions: paged.items,
    cursor: paged.cursor,
    hasMore: paged.hasMore,
    pagesFetched: paged.pagesFetched,
  };
}
