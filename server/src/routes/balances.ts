import { Hono } from "hono";
import * as sim from "../util/util-sim.js";
import { addressSchema, type TokenBalance } from "../data/schema.js";
import { Storage } from "../services/storage.js";
import { validateParam } from "../middlewares/validation.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Message, messageText } from "../util/response-messages.js";

const defaultLimit = 100;

const currentDir = dirname(fileURLToPath(import.meta.url));

const app = new Hono()
  // Demo endpoint
  .get("/", (c) => {
    return c.json({ message: "Balances endpoint" }, 200);
  })
  // Get balances of native token (SOL) & SPL tokens of an wallet using the wallet's address
  .get("/:address", validateParam(addressSchema), async (c) => {
    try {
      const { address } = c.req.valid("param");

      const simEndpoint = sim.getEndpoint(`/balances/${address}`);
      simEndpoint.search = new URLSearchParams({
        chains: "solana",
        limit: defaultLimit.toString(),
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
        if (Storage.shouldSaveDebugFiles()) {
          const outPath = join(currentDir, `../temp/balance-${address}.json`);
          await Storage.saveJson(outPath, balances);
        }
        return c.json(balances, 200);
      } else {
        return c.json(messageText[Message.FailedToFetchExternalData], 500);
      }
    } catch (err) {
      return c.json(
        {
          message:
            "There is a problem happended on the server. Please try again later.",
          error: err,
        },
        500,
      );
    }
  });

export default app;
