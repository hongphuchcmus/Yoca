import { AssetDistribution } from "@/components/charts/AssetDistribution";
import { SegmentedControl } from "@/components/charts/shared/ChartControls";
import { Card } from "@/components/common/Card/Card";
import { CpyBtn } from "@/components/CpyBtn";
import Tble, { TbleSortType } from "@/components/Tble";
import type { TblRw } from "@/components/Tble";
import { TknImg } from "@/components/TknImg";
import { TrendNum } from "@/components/TrendNum";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchAssetDistribution } from "@/services/chart/chartApi";
import { fetchWalletRecentTradedDescBreakdown } from "@/services/wallet/walletApi";
import type { WalletRecentTradedDescBreakdown } from "@/services/wallet/walletApi";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./GeneralTab.module.scss";
import type WalletComparisonProp from "./WalletComparisonProp";

const PDF_EXPORT_SECTION_CLASS = "pdf-export-section";

type HoldingDisplayMode = "percentage" | "raw" | "usd";

interface AssetItem {
  name: string;
  value: number;
  percentage: number;
  rawAmount: number;
  symbol?: string;
  tokenAddress?: string;
  logoUri?: string | null;
}

interface WalletDistribution {
  walletAddress: string;
  data: AssetItem[];
  totalValue: number;
}

interface DistributionResponse {
  wallets: WalletDistribution[];
  metadata: Record<string, unknown>;
}

interface WalletHolding {
  percentage: number;
  rawAmount: number;
  usdValue: number;
}

interface TradingDetail {
  totalBoughtUsd: number;
  totalSoldUsd: number;
  realizedProfitUsd: number;
  realizedProfitPercent: number;
  unrealizedProfitUsd: number;
  unrealizedProfitPercent: number;
  avgBuyCost: number;
  avgSellCost: number;
  totalBuyCount: number;
  totalSellCount: number;
  balanceAmount: number;
}

type MergedCell = WalletHolding & TradingDetail;

interface TokenRow {
  tokenAddress: string;
  symbol: string;
  logoUri: string | null;
  wallets: Record<string, MergedCell | null>;
  overlapCount: number;
  avgPercentage: number;
}

interface WalletSummary {
  address: string;
  totalValue: number;
  assetCount: number;
  topAsset: { symbol: string; percentage: number } | null;
  top3Concentration: number;
}

function formatHoldingValue(
  cell: WalletHolding,
  mode: HoldingDisplayMode,
  fmt: ReturnType<typeof useLocalization>["fmt"],
): string {
  if (!cell) return "-";
  if (mode === "percentage") return `${cell.percentage.toFixed(1)}%`;
  if (mode === "raw") return fmt.num.compact.decimal(cell.rawAmount);
  return fmt.num.compact.currency(cell.usdValue);
}

function getSortValue(
  cell: WalletHolding | null | undefined,
  mode: HoldingDisplayMode,
): number {
  if (!cell) return -1;
  if (mode === "percentage") return cell.percentage;
  if (mode === "raw") return cell.rawAmount;
  return cell.usdValue;
}

function TokenCell({
  symbol,
  logoUri,
  tokenAddress,
}: {
  symbol: string;
  logoUri: string | null;
  tokenAddress: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: 140 }}>
      <TknImg size={20} src={logoUri} alt={symbol} />
      <span style={{
        fontFamily: "monospace",
        fontWeight: 600,
        fontSize: "0.75rem",
        color: "var(--yoca-text-main)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {symbol || tokenAddress.slice(0, 8)}
      </span>
      <CpyBtn size="xs" copyWhat={tokenAddress} />
    </div>
  );
}

function OverlapBadge({ count, total }: { count: number; total: number }) {
  const isAll = count === total;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: "0.7rem",
      fontWeight: 600,
      background: isAll ? "rgba(34, 197, 94, 0.15)" : "rgba(251, 191, 36, 0.15)",
      color: isAll ? "rgb(34, 197, 94)" : "rgb(251, 191, 36)",
      whiteSpace: "nowrap",
    }}>
      {count}/{total}
    </span>
  );
}

function TradingDetailPanel({ data }: { data: MergedCell | null }) {
  const { fmt, tr } = useLocalization();
  if (!data) {
    return (
      <span style={{ fontSize: "0.65rem", color: "var(--yoca-text-muted)" }}>
        {tr("walletComparison.tabs.holdings.noTradingData")}
      </span>
    );
  }

  const totalPnl = data.realizedProfitUsd + data.unrealizedProfitUsd;
  const totalPnlPct = data.realizedProfitPercent + data.unrealizedProfitPercent;

  return (
    <div style={{
      fontSize: "0.65rem",
      lineHeight: 1.6,
      color: "var(--yoca-text-muted)",
      minWidth: 160,
    }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>
          {tr("walletComparison.tabs.holdings.trading.pnl")}: {" "}
          <TrendNum
            value={totalPnl}
            prefixes="plus-minus"
            formatter={fmt.num.compact.currency}
            size="sm"
            mono
            epsilon={0.01}
          />
          <span style={{ marginLeft: 2, fontSize: "0.6rem" }}>
            (<TrendNum
              value={totalPnlPct}
              prefixes="plus-minus"
              formatter={fmt.num.percent}
              size="sm"
              mono
              epsilon={0.01}
            />)
          </span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>{tr("walletComparison.tabs.holdings.trading.buy")}: {fmt.num.compact.currency(data.totalBoughtUsd)}</span>
        <span>/ {tr("walletComparison.tabs.holdings.trading.sell")}: {fmt.num.compact.currency(data.totalSoldUsd)}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>
          {tr("walletComparison.tabs.holdings.trading.trades")}: {data.totalBuyCount}B / {data.totalSellCount}S
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>{tr("walletComparison.tabs.holdings.trading.avgBuy")}: {fmt.num.compact.currency(data.avgBuyCost)}</span>
        <span>| {tr("walletComparison.tabs.holdings.trading.sell")}: {fmt.num.compact.currency(data.avgSellCost)}</span>
      </div>
    </div>
  );
}

function HoldingsComparisonTable({
  walletAddresses,
  fetchEnabled,
}: {
  walletAddresses: string[];
  fetchEnabled: boolean;
}) {
  const { fmt, tr } = useLocalization();
  const displayModeOptions = useMemo(() => [
    { value: "percentage" as const, label: "%" },
    { value: "raw" as const, label: tr("walletComparison.tabs.holdings.displayMode.raw") },
    { value: "usd" as const, label: "USD" },
  ], [tr]);
  const [displayMode, setDisplayMode] = useState<HoldingDisplayMode>("percentage");
  const [minThreshold, setMinThreshold] = useState(5);
  const [tokenRows, setTokenRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [tokenDetailsMap, setTokenDetailsMap] = useState<Record<string, Record<string, WalletRecentTradedDescBreakdown>>>({});
  const [popupData, setPopupData] = useState<{
    tokenAddress: string;
    walletAddress: string;
    cell: MergedCell | null;
    anchorRect: DOMRect;
  } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popupData) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setPopupData(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopupData(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popupData]);

  useEffect(() => {
    setPopupData(null);
  }, [displayMode, minThreshold]);

  useEffect(() => {
    if (!fetchEnabled || walletAddresses.length === 0) {
      setTokenRows([]);
      setTokenDetailsMap({});
      return;
    }
    let cancelled = false;
    setLoading(true);

    fetchAssetDistribution({
      wallets: walletAddresses.join(","),
      period: "30D" as const,
      topN: 20,
    })
      .then((data: unknown) => {
        if (cancelled) return;
        const distData = data as DistributionResponse;

        const walletMap: Record<string, Record<string, WalletHolding>> = {};
        const walletTotals: Record<string, number> = {};

        for (const w of distData?.wallets ?? []) {
          walletTotals[w.walletAddress] = w.totalValue;
          walletMap[w.walletAddress] = {};
          for (const d of w.data) {
            const addr = d.tokenAddress || d.name || "Unknown";
            walletMap[w.walletAddress][addr] = {
              percentage: d.percentage ?? 0,
              rawAmount: d.rawAmount ?? 0,
              usdValue: d.value ?? 0,
            };
          }
        }

        const tokenMeta: Record<string, { symbol: string; logoUri: string | null }> = {};
        const allTokenAddresses = new Set<string>();
        for (const w of distData?.wallets ?? []) {
          for (const d of w.data) {
            const addr = d.tokenAddress || d.name || "Unknown";
            allTokenAddresses.add(addr);
            if (!tokenMeta[addr]) {
              tokenMeta[addr] = {
                symbol: d.symbol || d.name || addr.slice(0, 8),
                logoUri: d.logoUri ?? null,
              };
            }
          }
        }

        const addressList = walletAddresses;
        const mergedRows: TokenRow[] = [];

        for (const addr of allTokenAddresses) {
          const perWallet: Record<string, MergedCell | null> = {};
          let overlapCount = 0;
          for (const wa of addressList) {
            const h = walletMap[wa]?.[addr];
            if (h && h.usdValue > 0) {
              perWallet[wa] = {
                ...h,
                totalBoughtUsd: 0,
                totalSoldUsd: 0,
                realizedProfitUsd: 0,
                realizedProfitPercent: 0,
                unrealizedProfitUsd: 0,
                unrealizedProfitPercent: 0,
                avgBuyCost: 0,
                avgSellCost: 0,
                totalBuyCount: 0,
                totalSellCount: 0,
                balanceAmount: h.rawAmount,
              };
              overlapCount++;
            } else {
              perWallet[wa] = null;
            }
          }

          if (overlapCount > 0) {
            const avgPercentage =
              addressList.reduce(
                (sum, wa) => sum + (perWallet[wa]?.percentage ?? 0),
                0,
              ) / addressList.length;
            mergedRows.push({
              tokenAddress: addr,
              symbol: tokenMeta[addr]?.symbol || addr.slice(0, 8),
              logoUri: tokenMeta[addr]?.logoUri ?? null,
              wallets: perWallet,
              overlapCount,
              avgPercentage,
            });
          }
        }

        mergedRows.sort((a, b) => b.avgPercentage - a.avgPercentage);
        setTokenRows(mergedRows);
      })
      .catch(() => {
        if (!cancelled) setTokenRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchEnabled, walletAddresses]);

  const hasTokenRows = tokenRows.length > 0;

  useEffect(() => {
    if (!fetchEnabled || walletAddresses.length === 0 || !hasTokenRows) {
      setTokenDetailsMap({});
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);

    Promise.all(
      walletAddresses.map(async (addr) => {
        try {
          const details = await fetchWalletRecentTradedDescBreakdown(addr);
          return { addr, details };
        } catch {
          return { addr, details: [] };
        }
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, Record<string, WalletRecentTradedDescBreakdown>> = {};
        for (const { addr, details } of results) {
          map[addr] = {};
          for (const d of details) {
            map[addr][d.tokenAddress] = d;
          }
        }
        setTokenDetailsMap(map);
      })
      .catch(() => {
        if (!cancelled) setTokenDetailsMap({});
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchEnabled, walletAddresses, hasTokenRows]);

  const enrichedRows = useMemo<TokenRow[]>(() => {
    if (tokenRows.length === 0 || Object.keys(tokenDetailsMap).length === 0) {
      return tokenRows;
    }
    return tokenRows.map((row) => {
      const wallets = { ...row.wallets };
      for (const addr of Object.keys(wallets)) {
        const detail = tokenDetailsMap[addr]?.[row.tokenAddress];
        if (detail && wallets[addr]) {
          wallets[addr] = {
            ...(wallets[addr] as MergedCell),
            totalBoughtUsd: detail.totalBoughtUsd,
            totalSoldUsd: detail.totalSoldUsd,
            realizedProfitUsd: detail.realizedProfitUsd,
            realizedProfitPercent: detail.realizedProfitPercent,
            unrealizedProfitUsd: detail.unrealizedProfitUsd,
            unrealizedProfitPercent: detail.unrealizedProfitPercent,
            avgBuyCost: detail.avgBuyCost,
            avgSellCost: detail.avgSellCost,
            totalBuyCount: detail.totalBuyCount,
            totalSellCount: detail.totalSellCount,
            balanceAmount: detail.balanceAmount,
          };
        }
      }
      return { ...row, wallets };
    });
  }, [tokenRows, tokenDetailsMap]);

  const filteredRows = useMemo(() => {
    if (minThreshold <= 0) return enrichedRows;
    return enrichedRows.filter((r) => r.avgPercentage >= minThreshold);
  }, [enrichedRows, minThreshold]);

  const walletSummaries = useMemo<WalletSummary[]>(() => {
    return walletAddresses.map((addr) => {
      const holdings = enrichedRows
        .map((r) => ({
          symbol: r.symbol,
          percentage: r.wallets[addr]?.percentage ?? 0,
          value: r.wallets[addr]?.usdValue ?? 0,
        }))
        .filter((h) => h.value > 0)
        .sort((a, b) => b.value - a.value);

      const totalValue = holdings.reduce((s, h) => s + h.value, 0);
      const topAsset = holdings.length > 0 ? holdings[0] : null;
      const top3Pct = holdings
        .slice(0, 3)
        .reduce((s, h) => s + h.percentage, 0);

      return {
        address: addr,
        totalValue,
        assetCount: holdings.length,
        topAsset: topAsset ? { symbol: topAsset.symbol, percentage: topAsset.percentage } : null,
        top3Concentration: top3Pct,
      };
    });
  }, [walletAddresses, enrichedRows]);

  const headers = useMemo(() => [
    { key: "token", header: tr("walletComparison.tabs.holdings.table.token"), width: 150, minWidth: 120 },
    ...walletAddresses.map((addr) => ({
      key: `wallet_${addr}`,
      header: addr.slice(0, 6),
      width: 180,
      minWidth: 140,
      align: "end" as const,
    })),
    { key: "overlap", header: tr("walletComparison.tabs.holdings.table.overlap"), align: "center" as const, width: 80, minWidth: 70 },
  ], [tr, walletAddresses]);

  const tbleRows = useMemo(() => {
    return filteredRows.map((r) => {
      const row: Record<string, unknown> = {
        id: r.tokenAddress,
        token: r.symbol,
        _addr: r.tokenAddress,
        _logo: r.logoUri,
        _overlap: r.overlapCount,
        _total: walletAddresses.length,
      };
      for (const addr of walletAddresses) {
        const cell = r.wallets[addr];
        row[`wallet_${addr}`] = cell;
        row[`sort_${addr}`] = getSortValue(cell, displayMode);
      }
      return row as TblRw;
    });
  }, [filteredRows, walletAddresses, displayMode]);

  const sortConfigs = useMemo(() => ({
    ...Object.fromEntries(
      walletAddresses.map((addr) => [
        `wallet_${addr}`,
        { type: TbleSortType.Number as const, field: `sort_${addr}` },
      ]),
    ),
    overlap: { type: TbleSortType.Number as const },
  }), [walletAddresses]);

  const cellRenderers = useMemo(() => ({
    token: (value: unknown, row: TblRw) => (
      <TokenCell
        symbol={String(value ?? "")}
        logoUri={String(row._logo ?? "")}
        tokenAddress={String(row._addr ?? "")}
      />
    ),
    overlap: (value: unknown, row: TblRw) => (
      <OverlapBadge
        count={Number(row._overlap)}
        total={Number(row._total)}
      />
    ),
    ...Object.fromEntries(
      walletAddresses.map((addr) => [
        `wallet_${addr}`,
        (value: unknown, row: TblRw) => {
          const cell = value as MergedCell | null;
          const tokenAddress = String(row._addr ?? "");
          if (!cell) {
            return (
              <span style={{
                color: "var(--yoca-text-muted)",
                fontSize: "0.75rem",
              }}>
                -
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={(event) => {
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                setPopupData({
                  tokenAddress,
                  walletAddress: addr,
                  cell,
                  anchorRect: rect,
                });
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                color: "var(--yoca-text-main)",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
                padding: "2px 4px",
                borderRadius: 4,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--yoca-surface-hover, rgba(148,163,184,0.08))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "none";
              }}
            >
              {formatHoldingValue(cell, displayMode, fmt)}
            </button>
          );
        },
      ]),
    ),
  }), [walletAddresses, displayMode, fmt]);

  const anyLoading = loading || detailsLoading;

  if (anyLoading && tokenRows.length === 0) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "var(--yoca-text-muted)" }}>
        {tr("walletComparison.tabs.holdings.loading")}
      </div>
    );
  }

  if (tokenRows.length === 0) return null;

  return (
    <div>
      {/* Summary Header */}
      <div style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 16,
      }}>
        {walletSummaries.map((s) => (
          <div
            key={s.address}
            style={{
              flex: "1 1 180px",
              minWidth: 160,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--yoca-border, rgba(148,163,184,0.16))",
              background: "var(--yoca-surface, rgba(18,24,38,0.82))",
            }}
          >
            <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--yoca-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {s.address.slice(0, 6)}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--yoca-text-main)", marginBottom: 4 }}>
              {fmt.num.compact.currency(s.totalValue)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--yoca-text-muted)", lineHeight: 1.5 }}>
              <div>{tr("walletComparison.tabs.holdings.summary.assets", { count: s.assetCount })}</div>
              {s.topAsset && (
                <div>
                  {tr("walletComparison.tabs.holdings.summary.topAsset", { symbol: s.topAsset.symbol, percentage: `${s.topAsset.percentage.toFixed(1)}%` })}
                </div>
              )}
              <div>{tr("walletComparison.tabs.holdings.summary.top3", { percentage: `${s.top3Concentration.toFixed(1)}%` })}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: "0.7rem", color: "var(--yoca-text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
            {tr("walletComparison.tabs.holdings.controls.minPercent")}
          </label>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={minThreshold}
            onChange={(e) => setMinThreshold(Number(e.target.value))}
            style={{
              width: 80,
              accentColor: "var(--yoca-primary, #7c3aed)",
            }}
          />
          <span style={{
            fontSize: "0.75rem",
            color: "var(--yoca-text-main)",
            fontFamily: "monospace",
            minWidth: 24,
          }}>
            {minThreshold}
          </span>
        </div>
        <span style={{ fontSize: "0.65rem", color: "var(--yoca-text-muted)" }}>
          {tr("walletComparison.tabs.holdings.controls.visibleTokens", { shown: fmt.num.decimal(filteredRows.length), total: enrichedRows.length })}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <SegmentedControl
            ariaLabel={tr("walletComparison.tabs.holdings.aria.displayMode")}
            value={displayMode}
            onChange={(v) => setDisplayMode(v as HoldingDisplayMode)}
            options={displayModeOptions}
          />
        </div>
      </div>

      {/* Table */}
      <Tble
        rows={tbleRows}
        headers={headers}
        sortConfigs={sortConfigs}
        cellRenderers={cellRenderers}
        loading={anyLoading}
        boxed
        pageUnknown
        enablePagination
        pageSize={12}
        pageSizes={[8, 12, 16, 24]}
      />

      {/* Popup for trading detail */}
      {popupData && (
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            top: Math.min(popupData.anchorRect.bottom + 6, window.innerHeight - 240),
            left: Math.min(popupData.anchorRect.left, window.innerWidth - 220),
            zIndex: 10000,
            background: "var(--yoca-surface, rgba(18,24,38,0.95))",
            border: "1px solid var(--yoca-border, rgba(148,163,184,0.24))",
            borderRadius: 8,
            padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
            minWidth: 200,
          }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "var(--yoca-text-main)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}>
              {popupData.walletAddress.slice(0, 6)} - {popupData.tokenAddress.slice(0, 8)}
            </span>
            <button
              type="button"
              aria-label={tr("walletComparison.tabs.holdings.aria.closeDetails")}
              onClick={() => setPopupData(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--yoca-text-muted)",
                fontSize: "0.85rem",
                padding: "0 2px",
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
          <TradingDetailPanel data={popupData.cell} />
        </div>
      )}
    </div>
  );
}

export const HoldingTab: React.FC<WalletComparisonProp> = ({
  walletAddresses,
  fetchEnabled = true,
}) => {
  const { tr } = useLocalization();
  if (!walletAddresses || walletAddresses.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateContent}>
          <h3>{tr("walletComparison.tabs.empty.title")}</h3>
          <p>{tr("walletComparison.tabs.empty.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {/* Summary + Holdings Comparison Table */}
      <div className={`${PDF_EXPORT_SECTION_CLASS}`}>
        <Card title={tr("walletComparison.tabs.holdings.title")}>
          <HoldingsComparisonTable walletAddresses={walletAddresses} fetchEnabled={fetchEnabled} />
        </Card>
      </div>

      {/* Per-wallet Asset Distribution */}
      <div className={`${styles.grid2Col} ${PDF_EXPORT_SECTION_CLASS}`}>
        {walletAddresses.map((address: string) => (
          <Card key={address}>
            <AssetDistribution
              key={address}
              initialFilters={{ wallets: [address] }}
              minHeight={300}
              fetchEnabled={fetchEnabled}
            />
          </Card>
        ))}
      </div>
    </div>
  );
};
