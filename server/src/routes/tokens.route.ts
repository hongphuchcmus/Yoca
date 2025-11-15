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

const __filename = fileURLToPath(import.meta.url);
const currentDir = dirname(__filename);

const app = new Hono()
  // Get all solana tokens
  .get("/", validateQuery(paginationSchema), async (c) => {
    const pagination = c.req.valid("query");

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
      .slice(0, pagination.limit);

    // Optional: Save to temp file in development
    if (StorageService.shouldSaveDebugFiles()) {
      const outPath = join(currentDir, "../temp/solana-coin-list.json");
      await StorageService.saveJson(outPath, solanaCoins);
    }

    return c.json(solanaCoins, 200);
  })
  // Get price of a specific token by CoinGecko id
  .get("/prices/token/:id", validateParam(tokenIdParamSchema), async (c) => {
    const { id: tokenId } = c.req.valid("param");

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

    if (StorageService.shouldSaveDebugFiles()) {
      const outPath = join(currentDir, `../temp/token-price-${tokenId}.json`);
      await StorageService.saveJson(outPath, tokenPrice);
    }

    return c.json(tokenPrice, 200);
  })
  // Get price of tokens by token addresses (comma seperated)
  .get("/prices", validateQuery(tokenAddressesQuerySchema), async (c) => {
    const { addresses } = c.req.valid("query");

    const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);
    cgEndpoint.search = new URLSearchParams({
      contract_addresses: addresses,
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

    const tokenPrices: TokenPrice[] = addresses
      .split(",")
      .map((address: string) => {
        const rawTokenPrice: RawTokenPrice = result.data[address];
        return {
          usd: rawTokenPrice.usd,
          usd24hChange: rawTokenPrice.usd_24h_change,
          usd24hVol: rawTokenPrice.usd_24h_vol,
          usdMarketCap: rawTokenPrice.usd_market_cap,
        };
      });

    if (StorageService.shouldSaveDebugFiles()) {
      const outPath = join(
        currentDir,
        `../temp/token-prices-${addresses}.json`,
      );
      await StorageService.saveJson(outPath, tokenPrices);
    }

    return c.json(tokenPrices, 200);
  })
  // Get market data for a specific token by CoinGecko id
  .get("/markets/:id", validateParam(tokenIdParamSchema), async (c) => {
    const { id } = c.req.valid("param");

    const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);

    cgEndpoint.search = new URLSearchParams({
      ids: id,
      vs_currency: "usd",
      order: "market_cap_desc",
      price_percentage_change: "1h",
      page: "1",
      per_page: "1",
    }).toString();

    const req = new Request(cgEndpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });

    const resp = await fetch(req);

    if (resp.ok) {
      const res: RawMarketData = await resp.json();

      const marketData: TokenMarketData = {
        currentPrice: res.current_price,
        marketCap: res.market_cap,
        marketCapRank: res.market_cap_rank,
        fullyDilutedValuation: res.fully_diluted_valuation,
        totalVolume: res.total_volume,
        high24h: res.high_24h,
        low24h: res.low_24h,
        priceChange24h: res.price_change_24h,
        priceChangePercentage24h: res.price_change_percentage_24h,
        marketCapChange24h: res.market_cap_change_24h,
        marketCapChangePercentage24h: res.market_cap_change_percentage_24h,
        circulatingSupply: res.circulating_supply,
        totalSupply: res.total_supply,
        maxSupply: res.max_supply,
        ath: res.ath,
        athChangePercentage: res.ath_change_percentage,
        atl: res.atl,
        atlChangePercentage: res.atl_change_percentage,
      };

      if (StorageService.shouldSaveDebugFiles()) {
        const outPath = join(currentDir, `../temp/token-market-${id}.json`);
        await StorageService.saveJson(outPath, marketData);
      }

      return c.json(marketData, 200);
    } else {
      return c.json("Failed to fetch data from external sources", 502);
    }
  });

export default app;
