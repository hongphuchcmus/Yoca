import {
    TRENDING_TOKENS_BIRDEYE_FETCH_LIMIT,
    TRENDING_TOKENS_MAX_FETCH_ROUNDS,
    TRENDING_TOKENS_RESULT_LIMIT,
    UPDATE_TRENDING_TOKENS_TTL_MS,
} from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { trendingTokens } from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as bds from "@sv/util/util-birdeye.js";
import {
    bds_TrendingListSchema,
    type BDS_TrendingListSchema,
} from "../_types/token-raw-responses.js";
import { asc } from "drizzle-orm";
import { getCoinGeckoIdsByAddresses } from "./token-list.js";

async function fetchTrendingPage(params: {
  offset: number;
  limit: number;
}): Promise<BDS_TrendingListSchema | null> {
  const bdsEndpoint = bds.getEndpoint("/defi/token_trending");

  bdsEndpoint.search = new URLSearchParams({
    sort_by: "rank",
    sort_type: "asc",
    interval: "24h",
    offset: String(params.offset),
    limit: String(params.limit),
  }).toString();

  const resp = await pFetch(bds.spec, "birdeye.svc.trending_tokens", bdsEndpoint, {
    method: "GET",
    headers: bds.getRequiredHeaders(),
  });

  if (!resp.ok) {
    return null;
  }

  const res = await validateApiResult(bds_TrendingListSchema, resp);

  if (!res || !res.success) {
    return null;
  }

  return res;
}
// lấy ít dữ liệu
// làm theo hướng sẽ fetch tối thiểu bao nhiêu đồn
// https://docs.birdeye.so/reference/get-defi-token_trending
export async function getTrendingTokens() {
  const result = await db
    .select()
    .from(trendingTokens)
    .orderBy(asc(trendingTokens.rank));

  const thresholdTime = new Date(Date.now() - UPDATE_TRENDING_TOKENS_TTL_MS);

  if (result.length > 0 && result[0].updatedAt > thresholdTime) {
    return result;
  }

  let offset = 0;
  const selectedAddresses: string[] = [];
  const seenAddresses = new Set<string>();

  for (let round = 0; round < TRENDING_TOKENS_MAX_FETCH_ROUNDS; round++) {
    const page = await fetchTrendingPage({
      offset,
      limit: TRENDING_TOKENS_BIRDEYE_FETCH_LIMIT,
    });

    if (page == null) {
      return result.length > 0 ? result : [];
    }

    const pageAddresses = page.data.tokens.map((token) => token.address);
    const cgLookup = await getCoinGeckoIdsByAddresses(pageAddresses);

    const cgAddressSet = new Set(Object.keys(cgLookup));

    for (const address of pageAddresses) {
      if (cgAddressSet.has(address) && !seenAddresses.has(address)) {
        seenAddresses.add(address);
        selectedAddresses.push(address);
      }

      if (selectedAddresses.length >= TRENDING_TOKENS_RESULT_LIMIT) {
        break;
      }
    }

    if (selectedAddresses.length >= TRENDING_TOKENS_RESULT_LIMIT) {
      break;
    }

    if (page.data.tokens.length < TRENDING_TOKENS_BIRDEYE_FETCH_LIMIT) {
      break;
    }

    offset += TRENDING_TOKENS_BIRDEYE_FETCH_LIMIT;
  }

  if (selectedAddresses.length === 0) {
    return [];
  }
  await db.delete(trendingTokens);
  return await db
    .insert(trendingTokens)
    .values(
      selectedAddresses.map((address, index) => ({
        address,
        rank: index + 1,
      })),
    )
    .returning();
}
