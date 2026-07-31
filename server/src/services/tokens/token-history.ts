import { validateApiResult } from "@sv/middlewares/validation.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as cg from "@sv/util/util-coingecko.js";
import {
    cg_TokenMarketChartSchema
} from "../_types/token-raw-responses.js";
import { getCoinGeckoIdsByAddresses } from "./token-list.js";

export type HistoricalDataPoint = {
  dateStr: string;
  timestampMs: number;
  price: number | null;
  marketCap: number | null;
  volume: number | null;
};

export async function getTokenHistoricalData(
  tokenAddress: string,
  days: number,
): Promise<HistoricalDataPoint[] | null> {
  const cgIdLookup = await getCoinGeckoIdsByAddresses([tokenAddress]);
  const cgId = cgIdLookup?.[tokenAddress];

  if (!cgId) return null;

  const cgEndpoint = cg.getEndpoint(`/coins/${cgId}/market_chart`);
  cgEndpoint.search = new URLSearchParams({
    vs_currency: "usd",
    days: days.toString(),
    interval: "daily",
    precision: "full",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.token_history", cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  if (!resp.ok) return null;

  const data = await validateApiResult(cg_TokenMarketChartSchema, resp);

  if (!data) return null;

  return data.prices.map(([ts, price], i): HistoricalDataPoint => {
    const date = new Date(ts);
    const dateStr = date.toISOString().slice(0, 10);
    return {
      dateStr,
      timestampMs: ts,
      price,
      marketCap: data.market_caps[i]?.[1] ?? null,
      volume: data.total_volumes[i]?.[1] ?? null,
    };
  });
}
