import { Hono } from "hono";
import * as sim from "../util/util_sim.js";
import { TokenBalance } from "../data/api-token-schema.js";
import { ApiService } from "../services/api.service.js";
import { StorageService } from "../services/storage.service.js";
import {
  validateParam,
  addressParamSchema,
} from "../middleware/validation.middleware.js";
import type { RawBalance } from "../types/api.types.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const currentDir = dirname(__filename);
const app = new Hono();

const DEFAULT_LIMIT = 100;

app.get("/", (c) => {
  return c.json({ message: "Balances endpoint" }, 200);
});

app.get("/:address", validateParam(addressParamSchema), async (c) => {
  const { address } = c.req.valid("param");

  const simEndpoint = sim.getEndpoint(`/balances/${address}`);
  simEndpoint.search = new URLSearchParams({
    chains: "solana",
    limit: DEFAULT_LIMIT.toString(),
  }).toString();

  const request = new Request(simEndpoint, {
    method: "GET",
    headers: sim.getRequiredHeaders(),
  });

  const result = await ApiService.fetch<{
    balances: RawBalance[];
  }>(request, "Fetching balances");

  if ("error" in result) {
    return c.json(result.error, result.status as 502 | 500);
  }

  const balances: TokenBalance[] = result.data.balances.map(
    mapRawBalanceToTokenBalance,
  );

  if (StorageService.shouldSaveDebugFiles()) {
    const outPath = join(currentDir, `../temp/balance-${address}.json`);
    await StorageService.saveJson(outPath, balances);
  }

  return c.json(balances, 200);
});

function mapRawBalanceToTokenBalance(raw: RawBalance): TokenBalance {
  return {
    name: raw.name,
    symbol: raw.symbol,
    address: raw.address,
    amount: raw.amount,
    balance: raw.balance,
    valueUsd: Number(raw.value_usd),
    rawBalance: raw.raw_balance,
    decimals: raw.decimals,
  };
}

export default app;
