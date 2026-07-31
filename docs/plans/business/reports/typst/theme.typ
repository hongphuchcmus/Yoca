#let ink = rgb("#161616")
#let muted = rgb("#525252")
#let subtle = rgb("#6f6f6f")
#let border = rgb("#c6c6c6")
#let layer = rgb("#f4f4f4")
#let layer-alt = rgb("#e8f1ff")
#let blue = rgb("#0f62fe")
#let blue-dark = rgb("#0043ce")
#let blue-soft = rgb("#d0e2ff")
#let violet = rgb("#8a3ffc")
#let white = rgb("#ffffff")

#let report-theme(title: none, author: none, body) = {
  set document(title: title, author: author)
  set page(
    paper: "a4",
    margin: 20mm,
    header-ascent: 11mm,
    footer-descent: 10mm,
    header: context {
      if counter(page).get().first() > 1 {
        set text(size: 8pt, fill: subtle)
        grid(
          columns: (1fr, auto),
          [YOCA · MÔ HÌNH KINH DOANH],
          [Báo cáo phân tích],
        )
        v(2pt)
        line(length: 100%, stroke: 0.45pt + border)
      }
    },
    footer: context {
      if counter(page).get().first() > 1 {
        line(length: 100%, stroke: 0.45pt + border)
        v(3pt)
        set text(size: 8pt, fill: subtle)
        grid(
          columns: (1fr, auto),
          [Đồ án tốt nghiệp · 2026],
          [#counter(page).display("1 / 1", both: true)],
        )
      }
    },
  )
  set text(font: ("IBM Plex Sans", "Noto Sans", "Liberation Sans"), lang: "vi", size: 11pt, fill: ink)
  set par(justify: true, leading: 0.8em, spacing: 0.95em)
  set heading(numbering: "1.1")
  set figure(gap: 6pt)
  show heading.where(level: 1): it => block(
    above: 12pt, below: 7pt, breakable: false,
  )[
    #text(size: 17pt, weight: "semibold", fill: ink)[
      #if it.numbering != none {
        context counter(heading).display(it.numbering)
        h(7pt)
      }
      #it.body
    ]
    #v(2pt)
    #line(length: 46pt, stroke: 2pt + blue)
  ]
  show heading.where(level: 2): it => block(
    above: 10pt, below: 16pt, breakable: false,
  )[
    #text(size: 12.5pt, weight: "semibold", fill: blue-dark)[
      #if it.numbering != none {
        context counter(heading).display(it.numbering)
        h(6pt)
      }
      #it.body
    ]
  ]
  show heading.where(level: 3): it => block(
    above: 9pt, below: 3pt, breakable: false,
  )[
    #text(size: 10.5pt, weight: "semibold")[
      #if it.numbering != none {
        context counter(heading).display(it.numbering)
        h(5pt)
      }
      #it.body
    ]
  ]
  show figure.caption: it => {
    set text(size: 9pt, fill: muted)
    it
  }
  show figure: set block(above: 9pt, below: 8pt)
  show cite: set text(fill: blue-dark)
  show link: set text(fill: blue-dark)
  body
}
