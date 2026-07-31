#import "theme.typ": *
#import "@preview/cetz:0.5.2": canvas
#import "@preview/cetz-plot:0.1.4": chart

#let eyebrow(body) = text(
  size: 8.5pt,
  weight: "semibold",
  fill: accent,
  tracking: 0.1em,
  upper(body),
)

#let takeaway(body) = block(
  width: 100%,
  inset: (x: 12pt, y: 7pt),
  radius: panel-radius,
  fill: panel-gradient,
)[#text(size: 9.5pt, weight: "semibold", fill: text-on-color)[#body]]

#let full-grid(content-height: 348pt, ..args) = block(
  width: 100%,
  height: content-height,
)[#grid(..args)]

#let panel(body, fill: layer-1, inset: 11pt) = block(
  width: 100%,
  inset: inset,
  radius: panel-radius,
  fill: fill,
)[#body]

#let icon-label(icon, label, detail: none) = grid(
  columns: (20pt, 1fr),
  gutter: 7pt,
  align: horizon,
  image(icon, width: 18pt, height: 18pt, fit: "contain"),
  [
    #text(size: 9.5pt, weight: "semibold")[#label]
    #if detail != none {
      linebreak()
      text(size: 7pt, fill: muted)[#detail]
    }
  ],
)

#let product-flow() = block(width: 100%)[
  #eyebrow([Hành trình tạo giá trị])
  #v(7pt)
  #grid(
    columns: (1fr, auto, 1fr, auto, 1fr, auto, 1.25fr),
    gutter: 8pt,
    align: horizon,
    icon-label("assets/chart-line.svg", [Market], detail: [khám phá]),
    text(size: 13pt, fill: accent)[→],
    icon-label("assets/currency-dollar.svg", [Token], detail: [đánh giá]),
    text(size: 13pt, fill: accent)[→],
    icon-label("assets/wallet.svg", [Wallet], detail: [phân tích]),
    text(size: 13pt, fill: accent)[→],
    icon-label("assets/data-analytics.svg", [Wash Trading & AI], detail: [diễn giải]),
  )
]

#let tier-card(name, price, audience, benefit, free: false) = block(
  width: 100%,
  height: 108pt,
  inset: 10pt,
  radius: panel-radius,
  fill: if free { layer-1 } else { panel-gradient },
)[
  #text(size: 8pt, weight: "semibold", fill: if free { muted } else { highlight })[#upper(name)]
  #v(5pt)
  #text(size: 21pt, weight: "bold", fill: if free { ink } else { white })[#price]
  #v(6pt)
  #text(size: 8pt, weight: "semibold", fill: if free { ink } else { white })[#audience]
  #v(4pt)
  #text(size: 7pt, fill: if free { muted } else { highlight })[#benefit]
]

#let conversion-card(mau, conversion, paid) = panel([
  #grid(
    columns: (1fr, auto),
    gutter: 8pt,
    align: horizon,
    [
      #text(size: 8pt, weight: "semibold")[#mau MAU]
      #linebreak()
      #text(size: 6.7pt, fill: muted)[#paid người trả phí]
    ],
    text(size: 18pt, weight: "bold", fill: accent)[#conversion],
  )
], inset: 9pt)

#let latency-row(item) = block(width: 100%)[
  #grid(
    columns: (1fr, auto),
    gutter: 8pt,
    align: horizon,
    text(size: 9pt, weight: "semibold")[#item.name],
    text(size: 8pt, weight: "bold", fill: accent)[#item.speedup],
  )
  #v(4pt)
  #grid(
    columns: (30pt, 1fr, 42pt),
    gutter: 5pt,
    align: horizon,
    text(size: 7pt, fill: muted)[Cold],
    align(left, rect(width: item.coldMs / 25440 * 100%, height: 7pt, fill: background-inverse)),
    align(right, text(size: 7pt, weight: "semibold")[#item.cold]),
    text(size: 7pt, fill: muted)[Warm],
    align(left, rect(width: item.warmMs / 25440 * 100%, height: 7pt, fill: accent)),
    align(right, text(size: 7pt, weight: "semibold", fill: accent)[#item.warm]),
  )
]

#let cost-pipeline() = block(width: 100%)[
  #eyebrow([Luồng đọc dữ liệu])
  #v(5pt)
  #grid(
    columns: (1fr, auto, 1fr, auto, 1fr),
    gutter: 6pt,
    align: horizon,
    panel([
      #text(size: 8.5pt, weight: "semibold")[Hành trình]
      #linebreak()
      #text(size: 6.8pt, fill: muted)[Market · Token · Wallet]
    ], inset: 8pt),
    text(size: 12pt, fill: accent)[→],
    panel([
      #text(size: 8.5pt, weight: "semibold")[PostgreSQL]
      #linebreak()
      #text(size: 6.8pt, fill: muted)[đọc dữ liệu trước]
    ], inset: 8pt),
    text(size: 12pt, fill: accent)[→],
    panel([
      #text(size: 8.5pt, weight: "semibold")[Provider]
      #linebreak()
      #text(size: 6.8pt, fill: muted)[chỉ gọi khi cần làm mới]
    ], inset: 8pt),
  )
  #v(5pt)
  #panel([
    #grid(
      columns: (1fr, 1fr),
      gutter: 10pt,
      [
        #text(size: 7.5pt, weight: "semibold", fill: accent)[WARM]
        #h(4pt)
        #text(size: 6.7pt, fill: muted)[dùng dữ liệu còn hiệu lực]
      ],
      [
        #text(size: 7.5pt, weight: "semibold")[COLD]
        #h(4pt)
        #text(size: 6.7pt, fill: muted)[làm mới rồi lưu lại]
      ],
    )
  ], inset: 7pt)
]

#let journey-table() = table(
  columns: (1.35fr, 1.2fr, 1fr),
  inset: (x: 7pt, y: 6pt),
  stroke: 0.5pt + border-subtle,
  fill: (x, y) => if y == 0 { layer-1 },
  table.header(
    text(size: 7.5pt, weight: "semibold")[Hành trình],
    text(size: 7.5pt, weight: "semibold")[Provider],
    text(size: 7.5pt, weight: "semibold")[Đơn vị/lần],
  ),
  text(size: 7.5pt, weight: "semibold")[Market Radar],
  text(size: 7pt)[CoinGecko · Birdeye],
  text(size: 7pt, fill: accent)[17 credits · 135 CU],
  text(size: 7.5pt, weight: "semibold")[Token Overview],
  text(size: 7pt)[CoinGecko · Mobula],
  text(size: 7pt, fill: accent)[15 credits · 1 credit],
  text(size: 7.5pt, weight: "semibold")[Wallet Core],
  text(size: 7pt)[Mobula · Helius],
  text(size: 7pt, fill: accent)[21 credits · 100 credits],
)

#let cost-donut(items) = canvas(length: 1cm, {
  let total = items.fold(0, (sum, item) => sum + item.amount)
  chart.piechart(
    items.map(item => ([#item.name], item.amount)),
    value-key: 1,
    label-key: none,
    radius: 2.35,
    inner-radius: 1.05,
    stroke: white + 1pt,
    slice-style: items.map(item => rgb(item.color)),
    outer-label: (
      content: (value, label) => text(size: 5.8pt, weight: "semibold")[
        #str(calc.round(value / total * 100, digits: 1))%
      ],
      radius: 109%,
    ),
  )
})

#let cost-legend(item) = grid(
  columns: (8pt, 1fr, auto, auto),
  gutter: 6pt,
  align: horizon,
  rect(width: 8pt, height: 8pt, fill: rgb(item.color)),
  text(size: 7.3pt, fill: muted)[#item.name],
  text(size: 7.3pt, weight: "semibold")[#item.value],
  text(size: 7.3pt, weight: "semibold", fill: accent)[#item.share],
)

#let cost-panel(title, total, items) = panel([
  #eyebrow(title)
  #v(4pt)
  #grid(
    columns: (0.9fr, 1.1fr),
    gutter: 10pt,
    align: horizon,
    box(width: 140pt, height: 140pt)[#cost-donut(items)],
    [
      #text(size: 18pt, weight: "bold")[#total]
      #linebreak()
      #text(size: 7pt, fill: muted)[chi phí trực tiếp/tháng]
      #v(9pt)
      #grid(
        rows: items.map(_ => auto),
        row-gutter: 6pt,
        ..items.map(item => cost-legend(item)),
      )
    ],
  )
], fill: white)

#let ai-model-card(title, model, lines, inverse: false) = block(
  width: 100%,
  height: 160pt,
  inset: 13pt,
  radius: panel-radius,
  fill: if inverse { panel-gradient } else { layer-1 },
)[
  #text(size: 8pt, weight: "semibold", fill: if inverse { highlight } else { accent })[#upper(title)]
  #v(7pt)
  #text(size: 17pt, weight: "bold", fill: if inverse { white } else { ink })[#model]
  #v(9pt)
  #for line in lines {
    grid(
      columns: (8pt, 1fr),
      gutter: 5pt,
      text(size: 8pt, fill: if inverse { highlight } else { accent })[•],
      text(size: 8pt, fill: if inverse { white } else { muted })[#line],
    )
    v(5pt)
  }
]

#let kpi-card(value, label) = panel([
  #text(size: 16pt, weight: "bold", fill: accent)[#value]
  #v(3pt)
  #text(size: 7pt, fill: muted)[#label]
], inset: 9pt)

#let finance-bars(items) = block(width: 100%)[
  #grid(
    columns: (auto, auto, auto, auto, auto, auto, auto, auto),
    gutter: 6pt,
    align: horizon,
    rect(width: 8pt, height: 8pt, fill: background-inverse),
    text(size: 7pt, fill: muted)[Trực tiếp],
    rect(width: 8pt, height: 8pt, fill: rgb("#78a9ff")),
    text(size: 7pt, fill: muted)[Nhân sự],
    rect(width: 8pt, height: 8pt, fill: rgb("#d0e2ff")),
    text(size: 7pt, fill: muted)[Tăng trưởng/vận hành],
    rect(width: 8pt, height: 8pt, fill: accent),
    text(size: 7pt, fill: muted)[Lợi nhuận],
  )
  #v(9pt)
  #for item in items {
    grid(
      columns: (64pt, 1fr, 42pt),
      gutter: 8pt,
      align: horizon,
      text(size: 8.5pt, weight: "semibold")[#item.mau MAU],
      grid(
        columns: (
          item.directRatio * 1fr,
          item.personnelRatio * 1fr,
          item.reinvestmentRatio * 1fr,
          item.profitMargin * 1fr,
        ),
        gutter: 0pt,
        rect(width: 100%, height: 20pt, fill: background-inverse),
        rect(width: 100%, height: 20pt, fill: rgb("#78a9ff")),
        rect(width: 100%, height: 20pt, fill: rgb("#d0e2ff")),
        rect(width: 100%, height: 20pt, fill: accent),
      ),
      text(size: 8pt, weight: "bold", fill: accent)[#str(item.profitMargin)%],
    )
    v(8pt)
  }
]

#let finance-table(items) = table(
  columns: (0.75fr, 0.7fr, 0.85fr, 1fr, 1fr, 1fr, 0.9fr),
  inset: (x: 7pt, y: 6pt),
  stroke: 0.5pt + border-subtle,
  fill: (x, y) => if y == 0 { layer-1 },
  table.header(
    text(size: 7.3pt, weight: "semibold")[MAU],
    text(size: 7.3pt, weight: "semibold")[Conv.],
    text(size: 7.3pt, weight: "semibold")[Trả phí],
    text(size: 7.3pt, weight: "semibold")[Doanh thu],
    text(size: 7.3pt, weight: "semibold")[Trực tiếp],
    text(size: 7.3pt, weight: "semibold")[Tổng chi],
    text(size: 7.3pt, weight: "semibold")[Lợi nhuận],
  ),
  ..items.map(item => (
    item.mau,
    item.conversion,
    item.paidUsers,
    item.revenue,
    item.directCost,
    item.totalCost,
    item.profit,
  )).flatten().map(cell => text(size: 7.5pt)[#cell]),
)

#let scale-stage(mau, title, infrastructure, people, salary, focus) = block(
  width: 100%,
  height: 176pt,
  inset: 11pt,
  radius: panel-radius,
  fill: layer-1,
)[
  #text(size: 8pt, weight: "semibold", fill: accent)[#mau MAU]
  #v(5pt)
  #text(size: 15pt, weight: "bold")[#title]
  #v(9pt)
  #text(size: 7pt, fill: muted)[HẠ TẦNG]
  #linebreak()
  #text(size: 8pt, weight: "semibold")[#infrastructure]
  #v(8pt)
  #text(size: 7pt, fill: muted)[NHÂN SỰ]
  #linebreak()
  #text(size: 8pt, weight: "semibold")[#people]
  #linebreak()
  #text(size: 7pt, fill: muted)[#salary]
  #v(8pt)
  #text(size: 7pt, fill: muted)[TRỌNG TÂM]
  #linebreak()
  #text(size: 8pt, weight: "semibold")[#focus]
]

#let quota-card(item) = panel([
  #grid(
    columns: (1fr, auto),
    gutter: 7pt,
    text(size: 8.5pt, weight: "semibold")[#item.name],
    text(size: 7pt, weight: "semibold", fill: accent)[#item.plan],
  )
  #v(5pt)
  #text(size: 7pt, fill: muted)[#item.quota]
], inset: 9pt)
