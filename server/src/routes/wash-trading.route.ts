import { Hono } from "hono";
import { z } from "zod";
import { honoJwt } from "@sv/middlewares/validation.js";
import userExtract from "@sv/middlewares/user-extract.js";
import {
    AI_FEATURES,
    type AiUsageMetadata,
    type AiUsageReservation,
    getAiUsage,
    isAiFeatureLocked,
    releaseAiUsage,
    reserveAiUsage,
} from "@sv/services/ai-usage.service.js";
import { analyzeWashTradingWithAI, getWashTradingRuntimeStatus } from "@sv/services/wash-trading-ai.service.js";
import { answerWashTradingChatQuery } from "@sv/services/wash-trading-chat.service.js";
import { washTradingService } from "@sv/services/wash-trading.service.js";
import { statusCode } from "@sv/util/responses.js";

const timeframeSchema = z.enum(["1h", "24h", "7d", "30d"]).default("24h");
const algorithmSchema = z.enum(["GCN", "GAT", "GraphSAGE"]).default("GCN");
const languageSchema = z.enum(["en", "vi"]).default("en");

const aiAnalyzeBodySchema = z.object({
  mint: z.string().trim().min(32, "Invalid Solana token mint address"),
  symbol: z.string().trim().min(1).max(24).optional().default("TOKEN"),
  timeframe: timeframeSchema.optional().default("24h"),
  algorithm: algorithmSchema.optional().default("GCN"),
  language: languageSchema.optional().default("en"),
  limit: z.coerce.number().int().min(20).max(200).optional().default(80),
});

const aiAnalyzeQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(24).optional().default("TOKEN"),
  timeframe: timeframeSchema.optional().default("24h"),
  algorithm: algorithmSchema.optional().default("GCN"),
  language: languageSchema.optional().default("en"),
  limit: z.coerce.number().int().min(20).max(200).optional().default(80),
});

class WashTradingAiDailyLimitError extends Error {
  constructor(readonly usage: AiUsageMetadata) {
    super("Wash Trading AI Analysis daily limit exceeded");
  }
}

class WashTradingChatDailyLimitError extends Error {
  constructor(readonly usage: AiUsageMetadata) {
    super("Wash Trading AI Chat daily limit exceeded");
  }
}

function washTradingAiLimitResponse(usage: AiUsageMetadata) {
  return {
    success: false,
    errorCode: "AI_DAILY_LIMIT_EXCEEDED",
    message: "You have reached today's Wash Trading AI Analysis limit.",
    ...usage,
    upgradePath: "/pricing",
  };
}

function washTradingAiLockedResponse(usage: AiUsageMetadata) {
  return {
    success: false,
    errorCode: "AI_FEATURE_LOCKED",
    message: "Wash Trading AI Analysis requires the Plus plan or higher.",
    feature: usage.feature,
    tier: usage.tier,
    requiredTier: usage.requiredTier ?? "Plus",
    upgradePath: "/pricing",
  };
}

function washTradingChatLimitResponse(usage: AiUsageMetadata) {
  return {
    success: false,
    errorCode: "AI_DAILY_LIMIT_EXCEEDED",
    message: "You have reached today's Wash Trading AI Chat limit.",
    ...usage,
    upgradePath: "/pricing",
  };
}

function washTradingChatLockedResponse(usage: AiUsageMetadata) {
  return {
    success: false,
    errorCode: "AI_FEATURE_LOCKED",
    message: "Wash Trading AI Chat requires the Plus plan or higher.",
    feature: usage.feature,
    tier: usage.tier,
    requiredTier: usage.requiredTier ?? "Plus",
    upgradePath: "/pricing",
  };
}

async function reserveWashTradingAi(userId: string) {
  const usage = await getAiUsage(userId, AI_FEATURES.WashTradingAiAnalysis);
  if (isAiFeatureLocked(AI_FEATURES.WashTradingAiAnalysis, usage.tier)) {
    return { locked: true as const, usage };
  }

  const reservation = await reserveAiUsage(
    userId,
    AI_FEATURES.WashTradingAiAnalysis,
  );
  if (!reservation.allowed) {
    throw new WashTradingAiDailyLimitError(reservation.usage);
  }

  return { locked: false as const, reservation };
}

async function releaseWashTradingAiUsage(reservation?: AiUsageReservation) {
  if (!reservation?.allowed) return;

  try {
    await releaseAiUsage(reservation);
  } catch (err) {
    console.error("[WashTrading] failed to release AI usage:", err);
  }
}
const washTradingChatSchema = z.object({
  mint: z.string().trim().min(32, "Invalid Solana token mint address"),
  symbol: z.string().trim().min(1).max(24).optional().default("TOKEN"),
  timeframe: z.enum(["24h", "7d", "30d"]).optional().default("24h"),
  algorithm: algorithmSchema.optional().default("GCN"),
  language: languageSchema.optional().default("en"),
  query: z.string().trim().min(1).max(1000),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(1000),
    }),
  ).max(8).optional().default([]),
});

const app = new Hono()
  .get("/debug-config", (c) => {
    return c.json({
      success: true,
      data: getWashTradingRuntimeStatus(),
      timestamp: new Date().toISOString(),
    });
  })
  .post("/chat", honoJwt, userExtract, async (c) => {
    let reservation: AiUsageReservation | undefined;

    try {
      const { id: userId } = c.get("userPayload");
      const body = await c.req.json().catch(() => null);
      const parsed = washTradingChatSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: "Invalid chat request",
            details: parsed.error.flatten(),
          },
          400,
        );
      }

      const usage = await getAiUsage(userId, AI_FEATURES.WashTradingAiChat);
      if (isAiFeatureLocked(AI_FEATURES.WashTradingAiChat, usage.tier)) {
        return c.json(
          washTradingChatLockedResponse(usage),
          statusCode.Forbidden,
        );
      }

      reservation = await reserveAiUsage(
        userId,
        AI_FEATURES.WashTradingAiChat,
      );
      if (!reservation.allowed) {
        throw new WashTradingChatDailyLimitError(reservation.usage);
      }

      const data = await answerWashTradingChatQuery(parsed.data);
      return c.json({
        success: true,
        data,
        usage: reservation.usage,
        counted: !reservation.usage.disabled,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof WashTradingChatDailyLimitError) {
        return c.json(
          washTradingChatLimitResponse(error.usage),
          statusCode.TooManyRequests,
        );
      }

      await releaseWashTradingAiUsage(reservation);
      console.error("[WashTrading] POST /chat failed:", error);
      return c.json(
        {
          success: false,
          error: "Wash-trading chat failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  })

  .post("/ai-analyze", honoJwt, userExtract, async (c) => {
    let reservation: AiUsageReservation | undefined;

    try {
      const { id: userId } = c.get("userPayload");
      const body = await c.req.json().catch(() => null);
      const parsed = aiAnalyzeBodySchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: "Invalid request body",
            details: parsed.error.flatten(),
          },
          400,
        );
      }

      const access = await reserveWashTradingAi(userId);
      if (access.locked) {
        return c.json(
          washTradingAiLockedResponse(access.usage),
          statusCode.Forbidden,
        );
      }
      reservation = access.reservation;

      const result = await analyzeWashTradingWithAI(parsed.data);

      return c.json({
        success: true,
        data: result,
        usage: reservation.usage,
        counted: !reservation.usage.disabled,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof WashTradingAiDailyLimitError) {
        return c.json(
          washTradingAiLimitResponse(error.usage),
          statusCode.TooManyRequests,
        );
      }

      await releaseWashTradingAiUsage(reservation);
      console.error("[WashTrading] POST /ai-analyze failed:", error);
      return c.json(
        {
          success: false,
          error: "AI wash trading analysis failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  })

  // Legacy/static endpoints đặt trước /:mint để không bị route param bắt nhầm.
  .get("/analyze", async (c) => {
    const mint = c.req.query("mint")?.trim();
    if (!mint) return c.json({ success: false, error: "mint is required" }, 400);
    const analysis = await washTradingService.analyzeWashTrading(mint);
    return c.json({ success: true, data: analysis, timestamp: new Date().toISOString() });
  })

  .get("/circular-trades", async (c) => {
    const mint = c.req.query("mint")?.trim();
    if (!mint) return c.json({ success: false, error: "mint is required" }, 400);
    const timeWindow = Number(c.req.query("timeWindow") ?? 3_600_000);
    const data = await washTradingService.detectCircularTrades(mint, timeWindow);
    return c.json({ success: true, data, count: data.length });
  })

  .get("/star-topology", async (c) => {
    const mint = c.req.query("mint")?.trim();
    if (!mint) return c.json({ success: false, error: "mint is required" }, 400);
    const data = await washTradingService.detectStarTopology(mint);
    return c.json({ success: true, data, count: data.length });
  })

  .get("/volume-anomalies", async (c) => {
    const mint = c.req.query("mint")?.trim();
    if (!mint) return c.json({ success: false, error: "mint is required" }, 400);
    const data = await washTradingService.detectVolumeAnomalies(mint);
    return c.json({ success: true, data, count: data.length });
  })

  // Test nhanh bằng browser/Postman:
  // GET /api/v1/wash-trading/:mint?symbol=BONK&timeframe=24h&algorithm=GAT
  .get("/:mint", honoJwt, userExtract, async (c) => {
    let reservation: AiUsageReservation | undefined;

    try {
      const { id: userId } = c.get("userPayload");
      const mint = c.req.param("mint")?.trim();
      const parsed = aiAnalyzeQuerySchema.safeParse({
        symbol: c.req.query("symbol") ?? undefined,
        timeframe: c.req.query("timeframe") ?? undefined,
        algorithm: c.req.query("algorithm") ?? undefined,
        language: c.req.query("language") ?? undefined,
        limit: c.req.query("limit") ?? undefined,
      });

      if (!mint || mint.length < 32) {
        return c.json({ success: false, error: "Invalid Solana token mint address" }, 400);
      }

      if (!parsed.success) {
        return c.json({ success: false, error: "Invalid query", details: parsed.error.flatten() }, 400);
      }

      const access = await reserveWashTradingAi(userId);
      if (access.locked) {
        return c.json(
          washTradingAiLockedResponse(access.usage),
          statusCode.Forbidden,
        );
      }
      reservation = access.reservation;

      const result = await analyzeWashTradingWithAI({ mint, ...parsed.data });
      return c.json({
        success: true,
        data: result,
        usage: reservation.usage,
        counted: !reservation.usage.disabled,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof WashTradingAiDailyLimitError) {
        return c.json(
          washTradingAiLimitResponse(error.usage),
          statusCode.TooManyRequests,
        );
      }

      await releaseWashTradingAiUsage(reservation);
      console.error("[WashTrading] GET /:mint failed:", error);
      return c.json(
        {
          success: false,
          error: "AI wash trading analysis failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  });

export type WashTradingAppType = typeof app;
export default app;
