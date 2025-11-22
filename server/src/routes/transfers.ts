import { Hono } from "hono";
import * as bit from "../util/util-bitquery.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateQuery } from "../middlewares/validation.js";
import type { Transfer } from "../data/schema.js";
import { paginationSchema } from "../data/schema.js";
import { StorageService } from "../services/storage.service.js";
import { Message, messageText } from "../util/response-messages.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

async function getTokenImage(uri: string): Promise<string> {
  // Get metadata through provided URI
  const resp = await fetch(uri, { method: "GET" });
  if (resp.ok) {
    const metaData = await resp.json();
    return metaData.image ?? "";
  } else {
    // TODO: Set placeholder image
    return "placeholder";
  }
}

const app = new Hono()
  // Get Solana transactions from Bitquery
  .get("/", validateQuery(paginationSchema), async (c) => {
    try {
      const { limit } = c.req.valid("query");
      // GraphQL query to Bitquery
      const query = `
        {
          Solana {
            Transfers(limit: { count : ${limit}}, orderBy: {descending: Block_Time}) {
              Transfer {
                Amount
                AmountInUSD
                Sender {
                  Address
                }
                Receiver {
                  Address
                }
                Currency {
                  Symbol
                  Name
                  MintAddress
                  Native
                  Uri
                }
              }
              Block {
                Time
              }
            }
          }
        }
      `;

      const req = new Request(bit.getStreamingEndpoint(), {
        method: "POST",
        headers: bit.getRequiredHeaders(),
        body: JSON.stringify({
          query,
          variables: {},
        }),
      });

      const resp = await fetch(req);

      if (resp.ok) {
        const res = await resp.json();

        const transfers: Transfer[] = await Promise.all(
          // Bitquery wraps their return values in a "data" field
          res.data.Solana.Transfers.map(
            async (rawTransfer: any): Promise<Transfer> => {
              let tokenImgUrl = "";
              try {
                tokenImgUrl = await getTokenImage(
                  rawTransfer.Transfer.Currency.Uri,
                );
              } catch (err) {
                console.log("Unable to fetch image");
              }

              return {
                from: rawTransfer.Transfer.Sender.Address,
                to: rawTransfer.Transfer.Receiver.Address,
                amount: rawTransfer.Transfer.Amount,
                amountUsd: rawTransfer.Transfer.AmountInUSD,
                time: rawTransfer.Block.Time,
                tokenMeta: {
                  name: rawTransfer.Transfer.Currency.Name,
                  symbol: rawTransfer.Transfer.Currency.Symbol,
                  isNative: rawTransfer.Transfer.Currency.Native,
                  isWrapped: rawTransfer.Transfer.Currency.Wrapped,
                  address: rawTransfer.Transfer.Currency.MintAddress,
                  imageUrl: tokenImgUrl,
                },
              };
            },
          ),
        );

        if (StorageService.shouldSaveDebugFiles()) {
          const timestamp = StorageService.generateTimestamp();
          const outPath = join(
            currentDir,
            `../temp/transactions-${limit}-${timestamp}.json`,
          );
          await StorageService.saveJson(outPath, transfers);
        }

        return c.json(transfers, 200);
      } else {
        return c.json(messageText[Message.FailedToFetchExternalData], 502);
      }
    } catch (err) {
      return c.json(
        {
          message: "Internal Error",
          error: err,
        },
        500,
      );
    }
  });

export default app;
