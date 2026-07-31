# Thiết kế Benchmark và Observability cho Yoca

Ngày: 2026-07-17. Cập nhật quyết định gần nhất: 2026-07-19.

Trạng thái: thiết kế Batch 2 đã được duyệt; phần instrumentation cốt lõi của Batch 3 đã triển khai. Các transport adapter còn thiếu và benchmark diện rộng được theo dõi ở các batch tiếp theo.

Tài liệu nội bộ. Không đưa nguyên văn vào báo cáo hoặc slide.

## 0. Quyết định hiện hành

Phần này có ưu tiên cao hơn các đề xuất cũ còn sót lại trong tài liệu:

- Không tạo thêm `domain ID`, `cache ID` hoặc `storage ID` cho analytics.
- HTTP endpoint được định danh bằng Hono route template; external operation dùng `provider.svc.operation`.
- Service chỉ khai báo các fact hữu hạn qua `dataUsage.record(...)`; analytics không suy nguồn dữ liệu từ route hoặc tên bảng.
- PostgreSQL là data/result cache ưu tiên. Bốn in-memory data cache hiện có được chấp nhận như ngoại lệ hiện trạng nhưng bắt buộc khai báo `memory_result` để không làm sai cost analytics.
- SDK/client singleton, in-flight coalescing, rate-limit state và auth challenge không mặc nhiên được xem là data cache; phải phân loại riêng trước khi thay đổi.

## 1. Mục tiêu

Thiết kế một cơ chế đo có thể giữ lại trong đồ án mà không thay đổi hành vi nghiệp vụ. Hệ thống phải trả lời được:

- một hành trình người dùng gọi những endpoint nội bộ nào;
- mỗi endpoint phát sinh bao nhiêu external request theo provider;
- request dùng kết quả database, provider, kết quả trộn, forced refresh hay stale fallback;
- latency nằm ở HTTP server, provider hay database;
- retry và lỗi upstream xuất hiện ở đâu;
- cùng một tài nguyên stale nhận nhiều request đồng thời có gây cache stampede không;
- connection pool Supabase phản ứng thế nào khi concurrency tăng;
- dữ liệu nào đủ hoặc thiếu trên tập token/wallet rộng hơn dữ liệu demo.

Kết quả phải dùng được cho cost model, biểu đồ báo cáo và việc chẩn đoán sau phản biện.

## 2. Ngoài phạm vi của tài liệu thiết kế ban đầu

- Không triển khai đồng thời Grafana, OpenTelemetry và k6 chỉ để hoàn thiện bộ công cụ; mỗi công cụ chỉ được thêm khi batch đo tương ứng cần đến.
- Không thay đổi connection pool hoặc xóa cache trên database đang dùng để phản biện trong batch instrumentation.
- Không gọi hàng loạt provider khi chưa chốt dataset và quota dành cho benchmark.
- Không sửa các lỗi sản phẩm không liên quan được phát hiện trong quá trình rà source.
- Không công bố threshold chịu tải hoặc tỷ lệ cache hit trước khi có kết quả đo lặp lại được.

## 3. Hiện trạng đã xác nhận từ source

### 3.1 Request context

`server/src/middlewares/request-context.ts` đã dùng `AsyncLocalStorage` và cấp `requestId`. Đây là nền phù hợp để nối HTTP request với provider/cache event.

Điểm cần sửa ở Batch 3: context hiện lưu `c.req.path`, tức có thể chứa token/wallet address. Metrics cần route template ổn định, không dùng raw path làm label.

### 3.2 API call tracker

Repo đã có `server/src/services/tracking/apiCallTracker.*` với JSONL exporter và redaction. Không xây một tracker thứ hai độc lập.

Tracker hiện chưa đủ cho benchmark chung:

- provider type chỉ có Birdeye, Helius, Moralis, CoinMarketCap và unknown;
- chưa nhận diện CoinGecko, Mobula, Zerion, Gemini hoặc Brave;
- phần lớn call dùng `rlFetch` nhưng `rlFetch` chưa phát event tracker chung;
- record lưu URL, header, body preview và response data, mặc định có thể giữ đến 2 MB mỗi response;
- route đang là raw path;
- thiết kế thiên về debug payload/key hơn aggregate metrics;
- còn CoinMarketCap dù không thuộc provider vận hành của Yoca.

Kết luận: tái sử dụng request context, redaction và ý tưởng exporter; không dùng nguyên schema payload-heavy làm production observability.

### 3.3 Cache

Cache không có một abstraction thống nhất. Các service tự truy vấn bảng, kiểm tra `updatedAt`/`fetchedAt` và TTL. Không thể suy cache hit/miss chỉ từ số query database.

Inventory ngày 2026-07-19 phát hiện các data/result cache in-memory reachable cần được instrument và cân nhắc migrate riêng:

- exchange-rate response trong `routes/misc.ts`;
- Wallet Token AI Analysis response trong `walletTokenAnalysis.service.ts`;
- Wash Trading transaction input trong `wash-trading-ai.service.ts`;
- OpenGraph image lookup trong `rss-news.service.ts`.

Các `Map` dùng cho throttle, auth challenge, API-key usage state, temporary aggregation và in-flight coalescing không được gom vào danh sách trên. Chúng cần audit riêng nếu mục tiêu sau này là chạy nhiều process, nhưng không được dùng để biện minh cho thêm một data-cache storage mode.

### 3.4 External request

Đa số provider call đi qua `rlFetch` và Bottleneck, nên đây là điểm quan sát chung có giá trị. Tuy nhiên một số SDK hoặc AI client không đi qua `rlFetch`; chúng cần adapter event riêng.

`validateApiResult` và `rlFetch` quan sát hai việc khác nhau, nên không thay thế nhau:

- `rlFetch` nằm ở biên truyền tải, phù hợp để ghi provider, operation, attempt, HTTP status, latency, timeout và lỗi mạng;
- `validateApiResult` chạy sau khi có phản hồi, phù hợp để ghi kết quả kiểm tra schema và lỗi dữ liệu;
- SDK hoặc direct `fetch` không đi qua `rlFetch` phải có adapter cùng event contract;
- các event được nối bằng `requestId` và một `outboundCallId`, không lưu payload đầy đủ mặc định.

Không monkey-patch `globalThis.fetch` làm cơ chế chính ở server. Cách đó dễ bắt cả request ngoài phạm vi, khó gắn operation ổn định và có thể ảnh hưởng thư viện. Điểm mở rộng chính vẫn là `rlFetch`; adapter chỉ bổ sung cho các client đặc biệt.

### 3.5 Database

Drizzle dùng `postgres.js`. Mỗi server process đang cấu hình pool `max: 10`, `idle_timeout: 30`, `connect_timeout: 10`, `max_lifetime: 1800`. Local environment dùng Supavisor Session Pooler port 5432.

### 3.6 Client request

Client có một Hono RPC client tập trung trong `client/src/api/main.ts`, nhưng vẫn còn các nơi gọi raw `fetch`. `useGet` bọc phần lớn Hono call bằng SWR. Vì vậy bộ đếm ở tầng `fetch` chỉ thấy request HTTP thật; nó không thấy trường hợp component yêu cầu dữ liệu nhưng SWR trả ngay từ cache.

Thiết kế client cần tách ba lớp:

1. **Journey/feature context:** ghi trang, panel/tab, hành động kích hoạt và thời điểm UI sẵn sàng.
2. **Network adapter:** một `instrumentedFetch` được truyền vào Hono `hc` và dùng dần cho raw `fetch`, ghi request start/end/failure mà không lưu token hoặc dữ liệu nhạy cảm.
3. **External verifier:** Playwright lắng nghe network hoặc ghi HAR từ trước khi tạo trang, dùng để đối chiếu rằng adapter không bỏ sót request.

Không thay toàn bộ raw `fetch` trong một lượt. Batch 3 lập inventory, ưu tiên các journey deep benchmark rồi mới mở rộng.

## 4. Kiến trúc quan sát đề xuất

```text
HTTP request
   │
   ├── request context: requestId, journeyId, runId, phase
   │
   ├── data usage facts: db_result, memory_result, forced_refresh, stale_fallback
   │
   ├── provider event: provider, operation, attempt, status, latency
   │
   └── HTTP result: route template, status class, duration
          │
          ├── Prometheus-compatible aggregate metrics
          └── benchmark JSONL/JSON summary theo runId
```

Hai loại dữ liệu phải tách nhau:

- **Aggregate metrics:** counter/histogram có label cardinality thấp, phù hợp Grafana.
- **Benchmark artifact:** event theo `requestId`/`runId` để tính provider call trên từng hành trình; chỉ bật trong môi trường benchmark.

Không dùng Prometheus label cho token address, wallet address, query, API key fingerprint, request ID hoặc full URL.

## 5. Metric contract

Tên có thể điều chỉnh theo thư viện triển khai, nhưng semantics không đổi.

### 5.1 HTTP server

#### `yoca_http_requests_total`

Counter.

Labels:

- `route`: route template, ví dụ `/api/wallets/overview` hoặc `/api/tokens/:address/pools`;
- `method`;
- `status_class`: `2xx`, `4xx`, `5xx`;
- `journey`: tên journey benchmark hoặc `unclassified`.

#### `yoca_http_request_duration_seconds`

Histogram với cùng label cardinality như trên. Bucket chốt ở Batch 3 sau baseline; không tự chọn threshold để làm đẹp kết quả.

### 5.2 Provider

#### `yoca_provider_requests_total`

Counter.

Labels:

- `provider`: `coingecko`, `birdeye`, `helius`, `mobula`, `zerion`, `moralis`, `gemini`, `brave` hoặc `other`;
- `operation`: tên logic ổn định, không phải URL;
- `status_class`;
- `outcome`: `success`, `http_error`, `network_error`, `timeout`, `validation_error`;
- `attempt_kind`: `initial` hoặc `retry`.

#### `yoca_provider_request_duration_seconds`

Histogram theo `provider`, `operation`, `outcome`.

#### `yoca_provider_retries_total`

Counter theo `provider`, `operation`, `reason`; reason chỉ dùng enum cố định như `429`, `5xx`, `network`, `timeout`.

Không gắn key ID vào metric. Multi-key đã bị loại khỏi cost model.

### 5.3 Request data usage

Không tạo metric theo `domain`, tên cache, storage hoặc tên bảng. Request summary kết hợp hai nguồn fact đã được ghi rõ:

- service khai báo `db_result`, `memory_result`, `forced_refresh`, `stale_fallback`;
- transport ghi provider attempts theo `provider.svc.operation`.

Aggregate request ghép các nguồn có thật thành `db`, `memory`, `provider` hoặc tổ hợp như `db_provider`; request không có fact là `none`. Đây là phép kết hợp fact, không phải suy đoán service từ route. Route template vẫn là chiều phân tích chính.

`stale_fallback` và `forced_refresh` giữ thành cờ riêng. Không tuyên bố một cache-hit ratio chi tiết nếu service chưa cung cấp đủ bằng chứng; cost model ưu tiên số provider attempt thực tế theo route và operation.

### 5.4 Database và process

Không instrument mọi Drizzle query ngay ở Batch 3. Thu các số sau từ `pg_stat_activity`, Supabase Observability và benchmark runner:

- active/idle/waiting connections;
- connection timeout/error;
- total HTTP latency;
- throughput và error rate;
- database size/egress snapshot trước và sau sweep nếu có thể lấy an toàn.

Nếu cần query-level timing sau baseline, tạo batch riêng; không tự động log raw SQL và parameter.

## 6. Benchmark artifact contract

Mỗi lần chạy có manifest:

```json
{
  "runId": "yyyy-mm-dd_short-name_commit",
  "commit": "git-sha",
  "environment": "benchmark",
  "database": "supabase-benchmark",
  "startedAt": "ISO-8601",
  "phase": "cold|warm|stale|concurrent",
  "datasetVersion": "date-or-hash",
  "providerMode": "real|mock|mixed",
  "notes": "human-readable"
}
```

Mỗi resource trong artifact dùng ID nội bộ như `token_001`, `wallet_001`. Address nằm trong dataset snapshot có kiểm soát, không nằm trong metric label.

Mỗi kết quả endpoint tối thiểu gồm:

- `runId`, `journey`, `phase`, `requestId`;
- route template và HTTP status;
- duration;
- provider call count theo provider/operation;
- retry count;
- cache outcome theo cache;
- response classification: `data`, `empty_valid`, `unsupported`, `validation_error`, `upstream_error`, `internal_error`;
- payload size, không lưu nguyên payload mặc định.

Artifact đề xuất:

```text
benchmark-results/
  datasets/
    tokens-YYYY-MM-DD.json
    wallets-YYYY-MM-DD.json
  runs/
    <run-id>/
      manifest.json
      events.jsonl
      summary.json
      k6-summary.json
      charts/
```

Thư mục thật và `.gitignore` chốt ở Batch 3. Raw event có thể không commit; manifest, summary và chart đã redaction có thể commit làm bằng chứng.

## 7. Journey benchmark

Một page view không mặc định gọi mọi tab. Cost model phải nhân theo hành vi thực tế.

### J-MARKET-TRENDING

Endpoint chính:

- `GET /api/tokens/market-pools/trending?duration=...`.

Endpoint phụ nếu layout có MarketTicker:

- `GET /api/tokens/trending`;
- `GET /api/tokens/meta/:addresses`;
- `GET /api/tokens/markets/:addresses`.

Top, Gainers và New Pairs là journey riêng vì client chỉ fetch tab đang active.

### J-MARKET-TOP

- `GET /api/tokens/market-pools/top?sortBy=...`.

### J-MARKET-GAINERS

- `GET /api/tokens/market-pools/gainers`.

### J-MARKET-NEW

- `GET /api/tokens/market-pools/new-pairs`.

### J-TOKEN-OVERVIEW

Các call được client thực hiện cho token và pool đang chọn:

- `GET /api/tokens/details/:addresses`;
- `GET /api/tokens/:address/pools`;
- `GET /api/tokens/holders/:address`;
- `GET /api/tokens/holders/stats/:addresses`;
- `GET /api/tokens/markets/:addresses`;
- `GET /api/tokens/pools/trades/:poolAddress`;
- `GET /api/tokens/pools/:poolAddress?refresh=true`;
- chart route tương ứng timeframe.

Điểm cần xác minh trong Batch 3: client đang gửi `refresh=true` cho pool data; phải đo xem nó bypass cache và tạo external request ở mỗi page view hay không.

### J-WALLET-CORE

Chia Wallet thành core và panel; không cộng mọi tính năng thành một page view giả định.

Core candidate:

- `GET /api/wallets/overview?address=...&period=...`;
- `GET /api/wallets/portfolio?address=...`;
- `GET /api/wallets/:address/tokens`;
- `GET /api/tokens/meta/:addresses` sau khi có token list;
- `GET /api/tokens/markets/:addresses` sau khi có token list;
- `GET /api/wallets/analysis/winrate?wallets=...&period=...`;
- wallet tags chỉ tính trong authenticated journey.

Batch 3 phải đối chiếu network waterfall thực tế để xác nhận call nào tự chạy khi mount và call nào chỉ xuất hiện khi component/tab mở.

### J-WALLET-BALANCE

- `GET /api/wallets/portfolio?address=...`;
- `GET /api/charts/balance?wallets=...&timePeriod=...`;
- `GET /api/charts/balance/tokens?...` chỉ khi người dùng chọn token.

Tách total balance và per-token balance vì provider/coverage khác nhau.

### J-WALLET-ACTIVITY

- `GET /api/wallets/swaps/history/:address`;
- `GET /api/wallets/transfers/history/:address`.

Pagination page đầu và page tiếp theo là ca riêng. Filter/sort đọc DB không được tính như một provider refresh nếu coverage cache đã đủ.

### J-WALLET-PNL

- `GET /api/wallets/analysis/pnl?wallets=...&period=...`;
- `GET /api/wallets/analysis/winrate?wallets=...&period=...`.

Không đối chiếu trực tiếp con số PnL Mobula với nhãn Profitable Traders Birdeye nếu chưa chuẩn hóa timeframe và định nghĩa.

### J-WASH-HEURISTIC

- `GET /api/v1/wash-trading/analyze?mint=...` hoặc endpoint heuristic tương ứng.

Không gọi AI trong compatibility sweep mặc định.

### J-WASH-AI

- `POST /api/v1/wash-trading/ai-analyze` với user benchmark và quota kiểm soát.

Chỉ chạy trên deep subset, prompt/config cố định, tách cache hit/miss của verdict.

### J-AI-TOKEN và J-AI-WALLET

Chỉ chạy khi đã chốt user benchmark, quota và prompt. Ghi model, token input/output nếu SDK trả usage; không lưu prompt chứa dữ liệu cá nhân.

## 8. Trạng thái cache cần chạy

### Cold

- Chỉ xóa các row cache của resource thuộc project benchmark.
- Không dùng `db:reset` cho mỗi ca.
- Không dùng process restart như một cách tạo cold data cache. Data cache phải nằm trong PostgreSQL benchmark và được setup bằng row/timestamp có kiểm soát.
- Xóa có manifest và script tái lập; không thao tác tay không ghi nhận.

### Warm

- Gọi lại cùng resource ngay sau cold run, trong TTL.
- Không thay đổi query, timeframe hoặc dataset.

### Stale

- Điều chỉnh timestamp của đúng cache row trong database benchmark hoặc dùng fixture/setup script.
- Không chờ TTL thật nhiều giờ/ngày.
- Không dùng `force=true` thay cho stale nếu force làm thay đổi đường code.

### Concurrent stale

- N request cùng resource và cùng thời điểm sau khi cache stale.
- Đếm external call thực tế để phát hiện coalescing hoặc stampede.

### Mixed resource

- N request đến các token/wallet khác nhau để đo limiter/provider/database, không nhầm với stampede một key.

## 9. Compatibility sweep

### Candidate discovery

- Thu 100-150 token và 100-150 wallet candidate.
- Preflight nhẹ, deduplicate và phân tầng.
- Snapshot nguồn, thời điểm và category.

### Tập compatibility

- Tối thiểu 24 token và 24 wallet.
- Chạy endpoint lõi với concurrency thấp và provider thật có kiểm soát.
- Không gọi AI cho toàn bộ dataset.
- Không gọi full history cho toàn bộ wallet.

### Tập deep benchmark

- 6-8 token và 6-8 wallet đại diện.
- Có ít nhất một success phổ biến, một nullable/partial, một low-activity, một high-activity và một known-problem case trong mỗi nhóm phù hợp.

### Classification

- `data`: response hợp lệ và có dữ liệu;
- `empty_valid`: response hợp lệ nhưng rỗng;
- `unsupported`: provider/module không hỗ trợ resource;
- `validation_error`: provider response hoặc cache shape sai contract;
- `upstream_error`: provider timeout/4xx/5xx/rate limit;
- `internal_error`: lỗi route/service/database của Yoca.

Không gom tất cả thành “không lấy được dữ liệu”.

## 10. Load test và Supabase Session Pooler

### Thứ tự an toàn

1. Server + database benchmark + provider mock.
2. Baseline một process, concurrency 1.
3. Tăng từng nấc nhỏ; nấc cụ thể chốt sau baseline.
4. Endpoint đọc DB.
5. Endpoint đọc/ghi cache.
6. Same-key stale test với provider mock.
7. Hai server process nếu một process ổn.
8. Provider thật chỉ ở integration benchmark nhẹ, không load/stress test.

### Số cần ghi

- p50, p95, max latency;
- request/s;
- HTTP error rate;
- connection timeout/error;
- active/idle/waiting connection;
- provider call count;
- cache outcome;
- CPU/memory nếu công cụ môi trường cho phép.

### Stop condition

Chưa chốt con số trước baseline. Luôn dừng khi xuất hiện một trong các điều kiện:

- lỗi lặp lại có khả năng làm sai hoặc mất dữ liệu;
- connection timeout tăng liên tục;
- project Supabase báo resource pressure/read-only;
- quota provider ngoài budget;
- latency tăng mất kiểm soát qua nhiều nấc;
- benchmark ảnh hưởng deployment dùng để phản biện.

## 11. Bảo mật và dữ liệu

- Endpoint metrics không được public mặc định.
- Không log JWT, cookie, API key, Stripe secret, webhook secret hoặc database URL.
- Không lưu raw provider response mặc định.
- Không lưu prompt/chat history không cần thiết.
- URL phải bỏ query secret và chuẩn hóa resource identifier.
- Stack trace chỉ giữ local/debug artifact, không xuất dashboard public.
- Benchmark user và database tách khỏi production-like project.
- Raw artifacts có retention ngắn; summary đã redaction mới được commit.
- `debug-config` và các route debug hiện có không mặc nhiên được đưa vào dashboard hay public demo.

## 12. Công cụ đề xuất cho Batch 3-4

### Giữ lại trong sản phẩm

- Request context hiện có, mở rộng bằng benchmark metadata khi bật cờ.
- Prometheus-compatible metrics registry cho counter/histogram.
- Endpoint metrics bị tắt hoặc bảo vệ theo cấu hình.
- JSONL exporter rút gọn cho benchmark artifact.

### Chạy ngoài sản phẩm

- Grafana local cho dashboard và chụp biểu đồ.
- Prometheus local scrape endpoint metrics.
- k6 cho load scenario và summary JSON.
- Playwright cho browser journey, network event và HAR kiểm chứng.

Chrome/Firefox DevTools vẫn hữu ích để điều tra thủ công. Chrome có thể export sanitized HAR, nhưng thao tác thủ công không đủ tái lập để làm nguồn số liệu chính. Raw HAR có thể chứa cookie, authorization header, query và timing chi tiết; không commit raw HAR. Chỉ giữ summary đã lọc hoặc artifact đã redaction.

Không dùng Loki ở giai đoạn này.

Dependency cụ thể chỉ chốt ở Batch 3 sau khi kiểm tra package, license, Node compatibility và effort. Không cài cả OpenTelemetry và `prom-client` nếu một lựa chọn đã đáp ứng yêu cầu.

## 13. Phạm vi file dự kiến cho Batch 3

Chưa phải danh sách edit cuối cùng.

### Có khả năng mở rộng

- `server/src/middlewares/request-context.ts`;
- `server/src/services/tracking/apiCallTracker.types.ts`;
- `server/src/services/tracking/apiCallTracker.service.ts`;
- `server/src/services/tracking/apiCallTracker.exporter.ts`;
- `server/src/util/rate-limit.ts`;
- `server/src/config/constants.ts`;
- `server/.env.example`;
- `server/src/main.ts`.

### Client journey và network adapter

- `client/src/api/main.ts` để truyền custom fetch cho Hono RPC;
- `client/src/hooks/useGet.ts` để quan sát logical demand/SWR outcome nếu type và lifecycle cho phép;
- module observability nhỏ phía client cho journey context và event schema;
- các raw `fetch` thuộc journey deep benchmark;
- Playwright config, journey scripts và artifact sanitizer ngoài application runtime.

### Cache instrumentation theo deep journey

- Token market/meta/pool/holder/chart service tương ứng;
- Wallet overview, portfolio, activity, PnL, balance service tương ứng;
- Wash Trading verdict cache;
- AI cache chỉ khi AI được đưa vào deep benchmark.

### Có thể thêm mới

- module metrics/observability nhỏ trong `server/src/services/tracking/`;
- route metrics nội bộ hoặc exporter;
- benchmark runner/config ngoài `src`;
- dataset manifest và result schema.

Trước khi edit phải đọc type thật của từng file và chốt diff theo phần nhỏ. Không refactor toàn bộ cache/provider trong cùng Batch 3.

## 14. Acceptance criteria của Batch 2

- [x] Có kiến trúc quan sát hai lớp: aggregate metrics và benchmark artifact.
- [x] Có metric contract cho HTTP, provider, retry và cache.
- [x] Có định nghĩa cache outcome.
- [x] Có journey tách theo tab/panel thay vì cộng sai toàn trang.
- [x] Có cold/warm/stale/concurrent semantics.
- [x] Có compatibility sweep và deep benchmark.
- [x] Có kế hoạch Session Pooler/load test.
- [x] Có quy tắc security/redaction/cardinality.
- [x] Có phạm vi file dự kiến cho Batch 3.
- [x] Có thiết kế tracker server thống nhất tại transport và validation boundary.
- [x] Có thiết kế client journey + network adapter + browser verifier.
- [x] Chưa thay đổi runtime hoặc gọi provider hàng loạt.

## 15. Decision gate trước Batch 3

Nhóm cần duyệt hoặc chỉnh các quyết định sau:

1. Giữ kiến trúc Mức B-lite: Prometheus-compatible metrics + JSONL summary + Grafana/Prometheus local + k6.
2. Chấp nhận không lưu raw provider response mặc định, dù tracker cũ có khả năng này.
3. Chấp nhận route metrics không public trên deployment.
4. Chấp nhận Market tab và Wallet panel là journey riêng cho cost model.
5. Cho phép tạo module tracking/metrics nhỏ và mở rộng `rlFetch` thay vì chèn tracker riêng vào mọi provider call.
6. Instrument các in-memory data cache reachable bằng `memory_result`; migration sang PostgreSQL được tách theo service và không chặn aggregate metrics.
7. Chốt project Supabase benchmark trước khi chạy Batch 4.
8. Chốt việc AI chỉ chạy trên deep subset để bảo vệ quota.
9. Chấp nhận mô hình client lai: application adapter để có feature context, Playwright/HAR để kiểm chứng request thật.
10. Cho phép migrate raw `fetch` theo journey ưu tiên, không monkey-patch toàn cục và không refactor toàn client trong một lượt.
11. Chấp nhận raw HAR chỉ là artifact tạm, không commit nếu chưa sanitize.
12. Không tạo domain/cache/storage ID; PostgreSQL là storage ưu tiên, in-memory data cache hiện có là ngoại lệ phải quan sát được.

Các quyết định trên đã được nhóm duyệt để triển khai Batch 3 theo từng phần nhỏ. Những mục chưa hoàn tất tiếp tục được theo dõi trong checklist của kế hoạch business model.

## 16. Quy ước đo hành trình phía client

Một lần đo không bắt đầu bằng “đợi trang tự ổn định”, mà bằng kịch bản có ranh giới rõ:

1. Tạo `runId` và `journeyId` trước khi navigation hoặc user action xảy ra.
2. Ghi trigger: `page_mount`, `tab_open`, `panel_open`, `user_action`, `pagination` hoặc `revalidation`.
3. Thu request browser và liên kết request nội bộ với event server qua request header chỉ bật trong benchmark.
4. Kết thúc khi điều kiện UI cụ thể đã đạt, chẳng hạn bảng hoàn tất loading hoặc chart xuất hiện; không dùng `networkidle` như tiêu chí duy nhất.
5. Xuất summary theo journey: logical demand, internal HTTP request, external provider call, cache outcome, lỗi và latency.

Feature đóng mặc định không được tính vào page load. Muốn đo Balance, PnL, Activity, chatbot hoặc token tab thì Playwright phải thực hiện đúng thao tác mở feature và tạo journey con. Cách này tránh cộng tất cả API của một trang phức tạp thành một lượt xem giả định.

Ba loại cache phải được báo riêng:

- SWR/client cache: component có nhu cầu nhưng không phát sinh HTTP;
- browser HTTP cache: trình duyệt phục vụ resource/request mà không đi tới server;
- server/domain cache: server nhận request nhưng không gọi external provider.

Cost model chủ yếu dùng external provider call và server cache. Client metrics giải thích hành vi trang và phát hiện request thừa, không được dùng thay cho số liệu provider phía server.
