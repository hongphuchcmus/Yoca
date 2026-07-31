import type { ApiKeyMetadata } from "@sv/services/tracking/apiCallTracker.types.js";
import { defineProvider } from "@sv/util/rate-limit.js";
import Bottleneck from "bottleneck";
import { apiKeyManager, buildApiKeyMetadata } from "./api-key-manager.js";
import env from "./load-env.js";
const BIRDEYE_SERVICE_NAME = "birdeye";
let birdeyeKeysInitialized = false;

export function getEndpoint(path: string): URL {
  return new URL(`${env.BIRDEYE_API_BASE_URL}${path}`);
}

export function getRequiredHeaders(): Record<string, string> {
  if (!birdeyeKeysInitialized) {
    apiKeyManager.initializeKeys(BIRDEYE_SERVICE_NAME, env.BIRDEYE_API_KEY);
    birdeyeKeysInitialized = true;
  }

  const apiKey = apiKeyManager.getNextKey(BIRDEYE_SERVICE_NAME);
  if (!apiKey) {
    throw new Error("BIRDEYE_API_KEY is not set");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-KEY": apiKey,
    "x-chain": "solana",
  };

  return headers;
}

export function getRequiredHeadersWithMetadata(): {
  headers: Record<string, string>;
  apiKey: ApiKeyMetadata | null;
} {
  if (!birdeyeKeysInitialized) {
    apiKeyManager.initializeKeys(
      BIRDEYE_SERVICE_NAME,
      env.BIRDEYE_API_KEY,
    );
    birdeyeKeysInitialized = true;
  }

  const apiKey = apiKeyManager.getNextKey(BIRDEYE_SERVICE_NAME);
  if (!apiKey) {
    throw new Error("BIRDEYE_API_KEY is not set");
  }

  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-KEY": apiKey,
      "x-chain": "solana",
    },
    apiKey: buildApiKeyMetadata(apiKey, "BIRDEYE_API_KEY"),
  };
}

export function normalizeBirdeyeTimeParam(time?: string): string | undefined {
  if (!time) {
    return undefined;
  }

  const trimmed = time.trim();
  if (!trimmed) {
    return undefined;
  }

  // Birdeye expects: YYYY-MM-DD HH:mm:ss
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedMs)) {
    return undefined;
  }

  const date = new Date(parsedMs);
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

export const limiter = new Bottleneck({
  reservoir: 1,
  reservoirRefreshAmount: 1,
  reservoirRefreshInterval: 1000,
  maxConcurrent: 1,
  minTime: 1000,
});

export const spec = defineProvider({
  id: "birdeye",
  limiter,
});
