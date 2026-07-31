import * as cg from "@sv/util/util-coingecko.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { Hono } from "hono";
import { z } from "zod";
import { dataUsage } from "@sv/middlewares/request-context.js";

type ExchangeRateEntry = {
  name: string;
  unit: string;
  value: number;
  type: "crypto" | "fiat" | "commodity";
};

export type ExchangeRatesResponse = {
  rates: Record<string, ExchangeRateEntry>;
};

const exchangeRatesResponseSchema = z.strictObject({
  rates: z.record(
    z.string(),
    z.strictObject({
      name: z.string(),
      unit: z.string(),
      value: z.number(),
      type: z.enum(["crypto", "fiat", "commodity"]),
    }),
  ),
});

let cachedRates: ExchangeRatesResponse | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (CG updates every 5 min)

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  ) {
    return true;
  }

  if (/^10\./.test(normalized)) {
    return true;
  }
  if (/^192\.168\./.test(normalized)) {
    return true;
  }

  const match172 = normalized.match(/^172\.(\d+)\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (
      Number.isFinite(secondOctet) &&
      secondOctet >= 16 &&
      secondOctet <= 31
    ) {
      return true;
    }
  }

  return false;
}

const app = new Hono()
  .get("/exchange-rates", async (c) => {
    const now = Date.now();

    if (cachedRates && now - cachedAt < CACHE_TTL_MS) {
      dataUsage.record("memory_result");
      return c.json(cachedRates);
    }

    try {
      const endpoint = cg.getEndpoint("/exchange_rates");
      const resp = await pFetch(cg.spec, "coingecko.svc.exchange_rates", endpoint, {
        method: "GET",
        headers: cg.getRequiredHeaders(),
      });
      if (!resp.ok) {
        if (cachedRates) {
          dataUsage.record("memory_result", "stale_fallback");
          return c.json(cachedRates); // serve stale on error
        }
        return c.json({ error: "Failed to fetch exchange rates" }, 502);
      }

      const payload = await validateApiResult(exchangeRatesResponseSchema, resp);
      if (!payload) {
        if (cachedRates) {
          dataUsage.record("memory_result", "stale_fallback");
          return c.json(cachedRates);
        }
        return c.json({ error: "Failed to validate exchange rates" }, 502);
      }

      cachedRates = payload;
      cachedAt = now;
      return c.json(cachedRates);
    } catch (err) {
      console.error(err);
      if (cachedRates) {
        dataUsage.record("memory_result", "stale_fallback");
        return c.json(cachedRates);
      }
      return c.json({ error: "Internal server error" }, 500);
    }
  })
  .get("/image-proxy", async (c) => {
    const rawUrl = c.req.query("url") ?? "";
    if (!rawUrl) {
      return c.json({ error: "Missing image url" }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return c.json({ error: "Invalid image url" }, 400);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return c.json({ error: "Unsupported image protocol" }, 400);
    }

    if (isPrivateHost(parsedUrl.hostname)) {
      return c.json({ error: "Blocked image host" }, 403);
    }

    try {
      const response = await fetch(parsedUrl.toString(), {
        method: "GET",
        redirect: "follow",
      });

      if (!response.ok) {
        return c.json({ error: "Failed to fetch image" }, 502);
      }

      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      if (!contentType.startsWith("image/")) {
        return c.json({ error: "Target is not an image" }, 415);
      }

      const body = await response.arrayBuffer();
      return c.body(body, 200, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      });
    } catch (error) {
      console.error("[misc/image-proxy] failed:", error);
      return c.json({ error: "Image proxy failed" }, 500);
    }
  });

export default app;

export type MiscAppType = typeof app;
