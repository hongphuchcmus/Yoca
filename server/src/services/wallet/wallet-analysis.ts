import {
    WALLET_WINRATE_24H_TTL_MS,
    WALLET_WINRATE_30D_TTL_MS,
    WALLET_WINRATE_7D_TTL_MS,
    WALLET_WINRATE_90D_TTL_MS,
} from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { walletAnalyses, type WalletAnalysisSelect } from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { mbl_WalletAnalysisSchema } from "@sv/services/_types/wallet-raw-responses.js";
import { singleFlight } from "@sv/services/util/single-flight.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as mobula from "@sv/util/util-mobula.js";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";

export type WinratePeriod = "24H" | "7D" | "30D" | "90D";

export interface WinrateBin {
  range: string;
  count: number;
  min: number;
  max: number;
}

export interface WalletWinrateData {
  walletAddress: string;
  walletName?: string;
  winrate: number;
  totalTokens: number;
  profitableTokens: number;
  unprofitableTokens: number;
  winningDistribution: WinrateBin[];
  losingDistribution: WinrateBin[];
  avgWinUsd: number;
  avgLossUsd: number;
}

const WINRATE_TTL_BY_PERIOD: Record<WinratePeriod, number> = {
  "24H": WALLET_WINRATE_24H_TTL_MS,
  "7D": WALLET_WINRATE_7D_TTL_MS,
  "30D": WALLET_WINRATE_30D_TTL_MS,
  "90D": WALLET_WINRATE_90D_TTL_MS,
};

const MOBULA_PERIOD_BY_WINRATE_PERIOD: Record<WinratePeriod, string> = {
  "24H": "1d",
  "7D": "7d",
  "30D": "30d",
  "90D": "90d",
};

async function fetchAndStoreWalletAnalysis(
  walletAddress: string,
  period: WinratePeriod,
): Promise<WalletAnalysisSelect> {
  const endpoint = mobula.getEndpoint("/2/wallet/analysis");
  endpoint.search = new URLSearchParams({
    wallet: walletAddress,
    blockchain: "solana:solana",
    period: MOBULA_PERIOD_BY_WINRATE_PERIOD[period],
  }).toString();

  const response = await pFetch(
    mobula.spec,
    "mobula.svc.wallet_analysis",
    endpoint,
    {
      method: "GET",
      headers: mobula.getRequiredHeaders(),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Mobula wallet analysis failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }

  const result = await validateApiResult(mbl_WalletAnalysisSchema, response);
  if (!result) {
    throw new Error(
      `Mobula wallet analysis returned invalid data (${response.status})`,
    );
  }

  const distribution = result.data.winRateDistribution;
  const win0To50Count = distribution["0%-50%"];
  const win50To200Count = distribution["50%-200%"];
  const win200To500Count = distribution["200%-500%"];
  const winOver500Count = distribution[">500%"];
  const loss0To50Count = distribution["-50%-0%"];
  const lossOver50Count = distribution["<-50%"];
  const profitableTokens = result.data.stat.periodWinCount;
  const totalTokens = result.data.stat.periodActiveTokensCount;
  const unprofitableTokens = Math.max(0, totalTokens - profitableTokens);
  const totalWinUsd = result.data.stat.winRealizedPnl;
  const totalLossUsd = Math.max(
    0,
    totalWinUsd - result.data.stat.periodRealizedPnlUSD,
  );
  const fetchedAtMs = dayjs.utc().valueOf();

  const winrate = totalTokens > 0 ? (profitableTokens / totalTokens) * 100 : 0;

  const rows = await db
    .insert(walletAnalyses)
    .values({
      walletAddress,
      period,
      winrate,
      // Legacy database column names store token-level win-rate counts.
      totalTrades: totalTokens,
      winningTrades: profitableTokens,
      losingTrades: unprofitableTokens,
      avgWinUsd: profitableTokens > 0 ? totalWinUsd / profitableTokens : 0,
      avgLossUsd:
        unprofitableTokens > 0 ? totalLossUsd / unprofitableTokens : 0,
      win0To50Count,
      win50To200Count,
      win200To500Count,
      winOver500Count,
      loss0To50Count,
      lossOver50Count,
      buyVolumeUsd: result.data.stat.periodVolumeBuy,
      sellVolumeUsd: result.data.stat.periodVolumeSell,
      buyTransactionCount: result.data.stat.periodBuys,
      sellTransactionCount: result.data.stat.periodSells,
      transactionCount:
        result.data.stat.periodBuys + result.data.stat.periodSells,
      tokensTradedCount: result.data.stat.periodTradingTokens,
      pnlTotalUsd: result.data.stat.periodTotalPnlUSD,
      pnlRealizedUsd: result.data.stat.periodRealizedPnlUSD,
      pnlUnrealizedUsd:
        result.data.stat.periodTotalPnlUSD -
        result.data.stat.periodRealizedPnlUSD,
      periodTimeframes: result.data.periodTimeframes,
      calendarBreakdown: result.data.calendarBreakdown ?? [],
      fetchedAtMs,
    })
    .onConflictDoUpdate({
      target: [walletAnalyses.walletAddress, walletAnalyses.period],
      set: {
        winrate,
        totalTrades: totalTokens,
        winningTrades: profitableTokens,
        losingTrades: unprofitableTokens,
        avgWinUsd: profitableTokens > 0 ? totalWinUsd / profitableTokens : 0,
        avgLossUsd:
          unprofitableTokens > 0 ? totalLossUsd / unprofitableTokens : 0,
        win0To50Count,
        win50To200Count,
        win200To500Count,
        winOver500Count,
        loss0To50Count,
        lossOver50Count,
        buyVolumeUsd: result.data.stat.periodVolumeBuy,
        sellVolumeUsd: result.data.stat.periodVolumeSell,
        buyTransactionCount: result.data.stat.periodBuys,
        sellTransactionCount: result.data.stat.periodSells,
        transactionCount:
          result.data.stat.periodBuys + result.data.stat.periodSells,
        tokensTradedCount: result.data.stat.periodTradingTokens,
        pnlTotalUsd: result.data.stat.periodTotalPnlUSD,
        pnlRealizedUsd: result.data.stat.periodRealizedPnlUSD,
        pnlUnrealizedUsd:
          result.data.stat.periodTotalPnlUSD -
          result.data.stat.periodRealizedPnlUSD,
        periodTimeframes: result.data.periodTimeframes,
        calendarBreakdown: result.data.calendarBreakdown ?? [],
        fetchedAtMs,
      },
    })
    .returning();

  const saved = rows[0];
  if (!saved) {
    throw new Error("Failed to persist Mobula wallet analysis");
  }

  return saved;
}

export const fetchWalletAnalysis = singleFlight(fetchAndStoreWalletAnalysis).by(
  (walletAddress, period) => `wallet_analysis:${walletAddress}:${period}`,
);

export async function getWalletAnalysis(
  walletAddress: string,
  period: WinratePeriod,
): Promise<WalletAnalysisSelect> {
  const storedRows = await db
    .select()
    .from(walletAnalyses)
    .where(
      and(
        eq(walletAnalyses.walletAddress, walletAddress),
        eq(walletAnalyses.period, period),
      ),
    )
    .limit(1);
  const stored = storedRows[0];

  if (
    stored &&
    stored.fetchedAtMs >= dayjs.utc().valueOf() - WINRATE_TTL_BY_PERIOD[period]
  ) {
    dataUsage.record("db_result");
    return stored;
  }

  dataUsage.record("provider_result");

  try {
    return await fetchWalletAnalysis(walletAddress, period);
  } catch (error) {
    if (stored) {
      dataUsage.record("db_result", "stale_fallback");
      console.warn("Mobula win-rate refresh failed; returning stored data", {
        walletAddress,
        period,
        error,
      });
      return stored;
    }

    throw error;
  }
}

export * from "./wallet-analysis/wallet-winrate";
export * from "./wallet-analysis/wallet-pnl-history";
