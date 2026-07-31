import { TOP_TOKENS_BY_MARKET_CAP_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import {
    tokenMarketData,
    tokenMeta,
    topTokensByMarketCap,
    type TokenMetaInsert,
    type TopTokensByMarketCapInsert,
} from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { excludedAutoFromInsert, excludedAutoNonNullFromInsert } from "@sv/util/orm-sql.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as cg from "@sv/util/util-coingecko.js";
import { asc, gt } from "drizzle-orm";
import { cg_CoinMarketsSchema } from "../_types/token-raw-responses.js";
import { getAddressesByCoinGeckoIds } from "./token-list.js";
import { getMarketDataFromRaw } from "./token-market-data.js";

// https://docs.coingecko.com/v3.0.1/reference/coins-markeats
export async function getTopTokensByMarketCap() {
  const thresholdDate = new Date(Date.now() - TOP_TOKENS_BY_MARKET_CAP_TTL_MS);
  const dbRes = await db
    .select()
    .from(topTokensByMarketCap)
    .where(gt(topTokensByMarketCap.updatedAt, thresholdDate))
    .orderBy(asc(topTokensByMarketCap.rank));

  if (dbRes.length > 0) {
    return dbRes;
  }

  const endpoint = cg.getEndpoint("/coins/markets");
  endpoint.search = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: "250",
    price_change_percentage: "1h,24h,7d,14d,30d,200d,1y",
    sparkline: "true",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.top_market_cap", endpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const res = (await validateApiResult(cg_CoinMarketsSchema, resp)) ?? [];

  const cgIds = res.map((raw) => raw.id);
  const cgIdToAddress = await getAddressesByCoinGeckoIds(cgIds);

  const solanaRes = res.filter((raw) => cgIdToAddress[raw.id]);
  const topTokenInsert = solanaRes.map(
    (raw, index): TopTokensByMarketCapInsert => ({
      address: cgIdToAddress[raw.id]!,
      rank: index + 1,
    }),
  );

  await db.delete(topTokensByMarketCap);
  await db.insert(topTokensByMarketCap).values(topTokenInsert);

  // Extra updates
  const marketDataValues = solanaRes
    .map((raw) => getMarketDataFromRaw(cgIdToAddress[raw.id], raw))
    .filter((raw) => raw != null);

  await db
    .insert(tokenMarketData)
    .values(marketDataValues)
    .onConflictDoUpdate({
      target: [tokenMarketData.address],
      set: excludedAutoFromInsert(
        tokenMarketData,
        tokenMarketData.address,
        marketDataValues,
      ),
    });

  const metaValues = solanaRes.map(
    (raw): TokenMetaInsert => ({
      address: cgIdToAddress[raw.id],
      name: raw.name!,
      symbol: raw.symbol!,
      imageUrl: raw.image,
    }),
  );

  await db
    .insert(tokenMeta)
    .values(metaValues)
    .onConflictDoUpdate({
      target: [tokenMeta.address],
      set: excludedAutoNonNullFromInsert(
        tokenMeta,
        tokenMeta.address,
        metaValues,
      ),
    });

  return await db
    .select()
    .from(topTokensByMarketCap)
    .orderBy(topTokensByMarketCap.rank);
}
