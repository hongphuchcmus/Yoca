import { useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useLocalization } from '@/contexts/LocalizationContext';
import { formatItemTooltip } from '@/util/tooltip-helpers';
import { useChartFiltersSync } from '@/hooks/useChartFiltersSync';
import {
  CHART_COLOR_PALETTE,
  useCarbonChartBaseOption,
} from '@/util/carbon-chart-base';
import type { WinrateRequestParams } from '@/types/chart-api.types';
import { ChartWrapper, ChartContainer, ChartSection, ChartGrid, ChartGridItem } from '../shared';
import type { ChartProps } from '../shared/ChartProp';
import { SegmentedControl, chartControlStyles } from '@/components/charts/shared/ChartControls';
import { useGet, UseGetResp } from '@/hooks/useGet';
import client from '@/api/main';

interface WinrateBin {
  range: string;
  count: number;
  min: number;
  max: number;
}

type WinrateTooltipParam = { value: number; dataIndex: number; name?: string; seriesName?: string };

type WinrateData = {
  wallets: {
    walletAddress: string;
    walletName?: string | undefined;
    winrate: number;
    totalTokens: number;
    profitableTokens: number;
    unprofitableTokens: number;
    winningDistribution: WinrateBin[];
    losingDistribution: WinrateBin[];
    avgWinUsd: number;
    avgLossUsd: number;
  }[];
}

export function WinrateChart({
  title,
  minHeight = 400,
  initialFilters = {
    timePeriod: "30D",
    wallets: [],
  },
}: ChartProps) {
  type WinrateTimeRange = "24H" | "7D" | "30D" | "90D";
  const WINRATE_TIME_RANGES: WinrateTimeRange[] = ["24H", "7D", "30D", "90D"];

  const { tr, fmt } = useLocalization();
  const chartTitle = title || tr("charts.winrateChart.title");
  const [timeRange, setTimeRange] = useState<WinrateTimeRange>("30D");

  const overallChartRef = useRef<ReactECharts>(null);
  const baseOption = useCarbonChartBaseOption();

  const { walletsString } = useChartFiltersSync({
    initialFilters,
    debounceDelay: 300,
  });

  useMemo<WinrateRequestParams>(
    () => ({
      period: timeRange,
      wallets: walletsString,
    }),
    [timeRange, walletsString],
  );

  const winRateData: UseGetResp<WinrateData> = useGet(client.api.wallets.analysis.winrate, 200, {
    query: {
      wallets: walletsString ?? "",
      period: timeRange,
    }
  })

  const overallWinrateOption = useMemo((): EChartsOption | null => {
    if (!winRateData.data || winRateData.data.wallets.length == 0) {
      return null;
    }

    const data = winRateData.data;

    const categories = data.wallets.map(w => fmt.text.address(w.walletAddress));
    const winrateValues = data.wallets.map(w => w.winrate);

    return {
      ...baseOption,
      xAxis: {
        ...baseOption.xAxis,
        type: "category",
        data: categories,
        axisLabel: {
          ...baseOption.xAxis.axisLabel,
          interval: 0,
          rotate: categories.length > 5 ? 30 : 0,
        },
      },
      yAxis: {
        ...baseOption.yAxis,
        type: "value",
        name: "Winrate (%)",
        min: 0,
        max: 100,
        axisLabel: {
          ...baseOption.yAxis.axisLabel,
          formatter: "{value}%",
        },
      },
      series: [
        {
          name: "Winrate",
          type: "bar",
          data: winrateValues,
          itemStyle: {
            color: CHART_COLOR_PALETTE[0],
          },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}%',
            color: baseOption.textStyle.color,
          },
        },
      ],
      legend: undefined,
      tooltip: {
        ...baseOption.tooltip,
        trigger: "axis",
        formatter: (params: unknown) => {
          const points = params as WinrateTooltipParam[];
          const param = points[0];
          const wallet = data.wallets[param.dataIndex];
          return formatItemTooltip(fmt.text.address(wallet.walletAddress), [
            { label: "Winrate", value: `${param.value}%` },
            { label: "Profitable Tokens", value: wallet.profitableTokens.toString() },
            { label: "Unprofitable Tokens", value: wallet.unprofitableTokens.toString() },
            { label: "Traded Tokens", value: wallet.totalTokens.toString() },
          ]);
        },
      },
    };
  }, [winRateData.data, baseOption]);

  const distributionCharts = useMemo(() => {
    if (!winRateData.data || winRateData.data.wallets.length == 0) {
      return [];
    }
    const data = winRateData.data;

    return data.wallets.map((wallet) => {
      const categories = [
        ...wallet.losingDistribution.map(d => d.range),
        ...wallet.winningDistribution.map(d => d.range),
      ];
      const winningCounts = [
        ...wallet.losingDistribution.map(() => 0),
        ...wallet.winningDistribution.map(d => d.count),
      ];
      const losingCounts = [
        ...wallet.losingDistribution.map(d => -d.count),
        ...wallet.winningDistribution.map(() => 0),
      ];

      const option: EChartsOption = {
        ...baseOption,
        title: wallet.walletAddress ? {
          text: fmt.text.address(wallet.walletAddress),
          left: 8,
          top: 8,
          textStyle: {
            color: baseOption.textStyle.color,
            fontSize: 16,
            fontWeight: 'bold',
          },
        } : undefined,
        grid: {
          left: "8%",
          right: "8%",
          bottom: "12%",
          top: "24%",
          containLabel: true,
        },
        xAxis: {
          ...baseOption.xAxis,
          type: "category",
          data: categories,
          axisLabel: {
            ...baseOption.xAxis.axisLabel,
            interval: 0,
            rotate: 30,
          },
        },
        yAxis: {
          ...baseOption.yAxis,
          type: "value",
          name: "Trade Count",
          axisLabel: {
            ...baseOption.yAxis.axisLabel,
            formatter: (value: number) => Math.abs(value).toString(),
          },
        },
        series: [
          {
            name: "Winning",
            type: "bar",
            stack: "total",
            data: winningCounts,
            itemStyle: {
              color: CHART_COLOR_PALETTE[1],
            },
          },
          {
            name: "Losing",
            type: "bar",
            stack: "total",
            data: losingCounts,
            itemStyle: {
              color: CHART_COLOR_PALETTE[2],
            },
          },
        ],
        legend: {
          show: true,
          data: ['Winning', 'Losing'],
          textStyle: { color: baseOption.textStyle.color },
        },
        tooltip: {
          ...baseOption.tooltip,
          trigger: "axis",
          axisPointer: {
            type: "shadow",
          },
          formatter: (params: unknown) => {
            const points = params as WinrateTooltipParam[];
            const winning = points.find((p) => p.seriesName === "Winning");
            const losing = points.find((p) => p.seriesName === "Losing");
            return `
              <div style="font-weight: 600; margin-bottom: 8px;">${points[0]?.name ?? ""}</div>
              ${winning ? `<div style="display: flex; justify-content: space-between; gap: 16px;">
                <span style="color: ${CHART_COLOR_PALETTE[1]}">● Winning:</span><strong>${winning.value}</strong>
              </div>` : ''}
              ${losing ? `<div style="display: flex; justify-content: space-between; gap: 16px;">
                <span style="color: ${CHART_COLOR_PALETTE[2]}">● Losing:</span><strong>${Math.abs(losing.value)}</strong>
              </div>` : ''}
            `;
          },
        },
      };

      return {
        walletAddress: wallet.walletAddress,
        option,
      };
    });
  }, [winRateData.data, baseOption]);

  const timeRangeOptions = WINRATE_TIME_RANGES.map(r => ({ value: r, label: r }));

  return (
    <ChartWrapper
      title={chartTitle}
      loadingState={{
        status: winRateData.isLoading ? "loading" : "idle",
        retryCount: 0,
      }}
      isEmpty={winRateData.data ? winRateData.data.wallets.length > 0 : false}
      onRetry={() => winRateData.mutate()}
      toolbarLayout="stacked"
      enableMiniPlayer={false}
      enableExport={false}
      enableFullscreen={false}
      actions={
        <div className={chartControlStyles.toolbar}>
          <SegmentedControl
            ariaLabel={tr("charts.timePeriod")}
            options={timeRangeOptions}
            value={timeRange}
            onChange={(value) => {
              if (
                value === "24H" ||
                value === "7D" ||
                value === "30D" ||
                value === "90D"
              ) {
                setTimeRange(value);
              }
            }}
          />
        </div>
      }
    >
      <ChartContainer gap="0">
        <ChartSection minHeight="300px">
          {overallWinrateOption && (
            <ChartGridItem minHeight={300}>
              <ReactECharts
                ref={overallChartRef}
                option={overallWinrateOption}
                style={{
                  height: "100%",
                  width: "100%",
                  minHeight: `${minHeight}px`,
                }}
                notMerge
                lazyUpdate
              />
            </ChartGridItem>
          )}
        </ChartSection>

        <ChartGrid
          itemCount={distributionCharts?.length}
          autoFit
          minColumnWidth="400px"
        >
          {distributionCharts.map((chart) => (
            <ChartGridItem
              key={chart.walletAddress}
              itemKey={chart.walletAddress}
              minHeight={300}
            >
              <ReactECharts
                option={chart.option}
                style={{ height: "100%", width: "100%" }}
                notMerge
                lazyUpdate
              />
            </ChartGridItem>
          ))}
        </ChartGrid>
      </ChartContainer>
    </ChartWrapper>
  );
}
