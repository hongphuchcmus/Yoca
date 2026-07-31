import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  processHeliusWebhookTransactions: vi.fn(),
}));

vi.mock("@sv/services/walletAlerts.service.js", () => ({
  processHeliusWebhookTransactions: serviceMocks.processHeliusWebhookTransactions,
}));
vi.mock("@sv/util/load-env.js", () => ({
  default: { HELIUS_WEBHOOK_AUTH_KEY: "route-auth" },
}));

import webhookRoute from "@sv/routes/webhook.js";

describe("Helius webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.processHeliusWebhookTransactions.mockResolvedValue({
      processed: 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes payloads from the managed Helius webhook", async () => {
    const payload = [{ signature: "sig-a", type: "TRANSFER" }];

    const first = await webhookRoute.request("/", {
      method: "POST",
      headers: {
        authorization: "route-auth",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(first.status).toBe(200);
    expect(serviceMocks.processHeliusWebhookTransactions).toHaveBeenCalledTimes(1);
    expect(serviceMocks.processHeliusWebhookTransactions).toHaveBeenCalledWith(
      payload,
      { dryRun: false, dedupe: true, log: true },
    );
  });
});
