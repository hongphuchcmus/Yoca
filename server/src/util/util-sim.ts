const SIMPLEHASH_API_URL = "https://api.simplehash.com/api/v0";

export function getEndpoint(path: string): URL {
  return new URL(path, SIMPLEHASH_API_URL);
}

export function getRequiredHeaders(): Record<string, string> {
  const apiKey = process.env.SIMPLEHASH_API_KEY;
  if (!apiKey) {
    throw new Error("SIMPLEHASH_API_KEY environment variable is not set");
  }

  return {
    "X-API-KEY": apiKey,
    "Content-Type": "application/json",
  };
}
