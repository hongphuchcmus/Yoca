import { SegmentedControl } from "@/components/charts/shared/ChartControls";
import { DrawdownChart } from "@/components/charts/Drawdown";
import { PnLChart } from "@/components/charts/PnLChart";
import { Card } from "@/components/common/Card/Card";
import Tble, { TbleSortType } from "@/components/Tble";
import type { TblRw } from "@/components/Tble";
import { useLocalization } from "@/contexts/LocalizationContext";
import type { TimePeriod } from "@/types/chart-filters.types";
import React, { useMemo, useState } from "react";
import styles from "./GeneralTab.module.scss";
import type WalletComparisonProp from "./WalletComparisonProp";
import {
  useWalletComparisonSummary,
  type WalletMetricSummary,
} from "./useWalletComparisonSummary";

const PDF_EXPORT_SECTION_CLASS = "pdf-export-section";

const PERIOD_OPTIONS = [
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
] as const;

interface MetricDef {
  id: string;
  label: string;
  getValue: (s: WalletMetricSummary) => number | null;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

function RiskSummaryTable({
  walletAddresses,
  fetchEnabled,
  period,
}: {
  walletAddresses: string[];
  fetchEnabled: boolean;
  period: string;
}) {
  const { fmt, tr } = useLocalization();
  const { summaries, loading } = useWalletComparisonSummary(
    walletAddresses,
    fetchEnabled,
    period,
  );

  const metrics: MetricDef[] = useMemo(
    () => [
      {
        id: "winRate",
        label: tr("walletComparison.tabs.risk.metrics.winRate"),
        getValue: (s: WalletMetricSummary) => s.winRate,
        format: (v: number) => fmt.num.percent(v / 100),
        higherIsBetter: true,
      },
      {
        id: "balance",
        label: tr("walletComparison.tabs.risk.metrics.balance"),
        getValue: (s: WalletMetricSummary) => s.totalAssetValue,
        format: fmt.num.compact.currency,
        higherIsBetter: true,
      },
      {
        id: "pnl",
        label: tr("walletComparison.tabs.risk.metrics.pnl", { period }),
        getValue: (s: WalletMetricSummary) => s.pnl,
        format: fmt.num.compact.currency,
        higherIsBetter: true,
      },
      {
        id: "pnlPercent",
        label: tr("walletComparison.tabs.risk.metrics.pnlPercent"),
        getValue: (s: WalletMetricSummary) =>
          s.totalAssetValue && s.totalAssetValue > 0 && s.pnl != null
            ? s.pnl / s.totalAssetValue
            : null,
        format: fmt.num.percent,
        higherIsBetter: true,
      },
      {
        id: "realizedPnl",
        label: tr("walletComparison.tabs.risk.metrics.realizedPnl"),
        getValue: (s: WalletMetricSummary) => s.realizedPnl,
        format: fmt.num.compact.currency,
        higherIsBetter: true,
      },
      {
        id: "unrealizedPnl",
        label: tr("walletComparison.tabs.risk.metrics.unrealizedPnl"),
        getValue: (s: WalletMetricSummary) => s.unrealizedPnl,
        format: fmt.num.compact.currency,
        higherIsBetter: true,
      },
      {
        id: "tradingVolume",
        label: tr("walletComparison.tabs.risk.metrics.tradingVolume", {
          period,
        }),
        getValue: (s: WalletMetricSummary) => s.tradingVolume,
        format: fmt.num.compact.currency,
        higherIsBetter: true,
      },
      {
        id: "winCount",
        label: tr("walletComparison.tabs.risk.metrics.winCount"),
        getValue: (s: WalletMetricSummary) => s.profitableTokens,
        format: fmt.num.decimal,
        higherIsBetter: true,
      },
      {
        id: "lossCount",
        label: tr("walletComparison.tabs.risk.metrics.lossCount"),
        getValue: (s: WalletMetricSummary) => s.unprofitableTokens,
        format: fmt.num.decimal,
        higherIsBetter: false,
      },
      {
        id: "totalTokens",
        label: tr("walletComparison.tabs.risk.metrics.totalTrades"),
        getValue: (s: WalletMetricSummary) => s.totalTokens,
        format: fmt.num.decimal,
        higherIsBetter: false,
      },
      {
        id: "avgWin",
        label: tr("walletComparison.tabs.risk.metrics.avgWin"),
        getValue: (s: WalletMetricSummary) => s.avgWinUsd,
        format: fmt.num.compact.currency,
        higherIsBetter: true,
      },
      {
        id: "avgLoss",
        label: tr("walletComparison.tabs.risk.metrics.avgLoss"),
        getValue: (s: WalletMetricSummary) => s.avgLossUsd,
        format: fmt.num.compact.currency,
        higherIsBetter: false,
      },
      {
        id: "winLossRatio",
        label: tr("walletComparison.tabs.risk.metrics.winLossRatio"),
        getValue: (s: WalletMetricSummary) =>
          s.unprofitableTokens && s.unprofitableTokens > 0 && s.profitableTokens != null
            ? s.profitableTokens / s.unprofitableTokens
            : null,
        format: (v: number) => fmt.num.decimal(v),
        higherIsBetter: true,
      },
    ],
    [fmt, period, tr],
  );

  const bestMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!summaries) return map;
    for (const metric of metrics) {
      let bestIdx = -1;
      for (let i = 0; i < summaries.length; i++) {
        const value = metric.getValue(summaries[i]);
        if (value === null) continue;
        if (bestIdx === -1) {
          bestIdx = i;
          continue;
        }
        const bestValue = metric.getValue(summaries[bestIdx])!;
        if ((value > bestValue) === metric.higherIsBetter) bestIdx = i;
      }
      if (bestIdx >= 0) map[metric.id] = bestIdx;
    }
    return map;
  }, [metrics, summaries]);

  const headers = useMemo(
    () => [
      {
        key: "metric",
        header: tr("walletComparison.tabs.risk.table.metric"),
        width: 140,
        minWidth: 120,
      },
      ...(summaries?.map((summary) => ({
        key: `wallet_${summary.address}`,
        header: `${summary.address.slice(0, 6)}...${summary.address.slice(-4)}`,
        width: 140,
        minWidth: 110,
        align: "end" as const,
      })) ?? []),
    ],
    [summaries, tr],
  );

  const rows = useMemo(() => {
    if (!summaries || summaries.length === 0) return [];
    return metrics.map((metric) => {
      const row: Record<string, unknown> = {
        id: `metric_${metric.id}`,
        _label: metric.label,
        _format: metric.format,
        _bestIdx: bestMap[metric.id] ?? -1,
      };
      for (const summary of summaries) {
        const value = metric.getValue(summary);
        row[`wallet_${summary.address}`] = value;
        row[`sort_${summary.address}`] = value ?? -Infinity;
      }
      return row as TblRw;
    });
  }, [summaries, metrics, bestMap]);

  const sortConfigs = useMemo(
    () => ({
      ...Object.fromEntries(
        (summaries ?? []).map((summary) => [
          `wallet_${summary.address}`,
          { type: TbleSortType.Number as const, field: `sort_${summary.address}` },
        ]),
      ),
    }),
    [summaries],
  );

  const cellRenderers = useMemo(
    () => ({
      metric: (_value: unknown, row: TblRw) => (
        <span style={{ fontWeight: 600, fontSize: "0.75rem", color: "var(--yoca-text-main)" }}>
          {row._label as string}
        </span>
      ),
      ...Object.fromEntries(
        (summaries ?? []).map((summary) => [
          `wallet_${summary.address}`,
          (value: unknown, row: TblRw) => {
            const numericValue = value as number | null;
            const bestIdx = row._bestIdx as number;
            const walletIdx = (summaries ?? []).findIndex(
              (item) => item.address === summary.address,
            );
            const isBest = bestIdx >= 0 && walletIdx === bestIdx;
            const format = row._format as (v: number) => string;
            return (
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  fontWeight: isBest ? 700 : 400,
                  color: isBest ? "var(--yoca-success, #22c55e)" : "var(--yoca-text-main)",
                  whiteSpace: "nowrap",
                }}
              >
                {numericValue !== null && numericValue !== undefined
                  ? format(numericValue)
                  : tr("walletComparison.tabs.risk.notAvailable")}
              </span>
            );
          },
        ]),
      ),
    }),
    [summaries, tr],
  );

  if (!summaries || summaries.length === 0) return null;

  return (
    <Tble
      rows={rows}
      headers={headers}
      sortConfigs={sortConfigs}
      cellRenderers={cellRenderers}
      enablePagination
      pageSize={7}
      pageSizes={[7]}
      boxed
      loading={loading}
    />
  );
}

export const RiskTab: React.FC<WalletComparisonProp> = ({
  walletAddresses,
  fetchEnabled = true,
  onDayClick,
}) => {
  const { tr } = useLocalization();
  const [period, setPeriod] = useState("30D" as string);

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
      <div className={`${PDF_EXPORT_SECTION_CLASS}`}>
        <Card
          title={tr("walletComparison.tabs.risk.title")}
          actions={
            <SegmentedControl
              ariaLabel={tr("charts.timePeriod")}
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS}
            />
          }
        >
          <RiskSummaryTable
            walletAddresses={walletAddresses}
            fetchEnabled={fetchEnabled}
            period={period}
          />
        </Card>
      </div>

      <PnLChart
        minHeight={300}
        initialWallets={walletAddresses}
        fetchEnabled={fetchEnabled}
        onDayClick={onDayClick}
      />

      <DrawdownChart
        minHeight={300}
        initialFilters={{
          timePeriod: period as TimePeriod,
          wallets: walletAddresses,
        }}
        fetchEnabled={fetchEnabled}
      />
    </div>
  );
};
