import { WALLET_POSITION_BREAKDOWN_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { walletRealizedPnlDescBreakdown } from "@sv/db/schema.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { singleFlight } from "@sv/services/util/single-flight.js";
import { desc, eq } from "drizzle-orm";
import dayjs from "dayjs";
import { fetchWalletPositionBreakdown } from "./wallet-position-breakdown.js";

async function storeWalletRealizedPnlDescBreakdown(wallet: string) {
  const rows = await fetchWalletPositionBreakdown(wallet, "realizedPnl");
  if (!rows) return null;
  await db.transaction(async (tx) => {
    await tx.delete(walletRealizedPnlDescBreakdown).where(eq(walletRealizedPnlDescBreakdown.address, wallet));
    if (rows.length > 0) await tx.insert(walletRealizedPnlDescBreakdown).values(rows);
  });
  return rows;
}

const storedRealizedPnlDescFlight = singleFlight(storeWalletRealizedPnlDescBreakdown);

export async function getWalletRealizedPnlDescBreakdown(wallet: string) {
  const stored = await db.select().from(walletRealizedPnlDescBreakdown)
    .where(eq(walletRealizedPnlDescBreakdown.address, wallet))
    .orderBy(desc(walletRealizedPnlDescBreakdown.realizedProfitUsd));
  if (stored.length > 0 && stored[0].updatedAtMs >= dayjs.utc().valueOf() - WALLET_POSITION_BREAKDOWN_TTL_MS) {
    dataUsage.record("db_result");
    return stored;
  }
  dataUsage.record("provider_result");
  try {
    return await storedRealizedPnlDescFlight.key(`wallet_realized_pnl_desc_breakdown:${wallet}`).run(wallet)
      ?? (stored.length > 0 ? stored : null);
  } catch (error) {
    if (stored.length > 0) {
      dataUsage.record("db_result", "stale_fallback");
      return stored;
    }
    throw error;
  }
}
