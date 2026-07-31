import env from "@sv/util/load-env.js";
import { db } from "@sv/db/index.js";
import { sql } from "drizzle-orm";
import {
  BENCHMARK_TOKEN_ADDRESS,
  BENCHMARK_USER_ID,
  BENCHMARK_WASH_TOKEN_ADDRESS,
} from "./benchmark-constants.js";

async function main(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into users (
        id,
        display_name,
        created_at,
        updated_at
      ) values (
        ${BENCHMARK_USER_ID},
        'Yoca Benchmark',
        current_timestamp,
        current_timestamp
      )
      on conflict (id) do update set
        display_name = excluded.display_name,
        updated_at = current_timestamp
    `);

    await tx.execute(sql`
      insert into subscriptions (
        user_id,
        stripe_subscription_id,
        stripe_customer_id,
        plan_tier,
        status,
        cancel_at_period_end,
        current_period_start,
        current_period_end,
        created_at,
        updated_at
      ) values (
        ${BENCHMARK_USER_ID},
        'benchmark_subscription',
        'benchmark_customer',
        'Pro',
        'active',
        false,
        current_timestamp,
        current_timestamp + interval '30 days',
        current_timestamp,
        current_timestamp
      )
      on conflict (stripe_subscription_id) do update set
        user_id = excluded.user_id,
        plan_tier = excluded.plan_tier,
        status = excluded.status,
        cancel_at_period_end = false,
        current_period_start = current_timestamp,
        current_period_end = current_timestamp + interval '30 days',
        updated_at = current_timestamp
    `);

    await tx.execute(sql`
      delete from ai_daily_usage
      where user_id = ${BENCHMARK_USER_ID}
    `);

    await tx.execute(sql`
      delete from token_ai_chat_cache
      where token_address = ${BENCHMARK_TOKEN_ADDRESS}
    `);

    await tx.execute(sql`
      delete from wash_trading_verdict_cache
      where mint = ${BENCHMARK_WASH_TOKEN_ADDRESS}
    `);
  });

  console.info("[business-model] benchmark user is ready", {
    userId: BENCHMARK_USER_ID,
    tier: "Pro",
    databaseConfigured: env.POSTGRES_DB_URL.length > 0,
  });
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[business-model] failed to prepare benchmark user", error);
  process.exit(1);
});
