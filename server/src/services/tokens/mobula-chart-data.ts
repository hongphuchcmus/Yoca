import * as mobula from "@sv/util/util-mobula.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { z } from "zod";

const mobulaPriceHistoryResponseSchema = z.object({
  data: z.object({
    priceHistory: z.array(z.tuple([z.number(), z.number()])),
    address: z.string(),
    chainId: z.string(),
  }),
});

export type MobulaTimeframe = "24h" | "7d" | "30d" | "1y";
type ChartPoint = { unixTimestampMs: number; price: number };

const MOBULA_CHART_TIMEOUT_MS = 10_000;

export async function getMobulaChartData(
  address: string,
  timeframe: MobulaTimeframe,
): Promise<ChartPoint[]> {
  if (!address) return [];

  const endpoint = mobula.getEndpoint("/2/token/price-history");
  endpoint.searchParams.set("address", address);
  endpoint.searchParams.set("chainId", "solana:solana");
  endpoint.searchParams.set("timeframe", timeframe);

  const resp = await pFetch(mobula.spec, "mobula.svc.token_price_chart", endpoint, {
    method: "GET",
    headers: mobula.getRequiredHeaders(),
    rlTimeoutMs: MOBULA_CHART_TIMEOUT_MS,
  });

  const res = await validateApiResult(mobulaPriceHistoryResponseSchema, resp);
  if (!res) return [];

  return res.data.priceHistory.map(([ts, price]) => ({
    unixTimestampMs: ts,
    price,
  }));
}
