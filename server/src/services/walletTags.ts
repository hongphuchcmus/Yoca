import { db } from "@sv/db/index.js";
import { walletUserTags } from "@sv/db/schema.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { and, eq } from "drizzle-orm";

export async function getWalletTags(
  userId: string,
  walletAddress: string,
): Promise<string[]> {
  dataUsage.record("db_result");
  const [row] = await db
    .select({ tags: walletUserTags.tags })
    .from(walletUserTags)
    .where(
      and(
        eq(walletUserTags.userId, userId),
        eq(walletUserTags.walletAddress, walletAddress),
      ),
    )
    .limit(1);
  return row?.tags ?? [];
}

export async function setWalletTags(
  userId: string,
  walletAddress: string,
  tags: string[],
): Promise<void> {
  dataUsage.record("db_result");
  await db
    .insert(walletUserTags)
    .values({ userId, walletAddress, tags })
    .onConflictDoUpdate({
      target: [walletUserTags.userId, walletUserTags.walletAddress],
      set: { tags, updatedAt: new Date() },
    });
}
