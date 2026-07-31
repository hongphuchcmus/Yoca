import { saveWalletFirstFundCache } from "@sv/services/wallet/db/walletDataCacher.js";
import { getCachedWalletFirstFund } from "@sv/services/wallet/db/walletDataRetriever.js";
import { HeliusWalletFirstFund } from "@sv/services/wallet/dtos/walletDataObjects.js";
import { fetchHeliusWalletFirstFund } from "@sv/services/wallet/fetchers/walletDataFetcher.service.js";
import { dataUsage } from "@sv/middlewares/request-context.js";

export async function getWalletFirstFund(
  address: string,
): Promise<HeliusWalletFirstFund | null> {
  const normalizedAddress = address.trim();
  console.log("[wallet-first-fund] resolving", normalizedAddress);

  const cached = await getCachedWalletFirstFund(normalizedAddress);
  // const cached = null; // TODO: re-enable cache once we have some data and can verify cache correctness
  if (cached) {
    dataUsage.record("db_result");
    console.log("[wallet-first-fund] cache hit", normalizedAddress);
    return cached as HeliusWalletFirstFund;
  } else {
    try {
      console.log(
        "[wallet-first-fund] cache miss, fetching provider",
        normalizedAddress,
      );
      const firstFund = await fetchHeliusWalletFirstFund(normalizedAddress);
      await saveWalletFirstFundCache(firstFund);

      console.log(
        "[wallet-first-fund] fetched and cached",
        normalizedAddress,
        firstFund,
      );
      return firstFund;
    } catch (err) {
      console.error("[wallet-first-fund] failed", normalizedAddress, err);
      return null;
    }
  }
}
