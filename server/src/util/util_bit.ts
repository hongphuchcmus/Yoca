/**
 * Utility for Bitquery API calls
 * Reference: https://docs.bitquery.io/
 */

const BITQUERY_STREAMING_API_URL = "https://asia.streaming.bitquery.io/graphql";

export function getStreamingEndpoint(): URL {
  return new URL(BITQUERY_STREAMING_API_URL);
}

export function getRequiredHeaders(): Record<string, string> {
  const apiKey = process.env.BITQUERY_API_KEY;
  if (!apiKey) {
    throw new Error("BITQUERY_API_KEY environment variable is not set");
  }

  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}
