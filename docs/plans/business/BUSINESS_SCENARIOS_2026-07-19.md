# Kịch bản chi phí và doanh thu — 2026-07-19

Tài liệu nội bộ này áp dụng một kịch bản cơ sở duy nhất tại ba mốc 300, 3.000 và 30.000 MAU. Mục tiêu là giúp nhóm hiểu cùng một đường phát triển và thời điểm nâng gói. Công thức có thể chạy lại bằng `calculate-business-scenarios.ts` khi số đo production thay đổi.

## Phạm vi và giả định cơ sở

Trong tài liệu này, MAU là số người dùng khác nhau có ít nhất một tương tác cần dữ liệu từ Yoca trong cửa sổ 30 ngày. Khái niệm bao gồm cả tài khoản và khách chưa đăng nhập; khi triển khai analytics, khách cần anonymous identifier ổn định để không đếm mỗi page view thành một người mới. Mô hình chưa tách hai nhóm vì provider cost phụ thuộc hành trình và tài nguyên được xem, còn doanh thu chỉ lấy từ tỷ lệ thuê bao trả phí.

Mô hình dùng cơ cấu 98% Standard, 1,25% Lite, 0,5% Plus và 0,25% Pro; tổng conversion là 2%. Giá tháng lần lượt là 0, 39, 79 và 149 USD. Mỗi MAU có tám phiên hoạt động trong tháng.

Một phiên không được quy đổi thẳng thành một lần gọi provider. Yoca đọc database trước và chỉ refresh khi dữ liệu stale, nên mô hình dự báo theo số cold load hoặc cửa sổ refresh:

- Market Radar có 180, 720 và 2.880 cửa sổ có nhu cầu refresh ở ba quy mô. Mỗi refresh cold quan sát được dùng 17 CoinGecko credit và 135 Birdeye CU.
- 70% phiên mở Token Overview; tỷ lệ cold load là 30%, 30% và 20% khi quy mô tăng và cache được chia sẻ tốt hơn. Một cold load dùng proxy 15 CoinGecko credit và 1 Mobula credit.
- 50% phiên mở Wallet Core; 90% địa chỉ/cửa sổ bị xem là cold vì ví mang tính cá nhân. Một cold load dùng 21 Mobula credit và 100 Helius credit theo benchmark hiện tại.
- 20% phiên mở Wallet Activity; 35% cần refresh và trung bình đọc ba page Mobula. Wallet token chart được giả định xuất hiện ở 15% phiên, 30% số lượt là cold và mỗi lượt chọn hai token.
- AI dùng adoption cơ sở trong `AI_TIER_COST_MODEL_2026-07-19.md`. Brave Search chỉ được tính cho fallback Ask Yoca 25%, một search mỗi Token Chart News và ba search mỗi Volatility theo pilot. 1.000 Search request đầu tháng được bù bằng credit 5 USD.

## Kết quả cơ sở

| Chỉ tiêu/tháng | 300 MAU | 3.000 MAU | 30.000 MAU |
| --- | ---: | ---: | ---: |
| Thuê bao Lite / Plus / Pro | 3,75 / 1,5 / 0,75 | 37,5 / 15 / 7,5 | 375 / 150 / 75 |
| Doanh thu ghi nhận | 376,50 USD | 3.765,00 USD | 37.650,00 USD |
| Blockchain data provider | 85,00 USD | 523,00 USD | 1.342,00 USD* |
| Gemini + Brave Search | 71,75 USD | 762,49 USD | 7.669,88 USD |
| Resend | 0,00 USD | 20,00 USD | 20,00 USD |
| Render + Supabase | 7,00 USD | 50,00 USD | 80,00 USD |
| Phí thanh toán giả định | 12,72 USD | 127,19 USD | 1.271,85 USD |
| Tổng chi phí trực tiếp | 176,47 USD | 1.482,67 USD | 10.383,73 USD |
| Số dư đóng góp | 200,03 USD | 2.282,33 USD | 27.266,27 USD |
| Biên đóng góp | 53,13% | 60,62% | 72,42% |

`*` Mobula tại 30.000 MAU vượt 1,25 triệu credit của Growth. Mô hình dùng giá Enterprise công khai từ 750 USD; hợp đồng thực tế vẫn phụ thuộc báo giá. Helius dùng Developer 49 USD cộng một gói 1 triệu credit bổ sung giá 5 USD, thay vì nhảy thẳng lên Business.

Chi phí thanh toán dùng proxy Stripe công khai 2,9% + 0,30 USD cho mỗi giao dịch thành công. Yoca chưa chốt pháp nhân, quốc gia merchant và phương thức thanh toán, nên con số này chỉ dùng để tránh bỏ quên payment processing; báo giá thực tế phải thay thế nó.

Resend được ước lượng từ 10% hạn mức Alert dự kiến và 5% MAU phát sinh email khôi phục mỗi tháng. Free có 3.000 email/tháng nhưng chỉ 100 email/ngày; mô hình chuyển sang Pro 20 USD khi dự báo vượt 70% quota tháng để giữ chỗ cho các đợt giao dịch tăng đột biến.

## Điểm đổi gói theo dải MAU

Ba cột trên chỉ là lát cắt trình bày. Calculator còn quét từ 100 đến 50.000 MAU với bước 25 và ghi lại lúc gói nhỏ nhất không còn đủ quota. Kết quả cơ sở hiện tại:

| MAU ước tính | Provider | Chuyển gói |
| ---: | --- | --- |
| 150 | Mobula | Free → Start-up |
| 300 | CoinGecko | Demo → Basic |
| 450 | Birdeye | Standard → Lite |
| 1.600 | Mobula | Start-up → Growth |
| 2.775 | Helius | Free → Developer |
| 3.525 | CoinGecko | Basic → Analyst |
| 15.925 | Mobula | Growth → Enterprise, giá từ 750 USD |
| 26.325 | CoinGecko | Analyst → Lite |
| 27.750 | Helius | Developer → Developer + credit bổ sung |

Các điểm này là tín hiệu lập ngân sách, không phải trigger tự động. Market Radar được nội suy theo nhu cầu giữa ba mức quan sát giả định và chặn ở 2.880 cửa sổ refresh/tháng; tỷ lệ cold Token Overview giảm dần từ 30% xuống 20% khi cache được chia sẻ trên tập người dùng lớn hơn. Sai số của hai giả định này có thể dịch chuyển CoinGecko và Birdeye đáng kể. Quyết định thật dùng mức tiêu thụ dự phóng trong 30 ngày, headroom cho peak traffic, tỷ lệ 429 và thời gian chuẩn bị nâng gói.

Một policy vận hành phù hợp là bắt đầu đánh giá khi dự báo đạt 70% quota, chuẩn bị nâng ở 85%, và không chờ đến khi provider từ chối request. Với provider có giới hạn throughput riêng như Mobula Wallet Analysis, RPS/RPM vẫn có thể buộc nâng hoặc thay đổi kiến trúc trước khi hết quota tháng.

## Nhu cầu provider và gói được chọn

| Provider | 300 MAU | 3.000 MAU | 30.000 MAU |
| --- | --- | --- | --- |
| CoinGecko | 10.620 credits → Basic 35 USD | 87.840 → Basic 35 USD | 552.960 → Lite 499 USD |
| Birdeye | 24.300 CU → Standard 0 USD | 97.200 → Lite 39 USD | 388.800 → Lite 39 USD |
| Mobula | 23.688 credits → Start-up 50 USD | 236.880 → Growth 400 USD | 2.352.000 → Enterprise từ 750 USD |
| Helius | 108.576 credits → Free | 1.085.760 → Developer 49 USD | 10.857.600 → Developer + 1M credit, 54 USD |
| Zerion | 216 requests → Developer 0 USD | 2.160 → Developer 0 USD | 21.600 → Developer 0 USD |

Zerion Developer cho key hiện tại 2.000 request/ngày, nên ba tổng tháng trên chưa vượt throughput trung bình. Nếu nhu cầu vượt mức này, tier công khai kế tiếp là Builder 149 USD/tháng với 250.000 request. Tại 30.000 MAU, Helius chỉ vượt Developer khoảng 8,6%; bảng giá chính thức cho mua thêm credit ở mức 5 USD mỗi 1 triệu, nên mô hình cộng một khối credit thay vì chọn Business 499 USD.

## Hạ tầng

Frontend Vite tiếp tục là Render Static Site, không có compute fee riêng trong baseline. API dùng Render Starter 7 USD ở 300 MAU, Standard 25 USD ở 3.000 MAU và hai Standard instance, tổng 50 USD, ở 30.000 MAU. Database dùng Supabase Free ở 300 MAU, Pro Micro 25 USD ở 3.000 MAU và Pro Small khoảng 30 USD sau compute credit ở 30.000 MAU.

Các lựa chọn instance là ngân sách dung lượng, chưa phải kết quả load test. Trước khi khẳng định 30.000 MAU, cần đo CPU, memory, p95 latency, connection pool và database size. Autoscaling Render cần workspace phù hợp; nếu chạy hai instance thủ công thì session pooler và single-flight process-local không ngăn refresh trùng giữa hai process.

## Cách đọc kết quả

Biên tăng theo MAU vì doanh thu thuê bao tăng tuyến tính trong khi provider bán theo bậc quota. Điều này không chứng minh hệ thống đã chịu được 30.000 MAU. Hai rủi ro lớn nhất là Mobula Wallet Core và adoption AI của người dùng Standard: một bên tạo bước nhảy gói dữ liệu, bên còn lại phát sinh chi phí dù không có doanh thu trực tiếp.

Kịch bản 300 MAU đã vượt free quota CoinGecko và Mobula theo giả định cơ sở. Vì vậy không nên viết rằng toàn bộ production có thể duy trì miễn phí. Cách trình bày phù hợp là free tier đủ cho thử nghiệm ban đầu; khi có lưu lượng đều đặn, Yoca nâng có chọn lọc provider theo số credit/CU quan sát được.

## Các đầu vào cần cập nhật khi có số liệu thật

- Phân phối Wallet Activity page thay vì chỉ dùng trung bình ba page.
- Market Radar theo cửa sổ refresh thực tế; không lấy 24 giờ chia TTL nếu không có người dùng liên tục.
- Đối chiếu Helius Developer cộng credit bổ sung với giới hạn throughput thực tế; Business chỉ cần thiết nếu tải đồng thời vượt khả năng Developer.
- Xin báo giá Mobula trước khi mua Enterprise; cho đến lúc đó dùng mức khởi điểm công khai 750 USD làm ngân sách.
- Load test Render/Supabase để thay ngân sách instance bằng cấu hình đo được.
- Tỷ lệ thuê bao năm. Nếu 30% người trả phí chọn năm với hai tháng miễn phí, doanh thu ghi nhận theo tháng giảm khoảng 5%; fixed fee trên mỗi giao dịch lại giảm vì chỉ thu một lần mỗi năm.

## Trạng thái quota AI

Cost forecast dùng adoption theo feature, không giả định mọi người dùng sử dụng hết quota. Quota v0 trong `AI_TIER_COST_MODEL_2026-07-19.md` đã được đồng bộ vào entitlement và Pricing UI ngày 2026-07-19. Wallet AI cũ không còn được quảng bá; Wash Trading Analysis và Chat có hạn mức riêng từ Plus.

Trước khi phát hành pricing thật, nhóm vẫn phải smoke test reserve/release của các feature và xác nhận Stripe Price ID tháng/năm trên dashboard. Calculator dùng expected adoption nên không thay thế phép kiểm tra stress ceiling khi quyền lợi thay đổi.

## Nguồn giá

Giá được rà ngày 2026-07-19 từ tài liệu chính thức: Mobula Pricing, CoinGecko API Pricing, Birdeye Pricing, Helius Pricing, Render Pricing/Free Deploy, Supabase Pricing, Brave Search API, Gemini API Pricing, Resend Pricing và Stripe Pricing. Chi tiết quota, endpoint unit cost và URL nằm trong `PROVIDER_QUOTA_RESEARCH_CHECKLIST.md`.
