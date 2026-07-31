import Parser from "rss-parser";
import { dataUsage } from "@sv/middlewares/request-context.js";
import {
    fetchBraveTokenNews,
    fetchBraveTokenWebMentions,
    getBraveSearchUnavailableReason,
} from "./brave-news.service.js";

export type TokenNewsSourceType = "news" | "web_mention" | "project_update";

export interface TokenNewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  description: string;
  score: number;
  matchedBy: string[];
  sourceType: TokenNewsSourceType;
  imageUrl?: string | null;
  favicon?: string | null;
}


export type RelatedNewsConfidence = "high" | "medium" | "low";

export interface RelatedTokenNewsArticle extends TokenNewsArticle {
  type: "related_news";
  timeDistanceHours: number | null;
  confidence: RelatedNewsConfidence;
}

export interface TokenNewsRequest {
  address: string;
  symbol: string;
  name: string;
}

export interface TokenNewsOptions {
  eventAt?: string;
  windowHours?: number;
  preferSearch?: boolean;
  maxArticles?: number;
  strictMode?: boolean;
  searchMode?: "token" | "event" | "chart";
  allowBrave?: boolean;
}

export interface TokenNewsIdentity {
  address: string;
  originalName: string;
  originalSymbol: string;
  normalizedSymbol: string;
  searchNames: string[];
  searchSymbols: string[];
}

interface RssFeedConfig {
  source: string;
  url: string;
  category: "general" | "bitcoin" | "solana" | "exchange" | "defi";
}

interface RssItem extends Parser.Item {
  contentEncoded?: string;
  description?: string;
  itunes?: {
    image?: string;
  };
  mediaContent?: Array<{
    $?: {
      url?: string;
      medium?: string;
      type?: string;
    };
    url?: string;
    medium?: string;
    type?: string;
  }>;
  mediaThumbnail?: Array<{
    $?: {
      url?: string;
    };
    url?: string;
  }>;
}

export interface RawNewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  description: string;
  content: string;
  sourceType?: TokenNewsSourceType;
  imageUrl?: string | null;
  favicon?: string | null;
}

interface WrappedTokenAlias {
  names: string[];
  symbols: string[];
  searchNames: string[];
  searchSymbols: string[];
}

const RSS_FEEDS: RssFeedConfig[] = [
  {
    source: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    category: "general",
  },
  { source: "Decrypt", url: "https://decrypt.co/feed", category: "general" },
  {
    source: "CryptoSlate",
    url: "https://cryptoslate.com/feed/",
    category: "general",
  },
  {
    source: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    category: "general",
  },
  {
    source: "BeInCrypto",
    url: "https://beincrypto.com/feed/",
    category: "general",
  },
  {
    source: "CryptoBriefing",
    url: "https://cryptobriefing.com/feed/",
    category: "general",
  },
  {
    source: "Blockworks",
    url: "https://blockworks.co/feed",
    category: "general",
  },
  {
    source: "The Block",
    url: "https://www.theblock.co/rss.xml",
    category: "general",
  },
  {
    source: "Bitcoin Magazine",
    url: "https://bitcoinmagazine.com/.rss/full/",
    category: "bitcoin",
  },
  {
    source: "Solana Blog",
    url: "https://solana.com/news/rss.xml",
    category: "solana",
  },
  {
    source: "Binance Announcements",
    url: "https://www.binance.com/en/support/announcement/rss",
    category: "exchange",
  },
  {
    source: "Coinbase Blog",
    url: "https://www.coinbase.com/blog/rss",
    category: "exchange",
  },
];

const RSS_FETCH_TIMEOUT_MS = 12_000;
const OPEN_GRAPH_FETCH_TIMEOUT_MS = 4_000;
const MAX_OPEN_GRAPH_IMAGE_FETCHES = 10;
const OPEN_GRAPH_IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MIN_RELEVANCE_SCORE = 4;
export const BRAVE_MIN_ARTICLES_BEFORE_FALLBACK = 5;
const openGraphImageCache = new Map<
  string,
  { imageUrl: string | null; expiresAt: number }
>();

const parser = new Parser<unknown, RssItem>({
  timeout: 12_000,
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["itunes:image", "itunes"],
      "description",
    ] as never,
  },
});

const EVENT_KEYWORDS = [
  "listing",
  "launch",
  "integration",
  "partnership",
  "upgrade",
  "governance",
  "exploit",
  "hack",
  "funding",
  "airdrop",
  "mainnet",
  "roadmap",
  "token unlock",
];

const WEAK_GENERIC_PHRASES = [
  "price prediction",
  "top gainers",
  "market today",
  "could rally",
  "analyst says",
];

const CRYPTO_CONTEXT_KEYWORDS = [
  "crypto",
  "cryptocurrency",
  "token",
  "blockchain",
  "web3",
  "defi",
  "dex",
  "on-chain",
  "onchain",
  "solana",
  "ethereum",
  "bitcoin",
  "airdrop",
  "staking",
  "governance",
  "wallet",
  "mainnet",
  "protocol",
  "liquidity",
  "pump.fun",
  "pump fun",
  "meme coin",
  "memecoin",
];

const AMBIGUOUS_NAMES_REQUIRING_CRYPTO_CONTEXT = new Set([
  "jupiter",
  "hyper",
  "near",
  "render",
  "ray",
  "orca",
]);

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const SOLANA_ECOSYSTEM_SYMBOLS = new Set([
  "SOL",
  "JUP",
  "PYTH",
  "BONK",
  "WIF",
  "RAY",
  "JTO",
  "ORCA",
  "HNT",
]);

const TRUSTED_NEWS_DOMAINS = [
  "coindesk.com",
  "cointelegraph.com",
  "decrypt.co",
  "blockworks.co",
  "cryptoslate.com",
  "beincrypto.com",
  "cryptobriefing.com",
  "theblock.co",
  "solana.com",
  "jup.ag",
];

const PROJECT_UPDATE_DOMAINS = [
  "x.com",
  "twitter.com",
  "medium.com",
  "mirror.xyz",
  "paragraph.xyz",
  "substack.com",
  "pump.fun",
  "t.me",
  "telegram.me",
  "discord.gg",
  "discord.com",
];

const WRAPPED_TOKEN_ALIASES: WrappedTokenAlias[] = [
  {
    names: ["wrapped bitcoin", "wrapped btc", "wbtc", "sobtc"],
    symbols: ["WBTC", "SOBTC"],
    searchNames: ["Wrapped Bitcoin", "Bitcoin"],
    searchSymbols: ["BTC"],
  },
  {
    names: ["wrapped ethereum", "wrapped eth", "weth"],
    symbols: ["WETH"],
    searchNames: ["Wrapped Ethereum", "Ethereum"],
    searchSymbols: ["ETH"],
  },
  {
    names: ["wrapped sol", "wrapped solana", "wsol", "solana"],
    symbols: ["WSOL", "SOL"],
    searchNames: ["Wrapped SOL", "Solana"],
    searchSymbols: ["SOL"],
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function normalizeSymbol(value: string) {
  return value.trim().replace(/^\$/, "").toUpperCase();
}

export function buildTokenNewsIdentity(
  token: TokenNewsRequest,
): TokenNewsIdentity {
  const originalName = token.name.trim();
  const originalSymbol = token.symbol.trim();
  const normalizedSymbol = normalizeSymbol(originalSymbol);
  const lowerName = originalName.toLowerCase();
  const upperSymbol = normalizedSymbol.toUpperCase();

  const aliases = WRAPPED_TOKEN_ALIASES.find((alias) => {
    if (
      token.address === WRAPPED_SOL_MINT &&
      alias.searchSymbols.includes("SOL")
    ) {
      return true;
    }

    return (
      alias.names.some((name) => lowerName === name) ||
      alias.names.some((name) => lowerName.includes(name)) ||
      alias.symbols.includes(upperSymbol)
    );
  });

  return {
    address: token.address,
    originalName,
    originalSymbol,
    normalizedSymbol,
    searchNames: uniqueNonEmpty([
      originalName,
      ...(aliases?.searchNames ?? []),
    ]),
    searchSymbols: uniqueNonEmpty([
      normalizedSymbol,
      ...(aliases?.searchSymbols ?? []),
    ]).map(normalizeSymbol),
  };
}

function isBitcoinIdentity(identity: TokenNewsIdentity) {
  return (
    identity.searchSymbols.includes("BTC") ||
    identity.searchNames.some((name) => name.toLowerCase().includes("bitcoin"))
  );
}

export function isSolanaEcosystemIdentity(identity: TokenNewsIdentity) {
  return (
    identity.address === WRAPPED_SOL_MINT ||
    identity.searchSymbols.some((symbol) => SOLANA_ECOSYSTEM_SYMBOLS.has(symbol)) ||
    identity.searchNames.some((name) => name.toLowerCase().includes("solana"))
  );
}

function selectFeedsForToken(identity: TokenNewsIdentity) {
  const includeBitcoinFeeds = isBitcoinIdentity(identity);
  const includeSolanaFeeds = isSolanaEcosystemIdentity(identity);

  return RSS_FEEDS.filter((feed) => {
    if (feed.category === "bitcoin") return includeBitcoinFeeds;
    if (feed.category === "solana") return includeSolanaFeeds;
    return true;
  });
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getUrlHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostnameMatches(hostname: string, domains: string[]) {
  return domains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function isTrustedNewsDomain(url: string) {
  return hostnameMatches(getUrlHostname(url), TRUSTED_NEWS_DOMAINS);
}

function isProjectUpdateDomain(url: string) {
  return hostnameMatches(getUrlHostname(url), PROJECT_UPDATE_DOMAINS);
}

function classifyWebFallbackSourceType(url: string): TokenNewsSourceType {
  if (isTrustedNewsDomain(url)) return "news";
  if (isProjectUpdateDomain(url)) return "project_update";
  return "web_mention";
}

function getSourceTypeCounts(articles: TokenNewsArticle[]) {
  return articles.reduce<Record<TokenNewsSourceType, number>>(
    (counts, article) => {
      counts[article.sourceType] += 1;
      return counts;
    },
    {
      news: 0,
      web_mention: 0,
      project_update: 0,
    },
  );
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
    if (!isHttpUrl(url.toString())) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      url.hostname,
    )}&sz=32`;
  } catch {
    return null;
  }
}

function looksLikeImageUrl(value: string) {
  return /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(value);
}

function isImageMimeType(value: unknown) {
  return typeof value === "string" && value.toLowerCase().startsWith("image/");
}

function getRssNodeUrl(node: unknown) {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const attrs =
    record.$ && typeof record.$ === "object"
      ? (record.$ as Record<string, unknown>)
      : {};

  return record.url ?? attrs.url ?? null;
}

function getRssNodeType(node: unknown) {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const attrs =
    record.$ && typeof record.$ === "object"
      ? (record.$ as Record<string, unknown>)
      : {};

  return record.type ?? attrs.type ?? record.medium ?? attrs.medium ?? null;
}

function extractFirstContentImage(html: string, articleUrl: string) {
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  return normalizeImageUrl(match?.[1], articleUrl);
}

function getRssItemImageUrl(item: RssItem, articleUrl: string) {
  const enclosureUrl = normalizeImageUrl(item.enclosure?.url, articleUrl);
  if (
    enclosureUrl &&
    (isImageMimeType(item.enclosure?.type) || looksLikeImageUrl(enclosureUrl))
  ) {
    return enclosureUrl;
  }

  for (const media of item.mediaContent ?? []) {
    const url = normalizeImageUrl(getRssNodeUrl(media), articleUrl);
    const type = getRssNodeType(media);
    if (
      url &&
      (isImageMimeType(type) ||
        String(type ?? "").toLowerCase() === "image" ||
        looksLikeImageUrl(url))
    ) {
      return url;
    }
  }

  for (const media of item.mediaThumbnail ?? []) {
    const url = normalizeImageUrl(getRssNodeUrl(media), articleUrl);
    if (url) return url;
  }

  const itunes = item.itunes as unknown;
  const itunesImage =
    typeof itunes === "string"
      ? itunes
      : itunes && typeof itunes === "object"
        ? ((itunes as Record<string, unknown>).image ??
          (itunes as Record<string, unknown>).href ??
          getRssNodeUrl(itunes))
        : null;
  const itunesImageUrl = normalizeImageUrl(itunesImage, articleUrl);
  if (itunesImageUrl) return itunesImageUrl;

  return extractFirstContentImage(
    `${item.contentEncoded ?? ""} ${item.content ?? ""}`,
    articleUrl,
  );
}

function extractMetaImage(html: string, articleUrl: string) {
  const patterns = [
    /<meta\b[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta\b[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const imageUrl = normalizeImageUrl(html.match(pattern)?.[1], articleUrl);
    if (imageUrl) return imageUrl;
  }

  return null;
}

async function fetchOpenGraphImage(articleUrl: string) {
  if (!isHttpUrl(articleUrl)) return null;

  const cached = openGraphImageCache.get(articleUrl);
  if (cached && cached.expiresAt > Date.now()) {
    dataUsage.record("memory_result");
    return cached.imageUrl;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OPEN_GRAPH_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Yoca News Image Fetcher/1.0",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      openGraphImageCache.set(articleUrl, {
        imageUrl: null,
        expiresAt: Date.now() + OPEN_GRAPH_IMAGE_CACHE_TTL_MS,
      });
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("html")) {
      openGraphImageCache.set(articleUrl, {
        imageUrl: null,
        expiresAt: Date.now() + OPEN_GRAPH_IMAGE_CACHE_TTL_MS,
      });
      return null;
    }

    const html = await response.text();
    const imageUrl = extractMetaImage(html, articleUrl);
    openGraphImageCache.set(articleUrl, {
      imageUrl,
      expiresAt: Date.now() + OPEN_GRAPH_IMAGE_CACHE_TTL_MS,
    });
    return imageUrl;
  } catch {
    openGraphImageCache.set(articleUrl, {
      imageUrl: null,
      expiresAt: Date.now() + OPEN_GRAPH_IMAGE_CACHE_TTL_MS,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichArticleImages<T extends TokenNewsArticle>(articles: T[]) {
  const candidates = articles
    .slice(0, MAX_OPEN_GRAPH_IMAGE_FETCHES)
    .filter((article) => !article.imageUrl);

  if (candidates.length === 0) return articles;

  const fetchedImages = await Promise.all(
    candidates.map(async (article) => ({
      url: article.url,
      imageUrl: await fetchOpenGraphImage(article.url),
    })),
  );
  const imageByUrl = new Map(
    fetchedImages
      .filter((item) => item.imageUrl)
      .map((item) => [item.url, item.imageUrl] as const),
  );

  return articles.map((article) => ({
    ...article,
    imageUrl: article.imageUrl ?? imageByUrl.get(article.url) ?? null,
    favicon: article.favicon ?? getFallbackFavicon(article.url),
  }));
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

function parsePublishedAt(item: RssItem) {
  const value = item.isoDate ?? item.pubDate;
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hasPhrase(text: string, phrase: string) {
  const normalizedPhrase = phrase.trim();
  if (!normalizedPhrase) return false;

  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(normalizedPhrase.toLowerCase())}([^a-z0-9]|$)`,
    "i",
  );
  return pattern.test(text);
}

function getSymbolRegex(symbol: string) {
  const normalized = symbol.trim().replace(/^\$/, "").toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(normalized)) return null;

  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(normalized)}([^A-Z0-9]|$)`);
}

function scoreArticle(article: RawNewsArticle, identity: TokenNewsIdentity) {
  let score = 0;
  const matchedBy: string[] = [];
  let strongTitleMatch = false;
  let strongDescriptionMatch = false;
  let weakBodyMatch = false;

  const title = article.title.toLowerCase();
  const description = article.description.toLowerCase();
  const content = article.content.toLowerCase();
  const titleUpper = article.title.toUpperCase();
  const descriptionUpper = article.description.toUpperCase();
  const contentUpper = article.content.toUpperCase();

  for (const searchName of identity.searchNames) {
    const normalizedName = searchName.trim().toLowerCase();
    if (!normalizedName) continue;

    if (hasPhrase(title, normalizedName)) {
      score += 5;
      strongTitleMatch = true;
      matchedBy.push(`name-title:${searchName}`);
    }

    if (hasPhrase(description, normalizedName)) {
      score += 4;
      strongDescriptionMatch = true;
      matchedBy.push(`name-description:${searchName}`);
    }

    if (hasPhrase(content, normalizedName)) {
      weakBodyMatch = true;
    }
  }

  for (const symbol of identity.searchSymbols) {
    const cashtag = `$${symbol}`;
    if (titleUpper.includes(cashtag)) {
      score += 5;
      strongTitleMatch = true;
      matchedBy.push(`cashtag-title:${cashtag}`);
    }

    if (descriptionUpper.includes(cashtag)) {
      score += 4;
      strongDescriptionMatch = true;
      matchedBy.push(`cashtag-description:${cashtag}`);
    }

    if (contentUpper.includes(cashtag)) {
      weakBodyMatch = true;
    }

    const symbolRegex = getSymbolRegex(symbol);
    if (symbolRegex?.test(titleUpper)) {
      score += 1;
      matchedBy.push(`symbol-title:${symbol}`);
    }

    if (symbolRegex?.test(descriptionUpper)) {
      score += 1;
      matchedBy.push(`symbol-description:${symbol}`);
    }

    if (symbolRegex?.test(contentUpper)) {
      weakBodyMatch = true;
    }
  }

  const hasStrongMatch = strongTitleMatch || strongDescriptionMatch;
  const visibleText = `${title} ${description}`;
  const requiresCryptoContext = identity.searchNames.some((name) =>
    AMBIGUOUS_NAMES_REQUIRING_CRYPTO_CONTEXT.has(name.trim().toLowerCase()),
  );
  const hasCryptoContext = CRYPTO_CONTEXT_KEYWORDS.some((keyword) =>
    visibleText.includes(keyword),
  );

  if (hasStrongMatch) {
    for (const keyword of EVENT_KEYWORDS) {
      if (visibleText.includes(keyword)) {
        score += 1;
        matchedBy.push(`event:${keyword}`);
        break;
      }
    }

    if (isTrustedNewsDomain(article.url)) {
      score += 1;
      matchedBy.push("trusted-domain");
    }
  }

  for (const phrase of WEAK_GENERIC_PHRASES) {
    if (visibleText.includes(phrase)) {
      score -= 3;
      matchedBy.push(`weak:${phrase}`);
      break;
    }
  }

  const acceptedStrongMatch =
    hasStrongMatch && (!requiresCryptoContext || hasCryptoContext);

  if (hasStrongMatch && !acceptedStrongMatch) {
    score -= 4;
    matchedBy.push("weak:missing-crypto-context");
  }

  return {
    score,
    matchedBy: [...new Set(matchedBy)],
    hasStrongMatch: acceptedStrongMatch,
    strongTitleMatch,
    strongDescriptionMatch,
    weakBodyMatch,
  };
}

function getContentOnlyMatches(
  article: RawNewsArticle,
  identity: TokenNewsIdentity,
) {
  const visibleText = `${article.title} ${article.description}`.toLowerCase();
  const visibleTextUpper = `${article.title} ${article.description}`.toUpperCase();
  const content = article.content.toLowerCase();
  const contentUpper = article.content.toUpperCase();
  const matches: string[] = [];

  for (const searchName of identity.searchNames) {
    const normalizedName = searchName.trim().toLowerCase();
    if (!normalizedName) continue;

    if (
      hasPhrase(content, normalizedName) &&
      !hasPhrase(visibleText, normalizedName)
    ) {
      matches.push(`name:${searchName}`);
    }
  }

  for (const symbol of identity.searchSymbols) {
    const cashtag = `$${symbol}`;
    if (
      contentUpper.includes(cashtag) &&
      !visibleTextUpper.includes(cashtag)
    ) {
      matches.push(`cashtag:${cashtag}`);
    }

    const symbolRegex = getSymbolRegex(symbol);
    if (
      symbolRegex?.test(contentUpper) &&
      !symbolRegex.test(visibleTextUpper)
    ) {
      matches.push(`symbol:${symbol}`);
    }
  }

  return [...new Set(matches)];
}

async function fetchFeed(feed: RssFeedConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

  let xml = "";
  try {
    const response = await fetch(feed.url, {
      headers: {
        "User-Agent": "Yoca RSS News Fetcher/1.0",
        Accept:
          "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RSS feed responded ${response.status}`);
    }

    xml = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  if (!xml.trim()) {
    throw new Error("RSS feed returned an empty response");
  }

  const parsed = await parser.parseString(xml);
  if (parsed.items.length === 0) {
    throw new Error("RSS feed returned no items");
  }

  const articles = parsed.items
    .map((item): RawNewsArticle | null => {
      const title = stripHtml(item.title ?? "");
      const url = item.link?.trim() ?? item.guid?.trim() ?? "";
      if (!title || !url) return null;

      const description = stripHtml(
        item.contentSnippet ?? item.description ?? item.summary ?? "",
      );
      const content = stripHtml(item.contentEncoded ?? item.content ?? "");
      const imageUrl = getRssItemImageUrl(item, url);

      return {
        title,
        url,
        source: feed.source,
        publishedAt: parsePublishedAt(item),
        description,
        content,
        sourceType: "news",
        imageUrl,
        favicon: getFallbackFavicon(url),
      };
    })
    .filter((article): article is RawNewsArticle => article != null);

  if (articles.length === 0) {
    throw new Error(`RSS feed returned ${parsed.items.length} unusable items`);
  }

  return articles;
}

function dedupeArticles(articles: TokenNewsArticle[]) {
  const byUrl = new Map<string, TokenNewsArticle>();

  for (const article of articles) {
    const key = normalizeUrl(article.url);
    const existing = byUrl.get(key);
    if (!existing || article.score > existing.score) {
      byUrl.set(key, article);
    }
  }

  const byTitle = new Map<string, TokenNewsArticle>();
  for (const article of byUrl.values()) {
    const key = normalizeTitle(article.title);
    const existing = byTitle.get(key);
    if (!existing || article.score > existing.score) {
      byTitle.set(key, article);
    }
  }

  return [...byTitle.values()];
}

function getArticleTimestamp(article: TokenNewsArticle) {
  if (!article.publishedAt) return 0;

  const timestamp = Date.parse(article.publishedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getTimeDistanceHours(article: TokenNewsArticle, eventAt: string) {
  if (!article.publishedAt) return null;

  const articleTimestamp = Date.parse(article.publishedAt);
  const eventTimestamp = Date.parse(eventAt);

  if (
    Number.isNaN(articleTimestamp) ||
    Number.isNaN(eventTimestamp)
  ) {
    return null;
  }

  return Math.abs(articleTimestamp - eventTimestamp) / (60 * 60 * 1000);
}

function getRelatedNewsConfidence(
  timeDistanceHours: number | null,
): RelatedNewsConfidence {
  if (timeDistanceHours == null) return "low";
  if (timeDistanceHours <= 12) return "high";
  if (timeDistanceHours <= 72) return "medium";
  return "low";
}

function applyEventContext(
  articles: TokenNewsArticle[],
  options: TokenNewsOptions,
) : (TokenNewsArticle | RelatedTokenNewsArticle)[] {
  if (!options.eventAt) return articles;

  const windowHours = options.windowHours ?? 72;

  return articles
    .map((article): RelatedTokenNewsArticle => {
      const timeDistanceHours = getTimeDistanceHours(article, options.eventAt!);

      return {
        ...article,
        type: "related_news",
        timeDistanceHours:
          timeDistanceHours == null
            ? null
            : Number(timeDistanceHours.toFixed(2)),
        confidence: getRelatedNewsConfidence(timeDistanceHours),
      };
    })
    .filter((article) => {
      if (!options.strictMode) return true;
      if (article.timeDistanceHours == null) return true;
      return article.timeDistanceHours <= windowHours;
    })
    .sort((a, b) => {
      const aDistance = a.timeDistanceHours ?? Number.POSITIVE_INFINITY;
      const bDistance = b.timeDistanceHours ?? Number.POSITIVE_INFINITY;
      if (aDistance !== bDistance) return aDistance - bDistance;

      const dateDiff = getArticleTimestamp(b) - getArticleTimestamp(a);
      if (dateDiff !== 0) return dateDiff;

      return b.score - a.score;
    });
}

function limitArticles<T>(articles: T[], maxArticles?: number) {
  if (maxArticles == null) return articles;
  if (maxArticles <= 0) return [];

  return articles.slice(0, maxArticles);
}

function scoreAndFilterArticles(
  articles: RawNewsArticle[],
  identity: TokenNewsIdentity,
)  {
  const scoredArticles = articles.map((article) => {
    const relevance = scoreArticle(article, identity);
    return {
      article,
      relevance,
      contentOnlyMatches: getContentOnlyMatches(article, identity),
    };
  });

  const matchedArticles: TokenNewsArticle[] = scoredArticles
    .filter(
      ({ relevance }) =>
        relevance.hasStrongMatch && relevance.score >= MIN_RELEVANCE_SCORE,
    )
    .map(({ article, relevance }) => ({
      type: "default_news",
      title: article.title,
      url: article.url,
      source: article.source,
      publishedAt: article.publishedAt,
      description: article.description,
      score: relevance.score,
      matchedBy: relevance.matchedBy,
      sourceType: article.sourceType ?? "news",
      imageUrl: article.imageUrl ?? null,
      favicon: article.favicon ?? getFallbackFavicon(article.url),
    }));

  return { scoredArticles, matchedArticles };
}

function scoreAndFilterWebMentionArticles(
  articles: RawNewsArticle[],
  identity: TokenNewsIdentity,
) {
  const scoredArticles = articles.map((article) => {
    let score = 0;
    const matchedBy: string[] = [];
    const visibleText = `${article.title} ${article.description}`.toLowerCase();
    const visibleTextUpper =
      `${article.title} ${article.description}`.toUpperCase();
    const urlText = article.url;
    const hasCryptoContext = CRYPTO_CONTEXT_KEYWORDS.some((keyword) =>
      visibleText.includes(keyword),
    );
    const sourceType = classifyWebFallbackSourceType(article.url);
    let hasRequiredMatch = false;

    for (const searchName of identity.searchNames) {
      const normalizedName = searchName.trim().toLowerCase();
      if (!normalizedName) continue;

      if (hasPhrase(visibleText, normalizedName)) {
        score += 5;
        hasRequiredMatch = true;
        matchedBy.push(`web-name:${searchName}`);
      }
    }

    for (const symbol of identity.searchSymbols) {
      const symbolRegex = getSymbolRegex(symbol);
      if (symbolRegex?.test(visibleTextUpper) && hasCryptoContext) {
        score += 4;
        hasRequiredMatch = true;
        matchedBy.push(`web-symbol-context:${symbol}`);
      }
    }

    if (identity.address && urlText.includes(identity.address)) {
      score += 6;
      hasRequiredMatch = true;
      matchedBy.push("web-mint-address");
    }

    if (sourceType === "news") {
      score += 1;
      matchedBy.push("trusted-domain");
    }

    if (sourceType === "project_update") {
      score += 1;
      matchedBy.push("project-update-domain");
    }

    return {
      article,
      relevance: {
        score,
        matchedBy: [...new Set(matchedBy)],
        hasStrongMatch: hasRequiredMatch,
      },
      contentOnlyMatches: [] as string[],
      sourceType,
    };
  });

  const matchedArticles = scoredArticles
    .filter(
      ({ relevance }) =>
        relevance.hasStrongMatch && relevance.score >= MIN_RELEVANCE_SCORE,
    )
    .map(({ article, relevance, sourceType }) : TokenNewsArticle => ({
      title: article.title,
      url: article.url,
      source: article.source,
      publishedAt: article.publishedAt,
      description: article.description,
      score: relevance.score,
      matchedBy: relevance.matchedBy,
      sourceType,
      imageUrl: article.imageUrl ?? null,
      favicon: article.favicon ?? getFallbackFavicon(article.url),
    }));

  return { scoredArticles, matchedArticles };
}

function logContentOnlyRejectedSample(
  scoredArticles: ReturnType<typeof scoreAndFilterArticles>["scoredArticles"],
  identity: TokenNewsIdentity,
  source: string,
) {
  const contentOnlyRejectedSample = scoredArticles
    .filter(
      ({ relevance, contentOnlyMatches }) =>
        !relevance.hasStrongMatch && contentOnlyMatches.length > 0,
    )
    .slice(0, 3)
    .map(({ article, relevance, contentOnlyMatches }) => ({
      title: article.title,
      source: article.source,
      score: relevance.score,
      matchedContentOnly: contentOnlyMatches,
    }));

  if (contentOnlyRejectedSample.length > 0) {
    console.debug(
      "[rss-news] rejected content-only mentions",
      JSON.stringify(
        {
          token: identity.normalizedSymbol,
          source,
          sample: contentOnlyRejectedSample,
        },
        null,
        2,
      ),
    );
  }
}

export async function getRssTokenNews(
  token: TokenNewsRequest,
  options: TokenNewsOptions = {},
) {
  const identity = buildTokenNewsIdentity(token);
  const selectedFeeds = selectFeedsForToken(identity);

  console.info("[rss-news] token news identity", {
    originalName: identity.originalName,
    originalSymbol: identity.originalSymbol,
    normalizedSymbol: identity.normalizedSymbol,
    searchNames: identity.searchNames,
    searchSymbols: identity.searchSymbols,
  });

  console.info("[rss-news] selected feeds", {
    selectedFeeds: selectedFeeds.length,
    selectedFeedSources: selectedFeeds.map((feed) => feed.source),
  });

  const settled = await Promise.all(
    selectedFeeds.map(async (feed) => {
      try {
        return {
          feed,
          articles: await fetchFeed(feed),
          error: null as string | null,
        };
      } catch (err) {
        return {
          feed,
          articles: [] as RawNewsArticle[],
          error:
            err instanceof Error
              ? err.message || err.name || "Unknown RSS fetch error"
              : String(err),
        };
      }
    }),
  );

  const failedFeeds: Array<{ source: string; url: string; error: string }> = [];
  const fetchedArticles: RawNewsArticle[] = [];

  for (const result of settled) {
    if (result.error == null) {
      fetchedArticles.push(...result.articles);
      continue;
    }

    failedFeeds.push({
      source: result.feed.source,
      url: result.feed.url,
      error: result.error,
    });
  }

  const {
    scoredArticles: scoredRssArticles,
    matchedArticles: matchedRssArticles,
  } = scoreAndFilterArticles(fetchedArticles, identity);
  logContentOnlyRejectedSample(scoredRssArticles, identity, "rss");

  const rssArticles = dedupeArticles(matchedRssArticles);
  let braveArticles: TokenNewsArticle[] = [];
  let webMentionArticles: TokenNewsArticle[] = [];
  let braveNewsUsed = false;
  let braveWebFallbackUsed = false;
  const providersUsed = new Set<"rss" | "brave">(["rss"]);
  let remainingBraveRequests = 2;
  const braveFallbackReason = options.eventAt
    ? `${options.searchMode ?? "event"}-rss-below-threshold`
    : "token-rss-below-threshold";
  const braveUnavailableReason = getBraveSearchUnavailableReason();
  const braveSkipReason =
    options.allowBrave === false
      ? "disabled-by-options"
      : rssArticles.length >= BRAVE_MIN_ARTICLES_BEFORE_FALLBACK
        ? "rss-threshold-met"
        : braveUnavailableReason;

  if (
    options.allowBrave !== false &&
    rssArticles.length < BRAVE_MIN_ARTICLES_BEFORE_FALLBACK &&
    !braveUnavailableReason
  ) {
    try {
      const braveResult = await fetchBraveTokenNews({
        identity,
        isSolanaEcosystem: isSolanaEcosystemIdentity(identity),
        eventAt: options.eventAt,
        searchMode: options.searchMode,
        reason: braveFallbackReason,
        maxRequests: 1,
      });
      remainingBraveRequests = Math.max(
        0,
        remainingBraveRequests - braveResult.requestCount,
      );
      braveNewsUsed = braveResult.requestCount > 0;
      const { scoredArticles, matchedArticles } = scoreAndFilterArticles(
        braveResult.articles,
        identity,
      );
      braveArticles = dedupeArticles(matchedArticles);
      if (braveNewsUsed) {
        providersUsed.add("brave");
      }

      console.info("[rss-news] brave fallback", {
        used: true,
        token: {
          symbol: identity.normalizedSymbol,
          name: identity.originalName,
          address: identity.address,
        },
        reason: braveFallbackReason,
        query: braveResult.query,
        queries: braveResult.queries,
        endpointUsed: braveResult.endpointUsed,
        requestCount: braveResult.requestCount,
        remainingBraveRequests,
        rawResults: braveResult.rawResultCount,
        normalizedResults: braveResult.articles.length,
        matchedResults: braveArticles.length,
      });
      logContentOnlyRejectedSample(scoredArticles, identity, "brave");
    } catch (err) {
      console.warn("[rss-news] brave fallback failed", {
        token: {
          symbol: identity.normalizedSymbol,
          name: identity.originalName,
          address: identity.address,
        },
        reason: braveFallbackReason,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    console.info("[rss-news] brave fallback", {
      used: false,
      token: {
        symbol: identity.normalizedSymbol,
        name: identity.originalName,
        address: identity.address,
      },
      reason: braveSkipReason ?? "unavailable",
      rssArticles: rssArticles.length,
      threshold: BRAVE_MIN_ARTICLES_BEFORE_FALLBACK,
    });
  }

  const strictNewsArticles = dedupeArticles([
    ...rssArticles,
    ...braveArticles,
  ]);
  const webFallbackUnavailableReason = getBraveSearchUnavailableReason();
  if (
    options.allowBrave !== false &&
    strictNewsArticles.length === 0 &&
    remainingBraveRequests > 0 &&
    !webFallbackUnavailableReason
  ) {
    try {
      const webResult = await fetchBraveTokenWebMentions({
        identity,
        reason: "zero-news-web-mention-fallback",
        maxRequests: remainingBraveRequests,
      });
      remainingBraveRequests = Math.max(
        0,
        remainingBraveRequests - webResult.requestCount,
      );
      braveWebFallbackUsed = webResult.requestCount > 0;
      if (braveWebFallbackUsed) {
        providersUsed.add("brave");
      }

      const { matchedArticles } = scoreAndFilterWebMentionArticles(
        webResult.articles,
        identity,
      );
      webMentionArticles = dedupeArticles(matchedArticles);

      console.info("[rss-news] brave web mention fallback", {
        used: true,
        token: {
          symbol: identity.normalizedSymbol,
          name: identity.originalName,
          address: identity.address,
        },
        reason: "zero-news-web-mention-fallback",
        queries: webResult.queries,
        endpointUsed: webResult.endpointUsed,
        requestCount: webResult.requestCount,
        remainingBraveRequests,
        rawResults: webResult.rawResultCount,
        normalizedResults: webResult.articles.length,
        matchedResults: webMentionArticles.length,
      });
    } catch (err) {
      console.warn("[rss-news] brave web mention fallback failed", {
        token: {
          symbol: identity.normalizedSymbol,
          name: identity.originalName,
          address: identity.address,
        },
        reason: "zero-news-web-mention-fallback",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    console.info("[rss-news] brave web mention fallback", {
      used: false,
      token: {
        symbol: identity.normalizedSymbol,
        name: identity.originalName,
        address: identity.address,
      },
      reason:
        strictNewsArticles.length > 0
          ? "strict-news-found"
          : remainingBraveRequests <= 0
            ? "brave-request-budget-exhausted"
            : webFallbackUnavailableReason ?? "disabled-by-options",
      strictNewsArticles: strictNewsArticles.length,
      remainingBraveRequests,
    });
  }

  const braveFallbackUsed = braveNewsUsed || braveWebFallbackUsed;
  const sortedArticles = dedupeArticles([
    ...strictNewsArticles,
    ...webMentionArticles,
  ]).sort(
    (a, b) => {
      const dateDiff = getArticleTimestamp(b) - getArticleTimestamp(a);
      if (dateDiff !== 0) return dateDiff;

      return b.score - a.score;
    },
  );
  const imageEnrichedArticles = await enrichArticleImages(sortedArticles);
  const contextualArticles = applyEventContext(imageEnrichedArticles, options);
  const articles = limitArticles(contextualArticles, options.maxArticles);
  const sourceTypeCounts = getSourceTypeCounts(articles);

  console.info("[rss-news] token news fetch", {
    selectedFeeds: selectedFeeds.length,
    selectedFeedSources: selectedFeeds.map((feed) => feed.source),
    articlesFetched: fetchedArticles.length,
    articlesMatched: articles.length,
    rssArticles: rssArticles.length,
    braveArticles: braveArticles.length,
    webMentionArticles: webMentionArticles.length,
    braveNewsUsed,
    braveWebFallbackUsed,
    braveFallbackUsed,
    providersUsed: [...providersUsed],
    sourceTypeCounts,
    failedFeeds: failedFeeds.map((feed) => feed.source),
  });

  if (failedFeeds.length > 0) {
    console.warn("[rss-news] failed feeds", failedFeeds);
  }

  return {
    token: {
      address: identity.address,
      symbol: identity.normalizedSymbol,
      name: identity.originalName,
    },
    source: braveFallbackUsed ? ("rss+brave" as const) : ("rss" as const),
    updatedAt: new Date().toISOString(),
    providersUsed: [...providersUsed],
    braveFallbackUsed,
    braveNewsUsed,
    braveWebFallbackUsed,
    sourceTypeCounts,
    articles,
    meta: {
      rssArticles: rssArticles.length,
      braveArticles: braveArticles.length,
      webMentionArticles: webMentionArticles.length,
      fallbackUsed: braveFallbackUsed,
      braveFallbackUsed,
      braveNewsUsed,
      braveWebFallbackUsed,
      providersUsed: [...providersUsed],
      sourceTypeCounts,
    },
  };
}
