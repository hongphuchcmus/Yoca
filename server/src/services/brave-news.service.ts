import type { RawNewsArticle, TokenNewsIdentity } from "./rss-news.service.js";
import { pFetch, type ServiceOperationId } from "@sv/util/rate-limit.js";
import * as brave from "@sv/util/util-brave.js";

interface BraveNewsSearchOptions {
  identity: TokenNewsIdentity;
  isSolanaEcosystem: boolean;
  eventAt?: string;
  searchMode?: "token" | "event" | "chart";
  reason?: string;
  maxRequests?: number;
}

interface BraveWebMentionSearchOptions {
  identity: TokenNewsIdentity;
  reason?: string;
  maxRequests?: number;
}

interface BraveSearchItem {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  page_fetched?: string;
  thumbnail?: {
    src?: string;
    url?: string;
  };
  profile?: {
    name?: string;
    img?: string;
    image?: string;
    favicon?: string;
  };
  meta_url?: {
    hostname?: string;
    favicon?: string;
  };
}

interface BraveSearchPayload {
  results?: BraveSearchItem[];
  web?: {
    results?: BraveSearchItem[];
  };
}

const BRAVE_NEWS_SEARCH_ENDPOINT =
  "https://api.search.brave.com/res/v1/news/search";
const BRAVE_WEB_SEARCH_ENDPOINT =
  "https://api.search.brave.com/res/v1/web/search";
const BRAVE_SEARCH_TIMEOUT_MS = 10_000;
const BRAVE_RESULT_COUNT = 10;
const MAX_BRAVE_QUERIES = 2;
export const BRAVE_MONTHLY_SOFT_LIMIT = parseOptionalPositiveInt(
  process.env.BRAVE_MONTHLY_SOFT_LIMIT,
);
export const BRAVE_MONTHLY_USED_OFFSET =
  parseOptionalNonNegativeInt(process.env.BRAVE_MONTHLY_USED_OFFSET) ?? 0;

let braveRequestsThisProcess = 0;

class BraveSearchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "BraveSearchError";
  }
}

function parseOptionalPositiveInt(value: string | undefined) {
  if (!value?.trim()) return null;

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseOptionalNonNegativeInt(value: string | undefined) {
  if (!value?.trim()) return null;

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function isBraveSearchExplicitlyEnabled() {
  return process.env.BRAVE_SEARCH_ENABLED?.trim().toLowerCase() === "true";
}

function getBraveEffectiveUsage() {
  return BRAVE_MONTHLY_USED_OFFSET + braveRequestsThisProcess;
}

function isBraveSoftLimitReached() {
  return (
    BRAVE_MONTHLY_SOFT_LIMIT != null &&
    getBraveEffectiveUsage() >= BRAVE_MONTHLY_SOFT_LIMIT
  );
}

export function getBraveSearchUnavailableReason() {
  if (!isBraveSearchExplicitlyEnabled()) return "disabled";
  if (!process.env.BRAVE_SEARCH_API_KEY?.trim()) return "missing-api-key";
  console.info("[brave-news] usage guard", {
    offset: BRAVE_MONTHLY_USED_OFFSET,
    processCalls: braveRequestsThisProcess,
    effectiveUsage: getBraveEffectiveUsage(),
    softLimit: BRAVE_MONTHLY_SOFT_LIMIT,
  });
  if (isBraveSoftLimitReached()) return "soft-limit-reached";
  return null;
}

function shouldTryWebFallback(error: unknown) {
  if (!(error instanceof BraveSearchError)) return true;
  if (error.status == null) return true;

  return ![401, 403, 429].includes(error.status);
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Brave Search";
  }
}

function normalizeImageUrl(value: unknown, articleUrl: string) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed || /^(data|javascript):/i.test(trimmed)) return null;

  try {
    const url = new URL(trimmed, articleUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getFallbackFavicon(articleUrl: string) {
  try {
    const url = new URL(articleUrl);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      url.hostname,
    )}&sz=32`;
  } catch {
    return null;
  }
}

function parsePublishedAt(item: BraveSearchItem) {
  const value = item.page_age ?? item.page_fetched;
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getPrimarySearchName(identity: TokenNewsIdentity) {
  const nonWrappedName = identity.searchNames.find(
    (name) => !name.toLowerCase().startsWith("wrapped "),
  );

  return nonWrappedName ?? identity.searchNames[0] ?? identity.originalName;
}

function formatEventDate(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date
    .toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(",", "");
}

function formatEventMonthYear(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export function buildBraveNewsQueries({
  identity,
  isSolanaEcosystem,
  eventAt,
  searchMode = eventAt ? "event" : "token",
  maxRequests = MAX_BRAVE_QUERIES,
}: BraveNewsSearchOptions) {
  const searchName = getPrimarySearchName(identity);
  const searchSymbol =
    identity.searchSymbols[0] ?? identity.normalizedSymbol ?? "";
  const quotedName = `"${searchName}"`;
  const quotedSymbol = searchSymbol ? `"${searchSymbol}"` : "";

  if (searchMode === "event" || searchMode === "chart") {
    const eventDate = formatEventDate(eventAt);
    const monthYear = formatEventMonthYear(eventAt);

    return uniqueNonEmpty([
      `${quotedName} ${quotedSymbol} crypto news ${eventDate}`,
      `${quotedName} ${quotedSymbol} update ${monthYear}`,
      isSolanaEcosystem
        ? `${quotedName} ${quotedSymbol} Solana news ${monthYear}`
        : "",
    ]).slice(0, Math.min(maxRequests, MAX_BRAVE_QUERIES));
  }

  return uniqueNonEmpty([
    `${quotedName} ${quotedSymbol} crypto news`,
    isSolanaEcosystem ? `${quotedName} ${quotedSymbol} Solana news` : "",
    `${quotedName} token latest news`,
  ]).slice(0, Math.min(maxRequests, MAX_BRAVE_QUERIES));
}

export function buildBraveNewsQuery(options: BraveNewsSearchOptions) {
  return buildBraveNewsQueries(options)[0] ?? "";
}

export function buildBraveWebMentionQueries({
  identity,
  maxRequests = 1,
}: BraveWebMentionSearchOptions) {
  const searchName = getPrimarySearchName(identity);
  const searchSymbol =
    identity.searchSymbols[0] ?? identity.normalizedSymbol ?? "";
  const quotedName = `"${searchName}"`;
  const quotedSymbol = searchSymbol ? `"${searchSymbol}"` : "";

  return uniqueNonEmpty([
    `${quotedName} ${quotedSymbol} Solana OR crypto OR pump.fun OR "meme coin"`,
    `"${identity.address}" crypto`,
  ]).slice(0, Math.min(maxRequests, MAX_BRAVE_QUERIES));
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["ref", "fbclid", "gclid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, "").toLowerCase();
  }
}

function normalizeTitle(value: string) {
  return stripHtml(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeRawArticles(articles: RawNewsArticle[]) {
  const byUrl = new Map<string, RawNewsArticle>();

  for (const article of articles) {
    const key = normalizeUrl(article.url);
    const existing = byUrl.get(key);
    if (!existing || article.description.length > existing.description.length) {
      byUrl.set(key, article);
    }
  }

  const byTitle = new Map<string, RawNewsArticle>();
  for (const article of byUrl.values()) {
    const key = normalizeTitle(article.title);
    const existing = byTitle.get(key);
    if (!existing || article.description.length > existing.description.length) {
      byTitle.set(key, article);
    }
  }

  return [...byTitle.values()];
}

function normalizeBraveItem(item: BraveSearchItem): RawNewsArticle | null {
  const title = stripHtml(item.title ?? "");
  const url = item.url?.trim() ?? "";
  if (!title || !url) return null;

  const description = stripHtml(item.description ?? "");
  const source =
    item.profile?.name?.trim() ||
    item.meta_url?.hostname?.replace(/^www\./, "") ||
    getHostname(url);
  const imageUrl = normalizeImageUrl(
    item.thumbnail?.src ?? item.thumbnail?.url,
    url,
  );
  const favicon =
    normalizeImageUrl(
      item.profile?.favicon ??
        item.profile?.img ??
        item.profile?.image ??
        item.meta_url?.favicon,
      url,
    ) ?? getFallbackFavicon(url);

  return {
    title,
    url,
    source,
    publishedAt: parsePublishedAt(item),
    description,
    content: "",
    imageUrl,
    favicon,
  };
}

async function fetchBraveEndpoint(
  endpoint: string,
  operation: ServiceOperationId<"brave">,
  query: string,
): Promise<BraveSearchPayload> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY is not set");
  }
  if (isBraveSoftLimitReached()) {
    throw new Error("BRAVE_MONTHLY_SOFT_LIMIT reached");
  }

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(BRAVE_RESULT_COUNT));
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", "en");

  braveRequestsThisProcess += 1;

  const response = await pFetch(brave.spec, operation, url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    rlRetries: 0,
    rlTimeoutMs: BRAVE_SEARCH_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new BraveSearchError(
      `Brave responded ${response.status}`,
      response.status,
    );
  }

  return JSON.parse(await response.text());
}

export async function fetchBraveTokenNews(options: BraveNewsSearchOptions) {
  const unavailableReason = getBraveSearchUnavailableReason();
  if (unavailableReason) {
    throw new Error(`Brave Search is unavailable: ${unavailableReason}`);
  }

  const queries = buildBraveNewsQueries(options);
  const endpointUsed = new Set<string>();
  const articles: RawNewsArticle[] = [];
  let rawResultCount = 0;
  let requestCount = 0;

  for (const query of queries) {
    try {
      requestCount += 1;
      const payload = await fetchBraveEndpoint(
        BRAVE_NEWS_SEARCH_ENDPOINT,
        "brave.svc.token_news_search",
        query,
      );
      endpointUsed.add(BRAVE_NEWS_SEARCH_ENDPOINT);
      const results = payload.results ?? [];
      rawResultCount += results.length;
      console.info("[brave-news] query completed", {
        query,
        token: options.identity.normalizedSymbol,
        reason: options.reason ?? options.searchMode ?? "token-news",
        endpoint: "news",
        resultCount: results.length,
      });
      articles.push(
        ...results
          .map(normalizeBraveItem)
          .filter((article): article is RawNewsArticle => article != null),
      );
    } catch (err) {
      console.warn("[brave-news] news search failed", {
        query,
        token: options.identity.normalizedSymbol,
        reason: options.reason ?? options.searchMode ?? "token-news",
        error: err instanceof Error ? err.message : String(err),
      });
      if (!shouldTryWebFallback(err)) {
        break;
      }
    }
  }

  return {
    query: queries[0] ?? "",
    queries,
    endpointUsed: [...endpointUsed].join(","),
    rawResultCount,
    requestCount,
    articles: dedupeRawArticles(articles),
  };
}

export async function fetchBraveTokenWebMentions(
  options: BraveWebMentionSearchOptions,
) {
  const unavailableReason = getBraveSearchUnavailableReason();
  if (unavailableReason) {
    throw new Error(`Brave Search is unavailable: ${unavailableReason}`);
  }

  const maxRequests = Math.max(0, Math.min(options.maxRequests ?? 1, 2));
  const queries = buildBraveWebMentionQueries({
    ...options,
    maxRequests,
  });
  const endpointUsed = new Set<string>();
  const articles: RawNewsArticle[] = [];
  let rawResultCount = 0;
  let requestCount = 0;

  for (const query of queries) {
    if (requestCount >= maxRequests) break;

    try {
      requestCount += 1;
      const payload = await fetchBraveEndpoint(
        BRAVE_WEB_SEARCH_ENDPOINT,
        "brave.svc.token_web_search",
        query,
      );
      endpointUsed.add(BRAVE_WEB_SEARCH_ENDPOINT);
      const results = payload.web?.results ?? [];
      rawResultCount += results.length;
      console.info("[brave-news] query completed", {
        query,
        token: options.identity.normalizedSymbol,
        reason: options.reason ?? "web-mention-fallback",
        endpoint: "web",
        resultCount: results.length,
      });
      articles.push(
        ...results
          .map(normalizeBraveItem)
          .filter((article): article is RawNewsArticle => article != null),
      );

      if (results.length > 0) break;
    } catch (err) {
      console.warn("[brave-news] web mention search failed", {
        query,
        token: options.identity.normalizedSymbol,
        reason: options.reason ?? "web-mention-fallback",
        error: err instanceof Error ? err.message : String(err),
      });

      if (!shouldTryWebFallback(err)) {
        break;
      }
    }
  }

  return {
    query: queries[0] ?? "",
    queries: queries.slice(0, requestCount),
    endpointUsed: [...endpointUsed].join(","),
    rawResultCount,
    requestCount,
    articles: dedupeRawArticles(articles),
  };
}
