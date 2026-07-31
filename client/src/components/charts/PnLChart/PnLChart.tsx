import { ChartGrid, ChartGridItem, ChartWrapper } from "@/components/charts/shared";
import { useChartContext } from "@/contexts/ChartContext";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useChartFiltersSync } from "@/hooks/useChartFiltersSync";
import {
  CHART_COLOR_PALETTE,
  useCarbonChartBaseOption,
} from "@/util/carbon-chart-base";
import {
  formatTimestampWithTimezone,
} from "@/util/chart-helpers";
import { createTooltipHeader, createTooltipRow } from "@/util/tooltip-helpers";
import type { EChartsOption, SeriesOption, YAXisComponentOption } from "echarts";
import ReactECharts from "echarts-for-react";
import React, { useCallback, useMemo, useState } from "react";
import client from "@/api/main";
import { useGet, type UseGetResp } from "@/hooks/useGet";
import type { ChartLoadingState } from "@/types/chart.types";
import {
  SegmentedControl,
  type SegmentedControlOption,
  chartControlStyles,
} from "@/components/charts/shared/ChartControls";
import { BarChart3, ChartNoAxesCombined, LineChart } from "lucide-react";

type PnLPoint = {
  timestamp: number;
  value: number;
};

type DailyPnlPoint = PnLPoint & {
  buyCount: number | null;
  sellCount: number | null;
  swapCount: number | null;
  buyVolumeUsd: number | null;
  sellVolumeUsd: number | null;
  totalVolumeUsd: number | null;
};

type PnLAnalysisResponse = {
  wallets: {
    walletAddress: string;
    walletName?: string;
    dailyPnL: DailyPnlPoint[];
    cumulativePnL: PnLPoint[];
    realizedPnL?: number;
    totalPnL?: number;
    unrealizedPnL?: number;
  }[];
};

type PnLDisplayMode = "daily" | "cumulative" | "both";
type PnLTimePeriod = "7D" | "30D";

export interface PnLChartProps {
  title?: string;
  minHeight?: number;
  initialWallets?: string[];
  className?: string;
  initialViewMode?: "daily" | "cumulative" | "both";
  initialFilters?: {
    wallets?: string[];
  };
  fetchEnabled?: boolean;
  /** Temporarily ignored while day-level swap data is inconsistent. */
  onDayClick?: (walletAddress: string, timestamp: number) => void;
  actions?: React.ReactNode;
}

export const PnLChart: React.FC<PnLChartProps> = ({
  title,
  minHeight = 400,
  initialWallets = [],
  className,
  initialViewMode = "both",
  initialFilters,
  fetchEnabled = true,
  actions: externalActions,
}) => {
  const { tr, fmt } = useLocalization();
  const chartTitle = title || tr("charts.pnlChart.title");
  const chartMinHeight = Math.max(minHeight, 360);

  const baseOption = useCarbonChartBaseOption();
  const { selectedTimezone: timezone } = useChartContext();
  const [displayMode, setDisplayMode] = useState<PnLDisplayMode>(
    initialViewMode,
  );
  const [chartTimePeriod, setChartTimePeriod] = useState<PnLTimePeriod>("7D");

  const { walletsString } = useChartFiltersSync({
    initialFilters: initialFilters || {
      wallets: initialWallets.length > 0 ? initialWallets : undefined,
    },
    debounceDelay: 300,
  });

  const hasWallets = (walletsString ?? "").trim().length > 0;

  const pnlData: UseGetResp<PnLAnalysisResponse> = useGet(
    client.api.wallets.analysis["pnl-history"],
    200,
    {
      query: {
        period: chartTimePeriod,
        wallets: walletsString ?? "",
      },
    },
    {
      enabled: fetchEnabled && hasWallets,
    },
  );

  const displayData = pnlData.data;

  const loadingState = useMemo<ChartLoadingState>(() => {
    if (pnlData.error) {
      return {
        status: "error",
        error: {
          code: "PNL_LOAD_FAILED",
          message: "Failed to load PnL data",
          retryable: true,
        },
        retryCount: 0,
      };
    }

    if (pnlData.isLoading) {
      return { status: "loading", retryCount: 0 };
    }

    if (pnlData.isValidating && pnlData.data) {
      return { status: "refreshing", retryCount: 0 };
    }

    if (!fetchEnabled || !hasWallets) {
      return { status: "idle", retryCount: 0 };
    }

    return { status: "success", retryCount: 0 };
  }, [fetchEnabled, hasWallets, pnlData.data, pnlData.error, pnlData.isLoading, pnlData.isValidating]);

  const handleDisplayModeChange = useCallback(
    (mode: PnLDisplayMode) => {
      setDisplayMode(mode);
    },
    [],
  );

  const handleChartPeriodChange = useCallback(
    (nextPeriod: PnLTimePeriod) => {
      if (nextPeriod == chartTimePeriod) {
        if (hasWallets) {
          pnlData.mutate();
        }
        return;
      }
      setChartTimePeriod(nextPeriod);
    },
    [chartTimePeriod, hasWallets, pnlData],
  );

  const createChartOption = useCallback(
    (
      dailyPnLData: DailyPnlPoint[],
      cumulativePnLData: Array<{ timestamp: number; value: number }>,
      walletLabel?: string,
    ): EChartsOption => {
      const profitColor = CHART_COLOR_PALETTE[1];
      const lossColor = CHART_COLOR_PALETTE[2];
      const cumulativeColor = CHART_COLOR_PALETTE[0];

      const timestamps = dailyPnLData.map((item) => item.timestamp);
      const dailyValues = dailyPnLData.map((item) => item.value);
      const cumulativeValues = cumulativePnLData.map((item) => item.value);
      const combinedValues = [...dailyValues, ...cumulativeValues];

      const calculateSharedAxisBounds = (values: number[]) => {
        const minValue = Math.min(...values, 0);
        const maxValue = Math.max(...values, 0);
        const spread =
          maxValue - minValue ||
          Math.max(Math.abs(minValue), Math.abs(maxValue)) ||
          1;
        const padding = spread * 0.12;
        return {
          min: minValue - padding,
          max: maxValue + padding,
        };
      };

      const sharedAxisBounds =
        displayMode == "both"
          ? calculateSharedAxisBounds(combinedValues)
          : undefined;

      const xAxisData = timestamps.map((ts) =>
        formatTimestampWithTimezone(ts, timezone, "MM/dd"),
      );
      const showDaily = displayMode == "daily" || displayMode == "both";
      const showCumulative = displayMode == "cumulative" || displayMode == "both";

      const series: SeriesOption[] = [];

      if (showDaily) {
        series.push({
          name: tr("charts.pnlChart.dailyPnL"),
          type: "bar",
          yAxisIndex: displayMode == "both" ? 0 : undefined,
          data: dailyValues,
          itemStyle: {
            color: (params) =>
              Number(params.value) >= 0 ? profitColor : lossColor,
          },
        });
      }

      if (showCumulative) {
        series.push({
          name: tr("charts.pnlChart.cumulativePnL"),
          type: "line",
          yAxisIndex: displayMode == "both" ? 1 : undefined,
          data: cumulativeValues,
          smooth: false,
          lineStyle: {
            color: cumulativeColor,
            width: 2,
          },
          itemStyle: {
            color: cumulativeColor,
          },
        });
      }

      const formatAxisValue = (value: number) => {
        return fmt.num.compact.currency(value);
      };

      const yAxis: YAXisComponentOption[] = [];
      if (displayMode == "both") {
        yAxis.push({
          ...baseOption.yAxis,
          type: "value",
          name: tr("charts.pnlChart.dailyPnL"),
          position: "left",
          min: sharedAxisBounds?.min,
          max: sharedAxisBounds?.max,
          axisLabel: {
            ...baseOption.yAxis.axisLabel,
            formatter: formatAxisValue,
          },
        });
        yAxis.push({
          ...baseOption.yAxis,
          type: "value",
          name: tr("charts.pnlChart.cumulativePnL"),
          position: "right",
          min: sharedAxisBounds?.min,
          max: sharedAxisBounds?.max,
          axisLabel: {
            ...baseOption.yAxis.axisLabel,
            formatter: formatAxisValue,
          },
          splitLine: { show: false },
        });
      } else {
        yAxis.push({
          ...baseOption.yAxis,
          type: "value",
          name:
            displayMode == "daily"
              ? tr("charts.pnlChart.dailyPnL")
              : tr("charts.pnlChart.cumulativePnL"),
          axisLabel: {
            ...baseOption.yAxis.axisLabel,
            formatter: formatAxisValue,
          },
        });
      }

      return {
        ...baseOption,
        legend: undefined,
        title: walletLabel
          ? {
            text: walletLabel,
            left: 8,
            top: 8,
            textStyle: {
              color: baseOption.textStyle.color,
              fontSize: 16,
              fontWeight: "bold",
            },
          }
          : undefined,
        grid: {
          ...baseOption.grid,
          // echarts grid offsets don't understand CSS units (e.g. "rem") —
          // it parses them with parseFloat, so "4rem" silently became 4px.
          top: walletLabel ? 56 : 48,
          left: "1.25rem",
          right: displayMode == "both" ? "2.75rem" : "1.5rem",
          bottom: "2rem",
          containLabel: true,
        },
        tooltip: {
          ...baseOption.tooltip,
          trigger: "axis",
          formatter: (params: unknown) => {
            if (!Array.isArray(params) || params.length == 0) return "";

            const tooltipParams = params as Array<{ dataIndex: number }>;
            const timestamp = timestamps[tooltipParams[0].dataIndex];
            const date = formatTimestampWithTimezone(
              timestamp,
              timezone,
              "PPP",
            );
            const dailyValue = dailyValues[tooltipParams[0].dataIndex];
            const cumulativeValue = cumulativeValues[tooltipParams[0].dataIndex];
            const dailyPoint = dailyPnLData[tooltipParams[0].dataIndex];

            let tooltipContent = createTooltipHeader(date);

            if (showDaily) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.dailyPnL"),
                fmt.num.compact.currency(dailyValue),
                { valueColor: dailyValue >= 0 ? profitColor : lossColor },
              );
            }

            if (showCumulative) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.cumulativePnL"),
                fmt.num.compact.currency(cumulativeValue),
              );
            }

            if (dailyPoint?.buyCount != null) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.buySwaps"),
                fmt.num.compact.decimal(dailyPoint.buyCount),
              );
            }
            if (dailyPoint?.sellCount != null) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.sellSwaps"),
                fmt.num.compact.decimal(dailyPoint.sellCount),
              );
            }
            if (dailyPoint?.swapCount != null) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.totalSwaps"),
                fmt.num.compact.decimal(dailyPoint.swapCount),
              );
            }
            if (dailyPoint?.buyVolumeUsd != null) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.buyVolume"),
                fmt.num.compact.currency(dailyPoint.buyVolumeUsd),
              );
            }
            if (dailyPoint?.sellVolumeUsd != null) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.sellVolume"),
                fmt.num.compact.currency(dailyPoint.sellVolumeUsd),
              );
            }
            if (dailyPoint?.totalVolumeUsd != null) {
              tooltipContent += createTooltipRow(
                tr("charts.pnlChart.totalVolume"),
                fmt.num.compact.currency(dailyPoint.totalVolumeUsd),
              );
            }

            return tooltipContent;
          },
        },
        xAxis: [
          {
            ...baseOption.xAxis,
            type: "category",
            data: xAxisData,
          },
        ],
        yAxis,
        series,
      };
    },
    [baseOption, timezone, tr, displayMode, fmt],
  );

  const chartOptions = useMemo(() => {
    if (!displayData || displayData.wallets.length == 0) return [];

    return displayData.wallets.map((wallet) => ({
      walletAddress: wallet.walletAddress,
      option: createChartOption(
        wallet.dailyPnL,
        wallet.cumulativePnL,
        displayData.wallets.length > 1 ? `${wallet.walletAddress.slice(0, 8)}...` : undefined,
      ),
    }));
  }, [displayData, createChartOption]);

  const isEmpty =
    !displayData ||
    displayData.wallets.length == 0 ||
    displayData.wallets.every((wallet) => wallet.dailyPnL.length == 0);

  const displayModeOptions: SegmentedControlOption<PnLDisplayMode>[] = [
    { value: "daily", icon: BarChart3, label: tr("charts.pnlChart.dailyPnL") },
    { value: "cumulative", icon: LineChart, label: tr("charts.pnlChart.cumulativePnL") },
    { value: "both", icon: ChartNoAxesCombined, label: tr("charts.pnlChart.both") },
  ];

  const periodOptions: Array<{ value: PnLTimePeriod; label: string }> = [
    { value: "7D", label: tr("charts.balanceChart.window7d") },
    { value: "30D", label: tr("charts.balanceChart.window30d") },
  ];

  return (
    <ChartWrapper
      title={chartTitle}
      loadingState={loadingState}
      isEmpty={isEmpty}
      onRetry={() => {
        if (hasWallets) {
          pnlData.mutate();
        }
      }}
      className={className}
      wrapperMinHeight={chartMinHeight}
      enableFullscreen={false}
      enableMiniPlayer={false}
      actions={
        <div className={chartControlStyles.toolbar}>
          <SegmentedControl
            ariaLabel={tr("charts.pnlChart.title")}
            options={displayModeOptions}
            value={displayMode}
            onChange={handleDisplayModeChange}
            iconOnly
          />
          <SegmentedControl
            ariaLabel={tr("charts.timePeriod")}
            options={periodOptions}
            value={chartTimePeriod}
            onChange={handleChartPeriodChange}
          />
          {externalActions}
        </div>
      }
    >
      {chartOptions.length > 0 && (
        <div
          style={{ display: "flex", flexDirection: "column", width: "100%", minWidth: 0 }}
        >
          <ChartGrid itemCount={chartOptions.length} multiItemColumns={2}>
            {chartOptions.map((chartData) => (
              <ChartGridItem
                key={chartData.walletAddress}
                itemKey={chartData.walletAddress}
                minHeight={chartMinHeight}
              >
                <ReactECharts
                  option={chartData.option}
                  style={{
                    height: "100%",
                    width: "100%",
                    minHeight: `${chartMinHeight}px`,
                  }}
                  notMerge
                  lazyUpdate
                />
              </ChartGridItem>
            ))}
          </ChartGrid>
        </div>
      )}
    </ChartWrapper>
  );
};
