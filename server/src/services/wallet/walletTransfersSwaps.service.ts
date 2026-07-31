import type {
  WalletTransfersResponse,
  WalletSwapsResponse,
  WalletSwap,
  WalletTransfer,
} from "@sv/services/wallet/dtos/walletDataObjects.js";
import { toWalletPageInfo } from "@sv/services/wallet/walletData.core.js";
import { resolveRequestedRange } from "@sv/services/wallet/walletRange.utils.js";
import * as mobula from "@sv/util/util-mobula";
import { pFetch } from "@sv/util/rate-limit";
import { validateApiResult } from "@sv/middlewares/validation";
import { dataUsage } from "@sv/middlewares/request-context.js";
import {
  excluded,
  excludedAutoFromInsert,
  excludedAutoNonNullFromInsert,
} from "@sv/util/orm-sql.js";
import {
  mbl_WalletActivitySchema,
  type MBL_WalletActivity,
} from "../_types/wallet-raw-responses";
import {
  tokenMeta,
  TokenMetaInsert,
  walletTransferHistory,
  walletTransferHistoryMeta,
  walletSwapHistory,
  walletSwapHistoryMeta,
} from "@sv/db/schema";
import dayjs from "dayjs";
import { z } from "zod";
import { db } from "@sv/db";
import {
  WSOL_MINT,
  WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
  WALLET_SWAP_HISTORY_LATEST_TOLERANCE_MS,
  WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
  WALLET_TRANSFER_HISTORY_LATEST_TOLERANCE_MS,
  MONTH_MS,
  MOBULA_WALLET_ACTIVITY_MAX_PAGES,
  MOBULA_WALLET_ACTIVITY_PAGE_SIZE,
  MOBULA_WALLET_ACTIVITY_BACKWARD_OVERLAP_MS,
  MOUBAL_SOL_CONTRACT,
} from "@sv/config/constants";
import { isBaseAsset } from "./walletDayActivity.service.js";
import { singleFlight } from "@sv/services/util/single-flight.js";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";

type MBL_WalletActivityTransaction = MBL_WalletActivity["data"][number];
type MBL_WalletActivityAction =
  MBL_WalletActivityTransaction["actions"][number];
type MBL_WalletActivityAsset = Extract<
  MBL_WalletActivityAction,
  { model: "swap" }
>["swapAssetIn"];

type WalletTransferHistoryInsert = typeof walletTransferHistory.$inferInsert;
type WalletSwapHistoryInsert = typeof walletSwapHistory.$inferInsert;
type WalletTransferHistoryMetaInsert =
  typeof walletTransferHistoryMeta.$inferInsert;
type WalletSwapHistoryMetaInsert = typeof walletSwapHistoryMeta.$inferInsert;

type WalletActivityTarget = "swap" | "transfer";

const mbl_fetchWalletActivityPage = singleFlight(async ({
  address,
  fromMs,
  toMs,
  offset,
}: {
  address: string;
  fromMs: number;
  toMs: number;
  offset: number;
}) => {
  const endpoint = mobula.getEndpoint("/2/wallet/activity");
  endpoint.search = new URLSearchParams({
    wallet: address,
    chainIds: "solana:solana",
    from: String(fromMs),
    to: String(toMs),
    offset: String(offset),
    limit: String(MOBULA_WALLET_ACTIVITY_PAGE_SIZE),
    order: "desc",
    filterSpam: "true",
    unlistedAssets: "false",
  }).toString();

  const response = await pFetch(mobula.spec, "mobula.svc.wallet_activity", endpoint, {
    method: "GET",
    headers: mobula.getRequiredHeaders(),
  });
  const result = await validateApiResult(mbl_WalletActivitySchema, response);
  if (!result) {
    return null;
  }

  const extracted = mbl_extractActivity(address, result.data);
  await mbl_writeActivityHistory(extracted);
  return { result, extracted };
}).by(({ address, fromMs, toMs, offset }) =>
  `${address}:${fromMs}:${toMs}:${offset}`
);

async function upsertWalletSwapHistoryMeta(
  value: WalletSwapHistoryMetaInsert,
) {
  await db
    .insert(walletSwapHistoryMeta)
    .values(value)
    .onConflictDoUpdate({
      target: [
        walletSwapHistoryMeta.address,
        walletSwapHistoryMeta.toInclusiveMs,
      ],
      set: {
        fromExclusiveMs: sql`LEAST(${walletSwapHistoryMeta.fromExclusiveMs}, ${excluded(
          walletSwapHistoryMeta.fromExclusiveMs,
        )})`,
        fetchedAtMs: excluded(walletSwapHistoryMeta.fetchedAtMs),
      },
    });
}

async function upsertWalletTransferHistoryMeta(
  value: WalletTransferHistoryMetaInsert,
) {
  await db
    .insert(walletTransferHistoryMeta)
    .values(value)
    .onConflictDoUpdate({
      target: [
        walletTransferHistoryMeta.address,
        walletTransferHistoryMeta.toInclusiveMs,
      ],
      set: {
        fromExclusiveMs: sql`LEAST(${walletTransferHistoryMeta.fromExclusiveMs}, ${excluded(
          walletTransferHistoryMeta.fromExclusiveMs,
        )})`,
        fetchedAtMs: excluded(walletTransferHistoryMeta.fetchedAtMs),
      },
    });
}
type WalletHistorySortDirection = "asc" | "desc";

export type WalletSwapHistoryFilters = {
  search?: string;
  boughtTokenAddress?: string;
  soldTokenAddress?: string;
  sortBy?: "time" | "value";
  sortDirection?: WalletHistorySortDirection;
};

export type WalletTransferHistoryFilters = {
  search?: string;
  direction?: "send" | "receive";
  counterpartyAddress?: string;
  minTokenAmount?: number;
  maxTokenAmount?: number;
  sortBy?: "time" | "value";
  sortDirection?: WalletHistorySortDirection;
};

function normalizeTxLimit(reqLimit: number, maxLimit: number): number {
  if (!Number.isFinite(reqLimit)) return maxLimit;
  return Math.min(Math.max(Math.trunc(reqLimit), 1), maxLimit);
}

function normalizeMinValueUsd(minValueUsd?: number): number | null {
  if (minValueUsd == null) return null;
  if (!Number.isFinite(minValueUsd)) return null;
  return Math.max(0, minValueUsd);
}

function normalizeMaxValueUsd(maxValueUsd?: number): number | null {
  if (maxValueUsd == null) return null;
  if (!Number.isFinite(maxValueUsd)) return null;
  return Math.max(0, maxValueUsd);
}

function normalizeHistoryTokenAddress(
  tokenAddress?: string | null,
): string | null {
  if (tokenAddress == null) return null;
  const normalized = tokenAddress.trim();
  if (!normalized) return null;
  return normalized;
}

function matchesValueUsd(
  valueUsd: number | null,
  minValueUsd: number | null,
  maxValueUsd: number | null,
): boolean {
  if (minValueUsd == null && maxValueUsd == null) return true;
  if (valueUsd == null) return false;
  if (minValueUsd != null && valueUsd < minValueUsd) return false;
  if (maxValueUsd != null && valueUsd > maxValueUsd) return false;
  return true;
}

function swapMatchesToken(
  swap: WalletSwapV2,
  tokenAddress: string | null,
): boolean {
  if (tokenAddress == null) return true;
  return (
    swap.bought.address == tokenAddress || swap.sold.address == tokenAddress
  );
}

function transferMatchesToken(
  transfer: WalletTransferV2,
  tokenAddress: string | null,
): boolean {
  if (tokenAddress == null) return true;
  return transfer.token.address == tokenAddress;
}

function normalizeSearchQuery(search?: string): string | null {
  const normalized = search?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function textMatchesSearch(search: string | null, values: Array<string | null | undefined>): boolean {
  if (search == null) return true;
  return values.some((value) => value?.toLowerCase().includes(search));
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  return left - right;
}

function filterSortSwapEntries(
  entries: WalletTransaction<WalletSwapV2>[],
  filters?: WalletSwapHistoryFilters,
): WalletTransaction<WalletSwapV2>[] {
  const search = normalizeSearchQuery(filters?.search);
  const filtered = entries.filter((entry) => {
    const swap = entry.transaction;
    if (filters?.boughtTokenAddress && swap.bought.address != filters.boughtTokenAddress) return false;
    if (filters?.soldTokenAddress && swap.sold.address != filters.soldTokenAddress) return false;
    return textMatchesSearch(search, [
      swap.transactionHash,
      swap.bought.address,
      swap.bought.symbol,
      swap.bought.name,
      swap.sold.address,
      swap.sold.symbol,
      swap.sold.name,
    ]);
  });

  if (!filters?.sortBy || filters.sortBy == "time") return filtered;
  const direction = filters.sortDirection == "asc" ? 1 : -1;
  return [...filtered].sort(
    (left, right) => compareNullableNumbers(left.transaction.totalValueUsd, right.transaction.totalValueUsd) * direction,
  );
}

function filterSortTransferEntries(
  entries: WalletTransaction<WalletTransferV2>[],
  filters?: WalletTransferHistoryFilters,
): WalletTransaction<WalletTransferV2>[] {
  const search = normalizeSearchQuery(filters?.search);
  const filtered = entries.filter((entry) => {
    const transfer = entry.transaction;
    if (filters?.direction && transfer.direction != filters.direction) return false;
    if (filters?.counterpartyAddress && transfer.counterpartyAddress != filters.counterpartyAddress) return false;
    if (filters?.minTokenAmount != null && transfer.token.amount < filters.minTokenAmount) return false;
    if (filters?.maxTokenAmount != null && transfer.token.amount > filters.maxTokenAmount) return false;
    return textMatchesSearch(search, [
      transfer.transactionHash,
      transfer.counterpartyAddress,
      transfer.token.address,
      transfer.token.symbol,
      transfer.token.name,
    ]);
  });

  if (!filters?.sortBy || filters.sortBy == "time") return filtered;
  const direction = filters.sortDirection == "asc" ? 1 : -1;
  return [...filtered].sort(
    (left, right) => (left.transaction.valueUsd - right.transaction.valueUsd) * direction,
  );
}
export type WalletHistoryCursor = {
  version: 1;
  fromExclusiveMs: number;
  blockTimestampMs: number;
  transactionHash: string;
  actId: string;
};

type WalletTransaction<T> = {
  transaction: T;
  blockTimestampMs: number;
  transactionHash: string;
  actId: string;
};

export type WalletTransactionHistory<T> = {
  transactions: T[];
  cursor: string | null;
};

export function mapSwapToTokenTradeRow(
  swap: WalletSwap,
  walletAddress: string,
  tokenAddress: string,
) {
  const normalizedToken = tokenAddress.trim().toLowerCase();
  const boughtAddress = swap.bought.address.trim().toLowerCase();

  const inferredAction: "buy" | "sell" =
    boughtAddress == normalizedToken ? "buy" : "sell";

  const selectedAmount =
    inferredAction == "buy" ? swap.bought.amount : swap.sold.amount;
  const selectedTokenAddress =
    inferredAction == "buy" ? swap.bought.address : swap.sold.address;
  const otherTokenAddress =
    inferredAction == "buy" ? swap.sold.address : swap.bought.address;
  const selectedPrice =
    inferredAction == "buy" ? swap.bought.priceUsd : swap.sold.priceUsd;
  const otherPrice =
    inferredAction == "buy" ? swap.sold.priceUsd : swap.bought.priceUsd;

  return {
    address: walletAddress,
    tokenAddress,
    transactionHash: swap.transactionHash,
    blockUnixTimeMs: dayjs.utc(swap.blockTimestampIso).valueOf(),
    baseTokenAddress: selectedTokenAddress,
    quoteTokenAddress: otherTokenAddress,
    baseAmount: selectedAmount,
    quoteAmount: selectedAmount,
    basePrice: selectedPrice,
    quotePrice: otherPrice,
    volumeUsd: swap.totalValueUsd ?? 0,
    poolAddress: swap.pairAddress,
    poolName: null,
    tradeAction: inferredAction,
  };
}

const walletHistoryCursorPartsSchema = z
  .tuple([
    z.literal("1"),
    z.coerce.number<string>().int().min(0),
    z.coerce.number<string>().int().min(0),
    z.string().min(1),
    z.string().min(1),
  ])
  .refine(
    (cursor) => cursor[1] < cursor[2],
    "Cursor row must be inside its history range",
  );

export const walletHistoryCursorQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(2048);

export function parseWalletHistoryCursorQuery(
  rawCursor?: string,
):
  | { success: true; data: WalletHistoryCursor | undefined }
  | { success: false; error: z.ZodError } {
  if (rawCursor == null) return { success: true, data: undefined };
  const parsed = walletHistoryCursorPartsSchema.safeParse(rawCursor.split(","));
  if (!parsed.success) return { success: false, error: parsed.error };
  const cursor = parsed.data;

  return {
    success: true,
    data: {
      version: 1,
      fromExclusiveMs: cursor[1],
      blockTimestampMs: cursor[2],
      transactionHash: cursor[3],
      actId: cursor[4],
    },
  };
}

function postProcessWalletTxHistory<T>(data: {
  entries: WalletTransaction<T>[];
  limit: number;
  fromExclusiveMs: number;
  hasUnresolvedRange: boolean;
}): WalletTransactionHistory<T> {
  dataUsage.record("db_result");
  const pageEntries = data.entries.slice(0, data.limit);
  const lastEntry = pageEntries[pageEntries.length - 1];
  const hasMore = data.entries.length > data.limit || data.hasUnresolvedRange;

  return {
    transactions: pageEntries.map((entry) => entry.transaction),
    cursor:
      hasMore && lastEntry
        ? [
            1,
            data.fromExclusiveMs,
            lastEntry.blockTimestampMs,
            lastEntry.transactionHash,
            lastEntry.actId,
          ].join(",")
        : null,
  };
}

export async function getWalletTransfers(
  address: string,
  from?: number,
  to?: number,
  tokenAddress?: string,
  direction?: "in" | "out",
  minAmountUsd?: number,
  maxAmountUsd?: number,
  limit: number = WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
): Promise<WalletTransfersResponse> {
  const requestedRange = resolveRequestedRange(from, to);
  if (limit < 1) limit = WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT;

  const accumulated: WalletTransfer[] = [];
  let historyCursor: string | null = null;

  while (accumulated.length < limit) {
    const parsedCursor = parseWalletHistoryCursorQuery(
      historyCursor ?? undefined,
    );
    if (!parsedCursor.success) {
      throw new Error("Invalid wallet transfer history cursor");
    }
    const history = await getWalletTransferHistory(
      address,
      requestedRange.fromMs,
      requestedRange.toMs,
      WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
      parsedCursor.data,
      minAmountUsd,
      maxAmountUsd,
      tokenAddress,
    );
    if (history == null) {
      if (accumulated.length == 0) {
        throw new Error(`Failed to get wallet transfer history for ${address}`);
      }
      break;
    }

    historyCursor = history.cursor;

    const pageTransfers = history.transactions
      .filter((transfer) => {
        if (direction == "in" && transfer.direction != "receive") return false;
        if (direction == "out" && transfer.direction != "send") return false;
        return true;
      })
      .map(
        (transfer): WalletTransfer => ({
          from:
            transfer.direction == "send"
              ? address
              : transfer.counterpartyAddress,
          to:
            transfer.direction == "receive"
              ? address
              : transfer.counterpartyAddress,
          amount: transfer.token.amount,
          amountUsd: transfer.valueUsd,
          timestamp: dayjs.utc(transfer.blockTimestampMs).toISOString(),
          tokenAddress: transfer.token.address,
          tokenSymbol: transfer.token.symbol ?? "",
          tokenName: transfer.token.name ?? undefined,
          tokenLogoUri: transfer.token.logoUri ?? undefined,
          priceUsd: transfer.token.priceUsd ?? undefined,
          transactionSignature: transfer.transactionHash,
          instructionIndex: 0,
        }),
      );

    for (const tr of pageTransfers) {
      accumulated.push(tr);
      if (accumulated.length >= limit) break;
    }

    if (accumulated.length >= limit || history.cursor == null) break;
  }

  return {
    address,
    transfers: accumulated.slice(0, limit),
    pageInfo: toWalletPageInfo({
      hasMore: accumulated.length >= limit && historyCursor != null,
      nextCursor: historyCursor,
      source: "cache",
    }),
  };
}

export async function getWalletSwaps(
  address: string,
  from?: number,
  to?: number,
  tokenAddress?: string,
  type?: "buy" | "sell",
  minAmountUsd?: number,
  maxAmountUsd?: number,
  limit: number = WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
): Promise<WalletSwapsResponse> {
  const requestedRange = resolveRequestedRange(from, to);
  if (limit < 1) limit = WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT;

  const accumulated: WalletSwap[] = [];
  let historyCursor: string | null = null;

  while (accumulated.length < limit) {
    const parsedCursor = parseWalletHistoryCursorQuery(
      historyCursor ?? undefined,
    );
    if (!parsedCursor.success) {
      throw new Error("Invalid wallet swap history cursor");
    }
    const history = await getWalletSwapHistory(
      address,
      requestedRange.fromMs,
      requestedRange.toMs,
      WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
      parsedCursor.data,
      minAmountUsd,
      maxAmountUsd,
      tokenAddress,
    );
    if (history == null) {
      if (accumulated.length == 0) {
        throw new Error(`Failed to get wallet swap history for ${address}`);
      }
      break;
    }

    historyCursor = history.cursor;

    const pageSwaps = history.transactions
      .map((swap): WalletSwap => {
        const boughtLabel =
          swap.bought.symbol ?? swap.bought.name ?? swap.bought.address;
        const soldLabel =
          swap.sold.symbol ?? swap.sold.name ?? swap.sold.address;

        return {
          transactionHash: swap.transactionHash,
          transactionType: "trade",
          blockTimestampIso: dayjs.utc(swap.blockTimestampMs).toISOString(),
          subcategory: null,
          walletAddress: address,
          pairAddress: "",
          tokensInvolved: `${boughtLabel}/${soldLabel}`,
          bought: {
            ...swap.bought,
            priceUsd: swap.bought.priceUsd ?? 0,
            valueUsd:
              swap.bought.priceUsd == null
                ? 0
                : swap.bought.amount * swap.bought.priceUsd,
          },
          sold: {
            ...swap.sold,
            priceUsd: swap.sold.priceUsd ?? 0,
            valueUsd:
              swap.sold.priceUsd == null
                ? 0
                : swap.sold.amount * swap.sold.priceUsd,
          },
          totalValueUsd: swap.totalValueUsd,
          baseQuotePrice: null,
        };
      });

    for (const swap of pageSwaps) {
      if (type) {
        const boughtAddr = swap.bought.address;
        const soldAddr = swap.sold.address;
        const isBuy = !isBaseAsset(boughtAddr) && isBaseAsset(soldAddr);
        const isSell = isBaseAsset(boughtAddr) && !isBaseAsset(soldAddr);
        if (type == "buy" && !isBuy) continue;
        if (type == "sell" && !isSell) continue;
      }
      accumulated.push(swap);
      if (accumulated.length >= limit) break;
    }

    if (accumulated.length >= limit || history.cursor == null) break;
  }

  return {
    address,
    swaps: accumulated.slice(0, limit),
    pageInfo: toWalletPageInfo({
      hasMore: accumulated.length >= limit && historyCursor != null,
      nextCursor: historyCursor,
      source: "cache",
    }),
  };
}

export type WalletTransferToken = {
  address: string;
  amount: number;
  symbol: string | null;
  name: string | null;
  logoUri: string | null;
  priceUsd: number | null;
};

export interface WalletSwapV2 {
  transactionHash: string;
  actId: string;
  blockTimestampMs: number;
  bought: WalletTransferToken;
  sold: WalletTransferToken;
  totalValueUsd: number | null;
}

export interface WalletTransferV2 {
  transactionHash: string;
  actId: string;
  blockTimestampMs: number;
  token: WalletTransferToken;
  direction: "send" | "receive";
  counterpartyAddress: string;
  valueUsd: number;
}

type WalletActivityFetchResult = {
  swaps: WalletSwapV2[];
  transfers: WalletTransferV2[];
  coveredFromExclusiveMs: number;
  coveredToInclusiveMs: number;
  cutOffByLimit: boolean;
};

async function upsertWalletActivityHistoryMeta(
  address: string,
  result: WalletActivityFetchResult,
): Promise<void> {
  const fetchedAtMs = dayjs.utc().valueOf();
  const value = {
    address,
    fromExclusiveMs: result.coveredFromExclusiveMs,
    toInclusiveMs: result.coveredToInclusiveMs,
    fetchedAtMs,
  };
  await upsertWalletSwapHistoryMeta(value);
  await upsertWalletTransferHistoryMeta(value);
}

function mbl_getActionId(actionIndex: number): string {
  return String(actionIndex).padStart(6, "0");
}

function mbl_getAssetAddress(asset: MBL_WalletActivityAsset): string {
  const normalizedContract = asset.contract.trim();
  if (normalizedContract.toLowerCase() == MOUBAL_SOL_CONTRACT) {
    return WSOL_MINT;
  }
  return normalizedContract;
}

function mbl_toTokenMetaInsert(
  asset: MBL_WalletActivityAsset,
): TokenMetaInsert {
  return {
    address: mbl_getAssetAddress(asset),
    symbol: asset.symbol,
    name: asset.name,
    imageUrl: asset.logo,
  };
}

function mbl_getSwapValueUsd(
  action: Extract<MBL_WalletActivityAction, { model: "swap" }>,
): number | null {
  const candidates = [
    action.swapAmountUsd,
    action.swapAmountIn * action.swapPriceUsdTokenIn,
    action.swapAmountOut * action.swapPriceUsdTokenOut,
    action.swapAmountIn * action.swapAssetIn.price,
    action.swapAmountOut * action.swapAssetOut.price,
  ];

  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return null;
}

function mbl_getTransferDirection(
  transferType: Extract<
    MBL_WalletActivityAction,
    { model: "transfer" }
  >["transferType"],
): "send" | "receive" | null {
  if (transferType == "TOKEN_IN" || transferType == "NATIVE_IN") {
    return "receive";
  }
  if (transferType == "TOKEN_OUT" || transferType == "NATIVE_OUT") {
    return "send";
  }
  return null;
}

function mbl_extractActivity(
  address: string,
  transactions: MBL_WalletActivityTransaction[],
): {
  swaps: WalletSwapV2[];
  transfers: WalletTransferV2[];
  swapInsertValues: WalletSwapHistoryInsert[];
  transferInsertValues: WalletTransferHistoryInsert[];
  tokenMetaInsertValues: TokenMetaInsert[];
} {
  const swaps: WalletSwapV2[] = [];
  const transfers: WalletTransferV2[] = [];
  const swapInsertValues: WalletSwapHistoryInsert[] = [];
  const transferInsertValues: WalletTransferHistoryInsert[] = [];
  const tokenMetaInsertValuesByAddress = new Map<string, TokenMetaInsert>();
  const fetchedAtMs = dayjs.utc().valueOf();

  for (const transaction of transactions) {
    for (
      let actionIndex = 0;
      actionIndex < transaction.actions.length;
      actionIndex++
    ) {
      const action = transaction.actions[actionIndex];
      if (!action) {
        continue;
      }
      const actId = mbl_getActionId(actionIndex);

      if (action.model == "swap") {
        const tokenInAddress = mbl_getAssetAddress(action.swapAssetOut);
        const tokenOutAddress = mbl_getAssetAddress(action.swapAssetIn);
        const totalValueUsd = mbl_getSwapValueUsd(action);
        if (totalValueUsd == null) {
          continue;
        }
        if (
          !Number.isFinite(action.swapAmountOut) ||
          !Number.isFinite(action.swapAmountIn)
        ) {
          continue;
        }

        const tokenOutMeta = mbl_toTokenMetaInsert(action.swapAssetOut);
        const tokenInMeta = mbl_toTokenMetaInsert(action.swapAssetIn);
        tokenMetaInsertValuesByAddress.set(tokenOutMeta.address, tokenOutMeta);
        tokenMetaInsertValuesByAddress.set(tokenInMeta.address, tokenInMeta);

        swaps.push({
          transactionHash: transaction.txHash,
          actId,
          blockTimestampMs: transaction.txDateMs,
          bought: {
            address: tokenInAddress,
            amount: action.swapAmountOut,
            symbol: action.swapAssetOut.symbol,
            name: action.swapAssetOut.name,
            logoUri: action.swapAssetOut.logo,
            priceUsd:
              action.swapPriceUsdTokenOut > 0
                ? action.swapPriceUsdTokenOut
                : action.swapAssetOut.price,
          },
          sold: {
            address: tokenOutAddress,
            amount: action.swapAmountIn,
            symbol: action.swapAssetIn.symbol,
            name: action.swapAssetIn.name,
            logoUri: action.swapAssetIn.logo,
            priceUsd:
              action.swapPriceUsdTokenIn > 0
                ? action.swapPriceUsdTokenIn
                : action.swapAssetIn.price,
          },
          totalValueUsd,
        });

        swapInsertValues.push({
          address,
          transactionHash: transaction.txHash,
          actId,
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          amountIn: action.swapAmountOut,
          amountOut: action.swapAmountIn,
          tokenInPriceUsd:
            action.swapPriceUsdTokenOut > 0
              ? action.swapPriceUsdTokenOut
              : action.swapAssetOut.price,
          tokenOutPriceUsd:
            action.swapPriceUsdTokenIn > 0
              ? action.swapPriceUsdTokenIn
              : action.swapAssetIn.price,
          valueUsd: totalValueUsd,
          blockTimestampMs: transaction.txDateMs,
          fetchedAtMs,
        });

        continue;
      }

      const direction = mbl_getTransferDirection(action.transferType);
      if (direction == null) {
        continue;
      }

      const counterpartyAddress =
        direction == "receive"
          ? action.transferFromAddress
          : action.transferToAddress;
      if (counterpartyAddress == null) {
        continue;
      }
      if (!Number.isFinite(action.transferAmount)) {
        continue;
      }
      if (!Number.isFinite(action.transferAmountUsd)) {
        continue;
      }

      const tokenAddress = mbl_getAssetAddress(action.transferAsset);
      const tokenMetaInsertValue = mbl_toTokenMetaInsert(action.transferAsset);
      tokenMetaInsertValuesByAddress.set(
        tokenMetaInsertValue.address,
        tokenMetaInsertValue,
      );

      transfers.push({
        transactionHash: transaction.txHash,
        actId,
        blockTimestampMs: transaction.txDateMs,
        token: {
          address: tokenAddress,
          amount: action.transferAmount,
          symbol: action.transferAsset.symbol,
          name: action.transferAsset.name,
          logoUri: action.transferAsset.logo,
          priceUsd: action.transferAsset.price,
        },
        direction,
        counterpartyAddress,
        valueUsd: action.transferAmountUsd,
      });

      transferInsertValues.push({
        address,
        transactionHash: transaction.txHash,
        actId,
        blockTimestampMs: transaction.txDateMs,
        tokenAddress,
        amount: action.transferAmount,
        valueUsd: action.transferAmountUsd,
        direction,
        counterpartyAddress,
        priceUsd: action.transferAsset.price,
        fetchedAtMs,
      });
    }
  }

  return {
    swaps,
    transfers,
    swapInsertValues,
    transferInsertValues,
    tokenMetaInsertValues: Array.from(tokenMetaInsertValuesByAddress.values()),
  };
}

async function mbl_writeActivityHistory(input: {
  swapInsertValues: WalletSwapHistoryInsert[];
  transferInsertValues: WalletTransferHistoryInsert[];
  tokenMetaInsertValues: TokenMetaInsert[];
}) {
  if (input.swapInsertValues.length > 0) {
    await db
      .insert(walletSwapHistory)
      .values(input.swapInsertValues)
      .onConflictDoUpdate({
        target: [
          walletSwapHistory.address,
          walletSwapHistory.transactionHash,
          walletSwapHistory.actId,
        ],
        set: excludedAutoFromInsert(
          walletSwapHistory,
          [
            walletSwapHistory.address,
            walletSwapHistory.transactionHash,
            walletSwapHistory.actId,
          ],
          input.swapInsertValues,
        ),
      });
  }

  if (input.transferInsertValues.length > 0) {
    await db
      .insert(walletTransferHistory)
      .values(input.transferInsertValues)
      .onConflictDoUpdate({
        target: [
          walletTransferHistory.address,
          walletTransferHistory.transactionHash,
          walletTransferHistory.actId,
        ],
        set: excludedAutoFromInsert(
          walletTransferHistory,
          [
            walletTransferHistory.address,
            walletTransferHistory.transactionHash,
            walletTransferHistory.actId,
          ],
          input.transferInsertValues,
        ),
      });
  }

  if (input.tokenMetaInsertValues.length > 0) {
    await db
      .insert(tokenMeta)
      .values(input.tokenMetaInsertValues)
      .onConflictDoUpdate({
        target: [tokenMeta.address],
        set: excludedAutoNonNullFromInsert(
          tokenMeta,
          tokenMeta.address,
          input.tokenMetaInsertValues,
        ),
      });
  }
}

async function mbl_fetchWalletActivityRange({
  address,
  fromMs,
  toMs,
  target,
  limit,
  maxLimit,
  minValueUsd,
  maxValueUsd,
  tokenAddress,
}: {
  address: string;
  fromMs: number;
  toMs: number;
  target: WalletActivityTarget;
  limit: number;
  maxLimit: number;
  minValueUsd?: number | null;
  maxValueUsd?: number | null;
  tokenAddress?: string | null;
}): Promise<WalletActivityFetchResult | null> {
  const targetLimit = normalizeTxLimit(limit, maxLimit);
  const normalizedMinValueUsd = normalizeMinValueUsd(minValueUsd ?? undefined);
  const normalizedMaxValueUsd = normalizeMaxValueUsd(maxValueUsd ?? undefined);
  const normalizedTokenAddress = normalizeHistoryTokenAddress(tokenAddress);
  const swaps: WalletSwapV2[] = [];
  const transfers: WalletTransferV2[] = [];
  let offset = 0;
  let oldestFetchedMs = toMs;
  let exhaustedRange = false;

  for (let page = 0; page < MOBULA_WALLET_ACTIVITY_MAX_PAGES; page++) {
    const pageResult = await mbl_fetchWalletActivityPage({
      address,
      fromMs,
      toMs,
      offset,
    });
    if (!pageResult) {
      return null;
    }
    dataUsage.record("provider_result");
    const { result, extracted } = pageResult;

    if (result.data.length == 0 || result.pagination.pageEntries == 0) {
      exhaustedRange = true;
      break;
    }

    oldestFetchedMs = Math.min(
      oldestFetchedMs,
      ...result.data.map((transaction) => transaction.txDateMs),
    );

    swaps.push(...extracted.swaps);
    transfers.push(...extracted.transfers);

    const targetCount =
      target == "swap"
        ? swaps.filter((swap) =>
            matchesValueUsd(
              swap.totalValueUsd,
              normalizedMinValueUsd,
              normalizedMaxValueUsd,
            ) && swapMatchesToken(swap, normalizedTokenAddress),
          ).length
        : transfers.filter((transfer) =>
            matchesValueUsd(
              transfer.valueUsd,
              normalizedMinValueUsd,
              normalizedMaxValueUsd,
            ) && transferMatchesToken(transfer, normalizedTokenAddress),
          ).length;
    const pageExhausted =
      result.pagination.pageEntries < MOBULA_WALLET_ACTIVITY_PAGE_SIZE;
    if (targetCount >= targetLimit) {
      exhaustedRange = pageExhausted;
      break;
    }
    if (pageExhausted) {
      exhaustedRange = true;
      break;
    }

    offset += result.pagination.pageEntries;
  }

  const cutOffByLimit = !exhaustedRange;
  const filteredSwaps = swaps.filter((swap) =>
    matchesValueUsd(
      swap.totalValueUsd,
      normalizedMinValueUsd,
      normalizedMaxValueUsd,
    ) && swapMatchesToken(swap, normalizedTokenAddress),
  );
  const filteredTransfers = transfers.filter((transfer) =>
    matchesValueUsd(
      transfer.valueUsd,
      normalizedMinValueUsd,
      normalizedMaxValueUsd,
    ) && transferMatchesToken(transfer, normalizedTokenAddress),
  );
  return {
    swaps: filteredSwaps.slice(
      0,
      target == "swap" ? targetLimit : filteredSwaps.length,
    ),
    transfers: filteredTransfers.slice(
      0,
      target == "transfer" ? targetLimit : filteredTransfers.length,
    ),
    coveredFromExclusiveMs: cutOffByLimit
      ? Math.max(
          fromMs,
          oldestFetchedMs - MOBULA_WALLET_ACTIVITY_BACKWARD_OVERLAP_MS,
        )
      : fromMs,
    coveredToInclusiveMs: toMs,
    cutOffByLimit,
  };
}

type WalletSwapHistoryFetchResult = {
  values: WalletSwapV2[];
  coveredFromExclusiveMs: number;
  coveredToInclusiveMs: number;
  cutOffByLimit: boolean;
};

async function fetchWalletSwapHistoryGap(
  address: string,
  fromMs: number,
  toMs: number,
  limit?: number,
  minValueUsd?: number | null,
  maxValueUsd?: number | null,
  tokenAddress?: string | null,
): Promise<WalletSwapHistoryFetchResult | null> {
  return await fetchWalletSwapHistoryCore(
    address,
    fromMs,
    toMs,
    limit,
    false,
    minValueUsd,
    maxValueUsd,
    tokenAddress,
  );
}

async function fetchWalletSwapHistoryCore(
  address: string,
  fromMs: number,
  toMs: number,
  limit: number = WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
  writeMeta: boolean = true,
  minValueUsd?: number | null,
  maxValueUsd?: number | null,
  tokenAddress?: string | null,
): Promise<WalletSwapHistoryFetchResult | null> {
  const res = await mbl_fetchWalletActivityRange({
    address,
    fromMs,
    toMs,
    limit,
    maxLimit: WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
    target: "swap",
    minValueUsd,
    maxValueUsd,
    tokenAddress,
  });

  if (!res) return null;
  if (res.swaps.length == 0) {
    if (writeMeta) {
      await upsertWalletActivityHistoryMeta(address, res);
    }

    return {
      values: [],
      coveredFromExclusiveMs: res.coveredFromExclusiveMs,
      coveredToInclusiveMs: res.coveredToInclusiveMs,
      cutOffByLimit: res.cutOffByLimit,
    };
  }

  if (writeMeta) {
    await upsertWalletActivityHistoryMeta(address, res);
  }

  return {
    values: res.swaps.slice(
      0,
      normalizeTxLimit(limit, WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT),
    ),
    coveredFromExclusiveMs: res.coveredFromExclusiveMs,
    coveredToInclusiveMs: res.coveredToInclusiveMs,
    cutOffByLimit: res.cutOffByLimit,
  };
}

function normalizeRange(
  fromMs?: number,
  toMs?: number,
): { fromMs: number; toMs: number } {
  const nowMs = dayjs.utc().startOf("second").valueOf();
  const maxNowMs = nowMs - MOBULA_WALLET_ACTIVITY_BACKWARD_OVERLAP_MS;
  const defaultPeriodMs = MONTH_MS;

  const requestedToMs = toMs && toMs < nowMs ? toMs : maxNowMs;
  const requestedFromMs = fromMs
    ? fromMs < nowMs
      ? fromMs
      : maxNowMs
    : toMs != null
      ? requestedToMs - defaultPeriodMs
      : nowMs - defaultPeriodMs;

  return {
    fromMs: Math.min(requestedFromMs, requestedToMs),
    toMs: Math.max(requestedFromMs, requestedToMs),
  };
}

async function db_getSwapHistory(
  address: string,
  fromExclusiveMs: number,
  toInclusiveMs: number,
  limit: number,
  cursor: WalletHistoryCursor | null,
  minValueUsd?: number | null,
  maxValueUsd?: number | null,
  tokenAddress?: string | null,
  filters?: WalletSwapHistoryFilters,
): Promise<WalletTransaction<WalletSwapV2>[]> {
  const normalizedMinValueUsd = normalizeMinValueUsd(minValueUsd ?? undefined);
  const normalizedMaxValueUsd = normalizeMaxValueUsd(maxValueUsd ?? undefined);
  const normalizedTokenAddress = normalizeHistoryTokenAddress(tokenAddress);
  const predicates = [
    eq(walletSwapHistory.address, address),
    gt(walletSwapHistory.blockTimestampMs, fromExclusiveMs),
    lte(walletSwapHistory.blockTimestampMs, toInclusiveMs),
  ];
  if (normalizedMinValueUsd != null) {
    predicates.push(gte(walletSwapHistory.valueUsd, normalizedMinValueUsd));
  }
  if (normalizedMaxValueUsd != null) {
    predicates.push(lte(walletSwapHistory.valueUsd, normalizedMaxValueUsd));
  }
  if (normalizedTokenAddress != null) {
    const tokenPredicate = or(
      eq(walletSwapHistory.tokenIn, normalizedTokenAddress),
      eq(walletSwapHistory.tokenOut, normalizedTokenAddress),
    );
    if (tokenPredicate) predicates.push(tokenPredicate);
  }
  if (cursor) {
    const cursorPredicate = or(
      lt(walletSwapHistory.blockTimestampMs, cursor.blockTimestampMs),
      and(
        eq(walletSwapHistory.blockTimestampMs, cursor.blockTimestampMs),
        lt(walletSwapHistory.transactionHash, cursor.transactionHash),
      ),
      and(
        eq(walletSwapHistory.blockTimestampMs, cursor.blockTimestampMs),
        eq(walletSwapHistory.transactionHash, cursor.transactionHash),
        lt(walletSwapHistory.actId, cursor.actId),
      ),
    );
    if (cursorPredicate) predicates.push(cursorPredicate);
  }

  const rows = await db
    .select()
    .from(walletSwapHistory)
    .where(and(...predicates))
    .orderBy(
      desc(walletSwapHistory.blockTimestampMs),
      desc(walletSwapHistory.transactionHash),
      desc(walletSwapHistory.actId),
    )
    .limit(limit);

  const tokenAddresses = new Set(
    rows.flatMap((item) => [item.tokenIn, item.tokenOut]),
  );
  const tokenMetaRes = await db
    .select()
    .from(tokenMeta)
    .where(inArray(tokenMeta.address, Array.from(tokenAddresses)));
  const tokenMetaLookup = Object.fromEntries(
    tokenMetaRes.map((tm) => [tm.address, tm]),
  );

  return filterSortSwapEntries(rows.map((item) => ({
    blockTimestampMs: item.blockTimestampMs,
    transactionHash: item.transactionHash,
    actId: item.actId,
    transaction: {
      transactionHash: item.transactionHash,
      actId: item.actId,
      blockTimestampMs: item.blockTimestampMs,
      bought: {
        address: item.tokenIn,
        amount: item.amountIn,
        symbol: tokenMetaLookup[item.tokenIn]?.symbol ?? null,
        name: tokenMetaLookup[item.tokenIn]?.name ?? null,
        logoUri: tokenMetaLookup[item.tokenIn]?.imageUrl ?? null,
        priceUsd: item.tokenInPriceUsd,
      },
      sold: {
        address: item.tokenOut,
        amount: item.amountOut,
        symbol: tokenMetaLookup[item.tokenOut]?.symbol ?? null,
        name: tokenMetaLookup[item.tokenOut]?.name ?? null,
        logoUri: tokenMetaLookup[item.tokenOut]?.imageUrl ?? null,
        priceUsd: item.tokenOutPriceUsd,
      },
      totalValueUsd: item.valueUsd,
    },
  })), filters);
}

export async function getWalletSwapHistory(
  address: string,
  requestFromMs?: number,
  requestToMs?: number,
  limit = WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
  parsedCursor?: WalletHistoryCursor,
  minValueUsd?: number,
  maxValueUsd?: number,
  tokenAddress?: string,
  filters?: WalletSwapHistoryFilters,
): Promise<WalletTransactionHistory<WalletSwapV2> | null> {
  // Don't try to understand it, Just feel it - Christopher Nolan
  const cursor = parsedCursor ?? null;
  const normalizedMinValueUsd = normalizeMinValueUsd(minValueUsd);
  const normalizedMaxValueUsd = normalizeMaxValueUsd(maxValueUsd);
  const normalizedTokenAddress = normalizeHistoryTokenAddress(tokenAddress);
  const requestedRange = cursor
    ? {
        fromMs: cursor.fromExclusiveMs,
        toMs: cursor.blockTimestampMs,
      }
    : normalizeRange(requestFromMs, requestToMs);
  const fromMs = requestedRange.fromMs;

  limit = normalizeTxLimit(limit, WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT);

  const [latestMeta] = await db
    .select({ toInclusiveMs: max(walletSwapHistoryMeta.toInclusiveMs) })
    .from(walletSwapHistoryMeta)
    .where(eq(walletSwapHistoryMeta.address, address))
    .limit(1);

  const latestCoveredToMs = latestMeta?.toInclusiveMs ?? null;
  const toMs = cursor
    ? cursor.blockTimestampMs
    : latestCoveredToMs != null &&
        latestCoveredToMs < requestedRange.toMs &&
        requestedRange.toMs - latestCoveredToMs <=
          WALLET_SWAP_HISTORY_LATEST_TOLERANCE_MS
      ? latestCoveredToMs
      : requestedRange.toMs;
  const storedEntries = await db_getSwapHistory(
    address,
    fromMs,
    toMs,
    limit + 1,
    cursor,
    normalizedMinValueUsd,
    normalizedMaxValueUsd,
    normalizedTokenAddress,
    filters,
  );
  const canAnswerFromStoredRows =
    storedEntries.length > limit &&
    (cursor != null ||
      (latestCoveredToMs != null && latestCoveredToMs >= toMs));
  if (canAnswerFromStoredRows) {
    return postProcessWalletTxHistory({
      entries: storedEntries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange: false,
    });
  }

  const intersecting = await db
    .select()
    .from(walletSwapHistoryMeta)
    .where(
      and(
        eq(walletSwapHistoryMeta.address, address),
        gt(walletSwapHistoryMeta.toInclusiveMs, fromMs),
        lt(walletSwapHistoryMeta.fromExclusiveMs, toMs),
      ),
    )
    .orderBy(desc(walletSwapHistoryMeta.toInclusiveMs));

  if (intersecting.length == 0) {
    let fetchToMs = toMs;
    let fetched: WalletSwapHistoryFetchResult | null = null;
    while (fetchToMs > fromMs) {
      fetched = await fetchWalletSwapHistoryCore(
        address,
        fromMs,
        fetchToMs,
        limit,
        true,
        normalizedMinValueUsd,
        normalizedMaxValueUsd,
        normalizedTokenAddress,
      );
      if (!fetched) return null;
      if (
        fetched.values.length > 0 ||
        !fetched.cutOffByLimit ||
        fetched.coveredFromExclusiveMs <= fromMs
      ) {
        break;
      }
      fetchToMs = fetched.coveredFromExclusiveMs;
    }
    if (!fetched) return null;

    const hasUnresolvedRange =
      fetched.cutOffByLimit && fetched.coveredFromExclusiveMs > fromMs;
    const entries = await db_getSwapHistory(
      address,
      hasUnresolvedRange ? fetched.coveredFromExclusiveMs : fromMs,
      toMs,
      limit + 1,
      cursor,
      normalizedMinValueUsd,
      normalizedMaxValueUsd,
      normalizedTokenAddress,
    filters,
    );
    return postProcessWalletTxHistory({
      entries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange,
    });
  }

  const merged: { fromExclusiveMs: number; toInclusiveMs: number }[] = [];
  for (const item of intersecting) {
    if (
      merged.length == 0 ||
      item.toInclusiveMs < merged[merged.length - 1].fromExclusiveMs
    ) {
      merged.push({
        fromExclusiveMs: item.fromExclusiveMs,
        toInclusiveMs: item.toInclusiveMs,
      });
    } else {
      merged[merged.length - 1].fromExclusiveMs = Math.min(
        merged[merged.length - 1].fromExclusiveMs,
        item.fromExclusiveMs,
      );
    }
  }

  let cursorMs = toMs;
  const gaps: { fromExclusiveMs: number; toInclusiveMs: number }[] = [];
  for (const interval of merged) {
    if (interval.toInclusiveMs <= fromMs) {
      continue;
    }
    if (interval.fromExclusiveMs >= cursorMs) {
      continue;
    }
    if (interval.toInclusiveMs < cursorMs) {
      gaps.push({
        fromExclusiveMs: Math.max(interval.toInclusiveMs, fromMs),
        toInclusiveMs: cursorMs,
      });
    }
    if (interval.fromExclusiveMs < cursorMs) {
      cursorMs = Math.max(interval.fromExclusiveMs, fromMs);
    }
  }

  if (cursorMs > fromMs) {
    gaps.push({
      fromExclusiveMs: fromMs,
      toInclusiveMs: cursorMs,
    });
  }

  if (
    cursor == null &&
    storedEntries.length > 0 &&
    latestCoveredToMs != null &&
    latestCoveredToMs >= toMs
  ) {
    return postProcessWalletTxHistory({
      entries: storedEntries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange: gaps.length > 0,
    });
  }

  if (gaps.length == 0) {
    const entries = await db_getSwapHistory(
      address,
      fromMs,
      toMs,
      limit + 1,
      cursor,
      normalizedMinValueUsd,
      normalizedMaxValueUsd,
      normalizedTokenAddress,
    filters,
    );
    return postProcessWalletTxHistory({
      entries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange: false,
    });
  }

  const fetchedGapIntervals: {
    fromExclusiveMs: number;
    toInclusiveMs: number;
  }[] = [];
  let safeFromExclusiveMs: number | null = null;
  for (const gap of gaps) {
    let gapToMs = gap.toInclusiveMs;
    while (gapToMs > gap.fromExclusiveMs) {
      const gapRes = await fetchWalletSwapHistoryGap(
        address,
        gap.fromExclusiveMs,
        gapToMs,
        limit,
        normalizedMinValueUsd,
        normalizedMaxValueUsd,
        normalizedTokenAddress,
      );

      if (!gapRes) {
        // TODO: Distinguish verified-empty gaps from fetch/extraction failures;
        // failures must terminate filling without marking the gap as covered.
        fetchedGapIntervals.push({
          fromExclusiveMs: gap.fromExclusiveMs,
          toInclusiveMs: gapToMs,
        });
        break;
      }

      fetchedGapIntervals.push({
        fromExclusiveMs: gapRes.coveredFromExclusiveMs,
        toInclusiveMs: gapRes.coveredToInclusiveMs,
      });

      if (!gapRes.cutOffByLimit) {
        break;
      }

      if (
        gapRes.values.length > 0 ||
        gapRes.coveredFromExclusiveMs <= gap.fromExclusiveMs
      ) {
        safeFromExclusiveMs = gapRes.coveredFromExclusiveMs;
        break;
      }

      gapToMs = gapRes.coveredFromExclusiveMs;
    }

    if (safeFromExclusiveMs != null) {
      break;
    }
  }

  const allIntervals = [...merged, ...fetchedGapIntervals].sort(
    (a, b) => b.toInclusiveMs - a.toInclusiveMs,
  );
  const finalMerged: { fromExclusiveMs: number; toInclusiveMs: number }[] = [];
  for (const interval of allIntervals) {
    if (
      finalMerged.length == 0 ||
      interval.toInclusiveMs <
        finalMerged[finalMerged.length - 1].fromExclusiveMs
    ) {
      finalMerged.push({
        fromExclusiveMs: interval.fromExclusiveMs,
        toInclusiveMs: interval.toInclusiveMs,
      });
    } else {
      finalMerged[finalMerged.length - 1].fromExclusiveMs = Math.min(
        finalMerged[finalMerged.length - 1].fromExclusiveMs,
        interval.fromExclusiveMs,
      );
    }
  }

  const idsToDelete = intersecting.map((row) => row.toInclusiveMs);
  await db
    .delete(walletSwapHistoryMeta)
    .where(
      and(
        eq(walletSwapHistoryMeta.address, address),
        inArray(walletSwapHistoryMeta.toInclusiveMs, idsToDelete),
      ),
    );

  const mergedInsertValues = finalMerged.map((interval) => ({
    address,
    fromExclusiveMs: interval.fromExclusiveMs,
    toInclusiveMs: interval.toInclusiveMs,
    fetchedAtMs: dayjs.utc().valueOf(),
  }));
  await db.insert(walletSwapHistoryMeta).values(mergedInsertValues);

  const returnFromExclusiveMs = safeFromExclusiveMs ?? fromMs;
  const entries = await db_getSwapHistory(
    address,
    returnFromExclusiveMs,
    toMs,
    limit + 1,
    cursor,
    normalizedMinValueUsd,
    normalizedMaxValueUsd,
    normalizedTokenAddress,
    filters,
  );
  return postProcessWalletTxHistory({
    entries,
    limit,
    fromExclusiveMs: fromMs,
    hasUnresolvedRange:
      safeFromExclusiveMs != null && safeFromExclusiveMs > fromMs,
  });
}

type WalletTransferHistoryFetchResult = {
  values: WalletTransferV2[];
  coveredFromExclusiveMs: number;
  coveredToInclusiveMs: number;
  cutOffByLimit: boolean;
};

async function fetchWalletTransferHistoryGap(
  address: string,
  fromMs: number,
  toMs: number,
  limit?: number,
  minValueUsd?: number | null,
  maxValueUsd?: number | null,
  tokenAddress?: string | null,
): Promise<WalletTransferHistoryFetchResult | null> {
  return await fetchWalletTransferHistoryCore(
    address,
    fromMs,
    toMs,
    limit,
    false,
    minValueUsd,
    maxValueUsd,
    tokenAddress,
  );
}

async function fetchWalletTransferHistoryCore(
  address: string,
  fromMs: number,
  toMs: number,
  limit: number = WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
  writeMeta: boolean = true,
  minValueUsd?: number | null,
  maxValueUsd?: number | null,
  tokenAddress?: string | null,
): Promise<WalletTransferHistoryFetchResult | null> {
  const res = await mbl_fetchWalletActivityRange({
    address,
    fromMs,
    toMs,
    limit,
    maxLimit: WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
    target: "transfer",
    minValueUsd,
    maxValueUsd,
    tokenAddress,
  });

  if (!res) return null;
  if (res.transfers.length == 0) {
    if (writeMeta) {
      await upsertWalletActivityHistoryMeta(address, res);
    }

    return {
      values: [],
      coveredFromExclusiveMs: res.coveredFromExclusiveMs,
      coveredToInclusiveMs: res.coveredToInclusiveMs,
      cutOffByLimit: res.cutOffByLimit,
    };
  }

  if (writeMeta) {
    await upsertWalletActivityHistoryMeta(address, res);
  }

  return {
    values: res.transfers.slice(
      0,
      normalizeTxLimit(limit, WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT),
    ),
    coveredFromExclusiveMs: res.coveredFromExclusiveMs,
    coveredToInclusiveMs: res.coveredToInclusiveMs,
    cutOffByLimit: res.cutOffByLimit,
  };
}

async function db_getTransferHistory(
  address: string,
  fromExclusiveMs: number,
  toInclusiveMs: number,
  limit: number,
  cursor: WalletHistoryCursor | null,
  minValueUsd?: number | null,
  maxValueUsd?: number | null,
  tokenAddress?: string | null,
  filters?: WalletTransferHistoryFilters,
): Promise<WalletTransaction<WalletTransferV2>[]> {
  const normalizedMinValueUsd = normalizeMinValueUsd(minValueUsd ?? undefined);
  const normalizedMaxValueUsd = normalizeMaxValueUsd(maxValueUsd ?? undefined);
  const normalizedTokenAddress = normalizeHistoryTokenAddress(tokenAddress);
  const predicates = [
    eq(walletTransferHistory.address, address),
    gt(walletTransferHistory.blockTimestampMs, fromExclusiveMs),
    lte(walletTransferHistory.blockTimestampMs, toInclusiveMs),
  ];
  if (normalizedMinValueUsd != null) {
    predicates.push(gte(walletTransferHistory.valueUsd, normalizedMinValueUsd));
  }
  if (normalizedMaxValueUsd != null) {
    predicates.push(lte(walletTransferHistory.valueUsd, normalizedMaxValueUsd));
  }
  if (normalizedTokenAddress != null) {
    predicates.push(
      eq(walletTransferHistory.tokenAddress, normalizedTokenAddress),
    );
  }
  if (cursor) {
    const cursorPredicate = or(
      lt(walletTransferHistory.blockTimestampMs, cursor.blockTimestampMs),
      and(
        eq(walletTransferHistory.blockTimestampMs, cursor.blockTimestampMs),
        lt(walletTransferHistory.transactionHash, cursor.transactionHash),
      ),
      and(
        eq(walletTransferHistory.blockTimestampMs, cursor.blockTimestampMs),
        eq(walletTransferHistory.transactionHash, cursor.transactionHash),
        lt(walletTransferHistory.actId, cursor.actId),
      ),
    );
    if (cursorPredicate) predicates.push(cursorPredicate);
  }

  const rows = await db
    .select()
    .from(walletTransferHistory)
    .where(and(...predicates))
    .orderBy(
      desc(walletTransferHistory.blockTimestampMs),
      desc(walletTransferHistory.transactionHash),
      desc(walletTransferHistory.actId),
    )
    .limit(limit);

  const tokenAddresses = new Set(rows.map((item) => item.tokenAddress));
  const tokenMetaRes = await db
    .select()
    .from(tokenMeta)
    .where(inArray(tokenMeta.address, Array.from(tokenAddresses)));
  const tokenMetaLookup = Object.fromEntries(
    tokenMetaRes.map((tm) => [tm.address, tm]),
  );

  return filterSortTransferEntries(rows.map((item) => ({
    blockTimestampMs: item.blockTimestampMs,
    transactionHash: item.transactionHash,
    actId: item.actId,
    transaction: {
      transactionHash: item.transactionHash,
      actId: item.actId,
      blockTimestampMs: item.blockTimestampMs,
      token: {
        address: item.tokenAddress,
        amount: item.amount,
        symbol: tokenMetaLookup[item.tokenAddress]?.symbol ?? null,
        name: tokenMetaLookup[item.tokenAddress]?.name ?? null,
        logoUri: tokenMetaLookup[item.tokenAddress]?.imageUrl ?? null,
        priceUsd: item.priceUsd,
      },
      direction: item.direction,
      counterpartyAddress: item.counterpartyAddress,
      valueUsd: item.valueUsd,
    },
  })), filters);
}

export async function getWalletTransferHistory(
  address: string,
  requestFromMs?: number,
  requestToMs?: number,
  limit = WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
  parsedCursor?: WalletHistoryCursor,
  minValueUsd?: number,
  maxValueUsd?: number,
  tokenAddress?: string,
  filters?: WalletTransferHistoryFilters,
): Promise<WalletTransactionHistory<WalletTransferV2> | null> {
  const cursor = parsedCursor ?? null;
  const normalizedMinValueUsd = normalizeMinValueUsd(minValueUsd);
  const normalizedMaxValueUsd = normalizeMaxValueUsd(maxValueUsd);
  const normalizedTokenAddress = normalizeHistoryTokenAddress(tokenAddress);
  const requestedRange = cursor
    ? {
        fromMs: cursor.fromExclusiveMs,
        toMs: cursor.blockTimestampMs,
      }
    : normalizeRange(requestFromMs, requestToMs);
  const fromMs = requestedRange.fromMs;
  limit = normalizeTxLimit(
    limit,
    WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
  );

  const [latestMeta] = await db
    .select({ toInclusiveMs: max(walletTransferHistoryMeta.toInclusiveMs) })
    .from(walletTransferHistoryMeta)
    .where(eq(walletTransferHistoryMeta.address, address))
    .limit(1);

  const latestCoveredToMs = latestMeta?.toInclusiveMs ?? null;
  const toMs = cursor
    ? cursor.blockTimestampMs
    : latestCoveredToMs != null &&
        latestCoveredToMs < requestedRange.toMs &&
        requestedRange.toMs - latestCoveredToMs <=
          WALLET_TRANSFER_HISTORY_LATEST_TOLERANCE_MS
      ? latestCoveredToMs
      : requestedRange.toMs;
  const storedEntries = await db_getTransferHistory(
    address,
    fromMs,
    toMs,
    limit + 1,
    cursor,
    normalizedMinValueUsd,
    normalizedMaxValueUsd,
    normalizedTokenAddress,
    filters,
  );
  const canAnswerFromStoredRows =
    storedEntries.length > limit &&
    (cursor != null ||
      (latestCoveredToMs != null && latestCoveredToMs >= toMs));
  if (canAnswerFromStoredRows) {
    return postProcessWalletTxHistory({
      entries: storedEntries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange: false,
    });
  }

  const intersecting = await db
    .select()
    .from(walletTransferHistoryMeta)
    .where(
      and(
        eq(walletTransferHistoryMeta.address, address),
        gt(walletTransferHistoryMeta.toInclusiveMs, fromMs),
        lt(walletTransferHistoryMeta.fromExclusiveMs, toMs),
      ),
    )
    .orderBy(desc(walletTransferHistoryMeta.toInclusiveMs));

  if (intersecting.length == 0) {
    let fetchToMs = toMs;
    let fetched: WalletTransferHistoryFetchResult | null = null;
    while (fetchToMs > fromMs) {
      fetched = await fetchWalletTransferHistoryCore(
        address,
        fromMs,
        fetchToMs,
        limit,
        true,
        normalizedMinValueUsd,
        normalizedMaxValueUsd,
        normalizedTokenAddress,
      );
      if (!fetched) return null;
      if (
        fetched.values.length > 0 ||
        !fetched.cutOffByLimit ||
        fetched.coveredFromExclusiveMs <= fromMs
      ) {
        break;
      }
      fetchToMs = fetched.coveredFromExclusiveMs;
    }
    if (!fetched) return null;

    const hasUnresolvedRange =
      fetched.cutOffByLimit && fetched.coveredFromExclusiveMs > fromMs;
    const entries = await db_getTransferHistory(
      address,
      hasUnresolvedRange ? fetched.coveredFromExclusiveMs : fromMs,
      toMs,
      limit + 1,
      cursor,
      normalizedMinValueUsd,
      normalizedMaxValueUsd,
      normalizedTokenAddress,
    filters,
    );

    return postProcessWalletTxHistory({
      entries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange,
    });
  }

  const merged: { fromExclusiveMs: number; toInclusiveMs: number }[] = [];
  for (const item of intersecting) {
    if (
      merged.length == 0 ||
      item.toInclusiveMs < merged[merged.length - 1].fromExclusiveMs
    ) {
      merged.push({
        fromExclusiveMs: item.fromExclusiveMs,
        toInclusiveMs: item.toInclusiveMs,
      });
    } else {
      merged[merged.length - 1].fromExclusiveMs = Math.min(
        merged[merged.length - 1].fromExclusiveMs,
        item.fromExclusiveMs,
      );
    }
  }

  let cursorMs = toMs;
  const gaps: { fromExclusiveMs: number; toInclusiveMs: number }[] = [];
  for (const interval of merged) {
    if (interval.toInclusiveMs <= fromMs) continue;
    if (interval.fromExclusiveMs >= cursorMs) continue;
    if (interval.toInclusiveMs < cursorMs) {
      gaps.push({
        fromExclusiveMs: Math.max(interval.toInclusiveMs, fromMs),
        toInclusiveMs: cursorMs,
      });
    }
    if (interval.fromExclusiveMs < cursorMs) {
      cursorMs = Math.max(interval.fromExclusiveMs, fromMs);
    }
  }

  if (cursorMs > fromMs) {
    gaps.push({
      fromExclusiveMs: fromMs,
      toInclusiveMs: cursorMs,
    });
  }

  if (
    cursor == null &&
    storedEntries.length > 0 &&
    latestCoveredToMs != null &&
    latestCoveredToMs >= toMs
  ) {
    return postProcessWalletTxHistory({
      entries: storedEntries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange: gaps.length > 0,
    });
  }

  if (gaps.length == 0) {
    const entries = await db_getTransferHistory(
      address,
      fromMs,
      toMs,
      limit + 1,
      cursor,
      normalizedMinValueUsd,
      normalizedMaxValueUsd,
      normalizedTokenAddress,
    filters,
    );

    return postProcessWalletTxHistory({
      entries,
      limit,
      fromExclusiveMs: fromMs,
      hasUnresolvedRange: false,
    });
  }

  const fetchedGapIntervals: {
    fromExclusiveMs: number;
    toInclusiveMs: number;
  }[] = [];
  let safeFromExclusiveMs: number | null = null;
  for (const gap of gaps) {
    let gapToMs = gap.toInclusiveMs;
    while (gapToMs > gap.fromExclusiveMs) {
      const gapRes = await fetchWalletTransferHistoryGap(
        address,
        gap.fromExclusiveMs,
        gapToMs,
        limit,
        normalizedMinValueUsd,
        normalizedMaxValueUsd,
        normalizedTokenAddress,
      );

      if (!gapRes) {
        // TODO: Distinguish verified-empty gaps from fetch/extraction failures;
        // failures must terminate filling without marking the gap as covered.
        fetchedGapIntervals.push({
          fromExclusiveMs: gap.fromExclusiveMs,
          toInclusiveMs: gapToMs,
        });
        break;
      }

      fetchedGapIntervals.push({
        fromExclusiveMs: gapRes.coveredFromExclusiveMs,
        toInclusiveMs: gapRes.coveredToInclusiveMs,
      });

      if (!gapRes.cutOffByLimit) {
        break;
      }

      if (
        gapRes.values.length > 0 ||
        gapRes.coveredFromExclusiveMs <= gap.fromExclusiveMs
      ) {
        safeFromExclusiveMs = gapRes.coveredFromExclusiveMs;
        break;
      }

      gapToMs = gapRes.coveredFromExclusiveMs;
    }

    if (safeFromExclusiveMs != null) {
      break;
    }
  }

  const allIntervals = [...merged, ...fetchedGapIntervals].sort(
    (a, b) => b.toInclusiveMs - a.toInclusiveMs,
  );
  const finalMerged: { fromExclusiveMs: number; toInclusiveMs: number }[] = [];
  for (const interval of allIntervals) {
    if (
      finalMerged.length == 0 ||
      interval.toInclusiveMs <
        finalMerged[finalMerged.length - 1].fromExclusiveMs
    ) {
      finalMerged.push({
        fromExclusiveMs: interval.fromExclusiveMs,
        toInclusiveMs: interval.toInclusiveMs,
      });
    } else {
      finalMerged[finalMerged.length - 1].fromExclusiveMs = Math.min(
        finalMerged[finalMerged.length - 1].fromExclusiveMs,
        interval.fromExclusiveMs,
      );
    }
  }

  const idsToDelete = intersecting.map((row) => row.toInclusiveMs);
  await db
    .delete(walletTransferHistoryMeta)
    .where(
      and(
        eq(walletTransferHistoryMeta.address, address),
        inArray(walletTransferHistoryMeta.toInclusiveMs, idsToDelete),
      ),
    );

  const mergedInsertValues = finalMerged.map((interval) => ({
    address,
    fromExclusiveMs: interval.fromExclusiveMs,
    toInclusiveMs: interval.toInclusiveMs,
    fetchedAtMs: dayjs.utc().valueOf(),
  }));
  await db.insert(walletTransferHistoryMeta).values(mergedInsertValues);

  const returnFromExclusiveMs = safeFromExclusiveMs ?? fromMs;
  const entries = await db_getTransferHistory(
    address,
    returnFromExclusiveMs,
    toMs,
    limit + 1,
    cursor,
    normalizedMinValueUsd,
    normalizedMaxValueUsd,
    normalizedTokenAddress,
    filters,
  );

  return postProcessWalletTxHistory({
    entries,
    limit,
    fromExclusiveMs: fromMs,
    hasUnresolvedRange:
      safeFromExclusiveMs != null && safeFromExclusiveMs > fromMs,
  });
}
