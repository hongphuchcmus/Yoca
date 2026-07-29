import {
    userAlertConditionOps,
    userAlertPeriods,
    userAlertTokenMetric,
    userAlertTriggerModes,
    userTradeDirections,
    userTradingAggregations,
} from "@sv/db/alerts.js";
import { userAlertStatus } from "@sv/db/schema.js";
import { setErr } from "@sv/util/errors.js";
import env from "@sv/util/load-env";
import { statusCode } from "@sv/util/responses.js";
import type { Context, Next, ValidationTargets } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { validator } from "hono/validator";
import z from "zod";

export const solanaBase58Schema = z
  .string()
  .trim()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

export const solanaSignatureSchema = z
  .string()
  .trim()
  .min(87)
  .max(88)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

export const paginationSchema = z.object({
  limit: z.coerce.number(),
  offset: z.coerce.number(),
});

// Notes: All schema fields of Hono's "query" must be optional for the
// type inferrence to work correct. Or else all field would collapsed into
// string | string[]
// ->
// This is actually intended behavior from hono that all number type collapse
// into string | string[], since query must be send as string (Hono may just not
// dare to risk losing precision)
// See: https://hono.dev/docs/guides/rpc#path-parameters

export const daysQuerySchema = z.object({
  days: z.coerce.number().positive().default(30),
});

export const addressSchema = z.object({
  address: solanaBase58Schema,
});

export const addressListSchema = z.object({
  addresses: z
    .string()
    .transform((val) => val.split(",").filter(Boolean))
    .pipe(solanaBase58Schema.array()),
});

export const tokenIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const userCreationSchema = z.object({
  email: z.email("Invalid email format"),
  displayName: z.string().min(1).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const userVerificationSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[0-9]/, "Password must include at least one number");

export const forgotPasswordSchema = z.object({
  email: z.email("Invalid email format").transform((value) => value.trim()),
});

export const resetPasswordSchema = z.object({
  email: z.email("Invalid email format").transform((value) => value.trim()),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Reset code must be 6 digits"),
  newPassword: strongPasswordSchema,
});

export const authProviderSchema = z.enum([
  "password",
  "google",
  "github",
  "solana",
  "other",
]);

export const providerQuerySchema = z.object({
  provider: authProviderSchema.optional(),
});

export const profileIdentityUpdateSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name cannot be empty")
      .max(128)
      .nullable()
      .optional(),
    email: z
      .email("Invalid email format")
      .transform((value) => value.trim().toLowerCase())
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.email !== undefined,
    "At least one field must be provided",
  );

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: strongPasswordSchema,
  email: z
    .email("Invalid email format")
    .transform((value) => value.trim().toLowerCase())
    .nullable()
    .optional(),
});

export const deleteAccountSchema = z.object({
  confirmText: z
    .string()
    .trim()
    .refine(
      (value) => value === "DELETE MY ACCOUNT",
      "Confirm text must exactly match DELETE MY ACCOUNT",
    ),
  challengeToken: z.string().uuid().optional(),
});

export const googleTokenSchema = z.object({
  token: z.string().min(1),
});

export const solanaNounceRequestSchema = z.object({
  pubKey: solanaBase58Schema,
});

export const solanaVerificationRequestSchema = z.object({
  pubKey: solanaBase58Schema,
  signature: z.base64(),
});

export const userPayloadSchema = z.object({
  id: z.string(),
  exp: z.number(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable().optional(),
});

export type UserPayload = z.infer<typeof userPayloadSchema>;

export const searchQuerySchema = z.object({
  q: z.string().default(""),
});

// Notes: All schema fields of Hono's "query" must be optional for the
// type inferrence to work correct. Or else all field would collapsed into
// string | string[]
export const recentTradesQuerySchema = z.object({
  timeWindow: z.enum(["6h", "12h", "24h"]).default("24h"),
  usdThreshold: z.coerce.number().min(0).default(0),
  sortBy: z.enum(["volume", "time"]).default("volume"),
});

export const traderTypeQuerySchema = z.object({
  type: z.enum(["today", "1W", "30d", "90d"]).default("1W").optional(),
});

export const walletTokenTradesSchema = z.object({
  walletAddress: solanaBase58Schema,
  tokenAddress: solanaBase58Schema,
});

const tokenAlertConditionSchema = z.object({
  period: z.enum(userAlertPeriods),
  metric: z.enum(userAlertTokenMetric),
  conditionOp: z.enum(userAlertConditionOps),
  value: z.coerce.number(),
});

const tradingAlertScopeSchema = z.object({
  walletAddress: solanaBase58Schema,
  tokenAddress: solanaBase58Schema.optional().nullable(),
  poolAddress: solanaBase58Schema.optional().nullable(),
  counterpartyAddress: solanaBase58Schema.optional().nullable(),
  direction: z.enum(userTradeDirections).default("both"),
});

const tradingAlertConditionSchema = z.object({
  aggregation: z.enum(userTradingAggregations),
  period: z.enum(userAlertPeriods),
  conditionOp: z.enum(userAlertConditionOps),
  value: z.coerce.number(),
});

const alertDeliverySchema = z.object({
  email: z.email().optional(),
});

const alertBaseSchema = {
  name: z.string().trim().min(1),
  triggerMode: z.enum(userAlertTriggerModes).default("once"),
  expiresAt: z.iso.datetime({ offset: true }),
  delivery: alertDeliverySchema,
};

export const createTokenAlertSchema = z.object({
  alertType: z.literal("token"),
  ...alertBaseSchema,
  tokenTarget: z.object({
    tokenAddress: solanaBase58Schema,
  }),
  conditions: z
    .array(tokenAlertConditionSchema)
    .min(1, "At least one condition is required"),
});

export const createTradingAlertSchema = z.object({
  alertType: z.literal("trading"),
  ...alertBaseSchema,
  scopes: z.array(tradingAlertScopeSchema).default([]),
  conditions: z
    .array(tradingAlertConditionSchema)
    .min(1, "At least one condition is required"),
});

export const createAlertSchema = z.discriminatedUnion("alertType", [
  createTokenAlertSchema,
  createTradingAlertSchema,
]);

export type CreateAlertSchema = z.infer<typeof createAlertSchema>;
export type CreateTokenAlertSchema = z.infer<typeof createTokenAlertSchema>;
export type CreateTradingAlertSchema = z.infer<typeof createTradingAlertSchema>;

export const alertIdSchema = z.object({
  id: z.uuid(),
});

export const alertStatusUpdateSchema = z.object({
  status: z.enum(userAlertStatus),
});

export function validate<
  T extends keyof ValidationTargets,
  U extends z.ZodType,
>(target: T, schema: U) {
  return validator(target, (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        {
          ...setErr("VALIDATION_ERR"),
          message: `Invalid ${target} parameters`,
          details: parsed.error.issues,
        },
        statusCode.UnprocessableEntity,
      );
    }
    return parsed.data;
  });
}

// This is re-implementation of jwt middleware with custom unauthorized response
// See: https://github.com/atasoya/hono/blob/main/src/middleware/jwt/jwt.ts
export const honoJwt = async (c: Context, next: Next) => {
  // const jwtMiddleware = jwt({
  //   secret: env.JWT_SECRET,
  //   alg: "HS256",
  //   cookie: AUTH_COOKIE_NAME,
  // });
  const options = {
    secret: env.JWT_SECRET,
    alg: "HS256",
    cookie: "auth_token",
  } as const;
  const token = getCookie(c, options.cookie);
  if (!token) {
    return c.json(setErr("UNAUTHORIZED"), statusCode.Unauthorized);
  }

  let payload;
  try {
    payload = await verify(token, options.secret, { alg: options.alg });
  } catch { /* verification failed */ }

  if (!payload) {
    return c.json(setErr("UNAUTHORIZED"), statusCode.Unauthorized);
  }

  c.set("jwtPayload", payload);
  await next();
};

// Check if result schema was like expected. Useful for debugging
export async function validateApiResult<T extends z.ZodType>(
  schema: T,
  resp: Response,
  logSuccessResponse: boolean = false,
) {
  try {
    const text = await resp.text();
    if (!text) {
      console.error("External API returned empty response", {
        status: resp.status,
        url: resp.url,
      });
      return;
    }
    const jsonResp = JSON.parse(text);
    return validateResponseDataSchema(
      resp.status,
      jsonResp,
      schema,
      logSuccessResponse,
    );
  } catch (err) {
    console.error("External API Error:", {
      error: err instanceof Error ? err.message : String(err),
      url: resp?.url,
      status: resp?.status,
    });
    return;
  }
}

export async function validateResponseDataSchema<T extends z.ZodType>(
  status: number,
  jsonResp: unknown,
  schema: T,
  logSuccessResponse: boolean,
) {
  const parseRes = schema.safeParse(jsonResp);
  if (!parseRes.success) {
    console.error("Unexpected response!\nZod errors:", parseRes.error.issues);
  }

  if (logSuccessResponse || !parseRes.success) {
    console.log(`Actual response (${status}):`);
    const safeStr = (() => {
      try {
        return JSON.stringify(jsonResp, null, 2);
      } catch {
        return String(jsonResp);
      }
    })();
    const maxLog = 1000;
    if (safeStr.length > maxLog) {
      console.log(
        safeStr.slice(0, maxLog) +
          `\n... (truncated ${safeStr.length - maxLog} chars)`,
      );
    } else {
      console.log(safeStr);
    }
  }

  return parseRes.success ? parseRes.data : undefined;
}

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  POSTGRES_DB_URL: z.url("Invalid database URL"),
  JWT_SECRET: z.string().min(1, "Jwt is required"),
  GOOGLE_CLIENT_ID: z.string().min(1, "Google client id is required"),
  SERVER_PORT: z.coerce.number().default(4000),
  API_METRICS_ENABLED: z.enum(["true", "false"]).optional().default("false"),
  API_METRICS_BEARER_TOKEN: z.string().trim().optional().default(""),

  // API Keys and URLs
  COINGECKO_API_BASE_URL: z.url().default("https://api.coingecko.com/api/v3"),
  COINGECKO_API_KEY: z.string(),
  JUPITER_API_KEY: z.string().trim().optional().default(""),
  YOCA_BENCHMARK_BASE_URL: z.url().optional().default("http://localhost:4000"),

  BIRDEYE_API_BASE_URL: z.url().default("https://public-api.birdeye.so"),
  BIRDEYE_API_KEY: z.string(),

  ZERION_API_BASE_URL: z.url().default("https://api.zerion.io/v1"),
  ZERION_API_KEY: z.string(),

  HELIUS_API_KEY: z.string().trim().min(1, "Helius API key is required"),
  HELIUS_API_BASE_URL: z.url().default("https://api.helius.xyz"),
  HELIUS_WEBHOOK_AUTH_KEY: z.string().trim().optional().default(""),
  WEBHOOK_PUBLIC_URL: z
    .union([z.literal(""), z.url("Invalid Helius webhook URL")])
    .optional()
    .default(""),
  NGROK_AUTHTOKEN: z.string().trim().optional().default(""),
  NGROK_DOMAIN: z.string().trim().optional().default(""),
  WEBHOOK_SOL_PRICE_USD: z.coerce.number().positive().optional().default(150),
  // "true"  -> tier prices are converted USD -> SOL using the live Birdeye SOL price.
  // "false" -> the hardcoded TIER_SOL_AMOUNTS in solana-payment.service.ts are used.
  // Independent of SOLANA_NETWORK: live pricing still settles on whatever network is configured.
  SOLANA_LIVE_PRICING_ENABLED: z.enum(["true", "false"]).default("false"),
  MORALIS_API_BASE_URL: z.url().default("https://solana-gateway.moralis.io"),
  MORALIS_API_KEY: z.string(),
  MOBULA_API_BASE_URL: z.url().default("https://api.mobula.io/api"),
  MOBULA_API_KEY: z.string().trim().min(1),
  WALLET_AI_ANALYSIS_WEBHOOK_URL: z
    .url()
    .default("http://localhost:5678/webhook/analyse-wallet"),

  N8N_ANALYSE_WALLET_URL: z
    .url()
    .default("http://localhost:5678/webhook/analyse-wallet"),
  N8N_ANALYSIS_TIMEOUT_MS: z.coerce.number().int().positive().default(200000),
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
  BRAVE_SEARCH_ENABLED: z.enum(["true", "false"]).optional().default("false"),
  BRAVE_MONTHLY_SOFT_LIMIT: z.coerce.number().int().positive().optional(),
  BRAVE_MONTHLY_USED_OFFSET: z.coerce.number().int().min(0).default(0),
  GOOGLE_AI_KEY: z.string().optional().default(""),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_PUBLISHABLE_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_PRICE_LITE: z.string().min(1, "Stripe Lite price id is required"),
  STRIPE_PRICE_PLUS: z.string().min(1, "Stripe Plus price id is required"),
  STRIPE_PRICE_PRO: z.string().min(1, "Stripe Pro price id is required"),
  STRIPE_PRICE_LITE_YEARLY: z
    .string()
    .min(1, "Stripe Lite yearly price id is required"),
  STRIPE_PRICE_PLUS_YEARLY: z
    .string()
    .min(1, "Stripe Plus yearly price id is required"),
  STRIPE_PRICE_PRO_YEARLY: z
    .string()
    .min(1, "Stripe Pro yearly price id is required"),

  // SMTP password reset email
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(465),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  APP_NAME: z.string().optional().default("Yoca"),
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_FROM: z.string().optional().default(""),
  FROM_EMAIL: z.string().optional().default(""),

  // Client domains
  CLIENT_LOCAL_DOMAIN: z.url().default("http://localhost:3000"),
  CLIENT_DEV_DOMAIN: z.url().default("http://localhost:3000"),
  CLIENT_DEV_PREVIEW_DOMAIN: z.url().default("http://localhost:4173"),
  CLIENT_PROD_DOMAIN: z.url(),

  // AI
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODAL: z.string().optional().default("gemini-3.1-flash-lite"),
  GEMINI_SWAP_SUMMARY_MODEL: z
    .string()
    .optional()
    .default("gemini-3.1-flash-lite"),
  CHAT_MODEL: z.string().optional().default("gemini-3.1-flash-lite"),
  AI_USAGE_LIMIT_ENABLED: z.enum(["true", "false"]),
}).superRefine((env, ctx) => {
  const hasWebhookUrl = env.WEBHOOK_PUBLIC_URL.length > 0;
  const hasWebhookAuthKey = env.HELIUS_WEBHOOK_AUTH_KEY.length > 0;

  if (env.NODE_ENV == "production" && hasWebhookUrl != hasWebhookAuthKey) {
    ctx.addIssue({
      code: "custom",
      message:
        "WEBHOOK_PUBLIC_URL and HELIUS_WEBHOOK_AUTH_KEY must be configured together in production",
      path: hasWebhookUrl
        ? ["HELIUS_WEBHOOK_AUTH_KEY"]
        : ["WEBHOOK_PUBLIC_URL"],
    });
  }

  if (
    env.NODE_ENV == "production" &&
    hasWebhookUrl &&
    !env.WEBHOOK_PUBLIC_URL.startsWith("https://")
  ) {
    ctx.addIssue({
      code: "custom",
      message: "WEBHOOK_PUBLIC_URL must use HTTPS in production",
      path: ["WEBHOOK_PUBLIC_URL"],
    });
  }

  if (
    env.NODE_ENV == "production" &&
    env.API_METRICS_ENABLED == "true" &&
    env.API_METRICS_BEARER_TOKEN.length == 0
  ) {
    ctx.addIssue({
      code: "custom",
      message: "API_METRICS_BEARER_TOKEN is required when metrics are enabled in production",
      path: ["API_METRICS_BEARER_TOKEN"],
    });
  }
});

export type Env = z.infer<typeof envSchema>;
