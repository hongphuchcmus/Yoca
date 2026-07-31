# AI benchmark — 31/07/2026

Hai run được dùng cho mô hình kinh doanh:

- `2026-07-31T08-39-20-686Z_journey-observed`: Chart News và Volatility, 5 token.
- `2026-07-31T08-42-16-337Z_journey-observed`: Ask Yoca, Wallet Chat, Wash Trading Analysis và Wash Trading Chat, 5 mẫu.

Tất cả 30 endpoint request đều trả thành công. Chi phí Gemini được tính theo giá Gemini 3.1 Flash-Lite: 0,25 USD cho một triệu input token và 1,50 USD cho một triệu output token. Median được dùng cho kịch bản cơ sở; giá trị lớn nhất trong bộ năm mẫu được dùng như p95 thận trọng.

| Hành trình | AI samples | Model calls/lượt | Median latency | p95 latency | Median Gemini cost | p95 Gemini cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ask Yoca | 5 | 1 | 25,85 s | 29,43 s | 0,005322 USD | 0,005503 USD |
| Wallet Chat | 5 | 3 | 16,79 s | 19,01 s | 0,005591 USD | 0,007074 USD |
| Chart News | 5 | 4–5 | 20,81 s | 25,12 s | 0,003223 USD | 0,003411 USD |
| Volatility | 5 | 1 | 9,17 s | 11,99 s | 0,000686 USD | 0,000794 USD |
| Wash Trading Analysis | 2 | 1 | 5,15 s | 5,17 s | 0,000901 USD | 0,000945 USD |
| Wash Trading Chat | 5 | 1 | 3,23 s | 3,64 s | 0,000971 USD | 0,001023 USD |

Wash Trading Analysis có năm endpoint samples nhưng chỉ hai lần gọi model; ba lượt sau tái sử dụng verdict đã lưu. Vì vậy bảng chỉ tính hai AI samples và không xem cache hit là một lần sinh nội dung mới.

Ask Yoca dùng Brave Search trong 4/5 mẫu. Chart News dùng Brave trong 4/5 mẫu; Volatility dao động 0–3 Brave request. Wallet Chat không dùng Brave trong bộ câu hỏi này nhưng mỗi lượt tạo ba model calls và 9–10 blockchain provider attempts.

Với p95 unit cost và giả định người dùng sử dụng hết hạn mức mỗi ngày trong 30 ngày, riêng Gemini có stress ceiling xấp xỉ:

| Gói | Hạn mức bốn module chính | Wash Trading | Gemini ceiling/tháng |
| --- | ---: | ---: | ---: |
| Standard | 5 lượt/module/ngày | Không mở | 2,52 USD |
| Lite | 8 lượt/module/ngày | Không mở | 4,03 USD |
| Plus | 12 lượt/module/ngày | Analysis 3, Chat 5 | 6,28 USD |
| Pro | 20 lượt/module/ngày | Analysis 5, Chat 10 | 10,52 USD |

Ceiling trên chưa cộng Brave Search, blockchain provider, hạ tầng và phí thanh toán. Calculator tài chính sử dụng mức sử dụng kỳ vọng theo MAU thay vì giả định mọi người dùng đều chạm trần mỗi ngày.
