import {
    addressSchema,
    honoJwt,
    solanaBase58Schema,
    solanaSignatureSchema,
    validate,
    walletTokenTradesSchema,
} from "@sv/middlewares/validation.js";
import userExtract from "@sv/middlewares/user-extract.js";
import type {
    WalletPortfolioItem,
} from "@sv/services/wallet/dtos/walletDataObjects.js";
import {
    getWalletRealizedPnlDescBreakdown,
    getWalletRecentTradedDescBreakdown,
    getWalletFirstFund,
} from "@sv/services/wallet/index.js";
import {
    getWalletDayActivitySummary,
    getWalletTxInstructionDetail,
} from "@sv/services/wallet/walletDayActivity.service.js";
import { getTokenPriceChartForDay } from "@sv/services/tokens/token-chart.js";
import {
    // fetchTestTransaction,
    // getWalletExchangeCounts,
    getWalletOverview,
} from "@sv/services/wallet/walletOverview.service.js";
import { getWalletPortfolio } from "@sv/services/wallet/walletPortfolio.service.js";
import {
    getWalletSwapHistory,
    getWalletTransferHistory,
    getWalletSwaps,
    getWalletTransfers,
    mapSwapToTokenTradeRow,
    parseWalletHistoryCursorQuery,
    walletHistoryCursorQuerySchema,
} from "@sv/services/wallet/walletTransfersSwaps.service.js";
import {
    WALLET_IDENTITY_MAX_BATCH_SIZE,
    WalletIdentityServiceError,
    getWalletIdentity,
    getWalletIdentityBatch,
    mapWalletIdentityError,
} from "@sv/services/wallet/walletIdentity.service.js";
import { composeWalletIntelligence } from "@sv/services/wallet/walletIntelligence.service.js";
import {
    WalletAnalysisServiceError,
    getWalletAiAnalysis,
    mapWalletAnalysisStatus,
} from "@sv/services/wallet/walletAnalysis.service.js";
import {
    WalletAuditServiceError,
    getWalletAudit,
} from "@sv/services/wallet/walletAudit.service.js";
import {
    WalletAiSwapSummaryServiceError,
    getWalletAiSwapSummary,
} from "@sv/services/wallet/walletAiSwapSummary.service.js";
import {
    WalletTokenAnalysisServiceError,
    getTokenDeepAnalysis,
    mapWalletTokenAnalysisStatus,
} from "@sv/services/wallet/walletTokenAnalysis.service.js";
import {
    AI_FEATURES,
    type AiUsageMetadata,
    type AiUsageReservation,
    getAiUsage,
    isAiFeatureLocked,
    releaseAiUsage,
    reserveAiUsage,
} from "@sv/services/ai-usage.service.js";
import { statusCode } from "@sv/util/responses.js";
import { z } from "zod";
import { Hono } from "hono";
import walletAnalysis from "./wallets/wallet-analysis";
import walletTags from "./wallets/wallet-tags";

import { serverErr, setErr } from "@sv/util/errors";
import {
    WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
    WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
} from "@sv/config/constants.js";

const walletIdentityBatchRequestSchema = z.object({
  addresses: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(WALLET_IDENTITY_MAX_BATCH_SIZE),
});

const walletAnalysisRequestSchema = z.object({
  address: z.string().trim().min(1),
  language: z.enum(["en", "vn"]).optional(),
});

const walletTokenAnalysisRequestSchema = z.object({
  address: z.string().trim().min(1),
  tokenAddress: z.string().trim().min(1),
  language: z.enum(["en", "vn"]).optional(),
});

const walletOverviewPeriodSchema = z.enum([
  "24H",
  "7D",
  "30D",
  "60D",
  "90D",
  "1Y",
]);

const walletOverviewQuerySchema = z.object({
  address: solanaBase58Schema,
  period: walletOverviewPeriodSchema.optional().default("24H"),
  force: z.enum(["1", "true", "0", "false"]).optional(),
});

const walletTransactionQuerySchema = z.object({
  address: solanaBase58Schema,
  limit: z.coerce.number().int().min(1).optional(),
});

const walletHistorySortDirectionSchema = z.enum(["asc", "desc"]);

function createWalletHistoryBaseQuerySchema(maxLimit: number) {
  return z.object({
    fromMs: z.coerce.number().int().min(0).optional(),
    toMs: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(maxLimit).optional(),
    cursor: walletHistoryCursorQuerySchema.optional(),
    minValueUsd: z.coerce.number().min(0).optional(),
    maxValueUsd: z.coerce.number().min(0).optional(),
    search: z.string().trim().min(1).max(128).optional(),
    sortDirection: walletHistorySortDirectionSchema.optional(),
  });
}

const walletSwapHistoryQuerySchema = createWalletHistoryBaseQuerySchema(
  WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT,
).extend({
  boughtTokenAddress: solanaBase58Schema.optional(),
  soldTokenAddress: solanaBase58Schema.optional(),
  tokenAddress: solanaBase58Schema.optional(),
  sortBy: z.enum(["time", "value"]).optional(),
});
const walletTransferHistoryQuerySchema = createWalletHistoryBaseQuerySchema(
  WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT,
).extend({
  tokenAddress: solanaBase58Schema.optional(),
  direction: z.enum(["send", "receive"]).optional(),
  counterpartyAddress: solanaBase58Schema.optional(),
  minTokenAmount: z.coerce.number().min(0).optional(),
  maxTokenAmount: z.coerce.number().min(0).optional(),
  sortBy: z.enum(["time", "value"]).optional(),
});
const walletDayActivityQuerySchema = z.object({
  address: solanaBase58Schema,
  dayMs: z.coerce.number().min(0),
});
const walletTransactionDetailQuerySchema = z.object({
  address: solanaBase58Schema,
  signature: solanaSignatureSchema,
});

const walletAuditQuerySchema = z.object({
  force: z.enum(["1", "true", "0", "false"]).optional(),
});

const walletPortfolioQuerySchema = addressSchema.extend({
  force: z.enum(["1", "true", "0", "false"]).optional(),
});

class WalletAiDailyLimitError extends Error {
  constructor(readonly usage: AiUsageMetadata) {
    super("Wallet AI daily limit exceeded");
  }
}

async function releaseWalletAiUsage(reservation?: AiUsageReservation) {
  if (!reservation?.allowed) return;

  try {
    await releaseAiUsage(reservation);
  } catch (e) {
    console.error("[wallet-ai] failed to release AI usage", e);
  }
}

function walletAiLimitResponse(usage: AiUsageMetadata) {
  return {
    errorCode: "AI_DAILY_LIMIT_EXCEEDED",
    message:
      "You have reached today's Wallet AI limit. Upgrade your plan for more daily analyses.",
    ...usage,
    upgradePath: "/pricing",
  };
}

function walletAiLockedResponse(usage: AiUsageMetadata) {
  return {
    errorCode: "AI_FEATURE_LOCKED",
    message: "This AI feature requires the Plus plan or higher.",
    feature: usage.feature,
    tier: usage.tier,
    requiredTier: usage.requiredTier ?? "Plus",
    upgradePath: "/pricing",
  };
}

const app = new Hono()
  .route("/analysis", walletAnalysis)
  .route("/tags", walletTags)
  .get("/overview", validate("query", walletOverviewQuerySchema), async (c) => {
    try {
      const { address, period, force: forceParam } = c.req.valid("query");
      const force = forceParam == "1" || forceParam == "true";
      const overview = await getWalletOverview(address, { timePeriod: period, force });
      return c.json(overview);
    } catch (e) {
      return serverErr(c, e);
    }
  })
  .get("/portfolio", validate("query", walletPortfolioQuerySchema), async (c) => {
    try {
      const { address, force: forceParam } = c.req.valid("query");
      const force = forceParam == "1" || forceParam == "true";
      const portfolio = await getWalletPortfolio(address, { force });
      return c.json(portfolio, statusCode.Ok);
    } catch (e) {
      console.error(e);
      return serverErr(c, e);
    }
  })
  .get("/swap", validate("query", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("query");
      const txs = await getWalletSwaps(address);

      return c.json(txs);
    } catch (e) {
      return serverErr(c, e);
    }
  })
  .get(
    "/swaps/history/:address",
    validate("param", addressSchema),
    validate("query", walletSwapHistoryQuerySchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const {
          limit,
          fromMs,
          toMs,
          cursor,
          minValueUsd,
          maxValueUsd,
          search,
          boughtTokenAddress,
          soldTokenAddress,
          tokenAddress,
          sortBy,
          sortDirection,
        } = c.req.valid("query");
        const parsedCursor = parseWalletHistoryCursorQuery(cursor);
        if (!parsedCursor.success) {
          return c.json(
            {
              ...setErr("VALIDATION_ERR"),
              message: "Invalid query parameters",
              details: parsedCursor.error.issues,
            },
            statusCode.UnprocessableEntity,
          );
        }

        const txs = await getWalletSwapHistory(
          address,
          fromMs,
          toMs,
          limit,
          parsedCursor.data,
          minValueUsd,
          maxValueUsd,
          tokenAddress,
          {
            search,
            boughtTokenAddress,
            soldTokenAddress,
            sortBy,
            sortDirection,
          },
        );
        if (!txs) {
          return c.json(
            setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
            statusCode.BadGateway,
          );
        }
        return c.json(txs);
      } catch (e) {
        return serverErr(c, e);
      }
    },
  )
  .get(
    "/transfers/history/:address",
    validate("param", addressSchema),
    validate("query", walletTransferHistoryQuerySchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const {
          limit,
          fromMs,
          toMs,
          cursor,
          minValueUsd,
          maxValueUsd,
          search,
          tokenAddress,
          direction,
          counterpartyAddress,
          minTokenAmount,
          maxTokenAmount,
          sortBy,
          sortDirection,
        } = c.req.valid("query");
        const parsedCursor = parseWalletHistoryCursorQuery(cursor);
        if (!parsedCursor.success) {
          return c.json(
            {
              ...setErr("VALIDATION_ERR"),
              message: "Invalid query parameters",
              details: parsedCursor.error.issues,
            },
            statusCode.UnprocessableEntity,
          );
        }

        const txs = await getWalletTransferHistory(
          address,
          fromMs,
          toMs,
          limit,
          parsedCursor.data,
          minValueUsd,
          maxValueUsd,
          tokenAddress,
          {
            search,
            direction,
            counterpartyAddress,
            minTokenAmount,
            maxTokenAmount,
            sortBy,
            sortDirection,
          },
        );
        if (!txs) {
          return c.json(
            setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
            statusCode.BadGateway,
          );
        }
        return c.json(txs);
      } catch (e) {
        return serverErr(c, e);
      }
    },
  )
  .get(
    "/:walletAddress/trades/:tokenAddress",
    validate("param", walletTokenTradesSchema),
    async (c) => {
      try {
        const { walletAddress, tokenAddress } = c.req.valid("param");
        const swaps = await getWalletSwaps(walletAddress);

        const normalizedToken = tokenAddress.trim().toLowerCase();
        const relevantSwaps = swaps.swaps.filter((swap) => {
          const bought = swap.bought.address.trim().toLowerCase();
          const sold = swap.sold.address.trim().toLowerCase();
          return bought == normalizedToken || sold == normalizedToken;
        });

        const trades = relevantSwaps.map((swap) =>
          mapSwapToTokenTradeRow(swap, walletAddress, tokenAddress),
        );

        if (!trades) {
          return c.json(trades, statusCode.BadGateway);
        }
        return c.json(trades, statusCode.Ok);
      } catch (e) {
        return serverErr(c, e);
      }
    },
  )
  .get(
    "/transfers",
    validate("query", walletTransactionQuerySchema),
    async (c) => {
      try {
        const { address } = c.req.valid("query");
        const txs = await getWalletTransfers(address);

        return c.json(txs);
      } catch (e) {
        return serverErr(c, e);
      }
    },
  )
  .get("/distribution", validate("query", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("query");
      // Get portfolio data which forms the asset distribution
      const portfolio = await getWalletPortfolio(address);

      // Transform portfolio data into distribution format
      // Calculate percentages based on total value
      const totalValue = portfolio.reduce(
        (sum: number, item: WalletPortfolioItem) => sum + (item.valueUsd ?? 0),
        0,
      );

      const distributionData = portfolio.map((item: WalletPortfolioItem) => ({
        name: item.symbol || item.name || item.tokenAddress || "Unknown",
        value: item.valueUsd ?? 0,
        percentage:
          totalValue > 0 ? ((item.valueUsd ?? 0) / totalValue) * 100 : 0,
        rawAmount: item.amount ?? 0,
        tokenAddress: item.tokenAddress ?? "",
        symbol: item.symbol ?? "",
        logoUri: item.logoUri ?? undefined,
      }));

      return c.json({
        data: distributionData,
        totalValue: totalValue,
        address: address,
        metadata: {
          currency: "USD",
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      return serverErr(c, e);
    }
  })

  .get("/identity", validate("query", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("query");
      const identity = await getWalletIdentity(address);
      return c.json(identity, statusCode.Ok);
    } catch (e) {
      if (e instanceof WalletIdentityServiceError) {
        const mapped = mapWalletIdentityError(e);
        return c.json({ error: mapped.error, code: e.code }, mapped.status);
      }

      return serverErr(c, e);
    }
  })
  .post(
    "/identity/batch",
    validate("json", walletIdentityBatchRequestSchema),
    async (c) => {
      try {
        const { addresses } = c.req.valid("json");
        const identityBatch = await getWalletIdentityBatch(addresses);
        return c.json(identityBatch, statusCode.Ok);
      } catch (e) {
        if (e instanceof WalletIdentityServiceError) {
          const mapped = mapWalletIdentityError(e);
          return c.json({ error: mapped.error, code: e.code }, mapped.status);
        }

        return serverErr(c, e);
      }
    },
  )
  .post(
    "/ai-analysis",
    honoJwt,
    userExtract,
    validate("json", walletAnalysisRequestSchema),
    async (c) => {
      const { id: userId } = c.get("userPayload");
      let reservation: AiUsageReservation | undefined;

      try {
        const body = c.req.valid("json");
        const currentUsage = await getAiUsage(
          userId,
          AI_FEATURES.WalletAiAnalysis,
        );
        if (
          isAiFeatureLocked(AI_FEATURES.WalletAiAnalysis, currentUsage.tier)
        ) {
          return c.json(
            walletAiLockedResponse(currentUsage),
            statusCode.Forbidden,
          );
        }

        const analysis = await getWalletAiAnalysis(
          body.address,
          body.language,
          async () => {
            reservation = await reserveAiUsage(
              userId,
              AI_FEATURES.WalletAiAnalysis,
            );
            if (!reservation.allowed) {
              throw new WalletAiDailyLimitError(reservation.usage);
            }
          },
        );
        const usage =
          reservation?.allowed == true
            ? reservation.usage
            : await getAiUsage(userId, AI_FEATURES.WalletAiAnalysis);

        return c.json(
          {
            ...analysis,
            usage,
            counted:
              reservation?.allowed == true && !reservation.usage.disabled,
          },
          statusCode.Ok,
        );
      } catch (e) {
        if (e instanceof WalletAiDailyLimitError) {
          return c.json(
            walletAiLimitResponse(e.usage),
            statusCode.TooManyRequests,
          );
        }

        await releaseWalletAiUsage(reservation);

        if (e instanceof WalletAnalysisServiceError) {
          return c.json(
            { error: e.message, code: e.code, details: e.details },
            mapWalletAnalysisStatus(e.status),
          );
        }

        return serverErr(c, e);
      }
    },
  )
  .post("/analysis", async (c) => {
    return c.redirect("/ai-summary");
  })
  .post(
    "/ai-swap-summary",
    honoJwt,
    userExtract,
    validate("json", walletAnalysisRequestSchema),
    async (c) => {
      try {
        const body = c.req.valid("json");
        const summary = await getWalletAiSwapSummary(
          body.address,
          body.language,
        );
        return c.json(summary, statusCode.Ok);
      } catch (err) {
        if (err instanceof WalletAiSwapSummaryServiceError) {
          const errCode = err.code;
          const statusByCode: Record<
            WalletAiSwapSummaryServiceError["code"],
            400 | 409 | 502
          > = {
            invalid_address: statusCode.BadRequest,
            no_data: statusCode.Conflict,
            model_error: statusCode.BadGateway,
            invalid_model_response: statusCode.BadGateway,
            provider_unknown: statusCode.BadGateway,
          };
          return c.json(
            { error: err.message, code: errCode },
            statusByCode[errCode],
          );
        }

        if (err instanceof Error) {
          console.error("Failed to get wallet AI swap summary", err.message);
        }

        return serverErr(c, err);
      }
    },
  )
  .post(
    "/ai-swap-summary/token",
    honoJwt,
    userExtract,
    validate("json", walletTokenAnalysisRequestSchema),
    async (c) => {
      try {
        const body = c.req.valid("json");

        const analysis = await getTokenDeepAnalysis(
          body.address,
          body.tokenAddress,
          body.language ?? "en",
        );
        return c.json(analysis, statusCode.Ok);
      } catch (e) {
        if (e instanceof WalletTokenAnalysisServiceError) {
          return c.json(
            { error: e.message, code: e.code },
            mapWalletTokenAnalysisStatus(e.code),
          );
        }

        return serverErr(c, e);
      }
    },
  )
  .get("/intelligence", validate("query", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("query");
      const intelligence = await composeWalletIntelligence(address);
      return c.json(intelligence, statusCode.Ok);
    } catch (e) {
      if (e instanceof WalletIdentityServiceError) {
        const mapped = mapWalletIdentityError(e);
        return c.json({ error: mapped.error, code: e.code }, mapped.status);
      }

      return serverErr(c, e);
    }
  })
  .get("/first-funds/:address", validate("param", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("param");
      const firstFunds = await getWalletFirstFund(address);
      if (firstFunds == null) {
        return c.json(
          setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
          statusCode.BadGateway,
        );
      }

      return c.json(firstFunds, statusCode.Ok);
    } catch (e) {
      return serverErr(c, e);
    }
  })
  .get("/:address/recent-traded-desc-breakdown", validate("param", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("param");
      const breakdown = await getWalletRecentTradedDescBreakdown(address);
      if (breakdown == null) {
        return c.json(
          setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
          statusCode.BadGateway,
        );
      }

      return c.json(breakdown, statusCode.Ok);
    } catch (e) {
      return serverErr(c, e);
    }
  })
  .get("/:address/realized-pnl-desc-breakdown", validate("param", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("param");
      const breakdown = await getWalletRealizedPnlDescBreakdown(address);
      if (breakdown == null) {
        return c.json(
          setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
          statusCode.BadGateway,
        );
      }

      return c.json(breakdown, statusCode.Ok);
    } catch (e) {
      return serverErr(c, e);
    }
  })
  /**
   * AI Wallet Forensic Audit.
   *
   * Returns a Gemini-generated behavioural classification (persona, trust
   * score, summary, observations) for the wallet. Result is cached in
   * `wallet_audit_cache` for 24 hours; pass `?force=1` to bypass the cache.
   */
  .get(
    "/:address/audit",
    validate("param", addressSchema),
    validate("query", walletAuditQuerySchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const { force: forceParam } = c.req.valid("query");
        const force = forceParam == "1" || forceParam == "true";
        const audit = await getWalletAudit(address, { force });
        return c.json(audit, statusCode.Ok);
      } catch (e) {
        if (e instanceof WalletAuditServiceError) {
          const statusByCode: Record<
            WalletAuditServiceError["code"],
            400 | 404 | 502 | 503
          > = {
            missing_api_key: statusCode.ServiceUnavailable,
            no_transactions: statusCode.NotFound,
            model_error: statusCode.BadGateway,
            invalid_model_response: statusCode.BadGateway,
          };
          return c.json(
            { error: e.message, code: e.code },
            statusByCode[e.code],
          );
        }

        return serverErr(c, e);
      }
    },
  )
  .get(
    "/day-activity",
    validate("query", walletDayActivityQuerySchema),
    async (c) => {
      try {
        const { address, dayMs } = c.req.valid("query");
        const summary = await getWalletDayActivitySummary(address, dayMs);
        return c.json(summary, statusCode.Ok);
      } catch (e) {
        return serverErr(c, e);
      }
    },
  )
  .get(
    "/tx-instructions",
    validate("query", walletTransactionDetailQuerySchema),
    async (c) => {
      try {
        const { address, signature } = c.req.valid("query");
        const detail = await getWalletTxInstructionDetail(address, signature);
        return c.json(detail, statusCode.Ok);
      } catch (e) {
        return serverErr(c, e);
      }
    },
  )
  .get(
    "/token-price-chart",
    validate("query", walletDayActivityQuerySchema),
    async (c) => {
      try {
        const { address, dayMs } = c.req.valid("query");
        const items = await getTokenPriceChartForDay(address, dayMs);
        return c.json({ items: items ?? [] }, statusCode.Ok);
      } catch (e) {
        return serverErr(c, e);
      }
    },
  );

export default app;

export type WalletsAppType = typeof app;
