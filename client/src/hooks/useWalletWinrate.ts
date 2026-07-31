import { useState, useEffect } from "react";
import client from "@/api/main";

export interface WalletWinrateStats {
  winRate: number;
  profitableTokenCount: number;
  unprofitableTokenCount: number;
  totalTokenCount: number;
  avgWinUsd: number;
  avgLossUsd: number;
}

export type WalletWinratePeriod = "24H" | "7D" | "30D" | "90D";

export function useWalletWinrate(
  walletAddress: string,
  period: WalletWinratePeriod,
) {
  const [stats, setStats] = useState<WalletWinrateStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!walletAddress || walletAddress === "null") return;

    setLoading(true);
    client.api.wallets.analysis.winrate
      .$get({
        query: {
          wallets: walletAddress,
          period,
        },
      })
      .then(async (res) => {
        if (!res.ok) throw new Error("API call failed");
        const data = await res.json();

        const walletStats = data.wallets?.find(
          (wallet) => wallet.walletAddress === walletAddress,
        );
        if (walletStats) {
          setStats({
            winRate: Number(walletStats.winrate ?? 0),
            profitableTokenCount: Number(walletStats.profitableTokens ?? 0),
            unprofitableTokenCount: Number(walletStats.unprofitableTokens ?? 0),
            totalTokenCount: Number(walletStats.totalTokens ?? 0),
            avgWinUsd: Number(walletStats.avgWinUsd ?? 0),
            avgLossUsd: Number(walletStats.avgLossUsd ?? 0),
          });
        } else {
          console.warn("Không tìm thấy stats cho ví:", walletAddress);
          setStats(null);
        }
      })
      .catch((err) => {
        console.error("Error fetching winrate:", err);
        setStats(null);
      })
      .finally(() => setLoading(false));
  }, [walletAddress, period]);

  return { stats, loading };
}
