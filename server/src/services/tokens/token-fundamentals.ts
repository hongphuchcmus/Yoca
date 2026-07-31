import { TOKEN_FUNDAMENTALS_TTL_MS } from "@sv/config/constants.js";
import { db } from "@sv/db/index.js";
import {
    investors,
    tokenAllocations,
    tokenFundamentals,
    tokenInvestors,
    tokenUnlockAllocations,
    tokenUnlockEvents,
} from "@sv/db/schema.js";
import { validateApiResult } from "@sv/middlewares/validation.js";
import {
    mbl_TokenFundamentalsResponseSchema,
    type MBL_TokenFundamentalsResponse,
} from "@sv/services/_types/token-raw-responses.js";
import { pFetch } from "@sv/util/rate-limit.js";
import * as mobula from "@sv/util/util-mobula.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import dayjs from "dayjs";
import { and, eq, gte } from "drizzle-orm";

async function fetchMobulaTokenFundamentals(
  address: string,
): Promise<MBL_TokenFundamentalsResponse["data"] | null> {

  // Build and validate the provider request before domain normalization.

  const endpoint = mobula.getEndpoint("/1/metadata");
  endpoint.search = new URLSearchParams({
    asset: address,
    blockchain: "solana",
    full: "true",
  }).toString();

  const resp = await pFetch(
    mobula.spec,
    "mobula.svc.token_fundamentals",
    endpoint,
    {
      method: "GET",
      headers: mobula.getRequiredHeaders(),
    },
  );

  if (!resp.ok) {
    return null;
  }

  const parsed = await validateApiResult(
    mbl_TokenFundamentalsResponseSchema,
    resp,
  );
  return parsed?.data ?? null;
}

async function readTokenFundamentals(address: string) {
  // Read normalized domain records in parallel.
  const [allocationRows, unlockRows, investorRows] = await Promise.all([
    db
      .select({
        name: tokenAllocations.category,
        percentage: tokenAllocations.percentage,
      })
      .from(tokenAllocations)
      .where(eq(tokenAllocations.tokenAddress, address)),
    db
      .select({
        eventId: tokenUnlockEvents.id,
        unlockAt: tokenUnlockEvents.unlockAt,
        tokensToUnlock: tokenUnlockEvents.tokensToUnlock,
        category: tokenUnlockAllocations.category,
        tokenAmount: tokenUnlockAllocations.tokenAmount,
      })
      .from(tokenUnlockEvents)
      .leftJoin(
        tokenUnlockAllocations,
        eq(tokenUnlockAllocations.unlockEventId, tokenUnlockEvents.id),
      )
      .where(eq(tokenUnlockEvents.tokenAddress, address)),
    db
      .select({
        name: investors.name,
        type: investors.type,
        image: investors.imageUrl,
        countryName: investors.countryName,
        description: investors.description,
        lead: tokenInvestors.lead,
      })
      .from(tokenInvestors)
      .innerJoin(investors, eq(investors.id, tokenInvestors.investorId))
      .where(eq(tokenInvestors.tokenAddress, address)),
  ]);

  const unlockById = new Map<
    number,
    {
      unlock_date: number;
      tokens_to_unlock: number;
      allocation_details: Record<string, number>;
    }
  >();
  for (const row of unlockRows) {
    const existing = unlockById.get(row.eventId) ?? {
      unlock_date: dayjs.utc(row.unlockAt).valueOf(),
      tokens_to_unlock: row.tokensToUnlock,
      allocation_details: {},
    };
    if (row.category != null && row.tokenAmount != null) {
      existing.allocation_details[row.category] = row.tokenAmount;
    }
    unlockById.set(row.eventId, existing);
  }

  return {
    distribution: allocationRows,
    release_schedule: Array.from(unlockById.values()),
    investors: investorRows.map((row) => ({
      name: row.name,
      type: row.type ?? "",
      image: row.image ?? "",
      country_name: row.countryName ?? "",
      description: row.description ?? "",
      lead: row.lead,
    })),
  };
}

export async function getTokenFundamentals(address: string) {
  // Let PostgreSQL decide whether every fundamentals group is recent.
  const freshAfter = dayjs
    .utc()
    .subtract(TOKEN_FUNDAMENTALS_TTL_MS, "millisecond")
    .toDate();
  const [freshState] = await db
    .select({ tokenAddress: tokenFundamentals.tokenAddress })
    .from(tokenFundamentals)
    .where(
      and(
        eq(tokenFundamentals.tokenAddress, address),
        gte(tokenFundamentals.allocationsObservedAt, freshAfter),
        gte(tokenFundamentals.unlockScheduleObservedAt, freshAfter),
        gte(tokenFundamentals.investorsObservedAt, freshAfter),
      ),
    )
    .limit(1);

  if (freshState) {
    dataUsage.record("db_result");
    return readTokenFundamentals(address);
  }

  const [state] = await db
    .select()
    .from(tokenFundamentals)
    .where(eq(tokenFundamentals.tokenAddress, address))
    .limit(1);

  try {
    // Refresh only when at least one domain group is not recent.
    const fetched = await fetchMobulaTokenFundamentals(address);
    if (!fetched) {
      if (state) {
        dataUsage.record("db_result", "stale_fallback");
      }
      return state ? readTokenFundamentals(address) : null;
    }

    const now = dayjs.utc().toDate();
    const distribution = fetched.distribution;
    const releaseSchedule = fetched.release_schedule;
    const providerInvestors = fetched.investors;

    // Replace each provided group atomically without touching omitted groups.
    await db.transaction(async (tx) => {
      if (distribution != undefined) {
        await tx
          .delete(tokenAllocations)
          .where(eq(tokenAllocations.tokenAddress, address));
        if (distribution && distribution.length > 0) {
          await tx.insert(tokenAllocations).values(
            distribution.map((item) => ({
              tokenAddress: address,
              category: item.name,
              percentage: item.percentage,
              updatedAt: now,
            })),
          );
        }
      }

      if (releaseSchedule != undefined) {
        await tx
          .delete(tokenUnlockEvents)
          .where(eq(tokenUnlockEvents.tokenAddress, address));
        for (const event of releaseSchedule ?? []) {
          const unlockAt =
            event.unlock_date < 1_000_000_000_000
              ? dayjs.unix(event.unlock_date).utc().toDate()
              : dayjs.utc(event.unlock_date).toDate();
          const [insertedEvent] = await tx
            .insert(tokenUnlockEvents)
            .values({
              tokenAddress: address,
              unlockAt,
              tokensToUnlock: event.tokens_to_unlock,
              updatedAt: now,
            })
            .returning({ id: tokenUnlockEvents.id });
          const allocationEntries = Object.entries(event.allocation_details);
          if (allocationEntries.length > 0) {
            await tx.insert(tokenUnlockAllocations).values(
              allocationEntries.map(([category, tokenAmount]) => ({
                unlockEventId: insertedEvent.id,
                category,
                tokenAmount,
              })),
            );
          }
        }
      }

      if (providerInvestors != undefined) {
        await tx
          .delete(tokenInvestors)
          .where(eq(tokenInvestors.tokenAddress, address));
        for (const investor of providerInvestors ?? []) {
          const [storedInvestor] = await tx
            .insert(investors)
            .values({
              name: investor.name,
              type: investor.type || null,
              imageUrl: investor.image || null,
              countryName: investor.country_name || null,
              description: investor.description || null,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: investors.name,
              set: {
                type: investor.type || null,
                imageUrl: investor.image || null,
                countryName: investor.country_name || null,
                description: investor.description || null,
                updatedAt: now,
              },
            })
            .returning({ id: investors.id });
          await tx.insert(tokenInvestors).values({
            tokenAddress: address,
            investorId: storedInvestor.id,
            lead: investor.lead,
            updatedAt: now,
          });
        }
      }

      // Record independent observation times, including valid empty results.
      await tx
        .insert(tokenFundamentals)
        .values({
          tokenAddress: address,
          allocationsObservedAt:
            distribution != undefined ? now : state?.allocationsObservedAt,
          unlockScheduleObservedAt:
            releaseSchedule != undefined
              ? now
              : state?.unlockScheduleObservedAt,
          investorsObservedAt:
            providerInvestors != undefined ? now : state?.investorsObservedAt,
        })
        .onConflictDoUpdate({
          target: tokenFundamentals.tokenAddress,
          set: {
            allocationsObservedAt:
              distribution != undefined ? now : state?.allocationsObservedAt,
            unlockScheduleObservedAt:
              releaseSchedule != undefined
                ? now
                : state?.unlockScheduleObservedAt,
            investorsObservedAt:
              providerInvestors != undefined ? now : state?.investorsObservedAt,
          },
        });
    });

    dataUsage.record("db_result");
    return readTokenFundamentals(address);
  } catch (error) {
    console.warn("Token fundamentals refresh failed", {
      address,
      error: error instanceof Error ? error.message : String(error),
    });
    if (state) {
      dataUsage.record("db_result", "stale_fallback");
    }
    return state ? readTokenFundamentals(address) : null;
  }
}
