import {
  addressListSchema,
  addressSchema,
  daysQuerySchema,
  validate,
} from "@sv/middlewares/validation.js";
import * as tokenService from "@sv/services/tokens/index.js";
import { setErr } from "@sv/util/errors.js";
import { statusCode } from "@sv/util/responses.js";
import { Hono } from "hono";
import z from "zod";

const marketPoolsTrendingQuerySchema = z.object({
  duration: z.enum(["5m", "1h", "6h", "24h"]).default("5m").optional(),
});

const marketPoolsTopQuerySchema = z.object({
  sortBy: z.enum(["volume", "txns", "marketCap"]).default("volume").optional(),
});

const poolListQuerySchema = z.object({
  refresh: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});

const app = new Hono()
  .get(
    "/details/:addresses",
    validate("param", addressListSchema),
    async (c) => {
      try {
        const { addresses } = c.req.valid("param");

        const meta = await tokenService.getTokenDetails(addresses);

        if (meta) {
          return c.json(meta, statusCode.Ok);
        } else {
          return c.json(setErr("INTERNAL_SERVER_ERR"), statusCode.BadGateway);
        }
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get("/meta/:addresses", validate("param", addressListSchema), async (c) => {
    try {
      const { addresses } = c.req.valid("param");

      const meta = await tokenService.getTokenMeta(addresses);

      if (meta) {
        return c.json(meta, statusCode.Ok);
      } else {
        return c.json(setErr("INTERNAL_SERVER_ERR"), statusCode.BadGateway);
      }
    } catch (err) {
      console.error(err);
      return c.json(
        setErr("INTERNAL_SERVER_ERR"),
        statusCode.InternalServerError,
      );
    }
  })
  .get(
    "/fundamentals/:address",
    validate("param", addressSchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const fundamentals = await tokenService.getTokenFundamentals(address);

        if (fundamentals) {
          return c.json(fundamentals, statusCode.Ok);
        }

        return c.json(
          setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
          statusCode.BadGateway,
        );
      } catch (error) {
        console.error(error);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get(
    "/markets/:addresses",
    validate("param", addressListSchema),
    async (c) => {
      try {
        const { addresses } = c.req.valid("param");
        const marketData = await tokenService.getTokenMarketData(addresses);

        if (marketData) {
          return c.json(marketData, statusCode.Ok);
        } else {
          return c.json(
            setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
            statusCode.BadGateway,
          );
        }
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get(
    "/markets/chart/:address",
    validate("param", addressSchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const marketData = await tokenService.get24hTokenMarketChart(address);
        if (marketData) {
          return c.json(marketData, statusCode.Ok);
        } else {
          return c.json(
            setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
            statusCode.BadGateway,
          );
        }
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get(
    "/markets/chart/:address/hourly",
    validate("param", addressSchema),
    validate("query", daysQuerySchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const { days } = c.req.valid("query");

        if (days > 90) {
          return c.json(
            setErr("HOURLY_CHART_HOURLY_EXCEEDED_90_DAYS"),
            statusCode.BadRequest,
          );
        }

        const chartData = await tokenService.getHourlyTokenMarketChart(
          address,
          days,
        );
        return c.json(chartData, statusCode.Ok);
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get(
    "/markets/chart/:address/daily",
    validate("param", addressSchema),
    validate("query", daysQuerySchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const { days = 7 } = c.req.valid("query");

        if (days > 365) {
          return c.json(
            setErr("DAILY_CHART_DAILY_EXCEEDED_365_DAYS"),
            statusCode.BadRequest,
          );
        }

        const chartData = await tokenService.getDailyTokenMarketChart(
          address,
          days,
        );
        return c.json(chartData, statusCode.Ok);
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get(
    "/holders/stats/:addresses",
    validate("param", addressListSchema),
    async (c) => {
      try {
        const { addresses } = c.req.valid("param");

        const holders = await tokenService.getTokenHolderStats(addresses);

        if (holders) {
          return c.json(holders, statusCode.Ok);
        } else {
          return c.json(
            setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
            statusCode.BadGateway,
          );
        }
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get("/holders/:address", validate("param", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("param");

      const holders = await tokenService.getTopTokenHolders(address);

      if (holders) {
        return c.json(holders, statusCode.Ok);
      } else {
        return c.json(
          setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
          statusCode.BadGateway,
        );
      }
    } catch (err) {
      console.error(err);
      return c.json(
        setErr("INTERNAL_SERVER_ERR"),
        statusCode.InternalServerError,
      );
    }
  })
  .get("/:address/pools", validate("param", addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("param");

      const pools = await tokenService.getTokenTopPools(address);

      return c.json(pools, statusCode.Ok);
    } catch (err) {
      console.error(err);
      return c.json(
        setErr("INTERNAL_SERVER_ERR"),
        statusCode.InternalServerError,
      );
    }
  })
  .get(
    "/pools/:addresses",
    validate("param", addressListSchema),
    validate("query", poolListQuerySchema),
    async (c) => {
      try {
        const { addresses } = c.req.valid("param");
        const { refresh = false } = c.req.valid("query");

        const pools = await tokenService.getTokenPoolDataList(
          addresses,
          refresh,
        );

        if (pools) {
          return c.json(pools, statusCode.Ok);
        } else {
          return c.json(
            setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
            statusCode.BadGateway,
          );
        }
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get(
    "/pools/trades/:address",
    validate("param", addressSchema),
    async (c) => {
      try {
        const { address: poolAddress } = c.req.valid("param");

        const trades = await tokenService.getPoolTrades24h(poolAddress);
        return c.json(trades, statusCode.Ok);
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get("/trending", async (c) => {
    try {
      const trending = await tokenService.getTrendingTokens();

      if (trending == null) {
        return c.json(
          setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
          statusCode.BadGateway,
        );
      }

      return c.json(trending, statusCode.Ok);
    } catch (err) {
      console.error(err);
      return c.json(
        setErr("INTERNAL_SERVER_ERR"),
        statusCode.InternalServerError,
      );
    }
  })
  .get(
    "/market-pools/trending",
    validate("query", marketPoolsTrendingQuerySchema),
    async (c) => {
      try {
        const { duration = "5m" } = c.req.valid("query");
        const pools = await tokenService.getTrendingMarketPools(duration);
        return c.json(pools, statusCode.Ok);
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get(
    "/market-pools/top",
    validate("query", marketPoolsTopQuerySchema),
    async (c) => {
      try {
        const { sortBy = "volume" } = c.req.valid("query");
        const pools = await tokenService.getTopMarketPools(sortBy);
        return c.json(pools, statusCode.Ok);
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  )
  .get("/market-pools/gainers", async (c) => {
    try {
      const pools = await tokenService.getTopGainerMarketPools();
      return c.json(pools, statusCode.Ok);
    } catch (err) {
      console.error(err);
      return c.json(
        setErr("INTERNAL_SERVER_ERR"),
        statusCode.InternalServerError,
      );
    }
  })
  .get("/market-pools/new-pairs", async (c) => {
    try {
      const pools = await tokenService.getNewMarketPools();
      return c.json(pools, statusCode.Ok);
    } catch (err) {
      console.error(err);
      return c.json(
        setErr("INTERNAL_SERVER_ERR"),
        statusCode.InternalServerError,
      );
    }
  })
  .get("/top-marketcap", async (c) => {
    try {
      const topTokens = await tokenService.getTopTokensByMarketCap();

      if (topTokens == null) {
        return c.json(
          setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
          statusCode.BadGateway,
        );
      }

      return c.json(topTokens, statusCode.Ok);
    } catch (err) {
      console.error(err);
      return c.json(
        setErr("INTERNAL_SERVER_ERR"),
        statusCode.InternalServerError,
      );
    }
  })
  .get(
    "/history/:address",
    validate("param", addressSchema),
    validate("query", daysQuerySchema),
    async (c) => {
      try {
        const { address } = c.req.valid("param");
        const { days = 7 } = c.req.valid("query");

        if (days > 365) {
          return c.json(
            setErr("DAILY_CHART_DAILY_EXCEEDED_365_DAYS"),
            statusCode.BadRequest,
          );
        }

        const data = await tokenService.getTokenHistoricalData(address, days);

        if (data == null) {
          return c.json(
            setErr("FAILED_TO_FETCH_REQUESTED_DATA"),
            statusCode.BadGateway,
          );
        }

        return c.json(data, statusCode.Ok);
      } catch (err) {
        console.error(err);
        return c.json(
          setErr("INTERNAL_SERVER_ERR"),
          statusCode.InternalServerError,
        );
      }
    },
  );

export type TokenAppType = typeof app;
export default app;
