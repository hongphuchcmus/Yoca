import env from "./load-env";
import Bottleneck from "bottleneck";
import { defineProvider } from "./rate-limit.js";

// For when u want a quick api test:
// delete this when you want to be proffesional
// apiKeyTransformed: "emtfMWZiYjg0MTNiZDgzNDJmNWE0MGY0YTE0N2I5ZWQyNmE6"
//   curl --request GET \
// --url 'https://api.zerion.io/v1/wallets/3nMNd89AxwHUa1AFvQGqohRkxFEQsTsgiEyEyqXFHyyH/charts/day?currency=usd&filter[positions]=only_simple&filter[chain_ids]=solana&filter[fungible_ids]=solana' \
// --header 'Authorization: Basic emtfMWZiYjg0MTNiZDgzNDJmNWE0MGY0YTE0N2I5ZWQyNmE6'
// curl --request GET \
//   --url 'https://api.zerion.io/v1/wallets/4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk/transactions/?currency=usd&filter%5Bchain_ids%5D=solana&filter%5Boperation_types%5D=trade&filter%5Btrash%5D=no_filter&page%5Bafter%5D=5bq8EoXtrC5VZJPUS2XNppo2W7V5HbTkVoU5AV5bYfEFHK8dDbjhUMp38ESnwXGesERfzFnzdK9dKT3zyd1AuXhK&page%5Bsize%5D=50' \
//   --header 'Authorization: Basic emtfMWZiYjg0MTNiZDgzNDJmNWE0MGY0YTE0N2I5ZWQyNmE6'

const apiKey = env.ZERION_API_KEY;
const apiKeyTransformed = btoa(apiKey + ":");

export function getEndpoint(path: string): URL {
  return new URL(`${env.ZERION_API_BASE_URL}${path}`);
}

export function getRequiredHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    Authorization: `Basic ${apiKeyTransformed}`,
  };

  return headers;
}

// Free plan: 1 rps, 300 reqs per day
export const limiter = new Bottleneck({
  reservoir: 300, // 300 requests per day
  reservoirRefreshAmount: 300,
  reservoirRefreshInterval: 24 * 60 * 60 * 1000, // 24h
  maxConcurrent: 1, // only one at a time
  minTime: 1100, // 1.1 seconds → safe margin
  waitForReservoir: true, // wait if daily limit is exhausted
});

export const spec = defineProvider({
  id: "zerion",
  limiter,
});

export type ZRN_ChartPeriod =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "3months"
  | "6months"
  | "year"
  | "5years"
  | "max";
