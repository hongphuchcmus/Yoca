import { recordAiMetrics } from "@sv/services/tracking/api-metrics.js";

export type GeminiOperationId = `gemini.svc.${string}`;

interface GeminiMetricResponse {
  text?: string | null;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** Runs one Gemini request and records only operation, model, tokens, outcome, and latency. */
export async function trackGemini<Response extends GeminiMetricResponse>(
  operation: GeminiOperationId,
  model: string,
  execute: () => Promise<Response>,
): Promise<Response> {
  const startedAtMs = Date.now();

  try {
    const response = await execute();
    recordAiMetrics({
      operation,
      model,
      outcome: "success",
      durationMs: Date.now() - startedAtMs,
      promptTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
      cachedTokens: response.usageMetadata?.cachedContentTokenCount,
      thinkingTokens: response.usageMetadata?.thoughtsTokenCount,
      totalTokens: response.usageMetadata?.totalTokenCount,
    });
    return response;
  } catch (error) {
    recordAiMetrics({
      operation,
      model,
      outcome: "error",
      durationMs: Date.now() - startedAtMs,
    });
    throw error;
  }
}
