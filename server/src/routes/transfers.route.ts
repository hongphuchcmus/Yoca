import { Hono } from "hono";
import * as bit from "../util/util_bit.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateQuery,
  paginationSchema,
} from "../middleware/validation.middleware.js";
import { ApiService } from "../services/api.service.js";
import { StorageService } from "../services/storage.service.js";

const app = new Hono();
const __filename = fileURLToPath(import.meta.url);
const currentDir = dirname(__filename);

// GraphQL query for fetching Solana transactions
const TRANSACTIONS_QUERY = `
  query GetTransactions($limit: Int!) {
    Solana {
      Transactions(limit: {count: $limit}) {
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

/**
 * Get Solana transactions from Bitquery
 */
app.get("/", validateQuery(paginationSchema), async (c: any) => {
  const { limit } = c.req.valid("query") as { limit: number };

  const request = new Request(bit.getStreamingEndpoint(), {
    method: "POST",
    headers: bit.getRequiredHeaders(),
    body: JSON.stringify({
      query: TRANSACTIONS_QUERY,
      variables: { limit },
    }),
  });

  const result = await ApiService.fetch<any>(request, "Fetching transactions");

  if ("error" in result) {
    return c.json(result.error, result.status as 502 | 500);
  }

  // Optional: Save to temp file in development
  if (StorageService.shouldSaveDebugFiles()) {
    const timestamp = StorageService.generateTimestamp();
    const outPath = join(
      currentDir,
      `../temp/transactions-${limit}-${timestamp}.json`,
    );
    await StorageService.saveJson(outPath, result.data);
  }

  return c.json(result.data, 200);
});

export default app;
