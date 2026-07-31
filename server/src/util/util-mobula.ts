import Bottleneck from "bottleneck";
import { defineProvider } from "./rate-limit.js";
import env from "./load-env.js";

export const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1_000,
});

export const spec = defineProvider({
  id: "mobula",
  limiter,
});

export function getEndpoint(path: string): URL {
  const baseUrl = env.MOBULA_API_BASE_URL.endsWith("/")
    ? env.MOBULA_API_BASE_URL.slice(0, -1)
    : env.MOBULA_API_BASE_URL;
  const endpointPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${baseUrl}${endpointPath}`);
}

export function getRequiredHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: env.MOBULA_API_KEY,
  };
}
