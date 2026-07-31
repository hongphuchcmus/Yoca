import {
  API_METRICS_BEARER_TOKEN,
  API_METRICS_ENABLED,
} from "@sv/config/constants.js";
import {
  apiMetricsContentType,
  getApiMetrics,
} from "@sv/services/tracking/api-metrics.js";
import { Hono } from "hono";

const app = new Hono().get("/", async (c) => {
  if (!API_METRICS_ENABLED) {
    return c.notFound();
  }

  if (
    API_METRICS_BEARER_TOKEN.length > 0 &&
    c.req.header("authorization") != `Bearer ${API_METRICS_BEARER_TOKEN}`
  ) {
    return c.text("Unauthorized", 401);
  }

  return c.body(await getApiMetrics(), 200, {
    "Content-Type": apiMetricsContentType,
  });
});

export default app;
