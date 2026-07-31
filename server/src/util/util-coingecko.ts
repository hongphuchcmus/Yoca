import Bottleneck from "bottleneck";
import { defineProvider } from "./rate-limit.js";
import env from "./load-env";

export const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1200,
});

export const spec = defineProvider({
  id: "coingecko",
  limiter,
});

export function getEndpoint(path: string): URL {
  return new URL(`${env.COINGECKO_API_BASE_URL}${path}`);
}

export function getOnchainEndpoint(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(
    `${env.COINGECKO_API_BASE_URL}/onchain/${normalizedPath}`,
  );
}

export function getRequiredHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-cg-demo-api-key": env.COINGECKO_API_KEY,
  };

  return headers;
}
