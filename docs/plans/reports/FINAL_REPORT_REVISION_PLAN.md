# Working plan — chỉnh sửa báo cáo cuối kỳ Yoca

File nội bộ để theo dõi tiến độ giữa nhóm và Codex. Không đưa vào báo cáo, không dùng như nội dung nộp. `note_nhan_xet.md` tiếp tục giữ vai trò đối chiếu feedback của thầy; file này giữ cấu trúc đích, thứ tự batch và các việc phải kiểm chứng trong quá trình viết.

Quy ước:
- `[ ]` chưa làm.
- `[-]` đang làm hoặc đã có bản nháp nhưng chưa kiểm chứng xong.
- `[x]` hoàn tất sau khi đã đối chiếu source, tài liệu và nội dung liên quan.
- Không đánh dấu hoàn tất chỉ vì đã viết được văn bản; hình, reference và nội dung các chương liên quan cũng phải khớp.

## Nguyên tắc chung cho mọi batch

- [ ] Trước khi viết một phần, đọc lại nội dung hiện tại và xác định phần nào giữ, phần nào dời, phần nào bỏ.
- [ ] Đối chiếu source code thật: route, service, schema/type, database table, test và config liên quan. Không suy luận type hoặc luồng chỉ từ tên file.
- [ ] Với provider/framework/sản phẩm bên ngoài, ưu tiên tài liệu chính thức; ghi lại ngày truy cập đối với pricing, quota và giới hạn có thể thay đổi.
- [ ] Nếu lời kể của nhóm, source và tài liệu không khớp, dừng phần kết luận đó và hỏi lại trước khi viết.
- [ ] Chỉ chọn các chi tiết kỹ thuật giúp giải thích quyết định. Không đưa toàn bộ lịch sử phát triển hoặc mọi khó khăn vào báo cáo.
- [ ] Được phép giản lược bảng, component và pipeline thành mô hình khái niệm, nhưng không tạo tính năng, số liệu hay bảo đảm kỹ thuật không tồn tại.
- [ ] Viết với tư cách người trong nhóm: dùng “nhóm chúng em/nhóm em” khi kể lựa chọn và trải nghiệm; dùng “Yoca/hệ thống” khi mô tả hành vi kỹ thuật. Tránh lặp chủ ngữ máy móc.
- [ ] Ưu tiên văn xuôi và mạch kể; hạn chế subsection, bullet và các đoạn liệt kê dài trong bản báo cáo.
- [ ] Với phần có lịch sử thay đổi, dùng mạch vừa đủ: kỳ vọng ban đầu → vấn đề quan sát được → cách xử lý → trade-off/kết quả còn hạn chế.
- [ ] Không làm kiến trúc có vẻ được thiết kế hoàn hảo từ đầu. Thừa nhận ngắn các điều chỉnh quan trọng khi chúng giúp người đọc hiểu quyết định hiện tại.
- [ ] Không đưa mâu thuẫn cá nhân, quy trách nhiệm cho thành viên/giảng viên hoặc chi tiết trao đổi nhạy cảm với provider vào báo cáo.
- [ ] Sau mỗi batch, rà reference chéo, thuật ngữ, tên chức năng, tên provider và giọng văn với các phần đã hoàn tất trước đó.

## Cấu trúc đích dự kiến

- [ ] Chốt cấu trúc 6 chương sau khi kiểm tra yêu cầu template và ảnh hưởng đến đánh số/reference.
- [ ] Chương 1 — Giới thiệu: bối cảnh, mục tiêu, phạm vi, cách tiếp cận, đóng góp và bố cục.
- [ ] Chương 2 — Các hệ thống và nguồn dữ liệu liên quan: khảo sát nền tảng tương tự, khoảng trống của Yoca, giới thiệu provider thật sự được dùng và ràng buộc dữ liệu.
- [ ] Chương 3 — Phân tích và đặc tả yêu cầu: người dùng, tình huống sử dụng, yêu cầu chức năng/phi chức năng, use case và tiêu chí chấp nhận.
- [ ] Chương 4 — Kiến trúc và thiết kế hệ thống: kiến trúc tổng thể, tích hợp provider, contract/validation, cache, database/ERD, luồng nghiệp vụ và các quyết định kỹ thuật chính.
- [ ] Chương 5 — Triển khai, kiểm thử và đánh giá: môi trường, luồng chức năng đã cài đặt, hình giao diện, khó khăn triển khai, phạm vi kiểm thử có thật và đánh giá hạn chế.
- [ ] Chương 6 — Kết luận và hướng phát triển: kết quả có bằng chứng, đóng góp, hạn chế và hướng cải thiện.
- [ ] Nếu không tách thành 6 chương, giữ cùng ranh giới nội dung nhưng ghi rõ mapping trở lại cấu trúc 5 chương; không để phần công nghệ quay lại Chương 2 theo kiểu giáo khoa.

## Batch 0 — kiểm kê và chuẩn bị hạ tầng báo cáo

- [x] Lập inventory file/chapter/input/image/reference hiện tại và xác định nơi cần thêm chapter mới.
- [x] Kiểm tra main.tex, package hỗ trợ landscape/rotation, bibliography, label và quy tắc đặt hình/bảng.
- [x] Tạo Puppeteer config dùng `/usr/bin/chromium-browser` cho `mmdc`; giữ cờ no-sandbox khi môi trường yêu cầu.
- [x] Tạo lệnh/script render đồng nhất toàn bộ `.mmd` sang PDF, gồm nền trắng, kích thước và output path ổn định.
- [x] Xác định cách compile LaTeX hiện có và cách kiểm tra PDF mà không làm thay đổi source ngoài phạm vi báo cáo.
- [x] Lập danh sách placeholder, mục trống, hình thiếu và reference có nguy cơ hỏng trước khi di chuyển nội dung.

## Batch 1 — Chương 2: hệ thống liên quan và provider dữ liệu

- [x] Rút gọn khảo sát Arkham, Birdeye, CoinGecko, Dune và Nansen; giữ sản phẩm chính, cách tiếp cận đáng học hỏi, giới hạn và liên hệ với Yoca.
- [x] Giảm mô tả mang tính quảng bá hoặc khẳng định cơ chế nội bộ không có nguồn đáng tin cậy.
- [x] Bổ sung đoạn lập luận trước bảng so sánh: lý do chọn đối tượng và tiêu chí; không đưa Yoca vào bảng quá đột ngột.
- [x] Rà lại tiêu chí bảng theo chức năng thật của Yoca: market/token/pool, wallet, transaction, alert, AI explanation, khả năng tiếp cận và mức tùy biến.
- [x] Lập bản đồ endpoint/service → provider → cache/table trước khi viết provider. Phân biệt active, fallback/enrichment, legacy và utility không còn consumer.
- [x] Kiểm chứng vai trò CoinGecko, Birdeye, Mobula, Zerion, Helius, Moralis và các nguồn AI/payment thực tế. Không liệt kê CoinMarketCap hoặc Dune SIM như nguồn vận hành nếu source không dùng.
- [x] Research ngắn về sản phẩm chính, API phù hợp với Yoca, free tier/quota/pricing và giới hạn của từng provider bằng nguồn chính thức.
- [x] Chọn cách trình bày provider súc tích; không biến Chương 2 thành catalog API. Tập trung vào lý do lựa chọn và ràng buộc đã ảnh hưởng đến thiết kế.
- [x] Viết ngắn lịch sử thay đổi nguồn dữ liệu: Birdeye ban đầu → Mobula/Zerion/Helius theo từng miền; giữ chi tiết đủ để dẫn sang Chương Kiến trúc.
- [x] Nêu PnL và lịch sử ví là dữ liệu có thể tự suy ra về nguyên tắc nhưng chi phí index, định giá lịch sử và tính không ổn định của transaction abstraction vượt phạm vi đồ án.
- [x] Dời toàn bộ phần React/Hono/ORM/monorepo/caching đang mang tính kiến trúc sang Chương 4; Chương 2 chỉ giữ nền tảng thật sự cần cho việc hiểu bài toán.
- [x] Cập nhật logo/hình provider nếu cần; mỗi hình phải có caption/reference có ích, tránh logo đứng riêng không được nhắc lại.
- [x] Rà citations và bổ sung bibliography cho Mobula, Zerion, Helius, Moralis cùng pricing/docs đã sử dụng.

## Batch 2 — Chương 3: phân tích và đặc tả yêu cầu

- [x] Tách nội dung yêu cầu khỏi kiến trúc/cài đặt; không giải thích Hono, PostgreSQL, cache hoặc provider chi tiết trong chương này.
- [x] Rà các chức năng thật theo route/page hiện có; phân biệt chức năng hoàn thiện, chức năng giới hạn và phần chỉ còn dấu vết trong source.
- [x] Dùng một user journey xuyên suốt để kết nối các chức năng: Market Overview → Token Pool → Token Overview → Wallet Overview → User → AI Features/Limit.
- [x] Giữ sơ đồ use case tổng quát và hai sơ đồ phụ nếu chúng phản ánh đúng actor/use case; sửa caption, tên use case và phần giải thích để không lặp danh sách chức năng.
- [x] Rà yêu cầu phi chức năng theo khả năng chứng minh: tính đúng hợp đồng dữ liệu, phản hồi khi upstream lỗi, cache, bảo mật/xác thực, usability và maintainability.
- [x] Không đưa SLA, hiệu năng hoặc độ ổn định định lượng nếu chưa đo.
- [x] Viết kế hoạch kiểm thử và tiêu chí chấp nhận ở mức thiết kế; các tiêu chí phải nối được sang kết quả ở Chương 5.
- [x] Hạn chế chia nhỏ các mục trống. Có thể dùng một bảng kịch bản/tiêu chí nếu rõ hơn nhiều subsection ngắn.
- [x] Viết lại tổng kết Chương 3 để chỉ tóm tắt yêu cầu và phạm vi, không tóm tắt kiến trúc đã được dời đi.

## Batch 3 — Chương 4: kiến trúc tổng thể và quyết định công nghệ

- [x] Tạo chapter kiến trúc mới và dời nội dung phù hợp từ Chương 2/3; cập nhật label/reference/bố cục chương ở Chương 1 và phần tổng kết.
- [x] Mở chương bằng vấn đề kiến trúc thật: hợp nhất dữ liệu từ nhiều provider có độ phủ, schema, quota, chi phí và độ tin cậy khác nhau.
- [x] Rà kiến trúc source trước khi đặt tên layer/module; không mô tả clean architecture hoặc microservice nếu source không thể hiện.
- [x] Mô tả monorepo/full-stack TypeScript và monolith phân lớp theo lợi ích thật với phạm vi đồ án.
- [x] Kiểm chứng pattern route → `get*` → cache/staleness → `fetch*` → validate/normalize → upsert → response; ghi là pattern chủ đạo nếu có ngoại lệ.
- [x] Giải thích boundary validation ở mức kiến trúc; chi tiết error envelope/invalid JSON dành cho Batch 5 và Batch 7 khi rà luồng lỗi thực tế.
- [x] Liên hệ Hono RPC/shared types/Drizzle với mục tiêu phát hiện sai lệch sớm; không xem type safety là thay thế runtime validation hay testing.
- [x] Viết lý do chọn React/Vite/Hono/Drizzle/PostgreSQL/ECharts dựa trên nhu cầu Yoca và trade-off; bỏ phần định nghĩa giáo khoa.
- [x] Kiểm chứng retry, rate limit, API-key rotation, stale fallback và multi-provider fallback trong code trước khi khẳng định; không đưa các cơ chế chưa đồng đều thành bảo đảm toàn hệ thống.
- [x] Phân biệt rõ multi-provider theo miền với fallback đa provider. Nêu nhóm hạn chế fallback tràn lan vì khác biệt type và chi phí bảo trì.
- [x] Bổ sung sơ đồ kiến trúc tổng thể mới: client, Hono API, domain/service, validation/adapter, PostgreSQL/cache, provider và AI/payment.
- [x] Sơ đồ kiến trúc chỉ thể hiện quan hệ khái niệm; tránh danh sách framework/logo quá nhiều và tránh đường nối không giải thích được.

## Batch 4 — dữ liệu, cache, schema evolution và ERD

- [x] Rà schema Drizzle và consumer service trước khi quyết định bảng active/legacy/deprecated; các read model Wallet song song còn consumer nên chưa gắn nhãn deprecated.
- [x] Viết mục tiêu database theo hai lớp: dữ liệu nền tương đối chuẩn hóa và cache/read model phi chuẩn hóa có chủ đích.
- [x] Giải thích tách bảng theo nguồn dữ liệu, nhịp cập nhật và khả năng refresh; tránh một row cần 2–3 provider mới hoàn chỉnh.
- [x] Viết chiến lược DB-first và coverage metadata cho lịch sử; phân biệt TTL cache, interval coverage và snapshot/read model.
- [x] Kiểm chứng việc tận dụng enrichment dư; chỉ mô tả như khả năng áp dụng ở các luồng đã kiểm soát khóa/nullability, không khái quát toàn hệ thống.
- [x] Dùng nullability của symbol/logo/price change làm ví dụ cho schema phòng thủ trước response không đầy đủ.
- [x] Mô tả thay đổi schema theo hướng evolutionary architecture/incremental replacement: xây model mới, chuyển consumer, rồi loại bỏ model cũ.
- [x] Xác định các bảng wallet legacy/song song và bảng nào còn consumer trước khi vẽ ERD.
- [x] Tạo ERD tổng thể theo miền, thể hiện User/Payment, Token/Market, Wallet/Analysis, Transaction, Alert và AI/cache.
- [x] Tách ERD chi tiết đủ đọc trên A4 thành các lát cắt identity/payment, alert, token/market, content, wallet và transaction.
- [x] Rà miền Wallet gồm overview/portfolio, total/per-token balance history, `wallet_analyses`, transfer/swap history, coverage meta, Helius/enhanced transaction, identity/tag/follow, token PnL, first fund và AI caches.
- [x] Gom nhiều bảng vật lý thành khái niệm trên ERD tổng thể; ERD chi tiết ghi rõ logical relation và physical FK.
- [x] Chỉ giữ PK, FK/logical key và trường chính trên hình; phần văn bản giải thích quyết định thay vì đọc lại từng đường nối.
- [x] Render Mermaid đã thay đổi, kiểm tra trực tiếp tỷ lệ PDF và build trong ngữ cảnh trang báo cáo.
- [x] Cập nhật caption/label/đoạn dẫn và đảm bảo hình xuất hiện gần đoạn giải thích tương ứng.

## Batch 5 — câu chuyện kỹ thuật PnL, provider migration và độ tin cậy

- [x] Chọn mức chi tiết vừa đủ cho quá trình tự tổng hợp PnL từ Helius Enhanced Transactions.
- [x] Nêu vấn đề event/data swap thiếu hoặc không đáng tin cậy, nhu cầu đối chiếu explorer/provider và heuristic dựa trên balance/program data.
- [x] Không trình bày heuristic như decoder tổng quát đã chính xác; ghi rõ giới hạn kiểm chứng và hiệu năng với ví lớn.
- [x] Giải thích vì sao lịch sử giao dịch không dự đoán trước, định giá tại thời điểm giao dịch và độ sâu dữ liệu khiến tự index toàn bộ vượt phạm vi.
- [x] Viết migration khoảng một tháng sang Mobula/Zerion như một quyết định điều chỉnh phạm vi; không kể toàn bộ diễn biến nội bộ.
- [x] Viết Balance Chart theo miền: trước dùng Birdeye; total balance hiện ưu tiên Mobula; per-token history giữ Zerion. Đã kiểm tra code cuối cùng trước khi chốt.
- [x] Nêu việc đối chiếu Zerion total với Helius portfolio đã phát hiện sai lệch phân loại tài sản/token spam; không khẳng định chi tiết nội bộ Blockaid.
- [x] Thể hiện băn khoăn “tự làm hay dùng provider” theo cách trưởng thành: nhóm tập trung giá trị vào chuẩn hóa, kiểm soát chất lượng, cache và khả năng thay nguồn thay vì tự xây indexer vượt phạm vi.
- [x] Đưa câu chuyện chi tiết vào mục thách thức kỹ thuật Chương 5; Chương 2 chỉ giữ vai trò provider và Chương 4 chỉ giữ quyết định kiến trúc.

## Batch 6 — giao diện và hình chức năng

- [x] Rà source UI theo trang/component/style system: Carbon React, SCSS module, utility class và component tự xây.
- [x] Xác định màn hình được đổi mới nhiều: Landing, Market Overview, Wallet; xác định component cũ còn lại ở Token Pool và Token Overview.
- [x] Viết khó khăn ở cấp quy trình/kỹ thuật: chọn design system sớm khi navigation chưa ổn định, thay đổi định hướng giữa dự án, thiếu component governance và migration plan.
- [x] Không ghi bất đồng cá nhân hoặc vai trò của giảng viên. Không tuyên bố migration hoàn tất nếu behavior/component legacy vẫn tồn tại.
- [x] Nêu vấn đề không chỉ là style: component contract, interaction behavior, accessibility, loading/error/empty state và khả năng bảo trì.
- [x] Quyết định bộ hình tối thiểu theo user journey thay vì mỗi subsection một screenshot; lưu tại `FINAL_REPORT_SCREENSHOT_CHECKLIST.md`.
- [x] Chốt danh sách hình dự kiến: Market Overview; Token Pool; Token Overview; Wallet Overview/analysis; User/profile/watchlist; AI feature/limit; localization English/USD và Vietnamese/VND.
- [ ] Chụp ảnh thật sau khi dữ liệu demo ổn định; đảm bảo nền/viewport thống nhất, không lộ thông tin nhạy cảm và caption mô tả giá trị.
- [x] Thay toàn bộ `% CHÈN HÌNH` bằng quyết định ảnh chính/ảnh tùy chọn; không cố chụp mỗi subsection.
- [ ] Sau khi có ảnh thật, đồng bộ thuật ngữ UI trong ảnh với phần mô tả chức năng và use case.

## Batch 7 — triển khai, kiểm thử và đánh giá

- [ ] **CI/CD đang được phát triển ở nhánh khác: trước khi viết mục 5.2 phải rà nhánh/workflow cuối cùng và trạng thái merge/chạy thực tế.**
- [ ] Sau khi CI/CD hoàn thành, cập nhật 5.2 theo pipeline thật: trigger, job kiểm tra, build/deploy, quản lý environment/secret, migration và smoke check sau triển khai.
- [ ] Nếu pipeline chưa hoàn thành tại thời điểm chốt báo cáo, mô tả trung thực là quy trình đang hoàn thiện và đổi tiêu đề để không tạo cảm giác đã có CI/CD tự động đầy đủ.
- [x] Rà package scripts, Vitest config và toàn bộ `.test/.spec` ở client/server; phân loại test theo unit, component, route/service và integration có mock.
- [x] Ghi đúng những gì test hiện có chứng minh: auth, payment, alert/webhook, AI, wallet/PnL, rate limit, upstream error và một số component.
- [x] Không gọi Zod/strong typing là kiểm thử; trình bày chúng như lớp validation/fail-fast hỗ trợ độ tin cậy.
- [x] Xây phạm vi “vừa đủ báo cáo”: normalizer/calculation unit test; provider contract test bằng fixture; route/service test với mock upstream; cache fresh/stale/error; component state; smoke test luồng demo.
- [x] Chọn status cần kiểm tra: 200, validation 400, rate limit 429, upstream 500/502, invalid JSON, error envelope và schema mismatch.
- [x] Xác định test nào đang có và test nào còn là hướng phát triển; không viết kết quả cho test chưa tồn tại.
- [x] Chạy test ngày 11/07/2026 và ghi đúng kết quả: client 155/172, server 181/189; không che test đỏ hoặc gọi đây là suite đã pass.
- [ ] Sửa hoặc thống nhất lại contract cho 17 client test và 8 server test đang đỏ, sau đó chạy lại trước khi chốt bản nộp.
- [ ] Không chạy compile/type-check TypeScript để xác nhận theo quy tắc repo.
- [x] Không có benchmark đủ tin cậy nên chuyển phần hiệu năng thành đánh giá định tính và hạn chế; không bịa số cache hit/miss.
- [x] Viết hạn chế rõ: chưa có load test đầy đủ, E2E/staging còn hạn chế, external API có thể đổi response/quota và lỗi 4xx/5xx vẫn ảnh hưởng trải nghiệm.
- [x] Viết quy trình tích hợp/triển khai dựa trên config/source thật; ghi rõ CI/CD đang ở nhánh khác và chưa được xem là kết quả hoàn thành.
- [x] Sửa tổng kết chương để phản ánh test suite còn đỏ và CI/CD chưa merge.

## Batch 8 — kết luận, đồng bộ và rà toàn văn

- [x] Hoàn thiện Tóm tắt theo mạch vấn đề → cách tiếp cận → kết quả chính → giới hạn; ghi rõ test/CI/Alert History chưa hoàn tất.
- [x] Rà `Appendix/glossary.tex`, bổ sung thuật ngữ chuyên ngành/tiếng Anh thực sự xuất hiện và thống nhất cách dịch với các chương.
- [x] Include Tóm tắt vào `main.tex`, kiểm tra mục lục và đánh số trang; Tóm tắt hiện ở phần đầu sau Bảng thuật ngữ.
- [x] Bật Bảng thuật ngữ trong `main.tex`; tiếp tục cập nhật thuật ngữ ở từng batch và rà toàn bộ ở Batch 8.
- [x] Viết lại đóng góp dựa trên kết quả cuối: lớp dữ liệu nhiều provider, cache/read model, phân tích Wallet, validation/type contract, UI journey, localization và AI explanation.
- [x] Không dùng số trang/tính năng làm thước đo; nhấn chiều sâu của luồng Market → Pool → Token → Wallet → User → AI.
- [x] Nêu hạn chế có chọn lọc: phụ thuộc provider, read model provider-specific, UI/localization chưa hoàn tất và phạm vi kiểm thử/vận hành còn giới hạn.
- [x] Nối hướng phát triển trực tiếp với hạn chế: contract regression, observability/retry/circuit breaker, giảm coupling provider, UI governance, E2E/load test, CI/CD và Alert History.
- [x] Đồng bộ Chương 1 về mục tiêu, đóng góp và bố cục với cấu trúc sáu chương.
- [x] Rà label/ref/citation/caption và build lại mục lục/danh sách hình/bảng; không có citation/reference undefined.
- [x] Rà thuật ngữ Việt/Anh, tên provider/framework và ký hiệu code/database ở các phần đã viết lại.
- [x] Viết lại Chương 6 để bỏ danh sách chức năng lặp, câu chung chung và kết luận vượt quá bằng chứng.
- [x] Đọc lại output PDF cho Tóm tắt, mục lục, Chương 6 và các bảng/hình mới; các cảnh báo PDF anchor/version cũ vẫn để backlog kỹ thuật của template.
- [x] Cập nhật `note_nhan_xet.md` theo các backlog thực: ảnh, CI/CD, test đỏ và Alert History.

## Các batch chốt bản nộp — không còn công việc “sau báo cáo”

Các batch từ 9 trở đi là một phần của đợt hoàn thiện báo cáo cuối. Một chức năng chỉ được giữ trong nhóm kết quả đã triển khai khi source, test và nội dung báo cáo cùng khớp. Nếu không thể hoàn thành một chức năng trước hạn, phải thu hẹp tuyên bố trong toàn bộ báo cáo thay vì chuyển âm thầm thành việc sau báo cáo.

### ⚠️ CHECKLIST NHÓM BẮT BUỘC TỰ THAO TÁC — KHÔNG ĐƯỢC ĐÁNH DẤU XONG CHỈ VÌ CODE/BÁO CÁO ĐÃ VIẾT

- [ ] **DATABASE:** xác nhận đúng database demo có thể xóa dữ liệu, sau đó chạy `db:reset` để Supabase nhận schema mới. Không chạy nhầm project/database cần giữ dữ liệu; lưu lại kết quả reset không chứa connection string.
- [ ] **ALERT DELIVERY:** managed Helius webhook đã được tạo và nhận SWAP thật, đồng thời loại retry trùng trong cùng process. Còn cấu hình ít nhất một kênh email/Discord hợp lệ để xác nhận delivery và Alert History; sau đó chuyển signature dedupe sang persistence để giữ idempotency qua restart.
- [ ] **WEBHOOK HARDENING:** tách bước trả `2xx` khỏi email/Discord delivery bằng hàng đợi hoặc outbox; lần smoke test chưa có delivery mất 596 ms nên xử lý đồng bộ có thể vượt thời hạn phản hồi khi kênh ngoài chậm.
- [ ] **ALERT HISTORY:** xác nhận delivery thành công tạo đúng một history row; retry/cùng event không tạo trùng; history chỉ xuất hiện với đúng tài khoản.
- [ ] **READ STATE:** kiểm tra mark read, mark unread, mark all read và unread count trên giao diện Profile sau khi tải lại trang.
- [ ] **ALERT SCREENSHOT:** chụp Alert History có dữ liệu thật và trạng thái read/unread; che email, webhook, user ID, transaction signature và địa chỉ ví nếu nhạy cảm.
- [ ] **RENDER:** tạo Static Site cho client và Web Service cho server từ cùng monorepo; nhập đúng build/start/publish settings và environment variables.
- [ ] **DEPLOY HOOKS:** lấy hai Render deploy hook, lưu trong GitHub Actions Secrets; không gửi hook vào chat, commit, log hoặc ảnh báo cáo.
- [ ] **DEPLOY VALIDATION:** xác nhận domain client/server, CORS, SPA rewrite, Google callback, Stripe callback/webhook, Helius public webhook và kết nối Supabase trên môi trường thật.
- [ ] **CI/CD SCREENSHOT:** chụp GitHub Actions run xanh và Render deploy thành công; che repository secret, token, email và project identifier nhạy cảm.
- [ ] **FUNCTION SCREENSHOTS:** hoàn tất toàn bộ `FINAL_REPORT_SCREENSHOT_CHECKLIST.md`, dùng dữ liệu demo ổn định và kiểm tra chữ còn đọc được khi đặt trên trang A4.
- [ ] **FINAL PDF:** sau khi ảnh, số test, CI/CD và Alert History đã chốt, build PDF sạch và phân công người đọc chéo từng chương; không dùng bản preview cũ làm bản nộp cuối.

## Batch 9 — ổn định nhánh sau merge và xác minh CI

- [ ] Chụp lại trạng thái merge trước khi sửa và lập danh sách toàn bộ file unmerged. Hiện có 10 file: ba component Profile; `server/src/db/seed.ts`; hai token service; ba wallet/provider service và `util-helius.ts`.
- [ ] Với mỗi conflict, đọc cả base/ours/theirs và consumer liên quan trước khi chọn nội dung. Không giải quyết hàng loạt theo một phía vì nhánh mới đồng thời chứa refactor UI/provider và user auth tier/entitlement.
- [ ] Ưu tiên kiểm tra ba component Profile với contract mới từ `AuthContext`: `planTier` và `entitlements` phải đến từ response user thật; không giữ mock/default làm người dùng được cấp quyền sai.
- [ ] Rà `users` route, `subscription-entitlements.service.ts`, `ai-usage.service.ts`, payment/subscription và các guard phía client để bảo đảm một định nghĩa tier thống nhất: Free, Lite, Plus, Pro.
- [ ] Rà các conflict wallet/token theo provider và response type thật; đặc biệt không làm mất thay đổi Mobula/Zerion/Helius hoặc phục hồi consumer legacy trong lúc resolve.
- [ ] Sau khi hết conflict, rà `git diff --check`, marker conflict, file deleted/added và package lock. Không đánh dấu xong chỉ vì Git hết trạng thái `UU/DU`.
- [ ] Kiểm tra `.github/workflows/ci.yml` theo source sau merge. Trạng thái hiện tại là **CI-only**, chạy trên push `main`/`dev` và pull request vào `main`, gồm typecheck, lint, test server, test client, build server và build client.
- [ ] Xác minh Node/npm install strategy và scripts trong workflow khớp workspace. Ghi nhận `npm install` hay đổi sang cơ chế lockfile phù hợp chỉ sau khi kiểm tra package manager thực tế.
- [ ] Chạy các lệnh tương đương từng job theo cách được repo cho phép; riêng Codex không dùng compile/type-check làm validation theo quy tắc repo, nên cần lấy kết quả typecheck/build từ GitHub Actions hoặc người dùng cung cấp.
- [ ] Sửa lỗi CI thật phát sinh từ merge; phân biệt lỗi lint/test/build với lỗi workflow/config.
- [ ] Cập nhật Chương 5 chỉ là **quy trình tích hợp liên tục bằng GitHub Actions**. Không dùng từ CD, auto-deploy, migration tự động, rollback hay smoke check sau deploy nếu chưa có workflow tương ứng.
- [ ] Lưu bằng chứng an toàn cho báo cáo: workflow file và một kết quả run xanh; không chụp secret, token, email hoặc log nhạy cảm.

### Batch 9A — kiến trúc CD đích trên Render/Supabase

- [x] Chốt cách lấy source deploy: giữ một GitHub monorepo, không tạo repo artifact và không commit `client/build`/`server/build`.
- [ ] Cấu hình hai Render service cùng lấy source revision từ monorepo. Render tự checkout và chạy production build cho từng service; Static Site publish `client/build`, Web Service chạy `node server/build/main.js`.
- [ ] Tách workflow CI và deploy: pull request chỉ chạy kiểm tra; push/merge vào `main` chỉ gọi deploy hook sau khi các job bắt buộc thành công.
- [ ] Lưu riêng `RENDER_CLIENT_DEPLOY_HOOK_URL` và `RENDER_SERVER_DEPLOY_HOOK_URL` trong GitHub Actions Secrets. Deploy hook là secret; không ghi URL vào workflow, log, ảnh hay báo cáo.
- [ ] Gọi hook bằng GET/POST sau CI xanh; job deploy cần `needs` các job kiểm tra và điều kiện branch `main`. Không kích deploy từ pull request hoặc khi test/build thất bại.
- [ ] Cấu hình client là Render Static Site với Vite build output `client/build`; xác minh SPA rewrite về `index.html` cho React Router bằng thao tác trên Render.
- [ ] Cấu hình server là Render Web Service; kiểm tra Hono lắng nghe port do Render cung cấp. Source hiện dùng `env.SERVER_PORT`, vì vậy cần xác minh loader có fallback/ánh xạ từ biến `PORT` của môi trường deploy.
- [ ] Cấu hình biến môi trường client ở build time và server ở runtime; phân biệt biến `VITE_*` được đóng vào bundle với secret server tuyệt đối không được đưa sang client.
- [ ] Kết nối Web Service tới PostgreSQL trên Supabase Free. Kiểm tra Render hỗ trợ IPv6 hay dùng Supavisor shared pooler session mode; Supabase khuyến nghị session pooler cho backend persistent khi môi trường chỉ có IPv4.
- [ ] Chốt chiến lược migration. Render pre-deploy command không nên được mô tả là khả dụng trên free Web Service nếu gói hiện tại không hỗ trợ; migration có thể là job GitHub Actions có kiểm soát hoặc thao tác riêng trước deploy, nhưng phải tránh hai deploy chạy migration đồng thời.
- [ ] Free tier phải được mô tả như ràng buộc vận hành: cold start/spin-down, quota build/pipeline và giới hạn database có thể ảnh hưởng demo. Chỉ ghi con số cụ thể sau khi kiểm tra pricing chính thức tại ngày chốt.
- [ ] Viết Chương 5 theo kiến trúc đích: GitHub Actions kiểm tra source; sau khi đạt điều kiện, deploy hooks kích hoạt Render Static Site và Web Service; server kết nối PostgreSQL Supabase. Cho bản preview có thể dùng “được thiết kế/cấu hình theo”, chưa dùng “đã triển khai thành công” trước khi có run thật.
- [ ] **NHÓM BẮT BUỘC TẠO HAI RENDER SERVICE, LẤY DEPLOY HOOK VÀ LƯU VÀO GITHUB ACTIONS SECRETS; CODEX KHÔNG THỂ THAO TÁC DASHBOARD/SECRET THAY NHÓM NẾU KHÔNG ĐƯỢC CẤP KẾT NỐI.**
- [ ] **NHÓM BẮT BUỘC XÁC NHẬN URL CLIENT/SERVER, CORS, CALLBACK GOOGLE/STRIPE, WEBHOOK VÀ DATABASE CONNECTION TRÊN MÔI TRƯỜNG DEPLOY THẬT.**
- [ ] **NHÓM BẮT BUỘC CHỤP WORKFLOW RUN XANH, TRANG RENDER DEPLOY THÀNH CÔNG VÀ ỨNG DỤNG ĐANG CHẠY; PHẢI CHE SECRET, EMAIL, PROJECT ID NHẠY CẢM VÀ DATABASE URL.**

## Batch 10 — hoàn thiện Alert History end-to-end

- [x] Rà schema/type/service/route/UI hiện tại; xác nhận hai hệ alert đều reachable bằng source và `fallow`, ưu tiên nối history vào pipeline Helius `/api/alerts`.
- [x] Chốt contract tối thiểu của lịch sử: ownership, nguồn/rule, signature, ví, nội dung, severity, kết quả email/Discord, thời điểm và read state.
- [x] Ghi history sau khi ít nhất một kênh delivery thành công; partial delivery được giữ bằng các cờ attempted/succeeded theo kênh.
- [x] Dùng unique `(userId, eventKey)` với event key theo signature + scope + rule/wallet để retry không tạo notification trùng.
- [x] Thêm API lấy lịch sử theo user với page/limit, newest-first, total và unread count.
- [x] Thêm thao tác đánh dấu một notification đã đọc/chưa đọc và đánh dấu tất cả đã đọc; mọi update đều scope theo user.
- [x] Nối notification panel trong Profile với API thật; có loading, empty, error và read/unread state. Alert rule editor mock được giữ ngoài phạm vi thay đổi này.
- [x] Bổ sung test route ownership/read-all/list và pipeline delivery-to-history/dry-run; sau các batch liên quan, toàn bộ server suite ngày 12/07/2026 đạt 204/204.
- [ ] **NHÓM BẮT BUỘC CHẠY `db:reset` TRÊN DATABASE DEMO CÓ THỂ XÓA DỮ LIỆU; KHÔNG CHẠY NHẦM DATABASE CẦN GIỮ.**
- [ ] **NHÓM BẮT BUỘC SMOKE TEST THỦ CÔNG: TẠO/FOLLOW RULE → PHÁT SINH HELIUS EVENT → EMAIL/DISCORD THÀNH CÔNG → HISTORY XUẤT HIỆN → ĐÁNH DẤU ĐÃ ĐỌC.**
- [ ] Đồng bộ Chương 3, Chương 4/ERD, Chương 5, tiêu chí chấp nhận, Tóm tắt/Kết luận và ảnh Alert sau khi luồng chạy thật.

## Batch 11 — kiểm kê và hoàn thiện chiến lược kiểm thử

- [x] Chạy lại test sau merge và Batch 10: client 16/16 file, 178/178 test; server 29/29 file, 200/200 test vào ngày 12/07/2026.
- [x] Các test đỏ của baseline cũ đã được xử lý theo contract/implementation sau merge; không còn failure trong suite cuối.
- [x] Chạy lại toàn bộ suite client/server và lấy client JSON reporter để tránh suy đoán số liệu từ output bị cắt.
- [ ] Lập ma trận chức năng quan trọng → lớp test hiện có: auth và tier/entitlement; payment/subscription; alert delivery/history; provider adapter/normalizer; wallet portfolio/balance/PnL/history; token/pool/search; AI chat/summary; cache staleness/coverage; localization và các trang demo chính.
- [x] Bổ sung test theo rủi ro cho Alert History API/delivery/ownership/read state, provider nullability/number/timestamp/Helius transfer mapping và cursor/offset pagination termination.
- [ ] Bổ sung contract fixture cho các provider xương sống đang vận hành, ưu tiên Mobula, Zerion, Helius, CoinGecko/Birdeye ở endpoint thật sự ảnh hưởng Wallet/Market. Fixture phải loại API key và dữ liệu nhạy cảm.
- [ ] Kiểm tra tier/entitlement ở cả server và client: Free/Lite/Plus/Pro, subscription hết hạn/hủy, nhiều subscription, quyền AI theo tier và UI không tự cấp quyền khi response thiếu.
- [ ] Kiểm tra Alert History theo Batch 10 và các payment/webhook callback có ownership/idempotency tương tự nếu báo cáo nhắc tới độ tin cậy.
- [x] Báo cáo phân biệt unit/component/route-service test với E2E và smoke test; không gọi test mock upstream là end-to-end.
- [x] Cập nhật bảng kết quả, Tóm tắt và Kết luận bằng lần chạy ngày 12/07/2026; giữ E2E/load/deploy smoke test trong giới hạn còn lại.
- [ ] Cấu hình `fallow` để nhận đúng Vitest roots/path aliases trước khi dùng `coverage-gaps` làm số liệu; lần chạy thử hiện báo 0% sai với thực tế nên không được đưa vào báo cáo.
- [ ] **NHÓM BẮT BUỘC CHẠY LẠI CẢ HAI SUITE NẾU SOURCE CÒN THAY ĐỔI SAU MỐC 12/07/2026 VÀ CẬP NHẬT BẢNG KẾT QUẢ NẾU SỐ TEST THAY ĐỔI.**

## Batch 12 — xác minh bảo vệ AI và prompt injection

- [x] Rà runtime path bằng source và `fallow`: route/orchestrator, tool-selection prompt, response prompt, history, tool data, structured parser, sanitizer và source/citation mapping đều reachable.
- [x] Kiểm chứng boundary `UNTRUSTED` đang nằm trên luồng Wallet Chat active; bổ sung system instruction riêng cho bước chọn tool thay vì chỉ đặt luật trong prompt thường.
- [x] Phân biệt rõ input mitigation với output sanitizer: user/history/tool data được đóng khối không tin cậy; JSON/schema/citation guard xử lý đầu ra.
- [x] Bổ sung adversarial test cho user/history injection, hostile tool content, yêu cầu lộ system prompt/API key, malformed non-JSON output và orphan citation.
- [x] Rà Token AI và Wash Trading Chat: đều dùng system instruction, JSON output và validation/fallback; không khái quát cơ chế Wallet Chat như một implementation giống hệt cho mọi module.
- [x] Chuyển malformed response sang fail-closed; không hiển thị raw model prose khi hợp đồng JSON thất bại.
- [x] Cập nhật yêu cầu Chương 3, threat-model Chương 5 và Tóm tắt; chỉ tuyên bố giảm thiểu bằng phân tách instruction/data, allowlist, validation và giới hạn context, không tuyên bố ngăn chặn tuyệt đối.
- [x] Server suite sau Batch 12 đạt 29/29 file, 204/204 test; server typecheck pass.
- [ ] **NHÓM BẮT BUỘC SMOKE TEST ÍT NHẤT BA PROMPT TRÊN UI THẬT: YÊU CẦU BỎ SYSTEM RULE, YÊU CẦU LỘ PROMPT/SECRET VÀ INSTRUCTION GIẢ NẰM TRONG DỮ LIỆU/HISTORY. KHÔNG DÙNG SECRET THẬT TRONG PROMPT TEST.**
- [ ] Sau khi smoke test, chụp một phản hồi AI an toàn có data source hoặc trạng thái từ chối phù hợp; không chụp system prompt, API key hay nội dung session nhạy cảm.

## Batch 13 — hình ảnh, nội dung còn thiếu và đóng gói bản cuối

- [x] Ngày khảo sát sản phẩm đã có ở đầu Chương 2: 07/09/2025--21/09/2025; ngày rà source/provider và ngày truy cập docs/pricing được giữ riêng ở mốc 11/07/2026.
- [ ] Chụp và chèn bộ ảnh bắt buộc trong `FINAL_REPORT_SCREENSHOT_CHECKLIST.md`; thêm ảnh Alert History và bằng chứng localization nếu các chức năng này được xem là đóng góp.
- [x] Cân lại Chương 4: rút phần database/ERD mang tính liệt kê; không kéo dài layer khác chỉ để cân số trang.
- [x] Bổ sung contract Alert History đại diện trong Chương 4: query, ownership, read state, partial delivery, error behavior và idempotency; threat model AI đã được thêm ở Batch 12.
- [x] Giảm độ dài phần thiết kế dữ liệu: bỏ bảng inventory lặp lại ERD, giữ phân nhóm bảng và các quyết định thiết kế quan trọng; đồng thời cập nhật Alert History từ trạng thái dự kiến sang hiện trạng đã triển khai.
- [x] Loại cách diễn đạt đẩy phần giao diện sang “sau báo cáo”; ghi đúng giới hạn còn lại của phiên bản hiện tại.
- [x] Đồng bộ Chương 5 theo GitHub Actions CI hiện có và kiến trúc CD đích: Render tự build Static Site/Web Service từ cùng monorepo, deploy hook được lưu bằng secret, PostgreSQL trên Supabase Free.
- [ ] Cập nhật số test cuối, Alert History, tier/entitlement, prompt-injection mitigation, hạn chế và hướng phát triển xuyên suốt Tóm tắt, Chương 3--6 và Bảng thuật ngữ.
- [ ] Rà mọi câu “đã hoàn thiện”, “đảm bảo”, “end-to-end”, “tự động triển khai” và “tất cả test pass” dựa trên bằng chứng cuối.
- [ ] Proofread thủ công theo chương; kiểm tra chính tả, thuật ngữ Việt/Anh, caption, label/ref, citation, mục lục, danh sách hình/bảng và số chương.
- [x] Render sơ đồ deployment mới và build PDF sạch 103 trang; không còn citation/reference undefined. Đã kiểm tra trực quan trang deployment và text extraction cho ngày khảo sát, contract và số test.
- [ ] Sau khi nhóm cung cấp screenshot thật, build lại và đọc ở tỷ lệ in A4; kiểm tra đặc biệt ảnh UI, Alert History, CI/Render và bibliography.
- [ ] Chốt source và report cùng một revision/tag hoặc commit được ghi nhận để bản báo cáo không mô tả một source khác với source nộp.

## Câu hỏi/mâu thuẫn phải giữ mở cho đến khi từng batch xử lý

- [ ] Provider cuối cùng của từng chart/token/wallet endpoint là gì; service nào còn fallback hoặc legacy consumer?
- [ ] `wallet_analyses` và các bảng PnL/winrate cũ: bảng nào active, bảng nào chỉ còn schema/migration?
- [ ] Total balance hiện đã chuyển hoàn toàn sang Mobula chưa; per-token Zerion có fallback/cache behavior nào?
- [ ] Những phần Helius heuristic/decoder cũ còn được route hiện tại sử dụng ở đâu?
- [ ] Có log/email/dashboard nào đủ để ghi chính xác thời gian Birdeye educational access và quota đặc biệt của Zerion không?
- [ ] Các trang/chức năng nào nhóm chắc chắn sẽ demo và chụp hình trong bản nộp?
- [ ] Có thể bổ sung/chạy test thật đến mức nào trước hạn nộp; có database/provider fixture an toàn để test không?
- [ ] Quy trình deploy/CI/CD thực tế hiện tại là gì; nội dung nào trong Chương triển khai đang chỉ là placeholder?
- [ ] Template/hướng dẫn của khoa có chấp nhận tách thành 6 chương và trang landscape cho ERD không?
- [ ] Template yêu cầu Synopsis bằng tiếng Việt, tiếng Anh hay cả hai; có giới hạn độ dài hoặc từ khóa bắt buộc không?

## Trạng thái tổng

- [x] Thu thập feedback ban đầu và ngữ cảnh lịch sử từ nhóm.
- [x] Xác nhận lỗi `mmdc` mặc định và thử render thành công bằng Chromium config.
- [x] Kiểm kê sơ bộ provider usage, wallet schema và test files.
- [x] Batch 0 — inventory/hạ tầng báo cáo.
- [x] Batch 1 — Chương 2/provider.
- [x] Batch 2 — yêu cầu/use case.
- [x] Batch 3 — kiến trúc tổng thể.
- [x] Batch 4 — database/cache/ERD.
- [x] Batch 5 — PnL/migration/độ tin cậy.
- [ ] Batch 6 — còn chụp/chèn hình chức năng thật.
- [ ] Batch 7 — còn CI và sửa/chạy lại test cuối.
- [x] Batch 8 — kết luận/đồng bộ/rà toàn văn.
- [ ] Batch 9 — source đã resolve và kiểm tra cục bộ; còn nhóm xác minh GitHub Actions CI/Render thật.
- [ ] Batch 10 — code và test Alert History đã hoàn thiện; còn nhóm reset database, smoke test và chụp ảnh thật.
- [ ] Batch 11 — suite hiện xanh và đã bổ sung test rủi ro chính; còn ma trận/fixture provider, tier-entitlement và chạy lại sau mọi thay đổi source.
- [ ] Batch 12 — code, test và báo cáo prompt-injection đã cập nhật; còn nhóm smoke test trên UI thật và chụp minh chứng an toàn.
- [ ] Batch 13 — ảnh, nội dung thiếu, đồng bộ và đóng gói bản cuối.
