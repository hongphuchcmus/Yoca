import { fetchHeliusWalletFirstFund } from "@sv/services/wallet/fetchers/walletDataFetcher.service.js";

export async function getWalletFirstFund(wallet: string) {
  const res = await fetchHeliusWalletFirstFund(wallet);
  return res.date;
}
