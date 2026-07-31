# AI tier cost model — 2026-07-19

Tài liệu nội bộ này nối các chức năng AI đang được client sử dụng với chi phí Gemini, dữ liệu provider và hạn mức thương mại. Quota v0 trong tài liệu đã được đồng bộ vào entitlement và Pricing UI ngày 2026-07-19; các số đo chi phí vẫn là đầu vào cần cập nhật khi có thêm benchmark.

## Nguyên tắc

Một lượt AI chỉ được xem là cùng loại khi có cost profile tương đương. Chi phí biến đổi của một lượt gồm:

```text
AI cost = Gemini input + Gemini output/thinking
        + search request phát sinh
        + blockchain provider units phát sinh để dựng context
```

Quota theo ngày là trần chống lạm dụng. Dự báo vận hành dùng tỷ lệ active user và số lượt trung bình, không giả định mọi thuê bao dùng hết quota mỗi ngày. Ngược lại, phép kiểm tra an toàn phải tính trường hợp một thuê bao dùng hết tất cả quyền lợi AI.

## Inventory runtime

| Nhóm thương mại | Runtime chính | Cost driver | Cache/reuse | Trạng thái usage hiện tại |
| --- | --- | --- | --- | --- |
| Ask Yoca AI | `/api/token-ai-chat` | Gemini 2.5 Flash; token context; có thể gọi Brave và nhiều data provider | Cache theo token/evidence | `ask_yoca_ai` |
| Wallet Chat | `/api/chat` với wallet context | Gemini 3.1 Flash-Lite cho tool selection/response; tool fan-out sang data provider | Chat cache 5 phút, hard TTL 30 phút; provider data có TTL riêng | `general_ai_chat` |
| Token Chart News | `/api/token-chart-news-events` | Gemini 2.5 Flash trên news/chart context; article fetch không tính như API trả phí | Database summary cache | `token_chart_news_summary` |
| Volatility Summary | `/api/token-volatility-news` | Gemini 2.5 Flash trên dữ liệu đã tổng hợp | Database summary cache | `volatility_signal_summary` |
| Wash Trading Analysis | `/api/v1/wash-trading/ai-analyze` và `/:mint` | Helius transaction input + deterministic graph + Gemini verdict | Transfer reuse 5 phút; verdict 4 giờ | `wash_trading_ai_analysis` |
| Wash Trading Chat | `/api/v1/wash-trading/chat` | Dựng lại deterministic analysis rồi gọi một Gemini explanation | Có thể dùng lại transaction input trong 5 phút | Chưa có feature ID riêng |

`/api/wallets/ai-analysis`, `WalletAiAnalysisPopup` và Wallet Behavior Analysis đã bị loại khỏi luồng sản phẩm, nên không được dùng làm cost profile. Wallet Audit route còn trong server nhưng client không gọi nên cũng không được đưa vào quyền lợi pricing hiện tại. Swap Summary/Token Deep modal vẫn được mount nhưng không có launcher đặt state mở, nên cũng bị loại khỏi runtime pricing.

## Số đo và cost proxy

Pilot `runs/2026-07-19T11-27-54-628Z_journey-observed/` cung cấp ba mẫu có Gemini:

| Feature | Gemini quan sát | Provider quan sát | Gemini cost/mẫu |
| --- | --- | --- | ---: |
| Ask Yoca AI | 17.303 input, 832 output, 1.916 thinking | 14 attempts, gồm 1 Brave Search | 0,0121 USD |
| Wallet Chat | 21.982 input, 1.367 output qua 3 calls | 19 attempts | 0,0075 USD |
| Wash Trading Analysis | 688 input, 682 output, 1.394 thinking | 1 Helius Enhanced attempt | 0,0054 USD |

Đây là sample cost, không phải mean hoặc p95. Để kiểm tra quota trước khi đủ distribution, mô hình dùng cost proxy bảo thủ:

| Nhóm | Cost proxy/lượt | Lý do |
| --- | ---: | --- |
| Ask Yoca AI | 0,0121 USD | Giữ nguyên mẫu deep context đầu tiên. |
| Wallet Chat | 0,0075 USD | Giữ mẫu multi-tool; provider quota được tính riêng. |
| Token Chart News | 0,0152 USD | Pilot PYTH tạo bốn Gemini calls cho bốn event summary. |
| Volatility Summary | 0,0038 USD | Pilot PYTH tạo một Gemini call với 2.023 input và 1.266 output/thinking token. |
| Wash Trading Analysis | 0,0054 USD | Giữ nguyên pilot Gemini; Helius tính riêng. |
| Wash Trading Chat | 0,0030 USD | Provisional cho một explanation dưới 180 từ; refresh on-chain tính ở cấp phiên. |

Không cộng Brave vào mọi Ask Yoca AI invocation. Pilot có một Search request, nhưng Brave chỉ phát sinh khi RSS/context hiện có không đủ. Business scenario phải dùng xác suất fallback riêng.

Pilot summary tại `runs/2026-07-19T12-04-07-444Z_journey-observed/` còn cho thấy Token Chart News gọi một Brave Search, còn Volatility gọi ba Brave Search và một CoinGecko chart request. Sau 1.000 Search request tương đương credit miễn phí, cost đầy đủ của hai mẫu xấp xỉ 0,0202 USD và 0,0188 USD. Vì vậy quota v0 dùng bound `Gemini + Brave sau free credit`; CoinGecko/provider unit tiếp tục được kiểm tra trong mô hình data chung.

## Quota đề xuất v0

`Standard` trên UI tương ứng tier `Free` trong entitlement. Số dưới đây là lượt mỗi ngày và reset theo UTC như implementation hiện tại.

| Feature | Standard/Free | Lite (39 USD) | Plus (79 USD) | Pro (149 USD) |
| --- | ---: | ---: | ---: | ---: |
| Ask Yoca AI | 1 | 3 | 6 | 12 |
| Wallet Chat | 1 | 4 | 8 | 12 |
| Token Chart News | 1 | 2 | 4 | 8 |
| Volatility Summary | 1 | 3 | 4 | 8 |
| Wash Trading Analysis | 0 | 0 | 3 | 5 |
| Wash Trading Chat | 0 | 0 | 5 | 10 |

Các implementation Wallet AI cũ, Behavior Analysis, Swap Summary và Token Deep Analysis không xuất hiện trong bảng quyền lợi vì đã bị loại hoặc không còn luồng truy cập từ client.

Wash Trading Analysis và Chat tách quota vì một bên dựng verdict/graph, bên còn lại là hội thoại diễn giải. Trong cost model, một phiên chat có tối đa một refresh on-chain và nhiều Gemini explanation; không nhân Helius cost với mọi câu nếu transaction input vẫn fresh.

### Vì sao thay quota cũ

Trước đợt đồng bộ ngày 2026-07-19, source và Pricing UI dùng mức Free 5/5/5/10, Lite 20/20/20/25 và Plus/Pro 50/100 lượt cho phần lớn feature. Nhân trực tiếp các giới hạn này với full cost proxy Gemini + Brave sau free credit cho ra stress ceiling tối thiểu sau, dù đã loại Wallet AI cũ và chưa cộng Wash Trading Chat:

| Tier hiện hành | Stress ceiling/tháng/người | So với giá tháng |
| --- | ---: | ---: |
| Free | khoảng 12,36 USD | Không có doanh thu trực tiếp |
| Lite | khoảng 40,98 USD | Vượt giá 39 USD trước data, hosting và payment fee |
| Plus | khoảng 103,50 USD | Vượt giá 79 USD |
| Pro | khoảng 207,00 USD | Vượt giá 149 USD |

Stress ceiling không phải expected cost, nhưng quota thương mại phải còn an toàn khi một nhóm người dùng sử dụng quyền lợi rất cao. Mức cũ không đạt điều kiện này và còn quảng bá Wallet AI đã bị loại khỏi runtime pricing. Vì vậy quota v0 đã thay thế mức cũ trong entitlement và Pricing UI; Wash Trading Chat có counter riêng và yêu cầu gói Plus trở lên.

## Kiểm tra trần AI/Search

Nếu một thuê bao dùng hết mọi quota mỗi ngày trong 30 ngày và mọi lượt đều là cache miss, cost proxy tạo trần sau:

| Tier | Gemini proxy/ngày | Gemini proxy/tháng | Tỷ lệ trên giá tháng |
| --- | ---: | ---: | ---: |
| Standard/Free | 0,0386 USD | 1,16 USD | Không có doanh thu trực tiếp |
| Lite | 0,1081 USD | 3,24 USD | 8,3% |
| Plus | 0,2398 USD | 7,19 USD | 9,1% |
| Pro | 0,4048 USD | 12,14 USD | 8,2% |

Nếu mọi lượt Ask Yoca, Chart News và Volatility đều dùng số Brave Search bằng pilot, phần Search sau free credit tăng trần thêm khoảng 0,45 USD/tháng cho Standard, 2,10 USD cho Lite, 3,60 USD cho Plus và 6,15 USD cho Pro. Tổng Gemini + Brave worst-case lần lượt là 1,61; 5,34; 10,79 và 18,29 USD/tháng.

Đây chưa phải tổng variable cost. Blockchain provider paid units, database, hosting, payment fee và support phải được cộng sau. Do đó quota được giữ để tổng Gemini + Search vẫn còn headroom thay vì dùng hết biên doanh thu.

Annual pricing hiện thu 10 tháng cho 12 tháng sử dụng. Khi kiểm tra biên chi phí gói năm, doanh thu hiệu dụng mỗi tháng là 32,50 USD cho Lite, 65,83 USD cho Plus và 124,17 USD cho Pro. Bound Gemini + Brave tương ứng khoảng 16,4%, 16,4% và 14,7% doanh thu hiệu dụng; quota ngày không được tăng chỉ vì người dùng trả theo năm.

## Kịch bản sử dụng để dự báo

Không dùng quota tối đa làm mức trung bình. Baseline ban đầu theo tỷ lệ người dùng của tier sử dụng feature ít nhất một lần trong ngày hoạt động:

| Feature | Thấp | Cơ sở | Cao | Lượt trong ngày có sử dụng |
| --- | ---: | ---: | ---: | ---: |
| Ask Yoca AI | 10% | 25% | 45% | 1 / 1,5 / 3 |
| Wallet Chat | 5% | 15% | 30% | 1 / 1,5 / 3 |
| Token Chart News | 10% | 30% | 55% | 1 / 2 / 4 |
| Volatility Summary | 15% | 35% | 60% | 1 / 2 / 4 |
| Wash Trading Analysis (Plus/Pro) | 2% | 8% | 20% | 1 / 1 / 2 |
| Wash Trading Chat (Plus/Pro) | 1% | 5% | 15% | 1 / 1,5 / 2 |

Các tỷ lệ là giả định sản phẩm để dựng ba scenario, không phải số đo người dùng. Phân tích độ nhạy phải thay đổi cả adoption lẫn số lượt, thay vì chỉ nhân MAU với quota.

## Việc cần đo tiếp

- Lặp Ask Yoca AI, Wallet Chat và Wash Trading trên nhiều prompt/resource để lấy median và p95 token/provider fan-out.
- Ghi thêm mẫu cho Token Chart News và Volatility Summary.
- Đo tỷ lệ Brave fallback của Ask Yoca AI.
- Tách Wallet Chat prompt theo intent; overview, PnL và exact transactions không có cùng provider fan-out.
- Tiếp tục áp dụng nguyên tắc reserve usage ngay trước lần gọi Gemini/provider có tính phí và release reservation khi xử lý thất bại.
- Smoke test cả hai counter Wash Trading Analysis và `wash_trading_ai_chat` sau mỗi thay đổi entitlement.

## Cách đưa vào business model

Phần nộp chỉ cần giải thích ba ý: AI feature được phân nhóm theo cost profile; quota tăng theo tier nhưng tác vụ phân tích chuyên sâu chỉ mở từ Plus; và hệ thống theo dõi token/provider usage để điều chỉnh quota. Không đưa lịch sử migration, route legacy hoặc trạng thái triển khai nội bộ vào slide/báo cáo.
