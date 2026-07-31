import client from "@/api/main";
import { useGet } from "@/hooks/useGet";
import { fetchTotalTradingVolume } from "@/services/chart/chartApi";
import { useEffect, useMemo, useState } from "react";

export interface WalletMetricSummary {
  address: string;
  totalAssetValue: number | null;
  tradingVolume: number | null;
  winRate: number | null;
  totalTokens: number | null;
  pnl: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  profitableTokens: number | null;
  unprofitableTokens: number | null;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
}

export interface UseWalletComparisonSummaryResult {
  summaries: WalletMetricSummary[] | null;
  loading: boolean;
}

export function useWalletComparisonSummary(
  walletAddresses: string[],
  fetchEnabled: boolean,
  period = "30D",
): UseWalletComparisonSummaryResult {
  const walletsString = walletAddresses.join(",");
  const hasWallets = walletAddresses.length > 0;
  const enabled = fetchEnabled && hasWallets;

  const balanceResp = useGet(
    client.api.charts.balance,
    200,
    { query: { wallets: walletsString, timePeriod: period as never } },
    { enabled },
  );

  const winrateResp = useGet(
    client.api.wallets.analysis.winrate,
    200,
    { query: { wallets: walletsString, period: period as never } },
    { enabled },
  );

  const pnlResp = useGet(
    client.api.wallets.analysis["pnl-history"],
    200,
    { query: { wallets: walletsString, period: period as never } },
    { enabled },
  );

  const [volumeData, setVolumeData] = useState<{ wallet: string; tradingVolumeUsd: number | null }[] | null>(null);
  const [volumeLoading, setVolumeLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVolumeData(null);
      return;
    }
    let cancelled = false;
    setVolumeLoading(true);
    fetchTotalTradingVolume({ wallets: walletsString, period })
      .then((result) => {
        if (!cancelled) {
          const wallets = result.wallets;
          if (Array.isArray(wallets)) {
            setVolumeData(wallets as { wallet: string; tradingVolumeUsd: number | null }[]);
          } else {
            setVolumeData(null);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setVolumeData(null);
      })
      .finally(() => {
        if (!cancelled) setVolumeLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled, walletsString, period]);

  const summaries = useMemo((): WalletMetricSummary[] | null => {
    const balanceData = balanceResp.data;
    const winrateData = winrateResp.data;
    const pnlData = pnlResp.data;
    if (!balanceData || !winrateData || !pnlData) return null;

    return walletAddresses.map((address: string) => {
      const balancePoints = balanceData[address];
      const latestValue = balancePoints && balancePoints.length > 0
        ? balancePoints[balancePoints.length - 1].usdValue
        : null;

      const volEntry = volumeData?.find((w: { wallet: string }) => w.wallet === address);
      const wrEntry = winrateData?.wallets?.find((w: { walletAddress: string }) => w.walletAddress === address);
      const pnlEntry = pnlData?.wallets?.find((w: { walletAddress: string }) => w.walletAddress === address);

      return {
        address,
        totalAssetValue: latestValue,
        tradingVolume: volEntry?.tradingVolumeUsd ?? null,
        winRate: wrEntry?.winrate ?? null,
        totalTokens: wrEntry?.totalTokens ?? null,
        pnl: pnlEntry?.totalPnL ?? null,
        realizedPnl: pnlEntry?.realizedPnL ?? null,
        unrealizedPnl: pnlEntry?.unrealizedPnL ?? null,
        profitableTokens: wrEntry?.profitableTokens ?? null,
        unprofitableTokens: wrEntry?.unprofitableTokens ?? null,
        avgWinUsd: wrEntry?.avgWinUsd ?? null,
        avgLossUsd: wrEntry?.avgLossUsd ?? null,
      };
    });
  }, [balanceResp.data, winrateResp.data, pnlResp.data, volumeData, walletAddresses]);

  return {
    summaries,
    loading: balanceResp.isLoading || winrateResp.isLoading || pnlResp.isLoading || volumeLoading,
  };
}
