/**
 * Live SOL/USD spot price.
 *
 * Used by the Solana payment flow when SOLANA_LIVE_PRICING_ENABLED=true, so a
 * tier priced in USD can be charged as the equivalent amount of SOL.
 *
 * Source: Birdeye /defi/price (same endpoint transactions.ts uses for historical
 * prices, minus the `time` param). Birdeye quotes in USD; USDC is treated as
 * 1:1 with USD, so this doubles as the SOL/USDC rate.
 */

import { validateApiResult } from "@sv/middlewares/validation.js";
import { SOL_MINT } from "@sv/services/wallet/wallet.constants.js";
import { pFetch } from "@sv/util/rate-limit.js";
import {
  getEndpoint as getBirdeyeEndpoint,
  getRequiredHeaders as getBirdeyeHeaders,
  spec as birdeyeSpec,
} from "@sv/util/util-birdeye.js";
import z from "zod";

/**
 * Only the field we need. Deliberately NOT the shared bds_PriceAtTimestampSchema:
 * that one is a strictObject, and the spot endpoint returns extra fields
 * (isScaledUiToken, priceInNative) that make a strict parse fail.
 */
const solSpotPriceSchema = z.object({
  data: z.object({ value: z.number() }).optional(),
});

/**
 * Cache TTL. Quote and verification both read through this cache, so a payment
 * that completes within the window is checked against the exact price the user
 * was quoted. The tolerance in solana-payment.service.ts covers the rest.
 */
const PRICE_TTL_MS = 5 * 60 * 1000;

let cached: { priceUsd: number; fetchedAt: number } | null = null;

/**
 * Current SOL price in USD.
 *
 * Throws when the price cannot be resolved. Callers must NOT fall back to a
 * placeholder: silently charging a stale or default rate is a money bug.
 */
export async function getSolPriceUsd(): Promise<number> {
  if (cached && Date.now() - cached.fetchedAt < PRICE_TTL_MS) {
    return cached.priceUsd;
  }

  const endpoint = getBirdeyeEndpoint("/defi/price");
  endpoint.searchParams.set("address", SOL_MINT);
  endpoint.searchParams.set("address_type", "token");

  const response = await pFetch(birdeyeSpec, "birdeye.svc.sol_spot_price", endpoint, {
    method: "GET",
    headers: getBirdeyeHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Birdeye price request failed with HTTP ${response.status}`);
  }

  const payload = await validateApiResult(solSpotPriceSchema, response);
  const priceUsd = Number(payload?.data?.value ?? 0);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error("Birdeye returned no usable SOL price");
  }

  cached = { priceUsd, fetchedAt: Date.now() };
  return priceUsd;
}

/** Test helper — drops the memoized price so each case starts clean. */
export function resetSolPriceCache(): void {
  cached = null;
}
