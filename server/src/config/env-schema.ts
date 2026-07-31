import z from "zod";

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
