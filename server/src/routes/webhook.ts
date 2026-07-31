import {
  processHeliusWebhookTransactions,
  type HeliusEnhancedTransaction,
} from "@sv/services/walletAlerts.service.js";
import env from "@sv/util/load-env.js";
import { Hono } from "hono";

function webhookAuthKey(): string {
  return env.HELIUS_WEBHOOK_AUTH_KEY;
}

function isAuthorized(authorization: string | undefined): boolean {
  const key = webhookAuthKey();
  return Boolean(key) &&
    (authorization == key || authorization == `Bearer ${key}`);
}

function coerceTransactionsPayload(
  payload: unknown,
): HeliusEnhancedTransaction[] | null {
  if (Array.isArray(payload)) return payload as HeliusEnhancedTransaction[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { transactions?: unknown }).transactions)
  ) {
    return (payload as { transactions: HeliusEnhancedTransaction[] })
      .transactions;
  }
  return null;
}

function isDevReplayEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

const app = new Hono()
  .post("/", async (c) => {
    const authorization = c.req.header("Authorization");
    if (!isAuthorized(authorization)) {
      console.warn("[helius-webhook] unauthorized request", {
        hasAuthorization: Boolean(authorization),
      });
      return c.text("Unauthorized", 401);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch (error) {
      console.error("[helius-webhook] failed to parse payload:", error);
      return c.text("Invalid JSON", 400);
    }

    const transactions = coerceTransactionsPayload(payload);
    if (!transactions) {
      console.error("[helius-webhook] invalid payload shape", {
        isArray: Array.isArray(payload),
        type: typeof payload,
      });
      return c.text("Webhook payload must be an array", 400);
    }

    await processHeliusWebhookTransactions(transactions, {
      dryRun: false,
      dedupe: true,
      log: true,
    });

    return c.text("Webhook received", 200);
  })
  .post("/replay", async (c) => {
    if (!isDevReplayEnabled()) {
      return c.text("Not found", 404);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch (error) {
      console.error("[helius-webhook] replay failed to parse payload:", error);
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const transactions = coerceTransactionsPayload(payload);
    if (!transactions) {
      return c.json({ error: "Webhook replay payload must be an array" }, 400);
    }

    const dryRun = c.req.query("dryRun") !== "false";
    const summary = await processHeliusWebhookTransactions(transactions, {
      dryRun,
      dedupe: false,
      log: true,
    });
    return c.json(summary, 200);
  });

export default app;

export type WebhookAppType = typeof app;
