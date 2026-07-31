import "@sv/util/load-env.js";
import { syncHeliusWebhookAccountAddresses } from "@sv/services/heliusWebhooks.service.js";

async function main() {
  const result = await syncHeliusWebhookAccountAddresses();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

void main();
