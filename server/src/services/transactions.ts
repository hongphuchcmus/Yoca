import { getTokenMeta } from "@sv/services/tokens/token-info.js";
import {
  bds_PriceAtTimestampSchema,
  helius_EnhancedTransactionsSchema,
  type BDS_PriceAtTimestamp,
} from "@sv/services/_types/token-raw-responses.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import {
    getEndpoint as getBirdeyeEndpoint,
    getRequiredHeaders as getBirdeyeHeaders,
    spec as birdeyeSpec,
} from "@sv/util/util-birdeye.js";
import {
    getRequiredHeaders,
    spec as heliusSpec,
} from "@sv/util/util-helius.js";
import { pFetch } from "@sv/util/rate-limit.js";

export type HeliusEnhancedTokenTransfer = {
  mint?: string;
  tokenAmount?: number;
  amount?: number;
  fromUserAccount?: string;
  toUserAccount?: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  symbol?: string;
  tokenSymbol?: string;
  tokenName?: string;
  valueUsd?: number;
  valueUsdSource?: "historical" | "inferred" | "none";
  fromWallet?: string;
  toWallet?: string;
};

export type HeliusEnhancedNativeTransfer = {
  amount?: number;
  fromUserAccount?: string;
  toUserAccount?: string;
  fromWallet?: string;
  toWallet?: string;
  valueUsd?: number;
  valueUsdSource?: "historical" | "inferred" | "none";
};

export type HeliusEnhancedInnerInstruction = {
  accounts?: string[];
  data?: string;
  programId?: string;
};

export type HeliusEnhancedInstruction = {
  accounts?: string[];
  data?: string;
  programId?: string;
  innerInstructions?: HeliusEnhancedInnerInstruction[];
};

type HeliusSwapTokenAmount = {
  tokenAmount?: string;
  decimals?: number;
};

type HeliusSwapLeg = {
  mint?: string;
  rawTokenAmount?: HeliusSwapTokenAmount;
};

type HeliusSwapEvent = {
  tokenInputs?: HeliusSwapLeg[];
  tokenOutputs?: HeliusSwapLeg[];
  source?: string;
  programId?: string;
  innerSwaps?: Array<{
    tokenInputs?: HeliusSwapLeg[];
    tokenOutputs?: HeliusSwapLeg[];
    source?: string;
    programId?: string;
  }>;
};

export type HeliusEnhancedTransaction = {
  signature: string;
  feePayer?: string;
  fee?: number;
  slot?: number;
  timestamp?: number;
  source?: string;
  type?: string;
  description?: string;
  programName?: string;
  instructions?: HeliusEnhancedInstruction[];
  events?: {
    swap?: HeliusSwapEvent;
  };
  info?: {
    feePayer?: string;
    fee?: number;
    slot?: number;
    timestamp?: number;
  };
  tokenTransfers?: HeliusEnhancedTokenTransfer[];
  nativeTransfers?: HeliusEnhancedNativeTransfer[];
};

const TX_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
const SOL_MINT = "So11111111111111111111111111111111111111112";

const STABLE_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4h4H8o3A8rM6jD5M3j6Q", // USDT (legacy)
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", // USDS
  "2b1kV6DkP7d3xERf9jR7WvyaManEXZDV4SSQSSHqzTe", // PYUSD
]);

function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMint(mint: unknown): string {
  return String(mint ?? "").trim();
}

function normalizeAmount(value: unknown): number {
  const n = toNum(value);
  return n > 0 ? n : 0;
}

function swapLegAmount(leg: HeliusSwapLeg): number {
  const tokenAmount = toNum(leg.rawTokenAmount?.tokenAmount);
  const decimals = toNum(leg.rawTokenAmount?.decimals);
  if (tokenAmount <= 0) return 0;
  if (decimals <= 0) return tokenAmount;
  return tokenAmount / 10 ** decimals;
}

function deriveMintPricesUsd(tx: HeliusEnhancedTransaction): Map<string, number> {
  const prices = new Map<string, number>();
  STABLE_MINTS.forEach((mint) => prices.set(mint, 1));

  const signer = String(tx.feePayer ?? tx.info?.feePayer ?? "").trim();
  const transfers = tx.tokenTransfers ?? [];
  const outflows: Array<{ index: number; mint: string; amount: number; counterparty: string }> = [];
  const inflows: Array<{ index: number; mint: string; amount: number; counterparty: string }> = [];

  for (let i = 0; i < transfers.length; i += 1) {
    const transfer = transfers[i];
    const mint = normalizeMint(transfer.mint);
    const amount = normalizeAmount(transfer.tokenAmount ?? transfer.amount);
    const from = String(transfer.fromUserAccount ?? transfer.fromWallet ?? "").trim();
    const to = String(transfer.toUserAccount ?? transfer.toWallet ?? "").trim();
    if (!mint || amount <= 0 || !signer) continue;

    if (from === signer) {
      outflows.push({ index: i, mint, amount, counterparty: to });
    }
    if (to === signer) {
      inflows.push({ index: i, mint, amount, counterparty: from });
    }
  }

  const usedInflows = new Set<number>();
  const pairs: Array<{ out: (typeof outflows)[number]; in: (typeof inflows)[number] }> = [];
  for (const out of outflows) {
    let best: (typeof inflows)[number] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const inflow of inflows) {
      if (usedInflows.has(inflow.index)) continue;

      const distance = Math.abs(inflow.index - out.index);
      let score = -distance;
      if (inflow.counterparty === out.counterparty) score += 6;
      if (inflow.index >= out.index) score += 1.5;
      if (inflow.mint !== out.mint) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = inflow;
      }
    }

    if (best) {
      usedInflows.add(best.index);
      pairs.push({ out, in: best });
    }
  }

  // Derive prices from direct swap event if one side is stable.
  const swap = tx.events?.swap;
  const swapInputs = swap?.tokenInputs ?? [];
  const swapOutputs = swap?.tokenOutputs ?? [];
  for (const input of swapInputs) {
    for (const output of swapOutputs) {
      const inMint = normalizeMint(input.mint);
      const outMint = normalizeMint(output.mint);
      const inAmount = swapLegAmount(input);
      const outAmount = swapLegAmount(output);
      if (!inMint || !outMint || inAmount <= 0 || outAmount <= 0) continue;

      const inPrice = prices.get(inMint);
      const outPrice = prices.get(outMint);
      if (inPrice !== undefined && outPrice === undefined) {
        prices.set(outMint, (inPrice * inAmount) / outAmount);
      } else if (outPrice !== undefined && inPrice === undefined) {
        prices.set(inMint, (outPrice * outAmount) / inAmount);
      }
    }
  }

  // Iteratively derive unknown prices from inferred signer swaps.
  for (let round = 0; round < 4; round += 1) {
    let updated = false;
    for (const pair of pairs) {
      const outPrice = prices.get(pair.out.mint);
      const inPrice = prices.get(pair.in.mint);

      if (outPrice !== undefined && inPrice === undefined && pair.in.amount > 0) {
        prices.set(pair.in.mint, (outPrice * pair.out.amount) / pair.in.amount);
        updated = true;
      } else if (inPrice !== undefined && outPrice === undefined && pair.out.amount > 0) {
        prices.set(pair.out.mint, (inPrice * pair.in.amount) / pair.out.amount);
        updated = true;
      }
    }
    if (!updated) break;
  }

  return prices;
}

function extractBirdeyePriceValue(
  payload: BDS_PriceAtTimestamp,
): number | undefined {
  const directCandidates = [
    Number(payload.data?.value ?? 0),
    Number(payload.data?.price ?? 0),
  ];
  for (const directValue of directCandidates) {
    if (Number.isFinite(directValue) && directValue > 0) {
      return directValue;
    }
  }

  // Fallback parser for providers that still return item arrays.
  const items = payload.data?.items;
  if (!Array.isArray(items) || items.length == 0) {
    return undefined;
  }

  for (const item of items) {
    const price = Number(item.value ?? item.price ?? 0);
    if (Number.isFinite(price) && price > 0) {
      return price;
    }
  }

  return undefined;
}

async function fetchBirdeyePriceAtTimestampUsd(
  mint: string,
  timestampSec: number,
): Promise<number | undefined> {
  if (!process.env.BIRDEYE_API_KEY || !process.env.BIRDEYE_API_BASE_URL) {
    return undefined;
  }

  try {
    const endpoint = getBirdeyeEndpoint("/defi/price");
    endpoint.searchParams.set("address", mint);
    endpoint.searchParams.set("address_type", "token");
    endpoint.searchParams.set("time", String(timestampSec));

    const response = await pFetch(birdeyeSpec, "birdeye.svc.token_price_at_time", endpoint, {
      method: "GET",
      headers: getBirdeyeHeaders(),
    });

    if (!response.ok) {
      // TODO: Consider more robust error handling
      return undefined;
    }

    const payload = await validateApiResult(bds_PriceAtTimestampSchema, response);
    if (!payload) {
      // TODO: Consider more robust error handling
      return undefined;
    }

    return extractBirdeyePriceValue(payload);
  } catch {
    // TODO: Consider more robust error handling
    return undefined;
  }
}

async function getHistoricalMintPricesUsd(
  mints: string[],
  timestampSec: number,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const uniqueMints = Array.from(new Set(mints.filter(Boolean)));

  await Promise.all(
    uniqueMints.map(async (mint) => {
      const p = await fetchBirdeyePriceAtTimestampUsd(mint, timestampSec);
      if (p !== undefined && Number.isFinite(p) && p > 0) {
        prices.set(mint, p);
      }
    }),
  );

  return prices;
}

async function normalizeTransfers(tx: HeliusEnhancedTransaction): Promise<HeliusEnhancedTransaction> {
  const inferredMintPricesUsd = deriveMintPricesUsd(tx);
  const timestampSec = toNum(tx.timestamp ?? tx.info?.timestamp);

  const tokenMints = (tx.tokenTransfers ?? [])
    .map((t) => normalizeMint(t.mint))
    .filter(Boolean);

  const tokenMetaRows = await getTokenMeta(Array.from(new Set(tokenMints)));
  const mintToSymbol = new Map<string, string>();
  for (const row of tokenMetaRows) {
    const address = normalizeMint(row.address);
    const symbol = String(row.symbol ?? "").trim();
    if (address && symbol) {
      mintToSymbol.set(address, symbol.toUpperCase());
    }
  }

  const historicalMintPricesUsd =
    timestampSec > 0
      ? await getHistoricalMintPricesUsd([...tokenMints, SOL_MINT], timestampSec)
      : new Map<string, number>();

  const resolvedPrice = (
    mint: string,
  ): { price?: number; source: "historical" | "inferred" | "none" } => {
    const historical = historicalMintPricesUsd.get(mint);
    if (historical !== undefined) {
      return { price: historical, source: "historical" };
    }

    const inferred = inferredMintPricesUsd.get(mint);
    if (inferred !== undefined) {
      return { price: inferred, source: "inferred" };
    }

    return { source: "none" };
  };

  const tokenTransfers = (tx.tokenTransfers ?? []).map((transfer) => {
    const mint = normalizeMint(transfer.mint);
    const amount = normalizeAmount(transfer.tokenAmount ?? transfer.amount);
    const resolved = mint ? resolvedPrice(mint) : { source: "none" as const };
    const unitPrice = resolved.price;
    const valueUsd = unitPrice !== undefined ? amount * unitPrice : 0;
    const existingSymbol = String(
      transfer.symbol ?? transfer.tokenSymbol ?? "",
    ).trim();
    const fallbackSymbol = mintToSymbol.get(mint) ?? mint;
    const resolvedSymbol = existingSymbol || fallbackSymbol;

    return {
      ...transfer,
      amount,
      symbol: resolvedSymbol || undefined,
      tokenSymbol: resolvedSymbol || undefined,
      fromWallet: transfer.fromUserAccount,
      toWallet: transfer.toUserAccount,
      valueUsd,
      valueUsdSource: resolved.source,
    };
  });

  const solResolved = resolvedPrice(SOL_MINT);
  const solPriceUsd = solResolved.price ?? 0;

  const nativeTransfers = (tx.nativeTransfers ?? []).map((transfer) => {
    const lamports = toNum(transfer.amount);
    const solAmount = lamports / 1e9;
    return {
      ...transfer,
      fromWallet: transfer.fromWallet ?? transfer.fromUserAccount,
      toWallet: transfer.toWallet ?? transfer.toUserAccount,
      valueUsd: solAmount * solPriceUsd,
      valueUsdSource: solResolved.source,
    };
  });

  return {
    ...tx,
    info: {
      feePayer: tx.feePayer,
      fee: tx.fee,
      slot: tx.slot,
      timestamp: tx.timestamp,
    },
    tokenTransfers,
    nativeTransfers,
  };
}

async function fetchEnhancedTransactionRaw(signature: string): Promise<HeliusEnhancedTransaction | null> {
  if (!process.env.HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY is not set");
  }

  const endpoint = new URL(
    `https://api.helius.xyz/v0/transactions/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`,
  );

  const makeRequest = (body: unknown) =>
    pFetch(heliusSpec, "helius.svc.enhanced_transactions", endpoint, {
      method: "POST",
      headers: getRequiredHeaders(),
      body: JSON.stringify(body),
    });

  let response = await makeRequest({ transactions: [signature] });

  // Some Helius plans/versions accept a plain string array request body.
  if (response.status == 400) {
    response = await makeRequest([signature]);
  }

  if (!response.ok) {
    if (response.status == 404) {
      return null;
    }

    const errText = await response.text();
    throw new Error(
      `Helius enhanced tx request failed (${response.status}): ${errText.slice(0, 200)}`,
    );
  }

  const payload = await validateApiResult(helius_EnhancedTransactionsSchema, response);
  const firstTransaction = payload?.[0];
  if (!firstTransaction) {
    return null;
  }

  return firstTransaction;
}

export async function getTransactionBySignature(signature: string): Promise<HeliusEnhancedTransaction | null> {
  const normalizedSignature = signature.trim();

  if (!TX_SIGNATURE_REGEX.test(normalizedSignature)) {
    return null;
  }

  const tx = await fetchEnhancedTransactionRaw(normalizedSignature);
  if (!tx) {
    return null;
  }

  return await normalizeTransfers(tx);
}
