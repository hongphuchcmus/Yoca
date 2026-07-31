// rate-limited-fetch.ts

import Bottleneck from "bottleneck";
import {
  captureUsageContext,
  recordProviderAttempt,
} from "@sv/middlewares/request-context.js";

type FetchRetryOptions = {
  rlRetries?: number;
  rlRetryDelayMs?: number;
  rlTimeoutMs?: number;
};

export type RateLimitedFetchOptions = RequestInit &
  FetchRetryOptions & {
    rlLimiter: Bottleneck;
    trackingId?: string;
  };

export interface ProviderSpec<ProviderId extends string> {
  id: ProviderId;
  limiter: Bottleneck;
}

export function defineProvider<const ProviderId extends string>(
  spec: ProviderSpec<ProviderId>,
): ProviderSpec<ProviderId> {
  return spec;
}

export type ServiceOperationId<ProviderId extends string> =
  `${ProviderId}.svc.${string}`;

export async function pFetch<ProviderId extends string>(
  spec: ProviderSpec<ProviderId>,
  trackingId: ServiceOperationId<ProviderId>,
  url: URL,
  options: RequestInit & FetchRetryOptions = {},
): Promise<Response> {
  return rlFetch(url, {
    ...options,
    rlLimiter: spec.limiter,
    trackingId,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function computeBackoff(attempt: number, baseDelay: number) {
  // exponential backoff + jitter
  return baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
}

function sanitizedRequestUrl(url: URL): string {
  const sanitized = new URL(url);
  for (const key of sanitized.searchParams.keys()) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("key") ||
      normalized.includes("token") ||
      normalized.includes("secret") ||
      normalized.includes("authorization")
    ) {
      sanitized.searchParams.set(key, "[REDACTED]");
    }
  }
  return sanitized.toString();
}

async function readResponsePreview(resp: Response): Promise<string | null> {
  try {
    const text = await resp.clone().text();
    if (!text) {
      return null;
    }

    const maxLog = 1000;
    if (text.length > maxLog) {
      return `${text.slice(0, maxLog)}\n... (truncated ${text.length - maxLog} chars)`;
    }

    return text;
  } catch (e) {
    return `Unable to read response body: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function rlFetch(
  url: URL,
  options: RateLimitedFetchOptions,
): Promise<Response> {
  const {
    rlLimiter,
    rlRetries = 3,
    rlRetryDelayMs = 500,
    rlTimeoutMs = 30_000,
    trackingId,
    ...fetchInit
  } = options;
  const requestContext = captureUsageContext();

  return rlLimiter.schedule(async () => {
    let lastErr: unknown;
    const requestStartedAtMs = Date.now();
    const requestUrl = sanitizedRequestUrl(url);
    const requestMethod = fetchInit.method ?? "GET";

    for (let attempt = 0; attempt <= rlRetries; attempt++) {
      const attemptStartedAtMs = Date.now();

      try {
        const resp = await fetchWithTimeout(url, fetchInit, rlTimeoutMs);
        recordProviderAttempt(requestContext, {
          trackingId: trackingId ?? "untracked",
          attempt: attempt + 1,
          status: resp.status,
          durationMs: Date.now() - attemptStartedAtMs,
        });

        if (resp.status == 429 || (resp.status >= 500 && resp.status <= 599)) {
          const retryAfter = resp.headers.get("Retry-After");

          if (attempt == rlRetries) {
            const responseBody = await readResponsePreview(resp);
            console.error(
              "Outbound request returned retryable status after retries",
              {
                url: requestUrl,
                trackingId,
                method: requestMethod,
                status: resp.status,
                attempt: attempt + 1,
                retriesRemaining: 0,
                retryAfter,
                responseBody,
                attemptDurationMs: Date.now() - attemptStartedAtMs,
                totalDurationMs: Date.now() - requestStartedAtMs,
              },
            );
            return resp;
          }

          let waitMs = computeBackoff(attempt, rlRetryDelayMs);
          let delaySource = "exponential backoff";

          if (retryAfter !== null) {
            const normalizedRetryAfter = retryAfter.trim();
            const retryAfterSeconds = Number(normalizedRetryAfter);

            if (/^\d+$/.test(normalizedRetryAfter)) {
              waitMs = retryAfterSeconds * 1_000;
              delaySource = "Retry-After seconds";
            } else {
              const retryAfterDate = Date.parse(normalizedRetryAfter);

              if (!Number.isNaN(retryAfterDate)) {
                waitMs = Math.max(0, retryAfterDate - Date.now());
                delaySource = "Retry-After date";
              } else {
                console.warn("Outbound request received invalid Retry-After", {
                  url: requestUrl,
                  trackingId,
                  method: requestMethod,
                  status: resp.status,
                  retryAfter: normalizedRetryAfter,
                });
              }
            }
          }

          console.warn("Outbound request retry", {
            url: requestUrl,
            trackingId,
            method: requestMethod,
            status: resp.status,
            attempt: attempt + 1,
            retriesRemaining: rlRetries - attempt,
            retryAfter,
            retryInMs: waitMs,
            delaySource,
            attemptDurationMs: Date.now() - attemptStartedAtMs,
            totalDurationMs: Date.now() - requestStartedAtMs,
          });

          await sleep(waitMs);
          continue;
        }

        if (!resp.ok) {
          const responseBody = await readResponsePreview(resp);
          console.info("Outbound request completed", {
            url: requestUrl,
            method: requestMethod,
            status: resp.status,
            attempt: attempt + 1,
            responseBody,
            attemptDurationMs: Date.now() - attemptStartedAtMs,
            totalDurationMs: Date.now() - requestStartedAtMs,
          });
          return resp;
        }

        console.info("Outbound request completed", {
          url: requestUrl,
          trackingId,
          method: requestMethod,
          status: resp.status,
          attempt: attempt + 1,
          attemptDurationMs: Date.now() - attemptStartedAtMs,
          totalDurationMs: Date.now() - requestStartedAtMs,
        });
        return resp;
      } catch (e) {
        lastErr = e;
        recordProviderAttempt(requestContext, {
          trackingId: trackingId ?? "untracked",
          attempt: attempt + 1,
          status: null,
          durationMs: Date.now() - attemptStartedAtMs,
          failure:
            e instanceof Error && e.name == "AbortError"
              ? "timeout"
              : "network_error",
        });

        if (attempt == rlRetries) {
          break;
        }

        const waitMs = computeBackoff(attempt, rlRetryDelayMs);

        console.warn("Outbound request network-error retry", {
          url: requestUrl,
          trackingId,
          method: requestMethod,
          status: null,
          attempt: attempt + 1,
          retriesRemaining: rlRetries - attempt,
          retryInMs: waitMs,
          errorName: e instanceof Error ? e.name : "UnknownError",
          errorMessage: e instanceof Error ? e.message : String(e),
          error: e,
          attemptDurationMs: Date.now() - attemptStartedAtMs,
          totalDurationMs: Date.now() - requestStartedAtMs,
        });

        await sleep(waitMs);
      }
    }

    console.error("Outbound request failed after retries", {
      url: requestUrl,
      trackingId,
      method: requestMethod,
      status: null,
      attempts: rlRetries + 1,
      errorName: lastErr instanceof Error ? lastErr.name : "UnknownError",
      errorMessage:
        lastErr instanceof Error ? lastErr.message : String(lastErr),
      error: lastErr,
      totalDurationMs: Date.now() - requestStartedAtMs,
    });

    throw lastErr;
  });
}
