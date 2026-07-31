import type { ApiKeyMetadata } from "@sv/services/tracking/apiCallTracker.types.js";
import { defineProvider } from "@sv/util/rate-limit.js";
import { apiKeyManager, buildApiKeyMetadata } from "./api-key-manager.js";
import Bottleneck from "bottleneck";
import env from "./load-env.js";

const MORALIS_SERVICE_NAME = "moralis";
let moralisKeysInitialized = false;

export const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 100,
});

export const spec = defineProvider({
  id: "moralis",
  limiter,
});

function buildEndpoint(base: string, path: string): URL {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${normalizedBase}${normalizedPath}`);
}

function resolveBaseUrl(): string {
  return env.MORALIS_API_BASE_URL;
}

export function getEndpoint(path: string): URL {
  return buildEndpoint(resolveBaseUrl(), path);
}

export function getRequiredHeaders() {
  if (!moralisKeysInitialized) {
    apiKeyManager.initializeKeys(
      MORALIS_SERVICE_NAME,
      env.MORALIS_API_KEY,
    );
    moralisKeysInitialized = true;
  }

  const apiKey = apiKeyManager.getNextKey(MORALIS_SERVICE_NAME);
  if (!apiKey) {
    throw new Error("MORALIS_API_KEY is not set");
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-Key": apiKey,
  };
}

export function getRequiredHeadersWithMetadata(): {
  headers: Record<string, string>;
  apiKey: ApiKeyMetadata | null;
} {
  if (!moralisKeysInitialized) {
    apiKeyManager.initializeKeys(
      MORALIS_SERVICE_NAME,
      env.MORALIS_API_KEY,
    );
    moralisKeysInitialized = true;
  }

  const apiKey = apiKeyManager.getNextKey(MORALIS_SERVICE_NAME);
  if (!apiKey) {
    throw new Error("MORALIS_API_KEY is not set");
  }

  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    apiKey: buildApiKeyMetadata(apiKey, "MORALIS_API_KEY"),
  };
}
