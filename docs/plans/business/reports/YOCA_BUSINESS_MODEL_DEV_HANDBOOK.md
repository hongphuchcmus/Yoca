# Yoca Business Model — Developer Handbook

## Mục đích và phạm vi

Đây là tài liệu bàn giao nội bộ. Nội dung công khai các giả định, cost proxy, khoảng trống kỹ thuật và điều kiện cập nhật mô hình. Không đưa API key, credential, session token hoặc giá trị `.env` vào file này.

Nguồn chuẩn hiện tại:

- `calculate-business-scenarios.ts`: công thức và kết quả có thể chạy lại.
- `BUSINESS_SCENARIOS_2026-07-19.md`: giải thích kịch bản cơ sở.
- `PROVIDER_QUOTA_RESEARCH_CHECKLIST.md`: giá, quota và operation cost.
- `JOURNEY_COST_INPUTS_2026-07-19.md`: benchmark journey và fan-out.
- `AI_TIER_COST_MODEL_2026-07-19.md`: AI sample cost và quota.
- Thư mục `benchmark-results/runs/`: raw artifacts.

Bản báo cáo Typst và slide là output dùng để trình bày. File `YOCA_BUSINESS_MODEL_REPORT.md` chỉ được giữ làm bản lưu cũ và không còn là nguồn nội dung. Khi một TTL, route, provider hoặc giá bán thay đổi, cập nhật nguồn chuẩn và chạy calculator trước khi sửa output.

## Quyết định pricing đã chốt

| Tier | Persona | Giá tháng/năm | Vai trò sản phẩm |
| --- | --- | ---: | --- |
| Standard/Free | Người dùng mới, khảo sát không thường xuyên | 0 / 0 USD | Trải nghiệm dữ liệu lõi và AI ở mức thử nghiệm |
| Lite | Retail user theo dõi token/ví thường xuyên | 39 / 390 USD | Dung lượng AI thường nhật cao hơn |
| Plus | Active trader/researcher cần phân tích chuyên sâu | 79 / 790 USD | Mở Wash Trading Analysis và Chat |
| Pro | Power user sử dụng nhiều feature mỗi ngày | 149 / 1.490 USD | Quota cao hơn, vẫn là gói cá nhân một chỗ ngồi |

Giá năm bằng 10 tháng sử dụng. Giá được giữ ở 39/79/149 vì nằm giữa các tham chiếu hiện hành: CryptoQuant 29/99 USD, Dune 75/399 USD và Nansen API Pro 69 USD theo tháng hoặc 49 USD/tháng khi trả năm. So sánh chỉ dùng để xác định vùng định vị; tính năng và đối tượng của từng nền tảng không hoàn toàn giống Yoca.

Nguồn khảo sát chính thức ngày 2026-07-19:

- https://cryptoquant.com/en/pricing
- https://docs.dune.com/resources/credits-billing/how-credits-work
- https://academy.nansen.ai/en/articles/1287744-plans-and-pricing
- https://docs.nansen.ai/about/credits-and-pricing-guide

### Quota AI được áp dụng

| Feature | Free | Lite | Plus | Pro |
| --- | ---: | ---: | ---: | ---: |
| Ask Yoca AI | 5 | 8 | 12 | 20 |
| Wallet Chat | 5 | 8 | 12 | 20 |
| Token Chart News | 5 | 8 | 12 | 20 |
| Volatility Summary | 5 | 8 | 12 | 20 |
| Wash Trading Analysis | 0 | 0 | 3 | 5 |
| Wash Trading Chat | 0 | 0 | 5 | 10 |

Quota reset lúc 00:00 UTC. Mỗi con số là hạn mức riêng của từng module, không phải quota dùng chung. Wash Trading Analysis và Chat yêu cầu Plus. Wallet AI modal cũ không còn được quảng bá trong pricing và được giới hạn 12/20 lượt ở Plus/Pro.

### Trạng thái kỹ thuật sau khi chốt

- `ai-usage.service.ts` chứa quota chuẩn và feature ID `wash_trading_ai_chat`.
- Route Wash Trading Chat yêu cầu đăng nhập, kiểm tra Plus/Pro, reserve usage trước Gemini và release khi xử lý lỗi.
- Pricing UI và popup Wallet Chat hiển thị quota mới.
- Pricing UI giữ giá 39/79/149 và toggle năm 10× giá tháng.
- Cần kiểm tra Stripe Dashboard để bảo đảm Price ID tháng/năm trong environment trỏ đúng 39/390, 79/790 và 149/1.490 USD. Repo không thể tự xác nhận giá nằm sau Price ID.
- Luồng thanh toán SOL hiện dùng Devnet/Testnet với số SOL cố định 0,001/0,005/0,01 nhằm kiểm thử xác minh giao dịch. Đây chưa phải USD→SOL pricing cho Mainnet và không được dùng làm nguồn giá thương mại.

## Việc giới hạn tính năng còn phải hoàn thiện

Mục này chỉ dùng nội bộ, không đưa vào bản hướng giảng viên hoặc slide.

### Alert và chi phí Resend

Alert hiện có thể gửi đồng thời một email qua Resend và một Discord webhook khi giao dịch khớp rule. Password reset cũng dùng Resend, vì vậy hai luồng dùng chung quota email. Discord không có đơn giá gửi tin nhắn trong mô hình nhưng vẫn tạo request, chịu rate limit và làm tăng tải xử lý.

Entitlement dự kiến:

| Tier | Ví theo dõi | Rule hoạt động | Event gửi ra ngoài/tháng |
| --- | ---: | ---: | ---: |
| Free | 0 | 0 | 0 |
| Lite | 2 | 3 | 100 |
| Plus | 5 | 10 | 500 |
| Pro | 15 | 30 | 2.000 |

Một giao dịch khớp rule tính là một event dù gửi qua một hay cả hai kênh. Khi hết quota, hệ thống có thể tiếp tục ghi lịch sử nhưng không gửi email/Discord. Password reset không bị chặn bởi quota Alert.

Calculator tạm giả định người dùng sử dụng 10% hạn mức event và 5% MAU phát sinh một email khôi phục mỗi tháng. Resend Free có 3.000 email/tháng và 100 email/ngày; Pro 20 USD có 50.000 email/tháng. Mô hình nâng lên Pro khi dự báo vượt 2.100 email, tương đương 70% quota Free, để dành headroom cho đợt giao dịch tăng đột biến. Nguồn: https://resend.com/pricing và https://resend.com/docs/knowledge-base/account-quotas-and-limits, khảo sát ngày 2026-07-19.

**TODO kỹ thuật trước khi công bố entitlement Alert:**

- Chặn tạo followed wallet và alert rule ở Free.
- Enforce số ví, số rule hoạt động và số event gửi theo tier tại server.
- Dùng counter bền vững trong database; không dùng bộ đếm process-local.
- Ghi Resend success/failure, quota header và Discord dispatch vào analytics.
- Dành quota riêng cho password reset để Alert không làm gián đoạn khôi phục tài khoản.
- Thêm queue/throttling vì Resend mặc định giới hạn 5 request/giây trên toàn team.

### Wash Trading Chat

Backend đã có feature ID, kiểm tra Plus/Pro, reserve/release usage và hạn mức 5/10 lượt mỗi ngày cho Plus/Pro. Phần còn lại cần hoàn thiện là xử lý trạng thái locked/limit nhất quán trên giao diện và smoke test các trường hợp 401, 403, 429 cùng việc hoàn lượt khi Gemini thất bại. Không mô tả giới hạn này là đã hoàn thiện trong tài liệu hướng giảng viên cho đến khi kiểm tra xong luồng người dùng.

## Phương pháp tính

MAU là số người dùng khác nhau có ít nhất một tương tác cần dữ liệu Yoca trong 30 ngày. Anonymous user cần identifier ổn định khi có analytics thật. Cost model hiện gộp guest và account; revenue dùng payer mix riêng.

Biến journey:

- `M`: Market Radar refresh windows.
- `T`: Token Overview cold loads.
- `W`: Wallet Core wallet–TTL windows.
- `A`: Wallet Activity ranges/pages.
- `Z`: token chart refreshes.
- `X`: Wash Trading refreshes.
- `E/G`: webhook deliveries/management calls.

Cost nền:

```text
CoinGecko = 17M + 15T credits
Birdeye   = 135M CU
Mobula    = T + 21W + pages(A) credits
Helius    = 100 × wallet balance pages + Wash Trading credits
Zerion    = Z + missing mapping batches
AI        = Gemini input/output/thinking + Brave Search
Email     = Alert deliveries + password reset emails → Resend tier
```

Không cộng các đơn vị khác nhau thành một quota chung. Retry chỉ được cộng vào billing khi provider xác nhận cách tính hoặc phép đo usage cho thấy có trừ quota.

### Cost quan sát theo journey

| Journey | Cost proxy cold | Warm repeat quan sát |
| --- | --- | --- |
| Market Radar | 17 CoinGecko + 135 Birdeye CU | 0 provider attempt |
| Token Overview | 15 CoinGecko + 1 Mobula | 0 |
| Wallet Core | 21 Mobula + 100 Helius cho ví một balance page | 0 |
| Wallet Activity | 1–10 Mobula pages trong post-fix samples | 0 |
| Wallet token chart | 1 Zerion request/token; mapping lookup nếu thiếu ID | 0 |
| Wash Trading | 100 Helius Enhanced; upper fallback 176 credits | Reuse transfer input 5 phút khi còn hiệu lực |

Benchmark ngày 31/7/2026 đã có median và p95 trên năm mẫu cho Ask Yoca, Wallet Chat, Chart News, Volatility và Wash Trading Chat. Wash Trading Analysis có hai model samples cùng ba cache hit. Chi tiết nằm tại `benchmark-results/AI_BENCHMARK_2026-07-31.md`.

## Assumptions và kết quả

Mô hình dùng 8 session/MAU/tháng; conversion tăng từ 2% tại 300 MAU lên 2,5% tại 3.000 MAU và 3% tại 30.000 MAU. Trong nhóm trả phí, cơ cấu Lite/Plus/Pro là 80%/15%/5%. Token, wallet, activity, Alert và AI adoption được ghi chi tiết trong calculator.

| MAU | Revenue | Direct cost | Contribution | Margin |
| ---: | ---: | ---: | ---: | ---: |
| 300 | 303,00 | 145,75 | 157,25 | 51,90% |
| 3.000 | 3.787,50 | 1.181,98 | 2.605,52 | 68,79% |
| 30.000 | 45.450,00 | 9.647,05 | 35.802,95 | 78,77% |

Direct cost gồm blockchain data provider, Gemini/Brave, Resend, Render/Supabase và payment processing proxy. Contribution chưa trừ lương, marketing, thuế, pháp lý và support.

Để nhóm dễ hiểu và trình bày thống nhất, calculator không còn xuất nhiều profile nhu cầu hoặc nhiều conversion. Khi có analytics người dùng thật, nhóm thay trực tiếp bộ giả định cơ sở và tính lại, thay vì duy trì nhiều kịch bản song song.

## Phân tích số dư và phân bổ nguồn tiền

Phần này trả lời câu hỏi “Yoca lời bao nhiêu?” theo cách nhóm có thể giải thích được. Quy đổi minh họa dùng 1 USD bằng 25.000 đồng. `Contribution` là số dư sau chi phí trực tiếp, chưa phải lợi nhuận ròng. Chỉ phần được chủ động giữ lại sau ngân sách nhân sự, tăng trưởng, dự phòng và nghĩa vụ doanh nghiệp mới có thể xem là thặng dư vận hành.

### Mốc 300 MAU — MVP tự trang trải

Trong 300 MAU có khoảng 6 người trả phí. Doanh thu là 303 USD/tháng; sau 145,75 USD chi phí trực tiếp còn 157,25 USD.

| Phân bổ | Tỷ lệ | USD/tháng | Xấp xỉ VND/tháng |
| --- | ---: | ---: | ---: |
| Hỗ trợ 4 thành viên bán thời gian | 25,4% | 40,00 | 1,00 triệu |
| Thu hút và hỗ trợ người dùng | 25,4% | 40,00 | 1,00 triệu |
| Sản phẩm và bảo mật | 26,7% | 42,00 | 1,05 triệu |
| Hành chính và dự phòng | 12,7% | 20,00 | 0,50 triệu |
| Lợi nhuận giữ lại | 9,7% | 15,25 | 0,38 triệu |

Khoản hỗ trợ bình quân chỉ khoảng 250 nghìn đồng mỗi người. Mốc này chứng minh sản phẩm có thể tự thanh toán chi phí và tiếp tục phát triển; chưa tạo ra thu nhập ổn định.

### Mốc 3.000 MAU — duy trì đội ngũ thường xuyên

Trong 3.000 MAU có khoảng 75 người trả phí. Doanh thu là 3.787,50 USD/tháng; sau 1.181,98 USD chi phí trực tiếp còn 2.605,52 USD. Lượng người dùng ổn định ở mốc này là tín hiệu sản phẩm có tiềm năng, vì vậy nhóm chuyển sang cơ cấu bốn vị trí thường xuyên thay vì tiếp tục xem đây là công việc phụ.

| Phân bổ | Tỷ lệ | USD/tháng | Xấp xỉ VND/tháng |
| --- | ---: | ---: | ---: |
| Thu nhập đội ngũ | 43,0% | 1.120,00 | 28,00 triệu |
| Marketing và phát triển người dùng | 18,4% | 480,00 | 12,00 triệu |
| Sản phẩm và bảo mật | 13,0% | 338,00 | 8,45 triệu |
| Hành chính, thuế và pháp lý | 6,9% | 180,00 | 4,50 triệu |
| Dự phòng | 10,0% | 260,00 | 6,50 triệu |
| Lợi nhuận giữ lại | 8,7% | 227,52 | 5,69 triệu |

Nếu bốn thành viên cùng làm thường xuyên, ngân sách đội ngũ bình quân 280 USD, tương đương 7 triệu đồng mỗi người. Đây là mức vận hành thận trọng của một nhóm nhỏ, chưa tạo nhiều dư địa tuyển thêm người.

### Mốc 30.000 MAU — mở rộng thành đơn vị vận hành

Trong 30.000 MAU có khoảng 900 người trả phí. Doanh thu là 45.450 USD/tháng; sau 9.647,05 USD chi phí trực tiếp còn 35.802,95 USD. Đây là quy mô một doanh nghiệp nhỏ, nhưng Yoca phải tiếp tục chi mạnh để duy trì 30.000 người dùng và phục vụ 900 khách hàng trả phí.

| Phân bổ | Tỷ lệ | USD/tháng | Xấp xỉ VND/tháng |
| --- | ---: | ---: | ---: |
| Nhân sự khoảng 20 người | 17,9% | 6.400,00 | 160,00 triệu |
| Marketing, thu hút và giữ người dùng | 40,0% | 14.317,60 | 357,94 triệu |
| Phát triển sản phẩm và bảo mật | 15,0% | 5.369,20 | 134,23 triệu |
| Hành chính, thuế và pháp lý | 10,0% | 3.579,20 | 89,48 triệu |
| Dự phòng | 10,0% | 3.579,20 | 89,48 triệu |
| Lợi nhuận giữ lại | 7,1% | 2.557,75 | 63,94 triệu |

Ngân sách nhân sự bình quân 8 triệu đồng/người cho đội ngũ 20 người. Đây là ngân sách bình quân, còn phải điều chỉnh theo vai trò và nghĩa vụ lao động. Lợi nhuận chỉ chiếm khoảng 5,6% doanh thu; biến động về chi phí thu hút người dùng, provider hoặc conversion có thể làm phần này giảm đáng kể.

### Lập luận nhóm cần thống nhất

300 MAU giúp Yoca tự nuôi sản phẩm; 3.000 MAU tạo điều kiện duy trì bốn người làm việc thường xuyên với mức thu nhập thận trọng; 30.000 MAU đòi hỏi mở rộng thành doanh nghiệp nhỏ khoảng 20 người. Ba mốc giữ biên lợi nhuận khoảng 5–6% doanh thu. Các tỷ lệ phân bổ là nguyên tắc lập ngân sách, không phải cam kết lương hay kết quả đã đạt được.

## Provider breakpoint và policy nâng gói

Base scan từ 100 đến 50.000 MAU cho các tín hiệu ngân sách:

| MAU ước tính | Thay đổi |
| ---: | --- |
| 150 | Mobula Free → Start-up |
| 300 | CoinGecko Demo → Basic |
| 450 | Birdeye Standard → Lite |
| 1.600 | Mobula Start-up → Growth |
| 2.800 | Helius Free → Developer |
| 3.525 | CoinGecko Basic → Analyst |
| 15.925 | Mobula Growth → Enterprise, giá từ 750 USD |
| 26.325 | CoinGecko Analyst → Lite |
| 27.775 | Helius Developer → Developer + credit bổ sung |

Breakpoint phụ thuộc demand assumptions. Policy vận hành:

- Review ở projected 70% quota.
- Chuẩn bị nâng ở khoảng 85%.
- Giữ tối thiểu 20% headroom cho retry, manual refresh và fan-out drift.
- Xem 429, RPS/RPM và p95 latency tách khỏi quota tháng.
- Nâng Render theo CPU/RAM/latency khi có số đo; không nâng chỉ vì MAU.

Mobula trên 1,25 triệu credit dùng giá Enterprise công khai từ 750 USD; giá hợp đồng cụ thể chỉ cần xác nhận khi mua. Helius công bố credit bổ sung cho gói trả phí ở mức 5 USD mỗi 1 triệu credit, nên vượt nhẹ 10 triệu vẫn giữ Developer thay vì lên Business. Zerion Developer của key hiện tại có 2.000 request/ngày; tier kế tiếp là Builder 149 USD/tháng với 250.000 request.

## Hạ tầng và nhân sự

Cost scenario dùng Static Site 0 USD, Render Starter 7 USD làm production floor, Standard 25 USD cho mức cao hơn và ngân sách 25–50 USD ở lát cắt lớn. Supabase dùng Free ban đầu và Pro từ 25 USD. Đây là capacity budget, không phải claim hệ thống chịu được một MAU cụ thể.

Nhân sự và phân bổ nguồn tiền được trình bày riêng ở mục trên. External funding chỉ xuất hiện sau PoC/MVP, traction và kế hoạch sử dụng vốn; baseline vẫn ưu tiên tăng trưởng từ doanh thu.

## Quy trình cập nhật mô hình

1. Khi thêm route/provider operation, gắn `pFetch`/Gemini tracking ID.
2. Chạy journey cold/warm và lưu artifact có timestamp.
3. Đối chiếu unit cost/quota với tài liệu hoặc usage delta.
4. Cập nhật journey cost input.
5. Cập nhật assumptions nếu hành vi sản phẩm đổi.
6. Chạy `npm run business:calculate-scenarios -w=server --verbose`.
7. Kiểm tra provider plan transition, contribution margin và stress ceiling AI.
8. Cập nhật handbook, teacher report và slide theo thứ tự đó.

Không lấy một lần chạy làm mean. Không coi response rỗng hợp lệ là lỗi. Không dùng profitable label/PnL của provider này làm ground truth cho PnL provider khác.

## FAQ nội bộ và phản biện

### Vì sao dùng MAU trong khi provider tính request?

MAU giúp tạo kịch bản kinh doanh. Calculator chuyển MAU thành session, journey, cold resource windows và cuối cùng mới thành request/credit. MAU không được nhân trực tiếp với một cost trung bình toàn hệ thống.

### Vì sao ba mốc MAU vẫn được giữ?

Ba mốc là lát cắt dễ đọc trên slide. Calculator quét liên tục để phát hiện breakpoint nên quyết định nâng cấp không bị khóa vào ba mốc.

### 52–79% có phải lợi nhuận không?

Đó là contribution margin sau direct cost. Lương, marketing, thuế, pháp lý và support chưa được trừ.

### Thầy hỏi: “Rốt cuộc tụi em lời bao nhiêu?”

> Trong kịch bản cơ sở, 300 MAU tạo khoảng 303 USD doanh thu và 15 USD lợi nhuận giữ lại mỗi tháng sau khi dành ngân sách cho chi phí trực tiếp, duy trì sản phẩm và hỗ trợ nhóm. Ở 3.000 MAU, doanh thu dự kiến khoảng 3.788 USD, đủ duy trì bốn thành viên thường xuyên với ngân sách bình quân khoảng 7 triệu đồng/người và còn khoảng 228 USD lợi nhuận. Tại 30.000 MAU, Yoca vận hành như một doanh nghiệp nhỏ khoảng 20 người; sau toàn bộ ngân sách trực tiếp, nhân sự, tăng trưởng và dự phòng, lợi nhuận giữ lại khoảng 2.558 USD, tương đương 5,6% doanh thu.

### Vì sao biên đóng góp tăng khi MAU tăng?

Revenue tăng gần tuyến tính theo payer mix, còn provider bán theo gói quota. Giữa hai breakpoint, phần quota chưa dùng tạo operating leverage. Khi đổi gói, cost nhảy bậc.

### Vì sao 300 MAU đã phải nâng provider?

Mô hình giả định wallet cold rate cao và 8 session/MAU. Breakpoint là tín hiệu ngân sách từ bộ giả định cơ sở, chưa phải quan sát production.

### Vì sao quota AI được giới hạn theo từng module?

Mỗi module có fan-out, lượng token và nhu cầu tìm kiếm khác nhau. Quota riêng 5/8/12/20 lượt cho bốn module chính giúp người dùng mới trải nghiệm đủ sâu, đồng thời giữ được khoảng an toàn trước khi cộng data provider và hạ tầng. Wash Trading có hạn mức riêng vì chỉ mở từ Plus và có quy trình phân tích khác.

### Tại sao Standard vẫn có 5 lượt AI cho mỗi module?

Năm lượt/ngày giúp người dùng hoàn thành một phiên khảo sát có ý nghĩa thay vì chỉ thử một prompt rồi dừng. Chi phí này được xem là chi phí thu hút người dùng có kiểm soát; authentication và bộ đếm theo ngày giới hạn lạm dụng.

### Tại sao không tự tính toàn bộ PnL?

Wallet có thể có lịch sử rất dài và transaction abstraction không luôn đầy đủ. Yoca dùng provider analysis để giữ latency/coverage trong phạm vi sản phẩm, đồng thời normalize dữ liệu cần hiển thị và kiểm tra response bằng schema.

### Nâng Render hay nâng provider khi trang chậm?

Nâng provider khi limiter/RPS/429 hoặc upstream quota là bottleneck. Nâng Render khi CPU, memory hoặc request queueing là nguyên nhân. End-to-end latency một mình chưa đủ xác định bên cần nâng.

### Vì sao chưa gọi kết quả là benchmark production?

Artifacts hiện chủ yếu là compatibility, cold/warm journey và AI pilot. Chưa có distribution production, median/p95 trên toàn bộ deep subset hoặc capacity test Render.

### Nguồn tiền mở rộng đến từ đâu?

Giai đoạn đầu tái đầu tư revenue. Sau khi PoC/MVP có traction và recurring revenue, nhóm có thể tiếp cận accelerator, strategic partner hoặc angel/seed funding với kế hoạch sử dụng vốn cụ thể.

## Glossary

| Thuật ngữ | Giải thích ngắn |
| --- | --- |
| PoC | Proof of Concept; bản chứng minh ý tưởng có thể thực hiện về kỹ thuật |
| MVP | Minimum Viable Product; phiên bản nhỏ nhất đủ cho người dùng trải nghiệm luồng giá trị chính |
| MAU | Monthly Active Users; người dùng hoạt động khác nhau trong 30 ngày |
| MRR | Monthly Recurring Revenue; doanh thu thuê bao định kỳ theo tháng |
| Conversion | Tỷ lệ người dùng chuyển thành khách hàng trả phí |
| Payer mix | Cơ cấu người trả phí giữa Lite, Plus và Pro |
| Direct cost | Chi phí phát sinh trực tiếp để phục vụ sản phẩm: data, AI, hosting, payment |
| Contribution | Doanh thu trừ direct cost |
| Contribution margin | Contribution chia doanh thu |
| Cash flow | Dòng tiền thực thu và thực chi trong một kỳ |
| Bootstrap | Phát triển chủ yếu bằng nguồn lực nhóm và doanh thu tạo ra |
| Traction | Bằng chứng sản phẩm có người dùng, mức sử dụng hoặc doanh thu ổn định |
| Cold cache | Dữ liệu chưa có hoặc đã stale, cần refresh |
| Warm cache | Dữ liệu còn hiệu lực và có thể tái sử dụng |
| TTL | Thời gian dữ liệu được xem là còn hiệu lực |
| Fan-out | Một hành động tạo ra nhiều request/call phía sau |
| RPS/RPM | Số request mỗi giây/mỗi phút |
| CU/credit | Đơn vị provider dùng để tính quota/chi phí |
| p50/p95 | Mốc latency mà 50%/95% request không vượt quá |
| Headroom | Phần quota/capacity giữ lại để hấp thụ biến động |
| Rate limit | Giới hạn tốc độ gọi API |
| Stress ceiling | Chi phí tối đa theo quyền lợi nếu người dùng dùng gần hết quota |
| Single-flight | Cho các request cùng khóa dùng chung một lần refresh đang chạy |
| Cache stampede | Nhiều request cùng thấy stale và đồng thời gọi provider |

## Cấu trúc slide hiện hành

Slide được chia thành tám trang để tránh dồn số liệu vào ba trang:

1. Giá trị sản phẩm và mô hình freemium.
2. Bốn gói giá cùng quota AI theo từng module.
3. Cách hành trình người dùng phát sinh request, credit và token.
4. Kết quả benchmark các module AI.
5. Các ngưỡng nâng gói provider và hạ tầng.
6. Doanh thu, tổng ngân sách và lợi nhuận tại ba mốc MAU.
7. Cơ cấu chi phí tại 3.000 và 30.000 MAU, bao gồm chuyển đổi Gemini sang Qwen tự vận hành.
8. Lộ trình từ MVP tự trang trải đến đơn vị vận hành quy mô nhỏ.

Ba con số cần nói rõ khi thuyết trình là conversion 2%/2,5%/3%, lợi nhuận 15/228/2.558 USD và biên lợi nhuận khoảng 5–6%. Chi tiết benchmark và provider cost chỉ dùng để chứng minh các con số có nguồn gốc; không đọc toàn bộ bảng trên slide.

## Checklist trước khi công bố

- [ ] Stripe Price IDs tháng/năm khớp giá đã chốt.
- [x] Pricing UI không còn Wallet AI legacy và hiển thị đúng quota.
- [ ] Wash Trading Chat 401/403/429 được UI diễn giải rõ.
- [ ] Chạy smoke test reservation/release cho sáu AI feature.
- [x] Chạy calculator và lưu output dùng cho slide.
- [x] Dùng giá Mobula Enterprise công khai từ 750 USD; xin báo giá chỉ khi chuẩn bị mua.
- [x] Tính Helius Developer kèm credit bổ sung 5 USD/1 triệu trước khi cân nhắc Business.
- [x] Ghi ngày khảo sát trên slide hoặc speaker note.
- [ ] Mỗi thành viên giải thích được MAU, conversion và contribution margin.
- [ ] Không gọi contribution là net profit.
