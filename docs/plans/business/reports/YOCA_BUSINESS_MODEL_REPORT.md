# BẢN LƯU CŨ — KHÔNG DÙNG ĐỂ NỘP HOẶC TRÌNH BÀY

Nguồn báo cáo hiện hành là `typst/main.typ`; bản PDF được build tại `typst/build/yoca-business-model-report.pdf`. File này được giữ lại để đối chiếu lịch sử và không còn được cập nhật theo calculator.

# Mô hình kinh doanh và kế hoạch vận hành Yoca

## Định hướng sản phẩm

Yoca là nền tảng hỗ trợ người dùng theo dõi thị trường tài sản số, khảo sát token và pool, phân tích hoạt động ví, nhận diện dấu hiệu wash trading và khai thác các trợ lý AI theo ngữ cảnh. Giá trị mà nhóm chúng em hướng tới nằm ở khả năng nối các nguồn dữ liệu rời rạc thành một hành trình thống nhất: người dùng có thể đi từ bức tranh thị trường đến một token, xem thanh khoản và phân bổ người nắm giữ, sau đó tiếp tục đánh giá danh mục, lịch sử giao dịch và kết quả giao dịch của một ví.

Nhóm lựa chọn mô hình freemium kết hợp thuê bao. Các chức năng dữ liệu nền tảng vẫn giúp người dùng mới trải nghiệm được sản phẩm, trong khi doanh thu đến từ hạn mức AI cao hơn và các phân tích chuyên sâu. Cách tiếp cận này phù hợp với đặc điểm chi phí của Yoca: dữ liệu token phổ biến có thể được tái sử dụng giữa nhiều người dùng thông qua cơ sở dữ liệu, còn phân tích ví và AI thường phụ thuộc nhiều hơn vào từng yêu cầu cụ thể.

## Phân khúc và bảng giá

Pricing được chia thành bốn mức. Standard phục vụ người dùng muốn khảo sát sản phẩm; Lite dành cho người dùng theo dõi thị trường thường xuyên; Plus mở nhóm phân tích wash trading chuyên sâu; Pro hướng đến power user cần dung lượng nghiên cứu cao hơn. Giá năm bằng mười tháng sử dụng và cung cấp quyền truy cập trong mười hai tháng.

| Gói | Giá tháng | Giá năm | Quyền lợi tăng thêm |
| --- | ---: | ---: | --- |
| Standard | 0 USD | 0 USD | Các chức năng dữ liệu nền tảng; mỗi ngày 1 lượt cho Ask Yoca, Wallet Chat, Chart News và Volatility Summary |
| Lite | 39 USD | 390 USD | Ask Yoca 3 lượt/ngày; Wallet Chat 4; Chart News 2; Volatility Summary 3 |
| Plus | 79 USD | 790 USD | Ask Yoca 6; Wallet Chat 8; Chart News 4; Volatility Summary 4; Wash Trading Analysis 3; Wash Trading Chat 5 |
| Pro | 149 USD | 1.490 USD | Ask Yoca và Wallet Chat 12; Chart News và Volatility Summary 8; Wash Trading Analysis 5; Wash Trading Chat 10 |

Các hạn mức được đặt theo cost profile của từng tính năng thay vì tăng đồng loạt. Một lượt Ask Yoca phải tổng hợp ngữ cảnh sâu và có thể tìm kiếm bổ sung; Wallet Chat có thể gọi nhiều công cụ; Chart News có thể tạo nhiều bản tóm tắt trong một yêu cầu; Wash Trading kết hợp dữ liệu giao dịch, phân tích đồ thị và lời giải thích từ mô hình. Việc phân loại như vậy giúp quyền lợi của gói trả phí vẫn có giá trị, đồng thời duy trì khoảng an toàn cho chi phí dữ liệu và AI.

Mức giá được tham khảo trong nhóm sản phẩm phân tích dữ liệu crypto dành cho cá nhân và chuyên gia. Tại thời điểm khảo sát tháng 7/2026, CryptoQuant công bố các mức 29 và 99 USD/tháng; Dune công bố Analyst 75 USD và Plus 399 USD/tháng; Nansen API Pro ở mức 69 USD/tháng hoặc 49 USD/tháng khi trả năm. Yoca nằm giữa nhóm người dùng cá nhân thường xuyên và power user, chưa định vị như một công cụ dữ liệu doanh nghiệp nhiều chỗ ngồi.

## Cơ sở xác định chi phí

Nhóm chúng em đo chi phí theo hành trình sử dụng thay vì xem mỗi lượt mở trang là một lần gọi nhà cung cấp. Khi một yêu cầu đến backend, hệ thống ưu tiên dữ liệu có cấu trúc trong PostgreSQL. Dữ liệu chỉ được làm mới khi vượt thời hạn sử dụng phù hợp với từng nhóm nội dung. Vì vậy, hai người cùng xem một token trong cùng cửa sổ cập nhật có thể dùng chung dữ liệu, trong khi hai ví khác nhau thường cần hai lần làm mới riêng.

Mỗi hành trình đã được nối với số request và đơn vị tính phí của nhà cung cấp. Một lần làm mới Market Radar quan sát được sử dụng 17 CoinGecko credit và 135 Birdeye compute unit. Token Overview sử dụng khoảng 15 CoinGecko credit cùng 1 Mobula credit. Wallet Core sử dụng khoảng 21 Mobula credit và 100 Helius credit đối với ví có một trang holdings. Wallet Activity thay đổi từ 1 đến 10 Mobula request tùy mật độ giao dịch; biểu đồ từng token trong ví sử dụng một Zerion request cho mỗi token được chọn. Chi phí AI được suy ra từ số input, output và thinking token do Gemini trả về, cùng số Brave Search request phát sinh.

Mô hình sử dụng công thức tổng quát:

> Chi phí theo tháng = số tài nguyên cần làm mới × fan-out của hành trình × đơn giá provider + AI token/Search + hạ tầng + phí thanh toán.

Quyết định nâng gói không gắn cứng vào MAU. Nhóm bắt đầu đánh giá khi nhu cầu dự phóng đạt khoảng 70% quota và chuẩn bị nâng ở khoảng 85%; throughput, tỷ lệ lỗi 429 và thời gian phản hồi được xem như các điều kiện độc lập.

## Kịch bản doanh thu và chi phí

MAU trong phân tích là số người dùng khác nhau có ít nhất một tương tác cần dữ liệu Yoca trong cửa sổ 30 ngày. Mô hình sử dụng duy nhất một kịch bản cơ sở: mỗi MAU có tám phiên hoạt động mỗi tháng và 2% người dùng trả phí, gồm 1,25% Lite, 0,5% Plus và 0,25% Pro. Đây là đầu vào lập kế hoạch thận trọng cho giai đoạn MVP.

| Chỉ tiêu/tháng | 300 MAU | 3.000 MAU | 30.000 MAU |
| --- | ---: | ---: | ---: |
| Doanh thu | 376,50 USD | 3.765 USD | 37.650 USD |
| Data provider | 85 USD | 523 USD | từ 1.342 USD |
| Gemini và Brave Search | 71,75 USD | 762,49 USD | 7.669,88 USD |
| Render và Supabase | 7 USD | 50 USD | 80 USD |
| Email giao dịch | 0 USD | 20 USD | 20 USD |
| Phí thanh toán ước tính | 12,72 USD | 127,19 USD | 1.271,85 USD |
| Số dư đóng góp | 200,03 USD | 2.282,33 USD | 27.266,27 USD |
| Biên đóng góp | 53,13% | 60,62% | 72,42% |

Số dư đóng góp là phần còn lại sau chi phí trực tiếp, dùng để trang trải nhân sự, marketing, thuế, pháp lý, hỗ trợ người dùng và đầu tư sản phẩm. Con số này chưa phải lợi nhuận ròng. Ở quy mô 30.000 MAU, ngân sách Mobula dùng mức Enterprise công khai từ 750 USD; hợp đồng thực tế được chốt theo báo giá khi triển khai.

## Vận hành, nhân sự và nguồn vốn

Yoca được phát triển theo tiến trình PoC, MVP, vận hành ban đầu và mở rộng. Ở mốc 300 MAU, bốn thành viên tiếp tục tham gia bán thời gian và ưu tiên nguồn lực cho sản phẩm. Khoảng 3.000 MAU cho thấy sản phẩm đã có sức sống và có thể duy trì bốn vị trí thường xuyên ở mức chi phí thận trọng. Khi tiến đến 30.000 MAU, phạm vi hỗ trợ, bảo mật, dữ liệu và phát triển thị trường đòi hỏi mở rộng thành một doanh nghiệp nhỏ; phần lớn nguồn tiền tiếp tục được dành cho nhân sự và duy trì tăng trưởng.

Mô hình cơ sở sử dụng tăng trưởng tự tài trợ. Sau khi MVP chứng minh được khả năng kỹ thuật, sản phẩm hình thành tập người dùng ổn định và có bằng chứng về doanh thu định kỳ, Yoca có thể tiếp cận chương trình hỗ trợ startup, đối tác chiến lược hoặc nhà đầu tư thiên thần/seed. Nguồn vốn mở rộng được gắn với kế hoạch sử dụng cụ thể cho nhân sự, dữ liệu, hạ tầng, bảo mật và phát triển thị trường.

## Kết luận

Mô hình cho thấy pricing của Yoca có thể trang trải chi phí trực tiếp theo kịch bản cơ sở 2%, với điều kiện hệ thống tiếp tục kiểm soát khả năng tái sử dụng dữ liệu, AI usage và fan-out của phân tích ví. Ba mốc MAU thể hiện tiến trình từ MVP tự trang trải, sang duy trì đội ngũ thường xuyên và cuối cùng là mở rộng thành một doanh nghiệp nhỏ với biên an toàn có kiểm soát.
