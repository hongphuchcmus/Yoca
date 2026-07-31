import { validateApiResult, solanaBase58Schema } from "@sv/middlewares/validation";
import { getAddressesByCoinGeckoIds } from "@sv/services/tokens/token-list.js";
import { getTokenMarketData } from "@sv/services/tokens/token-market-data.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as cg from "@sv/util/util-coingecko.js";
import {
    cg_OnchainPoolSearchSchema,
    cg_SearchSchema,
} from "./_types/token-raw-responses.js";

type TokenMetaSearchResult = {
  address: string;
  name: string | null;
  symbol: string | null;
  imgUrl: string | null;
};

type WalletSearchResult = {
  address: string;
};

type PoolSearchResult = {
  address: string;
  name: string | null;
  dexId: string | null;
  baseToken: TokenMetaSearchResult | null;
  quoteToken: TokenMetaSearchResult | null;
};

function trimIdPrefix(id: string, prefix: string = "solana_"): string {
  if (!id) return "";
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

async function getSearchWalletsResult(
  query: string,
): Promise<WalletSearchResult[]> {
  const parseRes = solanaBase58Schema.safeParse(query);
  if (!parseRes.success || !parseRes.data) {
    return [];
  }
  const walletAddress = parseRes.data;
  return [{ address: walletAddress }];
}
async function getSearchPoolsResult(q: string): Promise<PoolSearchResult[]> {
  const endpoint = cg.getOnchainEndpoint("/search/pools");
  endpoint.search = new URLSearchParams({
    query: q,
    network: "solana",
    include: "base_token,quote_token",
  }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.search_tokens", endpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const res = await validateApiResult(cg_OnchainPoolSearchSchema, resp);
  if (!res) {
    return [];
  }

  const poolTokens: Record<string, TokenMetaSearchResult> = Object.fromEntries(
    (res.included ?? [])
      .filter((raw) => raw.type == "token")
      .filter((token) => token.attributes.coingecko_coin_id)
      .map((token): [string, TokenMetaSearchResult] => {
        const address = token.attributes.address!;
        return [
          address,
          {
            address,
            symbol: token.attributes.symbol || null,
            name: token.attributes.name || null,
            imgUrl: token.attributes.image_url || null,
          },
        ];
      }),
  );

  return res.data
    .filter((pool) => {
      const baseTokenId = pool.relationships?.base_token?.data?.id;
      if (!baseTokenId) return false;
      const baseTokenAddress = trimIdPrefix(baseTokenId);
      return poolTokens[baseTokenAddress];
    })
    .map((pool) => {
      const baseTokenId = trimIdPrefix(
        pool.relationships?.base_token?.data?.id || "",
      );
      const quoteTokenId = trimIdPrefix(
        pool.relationships?.quote_token?.data?.id || "",
      );
      return {
        address: pool.attributes.address,
        name: pool.attributes.name || null,
        dexId: pool.relationships?.dex?.data?.id || null,
        baseToken: poolTokens[baseTokenId] || null,
        quoteToken: poolTokens[quoteTokenId] || null,
      };
    });
}

async function getSearchQueriesResult(q: string) {
  const endpoint = cg.getEndpoint("/search");
  endpoint.search = new URLSearchParams({ query: q }).toString();

  const resp = await pFetch(cg.spec, "coingecko.svc.search_pools", endpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const res = await validateApiResult(cg_SearchSchema, resp);
  return res?.coins ?? [];
}

export async function getSearchResult(query: string) {
  const normalizedQuery = query.trim();
  const searchQuery = normalizedQuery.toLowerCase();

  if (!normalizedQuery) {
    return {
      tokens: [],
      pools: [],
      wallets: [],
    };
  }

  const [poolSearch, queriesSearch, walletSearch] = await Promise.all([
    getSearchPoolsResult(searchQuery),
    getSearchQueriesResult(searchQuery),
    getSearchWalletsResult(normalizedQuery),
  ]);

  const cgIdToSolanaAddress = await getAddressesByCoinGeckoIds(
    queriesSearch.map((token) => token.id),
  );

  const tokenResultMeta = queriesSearch
    .filter((token) => cgIdToSolanaAddress[token.id])
    .map((token): TokenMetaSearchResult => {
      return {
        address: cgIdToSolanaAddress[token.id],
        name: token.name || null,
        symbol: token.symbol || null,
        imgUrl: token.thumb || null,
      };
    });

  const tokenAddresses = tokenResultMeta.map((token) => token.address);
  const marketData = await getTokenMarketData(tokenAddresses);

  const tokenDataList = tokenResultMeta.map((token) => ({
    ...marketData[token.address],
    ...token,
  }));

  return {
    tokens: tokenDataList,
    pools: poolSearch,
    wallets: walletSearch,
  };
}
