import { Hono } from "hono";
import * as cg from "../util/util-coingecko.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TokenMarketData, TokenMeta, TokenPrice } from "../data/schema.js";
import {
  paginationSchema,
  tokenAddressListSchema,
  tokenIdSchema,
} from "../data/schema.js";

import { Storage as Storage } from "../services/storage.js";
import { validateQuery, validateParam } from "../middlewares/validation.js";
import { Message, messageText } from "../util/response-messages.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

const app = new Hono()
  // Get all solana tokens
  .get("/", validateQuery(paginationSchema), async (c) => {
    try {
      const pagination = c.req.valid("query");

      const cgEndpoint = cg.getEndpoint("/coins/list");
      cgEndpoint.searchParams.append("include_platform", "true");

      const req = new Request(cgEndpoint, {
        method: "GET",
        headers: cg.getRequiredHeaders(),
      });

      const resp = await fetch(req);

      if (resp.ok) {
        const res = await resp.json();

        const solanaCoins: TokenMeta[] = res.data
          .filter((rawToken: any) => rawToken.platforms?.solana)
          .map(
            (rawToken: any): TokenMeta => ({
              name: rawToken.name,
              symbol: rawToken.symbol,
              address: rawToken.platforms!.solana!,
            }),
          )
          .slice(0, pagination.limit);

        // Optional: Save to temp file in development
        if (Storage.shouldSaveDebugFiles()) {
          const outPath = join(currentDir, "../temp/solana-coin-list.json");
          await Storage.saveJson(outPath, solanaCoins);
        }

        return c.json(solanaCoins, 200);
      } else {
        return c.json("Failed to fetch data from external sources", 502);
      }
    } catch (err) {
      return c.json(messageText[Message.FailedToFetchExternalData], 500);
    }
  })
  // Get price of tokens by token addresses (comma seperated)
  .get("/prices", validateQuery(tokenAddressListSchema), async (c) => {
    try {
      const { addresses } = c.req.valid("query");

      const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);
      cgEndpoint.search = new URLSearchParams({
        contract_addresses: addresses,
        vs_currencies: "usd",
        include_market_cap: "true",
        include_24hr_vol: "true",
        include_24hr_change: "true",
      }).toString();

      const req = new Request(cgEndpoint, {
        method: "GET",
        headers: cg.getRequiredHeaders(),
      });

      const resp = await fetch(req);

      if (resp.ok) {
        const res = await resp.json();

        const tokenPrices: TokenPrice[] = addresses
          .split(",")
          .map((address: string) => {
            const rawTokenPrice = res[address];
            return {
              usd: rawTokenPrice.usd,
              usd24hChange: rawTokenPrice.usd_24h_change,
              usd24hVol: rawTokenPrice.usd_24h_vol,
              usdMarketCap: rawTokenPrice.usd_market_cap,
            };
          });

        if (Storage.shouldSaveDebugFiles()) {
          const outPath = join(
            currentDir,
            `../temp/token-prices-${addresses}.json`,
          );
          await Storage.saveJson(outPath, tokenPrices);
        }

        return c.json(tokenPrices, 200);
      } else {
        return c.json("Failed to fetch data from external sources", 502);
      }
    } catch (err) {
      return c.json(messageText[Message.InternalServerError], 500);
    }
  })
  // Get market data for a specific token by CoinGecko id
  .get("/markets/:id", validateParam(tokenIdSchema), async (c) => {
    try {
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
        const res = await resp.json();

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

        if (Storage.shouldSaveDebugFiles()) {
          const outPath = join(currentDir, `../temp/token-market-${id}.json`);
          await Storage.saveJson(outPath, marketData);
        }

        return c.json(marketData, 200);
      } else {
        return c.json(messageText[Message.FailedToFetchExternalData], 502);
      }
    } catch (err) {
      return c.json(messageText[Message.InternalServerError], 500);
    }
  });

export default app;
