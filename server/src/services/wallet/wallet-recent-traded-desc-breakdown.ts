import { WALLET_POSITION_BREAKDOWN_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import { walletRecentTradedDescBreakdown } from "@sv/db/schema.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { singleFlight } from "@sv/services/util/single-flight.js";
import { desc, eq } from "drizzle-orm";
import dayjs from "dayjs";
import { fetchWalletPositionBreakdown } from "./wallet-position-breakdown.js";

async function storeWalletRecentTradedDescBreakdown(wallet: string) {
  const rows = await fetchWalletPositionBreakdown(wallet, "lastActivity");
  if (!rows) return null;
  await db.transaction(async (tx) => {
    await tx.delete(walletRecentTradedDescBreakdown).where(eq(walletRecentTradedDescBreakdown.address, wallet));
    if (rows.length > 0) await tx.insert(walletRecentTradedDescBreakdown).values(rows);
  });
  return rows;
}

const storedRecentTradedDescFlight = singleFlight(storeWalletRecentTradedDescBreakdown);

export async function getWalletRecentTradedDescBreakdown(wallet: string) {
  const stored = await db.select().from(walletRecentTradedDescBreakdown)
    .where(eq(walletRecentTradedDescBreakdown.address, wallet))
    .orderBy(desc(walletRecentTradedDescBreakdown.lastTradeUnixTime));
  if (stored.length > 0 && stored[0].updatedAtMs >= dayjs.utc().valueOf() - WALLET_POSITION_BREAKDOWN_TTL_MS) {
    dataUsage.record("db_result");
    return stored;
  }
  dataUsage.record("provider_result");
  try {
    return await storedRecentTradedDescFlight.key(`wallet_recent_traded_desc_breakdown:${wallet}`).run(wallet)
      ?? (stored.length > 0 ? stored : null);
  } catch (error) {
    if (stored.length > 0) {
      dataUsage.record("db_result", "stale_fallback");
      return stored;
    }
    throw error;
  }
}
