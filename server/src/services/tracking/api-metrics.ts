import {
  API_METRICS_ENABLED,
  API_OBSERVABILITY_ROUTE_PREFIXES,
} from "@sv/config/constants.js";
import type {
  OutboundAttempt,
  RequestContext,
} from "@sv/middlewares/request-context.js";
import { Counter, Histogram, Registry } from "prom-client";

const registry = new Registry();

const httpRequests = new Counter<
  "route" | "method" | "status_class" | "journey"
>({
  name: "yoca_http_requests_total",
  help: "Total number of HTTP requests handled by Yoca",
  labelNames: ["route", "method", "status_class", "journey"],
  registers: [registry],
});

const httpRequestDuration = new Histogram<
  "route" | "method" | "status_class" | "journey"
>({
  name: "yoca_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["route", "method", "status_class", "journey"],
  registers: [registry],
});

const providerRequests = new Counter<
  "provider" | "operation" | "status_class" | "outcome" | "attempt_kind"
>({
  name: "yoca_provider_requests_total",
  help: "Total number of outbound external data and search attempts",
  labelNames: [
    "provider",
    "operation",
    "status_class",
    "outcome",
    "attempt_kind",
  ],
  registers: [registry],
});

const providerRequestDuration = new Histogram<
  "provider" | "operation" | "outcome"
>({
  name: "yoca_provider_request_duration_seconds",
  help: "Outbound external data and search attempt duration in seconds",
  labelNames: ["provider", "operation", "outcome"],
  registers: [registry],
});

const providerRetries = new Counter<"provider" | "operation" | "reason">({
  name: "yoca_provider_retries_total",
  help: "Total number of outbound blockchain data provider retry attempts",
  labelNames: ["provider", "operation", "reason"],
  registers: [registry],
});

const requestDataSources = new Counter<
  "route" | "status_class" | "source" | "forced_refresh" | "stale_fallback"
>({
  name: "yoca_request_data_source_total",
  help: "Total requests grouped by explicitly observed data sources",
  labelNames: [
    "route",
    "status_class",
    "source",
    "forced_refresh",
    "stale_fallback",
  ],
  registers: [registry],
});

const aiRequests = new Counter<"operation" | "model" | "outcome">({
  name: "yoca_ai_requests_total",
  help: "Total number of AI model calls made by Yoca",
  labelNames: ["operation", "model", "outcome"],
  registers: [registry],
});

const aiTokens = new Counter<"operation" | "model" | "token_type">({
  name: "yoca_ai_tokens_total",
  help: "AI tokens reported by the model provider",
  labelNames: ["operation", "model", "token_type"],
  registers: [registry],
});

const aiRequestDuration = new Histogram<"operation" | "model" | "outcome">({
  name: "yoca_ai_request_duration_seconds",
  help: "AI model call duration in seconds",
  labelNames: ["operation", "model", "outcome"],
  registers: [registry],
});

export interface AiMetricInput {
  operation: string;
  model: string;
  outcome: "success" | "error";
  durationMs: number;
  promptTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
}

export function recordAiMetrics(input: AiMetricInput): void {
  if (!API_METRICS_ENABLED) {
    return;
  }

  const labels = {
    operation: input.operation,
    model: input.model,
    outcome: input.outcome,
  };
  aiRequests.inc(labels);
  aiRequestDuration.observe(labels, input.durationMs / 1_000);

  const tokenCounts = {
    prompt: input.promptTokens,
    output: input.outputTokens,
    cached: input.cachedTokens,
    thinking: input.thinkingTokens,
    total: input.totalTokens,
  };
  for (const [tokenType, count] of Object.entries(tokenCounts)) {
    if (count != null && count > 0) {
      aiTokens.inc(
        {
          operation: input.operation,
          model: input.model,
          token_type: tokenType,
        },
        count,
      );
    }
  }
}

function getStatusClass(status: number | null): string {
  if (status == null) {
    return "none";
  }

  return `${Math.floor(status / 100)}xx`;
}

function getProviderOperation(trackingId: string): {
  provider: string;
  operation: string;
} {
  const serviceMarker = ".svc.";
  const serviceMarkerIndex = trackingId.indexOf(serviceMarker);
  const provider = serviceMarkerIndex > 0
    ? trackingId.slice(0, serviceMarkerIndex)
    : "other";
  const operation = serviceMarkerIndex > 0
    ? trackingId.slice(serviceMarkerIndex + serviceMarker.length)
    : trackingId;

  return { provider, operation };
}

function recordProviderMetrics(attempt: OutboundAttempt): void {
  const { provider, operation } = getProviderOperation(attempt.trackingId);
  const outcome = attempt.failure ?? (
    attempt.status != null && attempt.status >= 200 && attempt.status < 300
      ? "success"
      : "http_error"
  );

  providerRequests.inc({
    provider,
    operation,
    status_class: getStatusClass(attempt.status),
    outcome,
    attempt_kind: attempt.attempt == 1 ? "initial" : "retry",
  });
  providerRequestDuration.observe(
    { provider, operation, outcome },
    attempt.durationMs / 1_000,
  );
}

export function recordApiMetrics(
  context: RequestContext,
  status: number,
  durationMs: number,
): void {
  if (!API_METRICS_ENABLED) {
    return;
  }

  if (context.route == "/metrics") {
    return;
  }

  const labels = {
    route: context.route,
    method: context.method,
    status_class: getStatusClass(status),
    journey: "unclassified",
  };

  httpRequests.inc(labels);
  httpRequestDuration.observe(labels, durationMs / 1_000);

  const tracksDataUsage = API_OBSERVABILITY_ROUTE_PREFIXES.some((prefix) =>
    context.route.startsWith(prefix),
  );
  if (tracksDataUsage) {
    const sources: string[] = [];
    if (context.databaseResultUsed) {
      sources.push("db");
    }
    if (context.memoryResultUsed) {
      sources.push("memory");
    }
    if (context.providerResultUsed || context.outboundAttempts.length > 0) {
      sources.push("provider");
    }
    requestDataSources.inc({
      route: context.route,
      status_class: getStatusClass(status),
      source: sources.length > 0 ? sources.join("_") : "none",
      forced_refresh: String(context.forcedRefreshRequested),
      stale_fallback: String(context.staleFallbackUsed),
    });
  }

  for (let index = 0; index < context.outboundAttempts.length; index++) {
    const attempt = context.outboundAttempts[index];
    recordProviderMetrics(attempt);

    const nextAttempt = context.outboundAttempts[index + 1];
    const causedRetry =
      nextAttempt != null &&
      nextAttempt.trackingId == attempt.trackingId &&
      nextAttempt.attempt == attempt.attempt + 1;
    if (!causedRetry) {
      continue;
    }

    const { provider, operation } = getProviderOperation(attempt.trackingId);
    let reason = "network";
    if (attempt.failure == "timeout") {
      reason = "timeout";
    } else if (attempt.status == 429) {
      reason = "429";
    } else if (attempt.status != null && attempt.status >= 500) {
      reason = "5xx";
    }

    providerRetries.inc({ provider, operation, reason });
  }
}

export function getApiMetrics(): Promise<string> {
  return registry.metrics();
}

export const apiMetricsContentType = registry.contentType;
