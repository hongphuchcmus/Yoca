# Provider quota research checklist

Ngày rà soát tài liệu: 2026-07-19.

Artifact quan sát bằng key hiện tại: `benchmark-results/provider-quota-observations-2026-07-19.json`.

File này dùng để kiểm tra chi phí và giới hạn của các blockchain data provider đang được client production sử dụng gián tiếp qua server. Route demo/test, discovery script và provider legacy không được đưa vào cost model mặc định.

## Nguyên tắc

- [ ] Chỉ thêm operation sau khi lần ngược được từ page/component client đang reachable đến server service và `pFetch` tracking ID.
- [ ] Không mặc định một HTTP request bằng một credit hoặc compute unit.
- [ ] Ghi riêng ba giới hạn: quota theo ngày/tháng, throughput theo giây/phút và giới hạn riêng của endpoint/sản phẩm.
- [ ] Ghi rõ nguồn: tài liệu công khai, usage endpoint/header, dashboard hay phép đo cô lập.
- [ ] Giá trị phụ thuộc gói phải lấy từ dashboard của key nhóm đang dùng; bảng giá công khai chỉ làm mốc đối chiếu.
- [ ] Không cộng request của Jupiter discovery, route demo/test hoặc script benchmark vào dự báo traffic người dùng.
- [ ] Retry là một provider attempt riêng; chỉ cộng credit cho retry khi chính sách provider xác nhận request đó bị tính phí.
- [ ] Giữ `unknown`, không tự nội suy, khi không có tài liệu hoặc phép đo đáng tin cậy.

## Provider matrix

### CoinGecko

Trạng thái hiện tại: gói Demo miễn phí, 10.000 call credit/tháng và 100 call/phút theo bảng giá công khai ngày 2026-07-19. REST tính theo request; một response HTTP 200 bằng một credit. Request lỗi không trừ monthly credit nhưng vẫn tính vào rate limit. Pro API có `GET /key` để xem quota và usage; Demo cần đối chiếu dashboard nếu endpoint này không khả dụng cho key hiện tại.

- [x] Xác nhận key hiện tại dùng Demo base URL và `x-cg-demo-api-key`; `/key` trả 401 vì không phải Pro usage endpoint.
- [x] Ghi giới hạn công khai của Demo: 10.000 call credit/tháng và 100 call/phút.
- [x] Xác nhận tài liệu CoinGecko quy định REST response 200 là 1 credit; request lỗi không trừ monthly credit nhưng vẫn chiếm minute rate limit.
- [ ] Kiểm tra batch/list endpoint có tính một call hay có quy tắc theo số item.
- [x] Thử `/key`: key hiện tại không được phép; cần lấy monthly quota và request/minute từ Developer Dashboard.
- [x] Lập inventory 17 `coingecko.svc.*` trong service; tất cả là REST nên unit cost 1 credit/HTTP 200. Việc lọc operation reachable từ client nằm ở client-to-route inventory.

Nguồn chính thức:

- https://docs.coingecko.com/reference/api-usage
- https://docs.coingecko.com/reference/authentication
- https://docs.coingecko.com/docs/data-delivery-methods
- https://www.coingecko.com/en/api/pricing

### Birdeye

Trạng thái đã kiểm tra bằng key hiện tại ngày 2026-07-19: gói Standard (free tier), tính theo compute unit (CU), cost khác nhau theo endpoint. `GET /utils/v1/credits` trả kỳ hiện tại có tổng 30.000 CU, đã dùng 1.945 CU và còn 28.055 CU tại thời điểm đo. Nhóm xác nhận không còn sử dụng gói Lite 2,5 triệu CU.

- [x] Ánh xạ tám `birdeye.svc.*` sang path; bảy operation có fixed CU công khai và `/defi/v3/txs/recent` đã được đo cô lập là 25 CU/request.
- [x] Ghi fixed CU cho endpoint có giá công khai trong catalog v0.
- [x] Đo `/defi/v3/txs/recent` với `limit=1`, `10` và `50`; cả ba đều tiêu thụ 25 CU nên cost không đổi theo page size trong các case đã thử.
- [x] Chụp usage trước/sau bằng `/utils/v1/credits` và trừ 1 CU của chính mỗi lần đọc usage.
- [ ] Đối chiếu kết quả với Metrics Dashboard theo method và CU usage.
- [x] Ghi quota kỳ hiện tại 30.000 CU từ `/utils/v1/credits`; không dùng quota Lite cũ trong cost model.
- [x] Response `/defi/v3/txs/recent` xác nhận rate-limit window hiện tại là 100 request; `/utils/v1/credits` có limit riêng là 1 request. Không dùng limit của usage endpoint làm RPS chung của BDS.
- [ ] Xác nhận request lỗi/retry có bị trừ CU hay không bằng phép đo cô lập.
- [x] Giải thích được delta cũ: counter cập nhật trễ một chu kỳ đọc. Mỗi target tạo 25 CU và lần đọc `/utils/v1/credits` tạo thêm 1 CU; poll cuối xác nhận tổng tăng 26. Kết luận catalog dùng 25 CU cho target.

Nguồn chính thức:

- https://docs.birdeye.so/docs/compute-unit-cost
- https://docs.birdeye.so/changelog/20251013-release-credits-usage
- https://docs.birdeye.so/docs/dashboard-metrics

### Mobula

Trạng thái hiện tại: gói Free giá 0 USD, 10.000 credit/tháng và 1 request/giây. Endpoint không được liệt kê mặc định 1 call bằng 1 credit. `/wallet/analysis` là 5 credit; một số endpoint tính theo asset/chain. Bảng giá công khai hiện có Start-up 50 USD (125.000 credit, 30 RPS), Growth 400 USD (1,25 triệu credit, 50 RPS) và Enterprise từ 750 USD (500 RPS, quota theo thỏa thuận).

- [x] Ánh xạ bảy `mobula.svc.*` đang dùng với bảng Pricing/tài liệu từng endpoint; dùng `x-ratelimit-cost` từ response 200 để đối chiếu.
- [x] Xác nhận `/2/wallet/analysis` = 5 credit trên key hiện tại; tài liệu còn đặt rate limit riêng 5 request/phút cho endpoint này.
- [x] Xác nhận observed cost: metadata 1, holder positions 1, token price history GET 2, wallet positions 1, wallet activity 1 và wallet history 1.
- [ ] Kiểm tra dashboard có usage tổng/per-endpoint hoặc API nội bộ được công bố hay không.
- [ ] Nếu chỉ có dashboard, nhóm ghi usage trước/sau từng case và thời gian dashboard cập nhật.
- [x] Response header xác nhận credit limit 10.000; `remaining` hiện trả 10.000 trong từng response nên chưa dùng trường này làm cumulative usage.
- [x] Dashboard ngày 2026-07-19 ghi khoảng 10,1 nghìn/10 nghìn credit, phát sinh 0,06 USD vượt mức, RPS hiện tại 1 và reset ngày 2026-08-01. Key này không còn phù hợp cho benchmark tiếp theo.
- [x] Xác nhận Free hiện có 1 RPS từ bảng Pricing; giá trị này khớp dashboard và giải thích lỗi 429 `Max RPS reached`. Giới hạn 5 request/phút của Wallet Analysis tiếp tục được theo dõi riêng.
- [x] Tách webhook/streaming khỏi REST trong cost catalog; webhook được tài liệu ghi 1 credit mỗi trigger, WebSocket tốn 1 credit/phút cộng credit của dữ liệu truyền qua.
- [x] Xác nhận Mobula hỗ trợ top-up credit từ changelog ngày 2026-02-25, nhưng đơn giá top-up không được công bố. Mô hình dùng mức Enterprise công khai từ 750 USD khi vượt Growth; chỉ cần hỏi báo giá trước quyết định mua thật.

Nguồn chính thức:

- https://docs.mobula.io/pricing
- https://docs.mobula.io/rest-api-reference/endpoint/token-price-history
- https://docs.mobula.io/rest-api-reference/endpoint/wallet-analysis
- https://docs.mobula.io/changelog/2026-02-16
- https://docs.mobula.io/changelog/2026-02-25

### Zerion

Trạng thái hiện tại: gói Developer giá 0 USD theo xác nhận của nhóm. Mỗi response có header cho limit/remaining/reset theo giây và ngày. Dashboard có Analytics nhưng chưa tìm thấy bảng public cho cost khác nhau theo endpoint; trước mắt không giả định monthly quota khi response không cung cấp.

- [ ] Mở rộng tracker để lưu an toàn các header `RateLimit-Org-*-Limit`, `Remaining` và `Reset` của response benchmark.
- [x] Chạy một request cô lập: key hiện là tier `developer`, giới hạn 10 request/giây và 2.000 request/ngày; response không trả month limit.
- [ ] Kiểm tra pagination có trừ một request cho mỗi page.
- [x] Ghi exact second/day limits từ response của key nhóm; monthly limit hiện không quan sát được từ header.
- [ ] Đối chiếu Analytics Dashboard nếu remaining header không đổi ngay hoặc có propagation delay.
- [x] Xác nhận response nhận diện organization là Developer; cần dashboard để xác nhận giá và monthly policy hiện hành.
- [x] Xác nhận hai operation thật: fungible lookup và wallet token chart đều giảm daily remaining đúng một request khi thành công.
- [x] Xác nhận request chart 400 cũng giảm daily remaining một request; lỗi input vẫn phải được tính vào quota model.
- [x] Ghi các tier trả phí công khai: Builder 149 USD/tháng cho 250.000 request, Startup 499 USD cho 1 triệu và Growth 999 USD cho 2,5 triệu request.
- [!] Limiter code vẫn giả định Free 1 RPS/300 request ngày, trong khi key thật trả Developer 10 RPS/2.000 request ngày. Cấu hình hiện bảo thủ nhưng có thể tạo latency/throughput thấp hơn khả năng gói.

Nguồn chính thức:

- https://developers.zerion.io/rate-limits
- https://developers.zerion.io/error-handling
- https://zerion.io/api

### Moralis

Trạng thái hiện tại: gói Free, 40.000 CU/ngày và throughput công khai 40 RPS. Bảng Data API công bố cost theo method; Solana `getTokenMetadata` là 10 CU và `getSwapsByWalletAddress` là 50 CU tại thời điểm rà soát.

- [x] Ánh xạ `moralis.svc.token_metadata` và `moralis.svc.wallet_swaps` đến đúng Solana Data API path.
- [x] Ghi fixed CU theo bảng Solana Data API: metadata 10 CU, wallet swaps 50 CU/page.
- [ ] Kiểm tra pagination và số chain/address có làm cost động hay không.
- [x] Ghi quota công khai của Free: 40.000 CU/ngày và 40 RPS; gói này không công bố quota theo tháng trong bảng giá hiện tại.
- [x] Dashboard ngày 2026-07-19 ghi 290/40.000 CU đã dùng; quota reset hằng ngày.
- [ ] Tìm usage API/header cho Data API; nếu không có, đo delta thủ công trên dashboard.
- [ ] Xác nhận request lỗi/retry có trừ CU hay chỉ chiếm throughput.

Nguồn chính thức:

- https://docs.moralis.com/get-started/pricing
- https://docs.moralis.com/data-api/pricing
- https://moralis.com/pricing/

### Helius

Trạng thái hiện tại: gói Free giá 0 USD, 1 triệu credit/tháng; RPC 10 RPS và DAS/Enhanced/Wallet API 2 RPS. Standard RPC = 1 credit, DAS = 10, Enhanced Transactions = 100, Wallet API = 100, webhook event = 1 và webhook management = 100. Admin API cung cấp usage theo project và service.

- [x] Phân loại các `helius.svc.*`: standard RPC, Enhanced Transactions/address transactions, Wallet API và webhook management; hiện không có runtime operation DAS trong inventory.
- [x] Ánh xạ credit công khai cho từng nhóm operation trong catalog v0.
- [!] Admin API đã được gọi bằng Project ID đúng định dạng và API key cùng project nhưng trả HTTP 500 `Found project without billing period start`; giữ usage là unknown và không chặn benchmark vì lỗi trạng thái billing nằm phía Helius.
- [x] Ghi quota và throughput công khai của Free: 1 triệu credit/tháng, RPC 10 RPS, DAS/Enhanced/Wallet API 2 RPS; special limits tiếp tục theo dõi riêng.
- [x] Ghi giá công khai: Developer 49 USD/10 triệu credit, Business 499 USD/100 triệu và Professional 999 USD/200 triệu. Các gói trả phí cho mua thêm credit với giá 5 USD mỗi 1 triệu credit; vì vậy mô hình không nhảy thẳng lên Business khi chỉ vượt nhẹ 10 triệu.
- [ ] Tách webhook event phát sinh theo thời gian khỏi page journey; dự báo từ số event thực tế theo wallet theo dõi.
- [x] Xác nhận webhook dùng key thuộc chủ sở hữu/project khác; usage Admin API của `HELIUS_API_KEY` không bao gồm webhook, nên hai nguồn phải được báo cáo tách biệt.
- [ ] Xác nhận tạo/update/delete webhook mỗi lần tốn 100 credit và event delivery tốn 1 credit.
- [ ] Với wash trading, ghi riêng số Enhanced/RPC call theo số transaction/page; không lấy một ví nhỏ làm đại diện cho ví hoạt động mạnh.

Nguồn chính thức:

- https://www.helius.dev/docs/billing/credits
- https://www.helius.dev/docs/billing/rate-limits
- https://www.helius.dev/docs/api-reference/admin

### Brave Search và Gemini

Brave Search API hiện tính Search theo pay-as-you-go: 5 USD/1.000 request và tự cấp 5 USD credit mỗi tháng, tương đương khoảng 1.000 request Search. Yoca không dùng Brave Answers. Web Search và News Search là các request độc lập; nếu một luồng gọi cả hai thì phải cộng hai request.

Gemini có Free Tier theo model/project và Paid Tier tính theo token. Không dùng một con số RPM/RPD chung vì Google yêu cầu xem active limits trong AI Studio. Mô hình hiện dùng giá Standard: Gemini 3.1 Flash-Lite là 0,25 USD/1 triệu input token và 1,50 USD/1 triệu output/thinking token; Gemini 2.5 Flash là 0,30/2,50 USD; Gemini 2.5 Flash-Lite là 0,10/0,40 USD. Chuyển sang Paid Tier bằng cách liên kết billing và nạp trước tối thiểu 10 USD; đây là credit nạp trước, không phải phí thuê bao tháng.

OpenGraph trong Yoca không phải API thương mại nên được loại khỏi cost model chi tiết; ảnh hưởng nhỏ được hấp thụ trong chi phí hosting chung.

- [x] Instrument bốn Brave operation bằng `pFetch`; mỗi outbound attempt được đếm riêng và không tự retry.
- [x] Instrument mười Gemini operation; ghi model, outcome, latency và token metadata, không ghi prompt/response.
- [-] Đã chạy pilot prompt cố định và lưu artifact cho Token AI, General/Wallet Chat và Wash Trading AI; cần lặp mẫu để lấy distribution. Các Wallet AI modal đã bị loại khỏi runtime pricing.
- [x] Pilot PYTH cho Token Chart News và Volatility đã ghi nhận cả Gemini token lẫn Brave fan-out; cost v0 đã được cập nhật trong `AI_TIER_COST_MODEL_2026-07-19.md`.
- [ ] Đo tỷ lệ Brave fallback thực tế trên token-news journey; không giả định mọi lượt xem đều gọi Brave.

Nguồn chính thức:

- https://brave.com/search/api/
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/billing
- https://ai.google.dev/gemini-api/docs/rate-limits

### Resend và Discord Alert

Resend được dùng cho password reset và email Alert. Free có 3.000 email/tháng, 100 email/ngày và giới hạn mặc định 5 API request/giây trên toàn team. Pro 20 USD có 50.000 email/tháng; Pro 35 USD có 100.000 email/tháng và paid overage từ 0,90 USD mỗi 1.000 email. Discord incoming webhook không có đơn giá được đưa vào mô hình, nhưng request vẫn phải được throttling và theo dõi kết quả gửi.

- [x] Đưa Resend vào calculator theo 10% mức sử dụng quota Alert dự kiến và 5% MAU phát sinh password reset.
- [ ] Instrument Resend quota header, success/failure và Discord dispatch.
- [ ] Enforce Alert entitlement/counter trong database trước khi công bố quyền lợi.

Nguồn chính thức:

- https://resend.com/pricing
- https://resend.com/docs/knowledge-base/account-quotas-and-limits
- https://docs.discord.com/developers/platform/webhooks

## Quy trình đo operation có cost ẩn hoặc động

- [ ] Tắt client, polling, webhook sync và các benchmark khác đang dùng cùng key trong cửa sổ đo.
- [ ] Chờ usage counter ổn định; ghi timestamp, provider, key/project ID dạng redacted và số usage ban đầu.
- [ ] Gọi usage endpoint hoặc ghi dashboard baseline.
- [ ] Gọi đúng một operation với một input cố định.
- [ ] Chờ propagation delay đã xác định rồi đọc usage lần hai.
- [ ] Trừ chi phí của usage endpoint nếu bản thân endpoint có tính credit/CU.
- [ ] Lặp tối thiểu 5 lần; lưu từng delta, median, min/max và không chỉ lưu trung bình.
- [ ] Chạy biến thể theo page size, số address, số token, số chain và response rỗng/lỗi nếu operation có khả năng tính động.
- [ ] Chạy riêng case 429/4xx/5xx ở mức an toàn khi cần xác định chính sách tính phí; không cố tình làm cạn quota.
- [ ] So sánh tổng delta provider với số `yoca_provider_requests_total` theo operation để phát hiện traffic nền hoặc operation chưa instrument.
- [ ] Nếu counter chỉ có độ phân giải thô hoặc cập nhật chậm, đánh dấu kết quả `dashboard_observed`, không khẳng định exact cost.

## Runtime operation cost catalog v0

Catalog này ghi unit cost của một provider attempt thành công. Journey cost còn phải nhân với pagination, batch splitting, số token/wallet và retry thực tế.

Phân loại billing: CoinGecko và Zerion là `request_based`; Birdeye là `fixed_cu` theo operation; Mobula là `fixed_credit` có fan-out theo page/chain/asset; Moralis là `fixed_cu_per_page` cho hai operation hiện dùng; Helius là `fixed_credit` theo nhóm API/call/event. Không operation nào trong runtime catalog hiện còn phải gán cost bằng suy đoán.

| Provider | Operation/path | Unit cost | Trạng thái |
|---|---|---:|---|
| CoinGecko | mọi `coingecko.svc.*` REST | 1 credit/HTTP 200 | tài liệu công khai; mỗi page/batch là một call |
| Birdeye | `market_gainers` → `/defi/v3/token/list` | 75 CU | tài liệu công khai |
| Birdeye | `pool_trades` → `/trader/gainers-losers` | 30 CU | tài liệu công khai; tracking ID hiện đặt tên chưa sát nghiệp vụ |
| Birdeye | `token_price_at_time` → `/defi/price` | 3 CU | tài liệu công khai cho Price Single; cần xác nhận tham số `time` có đúng endpoint mong muốn |
| Birdeye | `token_price_chart` → `/defi/history_price` | 45 CU | tài liệu công khai |
| Birdeye | `trending_tokens` → `/defi/token_trending` | 40 CU | tài liệu công khai |
| Birdeye | `wallet_networth_history` → `/wallet/v2/net-worth` | 50 CU | tài liệu công khai |
| Birdeye | `wallet_portfolio` → `/wallet/v2/net-worth-details` | 50 CU | tài liệu công khai |
| Birdeye | `token_trades` → `/defi/v3/txs/recent` | 25 CU/request | đo cô lập với limit 1, 10 và 50; counter có propagation delay một chu kỳ đọc |
| Mobula | `token_fundamentals` → `/1/metadata` | 1 credit | bảng Pricing; response header xác nhận |
| Mobula | `token_holders` → `/2/token/holder-positions` | 1 credit | bảng Pricing; response header xác nhận |
| Mobula | `token_price_chart` → `/2/token/price-history` GET | 2 credits | tài liệu endpoint và response header cùng xác nhận |
| Mobula | `wallet_token_details` → `/2/wallet/positions` | 1 credit | bảng Pricing; response header xác nhận |
| Mobula | `wallet_analysis` → `/2/wallet/analysis` | 5 credits | bảng Pricing + response header; riêng endpoint giới hạn 5 request/phút |
| Mobula | `wallet_activity` → `/2/wallet/activity` | 1 credit/page | bảng Pricing + response header; service có thể phân trang nhiều lần |
| Mobula | `wallet_balance_chart` → `/1/wallet/history` | 1 credit | bảng Pricing; response header xác nhận |
| Zerion | `wallet_token_balances` → `/fungibles/` | 1 request | observed daily remaining; một batch tối đa 25 address theo TODO code |
| Zerion | `wallet_token_chart` → `/wallets/:address/charts/:period` | 1 request/token | fan-out theo số token cần biểu đồ |
| Moralis | `token_metadata` → Solana token metadata | 10 CU | bảng Data API công khai |
| Moralis | `wallet_swaps` → Solana wallet swaps | 50 CU/page | implementation hiện unused theo source trace và bị loại khỏi runtime journey model; giữ làm legacy inventory |
| Helius | Wallet API: balances/history/transfers/funding/identity | 100 credits/call | bảng Helius Credits |
| Helius | Enhanced Transactions/address transactions | 100 credits/call | bảng Helius Credits |
| Helius | Standard RPC: `getTransaction`, `getSignaturesForAddress`, `getTokenLargestAccounts` | 1 credit/call | bảng Helius Credits |
| Helius | webhook create/update/delete | 100 credits/call | bảng Helius Credits |
| Helius | webhook event delivery | 1 credit/event | phát sinh nền, không gắn vào page journey |
| Brave | `chat_news_search`, `chat_web_search`, `token_news_search`, `token_web_search` | 1 Search request/attempt | 5 USD/1.000 request; 5 USD monthly credit tương đương khoảng 1.000 request |
| Gemini | mọi `gemini.svc.*` | theo input/output token của model | đo từ `usageMetadata`; retry và model fallback là call riêng |
| Resend | password reset và alert email | 1 email/người nhận | Free 3.000/tháng và 100/ngày; mọi API key trong team dùng chung 5 request/giây |
| Discord | alert incoming webhook | 1 HTTP request/kênh/event | Không gán đơn giá; vẫn theo dõi rate limit và delivery outcome |

### Fan-out cần đưa vào journey model

- [x] CoinGecko Market Radar: observed-first journey ngày 2026-07-19 ghi 17 call gồm 11 `market_pools`, 2 `trending_pools`, 2 `token_market_batch` và 2 `pool_market_batch`; warm repeat là 0. Đây là fan-out của input hiện tại, không phải hằng số cho mọi page size.
- [x] Mobula Wallet Activity: baseline ba ví là 2, 2 và 15 calls khi swaps/transfers cùng cold-start. Sau client lazy loading, shared coverage metadata và page-level single-flight, ví baseline nặng giảm 15 xuống 10 calls; concurrent light case dùng 1 call và sequential heavy case dùng 6 calls rồi tab sau đọc database. Upper bound hiện tại là 10 unique pages/range, vẫn phải dùng phân phối fan-out theo mật độ giao dịch.
- [x] Zerion token chart: interaction chọn ba token tạo một `wallet_token_balances` lookup và ba `wallet_token_chart` requests; warm repeat là 0. Sau khi mapping đã có, chart fan-out chính là một request cho mỗi token được chọn.
- [x] Moralis swaps: `fallow --trace` xác nhận `fetchMoralisSolanaSwap` không có reference; client production dùng Mobula-backed swaps history. Không benchmark hoặc cộng Moralis swaps vào runtime cost model cho đến khi có consumer thật.
- [x] Helius Wash Trading Enhanced path: code gọi tối đa một address-transactions request, tương đương 100 credits; cache transfer process-local 5 phút có thể tránh gọi lại cùng mint/timeframe.
- [x] Helius Wash Trading RPC fallback: chỉ chạy khi Enhanced không đủ tám transfer; tối đa 1 largest-accounts + 5 signatures + 70 transactions = 76 standard RPC credits. Một fallback đầy đủ gồm cả Enhanced attempt nên upper bound on-chain là 176 Helius credits/lượt.
- [x] Helius Wallet Core: Portfolio và Overview dùng chung một refresh. Ba core samples chỉ dùng một balances page, tương đương 100 credits/refresh; ví nhiều holdings phải tính `100 × số trang`, không dùng hằng số 100 hoặc 200 cho mọi ví.
- [x] Helius webhook: tách khỏi page journey và dự báo bằng event count. Event delivery là 1 credit/event; create/update/delete là 100 credits/lần và chỉ phát sinh khi cấu hình địa chỉ thay đổi. Database hiện không lưu toàn bộ received event nên chưa có observed event-rate đáng tin cậy.

## Việc nhóm phải kiểm tra thủ công

- [x] Mobula: Free 10.000 credit/tháng, khoảng 10,1 nghìn đã dùng, vượt 0,06 USD, 1 RPS và reset 2026-08-01 đã có. Unit cost của các endpoint runtime đã được xác nhận bằng tài liệu và header; dashboard chỉ cần kiểm lại trước một đợt benchmark mới.
- [ ] Moralis: Free 290/40.000 CU/ngày và 40 RPS đã có; còn cần delta usage của Solana Data API nếu không có usage endpoint công khai.
- [x] CoinGecko: Demo 3.162/10.000 credit đã dùng, còn 6.838; 100 call/phút và reset 2026-08-01.
- [x] Birdeye: Standard (free tier), 30.000 CU/kỳ; recent transactions cost 25 CU, response window 100 request; usage endpoint có limit riêng 1 request.
- [x] Zerion: gói Developer giá 0 USD, mặc định 10 request/giây và 2.000 request/ngày; không có quota tháng nên không quy đổi từ quota ngày.
- [!] Helius: gói Free và giới hạn công khai đã có. Admin API usage trả lỗi 500 do project không có billing-period start; webhook thuộc project/chủ sở hữu khác và không được cộng vào usage của key hiện tại.

## Deliverable trước khi gắn quotaCost vào tracker

- [x] Client-to-route inventory đã loại demo/test route và tách initial load khỏi interaction tại `CLIENT_RUNTIME_ROUTE_INVENTORY.md`.
- [x] Mỗi runtime `provider.svc.operation` có provider endpoint/nhóm API và billing unit trong catalog v0.
- [x] Mỗi provider operation đã được phân loại billing; fan-out được giữ riêng thay vì gộp vào unit cost.
- [x] Có quota theo kỳ, throughput limit khả dụng, nguồn và ngày khảo sát; trường provider không công bố được giữ rõ là unknown.
- [x] Có raw isolated observations cho Birdeye cost trước đây chưa rõ và provider quota header/dashboard.
- [x] Có quy tắc upgrade dựa trên projected quota, peak throughput, 429/error rate và provisional latency SLO tại `benchmark-results/JOURNEY_COST_INPUTS_2026-07-19.md`.
- [ ] Nhóm duyệt bảng trước khi thêm metadata vào code production.

## Gói nâng cấp gần nhất dùng cho cost scenario

Bảng này chỉ ghi bước nâng cấp đầu tiên có khả năng liên quan đến runtime hiện tại. Giá là giá niêm yết theo tháng tại ngày rà soát; khuyến mãi và giá trả theo năm được giữ riêng để tránh làm chi phí cơ sở thấp giả tạo.

| Provider | Bước nâng cấp gần nhất | Giá niêm yết/tháng | Quota và throughput chính | Cách dùng trong mô hình |
| --- | --- | ---: | --- | --- |
| Birdeye | Lite | 39 USD | 1,5 triệu CU/tháng, 15 RPS | Ứng viên nâng đầu tiên khi Market Radar vượt 30.000 CU Standard; không dùng con số Lite 2,5 triệu cũ. |
| Mobula | Start-up | 50 USD | 125.000 credits/tháng, 30 RPS | Ứng viên nâng đầu tiên khi Wallet Core/Activity vượt 10.000 credits Free; Growth là 400 USD/1,25 triệu và Enterprise từ 750 USD. |
| CoinGecko | Basic | 35 USD trả tháng; 29 USD/tháng nếu trả năm | 100.000 credits/tháng, 300 call/phút | Dùng giá 35 USD trong monthly scenario; giá năm chỉ dùng khi phân tích cam kết dài hạn. |
| Helius | Developer | 49 USD | 10 triệu credits/tháng, 50 RPC RPS, 10 DAS/Enhanced RPS | Dùng list price 49 USD; credit bổ sung là 5 USD/1 triệu trên gói trả phí. |
| Moralis | Starter | 49 USD/tháng khi trả năm | 2 triệu CU/tháng, 40 RPS | Chưa đưa vào runtime base cost vì Moralis swaps hiện không có production consumer; chỉ kích hoạt nếu source trace thay đổi. |
| Zerion | Builder | 149 USD | 250.000 request/tháng, 10 RPS | Chỉ nâng khi peak ngày vượt Developer hoặc nhu cầu tháng tiến gần 250.000; key hiện tại vẫn dùng Developer 0 USD. |
| Brave Search | Search pay-as-you-go | 5 USD/1.000 request sau credit | 5 USD credit miễn phí/tháng, 50 query/giây | 1.000 Search request đầu tương đương 0 USD; sau đó 0,005 USD/request. |
| Gemini | Paid Tier / Tier 1 | Không có phí thuê bao; nạp trước tối thiểu 10 USD | Tính theo token; rate limit thực tế phụ thuộc model/project và xem trong AI Studio | Dùng đúng model: 3.1 Flash-Lite 0,25/1,50 USD và 2.5 Flash 0,30/2,50 USD cho 1 triệu input/output token. |
| Resend | Transactional Pro | 20 USD | 50.000 email/tháng, không có daily cap; 5 request/giây mặc định trên toàn team | Nâng khi projected usage vượt 2.100 email/tháng hoặc daily traffic tiến gần 100 email Free. |

Nguồn chính thức được dùng: Birdeye Pricing, Mobula Pricing, CoinGecko API Pricing, Helius Pricing/Credits, Moralis Pricing, Zerion Rate Limits, Brave Search API Pricing, Gemini API Pricing/Billing/Rate Limits, Resend Pricing/Quotas và Discord Webhooks đã liệt kê trong từng provider ở trên.
