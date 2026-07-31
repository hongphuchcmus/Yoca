import type { ApiKeyMetadata } from "@sv/services/tracking/apiCallTracker.types.js";
import { defineProvider } from "@sv/util/rate-limit.js";
import Bottleneck from "bottleneck";
import { apiKeyManager, buildApiKeyMetadata } from "./api-key-manager.js";
import env from "./load-env.js";

// ponytail: assumes Helius free tier (2 req/s for Enhanced/REST & Wallet API); raise reservoir/lower minTime if on a paid tier
export const limiter = new Bottleneck({
  reservoir: 2,
  reservoirRefreshAmount: 2,
  reservoirRefreshInterval: 1000,
  maxConcurrent: 2,
});

export const spec = defineProvider({
  id: "helius",
  limiter,
});

const HELIUS_SERVICE_NAME = "helius";
let heliusKeysInitialized = false;

export function getEndpoint(path: string): URL {
  const base = env.HELIUS_API_BASE_URL;
  return new URL(`${base}${path}`);
}

export function getRequiredHeaders() {
  if (!heliusKeysInitialized) {
    apiKeyManager.initializeKeys(
      HELIUS_SERVICE_NAME,
      env.HELIUS_API_KEY,
    );
    heliusKeysInitialized = true;
  }

  const apiKey = apiKeyManager.getNextKey(HELIUS_SERVICE_NAME);
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is not set");
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-Key": apiKey,
  };
}

export function getNextkey() {
  if (!heliusKeysInitialized) {
    apiKeyManager.initializeKeys(
      HELIUS_SERVICE_NAME,
      env.HELIUS_API_KEY,
    );
    heliusKeysInitialized = true;
  }

  const apiKey = apiKeyManager.getNextKey(HELIUS_SERVICE_NAME);
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is not set");
  }

  return apiKey
}

export function getRequiredHeadersWithMetadata(): {
  headers: Record<string, string>;
  apiKey: ApiKeyMetadata | null;
} {
  if (!heliusKeysInitialized) {
    apiKeyManager.initializeKeys(
      HELIUS_SERVICE_NAME,
      env.HELIUS_API_KEY,
    );
    heliusKeysInitialized = true;
  }

  const apiKey = apiKeyManager.getNextKey(HELIUS_SERVICE_NAME);
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is not set");
  }

  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    apiKey: buildApiKeyMetadata(apiKey, "HELIUS_API_KEY"),
  };
}
