export function getStreamingEndpoint(): URL {
  return new URL(process.env.BITQUERY_STREAM_API_ENDPOINT!);
}

// Please use this carefully since it is more expensive then query from streaming API
export function getEndpoint(): URL {
  return new URL(process.env.BITQUERY_API_ENDPOINT!);
}

export function getRequiredHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.BITQUERY_API_KEY!}`,
    "Content-Type": "application/json",
  };
}
