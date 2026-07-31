import { db } from "@sv/db/index.js";
import {
  alertRules,
  followedWallets,
  heliusWebhookAddresses,
  heliusWebhooks,
  type HeliusWebhookRow,
} from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { hls_WebhookSchema } from "@sv/services/_types/wallet-raw-responses.js";
import "@sv/util/date.js";
import env from "@sv/util/load-env.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as helius from "@sv/util/util-helius.js";
import dayjs from "dayjs";
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";

export const MAX_HELIUS_WEBHOOK_ADDRESSES = 100_000;
const DEFAULT_WEBHOOK_TYPE = "enhanced";
const DEFAULT_TRANSACTION_TYPES = ["ANY"];

export interface ManagedHeliusWebhook {
  id?: number;
  heliusWebhookId: string;
  webhookUrl: string;
  webhookType: string;
  transactionTypes: string[];
  accountAddresses: string[];
  status: string;
}

export interface ManagedHeliusWebhookAssignment {
  heliusWebhookId: string;
  webhookUrl: string;
  webhookType: string;
  transactionTypes: string[];
  accountAddresses: string[];
  status: "active";
}

export type HeliusSyncResult =
  | {
      ok: true;
      status: number;
      action: "created" | "updated" | "unchanged" | "deleted";
      totalAddresses: number;
      managedWebhooks: number;
      createdWebhookIds: string[];
      updatedWebhookIds: string[];
      deletedWebhookIds: string[];
    }
  | {
      ok: false;
      status?: number;
      error: string;
      totalAddresses?: number;
      managedWebhooks?: number;
      createdWebhookIds?: string[];
      updatedWebhookIds?: string[];
      deletedWebhookIds?: string[];
    };

export interface HeliusWebhookDiagnostics {
  totalWatchedAddressCount: number;
  maxAddressesPerWebhook: number;
  managedWebhookCount: number;
  managedWebhook: {
    heliusWebhookId: string;
    status: string;
    addressCount: number;
  } | null;
  publicWebhookUrlConfigured: boolean;
  publicWebhookUrlLooksLocalhost: boolean;
  lastSyncStatus: "ok" | "error" | null;
  lastSyncError: string | null;
  lastSuccessfulSyncAt: string | null;
  warnings: string[];
  configured: {
    publicWebhookUrl: boolean;
    heliusApiKey: boolean;
    heliusWebhookAuthKey: boolean;
  };
}

export interface HeliusWebhookSyncDependencies {
  withSyncLock: <T>(work: () => Promise<T>) => Promise<T>;
  loadWatchedAddresses: () => Promise<string[]>;
  listManagedWebhooksFromDb: () => Promise<ManagedHeliusWebhook[]>;
  createWebhook: (addresses: string[]) => Promise<string>;
  updateWebhook: (
    heliusWebhookId: string,
    addresses: string[],
  ) => Promise<void>;
  deleteWebhook: (heliusWebhookId: string) => Promise<void>;
  persistManagedState: (
    assignment: ManagedHeliusWebhookAssignment | null,
    deletedWebhookIds: string[],
  ) => Promise<void>;
}

export interface HeliusWebhookDeleteResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

let lastSyncResult: HeliusSyncResult | null = null;
let lastSuccessfulSyncAt: Date | null = null;

class HeliusWebhookHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "HeliusWebhookHttpError";
  }
}

export async function withManagedWebhookSyncLock<T>(
  work: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('helius_managed_webhook_sync'))`,
    );
    return work();
  });
}

function heliusApiKey(): string {
  return env.HELIUS_API_KEY;
}

function heliusApiBase(): string {
  return env.HELIUS_API_BASE_URL;
}

function webhookAuthHeader(): string {
  return env.HELIUS_WEBHOOK_AUTH_KEY;
}

function publicWebhookBaseUrl(): string {
  return env.WEBHOOK_PUBLIC_URL;
}

function isLocalhostWebhookUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      url.hostname == "localhost" ||
      url.hostname == "127.0.0.1" ||
      url.hostname == "::1" ||
      url.hostname.endsWith(".localhost")
    );
  } catch {
    return /\blocalhost\b|127\.0\.0\.1|\[?::1\]?/.test(value);
  }
}

export function getManagedWebhookUrl(): string {
  const base = publicWebhookBaseUrl().replace(/\/+$/, "");
  if (!base) return "";
  return base.endsWith("/webhook") ? base : `${base}/webhook`;
}

function heliusWebhooksUrl(): URL {
  const endpoint = new URL("/v0/webhooks", heliusApiBase());
  endpoint.searchParams.set("api-key", heliusApiKey());
  return endpoint;
}

function heliusWebhookUrl(heliusWebhookId: string): URL {
  const endpoint = new URL(
    `/v0/webhooks/${encodeURIComponent(heliusWebhookId)}`,
    heliusApiBase(),
  );
  endpoint.searchParams.set("api-key", heliusApiKey());
  return endpoint;
}

function normalizeAddress(value: unknown): string | null {
  if (typeof value != "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeWatchedAddresses(addresses: string[]): string[] {
  const normalized = addresses
    .map(normalizeAddress)
    .filter((value): value is string => value != null);
  return [...new Set(normalized)].sort();
}

function webhookBody(addresses: string[]) {
  return {
    webhookURL: getManagedWebhookUrl(),
    transactionTypes: DEFAULT_TRANSACTION_TYPES,
    accountAddresses: addresses,
    webhookType: DEFAULT_WEBHOOK_TYPE,
    authHeader: webhookAuthHeader(),
  };
}

async function readErrorResponse(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.slice(0, 1000) || `Helius HTTP ${response.status}`;
}

async function heliusHttpError(
  response: Response,
): Promise<HeliusWebhookHttpError> {
  const body = await readErrorResponse(response);
  return new HeliusWebhookHttpError(body, response.status, body);
}

function isHeliusWebhookNotFound(error: unknown): boolean {
  return error instanceof HeliusWebhookHttpError && error.status == 404;
}

function sameStrings(left: string[], right: string[]): boolean {
  if (left.length != right.length) return false;
  return left.every((value, index) => value == right[index]);
}

function matchesDesiredState(
  existing: ManagedHeliusWebhook,
  addresses: string[],
  webhookUrl: string,
): boolean {
  return (
    existing.webhookUrl == webhookUrl &&
    existing.webhookType == DEFAULT_WEBHOOK_TYPE &&
    sameStrings(
      [...existing.transactionTypes].sort(),
      [...DEFAULT_TRANSACTION_TYPES].sort(),
    ) &&
    sameStrings(
      normalizeWatchedAddresses(existing.accountAddresses),
      addresses,
    )
  );
}

export async function loadWatchedAddresses(): Promise<string[]> {
  const now = dayjs.utc().toDate();
  const followed = await db
    .select({ address: followedWallets.address })
    .from(followedWallets);
  const rules = await db
    .select({ address: alertRules.walletAddress })
    .from(alertRules)
    .where(
      and(
        gt(alertRules.expiryDate, now),
        or(
          eq(alertRules.triggerType, "ALWAYS"),
          and(
            eq(alertRules.triggerType, "ONCE"),
            isNull(alertRules.oneShotFiredAt),
          ),
        ),
      ),
    );

  return normalizeWatchedAddresses([
    ...followed.map((row) => row.address),
    ...rules.map((row) => row.address),
  ]);
}

function mapWebhookRow(row: HeliusWebhookRow): ManagedHeliusWebhook {
  return {
    id: row.id,
    heliusWebhookId: row.heliusWebhookId,
    webhookUrl: row.webhookUrl,
    webhookType: row.webhookType,
    transactionTypes: row.transactionTypes,
    accountAddresses: row.accountAddresses,
    status: row.status,
  };
}

export async function listManagedWebhooksFromDb(): Promise<
  ManagedHeliusWebhook[]
> {
  const rows = await db
    .select()
    .from(heliusWebhooks)
    .where(ne(heliusWebhooks.status, "deleted"))
    .orderBy(asc(heliusWebhooks.id));
  return rows.map(mapWebhookRow);
}

export async function createWebhook(addresses: string[]): Promise<string> {
  const response = await pFetch(
    helius.spec,
    "helius.svc.webhook_create",
    heliusWebhooksUrl(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookBody(addresses)),
    },
  );
  if (!response.ok) {
    throw await heliusHttpError(response);
  }
  const parsed = await validateApiResult(hls_WebhookSchema, response);
  if (!parsed) {
    throw new Error("Helius create webhook response validation failed");
  }
  return parsed.webhookID;
}

export async function updateWebhook(
  heliusWebhookId: string,
  addresses: string[],
): Promise<void> {
  const response = await pFetch(
    helius.spec,
    "helius.svc.webhook_update",
    heliusWebhookUrl(heliusWebhookId),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookBody(addresses)),
    },
  );
  if (!response.ok) {
    throw await heliusHttpError(response);
  }
  const parsed = await validateApiResult(hls_WebhookSchema, response);
  if (!parsed) {
    throw new Error("Helius update webhook response validation failed");
  }
}

export async function deleteWebhook(heliusWebhookId: string): Promise<void> {
  const result = await deleteWebhookById(heliusWebhookId);
  if (!result.ok) {
    throw new Error(
      result.body ||
        result.error ||
        `Helius HTTP ${result.status ?? "unknown"}`,
    );
  }
}

export async function deleteWebhookById(
  heliusWebhookId: string,
): Promise<HeliusWebhookDeleteResult> {
  try {
    const response = await pFetch(
      helius.spec,
      "helius.svc.webhook_delete",
      heliusWebhookUrl(heliusWebhookId),
      { method: "DELETE" },
    );
    const body = await response.text().catch(() => "");
    if (!response.ok && response.status != 404) {
      return {
        ok: false,
        status: response.status,
        body: body.slice(0, 1000),
      };
    }
    return {
      ok: true,
      status: response.status,
      body: body.slice(0, 1000),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function persistManagedWebhookState(
  assignment: ManagedHeliusWebhookAssignment | null,
  deletedWebhookIds: string[],
): Promise<void> {
  const now = dayjs.utc().toDate();
  await db.transaction(async (tx) => {
    if (assignment) {
      await tx
        .insert(heliusWebhooks)
        .values({
          heliusWebhookId: assignment.heliusWebhookId,
          webhookUrl: assignment.webhookUrl,
          webhookType: assignment.webhookType,
          transactionTypes: assignment.transactionTypes,
          accountAddresses: assignment.accountAddresses,
          status: assignment.status,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: heliusWebhooks.heliusWebhookId,
          set: {
            webhookUrl: assignment.webhookUrl,
            webhookType: assignment.webhookType,
            transactionTypes: assignment.transactionTypes,
            accountAddresses: assignment.accountAddresses,
            status: assignment.status,
            updatedAt: now,
          },
        });

      await tx
        .delete(heliusWebhookAddresses)
        .where(
          eq(
            heliusWebhookAddresses.heliusWebhookId,
            assignment.heliusWebhookId,
          ),
        );
      if (assignment.accountAddresses.length > 0) {
        await tx.insert(heliusWebhookAddresses).values(
          assignment.accountAddresses.map((walletAddress) => ({
            heliusWebhookId: assignment.heliusWebhookId,
            walletAddress,
          })),
        );
      }
    }

    if (deletedWebhookIds.length > 0) {
      await tx
        .update(heliusWebhooks)
        .set({
          status: "deleted",
          accountAddresses: [],
          updatedAt: now,
        })
        .where(inArray(heliusWebhooks.heliusWebhookId, deletedWebhookIds));
      await tx
        .delete(heliusWebhookAddresses)
        .where(
          inArray(
            heliusWebhookAddresses.heliusWebhookId,
            deletedWebhookIds,
          ),
        );
    }
  });
}

function logSync(message: string, payload: Record<string, unknown>) {
  console.log(`[helius-webhook] ${message}`, JSON.stringify(payload));
}

function logSyncError(message: string, payload: Record<string, unknown>) {
  console.error(`[helius-webhook] ${message}`, JSON.stringify(payload));
}

function defaultDependencies(): HeliusWebhookSyncDependencies {
  return {
    withSyncLock: withManagedWebhookSyncLock,
    loadWatchedAddresses,
    listManagedWebhooksFromDb,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    persistManagedState: persistManagedWebhookState,
  };
}

export async function syncHeliusWebhookAccountAddresses(
  dependencies: Partial<HeliusWebhookSyncDependencies> = {},
): Promise<HeliusSyncResult> {
  const deps = { ...defaultDependencies(), ...dependencies };
  return deps.withSyncLock(() => syncManagedWebhook(deps));
}

async function syncManagedWebhook(
  deps: HeliusWebhookSyncDependencies,
): Promise<HeliusSyncResult> {
  const addresses = normalizeWatchedAddresses(await deps.loadWatchedAddresses());
  const existing = await deps.listManagedWebhooksFromDb();
  const webhookUrl = getManagedWebhookUrl();

  logSync("sync start", {
    totalUniqueWatchedAddresses: addresses.length,
    existingManagedWebhookCount: existing.length,
  });

  if (addresses.length > MAX_HELIUS_WEBHOOK_ADDRESSES) {
    const result: HeliusSyncResult = {
      ok: false,
      error: `Managed webhook supports at most ${MAX_HELIUS_WEBHOOK_ADDRESSES} addresses`,
      totalAddresses: addresses.length,
      managedWebhooks: existing.length,
    };
    lastSyncResult = result;
    return result;
  }

  if ((addresses.length > 0 || existing.length > 0) && !heliusApiKey()) {
    const result: HeliusSyncResult = {
      ok: false,
      error: "HELIUS_API_KEY is not set",
      totalAddresses: addresses.length,
      managedWebhooks: existing.length,
    };
    lastSyncResult = result;
    return result;
  }

  if (addresses.length > 0 && !webhookUrl) {
    const result: HeliusSyncResult = {
      ok: false,
      error: "WEBHOOK_PUBLIC_URL is not set",
      totalAddresses: addresses.length,
      managedWebhooks: existing.length,
    };
    lastSyncResult = result;
    return result;
  }

  if (addresses.length > 0 && !webhookAuthHeader()) {
    const result: HeliusSyncResult = {
      ok: false,
      error: "HELIUS_WEBHOOK_AUTH_KEY is not set",
      totalAddresses: addresses.length,
      managedWebhooks: existing.length,
    };
    lastSyncResult = result;
    return result;
  }

  const createdWebhookIds: string[] = [];
  const updatedWebhookIds: string[] = [];
  const deletedWebhookIds: string[] = [];
  let assignment: ManagedHeliusWebhookAssignment | null = null;
  let action: "created" | "updated" | "unchanged" | "deleted" =
    "unchanged";

  try {
    if (addresses.length == 0) {
      for (const managed of existing) {
        await deps.deleteWebhook(managed.heliusWebhookId);
        deletedWebhookIds.push(managed.heliusWebhookId);
      }
      if (deletedWebhookIds.length > 0) action = "deleted";
    } else {
      const current = existing[0];
      let webhookId: string;

      if (!current) {
        webhookId = await deps.createWebhook(addresses);
        createdWebhookIds.push(webhookId);
        action = "created";
      } else if (matchesDesiredState(current, addresses, webhookUrl)) {
        webhookId = current.heliusWebhookId;
      } else {
        try {
          await deps.updateWebhook(current.heliusWebhookId, addresses);
          webhookId = current.heliusWebhookId;
          updatedWebhookIds.push(webhookId);
          action = "updated";
        } catch (error) {
          if (!isHeliusWebhookNotFound(error)) throw error;
          webhookId = await deps.createWebhook(addresses);
          createdWebhookIds.push(webhookId);
          deletedWebhookIds.push(current.heliusWebhookId);
          action = "created";
        }
      }

      assignment = {
        heliusWebhookId: webhookId,
        webhookUrl,
        webhookType: DEFAULT_WEBHOOK_TYPE,
        transactionTypes: DEFAULT_TRANSACTION_TYPES,
        accountAddresses: addresses,
        status: "active",
      };

      for (const extra of existing.slice(1)) {
        await deps.deleteWebhook(extra.heliusWebhookId);
        deletedWebhookIds.push(extra.heliusWebhookId);
      }
      if (deletedWebhookIds.length > 0 && action == "unchanged") {
        action = "updated";
      }
    }

    await deps.persistManagedState(assignment, deletedWebhookIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: HeliusSyncResult = {
      ok: false,
      error: message,
      totalAddresses: addresses.length,
      managedWebhooks: existing.length,
      createdWebhookIds,
      updatedWebhookIds,
      deletedWebhookIds,
    };
    lastSyncResult = result;
    logSyncError("sync failed", { error: message });
    return result;
  }

  const result: HeliusSyncResult = {
    ok: true,
    status: 200,
    action,
    totalAddresses: addresses.length,
    managedWebhooks: assignment ? 1 : 0,
    createdWebhookIds,
    updatedWebhookIds,
    deletedWebhookIds,
  };
  lastSyncResult = result;
  lastSuccessfulSyncAt = dayjs.utc().toDate();
  logSync("sync complete", {
    action,
    totalUniqueWatchedAddresses: addresses.length,
    createdWebhookIds,
    updatedWebhookIds,
    deletedWebhookIds,
  });
  return result;
}

export async function getHeliusWebhookDiagnostics(): Promise<HeliusWebhookDiagnostics> {
  const [addresses, managed] = await Promise.all([
    loadWatchedAddresses(),
    listManagedWebhooksFromDb(),
  ]);
  const normalizedAddresses = normalizeWatchedAddresses(addresses);
  const activeManaged = managed.filter((item) => item.status == "active");
  const current = activeManaged[0];
  const publicWebhookUrl = publicWebhookBaseUrl();
  const publicWebhookUrlLooksLocalhost =
    isLocalhostWebhookUrl(publicWebhookUrl);
  const warnings: string[] = [];
  if (publicWebhookUrlLooksLocalhost) {
    warnings.push(
      "WEBHOOK_PUBLIC_URL is local; Helius requires a public HTTPS endpoint.",
    );
  }
  if (activeManaged.length > 1) {
    warnings.push(
      "More than one active managed webhook exists; run synchronization to remove extras.",
    );
  }

  return {
    totalWatchedAddressCount: normalizedAddresses.length,
    maxAddressesPerWebhook: MAX_HELIUS_WEBHOOK_ADDRESSES,
    managedWebhookCount: activeManaged.length,
    managedWebhook: current
      ? {
          heliusWebhookId: current.heliusWebhookId,
          status: current.status,
          addressCount: normalizeWatchedAddresses(current.accountAddresses)
            .length,
        }
      : null,
    publicWebhookUrlConfigured: Boolean(getManagedWebhookUrl()),
    publicWebhookUrlLooksLocalhost,
    lastSyncStatus: lastSyncResult
      ? lastSyncResult.ok
        ? "ok"
        : "error"
      : null,
    lastSyncError:
      lastSyncResult && !lastSyncResult.ok ? lastSyncResult.error : null,
    lastSuccessfulSyncAt: lastSuccessfulSyncAt?.toISOString() ?? null,
    warnings,
    configured: {
      publicWebhookUrl: Boolean(getManagedWebhookUrl()),
      heliusApiKey: Boolean(heliusApiKey()),
      heliusWebhookAuthKey: Boolean(webhookAuthHeader()),
    },
  };
}
