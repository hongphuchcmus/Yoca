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

export { envSchema, type Env } from "@sv/config/env-schema.js";

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
