#import "theme.typ": *
#import "components.typ": *

#let data = json("data/scenarios.json")

#show: report-theme.with(
  title: "Mô hình kinh doanh và kế hoạch vận hành Yoca",
  author: ("Nhóm phát triển Yoca",),
)

// Trang bìa
#set page(margin: 0mm)
#block(width: 100%, height: 297mm, fill: white, inset: (x: 24mm, y: 24mm))[
  #grid(
    rows: (auto, 1fr, auto),
    [
      #text(size: 9pt, weight: "semibold", fill: blue, tracking: 0.1em)[YOCA · ĐỒ ÁN TỐT NGHIỆP]
      #v(8pt)
      #line(length: 42mm, stroke: 2.2pt + blue)
    ],
    align(left + horizon)[
      #set par(leading: 0.95em)
      #text(size: 31pt, weight: "semibold", fill: ink)[Mô hình kinh doanh\ và kế hoạch vận hành]
      #v(16pt)
      #text(size: 13pt, fill: muted)[Từ hành trình người dùng đến chi phí, doanh thu và kế hoạch mở rộng]
      #v(28pt)
      #grid(
        columns: (1fr, 1fr, 1fr), gutter: 10pt,
        metric-card([Mô hình], [Freemium], note: [4 gói thuê bao]),
        metric-card([Chuyển đổi], [2–3%], note: [tăng theo độ trưởng thành]),
        metric-card([Quy mô], [3 mốc], note: [300 · 3.000 · 30.000 MAU]),
      )
    ],
    [
      #text(size: 9pt, fill: subtle)[Nhóm phát triển Yoca]
      #h(1fr)
      #text(size: 9pt, fill: subtle)[Tháng 7 · 2026]
    ],
  )
]

#set page(paper: "a4", margin: 20mm)
#counter(page).update(1)

#pagebreak()
#align(center)[#text(size: 21pt, weight: "semibold")[Nội dung báo cáo]]
#v(10pt)
#outline(title: none, depth: 2, indent: 12pt)

#v(18pt)
#callout(
  [Phạm vi],
  [Báo cáo trình bày cách Yoca tạo giá trị, hình thành doanh thu và kiểm soát chi phí tại ba mốc 300, 3.000 và 30.000 người dùng hoạt động hằng tháng. Các phép tính sử dụng một kịch bản cơ sở thống nhất và tỷ giá quy ước 25.000 VND/USD.],
)

#pagebreak()
= Tổng quan mô hình kinh doanh

Yoca hỗ trợ người dùng blockchain theo dõi thị trường, khảo sát token và pool, phân tích hoạt động ví, nhận diện dấu hiệu wash trading và sử dụng trợ lý AI theo ngữ cảnh. Sản phẩm kết nối các bước thường bị phân tán trên nhiều nền tảng thành một hành trình liên tục: từ tín hiệu thị trường, thông tin tài sản đến hành vi giao dịch của ví và các lớp phân tích nâng cao.

Mô hình freemium tạo điểm tiếp cận cho người dùng mới và thu phí theo mức sử dụng. Dữ liệu thị trường phổ biến có thể được tái sử dụng giữa nhiều người dùng, trong khi phân tích ví, AI và cảnh báo phát sinh chi phí gần hơn với từng yêu cầu. Vì vậy, quyền lợi trả phí tập trung vào hạn mức, tần suất cập nhật và các chức năng phân tích chuyên sâu.

#block(breakable: false)[
  #grid(
    columns: (1fr, 1fr), gutter: 9pt,
    callout([Dữ liệu hợp nhất], [Dữ liệu token, pool, ví và giao dịch từ nhiều provider được chuẩn hóa trong cùng một hệ thống.], tone: "neutral"),
    callout([Hành trình phân tích], [Người dùng đi từ Market Radar đến Token Overview, Wallet Analysis và các phân tích nâng cao.], tone: "neutral"),
    callout([Tái sử dụng dữ liệu], [Database-first giảm số lần gọi provider khi nhiều lượt xem dùng chung dữ liệu còn hiệu lực.], tone: "neutral"),
    callout([AI theo ngữ cảnh], [Trợ lý AI diễn giải dữ liệu Yoca và sử dụng công cụ bổ sung theo hạn mức từng gói.], tone: "neutral"),
  )
]

== Hành trình tạo giá trị

#grid(
  columns: (1fr, 1fr), gutter: 10pt,
  flow-step([01], [Khám phá thị trường], [Theo dõi xu hướng, token, pool và các biến động đáng chú ý.]),
  flow-step([02], [Đánh giá tài sản], [Xem metadata, thanh khoản, tokenomics, holder và lịch sử giá.]),
  flow-step([03], [Phân tích ví], [Khảo sát danh mục, PnL, giao dịch, transfer và hoạt động theo thời gian.]),
  flow-step([04], [Phân tích nâng cao], [Wash trading, cảnh báo và trợ lý AI giúp diễn giải dữ liệu theo ngữ cảnh.]),
)

= Khách hàng và nguồn doanh thu

Yoca sử dụng bốn gói thuê bao. Standard duy trì trải nghiệm dữ liệu lõi và cho phép người dùng mới thử từng module AI nhiều lần trong ngày. Lite dành cho người theo dõi token và ví thường xuyên. Plus bổ sung nhóm phân tích wash trading. Pro phục vụ người dùng cá nhân có tần suất nghiên cứu cao và cần hạn mức lớn hơn trên toàn bộ hệ thống.

#figure(
  report-table(
    5,
    ([Gói], [Giá tháng], [Giá năm], [Đối tượng], [Quyền lợi tạo khác biệt]),
    (
      ([Standard], [\$0], [\$0], [Người dùng mới], [Dữ liệu lõi; 5 lượt/ngày cho từng module AI chính]),
      ([Lite], [\$39], [\$390], [Người theo dõi thường xuyên], [Hạn mức AI và theo dõi cao hơn]),
      ([Plus], [\$79], [\$790], [Active trader/researcher], [Wash Trading Analysis và Chat]),
      ([Pro], [\$149], [\$1.490], [Power user cá nhân], [Hạn mức cao cho toàn bộ nhóm phân tích]),
    ),
    widths: (0.75fr, 0.7fr, 0.75fr, 1.35fr, 2fr),
  ),
  caption: [Bảng giá và phân khúc người dùng],
) <pricing-tiers>

Giá năm tương đương mười tháng và cung cấp quyền truy cập trong mười hai tháng. Vùng giá được đối chiếu với CryptoQuant, Dune và Nansen tại thời điểm khảo sát tháng 7/2026 @cryptoquant-pricing @dune-billing @nansen-pricing.

#figure(
  report-table(
    5,
    ([Gói], [Ask Yoca], [Wallet Chat], [Chart News], [Volatility]),
    (
      ([Standard], [5], [5], [5], [5]),
      ([Lite], [8], [8], [8], [8]),
      ([Plus], [12], [12], [12], [12]),
      ([Pro], [20], [20], [20], [20]),
    ),
    widths: (1.1fr, 1fr, 1fr, 1fr, 1fr),
  ),
  caption: [Hạn mức lượt sử dụng mỗi ngày của từng module AI chính],
) <ai-daily-quota>

Mỗi con số trong @ai-daily-quota là hạn mức riêng của một module và được làm mới lúc 00:00 UTC. Plus và Pro còn có lần lượt 3/5 lượt Wash Trading Analysis cùng 5/10 lượt Wash Trading Chat mỗi ngày. Cách phân bổ này cho phép Standard trải nghiệm đủ chiều sâu của sản phẩm, trong khi các gói trả phí tăng dung lượng sử dụng thường xuyên.

== Giả định chuyển đổi

Cơ cấu người trả phí gồm 80% Lite, 15% Plus và 5% Pro, tương ứng doanh thu bình quân 50,5 USD trên mỗi thuê bao trả phí trong một tháng. Tỷ lệ chuyển đổi được đặt ở mức 2% tại 300 MAU, 2,5% tại 3.000 MAU và 3% tại 30.000 MAU. Mức tăng phản ánh sự trưởng thành của sản phẩm, độ hoàn thiện của hành trình sử dụng và khả năng giữ người dùng tốt hơn khi quy mô phát triển.

#grid(
  columns: (1fr, 1fr, 1fr), gutter: 8pt,
  metric-card([300 MAU], [2%], note: [6 người trả phí]),
  metric-card([3.000 MAU], [2,5%], note: [75 người trả phí]),
  metric-card([30.000 MAU], [3%], note: [900 người trả phí]),
)

Giả định này nằm dưới vùng 3–5% được ChartMogul và ProductLed ghi nhận là mức chuyển đổi tốt của mô hình freemium tự phục vụ. Stripe cũng lưu ý rằng conversion của freemium thường ở vùng một chữ số thấp và người dùng miễn phí vẫn tạo ra chi phí vận hành @chartmogul-conversion @stripe-freemium.

= Cách chi phí hình thành

== Từ hành trình đến yêu cầu dữ liệu

Backend đọc dữ liệu đã chuẩn hóa trong PostgreSQL và kiểm tra thời hạn sử dụng trước khi làm mới từ provider. Một lượt cold cần cập nhật dữ liệu bên ngoài; một lượt warm sử dụng dữ liệu còn hiệu lực trong database. Cơ chế này giúp các token và dữ liệu thị trường phổ biến được chia sẻ giữa nhiều lượt xem. Dữ liệu ví có tỷ lệ cold cao hơn vì mỗi địa chỉ tạo một tập phân tích riêng.

#figure(
  benchmark-chart(data.benchmarks),
  caption: [Thời gian phản hồi cold và warm của ba hành trình lõi],
) <benchmark-cold-warm>

Kết quả ở @benchmark-cold-warm cho thấy lượt warm giảm thời gian phản hồi khoảng 6,9 đến 38,5 lần trong benchmark cục bộ ngày 19/7/2026. Việc tái sử dụng dữ liệu đồng thời giảm số provider request phát sinh khi người dùng lặp lại cùng một hành trình.

== Năm nhóm chi phí trực tiếp

#figure(
  report-table(
    3,
    ([Nhóm chi phí], [Thành phần], [Yếu tố quyết định]),
    (
      ([Dữ liệu blockchain], [CoinGecko, Birdeye, Mobula, Helius, Zerion và Moralis], [Credit, CU, request, RPS và tỷ lệ cold]),
      ([AI và tìm kiếm], [Gemini hoặc Qwen; Brave Search], [Input, output, tool call và mức sử dụng theo chức năng]),
      ([Hạ tầng], [Render, Supabase và hạ tầng GPU], [CPU, bộ nhớ, database, tải đồng thời]),
      ([Email và Alert], [Resend], [Số cảnh báo, email khôi phục và hạn mức gửi]),
      ([Thanh toán], [Phí xử lý giao dịch], [Doanh thu và số thuê bao trả phí]),
    ),
    widths: (1.1fr, 1.85fr, 2.05fr),
  ),
  caption: [Các nhóm chi phí trực tiếp của Yoca],
) <direct-cost-groups>

Mỗi MAU được giả định có tám phiên hoạt động trong một tháng. Một phiên được phân bổ cho Market Radar, Token Overview, Wallet Core, Wallet Activity, AI và Alert theo đặc điểm sử dụng. Tỷ lệ cold của token giảm khi quy mô tăng nhờ dữ liệu phổ biến được chia sẻ rộng hơn; dữ liệu ví giữ tỷ lệ cold cao hơn.

Ngày 31/7/2026, nhóm chạy năm mẫu trên từng hành trình AI chính. Ask Yoca, Wallet Chat, Chart News, Volatility và Wash Trading Chat đều trả kết quả thành công trên bộ mẫu. Một lượt Chart News tạo 4–5 yêu cầu mô hình để diễn giải nhiều sự kiện, còn Volatility tạo một yêu cầu; số Brave Search request quan sát được dao động từ 0 đến 3 tùy mức độ dữ liệu RSS sẵn có. Calculator sử dụng median token của các mẫu thực chạy và dùng p95 như ngưỡng kiểm tra tải xấu.

= Kế hoạch công nghệ theo quy mô

#figure(
  report-table(
    4,
    ([Quy mô], [AI], [Backend và database], [Tổ chức vận hành]),
    (
      ([300 MAU], [Gemini theo mức sử dụng], [Render Starter · Supabase Free], [Bốn thành viên bán thời gian]),
      ([3.000 MAU], [Gemini với quota theo chức năng], [Render Standard · Supabase Pro], [Bốn nhân sự toàn thời gian]),
      ([30.000 MAU], [Qwen self-host theo tải], [Render và Supabase mở rộng], [Doanh nghiệp nhỏ khoảng 20 người]),
    ),
    widths: (0.8fr, 1.4fr, 1.45fr, 1.75fr),
  ),
  caption: [Cấu hình công nghệ và tổ chức theo quy mô],
) <technology-scale>

Frontend Vite được triển khai dưới dạng Render Static Site, API chạy như Render Web Service và PostgreSQL được lưu trữ trên Supabase. Hạ tầng được nâng theo CPU, bộ nhớ, p95 latency, connection pool và dung lượng database. Chi phí tham chiếu được lấy từ bảng giá Render và Supabase @render-pricing @supabase-pricing.

== Phương án AI tại 30.000 MAU

Tại 30.000 MAU, Yoca sử dụng Qwen3-30B-A3B-Instruct-2507, một mô hình Apache 2.0 có 30,5 tỷ tham số và kích hoạt 3,3 tỷ tham số cho mỗi token. Phiên bản này hoạt động ở chế độ non-thinking, phù hợp với các tác vụ diễn giải dữ liệu có cấu trúc và giúp kiểm soát độ trễ @qwen-model.

Hệ thống duy trì bốn GPU RTX 6000 Ada 48GB và mở rộng tối đa sáu GPU theo tải. Chi phí bình quân theo năm GPU cùng lưu trữ và giám sát đạt khoảng 3.166 USD mỗi tháng theo đơn giá RunPod tại thời điểm khảo sát @runpod-pricing. Nhóm đặt mục tiêu giảm 20–25% input token, 10–15% output token và 15–20% số lượt gọi công cụ thông qua tối ưu prompt, dữ liệu đầu vào và luồng xử lý. Thời gian phản hồi mục tiêu được giữ trong khoảng 30 giây cho mỗi yêu cầu.

= Kịch bản tài chính

== Doanh thu, tổng chi phí và lợi nhuận

Chi phí trực tiếp bao gồm dữ liệu blockchain, AI và tìm kiếm, hạ tầng, email cùng phí thanh toán. Tổng chi phí tiếp tục cộng nhân sự, marketing, phát triển sản phẩm, bảo mật, hành chính, thuế, pháp lý và dự phòng. Vì vậy, lợi nhuận trong @financial-results là phần còn lại sau toàn bộ ngân sách của kịch bản.

#figure(
  profit-chart(data.scenarios),
  caption: [Cơ cấu doanh thu theo chi phí và lợi nhuận tại ba mốc quy mô],
) <profit-composition>

#figure(
  report-table(
    7,
    ([MAU], [Conversion], [Người trả phí], [Doanh thu], [Chi phí trực tiếp], [Tổng chi phí], [Lợi nhuận]),
    (
      ([300], [2%], [6], [\$303,00], [\$145,75], [\$287,75], [\$15,25 · 5,0%]),
      ([3.000], [2,5%], [75], [\$3.787,50], [\$1.181,98], [\$3.559,98], [\$227,52 · 6,0%]),
      ([30.000], [3%], [900], [\$45.450,00], [\$9.647,05], [\$42.892,25], [\$2.557,75 · 5,6%]),
    ),
    widths: (0.58fr, 0.72fr, 0.85fr, 1fr, 1fr, 1fr, 1.25fr),
  ),
  caption: [Kết quả tài chính theo tháng, đơn vị USD],
) <financial-results>

Ba mốc đều duy trì lợi nhuận dương với biên khoảng 5–6%. Phần tiết kiệm từ model AI mới được dành cho phát triển sản phẩm, thu hút người dùng, bảo mật và dự phòng thay vì chuyển toàn bộ thành lợi nhuận ngắn hạn.

== Cơ cấu chi phí trực tiếp

#grid(
  columns: (1fr, 1fr), gutter: 12pt, align: top,
  [
    #figure(
      cost-mix-chart(data.costMix3k),
      caption: [Cơ cấu chi phí trực tiếp tại 3.000 MAU],
    )
    #report-table(
      3,
      ([Nhóm chi phí], [USD/tháng], [Tỷ trọng]),
      data.costMix3k.map(item => (
        grid(
          columns: (7pt, 1fr), gutter: 5pt, align: horizon,
          rect(width: 7pt, height: 7pt, fill: rgb(item.color)),
          [#item.name],
        ),
        item.value,
        item.share,
      )),
      widths: (1.45fr, 0.8fr, 0.65fr),
    )
  ],
  [
    #figure(
      cost-mix-chart(data.costMix30k),
      caption: [Cơ cấu chi phí trực tiếp tại 30.000 MAU],
    )
    #report-table(
      3,
      ([Nhóm chi phí], [USD/tháng], [Tỷ trọng]),
      data.costMix30k.map(item => (
        grid(
          columns: (7pt, 1fr), gutter: 5pt, align: horizon,
          rect(width: 7pt, height: 7pt, fill: rgb(item.color)),
          [#item.name],
        ),
        item.value,
        item.share,
      )),
      widths: (1.45fr, 0.8fr, 0.65fr),
    )
  ],
)

Tại 3.000 MAU, Gemini và Brave Search chiếm 40,3% chi phí trực tiếp, còn data provider chiếm 44,2%. Khi đạt 30.000 MAU, Qwen GPU trở thành một khoản hạ tầng AI có thể dự báo theo số worker; Brave Search tiếp tục biến đổi theo số lượt tìm kiếm. Hai thành phần này chiếm 68,6% chi phí trực tiếp và là trọng tâm của kế hoạch tối ưu prompt, tool call và dữ liệu đầu vào.

== Nhân sự và phân bổ nguồn lực

#figure(
  report-table(
    4,
    ([Quy mô], [Nhân sự], [Ngân sách chính], [Lợi nhuận giữ lại]),
    (
      ([300 MAU], [4 thành viên bán thời gian; hỗ trợ tổng \$40 (1 triệu VND)], [Tăng trưởng \$40; sản phẩm và bảo mật \$42; hành chính, dự phòng \$20], [\$15,25]),
      ([3.000 MAU], [4 người toàn thời gian; \$280/người (7 triệu VND)], [Marketing \$480; sản phẩm và bảo mật \$338; hành chính \$180; dự phòng \$260], [\$227,52]),
      ([30.000 MAU], [Khoảng 20 người; \$320/người (8 triệu VND)], [Marketing \$14.317,60; sản phẩm và bảo mật \$5.369,20; hành chính \$3.579,20; dự phòng \$3.579,20], [\$2.557,75]),
    ),
    widths: (0.72fr, 1.35fr, 2.35fr, 0.9fr),
  ),
  caption: [Phân bổ số dư sau chi phí trực tiếp],
) <resource-allocation>

Mức 300 MAU giúp sản phẩm tự trang trải và tạo một khoản tích lũy nhỏ. Tại 3.000 MAU, bốn thành viên có thể chuyển sang làm việc toàn thời gian với mức thu nhập 280 USD (7 triệu VND) mỗi người. Khi đạt 30.000 MAU, đội ngũ mở rộng để bổ sung năng lực kỹ thuật, dữ liệu, bảo mật, hỗ trợ và phát triển thị trường; thu nhập bình quân tăng lên 320 USD (8 triệu VND) mỗi người.

= Kế hoạch mở rộng và kiểm soát chi phí

== Ngưỡng rà soát dịch vụ

Yoca bắt đầu rà soát khi dự báo đạt 70% quota, chuẩn bị nâng gói ở 85% và duy trì khoảng dự phòng cho retry hoặc tải đột biến. Quyết định nâng cấp kết hợp quota, giới hạn RPS/RPM, lỗi 429 và độ trễ p95. Cách theo dõi này giúp phân biệt thiếu hạn mức provider với thiếu năng lực của backend hoặc database.

#figure(
  report-table(
    3,
    ([MAU ước tính], [Dịch vụ], [Điều chỉnh ngân sách]),
    (
      ([150], [Mobula], [Free → Start-up]),
      ([300], [CoinGecko], [Demo → Basic]),
      ([450], [Birdeye], [Standard → Lite]),
      ([1.600], [Mobula], [Start-up → Growth]),
      ([2.775], [Helius], [Free → Developer]),
      ([3.525], [CoinGecko], [Basic → Analyst]),
    ),
    widths: (0.9fr, 1.1fr, 2fr),
  ),
  caption: [Các breakpoint đầu tiên trong kịch bản cơ sở],
) <provider-breakpoints>

== Nguồn vốn và tiến trình phát triển

Giai đoạn đầu được duy trì bằng nguồn lực của nhóm và doanh thu thuê bao. Khi MVP hình thành tập người dùng ổn định, doanh thu định kỳ và số liệu sử dụng trở thành cơ sở cho chương trình hỗ trợ startup, hợp tác chiến lược hoặc vòng vốn thiên thần/seed. Nguồn vốn mở rộng được gắn với kế hoạch sử dụng cho nhân sự, dữ liệu, hạ tầng, bảo mật và phát triển thị trường.

#grid(
  columns: (1fr, 1fr, 1fr), gutter: 8pt,
  metric-card([300 MAU], [Tự trang trải], note: [duy trì và hoàn thiện MVP]),
  metric-card([3.000 MAU], [Đội ngũ lõi], note: [4 vị trí toàn thời gian]),
  metric-card([30.000 MAU], [Mở rộng], note: [AI self-host và doanh nghiệp nhỏ]),
)

= Kết luận

Yoca tạo doanh thu bằng mô hình freemium kết hợp bốn gói thuê bao, trong đó mức chi trả gắn với tần suất sử dụng và chiều sâu phân tích. Cơ chế database-first giúp giảm chi phí dữ liệu ở những lượt xem lặp lại, còn quota theo chức năng giữ mức sử dụng AI và Alert phù hợp với từng gói.

Kịch bản cơ sở duy trì lợi nhuận dương ở cả ba mốc. Lợi nhuận theo tháng lần lượt đạt khoảng 15,25 USD, 227,52 USD và 2.557,75 USD tại 300, 3.000 và 30.000 MAU. Phần lớn nguồn lực ở giai đoạn mở rộng tiếp tục được dành cho nhân sự, tăng trưởng, bảo mật và dự phòng.

Việc chuyển sang Qwen self-host tại 30.000 MAU tạo khả năng kiểm soát chi phí AI dài hạn. Cùng với cơ chế theo dõi quota và các ngưỡng nâng gói, mô hình cho phép Yoca mở rộng theo số liệu sử dụng mà vẫn duy trì một biên lợi nhuận thận trọng.

#set heading(numbering: none)
#pagebreak()
= Phụ lục A — Provider và đơn vị sử dụng

#figure(
  report-table(
    4,
    ([Provider], [Vai trò trong Yoca], [Gói tham chiếu], [Đơn vị chính]),
    (
      ([CoinGecko], [Market và token market data], [Demo], [Credit/tháng]),
      ([Birdeye], [Market Radar, pool và price history], [Standard], [CU/kỳ]),
      ([Mobula], [Wallet analysis, PnL và activity], [Free], [Credit/tháng; RPS]),
      ([Helius], [Wallet balance, transaction và webhook], [Free], [Credit/tháng]),
      ([Zerion], [Balance chart theo từng token], [Developer], [Request/ngày; RPS]),
      ([Moralis], [Bổ sung token metadata], [Free], [CU/ngày]),
    ),
    widths: (0.85fr, 1.75fr, 1fr, 1.4fr),
  ),
  caption: [Vai trò và đơn vị sử dụng của các provider],
) <provider-overview>

#figure(
  report-table(
    4,
    ([Tác vụ làm mới], [Provider], [Mức sử dụng quan sát], [Yếu tố làm thay đổi]),
    (
      ([Market Radar], [CoinGecko · Birdeye], [17 credits · 135 CU], [Số market endpoint và retry]),
      ([Token Overview], [CoinGecko · Mobula], [15 credits · 1 credit], [Số batch token/pool]),
      ([Wallet Core], [Mobula · Helius], [21 credits · 100 credits], [Số trang holdings]),
      ([Wallet Activity], [Mobula], [1–10 credits], [Mật độ giao dịch và phân trang]),
      ([Wallet Token Chart], [Zerion], [1 request/token], [Số token được chọn]),
      ([Token Metadata], [Moralis], [10 CU], [Lần bổ sung metadata]),
    ),
    widths: (1.15fr, 1.2fr, 1.2fr, 1.45fr),
  ),
  caption: [Đơn vị provider cho một lần làm mới],
) <journey-units>

Giá và giới hạn được khảo sát từ tài liệu chính thức của CoinGecko, Birdeye, Mobula, Helius, Zerion và Moralis @coingecko-pricing @birdeye-pricing @mobula-pricing @helius-pricing @zerion-api @moralis-pricing.

= Phụ lục B — Bảng thuật ngữ

#figure(
  report-table(
    3,
    ([Thuật ngữ], [Tên đầy đủ hoặc cách đọc], [Ý nghĩa trong báo cáo]),
    (
      ([MAU], [Monthly Active Users], [Số người dùng khác nhau có ít nhất một tương tác dữ liệu trong 30 ngày.]),
      ([CU], [Compute Unit], [Đơn vị Birdeye và Moralis dùng để tính mức sử dụng API.]),
      ([Credit], [Tín dụng API], [Đơn vị quota của CoinGecko, Mobula và Helius.]),
      ([RPS / RPM], [Requests per second / minute], [Số request tối đa trong một giây hoặc một phút.]),
      ([p95 latency], [Phân vị 95 của độ trễ], [Mức thời gian mà 95% request hoàn thành nhanh hơn hoặc bằng giá trị này.]),
      ([Cold], [Lần tải cần làm mới], [Yêu cầu gọi provider để cập nhật dữ liệu.]),
      ([Warm], [Lần tải dùng dữ liệu còn hiệu lực], [Yêu cầu đọc dữ liệu trong database mà chưa cần gọi provider.]),
      ([Database-first], [Ưu tiên cơ sở dữ liệu], [Đọc database, kiểm tra thời hạn rồi mới làm mới khi cần.]),
      ([Tool call], [Lời gọi công cụ của AI], [Thao tác AI dùng để lấy dữ liệu Yoca hoặc tìm kiếm bổ sung.]),
      ([Non-thinking], [Không sinh chuỗi suy luận riêng], [Chế độ Qwen tạo trực tiếp câu trả lời mà không xuất reasoning token.]),
      ([Quota], [Hạn mức sử dụng], [Số credit, CU hoặc request được dùng trong một chu kỳ.]),
      ([Conversion rate], [Tỷ lệ chuyển đổi], [Tỷ lệ MAU trở thành người dùng trả phí.]),
      ([Freemium], [Miễn phí kết hợp trả phí], [Mô hình có gói cơ bản miễn phí và các gói nâng cấp.]),
      ([PnL], [Profit and Loss], [Kết quả lãi hoặc lỗ của hoạt động giao dịch.]),
      ([Provider], [Nhà cung cấp dữ liệu], [Dịch vụ bên ngoài cung cấp dữ liệu hoặc năng lực xử lý cho Yoca.]),
      ([Breakpoint], [Ngưỡng chuyển gói], [Mốc nhu cầu khiến gói dịch vụ cần được rà soát hoặc nâng cấp.]),
    ),
    widths: (0.95fr, 1.55fr, 2.5fr),
  ),
  caption: [Các thuật ngữ và chữ viết tắt sử dụng trong báo cáo],
) <business-glossary>

#pagebreak()
= Tài liệu tham khảo

#bibliography("bibliography.bib", title: none, style: "ieee")
