import type { WebSearchArticle } from "./chat.types.js";
import { pFetch, type ServiceOperationId } from "@sv/util/rate-limit.js";
import * as brave from "@sv/util/util-brave.js";

const BRAVE_NEWS_ENDPOINT = "https://api.search.brave.com/res/v1/news/search";
const BRAVE_WEB_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_TIMEOUT_MS = 10_000;
const MAX_COUNT = 10;

interface BraveItem {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  profile?: { name?: string };
  meta_url?: { hostname?: string };
}

interface BraveResponse {
  results?: BraveItem[];
  web?: { results?: BraveItem[] };
}

function isEnabled(): boolean {
  return process.env.BRAVE_SEARCH_ENABLED?.trim().toLowerCase() === "true";
}

export function getUnavailableReason(): string | null {
  if (!isEnabled()) return "disabled";
  if (!process.env.BRAVE_SEARCH_API_KEY?.trim()) return "missing-api-key";
  return null;
}

function stripHtml(v: string): string {
  return v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

function normalizeItem(item: BraveItem): WebSearchArticle | null {
  const title = stripHtml(item.title ?? "");
  const url = item.url?.trim() ?? "";
  if (!title || !url) return null;

  const source =
    item.profile?.name?.trim() ??
    item.meta_url?.hostname?.replace(/^www\./, "") ??
    getHostname(url);

  return {
    title,
    url,
    description: stripHtml(item.description ?? ""),
    source,
    publishedAt: item.page_age ?? item.age ?? null,
  };
}

async function fetchBrave(
  endpoint: string,
  operation: ServiceOperationId<"brave">,
  query: string,
  count: number,
): Promise<BraveResponse> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY not set");

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, MAX_COUNT)));
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", "en");

  const res = await pFetch(brave.spec, operation, url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    rlRetries: 0,
    rlTimeoutMs: BRAVE_TIMEOUT_MS,
  });
  if (!res.ok) throw new Error(`Brave responded ${res.status}`);
  return JSON.parse(await res.text());
}

export async function searchNews(
  query: string,
  count = 5,
): Promise<{ articles: WebSearchArticle[] }> {
  const reason = getUnavailableReason();
  if (reason) throw new Error(`Web search unavailable: ${reason}`);

  const payload = await fetchBrave(
    BRAVE_NEWS_ENDPOINT,
    "brave.svc.chat_news_search",
    query,
    count,
  );
  const articles = (payload.results ?? [])
    .map(normalizeItem)
    .filter((a): a is WebSearchArticle => a != null)
    .slice(0, count);

  return { articles };
}

export async function searchWeb(
  query: string,
  count = 5,
): Promise<{ articles: WebSearchArticle[] }> {
  const reason = getUnavailableReason();
  if (reason) throw new Error(`Web search unavailable: ${reason}`);

  const payload = await fetchBrave(
    BRAVE_WEB_ENDPOINT,
    "brave.svc.chat_web_search",
    query,
    count,
  );
  const articles = (payload.web?.results ?? [])
    .map(normalizeItem)
    .filter((a): a is WebSearchArticle => a != null)
    .slice(0, count);

  return { articles };
}
