// Utility for CoinGecko API calls

export function getEndpoint(path: string): URL {
  return new URL(path, process.env.COINGECKO_API_BASE_URL);
}

export function getRequiredHeaders(): Record<string, string> {
  const apiKey = process.env.COINGECKO_API_KEY;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey;
  }

  return headers;
}
