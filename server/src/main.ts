import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import transfers from "./routes/transfers.js";
import tokens from "./routes/tokens.js";
import balances from "./routes/balances.js";
import users from "./routes/users.route.js";

// Load environment variables
process.loadEnvFile("./.env");
process.loadEnvFile("./.env.local");

// Routes
const app = new Hono()
  .use(cors())
  .use(logger())
  .get("/api", (c) => c.json({ status: "ok" }))
  .route("/api/users", users)
  .route("/api/tokens", tokens)
  .route("/api/balances", balances)
  .route("/api/transfers", transfers);

// Server
serve(
  {
    // Redirect Node's requests to Hono
    fetch: app.fetch,
    port: Number(process.env.SERVER_PORT) || 4000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

// RPC for client
export type AppType = typeof app;
