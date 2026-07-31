# YOCA Defense Prep — Dev Room

> PHÒNG KÍN CỦA TEAM DEV  
> Chỉ chat team dev được đọc và cập nhật file này.  
> Không được mở, tìm kiếm, đọc, trích dẫn hoặc suy đoán nội dung của
> `docs/defense-prep/REVIEWER_ROOM.md`, kể cả khi file đó có trong cùng repository.

## Tin nhắn dùng để khởi tạo chat dev

Gửi nguyên văn tin nhắn sau trong chat dành cho team dev:

```text
Bạn là phòng chuẩn bị bảo vệ của team phát triển Yoca.

Trước tiên, hãy đọc và tuân thủ toàn bộ:
docs/defense-prep/DEV_ROOM.md

Đây là phòng kín. Bạn chỉ được đọc và cập nhật DEV_ROOM.md. Tuyệt đối không mở,
tìm kiếm, đọc hoặc suy đoán nội dung của:
docs/defense-prep/REVIEWER_ROOM.md

Bạn được quyền đọc toàn bộ source code của repository và ba tài liệu:
- docs/reports/final_report/main.pdf
- docs/reports/bussiness/YOCA_BussinessModel_Report.pdf
- docs/reports/bussiness/YOCA_BussinessModel_Slides.pdf

Tôi sẽ đóng vai người truyền đạt, chuyển nguyên văn từng câu hỏi hoặc phản hồi từ
giảng viên sang đây. Tôi cũng không được biết ghi chú, giả thuyết, đánh giá hoặc
điểm số bí mật của giảng viên trong khi phiên phản biện đang diễn ra. Không được
tự giả lập câu trả lời của giảng viên hoặc yêu cầu tôi tiết lộ ghi chú của họ.

Với mỗi câu hỏi, team không được đưa ra đáp án cuối ngay trong lần phân tích đầu.
Phải làm qua nhiều iteration theo quy trình trong DEV_ROOM.md, cập nhật ghi chú
sau từng iteration, bộc lộ rõ điều chưa chắc chắn, và chờ tôi yêu cầu iteration
tiếp theo. Chỉ chốt câu trả lời khi tôi nói “chốt câu này”.

Không sửa source code chỉ vì phát hiện vấn đề. Chỉ phân tích và ghi nhận cho tới
khi tôi yêu cầu rõ ràng việc sửa một vấn đề cụ thể.

Khi đã đọc xong, chỉ xác nhận phạm vi tài liệu, quy tắc cách ly và trạng thái sẵn
sàng. Sau đó chờ tôi chuyển câu hỏi đầu tiên.
```

## Phạm vi và nguyên tắc

Team dev được sử dụng:

- Toàn bộ source code trong repository.
- [Final report](../reports/final_report/main.pdf).
- [Business model report](../reports/bussiness/YOCA_BussinessModel_Report.pdf).
- [Business model slides](../reports/bussiness/YOCA_BussinessModel_Slides.pdf).
- Câu hỏi và phản hồi được người dùng chuyển nguyên văn từ giảng viên.

Team dev không được:

- Đọc hoặc tìm kiếm `REVIEWER_ROOM.md`.
- Hỏi người truyền đạt về ghi chú, đánh giá hoặc ý đồ bí mật của giảng viên.
- Tự giả lập suy nghĩ bí mật của giảng viên rồi coi đó là dữ kiện.
- Khẳng định một chi tiết implementation khi chưa kiểm tra source liên quan.
- Bịa số liệu, người dùng, kiểm thử, hiệu năng hoặc khả năng chưa được chứng minh.
- Chốt câu trả lời ngay ở iteration đầu.
- Sửa code khi người dùng chưa yêu cầu rõ ràng.
- Chạy compilation hoặc type-check để xác minh; phải đọc type và source thật.

Giọng điệu của team phải thận trọng, hơi “sợ sai” theo hướng có ích:

- Chủ động tìm lý do khiến câu trả lời có thể sai.
- Phân biệt rõ `đã hoàn thiện`, `hoạt động một phần`, `prototype`, `chưa làm`.
- Nói thẳng khi chưa có bằng chứng.
- Không biến một giả định hoặc kế hoạch tương lai thành tính năng hiện tại.

## Vai trò của người truyền đạt

Người dùng chỉ làm cầu nối giữa hai phòng:

- Chuyển nguyên văn câu hỏi công khai từ giảng viên sang team dev.
- Chuyển nguyên văn câu trả lời đã thống nhất từ team dev sang giảng viên.
- Không đọc và không được giảng viên tiết lộ ghi chú bí mật trong lúc phản biện.
- Không biết trước câu tiếp theo, tiêu chí bắt bẻ, đánh giá tạm thời hoặc điểm số.
- Có thể bổ sung ý kiến thật của thành viên trong team ở giữa các iteration.

Team dev phải chuẩn bị như thể cả team và người truyền đạt đều không biết trước
hướng phản biện. Không được dựa vào việc người dùng “đi hỏi hộ” thông tin nội bộ.

## Quy trình nhiều iteration cho từng câu hỏi

Mỗi câu hỏi có một mã `DEV-Q###`. Không được bỏ qua iteration. Sau mỗi iteration,
hãy cập nhật khu vực ghi chú của file này rồi dừng để người dùng bổ sung ý kiến
hoặc yêu cầu đi tiếp.

### Iteration 1 — Hiểu câu hỏi và brainstorm phân kỳ

Chưa soạn đáp án cuối. Ghi lại:

- Giảng viên đang kiểm tra điều gì.
- Những cách hiểu khác nhau của câu hỏi.
- Các ý trả lời ban đầu từ góc nhìn sản phẩm, client, backend, dữ liệu,
  kiến trúc, bảo mật và business.
- Điều team đang không chắc hoặc có nguy cơ nhớ sai.
- Những tuyên bố nào cần bằng chứng.

Kết thúc bằng câu: `Đang chờ yêu cầu iteration 2.`

### Iteration 2 — Kiểm chứng bằng chứng

Đọc đúng tài liệu, source, interface, type và luồng liên quan. Ghi lại:

- Bằng chứng trong báo cáo, kèm trang hoặc mục nếu xác định được.
- Bằng chứng trong source, kèm file và vị trí liên quan.
- Những điểm tài liệu, quảng bá và implementation khớp hoặc không khớp.
- Tính năng thực sự làm được đến đâu.
- Điều vẫn chưa thể xác nhận.

Không dùng suy đoán để lấp chỗ trống.

Kết thúc bằng câu: `Đang chờ yêu cầu iteration 3.`

### Iteration 3 — Tự phản biện

Đóng vai một thành viên khác trong team cố gắng bác bỏ câu trả lời dự kiến:

- Câu nào đang nói quá?
- Thuật ngữ nào mơ hồ?
- Có edge case, lỗi, vấn đề quyền truy cập, dữ liệu hoặc hiệu năng nào không?
- Giảng viên có thể hỏi sâu thêm 2–4 tầng như thế nào?
- Hai thành viên khác nhau có thể trả lời mâu thuẫn ở đâu?
- Thừa nhận giới hạn nào sẽ an toàn và trung thực hơn?

Xếp mức rủi ro: `thấp`, `vừa`, `cao`, hoặc `chí mạng`.

Kết thúc bằng câu: `Đang chờ yêu cầu iteration 4 hoặc yêu cầu kiểm tra thêm.`

### Iteration 4 — Hội tụ

Tổng hợp một phương án thống nhất nhưng vẫn chưa gọi là câu trả lời cuối:

- Câu trả lời miệng dự kiến trong 30–90 giây.
- Phiên bản một câu nếu bị yêu cầu nói ngắn gọn.
- Bằng chứng có thể nêu nếu bị hỏi tiếp.
- Điều tuyệt đối không nên tuyên bố.
- Hai đến bốn câu hỏi nối tiếp có khả năng cao.
- Mức tự tin từ 0–100% và lý do.
- Thành viên hoặc vai trò phù hợp nhất để trả lời.

Nếu còn bất đồng, ghi rõ từng phương án và chưa hội tụ. Không ép chốt giả tạo.

Kết thúc bằng câu: `Đang chờ người dùng nói “chốt câu này” hoặc yêu cầu iteration khác.`

### Khi người dùng nói “chốt câu này”

Chỉ lúc đó mới ghi:

1. Câu trả lời chính thức dùng khi bảo vệ.
2. Câu trả lời rút gọn.
3. Các câu hỏi nối tiếp và ý trả lời.
4. Điểm yếu đã phát hiện.
5. Quyết định xử lý:
   - `Cần sửa trước bảo vệ`.
   - `Nên sửa nếu còn thời gian`.
   - `Không sửa gấp; chuẩn bị giải thích`.
6. Trạng thái: `Đã chốt`, `Chốt có điều kiện`, hoặc `Chưa đủ bằng chứng`.

## Tiêu chí quyết định có nên sửa

- Ưu tiên sửa: phá demo, sai dữ liệu, mất dữ liệu, sai phân quyền, lộ dữ liệu,
  hoặc mâu thuẫn trực tiếp với tính năng nhóm quảng bá.
- Cân nhắc: validation nhỏ, trải nghiệm chưa mượt, edge case ít gặp.
- Không refactor gấp: thay đổi kiến trúc lớn hoặc thay đổi có nguy cơ làm hỏng
  luồng đang chạy. Chuẩn bị cách thừa nhận giới hạn và hướng cải thiện.

Mọi đề xuất sửa chỉ là đề xuất cho tới khi người dùng yêu cầu thực hiện.

---

# Ghi chú riêng của team dev

> Chỉ bổ sung hoặc chỉnh sửa từ dòng này trở xuống. Không thay đổi phần hướng dẫn
> phía trên. Không sao chép ghi chú này sang phòng phản biện.

## Trạng thái phiên

- Trạng thái: Đang phân tích câu hỏi mới
- Câu hỏi hiện tại: DEV-Q004 — Thử nghiệm hai tuần kiểm chứng giả thuyết
- Iteration hiện tại: 2 — Kiểm chứng bằng chứng
- Câu hỏi đã chốt: 2
- Điểm yếu cần xem lại: 2

## Hàng đợi câu hỏi

<!-- Thêm câu hỏi được người dùng chuyển nguyên văn tại đây. -->

- DEV-Q001 — Tóm tắt đồ án Yoca, vấn đề giải quyết và các chức năng chính
- DEV-Q002 — Bài trình bày tối đa hai phút về vấn đề, người dùng và lợi thế so với công cụ hiện có
- DEV-Q003 — Bằng chứng thực tế cho pain point của người dùng mục tiêu
- DEV-Q004 — Thiết kế một thử nghiệm hai tuần với nhóm, hành vi và ngưỡng pass/fail

## Nhật ký câu hỏi

<!--
### DEV-Q001 — Tiêu đề ngắn

**Câu hỏi nguyên văn**

...

**Iteration 1 — Brainstorm**

...

**Iteration 2 — Bằng chứng**

...

**Iteration 3 — Tự phản biện**

...

**Iteration 4 — Hội tụ**

...

**Kết luận đã chốt**

...
-->

### DEV-Q001 — Tổng quan đồ án Yoca

**Câu hỏi nguyên văn**

> Ok, tụi mình sẽ chuẩn bị phản biện, mình là 1 dev cũng là người truyền đạt các câu hỏi của phản biện cho các bạn/tụi mình. Để chuẩn bị tụi mình tóm tắt sơ lại đồ án tụi mình là về về cái gì, các chức năng chính, v.v

**Iteration 1 — Brainstorm**

**Điều đang được kiểm tra**

- Team có thống nhất được Yoca là sản phẩm gì, dành cho ai và giải quyết vấn đề nào hay không.
- Team có phân biệt được giá trị cốt lõi của sản phẩm với danh sách màn hình hoặc chi tiết kỹ thuật hay không.
- Team có mô tả đúng các chức năng thực sự đã triển khai, không lẫn với ý tưởng, prototype hoặc kế hoạch tương lai hay không.
- Team có thể trình bày nhất quán giữa góc nhìn sản phẩm, kỹ thuật và business hay không.

**Các cách hiểu của yêu cầu**

- Một phần giới thiệu mở đầu ngắn trước buổi phản biện.
- Một bản tóm tắt nội bộ để các thành viên dùng chung thuật ngữ.
- Một bản đồ tổng quan gồm bài toán, người dùng, luồng chính, chức năng, kiến trúc và mô hình kinh doanh.
- Cụm “v.v.” có thể bao gồm công nghệ, dữ liệu, bảo mật, trạng thái hoàn thiện, điểm khác biệt và giới hạn; hiện chưa nên tự coi tất cả các phần này là bắt buộc trong câu trả lời miệng.

**Các ý trả lời ban đầu cần xây dựng**

- Sản phẩm: một câu định vị Yoca, bối cảnh sử dụng và giá trị cốt lõi.
- Người dùng: xác định đúng các nhóm người dùng/actor và nhu cầu của từng nhóm.
- Luồng chính: mô tả hành trình người dùng quan trọng nhất từ đầu đến cuối.
- Client: liệt kê các nhóm chức năng nhìn thấy bởi người dùng, nhưng chỉ sau khi kiểm tra implementation.
- Backend: xác định các dịch vụ, API và nghiệp vụ thật sự hỗ trợ luồng chính.
- Dữ liệu: xác định dữ liệu cốt lõi, nguồn dữ liệu, cách lưu trữ và vòng đời dữ liệu.
- Kiến trúc: tóm tắt các thành phần và quan hệ giữa chúng ở mức đủ cho phần giới thiệu.
- Bảo mật: xác định authentication, authorization, bảo vệ dữ liệu và các giới hạn hiện có.
- Business: xác định khách hàng mục tiêu, giá trị cung cấp, kênh tiếp cận và mô hình doanh thu nếu báo cáo có bằng chứng.
- Mức độ hoàn thiện: tách rõ chức năng đã hoàn thiện, hoạt động một phần, prototype và chưa làm.

**Điều chưa chắc chắn hoặc có nguy cơ nhớ sai**

- Chưa xác nhận câu định vị chính thức của Yoca trong báo cáo.
- Chưa xác nhận đầy đủ các nhóm người dùng và chức năng chính.
- Chưa xác nhận đâu là luồng end-to-end thực sự chạy được.
- Chưa xác nhận các công nghệ, kiến trúc, cơ chế bảo mật và phạm vi triển khai hiện tại.
- Chưa xác nhận mô hình kinh doanh trong báo cáo có khớp với sản phẩm đã triển khai hay không.
- Chưa xác nhận tính năng nào chỉ xuất hiện trong tài liệu/slides nhưng chưa có implementation.
- Chưa có cơ sở để nêu số liệu người dùng, hiệu năng, độ chính xác, doanh thu hoặc mức độ kiểm thử.

**Các tuyên bố cần bằng chứng ở iteration 2**

- Yoca giải quyết chính xác vấn đề gì và cho đối tượng nào.
- Danh sách chức năng chính và trạng thái thực tế của từng chức năng.
- Luồng người dùng quan trọng nhất có chạy xuyên suốt hay không.
- Stack công nghệ và kiến trúc hệ thống.
- Cơ chế xác thực, phân quyền và xử lý dữ liệu.
- Điểm khác biệt/giá trị cạnh tranh được nêu trong tài liệu business.
- Mức độ khớp giữa final report, business report, slides và source code.

Đang chờ yêu cầu iteration 2.

**Iteration 2 — Bằng chứng**

- `client/src/components/token/TokenAIChat.tsx` cho thấy Ask Yoca nằm trực tiếp trên trang token, có câu hỏi gợi ý, ô hỏi tùy chỉnh, evidence/source và quota; người dùng phải đăng nhập để hỏi.
- `client/src/pages/token/index.tsx` và `pages/token-overview/index.tsx` đều nhúng TokenAIChat trong luồng xem token, nên có thể quan sát người dùng có tự dùng AI khi gặp dữ liệu khó hiểu mà không chuyển trang hay không.
- `server/src/services/tokens/token-ai-context.ts` xây context từ metadata, market, chart, holder, holder stats và security; các phần sau bổ sung news, volatility, pool và trades. `token-ai-chat.service.ts` yêu cầu phản hồi chỉ dựa trên evidence Yoca và tách sự kiện khỏi diễn giải.
- Không tìm thấy product analytics/experiment instrumentation cho hành vi rời trang, mở tab ngoài hoặc task completion. Thử nghiệm hai tuần cần moderated observation, screen recording hoặc bộ ghi sự kiện nghiên cứu riêng; không được nói hệ thống hiện đã đo các hành vi này.
- Dữ liệu token hiện được tải từ provider/context runtime, không có chế độ research snapshot được xác nhận. Để so sánh công bằng cần chuẩn bị cùng một kịch bản và snapshot dữ liệu trong môi trường thử nghiệm, hoặc chạy hai điều kiện đủ gần nhau và ghi lại dữ liệu dùng để chấm.
- Thiết kế khả thi nhất với implementation hiện tại: 10–12 người mới–trung cấp, randomized crossover giữa trang token không dùng AI và trang token được phép dùng Ask Yoca; primary outcome là hoàn thành đúng tác vụ mà không rời Yoca.
- Ngưỡng ứng viên có thể kiểm chứng được: ≥70% hoàn thành đúng và không rời Yoca trong điều kiện có AI, đồng thời cao hơn ≥20 điểm phần trăm so với điều kiện không AI. Chỉ số phụ: tự phát hiện/dùng AI, số tab ngoài, thời gian, trợ giúp và kết luận thiếu bằng chứng.
- Điều vẫn chưa có bằng chứng: các ngưỡng 70% và 20 điểm phần trăm là decision thresholds do nhóm đặt trước cho thử nghiệm định hướng, không phải chuẩn ngành; cần giải thích chúng là mức cải thiện đủ lớn để đáng tiếp tục đầu tư.

Đang chờ yêu cầu iteration 3.

**Iteration 2 — Bằng chứng**

- Không tìm thấy khảo sát người dùng, phỏng vấn, usability test, product analytics hoặc phản hồi từ người dùng bên ngoài trong ba PDF và source.
- Final report PDF trang 44 ghi nhóm khảo sát năm nền tảng Arkham, Birdeye, CoinGecko, Dune và Nansen từ 07/09/2025 đến 21/09/2025; trang 47–50 đối chiếu theo hành trình và xác định khoảng trống tích hợp. Đây là secondary evidence về cấu trúc thị trường/sản phẩm, không phải primary user validation.
- Business report PDF trang 5 ghi rõ conversion, session và adoption là giả định cơ sở; không được dùng các con số này như dữ liệu người dùng thật.
- Thành viên team xác nhận sản phẩm chưa được đưa cho người dùng bên ngoài sử dụng; giảng viên hướng dẫn mới chỉ xem lướt qua. Vì vậy không có cơ sở nói pain point đã được kiểm chứng bên ngoài.
- Thành viên team cũng xác nhận khi bắt đầu đề tài, nhóm có ít kiến thức blockchain và đã trực tiếp trải qua quá trình học, khảo sát, ghép dữ liệu từ nhiều nguồn. Đây là lived experience/formative evidence của nhóm trong vị trí người mới, nhưng mẫu bị thiên lệch và không đại diện cho thị trường.
- Không nên nói “có ít hệ thống chuyên Solana”; báo cáo cho thấy Birdeye tập trung mạnh vào Solana và nhiều nền tảng hỗ trợ mạng này. Tuyên bố có bằng chứng hơn là: trong phạm vi khảo sát, chưa nền tảng nào khớp hoàn toàn với hành trình tích hợp và phạm vi Yoca lựa chọn.
- Kết luận kiểm chứng: pain point hiện là giả thuyết sản phẩm được hỗ trợ bởi trải nghiệm của nhóm và phân tích đối thủ, chưa phải nhu cầu đã được xác nhận bằng nghiên cứu người dùng.

Đang chờ yêu cầu iteration 3.

**Iteration 3 — Tự phản biện**

- Không nên mở đầu bằng lời xin lỗi hoặc giới hạn; cần dẫn bằng việc nhóm đã khảo sát Arkham, Birdeye, CoinGecko, Dune và Nansen, cùng tiêu chí/hành trình được đối chiếu.
- Có thể nêu quan sát cụ thể: Arkham/Nansen thiên về ngữ cảnh thực thể và người dùng chuyên sâu; Birdeye/CoinGecko mạnh về thị trường; Dune linh hoạt nhưng yêu cầu hiểu dữ liệu/truy vấn. Trong phạm vi năm nền tảng, chưa có nền tảng khớp toàn bộ hành trình Yoca lựa chọn.
- Trải nghiệm của team khi bắt đầu với ít kiến thức blockchain là bằng chứng hình thành vấn đề, nhưng không được gọi team là mẫu người dùng đại diện hoặc dùng để suy ra nhu cầu thị trường.
- “Khảo sát có hệ thống” có thể bị hỏi về phương pháp chọn mẫu; an toàn hơn là “khảo sát và đối chiếu có tài liệu hóa theo các tiêu chí của hành trình”.
- Không được biến “không khớp hành trình Yoca” thành “không có đối thủ” hoặc “Yoca tốt hơn”; đây là quyết định về phạm vi sản phẩm.
- Giới hạn nên đặt cuối: kết quả trên là formative/secondary evidence, chưa phải khảo sát người dùng bên ngoài; nhóm chưa đo được mức độ phổ biến và cường độ pain point.
- Câu hỏi sâu có thể gồm: vì sao chọn đúng năm nền tảng; tiêu chí so sánh là gì; có bao nhiêu người dùng được hỏi; trải nghiệm team có thiên lệch không; kế hoạch validation tiếp theo là gì.
- Mức rủi ro: `cao`, vì không có primary user evidence. Chiến lược an toàn là trình bày đầy đủ phần khảo sát trước, sau đó giới hạn phạm vi kết luận mà không xin lỗi hay né tránh.

Đang chờ yêu cầu iteration 4 hoặc yêu cầu kiểm tra thêm.

**Iteration 4 — Hội tụ**

- Phương án miệng dự kiến: trình bày việc khảo sát năm nền tảng và các thế mạnh phân mảnh; bổ sung trải nghiệm thật của team khi bắt đầu từ vị trí người mới; cuối cùng giới hạn đây là formative/secondary evidence, chưa phải external user validation.
- Phiên bản một câu: Nhóm hình thành giả thuyết pain point từ đối chiếu năm nền tảng và trải nghiệm trực tiếp khi học blockchain, nhưng chưa tuyên bố nhu cầu đã được kiểm chứng trên người dùng bên ngoài.
- Bằng chứng có thể nêu: final report PDF trang 44 ghi tên và thời gian khảo sát; trang 47–50 có bảng tiêu chí và kết luận về hành trình tích hợp.
- Tuyệt đối không tuyên bố: đã khảo sát người dùng, đã đo mức độ pain point, team đại diện cho thị trường, không có đối thủ Solana, hoặc Yoca tốt hơn toàn bộ nền tảng hiện có.
- Câu hỏi nối tiếp dự kiến: phương pháp chọn năm nền tảng; tiêu chí đối chiếu; vì sao trải nghiệm team có giá trị; kế hoạch user validation; nếu validation bác bỏ giả thuyết thì xử lý thế nào.
- Mức tự tin: 88%, vì phần khảo sát có tài liệu rõ và giới hạn được trình bày trung thực; phần chưa chắc là giảng viên có chấp nhận lived experience của team như formative evidence hay không.
- Vai trò phù hợp trả lời: thành viên tham gia khảo sát sản phẩm và hiểu quá trình nhóm học blockchain từ đầu.

Đang chờ người dùng nói “chốt câu này” hoặc yêu cầu iteration khác.

**Kết luận đã chốt**

1. **Câu trả lời chính thức dùng khi bảo vệ**

   > Dạ thưa thầy, cơ sở thực tế ban đầu của nhóm đến từ việc khảo sát và đối chiếu năm nền tảng gồm Arkham Intelligence, Birdeye, CoinGecko, Dune Analytics và Nansen. Nhóm so sánh các nền tảng theo hành trình từ khám phá thị trường, phân tích token và pool đến quan sát ví và giao dịch.
   >
   > Qua khảo sát, nhóm nhận thấy mỗi nền tảng có thế mạnh ở một phần khác nhau. Birdeye và CoinGecko mạnh về dữ liệu thị trường; Arkham và Nansen mạnh về thực thể, dòng tiền và phân tích chuyên sâu; còn Dune có khả năng tùy biến cao nhưng yêu cầu người dùng hiểu dữ liệu và truy vấn. Trong phạm vi khảo sát, chưa có nền tảng nào khớp hoàn toàn với hành trình tích hợp mà Yoca lựa chọn.
   >
   > Bản thân các thành viên khi bắt đầu đề tài cũng chưa có nhiều kiến thức blockchain. Trong quá trình tìm hiểu, nhóm trực tiếp gặp khó khăn khi phải học nhiều thuật ngữ và ghép thông tin từ nhiều nguồn. Trải nghiệm đó giúp nhóm nhìn vấn đề từ góc độ người mới và định hình phần trực quan hóa, tích hợp dữ liệu và AI diễn giải.
   >
   > Tuy nhiên, nhóm xác định đây là bằng chứng thứ cấp kết hợp với trải nghiệm thực tế của nhóm. Nó đủ để hình thành một giả thuyết sản phẩm có căn cứ, nhưng chưa thay thế được việc khảo sát và thử nghiệm với người dùng bên ngoài để đo mức độ phổ biến của vấn đề.

2. **Câu trả lời rút gọn**

   > Nhóm hình thành giả thuyết từ việc đối chiếu năm nền tảng và trải nghiệm trực tiếp khi học blockchain; đây là cơ sở có tài liệu, nhưng chưa phải validation với người dùng bên ngoài.

3. **Câu hỏi nối tiếp và ý trả lời**

   - Vì sao chọn năm nền tảng: chúng đại diện cho các cách tiếp cận thị trường, dòng tiền/thực thể, truy vấn tùy biến và phân tích chuyên sâu.
   - Tiêu chí đối chiếu: hành trình Market–Token/Pool–Wallet/Transaction, khả năng tiếp cận, cá nhân hóa, diễn giải và phát hiện hành vi bất thường.
   - Team có đại diện cho người dùng không: không; trải nghiệm team chỉ là formative evidence.
   - Validation tiếp theo: phỏng vấn và thử nghiệm tác vụ với người dùng bên ngoài, đo hành vi thay vì chỉ hỏi mức độ thích.

4. **Điểm yếu đã phát hiện**

   - Không có primary user research hoặc hành vi sử dụng từ người dùng bên ngoài.
   - Mẫu khảo sát sản phẩm chỉ gồm năm nền tảng và được chọn theo phạm vi đề tài, không đại diện toàn bộ thị trường.

5. **Quyết định xử lý**

   - `Cần sửa trước bảo vệ` ở mức chuẩn bị thiết kế validation cụ thể; không sửa source khi chưa có yêu cầu.

6. **Trạng thái**

   - `Đã chốt`.

### DEV-Q004 — Thử nghiệm hai tuần kiểm chứng giả thuyết

**Câu hỏi nguyên văn**

> "Nếu chỉ được thực hiện một thử nghiệm trong hai tuần để kiểm chứng giả thuyết này, em sẽ thử nghiệm với nhóm người dùng nào, đo hành vi gì và đặt ngưỡng nào để quyết định giả thuyết đạt hay không đạt?"

**Iteration 1 — Brainstorm**

- Giảng viên đang kiểm tra khả năng chuyển một giả thuyết sản phẩm mơ hồ thành thử nghiệm có đối tượng, hành vi quan sát và tiêu chí quyết định được định trước.
- Cần kiểm chứng giả thuyết hẹp: luồng tích hợp và AI diễn giải của Yoca có giúp một persona thực hiện tác vụ phân tích Solana tốt hơn cách họ đang dùng hay không; không thể kiểm chứng toàn bộ nhu cầu thị trường trong hai tuần.
- Các nhóm có thể chọn: người mới hoàn toàn; người mới–trung cấp đã có ví và từng tra cứu token; active trader/researcher. Người mới hoàn toàn gần pain point nhưng có thể thiếu khả năng làm baseline; chuyên gia làm baseline tốt nhưng không đại diện cho rào cản tiếp cận. Nhóm mới–trung cấp có vẻ là phương án cân bằng cần kiểm chứng.
- Thiết kế khả dĩ: task-based comparative usability test theo kiểu within-subject/crossover, cùng người dùng làm một kịch bản bằng công cụ hiện tại và bằng Yoca, đổi thứ tự để giảm learning effect.
- Hành vi có thể đo: hoàn thành tác vụ đúng; thời gian hoàn thành; số lần đổi tab/công cụ; số lần cần trợ giúp; khả năng giải thích đúng tín hiệu và dẫn lại bằng chứng. Ý định sử dụng chỉ là số đo phụ vì là self-report.
- Ngưỡng phải được đặt trước và gắn với giả thuyết. Các phương án brainstorm: tỷ lệ hoàn thành không trợ giúp ≥70%; giảm median thời gian hoặc số lần chuyển công cụ ≥30%; trả lời đúng ≥70% câu kiểm tra hiểu; không có lỗi nghiêm trọng dẫn đến kết luận trái dữ liệu.
- Cỡ mẫu hai tuần có thể là 8–12 người cho kiểm chứng định hướng, nhưng chưa đủ để tuyên bố hiệu quả thống kê hoặc đại diện thị trường.
- Cần xác định rõ một primary metric và quy tắc pass/fail tổng thể; nếu dùng quá nhiều chỉ số có thể chọn kết quả có lợi sau thử nghiệm.
- Điều chưa chắc: khả năng tuyển đúng persona trong hai tuần, baseline công cụ nào, kịch bản/token nào đủ ổn định, cách chấm “kết luận đúng” và dữ liệu Yoca có tránh demo-fallback trong phiên thử hay không.
- Tuyên bố cần bằng chứng/giải thích: lý do chọn persona, lý do chọn cỡ mẫu, cơ sở của ngưỡng, cơ chế giảm bias và điều gì sẽ thay đổi nếu thử nghiệm không đạt.

Đang chờ yêu cầu iteration 2.

### DEV-Q002 — Vấn đề cốt lõi, người dùng chính và lý do cần Yoca

**Câu hỏi nguyên văn**

> "Trong tối đa hai phút, em hãy tự trình bày: vấn đề cốt lõi Yoca giải quyết là gì, người dùng chính là ai, và vì sao họ cần Yoca thay vì tiếp tục dùng các công cụ hiện có?"

**Iteration 1 — Brainstorm**

**Giảng viên đang kiểm tra điều gì**

- Team có phát biểu được một vấn đề cốt lõi đủ cụ thể, thay vì kể danh sách chức năng hay không.
- Team có xác định được một nhóm người dùng chính rõ ràng, thay vì nói sản phẩm dành cho tất cả mọi người hay không.
- Team có hiểu giải pháp thay thế hiện tại và “chi phí của việc không đổi” hay không.
- Team có chứng minh được giá trị khác biệt của Yoca từ nhu cầu người dùng, không chỉ từ công nghệ hoặc số lượng tính năng hay không.
- Team có thể ưu tiên thông tin và trình bày mạch lạc trong giới hạn hai phút hay không.

**Các cách hiểu cần phân biệt**

- “Công cụ hiện có” có thể là đối thủ trực tiếp, công cụ đơn lẻ, quy trình thủ công hoặc tổ hợp nhiều công cụ mà người dùng đang ghép lại.
- “Vì sao cần Yoca” có thể hỏi về lợi ích chức năng, trải nghiệm tích hợp, chi phí, độ tiện lợi, tính chuyên biệt hoặc một khoảng trống chưa được giải quyết.
- “Người dùng chính” cần là người trực tiếp sử dụng và chịu pain point; người trả tiền, người hưởng lợi và các actor phụ có thể là nhóm khác.
- Câu hỏi yêu cầu định vị sản phẩm và lợi thế thay thế, không yêu cầu trình bày toàn bộ kiến trúc hay toàn bộ chức năng.

**Khung ý trả lời ban đầu**

- Mở đầu bằng một câu: nhóm người dùng chính đang gặp tình huống nào và hậu quả cụ thể là gì.
- Giải thích cách họ đang xử lý bằng công cụ hiện có và khoảng trống còn lại.
- Định vị Yoca là giải pháp cho đúng khoảng trống đó.
- Nêu tối đa hai hoặc ba năng lực cốt lõi tạo ra giá trị; chưa nêu tên cho tới khi kiểm chứng.
- Kết bằng kết quả người dùng nhận được, không kết bằng stack công nghệ.

**Các góc nhìn cần brainstorm và kiểm chứng**

- Sản phẩm: job-to-be-done, pain point ưu tiên và giá trị cốt lõi.
- Client: thao tác nào Yoca giúp đơn giản hóa hoặc hợp nhất.
- Backend/dữ liệu: năng lực nào tạo khác biệt thật sự, thay vì chỉ là giao diện.
- Kiến trúc: chỉ đưa vào nếu sự tích hợp hoặc xử lý xuyên hệ thống là lợi thế có bằng chứng.
- Bảo mật: có thể là điều kiện tin cậy, nhưng chưa được coi là lợi thế nếu implementation không chứng minh.
- Business: phân biệt user, customer, payer; xác định lựa chọn thay thế và lợi thế cạnh tranh.

**Điều chưa chắc chắn hoặc có nguy cơ nói sai**

- Chưa xác nhận vấn đề cốt lõi mà final report phát biểu.
- Chưa xác nhận nhóm người dùng chính; không được tự suy ra từ tên hoặc giao diện sản phẩm.
- Chưa xác nhận các công cụ/quy trình thay thế được business report nêu.
- Chưa biết lợi thế nào có implementation hoạt động, lợi thế nào mới là định hướng hoặc tuyên bố marketing.
- Chưa có bằng chứng về mức độ pain point, số lượng người dùng, tiết kiệm thời gian/chi phí hay hiệu quả tốt hơn.
- Chưa biết Yoca thay thế hoàn toàn công cụ hiện có hay chỉ bổ sung/hợp nhất một phần.

**Tuyên bố cần bằng chứng**

- Phát biểu chính xác về vấn đề, user persona và bối cảnh sử dụng.
- So sánh với từng nhóm công cụ hiện có theo cùng tiêu chí.
- Các chức năng tạo nên lợi thế và luồng end-to-end tương ứng trong source.
- Mọi tuyên bố định lượng, nghiên cứu người dùng hoặc validation thị trường.
- Mức độ khớp giữa định vị trong báo cáo, slides và sản phẩm đã triển khai.

**Rủi ro sớm cần tránh**

- Mở đầu bằng “Yoca là một ứng dụng có các chức năng...” khiến câu trả lời lệch khỏi vấn đề.
- Kể quá nhiều nhóm người dùng và làm mất trọng tâm.
- Dùng các từ “tất cả trong một”, “thông minh”, “tối ưu”, “tiện lợi hơn” mà không nêu cơ chế hoặc bằng chứng.
- Hạ thấp công cụ hiện có một cách tuyệt đối; có khả năng Yoca chỉ phù hợp hơn trong một ngữ cảnh cụ thể.
- Biến kế hoạch tương lai hoặc prototype thành năng lực hiện tại.

**Bổ sung từ thành viên team sau iteration 1**

- Các pain point team thường thảo luận gồm wash trading, nhu cầu được AI hỗ trợ diễn giải và khó khăn của người dùng mới khi tiếp cận blockchain.
- Đây mới là ký ức/ý kiến của thành viên team, chưa được coi là bằng chứng về định vị chính thức hoặc implementation.
- Cần kiểm tra xem ba ý này tạo thành một chuỗi vấn đề thống nhất hay là ba bài toán độc lập.
- Giả thuyết kết nối để kiểm chứng: người mới khó tự đánh giá thông tin và hành vi bất thường trong môi trường blockchain; công cụ hiện có có thể quá kỹ thuật hoặc phân mảnh; Yoca có thể hỗ trợ tổng hợp/phân tích rồi diễn giải dễ hiểu. Không được dùng giả thuyết này làm câu trả lời chính thức trước khi kiểm tra.
- Phải xác nhận Yoca có thực sự phát hiện wash trading hay chỉ hiển thị dữ liệu/chỉ báo liên quan; AI có giải thích dựa trên dữ liệu thật hay chỉ là giao diện hội thoại; và “người dùng mới” có đúng là persona chính trong tài liệu hay không.

Đang chờ yêu cầu iteration 2.

**Iteration 2 — Bằng chứng**

- Final report, PDF trang 36–41 (trang nội dung 1–6): vấn đề là dữ liệu Solana công khai nhưng phức tạp, phân tán giữa nhiều công cụ và khó liên kết token–pool–ví–giao dịch; wash trading khó thấy từ chỉ số tổng hợp. Yoca được định vị là luồng phân tích tích hợp có AI diễn giải và mô-đun nhận diện dấu hiệu wash trading.
- Final report, PDF trang 40: có ba nhóm mục tiêu, gồm người nghiên cứu/tìm token, nhà giao dịch cá nhân và người mới tiếp cận tài sản số. Vì vậy không nên nói người mới là nhóm duy nhất; cách gọi bao quát hơn là người dùng cá nhân muốn phân tích Solana mà không tự ghép nhiều công cụ.
- Final report, PDF trang 8–12 và 38–39: công cụ hiện có đều có thế mạnh; khoảng trống Yoca nhắm tới là luồng chuyên biệt Solana, ít yêu cầu kỹ thuật hơn, liên kết nhiều miền dữ liệu, wash-trading analysis và diễn giải theo ngữ cảnh. Không có cơ sở nói Yoca tốt hơn mọi công cụ ở mọi tiêu chí.
- Final report, PDF trang 87–90 và 97: Wash Trading trả điểm, đồ thị, ví/chu trình nghi vấn và AI giải thích; ba tên GCN/GAT/GraphSAGE chỉ là cấu hình trọng số heuristic lấy cảm hứng từ GNN, chưa phải mô hình đã huấn luyện; kết quả là tín hiệu sàng lọc, không phải bằng chứng gian lận. Token, Wallet và Wash Trading đều có AI theo dữ liệu/ngữ cảnh của server.
- Business report, PDF trang 3 và 5: hành trình Market → Token → Wallet → Wash Trading/AI; phân khúc gồm người mới, người theo dõi thường xuyên, active trader/researcher và power user cá nhân.
- Source `server/src/services/wash-trading-ai.service.ts`: lấy/chuẩn hóa token transfer từ Helius, phát hiện chu trình 3–6 hop, tính đặc trưng và điểm heuristic, tạo risk score/graph rồi gửi kết quả có cấu trúc cho Gemini; có `demo-fallback` khi thiếu dữ liệu thật.
- Source `server/src/services/tokens/token-ai-context.ts` và `token-ai-chat.service.ts`: Ask Yoca xây context từ market, chart, holder, pool, security, news và volatility, sau đó yêu cầu Gemini chỉ dùng bằng chứng Yoca.
- Source `server/src/services/chat/chat.orchestrator.ts`, `routes/chat.route.ts` và `wash-trading-chat.service.ts`: Wallet Chat chọn/call tool dữ liệu server; Wash Trading Chat nhận trực tiếp current server analysis và bị giới hạn theo mint/timeframe/cấu hình hiện tại.
- Điểm chưa thể xác nhận chỉ bằng đọc source/tài liệu: chất lượng phát hiện ngoài thực tế, độ chính xác thống kê trên dữ liệu gán nhãn, mức tiết kiệm thời gian cho người dùng và mức độ chấp nhận thị trường. Không được nêu các kết quả này như đã chứng minh.

Đang chờ yêu cầu iteration 3.

**Iteration 3 — Tự phản biện**

- Bản dự thảo của team phát biểu đúng vấn đề phân mảnh và rào cản diễn giải, nhưng chưa trả lời trực tiếp vế “vì sao thay vì tiếp tục dùng công cụ hiện có”; cần nói các công cụ hiện có có thế mạnh riêng nhưng người dùng thường phải chuyển đổi và tự ghép ngữ cảnh.
- Cụm “đặc biệt là người mới” có bằng chứng nhưng dễ làm thầy hiểu đây là persona duy nhất. Nên gọi nhóm chính ở mức bao quát là người dùng cá nhân phân tích Solana, sau đó nêu ba nhóm: researcher/tìm token, trader cá nhân và người mới.
- “Dùng mô-đun wash trading” mơ hồ; chính xác hơn là “nhận diện và trình bày các dấu hiệu wash trading để người dùng đối chiếu”.
- AI phải được mô tả là diễn giải theo dữ liệu/ngữ cảnh server cung cấp, không phải tự xác minh sự thật hoặc thay người dùng kết luận.
- Cần sửa lỗi nói/viết “nhưng ai” thành “những ai” và “con số và thuật rời rạc” thành “con số và thuật ngữ rời rạc”.
- Câu hỏi sâu có thể đi vào: dữ liệu nào cấp cho từng AI; thuật toán wash trading hoạt động ra sao; GCN/GAT/GraphSAGE có được train không; Yoca khác Birdeye/Dune/Nansen ở tiêu chí nào.
- Giới hạn nên chủ động giữ: Yoca là công cụ hỗ trợ phân tích, tín hiệu wash trading không chứng minh gian lận, và lợi thế là tích hợp/phù hợp ngữ cảnh chứ không vượt mọi đối thủ trên mọi tiêu chí.
- Mức rủi ro của bản hiện tại: `vừa`, vì đúng nội dung nhưng thiếu một vế trực tiếp của câu hỏi và mô tả persona chưa đủ nhất quán với báo cáo.

Đang chờ yêu cầu iteration 4 hoặc yêu cầu kiểm tra thêm.

**Iteration 4 — Hội tụ**

- Phương án miệng 60–75 giây: mở bằng sự phức tạp/phân mảnh của dữ liệu Solana; xác định người dùng cá nhân gồm researcher, trader và người mới; so sánh thận trọng với tổ hợp công cụ hiện có; kết bằng giá trị tích hợp, wash-trading signals có thể đối chiếu và AI có ngữ cảnh.
- Phiên bản một câu: Yoca tạo một luồng phân tích Solana thống nhất, dễ tiếp cận hơn bằng cách liên kết dữ liệu thị trường–token–pool–ví–giao dịch, bổ sung tín hiệu wash trading và AI diễn giải dựa trên dữ liệu hệ thống.
- Bằng chứng hỏi tiếp: final report PDF trang 36–41, 87–90; business report PDF trang 3 và 5; các service Token AI, Wallet Chat và Wash Trading AI trong backend.
- Tuyệt đối không tuyên bố Yoca thay thế mọi công cụ, phát hiện chắc chắn gian lận, dùng GNN đã huấn luyện, đưa khuyến nghị đầu tư, hoặc đã chứng minh hiệu quả/độ chính xác ngoài thực tế.
- Câu hỏi nối tiếp dự kiến: khác Birdeye/Dune/Nansen cụ thể ở đâu; thuật toán wash trading tính gì; AI được cấp dữ liệu và hạn chế hallucination thế nào; team đã validation với người dùng hoặc dữ liệu gán nhãn chưa.
- Mức tự tin: 90%, vì định vị, persona và implementation đều có bằng chứng; 10% còn lại do chưa có validation thị trường và độ chính xác thực nghiệm.
- Vai trò phù hợp trả lời: thành viên nắm tổng quan sản phẩm; câu hỏi sâu về wash trading/AI nên chuyển cho backend/data member.

Đang chờ người dùng nói “chốt câu này” hoặc yêu cầu iteration khác.

**Kết luận đã chốt**

1. **Câu trả lời chính thức dùng khi bảo vệ**

   > Dạ thưa thầy, vấn đề cốt lõi mà Yoca giải quyết là dữ liệu on-chain trên Solana tuy công khai nhưng khá phức tạp và đang bị phân tán giữa nhiều công cụ. Để hiểu một token hoặc một ví, người dùng thường phải tự kết hợp dữ liệu thị trường, pool, holder, giao dịch và dòng tiền, nên rất khó nhìn thấy mối liên hệ giữa các thông tin này.
   >
   > Người dùng chính của Yoca là những người dùng cá nhân muốn tìm hiểu và phân tích hệ Solana, gồm người nghiên cứu token, nhà giao dịch cá nhân và người mới tiếp cận thị trường tài sản số.
   >
   > Các công cụ hiện có đều có thế mạnh riêng, nhưng thường chuyên biệt ở từng nhóm dữ liệu hoặc yêu cầu kiến thức kỹ thuật để khai thác hiệu quả. Yoca không đặt mục tiêu thay thế hoàn toàn các công cụ đó. Điểm khác biệt của Yoca là kết nối thị trường, token, pool, ví và giao dịch trong một luồng phân tích thống nhất; đồng thời nhận diện các dấu hiệu wash trading từ đồ thị giao dịch và dùng AI theo ngữ cảnh để diễn giải dữ liệu do hệ thống cung cấp. Nhờ vậy, người dùng có thể hiểu và đối chiếu các tín hiệu, thay vì chỉ nhìn những con số rời rạc.

2. **Câu trả lời rút gọn**

   > Yoca giúp người dùng cá nhân phân tích Solana trong một luồng thống nhất, kết hợp dữ liệu on-chain, tín hiệu wash trading và AI theo ngữ cảnh để giảm việc phải tự ghép và diễn giải dữ liệu từ nhiều công cụ.

3. **Câu hỏi nối tiếp và ý trả lời**

   - Khác Birdeye/Dune/Nansen ở đâu: Yoca nhấn mạnh luồng tích hợp chuyên biệt Solana và diễn giải theo ngữ cảnh; không tuyên bố hơn mọi đối thủ ở mọi tiêu chí.
   - Wash Trading hoạt động thế nào: dựng đồ thị token transfer, tìm chu trình và tính các đặc trưng heuristic; GCN/GAT/GraphSAGE là cấu hình trọng số GNN-inspired, chưa phải mô hình đã huấn luyện.
   - AI dùng dữ liệu gì: Token AI, Wallet Chat và Wash Trading AI đều nhận dữ liệu/ngữ cảnh đã được backend chuẩn bị; phản hồi vẫn phải được đối chiếu với dữ liệu nguồn.
   - Đã validation chưa: chưa có cơ sở tuyên bố độ chính xác trên tập nhãn hoặc mức chấp nhận thị trường; đánh giá hiện tập trung vào luồng xử lý và chức năng cốt lõi.

4. **Điểm yếu đã phát hiện**

   - Chưa có validation thị trường/người dùng đủ để định lượng nhu cầu hoặc lợi ích.
   - Wash Trading hiện dùng heuristic GNN-inspired và có demo-fallback; chưa có mô hình học trên dữ liệu gán nhãn.

5. **Quyết định xử lý**

   - `Không sửa gấp; chuẩn bị giải thích`.

6. **Trạng thái**

   - `Đã chốt`.

### DEV-Q003 — Bằng chứng người dùng thực sự gặp pain point

**Câu hỏi nguyên văn**

> "Bằng chứng thực tế nào cho thấy người dùng mục tiêu thật sự gặp vấn đề đó, thay vì đây chỉ là giả định của nhóm khi so sánh tính năng các nền tảng hiện có?"

**Iteration 1 — Brainstorm**

- Giảng viên đang phân biệt bằng chứng nhu cầu từ người dùng thật với suy luận của nhóm từ competitor analysis.
- Phân tích Arkham, Birdeye, CoinGecko, Dune, Glassnode và Nansen chỉ là secondary/market evidence; tự nó không chứng minh persona mục tiêu đã trải qua pain point.
- Các loại bằng chứng mạnh có thể gồm phỏng vấn, khảo sát, usability test, nhật ký quan sát, analytics sử dụng, phản hồi demo, review/support complaint công khai hoặc số liệu hành vi. Chưa xác nhận nhóm hiện có loại nào.
- Có ba hướng trả lời trung thực: (1) có primary evidence thì trình bày phương pháp và kết quả; (2) chỉ có secondary evidence thì gọi đây là problem hypothesis đã được triangulate nhưng chưa validation; (3) có phản hồi không chính thức từ thành viên/người thử thì mô tả đúng phạm vi, không nâng thành nghiên cứu người dùng.
- Ý kiến thành viên team: nhóm có tham khảo các ứng dụng tương tự. Có thể dùng để chứng minh khoảng trống chức năng và rào cản quan sát được, nhưng không được gọi là bằng chứng trực tiếp về nhu cầu.
- Cần kiểm tra báo cáo, tài liệu business và repository có khảo sát/phỏng vấn/usability test/analytics hay không; không suy ra có người dùng thật chỉ từ persona, pricing hoặc benchmark kỹ thuật.
- Rủi ro cao nhất là bịa validation hoặc dùng trải nghiệm của chính team như mẫu đại diện cho thị trường.

Đang chờ yêu cầu iteration 2.

## Danh sách điểm yếu

<!--
| ID | Điểm yếu | Bằng chứng | Mức độ | Xử lý đề xuất | Trạng thái |
|---|---|---|---|---|---|
-->

| ID | Điểm yếu | Bằng chứng | Mức độ | Xử lý đề xuất | Trạng thái |
|---|---|---|---|---|---|
| DEV-W001 | Chưa có validation thị trường/người dùng đủ để định lượng nhu cầu hoặc lợi ích | Final report và business report không cung cấp kết quả validation tương ứng | Vừa | Không sửa gấp; trả lời trung thực | Đang theo dõi |
| DEV-W002 | Wash Trading dùng heuristic GNN-inspired, chưa phải mô hình học trên dữ liệu gán nhãn | Final report PDF trang 87, 97, 101 và source wash-trading AI | Cao | Không nói quá; chuẩn bị giải thích phương pháp và giới hạn | Đang theo dõi |

## Cheat sheet đã thống nhất

<!-- Chỉ đưa câu trả lời đã được người dùng chốt vào đây. -->

### DEV-Q002 — Định vị Yoca

- Vấn đề: dữ liệu on-chain Solana phức tạp, phân tán và khó liên kết/diễn giải.
- Người dùng: người dùng cá nhân phân tích Solana, gồm researcher, trader và người mới.
- Giá trị: luồng Market–Token/Pool–Wallet/Transaction thống nhất, tín hiệu wash trading có thể đối chiếu và AI theo ngữ cảnh.
- Không tuyên bố: thay thế mọi công cụ, chứng minh gian lận, GNN đã huấn luyện hoặc hiệu quả thị trường đã được xác nhận.

### DEV-Q003 — Bằng chứng pain point

- Bằng chứng hiện có: đối chiếu Arkham, Birdeye, CoinGecko, Dune và Nansen; trải nghiệm thật của team khi học blockchain.
- Phạm vi kết luận: đủ hình thành product hypothesis, chưa phải external user validation.
- Không tuyên bố: đã khảo sát người dùng, team đại diện thị trường hoặc không có đối thủ Solana.
