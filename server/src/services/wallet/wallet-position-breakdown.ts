import { WALLET_POSITION_BREAKDOWN_FETCH_LIMIT } from "@sv/config/constants.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import { mbl_WalletPositionsSchema } from "@sv/services/_types/wallet-raw-responses.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as mobula from "@sv/util/util-mobula.js";
import dayjs from "dayjs";

export interface WalletPositionBreakdownRow {
  address: string;
  tokenAddress: string;
  symbol: string | null;
  lastTradeUnixTime: number;
  totalBuyCount: number;
  totalSellCount: number;
  totalTradeCount: number;
  totalBoughtAmount: number;
  totalSoldAmount: number;
  balanceAmount: number;
  costOfQuantitySold: number;
  totalBoughtUsd: number;
  totalSoldUsd: number;
  currentValue: number;
  realizedProfitUsd: number;
  realizedProfitPercent: number;
  unrealizedProfitUsd: number;
  unrealizedProfitPercent: number;
  avgBuyCost: number;
  avgSellCost: number;
  updatedAtMs: number;
}

export async function fetchWalletPositionBreakdown(
  wallet: string,
  sortBy: "lastActivity" | "realizedPnl",
): Promise<WalletPositionBreakdownRow[] | null> {
  const endpoint = mobula.getEndpoint("/2/wallet/positions");
  endpoint.search = new URLSearchParams({
    wallet,
    blockchains: "solana:solana",
    limit: String(WALLET_POSITION_BREAKDOWN_FETCH_LIMIT),
    sortBy,
    order: "desc",
    includeFees: "false",
    includeAllBalances: "false",
    onlyOpen: "false",
  }).toString();

  const response = await pFetch(
    mobula.spec,
    sortBy == "lastActivity"
      ? "mobula.svc.wallet_recent_traded_desc_breakdown"
      : "mobula.svc.wallet_realized_pnl_desc_breakdown",
    endpoint,
    { method: "GET", headers: mobula.getRequiredHeaders() },
  );
  const result = await validateApiResult(mbl_WalletPositionsSchema, response);
  if (!result) return null;

  const updatedAtMs = dayjs.utc().valueOf();
  return result.data.map((position) => {
    const costOfQuantitySold = Math.max(0, position.volumeSell - position.realizedPnlUSD);
    const unrealizedCostBasis = Math.max(0, position.amountUSD - position.unrealizedPnlUSD);
    return {
      address: wallet,
      tokenAddress: position.token.address,
      symbol: position.token.symbol ?? null,
      lastTradeUnixTime: position.lastDate ? dayjs.utc(position.lastDate).unix() : 0,
      totalBuyCount: position.buys,
      totalSellCount: position.sells,
      totalTradeCount: position.buys + position.sells,
      totalBoughtAmount: position.volumeBuyToken,
      totalSoldAmount: position.volumeSellToken,
      balanceAmount: position.balance,
      costOfQuantitySold,
      totalBoughtUsd: position.volumeBuy,
      totalSoldUsd: position.volumeSell,
      currentValue: position.amountUSD,
      realizedProfitUsd: position.realizedPnlUSD,
      realizedProfitPercent: costOfQuantitySold > 0 ? position.realizedPnlUSD / costOfQuantitySold : 0,
      unrealizedProfitUsd: position.unrealizedPnlUSD,
      unrealizedProfitPercent: unrealizedCostBasis > 0 ? position.unrealizedPnlUSD / unrealizedCostBasis : 0,
      avgBuyCost: position.avgBuyPriceUSD ?? 0,
      avgSellCost: position.avgSellPriceUSD ?? 0,
      updatedAtMs,
    };
  });
}
