// server/src/routes/payment.route.ts
import userExtract from "@sv/middlewares/user-extract.js";
import { honoJwt, validate } from "@sv/middlewares/validation.js";
import { setErr } from "@sv/util/errors.js";
import { db } from "@sv/db/index.js";
import { users, subscriptions, paymentHistory } from "@sv/db/schema.js";
import {
    createSetupIntent,
    activateSubscription,
    findOrCreateStripeCustomer,
    retrievePaymentIntent,
} from "@sv/services/stripe.service.js";
import { getUserById } from "@sv/services/users.js";
import {
    upsertSubscription,
    recordInvoicePayment,
} from "@sv/services/subscription.service.js";
import { statusCode } from "@sv/util/responses.js";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";

const isStripeManagedSubscription = (subscriptionId: string) =>
  subscriptionId.startsWith("sub_");

const app = new Hono()
  /**
   * POST /api/payment/setup-intent
   *
   * Step 1 of the SetupIntent flow.
   * Creates a Stripe SetupIntent so the frontend can collect a card via
   * Stripe Elements and confirmSetup(). Returns the client_secret.
   * 
   * Now supports deferred intent creation by accepting the selected paymentMethod.
   */
  .post(
    "/setup-intent",
    honoJwt,
    userExtract,
    validate("json", z.object({
      tier: z.enum(["Lite", "Plus", "Pro"]),
      interval: z.enum(["monthly", "yearly"]).default("monthly"),
      paymentMethod: z.enum(["card", "us_bank_account"]).optional(),
    })),
    async (c) => {
      try {
        const { id: userId } = c.get("userPayload");

        const user = await getUserById(userId);
        if (!user)
          return c.json(
            setErr("INVALID_TOKEN_PAYLOAD"),
            statusCode.Unauthorized,
          );

        const { tier, interval, paymentMethod } = c.req.valid("json");

        const stripeCustomerId = await findOrCreateStripeCustomer(
          userId,
          user.stripeCustomerId,
          user.email,
        );

        // Persist the customer ID if it was just created or replaced
        if (user.stripeCustomerId !== stripeCustomerId) {
          await db
            .update(users)
            .set({ stripeCustomerId })
            .where(eq(users.id, userId));
        }

        const setupIntent = await createSetupIntent(
          stripeCustomerId,
          paymentMethod ? (paymentMethod as "card" | "us_bank_account") : undefined
        );
        const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? "";

        console.log(
          "[setup-intent] Created SetupIntent:",
          setupIntent.id,
          "for tier:",
          tier,
          "interval:",
          interval,
        );

        return c.json(
          {
            clientSecret: setupIntent.client_secret,
            setupIntentId: setupIntent.id,
            publishableKey,
            tier,
            interval,
          },
          statusCode.Ok,
        );
      } catch (err: unknown) {
        console.error("[payment/setup-intent]", err);
        const msg = err instanceof Error ? err.message : "An unknown error occurred.";
        return c.json(
          {
            errorCode: "INTERNAL_SERVER_ERR",
            message: msg,
          },
          statusCode.InternalServerError,
        );
      }
    },
  )

  /**
   * POST /api/payment/activate-subscription
   *
   * Step 2 of the SetupIntent flow.
   * Called after the frontend successfully calls confirmSetup() and receives
   * the confirmed paymentMethodId (pm_xxx). This endpoint:
   *  1. Attaches the PM to the customer
   *  2. Sets it as default
   *  3. Creates the subscription → subscription goes "active" immediately
   *  4. Upserts the subscription record in our DB
   */
  .post(
    "/activate-subscription",
    honoJwt,
    userExtract,
    validate(
      "json",
      z.object({
        paymentMethodId: z.string().startsWith("pm_"),
        tier: z.enum(["Lite", "Plus", "Pro"]),
        interval: z.enum(["monthly", "yearly"]).default("monthly"),
      }),
    ),
    async (c) => {
      try {
        const { id: userId } = c.get("userPayload");

        const user = await getUserById(userId);
        if (!user)
          return c.json(
            setErr("INVALID_TOKEN_PAYLOAD"),
            statusCode.Unauthorized,
          );

        const { paymentMethodId, tier, interval } = c.req.valid("json");

        // stripeCustomerId must already exist at this point (created in setup-intent step)
        const stripeCustomerId = user.stripeCustomerId;
        if (!stripeCustomerId) {
          return c.json(
            {
              errorCode: "BAD_REQUEST",
              message:
                "No Stripe customer found. Please restart the payment flow.",
            },
            statusCode.BadRequest,
          );
        }

        const subscription = await activateSubscription({
          userId,
          stripeCustomerId,
          paymentMethodId,
          tier,
          interval,
        });

        // Persist to our DB immediately (webhook will also fire, that's fine — upsert is idempotent)
        await upsertSubscription(subscription);

        // Record the initial payment/invoice
        try {
          const { getStripe } = await import("@sv/services/stripe.service.js");
          const stripeClient = getStripe();

          // Fetch invoices for this subscription to capture the initial payment
          const invoices = await stripeClient.invoices.list({
            subscription: subscription.id,
            limit: 1,
          });

          if (invoices.data.length > 0) {
            const invoice = await stripeClient.invoices.retrieve(
              invoices.data[0].id,
              {
                expand: ["payments.data.payment.payment_intent"],
              },
            );
            await recordInvoicePayment(invoice);
            console.log(
              "[payment/activate-subscription] Recorded initial payment for invoice:",
              invoice.id,
            );
          }
        } catch (invoiceErr: unknown) {
          const invoiceMsg = invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr);
          console.warn(
            "[payment/activate-subscription] Could not record initial payment:",
            invoiceMsg,
          );
          // Don't fail the response if we can't record the invoice — the subscription was created successfully
        }

        return c.json(
          {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
          },
          statusCode.Ok,
        );
      } catch (err: unknown) {
        console.error("[payment/activate-subscription]", err);

        if (err instanceof Error && "type" in err && (err as Record<string, unknown>).type === "StripeCardError") {
          return c.json(
            { errorCode: "PAYMENT_FAILED", message: err.message },
            statusCode.BadRequest,
          );
        }

        const msg2 = err instanceof Error ? err.message : "An unknown error occurred.";
        return c.json(
          {
            errorCode: "INTERNAL_SERVER_ERR",
            message: msg2,
          },
          statusCode.InternalServerError,
        );
      }
    },
  )

  /**
   * POST /api/payment/confirm
   * Manually verify a PaymentIntent status (used by upgrade flow).
   */
  .post(
    "/confirm",
    honoJwt,
    validate("json", z.object({ paymentIntentId: z.string() })),
    async (c) => {
      try {
        const { paymentIntentId } = c.req.valid("json");
        const intent = await retrievePaymentIntent(paymentIntentId);

        if (intent.status === "succeeded") {
          const { getStripe } = await import("@sv/services/stripe.service.js");
          const stripeClient = getStripe();

          const intentAny = intent as { invoice?: string | { id?: string } | null };
          if (intentAny.invoice) {
            const invoiceId =
              typeof intentAny.invoice === "string"
                ? intentAny.invoice
                : intentAny.invoice.id ?? "";
            const invoice = await stripeClient.invoices.retrieve(invoiceId, {
              expand: ["payments.data.payment.payment_intent"],
            });

            const invoiceAny = invoice as { subscription?: string | { id?: string } | null; parent?: { subscription_details?: { subscription?: string | { id?: string } | null } } };
            const invoiceSubscription =
              invoiceAny.subscription ??
              invoiceAny.parent?.subscription_details?.subscription;
            if (invoiceSubscription) {
              const subId =
                typeof invoiceSubscription === "string"
                  ? invoiceSubscription
                  : invoiceSubscription.id ?? "";
              const subscription =
                await stripeClient.subscriptions.retrieve(subId);

              const sub = await upsertSubscription(subscription);
              await recordInvoicePayment(invoice);

              return c.json(
                { success: true, subscription: sub },
                statusCode.Ok,
              );
            }
          }
          return c.json(
            { success: true, message: "No subscription attached." },
            statusCode.Ok,
          );
        }

        return c.json(
          { success: false, status: intent.status },
          statusCode.BadRequest,
        );
      } catch (err: unknown) {
        console.error("[payment/confirm]", err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )

  /**
   * POST /api/payment/cancel
   */
  .post(
    "/cancel",
    honoJwt,
    userExtract,
    validate("json", z.object({ subscriptionId: z.string() })),
    async (c) => {
      try {
        const { id: userId } = c.get("userPayload");

        const { subscriptionId } = c.req.valid("json");

        const [sub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
        if (!sub || sub.userId !== userId) {
          return c.json(
            { errorCode: "NOT_FOUND", message: "Subscription not found" },
            statusCode.NotFound,
          );
        }

        if (!isStripeManagedSubscription(subscriptionId)) {
          return c.json(
            {
              errorCode: "UNSUPPORTED_SUBSCRIPTION_PROVIDER",
              message: "This subscription is not managed by Stripe.",
            },
            statusCode.BadRequest,
          );
        }

        const { cancelSubscription } = await import(
          "@sv/services/stripe.service.js"
        );
        const updatedSub = await cancelSubscription(subscriptionId);
        const syncedSubscription = await upsertSubscription(updatedSub);

        return c.json(
          {
            success: true,
            status: updatedSub.status,
            cancel_at_period_end: updatedSub.cancel_at_period_end,
            subscription: syncedSubscription,
          },
          statusCode.Ok,
        );
      } catch (err: unknown) {
        console.error("[payment/cancel]", err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )

  /**
   * POST /api/payment/upgrade-preview
   */
  .post(
    "/upgrade-preview",
    honoJwt,
    userExtract,
    validate(
      "json",
      z.object({
        subscriptionId: z.string(),
        newTier: z.enum(["Lite", "Plus", "Pro"]),
        interval: z.enum(["monthly", "yearly"]).optional(),
      }),
    ),
    async (c) => {
      try {
        const { id: userId } = c.get("userPayload");
        const { subscriptionId, newTier, interval } = c.req.valid("json");
        const [sub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

        if (!sub || sub.userId !== userId) {
          return c.json(
            { errorCode: "NOT_FOUND", message: "Subscription not found" },
            statusCode.NotFound,
          );
        }
        if (!isStripeManagedSubscription(subscriptionId)) {
          return c.json(
            {
              errorCode: "UNSUPPORTED_SUBSCRIPTION_PROVIDER",
              message: "This subscription is not managed by Stripe.",
            },
            statusCode.BadRequest,
          );
        }

        const { previewSubscriptionUpgrade } = await import(
          "@sv/services/stripe.service.js"
        );
        return c.json(
          await previewSubscriptionUpgrade(subscriptionId, newTier, interval),
          statusCode.Ok,
        );
      } catch (err: unknown) {
        console.error("[payment/upgrade-preview]", err);
        return c.json(setErr("INTERNAL_SERVER_ERR"), statusCode.InternalServerError);
      }
    },
  )

  /**
   * POST /api/payment/upgrade
   */
  .post(
    "/upgrade",
    honoJwt,
    userExtract,
    validate(
      "json",
      z.object({
        subscriptionId: z.string(),
        newTier: z.enum(["Lite", "Plus", "Pro"]),
        prorationDate: z.number().int().positive().optional(),
        interval: z.enum(["monthly", "yearly"]).optional(),
      }),
    ),
    async (c) => {
      try {
        const { id: userId } = c.get("userPayload");

        const { subscriptionId, newTier, prorationDate, interval } = c.req.valid("json");
        if (
          prorationDate &&
          Math.abs(Math.floor(Date.now() / 1000) - prorationDate) > 600
        ) {
          return c.json(
            { errorCode: "STALE_UPGRADE_PREVIEW", message: "Upgrade preview has expired." },
            statusCode.BadRequest,
          );
        }

        const [sub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
        if (!sub || sub.userId !== userId) {
          return c.json(
            { errorCode: "NOT_FOUND", message: "Subscription not found" },
            statusCode.NotFound,
          );
        }

        if (!isStripeManagedSubscription(subscriptionId)) {
          return c.json(
            {
              errorCode: "UNSUPPORTED_SUBSCRIPTION_PROVIDER",
              message: "This subscription is not managed by Stripe.",
            },
            statusCode.BadRequest,
          );
        }

        const { upgradeSubscription } = await import(
          "@sv/services/stripe.service.js"
        );
        const { subscription, invoice, clientSecret, applied, processing } = await upgradeSubscription(
          subscriptionId,
          newTier,
          prorationDate,
          interval,
        );

        if (applied) {
          await upsertSubscription(subscription);
          if (invoice) await recordInvoicePayment(invoice);
        }

        return c.json(
          {
            success: applied,
            applied,
            processing,
            subscriptionId: subscription.id,
            clientSecret,
            status: subscription.status,
          },
          statusCode.Ok,
        );
      } catch (err: unknown) {
        console.error("[payment/upgrade]", err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )

  /**
   * GET /api/payment/solana-quote?tier=Lite
   *
   * Authoritative SOL amount for a tier. The client MUST use this instead of
   * computing the amount itself — under live pricing a client-side rate would
   * drift from the server's and the payment would be rejected on verification.
   */
  .get(
    "/solana-quote",
    honoJwt,
    validate("query", z.object({ tier: z.enum(["Lite", "Plus", "Pro"]) })),
    async (c) => {
      const { tier } = c.req.valid("query");

      try {
        const { getExpectedPayment } = await import(
          "@sv/services/solana-payment.service.js"
        );
        const { amountSol, solPriceUsd, livePricing } = await getExpectedPayment(tier);

        return c.json(
          {
            tier,
            amountSol,
            solPriceUsd,
            amountUsd: solPriceUsd === null ? null : amountSol * solPriceUsd,
            livePricing,
          },
          statusCode.Ok,
        );
      } catch (err: unknown) {
        console.error("[payment/solana-quote] Could not resolve SOL price:", err);
        return c.json(
          {
            errorCode: "SOL_PRICE_UNAVAILABLE",
            message: "Live SOL price is temporarily unavailable. Please try again.",
          },
          statusCode.ServiceUnavailable,
        );
      }
    },
  )

  /**
   * POST /api/payments/verify-solana
   *
   * Verify a Solana Devnet transaction and create subscription.
   * 
   * Flow:
   *  1. Frontend sends txId (transaction signature)
   *  2. Backend fetches parsed transaction from Helius RPC
   *  3. Backend verifies:
   *     - Transaction was successful
   *     - Correct recipient (merchant address)
   *     - Correct amount of lamports transferred
   *  4. Backend creates subscription for user
   */
  .post(
    "/verify-solana",
    honoJwt,
    validate(
      "json",
      z.object({
        txId: z.string().min(64).max(128), // Solana tx signature
        tier: z.enum(["Lite", "Plus", "Pro"]),
        network: z.enum(["devnet", "testnet", "mainnet-beta"]).default("devnet"),
      })
    ),
    async (c) => {
      try {
        const payload = c.get("jwtPayload") as { id?: string } | undefined;
        const userId = payload?.id;
        if (!userId)
          return c.json(
            setErr("INVALID_TOKEN_PAYLOAD"),
            statusCode.Unauthorized,
          );

        const user = await getUserById(userId);
        if (!user)
          return c.json(
            setErr("INVALID_TOKEN_PAYLOAD"),
            statusCode.Unauthorized,
          );

        const { txId, tier, network } = c.req.valid("json");

        // Import Solana verification service
        const { verifySolanaTransaction } = await import(
          "@sv/services/solana-payment.service.js"
        );

        // Verify transaction
        const verification = await verifySolanaTransaction(txId, tier, network);

        if (!verification.valid) {
          console.warn("[payment/verify-solana] Transaction verification failed:", {
            txId,
            tier,
            reason: verification.reason,
          });
          return c.json(
            {
              errorCode: "PAYMENT_VERIFICATION_FAILED",
              message: verification.reason || "Transaction could not be verified.",
            },
            statusCode.BadRequest,
          );
        }

        // Create subscription in database directly (bypasses Stripe-specific upsertSubscription)
        const solanaTxKey = `solana-${txId}`;
        const solanaCustomerKey = `solana-${userId}`;
        const periodStart = new Date();
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        const [existing] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, solanaTxKey))
          .limit(1);

        let result;
        if (!existing) {
          const [inserted] = await db
            .insert(subscriptions)
            .values({
              userId,
              stripeSubscriptionId: solanaTxKey,
              stripeCustomerId: solanaCustomerKey,
              status: "active",
              planTier: tier,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            })
            .returning();
          result = inserted;
        } else {
          const [updated] = await db
            .update(subscriptions)
            .set({
              status: "active",
              planTier: tier,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, solanaTxKey))
            .returning();
          result = updated;
        }

        // Record payment in history
        try {
          await db.insert(paymentHistory).values({
            userId,
            // subscriptionId intentionally omitted — Solana payments use solanaTxKey, not a UUID FK
            amountCents: Math.floor((verification.amountUsd ?? 0) * 100),
            currency: "usd",
            status: "succeeded",
            paymentMethodDetails: {
              type: "solana_transfer",
              txId,
              amount: verification.amountSol ?? 0,
              merchant: verification.merchantAddress,
            },
          });
        } catch (histErr: unknown) {
          const histMsg = histErr instanceof Error ? histErr.message : String(histErr);
          console.warn("[payment/verify-solana] Could not record payment history:", histMsg);
          // Don't fail the response if we can't record history
        }

        console.log("[payment/verify-solana] Subscription created:", result.stripeSubscriptionId);

        return c.json(
          {
            success: true,
            subscriptionId: result.stripeSubscriptionId,
            status: result.status,
            txId,
          },
          statusCode.Ok,
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "An unknown error occurred.";
        console.error("[payment/verify-solana]", err);
        return c.json(
          {
            errorCode: "INTERNAL_SERVER_ERR",
            message: errMsg,
          },
          statusCode.InternalServerError,
        );
      }
    },
  );

export default app;
export type PaymentAppType = typeof app;
