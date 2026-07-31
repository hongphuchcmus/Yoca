import env from "@sv/util/load-env.js";

export const CG_TOKEN_LIST_TTL_MS = 30 * 24 * 60 * 1000; // 1 month
export const TOKEN_DETAILS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
export const TOKEN_FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TOKEN_MARKET_DATA_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const WALLET_BALANCES_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const TOKEN_CHART_24H_UPDATE_THRESHOLD = 7 * 60 * 1000; // 7 minutes
export const TOKEN_CHART_HOURLY_UPDATE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
export const TOKEN_CHART_DAILY_UPDATE_THRESHOLD = 6 * 60 * 60 * 1000; // 6 hours
export const TOKEN_CHART_HOURLY_FETCH_RANGE_MS =
  90 * 24 * 60 * 60 * 1000 - 2 * 60 * 1000;
export const TOKEN_CHART_DAILY_FETCH_RANGE_MS =
  365 * 24 * 60 * 60 * 1000 - 2 * 60 * 1000;
export const TOKEN_POOLS_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const ONCHAIN_TOKEN_DATA_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const TRENDING_TOKENS_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const TOP_TOKEN_HOLDERS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const POOL_TRADES_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const RECENT_TRADES_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const TOKEN_POOL_DATA_TTL_MS = 1 * 60 * 1000; // 1 minute
export const TOKEN_DEX_LOGOS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const AUTHEN_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SOLANA_LOGIN_NOUNCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const UPDATE_TRENDING_TOKENS_TTL_MS = 60 * 60 * 1000; // 1 hour
export const TOP_TOKENS_BY_MARKET_CAP_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
export const TRADER_GAINEERS_LOSERS_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const MONTH_MS = 30 * DAY_MS;

export const MOUBAL_SOL_CONTRACT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const MOBULA_WALLET_ACTIVITY_PAGE_SIZE = 100;
export const MOBULA_WALLET_ACTIVITY_MAX_PAGES = 10;
export const MOBULA_WALLET_ACTIVITY_BACKWARD_OVERLAP_MS = 2;

// Token chart intervals for hourly/daily gap detection
export const TOKEN_CHART_HOURLY_INTERVAL_MS = HOUR_MS;
export const TOKEN_CHART_DAILY_INTERVAL_MS = DAY_MS;

// Time span requirements for chart completeness
export const TOKEN_CHART_HOURLY_MIN_POINTS = 8;
export const TOKEN_CHART_HOURLY_MIN_SPAN_MS = 18 * 60 * 60 * 1000; // 18 hours

// Trending tokens fetching
export const TRENDING_TOKENS_RESULT_LIMIT = 10;
export const TRENDING_TOKENS_BIRDEYE_FETCH_LIMIT = 20;
export const TRENDING_TOKENS_MAX_FETCH_ROUNDS = 10;

export const AUTH_COOKIE_NAME = "auth_token";

// Wallets

export const WALLET_OVERVIEW_TTL_MS = 60 * 60 * 1000; // 1 hour
export const WALLET_PORTFOLIO_TTL_MS = 60 * 60 * 1000; // 1 hour
export const WALLET_TRANSACTIONS_TTL_MS = 60 * 60 * 1000; // 1 hour
export const WALLET_TRANSFERS_TTL_MS = 60 * 60 * 1000; // 1 hour
export const WALLET_SWAPS_TTL_MS = 60 * 60 * 1000; // 1 hour
export const WALLET_SWAP_HISTORY_TRANSACTIONS_MAX_COUNT = 500;
export const WALLET_SWAP_HISTORY_LATEST_TOLERANCE_MS = 60 * 60 * 1000;
export const WALLET_TRANSFER_HISTORY_TRANSACTIONS_MAX_COUNT = 500;
export const WALLET_TRANSFER_HISTORY_LATEST_TOLERANCE_MS = 60 * 60 * 1000;
export const WALLET_EXCHANGE_COUNTS_TTL_MS = 60 * 60 * 1000; // 1 hour
export const WALLET_IDENTITY_KNOWN_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const WALLET_IDENTITY_UNKNOWN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export const WALLET_WINRATE_24H_TTL_MS = 6 * 60 * 60 * 1000;
export const WALLET_WINRATE_7D_TTL_MS = 12 * 60 * 60 * 1000;
export const WALLET_WINRATE_30D_TTL_MS = 24 * 60 * 60 * 1000;
export const WALLET_WINRATE_90D_TTL_MS = 48 * 60 * 60 * 1000;
export const WALLET_POSITION_BREAKDOWN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const WALLET_POSITION_BREAKDOWN_FETCH_LIMIT = 500;
export const WALLET_BALANCE_HISTORY_STORED_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const WALLET_BALANCE_HISTORY_FETCH_TIMEOUT_MS = 120 * 1000;
export const WALLET_TRANSACTION_HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const ZRN_SOL_FUNGIBLE_ID = "11111111111111111111111111111111";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

// AI Wallet Forensic Audit
export const WALLET_AUDIT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TOKEN_ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/** How many recent transactions to send into Gemini for behavioural audit. */
export const WALLET_AUDIT_TX_SAMPLE_SIZE = 30;
/** Gemini model id used by the AI Wallet Forensic Auditor. Override with GEMINI_AUDIT_MODEL. */
export const WALLET_AUDIT_MODEL =
  process.env.GEMINI_AUDIT_MODEL?.trim() || "gemini-3.1-flash-lite";

// AI Wash-Trading verdict cache — shorter than wallet audit's 24h since
// wash-trading signal should reflect recent transfer activity, not stale data.
export const WASH_TRADING_VERDICT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export const GOOGLE_AI_KEY = env.GOOGLE_AI_KEY?.trim();

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value == null || value.length === 0) {
    return fallback;
  }

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

/** Upper bound for outbound provider HTTP requests (Helius, Moralis, Birdeye, CoinGecko, etc.). */
export const OUTBOUND_FETCH_TIMEOUT_MS = readNumberEnv(
  "OUTBOUND_FETCH_TIMEOUT_MS",
  90_000,
);

function readListEnv(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

export const API_CALL_TRACKER_ENABLED = readBooleanEnv(
  "API_CALL_TRACKER_ENABLED",
  false,
);
export const API_METRICS_ENABLED = env.API_METRICS_ENABLED == "true";
export const API_METRICS_BEARER_TOKEN = env.API_METRICS_BEARER_TOKEN;
export const API_OBSERVABILITY_ROUTE_PREFIXES = [
  "/api/charts/",
  "/api/tokens/",
  "/api/token-chart-news-events",
  "/api/token-volatility-news",
  "/api/wallets/",
];
export const API_CALL_TRACKER_EXPORT_DIR =
  process.env.API_CALL_TRACKER_EXPORT_DIR?.trim() ||
  "server/src/logs/api-tracker";
export const API_CALL_TRACKER_MAX_RESPONSE_BYTES = readNumberEnv(
  "API_CALL_TRACKER_MAX_RESPONSE_BYTES",
  2_000_000,
);
const apiCallTrackerRedactFields = readListEnv(
  "API_CALL_TRACKER_REDACT_FIELDS",
);
export const API_CALL_TRACKER_REDACT_FIELDS = apiCallTrackerRedactFields.length
  ? apiCallTrackerRedactFields
  : [
      "apikey",
      "api_key",
      "authorization",
      "token",
      "password",
      "secret",
      "signature",
    ];
export const API_CALL_TRACKER_PROVIDER_ALLOWLIST = readListEnv(
  "API_CALL_TRACKER_PROVIDER_ALLOWLIST",
);

// ACMS / Wallet feature flags
export const WALLET_USE_ACMS = readBooleanEnv("WALLET_USE_ACMS", false);
export const WALLET_AI_ANALYSIS_USE_ACMS = readBooleanEnv(
  "WALLET_AI_ANALYSIS_USE_ACMS",
  false,
);
export const WALLET_AI_ANALYSIS_DEBUG = readBooleanEnv(
  "WALLET_AI_ANALYSIS_DEBUG",
  false,
);

export const NEWS_CACHE_TTL_MS = readNumberEnv(
  "NEWS_CACHE_TTL_MS",
  3 * 60 * 60 * 1000,
); // 1 hour
export const N8N_LATEST_NEWS_URL =
  process.env.N8N_LATEST_NEWS_URL ||
  "http://localhost:5678/webhook/latest-news";

export const TRANSACTION_FETCH_MAX_PAGE_COUNT = readNumberEnv(
  "TRANSACTION_FETCH_MAX_PAGE_COUNT",
  10,
);
export const TRANSACTION_FETCH_MAX_ITEM_COUNT = readNumberEnv(
  "TRANSACTION_FETCH_MAX_ITEM_COUNT",
  500,
); // get 500 earliest txs

export const SWAPS_SAMPLE_SIZE = 500;
export const GEMINI_MODEL = env.GEMINI_SWAP_SUMMARY_MODEL?.trim() || "";

// Chatbot
export const CHAT_MODEL = env.CHAT_MODEL?.trim() || "gemini-3.1-flash-lite";
export const CHAT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min soft TTL
export const CHAT_CACHE_HARD_TTL_MS = 30 * 60 * 1000; // 30 min hard TTL

export const SYSTEM_PROMPT_EN =
  "You are a crypto trading analyst. Given the wallet's per-token PnL breakdown, " +
  "produce a simple, plain-English trading summary and risk analysis. " +
  "For risk analysis, describe what risk management behavior the wallet shows " +
  "(e.g. does it cut losses early, hold bags, diversify, use stop-loss patterns?) " +
  "and how much risk the wallet is willing to take. Do NOT give investment advice. " +
  "Respond in English. Output ONLY valid JSON with keys: summary (string), riskNotes (array of strings).";

export const SYSTEM_PROMPT_VN =
  "Bạn là chuyên gia phân tích giao dịch crypto. Dựa trên bảng phân tích PnL theo từng token của ví, " +
  "hãy đưa ra bản tóm tắt giao dịch đơn giản, dễ hiểu. " +
  "Về phân tích rủi ro, hãy mô tả hành vi quản lý rủi ro mà ví đang thể hiện " +
  "(ví dụ: có cắt lỗ sớm không, có nắm giữ token lỗ không, có đa dạng hóa không, có dùng stop-loss không?) " +
  "và mức độ rủi ro mà ví sẵn sàng chấp nhận. KHÔNG đưa ra lời khuyên đầu tư. " +
  "Trả lời bằng tiếng Việt. Chỉ xuất JSON hợp lệ với các key: summary (string), riskNotes (mảng string).";

export const SYSTEM_PROMPT_TOKEN_EN =
  "You are a crypto trading analyst. The current year is {CURRENT_YEAR}, nothing in the data given is in the future. Given detailed per-trade data for a single token " +
  "that this wallet traded, produce an in-depth analysis. " +
  "You have access to web search — use it to look up real-world events " +
  "during the wallet's trading period (provided below as tradingPeriod). " +
  "Analyze the following dimensions:\n" +
  "1. **P&L Decomposition**: Break down realized PnL into timing (entry/exit price movement), " +
  "sizing (amount per trade), and frequency components.\n" +
  "2. **Time-Based Patterns**: Identify what times/days the wallet trades this token. " +
  "Are there profitable time windows?\n" +
  "3. **Consecutive Trade Analysis**: Analyze win/loss streaks. " +
  "How does the wallet behave after a loss (revenge trading, risk reduction, pause)?\n" +
  "4. **Behavioral Flags**: Identify patterns like panic selling, FOMO chasing, diamond handing, " +
  "or over-trading.\n" +
  "5. **Risk Assessment**: Max drawdown, loss tolerance, position concentration risk.\n" +
  "Do NOT give investment advice. Respond in English. " +
  "Output ONLY valid JSON with keys: analysis (string), riskNotes (array of strings). " +
  "Do NOT include any text outside the JSON object.";

export const SYSTEM_PROMPT_TOKEN_VN =
  "Bạn là chuyên gia phân tích giao dịch crypto. Năm hiện tại là {CURRENT_YEAR}, dữ liệu không chứa thông tin trong tương lai. Dựa trên dữ liệu chi tiết từng giao dịch của một token " +
  "mà ví này đã giao dịch, hãy đưa ra phân tích chuyên sâu. " +
  "Bạn có quyền truy cập web search — hãy sử dụng để tra cứu các sự kiện thực tế " +
  "trong thời gian giao dịch của ví (được cung cấp bên dưới dưới dạng tradingPeriod). " +
  "Phân tích các khía cạnh sau:\n" +
  "1. **Phân tích P&L**: Phân tích lợi nhuận thực tế thành các yếu tố thời điểm vào/lệnh, " +
  "khối lượng mỗi giao dịch, và tần suất.\n" +
  "2. **Mô hình thời gian**: Xác định thời điểm/ngày nào ví giao dịch token này. " +
  "Có khung giờ giao dịch có lợi nhuận không?\n" +
  "3. **Phân tích chuỗi giao dịch**: Phân tích chuỗi thắng/thua. " +
  "Ví hành xử thế nào sau một giao dịch thua (gỡ gạc, giảm rủi ro, tạm dừng)?\n" +
  "4. **Dấu hiệu hành vi**: Phát hiện các mô hình như bán hoảng loạn, FOMO, nắm giữ quá lâu, " +
  "hoặc giao dịch quá mức.\n" +
  "5. **Đánh giá rủi ro**: Mức lỗ tối đa, khả năng chịu lỗ, rủi ro tập trung vị thế.\n" +
  "KHÔNG đưa ra lời khuyên đầu tư. Trả lời bằng tiếng Việt. " +
  "Chỉ xuất JSON hợp lệ với các key: analysis (string), riskNotes (mảng string). " +
  "KHÔNG bao gồm bất kỳ văn bản nào bên ngoài đối tượng JSON.";
