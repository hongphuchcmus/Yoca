# Client runtime route inventory

Khảo sát ngày 2026-07-19 từ `client/src/App.tsx`, các page/component reachable và lời gọi API thực tế. Mục đích của danh sách này là xác định traffic người dùng cần đưa vào cost model; đây không phải danh sách toàn bộ server route.

## Journey chính cần benchmark

| Journey | Client route | Server API được gọi trực tiếp hoặc qua component | Provider có khả năng phát sinh | Trạng thái |
| --- | --- | --- | --- | --- |
| Market Radar | `/market` | token market pools: trending, top, gainers, new pairs; profitable traders gainers/losers | CoinGecko, Birdeye | active, benchmark cold/warm |
| Token discovery/pool | `/tokens`, `/tokens/:address/:poolAddress` | token details, pools, holders, holder stats, markets, trades và pool details | CoinGecko, Birdeye, Mobula, Moralis | active, benchmark cold/warm và token data coverage |
| Token Overview | `/tokens/:address` | token details, holders, markets; các tab/chart tải thêm fundamentals, pools, price history và news khi được mở | CoinGecko, Birdeye, Mobula, Moralis | active; tách initial load và interaction |
| Token history | `/historical-data/:address` | token details và token history | token providers qua server | active supporting journey |
| Wallet Overview | `/wallets/:address` | wallet tokens, token meta/markets, win rate, PnL, portfolio, balance charts, swaps, transfers, tags và các action mở rộng | Mobula, Zerion, Moralis, Helius cùng token providers | active; tách initial load và interaction |
| Compare Wallet | `/comparison/wallets` | balance, win rate và PnL cho nhiều ví; các tab holding/risk tải dữ liệu bổ sung | Mobula, Zerion, Helius | active; hệ số theo số ví |
| Wash Trading | `/wash-trading`, `/wash-trading/:mint` | `/api/v1/wash-trading/*`, gồm analysis và AI/chat theo thao tác | Helius Enhanced Transactions hoặc RPC fallback | active; tách analysis khỏi AI/chat |
| Transaction detail | `/transactions`, `/transactions/:txHash` | `/api/transactions/raw/:txHash` | Helius | active, user-triggered |

## Journey hỗ trợ

| Client route/feature | Phạm vi tính cost |
| --- | --- |
| `/profile` | Chỉ cộng token meta/market khi Watchlist render; linked wallet, settings, subscription và alert history là internal database/API. |
| `/alerts` | Tạo/đọc rule là internal API. Provider/webhook cost phát sinh nền phải dự báo riêng theo event rate, không cộng vào page load. |
| Global search | Chỉ phát sinh khi người dùng nhập từ khóa; không cộng vào mọi page view. |
| Wallet/Token AI chat | Chỉ phát sinh khi người dùng gửi prompt hoặc mở action yêu cầu dữ liệu; tách khỏi initial page load. |
| `/pricing`, `/unauthorized`, `/not-found` | Không tạo blockchain-provider journey. |
| `/` | Landing page không được coi là một lượt Market Radar nếu không phát sinh data component tương ứng. |

## Route loại khỏi dự báo runtime

- `/alerts-token-demo`: demo route.
- `/balance`: chart thử nghiệm với address hard-code.
- `/wallet-act`: activity thử nghiệm với address hard-code.
- `/secret-admin-dashboard`: hiện render trang Unauthorized, không phải user journey.
- Test scripts, mock data, Storybook/demo component và benchmark scripts không được cộng vào traffic người dùng.

## Kiểm tra lời gọi trực tiếp từ client

- Các `fetch` thô trong Market, Transaction, Wash Trading và Wallet Chat vẫn trỏ về `VITE_CLIENT_API_DOMAIN`/server Yoca. Chúng phải được nhận diện bằng server request context giống Hono client request.
- Không thấy client gọi thẳng CoinGecko, Birdeye, Mobula, Zerion, Moralis hoặc Helius data API trong production page.
- Solana devnet/testnet RPC trong payment flow là giao dịch thanh toán, không thuộc blockchain analytics provider cost model này.
- Solscan, GeckoTerminal embed, DiceBear và URL ảnh là liên kết/tài nguyên phía trình duyệt; không cộng vào quota API server.

## Quy tắc runner

- Initial-load journey chỉ gọi các request tự phát sinh khi page render.
- Interaction journey chạy riêng cho tab/chart, pagination, search, refresh, AI và modal.
- Cold run xóa dữ liệu database liên quan; warm run giữ nguyên database để đo database reuse.
- Một sample ghi server route pattern, status, latency, `dataUsage`, provider operation, attempts và credit/CU.
- Fan-out được giữ theo số page, token, wallet hoặc transaction thật; không ép về một request đại diện.
