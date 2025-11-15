import { Hono } from "hono";
import * as cg from "../util/util_cg.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TokenMarketData, TokenMeta, TokenPrice } from "../data/schema.js";
import { ApiService } from "../services/api.service.js";
import { StorageService } from "../services/storage.service.js";
import {
  validateQuery,
  validateParam,
  paginationSchema,
  tokenIdParamSchema,
  tokenAddressesQuerySchema,
} from "../middleware/validation.middleware.js";
import type {
  RawCoinListItem,
  RawTokenPrice,
  RawMarketData,
} from "../types/api.types.js";

const app = new Hono();
const __filename = fileURLToPath(import.meta.url);
const currentDir = dirname(__filename);

app.get("/", validateQuery(paginationSchema), getSolTokens);
app.get(
  "/prices/token/:id",
  validateParam(tokenIdParamSchema),
  getTokenPricesById,
);
app.get("/prices", validateQuery(tokenAddressesQuerySchema), getTokenPrices);
app.get("/markets/:id", validateParam(tokenIdParamSchema), getTokenMarkets);

export default app;

/**
 * Get list of Solana tokens from CoinGecko
 */
async function getSolTokens(c: any) {
  const { limit } = c.req.valid("query") as { limit: number };

  const cgEndpoint = cg.getEndpoint("/coins/list");
  cgEndpoint.searchParams.append("include_platform", "true");

  const request = new Request(cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const result = await ApiService.fetch<RawCoinListItem[]>(
    request,
    "Fetching Solana tokens",
  );

  if ("error" in result) {
    return c.json(result.error, result.status as 502 | 500);
  }

  const solanaCoins: TokenMeta[] = result.data
    .filter((rawToken) => rawToken.platforms?.solana)
    .map(
      (rawToken): TokenMeta => ({
        name: rawToken.name,
        symbol: rawToken.symbol,
        address: rawToken.platforms!.solana!,
      }),
    )
    .slice(0, limit);

  // Optional: Save to temp file in development
  if (StorageService.shouldSaveDebugFiles()) {
    const outPath = join(currentDir, "../temp/solana-coin-list.json");
    await StorageService.saveJson(outPath, solanaCoins);
  }

  return c.json(solanaCoins, 200);
}

/**
 * Get token price by token contract address
 */
async function getTokenPricesById(c: any) {
  const { id: tokenId } = c.req.valid("param") as { id: string };

  const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);
  cgEndpoint.search = new URLSearchParams({
    contract_addresses: tokenId,
    vs_currencies: "usd",
    include_market_cap: "true",
    include_24hr_vol: "true",
    include_24hr_change: "true",
  }).toString();

  const request = new Request(cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const result = await ApiService.fetch<Record<string, RawTokenPrice>>(
    request,
    "Fetching token price",
  );

  if ("error" in result) {
    return c.json(result.error, result.status as 502 | 500);
  }

  const rawTokenPrice = result.data[tokenId];

  if (!rawTokenPrice) {
    return c.json({ error: "Token price not found" }, 404);
  }

  const tokenPrice: TokenPrice = {
    usd: rawTokenPrice.usd,
    usdMarketCap: rawTokenPrice.usd_market_cap,
    usd24hVol: rawTokenPrice.usd_24h_vol,
    usd24hChange: rawTokenPrice.usd_24h_change,
  };

  // Optional: Save to temp file in development
  if (StorageService.shouldSaveDebugFiles()) {
    const outPath = join(currentDir, `../temp/token-price-${tokenId}.json`);
    await StorageService.saveJson(outPath, tokenPrice);
  }

  return c.json(tokenPrice, 200);
}

/**
 * Get token prices for multiple contract addresses (comma separated)
 */
async function getTokenPrices(c: any) {
  const { addresses: tokenAddresses } = c.req.valid("query") as {
    addresses: string;
  };

  const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);
  cgEndpoint.search = new URLSearchParams({
    contract_addresses: tokenAddresses,
    vs_currencies: "usd",
    include_market_cap: "true",
    include_24hr_vol: "true",
    include_24hr_change: "true",
  }).toString();

  const request = new Request(cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const result = await ApiService.fetch<Record<string, RawTokenPrice>>(
    request,
    "Fetching token prices",
  );

  if ("error" in result) {
    return c.json(result.error, result.status as 502 | 500);
  }

  // Convert object to array of token prices
  const tokenPrices: TokenPrice[] = Object.values(result.data).map(
    (raw): TokenPrice => ({
      usd: raw.usd,
      usdMarketCap: raw.usd_market_cap,
      usd24hVol: raw.usd_24h_vol,
      usd24hChange: raw.usd_24h_change,
    }),
  );

  // Optional: Save to temp file in development
  if (StorageService.shouldSaveDebugFiles()) {
    const outPath = join(currentDir, `../temp/token-prices.json`);
    await StorageService.saveJson(outPath, tokenPrices);
  }

  return c.json(tokenPrices, 200);
}

/**
 * Get market data for a coin (using CoinGecko coin ID)
 */
async function getTokenMarkets(c: any) {
  const { id } = c.req.valid("param") as { id: string };
  const reqUrl = new URL(c.req.url);
  const limit = Number(reqUrl.searchParams.get("limit") ?? 50);

  const cgEndpoint = cg.getEndpoint("/coins/markets");
  cgEndpoint.search = new URLSearchParams({
    ids: id,
    usd: "usd",
    order: "market_cap_desc",
    price_percentage_change: "1h",
    page: "1",
    per_page: limit.toString(),
  }).toString();

  const request = new Request(cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const result = await ApiService.fetch<RawMarketData[]>(
    request,
    "Fetching token markets",
  );

  if ("error" in result) {
    return c.json(result.error, result.status as 502 | 500);
  }

  const rawMarketData = result.data[0];

  if (!rawMarketData) {
    return c.json({ error: "Market data not found" }, 404);
  }

  const marketData: TokenMarketData = {
    currentPrice: rawMarketData.current_price,
    marketCap: rawMarketData.market_cap,
    marketCapRank: rawMarketData.market_cap_rank,
    fullyDilutedValuation: rawMarketData.fully_diluted_valuation,
    totalVolume: rawMarketData.total_volume,
    high24h: rawMarketData.high_24h,
    low24h: rawMarketData.low_24h,
    priceChange24h: rawMarketData.price_change_24h,
    priceChangePercentage24h: rawMarketData.price_change_percentage_24h,
    marketCapChange24h: rawMarketData.market_cap_change_24h,
    marketCapChangePercentage24h:
      rawMarketData.market_cap_change_percentage_24h,
    circulatingSupply: rawMarketData.circulating_supply,
    totalSupply: rawMarketData.total_supply,
    maxSupply: rawMarketData.max_supply,
    ath: rawMarketData.ath,
    athChangePercentage: rawMarketData.ath_change_percentage,
    atl: rawMarketData.atl,
    atlChangePercentage: rawMarketData.atl_change_percentage,
  };

  if (StorageService.shouldSaveDebugFiles()) {
    const outPath = join(currentDir, `../temp/token-markets-${id}.json`);
    await StorageService.saveJson(outPath, marketData);
  }

  return c.json(marketData, 200);
}
