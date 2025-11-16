// Utility for CoinGecko API calls

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";

export function getEndpoint(path: string): URL {
  return new URL(path, COINGECKO_API_URL);
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
