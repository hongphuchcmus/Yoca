import env from "@sv/util/load-env.js";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sign } from "hono/jwt";
import dayjs from "dayjs";
import "@sv/util/date.js";
import {
  BENCHMARK_USER_ID,
  BENCHMARK_WASH_TOKEN_ADDRESS,
  BENCHMARK_WASH_TOKEN_SYMBOL,
} from "./benchmark-constants.js";

type JourneyName =
  | "market_radar"
  | "token_overview"
  | "wallet_core"
  | "wallet_activity"
  | "wallet_token_chart"
  | "token_ai"
  | "general_ai_chat"
  | "wash_trading_ai"
  | "wash_trading_chat"
  | "token_chart_news_ai"
  | "volatility_ai";
type PassName = "cold" | "observed_first" | "warm_repeat";

type MetricSample = {
  metric: string;
  labels: Record<string, string>;
  value: number;
};

type EndpointResult = {
  requestId: string | null;
  route: string;
  status: number | null;
  durationMs: number;
  payloadBytes: number;
  classification:
    | "data"
    | "empty_valid"
    | "unsupported"
    | "validation_error"
    | "upstream_error"
    | "internal_error"
    | "timeout"
    | "network_error";
};

type RequestResult = EndpointResult & {
  payload: unknown;
};

type MetricDelta = {
  metric: string;
  labels: Record<string, string>;
  value: number;
};

type JourneyResult = {
  journey: JourneyName;
  pass: PassName;
  resourceId: string;
  startedAt: string;
  durationMs: number;
  endpoints: EndpointResult[];
  providerAttempts: MetricDelta[];
  providerRetries: MetricDelta[];
  dataUsage: MetricDelta[];
  aiRequests: MetricDelta[];
  aiTokens: MetricDelta[];
};

const tokenDatasetSchema = z.object({
  stableTokens: z.array(
    z.object({
      resourceId: z.string(),
      address: z.string(),
      symbol: z.string().nullable(),
    }),
  ),
});

const walletDatasetSchema = z.object({
  stableWallets: z.array(
    z.object({
      address: z.string(),
    }),
  ),
});

const walletPortfolioSchema = z.array(
  z.object({
    tokenAddress: z.string(),
  }).passthrough(),
);

const poolListSchema = z.array(
  z.object({
    data: z.object({
      poolAddress: z.string(),
    }).passthrough(),
  }).passthrough(),
);

function argumentValue(name: string): string | null {
  const prefix = `--${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function parseMetricLabels(raw: string | undefined): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!raw) {
    return labels;
  }

  const labelPattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g;
  for (const match of raw.matchAll(labelPattern)) {
    const name = match[1];
    const value = match[2];
    if (name && value != null) {
      labels[name] = value
        .replaceAll("\\n", "\n")
        .replaceAll("\\\"", "\"")
        .replaceAll("\\\\", "\\");
    }
  }
  return labels;
}

function parseMetrics(text: string): MetricSample[] {
  const samples: MetricSample[] = [];
  const linePattern = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)$/i;
  for (const line of text.split("\n")) {
    if (line.length == 0 || line.startsWith("#")) {
      continue;
    }
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }
    const metric = match[1];
    const value = Number(match[3]);
    if (!metric || !Number.isFinite(value)) {
      continue;
    }
    samples.push({
      metric,
      labels: parseMetricLabels(match[2]),
      value,
    });
  }
  return samples;
}

function metricKey(sample: MetricSample): string {
  const labels = Object.entries(sample.labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join(",");
  return `${sample.metric}{${labels}}`;
}

function metricDelta(
  before: MetricSample[],
  after: MetricSample[],
  metric: string,
): MetricDelta[] {
  const beforeValues = new Map(
    before
      .filter((sample) => sample.metric == metric)
      .map((sample) => [metricKey(sample), sample.value]),
  );

  return after
    .filter((sample) => sample.metric == metric)
    .map((sample) => ({
      metric: sample.metric,
      labels: sample.labels,
      value: sample.value - (beforeValues.get(metricKey(sample)) ?? 0),
    }))
    .filter((sample) => sample.value > 0);
}

function classifyResponse(status: number, payload: unknown): EndpointResult["classification"] {
  if (status == 404) return "unsupported";
  if (status == 422) return "validation_error";
  if (status == 502 || status == 503 || status == 504) return "upstream_error";
  if (status >= 500) return "internal_error";
  if (status >= 400) return "upstream_error";
  if (Array.isArray(payload)) {
    return payload.length > 0 ? "data" : "empty_valid";
  }
  if (payload && typeof payload == "object") {
    return Object.keys(payload).length > 0 ? "data" : "empty_valid";
  }
  return payload == null || payload == "" ? "empty_valid" : "data";
}

async function fetchMetrics(baseUrl: string): Promise<MetricSample[]> {
  const headers: Record<string, string> = {};
  if (env.API_METRICS_BEARER_TOKEN.length > 0) {
    headers.Authorization = `Bearer ${env.API_METRICS_BEARER_TOKEN}`;
  }
  const response = await fetch(`${baseUrl}/metrics`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Metrics endpoint returned ${response.status}`);
  }
  return parseMetrics(await response.text());
}

async function requestEndpoint(
  baseUrl: string,
  runId: string,
  requestIndex: number,
  route: string,
  url: string,
  init: RequestInit = {},
): Promise<RequestResult> {
  const startedAtMs = Date.now();
  try {
    const headers = new Headers(init.headers);
    headers.set("x-request-id", `${runId}-${requestIndex}`);
    const response = await fetch(`${baseUrl}${url}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    let payload: unknown = null;
    let parseFailed = false;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        parseFailed = true;
      }
    }
    return {
      requestId: response.headers.get("x-request-id"),
      route,
      status: response.status,
      durationMs: Date.now() - startedAtMs,
      payloadBytes: Buffer.byteLength(text),
      classification: parseFailed
        ? "validation_error"
        : classifyResponse(response.status, payload),
      payload,
    };
  } catch (error) {
    return {
      requestId: null,
      route,
      status: null,
      durationMs: Date.now() - startedAtMs,
      payloadBytes: 0,
      classification:
        error instanceof Error && error.name == "TimeoutError"
          ? "timeout"
          : "network_error",
      payload: null,
    };
  }
}

async function runAiRequest(
  baseUrl: string,
  runId: string,
  pass: PassName,
  journey: "token_ai" | "general_ai_chat" | "wash_trading_ai" | "wash_trading_chat" | "token_chart_news_ai" | "volatility_ai",
  route: string,
  body: Record<string, unknown> | null,
  authToken: string,
  url = route,
): Promise<JourneyResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const before = await fetchMetrics(baseUrl);
  const endpoint = await requestEndpoint(
    baseUrl,
    runId,
    1,
    route,
    url,
    body == null
      ? {
          method: "GET",
          headers: {
            Cookie: `auth_token=${authToken}`,
            Origin: "http://localhost:3000",
          },
        }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `auth_token=${authToken}`,
            Origin: "http://localhost:3000",
          },
          body: JSON.stringify(body),
        },
  );
  const after = await fetchMetrics(baseUrl);

  return {
    journey,
    pass,
    resourceId: journey,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    endpoints: [publicEndpointResult(endpoint)],
    providerAttempts: metricDelta(before, after, "yoca_provider_requests_total"),
    providerRetries: metricDelta(before, after, "yoca_provider_retries_total"),
    dataUsage: metricDelta(before, after, "yoca_request_data_source_total"),
    aiRequests: metricDelta(before, after, "yoca_ai_requests_total"),
    aiTokens: metricDelta(before, after, "yoca_ai_tokens_total"),
  };
}

function publicEndpointResult(result: RequestResult): EndpointResult {
  return {
    requestId: result.requestId,
    route: result.route,
    status: result.status,
    durationMs: result.durationMs,
    payloadBytes: result.payloadBytes,
    classification: result.classification,
  };
}

async function runTokenOverview(
  baseUrl: string,
  runId: string,
  pass: PassName,
  resourceId: string,
  address: string,
): Promise<JourneyResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const before = await fetchMetrics(baseUrl);
  let requestIndex = 0;
  const baseRequests = [
    ["/api/tokens/details/:addresses", `/api/tokens/details/${address}`],
    ["/api/tokens/:address/pools", `/api/tokens/${address}/pools`],
    ["/api/tokens/holders/:address", `/api/tokens/holders/${address}`],
    ["/api/tokens/holders/stats/:addresses", `/api/tokens/holders/stats/${address}`],
    ["/api/tokens/markets/:addresses", `/api/tokens/markets/${address}`],
    ["/api/tokens/markets/chart/:address", `/api/tokens/markets/chart/${address}`],
  ];
  const baseResults = await Promise.all(
    baseRequests.map(([route, url]) => {
      requestIndex += 1;
      return requestEndpoint(baseUrl, runId, requestIndex, route, url);
    }),
  );

  const endpointResults = [...baseResults];
  const poolResponse = baseResults[1];
  const parsedPools = poolListSchema.safeParse(poolResponse?.payload);
  const poolAddress = parsedPools.success
    ? parsedPools.data[0]?.data.poolAddress
    : null;
  if (poolAddress) {
    const poolRequests = [
      ["/api/tokens/pools/trades/:address", `/api/tokens/pools/trades/${poolAddress}`],
      ["/api/tokens/pools/:addresses", `/api/tokens/pools/${poolAddress}`],
    ];
    endpointResults.push(
      ...(await Promise.all(
        poolRequests.map(([route, url]) => {
          requestIndex += 1;
          return requestEndpoint(baseUrl, runId, requestIndex, route, url);
        }),
      )),
    );
  }

  const after = await fetchMetrics(baseUrl);
  return {
    journey: "token_overview",
    pass,
    resourceId,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    endpoints: endpointResults.map(publicEndpointResult),
    providerAttempts: metricDelta(before, after, "yoca_provider_requests_total"),
    providerRetries: metricDelta(before, after, "yoca_provider_retries_total"),
    dataUsage: metricDelta(before, after, "yoca_request_data_source_total"),
    aiRequests: metricDelta(before, after, "yoca_ai_requests_total"),
    aiTokens: metricDelta(before, after, "yoca_ai_tokens_total"),
  };
}

async function runMarketRadar(
  baseUrl: string,
  runId: string,
  pass: PassName,
): Promise<JourneyResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const before = await fetchMetrics(baseUrl);
  let requestIndex = 0;
  const requests = [
    ["/api/tokens/market-pools/trending", "/api/tokens/market-pools/trending"],
    ["/api/tokens/market-pools/top", "/api/tokens/market-pools/top"],
    ["/api/tokens/market-pools/gainers", "/api/tokens/market-pools/gainers"],
    ["/api/tokens/market-pools/new-pairs", "/api/tokens/market-pools/new-pairs"],
    ["/api/trades/traders/gainers", "/api/trades/traders/gainers"],
    ["/api/trades/traders/losers", "/api/trades/traders/losers"],
  ];
  const endpointResults = await Promise.all(
    requests.map(([route, url]) => {
      requestIndex += 1;
      return requestEndpoint(baseUrl, runId, requestIndex, route, url);
    }),
  );
  const after = await fetchMetrics(baseUrl);
  return {
    journey: "market_radar",
    pass,
    resourceId: "market_radar",
    startedAt,
    durationMs: Date.now() - startedAtMs,
    endpoints: endpointResults.map(publicEndpointResult),
    providerAttempts: metricDelta(before, after, "yoca_provider_requests_total"),
    providerRetries: metricDelta(before, after, "yoca_provider_retries_total"),
    dataUsage: metricDelta(before, after, "yoca_request_data_source_total"),
    aiRequests: metricDelta(before, after, "yoca_ai_requests_total"),
    aiTokens: metricDelta(before, after, "yoca_ai_tokens_total"),
  };
}

async function runWalletCore(
  baseUrl: string,
  runId: string,
  pass: PassName,
  resourceId: string,
  address: string,
): Promise<JourneyResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const before = await fetchMetrics(baseUrl);
  let requestIndex = 0;
  const requests = [
    ["/api/wallets/overview", `/api/wallets/overview?address=${address}&period=30D`],
    ["/api/wallets/portfolio", `/api/wallets/portfolio?address=${address}`],
    ["/api/wallets/:address/tokens", `/api/wallets/${address}/tokens`],
    ["/api/wallets/analysis/winrate", `/api/wallets/analysis/winrate?wallets=${address}&period=30D`],
  ];
  const endpointResults = await Promise.all(
    requests.map(([route, url]) => {
      requestIndex += 1;
      return requestEndpoint(baseUrl, runId, requestIndex, route, url);
    }),
  );
  const after = await fetchMetrics(baseUrl);
  return {
    journey: "wallet_core",
    pass,
    resourceId,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    endpoints: endpointResults.map(publicEndpointResult),
    providerAttempts: metricDelta(before, after, "yoca_provider_requests_total"),
    providerRetries: metricDelta(before, after, "yoca_provider_retries_total"),
    dataUsage: metricDelta(before, after, "yoca_request_data_source_total"),
    aiRequests: metricDelta(before, after, "yoca_ai_requests_total"),
    aiTokens: metricDelta(before, after, "yoca_ai_tokens_total"),
  };
}

async function runWalletActivity(
  baseUrl: string,
  runId: string,
  pass: PassName,
  resourceId: string,
  address: string,
  concurrent = true,
): Promise<JourneyResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const before = await fetchMetrics(baseUrl);
  let requestIndex = 0;
  const requests = [
    [
      "/api/wallets/swaps/history/:address",
      `/api/wallets/swaps/history/${address}`,
    ],
    [
      "/api/wallets/transfers/history/:address",
      `/api/wallets/transfers/history/${address}`,
    ],
  ];
  const endpointResults: RequestResult[] = [];
  if (concurrent) {
    endpointResults.push(...await Promise.all(requests.map(([route, url]) => {
      requestIndex += 1;
      return requestEndpoint(baseUrl, runId, requestIndex, route, url);
    })));
  } else {
    for (const [route, url] of requests) {
      requestIndex += 1;
      endpointResults.push(
        await requestEndpoint(baseUrl, runId, requestIndex, route, url),
      );
    }
  }
  const after = await fetchMetrics(baseUrl);
  return {
    journey: "wallet_activity",
    pass,
    resourceId,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    endpoints: endpointResults.map(publicEndpointResult),
    providerAttempts: metricDelta(before, after, "yoca_provider_requests_total"),
    providerRetries: metricDelta(before, after, "yoca_provider_retries_total"),
    dataUsage: metricDelta(before, after, "yoca_request_data_source_total"),
    aiRequests: metricDelta(before, after, "yoca_ai_requests_total"),
    aiTokens: metricDelta(before, after, "yoca_ai_tokens_total"),
  };
}

async function runWalletTokenChart(
  baseUrl: string,
  runId: string,
  pass: PassName,
  resourceId: string,
  address: string,
): Promise<JourneyResult> {
  const portfolioResult = await requestEndpoint(
    baseUrl,
    runId,
    0,
    "/api/wallets/portfolio",
    `/api/wallets/portfolio?address=${address}`,
  );
  const portfolio = walletPortfolioSchema.parse(portfolioResult.payload);
  const tokenAddresses = portfolio
    .map((token) => token.tokenAddress)
    .slice(0, 3);
  if (tokenAddresses.length == 0) {
    throw new Error(`Wallet ${resourceId} has no portfolio tokens for chart benchmark`);
  }

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const before = await fetchMetrics(baseUrl);
  const route = "/api/charts/balance/tokens";
  const query = new URLSearchParams({
    timePeriod: "7D",
    wallet: address,
    tokens: tokenAddresses.join(","),
  });
  const endpointResult = await requestEndpoint(
    baseUrl,
    runId,
    1,
    route,
    `${route}?${query.toString()}`,
  );
  const after = await fetchMetrics(baseUrl);
  return {
    journey: "wallet_token_chart",
    pass,
    resourceId,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    endpoints: [publicEndpointResult(endpointResult)],
    providerAttempts: metricDelta(before, after, "yoca_provider_requests_total"),
    providerRetries: metricDelta(before, after, "yoca_provider_retries_total"),
    dataUsage: metricDelta(before, after, "yoca_request_data_source_total"),
    aiRequests: metricDelta(before, after, "yoca_ai_requests_total"),
    aiTokens: metricDelta(before, after, "yoca_ai_tokens_total"),
  };
}

async function main(): Promise<void> {
  if (!env.API_METRICS_ENABLED) {
    throw new Error("API_METRICS_ENABLED must be true for journey benchmarks");
  }

  const requestedJourney = argumentValue("journey") ?? "all";
  if (!["all", "market", "token", "wallet", "activity", "activity-sequential", "chart", "ai", "ai-summaries"].includes(requestedJourney)) {
    throw new Error("--journey must be all, market, token, wallet, activity, activity-sequential, chart, ai, or ai-summaries");
  }
  const passCount = Number(argumentValue("passes") ?? "2");
  if (!Number.isInteger(passCount) || passCount < 1 || passCount > 2) {
    throw new Error("--passes must be 1 or 2");
  }
  const sampleCount = Number(argumentValue("samples") ?? "1");
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 8) {
    throw new Error("--samples must be an integer from 1 to 8");
  }
  const requestedPhase = argumentValue("phase") ?? "observed";
  if (!["observed", "cold"].includes(requestedPhase)) {
    throw new Error("--phase must be observed or cold");
  }

  const currentFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(currentFile), "../../../../");
  const datasetDir = path.join(
    repoRoot,
    "docs/plans/business/benchmark-results/datasets",
  );
  const tokenDatasetPath = path.join(
    datasetDir,
    "token-benchmark-stable-2026-07-19.json",
  );
  const walletDatasetPath = path.join(
    datasetDir,
    "wallet-benchmark-stable-2026-07-19.json",
  );
  const tokenDataset = tokenDatasetSchema.parse(
    JSON.parse(await readFile(tokenDatasetPath, "utf8")),
  );
  const walletDataset = walletDatasetSchema.parse(
    JSON.parse(await readFile(walletDatasetPath, "utf8")),
  );
  const tokens = tokenDataset.stableTokens.slice(0, sampleCount);
  const wallets = walletDataset.stableWallets.slice(0, sampleCount);
  if (tokens.length != sampleCount || wallets.length != sampleCount) {
    throw new Error("Stable token and wallet datasets must not be empty");
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const runId = `${timestamp}_journey-${requestedPhase}`;
  const runDir = path.join(
    repoRoot,
    "docs/plans/business/benchmark-results/runs",
    runId,
  );
  await mkdir(runDir, { recursive: true });
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    commit = "unknown";
  }

  const manifest = {
    runId,
    commit,
    environment: "local_benchmark",
    database: "configured_server_database",
    startedAt: new Date().toISOString(),
    phase: passCount == 2
      ? `${requestedPhase}_first_and_warm_repeat`
      : `${requestedPhase}_first`,
    datasetVersion: "2026-07-19",
    sampleCount,
    providerMode: "real",
    notes: requestedPhase == "cold"
      ? "Database schema was reset immediately before this run; first pass is cold and the second is its warm repeat."
      : "Observed-first is not claimed as cold because database state was not controlled by this runner.",
  };
  await writeFile(
    path.join(runDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const results: JourneyResult[] = [];
  const authToken = await sign(
    {
      id: BENCHMARK_USER_ID,
      displayName: "Yoca Benchmark",
      avatarUrl: null,
      exp: dayjs.utc().add(2, "hour").unix(),
    },
    env.JWT_SECRET,
  );
  for (let passIndex = 0; passIndex < passCount; passIndex += 1) {
    const pass: PassName = passIndex == 0
      ? requestedPhase == "cold" ? "cold" : "observed_first"
      : "warm_repeat";
    if (requestedJourney == "all" || requestedJourney == "market") {
      results.push(
        await runMarketRadar(
          env.YOCA_BENCHMARK_BASE_URL,
          `${runId}-market_radar-${pass}`,
          pass,
        ),
      );
    }
    if (requestedJourney == "all" || requestedJourney == "token") {
      for (const token of tokens) {
        results.push(
          await runTokenOverview(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-${token.resourceId}-${pass}`,
            pass,
            token.resourceId,
            token.address,
          ),
        );
      }
    }
    if (requestedJourney == "all" || requestedJourney == "wallet") {
      for (const [walletIndex, wallet] of wallets.entries()) {
        const resourceId = `wallet_${String(walletIndex + 1).padStart(3, "0")}`;
        results.push(
          await runWalletCore(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-${resourceId}-${pass}`,
            pass,
            resourceId,
            wallet.address,
          ),
        );
      }
    }
    if (
      requestedJourney == "all" ||
      requestedJourney == "activity" ||
      requestedJourney == "activity-sequential"
    ) {
      for (const [walletIndex, wallet] of wallets.entries()) {
        const resourceId = `wallet_${String(walletIndex + 1).padStart(3, "0")}`;
        results.push(
          await runWalletActivity(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-${resourceId}-${pass}`,
            pass,
            resourceId,
            wallet.address,
            requestedJourney != "activity-sequential",
          ),
        );
      }
    }
    if (requestedJourney == "all" || requestedJourney == "chart") {
      for (const [walletIndex, wallet] of wallets.entries()) {
        const resourceId = `wallet_${String(walletIndex + 1).padStart(3, "0")}`;
        results.push(
          await runWalletTokenChart(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-${resourceId}-${pass}`,
            pass,
            resourceId,
            wallet.address,
          ),
        );
      }
    }
    if (requestedJourney == "ai") {
      const washQuestions = [
        "Explain the current risk score using the strongest observed signals.",
        "Which wallet pattern contributes most to the wash-trading assessment?",
        "Summarize the circular-trade evidence and its limitations.",
        "What should a reviewer inspect first in this analysis?",
        "Explain how the selected graph algorithm affects this result.",
      ];
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const token = tokens[sampleIndex];
        const wallet = wallets[sampleIndex];
        if (!token || !wallet) {
          throw new Error(`Missing AI benchmark input for sample ${sampleIndex + 1}`);
        }
        const symbol = token.symbol ?? `TOKEN_${sampleIndex + 1}`;
        results.push(
          await runAiRequest(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-token_ai-${sampleIndex + 1}-${pass}`,
            pass,
            "token_ai",
            "/api/token-ai-chat",
            {
              address: token.address,
              symbol,
              name: symbol,
              question: `Summarize the strongest opportunities and risks for ${symbol} using current Yoca evidence.`,
              timeframe: "24h",
              language: "en",
              includeNews: true,
              includeVolatility: true,
              modelMode: "balanced",
            },
            authToken,
          ),
          await runAiRequest(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-general_ai_chat-${sampleIndex + 1}-${pass}`,
            pass,
            "general_ai_chat",
            "/api/chat",
            {
              addresses: [wallet.address],
              query: "Summarize this wallet's portfolio, recent activity, and main risks using Yoca data.",
              language: "en",
              contextType: "wallet",
              skipCache: true,
              skipSessionSave: true,
            },
            authToken,
          ),
          await runAiRequest(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-wash_trading_ai-${sampleIndex + 1}-${pass}`,
            pass,
            "wash_trading_ai",
            "/api/v1/wash-trading/ai-analyze",
            {
              mint: BENCHMARK_WASH_TOKEN_ADDRESS,
              symbol: BENCHMARK_WASH_TOKEN_SYMBOL,
              timeframe: sampleIndex % 2 == 0 ? "24h" : "7d",
              algorithm: sampleIndex % 2 == 0 ? "GCN" : "GraphSAGE",
              language: "en",
              limit: 20,
            },
            authToken,
          ),
          await runAiRequest(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-wash_trading_chat-${sampleIndex + 1}-${pass}`,
            pass,
            "wash_trading_chat",
            "/api/v1/wash-trading/chat",
            {
              mint: BENCHMARK_WASH_TOKEN_ADDRESS,
              symbol: BENCHMARK_WASH_TOKEN_SYMBOL,
              timeframe: "24h",
              algorithm: "GCN",
              language: "en",
              query: washQuestions[sampleIndex] ?? washQuestions[0],
              history: [],
            },
            authToken,
          ),
        );
      }
    }
    if (requestedJourney == "ai-summaries") {
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const token = tokens[sampleIndex];
        if (!token) {
          throw new Error(`Missing AI summary benchmark input for sample ${sampleIndex + 1}`);
        }
        const symbol = token.symbol ?? `TOKEN_${sampleIndex + 1}`;
        const chartNewsQuery = new URLSearchParams({
          address: token.address,
          symbol,
          name: symbol,
          timeframe: "1m",
          includeSummary: "true",
          forceRefresh: "true",
        });
        const volatilityQuery = new URLSearchParams({
          address: token.address,
          symbol,
          name: symbol,
          threshold: "20",
          timeframe: "daily",
          window: "auto",
          maxEventsWithNews: "3",
          includeSummary: "true",
          forceRefresh: "true",
        });
        results.push(
          await runAiRequest(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-token_chart_news_ai-${sampleIndex + 1}-${pass}`,
            pass,
            "token_chart_news_ai",
            "/api/token-chart-news-events",
            null,
            authToken,
            `/api/token-chart-news-events?${chartNewsQuery.toString()}`,
          ),
          await runAiRequest(
            env.YOCA_BENCHMARK_BASE_URL,
            `${runId}-volatility_ai-${sampleIndex + 1}-${pass}`,
            pass,
            "volatility_ai",
            "/api/token-volatility-news",
            null,
            authToken,
            `/api/token-volatility-news?${volatilityQuery.toString()}`,
          ),
        );
      }
    }
  }

  await writeFile(
    path.join(runDir, "events.jsonl"),
    `${results.map((result) => JSON.stringify(result)).join("\n")}\n`,
    "utf8",
  );
  const summary = {
    runId,
    journeys: results.map((result) => ({
      journey: result.journey,
      pass: result.pass,
      resourceId: result.resourceId,
      durationMs: result.durationMs,
      endpointCount: result.endpoints.length,
      successfulEndpoints: result.endpoints.filter((endpoint) =>
        endpoint.status != null && endpoint.status >= 200 && endpoint.status < 300
      ).length,
      providerAttemptCount: result.providerAttempts.reduce(
        (sum, sample) => sum + sample.value,
        0,
      ),
      providerRetryCount: result.providerRetries.reduce(
        (sum, sample) => sum + sample.value,
        0,
      ),
      endpoints: result.endpoints,
      providerAttempts: result.providerAttempts,
      dataUsage: result.dataUsage,
      aiRequests: result.aiRequests,
      aiTokens: result.aiTokens,
    })),
  };
  await writeFile(
    path.join(runDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ runId, runDir, journeys: summary.journeys }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
