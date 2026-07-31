# Journey cost inputs — 2026-07-19

File này nối số provider attempt quan sát được với đơn vị billing đã đối chiếu trong `PROVIDER_QUOTA_RESEARCH_CHECKLIST.md`. Đây là đầu vào kỹ thuật cho mô hình chi phí, không phải dự báo traffic hay doanh thu.

## Đơn vị refresh

Không lấy page view nhân trực tiếp với provider cost. Ba biến dưới đây chỉ tăng khi dữ liệu phải được làm mới:

- `M`: số lượt refresh Market Radar trong tháng. Dữ liệu dùng chung toàn hệ thống.
- `T`: tổng số token–TTL window phải refresh cho Token Overview trong tháng. Nhiều người xem cùng token trong một TTL window chỉ tính một lần.
- `W`: tổng số wallet–TTL window phải refresh cho Wallet Core trong tháng. Hai lượt xem cùng ví trong TTL window có thể dùng lại dữ liệu database.
- `H`: tổng số trang Helius Wallet Balances phát sinh từ các lượt `W`. Mỗi trang tối đa 100 holdings và tốn 100 Helius credits; vì vậy `H` không luôn bằng `W` đối với ví có nhiều token dust/spam.
- `A`: tổng số wallet activity range phải refresh trong tháng. Cost thay đổi theo mật độ giao dịch và số page swaps/transfers cần quét.
- `Z`: tổng số token chart phải refresh trong tháng. Một token được chọn tương ứng một Zerion chart request; mapping lookup được tính thêm khi token chưa có Zerion ID trong database.
- `X`: số Wash Trading analysis không dùng được transfer cache 5 phút. Tách `X_enhanced` và `X_fallback` theo nguồn dữ liệu.
- `E`: số Helius webhook event deliveries trong tháng; `G` là số create/update/delete webhook management calls.

Interaction như Wallet Activity pagination, token chart theo từng token, Wash Trading, AI và webhook được tính riêng; không ngầm gộp vào `M`, `T` hoặc `W`.

## Pilot AI và Brave Search

Run `runs/2026-07-19T11-27-54-628Z_journey-observed/` xác nhận metric có thể nối một lượt dùng tính năng với request provider và token Gemini. Đây là pilot một mẫu để kiểm tra đường đo, chưa phải phân phối dùng cho dự báo cuối cùng.

| Journey | Gemini | Token vào | Token trả lời | Token suy luận | Provider/Search | Thời gian |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Token AI | 2.5 Flash, 1 call | 17.303 | 832 | 1.916 | 14 attempts, gồm 1 Brave Search | 46,1 giây |
| General Chat | 3.1 Flash-Lite, 3 calls | 21.982 | 1.367 | 0 | 19 attempts | 116,9 giây |
| Wash Trading AI | 2.5 Flash, 1 call | 688 | 682 | 1.394 | 1 Helius attempt | 11,6 giây |
| Token Chart News | 2.5 Flash, 4 calls | 7.538 | 1.209 | 3.951 | 1 Brave Search | 45,3 giây |
| Volatility Summary | 2.5 Flash, 1 call | 2.023 | 349 | 917 | 3 Brave Search + 1 CoinGecko | 19,5 giây |
| Wallet Behavior Analysis | 2.5 Flash, 1 call | 14.042 | 14.028 | 583 | 5 Helius transaction calls | 71,8 giây |
| Wallet Swap Summary | 2.5 Flash, 1 call | 183 | 256 | 1.900 | 31 Mobula Activity calls | 74,9 giây |

Theo giá Standard đã đối chiếu, chi phí Gemini xấp xỉ của ba mẫu lần lượt là 0,0121 USD, 0,0075 USD và 0,0054 USD. Token suy luận được tính cùng đơn giá output. Brave Search của Token AI vẫn nằm trong 1.000 request tương đương credit miễn phí mỗi tháng; sau mức đó request quan sát được có giá 0,005 USD.

General Chat đã chọn nhiều công cụ hơn yêu cầu và thực hiện 10 lượt Mobula Wallet Activity cùng 4 lượt Wallet Analysis. Vì tool selection phụ thuộc nội dung prompt và kết quả mô hình, mẫu này cho thấy fan-out/latency cần được kiểm soát nhưng không được dùng làm mức trung bình chỉ sau một lần chạy.

Wallet AI trả 200 sau 3,1 giây và thực hiện hai lượt Helius, nhưng không gọi Gemini vì không tạo được event phân tích từ dữ liệu giao dịch của ví mẫu. Đây là nhánh fallback đúng theo service, không phải một mẫu chi phí AI bằng 0. Cần thay ví mẫu và chỉ đưa Wallet AI vào phân phối sau khi metric `gemini.svc.wallet_ai_summary` xuất hiện.

Run `runs/2026-07-19T12-04-07-444Z_journey-observed/` bổ sung hai summary module. Gemini cost quan sát xấp xỉ 0,0152 USD cho Token Chart News và 0,0038 USD cho Volatility. Sau credit Brave miễn phí, các Search request quan sát làm full cost tương ứng xấp xỉ 0,0202 USD và 0,0188 USD. Token Chart News tạo summary riêng cho nhiều event nên một lượt quota ở route không đồng nghĩa một Gemini call.

Run `runs/2026-07-19T12-08-19-402Z_journey-observed/` đo Wallet Behavior Analysis khoảng 0,0408 USD Gemini cùng năm Helius transaction calls, và Wallet Swap Summary khoảng 0,0055 USD Gemini cùng 31 trang Mobula Activity. Cả hai luồng đã bị loại hoặc không còn được mở từ client, nên kết quả chỉ được giữ để audit và không đưa vào pricing runtime.

## Cost quan sát theo journey

| Journey refresh | CoinGecko | Birdeye | Mobula | Helius | Zerion | Warm repeat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Market Radar `M` | 17 credit | 135 CU thành công | 0 | 0 | 0 | 0 provider attempt |
| Token Overview `T` | 15 credit | 0 | 1 credit | 0 | 0 | 0 provider attempt |
| Wallet Core `W` | 0 | 0 | 21 credit | 100 credit trong 3 core samples một trang; tổng quát `100 × balance pages` | 0 | 0 provider attempt |
| Wallet Activity `A` | 0 | 0 | 1–10 credits trong các post-fix samples | 0 | 0 | 0 provider attempt |
| Wallet Token Chart `Z` | 0 | 0 | 0 | 0 | 1 request/token; lượt ba token đầu tiên còn một mapping lookup | 0 provider attempt |

Nguồn run:

- Market Radar observed-first: `runs/2026-07-19T09-06-48-529Z_journey-observed/`.
- Token Overview cold: `runs/2026-07-19T09-01-00-323Z_journey-cold/`.
- Wallet Core cold sau khi dùng chung Portfolio/Overview: `runs/2026-07-19T10-39-16-547Z_journey-cold/`.
- Wallet Activity observed-first: `runs/2026-07-19T09-35-25-204Z_journey-observed/`.
- Wallet Activity post-fix: `runs/2026-07-19T09-59-59-065Z_journey-observed/`.
- Wallet Token Chart observed-first: `runs/2026-07-19T09-38-14-672Z_journey-observed/`.

Market Radar có hai retry Birdeye trong run. Bảng chỉ cộng cost của ba response thành công. Request lỗi chỉ được đưa vào quota sau khi xác nhận Birdeye có trừ CU cho lỗi hay không.

## Công thức quota nền

Các công thức chưa gồm retry, interaction và traffic nền:

```text
CoinGecko_credit = 17M + 15T
Birdeye_CU       = 135M
Mobula_credit    = T + 21W + pages(A)
Helius_credit    = 100H
Zerion_request   = Z + missing_mapping_batches
Helius_wash      = 100X_enhanced + 176X_fallback
Helius_webhook   = E + 100G
```

Với quota free hiện đã xác nhận, từng provider tạo một ràng buộc độc lập:

```text
17M + 15T <= 10,000 CoinGecko credit/tháng
135M      <= 30,000 Birdeye CU/kỳ
T + 21W + pages(A) <= 10,000 Mobula credit/tháng
100H      <= 1,000,000 Helius credit/tháng
Z + missing_mapping_batches <= 2,000 Zerion request/ngày
```

Không được cộng các quota khác đơn vị vào một tổng chung. Trong phạm vi các journey hiện tại, Birdeye giới hạn Market Radar trước CoinGecko; Mobula thường giới hạn Wallet Core trước Helius.

Ba Wallet Core samples sau tối ưu đều dùng đúng một trang Helius balances, một lần Wallet Token Details và bốn Wallet Analysis theo bốn kỳ. Portfolio và Overview đồng thời chia sẻ cùng một refresh, nên không còn nhân đôi Helius call. Tuy nhiên ví stress có hàng trăm holdings vẫn làm `H` tăng theo pagination; cost model phải dùng phân phối số trang thay vì mặc định mọi ví là một trang.

Với Wallet Activity, `pages(A)` phải lấy từ phân phối page count thay vì một hằng số. Baseline trước sửa là 2, 2 và 15 calls. Sau client lazy loading, shared coverage metadata và page-level single-flight, concurrent light case dùng 1 call; sequential heavy case dùng 6 calls rồi tab sau đọc database; đúng ví baseline nặng giảm 15 xuống 10. Upper bound hiện tại là 10 unique pages/range thay vì 20 calls từ hai vòng độc lập.

Wallet Token Chart xác nhận fan-out tuyến tính theo số token được chọn. Interaction ba token đầu tiên tạo bốn Zerion requests: một fungible mapping lookup theo batch và ba chart calls. Warm repeat không gọi provider. Vì Zerion dùng quota ngày, biến này phải được kiểm tra theo peak daily active usage thay vì chỉ quy đổi theo tháng.

Wash Trading không được gọi bằng benchmark route riêng vì production endpoint yêu cầu entitlement, trừ AI usage và có thể gọi Gemini. Bound được lấy từ control flow hiện hành: Enhanced-success dùng 100 credits; fallback đầy đủ dùng một Enhanced attempt cùng tối đa 76 Standard RPC calls, tổng 176 credits. Đây là upper bound theo code, chưa phải phân phối traffic quan sát.

Webhook không gắn với page view. Helius tính 1 credit cho mỗi event delivery và 100 credits cho mỗi management call. Yoca hiện chỉ lưu cấu hình webhook cùng alert history đã match, không lưu toàn bộ deliveries; do đó `E` phải là giả định theo số ví được theo dõi và event rate cho đến khi bổ sung event counter.

## Headroom và ngưỡng nâng gói

Mô hình dùng ngưỡng vận hành thay vì chờ quota cạn:

- Cảnh báo khi projected usage của kỳ đạt 70% quota; lập phương án nâng gói khi base projection đạt 80% hoặc kịch bản thận trọng vượt 100%.
- Giữ ít nhất 20% quota headroom cho retry, refresh thủ công, traffic nền và thay đổi fan-out.
- Xem throughput là bottleneck riêng: cảnh báo khi peak một phút đạt 70% giới hạn hoặc có 429 trong benchmark tải hợp lệ; không dùng quota tháng để biện minh cho burst vượt RPS.
- Provisional latency SLO cho benchmark: warm journey p95 không quá 2 giây; provider refresh p95 không quá 30 giây. Chỉ cân nhắc nâng gói vì latency khi limiter/provider wait là nguyên nhân chính, không phải query hoặc xử lý nội bộ.
- Error-rate gate: điều tra ngay khi 429 hoặc upstream error vượt 1% trong một run có ít nhất 100 request; chưa nâng gói trước khi loại được bug retry, duplicate refresh và cấu hình limiter sai.

Các ngưỡng trên là quy tắc ra quyết định nội bộ cho giai đoạn đồ án. Khi có traffic thật, thay projected usage bằng rolling 7-day run rate và giữ nguyên nguyên tắc headroom.

## Đầu vào còn thiếu trước ba kịch bản MAU

- Số session trung bình trên một MAU trong tháng.
- Tỷ lệ session mở Market Radar, Token Overview và Wallet Core.
- Số token và ví khác nhau được xem trong một TTL window; đây là biến quyết định reuse, không phải một cache-hit ratio chung.
- Fan-out thực tế của Wallet Activity, Zerion token chart, Moralis swaps, Wash Trading và webhook event.
- AI invocation và token input/output theo từng tính năng.
- Tỷ lệ nhánh Wallet AI có event đủ điều kiện gọi Gemini so với nhánh fallback không gọi mô hình.

Ba mốc 300, 3.000 và 30.000 MAU chỉ được tính sau khi chốt các đầu vào này dưới dạng giả định sản phẩm. Số đo journey phía trên không thay đổi khi giả định MAU thay đổi.
