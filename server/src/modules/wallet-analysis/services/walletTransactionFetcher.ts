import { validateApiResult } from "../../../middlewares/validation.js";
import { helius_EnhancedTransactionsSchema } from "../../../services/_types/token-raw-responses.js";
import {
    getEndpoint,
    getRequiredHeaders,
    spec as heliusSpec,
} from "../../../util/util-helius.js";
import { pFetch } from "../../../util/rate-limit.js";
import type { HeliusEnhancedTransactionLike } from "../types/normalizedWalletEvent.js";

const HELIUS_PAGE_SIZE = 100;

function normalizeLimit(limit: number): number {
    return Math.min(Math.max(Math.floor(limit), 1), 300);
}

function normalizePageSize(limit: number): number {
    return Math.min(limit, HELIUS_PAGE_SIZE);
}

export async function fetchWalletTransactions(params: {
    walletAddress: string;
    limit: number;
}): Promise<HeliusEnhancedTransactionLike[]> {
    const targetLimit = normalizeLimit(params.limit);
    const pageSize = normalizePageSize(targetLimit);

    const collected: HeliusEnhancedTransactionLike[] = [];
    let before: string | undefined;

    while (collected.length < targetLimit) {
        const endpoint = getEndpoint(`/v0/addresses/${params.walletAddress}/transactions`);
        endpoint.searchParams.set("limit", String(pageSize));
        if (before) {
            endpoint.searchParams.set("before", before);
        }

        const response = await pFetch(heliusSpec, "helius.svc.wallet_transactions", endpoint, {
            method: "GET",
            headers: getRequiredHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Helius address transactions request failed: ${response.status}`);
        }

        const page = await validateApiResult(helius_EnhancedTransactionsSchema, response);
        if (!page) {
            // TODO: Consider more robust error handling
            break;
        }

        if (page.length == 0) {
            break;
        }

        collected.push(...page);
        if (page.length < pageSize) {
            break;
        }

        before = page[page.length - 1]?.signature;
        if (!before) {
            break;
        }
    }

    return collected.slice(0, targetLimit);
}
