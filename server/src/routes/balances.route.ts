import { Hono } from "hono";
import * as sim from "../util/util_sim.js";
import { TokenBalance } from "../data/api-token-schema.js";
import { StorageService } from "../services/storage.service.js";
import {
  validateParam,
  addressParamSchema,
} from "../middleware/validation.middleware.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LIMIT = 100;

const __filename = fileURLToPath(import.meta.url);
const currentDir = dirname(__filename);
const app = new Hono()
  .get("/", (c) => {
    return c.json({ message: "Balances endpoint" }, 200);
  })
  .get("/:address", validateParam(addressParamSchema), async (c) => {
    try {
      const { address } = c.req.valid("param");

      const simEndpoint = sim.getEndpoint(`/balances/${address}`);
      simEndpoint.search = new URLSearchParams({
        chains: "solana",
        limit: DEFAULT_LIMIT.toString(),
      }).toString();

      const req = new Request(simEndpoint, {
        method: "GET",
        headers: sim.getRequiredHeaders(),
      });

      const resp = await fetch(req);
      if (resp.ok) {
        const data = await resp.json();

        const balances: TokenBalance[] = data.balances.map(
          (rawApiBalance: any): TokenBalance => ({
            name: rawApiBalance.name,
            symbol: rawApiBalance.symbol,
            address: rawApiBalance.address,
            amount: rawApiBalance.amount,
            balance: rawApiBalance.balance,
            valueUsd: rawApiBalance.value_usd,
            rawBalance: rawApiBalance.raw_balance,
            decimals: rawApiBalance.decimals,
          }),
        );
        if (StorageService.shouldSaveDebugFiles()) {
          const outPath = join(currentDir, `../temp/balance-${address}.json`);
          await StorageService.saveJson(outPath, balances);
        }
        return c.json(balances, 200);
      } else {
        return c.json("Failed to fetch data from external sources", 502);
      }
    } catch (err) {}
  });

export default app;
