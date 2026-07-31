import { GoogleGenAI, Type } from "@google/genai";
import { WALLET_AUDIT_MODEL } from "@sv/config/constants.js";
import type { TokenNewsArticle } from "@sv/services/rss-news.service.js";
import env from "@sv/util/load-env";
import { trackGemini } from "@sv/services/tracking/gemini-metrics.js";
import { z } from "zod";

export interface TokenChartNewsEventSummary {
  headline: string;
  tldr: string;
  bullets: string[];
  themes: string[];
  confidence: "high" | "medium" | "low";
  riskNote: string;
  provider?: string;
  generatedAt: string;
}

export interface TokenChartNewsEventSummaryInput {
  token: {
    symbol: string;
    name: string;
  };
  date: string;
  articleCount: number;
  articles: TokenNewsArticle[];
}

const TOKEN_CHART_NEWS_SUMMARY_MODEL =
  process.env.TOKEN_CHART_NEWS_SUMMARY_MODEL?.trim() ||
  process.env.GEMINI_AUDIT_MODEL?.trim() ||
  WALLET_AUDIT_MODEL;

const TOKEN_CHART_NEWS_RISK_NOTE =
  "These articles provide news context only and do not prove causation or imply investment advice.";
const ARTICLE_FETCH_TIMEOUT_MS = 5_000;
const MAX_ARTICLES_WITH_EXTRACTED_TEXT = 5;
const ARTICLE_EXTRACTED_TEXT_MAX_CHARS = 1_600;
const MIN_CLEAN_DESCRIPTION_CHARS = 80;
const MIN_CLEAN_EXTRACTED_TEXT_CHARS = 200;

const summarySchema = z.object({
  headline: z.string().trim().min(1).max(140),
  tldr: z.string().trim().min(1).max(520),
  bullets: z.array(z.string().trim().min(1).max(260)).min(1).max(4),
  themes: z.array(z.string().trim().min(1).max(48)).min(1).max(6),
  confidence: z.enum(["high", "medium", "low"]),
  riskNote: z.string().trim().min(1).max(280),
});

interface PromptArticle {
  title: string;
  source: string;
  sourceType: TokenNewsArticle["sourceType"];
  publishedAt: string | null;
  description: string;
  extraSnippets: string[];
  extractedText: string | null;
  url: string;
}

const BOILERPLATE_PATTERNS = [
  /\bskip to main content\b/gi,
  /\badvertisement\b/gi,
  /\badvertise with us\b/gi,
  /\bsign up\b/gi,
  /\bsubscribe\b/gi,
  /\bshare this article\b/gi,
  /\bread more\b/gi,
  /\brelated articles?\b/gi,
  /\bcookies?\b/gi,
  /\bprivacy policy\b/gi,
  /\bterms of service\b/gi,
  /\ball rights reserved\b/gi,
  /\bnavigation\b/gi,
  /\bmenu\b/gi,
  /\bsearch\b/gi,
  /\bhome\b/gi,
  /\babout\b/gi,
  /\bcontact\b/gi,
  /\bnewsletter\b/gi,
  /\bmain menu\b/gi,
  /\bread full article\b/gi,
  /\bcontinue reading\b/gi,
  /\baccept cookies\b/gi,
  /\bmanage consent\b/gi,
  /\bprivacy preferences\b/gi,
  /\bticker report\b/gi,
  /\bdaily political\b/gi,
  /\bread next\b/gi,
  /\bfollow us\b/gi,
  /\btrending\b/gi,
  /\bpopular posts?\b/gi,
  /\blatest news\b/gi,
  /\bmarket news\b/gi,
];

function getGeminiApiKey() {
  return env.GOOGLE_AI_KEY;
}

export function isTokenChartNewsSummaryGeminiConfigured() {
  return Boolean(getGeminiApiKey());
}

function normalizeText(value: string | null | undefined, maxLength: number) {
  return cleanArticleText(value ?? "", undefined, maxLength);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

function normalizeForComparison(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldPreferSnippetOverExtractedText(source: string) {
  const normalizedSource = source.trim().toLowerCase();
  return ["ticker report", "daily political"].some((sourceName) =>
    normalizedSource.includes(sourceName),
  );
}

function removeRepeatedTitlePrefix(text: string, title?: string) {
  if (!title) return text;

  const normalizedTitle = normalizeForComparison(title);
  if (!normalizedTitle) return text;

  let cleaned = text.trim();
  const titlePattern = new RegExp(
    escapeRegExp(title.trim()).replace(/\s+/g, "\\s+"),
    "gi",
  );

  for (let i = 0; i < 3; i += 1) {
    const normalizedText = normalizeForComparison(cleaned.slice(0, 500));
    if (!normalizedText.startsWith(normalizedTitle)) break;

    cleaned = cleaned
      .slice(title.length)
      .replace(/^(\s|[-:|–—.])+/, " ")
      .trim();
  }

  return cleaned.replace(titlePattern, " ").trim();
}

function dedupeRepeatedSentences(text: string) {
  const seen = new Set<string>();

  return text
    .split(/(?<=[.!?])\s+|\s+\|\s+|\s+•\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      if (!sentence) return false;
      if (isLowValueSentence(sentence)) return false;

      const key = sentence
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

function isLowValueSentence(sentence: string) {
  const cleaned = sentence
    .replace(/[^a-zA-Z0-9\s$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  if (words.length === 0) return true;
  if (words.length <= 3 && /^[A-Z0-9\s$]+$/.test(cleaned)) return true;

  const lowValueFragments = new Set([
    "trading",
    "markets",
    "market",
    "crypto",
    "news",
    "read next",
    "latest news",
    "popular",
    "trending",
  ]);

  if (lowValueFragments.has(lower)) return true;

  return BOILERPLATE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(sentence);
  });
}

function getMeaningfulSentence(text: string) {
  return (
    text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => cleanArticleText(sentence, undefined, 260))
      .find((sentence) => {
        const words = sentence.split(/\s+/).filter(Boolean);
        return sentence.length >= 60 && words.length >= 8;
      }) ?? ""
  );
}

function removeBoilerplate(text: string) {
  let cleaned = text;

  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned;
}

function isMostlyBoilerplate(text: string) {
  const normalized = text.toLowerCase();
  const boilerplateHits = BOILERPLATE_PATTERNS.filter((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(normalized);
  }).length;

  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  if (words.length < 12) return true;
  return boilerplateHits >= 4 && text.length < 260;
}

export function cleanArticleText(
  text: string | null | undefined,
  title?: string,
  maxLength = ARTICLE_EXTRACTED_TEXT_MAX_CHARS,
) {
  if (!text) return "";

  const stripped = decodeHtmlEntities(text)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote)>/gi, ". ")
    .replace(/<[^>]*>/g, " ");

  const cleaned = dedupeRepeatedSentences(
    removeRepeatedTitlePrefix(
      removeBoilerplate(stripped)
        .replace(/\s+/g, " ")
        .replace(/\s+([.,!?;:])/g, "$1")
        .replace(/([.!?]){2,}/g, "$1")
        .trim(),
      title,
    ),
  )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, maxLength).trim();
}

function extractReadableText(html: string, title?: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const text = cleanArticleText(
    withoutNoise,
    title,
    ARTICLE_EXTRACTED_TEXT_MAX_CHARS,
  );

  if (text.length < MIN_CLEAN_EXTRACTED_TEXT_CHARS) return null;
  return text;
}

export async function fetchArticleSummaryText(
  url: string,
  title?: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Yoca Article Summary Fetcher/1.0",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const html = await response.text();
    return extractReadableText(html, title);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function formatDateLabel(dateKey: string) {
  const timestamp = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) return dateKey;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(timestamp);
}

function buildArticlesForPromptWithoutFetch(
  articles: TokenNewsArticle[],
): PromptArticle[] {
  return articles.slice(0, 10).map((article) => {
    const title = normalizeText(article.title, 220);
    const description = cleanArticleText(article.description, title, 700);

    return {
      title,
      source: article.source,
      sourceType: article.sourceType ?? "news",
      publishedAt: article.publishedAt,
      description:
        description.length >= MIN_CLEAN_DESCRIPTION_CHARS ? description : "",
      extraSnippets: article.matchedBy.slice(0, 4),
      extractedText: null,
      url: article.url,
    };
  });
}

async function buildArticlesForPrompt(
  articles: TokenNewsArticle[],
): Promise<PromptArticle[]> {
  const baseArticles = buildArticlesForPromptWithoutFetch(articles);
  const extractedTextResults = await Promise.all(
    baseArticles
      .slice(0, MAX_ARTICLES_WITH_EXTRACTED_TEXT)
      .map((article) =>
        shouldPreferSnippetOverExtractedText(article.source)
          ? Promise.resolve(null)
          : fetchArticleSummaryText(article.url, article.title),
      ),
  );

  return baseArticles.map((article, index) => ({
    ...article,
    extractedText:
      index < MAX_ARTICLES_WITH_EXTRACTED_TEXT &&
      extractedTextResults[index] &&
      !isMostlyBoilerplate(extractedTextResults[index])
        ? extractedTextResults[index]
        : null,
  }));
}

function detectThemes(text: string) {
  const candidates: Array<[string, RegExp]> = [
    ["security", /\b(exploit|hack|vulnerability|security|attack)\b/i],
    ["listing", /\b(listing|exchange|binance|coinbase|kraken)\b/i],
    ["partnership", /\b(partnership|partner|collaboration|integration)\b/i],
    ["regulation", /\b(regulation|regulatory|sec|lawsuit|policy)\b/i],
    ["ecosystem", /\b(ecosystem|developer|protocol|network|mainnet)\b/i],
    ["market attention", /\b(market|trading|volume|demand|investor)\b/i],
    ["governance", /\b(governance|proposal|vote|dao)\b/i],
    ["funding", /\b(funding|raise|investment|treasury)\b/i],
  ];

  const themes = candidates
    .filter(([, pattern]) => pattern.test(text))
    .map(([theme]) => theme);

  return themes.length > 0 ? themes.slice(0, 4) : ["token news"];
}

export function buildFallbackChartNewsSummary(
  input: TokenChartNewsEventSummaryInput,
  provider = "deterministic",
  promptArticles = buildArticlesForPromptWithoutFetch(input.articles),
): TokenChartNewsEventSummary {
  const extractedTexts = promptArticles
    .map((article) => cleanArticleText(article.extractedText, article.title))
    .filter((text) => text.length >= MIN_CLEAN_EXTRACTED_TEXT_CHARS);
  const snippets = promptArticles
    .map((article) => cleanArticleText(article.description, article.title))
    .filter(
      (description) => description.length >= MIN_CLEAN_DESCRIPTION_CHARS,
    );
  const evidenceTexts =
    extractedTexts.length > 0
      ? extractedTexts
      : snippets.length > 0
      ? snippets
      : [];
  const combinedEvidence = evidenceTexts.join(" ");
  const themes = detectThemes(combinedEvidence);
  const onlyWebMentions =
    promptArticles.length > 0 &&
    promptArticles.every((article) => article.sourceType === "web_mention");
  const hasLimitedSnippets =
    extractedTexts.length === 0 &&
    (snippets.length === 0 ||
      snippets.join(" ").length < Math.min(160, input.articleCount * 60));
  const confidence: TokenChartNewsEventSummary["confidence"] =
    extractedTexts.length >= 2
      ? "high"
      : snippets.length >= 3
        ? "medium"
        : "low";

  const bullets =
    evidenceTexts.length > 0
      ? evidenceTexts
          .map((text) => getMeaningfulSentence(text))
          .filter(Boolean)
          .slice(0, 3)
      : ["Only limited article snippets were available for this date."];

  if (hasLimitedSnippets) {
    bullets.push(
      "Only limited article snippets were available for this date.",
    );
  }

  return {
    headline: onlyWebMentions
      ? `${input.token.name} related web mentions for ${formatDateLabel(input.date)}.`
      : `${input.token.name} news summary for ${formatDateLabel(input.date)}.`,
    tldr:
      evidenceTexts.length > 0
        ? `${onlyWebMentions ? "Related web mentions suggest" : "The available article context points to"} ${themes.slice(0, 2).join(" and ")} around ${input.token.name}. ${hasLimitedSnippets ? "Because the snippets are limited, this summary should be treated as brief context rather than a full article synthesis." : "The summary uses available snippets and extracted article text."}`
        : "Only limited article snippets were available for this date.",
    bullets: [...new Set(bullets)].slice(0, 3),
    themes,
    confidence,
    riskNote: TOKEN_CHART_NEWS_RISK_NOTE,
    generatedAt: new Date().toISOString(),
    provider,
  };
}

function buildSummaryPrompt(
  input: TokenChartNewsEventSummaryInput,
  promptArticles: PromptArticle[],
) {
  const articlesJson = JSON.stringify(promptArticles, null, 2);

  return [
    "Token:",
    `Name: ${input.token.name}`,
    `Symbol: ${input.token.symbol}`,
    "",
    "Date/timeframe:",
    input.date,
    "",
    "Articles:",
    articlesJson,
    "",
    "Task:",
    "Write a CoinGecko-style news insight summary for this token/date.",
    "",
    "Rules:",
    "- Synthesize the articles; do not list titles.",
    "- Use sourceType to distinguish confirmed news from broader web mentions or project updates.",
    "- If all articles are sourceType web_mention, use cautious wording such as \"Related web mentions suggest\".",
    "- Never present web mentions as confirmed major news.",
    "- Use extractedText and descriptions as primary evidence.",
    "- Identify the shared theme across articles.",
    "- Mention concrete developments: integrations, listings, partnerships, launches, regulation, security, ecosystem activity, adoption, or market context.",
    "- If articles are mixed or only loosely related, say that clearly.",
    "- Do not say the news caused price movement.",
    "- Do not predict price.",
    "- Do not add facts not present in the articles.",
    "- Keep it concise and readable for token chart users.",
    "",
    "Return valid JSON only:",
    "{",
    '  "headline": "One clear sentence, max 18 words.",',
    '  "tldr": "2-4 sentences summarizing the real news context across articles.",',
    '  "bullets": [',
    '    "Specific synthesized point from article content.",',
    '    "Specific synthesized point from article content.",',
    '    "Specific synthesized point from article content."',
    "  ],",
    '  "themes": ["theme1", "theme2"],',
    '  "confidence": "high|medium|low",',
    `  "riskNote": "${TOKEN_CHART_NEWS_RISK_NOTE}"`,
    "}",
  ].join("\n");
}

export async function summarizeTokenChartNewsEvent(
  input: TokenChartNewsEventSummaryInput,
  beforeGenerate?: () => Promise<void>,
): Promise<TokenChartNewsEventSummary> {
  const promptArticles = await buildArticlesForPrompt(input.articles);
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return buildFallbackChartNewsSummary(
      input,
      "deterministic",
      promptArticles,
    );
  }

  try {
    await beforeGenerate?.();

    const client = new GoogleGenAI({ apiKey });
    const response = await trackGemini("gemini.svc.token_chart_news_summary", TOKEN_CHART_NEWS_SUMMARY_MODEL, () => client.models.generateContent({
      model: TOKEN_CHART_NEWS_SUMMARY_MODEL,
      contents: buildSummaryPrompt(input, promptArticles),
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        systemInstruction:
          "You are a crypto news analyst. Produce a concise synthesis from the provided article data. Use only the provided titles, snippets, descriptions, and extracted article text. Do not invent facts. Do not claim price causation. Do not give financial advice.",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            tldr: { type: Type.STRING },
            bullets: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            themes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            confidence: { type: Type.STRING },
            riskNote: { type: Type.STRING },
          },
          required: [
            "headline",
            "tldr",
            "bullets",
            "themes",
            "confidence",
            "riskNote",
          ],
        },
      },
    }));

    const parsed = summarySchema.safeParse(JSON.parse(response.text ?? "{}"));
    if (!parsed.success) {
      return buildFallbackChartNewsSummary(
        input,
        "deterministic",
        promptArticles,
      );
    }

    return {
      ...parsed.data,
      riskNote: parsed.data.riskNote || TOKEN_CHART_NEWS_RISK_NOTE,
      generatedAt: new Date().toISOString(),
      provider: `gemini:${TOKEN_CHART_NEWS_SUMMARY_MODEL}`,
    };
  } catch (err) {
    console.warn("[token-chart-news-summary] summary generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    return buildFallbackChartNewsSummary(
      input,
      "deterministic",
      promptArticles,
    );
  }
}
