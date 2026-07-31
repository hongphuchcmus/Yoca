import {
    MAX_HELIUS_WEBHOOK_ADDRESSES,
    syncHeliusWebhookAccountAddresses,
    type HeliusWebhookSyncDependencies,
    type ManagedHeliusWebhook,
} from "@sv/services/heliusWebhooks.service.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sv/util/load-env.js", () => ({
  default: {
    HELIUS_API_KEY: "test-helius-key",
    HELIUS_API_BASE_URL: "https://api.helius.xyz",
    HELIUS_WEBHOOK_AUTH_KEY: "test-webhook-auth",
    WEBHOOK_PUBLIC_URL: "https://alerts.example.com",
  },
}));

const WEBHOOK_URL = "https://alerts.example.com/webhook";

function managedWebhook(
  accountAddresses: string[],
  heliusWebhookId = "managed-hook",
): ManagedHeliusWebhook {
  return {
    id: 1,
    heliusWebhookId,
    webhookUrl: WEBHOOK_URL,
    webhookType: "enhanced",
    transactionTypes: ["ANY"],
    accountAddresses,
    status: "active",
  };
}

function dependencies(
  addresses: string[],
  existing: ManagedHeliusWebhook[] = [],
  overrides: Partial<HeliusWebhookSyncDependencies> = {},
): HeliusWebhookSyncDependencies {
  return {
    withSyncLock: async <T>(work: () => Promise<T>) => work(),
    loadWatchedAddresses: vi.fn().mockResolvedValue(addresses),
    listManagedWebhooksFromDb: vi.fn().mockResolvedValue(existing),
    createWebhook: vi.fn().mockResolvedValue("created-hook"),
    updateWebhook: vi.fn().mockResolvedValue(undefined),
    deleteWebhook: vi.fn().mockResolvedValue(undefined),
    persistManagedState: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Helius managed webhook synchronization", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps an empty configuration unchanged", async () => {
    const deps = dependencies([]);

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({
      ok: true,
      action: "unchanged",
      totalAddresses: 0,
      managedWebhooks: 0,
    });
    expect(deps.createWebhook).not.toHaveBeenCalled();
    expect(deps.persistManagedState).toHaveBeenCalledWith(null, []);
  });

  it("creates one webhook with normalized watched addresses", async () => {
    const deps = dependencies([" WalletB ", "WalletA", "WalletB", ""]);

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({
      ok: true,
      action: "created",
      totalAddresses: 2,
      managedWebhooks: 1,
      createdWebhookIds: ["created-hook"],
    });
    expect(deps.createWebhook).toHaveBeenCalledWith(["WalletA", "WalletB"]);
    expect(deps.persistManagedState).toHaveBeenCalledWith(
      expect.objectContaining({
        heliusWebhookId: "created-hook",
        webhookUrl: WEBHOOK_URL,
        accountAddresses: ["WalletA", "WalletB"],
      }),
      [],
    );
  });

  it("does not spend an update request when desired state is unchanged", async () => {
    const current = managedWebhook(["WalletA", "WalletB"]);
    const deps = dependencies(["WalletB", "WalletA"], [current]);

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({ ok: true, action: "unchanged" });
    expect(deps.updateWebhook).not.toHaveBeenCalled();
    expect(deps.deleteWebhook).not.toHaveBeenCalled();
  });

  it("updates the managed webhook when watched addresses change", async () => {
    const current = managedWebhook(["WalletA"]);
    const deps = dependencies(["WalletA", "WalletB"], [current]);

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({
      ok: true,
      action: "updated",
      updatedWebhookIds: ["managed-hook"],
    });
    expect(deps.updateWebhook).toHaveBeenCalledWith("managed-hook", [
      "WalletA",
      "WalletB",
    ]);
  });

  it("deletes the managed webhook after the final address is removed", async () => {
    const current = managedWebhook(["WalletA"]);
    const deps = dependencies([], [current]);

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({
      ok: true,
      action: "deleted",
      managedWebhooks: 0,
      deletedWebhookIds: ["managed-hook"],
    });
    expect(deps.deleteWebhook).toHaveBeenCalledWith("managed-hook");
    expect(deps.persistManagedState).toHaveBeenCalledWith(null, [
      "managed-hook",
    ]);
  });

  it("removes extra legacy rows while retaining the current webhook", async () => {
    const current = managedWebhook(["WalletA"]);
    const extra = managedWebhook(["WalletA"], "extra-hook");
    const deps = dependencies(["WalletA"], [current, extra]);

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({
      ok: true,
      action: "updated",
      deletedWebhookIds: ["extra-hook"],
    });
    expect(deps.updateWebhook).not.toHaveBeenCalled();
    expect(deps.deleteWebhook).toHaveBeenCalledWith("extra-hook");
  });

  it("rejects address sets above the Helius webhook limit", async () => {
    const addresses = Array.from(
      { length: MAX_HELIUS_WEBHOOK_ADDRESSES + 1 },
      (_, index) => `Wallet${index}`,
    );
    const deps = dependencies(addresses);

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({
      ok: false,
      totalAddresses: MAX_HELIUS_WEBHOOK_ADDRESSES + 1,
    });
    expect(deps.createWebhook).not.toHaveBeenCalled();
    expect(deps.persistManagedState).not.toHaveBeenCalled();
  });

  it("does not persist partial state when a provider mutation fails", async () => {
    const deps = dependencies(["WalletA"], [], {
      createWebhook: vi.fn().mockRejectedValue(new Error("create failed")),
    });

    const result = await syncHeliusWebhookAccountAddresses(deps);

    expect(result).toMatchObject({ ok: false, error: "create failed" });
    expect(deps.persistManagedState).not.toHaveBeenCalled();
  });
});
