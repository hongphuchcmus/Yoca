import { Hono } from "hono";
import type { Context } from "hono";
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
import type { RawCoinListItem, RawTokenPrice, RawMarketData } from "../types/api.types.js";

const app = new Hono();
const __filename = fileURLToPath(import.meta.url);
const currentDir = dirname(__filename);

// Constants
const PLATFORM = "solana";
const VS_CURRENCY = "usd";

app.get("/", validateQuery(paginationSchema), getSolTokens);
app.get("/prices/token/:id", validateParam(tokenIdParamSchema), getTokenPricesById);
app.get("/prices", validateQuery(tokenAddressesQuerySchema), getTokenPrices);
app.get("/markets/:id", validateParam(tokenIdParamSchema), getTokenMarkets);

export default app;

async function getSolTokens(c: Context) {
  const { limit } = c.req.valid("query");

  const cgEndpoint = cg.getEndpoint("/coins/list");
  cgEndpoint.searchParams.append("include_platform", "true");

  const request = new Request(cgEndpoint, {
    method: "GET",
    headers: cg.getRequiredHeaders(),
  });

  const result = await ApiService.fetchWithErrorHandling<RawCoinListItem[]>(
    request,
    "Fetching Solana tokens"
  );

  if ("error" in result) {
    return c.json(result.error, result.status as 502 | 500);
  }

  const solanaCoins: TokenMeta[] = result.data
    .filter((rawToken) => rawToken.platforms?.solana)
    .map((rawToken): TokenMeta => ({
      name: rawToken.name,
      symbol: rawToken.symbol,
      address: rawToken.platforms!.solana!,
    }))
    .slice(0, limit);

  // Optional: Save to temp file in development
  if (StorageService.shouldSaveDebugFiles()) {
    const outPath = join(currentDir, "../temp/solana-coin-list.json");
    await StorageService.saveJson(outPath, solanaCoins);
  }

  return c.json(solanaCoins, 200);
}

async function getTokenPricesById(c: Context) {
  const { id: tokenId } = c.req.valid("param");

    const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);
    cgEndpoint.search = new URLSearchParams({
      contract_addresses: tokenId,
      vs_currencies: "usd",
      include_market_cap: "true",
      include_24hr_vol: "true",
      include_24hr_change: "true",
    }).toString();
    console.log(cgEndpoint);

    const req = new Request(cgEndpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });

    const resp = await fetch(req);

    if (resp.ok) {
      const data = await resp.json();
      const rawTokenPrice = data[tokenId] as {
        usd: number;
        usd_market_cap: number;
        usd_24h_vol: number;
        usd_24h_change: number;
      };

      const tokenPrice: TokenPrice = {
        usd: rawTokenPrice.usd,
        usdMarketCap: rawTokenPrice.usd_market_cap,
        usd24hVol: rawTokenPrice.usd_24h_vol,
        usd24hChange: rawTokenPrice.usd_24h_change,
      };

      const outPath = join(currentDir, `../temp/token-price-${tokenId}.json`);
      const tempDir = dirname(outPath);
      await mkdir(tempDir, { recursive: true });
      await writeFile(outPath, JSON.stringify(tokenPrice, null, 2), "utf-8");

      return c.json(tokenPrice, 200);
    } else {
      return c.json(
        { error: `External API failed: ${resp.status} ${resp.statusText}` },
        502,
      );
    }
  } catch (err) {
    console.error("Error fetching token price:", err);
    return c.json({ error: String(err) }, 500);
  }
}

// Get token prices for multiple contract addresses (comma separated)
async function getTokenPrices(c: { req: { url: string }; json: (data: unknown, status: number) => Response }) {
  try {
    const reqUrl = new URL(c.req.url);
    const tokenAddresses = reqUrl.searchParams.get("addresses");
    if (!tokenAddresses) {
      return c.json({ error: "Missing token addresses" }, 400);
    }

    const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);
    cgEndpoint.search = new URLSearchParams({
      contract_addresses: tokenAddresses,
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
      const data = await resp.json();

      // data is an object keyed by contract address
      const tokenPrices: TokenPrice[] = Object.keys(data).map((key) => {
        const raw = data[key] as {
          usd: number;
          usd_market_cap: number;
          usd_24h_vol: number;
          usd_24h_change: number;
        };
        return {
          usd: raw.usd,
          usdMarketCap: raw.usd_market_cap,
          usd24hVol: raw.usd_24h_vol,
          usd24hChange: raw.usd_24h_change,
        } as TokenPrice;
      });

      const outPath = join(currentDir, `../temp/token-prices.json`);
      const tempDir = dirname(outPath);
      await mkdir(tempDir, { recursive: true });
      await writeFile(outPath, JSON.stringify(tokenPrices, null, 2), "utf-8");

      return c.json(tokenPrices, 200);
    } else {
      return c.json(
        { error: `External API failed: ${resp.status} ${resp.statusText}` },
        502,
      );
    }
  } catch (err) {
    console.error("Error fetching token prices:", err);
    return c.json({ error: String(err) }, 500);
  }
}

// Get market data for a coin id (id = coin id used by CoinGecko)
async function getTokenMarkets(c: { req: { url: string; param: (name: string) => string }; json: (data: unknown, status: number) => Response }) {
  try {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Missing id param" }, 400);
    }

    const reqUrl = new URL(c.req.url);
    const limit = Number(reqUrl.searchParams.get("limit") ?? 50);

    const cgEndpoint = cg.getEndpoint("/coins/markets");

    cgEndpoint.search = new URLSearchParams({
      ids: id,
      vs_currency: "usd",
      order: "market_cap_desc",
      price_percentage_change: "1h",
      page: "1",
      per_page: limit.toString(),
    }).toString();

    const req = new Request(cgEndpoint, {
      method: "GET",
      headers: cg.getRequiredHeaders(),
    });

    const resp = await fetch(req);

    if (resp.ok) {
      const data = (await resp.json()) as {
        current_price: number;
        market_cap: number;
        market_cap_rank: number;
        fully_diluted_valuation: number;
        total_volume: number;
        high_24h: number;
        low_24h: number;
        price_change_24h: number;
        price_change_percentage_24h: number;
        market_cap_change_24h: number;
        market_cap_change_percentage_24h: number;
        circulating_supply: number;
        total_supply: number;
        max_supply: number;
        ath: number;
        ath_change_percentage: number;
        atl: number;
        atl_change_percentage: number;
      }[];
      const rawMarketData = data[0];

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

      const outPath = join(currentDir, `../temp/token-markets-${id}.json`);
      const tempDir = dirname(outPath);
      await mkdir(tempDir, { recursive: true });
      await writeFile(outPath, JSON.stringify(marketData, null, 2), "utf-8");

      return c.json(marketData, 200);
    } else {
      return c.json(
        { error: `External API failed: ${resp.status} ${resp.statusText}` },
        502,
      );
    }
  } catch (err) {
    console.error("Error fetching token markets:", err);
    return c.json({ error: String(err) }, 500);
  }
}
//   try {
//     const reqUrl = new URL(ctx.request.url ?? "");
//     const limit = Number(reqUrl.searchParams.get("limit") ?? 50);

//     const cgEndpoint = cg.getEndpoint("/coins/list");
//     cgEndpoint.searchParams.append("include_platform", "true");

//     const req = new Request(cgEndpoint, {
//       method: "GET",
//       headers: cg.getRequiredHeaders(),
//     });

//     const resp = await fetch(req);

//     if (resp.ok) {
//       const data = await resp.json();

//       const solanaCoins: TokenMeta[] = data
//         .filter((rawToken: any) => rawToken.platforms?.solana)
//         .map((rawToken: any): TokenMeta => {
//           const token = {
//             name: rawToken.name,
//             symbol: rawToken.symbol,
//             address: rawToken.platforms.solana,
//           };
//           return token;
//         })
//         .slice(0, limit);

//       const outPath = join(currentDir, "../temp/solana-coin-list.json");
//       await ensureFile(outPath);
//       await Deno.writeTextFile(outPath, JSON.stringify(solanaCoins, null, 2));

//       ctx.response.status = Status.OK;
//       ctx.response.body = JSON.stringify(solanaCoins);
//     } else {
//       ctx.response.status = Status.BadGateway;
//       ctx.response.body = "External API failed us :(";
//     }
//   } catch (err) {
//     ctx.response.status = Status.InternalServerError;
//     ctx.response.body = JSON.stringify(err);
//   }
// });

// // For Demo: 2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv
// // Get token price for a platform id and save to temp file
// router.get("/prices/token/:id", async (ctx) => {
//   try {
//     // token addresses is comma seperated
//     const tokenId = ctx.params.id;
//     if (!tokenId) {
//       ctx.response.status = Status.BadRequest;
//       ctx.response.body = "Missing token id";
//       return;
//     }

//     const cgEndpoint = cg.getEndpoint(`/simple/token_price/solana`);
//     cgEndpoint.search = new URLSearchParams({
//       contract_addresses: tokenId,
//       vs_currencies: "usd",
//       include_market_cap: "true",
//       include_24hr_vol: "true",
//       include_24hr_change: "true",
//     }).toString();
//     console.log(cgEndpoint);

//     const req = new Request(cgEndpoint, {
//       method: "GET",
//       headers: cg.getRequiredHeaders(),
//     });

//     const resp = await fetch(req);

//     if (resp.ok) {
//       const data = await resp.json();
//       const rawTokenPrice = data[tokenId];

//       const tokenPrice: TokenPrice = {
//         usd: rawTokenPrice.usd,
//         usdMarketCap: rawTokenPrice.usd_market_cap,
//         usd24hVol: rawTokenPrice.usd_24h_vol,
//         usd24hChange: rawTokenPrice.usd_24h_change,
//       };

//       const outPath = join(currentDir, `../temp/token-price-${tokenId}.json`);
//       await ensureFile(outPath);
//       await Deno.writeTextFile(outPath, JSON.stringify(tokenPrice, null, 2));

//       ctx.response.status = Status.OK;
//       ctx.response.body = JSON.stringify(tokenPrice);
//     } else {
//       ctx.response.status = Status.BadGateway;
//       ctx.response.body = JSON.stringify(
//         `External API failed: ${resp.status} ${resp.statusText}`,
//       );
//     }
//   } catch (err) {
//     ctx.response.status = Status.InternalServerError;
//     ctx.response.body = JSON.stringify(err);
//   }
// });

// // Get token price for a platform id and save to temp file
// router.get("/prices", async (ctx) => {
//   try {
//     // token addresses is comma seperated
//     const tokenAddresses = ctx.request.url.searchParams.get("addresses");
//     if (!tokenAddresses) {
//       ctx.response.status = Status.BadRequest;
//       ctx.response.body = "Missing token addresses";
//       return;
//     }

//     const cgEndpoint = cg.getEndpoint(`/simple/token-price/`);
//     cgEndpoint.search = new URLSearchParams({
//       id: "solana",
//       contract_addresses: tokenAddresses,
//       vs_currencies: "usd",
//       include_market_cap: "true",
//       include_24hr_vol: "true",
//       include_24hr_change: "true",
//     }).toString();

//     const req = new Request(cgEndpoint, {
//       method: "GET",
//       headers: cg.getRequiredHeaders(),
//     });

//     const resp = await fetch(req);

//     if (resp.ok) {
//       const data = await resp.json();

//       const tokenPrices: TokenPrice[] = data.map(
//         (rawTokenPrice: any): TokenPrice => {
//           return {
//             usd: rawTokenPrice.usd,
//             usdMarketCap: rawTokenPrice.usd_market_cap,
//             usd24hVol: rawTokenPrice.usd_24h_vol,
//             usd24hChange: rawTokenPrice.usd_24h_change,
//           };
//         },
//       );

//       const outPath = join(currentDir, `../temp/token-prices.json`);
//       await ensureFile(outPath);
//       await Deno.writeTextFile(outPath, JSON.stringify(tokenPrices, null, 2));

//       ctx.response.status = Status.OK;
//       ctx.response.body = JSON.stringify(tokenPrices);
//     } else {
//       ctx.response.status = Status.BadGateway;
//       ctx.response.body = JSON.stringify(
//         `External API failed: ${resp.status} ${resp.statusText}`,
//       );
//     }
//   } catch (err) {
//     ctx.response.status = Status.InternalServerError;
//     ctx.response.body = JSON.stringify(err);
//   }
// });

// router.get("/markets/:id", async (ctx) => {
//   try {
//     const id = ctx.params.id;
//     if (!id) {
//       ctx.response.status = Status.BadRequest;
//       ctx.response.body = "Missing id param";
//       return;
//     }

//     const reqUrl = new URL(ctx.request.url ?? "");

//     const limit = Number(reqUrl.searchParams.get("limit")) ?? 50;

//     const cgEndpoint = cg.getEndpoint("/coins/markets");

//     cgEndpoint.search = new URLSearchParams({
//       "ids": id,
//       "vs_currency": "usd",
//       "order": "market_cap_desc",
//       "price_percentage_change": "1h",
//       "page": "1",
//       "per_page": limit.toString(),
//     }).toString();

//     const req = new Request(cgEndpoint, {
//       method: "GET",
//       headers: cg.getRequiredHeaders(),
//     });

//     const resp = await fetch(req);

//     if (resp.ok) {
//       const data: any = (await resp.json()) as any[];
//       console.log(JSON.stringify(data));
//       const rawMarketData: any = data[0];

//       // Map to MarketData instances
//       const marketData: TokenMarketData = {
//         currentPrice: rawMarketData.current_price,
//         marketCap: rawMarketData.market_cap,
//         marketCapRank: rawMarketData.market_cap_rank,
//         fullyDilutedValuation: rawMarketData.fully_diluted_valuation,
//         totalVolume: rawMarketData.total_volume,
//         high24h: rawMarketData.high_24h,
//         low24h: rawMarketData.low_24h,
//         priceChange24h: rawMarketData.price_change_24h,
//         priceChangePercentage24h: rawMarketData.price_change_percentage_24h,
//         marketCapChange24h: rawMarketData.market_cap_change_24h,
//         marketCapChangePercentage24h:
//           rawMarketData.market_cap_change_percentage_24h,
//         circulatingSupply: rawMarketData.circulating_supply,
//         totalSupply: rawMarketData.total_supply,
//         maxSupply: rawMarketData.max_supply,
//         ath: rawMarketData.ath,
//         athChangePercentage: rawMarketData.ath_change_percentage,
//         atl: rawMarketData.atl,
//         atlChangePercentage: rawMarketData.atl_change_percentage,
//       };

//       // Save pretty JSON
//       const outPath = join(currentDir, `../temp/token-markets-${id}.json`);
//       await ensureFile(outPath);
//       await Deno.writeTextFile(outPath, JSON.stringify(marketData, null, 2));

//       ctx.response.status = Status.OK;
//       ctx.response.body = JSON.stringify(marketData);
//     } else {
//       ctx.response.status = Status.BadGateway;
//       ctx.response.body = JSON.stringify(
//         `External API failed: ${resp.status} ${resp.statusText}`,
//       );
//     }
//   } catch (err) {
//     console.log(err);
//     ctx.response.status = Status.InternalServerError;
//     ctx.response.body = JSON.stringify(err);
//   }
// });

// export default router;
