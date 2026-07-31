import type { WalletAnalysisSelect } from "@sv/db/schema";
import type { PnLDataPoint } from "@sv/services/wallet/dtos/walletDataObjects";
import {
  fetchWalletAnalysis,
  getWalletAnalysis,
  type WinratePeriod,
} from "../wallet-analysis";
import dayjs from "dayjs";

export interface WalletPnlHistoryData {
  walletAddress: string;
  walletName?: string;
  dailyPnL: DailyPnlActivityPoint[];
  cumulativePnL: PnLDataPoint[];
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
}

export interface DailyPnlActivityPoint extends PnLDataPoint {
  buyCount: number | null;
  sellCount: number | null;
  swapCount: number | null;
  buyVolumeUsd: number | null;
  sellVolumeUsd: number | null;
  totalVolumeUsd: number | null;
}

function mapStoredAnalysisToPnlHistory(
  row: WalletAnalysisSelect,
): WalletPnlHistoryData {
  const sourceDays =
    row.calendarBreakdown.length > 0
      ? row.calendarBreakdown.map((day) => ({
          date: day.date,
          realizedPnlUsd: day.realizedPnlUSD,
          buyCount: day.buys,
          sellCount: day.sells,
          swapCount: day.buys + day.sells,
          buyVolumeUsd: day.volumeBuy,
          sellVolumeUsd: day.volumeSell,
          totalVolumeUsd: day.totalVolume,
        }))
      : row.periodTimeframes.map((timeframe) => ({
          date: timeframe.date,
          realizedPnlUsd: timeframe.realized,
          buyCount: null,
          sellCount: null,
          swapCount: null,
          buyVolumeUsd: null,
          sellVolumeUsd: null,
          totalVolumeUsd: null,
        }));

  const dailyPnL = sourceDays
    .map((day) => ({
      timestamp: dayjs.utc(day.date).startOf("day").valueOf(),
      value: day.realizedPnlUsd,
      buyCount: day.buyCount,
      sellCount: day.sellCount,
      swapCount: day.swapCount,
      buyVolumeUsd: day.buyVolumeUsd,
      sellVolumeUsd: day.sellVolumeUsd,
      totalVolumeUsd: day.totalVolumeUsd,
    }))
    .filter((day) => Number.isFinite(day.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);

  let cumulativeValue = 0;
  const cumulativePnL = dailyPnL.map((day) => {
    cumulativeValue += day.value;
    return {
      timestamp: day.timestamp,
      value: cumulativeValue,
    };
  });

  return {
    walletAddress: row.walletAddress,
    walletName: row.walletAddress,
    dailyPnL,
    cumulativePnL,
    totalPnL: row.pnlTotalUsd,
    realizedPnL: row.pnlRealizedUsd,
    unrealizedPnL: row.pnlUnrealizedUsd,
  };
}

export async function fetchWalletPnlHistory(
  walletAddress: string,
  period: WinratePeriod,
): Promise<WalletPnlHistoryData> {
  return mapStoredAnalysisToPnlHistory(
    await fetchWalletAnalysis(walletAddress, period),
  );
}

export async function getWalletPnlHistory(
  walletAddress: string,
  period: WinratePeriod,
): Promise<WalletPnlHistoryData> {
  return mapStoredAnalysisToPnlHistory(
    await getWalletAnalysis(walletAddress, period),
  );
}

export async function getPnlHistory(
  wallets: string[] = [],
  period: WinratePeriod = "30D",
): Promise<WalletPnlHistoryData[]> {
  const normalizedWallets = Array.from(
    new Set(wallets.map((wallet) => wallet.trim()).filter(Boolean)),
  );
  return Promise.all(
    normalizedWallets.map((walletAddress) =>
      getWalletPnlHistory(walletAddress, period),
    ),
  );
}
