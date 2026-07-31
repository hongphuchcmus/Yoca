#import "@preview/touying:0.7.4": slide, speaker-note
#import "theme.typ": *
#import "components.typ": *

#let data = json("data/scenarios.json")

#show: deck-theme

#set text(font: ("IBM Plex Sans", "Noto Sans", "Liberation Sans"), size: 14.5pt, fill: ink)
#set par(leading: 0.68em)

#slide(title: slide-title([Giá trị sản phẩm và nguồn doanh thu]))[
  #full-grid(
    rows: (auto, 1fr, auto, auto),
    row-gutter: 12pt,
    product-flow(),
    [
      #grid(
        columns: (1fr, 1fr, 1fr, 1fr),
        gutter: 10pt,
        tier-card([Standard], [\$0], [Người dùng mới], [5 lượt/ngày cho từng module AI], free: true),
        tier-card([Lite], [\$39], [Theo dõi thường xuyên], [8 lượt/ngày cho từng module AI]),
        tier-card([Plus], [\$79], [Active trader], [12 lượt/module · mở Wash Trading]),
        tier-card([Pro], [\$149], [Power user], [20 lượt/ngày cho từng module AI]),
      )
    ],
    [
      #grid(
        columns: (1fr, 1fr, 1fr, 0.9fr),
        gutter: 9pt,
        ..data.scenarios.map(item => conversion-card(item.mau, item.conversion, item.paidUsers)),
        panel([
          #text(size: 8pt, weight: "semibold")[ARPPU]
          #linebreak()
          #text(size: 18pt, weight: "bold", fill: accent)[\$50,5]
          #linebreak()
          #text(size: 6.7pt, fill: muted)[mỗi tháng]
        ], inset: 9pt),
      )
    ],
    takeaway([Freemium tạo lối vào; doanh thu đến từ tần suất sử dụng và chiều sâu phân tích.]),
  )

  #speaker-note[
    Yoca nối hành trình Market, Token, Wallet và phân tích nâng cao trong cùng một sản phẩm. Standard giúp người dùng trải nghiệm dữ liệu lõi. Lite, Plus và Pro tăng hạn mức theo dõi, AI và wash trading. Tỷ lệ chuyển đổi tăng từ 2% lên 3% khi sản phẩm trưởng thành; doanh thu trung bình trên một thuê bao trả phí khoảng 50,5 USD mỗi tháng.
  ]
]

#slide(title: slide-title([Cơ sở hình thành chi phí]))[
  #full-grid(
    rows: (1fr, auto),
    row-gutter: 11pt,
    [
      #grid(
        columns: (1fr, 1fr),
        gutter: 18pt,
        [
          #cost-pipeline()
          #v(13pt)
          #eyebrow([Cold và warm · benchmark cục bộ 19/7])
          #v(7pt)
          #grid(
            rows: (auto, auto, auto),
            row-gutter: 4pt,
            ..data.benchmarks.map(item => latency-row(item)),
          )
        ],
        [
          #eyebrow([Đơn vị chi phí theo hành trình])
          #v(7pt)
          #journey-table()
          #v(12pt)
          #grid(
            columns: (1fr, 1fr),
            gutter: 8pt,
            panel([
              #text(size: 13pt, weight: "bold", fill: accent)[8 phiên]
              #linebreak()
              #text(size: 7pt, fill: muted)[mỗi MAU mỗi tháng]
            ], inset: 10pt),
            panel([
              #text(size: 13pt, weight: "bold", fill: accent)[5 nhóm chi phí]
              #linebreak()
              #text(size: 7pt, fill: muted)[data · AI · infra · email · payment]
            ], inset: 10pt),
          )
          #v(8pt)
          #panel([
            #text(size: 8pt, weight: "semibold")[Nguyên tắc đo]
            #v(4pt)
            #text(size: 7.5pt, fill: muted)[Theo dõi từng credit, CU hoặc request phát sinh từ operation; không lấy page view nhân trực tiếp với giá API.]
          ], inset: 10pt)
        ],
      )
    ],
    takeaway([Database-first giảm latency và hạn chế provider request ở những lượt xem lặp lại.]),
  )

  #speaker-note[
    Backend đọc PostgreSQL trước, kiểm tra dữ liệu rồi mới gọi provider khi cần làm mới. Cold refresh phát sinh credit, CU hoặc request; warm dùng dữ liệu còn hiệu lực. Benchmark cho thấy warm nhanh hơn khoảng 7 đến 38 lần. Cost model được xây dựng từ các operation quan sát được thay vì nhân page view với một đơn giá chung.
  ]
]

#slide(title: slide-title([Cơ cấu chi phí theo quy mô]))[
  #full-grid(
    rows: (auto, auto, auto),
    row-gutter: 11pt,
    [
      #grid(
        columns: (1fr, 1fr),
        gutter: 16pt,
        cost-panel([3.000 MAU · GEMINI], [\$1.182], data.costMix3k),
        cost-panel([30.000 MAU · QWEN], [\$9.647], data.costMix30k),
      )
    ],
    [
      #grid(
        columns: (1fr, 1fr, 1fr, 1fr),
        gutter: 9pt,
        kpi-card([\$0,39], [chi phí trực tiếp/MAU tại 3.000]),
        kpi-card([\$0,32], [chi phí trực tiếp/MAU tại 30.000]),
        kpi-card([44,2% → 13,9%], [tỷ trọng data provider]),
        kpi-card([40,3% → 68,6%], [tỷ trọng AI và tìm kiếm]),
      )
    ],
    takeaway([AI và tìm kiếm chiếm 40,3% chi phí trực tiếp ở 3.000 MAU và 68,6% ở 30.000 MAU.]),
  )

  #speaker-note[
    Ở 3.000 MAU, data provider là nhóm chi phí trực tiếp lớn nhất; Gemini và Brave Search chiếm khoảng 40,3%. Khi đạt 30.000 MAU, Qwen GPU trở thành chi phí hạ tầng AI có thể dự báo theo số worker, còn Brave Search tiếp tục thay đổi theo số lượt tìm kiếm. Đây là lý do tối ưu prompt, tool call và dữ liệu đầu vào trở thành ưu tiên kỹ thuật.
  ]
]

#slide(title: slide-title([Phương án AI tại 30.000 MAU]))[
  #full-grid(
    rows: (auto, auto, auto, auto),
    row-gutter: 10pt,
    [
      #grid(
        columns: (1fr, auto, 1fr),
        gutter: 14pt,
        align: horizon,
        ai-model-card(
          [3.000 MAU],
          [Gemini],
          (
            [Trả phí theo input, output và thinking token],
            [Phù hợp giai đoạn lưu lượng trung bình],
            [Standard 5 · Lite 8 · Plus 12 · Pro 20 lượt/module],
          ),
        ),
        text(size: 24pt, weight: "bold", fill: accent)[→],
        ai-model-card(
          [30.000 MAU],
          [Qwen3-30B-A3B],
          (
            [Apache 2.0 · chế độ non-thinking],
            [RTX 6000 Ada 48GB],
            [4 GPU thường trực · tối đa 6 GPU],
          ),
          inverse: true,
        ),
      )
    ],
    [
      #panel([
        #grid(
          columns: (1fr, auto, 1fr, auto, 1fr, auto, 1fr),
          gutter: 8pt,
          align: horizon,
          [
            #text(size: 8pt, weight: "semibold")[Ngân sách prompt]
            #linebreak()
            #text(size: 6.7pt, fill: muted)[giới hạn lịch sử]
          ],
          text(size: 11pt, fill: accent)[→],
          [
            #text(size: 8pt, weight: "semibold")[Tool data gọn]
            #linebreak()
            #text(size: 6.7pt, fill: muted)[chỉ lấy trường cần thiết]
          ],
          text(size: 11pt, fill: accent)[→],
          [
            #text(size: 8pt, weight: "semibold")[Non-thinking]
            #linebreak()
            #text(size: 6.7pt, fill: muted)[giảm chuỗi suy luận]
          ],
          text(size: 11pt, fill: accent)[→],
          [
            #text(size: 8pt, weight: "semibold")[Đầu ra có cấu trúc]
            #linebreak()
            #text(size: 6.7pt, fill: muted)[kiểm soát độ dài]
          ],
        )
      ], inset: 9pt)
    ],
    [
      #grid(
        columns: (1fr, 1fr, 1fr, 1fr),
        gutter: 9pt,
        kpi-card([\$3.166], [chi phí AI/tháng]),
        kpi-card([≤30 giây], [mục tiêu mỗi request]),
        kpi-card([−20–25%], [input token]),
        kpi-card([−15–20%], [tool call]),
      )
    ],
    takeaway([Self-host giúp chi phí AI dễ dự báo hơn khi lưu lượng đạt quy mô đủ lớn.]),
  )

  #speaker-note[
    Tại 30.000 MAU, Yoca chuyển sang Qwen3-30B-A3B-Instruct-2507. Mô hình chỉ chạy non-thinking, phù hợp với nhiệm vụ diễn giải dữ liệu có cấu trúc. Cấu hình duy trì bốn GPU và mở rộng tối đa sáu GPU, chi phí bình quân khoảng 3.166 USD mỗi tháng. Mục tiêu tối ưu tiếp theo là giảm token đầu vào, độ dài đầu ra và số tool call.
  ]
]

#slide(title: slide-title([Kết quả tài chính theo quy mô]))[
  #full-grid(
    rows: (auto, auto, 1fr, auto),
    row-gutter: 11pt,
    finance-bars(data.scenarios),
    finance-table(data.scenarios),
    [
      #grid(
        columns: (1fr, 1fr, 1fr),
        gutter: 10pt,
        panel([
          #eyebrow([300 MAU])
          #v(5pt)
          #text(size: 14pt, weight: "bold")[Tự trang trải MVP]
          #v(5pt)
          #text(size: 8pt, fill: muted)[4 thành viên bán thời gian · lợi nhuận \$15,25]
        ]),
        panel([
          #eyebrow([3.000 MAU])
          #v(5pt)
          #text(size: 14pt, weight: "bold")[Đội ngũ lõi]
          #v(5pt)
          #text(size: 8pt, fill: muted)[4 người · \$280/người (7 triệu VND)]
        ]),
        panel([
          #eyebrow([30.000 MAU])
          #v(5pt)
          #text(size: 14pt, weight: "bold")[Mở rộng vận hành]
          #v(5pt)
          #text(size: 8pt, fill: muted)[Khoảng 20 người · \$320/người (8 triệu VND)]
        ]),
      )
    ],
    takeaway([Ba mốc đều có lợi nhuận dương; biên 5,0–6,0% giữ mô hình ở trạng thái thận trọng.]),
  )

  #speaker-note[
    Sau khi tính cả chi phí trực tiếp, nhân sự, marketing, vận hành và dự phòng, lợi nhuận lần lượt là 15,25 USD, 227,52 USD và 2.557,75 USD mỗi tháng. Phần tiết kiệm từ AI được đưa trở lại ngân sách tăng trưởng, sản phẩm và bảo mật để giữ kịch bản thận trọng.
  ]
]

#slide(title: slide-title([Kế hoạch vận hành và mở rộng]))[
  #full-grid(
    rows: (1fr, auto, auto),
    row-gutter: 12pt,
    [
      #grid(
        columns: (1fr, 1fr, 1fr),
        gutter: 12pt,
        scale-stage(
          [300],
          [Tự trang trải],
          [Render Starter · Supabase Free],
          [4 thành viên bán thời gian],
          [hỗ trợ tổng \$40 (1 triệu VND)],
          [duy trì và hoàn thiện MVP],
        ),
        scale-stage(
          [3.000],
          [Đội ngũ lõi],
          [Render Standard · Supabase Pro],
          [4 người toàn thời gian],
          [\$280/người (7 triệu VND)],
          [tăng retention và hoàn thiện sản phẩm],
        ),
        scale-stage(
          [30.000],
          [Mở rộng],
          [Render/Supabase theo tải · Qwen self-host],
          [khoảng 20 nhân sự],
          [\$320/người (8 triệu VND)],
          [dữ liệu · AI · bảo mật · thị trường],
        ),
      )
    ],
    [
      #grid(
        columns: (1fr, 1fr, 1fr),
        gutter: 9pt,
        kpi-card([70%], [bắt đầu rà soát quota]),
        kpi-card([85%], [chuẩn bị nâng gói]),
        kpi-card([p95 · 429 · RPS], [tín hiệu vận hành]),
      )
    ],
    takeaway([Ưu tiên tăng trưởng bằng doanh thu; vốn bên ngoài chỉ dùng khi có traction và kế hoạch sử dụng rõ ràng.]),
  )

  #speaker-note[
    Ba mốc tương ứng ba trạng thái tổ chức. Yoca theo dõi quota từ 70 phần trăm và chuẩn bị nâng ở 85 phần trăm, đồng thời quan sát lỗi 429, RPS và p95 latency. Giai đoạn đầu dùng nguồn lực nhóm và doanh thu; chương trình hỗ trợ startup hoặc vốn thiên thần chỉ được xem xét sau khi có người dùng và doanh thu định kỳ.
  ]
]

#slide(title: slide-title([Phụ lục · Hệ thống provider và hạn mức]))[
  #full-grid(
    rows: (auto, 1fr, auto),
    row-gutter: 11pt,
    [
      #grid(
        columns: (1fr, 1fr, 1fr),
        gutter: 9pt,
        ..data.providerQuotas.map(item => quota-card(item)),
      )
    ],
    [
      #eyebrow([Mức sử dụng quan sát theo tác vụ])
      #v(7pt)
      #journey-table()
      #v(12pt)
      #panel([
        #grid(
          columns: (1fr, 1fr, 1fr),
          gutter: 12pt,
          [
            #text(size: 8pt, weight: "semibold")[Token và market]
            #linebreak()
            #text(size: 7pt, fill: muted)[Dễ tái sử dụng hơn giữa nhiều người dùng.]
          ],
          [
            #text(size: 8pt, weight: "semibold")[Wallet]
            #linebreak()
            #text(size: 7pt, fill: muted)[Tỷ lệ cold cao do phụ thuộc địa chỉ.]
          ],
          [
            #text(size: 8pt, weight: "semibold")[AI và Search]
            #linebreak()
            #text(size: 7pt, fill: muted)[Chi phí biến đổi theo token và tool call.]
          ],
        )
      ])
    ],
    takeaway([Provider được rà soát theo quota, throughput và chất lượng dữ liệu của từng hành trình.]),
  )
]

#slide(title: slide-title([Phụ lục · Giả định và nguồn số liệu]))[
  #full-grid(
    rows: (1fr, auto),
    row-gutter: 12pt,
    [
      #grid(
        columns: (1fr, 1fr),
        gutter: 16pt,
        [
          #eyebrow([Giả định kinh doanh])
          #v(8pt)
          #grid(
            rows: (auto, auto, auto, auto),
            row-gutter: 8pt,
            kpi-card([8 phiên], [mỗi MAU mỗi tháng]),
            kpi-card([80% · 15% · 5%], [cơ cấu Lite · Plus · Pro]),
            kpi-card([2% → 3%], [conversion theo độ trưởng thành]),
            kpi-card([25.000 VND], [tỷ giá quy ước cho 1 USD]),
          )
        ],
        [
          #eyebrow([Nguồn và phạm vi])
          #v(8pt)
          #panel([
            #text(size: 8pt, weight: "semibold")[Benchmark kỹ thuật]
            #v(4pt)
            #text(size: 7.3pt, fill: muted)[Cold/warm được đo ngày 19/7; sáu hành trình AI được chạy lại trên năm mẫu ngày 31/7/2026.]
            #v(10pt)
            #text(size: 8pt, weight: "semibold")[Giá dịch vụ]
            #v(4pt)
            #text(size: 7.3pt, fill: muted)[Tài liệu chính thức của provider, Render, Supabase, Resend, Gemini, Brave Search và RunPod.]
            #v(10pt)
            #text(size: 8pt, weight: "semibold")[Conversion]
            #v(4pt)
            #text(size: 7.3pt, fill: muted)[Đối chiếu ChartMogul/ProductLed và Stripe; Yoca dùng mức 2–3% để giữ kịch bản thận trọng.]
            #v(10pt)
            #text(size: 8pt, weight: "semibold")[Công thức]
            #v(4pt)
            #text(size: 7.3pt, fill: muted)[MAU × session × adoption × cold share × đơn vị provider; doanh thu dựa trên payer mix và giá gói.]
          ])
        ],
      )
    ],
    takeaway([Các giả định được giữ tập trung để có thể thay bằng số liệu vận hành mà không đổi cấu trúc mô hình.]),
  )
]
