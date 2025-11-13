import { Hono } from "hono";
import * as bit from "../util/util_bit.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

const app = new Hono();
const __filename = fileURLToPath(import.meta.url);
const currentDir = dirname(__filename);

// Get simple non-SOL token transaction
app.get("/", async (c) => {
  try {
    const reqUrl = new URL(c.req.url);

    const searchParams = {
      limit: Number(reqUrl.searchParams.get("limit") ?? 50),
    };

    const bitUrl = bit.getStreamingEndpoint();

    const query = `
    {
      Solana {
        Transactions(limit: {count: ${searchParams.limit}}) {
          Transaction {
            Signature
            Signer
            FeePayer
            Fee
            Index
            Result {
              ErrorMessage
              Success
            }
            RecentBlockhash
            TokenBalanceUpdatesCount
            Result {
              Success
              ErrorMessage
            }
            InstructionsCount
            BalanceUpdatesCount
          }
          Block {
            Slot
            Time
            Height
            Hash
          }
        }
      }
    }
    `;

    const req = new Request(bitUrl, {
      method: "POST",
      headers: bit.getRequiredHeaders(),
      body: JSON.stringify({
        query,
        variables: {},
      }),
    });

    const resp = await fetch(req);

    if (resp.ok) {
      const data = await resp.json();
      // Save pretty JSON
      const dateStr = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/T/, " ")
        .replace(/\..+/, "");
      const outPath = join(
        currentDir,
        `../temp/transaction-top-${searchParams.limit}-${dateStr}.json`,
      );
      const tempDir = dirname(outPath);
      await mkdir(tempDir, { recursive: true });
      await writeFile(outPath, JSON.stringify(data, null, 2), "utf-8");

      return c.json(data, 200);
    } else {
      return c.json(
        { error: `External API failed: ${resp.status} ${resp.statusText}` },
        502,
      );
    }
  } catch (err) {
    console.error("Error fetching transactions:", err);
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
