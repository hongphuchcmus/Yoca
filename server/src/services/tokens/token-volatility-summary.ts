import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

import { WALLET_AUDIT_MODEL } from "@sv/config/constants.js";
import env from "@sv/util/load-env";
import { trackGemini } from "@sv/services/tracking/gemini-metrics.js";

export interface TokenVolatilityNewsSummary {
  headline: string;
  bullets: string[];
  riskNote: string;
  generatedAt: string;
  provider?: string;
}

interface RelatedNewsInput {
  title: string;
  source: string;
  sourceType?: "news" | "web_mention" | "project_update";
  publishedAt: string | null;
  description: string;
  confidence: "high" | "medium" | "low";
  timeDistanceHours: number | null;
}

interface VolatilityEventInput {
  type: "price_spike" | "price_drop";
  timestamp: string;
  window: string;
  changePercent: number;
  before: number;
  after: number;
  severity: "medium" | "high" | "extreme";
  relatedNews: RelatedNewsInput[];
}

export interface TokenVolatilityNewsSummaryInput {
  token: {
    address: string;
    symbol: string;
    name: string;
  };
  thresholdPercent: number;
  timeframe: string;
  window: string;
  dataPointsAnalyzed: number;
  rawEventsDetected: number;
  groupedEventsReturned: number;
  evaluatedWindows: string[];
  relatedNewsWindowHours: number;
  events: VolatilityEventInput[];
}

const TOKEN_VOLATILITY_SUMMARY_MODEL =
  process.env.TOKEN_VOLATILITY_SUMMARY_MODEL?.trim() ||
  process.env.GEMINI_AUDIT_MODEL?.trim() ||
  WALLET_AUDIT_MODEL;

const summarySchema = z.object({
  headline: z.string().trim().min(1).max(220),
  bullets: z.array(z.string().trim().min(1).max(220)).min(1).max(4),
  riskNote: z.string().trim().min(1).max(280),
});

function getGeminiApiKey() {
  return env.GOOGLE_AI_KEY;
}

export function isTokenVolatilityGeminiConfigured() {
  return Boolean(getGeminiApiKey());
}

function formatPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function getLargestMove(events: VolatilityEventInput[]) {
  return events.reduce<VolatilityEventInput | null>((largest, event) => {
    if (!largest) return event;
    return Math.abs(event.changePercent) > Math.abs(largest.changePercent)
      ? event
      : largest;
  }, null);
}

function getClosestRelatedArticle(events: VolatilityEventInput[]) {
  return events
    .flatMap((event) => event.relatedNews ?? [])
    .filter((article) => article.timeDistanceHours != null)
    .sort(
      (a, b) =>
        (a.timeDistanceHours ?? Number.POSITIVE_INFINITY) -
        (b.timeDistanceHours ?? Number.POSITIVE_INFINITY),
    )[0];
}

function buildFallbackSummary(
  input: TokenVolatilityNewsSummaryInput,
  provider = "deterministic",
): TokenVolatilityNewsSummary {
  const largest = getLargestMove(input.events);
  const eventsWithNews = input.events.filter(
    (event) => event.relatedNews.length > 0,
  ).length;
  const totalRelatedArticles = input.events.reduce(
    (sum, event) => sum + event.relatedNews.length,
    0,
  );
  const closestArticle = getClosestRelatedArticle(input.events);

  if (!largest) {
    return {
      headline: `${input.token.name} had no volatility signals for the selected settings.`,
      bullets: [
        `${input.dataPointsAnalyzed} price points were analyzed for the ${input.timeframe} timeframe.`,
        `No price move crossed the ${input.thresholdPercent}% threshold.`,
        "No possible related news was attached because no signal was detected.",
      ],
      riskNote:
        "These summaries provide market context only and are not investment advice.",
      generatedAt: new Date().toISOString(),
      provider,
    };
  }

  const bullets = [
    `Largest move: ${formatPercent(largest.changePercent)} over ${largest.window}.`,
    `Possible related news was found for ${eventsWithNews} of ${input.events.length} returned signals.`,
    totalRelatedArticles > 0
      ? `${totalRelatedArticles} related articles were attached near the detected signals.`
      : "No related news was found near the returned signals.",
  ];

  if (closestArticle?.timeDistanceHours != null) {
    bullets[2] = `Closest article appeared about ${Number(
      closestArticle.timeDistanceHours.toFixed(1),
    )} hours from a signal.`;
  }

  return {
    headline: `${input.token.name} showed ${input.events.length} price volatility signal${input.events.length === 1 ? "" : "s"} for the selected settings.`,
    bullets,
    riskNote:
      "News timing can provide context, but it does not prove an article caused the price movement.",
    generatedAt: new Date().toISOString(),
    provider,
  };
}

function buildSummaryPrompt(input: TokenVolatilityNewsSummaryInput) {
  const compactInput = {
    token: {
      symbol: input.token.symbol,
      name: input.token.name,
    },
    thresholdPercent: input.thresholdPercent,
    timeframe: input.timeframe,
    window: input.window,
    dataPointsAnalyzed: input.dataPointsAnalyzed,
    rawEventsDetected: input.rawEventsDetected,
    groupedEventsReturned: input.groupedEventsReturned,
    evaluatedWindows: input.evaluatedWindows,
    relatedNewsWindowHours: input.relatedNewsWindowHours,
    events: input.events.slice(0, 5).map((event) => ({
      type: event.type,
      timestamp: event.timestamp,
      window: event.window,
      changePercent: Number(event.changePercent.toFixed(4)),
      before: event.before,
      after: event.after,
      severity: event.severity,
      relatedNews: event.relatedNews.slice(0, 3).map((article) => ({
        title: article.title,
        source: article.source,
        sourceType: article.sourceType ?? "news",
        publishedAt: article.publishedAt,
        description: article.description.slice(0, 240),
        confidence: article.confidence,
        timeDistanceHours: article.timeDistanceHours,
      })),
    })),
  };

  return [
    "Summarize these token volatility signals and possible related news.",
    "Use only the supplied JSON. Do not infer or invent causes, partnerships, hacks, listings, future price moves, or investment advice.",
    "Use cautious wording such as possible context or news near this event.",
    "Use sourceType to distinguish normal news from broader web mentions or project updates.",
    "If relatedNews only contains sourceType web_mention, write that related web mentions suggest context rather than presenting it as confirmed news.",
    "Never say the news caused the price movement.",
    "Return JSON with headline, bullets, and riskNote only.",
    "",
    JSON.stringify(compactInput, null, 2),
  ].join("\n");
}

export async function summarizeTokenVolatilityNews(
  input: TokenVolatilityNewsSummaryInput,
): Promise<TokenVolatilityNewsSummary> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return buildFallbackSummary(input);
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await trackGemini("gemini.svc.token_volatility_summary", TOKEN_VOLATILITY_SUMMARY_MODEL, () => client.models.generateContent({
      model: TOKEN_VOLATILITY_SUMMARY_MODEL,
      contents: buildSummaryPrompt(input),
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        systemInstruction: [
          "You are a careful crypto market context analyst.",
          "You summarize supplied volatility and news data without claiming causation.",
          "You do not provide investment advice.",
          "Return valid JSON only.",
        ].join(" "),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            bullets: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            riskNote: { type: Type.STRING },
          },
          required: ["headline", "bullets", "riskNote"],
        },
      },
    }));

    const parsed = summarySchema.safeParse(JSON.parse(response.text ?? "{}"));
    if (!parsed.success) {
      return buildFallbackSummary(input, "deterministic");
    }

    return {
      headline: parsed.data.headline,
      bullets: parsed.data.bullets.slice(0, 4),
      riskNote: parsed.data.riskNote,
      generatedAt: new Date().toISOString(),
      provider: `gemini:${TOKEN_VOLATILITY_SUMMARY_MODEL}`,
    };
  } catch (err) {
    console.warn("[token-volatility-summary] summary generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    return buildFallbackSummary(input, "deterministic");
  }
}
