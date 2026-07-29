/**
 * Solana Payment API Service
 *
 * Frontend API calls for Solana Devnet payment verification.
 * Used by the SolanaPaymentFlow component.
 */

export type VerifySolanaPaymentRequest = {
  txId: string;
  tier: "Lite" | "Plus" | "Pro";
  network: "devnet" | "testnet" | "mainnet-beta";
};

export type VerifySolanaPaymentResponse = {
  success: boolean;
  subscriptionId: string;
  status: string;
  txId: string;
  errorCode?: string;
  message?: string;
};

export type SolanaQuote = {
  tier: "Lite" | "Plus" | "Pro";
  /** SOL the user must transfer. Server-authoritative — never compute this client-side. */
  amountSol: number;
  /** Live SOL/USD rate, or null when the server uses fixed devnet pricing. */
  solPriceUsd: number | null;
  amountUsd: number | null;
  livePricing: boolean;
};

export function getSolanaPaymentApiDomain(): string {
  return (
    import.meta.env.VITE_CLIENT_API_DOMAIN ||
    import.meta.env.VITE_API_DOMAIN ||
    window.location.origin
  );
}

/**
 * Fetch the SOL amount owed for a tier.
 *
 * The amount depends on SOLANA_LIVE_PRICING_ENABLED on the server, so it must
 * come from the server — a locally computed amount would be rejected by
 * verification once live pricing is on.
 */
export async function fetchSolanaQuote(
  tier: "Lite" | "Plus" | "Pro"
): Promise<SolanaQuote> {
  const response = await fetch(
    `${getSolanaPaymentApiDomain()}/api/payment/solana-quote?tier=${tier}`,
    { credentials: "include" }
  );

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson
    ? (await response.json() as SolanaQuote & { message?: string })
    : ({ message: await response.text() } as Partial<SolanaQuote> & { message?: string });

  if (!response.ok) {
    const message = data.message || `Quote API failed (HTTP ${response.status})`;
    console.error("[fetchSolanaQuote] Error response:", response.status, data);
    throw new Error(message);
  }

  return data as SolanaQuote;
}

/**
 * Verify a Solana Devnet transaction and activate subscription.
 *
 * @param txId - Transaction signature from Solana blockchain
 * @param tier - Subscription tier to activate
 * @returns Verification response with subscription details
 */
export async function verifySolanaPayment(
  request: VerifySolanaPaymentRequest
): Promise<VerifySolanaPaymentResponse> {
  // NOTE: The backend mounts this router at /api/payment (singular).
  // Do NOT change to /api/payments — that path does not exist.
  const response = await fetch(
    `${getSolanaPaymentApiDomain()}/api/payment/verify-solana`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Include auth cookies
      body: JSON.stringify(request),
    }
  );

  // Safely parse the response body — a non-JSON 404/500 page would crash .json()
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson
    ? (await response.json() as VerifySolanaPaymentResponse)
    : ({ message: await response.text() } as Partial<VerifySolanaPaymentResponse>);

  if (!response.ok) {
    const message = data.message || `Verification API failed (HTTP ${response.status})`;
    console.error("[verifySolanaPayment] Error response:", response.status, data);
    throw new Error(message);
  }

  return data as VerifySolanaPaymentResponse;
}

