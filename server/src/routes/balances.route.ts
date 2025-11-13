import { Hono } from "hono";
import * as sim from "../util/util_sim.js";
import { TokenBalance } from "../data/api-token-schema.js";
import type { BlankEnv } from "hono/types";

const app = new Hono();

app.get("/", async (c) => {
  return c.json({ message: "Balances endpoint" }, 200);
});

app.get("/:address", async (c) => {
  try {
    const address = c.req.param("address");
    if (!address) {
      return c.json({ error: "Missing address param" }, 400);
    }

    const simEndpoint = sim.getEndpoint(`/balances/${address}`);
    simEndpoint.searchParams.append("chains", "solana");
    simEndpoint.searchParams.append("limit", "100");

    const req = new Request(simEndpoint, {
      method: "GET",
      headers: sim.getRequiredHeaders(),
    });

    const resp = await fetch(req);

    if (resp.ok) {
      const data = await resp.json();

      const balances: TokenBalance[] = data.balances.map(
        (rawApiBalance: {
          name: string;
          symbol: string;
          address: string;
          amount: string;
          balance: string;
          value_usd: string;
          raw_balance: string;
          decimals: number;
        }): TokenBalance => ({
          name: rawApiBalance.name,
          symbol: rawApiBalance.symbol,
          address: rawApiBalance.address,
          amount: rawApiBalance.amount,
          balance: rawApiBalance.balance,
          valueUsd: Number(rawApiBalance.value_usd),
          rawBalance: rawApiBalance.raw_balance,
          decimals: rawApiBalance.decimals,
        }),
      );

      // TODO: Save to temp file if needed in production
      // const outPath = join(currentDir, `../temp/balance-${address}.json`);
      // await ensureFile(outPath);
      // const pretty = JSON.stringify(balances, null, 2);
      // await Deno.writeTextFile(outPath, pretty);

      return c.json(balances, 200);
    } else {
      return c.json(
        { error: `External API failed: ${resp.status} ${resp.statusText}` },
        502,
      );
    }
  } catch (err) {
    console.error("Error fetching balances:", err);
    return c.json({ error: String(err) }, 500);
  }
});

async function getAddressData(context: any)  {

}

export default app;
