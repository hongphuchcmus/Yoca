import type {
  ChatResponse,
  ChatToolResult,
  WalletChatSection,
  WalletChatEvidence,
  WalletWarning,
  WalletConfidence,
} from "./chat.types.js";
import type { WalletChatIntent } from "./chat-intent.js";
import { toolNameToEvidenceType } from "./chat-intent.js";

export const WALLET_CHAT_RESPONSE_LIMITS = {
  tldrItems: 3,
  tldrBulletChars: 300,
  sectionItems: 6,
  sectionTitleChars: 100,
  sectionContentChars: 1000,
  sectionBulletItems: 6,
  sectionBulletChars: 500,
  evidenceItems: 8,
  evidenceLabelChars: 120,
  evidenceValueChars: 200,
  warningItems: 4,
  disclaimerChars: 400,
} as const;

function compactCurrency(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(number) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(number) >= 1 ? 2 : 8,
  }).format(number);
}

function percent(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "unavailable";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function findResult(
  results: ChatToolResult[],
  name: string,
): Record<string, unknown> | null {
  const r = results.find((res) => res.name === name);
  if (!r || r.error || r.data == null) return null;
  if (typeof r.data === "object" && !Array.isArray(r.data)) {
    return r.data as Record<string, unknown>;
  }
  return null;
}

function findResultArray(
  results: ChatToolResult[],
  name: string,
): unknown[] {
  const r = results.find((res) => res.name === name);
  if (!r || r.error) return [];
  if (Array.isArray(r.data)) return r.data;
  if (r.data && typeof r.data === "object") {
    const d = r.data as Record<string, unknown>;
    if (Array.isArray(d.points)) return d.points;
    if (Array.isArray(d.swaps)) return d.swaps;
    if (Array.isArray(d.transfers)) return d.transfers;
  }
  return [];
}

// ─── Comparison Helpers ─────────────────────────────────────────────────

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function getAddressesFromResults(results: ChatToolResult[]): string[] | null {
  for (const r of results) {
    const addrs = (r.input as Record<string, unknown>).addresses;
    if (Array.isArray(addrs) && addrs.length > 1) {
      return addrs as string[];
    }
  }
  const addrSet = new Set<string>();
  for (const r of results) {
    const addr = (r.input as Record<string, unknown>).address as string | undefined;
    if (addr) addrSet.add(addr);
  }
  return addrSet.size > 1 ? [...addrSet] : null;
}

function extractDataForAddress(
  result: ChatToolResult | null | undefined,
  address: string,
): Record<string, unknown> | null {
  if (!result || result.error) return null;
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return null;
  if (data[address] && typeof data[address] === "object") {
    return data[address] as Record<string, unknown>;
  }
  return data;
}

function extractArrayForAddress(
  result: ChatToolResult | null | undefined,
  address: string,
): unknown[] {
  if (!result || result.error) return [];
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return [];
  const addrData = data[address];
  if (Array.isArray(addrData)) return addrData;
  if (addrData && typeof addrData === "object") {
    const d = addrData as Record<string, unknown>;
    if (Array.isArray(d.points)) return d.points;
    if (Array.isArray(d.swaps)) return d.swaps;
    if (Array.isArray(d.transfers)) return d.transfers;
  }
  return [];
}

function findResultByName(results: ChatToolResult[], name: string): ChatToolResult | null {
  return results.find((r) => r.name === name) ?? null;
}

function topPortfolioLabel(portfolio: unknown[]): string {
  if (portfolio.length === 0) return "none";
  const top = portfolio[0] as Record<string, unknown> | undefined;
  if (!top) return "none";
  return String(top.token ?? top.symbol ?? top.name ?? "unknown");
}

function winRateText(
  pnlData: Record<string, unknown> | null,
  language: "en" | "vi",
): string {
  if (!pnlData) return language === "vi" ? "chưa có dữ liệu" : "no PnL data";
  const rate = finiteNumber(pnlData.winRate);
  const trades = finiteNumber(pnlData.tradeCount);
  if (rate == null || trades == null) {
    return language === "vi" ? "chưa có dữ liệu PnL" : "PnL data unavailable";
  }
  if (language === "vi") {
    return `${trades} giao d?ch, t? l? th?ng ${percent(rate)}`;
  }
  return `${trades} trades, ${percent(rate)} win rate`;
}

function pnlValueText(
  pnlData: Record<string, unknown> | null,
  language: "en" | "vi",
): string {
  if (!pnlData) return language === "vi" ? "chưa có" : "unavailable";
  const realized = finiteNumber(pnlData.realizedPnlUsd);
  if (realized == null) return language === "vi" ? "chưa có" : "unavailable";
  return compactCurrency(realized);
}

function buildOverviewSections(
  overview: Record<string, unknown> | null,
  portfolio: unknown[],
  language: "en" | "vi",
): WalletChatSection[] {
  const balance = compactCurrency(overview?.totalBalance);
  const holdings = overview?.holdingsCount ?? "?";
  const volume = compactCurrency(overview?.tradingVolume24h);
  const pnl = compactCurrency(overview?.pnlTotal);
  const topToken = topPortfolioLabel(portfolio);

  const snapshotBullets = [
    language === "vi"
      ? `S? d? ví: ${balance}, n?m gi? ${holdings} token.`
      : `Wallet balance: ${balance}, holding ${holdings} tokens.`,
    language === "vi"
      ? `Kh?i l??ng giao d?ch 24h: ${volume}.`
      : `24h trading volume: ${volume}.`,
    language === "vi"
      ? `T?ng PnL th?c t?: ${pnl}.`
      : `Total realized PnL: ${pnl}.`,
  ];

  const topTokenText =
    portfolio.length > 0
      ? language === "vi"
        ? `Token l?n nh?t: ${topToken}.`
        : `Top token by value: ${topToken}.`
      : language === "vi"
        ? "Ch?a có d? li?u danh m?c token."
        : "No portfolio breakdown available.";

  return [
    {
      title: language === "vi" ? "T?ng Quan" : "Market Snapshot",
      kind: "market_snapshot",
      bullets: snapshotBullets,
    },
    {
      title: language === "vi" ? "Phát Hi?n Chính" : "Key Findings",
      kind: "key_findings",
      bullets: [topTokenText],
    },
    {
      title: language === "vi" ? "Theo Dõi" : "What To Watch",
      kind: "what_to_watch",
      bullets: [
        language === "vi"
          ? "Giám sát kh?i l??ng và s? d? thay ??i theo th?i gian."
          : "Monitor volume and balance changes over time.",
        language === "vi"
          ? "Ki?m tra các token m?i xu?t hi?n trong danh m?c."
          : "Watch for new tokens appearing in the portfolio.",
      ],
    },
  ];
}

function buildPnlSections(
  pnlData: Record<string, unknown> | null,
  overview: Record<string, unknown> | null,
  language: "en" | "vi",
): WalletChatSection[] {
  const realized = pnlValueText(pnlData, language);
  const winRate = winRateText(pnlData, language);
  const topProfitable = pnlData?.topProfitable
    ? String((pnlData.topProfitable as Record<string, unknown>).token ?? "?")
    : null;
  const topLoser = pnlData?.topLoser
    ? String((pnlData.topLoser as Record<string, unknown>).token ?? "?")
    : null;
  const totalBought = compactCurrency(pnlData?.totalBoughtUsd);
  const totalSold = compactCurrency(pnlData?.totalSoldUsd);
  const tradeCount = finiteNumber(pnlData?.tradeCount);

  const summaryBullets = [
    language === "vi"
      ? `PnL th?c t?: ${realized}.`
      : `Realized PnL: ${realized}.`,
    language === "vi" ? `Th?ng kê: ${winRate}.` : `Stats: ${winRate}.`,
    language === "vi"
      ? `T?ng mua: ${totalBought}, t?ng bán: ${totalSold}.`
      : `Total bought: ${totalBought}, total sold: ${totalSold}.`,
  ];

  const bestWorst: string[] = [];
  if (topProfitable) {
    bestWorst.push(
      language === "vi"
        ? `Sinh l?i nh?t: ${topProfitable}.`
        : `Most profitable: ${topProfitable}.`,
    );
  }
  if (topLoser) {
    bestWorst.push(
      language === "vi"
        ? `L? l?n nh?t: ${topLoser}.`
        : `Biggest loser: ${topLoser}.`,
    );
  }

  let balanceChange: string | null = null;
  if (overview?.totalBalance != null) {
    balanceChange = language === "vi"
      ? `S? d? hi?n t?i: ${compactCurrency(overview.totalBalance)}.`
      : `Current balance: ${compactCurrency(overview.totalBalance)}.`;
  }

  return [
    {
      title: language === "vi" ? "T?ng Quan PnL" : "PnL Summary",
      kind: "pnl_summary",
      bullets: summaryBullets,
    },
    ...(bestWorst.length > 0
      ? [
          {
            title: language === "vi" ? "T?t Nh?t / T? Nh?t" : "Best & Worst",
            kind: "key_findings" as const,
            bullets: bestWorst,
          },
        ]
      : []),
    ...(balanceChange
      ? [
          {
            title: language === "vi" ? "K?t Lu?n" : "Conclusion",
            kind: "conclusion" as const,
            content: language === "vi"
              ? `T?ng s? giao d?ch: ${tradeCount ?? "?"}. ${balanceChange}`
              : `Total trades: ${tradeCount ?? "?"}. ${balanceChange}`,
          },
        ]
      : []),
  ];
}

function buildTradesSections(
  swaps: unknown[],
  transfers: unknown[],
  language: "en" | "vi",
): WalletChatSection[] {
  const swapCount = swaps.length;
  const transferCount = transfers.length;
  const totalValue = swaps.reduce<number>((sum: number, s) => {
    const v = finiteNumber((s as Record<string, unknown>).totalValueUsd);
    return sum + (v ?? 0);
  }, 0);

  const recentSwaps = swaps.slice(0, 5).map((s) => {
    const swap = s as Record<string, unknown>;
    return language === "vi"
      ? `${swap.dex ?? "?"}: ${compactCurrency(swap.totalValueUsd)} (${swap.timestamp ?? ""})`
      : `${swap.dex ?? "?"} swap ${compactCurrency(swap.totalValueUsd)} (${swap.timestamp ?? ""})`;
  });

  return [
    {
      title: language === "vi" ? "Ho?t ??ng Giao D?ch" : "Trading Activity",
      kind: "trading_activity",
      bullets: [
        language === "vi"
          ? `${swapCount} swap, ${transferCount} transfer, t?ng giá tr? ${compactCurrency(totalValue)}.`
          : `${swapCount} swaps, ${transferCount} transfers, total value ${compactCurrency(totalValue)}.`,
        ...recentSwaps,
      ],
    },
    {
      title: language === "vi" ? "Phát Hi?n Chính" : "Key Findings",
      kind: "key_findings",
      bullets: [
        swapCount === 0
          ? (language === "vi" ? "Không có swap nào g?n ?ây." : "No recent swaps found.")
          : (language === "vi"
              ? `${swapCount} swap g?n ?ây v?i t?ng giá tr? ${compactCurrency(totalValue)}.`
              : `${swapCount} recent swaps totaling ${compactCurrency(totalValue)}.`),
      ],
    },
  ];
}

function buildPortfolioSections(
  portfolio: unknown[],
  overview: Record<string, unknown> | null,
  language: "en" | "vi",
): WalletChatSection[] {
  const top = portfolio.slice(0, 5).map((item) => {
    const p = item as Record<string, unknown>;
    return `${p.token ?? p.symbol ?? "?"}: ${compactCurrency(p.valueUsd)}${p.change24h != null ? ` (${percent(p.change24h)})` : ""}`;
  });

  return [
    {
      title: language === "vi" ? "Top N?m Gi?" : "Top Holdings",
      kind: "top_holdings",
      bullets:
        top.length > 0
          ? top
          : [
              language === "vi"
                ? "Không có token nào trong danh m?c."
                : "No tokens in portfolio.",
            ],
    },
    ...(overview
      ? [
          {
            title: language === "vi" ? "T?ng Quan" : "Market Snapshot",
            kind: "market_snapshot" as const,
            bullets: [
              language === "vi"
                ? `T?ng s? d? danh m?c: ${compactCurrency(overview.totalBalance)}.`
                : `Total portfolio balance: ${compactCurrency(overview.totalBalance)}.`,
              language === "vi"
                ? `S? token: ${portfolio.length}.`
                : `Token count: ${portfolio.length}.`,
            ],
          },
        ]
      : []),
  ];
}

function buildBalanceTrendSections(
  points: unknown[],
  language: "en" | "vi",
): WalletChatSection[] {
  if (points.length === 0) {
    return [
      {
        title: language === "vi" ? "Xu H??ng S? D?" : "Balance Trend",
        kind: "market_snapshot",
        bullets: [
          language === "vi"
            ? "Ch?a có d? li?u l?ch s? s? d?."
            : "No balance history data available.",
        ],
      },
    ];
  }

  const first = points[0] as Record<string, unknown> | undefined;
  const last = points[points.length - 1] as Record<string, unknown> | undefined;
  const startVal = finiteNumber(first?.value);
  const endVal = finiteNumber(last?.value);
  const change =
    startVal != null && endVal != null ? endVal - startVal : null;

  return [
    {
      title: language === "vi" ? "Xu H??ng S? D?" : "Balance Trend",
      kind: "market_snapshot",
      bullets: [
        language === "vi"
          ? `${points.length} ?i?m d? li?u t? ${first?.date ?? "?"} ??n ${last?.date ?? "?"}.`
          : `${points.length} data points from ${first?.date ?? "?"} to ${last?.date ?? "?"}.`,
        change != null
          ? (language === "vi"
              ? `Bi?n ??ng: ${compactCurrency(endVal)} (${change >= 0 ? "+" : ""}${compactCurrency(change)}).`
              : `Change: ${compactCurrency(endVal)} (${change >= 0 ? "+" : ""}${compactCurrency(change)}).`)
          : (language === "vi" ? "Không th? tính bi?n ??ng." : "Change unavailable."),
      ],
    },
    {
      title: language === "vi" ? "K?t Lu?n" : "Conclusion",
      kind: "conclusion",
      content: language === "vi"
        ? `S? d? ?i t? ${compactCurrency(startVal)} ??n ${compactCurrency(endVal)} qua ${points.length} ?i?m.`
        : `Balance moved from ${compactCurrency(startVal)} to ${compactCurrency(endVal)} over ${points.length} points.`,
    },
  ];
}

function buildVolumeTrendSections(
  volumeData: unknown[],
  language: "en" | "vi",
): WalletChatSection[] {
  if (volumeData.length === 0) {
    return [
      {
        title: language === "vi" ? "Kh?i L??ng Giao D?ch" : "Trading Volume",
        kind: "trading_activity",
        bullets: [
          language === "vi"
            ? "Ch?a có d? li?u kh?i l??ng."
            : "No volume data available.",
        ],
      },
    ];
  }

  const totalVolume = volumeData.reduce<number>((sum: number, item) => {
    const v = finiteNumber((item as Record<string, unknown>).volume);
    return sum + (v ?? 0);
  }, 0);

  return [
    {
      title: language === "vi" ? "Kh?i L??ng Giao D?ch" : "Trading Volume",
      kind: "trading_activity",
      bullets: [
        language === "vi"
          ? `${volumeData.length} ngày d? li?u, t?ng kh?i l??ng ${compactCurrency(totalVolume)}.`
          : `${volumeData.length} days of data, total volume ${compactCurrency(totalVolume)}.`,
      ],
    },
    {
      title: language === "vi" ? "K?t Lu?n" : "Conclusion",
      kind: "conclusion",
      content: language === "vi"
        ? `Trung bình ${compactCurrency(totalVolume / volumeData.length)}/ngày.`
        : `Average ${compactCurrency(totalVolume / volumeData.length)}/day.`,
    },
  ];
}

function buildRiskSections(
  overview: Record<string, unknown> | null,
  pnlData: Record<string, unknown> | null,
  portfolio: unknown[],
  swaps: unknown[],
  language: "en" | "vi",
): WalletChatSection[] {
  const concentration =
    portfolio.length > 0
      ? (() => {
          const total = portfolio.reduce<number>((sum: number, item) => {
            const v = finiteNumber((item as Record<string, unknown>).valueUsd);
            return sum + (v ?? 0);
          }, 0);
          if (total <= 0) return null;
          const top = portfolio[0] as Record<string, unknown> | undefined;
          const topVal = finiteNumber(top?.valueUsd);
          if (topVal == null) return null;
          return percent((topVal / total) * 100);
        })()
      : null;

  const riskBullets: string[] = [];
  if (concentration) {
    riskBullets.push(
      language === "vi"
        ? `T?p trung cao: token l?n nh?t chi?m ${concentration} danh m?c.`
        : `Concentration risk: top token is ${concentration} of portfolio.`,
    );
  }
  const realized = finiteNumber(pnlData?.realizedPnlUsd);
  if (realized != null && realized < 0) {
    riskBullets.push(
      language === "vi"
        ? `PnL ?m: l? ${compactCurrency(Math.abs(realized))}.`
        : `Negative PnL: loss of ${compactCurrency(Math.abs(realized))}.`,
    );
  }
  if (swaps.length === 0 && portfolio.length > 0) {
    riskBullets.push(
      language === "vi"
        ? "Không có ho?t ??ng swap g?n ?ây — có th? là ví không ho?t ??ng."
        : "No recent swap activity — wallet may be inactive.",
    );
  }
  if (riskBullets.length === 0) {
    riskBullets.push(
      language === "vi"
        ? "Không phát hi?n r?i ro ??ng k? t? d? li?u hi?n có."
        : "No significant risk signals detected from available data.",
    );
  }

  return [
    {
      title: language === "vi" ? "Y?u T? R?i Ro" : "Risk Factors",
      kind: "risk_factors",
      bullets: riskBullets,
    },
    {
      title: language === "vi" ? "Theo Dõi" : "What To Watch",
      kind: "what_to_watch",
      bullets: [
        language === "vi"
          ? "Giám sát thay ??i t?p trung danh m?c và t?n su?t giao d?ch."
          : "Monitor concentration changes and trading frequency.",
        language === "vi"
          ? "Ki?m tra PnL và kh?i l??ng ?? phát hi?n xu h??ng."
          : "Check PnL and volume trends for direction changes.",
      ],
    },
  ];
}

// ─── Comparison Sections ────────────────────────────────────────────────

function buildMetricsComparisonTable(
  perAddress: Record<string, {
    overview: Record<string, unknown> | null;
    pnl: Record<string, unknown> | null;
    portfolio: unknown[];
  }>,
  language: "en" | "vi",
): WalletChatSection {
  const rows: Array<Record<string, string | number | null>> = [];

  for (const [addr, data] of Object.entries(perAddress)) {
    const label = shortenAddress(addr);
    const balance = data.overview?.totalBalance != null
      ? Number(data.overview.totalBalance)
      : null;
    const volume = data.overview?.tradingVolume24h != null
      ? Number(data.overview.tradingVolume24h)
      : null;
    const pnl = data.pnl?.realizedPnlUsd != null
      ? Number(data.pnl.realizedPnlUsd)
      : null;
    const winRate = data.pnl?.winRate != null
      ? Number(data.pnl.winRate)
      : null;
    const holdings = data.overview?.holdingsCount != null
      ? Number(data.overview.holdingsCount)
      : (data.portfolio.length > 0 ? data.portfolio.length : null);

    rows.push({
      wallet: label,
      balance,
      volume24h: volume,
      realizedPnl: pnl,
      winRate,
      holdings,
    });
  }

  return {
    title: language === "vi" ? "So Sánh Chỉ Số" : "Metrics Comparison",
    kind: "key_findings",
    table: rows.length > 0 ? rows : undefined,
    bullets: rows.length === 0
      ? [language === "vi" ? "Không có dữ liệu so sánh." : "No comparison data available."]
      : undefined,
  };
}

function buildHoldingsComparisonSection(
  perAddress: Record<string, {
    overview: Record<string, unknown> | null;
    pnl: Record<string, unknown> | null;
    portfolio: unknown[];
  }>,
  language: "en" | "vi",
): WalletChatSection {
  const addrTokens: Record<string, Set<string>> = {};

  for (const [addr, data] of Object.entries(perAddress)) {
    const tokens = new Set<string>();
    for (const item of data.portfolio) {
      const p = item as Record<string, unknown>;
      tokens.add(String(p.token ?? p.symbol ?? "?"));
    }
    addrTokens[addr] = tokens;
  }

  const allTokenSets = Object.values(addrTokens);
  let common: string[] = [];
  if (allTokenSets.length > 0) {
    common = [...allTokenSets[0]].filter((t) =>
      allTokenSets.every((s) => s.has(t)),
    );
  }

  const unique: Record<string, string[]> = {};
  for (const [addr, tokens] of Object.entries(addrTokens)) {
    unique[addr] = [...tokens].filter((t) =>
      !Object.entries(addrTokens).some(
        ([otherAddr, otherTokens]) => otherAddr !== addr && otherTokens.has(t),
      ),
    );
  }

  const bullets: string[] = [];

  if (common.length > 0) {
    bullets.push(
      language === "vi"
        ? `Token chung: ${common.join(", ")}.`
        : `Common holdings: ${common.join(", ")}.`,
    );
  } else {
    bullets.push(
      language === "vi"
        ? "Không có token chung giữa các ví."
        : "No common tokens across wallets.",
    );
  }

  for (const [addr, tokens] of Object.entries(unique)) {
    if (tokens.length > 0) {
      bullets.push(
        language === "vi"
          ? `${shortenAddress(addr)} có token riêng: ${tokens.join(", ")}.`
          : `${shortenAddress(addr)} unique: ${tokens.join(", ")}.`,
      );
    }
  }

  if (bullets.length === 0) {
    bullets.push(
      language === "vi"
        ? "Không có dữ liệu danh mục để so sánh."
        : "No portfolio data to compare.",
    );
  }

  return {
    title: language === "vi" ? "So Sánh Danh Mục" : "Holdings Comparison",
    kind: "top_holdings",
    bullets,
  };
}

function buildRiskComparisonSection(
  perAddress: Record<string, {
    overview: Record<string, unknown> | null;
    pnl: Record<string, unknown> | null;
    portfolio: unknown[];
  }>,
  language: "en" | "vi",
): WalletChatSection {
  const bullets: string[] = [];

  for (const [addr, data] of Object.entries(perAddress)) {
    const label = shortenAddress(addr);
    const risks: string[] = [];

    if (data.portfolio.length > 0) {
      const total = data.portfolio.reduce<number>((sum, item) => {
        const v = finiteNumber((item as Record<string, unknown>).valueUsd);
        return sum + (v ?? 0);
      }, 0);
      if (total > 0) {
        const top = data.portfolio[0] as Record<string, unknown> | undefined;
        const topVal = finiteNumber(top?.valueUsd);
        if (topVal != null) {
          const conc = (topVal / total) * 100;
          if (conc > 50) {
            risks.push(
              language === "vi"
                ? `tập trung cao (${percent(conc)})`
                : `high concentration (${percent(conc)})`,
            );
          }
        }
      }
    }

    const realized = finiteNumber(data.pnl?.realizedPnlUsd);
    if (realized != null) {
      risks.push(
        realized >= 0
          ? (language === "vi"
              ? `PnL dương (${compactCurrency(realized)})`
              : `positive PnL (${compactCurrency(realized)})`)
          : (language === "vi"
              ? `PnL âm (${compactCurrency(Math.abs(realized))} lỗ)`
              : `negative PnL (${compactCurrency(Math.abs(realized))} loss)`),
      );
    }

    const volume = finiteNumber(data.overview?.tradingVolume24h);
    if (volume != null) {
      risks.push(
        volume > 1000
          ? (language === "vi"
              ? `khối lượng 24h: ${compactCurrency(volume)}`
              : `24h volume: ${compactCurrency(volume)}`)
          : (language === "vi"
              ? `khối lượng thấp (${compactCurrency(volume)})`
              : `low volume (${compactCurrency(volume)})`),
      );
    }

    if (risks.length > 0) {
      bullets.push(`${label}: ${risks.join("; ")}.`);
    }
  }

  if (bullets.length === 0) {
    bullets.push(
      language === "vi"
        ? "Không đủ dữ liệu để so sánh rủi ro."
        : "Insufficient data for risk comparison.",
    );
  }

  return {
    title: language === "vi" ? "So Sánh Rủi Ro" : "Risk Comparison",
    kind: "risk_factors",
    bullets,
  };
}

function buildComparisonConclusion(
  perAddress: Record<string, {
    overview: Record<string, unknown> | null;
    pnl: Record<string, unknown> | null;
    portfolio: unknown[];
  }>,
  language: "en" | "vi",
): WalletChatSection {
  let bestPnlAddr: string | null = null;
  let bestPnlVal = -Infinity;

  for (const [addr, data] of Object.entries(perAddress)) {
    const realized = finiteNumber(data.pnl?.realizedPnlUsd);
    if (realized != null && realized > bestPnlVal) {
      bestPnlVal = realized;
      bestPnlAddr = addr;
    }
  }

  let bestBalanceAddr: string | null = null;
  let bestBalanceVal = -Infinity;

  for (const [addr, data] of Object.entries(perAddress)) {
    const balance = finiteNumber(data.overview?.totalBalance);
    if (balance != null && balance > bestBalanceVal) {
      bestBalanceVal = balance;
      bestBalanceAddr = addr;
    }
  }

  let content: string;
  if (bestPnlAddr && bestBalanceAddr) {
    if (bestPnlAddr === bestBalanceAddr) {
      const label = shortenAddress(bestPnlAddr);
      content = language === "vi"
        ? `${label} dẫn đầu cả về PnL (${compactCurrency(bestPnlVal)}) và số dư (${compactCurrency(bestBalanceVal)}).`
        : `${label} leads in both PnL (${compactCurrency(bestPnlVal)}) and balance (${compactCurrency(bestBalanceVal)}).`;
    } else {
      const pnlLabel = shortenAddress(bestPnlAddr);
      const balLabel = shortenAddress(bestBalanceAddr);
      content = language === "vi"
        ? `${pnlLabel} có PnL tốt nhất (${compactCurrency(bestPnlVal)}), ${balLabel} có số dư cao nhất (${compactCurrency(bestBalanceVal)}).`
        : `${pnlLabel} has best PnL (${compactCurrency(bestPnlVal)}), ${balLabel} has highest balance (${compactCurrency(bestBalanceVal)}).`;
    }
  } else {
    content = language === "vi"
      ? "Không đủ dữ liệu để xác định ví nào hoạt động tốt hơn."
      : "Insufficient data to determine which wallet performs better.";
  }

  return {
    title: language === "vi" ? "Kết Luận" : "Conclusion",
    kind: "conclusion",
    content,
  };
}

function buildComparisonSections(
  allResults: ChatToolResult[],
  language: "en" | "vi",
): WalletChatSection[] {
  const addresses = getAddressesFromResults(allResults);
  if (!addresses) return [];

  const overviewResult = findResultByName(allResults, "get_wallet_overview");
  const pnlResult = findResultByName(allResults, "get_wallet_realized_pnl_desc_breakdown");
  const portfolioResult = findResultByName(allResults, "get_wallet_portfolio");

  const perAddress: Record<string, {
    overview: Record<string, unknown> | null;
    pnl: Record<string, unknown> | null;
    portfolio: unknown[];
  }> = {};

  for (const addr of addresses) {
    perAddress[addr] = {
      overview: extractDataForAddress(overviewResult, addr),
      pnl: extractDataForAddress(pnlResult, addr),
      portfolio: extractArrayForAddress(portfolioResult, addr),
    };
  }

  return [
    buildMetricsComparisonTable(perAddress, language),
    buildHoldingsComparisonSection(perAddress, language),
    buildRiskComparisonSection(perAddress, language),
    buildComparisonConclusion(perAddress, language),
  ];
}

function buildComparisonEvidence(
  allResults: ChatToolResult[],
  language: "en" | "vi",
): WalletChatEvidence[] {
  const evidence: WalletChatEvidence[] = [];
  const addresses = getAddressesFromResults(allResults);
  if (!addresses) return buildEvidence(allResults);

  for (const addr of addresses) {
    if (evidence.length >= WALLET_CHAT_RESPONSE_LIMITS.evidenceItems) break;
    const overview = extractDataForAddress(
      findResultByName(allResults, "get_wallet_overview"),
      addr,
    );
    const pnl = extractDataForAddress(
      findResultByName(allResults, "get_wallet_realized_pnl_desc_breakdown"),
      addr,
    );
    const label = shortenAddress(addr);

    evidence.push({
      type: "overview",
      label: language === "vi" ? `Tổng quan ${label}` : `${label} Overview`,
      value: overview?.totalBalance != null ? compactCurrency(overview.totalBalance) : undefined,
      detail: overview?.holdingsCount != null ? `${overview.holdingsCount} holdings` : undefined,
      toolName: "get_wallet_overview",
    });

    if (pnl && evidence.length < WALLET_CHAT_RESPONSE_LIMITS.evidenceItems) {
      evidence.push({
        type: "pnl",
        label: language === "vi" ? `PnL ${label}` : `${label} PnL`,
        value: pnl.realizedPnlUsd != null ? compactCurrency(pnl.realizedPnlUsd) : undefined,
        detail: pnl.tradeCount != null ? `${pnl.tradeCount} trades` : undefined,
        toolName: "get_wallet_realized_pnl_desc_breakdown",
      });
    }
  }

  return evidence;
}

function computeConfidence(results: ChatToolResult[]): WalletConfidence {
  const total = results.length;
  if (total === 0) return "Low";
  const succeeded = results.filter((r) => !r.error).length;
  const ratio = succeeded / total;
  if (ratio >= 0.8 && total >= 2) return "High";
  if (ratio >= 0.5) return "Medium";
  return "Low";
}

function buildEvidence(results: ChatToolResult[]): WalletChatEvidence[] {
  const evidence: WalletChatEvidence[] = [];

  for (const r of results) {
    if (evidence.length >= WALLET_CHAT_RESPONSE_LIMITS.evidenceItems) break;
    if (r.error || r.data == null) continue;

    let label = r.name.replace(/_/g, " ");
    let value: string | undefined;
    let detail: string | undefined;

    const data = r.data as Record<string, unknown>;
    if (r.name === "get_wallet_overview") {
      label = "Wallet Overview";
      value = compactCurrency(data.totalBalance);
      detail = `${data.holdingsCount ?? "?"} holdings, 24h volume ${compactCurrency(data.tradingVolume24h)}`;
    } else if (r.name === "get_wallet_swaps") {
      const arr = Array.isArray(r.data) ? r.data : [];
      label = "Recent Swaps";
      value = `${arr.length} swaps`;
      const total = arr.reduce<number>(
        (s, item) => s + (finiteNumber((item as Record<string, unknown>).totalValueUsd) ?? 0),
        0,
      );
      detail = `Total value ${compactCurrency(total)}`;
    } else if (r.name === "get_wallet_transfers") {
      const arr = Array.isArray(r.data) ? r.data : [];
      label = "Transfers";
      value = `${arr.length} transfers`;
    } else if (r.name === "get_wallet_realized_pnl_desc_breakdown") {
      label = "PnL";
      value = compactCurrency(data.realizedPnlUsd);
      detail = `${data.tradeCount ?? "?"} trades, ${percent(data.winRate)} win rate`;
    } else if (r.name === "get_balance_history") {
      const points = Array.isArray(data.points) ? data.points : [];
      label = "Balance History";
      value = `${points.length} data points`;
    } else if (r.name === "get_trading_volume") {
      const arr = Array.isArray(r.data) ? r.data : [];
      label = "Trading Volume";
      value = `${arr.length} days`;
    } else if (r.name === "get_wallet_portfolio") {
      const arr = Array.isArray(r.data) ? r.data : [];
      label = "Portfolio";
      value = `${arr.length} tokens`;
    }

    evidence.push({
      type: toolNameToEvidenceType(r.name),
      label,
      ...(value ? { value } : {}),
      ...(detail ? { detail } : {}),
      toolName: r.name,
    });
  }

  return evidence;
}

function buildWarnings(results: ChatToolResult[]): WalletWarning[] {
  const warnings: WalletWarning[] = [];

  for (const r of results) {
    if (warnings.length >= WALLET_CHAT_RESPONSE_LIMITS.warningItems) break;
    if (r.error && r.data == null) {
      warnings.push({
        text: `"${r.name}" failed: ${r.error}. Data for this area is unavailable.`,
        severity: "warning",
      });
    }
  }

  if (warnings.length === 0) {
    const succeeded = results.filter((r) => !r.error).length;
    if (succeeded < results.length) {
      warnings.push({
        text: `${results.length - succeeded} of ${results.length} data sources had errors. Results may be incomplete.`,
        severity: "info",
      });
    }
  }

  return warnings;
}

function buildTldr(sections: WalletChatSection[]): string[] {
  const tldr: string[] = [];
  for (const section of sections) {
    if (tldr.length >= WALLET_CHAT_RESPONSE_LIMITS.tldrItems) break;
    if (section.bullets && section.bullets.length > 0) {
      const first = section.bullets[0];
      if (first.length <= WALLET_CHAT_RESPONSE_LIMITS.tldrBulletChars) {
        tldr.push(first);
      }
    }
  }
  return tldr;
}

export function buildWalletFallbackResponse(
  query: string,
  intent: WalletChatIntent,
  allResults: ChatToolResult[],
  language: "en" | "vi",
): ChatResponse {
  const overview = findResult(allResults, "get_wallet_overview");
  const pnlData = findResult(allResults, "get_wallet_realized_pnl_desc_breakdown");
  const portfolio = findResultArray(allResults, "get_wallet_portfolio");
  const swaps = findResultArray(allResults, "get_wallet_swaps");
  const transfers = findResultArray(allResults, "get_wallet_transfers");
  const balancePoints = findResultArray(allResults, "get_balance_history");
  const volumeData = findResultArray(allResults, "get_trading_volume");

  let sections: WalletChatSection[] = [];

  const isComparison = intent === "comparison" || getAddressesFromResults(allResults) !== null;

  switch (intent) {
    case "overview":
      sections = buildOverviewSections(overview, portfolio, language);
      break;
    case "pnl":
      sections = buildPnlSections(pnlData, overview, language);
      break;
    case "trades":
      sections = buildTradesSections(swaps, transfers, language);
      break;
    case "portfolio":
      sections = buildPortfolioSections(portfolio, overview, language);
      break;
    case "balance_trend":
      sections = buildBalanceTrendSections(balancePoints, language);
      break;
    case "volume_trend":
      sections = buildVolumeTrendSections(volumeData, language);
      break;
    case "risk_analysis":
      sections = buildRiskSections(overview, pnlData, portfolio, swaps, language);
      break;
    case "comparison":
      sections = buildComparisonSections(allResults, language);
      break;
    default:
      sections = isComparison
        ? buildComparisonSections(allResults, language)
        : buildOverviewSections(overview, portfolio, language);
  }

  const evidence = isComparison
    ? buildComparisonEvidence(allResults, language)
    : buildEvidence(allResults);
  const warnings = buildWarnings(allResults);
  const confidence = computeConfidence(allResults);
  const tldr = buildTldr(sections);

  const text = sections
    .map((s) => s.bullets?.join("\n") ?? s.content ?? "")
    .filter(Boolean)
    .join("\n\n");

  return {
    text: text || (language === "vi" ? "Không có d? li?u." : "No data available."),
    data: {},
    charts: [],
    tables: [],
    tldr,
    sections,
    evidence,
    warnings,
    confidence,
    asOf: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  };
}
