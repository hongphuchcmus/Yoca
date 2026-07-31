#import "theme.typ": *
#import "@preview/cetz:0.5.2": canvas
#import "@preview/cetz-plot:0.1.4": chart

#let section-label(body) = text(size: 8pt, weight: "semibold", fill: blue, tracking: 0.08em, upper(body))

#let callout(title, body, tone: "blue") = block(
  width: 100%,
  inset: (x: 12pt, y: 10pt),
  fill: if tone == "blue" { layer-alt } else { layer },
  stroke: (left: 2.4pt + if tone == "blue" { blue } else { border }),
)[
  #text(size: 9.5pt, weight: "semibold", fill: if tone == "blue" { blue-dark } else { ink })[#title]
  #v(3pt)
  #text(size: 9pt, fill: muted)[#body]
]

#let metric-card(label, value, note: none) = block(
  width: 100%, inset: 10pt, fill: layer, stroke: 0.45pt + border,
)[
  #text(size: 7.5pt, weight: "semibold", fill: subtle)[#upper(label)]
  #v(4pt)
  #text(size: 16pt, weight: "bold", fill: blue-dark)[#value]
  #if note != none {
    v(3pt)
    text(size: 7.5pt, fill: muted)[#note]
  }
]

#let report-table(columns, header, rows, widths: none) = table(
  columns: if widths == none { columns } else { widths },
  inset: (x: 6pt, y: 5pt),
  stroke: 0.45pt + border,
  fill: (x, y) => if y == 0 { layer } else if calc.rem(y, 2) == 0 { rgb("#fafafa") },
  table.header(..header.map(cell => text(size: 9pt, weight: "semibold", fill: ink)[#cell])),
  ..rows.flatten().map(cell => text(size: 9pt, fill: ink)[#cell]),
)

#let benchmark-chart(items) = {
  let scale = calc.max(..items.map(item => item.coldMs))
  block(width: 100%, inset: (x: 10pt, y: 9pt), fill: white, stroke: 0.45pt + border)[
    #for item in items {
      grid(
        columns: (78pt, 1fr, 39pt), gutter: 7pt, align: horizon,
        text(size: 9pt, weight: "semibold")[#item.name],
        stack(
          dir: ttb,
          spacing: 3pt,
          rect(width: item.coldMs / scale * 100%, height: 7pt, fill: ink),
          rect(width: item.warmMs / scale * 100%, height: 7pt, fill: blue),
        ),
        align(right, stack(
          dir: ttb,
          spacing: 1pt,
          text(size: 8pt, weight: "semibold")[#item.cold],
          text(size: 8pt, weight: "semibold", fill: blue)[#item.warm],
        )),
      )
      v(7pt)
    }
    #grid(
      columns: (auto, auto, auto, auto), gutter: 6pt, align: horizon,
      rect(width: 10pt, height: 7pt, fill: ink), text(size: 8pt, fill: muted)[Cold],
      rect(width: 10pt, height: 7pt, fill: blue), text(size: 8pt, fill: muted)[Warm database],
    )
  ]
}

#let finance-chart(items) = block(
  width: 100%, inset: (x: 10pt, y: 9pt), fill: white,
)[
  #grid(
    columns: (auto, auto, auto, auto), gutter: 6pt, align: horizon,
    rect(width: 10pt, height: 7pt, fill: muted),
    text(size: 8.5pt, fill: muted)[Chi phí trực tiếp],
    rect(width: 10pt, height: 7pt, fill: blue),
    text(size: 8.5pt, fill: muted)[Số dư đóng góp],
  )
  #v(8pt)
  #for item in items {
    grid(
      columns: (58pt, 1fr), gutter: 8pt, align: horizon,
      text(size: 9pt, weight: "semibold")[#item.mau MAU],
      grid(
        columns: (item.costRatio * 1fr, item.margin * 1fr),
        gutter: 0pt,
        rect(width: 100%, height: 18pt, fill: muted),
        rect(width: 100%, height: 18pt, fill: blue),
      ),
    )
    v(7pt)
  }
  #grid(
    columns: (58pt, 1fr), gutter: 8pt,
    [],
    grid(
      columns: (auto, 1fr, auto, 1fr, auto, 1fr, auto, 1fr, auto, 1fr, auto),
      text(size: 8pt, fill: subtle)[0], [],
      text(size: 8pt, fill: subtle)[20], [],
      text(size: 8pt, fill: subtle)[40], [],
      text(size: 8pt, fill: subtle)[60], [],
      text(size: 8pt, fill: subtle)[80], [],
      text(size: 8pt, fill: subtle)[100%],
    ),
  )
]

#let cost-mix-chart(items, labels: true) = canvas(length: 1cm, {
  let total = items.fold(0, (sum, item) => sum + item.amount)
  chart.piechart(
    items.map(item => ([#item.name], item.amount)),
    value-key: 1,
    label-key: none,
    radius: 2.7,
    inner-radius: 1.25,
    stroke: white + 1pt,
    slice-style: items.map(item => rgb(item.color)),
    outer-label: (
      content: (value, label) => if labels {
        text(size: 6pt, weight: "medium")[
          #str(calc.round(value / total * 100, digits: 1))%
        ]
      } else {
        []
      },
      radius: 109%,
    ),
  )
})

#let flow-step(number, title, body) = grid(
  columns: (25pt, 1fr), gutter: 8pt,
  circle(
    width: 22pt, height: 22pt, fill: blue,
    align(center + horizon, text(size: 8pt, weight: "bold", fill: white)[#number]),
  ),
  [
    #text(size: 9pt, weight: "semibold")[#title]
    #linebreak()
    #text(size: 9pt, fill: muted)[#body]
  ],
)

#let profit-chart(items) = block(
  width: 100%, inset: (x: 10pt, y: 9pt), fill: white,
)[
  #grid(
    columns: (auto, auto, auto, auto, auto, auto, auto, auto),
    gutter: 6pt,
    align: horizon,
    rect(width: 10pt, height: 7pt, fill: rgb("#525252")),
    text(size: 8pt, fill: muted)[Chi phí trực tiếp],
    rect(width: 10pt, height: 7pt, fill: rgb("#78a9ff")),
    text(size: 8pt, fill: muted)[Nhân sự],
    rect(width: 10pt, height: 7pt, fill: rgb("#d0e2ff")),
    text(size: 8pt, fill: muted)[Tăng trưởng và vận hành],
    rect(width: 10pt, height: 7pt, fill: blue),
    text(size: 8pt, fill: muted)[Lợi nhuận],
  )
  #v(8pt)
  #for item in items {
    grid(
      columns: (58pt, 1fr), gutter: 8pt, align: horizon,
      text(size: 9pt, weight: "semibold")[#item.mau MAU],
      grid(
        columns: (
          item.directRatio * 1fr,
          item.personnelRatio * 1fr,
          item.reinvestmentRatio * 1fr,
          item.profitMargin * 1fr,
        ),
        gutter: 0pt,
        rect(width: 100%, height: 18pt, fill: rgb("#525252")),
        rect(width: 100%, height: 18pt, fill: rgb("#78a9ff")),
        rect(width: 100%, height: 18pt, fill: rgb("#d0e2ff")),
        rect(width: 100%, height: 18pt, fill: blue),
      ),
    )
    v(7pt)
  }
  #grid(
    columns: (58pt, 1fr), gutter: 8pt,
    [],
    grid(
      columns: (auto, 1fr, auto, 1fr, auto, 1fr, auto, 1fr, auto, 1fr, auto),
      text(size: 8pt, fill: subtle)[0], [],
      text(size: 8pt, fill: subtle)[20], [],
      text(size: 8pt, fill: subtle)[40], [],
      text(size: 8pt, fill: subtle)[60], [],
      text(size: 8pt, fill: subtle)[80], [],
      text(size: 8pt, fill: subtle)[100%],
    ),
  )
]

#let source-note(body) = block(width: 100%, above: 4pt)[
  #text(size: 8pt, fill: subtle)[#emph([Nguồn: #body])]
]
