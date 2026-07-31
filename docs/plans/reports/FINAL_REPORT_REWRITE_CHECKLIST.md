# Checklist viết lại báo cáo cuối kỳ Yoca

Tracker duy nhất cho đợt viết lại cuối. File này dùng nội bộ giữa nhóm và Codex, không đưa vào báo cáo. Các revision plan cũ chỉ còn giá trị tra cứu lịch sử; tiến độ từ đây được cập nhật tại file này.

Quy ước:

- `[ ]`: chưa làm.
- `[-]`: đang làm hoặc chờ nhóm xác nhận.
- `[x]`: đã sửa, đối chiếu liên quan và kiểm tra bản build.

## Nguyên tắc áp dụng cho toàn báo cáo

- [x] Viết từ góc nhìn của nhóm đang trình bày sản phẩm hoàn chỉnh cho giảng viên và hội đồng.
- [x] Không đưa lịch sử agent/Codex rà source, các đợt sửa lỗi, migration dang dở, consumer cũ hoặc ghi chú nội bộ vào báo cáo.
- [x] Dùng hiện tại đơn để mô tả chức năng và kiến trúc; không dùng “sẽ cập nhật”, “trước bản nộp”, “phần còn lại”, “không còn là giả thuyết” hoặc “đã vá”.
- [x] Hạn chế cấu trúc “không phải ... mà là ...”, “không chỉ ... mà còn ...” và “thay vì”; chỉ giữ khi thật sự cần đối chiếu hai khái niệm.
- [x] Mỗi mục có mạch: người đọc cần biết gì → Yoca giải quyết thế nào → kết quả hoặc hình minh họa; không xen khó khăn nội bộ vào phần giới thiệu chức năng.
- [x] Cắt tên file, tên class, tên exception, tên hàm và route cụ thể nếu chúng không giúp người đọc hiểu quyết định thiết kế.
- [x] Không tự làm nổi bật lỗi giao diện, phần chưa migrate, test còn thiếu, thao tác reset database, ảnh chưa chụp hoặc checklist vận hành.
- [x] Chỉ giữ hạn chế có ý nghĩa học thuật: phụ thuộc độ phủ dữ liệu và tính hỗ trợ của kết quả AI/wash trading.
- [x] Không tạo số liệu hiệu năng hoặc kết quả thực nghiệm Wash Trading khi chưa có nguồn; phần phụ lục chỉ giải thích phương pháp tính.
- [x] Đã quét lại thuật ngữ, provider, label/reference, caption và các câu lặp giữa các chương.

## Batch 0 — dọn nội dung sai và phần không thuộc bản nộp

- [x] Bỏ toàn bộ tuyên bố Yoca hỗ trợ xuất PDF/báo cáo.
- [x] Loại phụ lục Business Model khỏi `main.tex`; giữ tài liệu nguồn ngoài bản nộp để phân tích lại sau.
- [x] Bỏ tuyên bố sử dụng trực tiếp hạ tầng Solana RPC.
- [x] Đồng bộ Lời cảm ơn với CoinGecko/GeckoTerminal, Birdeye, Helius, Mobula, Zerion, Moralis, Gemini, Stripe, Render và Supabase.
- [x] Viết lại đoạn Helius webhook thành mô tả cơ chế xác thực và chống trùng, không tự nhận là cơ chế bảo mật chưa hoàn thiện.
- [x] Xóa TODO/FIXME, macro mẫu, hướng dẫn build cũ và comment lựa chọn template khỏi các source LaTeX đang biên dịch.
- [x] Quét và loại NFT, export PDF, Solana RPC, Redis, CoinMarketCap và Dune SIM khỏi nội dung báo cáo đang biên dịch.

**Cần hỏi nhóm trước khi làm:** còn chức năng nào đã bỏ khỏi sản phẩm nhưng vẫn đang được quảng bá trong báo cáo?

## Batch 1 — Tóm tắt và phần đầu báo cáo

- [x] Viết lại Tóm tắt thành bốn ý: bài toán, giải pháp, nhóm chức năng/kết quả chính và giá trị của đề tài.
- [x] Bỏ Carbon, migration provider, prompt injection, E2E/load test và các hạn chế nhỏ khỏi Tóm tắt.
- [x] Rút Từ khóa về các khái niệm trung tâm; localization chỉ giữ nếu thực sự cần cho định vị người dùng Việt Nam.
- [x] Rút Lời cảm ơn, tránh câu sáo rỗng và đồng bộ danh sách dịch vụ đang sử dụng; bỏ Carbon khỏi phần cảm ơn công nghệ.
- [x] Viết lại Lời cam đoan ngắn, dùng “nhóm chúng em” và bỏ các khẳng định quá rộng.
- [x] Xóa macro template Nguyễn Văn A/MSSV/tên đề tài/giảng viên còn sót trong `main.tex`; trang bìa đã chứa thông tin thật.

**Cần hỏi nhóm trước khi làm:** Tóm tắt nên nhấn mạnh nhất vào Wallet, Wash Trading hay hành trình phân tích tổng hợp của Yoca?

## Batch 2 — Chương 1 đến Chương 3

- [x] Chương 1: giảm lặp danh sách chức năng giữa mục tiêu, phạm vi và đóng góp; mỗi chức năng chỉ được giới thiệu chi tiết ở một nơi.
- [x] Chương 1: xem localization là tiện ích tiếp cận, không đặt ngang hàng với đóng góp phân tích Wallet/Wash Trading/AI.
- [x] Chương 1: rà lại tuyên bố provider và sửa mô tả PnL theo trạng thái sản phẩm cuối.
- [x] Chương 2: bỏ ngôn ngữ “rà source”, utility cũ, CoinMarketCap/Dune SIM và lịch sử chỉnh sửa không cần thiết; Dune Analytics chỉ còn ở vai trò nền tảng khảo sát.
- [x] Chương 2: giữ một bảng provider súc tích và một đoạn ngắn về cách phân công nguồn dữ liệu.
- [x] Chương 2: rút câu chuyện Birdeye–Mobula–Zerion còn phần giải thích vai trò, quota và quyết định hiện tại.
- [x] Chương 3: chuyển yêu cầu sang hiện tại đơn; bỏ “dự kiến”, “nếu có số liệu”, “chưa phải tuyên bố” và lời dẫn về cách báo cáo sẽ viết ở chương sau.
- [x] Chương 3: giữ tiêu chí chấp nhận ở mức nghiệp vụ và mô tả đúng phạm vi test hiện có.

**Cần hỏi nhóm trước khi làm:** có chức năng nào trong mục tiêu/use case nhóm không muốn bị hỏi sâu khi phản biện?

## Batch 3 — Chương 4: kiến trúc và cơ sở dữ liệu

- [x] Rút phần hợp đồng API về request, validation, ownership và error handling; bỏ hai bảng endpoint cùng tên class/exception/hàm cụ thể.
- [x] Mô tả Enhanced Transactions đơn giản theo vai trò: chi tiết giao dịch, hoạt động ví và sự kiện cảnh báo.
- [x] Bỏ lời biện hộ về bảng song song, consumer legacy, deprecated, migration gấp và mô hình thay thế tăng dần.
- [x] Giảm ERD còn bốn hình: tổng quan; tài khoản/thanh toán/cảnh báo; token/pool/market; wallet/giao dịch/phân tích.
- [x] Gộp Enhanced Transaction vào miền Wallet/Giao dịch, không giữ một ERD riêng.
- [x] Rút phần database còn các quyết định cần hiểu: phân miền, khóa quan hệ/khóa logic, cache TTL/coverage và ownership dữ liệu.
- [x] Giảm phần database từ 2.695 xuống 1.498 từ và kiểm tra lại độ dài so với các lớp kiến trúc khác.
- [x] Rút localization trong kiến trúc còn một đoạn ngắn; bỏ chi tiết hook/key/interpolation không cần cho lập luận.
- [x] Rút prompt-injection còn mô tả boundary và validation đầu ra; không biến chương thành tài liệu audit bảo mật.
- [x] Bỏ lịch sử Carbon/migration giao diện và các câu tự nhận hệ thống chưa hoàn thiện khỏi phần lựa chọn công nghệ.

**Cần hỏi nhóm trước khi làm:** thầy cần thấy bảng vật lý đến mức nào, và nhóm muốn giữ những ERD nào để dễ trả lời khi phản biện?

## Batch 4 — Chương 5: triển khai và hình ảnh chức năng

- [x] Rút Chương 5 và tổ chức lại thành môi trường/CI-CD, chức năng chính, giải pháp kỹ thuật và kiểm thử.
- [x] Gom Market với Search; Token với Pool; Wallet với Compare Wallet; Account/Profile với Alert; AI với Wash Trading.
- [x] Bỏ danh sách toàn bộ tab, cột và control; chọn các thao tác chính mà hình minh họa thể hiện được.
- [x] Giữ CI/CD và Render ở trạng thái hiện tại đơn; bỏ câu “đã hiện thực chứ không còn dự kiến”, “ảnh xác nhận bằng chứng” và lời tự biện hộ.
- [x] Bỏ mục “Quá trình đồng nhất hóa giao diện” khỏi phần kết quả triển khai; không mô tả Carbon/component cũ hoặc màn hình chưa migrate.
- [x] Localization chỉ giữ như tiện ích hỗ trợ và đã bỏ figure riêng.
- [x] Giữ bộ hình hiện có cho Market, Token/Holders, Pool, Wallet, Alert và CI/Render; Compare Wallet chỉ mô tả ngắn, không dùng hình riêng.
- [x] Đã đọc và chèn hai ảnh Wash Trading: tổng quan đồ thị/cụm nghi vấn và điểm rủi ro theo đặc trưng của ví được chọn; nội dung và caption bám theo dữ liệu hiển thị trong ảnh.
- [x] Đã đọc và chèn hai ảnh AI Chatbot: Ask Yoca AI theo ngữ cảnh token và Wallet AI phân tích lịch sử số dư 30 ngày; không dùng ảnh quota vì không thể hiện giá trị phân tích.
- [x] Rút câu chuyện PnL/Helius/Mobula/Zerion thành một case study kỹ thuật liền mạch; Enhanced Transactions chỉ giữ vai trò chi tiết giao dịch.
- [x] Phần kiểm thử chỉ giữ phạm vi, bảng kết quả và đánh giá; bỏ lệnh shell, lịch sử test đỏ và danh sách việc trước bản nộp.

**Cần hỏi nhóm trước khi làm:** trong Compare Wallet, Wash Trading và AI Chatbot, phần nào hiện có giao diện/dữ liệu đủ tốt để chụp và đưa vào báo cáo?

## Batch 5 — phương pháp tính điểm Wash Trading

- [x] Đối chiếu `docs/plans/wash-trading/YOCA_WASHTRADING.md` với source thuật toán, type và dữ liệu đầu vào thực tế.
- [x] Xác nhận mô-đun là heuristic lấy cảm hứng từ GNN, không gọi là mô hình GCN/GAT/GraphSAGE đã huấn luyện.
- [x] Kiểm tra công thức circular pattern, time score, amount similarity, self-loop, hubness, relative volume và điểm tổng.
- [x] Kiểm tra các ngưỡng 12%, 2 giờ, 0.22, 0.45, 0.72 và các mức điểm token; mô tả đúng ngưỡng hai giờ giữa các bước liên tiếp.
- [x] Không trình bày ca kiểm thử hoặc kết quả thực nghiệm Wash Trading do nhóm chưa thực hiện bộ test chuyên biệt cho mô-đun này.
- [x] Viết phụ lục theo mạch: dữ liệu đầu vào → biểu diễn đồ thị → đặc trưng/công thức → cấu hình trọng số → cách diễn giải điểm.
- [x] Liên kết mục Wash Trading trong Chương 5 với phụ lục công thức; không gọi đây là phần kết quả thực nghiệm.
- [x] Giữ mô hình AI mã nguồn mở và phân tích Business Model ngoài báo cáo cuối do không thuộc yêu cầu nộp đã xác định.

**Đã chốt với nhóm:** phần Wash Trading chỉ giải thích công thức và cách tính; không bổ sung kết quả test khi chưa có dữ liệu thực nghiệm.

## Batch 6 — Chương 6: kết luận và hướng phát triển

- [x] Viết lại Chương 6 từ đầu dựa trên trạng thái sản phẩm cuối, không sửa vá văn bản hiện tại.
- [x] Kết quả: nhấn mạnh hành trình Market–Token/Pool–Wallet, dữ liệu nhiều provider, Wash Trading, AI, Alert và deployment.
- [x] Hạn chế: chỉ giữ giới hạn tự nhiên của dữ liệu, phạm vi đánh giá tải và tính hỗ trợ của AI/Wash Trading.
- [x] Bỏ toàn bộ chi tiết component cũ, hard-code localization, reset database, smoke test, screenshot, callback và test từng đỏ.
- [x] Hướng phát triển: viết ở cấp sản phẩm/nghiên cứu, không dùng dạng backlog sửa lỗi.
- [x] Kết đoạn bằng giá trị của đề tài và khả năng phát triển tiếp, không tự phủ định thành quả.

**Cần hỏi nhóm trước khi làm:** hội đồng/giảng viên hướng dẫn thường quan tâm đóng góp kỹ thuật, sản phẩm hay khả năng kinh doanh nhiều hơn?

## Batch 7 — glossary, reference và quét văn phong toàn văn

- [x] Xóa NFT, Solana RPC và các thuật ngữ không xuất hiện; sửa GCN/GAT/GraphSAGE thành cấu hình heuristic lấy cảm hứng từ GNN.
- [x] Rút glossary, loại ATH/ATL, Drawdown, DTO, FDV, Indexer, Lazy Loading, i18n, Sharding, Sparkline, Stablecoin, Web3 và các mục không dùng.
- [x] Đồng bộ danh sách provider vận hành; loại service cũ và giữ Dune đúng vai trò nền tảng khảo sát.
- [x] Quét “không phải”, “không chỉ”, “thay vì”, “hiện tại”, “trước đây”, “chưa”, “sẽ”, “source”, “bằng chứng”, “giả thuyết” và sửa từng trường hợp theo ngữ cảnh.
- [x] Quét câu cụt, câu quá dài, đoạn chuyển chủ đề đột ngột và subsection chỉ có một đoạn ngắn.
- [x] Xóa TODO, các include nhận xét bị vô hiệu hóa và comment nội bộ khỏi luồng báo cáo chính.
- [x] Sửa bibliography `[0]`, chuẩn hóa ngày truy cập sang tiếng Việt, bỏ entry không được trích dẫn và xác nhận không có citation/reference undefined.

**Cần hỏi nhóm trước khi làm:** nhóm muốn giữ mức thuật ngữ tiếng Anh nào trong văn bản, hay ưu tiên Việt hóa và ghi tiếng Anh ở lần xuất hiện đầu?

## Batch 8 — build và đọc bản cuối

- [x] Đã bổ sung file đề cương PDF chính thức tại `docs/reports/final_report/Appendix/proposal.pdf` (PDF 19 trang theo `pdfinfo`). Không biên dịch lại `proposal.tex`; `main.tex` tiếp tục nhúng trực tiếp toàn bộ file bằng `\includepdf[pages=-]{Appendix/proposal.pdf}`.
- [x] Build PDF sạch sau toàn bộ thay đổi: 103 trang A4, PDF 1.7.
- [x] Kiểm tra log không có warning, undefined citation/reference, anchor trùng, PDF version mismatch hoặc overfull box.
- [x] Đọc PDF theo thứ tự như giảng viên: phần đầu → đề cương → mục lục → các chương → kết luận → tài liệu tham khảo → phụ lục.
- [x] Kiểm tra trực quan toàn bộ PDF dạng contact sheet và đọc kỹ các trang ERD, hình chức năng, Wash Trading/AI cùng phụ lục công thức; hình còn đọc được ở khổ A4.
- [x] Xuất năm ERD chi tiết từ Mermaid sang PDF vector, giữ nguyên nội dung và bố cục của bản PNG đã nộp tham khảo; chữ trong sơ đồ có thể chọn và tìm kiếm, còn các PNG cũ được giữ lại để đối chiếu.
- [x] Đối chiếu số test, domain deployment, provider và tên chức năng ở tất cả nơi xuất hiện.
- [x] Chốt bản PDF 103 trang tại `docs/reports/final_report/main.pdf` và giữ source LaTeX tương ứng.

**Cần nhóm xác nhận trước khi chốt:** tên đề tài, danh sách thành viên/MSSV, giảng viên, ngày nộp và các biểu mẫu bắt buộc của khoa.

## Thứ tự ưu tiên đề xuất

- [ ] Ưu tiên 1: Tóm tắt + Chương 6, vì đây là hai phần dễ định hình ấn tượng đầu/cuối của người đọc.
- [ ] Ưu tiên 2: Chương 5, vì đang dài nhất và chứa nhiều dấu vết chỉnh sửa nhất.
- [ ] Ưu tiên 3: Chương 4/database, vì thầy đã yêu cầu rút gọn.
- [ ] Ưu tiên 4: Chương 1–3 và phần đầu báo cáo.
- [ ] Ưu tiên 5: Wash Trading appendix, glossary và proofread toàn văn.
