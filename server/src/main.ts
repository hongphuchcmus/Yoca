import env from "@sv/util/load-env.js";
import "@sv/util/date.js";
import { serve } from "@hono/node-server";
import { clientDomains } from "@sv/config/security.js";
import { requestContextMiddleware } from "@sv/middlewares/request-context.js";
import users from "@sv/routes/users.js";
import auth from "@sv/routes/auth.js";
import tokens from "@sv/routes/tokens.js";
import alerts from "@sv/routes/alerts.route.js";
import alertsHp from "@sv/routes/alerts.js";
import chartRoutes from "@sv/routes/chart.route.js";
import misc from "@sv/routes/misc.js";
import news from "@sv/routes/news.js";
import tokenNews from "@sv/routes/token-news.js";
import tokenChartNewsEvents from "@sv/routes/token-chart-news-events.js";
import tokenVolatility from "@sv/routes/token-volatility.js";
import tokenVolatilityNews from "@sv/routes/token-volatility-news.js";
import tokenAiChat from "@sv/routes/token-ai-chat.js";
import profile from "@sv/routes/profile.js";
import search from "@sv/routes/search.js";
import trades from "@sv/routes/trades.js";
import transactions from "@sv/routes/transactions.js";
import wallets from "@sv/routes/wallets.js";
import walletAnalysis from "@sv/modules/wallet-analysis/routes/walletAnalysis.routes.js";
import webhook from "@sv/routes/webhook.js";
import chat from "@sv/routes/chat.route.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import payment from "./routes/payment.route.js";
import washTradingRoutes from "./routes/wash-trading.route.js";
import metrics from "./routes/metrics.js";
const app = new Hono()
  .use("*", logger())
  .use("*", requestContextMiddleware)
  .use(
    "/api/*",
    cors({ origin: clientDomains, credentials: true }),
    ...(env.NODE_ENV == "development" ? [csrf({ origin: clientDomains })] : []),
  )
  .get("/", (c) => c.redirect("/api"))
  .get("/api", (c) => c.json({ status: "ok" }))
  .route("/api/users", users)
  .route("/api/auth", auth)
  .route("/api/tokens", tokens)
  .route("/api/misc", misc)
  .route("/api/search", search)
  .route("/api/transactions", transactions)
  .route("/api/charts", chartRoutes)
  .route("/api/profile", profile)
  .route("/api/wallets", wallets)
  .route("/api/wallet-analysis", walletAnalysis)
  .route("/api/alerts", alerts)
  .route("/api/trades", trades)
  .route("/api/alertsHp", alertsHp)
  .route("/api/news", news)
  .route("/api/token-news", tokenNews)
  .route("/api/token-chart-news-events", tokenChartNewsEvents)
  .route("/api/token-volatility", tokenVolatility)
  .route("/api/token-volatility-news", tokenVolatilityNews)
  .route("/api/token-ai-chat", tokenAiChat)
  .route("/api/payment", payment)
  .route("/api/chat", chat)
  .route("/webhook", webhook)
  .route("/api/v1/wash-trading", washTradingRoutes)
  .route("/metrics", metrics);

// startTokenPolling();

// Server
serve(
  {
    // Redirect Node's requests to Hono
    fetch: app.fetch,
    port: env.SERVER_PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

export type AppType = typeof app;
export type { Hono as HonoAppType } from "hono";
export type { ErrCode } from "@sv/config/errors.js";
