# Cold/warm benchmark result — 2026-07-19

Run: `runs/2026-07-19T07-40-56-131Z_journey-cold`. Database được reset ngay trước run; mỗi journey dùng một resource ổn định và được lặp lại ngay để đo warm behavior.

| Journey | Cold | Warm | Cold provider attempts | Warm provider attempts | Endpoint pass |
| --- | ---: | ---: | ---: | ---: | ---: |
| Market Radar | 25.440 ms | 661 ms | 23 | 0 | 12/12 |
| Token Overview | 17.570 ms | 1.141 ms | 17 | 0 | 16/16 |
| Wallet Core | 5.476 ms | 799 ms | 7 | 0 | 8/8 |

Immediate warm repeat tránh 100% provider attempts trong ba sample. Đây là kiểm tra hành vi reuse ngay sau cold fetch, không được diễn giải thành cache-hit ratio của traffic production.

## Kiểm tra lại sau khi thêm single-flight

Hai journey được reset database và chạy độc lập sau thay đổi:

- Token Overview: `runs/2026-07-19T09-01-00-323Z_journey-cold`.
- Wallet Core: `runs/2026-07-19T09-03-47-373Z_journey-cold`.

Token Overview đạt 8/8 endpoint, cold 18.633 ms và warm repeat 1.268 ms. Hai route holder cùng yêu cầu một token chỉ còn tạo một `mobula.svc.token_holders` call thay vì hai; warm repeat không phát sinh provider attempt.

Wallet Core đạt 4/4 endpoint, cold 6.486 ms và warm repeat 814 ms. Bốn `mobula.svc.wallet_analysis` call còn lại tương ứng bốn period 24H, 7D, 30D và 90D mà overview cần; request 30D đồng thời từ win-rate dùng chung operation. Vì vậy không được xem cả bốn call này là duplicate. Hai `helius.svc.wallet_balances` call cho cùng ví vẫn còn và là khoảng trống coalescing kế tiếp của wallet portfolio/overview. Warm repeat không phát sinh provider attempt.

Khoảng trống Helius được xử lý và đo lại sau khi Overview dùng chung portfolio database-first cùng single-flight tại refresh boundary. Run `runs/2026-07-19T10-39-16-547Z_journey-cold` dùng ba ví ổn định: cả ba cold pass đều đạt 4/4 endpoint, mỗi ví chỉ phát sinh một `helius.svc.wallet_balances`, bốn Wallet Analysis và một Wallet Token Details. Cold journey nằm trong khoảng 5.726–6.724 ms; ba warm repeat nằm trong khoảng 807–844 ms và không gọi provider.

Market Radar được chạy lại ở chế độ observed-first tại `runs/2026-07-19T09-06-48-529Z_journey-observed`. Lượt đầu đạt 6/6 endpoint trong 22.023 ms, phát sinh 22 provider attempt và 2 retry; warm repeat đạt 6/6 trong 695 ms, không gọi provider. Do runner không kiểm soát trạng thái database trước lượt này, kết quả chỉ xác nhận nhánh provider rồi nhánh database, không được gắn nhãn cold benchmark độc lập.

Wallet Activity được chạy ở chế độ observed-first tại `runs/2026-07-19T09-35-25-204Z_journey-observed`. Hai route swaps/transfers đạt 2/2 trong 20.592 ms và tạo 15 `mobula.svc.wallet_activity` calls; warm repeat đạt 2/2 trong 1.260 ms, không gọi provider. Log cho thấy hai route cùng quét offset 0–400 rồi swaps tiếp tục đến offset 900. Vì vậy 15 calls phản ánh mật độ activity của ví mẫu cùng duplicate range hiện tại, không phải hằng số áp cho mọi ví.

Hai ví bổ sung trong `runs/2026-07-19T09-37-08-294Z_journey-observed` mỗi ví chỉ tạo 2 Mobula calls, trong khi ví đầu đã warm tạo 0. Phân phối cold-like quan sát được hiện là 2, 2 và 15 calls; cần dùng ít nhất base/conservative case thay vì một trung bình duy nhất.

Sau tối ưu, client chỉ tải tab đang mở; server dùng page-level single-flight và ghi coverage cho cả swaps/transfers từ cùng Mobula response. Sequential run `runs/2026-07-19T09-57-56-592Z_journey-observed` cho thấy ví mới dùng 6 calls ở Swaps rồi Transfers đọc database, không gọi thêm provider. Khi xóa riêng history/meta của đúng ví baseline nặng và chạy concurrent lại tại `runs/2026-07-19T09-59-59-065Z_journey-observed`, provider attempts giảm từ 15 xuống 10; warm repeat vẫn là 0.

Wallet Token Chart tại `runs/2026-07-19T09-38-14-672Z_journey-observed` chọn ba token và đạt 1/1 endpoint trong 6.469 ms. Lượt đầu tạo một Zerion fungible lookup cùng ba chart calls; warm repeat 810 ms và không gọi provider. Kết quả xác nhận chart cost tăng tuyến tính theo số token người dùng chọn.

## Provider units của cold pass

| Journey | Provider usage thành công quan sát được |
| --- | --- |
| Market Radar | CoinGecko 17 credits; Birdeye 135 CU gồm hai trader list x 30 CU và một token list x 75 CU. Có ba Birdeye 429/retry chưa cộng vào CU vì chưa xác nhận request lỗi có bị tính phí. |
| Token Overview | CoinGecko 15 credits; Mobula 1 credit cho một holder positions call sau single-flight. |
| Wallet Core | Mobula 21 credits: bốn Wallet Analysis x 5 và một Wallet Positions x 1; ba core samples dùng một trang Helius Wallet Balances, tương đương 100 credits. Ví nhiều holdings phải nhân 100 credits với số trang. |
| Wallet Activity | Mobula 1–10 credits trong các post-fix samples; upper bound hiện tại là 10 unique pages cho một range. |
| Wallet Token Chart | Zerion 4 requests cho interaction ba token đầu tiên: một mapping lookup + ba chart calls; mapping đã lưu thì còn một request/token. |

## Quan sát kiến trúc

- Market Radar fan-out theo pagination/batch: 17 request CoinGecko trong một cold journey, nên chi phí refresh phụ thuộc số page và batch chứ không chỉ số route client.
- Ba Birdeye operation được gọi đồng thời làm phát sinh 429 dù limiter code đang cho phép khoảng 13 request/giây. Standard key thể hiện giới hạn thực tế thấp hơn khi chạy đồng thời; cần quyết định giảm concurrency trước benchmark tải.
- Baseline trước single-flight: token holder route và holder-stats route cùng cold-start tạo hai Mobula holder calls cho cùng token. Run kiểm tra lại đã giảm còn một call.
- Wallet Overview, Portfolio, Token list và Win rate chạy đồng thời vẫn cần bốn Mobula Wallet Analysis calls theo bốn period khác nhau. Portfolio và Overview nay chia sẻ một Wallet Balances refresh thay vì gọi Helius riêng.
- Database reuse đã hiệu quả sau khi có dữ liệu. Single-flight xử lý duplicate holder và wallet portfolio refresh; pagination provider vẫn là fan-out hợp lệ cần đưa vào cost model.

## Quota-only boundary sơ bộ

Các phép chia dưới đây chỉ cho thấy giới hạn nếu mọi journey đều cold; chưa phải MAU forecast vì shared cache, TTL, retry, interaction và traffic mix chưa được đưa vào.

- CoinGecko Demo 10.000 credit/tháng / 17 ≈ 588 cold Market Radar refresh.
- Birdeye Standard 30.000 CU/kỳ / 135 ≈ 222 cold Market Radar refresh.
- CoinGecko Demo 10.000 credit/tháng / 15 ≈ 666 cold Token Overview refresh; Mobula Free 10.000 credit/tháng / 1 = 10.000 holder refresh nếu tách riêng giới hạn provider.
- Mobula Free 10.000 credit/tháng / 21 ≈ 476 cold Wallet Core journey.
- Với core sample một trang, Helius Free 1.000.000 credit/tháng / 100 = 10.000 cold Wallet Core refresh. Đây không phải giới hạn cố định: ví cần `p` trang chỉ còn `10.000 / p` refresh theo riêng quota Helius.

Ngưỡng nâng gói sau cùng phải dựa trên số refresh theo TTL, tỷ lệ cold/warm đo từ traffic, peak concurrency, 429 và các interaction chưa nằm trong runner.
