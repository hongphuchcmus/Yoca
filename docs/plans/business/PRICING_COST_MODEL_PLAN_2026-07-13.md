# Pricing & Cost Model — kế hoạch bàn giao

> **ĐÃ ĐƯỢC THAY THẾ:** File này là kế hoạch cũ và không còn là nguồn số liệu. Mô hình hiện hành chỉ dùng conversion 4% tại `BUSINESS_SCENARIOS_2026-07-19.md` và `reports/YOCA_BUSINESS_MODEL_DEV_HANDBOOK.md`.

Ngày: 2026-07-13

File nội bộ để bàn giao task "xây pricing/business model có căn cứ chi phí thật" cho một thành viên khác + AI agent của bạn ấy. Không phải nội dung nộp báo cáo — nếu nội dung cuối cần đưa vào báo cáo/slide, viết lại theo văn phong báo cáo riêng. Bản nháp hội thoại gốc (yêu cầu của thầy, câu hỏi mở) nằm ở `pricing_model.md` tại root repo — giữ nguyên làm nhật ký, không sửa.

Quy ước như `docs/plans/reports/FINAL_REPORT_REVISION_PLAN.md`:
- `[ ]` chưa làm — `[-]` đang làm/có nháp chưa kiểm chứng — `[x]` xong và đã đối chiếu source.
- Chỗ đánh dấu **⏳ CẦN ĐIỀN** là số/quyết định chưa có, người thực thi (hoặc AI agent của bạn ấy) phải tự nghiên cứu/quyết định — không được bịa số để lấp chỗ trống.

## 0. Bối cảnh và giả định đã chốt

Phản biện của thầy (xem đầy đủ ở `pricing_model.md`):
1. Pricing phải có lựa chọn theo tháng/năm.
2. Các tier có nội dung giống nhau chỉ nên ghi phần khác biệt.
3. Phải có slide business model rõ nguồn vốn, dòng tiền, số người dùng giả định, và lợi nhuận giả định suy ra được từ tính toán, không phải số bịa.
4. Nhóm có kế hoạch dùng AI in-house/open-source không — cần có giả thuyết rõ ràng dù chỉ là kịch bản tương lai.

Trạng thái hiện tại xác nhận đúng vấn đề thầy nêu: trang `client/src/pages/pricing/index.tsx` có giá Lite $39 / Plus $199 / Pro $499 không có căn cứ chi phí, mỗi tier liệt kê lại toàn bộ feature list thay vì chỉ phần khác biệt, không có toggle tháng/năm.

Giả định đã chốt với user (2026-07-13):
- **Traffic/số người dùng**: chưa có analytics/log thật nào. Toàn bộ số người dùng và tần suất truy cập ở Nhóm 4 là **giả định**, phải ghi rõ trong slide là giả định, không phải số đo thật.
- **Đơn vị lợi nhuận**: chi phí external API tính bằng **USD** (đúng đơn vị billing của provider), doanh thu/pricing tier hiển thị bằng **VND** (đúng target user Việt Nam) → cần một bảng tỷ giá giả định khi tổng hợp lợi nhuận. Khung thời gian: theo tháng, có dự phóng 6–12 tháng.

4 tier đã tồn tại thật trong code, dùng làm nền cho Nhóm 6 (không tạo tier mới): **Free, Lite, Plus, Pro** (`server/src/services/subscription-entitlements.service.ts:5`, `TIER_RANK` dòng 12-17).

## 1. Khung 7 bước và phụ thuộc

| # | Nhóm | Input | Output | Trạng thái |
|---|---|---|---|---|
| 1 | Bản đồ chi phí hiện tại | source code | trang→API→provider→cache scope→TTL | ✅ điền đầy đủ ở mục 2 |
| 2 | Rà TTL trước khi tính số | Nhóm 1 (bảng TTL hiện tại) | TTL "hợp lý" đã chốt, feed lại số cuối Nhóm 1 | ✅ đề xuất có căn cứ ở mục 3 (2 hành động thật cần làm: sửa comment bug + thêm cache wash-trading) |
| 3 | Đòn bẩy provider | Nhóm 1+2 | giải pháp theo provider (xoay key/song song/nâng gói) | ✅ giá + rate limit đã research ở mục 4/4.1, còn 2 mâu thuẫn số liệu (Birdeye/Zerion) cần đội tự xác nhận dashboard |
| 4 | Kịch bản theo quy mô user | Nhóm 1+3 | chi phí ước tính theo mốc user | ✅ 3 mốc + công thức + số ở mục 5 (traffic vẫn là giả định minh hoạ) |
| 5 | AI in-house (song song, không chặn 1-4) | độc lập | lộ trình + so sánh chi phí | ✅ research model/hosting + kết luận breakeven ở mục 6 |
| 6 | Pricing & slide | Nhóm 1-4 | tier tháng/năm, slide business model, lợi nhuận giả định | ✅ bảng tier diff-only, P&L 3 mốc, nguồn vốn giả định ở mục 7 |
| 7 | Đóng gói bàn giao | tất cả | chính file này | ✅ xem checklist còn lại ở mục 8 |

Phụ thuộc chính: 2 phải chốt trước khi 1 chốt số cuối; 1+3 → 4; 1+3+4 → 6; 5 chạy song song không chặn các nhóm khác.

## 2. Nhóm 1 — Bản đồ chi phí hiện tại

### 2.1 Cơ chế cache toàn hệ thống

- Kiến trúc thật: Hono server (`server/src/main.ts`) + Vite/React SPA gọi qua `hono/client`. Không phải Next.js.
- Cơ chế chính, dùng ở gần như mọi nơi: **Postgres cache-aside qua Drizzle** — đọc row theo `updatedAt`/`fetchedAt` còn hợp lệ so với hằng `*_TTL_MS` trong `server/src/config/constants.ts`; hết hạn thì gọi provider rồi `insert...onConflictDoUpdate`. Ví dụ: `getTokenMarketData` (`server/src/services/tokens/token-market-data.ts:184-242`). Cache này **shared theo địa chỉ token/wallet**, không theo user — N user xem cùng resource trong TTL chỉ tốn 1 lần gọi provider.
- **ACMS** (`server/src/services/api-manager/` — coalescer + Redis + throttle-queue per-provider) là code đã viết nhưng **đang chết**: chỉ được gọi từ 1 chỗ (`wallet/providers/adapters/index.ts`), tắt qua `WALLET_USE_ACMS=false` và `WALLET_AI_ANALYSIS_USE_ACMS=false` (`constants.ts:162-163`). Bug: `internal/redis.ts` không bao giờ gọi `.connect()`, nên dù bật cờ vẫn rơi về `Map` in-memory per-process, không TTL eviction, mất khi restart, không share giữa nhiều instance. → **Nhóm 3 phải quyết định rõ**: sửa và bật ACMS làm giải pháp, hay bỏ hẳn khỏi cost model vì chưa chạy thật trong production.
- 2 cache in-memory thật đang chạy (process-local, mất khi restart, nhân theo số instance nếu scale ngang):
  - Tỷ giá exchange rate: `server/src/routes/misc.ts:29-30`, 1 key chung cho toàn site, TTL 5 phút.
  - Wallet token AI analysis: `walletTokenAnalysis.service.ts:70-90`, key `address::tokenAddress::language`, TTL 24h (`TOKEN_ANALYSIS_TTL_MS`).

### 2.2 Bảng trang → API nội bộ → provider → cache scope

**Đã verify lại toàn bộ bảng này lần 2 (2026-07-13) bằng cách grep import provider thật (`util-coingecko`/`util-birdeye`/`util-helius`/`util-mobula`/`util-moralis`) ở từng file service cuối cùng trong chain, không suy theo tên route/file.** Lần verify đầu (trong bảng gốc) có tới 8 chỗ sai/thiếu — đã sửa hết, đánh dấu 🔧 ở các dòng có thay đổi so với bản đầu.

| Trang | API nội bộ chính | Provider ngoài | Cache scope | TTL hiện tại |
|---|---|---|---|---|
| Token detail (`pages/token`) | `tokens/markets/chart/:address` | CoinGecko | Shared DB (theo address) | 7 phút (update threshold) |
| | `tokens/markets/:addresses` | CoinGecko | Shared DB `tokenMarketData` | 5 phút |
| | `tokens/meta/:addresses` | CoinGecko (chính) + Moralis (fallback khi CoinGecko không resolve được address) | Shared DB `tokenMeta` | 7 ngày |
| | 🔧 `tokens/holders/:address` | **Mobula** (`token-holders.ts:16,22`, endpoint `/2/token/holder-positions` — KHÔNG phải Birdeye/Moralis như bảng gốc) | Shared DB `topTokenHolders` | 24h |
| | 🔧 `tokens/:address/pools` | **CoinGecko** (`token-pools.ts:15`, KHÔNG phải Birdeye) | Shared DB `tokenTopPools` | 5 phút |
| | 🔧 `tokens/pools/trades/:address` | **CoinGecko** (`token-trades.ts:6`, KHÔNG phải Birdeye) | Shared DB `poolTrades24h` | 5 phút |
| | 🔧 `tokens/holders/stats/:addresses` | **Mobula** (cùng chain với `tokens/holders`, KHÔNG phải Birdeye/Moralis) | Shared DB `tokenHolderStats` | n/a |
| **→ Kết luận quan trọng: Birdeye KHÔNG được dùng ở Token Detail page** — toàn bộ trang này chỉ chạm CoinGecko (chính) + Mobula (holders) + Moralis (fallback meta hiếm khi). Bảng gốc ghi Birdeye ở 3 dòng trên là sai hoàn toàn. | | | | |
| Historical Data | `tokens/history/:address` (≤365 ngày) | CoinGecko | Shared DB | theo range |
| Market | 🔧 `market-pools/trending`, `.../top`, `.../new-pairs` | **CoinGecko** onchain API (`token-market-pools.ts`, KHÔNG phải Birdeye) | Shared, không tham số theo user | — |
| | 🔧 `market-pools/gainers` | **Birdeye** (`/defi/v3/token/list`) **+ CoinGecko** (enrichment) — hybrid thật sự, đây là dòng duy nhất trong Market page có Birdeye | Shared | — |
| | `MarketTicker` (nhiều trang): `tokens/trending` | Birdeye (`/defi/token_trending`, xác nhận đúng) | Shared DB `trending_tokens` | 15 phút, refresh job 1h — **shared toàn site nên chi phí Birdeye ở dòng này gần như cố định, không tăng theo MAU** |
| Wallet detail (nặng nhất, ~10-15 call/lượt xem) | `wallets/overview` | 🔧 **Helius** (holdings, `walletDataFetcher.service.ts:46-50`) **+ Mobula** (activity/PnL, `wallet-analysis.ts:12,56`) — KHÔNG phải Moralis | Shared DB (theo address) | 1h |
| | `wallets/portfolio` | Helius (chính, holdings) 🔧 **+ CoinGecko/Moralis** (metadata sidecar khi thiếu symbol/logo, `walletData.core.ts:876` — bảng gốc bỏ sót phần này) | Shared DB | 1h |
| | `wallets/swap`, `swaps/history` | Mobula (xác nhận đúng) | Shared DB, tối đa 500 tx | 1h |
| | `wallets/transfers/history` | Mobula (xác nhận đúng) | Shared DB | 1h |
| | `wallets/identity` | Helius (xác nhận đúng — "heuristic" chỉ là logic phân loại known/unknown nội bộ, không phải provider riêng) | Shared DB `walletIdentityCache` | known 6h / unknown 2h (comment code ghi sai 72h/24h — xem mục 3.1) |
| | 🔧 `wallets/:address/tokens` | **Mobula** (`wallet-token-details.ts:18,25`, endpoint `/2/wallet/positions`) — bảng gốc ghi "—" (không có provider) là **sai**, đây là dòng chi phí thật bị bỏ sót hoàn toàn | Shared DB | 24h |
| | `wallets/:address/audit` | **Gemini** (được feed bởi Helius tx sample mỗi lần cache miss) | Shared DB `walletAuditCache` | 24h, `?force=1` bypass |
| | `wallets/ai-analysis` (auth) | Gemini | Shared DB + **quota AI theo user** (`ai-usage.service.ts`) | xem mục Gemini bên dưới |
| | `wallets/ai-swap-summary` (auth) | Gemini | Shared DB `walletAiSwapSummaryCache` (key address+language) | 24h |
| | `wallets/ai-swap-summary/token` (auth) | Gemini | **In-memory Map** (không phải DB) | 24h |
| | 🔧 `wallets/analysis/pnl`, `.../winrate` | **Mobula** (`wallet-analysis.ts:12,56`, DB-cached TTL-refreshed — bảng gốc ghi "—, purely computed" là **sai**, đây cũng là chi phí thật bị bỏ sót) | Shared DB | winrate 6h/12h/24h/48h theo period |
| | Wallet Chat (`chat.$post`) | Gemini (luôn) + Brave (chỉ khi model tự gọi tool web/news search) — xác nhận đúng bảng gốc | Shared DB `chatAnalysisCache`, key = hash(địa chỉ+query+model+data fingerprint) | soft 5 phút / hard 30 phút; **không cache được nếu tool dùng web/news search** |
| Alerts | `alerts.$get/$post`, `alertsHp.*` | — (config rule, DB nội bộ) | Không gọi provider tại thời điểm request; provider chạy async ở background job/webhook | n/a |
| Transactions | 🔧 `transactions/raw/:txHash` | **Helius RPC** (`getNextkey`/`mainnet.helius-rpc.com`, tier RPC rẻ hơn Enhanced Tx) **+ CoinGecko/Moralis** (token meta) — bảng gốc ghi "không có provider" là **sai** | Không thấy cache/TTL trong `routes/transactions.ts` | — |
| | 🔧 `transactions/:txHash` (route khác, không phải `/raw/`) | **Helius Enhanced Tx** (chính) **+ Birdeye `/defi/price`** (fallback khi thiếu giá USD của 1 leg swap) — route này mới là nơi thật sự chạm Birdeye, không phải `/raw/:txHash` | — | — |
| Search (mọi trang) | `search` | CoinGecko (`getAddressesByCoinGeckoIds`) | Không có cache riêng ở tầng search, dựa vào cache của token-market-data phía sau | — (đã có debounce 320ms ở `SearchBar.tsx:112`, không phải hotspot theo từng phím gõ) |
| Toàn cục | `misc/exchange-rates` (widget `GlobalPrices`) | CoinGecko | In-memory, 1 key chung toàn site | 5 phút |
| | 🔧 News — **2 pipeline độc lập, không dùng chung code** (bảng gốc gộp sai thành 1 dòng): (a) `routes/news.ts` → **chỉ n8n webhook**, không có Brave; (b) `token-news`/`token-chart-news-events`/`token-volatility-news` → **RSS (chính) + Brave (fallback)**, không dùng n8n | (a) n8n webhook, (b) `rss-news.service.ts` + `brave-news.service.ts` | Shared DB `newsBatches`/`newsArticles` | 3h (env override được) |
| Profile | tổng hợp overview/linked wallets/watchlist | dùng lại cache wallet/token ở trên | Shared theo address, nhưng bị gate sau auth | như trên |
| Wash-trading | `wash-trading.route.ts` → `wash-trading-ai.service.ts` | Helius (raw transfer), Gemini (AI verdict) | Raw transfer data: **in-memory Map**, key `mint+timeframe`, TTL 5 phút (`CACHE_TTL_MS`, `wash-trading-ai.service.ts:142`). **Gemini AI verdict KHÔNG có cache nào** — mỗi lần gọi `ai-analyze`/`GET /:mint` là 1 lần gọi Gemini mới (`tryGeminiAnalysis`, dòng 969-1031), chỉ được chặn gián tiếp bởi quota AI/user (Plus/Pro, 50-100/ngày) chứ không có TTL/dedupe ở tầng data | transfer 5 phút / Gemini: không TTL — **cost leak thật, nên thêm DB cache theo mint+timeframe ở Nhóm 3 (tương tự `walletAuditCache`) trước khi scale** |

Ghi chú quan trọng: hầu hết cache key theo **địa chỉ token/wallet**, không theo user — nhưng vì mỗi user chủ yếu xem ví của chính mình, cache-hit thật ngoài đời gần với per-user hơn là con số "shared" trên giấy, trừ khi nhiều user cùng tra 1 ví/token phổ biến (feature search/lookup ví công khai có hỗ trợ việc này).

**Kết luận verify lần 2 — tổng cộng 8 chỗ sai/thiếu được sửa** (3 chỗ đã biết + 5 chỗ mới phát hiện): Birdeye gần như không xuất hiện ở luồng chính (chỉ MarketTicker shared-cache, gainers tab, wallet net-worth/chart, và fallback giá tx) — CoinGecko và Mobula mới là 2 provider tải nặng nhất thật sự. Mobula còn nặng hơn bảng gốc vì bỏ sót 2 dòng chi phí thật (`wallets/:address/tokens`, `wallets/analysis/pnl|winrate`). Số ở mục 5 bên dưới đã tính lại theo phát hiện này.

### 2.3 Provider ngoài đang dùng thật

Đã verify lại trong phiên này (không chỉ dựa vào tên biến môi trường):

| Provider | Còn dùng thật? | Domain dữ liệu |
|---|---|---|
| CoinGecko | Có | token metadata/market/chart/search |
| Birdeye | Có | pools, holders, trending, trades |
| Helius | Có | wallet overview/portfolio/tx, RPC |
| Moralis | Có | wallet overview fallback, holders |
| Mobula | Có | wallet swaps/transfers history |
| Zerion | **Có** — verify lại thấy vẫn được dùng ở `walletTokenBalance.service.ts` (token id mapping cho lịch sử giá theo token) — báo cáo trước đó nghi ngờ "unused" là **sai**, đã sửa | wallet token balance history |
| CoinMarketCap | **Không** — grep toàn `server/src` không thấy consumer nào gọi `util-coinmarketcap.ts` ngoài chính nó; chỉ còn env var. Loại khỏi cost model, hoặc note là dead config cần dọn | — |
| Google Gemini (`@google/genai`) | Có — provider AI duy nhất, không dùng OpenAI/Anthropic | wallet audit/analysis/swap-summary, token AI chat, chart news summary, volatility summary, chat orchestrator, wash-trading AI |
| Brave Search | Có | news enrichment, giới hạn cứng `MAX_BRAVE_QUERIES=2`/request + soft monthly limit qua env |
| n8n webhook | Có (self-host, không phải paid API) | news, wallet AI analysis (webhook) |

### 2.4 Cần verify thêm trước khi tính tiền chính thức

- [x] Trace đầy đủ trang Wash-trading — xem hàng "Wash-trading" ở bảng 2.2. Phát hiện quan trọng: Gemini AI verdict không có cache nào (khác mọi feature AI khác trong app đều có DB cache 3-24h) — đề xuất bổ sung DB cache trước khi đưa wash-trading vào tính chi phí ở Nhóm 4/5.
- [x] **Xác nhận (2026-07-13) — Home/Landing KHÔNG tái dùng API Market/News, mà hoàn toàn KHÔNG gọi API nào.** `MarketIntelligenceSection.tsx` vẽ chart từ mảng giá **hardcode cứng trong code** (`RANGE_DATA`, `MARKET_STATS` — số SOL/USD giả lập, không fetch); `LandingNewsSection.tsx` hiển thị 3 bài viết **hardcode cứng** (`posts` array, title/excerpt lấy từ i18n string tĩnh), link `href: "/market"` chỉ để điều hướng, không gọi API tại trang Home. → **Sửa lại kết luận bảng gốc**: Home/Landing có chi phí external API bằng **0** (không phải "tái dùng cache" như giả định ban đầu, vì không có lệnh gọi nào để tái dùng) — không cần thêm dòng chi phí nào cho Home ở Nhóm 4.
- [x] **Xác nhận (2026-07-13) — `transactions/raw/:txHash` và `transactions/:txHash` đều không có cache.** Đã đọc toàn bộ `routes/transactions.ts` + service `transactions.ts`/`transactions.raw-parser.ts`: không có `cache|TTL` ở route lẫn service — mỗi lượt gọi đều fetch Helius mới (raw RPC hoặc Enhanced Tx). Giữ đúng kết luận bảng gốc (mục 2.2): nếu traffic trang Transactions thấp có thể bỏ qua trong pricing model hiện tại; nếu muốn scale lớn cần thêm cache theo `txHash` (giao dịch đã confirm không đổi nội dung, TTL có thể dài, ví dụ vĩnh viễn/24h+) trước khi tính chi phí ở mức MAU cao.
- [x] **Xác nhận (2026-07-13) — COINMARKETCAP đã là dead code sạch, không cần dọn thêm.** `server/.env.example` và `client/.env.example` **đã không liệt kê** `COINMARKETCAP_API_BASE_URL`/`COINMARKETCAP_API_KEY` (không phải việc cần làm). Phần dead code còn sót nằm trong source: `server/src/util/util-coinmarketcap.ts` (không consumer nào import ngoài chính nó) và khai báo schema mặc định ở `server/src/middlewares/validation.ts:400-401`. Không bắt buộc xoá cho pricing model — để backlog kỹ thuật Nhóm 7 nếu đội muốn dọn dứt điểm (xoá `util-coinmarketcap.ts` + 2 dòng schema).

## 3. Nhóm 2 — Rà TTL trước khi tính số

### 3.1 Bug cần sửa trước khi dùng số này làm nền

`server/src/config/constants.ts` dòng 64-65: comment sai lệch với giá trị thật —
```
WALLET_IDENTITY_KNOWN_TTL_MS = 6 * 60 * 60 * 1000;   // comment ghi "72 hours", giá trị thật là 6h
WALLET_IDENTITY_UNKNOWN_TTL_MS = 2 * 60 * 60 * 1000; // comment ghi "24 hours", giá trị thật là 2h
```
**Đã xác nhận (2026-07-13, đội)**: giá trị 6h/2h là chủ đích thật, đặt vậy để tránh hao quota API khi đang chạy trên gói free của provider. Comment 72h/24h là sai/lỗi thời. → **Chỉ sửa comment cho khớp 6h/2h, không đổi giá trị.**

### 3.2 Bảng TTL hiện tại (đầy đủ, có file:line)

| Nhóm dữ liệu | Hằng số | Giá trị hiện tại | Vị trí |
|---|---|---|---|
| Token list CoinGecko | `CG_TOKEN_LIST_TTL_MS` | 30 ngày | `constants.ts:3` |
| Token details | `TOKEN_DETAILS_TTL_MS` | 7 ngày | `constants.ts:4` |
| Token market data | `TOKEN_MARKET_DATA_TTL_MS` | 5 phút | `constants.ts:5` |
| Wallet balances | `WALLET_BALANCES_TTL_MS` | 5 phút | `constants.ts:6` |
| Token chart refresh | `TOKEN_CHART_24H/HOURLY/DAILY_UPDATE_THRESHOLD` | 7 phút / 30 phút / 6h | `constants.ts:7-9` |
| Token pools | `TOKEN_POOLS_TTL_MS` | 5 phút | `constants.ts:14` |
| On-chain token data | `ONCHAIN_TOKEN_DATA_TTL_MS` | 5 phút | `constants.ts:15` |
| Trending tokens | `TRENDING_TOKENS_TTL_MS` | 15 phút | `constants.ts:16` |
| Top holders | `TOP_TOKEN_HOLDERS_TTL_MS` | 24h | `constants.ts:17` |
| Pool trades | `POOL_TRADES_TTL_MS` | 5 phút | `constants.ts:18` |
| Recent trades | `RECENT_TRADES_TTL_MS` | 15 phút | `constants.ts:19` |
| Pool data | `TOKEN_POOL_DATA_TTL_MS` | 1 phút | `constants.ts:20` |
| DEX logos | `TOKEN_DEX_LOGOS_TTL_MS` | 24h | `constants.ts:21` |
| Trending refresh job | `UPDATE_TRENDING_TOKENS_TTL_MS` | 1h | `constants.ts:24` |
| Top theo market cap | `TOP_TOKENS_BY_MARKET_CAP_TTL_MS` | 1 ngày | `constants.ts:25` |
| Gainers/losers | `TRADER_GAINEERS_LOSERS_TTL_MS` | 3 ngày | `constants.ts:26` |
| Wallet overview/portfolio/tx/transfer/swap | `WALLET_OVERVIEW/PORTFOLIO/TRANSACTIONS/TRANSFERS/SWAPS_TTL_MS` | 1h mỗi loại | `constants.ts:54-58` |
| Wallet exchange counts | `WALLET_EXCHANGE_COUNTS_TTL_MS` | 1h | `constants.ts:63` |
| Wallet identity known/unknown | xem 3.1 | 6h / 2h | `constants.ts:64-65` |
| Wallet winrate 24h/7d/30d/90d | `WALLET_WINRATE_*_TTL_MS` | 6h/12h/24h/48h | `constants.ts:67-70` |
| Wallet token details | `WALLET_TOKEN_DETAILS_TTL_MS` | 24h | `constants.ts:71` |
| Wallet balance history | `WALLET_BALANCE_HISTORY_STORED_TTL_MS` | 24h | `constants.ts:73` |
| Wallet tx history | `WALLET_TRANSACTION_HISTORY_CACHE_TTL_MS` | 24h | `constants.ts:75` |
| Wallet audit / token analysis (Gemini) | `WALLET_AUDIT_TTL_MS`, `TOKEN_ANALYSIS_TTL_MS` | 24h mỗi loại | `constants.ts:81-82` |
| News cache | `NEWS_CACHE_TTL_MS` (env override) | 3h mặc định | `constants.ts:172-175` |
| Chat cache | `CHAT_CACHE_TTL_MS` / `CHAT_CACHE_HARD_TTL_MS` | 5 phút / 30 phút | `constants.ts:194-195` |
| Wallet snapshot (recent/historical) | `TOKEN_BALANCE_SNAPSHOT_CACHE_RECENT/HISTORICAL_TTL_MS` | 15 phút / 24h | `wallet/wallet.constants.ts:29-30` |
| Wallet AI analysis (DB) | `WALLET_AI_ANALYSIS_CACHE_TTL_MS` | 3h | `wallet/db/walletAnalysisCache.ts:10` |
| Wallet AI analysis (n8n webhook, env) | `WALLET_AI_ANALYSIS_CACHE_TTL_MS` (env, default) | 3h mặc định | `wallet/dtos/AiAnalysisDataObjects.ts:3-4` |
| Token AI chat (theo timeframe) | map trong `token-ai-chat-cache.ts:28-34` | 24h→10 phút, 7d→30 phút, 1m/3m/1y→1h | — |
| Volatility + news summary | `token-volatility-news-cache.ts:22-29` | 24h→30 phút, hourly→1h, daily→6h | — |
| Chart news events | `token-chart-news-events-cache.ts:21-30` | 24h→30 phút, 7d→1h, 1m→2h, 3m/1y→6h | — |
| Chat tool cache theo tool | `chat/chat.tools.ts:1145-1178` | 10 giây (giá live) đến 600 giây (metadata ổn định) | — |
| Exchange rates | `misc.ts:29-30` (không phải hằng constants.ts) | 5 phút, in-memory 1 key | — |
| Wallet token analysis (Gemini) | `TOKEN_ANALYSIS_TTL_MS`, in-memory | 24h | `walletTokenAnalysis.service.ts:70-90` |

### 3.3 Khung tiêu chí chọn TTL "hợp lý" (đề xuất — cần người thực thi xác nhận, không phải số chốt)

Không tự chốt lại từng con số thay đội (đây là quyết định sản phẩm, ảnh hưởng UX vs chi phí), nhưng đề xuất khung phân loại để việc chốt số nhanh và nhất quán:

| Nhóm dữ liệu | Đặc điểm | Hướng đề xuất |
|---|---|---|
| Giá/market data biến động nhanh (market data, pool data, chart 24h) | User kỳ vọng gần-real-time, sai lệch dễ nhận ra | Giữ ngắn (phút), đây là chi phí cố định chấp nhận được vì cache vẫn shared toàn site |
| Metadata gần như tĩnh (token details, DEX logos, token list) | Hiếm đổi | Đã hợp lý (ngày/tuần), không cần đổi |
| Wallet data theo địa chỉ (overview/portfolio/tx) | Cập nhật sau mỗi giao dịch on-chain, nhưng user không cần real-time tuyệt đối | 1h hiện tại có thể đủ; cân nhắc so với "mức chấp nhận cũ của user" — cần hỏi người thực thi/nhóm UX |
| Output AI (Gemini: audit, analysis, chat) | **Chi phí mỗi lần miss cao nhất** (gọi LLM), nội dung không đổi nhanh như giá | TTL 3-24h hiện tại hướng đúng; đây là đòn bẩy tiết kiệm chi phí lớn nhất — nên ưu tiên KHÔNG rút ngắn các TTL này khi cân nhắc trade-off |
| Identity/heuristic (wallet identity) | Suy luận, không cần fresh tuyệt đối | Giữ theo giờ, ưu tiên sửa bug comment ở 3.1 trước |

### 3.4 TTL đề xuất cuối cùng (đề xuất có căn cứ — đội xác nhận trước khi tính Nhóm 4)

| Nhóm dữ liệu | TTL hiện tại | Đề xuất | Lý do |
|---|---|---|---|
| Market/price/pool data (5-15 phút) | 5-15 phút | **Giữ nguyên** | Đã là chi phí thấp nhất có thể vì cache shared toàn site; rút ngắn thêm tăng chi phí không đáng, kéo dài thêm gây sai lệch giá dễ nhận ra |
| Metadata tĩnh (token details, DEX logos, token list) | 24h-30 ngày | **Giữ nguyên** | Hiếm đổi, đã hợp lý |
| Wallet overview/portfolio/tx/transfer/swap | 1h | **Đã xác nhận (2026-07-13, đội): giữ 1h mặc định, thêm nút "làm mới" thủ công** (theo pattern `?force=1` đã có ở wallet audit) | Lý do TTL 1h ban đầu (đội xác nhận): tránh hết quota API do đang chạy gói free của provider — rút ngắn mặc định sẽ ăn quota nhanh hơn không cần thiết vì mỗi ví chủ yếu chỉ đúng 1 người xem (cache "shared" trên giấy nhưng thực tế gần per-user — mục 2.2). Nút force-refresh cho user cần data mới ngay mà không ép cả hệ thống trả thêm chi phí — việc thật cần làm: thêm `?force=1` tương tự wallet audit cho các route wallet overview/portfolio/tx |
| Wallet identity known/unknown | 6h/2h | **Giữ nguyên**, chỉ sửa comment sai (mục 3.1) | Heuristic, không cần fresh tuyệt đối |
| AI output (audit/analysis/swap-summary/token analysis) | 24h | **Giữ nguyên, không rút ngắn** | Chi phí Gemini mỗi lần miss cao nhất trong toàn hệ thống; đây là TTL đang bảo vệ chi phí tốt nhất, rút ngắn sẽ tăng chi phí AI trực tiếp |
| Chat cache | 5 phút / 30 phút (soft/hard) | Giữ nguyên | Bản chất hội thoại cần tương đối mới; đã có quota AI/user làm lớp chặn chi phí thứ hai |
| News | 3h | Giữ nguyên | Đã hợp lý cho tin tức |
| **Wash-trading Gemini verdict** | **Không có TTL (mục 2.2)** | **Thêm DB cache TTL 3-6h theo `mint+timeframe`** (tương tự `walletAuditCache`, không phải "giữ nguyên" vì hiện tại đang là 0) | Đây là data point duy nhất phát hiện thêm trong phiên này: mọi feature AI khác đều có DB cache 3-24h, riêng wash-trading verdict gọi Gemini mới mỗi lần — không sửa thì Nhóm 4/5 sẽ tính chi phí sai (thấp hơn thực tế) nếu tính theo giả định "đã có cache" như các AI feature khác |

Kết luận Nhóm 2: phần lớn TTL hiện tại đã hợp lý, không cần đại tu. Hai hành động thật cần làm trước khi Nhóm 1 chốt số cuối: (1) sửa comment TTL sai ở mục 3.1, (2) thêm cache cho wash-trading Gemini verdict — đây là lỗ hổng chi phí thật, không phải TTL cần "tinh chỉnh".

## 4. Nhóm 3 — Đòn bẩy mở rộng phía provider

| Provider | Rate limit free tier (đo trong code) | Xoay key? | Song song hoá? | Gói trả phí gần nhất (nguồn chính thức, truy cập 2026-07-13) |
|---|---|---|---|---|
| Helius | Bottleneck 2 req/s, maxConcurrent 2 (`util-helius.ts:8-14`, comment ghi rõ giả định free tier) | **Có** — `ApiKeyManager` round-robin, hỗ trợ nhiều key comma-separated | Enhanced tx là cursor-based, không song song được dễ dàng | **Developer $49/tháng** — cùng sản phẩm DAS/Enhanced Transactions, chỉ tăng limit 2→10 RPS trên endpoint đang dùng (không cần đổi endpoint), 10,000,000 credit/tháng. [helius.dev/pricing](https://www.helius.dev/pricing) |
| Birdeye | Bottleneck 15 req/s, maxConcurrent 5 (`util-birdeye.ts:92-98`) | Có | Không thấy pagination cần song song | **Đã verify kỹ 2 lần (2026-07-13)** — kết luận cuối: **CHỈ cần sửa config, KHÔNG cần nâng gói.** (1) Key hiện tại xác nhận là **Free ("Standard")**, free thật = **1 req/s tính theo cả tài khoản** (không phải theo từng endpoint) — nhưng code đang set limiter 15 req/s (`util-birdeye.ts:92-98`), đây là **bug cấu hình sai cần sửa ngay** (rủi ro 429/khoá key khi ≥2 request đồng thời), độc lập với mọi mốc MAU. (2) "Giới hạn 3 endpoint" trên trang pricing là **thông tin lỗi thời** — bảng accessibility mới nhất của Birdeye (hiệu lực 26-Nov-2025) cho free tier truy cập 20+ endpoint, và toàn bộ 8 endpoint Birdeye Yoca đang gọi đều nằm trong danh sách được phép — không có rủi ro endpoint. (3) Sau khi verify lại toàn bộ mục 2.2 (xem ghi chú ở đó), phát hiện Birdeye **không hề được dùng ở Token Detail** — tải thật chỉ đến từ MarketTicker (shared cache, gần như cố định không tăng theo MAU), tab gainers, wallet net-worth/chart, và fallback giá giao dịch — thấp hơn nhiều so với giả định ban đầu. Kết luận: sửa `util-birdeye.ts` về đúng 1 req/s là đủ ở cả 3 mốc Nhóm 4, **không cần Lite $39/tháng** trừ khi traffic thật vượt xa giả định. [docs.birdeye.so/docs/pricing](https://docs.birdeye.so/docs/pricing), [docs.birdeye.so/docs/data-accessibility-by-packages](https://docs.birdeye.so/docs/data-accessibility-by-packages) |
| Moralis | maxConcurrent 5, minTime 100ms (`util-moralis.ts:9-12`) | Có | — | **Starter $49/tháng** (billed annually), 2,000,000 compute unit/tháng (free 1.2M/tháng). RPS công bố 40 cho cả free lẫn Starter — lợi ích chính của gói trả phí là credit pool, không phải RPS cao hơn. [moralis.com/pricing](https://moralis.com/pricing/) |
| Zerion | 1 req/s, **300 req/ngày** — comment rõ ràng trong code (`util-zerion.ts:30-38`) | **Không** — chỉ 1 key, chưa hỗ trợ rotation | — | **Builder $149/tháng**, 50 RPS, 250,000 req/tháng. ⚠️ **Xác nhận (2026-07-13, đội)**: key hiện tại đúng là **Free**. Số free tier vẫn không nhất quán giữa các trang chính thức của Zerion (10 RPS công bố hiện tại nhưng cap ngày/tháng mỗi trang một số khác nhau: 2.000/ngày vs 60k/tháng) — không khớp với comment 300 req/ngày trong code, nhưng đã xác nhận đúng là đang ở free nên **giả định limiter trong code (1 req/s, an toàn hơn cả 3 con số free tier tìm được) là hướng dùng đúng, giữ nguyên**, không cần sửa code. Đây vẫn là provider có khả năng bottleneck sớm nhất khi scale vì giá gói trả phí cao nhất ($149) trong nhóm và request/ngày free thấp nhất. [zerion.io/api](https://zerion.io/api) |
| Mobula | 1 req/s, maxConcurrent 1 (`util-mobula.ts:4-7`) | Không — 1 key duy nhất | **Có, đây là candidate chính**: wallet-activity dùng offset pagination (`walletTransfersSwaps.service.ts:940-1004`, page size 100, tối đa 10 trang) nhưng đang chạy tuần tự vì limiter 1 req/s. Muốn song song phải: (a) rotate nhiều key trước, (b) nâng limiter theo rate limit thật của gói đang dùng | **Start-up $50/tháng**, 30 RPS (tăng 30 lần so với free 1 RPS), 125,000 credit/tháng — khớp đúng giả định trong code, số sạch nhất trong nhóm 6 provider. Với gói này, song song hoá 10 trang offset hoàn toàn khả thi (30 RPS đủ chạy cả 10 trang gần như đồng thời thay vì tuần tự 1 req/s ≈ 10 giây → có thể xuống dưới 1 giây). [docs.mobula.io/pricing](https://docs.mobula.io/pricing) |
| CoinGecko | 1 req/1.2s (demo-key header, `util-coingecko.ts:4-7`) | Không | Không thấy pagination | **Basic $35/tháng** (hoặc $29/tháng nếu trả theo năm), 300 call/phút, 100,000 credit/tháng (rẻ hơn tier "Analyst" $129/tháng mà bản nháp ban đầu nhắc tới — Basic mới là gói rẻ nhất thật sự nâng được rate limit). ⚠️ Lưu ý kỹ thuật: mọi gói trả phí chuyển từ `api.coingecko.com` (header `x-cg-demo-api-key`) sang `pro-api.coingecko.com` (header `x-cg-pro-api-key`) — endpoint path/response giữ nguyên nhưng vẫn là một thay đổi nhỏ về base URL + auth header, không phải "chỉ đổi key" hoàn toàn zero-touch. [coingecko.com/en/api/pricing](https://www.coingecko.com/en/api/pricing) |
| Google Gemini | Không có Bottleneck/limiter, không có retry/backoff, không có key rotation | Không (chưa làm) | n/a — chi phí chính là per-token billing, không phải rate limit | Không phải "nâng gói" như các provider khác — Gemini API là pay-as-you-go theo token, không có bậc free/paid rời rạc; xem bảng giá chi tiết dưới |

### 4.1 Gemini API pricing (đã research, nguồn chính thức)

Nguồn: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing), truy cập 2026-07-13. Đúng 3 model đang dùng thật trong code (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` — cả 3 đều là model thật, không cần thay thế).

| Model | Input $/1M token | Output $/1M token | Cached-input $/1M token | Batch API (in/out) $/1M token |
|---|---|---|---|---|
| `gemini-2.5-flash` | $0.30 (text/ảnh/video), $1.00 (audio) | $2.50 | $0.03 + $1.00/1M token/giờ lưu trữ | $0.15 / $1.25 |
| `gemini-2.5-flash-lite` | $0.10 (text/ảnh/video), $0.30 (audio) | $0.40 | $0.01 + lưu trữ | $0.05 / $0.20 |
| `gemini-3.1-flash-lite` | $0.25 (text/ảnh/video), $0.50 (audio) | $1.50 | $0.025 + lưu trữ | $0.125 / $0.75 |

Ghi chú áp dụng cho cost model:
- Free tier vẫn tồn tại trên cùng API key trả phí (không cần tài khoản riêng), nhưng số RPM/RPD chính xác phải xem trực tiếp ở `aistudio.google.com/rate-limit` (trang pricing chính thức không còn liệt kê bảng tĩnh theo model) — không dùng số free tier để tính chi phí ở quy mô có doanh thu.
- **Batch API rẻ hơn ~50%** cả input/output, chỉ dùng được cho tác vụ không cần real-time — khớp trực tiếp với use case "audit report định kỳ" (`wallets/:address/audit`, TTL 24h) — đáng cân nhắc chuyển audit sang batch nếu latency vài phút chấp nhận được.
- Context caching giảm ~90% giá input nhưng cộng thêm phí lưu trữ $1/1M token/giờ — chỉ lợi nếu cùng context (dữ liệu ví/token) được tái dùng nhiều lần trong 1 giờ (ví dụ nhiều lượt hỏi liên tiếp trong Wallet Chat), không lợi cho các lệnh gọi audit/analysis đơn lẻ.
- `gemini-2.5-flash` (dùng cho wallet audit, wash-trading, token-ai-chat mặc định) đắt hơn `gemini-2.5-flash-lite`/`gemini-3.1-flash-lite` khoảng 3-8 lần cả input lẫn output — đây là đòn bẩy tiết kiệm chi phí Nhóm 3 thật sự cho Gemini: cân nhắc hạ các tác vụ ít đòi hỏi chất lượng cao (ví dụ swap-summary, chart-news-summary) xuống flash-lite nếu đang dùng flash, thay vì chỉ tối ưu TTL.

Ghi chú retry/backoff chung: `server/src/util/rate-limit.ts` (`rlFetch`) áp dụng cho Helius/Birdeye/Moralis/Zerion/Mobula/CoinGecko — retry 429/5xx theo exponential backoff, tôn trọng header `Retry-After`. **Gemini, Brave Search, n8n, Resend không có cơ chế này** — chỉ try/catch đơn giản.

Quyết định cần chốt ở nhóm này:
- [x] **ACMS: KHÔNG tính vào cost model ở Nhóm 4** — hiện chưa chạy thật (`WALLET_USE_ACMS=false`, Redis không `.connect()`), tính chi phí trên số hiện tại (không có coalescing) an toàn hơn giả định một hệ thống chưa bật. Sửa Redis + bật ACMS cho luồng wallet là **stretch goal riêng**, tách khỏi công thức chi phí chính vì effort bật nó chưa được ước lượng — ghi vào backlog kỹ thuật ở Nhóm 7 nếu đội muốn làm tiếp sau báo cáo.
- [x] **Đã xác nhận (2026-07-13, đội)**: Birdeye và Zerion đều đang dùng **Free**. Với Zerion, limiter trong code (1 req/s) an toàn nên giữ nguyên. Với Birdeye: đã verify xong endpoint coverage — "giới hạn 3 endpoint" là thông tin lỗi thời trên trang pricing, bảng accessibility mới nhất cho free tier 20+ endpoint và cả 8 endpoint Birdeye Yoca dùng đều được phép, **không có rủi ro endpoint**. Việc thật cần làm chỉ còn 1: sửa `util-birdeye.ts:92-98` từ 15 req/s về đúng 1 req/s (bug cấu hình, rủi ro 429 ngay hiện tại, độc lập mọi mốc MAU) — **không cần nâng Lite** vì verify lại mục 2.2 cho thấy Birdeye không hề dùng ở Token Detail, tải thật thấp hơn nhiều so với giả định ban đầu.
- [x] Research giá + rate limit gói trả phí gần nhất của từng provider từ nguồn chính thức, ghi ngày truy cập — xem bảng trên (Helius $49, Birdeye $39, Moralis $49, Zerion $149, Mobula $50, CoinGecko $35). CoinMarketCap đã loại khỏi cost model.
- [x] Với Mobula: gói Start-up ($50/tháng, 30 RPS) đủ để chạy song song 10 trang offset gần như đồng thời thay vì tuần tự 1 req/s (~10 giây tuần tự → dưới 1 giây song song) — xem ghi chú ở bảng trên.

## 5. Nhóm 4 — Kịch bản theo quy mô người dùng

**Toàn bộ số trong mục này là GIẢ ĐỊNH minh hoạ** (đúng như đã chốt với user: chưa có analytics/log thật). Mục tiêu không phải dự đoán chính xác traffic, mà là chứng minh công thức suy luận chi phí từ Nhóm 1-3 là có căn cứ, để slide không bị đánh giá "bịa số" — khi có số liệu thật, chỉ cần thay input ở bước 5.1, phần công thức/kết luận giữ nguyên.

### 5.1 Giả định đầu vào

**Đã cập nhật theo verify lần 2 ở mục 2.2** — thêm 3 dòng (CoinGecko sidecar cho wallet, Mobula cho token holders, Birdeye nền tảng cố định) mà bảng gốc bỏ sót.

| Biến | Giá trị giả định | Ghi chú |
|---|---|---|
| Mốc MAU | 300 / 3.000 / 30.000 | 3 mốc cách nhau 10 lần, từ quy mô beta đến quy mô "đã có traction" |
| Session/user/tháng | 8 | ~2 lần/tuần |
| % session vào Wallet Detail | 60% | tính năng lõi |
| Hệ số ví unique/user | ×1.3 | phần lớn user chỉ xem ví mình, một số xem thêm ví khác qua search |
| % session vào Token Detail | 70% | hành vi lướt token |
| Cache-hit wallet data (Helius/Mobula, TTL 1h) | 90% miss (10% hit) | vì ví chủ yếu chỉ 1 user xem, các session cách nhau thường quá 1h nên phần lớn là cache miss — khớp kết luận mục 2.2/3.4 |
| Cache-hit token data (CoinGecko/Mobula) | 70% hit (30% miss) | nhiều user cùng xem token phổ biến/trending, cache shared phát huy tác dụng thật |
| % ví mở thêm tab lịch sử theo token (Zerion) | 30% của lượt xem ví | Zerion chỉ gọi khi mở tab này |
| % lượt xem ví cần CoinGecko/Moralis sidecar | 50% của lượt xem ví (miss) | metadata token thiếu symbol/logo trong `wallets/portfolio` — mục 2.2 |
| % lượt xem ví cần Birdeye (net-worth/chart) | 20% của lượt xem ví (miss) | mở tab balance chart |

### 5.2 Số external request/tháng theo provider (external data, chưa gồm Gemini) — đã tính lại theo mục 2.2 verify lần 2

Công thức: `request/tháng = MAU × session/tháng × %vào trang × hệ số × %cache-miss × số call/lượt`. Token visit giờ tạo **5 call CoinGecko** (chart+market+meta+pools+trades, không phải 3 — pools/trades trước ghi nhầm Birdeye) **+ 1 call Mobula** (holders, trước ghi nhầm Birdeye/Moralis) thay vì Birdeye. Wallet visit thêm **0,5 call CoinGecko/Moralis** (sidecar) và **0,2 call Birdeye** (net-worth/chart).

| Mốc | Wallet visits (miss) | Token visits (miss) | Helius (×2/visit ví) | Mobula (×4/visit ví + ×1/visit token) | Zerion (×0,3/visit ví) | CoinGecko (×0,5/visit ví + ×5/visit token) | Birdeye (×0,2/visit ví + nền ~1.000/tháng) | Moralis (×0,3/visit token, fallback) |
|---|---|---|---|---|---|---|---|---|
| 300 MAU | 187 | 504 | 374 | 1.252 | 56 | 2.614 | 1.037 | 151 |
| 3.000 MAU | 1.872 | 5.040 | 3.744 | 12.528 | 562 | 26.136 | 1.374 | 1.512 |
| 30.000 MAU | 18.720 | 50.400 | 37.440 | 125.280 | 5.616 | 261.360 | 4.744 | 15.120 |

### 5.3 Đối chiếu rate limit/credit free tier (số từ Nhóm 3, mục 4.1) → giải pháp theo mốc

| Mốc | Helius | Mobula | Zerion | CoinGecko | Birdeye | Moralis | Kết luận |
|---|---|---|---|---|---|---|---|
| 300 MAU | Free đủ | Free đủ (1.252 ≪ 10.000 credit) | Free đủ | Free đủ (2.614 ≪ 10.000 credit) | **Free đủ sau khi sửa đúng 1 req/s** (1.037/tháng ≈ 35/ngày, quá thấp so với ngưỡng 1 req/s dàn đều trong ngày) | Free đủ | **Chưa cần nâng gói nào** — chỉ cần sửa bug limiter Birdeye (mục 4), không tốn thêm tiền |
| 3.000 MAU | Free đủ | **Vượt free 10.000 credit** (12.528) → cần **Start-up $50/tháng** | Free đủ | **Vượt free 10.000 credit** (26.136) → cần **Basic $35/tháng** | Free vẫn đủ (1.374/tháng) | Free đủ | **Nâng Mobula + CoinGecko**, tổng thêm ≈ **$85/tháng** |
| 30.000 MAU | Nên nâng **Developer $49/tháng** (margin RPS khi nhiều user đồng thời) | **Vượt xa free** → cần **Start-up $50/tháng**, nhưng 125.280 request **sát/vượt nhẹ trần 125.000 credit của Start-up** — cần theo dõi sát, có thể phải hỏi Mobula gói cao hơn | Free đủ (Zerion vẫn provider có free tier thấp nhất nhóm, theo dõi khi scale tiếp) | Vượt cả Basic (261.360 > 100.000) → cần **Analyst $129/tháng** | Free vẫn đủ (4.744/tháng ≈ 158/ngày, xa dưới ngưỡng 1 req/s dàn đều) | Free đủ (15.120 ≪ 1.200.000 CU) | **3 provider cần gói trả phí** (Helius + Mobula + CoinGecko — **không phải Birdeye**), tổng ≈ $49+$50+$129 = **$228/tháng** |

### 5.4 Chi phí Gemini AI (theo quota/tier, tách riêng khỏi external data)

Chi phí/lượt gọi (ước lượng token input/output theo loại tác vụ × giá Gemini ở mục 4.1 — token count là ước lượng hợp lý, không đo thật):

| Tính năng AI | Model | Ước lượng token in/out | Chi phí/lượt gọi (USD) |
|---|---|---|---|
| Ask Yoca AI | `gemini-2.5-flash-lite` | 1.500 / 600 | $0,00039 |
| General AI Chat | `gemini-3.1-flash-lite` | 2.500 / 700 | $0,00168 |
| Wallet AI Analysis | `gemini-2.5-flash` | 3.000 / 1.800 | $0,00540 |
| Wash Trading AI | `gemini-2.5-flash` | 2.000 / 1.200 | $0,00360 |
| Volatility Summary | `gemini-2.5-flash-lite` | 1.200 / 400 | $0,00028 |
| Token Chart News Summary | `gemini-2.5-flash-lite` | 1.000 / 400 | $0,00026 |

Gemini rẻ theo từng lượt gọi (dưới 1 cent) — chi phí AI thật sự phụ thuộc **khối lượng gọi**, không phải giá/lượt. Giả định thêm: 20% MAU có dùng ít nhất 1 tính năng AI/tháng, trung bình 15 lượt gọi/user dùng AI/tháng (trải đều 6 tính năng), chi phí bình quân gia quyền ≈ $0,003/lượt (nghiêng về các tính năng chat/lite có quota cao hơn):

| Mốc | User dùng AI (20% MAU) | Lượt gọi AI/tháng (×15) | Chi phí AI ước tính/tháng |
|---|---|---|---|
| 300 MAU | 60 | 900 | ≈ $2,7 |
| 3.000 MAU | 600 | 9.000 | ≈ $27 |
| 30.000 MAU | 6.000 | 90.000 | ≈ $270 |

### 5.5 Tổng hợp chi phí external + AI theo mốc (USD/tháng)

| Mốc MAU | Chi phí external data (paid tier) | Chi phí Gemini AI | **Tổng chi phí giả định/tháng** |
|---|---|---|---|
| 300 | $0 (free tier đủ, chỉ cần sửa bug limiter Birdeye — không tốn tiền) | ≈ $3 | **≈ $3/tháng** |
| 3.000 | ≈ $85 (Mobula Start-up $50 + CoinGecko Basic $35) | ≈ $27 | **≈ $112/tháng** |
| 30.000 | ≈ $228 (Helius $49 + Mobula $50 + CoinGecko $129 — Birdeye vẫn free) | ≈ $270 | **≈ $498/tháng** |

Số này là input trực tiếp cho công thức lợi nhuận ở Nhóm 6 — không tính chi phí hạ tầng khác (hosting server, DB Postgres, domain...) vì nằm ngoài phạm vi "chi phí data/AI" thầy yêu cầu; nếu slide cần lợi nhuận ròng đầy đủ, cộng thêm dòng chi phí hạ tầng cố định ước lượng riêng.

## 6. Nhóm 5 — Giả thuyết AI in-house (chạy song song, không chặn 1-4)

Đây là **giả thuyết cho tương lai**, không phải cam kết migrate — mục tiêu là chứng minh nhóm đã suy nghĩ nghiêm túc về đánh đổi chi phí/kiểm soát dữ liệu, đúng yêu cầu của thầy. Nguồn: research 2026-07-13, số nào là ước lượng suy luận (không có trích dẫn giá trực tiếp) được đánh dấu **[ƯỚC LƯỢNG]**.

### 6.1 Model OSS ứng viên

| Ứng viên | Kích thước/license | Năng lực so với Gemini Flash-Lite | Phù hợp cho |
|---|---|---|---|
| **Qwen3-8B / Qwen3.5-9B** | 8-9B, Apache 2.0 | Tương đương hoặc nhỉnh hơn Gemini 2.5 Flash-Lite trên benchmark chung | Fit tốt nhất cho phân tích ví có cấu trúc + chat, license mở, host rẻ |
| **DeepSeek-R1-Distill (Qwen 14B/32B)** | 14-32B, MIT | Reasoning từng bước tốt hơn model instruct nhỏ thuần | Hợp cho báo cáo audit ví dạng suy luận nhiều bước |
| **Llama-3.3-70B-Instruct** | 70B, Meta community license | Tiệm cận Gemini 2.5 **Flash** (không phải Flash-Lite) | Chất lượng cao nhất nhưng cần GPU lớn, khả năng dư thừa so với nhu cầu hiện tại |

Nguồn: [Together AI Pricing](https://www.together.ai/pricing), [Hugging Face — Open-Source LLMs 2026](https://huggingface.co/blog/daya-shankar/open-source-llms) — truy cập 2026-07-13.

### 6.2 So sánh chi phí host (giả định 50.000-200.000 lượt gọi/tháng, khớp khoảng Milestone B-C ở mục 5.4)

**Giả định token/lượt gọi [ƯỚC LƯỢNG]**: 1.000 input + 300 output ≈ 1.300 token/lượt — dùng để so sánh bậc độ lớn, không phải số đo thật từ traffic Yoca.

| Hướng | Provider/GPU | Chi phí | Ghi chú |
|---|---|---|---|
| Serverless pay-per-token (model OSS 7-9B) | Together AI (Llama-3.1-8B/Qwen3.5-9B) | ~$12-13/tháng ở 50k lượt, ~$47-52/tháng ở 200k lượt | Ngang hoặc rẻ hơn Gemini Flash-Lite một chút |
| Serverless pay-per-token | Groq (Llama-3.1-8B, LPU) | ~$4/tháng ở 50k, ~$15/tháng ở 200k | Rẻ nhất trong nhóm serverless |
| **Đối chiếu: Gemini 2.5 Flash-Lite (đang dùng)** | — | ~$11/tháng ở 50k, ~$44/tháng ở 200k | |
| **Đối chiếu: Gemini 3.1 Flash-Lite (đang dùng)** | — | ~$35/tháng ở 50k, ~$140/tháng ở 200k | |
| GPU thuê rời (neocloud) | RunPod L4 24GB | ~$285/tháng cố định (24/7) | Đủ sức chạy vượt xa 200k lượt/tháng — dư thừa công suất ở quy mô hiện tại |
| GPU thuê rời | RunPod A100 80GB | ~$1.014/tháng cố định | Chỉ hợp lý ở quy mô lớn hơn nhiều |
| Cloud VM GPU (upper-bound) | AWS g5.xlarge (A10G) | ~$734/tháng | Đắt hơn neocloud cùng loại GPU — chỉ dùng làm mốc so sánh trần trên |

Nguồn: [Together AI](https://www.together.ai/pricing), [Groq Pricing](https://groq.com/pricing), [RunPod Pricing](https://www.runpod.io/pricing), [AWS g5.xlarge](https://instances.vantage.sh/aws/ec2/g5.xlarge) — truy cập 2026-07-13.

### 6.3 Kết luận breakeven [ƯỚC LƯỢNG/suy luận, không phải số trích dẫn]

Ở khối lượng 50.000-200.000 lượt/tháng (khớp Milestone B-C), **tự host KHÔNG rẻ hơn** trả theo token: GPU thuê rẻ nhất (~$285/tháng) là chi phí cố định bất kể dùng bao nhiêu, trong khi Gemini Flash-Lite/serverless OSS chỉ tốn $4-140/tháng ở cùng khối lượng — chênh lệch 5-100 lần nghiêng về API trả-theo-token. Điểm hoà vốn ước tính rơi vào khoảng **1,3-4,5 triệu lượt gọi/tháng**, tức cao hơn quy mô Milestone C (30.000 MAU, ~90.000 lượt AI/tháng ở mục 5.4) khoảng 15-50 lần.

**Kết luận cho slide**: tự host AI in-house là hướng đi hợp lý về mặt lý thuyết khi traffic tăng 10-100 lần so với hiện tại, hoặc khi ưu tiên kiểm soát dữ liệu/tránh phụ thuộc giá nhà cung cấp hơn là tối ưu chi phí ngắn hạn — không phải vì tiết kiệm chi phí ở quy mô hiện tại. Đây đúng là khung trả lời câu hỏi của thầy: nhóm có giả thuyết rõ ràng, có số liệu so sánh, nhưng không cam kết migrate ngay vì chưa có lợi ích kinh tế ở quy mô này.

Lưu ý khi đưa vào slide: giả định token/lượt gọi (1.000 in/300 out) là ước lượng placeholder — nếu có số đo thật từ Gemini usage log, nên tính lại vì output dài (báo cáo audit) khác nhiều so với 1 câu trả lời chat ngắn, ảnh hưởng đáng kể tới điểm hoà vốn.

## 7. Nhóm 6 — Pricing & slide business model

Tỷ giá giả định dùng xuyên suốt mục này: **1 USD ≈ 26.000 VND** (giả định thời điểm viết doc, đội nên cập nhật tỷ giá thật khi chốt slide).

### 7.1 Bảng tier — chỉ ghi phần khác biệt (yêu cầu bắt buộc của thầy)

Dùng đúng 4 tier có thật trong code (`subscription-entitlements.service.ts`) + quota AI thật (`AI_FEATURE_RATE_LIMIT_PLAN_2026-06-23.md`):

| | **Free** | **Lite** — thêm/khác so với Free | **Plus** — thêm/khác so với Lite | **Pro** — thêm/khác so với Plus |
|---|---|---|---|---|
| Giá/tháng | 0đ | 999.000đ (~$39) | **1.990.000đ (~$79)** 🔧 | **3.990.000đ (~$149)** 🔧 |
| Giá/năm (toggle, ≈2 tháng miễn phí) | 0đ | 9.990.000đ/năm (≈832.500đ/tháng) | **19.900.000đ/năm (≈1.658.000đ/tháng)** 🔧 | **39.900.000đ/năm (≈3.325.000đ/tháng)** 🔧 |
| Ask Yoca AI / General AI Chat / Volatility Summary / Token News Summary | 5 / 5 / 10 / 5 lượt/ngày | **20 / 20 / 25 / 20** lượt/ngày | **50 / 50 / 50 / 50** lượt/ngày (tất cả bằng nhau) | **100 / 100 / 100 / 100** lượt/ngày |
| Wallet AI Analysis / Wash Trading AI | Khoá | Khoá (không đổi so với Free) | **Mở khoá**, 50 lượt/ngày | **100** lượt/ngày |

Toggle tháng/năm: áp dụng công thức năm = 10× giá tháng (tương đương 2 tháng miễn phí) — mẫu phổ biến, dễ hiểu, không cần bảng giá riêng phức tạp.

### 7.2 Giá có suy ra được từ chi phí không? Và có hợp lý với thị trường không?

**Phần 1 — chi phí (đã có sẵn từ Nhóm 4-5)**: kết luận quan trọng là **chi phí data/AI không phải yếu tố quyết định giá**. Chi phí AI/user/tháng theo tier (từ mục 5.4, ước lượng utilization 10-35% quota) chỉ chiếm 1-4,4% giá bán cũ — biên lợi nhuận gộp theo chi phí kỹ thuật cực cao (>95%) ở mọi mức giá hợp lý. Nghĩa là **chi phí không phải là ràng buộc** — giá tier phải neo theo giá trị cảm nhận và mặt bằng thị trường, không phải chi phí kỹ thuật.

**Phần 2 — đối chiếu mặt bằng thị trường (research 2026-07-13, đã trả lời câu hỏi ⏳ trước đó)**: khảo sát giá các tool crypto wallet-tracker/on-chain analytics thật đang bán cho user cá nhân (không phải gói doanh nghiệp):

| Đối thủ | Giá Pro/tháng | Ghi chú |
|---|---|---|
| Nansen Pro | $49-69 | Vừa **cắt giá từ tier "Pioneer" $129/tháng xuống còn $49-69** (giảm 62%) vì tier ~$130 không cạnh tranh nổi — tín hiệu thị trường trực tiếp |
| Dune Pro | $49-69 | |
| LunarCrush Premium | $49 | |
| CryptoQuant Advanced/Pro | $29-99 | |
| CoinStats/Delta/CoinTracker (portfolio tracker thuần, ít AI) | $9-14 | |
| Flipside Plus | $349 | Duy nhất gần mốc cao — nhưng đây là **gói team/tổ chức** (AI agent giám sát on-chain, tích hợp Slack), không phải cá nhân |

Nguồn: trang pricing/academy chính thức của từng nhà cung cấp, truy cập 2026-07-13.

**Kết luận**: mặt bằng thị trường thật cho sản phẩm cá nhân/prosumer nằm trong khoảng **$30-100/tháng**; chỉ gói team/enterprise mới vượt $300. Giá cũ của Yoca (Lite $39 hợp lý, nhưng **Plus $199 và Pro $499 nằm ngoài dải giá mọi đối thủ khảo sát được**, đúng vào vùng giá Nansen vừa khai tử vì ế) — đây chính là phần "mơ hồ" thầy cảm nhận: không phải vì thiếu căn cứ chi phí (mục Phần 1 đã chứng minh dư), mà vì **bản thân mốc giá lệch khỏi thị trường**, không có đối thủ tham chiếu nào ở gần $199-499/tháng cho sản phẩm cá nhân.

### 7.2.1 Đề xuất giá Plus/Pro mới (đã cập nhật vào bảng 7.1)

| Tier | Giá cũ | Giá đề xuất mới | Căn cứ |
|---|---|---|---|
| Lite | $39/tháng | **Giữ nguyên $39** | Đúng dải giá Nansen/Dune/LunarCrush Pro ($49-69) — thậm chí rẻ hơn, không cần đổi |
| Plus | $199/tháng | **$79/tháng (1.990.000đ)** | Ngang trên CryptoQuant Pro ($99), trên Nansen/Dune Pro ($49-69) — hợp lý vì Plus là tier **mở khoá** Wallet AI Analysis + Wash Trading AI (tính năng AI mà Nansen/Dune/LunarCrush không có), xứng đáng cao hơn dải phổ thông nhưng vẫn trong biên độ thị trường prosumer |
| Pro | $499/tháng | **$149/tháng (3.990.000đ)** | ~2× Plus, phản ánh đúng khác biệt duy nhất hiện tại (quota AI gấp đôi, xem mục 7.1) — thấp hơn nhiều Flipside Plus ($349, vốn dành cho team) vì Pro của Yoca hiện chưa có tính năng team/seat riêng |

Tiến trình giá mới **39 → 79 → 149** (mỗi bậc ~2×) nhất quán hơn hẳn tiến trình cũ **39 → 199 → 499** (bậc 1 nhảy 5×, bậc 2 nhảy 2,5× — không theo quy luật nào, dấu hiệu "tạo đại" thầy nêu). Chi phí sàn theo giá mới vẫn rất an toàn: Plus ~$7,89/~$79 ≈ **10%** giá bán, Pro ~$22/~$149 ≈ **14,8%** giá bán — margin gộp 85-90%, mức COGS/giá bán này thực tế và dễ bảo vệ hơn con số <5% của giá cũ (margin quá cao so với giá bán thấp thường là dấu hiệu định giá chưa nghiên cứu, không phải điểm mạnh).

**Đã xác nhận (2026-07-13, đội): đồng ý giá đề xuất mới $79/$149.** Giá mới **chưa cập nhật vào Stripe** (nằm ngoài phạm vi đã chốt không đụng code/billing) — cần đội tự áp dụng vào billing.

### 7.3 Dòng tiền giả định theo 3 mốc MAU (Nhóm 4)

**Giả định tỷ lệ trả phí (payer conversion)**: Free 92%, Lite 5%, Plus 2%, Pro 1% — mức 8% tổng trả phí, trong khoảng benchmark freemium SaaS phổ biến (2-10%), **ghi rõ đây là giả định, chưa có số đo thật**. **Đã xác nhận (2026-07-13, đội): giữ nguyên giả định này**, không có số đo thật để thay.

**Đã tính lại theo giá Plus/Pro đề xuất mới ở mục 7.2.1** (999.000 / 1.990.000 / 3.990.000đ thay vì 999.000 / 4.990.000 / 12.990.000đ):

| Mốc MAU | User trả phí (Lite/Plus/Pro) | Doanh thu/tháng (VND) | Chi phí data+AI/tháng (từ mục 5.5, quy đổi VND) | Lợi nhuận gộp giả định/tháng |
|---|---|---|---|---|
| 300 | 15 / 6 / 3 | ≈ 38.900.000đ (~$1.496) | ≈ 78.000đ (~$3) | ≈ 38.800.000đ |
| 3.000 | 150 / 60 / 30 | ≈ 388.950.000đ (~$14.960) | ≈ 2.912.000đ (~$112) | ≈ 386.000.000đ |
| 30.000 | 1.500 / 600 / 300 | ≈ 3.889.500.000đ (~$149.596) | ≈ 12.948.000đ (~$498) | ≈ 3.876.500.000đ |

**Lưu ý bắt buộc khi đưa vào slide** (không được bỏ khi trình bày):
- Đây là **lợi nhuận GỘP tính riêng theo chi phí data/AI** (đúng phạm vi thầy yêu cầu "nguồn gốc chi phí"), **chưa trừ**: chi phí hạ tầng server/DB, nhân sự, marketing/CAC, phí cổng thanh toán (Stripe/Solana). **Đã xác nhận (2026-07-13, đội): giữ đúng phạm vi này, không cộng dồn chi phí hạ tầng/nhân sự/marketing** — cost model chỉ giới hạn ở data/AI theo đúng yêu cầu gốc của thầy.
- Tỷ lệ trả phí 8% và giá tier ở 7.1 là hai biến giả định lớn nhất quyết định toàn bộ bảng này — nếu payer conversion thực tế thấp hơn (ví dụ 2%), lợi nhuận gộp giảm theo tỷ lệ tương ứng nhưng **vẫn dương rất lớn** vì chi phí data/AI quá nhỏ so với doanh thu ở mọi mốc — đây là insight chính nên nêu trong slide thay vì chỉ đưa 1 con số lợi nhuận.

### 7.4 Nguồn vốn (giả định, cho slide)

**Đã xác nhận (2026-07-13, đội)**: hiện tại vận hành **hoàn toàn free ở mức sinh viên** — không có bất kỳ khoản tài trợ/gọi vốn nào, toàn bộ hạ tầng/API đang chạy trên gói free. Slide nên trình bày trung thực đúng thực trạng này: **tự vận hành (bootstrap) 100% bằng công sức nhóm**, 0 vốn ngoài, trong giai đoạn Milestone A (300 MAU). Nếu slide cần kịch bản "có vốn" để minh hoạ hướng scale, có thể đóng khung là giả thuyết gọi vốn hạt giống (seed) ở ranh giới Milestone A→B để trả chi phí nâng gói provider (mục 5.3) khi cần — **ghi rõ đây là kịch bản minh hoạ, nhóm chưa gọi vốn thật và hiện không được tài trợ**.

## 8. Checklist các biến còn thiếu (tổng hợp CẦN ĐIỀN)

Đã điền trong phiên 2026-07-13 (research + tính toán, chưa đụng code/UI/Stripe theo đúng phạm vi đã chốt):
- [x] TTL cuối cùng cho từng nhóm dữ liệu — mục 3.4 (kết luận: giữ nguyên phần lớn, 2 hành động thật là sửa comment sai + thêm cache cho wash-trading Gemini verdict).
- [x] Giá + rate limit gói trả phí gần nhất của Helius/Birdeye/Moralis/Zerion/Mobula/CoinGecko/Gemini — mục 4, 4.1 (có nguồn + ngày truy cập, kèm 2 cảnh báo mâu thuẫn số liệu ở Birdeye và Zerion).
- [x] Quyết định ACMS — mục 4 (không tính vào cost model, để làm stretch goal riêng).
- [x] Mốc quy mô người dùng giả định + số request/chi phí suy ra — mục 5 (3 mốc, có công thức + số).
- [x] Model OSS ứng viên + chi phí host + kết luận breakeven — mục 6.
- [x] Giá tier theo tháng/năm + tỷ giá USD/VND giả định + P&L 3 mốc — mục 7.
- [x] Trace đầy đủ trang Wash-trading — mục 2.4/2.2 (phát hiện cost leak: Gemini verdict không cache).

Vẫn còn ⏳ CẦN ĐIỀN, không suy ra được từ source code hay research chung — cần đội tự làm:
- [x] Xác nhận plan Birdeye/Zerion — **cả hai đều Free** (đội xác nhận 2026-07-13). Phát hiện quan trọng đi kèm: Birdeye limiter trong code (15 req/s) đang set sai so với free thật (1 req/s) — xem mục 4/5.3 để biết hành động cần làm.
- [x] Verify endpoint Birdeye — **đã xong, không có rủi ro**. "Giới hạn 3 endpoint" là thông tin lỗi thời trên trang pricing; bảng accessibility mới nhất (hiệu lực 26-Nov-2025) cho free tier 20+ endpoint. Đồng thời verify lại mục 2.2 phát hiện Birdeye **không hề dùng ở Token Detail** (3 dòng holders/pools/pool-trades trong bảng gốc ghi nhầm Birdeye, thực ra là Mobula/CoinGecko) — 8 endpoint Birdeye thật sự dùng đều nằm trong free tier. Kết luận: chỉ cần sửa `util-birdeye.ts` về đúng 1 req/s, không cần nâng Lite (mục 4/5.3).
- [x] Đối chiếu giá tier với mặt bằng đối thủ cạnh tranh thực tế — mục 7.2 (Nansen/Dune/LunarCrush Pro $49-69, CryptoQuant $29-99, Flipside team-tier $349). Kết luận: Lite $39 hợp lý, Plus/Pro cũ ($199/$499) nằm ngoài dải giá mọi đối thủ — đề xuất giảm còn $79/$149 ở mục 7.2.1. **Giá mới chưa áp dụng vào Stripe**, cần đội tự quyết và tự cập nhật billing nếu đồng ý.
- [x] Tỷ lệ trả phí (payer conversion) 8% ở mục 7.3 — **đội xác nhận (2026-07-13): giữ nguyên giả định**, chưa có số đo thật của Yoca để thay.
- [x] Chi phí hạ tầng server/DB/nhân sự/marketing — **đội xác nhận (2026-07-13): giữ đúng phạm vi data/AI**, không cộng dồn vào P&L mục 7.3.
- [x] Nguồn vốn — **đội xác nhận (2026-07-13): vận hành 100% free mức sinh viên, không có tài trợ/gọi vốn nào** — mục 7.4 đã cập nhật đúng thực trạng.
- [x] TTL wallet 1h + bug comment identity — **đội xác nhận (2026-07-13)**: TTL 1h và giá trị identity 6h/2h đều là chủ đích (tránh hết quota free tier), không phải cần tính lại; đồng ý thêm nút force-refresh thủ công thay vì rút ngắn TTL mặc định (mục 3.1, 3.4).
- [x] Giá Plus/Pro đề xuất mới $79/$149 — **đội xác nhận đồng ý (2026-07-13)** (mục 7.2.1), còn thiếu bước áp dụng vào Stripe (ngoài phạm vi doc).
- [x] Breakeven AI in-house (mục 6.3) — **đội xác nhận (2026-07-13): giữ giả định 1.000/300 token mỗi lượt gọi**, không chắc đo được log thật nên không đổi sang số đo thật.

## 9. Note dựng slide (outline, chưa phải slide thật)

Ghi lại 2026-07-13 để bạn kia dựng slide PowerPoint/Google Slides thật mà không cần đọc lại toàn bộ doc để tự tổng hợp. Mỗi gạch đầu dòng trỏ đúng mục/số đã có sẵn ở trên — **không bịa số mới khi dựng slide**, nếu cần số nào không có ở đây thì quay lại đúng mục nguồn.

1. **Vấn đề / phản biện của thầy** — 4 gạch đầu dòng từ mục 0: thiếu toggle tháng/năm, tier lặp lại full feature list, thiếu slide business model rõ nguồn vốn/dòng tiền/lợi nhuận giả định, thiếu giả thuyết AI in-house.
2. **Bản đồ chi phí + provider đang dùng** — bảng provider mục 2.3 (CoinGecko/Birdeye/Helius/Moralis/Mobula/Zerion/Gemini/Brave), kết luận chính: CoinGecko + Mobula tải nặng nhất thật sự, Birdeye gần như không dùng ở Token Detail (mục 2.2).
3. **TTL & đòn bẩy provider** — kết luận mục 3.4 (giữ phần lớn TTL, 2 việc thật đã làm: sửa comment TTL + thêm cache wash-trading) + bảng rate limit/giá gói mục 4 (chỉ 3 provider cần trả phí ở mốc cao nhất: Helius/Mobula/CoinGecko, Birdeye vẫn free).
4. **3 mốc MAU + chi phí** — bảng 5.5 (300/3.000/30.000 MAU → $3/$112/$498 mỗi tháng), nhấn mạnh đây là traffic **giả định minh hoạ**, không phải số đo thật (ghi rõ trên slide).
5. **AI in-house hypothesis + breakeven** — mục 6.1-6.3: model ứng viên (Qwen3-8B/DeepSeek-R1-Distill/Llama-3.3-70B), so sánh chi phí host, kết luận breakeven ~1,3-4,5 triệu lượt gọi/tháng (cao hơn quy mô hiện tại 15-50 lần) — khung trả lời câu hỏi của thầy, không phải cam kết migrate.
6. **Bảng tier tháng/năm** — bảng 7.1 (diff-only), giá đã chốt: Free 0đ / Lite 999k / Plus 1.99tr / Pro 3.99tr mỗi tháng, toggle năm = 10× tháng. Kèm căn cứ đối thủ mục 7.2 (Nansen/Dune/LunarCrush/CryptoQuant).
7. **P&L 3 mốc + nguồn vốn** — bảng 7.3 (lợi nhuận gộp data/AI theo 3 mốc MAU), kèm 2 lưu ý bắt buộc không được bỏ (chỉ là lợi nhuận gộp, chưa trừ hạ tầng/nhân sự/marketing — mục 7.3) + mục 7.4 (vận hành 100% free mức sinh viên, không tài trợ, kịch bản seed chỉ là minh hoạ).
8. **Lưu ý / giới hạn phạm vi** — slide cuối liệt kê rõ: traffic là giả định, payer conversion 8% là giả định benchmark ngành, phạm vi P&L chỉ tính data/AI — tránh bị hỏi lại "số này lấy từ đâu" mà không có câu trả lời.

## 10. Verification khi hoàn tất

- [x] Đối chiếu lại bảng TTL/comment bug với source thật — **đã sửa xong** `WALLET_IDENTITY_KNOWN_TTL_MS`/`WALLET_IDENTITY_UNKNOWN_TTL_MS` comment tại `constants.ts:64-65` (nay ghi đúng 6h/2h).
- [x] Cross-check bảng tier + quota AI (mục 7.1) với `subscription-entitlements.service.ts` và `ai-usage.service.ts` — **khớp 100%** (Free 5/5/10/5, Lite 20/20/25/20, Plus 50/50/50/50 + mở khoá Wallet AI Analysis/Wash Trading AI, Pro 100/100/100/100 — đúng `AI_DAILY_LIMITS` dòng 22-59 của `ai-usage.service.ts`).
- [x] Không đưa số chi phí/lợi nhuận vào slide nếu dòng tương ứng trong mục 8 còn ⏳ CẦN ĐIỀN — **mục 8 nay đã 100% `[x]`**, không còn ràng buộc này.
- Không cần verify lại toàn bộ bảng provider (đã làm 2 lần trong phiên nghiên cứu, không có thay đổi code liên quan từ đó tới giờ).

### Code đã sửa trong phiên 2026-07-13 (Phần A của mục 8)

- `server/src/config/constants.ts:64-65` — sửa comment TTL sai (72h/24h → đúng 6h/2h), không đổi giá trị số.
- `server/.env` — cập nhật `STRIPE_PRICE_PLUS`/`STRIPE_PRICE_PRO` sang 2 price ID mới khớp giá đề xuất ở mục 7.2.1.
- `server/src/db/schema.ts`, `server/src/config/constants.ts`, `server/src/services/wash-trading-ai.service.ts` — thêm DB cache `wash_trading_verdict_cache` (key mint+timeframe+algorithm+language, TTL 4h) cho Gemini verdict wash-trading — vá cost leak nêu ở mục 2.2/3.4. Đã `db:push` bảng mới lên DB thật, đã verify tồn tại.
- `server/src/routes/wallets.ts`, `server/src/services/wallet/walletOverview.service.ts`, `server/src/services/wallet/walletPortfolio.service.ts`, `server/src/services/wallet/dtos/walletDataObjects.ts` — thêm `?force=1` bypass-cache cho `GET /wallets/overview` và `GET /wallets/portfolio` (pattern giống wallet audit). **Không** áp dụng cho `wallets/swaps/history`/`wallets/transfers/history` (cơ chế cache coverage-window khác hẳn, ngoài phạm vi).
- **Không sửa** Birdeye limiter (`util-birdeye.ts:92-98`) — đội quyết định không cần, giữ nguyên 15 req/s.
- `npx tsc --noEmit` sau toàn bộ thay đổi: 0 lỗi.
- Lưu ý phụ: `db:push` khi chạy còn đồng bộ luôn vài drift cũ giữa DB thật và `schema.ts` (thêm cột `alert_history`, FK `helius_webhook_addresses`, reorder PK vài bảng cache) — đều là thay đổi additive có sẵn trong code từ trước, không phải do phiên này gây ra, không mất dữ liệu.

### Sự cố migration khi thêm bảng wash-trading (đã xử lý, ghi lại để lưu ý về sau)

- `server/postgresdb/migrations/` bị `.gitignore` loại phần lớn file (chỉ track `0007`, `0009`, `meta/_journal.json`) — local checkout thiếu snapshot lịch sử `0000-0006`, `0008`.
- Vì vậy `npm run db:generate` (theo đúng quy trình generate+migrate ở A3 bước 5 ban đầu) sinh ra migration `0010_lucky_gunslinger.sql` **sai** — không chỉ thêm bảng mới mà `CREATE TABLE`/`CREATE TYPE` dump lại **toàn bộ schema**, vì local `meta` snapshot không biết các bảng đã tồn tại thật trên Supabase. Nếu chạy `db:migrate` với file này sẽ lỗi hàng loạt (trùng bảng) trên DB thật.
- Đã phát hiện trước khi chạy `db:migrate`, xoá file migration + snapshot sai, revert `meta/_journal.json` về đúng bản git gốc (`git checkout --`) — không có gì bị áp vào DB từ bước này.
- Hỏi lại user, chuyển hướng dùng `npm run db:push-force` (script có sẵn, introspect trực tiếp DB thật thay vì dựa vào local migration history) — an toàn hơn cho tình huống này.
- **Kết luận cho lần sau**: ở repo này, `db:generate` + `db:migrate` **không đáng tin** cho việc thêm bảng mới do local migration history không đầy đủ. Dùng `db:push` (hoặc `db:push-force` nếu cần bỏ qua prompt tương tác) để thay đổi schema thật — nhưng lưu ý lệnh này diff **toàn bộ** `schema.ts` với DB, có thể kéo theo cả các thay đổi/drift khác chưa liên quan đến việc đang làm (như đã xảy ra ở trên) — nên review kỹ output trước khi tin là chỉ có 1 thay đổi.
