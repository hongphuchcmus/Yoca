# Kế hoạch xây lại Pricing và Business Model

Ngày bắt đầu: 2026-07-17

File nội bộ để nhóm và Codex theo dõi công việc. Không đưa nguyên văn file này vào báo cáo hoặc slide.

## Mục tiêu

Xây dựng phần Pricing và Business Model đủ phù hợp với phạm vi đồ án tốt nghiệp, có căn cứ kỹ thuật ở những chỗ hệ thống có thể đo được, đồng thời tách rõ các giả định kinh doanh chưa thể kiểm chứng bằng dữ liệu vận hành thật.

Kết quả cuối phải giúp nhóm:

- giải thích được nguồn phát sinh chi phí dữ liệu, AI và hạ tầng;
- chứng minh được một hành trình người dùng tạo ra những request nào trong trạng thái cache lạnh và cache còn hiệu lực;
- ngoại suy chi phí theo các kịch bản người dùng bằng công thức có thể tính lại;
- trình bày giá theo tháng/năm và sự khác biệt giữa các tier;
- trả lời được các câu hỏi phản biện cơ bản về dữ liệu, cache, rate limit, bảo mật và tính hợp lý của giả định;
- không đưa lịch sử AI/agent, ghi chú sửa code hoặc các kết luận chưa có căn cứ vào nội dung nộp.

## Nguyên tắc

- Số liệu có thể đo trong hệ thống thì không thay bằng phỏng đoán.
- Số liệu suy ra phải có công thức và đầu vào.
- Số liệu thuộc tương lai kinh doanh được phép giả định, nhưng phải ghi rõ là kịch bản.
- Không xem một external request mặc nhiên tương đương một credit; phải đối chiếu cách tính của từng provider.
- Không dùng multi-key hoặc key rotation trong Business Model, benchmark và phương án scale. Mục đích ban đầu của nhóm là cộng quota từ nhiều tài khoản Free; cách này không đủ bền vững và tạo thêm rủi ro phản biện. Việc thay key thủ công khi bị lộ vẫn là thao tác vận hành thông thường, không xem là tính năng của kiến trúc.
- Không đưa Redis hoặc ACMS vào kiến trúc vận hành và cost model chính vì nhóm không sử dụng Redis; phần code còn tồn tại được xem là legacy cho đến khi xử lý riêng.
- Không gọi số tiền còn lại sau chi phí data/AI là lợi nhuận ròng.
- Không tuyên bố độ chính xác, khả năng chịu tải hoặc mức độ an toàn vượt quá phạm vi đã đánh giá.
- Mỗi batch có điểm dừng để nhóm xem kết quả và quyết định trước khi chuyển sang bước gây thay đổi code hoặc tốn quota provider.
- Không refactor hoặc dọn legacy theo cách làm thay đổi, làm mất hay âm thầm đổi hành vi mà người dùng hiện có thể sử dụng. Một file bị `fallow` đánh dấu unused hoặc một route không thấy client gọi chưa đủ để xóa; phải kiểm tra route mounting, dynamic/framework entry point, external consumer, cấu hình deployment và luồng UI thực tế.
- Instrumentation phải quan sát hành vi hiện tại trước. Mọi thay đổi nghiệp vụ, cache policy, provider selection hoặc request timing phát hiện trong lúc instrument được tách thành diff và decision gate riêng.

## Quy ước tiến độ

- `[ ]`: chưa làm.
- `[-]`: đang làm hoặc chờ nhóm quyết định.
- `[x]`: đã hoàn thành và có bằng chứng.
- `[!]`: phát hiện mâu thuẫn hoặc rủi ro cần xử lý.

## Batch 0 — Kiểm toán tài liệu cũ

Mục tiêu: giữ lại phần nghiên cứu có giá trị và loại các kết luận mang tính suy đoán hoặc dấu vết làm việc nội bộ.

- [x] Đọc `pricing_model.md` và `PRICING_COST_MODEL_PLAN_2026-07-13.md`.
- [x] Phân biệt yêu cầu gốc của nhóm với phần tổng hợp do agent tạo.
- [x] Xác định các số liệu đang được giả định: MAU, session, tỷ lệ truy cập trang, cache hit/miss, tỷ lệ dùng AI và payer conversion.
- [x] Xác định các phần có thể giữ: bản đồ trang/API/provider, TTL, kịch bản MAU, cấu trúc tier tháng/năm và hướng nghiên cứu AI mã nguồn mở.
- [x] Đánh dấu các phần phải loại khỏi bản nộp: lịch sử verify, đường dẫn source, bug/migration, AI agent, Redis/ACMS và key rotation.
- [!] Cost model cũ trộn số đo, suy luận từ source, tài liệu provider và giả định kinh doanh với cùng mức độ chắc chắn.
- [!] Bảng lợi nhuận cũ chỉ trừ chi phí data/AI nhưng tạo cảm giác là lợi nhuận của toàn sản phẩm.
- [!] Một số thông tin giá, quota, model AI và provider có tính thời điểm, phải nghiên cứu lại trước khi dùng.

Đầu ra: ma trận khẳng định và bằng chứng dùng làm input cho các batch sau.

## Batch 1 — Chốt phạm vi đo lường

Mục tiêu: quyết định mức công cụ vừa đủ trước khi triển khai instrumentation.

### Các câu hỏi nhóm phải quyết định

- [x] Mục tiêu không chỉ tạo số liệu cho báo cáo: giữ instrumentation/observability trong đồ án nếu không làm vỡ cấu trúc hoặc tính năng.
- [x] Dùng một project Supabase Free tách riêng cho benchmark; không reset hoặc tạo tải trên database đang dùng để phản biện.
- [x] Có thể gọi provider thật ở mức kiểm soát; quota tối đa cho từng đợt phải được tính trước khi chạy.
- [x] Cần đánh giá tải đồng thời bên cạnh cold/warm cache benchmark.
- [x] Cần lưu kết quả và tạo biểu đồ cho báo cáo.
- [x] Bộ dữ liệu hiện có quá hẹp; phải mở rộng và kiểm tra nhiều token/wallet thay vì chỉ bảo đảm một trường hợp demo chạy được.
- [ ] Chốt nơi lưu metrics dài hạn và có triển khai dashboard ngoài môi trường local hay không.

### Ba mức đầu tư

#### Mức A — Benchmark tái lập, ưu tiên cho đồ án

- Instrumentation nhẹ tại biên cache và lớp gọi provider.
- Log JSON hoặc ghi kết quả benchmark ra file cục bộ.
- Correlation ID cho từng hành trình.
- Một script chạy các ca cold cache/warm cache.
- Công cụ tạo tải nhẹ như `autocannon` hoặc `k6` chỉ dùng cho endpoint nội bộ được chọn.
- Tổng hợp kết quả bằng script và biểu đồ tĩnh.

Ưu điểm: ít hạ tầng, dễ giải thích, đủ tạo bằng chứng cho cost model. Nhược điểm: không phải hệ thống giám sát dài hạn.

#### Mức B — Metrics và dashboard ngắn hạn

- Các thành phần của Mức A.
- Metrics chuẩn theo counter/histogram: request, provider call, cache hit/miss, latency và error.
- OpenTelemetry hoặc Prometheus-compatible metrics.
- Grafana để xem dashboard trong lúc benchmark.

Ưu điểm: trực quan và có thể giữ lại khi vận hành. Nhược điểm: cần thêm cấu hình, nơi lưu metrics và thời gian học/duy trì.

#### Mức C — Observability đầy đủ

- Metrics, distributed tracing và centralized logging.
- OpenTelemetry Collector, Prometheus, Grafana và Loki hoặc dịch vụ tương đương.
- Dashboard, alert rule, retention và quản lý quyền truy cập.

Ưu điểm: gần với hệ thống production. Nhược điểm: quá nặng nếu mục tiêu chính chỉ là cost model; dễ biến phần hạ tầng quan sát thành một đồ án phụ.

### Khuyến nghị ban đầu

Chọn **Mức B-lite**: giữ instrumentation và metric contract trong sản phẩm; hỗ trợ xuất metrics theo chuẩn Prometheus-compatible; chạy dashboard Grafana trong môi trường benchmark/local trước. Raw result của mỗi lần benchmark phải được lưu thành JSON/CSV để có thể dựng lại biểu đồ mà không phụ thuộc dashboard. Chưa đưa Loki vào vì bài toán hiện tại cần counter, histogram và latency nhiều hơn tìm kiếm log tập trung.

Không công khai endpoint metrics trên deployment nếu chưa có cơ chế giới hạn truy cập. Việc đẩy metrics sang một dịch vụ bên ngoài là quyết định riêng sau khi đánh giá chi phí, quyền truy cập và dữ liệu được gửi đi.

**Decision gate 1:** đã chọn Mức B-lite; còn chờ duyệt thiết kế metric, nơi lưu và file bị ảnh hưởng trước khi sửa code.

## Batch 2 — Thiết kế benchmark

Mục tiêu: tạo một đặc tả đo có thể chạy lại và không phụ thuộc vào trí nhớ của người thực hiện.

Đặc tả chi tiết: `docs/plans/business/BENCHMARK_OBSERVABILITY_DESIGN.md`.

### Hành trình đề xuất

- [x] Market Overview được tách theo tab Trending/Top/Gainers/New Pairs.
- [x] Token Overview gồm token, pool đang chọn, holder, market, trade và chart.
- [x] Pool Detail nằm trong token/pool journey và có ca refresh riêng.
- [x] Wallet Overview được tách core và panel, không cộng tất cả feature vào một page view.
- [x] Wallet PnL, balance chart và lịch sử giao dịch là các journey riêng.
- [x] Wash Trading tách heuristic và AI.
- [x] Ask Yoca AI và Wallet Chat đa công cụ chỉ chạy trên deep subset sau khi chốt quota.

### Dữ liệu cần ghi cho mỗi hành trình

- [x] Xác định endpoint nội bộ và phụ thuộc chính cho từng journey.
- [x] Thiết kế provider operation label; mapping endpoint-provider hoàn chỉnh ở Batch 3 khi instrument.
- [x] Thiết kế cách đếm request provider khi cache lạnh.
- [x] Thiết kế cách đếm request provider khi cache còn hiệu lực.
- [x] Chốt cache outcome và yêu cầu ghi cache scope/TTL.
- [x] Chốt HTTP/provider duration metric.
- [x] Chốt error, retry và status classification.
- [x] Để credit/compute unit trong artifact; cách quy đổi research ở Batch 5.
- [x] Có ca concurrent stale để phát hiện cache stampede.

### Bộ dữ liệu benchmark

- [x] Token khởi đầu: PENGU, mint `2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv`.
- [x] Wallet hoạt động mạnh khởi đầu: `Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt`.
- [x] Smoke-test Token Fundamentals ngày 2026-07-17 trên 12 token Solana; SOL và PYTH là hai mẫu dương có dữ liệu thật để giữ trong deep subset.
- [ ] Xác định chính xác asset/network/address của AVAX từng dùng demo; không tự giả định một địa chỉ vì AVAX là tài sản native của Avalanche và Yoca đang phân tích Solana.
- [x] Xây tập tối thiểu **24 token Solana**; snapshot warm compatibility ngày 2026-07-18 có 24 token từ seed và Jupiter verified candidates.
- [ ] Trong 24 token phải có: token thanh khoản cao, token cộng đồng/meme, token cũ, token mới, token ít thanh khoản, token có trường nullable/metadata thiếu và token từng làm Yoca lỗi hoặc không có dữ liệu.
- [x] Xây tập tối thiểu **24 wallet Solana**; snapshot discovery ngày 2026-07-18 lấy từ 149 candidate và tiền kiểm 60 địa chỉ bằng Helius.
- [ ] Trong 24 wallet phải có: ví hoạt động cao, trung bình, thấp, gần như rỗng, nhiều token spam/dust, lịch sử giao dịch dài và wallet từng làm Yoca lỗi hoặc trả dữ liệu mâu thuẫn.
- [ ] Tìm candidate ví hoạt động mạnh từ GMGN và Birdeye Profitable Traders, sau đó xác minh địa chỉ và hoạt động bằng một nguồn độc lập trước khi đưa vào dataset.
- [ ] Ghi nguồn và thời điểm chọn wallet; không xem nhãn profitable trader của một provider là ground truth.
- [ ] Ví hoặc token dùng cho Wash Trading.
- [ ] Prompt AI cố định để so sánh token usage và latency.

### Hai tầng kiểm tra dữ liệu

Không chạy mọi phép benchmark nặng trên toàn bộ 24 token và 24 wallet.

#### Tầng 1 — Compatibility sweep

- [ ] Chạy các endpoint lõi trên toàn bộ dataset 24+24.
- [ ] Ghi trạng thái theo ma trận độ phủ dữ liệu.
- [ ] Phát hiện lỗi validation, nullable, mapping, thiếu provider coverage và dữ liệu mâu thuẫn.
- [ ] Giới hạn concurrency và quota; sweep này ưu tiên độ phủ hơn latency chính xác.

#### Tầng 2 — Deep benchmark

- [ ] Chọn 6-8 token và 6-8 wallet đại diện cho các nhóm ở Tầng 1.
- [x] Hoàn thành pilot cold/warm có kiểm soát trên một token và một wallet ổn định; DB được `db:reset` ngay trước lượt cold, sau đó lặp lại cùng journey trên DB warm.
- [ ] Mở rộng cold/warm sang tập sâu 6-8 token và 6-8 wallet; sau đó mới chạy repeated access và concurrent access.
- [ ] Đo latency, external request, credit/token usage, retry, error và database connection.
- [ ] Chỉ dùng tập sâu này để suy ra cost per journey; toàn bộ dataset dùng để đánh giá độ tương thích, không dùng để nhân trung bình một cách máy móc.

### Tự động tìm candidate token và wallet

Nhóm không phải copy thủ công hàng trăm địa chỉ. Tạo một discovery workflow riêng, chỉ thu địa chỉ công khai và metadata cần cho việc chọn mẫu.

#### Candidate token

- [x] Thu 213 token candidate từ seed cùng Jupiter top organic, trending và recent; Jupiter chỉ dùng cho discovery, kết quả coverage lấy từ API Yoca.
- [ ] Lấy base token/quote token từ pool, chuẩn hóa mint và loại stablecoin/wrapped native bị lặp khi cần.
- [ ] Gắn nguồn, thời điểm thu thập, liquidity, volume, tuổi pool và trạng thái metadata.
- [x] Deduplicate theo mint; giữ SOL, PYTH, PENGU và các token nhóm cung cấp làm seed bắt buộc.
- [ ] Chia candidate thành nhóm thanh khoản/tuổi/độ đầy đủ dữ liệu trước khi chọn 24 token compatibility.

#### Candidate wallet

- [ ] Lấy candidate wallet từ trader/holder positions của các token thanh khoản, recent pool trades và các danh sách profitable trader có quyền truy cập hợp lệ.
- [ ] Không lấy LP, program account, token account hoặc địa chỉ hệ thống làm user wallet nếu chưa phân loại rõ.
- [x] Xác minh hoạt động gần đây bằng mẫu tối đa 100 Enhanced Transactions của Helius; tập được chọn gồm 17 ví hoạt động cao, 2 trung bình và 5 thấp.
- [ ] Gắn nguồn phát hiện, token liên quan, recency, số giao dịch mẫu và dấu hiệu spam/dust.
- [x] Deduplicate theo wallet address; giữ wallet nhóm cung cấp làm seed và loại ví arbitrage bot mà Mobula không hỗ trợ ổn định.
- [x] Thu 149 candidate từ holder đã lưu, sau đó phân tầng để chọn 24 wallet compatibility.

#### Quy tắc quota và nguồn

- [ ] Discovery ưu tiên endpoint danh sách/batch đang có trong Yoca; không gọi full history cho mọi candidate.
- [ ] Chỉ chạy một request preflight nhỏ cho mỗi candidate trước khi chọn tập compatibility.
- [ ] Không scrape hoặc dùng API không công khai của GMGN nếu điều khoản và độ ổn định chưa được xác nhận.
- [ ] Không dùng nhãn profitable/PnL từ Birdeye, Mobula hay GMGN như ground truth; đây chỉ là tiêu chí tìm candidate.
- [ ] Lưu snapshot candidate thành artifact có ngày tạo để benchmark có thể tái lập dù bảng xếp hạng online thay đổi.

### Ma trận độ phủ dữ liệu

Mỗi token/wallet phải được kiểm tra theo từng module, không chỉ đánh dấu toàn trang là “chạy được”:

- [ ] Metadata và market data.
- [ ] Pool và giao dịch gần đây.
- [ ] Holder data.
- [ ] Portfolio/positions.
- [ ] Total balance chart và per-token chart.
- [ ] Transfer/swap history.
- [ ] PnL và win rate.
- [ ] Tokenomics nếu asset có dữ liệu phù hợp.
- [ ] Wash Trading nếu đủ dữ liệu đầu vào.
- [ ] AI context nếu module hỗ trợ.
- [x] Lập cost profile và quota AI v0 theo từng module tại `AI_TIER_COST_MODEL_2026-07-19.md`; không dùng một mức tăng đồng loạt cho mọi tính năng.

Kết quả phải phân biệt: có dữ liệu, không có dữ liệu hợp lệ, provider không hỗ trợ, lỗi mapping/validation, lỗi quota/rate limit và lỗi nội bộ.

### Snapshot Token Fundamentals — 2026-07-17

Nguồn địa chỉ: danh sách token đã xác minh của Jupiter/Solana và các mint nhóm đã dùng. Đây là snapshot kiểm thử provider, không phải cam kết rằng Mobula luôn giữ nguyên độ phủ dữ liệu.

- [x] **SOL** — `So11111111111111111111111111111111111111112`: có 8 nhóm phân bổ, 22 nhà đầu tư, chưa có lịch mở khóa.
- [x] **PYTH** — `HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3`: có 5 mốc mở khóa, 19 nhà đầu tư, chưa có phân bổ.
- [x] **PENGU** — `2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv`: phản hồi rỗng hợp lệ.
- [x] **JUP** — `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`: phản hồi rỗng hợp lệ.
- [x] **USDC** — `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`: phản hồi rỗng hợp lệ.
- [x] **BONK** — `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`: phản hồi rỗng hợp lệ.
- [x] **JTO** — `jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL`: phản hồi rỗng hợp lệ.
- [x] **mSOL** — `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So`: phản hồi rỗng hợp lệ.
- [x] **JitoSOL** — `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn`: phản hồi rỗng hợp lệ.
- [x] **FIDA** — `EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp`: phản hồi rỗng hợp lệ.
- [x] **soETH** — `2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk`: phản hồi rỗng hợp lệ.
- [x] **WBTC (Wormhole)** — `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh`: phản hồi rỗng hợp lệ.
- [x] Gọi lại SOL và PYTH trong thời hạn freshness đều trả `200` từ dữ liệu đã lưu, không phát sinh outbound Mobula request.
- [ ] Khi chạy regression, ít nhất SOL và PYTH phải trả một nhóm fundamentals có dữ liệu; nếu cả hai cùng rỗng, kiểm tra thay đổi độ phủ/gói API của Mobula trước khi kết luận lỗi mapping.
- [x] Mở rộng thành 24 token và chạy metadata, market, pools, holders, fundamentals: 120/120 phản hồi hợp lệ, gồm 101 `data` và 19 `empty_valid`; đây là warm compatibility, chưa thay cho cold benchmark.
- [x] Nâng discovery script bằng validator riêng cho từng module, timeout 45 giây, phân loại transport/server/upstream, item count, checkpoint atomic và timestamp trong filename.
- [x] Chạy lại hai lượt trên 24 token: 24/24 core-qualified, không có classification hoặc item-count thay đổi. Artifact: `benchmark-results/datasets/token-benchmark-stable-2026-07-19.json`.
- [x] Tách Fundamentals khỏi điều kiện core: SOL, PYTH, HNT, RAY và ORCA có tokenomics; 19 token còn lại rỗng hợp lệ, không bị gắn nhãn lỗi.
- [!] Pools là module chậm nhất ở lượt warm, trung bình khoảng 5,0 giây. Holders không nhanh hơn ở lượt warm; không diễn giải cache hit chỉ từ chênh lệch latency.
- [ ] Chọn 5–8 token đại diện để chạy provider refresh/cold benchmark sau khi xác định được cơ chế force hoặc làm stale có kiểm soát; không reset toàn database.

### Quy tắc chạy

- Mỗi ca ghi rõ thời gian, commit, cấu hình và trạng thái cache.
- Không log secret, session token, API key hoặc nội dung riêng tư.
- Tách lần chạy provider thật với lần chạy mock.
- Không dùng một lần chạy duy nhất để kết luận latency.
- Không tạo tải cao vào provider thật nếu chưa kiểm tra quota và điều khoản sử dụng.

**Decision gate 2:** đặc tả đã hoàn thành; chờ nhóm duyệt tám quyết định tại cuối `BENCHMARK_OBSERVABILITY_DESIGN.md` trước Batch 3.

### Snapshot Wallet Discovery — 2026-07-18

- [x] Artifact cũ `benchmark-results/datasets/wallets-2026-07-18.json` được giữ làm dữ liệu sàng lọc, không phải tập 24 ví ổn định.
- [x] Script hiện ghi artifact mới theo tên `wallet-candidates-YYYY-MM-DD.json`, đồng thời tách `coverageQualifiedWallets` khỏi toàn bộ ứng viên.
- [x] Có checkpoint theo từng batch tại `wallet-discovery-checkpoint.json`; chỉ xóa checkpoint sau khi ghi artifact hoàn chỉnh.
- [x] Loại `3nMNd89AxwHUa1AFvQGqohRkxFEQsTsgiEyEyqXFHyyH` vì Mobula không cung cấp coverage ổn định cho ví arbitrage bot này.
- [x] Nguồn ứng viên ưu tiên chủ ví của giao dịch gần đây và profitable trader; top holder chỉ là nguồn dự phòng vì thường lẫn vault, authority, sàn và giao thức.
- [x] Lượt mới nhất sàng lọc 68 ứng viên: 6 có swap, 50 rỗng hợp lệ và 12 timeout. Trong 24 ứng viên được kiểm tra đầy đủ, chỉ 5 ví có dữ liệu ở cả Overview, Portfolio, Transfers, Swaps và Identity.
- [x] Loại khỏi tập người dùng các địa chỉ đã xác định là Kamino Reserve, Kraken Hot Wallet, Save Lending Authority và Jupiter Perps Vault Authority; giữ riêng làm stress/negative case.
- [x] Dùng Birdeye Gainers/Losers raw API với `limit=100` cho các khung `today`, `1W`, `30d`, `90d`; khử trùng 400 kết quả thành 288 ứng viên. PnL Birdeye chỉ là metadata khám phá, không phải chuẩn đối chiếu PnL Mobula.
- [x] Hoàn thành 24 ví warm-stable tại `benchmark-results/datasets/wallet-benchmark-stable-2026-07-19.json`; tất cả có Overview, Portfolio, Transfers và Swaps không rỗng, Identity đúng cấu trúc qua lượt lặp.
- [x] Chuyển Ansem (`GV6...`) sang stress case vì Overview và Portfolio tiếp tục timeout; thay bằng `H7PK...`, có 65 token, 20 swap, 20 transfer và qua lượt warm-repeat.
- [x] Chạy mixed refresh trên 8 ví đại diện: Overview/Portfolio dùng `force=1`, Transfers/Swaps theo stored-range, Identity theo TTL; 8/8 ví thành công. Artifact: `benchmark-results/datasets/wallet-benchmark-mixed-refresh-2026-07-19.json`.
- [!] Chưa gọi lượt trên là full cold benchmark: shell hiện trỏ database `localhost:5432` nên không thể làm stale metadata của database mà server đang dùng. Query thất bại trước khi xóa hàng; không có dữ liệu bị thay đổi.
- [ ] Chỉ chạy full cold/stale benchmark khi môi trường script và server cùng database; không `db:reset` toàn bộ database.
- [!] Timeout và phản hồi rỗng không được xem là coverage ổn định. Kết quả phải lưu riêng candidate, stable user-like, stress case và negative case.

## Batch 3 — Instrumentation tối thiểu

Mục tiêu: thu số liệu mà không thay đổi hành vi nghiệp vụ.

- [x] Rà type và đường đi thật của lớp provider/cache trước khi viết code.
- [x] Chọn `pFetch`/`rlFetch` và request context làm điểm tập kết; service chỉ khai báo data usage có ngữ nghĩa.
- [x] Tạo correlation ID cho request; benchmark journey ID vẫn để batch client/runner.
- [x] Ghi provider attempt count, latency, retry, status và outcome bằng Prometheus-compatible metrics.
- [!] Không tạo domain/cache/storage ID. Số liệu cost dùng Hono route template, `provider.svc.operation` và fact do service đăng ký.
- [x] Thêm `memory_result` cho bốn in-memory data cache reachable; migration sang PostgreSQL không còn là gate cứng.
- [x] Tổng hợp request từ các fact `db`, `memory`, `provider` hoặc tổ hợp; giữ `forced_refresh` và `stale_fallback` riêng.
- [x] Cho phép bật/tắt bằng `API_METRICS_ENABLED`; `/metrics` mặc định 404 và production bắt buộc Bearer token.
- [x] Aggregate metrics không ghi secret, payload, URL, query, address hoặc request ID; HTTP label dùng Hono route template.
- [ ] Viết kiểm tra cho logic tổng hợp metrics nếu logic này được giữ trong code.
- [ ] Rà overhead để instrumentation không làm sai đáng kể kết quả latency.

- [x] Cài `prom-client@15.1.3` trong workspace server và thêm HTTP/provider counter + histogram.
- [x] Runtime check trên port 4000: endpoint tắt trả 404, sai/thiếu Bearer token trả 401, token đúng trả 200; `/metrics` không tự làm tăng HTTP counter.
- [x] Dựng Prometheus 3.11 local bằng Docker Compose, lưu dữ liệu bảy ngày và chỉ mở UI trên localhost.
- [x] Kiểm tra end-to-end: target `yoca-server` chuyển `UP` và query được `yoca_http_requests_total` sau request thật.
- [x] Dựng Grafana 12.1.1 local, provision Prometheus datasource và dashboard Yoca gồm 13 panel cho HTTP, provider, data usage, refresh/fallback, retry và AI token; chỉ mở UI trên localhost.
- [x] Instrument Gemini theo operation/model với request, input/output/cached/thinking/total token, latency và outcome; không lưu prompt hoặc response.
- [x] Chuyển hai implementation Brave Search sang `pFetch`, tách News/Web operation và đặt retry bằng 0 để lỗi không tự nhân chi phí request.

### Quyết định về in-memory data cache

- [x] Chốt PostgreSQL là nơi lưu data/result cache ưu tiên; không thêm Redis hoặc in-memory data cache mới.
- [x] Xác định bốn vi phạm/ứng viên cần xử lý: exchange rates, Wallet Token AI Analysis, Wash Trading transaction input và RSS OpenGraph image lookup.
- [!] Không nhầm SDK/Gemini client singleton, request-local `Map`, throttle, auth challenge, API-key usage state hoặc in-flight coalescing với data cache.
- [x] Instrument bốn cache hit bằng `memory_result`; Exchange Rates runtime check cho đúng một provider request và một memory hit.
- [ ] Migrate từng data cache khi lợi ích đủ lớn và có thể giữ nguyên hành vi người dùng; không trộn migration vào analytics batch.
- [x] Chuyển Helius Enhanced Transactions và các RPC call của Wash Trading sang `pFetch`, với operation ID riêng cho từng loại request.
- [x] Gemini SDK và Brave Search đã có transport/metric adapter phục vụ cost dashboard; OpenGraph được loại khỏi cost model vì không dùng API trả phí.

File cụ thể chỉ được chốt sau khi đọc source và type hiện tại. Mọi thay đổi code phải được nhóm duyệt trước.

**Decision gate 3:** nhóm xem diff instrumentation trước khi chạy benchmark.

## Batch 4 — API testing và performance testing

Mục tiêu: tách đúng các loại kiểm tra, không gọi mọi thứ là stress test.

### Functional/contract test

- [ ] Dùng Vitest hiện có để kiểm tra validation, ownership, nullable data, mapping provider và error handling.
- [ ] Mock provider để test có thể tái lập và không tốn quota.
- [ ] Chọn một số endpoint quan trọng thay vì cố bao phủ toàn bộ server.

### Integration benchmark

- [x] Chạy server và database thật trong môi trường kiểm soát.
- [x] Gọi provider thật ở quy mô pilot để xác nhận đường tích hợp.
- [x] So sánh cold và warm trên pilot Token Overview + Wallet Core. Artifact: `benchmark-results/runs/2026-07-19T06-15-38-732Z_journey-cold/`.
- [x] Pilot đạt 24/24 endpoint-pass 2xx, không retry: Token Overview giảm 18.671 ms xuống 1.277 ms và provider attempt giảm 17 xuống 0; Wallet Core giảm 5.738 ms xuống 826 ms và provider attempt giảm 7 xuống 0.
- [x] Đóng bốn instrumentation gap tại token details, holder stats, market chart và pool trades. Lượt kiểm tra sau sửa có 0/12 route `source=none`; artifact: `benchmark-results/runs/2026-07-19T06-21-50-093Z_journey-observed/`.
- [x] Xác nhận tracker phân biệt được các nhánh thực tế trong cùng lượt: `db` cho details/holder stats, `db_provider` cho chart stale được nối thêm dữ liệu mới, và `provider` cho pool trades refresh.
- [x] Chạy lại cold/warm sau khi thêm single-flight: Token Overview giảm từ 18.633 ms và 16 provider attempt xuống 1.268 ms và 0 attempt; Wallet Core giảm từ 6.486 ms và 7 attempt xuống 814 ms và 0 attempt. Artifact: `benchmark-results/runs/2026-07-19T09-01-00-323Z_journey-cold/` và `benchmark-results/runs/2026-07-19T09-03-47-373Z_journey-cold/`.
- [x] Xác nhận refresh holder đồng thời chỉ còn một `mobula.svc.token_holders`; request Win Rate dùng chung refresh Wallet Analysis 30D với Overview. Bốn Wallet Analysis attempt còn lại ứng với bốn kỳ 24H, 7D, 30D và 90D, không phải bốn request trùng khóa.
- [x] Xử lý hai `helius.svc.wallet_balances` trùng nhau bằng cách để Overview dùng chung portfolio database-first và single-flight theo địa chỉ. Run ba ví sau reset chỉ còn một Helius balances call mỗi ví; warm repeat là 0. Artifact: `benchmark-results/runs/2026-07-19T10-39-16-547Z_journey-cold/`.
- [x] Chạy Market Radar observed-first sau lượt reset gần nhất: 6/6 endpoint, 22.023 ms, 22 provider attempt và 2 retry; warm repeat 695 ms, 0 provider attempt. Artifact: `benchmark-results/runs/2026-07-19T09-06-48-529Z_journey-observed/`.
- [x] Đo fan-out Market Radar hiện tại: 17 CoinGecko call cho một lượt refresh; Birdeye thành công tương ứng 135 CU, còn request lỗi/retry chưa cộng vào CU khi chưa xác nhận chính sách tính phí.
- [x] Thêm Wallet Activity journey đúng hành vi client: swaps và transfers chạy đồng thời, không truyền limit nên mỗi nhánh có thể quét tối đa 10 trang x 100 giao dịch.
- [x] Observed-first Wallet Activity đạt 2/2 endpoint trong 20.592 ms với 15 Mobula calls; warm repeat 1.260 ms và 0 provider call. Artifact: `benchmark-results/runs/2026-07-19T09-35-25-204Z_journey-observed/`.
- [x] Loại duplicate refresh của swaps/transfers bằng ba lớp nhỏ: client chỉ tải tab đang mở, Mobula page-level single-flight, và coverage metadata được ghi cho cả hai dataset từ cùng provider response.
- [x] Mở rộng Wallet Activity thêm hai ví: hai ví mới mỗi ví dùng 2 Mobula calls; ba observed samples hiện là 2, 2 và 15, chứng minh fan-out phụ thuộc mật độ giao dịch.
- [x] Thêm Wallet Token Chart journey chọn ba token: observed-first 6.469 ms với một Zerion fungible lookup + ba chart calls; warm repeat 810 ms và 0 provider call. Artifact: `benchmark-results/runs/2026-07-19T09-38-14-672Z_journey-observed/`.
- [x] Loại Moralis wallet swaps khỏi runtime journey model: `fallow --trace` xác nhận export `fetchMoralisSolanaSwap` unused; client production dùng Mobula-backed swaps history.
- [x] Chốt Wash Trading on-chain bound từ đường code production mà không lách auth/Gemini quota: Enhanced-success 100 Helius credits; RPC fallback đầy đủ tối đa 176 credits gồm Enhanced attempt + 76 Standard RPC calls.
- [x] Tách webhook khỏi page journey: management 100 Helius credits/lần cấu hình, delivery 1 credit/event; chưa có event-rate quan sát vì database không lưu toàn bộ webhook deliveries.
- [x] Regression Wallet Activity trên đúng ví baseline nặng: concurrent observed-first giảm 15 xuống 10 Mobula calls, warm repeat 0; cả hai route được phân loại `db_provider`. Artifact: `benchmark-results/runs/2026-07-19T09-59-59-065Z_journey-observed/`.
- [x] Sequential tab regression trên ví mới: Swaps dùng 6 Mobula pages, Transfers sau đó đọc database và không gọi provider; artifact `benchmark-results/runs/2026-07-19T09-57-56-592Z_journey-observed/`.

### Load test

- [ ] Đo tải đồng thời ở endpoint đã cache hoặc dùng provider mock trước.
- [ ] Theo dõi p50, p95, error rate và throughput.
- [ ] Kiểm tra stampede khi cache hết hạn.
- [ ] Không bắn tải cao trực tiếp vào external API.
- [ ] Đo database connection pool, query latency và lỗi kết nối dưới tải.
- [ ] So sánh direct/session/transaction pooler chỉ khi connection string hiện tại cho phép và có môi trường tách biệt.

### Stress test

- [ ] Chỉ thực hiện nếu nhóm cần tìm ngưỡng suy giảm hoặc điểm lỗi.
- [ ] Xác định trước stop condition để tránh làm hỏng database hoặc hết quota.
- [ ] Không bắt buộc cho cost model nếu load test có kiểm soát đã đủ trả lời câu hỏi.

Khuyến nghị công cụ ban đầu:

- Vitest cho functional/contract test vì repository đã sử dụng.
- `k6` nếu cần kịch bản tải, threshold và báo cáo rõ ràng; `autocannon` nếu chỉ cần benchmark HTTP Node.js gọn nhẹ.
- Không thêm cả hai nếu một công cụ đã đáp ứng mục tiêu.

**Decision gate 4:** nhóm chọn có làm load/stress test hay dừng ở benchmark cold/warm cache.

Đã chốt cần load test. Stress test đến điểm lỗi chỉ thực hiện sau khi load test an toàn hoàn tất và nhóm duyệt stop condition.

### Supabase cần khảo sát riêng

- [x] Local `server/.env` đang dùng Supavisor session mode, port 5432; không ghi connection string/secret vào tài liệu.
- [!] `postgres.js` đang cấu hình `max: 10` connection cho mỗi server process, trong khi comment trong code nói pool size 15. Nếu chạy hai server process, tổng pool danh nghĩa có thể lên 20 và cạnh tranh pool session; phải xác nhận pool size thật trên Supabase Dashboard thay vì tin comment.
- [ ] Xác nhận Render runtime dùng cùng pool mode với local mà không ghi lộ secret.
- [ ] Đối chiếu `postgres` client pool hiện tại (`max: 10`) với pool size và giới hạn project thực tế.
- [ ] Kiểm tra long-running transaction hoặc connection leak; Drizzle không tự áp giới hạn hai connection, pool được quản lý bởi `postgres.js`.
- [ ] Chỉ thử Supavisor transaction mode khi có benchmark riêng; nếu dùng port 6543 phải cấu hình `prepare: false` theo tài liệu Supabase vì transaction mode không hỗ trợ prepared statements.
- [ ] Đo số connection hoạt động/idle bằng Supabase Observability hoặc `pg_stat_activity` trong benchmark.
- [ ] Đo query latency, transaction latency, connection wait và error rate.
- [ ] Theo dõi database size, egress và read-only threshold của Free plan.
- [ ] Ghi nhận hành vi project pause sau thời gian không hoạt động.
- [ ] Không giả định Supabase Free chỉ hỗ trợ hai kết nối đồng thời: theo tài liệu chính thức ngày 2026-07-17, Nano có 60 direct connections và tối đa 200 pooler clients; con số hai là số project Free đang hoạt động được cấp cho một tài khoản/tổ chức theo quy tắc của Supabase.

### Kế hoạch kiểm tra Session Pooler thực tế

- [ ] Ghi lại pool size thực tế từ Supabase Dashboard của project benchmark.
- [ ] Ghi `SHOW max_connections` và snapshot `pg_stat_activity` trước khi chạy; không lưu credential hoặc project secret vào artifact.
- [ ] Chạy baseline một server process, không tải, để xác định số connection idle/active.
- [ ] Tăng concurrency theo từng nấc nhỏ trên endpoint chỉ dùng database hoặc provider mock.
- [ ] Ở mỗi nấc, ghi active connection, connection wait/timeout, query latency p50/p95, throughput và error rate.
- [ ] Chạy lại trên endpoint có transaction đọc/ghi đại diện.
- [ ] Nếu baseline một process ổn, mô phỏng hai server process cùng dùng database benchmark để kiểm tra giả thuyết `max: 10` mỗi process cạnh tranh pool session.
- [ ] Có stop condition trước khi chạy: dừng khi error rate tăng, connection timeout xuất hiện, latency vượt ngưỡng đã chốt hoặc Supabase báo resource pressure.
- [ ] Không đổi Session sang Transaction mode trong cùng đợt đo. Chỉ tạo benchmark so sánh riêng nếu kết quả chứng minh Session mode là bottleneck.
- [ ] Kết luận phải phân biệt giới hạn từ app pool (`postgres.js`), Supavisor pool, Postgres compute và query/schema.

Nguồn cần dùng khi viết kết quả: Supabase Compute and Disk, Connecting to Postgres, Connection Management, Pricing và Free Project Pausing; ghi lại ngày truy cập khi chốt báo cáo.

## Batch 5 — Nghiên cứu provider và quy đổi chi phí

Mục tiêu: biến số request đo được thành chi phí có căn cứ.

- [x] Chỉ giữ CoinGecko/GeckoTerminal, Birdeye, Helius, Mobula, Zerion, Moralis và các provider thật sự còn dùng trong runtime catalog.
- [x] Đối chiếu endpoint runtime với free tier hiện tại và nguồn chính thức; các tier trả phí chỉ bổ sung khi cần xác định ngưỡng nâng cấp.
- [x] Ghi ngày truy cập và nguồn trong `PROVIDER_QUOTA_RESEARCH_CHECKLIST.md`.
- [x] Xác định request, credit hoặc compute unit cho toàn bộ operation trong runtime catalog v0; giữ fan-out riêng ở cấp journey.
- [x] Ghi quota theo kỳ và throughput khả dụng theo tài liệu, response header, usage endpoint hoặc dashboard; các giới hạn chưa kiểm chứng vẫn được đánh dấu rõ.
- [x] Loại multi-key/key rotation khỏi cost model, slide, benchmark và phương án scale.
- [!] Source vẫn dùng `ApiKeyManager` round-robin trong Birdeye, Moralis và Helius helpers. Key hiện tại có thể chỉ chứa một giá trị, nhưng implementation vẫn chấp nhận danh sách phân tách bằng dấu phẩy; cost model không tính lợi ích cộng quota từ cơ chế này. Việc bỏ rotation cần một diff riêng vì ảnh hưởng shared provider utilities.
- [ ] Khi vượt quota, chỉ đánh giá các hướng có thể bảo vệ: cache, request coalescing, batching, throttling/queue, giảm refresh không cần thiết và nâng gói chính thức phù hợp.
- [x] Chốt quy tắc cảnh báo/nâng gói theo projected quota, headroom, peak throughput, 429/error rate và provisional latency SLO tại `benchmark-results/JOURNEY_COST_INPUTS_2026-07-19.md`.
- [ ] Xác định gói nâng cấp hợp lý và thay đổi kỹ thuật cần thiết sau khi ba kịch bản traffic cho thấy provider nào chạm ngưỡng trước.
- [-] Đối chiếu Gemini theo input/output token thực tế: Token AI, General/Wallet Chat, Wash Trading AI, Chart News và Volatility đã có pilot; cần chạy phân phối nhiều mẫu. Các Wallet AI modal không còn được tính trong runtime pricing.
- [x] Xác nhận Brave Search tính 5 USD/1.000 request, có 5 USD credit miễn phí mỗi tháng; vượt mức chuyển thẳng sang pay-as-you-go.
- [x] Xác nhận Gemini Paid Tier tính theo input/output token của từng model; Free Tier không có một quota chung cố định và phải đọc giới hạn project/model trong AI Studio.
- [x] Loại OpenGraph image lookup khỏi cost model chi tiết vì không dùng API trả phí; ảnh hưởng nhỏ được hấp thụ trong chi phí hosting chung.
- [ ] Research AI mã nguồn mở và hosting bằng nguồn chính thức hoặc nguồn có thể kiểm chứng.

**Decision gate 5:** nhóm duyệt bảng provider và các giả định còn thiếu trước khi tính tiền.

## Batch 6 — Mô hình chi phí theo kịch bản

Mục tiêu: nối kết quả đo với các giả định kinh doanh.

- [x] Định nghĩa đầy đủ MAU khi xuất hiện lần đầu.
- [x] Gộp khách chưa đăng nhập và tài khoản đăng nhập trong MAU cost model; doanh thu chỉ lấy từ payer mix. Việc nhận diện anonymous user được giữ làm yêu cầu analytics tương lai.
- [x] Giữ 300, 3.000 và 30.000 MAU làm ba lát cắt trình bày; calculator quét liên tục để breakpoint không bị khóa vào ba mốc.
- [x] Chốt session/user/tháng và tỷ lệ truy cập từng hành trình dưới dạng giả định trong ba demand profile.
- [x] Không dùng một cache hit ratio chung; xây theo loại tài nguyên và hành vi truy cập.
- [x] Tính request/credit/provider/tháng bằng công thức có thể kiểm tra.
- [x] Chốt một kịch bản cơ sở duy nhất để nhóm dễ theo dõi; thay trực tiếp giả định khi có analytics thật.
- [x] Tính data, AI, hosting, database và phí thanh toán ở mức phù hợp với cost scenario.
- [x] Gọi đúng tên biên đóng góp; không gọi phần còn lại là lợi nhuận ròng.
- [x] Loại các bảng độ nhạy khỏi tài liệu bàn giao để tránh nhiều nhánh giả định song song.
- [ ] Thay sample cost của Chart News, Volatility và Wash Trading Chat bằng median/p95 sau benchmark.

## Batch 7 — Pricing và mô hình doanh thu

Mục tiêu: định giá theo giá trị và đối tượng sử dụng, không chỉ lấy chi phí cộng biên lợi nhuận.

- [x] Xác định chân dung người dùng Free, Lite, Plus và Pro.
- [x] Viết giá trị tăng thêm của mỗi tier.
- [x] Cấu trúc pricing chỉ liệt kê phần khác biệt so với tier trước.
- [x] Chốt giá đề xuất tháng 39/79/149 USD và năm bằng 10 tháng sử dụng cho 12 tháng.
- [x] Đối chiếu đối thủ theo nhóm tính năng và đối tượng, không chỉ so con số giá.
- [x] Chốt payer conversion cơ sở 2%: 1,25% Lite, 0,5% Plus và 0,25% Pro.
- [x] Tính doanh thu và biên đóng góp theo ba lát cắt MAU và ba demand profile.
- [x] Xác định nguồn vốn hiện tại là nguồn lực tự có của nhóm; chi phí nâng cấp là kịch bản từ doanh thu, chưa phải vốn đã huy động.
- [x] Đồng bộ giá, quota AI và quyền lợi Wash Trading vào Pricing UI và entitlement.
- [!] Xác nhận thủ công Stripe Price ID tháng/năm trên dashboard trước khi mở thanh toán thật; giá nằm sau environment ID nên repo không tự kiểm chứng được.
- [ ] **DEV-ONLY:** Hoàn thiện Alert entitlement: Free 0; Lite 2 ví/3 rule/100 event; Plus 5/10/500; Pro 15/30/2.000. Counter phải nằm trong database và không chặn password reset.
- [ ] **DEV-ONLY:** Instrument Resend/Discord delivery, quota header và rate limit; calculator đã dành 0/20/20 USD cho ba mốc MAU.
- [ ] **DEV-ONLY:** Smoke test Wash Trading Chat locked/limit/release và hoàn thiện cách UI diễn giải 401/403/429 trước khi xem là hoàn tất.

## Batch 8 — Nội dung bàn giao và phản biện

Mục tiêu: chuyển nghiên cứu kỹ thuật thành nội dung mà nhóm hiểu và trình bày được.

- [x] Bản phân tích nội bộ có công thức, nguồn và kết quả benchmark.
- [x] Chốt nội dung Business Model trong bộ ba slide, không chứa lịch sử agent hoặc đường dẫn source.
- [x] Một bảng Pricing tháng/năm, diff-only.
- [x] Một sơ đồ nguồn chi phí từ hành trình người dùng đến provider.
- [x] Một bảng ba kịch bản MAU và chi phí/doanh thu; calculator và phân tích độ nhạy có thể chạy lại.
- [ ] Một slide AI in-house với điều kiện chuyển đổi rõ ràng.
- [x] Bộ câu hỏi phản biện trọng tâm về dữ liệu, cache, provider, hạ tầng và pricing trong developer handbook.
- [ ] Mỗi khẳng định trong slide có người trong nhóm giải thích được căn cứ.
- [x] Tách bản hướng thầy và developer handbook; báo cáo cuối LaTeX chỉ cập nhật khi nhóm chủ động yêu cầu.

## Decision gate — hiệu chỉnh mô hình AI và tài chính 2026-07-24

**CHƯA ĐƯỢC CẬP NHẬT BÁO CÁO, SLIDE HOẶC PDF** cho đến khi hoàn thành toàn bộ các kiểm tra dưới đây. Các con số trong mục này là working assumptions để tính thử, không phải kết luận đã chốt.

### Conversion benchmark và giả định Yoca

- [x] ChartMogul/ProductLed Conversion Report 2026 khảo sát 200 sản phẩm phần mềm và định nghĩa conversion là tỷ lệ free signup trở thành khách hàng trả phí trong sáu tháng. Báo cáo ghi nhận freemium self-serve ở mức 3-5% là `good`, 8-12% là `great`; 25% sản phẩm freemium nằm dưới 2,5%. Nguồn: https://chartmogul.com/reports/saas-conversion-report/, khảo sát ngày 2026-07-24.
- [x] First Page Sage 2026 tổng hợp dữ liệu 2022-2026 từ hơn 80 khách hàng SaaS: traditional freemium trung bình 3,7% free-to-paid và nhóm Financial/Fintech là 4,1%. Nguồn: https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/, khảo sát ngày 2026-07-24.
- [x] Stripe lưu ý conversion freemium thường ở mức một chữ số thấp và mỗi người dùng Free vẫn tạo chi phí server, support và phát triển. Nguồn: https://stripe.com/resources/more/freemium-pricing-explained, khảo sát ngày 2026-07-24.
- [ ] Dùng 2% làm baseline ứng viên của Yoca. Đây là mức thấp hơn vùng `good` 3-5% và chưa phải conversion quan sát được từ người dùng thật.
- [ ] Giữ một tỷ lệ 2% tại cả ba mốc hay tăng theo độ trưởng thành chỉ được quyết định sau khi xem lại doanh thu, lương và ngân sách tái đầu tư.
- [x] Cơ cấu ứng viên trong nhóm trả phí: 80% Lite, 15% Plus và 5% Pro.
- [x] Lương ứng viên ở giai đoạn 30.000 MAU: tám nhân sự, bình quân 8 triệu đồng/người/tháng.

### Qwen3-8B và self-hosted inference

- [x] Ứng viên duy nhất để phân tích là Qwen3-8B: 8,2B tham số, Apache 2.0, context native 32.768 token, hỗ trợ vLLM/SGLang và tool calling theo model card. Nguồn: https://huggingface.co/Qwen/Qwen3-8B, khảo sát ngày 2026-07-24.
- [x] Trọng số BF16 công bố khoảng 16,4 GB; bản GGUF Q4_K_M khoảng 5,03 GB. Các kích thước này chỉ chứng minh model có thể nạp vào VRAM phù hợp, không chứng minh throughput production. Nguồn: https://huggingface.co/Qwen/Qwen3-8B và https://huggingface.co/Qwen/Qwen3-8B-GGUF, khảo sát ngày 2026-07-24.
- [x] RunPod L4 có 24 GB VRAM và giá Pod công khai từ 0,39 USD/giờ, tương đương 284,70 USD cho 730 giờ/tháng. Nguồn: https://www.runpod.io/pricing, khảo sát ngày 2026-07-24.
- [x] Kiến trúc ứng viên: Gemini ở 300 và 3.000 MAU; Qwen self-host là inference chính ở lát cắt 30.000 MAU. Gemini chỉ là fallback sự cố, không cộng toàn bộ Gemini thường kỳ cùng GPU.
- [ ] Chưa chốt số GPU. Con số sáu L4 trước đây chỉ là placeholder ngân sách và không được đưa vào báo cáo nếu chưa có capacity model hoặc benchmark.
- [ ] Dựng demand model từ Gemini pilot thật: số invocation, input token, output/thinking token, peak factor và context distribution của từng AI feature.
- [ ] Tính sensitivity cho 1/2/4/6/8/... L4 và xác định số GPU hòa vốn so với Gemini; không đồng nhất khả năng “fit VRAM” với khả năng phục vụ tải.
- [ ] Benchmark Qwen trên GPU tương đương L4 hoặc dùng nguồn benchmark có cùng model, quantization, context và serving runtime. Cần đo prefill throughput, decode throughput, concurrency, p50/p95 latency, error và chất lượng prompt tiếng Việt/tool calling.
- [ ] Chỉ chốt sơ đồ cơ cấu chi phí 30.000 MAU sau khi số GPU, serving overhead, storage, monitoring và fallback budget có căn cứ.

### Thứ tự chốt trước khi viết output

- [ ] Chốt conversion baseline và payer mix.
- [ ] Chạy lại calculator với quota hội thoại mới.
- [ ] Chốt phân bổ nhân sự, marketing, vận hành, tái đầu tư, dự phòng và lợi nhuận; không đặt lợi nhuận mục tiêu rồi điều chỉnh ngược giả định.
- [ ] Chốt Qwen capacity/cost range và chọn một giá trị bảo thủ có thể giải thích.
- [ ] Review toàn bộ con số với nhóm.
- [ ] Sau khi năm bước trên hoàn tất mới cập nhật report Markdown, Typst, slide, PDF và ảnh xuất.

## Bộ công cụ: quyết định sơ bộ

| Nhu cầu | Công cụ ưu tiên | Có bắt buộc không? |
|---|---|---|
| Functional/contract test | Vitest hiện có | Có cho một số service quan trọng nếu nhóm công bố kết quả test |
| Đếm provider call/cache hit | Instrumentation nội bộ nhẹ | Có cho cost model có căn cứ |
| HTTP load test | k6 hoặc autocannon | Tùy decision gate 4 |
| Metrics | OpenTelemetry/Prometheus-compatible | Chỉ khi chọn Mức B/C |
| Dashboard | Grafana | Không bắt buộc |
| Centralized logs | Loki | Chưa cần ở Mức A/B nếu log cục bộ đủ |
| Tracing | OpenTelemetry | Hữu ích nhưng không bắt buộc cho cost model |
| API manual exploration | Bruno/Postman/Insomnia | Tùy thói quen nhóm, không thay cho benchmark tái lập |

## Rủi ro cần kiểm soát

- Benchmark gọi provider thật có thể tốn quota hoặc vi phạm rate limit.
- Xóa/reset cache trên database chung có thể ảnh hưởng người đang dùng.
- Instrumentation quá chi tiết có thể lộ dữ liệu hoặc làm sai latency.
- Load test không cô lập external provider sẽ đo cả biến động mạng và upstream.
- Giá provider thay đổi theo thời gian; mọi bảng giá cần ngày truy cập.
- Các endpoint có thể dùng đơn vị credit khác nhau.
- Log và dashboard không tự tạo ra kết luận; nhóm vẫn phải giải thích phương pháp đo.
- Việc xây observability đầy đủ có thể tiêu tốn thời gian nhiều hơn giá trị đem lại cho đồ án.
- Kết quả PnL của Mobula có thể khác nhãn profitable trader/PnL từ Birdeye do nguồn dữ liệu, phạm vi thời gian và phương pháp tính khác nhau; không được đối chiếu hai con số như thể chúng cùng định nghĩa.
- Một asset chạy được không chứng minh module có độ phủ tốt; benchmark phải ghi cả trường hợp thiếu dữ liệu và lỗi.

## Quy tắc xử lý lỗi phát hiện trong benchmark

Benchmark trước hết dùng để đặc trưng hóa hệ thống, không tự động mở rộng thành một đợt refactor toàn kiến trúc.

- `P0 — chặn demo hoặc sai dữ liệu nghiêm trọng`: dừng, báo nhóm và lập phương án sửa riêng.
- `P1 — mâu thuẫn dữ liệu hoặc lỗi trên luồng chính`: ghi bằng chứng, đánh giá phạm vi ảnh hưởng và xin duyệt trước khi sửa.
- `P2 — hiệu năng, cache hoặc khả năng mở rộng`: đưa vào backlog có số đo; chỉ sửa khi lợi ích và rủi ro rõ.
- `P3 — giao diện, log hoặc code legacy không ảnh hưởng kết quả`: không chen vào batch benchmark.

Mỗi thay đổi sửa lỗi phải có phạm vi file, cách rollback và phép kiểm tra sau sửa. Không gom nhiều refactor kiến trúc vào cùng một diff chỉ vì được phát hiện trong một lần benchmark.

## Backlog kỹ thuật cần xử lý sớm

Backlog này không thuộc trực tiếp Pricing/Business Model nhưng ảnh hưởng độ tin cậy của tracker và phạm vi kiến trúc dùng khi phản biện. Có thể thực hiện xen giữa Batch 2-4 khi đã đủ bằng chứng; không được tự động xóa hoặc refactor chỉ dựa trên static analysis.

### Ngữ nghĩa Wallet Win Rate

- [x] Đối chiếu raw Mobula Wallet Analysis trên nhiều ví: `periodWinCount` khớp tổng bucket PnL dương; `periodActiveTokensCount` và `periodTradingTokens` khớp tổng tất cả bucket. `periodBuys + periodSells` là số transaction riêng và có thể lớn hơn nhiều.
- [x] Chốt chỉ số hiện hành là **Token Win Rate**: `periodWinCount / periodActiveTokensCount`; không trình bày nó như profitable trades trên giao diện hoặc API.
- [ ] Đổi tên ba cột legacy `wallet_analyses.total_trades`, `winning_trades`, `losing_trades` sang tên token-level trong một đợt schema cleanup riêng; hiện service phải ghi chú rõ các cột này chỉ lưu số token.
- [ ] Rà và bỏ hoặc nối lại `WalletOverviewWinRateBanner`: component còn contract cũ `winCount/totalTraded`, dùng ép kiểu trong `WalletOverview` và chưa nhận dữ liệu từ response overview thực tế.
- [ ] Xác minh ý nghĩa `winRealizedPnlRate` với Mobula trước khi hiển thị hoặc dùng trong công thức. Thực nghiệm có giá trị lớn hơn 100 nên không được coi là win-rate frequency chỉ dựa trên mô tả tài liệu.
- [ ] Nếu sau này cần trade-level win rate, lập batch riêng dùng closed position cycles; không suy ra từ số buy/sell transaction và không làm trong Pricing/Business Model hiện tại.

### Bảo mật và đường gọi provider phía client

- [!] Mobula key đã được gỡ khỏi client source hiện hành; nhóm vẫn phải thu hồi/rotate key cũ vì việc xóa chuỗi khỏi file không làm key an toàn trở lại nếu đã nằm trong Git history hoặc bundle.
- [x] Đã chuyển Mobula metadata call trong `TokenInsightTabs` về typed Hono route và domain service `token-fundamentals`, qua `rlFetch` và response validation. Persistence dùng các bảng normalized, provider-independent cho allocation, unlock schedule và investor; freshness được ghi theo ba nhóm quan sát độc lập, không lưu raw provider JSON.
- [ ] Lập inventory mọi client request và phân loại: Yoca API, blockchain provider trực tiếp, Solana RPC, AI/integration, static asset/embed hoặc external navigation.
- [ ] Xác nhận không còn blockchain data provider nào được gọi trực tiếp từ browser ngoài trường hợp đã duyệt.

### n8n và các implementation song song

- [ ] Xác nhận với nhóm và deployment rằng không có external consumer gọi `/api/news` hoặc `/api/wallets/ai-analysis`.
- [x] Đã xác nhận UI chính dùng `/api/token-news` thay cho news n8n; các Wallet AI modal cũ/không còn launcher được loại khỏi runtime pricing.
- [!] `fallow` chỉ xác nhận route/service n8n reachable từ server entry; điều này không chứng minh chúng có traffic runtime. Ngược lại, không thấy client gọi cũng chưa đủ chứng minh không có external consumer.
- [ ] Nếu không còn consumer, lập diff cleanup riêng cho route, service, env schema/example, n8n provider type, ACMS adapter và UI legacy; kiểm tra feature parity trước khi xóa.
- [ ] Bỏ n8n khỏi báo cáo, tracker blockchain data và cost model khi trạng thái legacy đã được nhóm xác nhận.

### Solana RPC

- [x] Đã xác nhận Solana RPC được dùng thật trong luồng thanh toán: client đọc balance, lấy blockhash, mô phỏng/gửi/xác nhận giao dịch; server đọc parsed transaction để xác minh thanh toán.
- [ ] Truy tiếp `token-security-context.ts` để xác định route và mức sử dụng RPC ngoài payment.
- [ ] Phân loại RPC là `blockchain_rpc`, không cộng chung với `blockchain_data` của Mobula/Birdeye/Zerion/Moralis/CoinGecko/Helius Data API.
- [ ] Không proxy hoặc refactor luồng ký/gửi giao dịch qua server nếu chưa có lý do bảo mật và thiết kế được nhóm duyệt.

### Chuẩn hóa outbound provider và validation

- [ ] Kiểm tra toàn bộ external blockchain data operation có đi qua `rlFetch` hoặc adapter cùng contract hay không.
- [ ] Mở rộng metadata ổn định tại transport boundary: category, provider, operation và quota cost nếu endpoint có đơn vị credit riêng.
- [!] `validateApiResult` hiện log và trả `undefined` khi parse/schema thất bại; chưa fail-fast theo nghĩa throw typed error. Thiết kế thay đổi phải kiểm tra tất cả caller trước khi sửa để tránh đổi error behavior ngoài ý muốn.
- [ ] Tách transport outcome của `rlFetch` và validation outcome của Zod, liên kết bằng request/outbound-call ID.

### Client API abstraction

- [ ] Kiểm tra các raw `fetch` còn reachable; không tính file/component bị `fallow` đánh dấu unused như runtime traffic cho đến khi trace xong.
- [ ] GET business API ưu tiên Hono client + `useGet` khi phù hợp với SWR cache/dedupe; mutation, streaming, asset và wallet RPC được phép có abstraction riêng.
- [ ] Đánh giá custom fetch của Hono cho network instrumentation và Playwright/HAR làm lớp kiểm chứng độc lập.
- [ ] Không migrate hàng loạt raw `fetch` chỉ để đồng nhất cú pháp; mỗi migration phải giữ credentials, cancellation, streaming, error mapping, dedupe và loading behavior.

### Framework capability và compatibility spike

- [ ] Đối chiếu API thật của Hono `requestId`, `contextStorage`, `timing` và custom `fetch` với version đang cài trước khi tự viết abstraction trùng lặp.
- [ ] Đánh giá Drizzle custom logger cho query count/fingerprint; không log raw parameters và không giả định logger cung cấp query latency/pool metrics.
- [ ] Chỉ dùng Postgres.js debug trong phiên chẩn đoán có kiểm soát; không bật raw query/parameter logging trên deployment.
- [ ] Chưa đưa OpenTelemetry vào cho đến khi tracker B-lite chứng minh cần distributed tracing.
- [!] Thống nhất Drizzle version: root đang khai báo `^0.45.1`, server khai báo `^0.44.7`; xác minh package thực tế được resolve trước khi dùng extension point phụ thuộc version.

### Dead-code audit và cleanup gate

- [x] Đã chạy `fallow dead-code --production` cho hai workspace và lưu report tạm ngoài repository.
- [!] Scan hiện có nhiều cảnh báo và false-positive potential; 119 unused file và hơn 1.100 unused export không phải danh sách được phép xóa.
- [ ] Chạy `fallow dead-code --trace-file` hoặc `--trace` cho từng target trước khi lập cleanup diff.
- [ ] Ưu tiên rà API manager/provider config cũ, Birdeye/Helius adapter cũ, CoinMarketCap util và UI component legacy.
- [ ] Mỗi cleanup diff phải có bằng chứng không còn importer/route/external consumer, phép kiểm tra luồng người dùng liên quan và cách rollback.

### Audit các shortcut phát sinh khi chạy deadline

- [ ] Quét client để tìm secret, provider base URL và blockchain data request được đặt trực tiếp trong component/service browser.
- [ ] Quét server để tìm direct `fetch` bypass limiter, response validation hoặc provider metadata; phân biệt SDK, webhook và internal integration trước khi kết luận.
- [ ] Tìm request/response được xử lý bằng `unknown`, manual interface hoặc explicit cast thay vì schema/typed Hono contract; ưu tiên các luồng người dùng chính.
- [ ] Tìm cache tạm, mock data, hard-coded address/network/price/tier và fallback im lặng còn reachable từ production entry.
- [ ] Tìm implementation mới chồng lên implementation cũ nhưng route/config cũ vẫn được mount.
- [ ] Đối chiếu component bị `fallow` đánh dấu unused với screenshot/chức năng được công bố trong báo cáo để tránh báo cáo code không còn chạy.
- [ ] Mỗi phát hiện được phân loại: security fix ngay, behavior bug, observability gap, legacy cleanup hoặc chấp nhận có chủ đích; không gom tất cả thành một đợt đại tu.

### Convention khi chỉnh server/service

- [ ] Ưu tiên Drizzle SQL-like (`select/from/where/join`) thay cho relational ORM-like query API.
- [ ] Đẩy filter, freshness, existence và aggregate hợp lý xuống database thay vì tải dữ liệu lên rồi kiểm tra bằng JavaScript.
- [ ] Dùng `==` và `!=` theo convention repository; không thêm `===` hoặc `!==` trong code mới.
- [ ] Schema/type phản hồi provider đặt trong `server/src/services/_types/` theo domain phù hợp; không phát tán provider type vào domain/client nếu chỉ dùng cục bộ.
- [ ] Dùng `dayjs.utc()` cho thời gian; chỉ chuyển `.toDate()` tại boundary cần `Date` như Drizzle timestamp.
- [ ] Comment ngắn bằng `//` tại các mốc chính của luồng đọc, refresh, normalize và ghi; không dùng multiline comment để kể lại code.

## Điều kiện hoàn tất

Plan chỉ được xem là hoàn thành khi:

- số liệu nội bộ quan trọng có benchmark hoặc bằng chứng tương đương;
- giả định và số đo được tách rõ;
- cách tính chi phí có thể tính lại;
- nguồn provider còn hiệu lực và có ngày truy cập;
- tier tháng/năm và doanh thu nhất quán;
- nội dung trình bày không còn văn phong agent hoặc ghi chú nội bộ;
- nhóm trả lời được bộ câu hỏi phản biện cơ bản;
- mọi claim về test, performance và bảo mật khớp với bằng chứng thật.
