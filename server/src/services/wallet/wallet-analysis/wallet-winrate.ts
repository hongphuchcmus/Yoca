import type { WalletAnalysisSelect } from "@sv/db/schema";
import {
  fetchWalletAnalysis,
  getWalletAnalysis,
  type WalletWinrateData,
  type WinratePeriod,
} from "../wallet-analysis";

function mapStoredWinrateToResponse(
  row: WalletAnalysisSelect,
): WalletWinrateData {
  return {
    walletAddress: row.walletAddress,
    walletName: row.walletAddress,
    winrate: row.winrate,
    totalTokens: row.totalTrades,
    profitableTokens: row.winningTrades,
    unprofitableTokens: row.losingTrades,
    winningDistribution: [
      { range: "0%-50%", count: row.win0To50Count, min: 0, max: 50 },
      { range: "50%-200%", count: row.win50To200Count, min: 50, max: 200 },
      { range: "200%-500%", count: row.win200To500Count, min: 200, max: 500 },
      { range: ">500%", count: row.winOver500Count, min: 500, max: Infinity },
    ],
    losingDistribution: [
      { range: "-50%-0%", count: row.loss0To50Count, min: 0, max: 50 },
      { range: "<-50%", count: row.lossOver50Count, min: 50, max: Infinity },
    ],
    avgWinUsd: row.avgWinUsd,
    avgLossUsd: row.avgLossUsd,
  };
}

export async function fetchWalletWinrateData(
  walletAddress: string,
  period: WinratePeriod,
): Promise<WalletWinrateData> {
  return mapStoredWinrateToResponse(
    await fetchWalletAnalysis(walletAddress, period),
  );
}
export async function getWalletWinrateData(
  walletAddress: string,
  period: WinratePeriod,
): Promise<WalletWinrateData> {
  return mapStoredWinrateToResponse(
    await getWalletAnalysis(walletAddress, period),
  );
}

export async function getWinrateData(
  wallets: string[] = [],
  period: WinratePeriod = "30D",
): Promise<WalletWinrateData[]> {
  const normalizedWallets = Array.from(
    new Set(wallets.map((wallet) => wallet.trim()).filter(Boolean)),
  );
  const winrateItems = await Promise.all(
    normalizedWallets.map((walletAddress) =>
      getWalletWinrateData(walletAddress, period),
    ),
  );

  return winrateItems;
}
