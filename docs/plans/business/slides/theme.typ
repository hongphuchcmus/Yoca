#import "@preview/touying:0.7.4": *
#import themes.metropolis: *

#let ink = rgb("#161616")
#let muted = rgb("#525252")
#let accent = rgb("#0f62fe")
#let text-on-color = white
#let layer-1 = rgb("#f4f4f4")
#let layer-2 = white
#let layer-accent = rgb("#e0e0e0")
#let highlight = rgb("#d0e2ff")
#let background-inverse = rgb("#393939")
#let cost-color = rgb("#a8a8a8")
#let border-subtle = rgb("#c6c6c6")
#let border-subtle-light = rgb("#e0e0e0")
#let panel-radius = 2pt
#let small-radius = 1pt
#let panel-gradient = gradient.linear(rgb("#3f82ff"),accent, angle: 45deg)
#let slide-title(body) = text(size: 25pt, weight: "medium")[#body]

#let deck-theme = metropolis-theme.with(
  aspect-ratio: "16-9",
  align: top,
  header-right: none,
  footer: grid(
    columns: (21pt, auto),
    gutter: 6pt,
    align: horizon,
    image("assets/yoca-logo.png", width: 20pt),
    text(size: 10.5pt, weight: "semibold")[YOCA · MÔ HÌNH KINH DOANH · 2026],
  ),
  footer-right: context text(size: 11.5pt, weight: "semibold")[
    #utils.slide-counter.display() / #utils.last-slide-number
  ],
  footer-progress: true,
  config-page(
    header-ascent: 38%,
    footer-descent: 38%,
    margin: (top: 3.6em, bottom: 2.2em, x: 2em),
  ),
  config-common(
    breakable: false,
    detect-overflow: true,
    new-section-slide-fn: none,
  ),
  config-colors(
    primary: accent,
    primary-light: highlight,
    secondary: ink,
    neutral-lightest: white,
    neutral-dark: muted,
    neutral-darkest: ink,
  ),
  config-info(
    title: [Mô hình kinh doanh Yoca],
    author: [Nhóm phát triển Yoca],
  ),
)
