import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { Connection, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { fetchSolanaQuote, verifySolanaPayment, type SolanaQuote } from "@/services/payment/solanaPaymentApi";
import { PrivacyTransactionId } from "./PrivacyTransactionId";
import { useLocalization } from "@/contexts/LocalizationContext";
import { 
  getValidatedSolanaNetwork, 
  getExpectedGenesisHash, 
  getNetworkDisplayName 
} from "@/util/solanaNetwork";

/**
 * Tier pricing in SOL is NOT defined here.
 *
 * The amount comes from GET /api/payment/solana-quote, because the server may be
 * running with live USD -> SOL conversion (SOLANA_LIVE_PRICING_ENABLED). A
 * locally computed amount would drift from the server's and get rejected during
 * verification, after the user has already paid.
 */

type SolanaPaymentFlowProps = {
  tierName: string;
  tierPrice: string;
  tierKey: "Lite" | "Plus" | "Pro";
  isProcessing: boolean;
  errorMsg: string | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onProcessingChange: (processing: boolean) => void;
  onCancel: () => void;
};

type BuildSolanaPaymentTransactionParams = {
  payer: PublicKey;
  merchant: PublicKey;
  lamports: number;
  blockhash: string;
};

function getErrorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object" ? error as Record<string, unknown> : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const record = getErrorRecord(error);
  return typeof record?.message === "string" ? record.message : fallback;
}
function buildSolanaPaymentTransaction({
  payer,
  merchant,
  lamports,
  blockhash,
}: BuildSolanaPaymentTransactionParams): VersionedTransaction {
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: merchant,
    lamports,
  });

  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [transferInstruction],
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/** Truncate a public key: first 4 + "..." + last 4 chars */
function truncatePubKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Solana Devnet payment flow component.
 *
 * Flow:
 *  1. User selects Solana -> sees wallet selection UI (Phantom/Solflare)
 *  2. User connects a wallet -> sees connected state with address + confirm button
 *  3. User clicks "Send SOL" -> transaction is built, signed, and sent to Devnet
 *  4. Frontend captures txId and sends to POST /api/payments/verify-solana
 *  5. Backend verifies via Helius RPC and creates subscription if valid
 */
export function SolanaPaymentFlow({
  tierName,
  tierPrice,
  tierKey,
  isProcessing,
  errorMsg,
  onSuccess,
  onError,
  onProcessingChange,
  onCancel,
}: SolanaPaymentFlowProps) {
  const { tr } = useLocalization();
  const { connection } = useConnection();
  const { publicKey, connected, wallet, wallets, select, connect, disconnect, sendTransaction } = useWallet();
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [verifyingSignature, setVerifyingSignature] = useState<string | null>(null);
  const [, setIsConnecting] = useState(false);
  const [connectingWalletName, setConnectingWalletName] = useState<string | null>(null);

  // States for copy feedback & dual balance status
  const [copied, setCopied] = useState(false);
  const [balances, setBalances] = useState<{
    configured: number | null;
    alternate: number | null;
    loading: boolean;
    error: string | null;
  }>({ configured: null, alternate: null, loading: false, error: null });

  // Server-authoritative amount for this tier. Null until the quote arrives.
  const [quote, setQuote] = useState<SolanaQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  let networkName = "Devnet";
  try {
    networkName = getNetworkDisplayName();
  } catch {
    // Fallback if env is broken, the actual throw happens during submit
  }

  const alternateNetwork = networkName === "Testnet" ? "Devnet" : "Testnet";

  const handleCopyAddress = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let active = true;

    setQuote(null);
    setQuoteError(null);

    fetchSolanaQuote(tierKey)
      .then((next) => {
        if (active) setQuote(next);
      })
      .catch((err: unknown) => {
        if (!active) return;
        console.error("[SolanaPaymentFlow] Could not fetch payment quote:", err);
        setQuoteError(getErrorMessage(err, tr("payment.solana.transactionFailed")));
      });

    return () => {
      active = false;
    };
  }, [tierKey, tr]);

  useEffect(() => {
    const pubKey = publicKey;
    if (!pubKey) {
      setBalances({ configured: null, alternate: null, loading: false, error: null });
      return;
    }

    let active = true;

    async function fetchBalances() {
      if (!pubKey) return;
      try {
        setBalances(prev => ({ ...prev, loading: prev.configured === null }));
        
        // 1. Fetch configured network balance
        const configuredBal = await connection.getBalance(pubKey);

        // 2. Fetch alternate network balance
        let alternateBal: number | null = null;
        let rawNetworkKey: "devnet" | "testnet" | "mainnet-beta" = "testnet";
        try {
          rawNetworkKey = getValidatedSolanaNetwork();
        } catch {
          // ignore env error here, handleSendTransaction will catch it
        }
        
        const altUrl = rawNetworkKey === "testnet" 
          ? "https://api.devnet.solana.com" 
          : "https://api.testnet.solana.com";
        
        try {
          const altConnection = new Connection(altUrl, "confirmed");
          alternateBal = await altConnection.getBalance(pubKey);
        } catch (altErr) {
          console.warn("[SolanaPaymentFlow] Failed to fetch alternate network balance:", altErr);
        }

        if (active) {
          setBalances({
            configured: configuredBal / LAMPORTS_PER_SOL,
            alternate: alternateBal !== null ? alternateBal / LAMPORTS_PER_SOL : null,
            loading: false,
            error: null,
          });
        }
      } catch (err: unknown) {
        console.error("[SolanaPaymentFlow] Error fetching balances:", err);
        if (active) {
          setBalances(prev => ({
            ...prev,
            loading: false,
            error: getErrorMessage(err, "Failed to fetch balances"),
          }));
        }
      }
    }

    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [publicKey, connection]);

  /**
   * Step 1: Reset the loading spinner as soon as the wallet is fully connected.
   * This is the primary success path - covers autoConnect and normal connect().
   */
  useEffect(() => {
    if (connected) {
      setConnectingWalletName(null);
      setIsConnecting(false);
    }
  }, [connected]);

  /**
   * Step 2: Handles wallet selection and connection with explicit error recovery.
   * Calling select() alone does NOT open the extension popup; connect() must
   * be awaited after the adapter has been switched.
   *
   * All failure paths (user closes popup, adapter error, network error) are
   * caught here so the loading UI is always reset.
   */
  const handleWalletSelect = async (walletName: WalletName) => {
    try {
      setConnectingWalletName(walletName);
      select(walletName);
      setIsConnecting(true);
      // Note: select() updates React state asynchronously, so we call connect()
      // here to explicitly open the extension popup without waiting for a
      // re-render cycle.
      await connect();
    } catch (error) {
      // Catches: user closes the popup, WalletConnectionError, network errors, etc.
      console.error("[SolanaPaymentFlow] Wallet connection failed or was closed:", error);
      setConnectingWalletName(null);
    } finally {
      setIsConnecting(false);
    }
  };

  // -------------------------------------------------------------------------
  // STATE 1: Wallet not connected -> show wallet selection UI
  // -------------------------------------------------------------------------
  if (!connected || !publicKey) {
    return (
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 !p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">SOL</span>
            <div>
              <p className="text-white font-semibold text-sm">
                {tr("payment.solana.connectTitle")}
              </p>
              <p className="text-[#64748b] text-xs">
                {tr("payment.solana.connectDescription", { networkName })}
              </p>
            </div>
          </div>
        </div>

        {/* Wallet list */}
        <div className="flex flex-col gap-2">
          {wallets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] !p-5 text-center">
              <p className="text-[#64748b] text-sm">
                {tr("payment.solana.noWallets")}
              </p>
              <p className="text-[#64748b] text-xs mt-1">
                {tr("payment.solana.installPrefix")}{" "}
                <a
                  href="https://phantom.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#7C3AED] hover:underline"
                >
                  Phantom
                </a>{" "}
                or{" "}
                <a
                  href="https://solflare.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#7C3AED] hover:underline"
                >
                  Solflare
                </a>{" "}
                {tr("payment.solana.installSuffix")}
              </p>
            </div>
          ) : (
            wallets.map((w) => {
              const isThisWalletConnecting = connectingWalletName === w.adapter.name;
              return (
                <button
                  key={w.adapter.name}
                  id={`connect-wallet-${w.adapter.name.toLowerCase().replace(/\s+/g, "-")}`}
                  type="button"
                  disabled={isThisWalletConnecting}
                  onClick={() => handleWalletSelect(w.adapter.name)}
                  className="group flex items-center gap-4 !rounded-3xl border border-white/10 bg-white/[0.04] !px-5 !py-4 text-left transition-all duration-200 hover:border-white/25 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {/* Wallet icon */}
                  {w.adapter.icon ? (
                    <img
                      src={w.adapter.icon}
                      alt={w.adapter.name}
                      className="w-8 h-8 !rounded-xl flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 !rounded-xl bg-[#7C3AED]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#7C3AED] text-sm font-bold">SOL</span>
                    </div>
                  )}

                  {/* Wallet name + readiness */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold group-hover:text-[#7C3AED] transition-colors">
                      {w.adapter.name}
                    </p>
                    <p className="text-[#64748b] text-xs capitalize">
                      {isThisWalletConnecting
                        ? tr("payment.solana.connecting")
                        : w.readyState === "Installed"
                          ? tr("payment.solana.installed")
                          : tr("payment.solana.notDetected")}
                    </p>
                  </div>

                  {/* Spinner or Chevron */}
                  {isThisWalletConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#7C3AED] flex-shrink-0" />
                  ) : (
                    <svg
                      className="w-4 h-4 text-[#64748b] group-hover:text-[#7C3AED] transition-colors flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Cancel */}
        <button
          id="solana-cancel-connect-btn"
          type="button"
          onClick={onCancel}
          className="w-full !py-3 !rounded-full text-sm font-medium border border-white/10 text-[#94a3b8] hover:text-white hover:bg-white/5 transition-all duration-200 mt-1"
        >
          {tr("payment.shared.cancel")}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // STATE 2: Transaction submitted, pending verification
  // -------------------------------------------------------------------------
  if (txSignature && !verifyingSignature) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 !p-5">
          <p className="font-semibold text-green-400 mb-2">
            {tr("payment.solana.transactionSubmitted")}
          </p>
          <p className="text-xs text-green-300 mb-3">
            {tr("payment.solana.verifyingBackend")}
          </p>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin text-green-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs text-[#64748b]">
              {tr("payment.solana.verifyingTransaction")}
            </span>
          </div>
        </div>
        {/* Privacy-masked transaction ID with toggle & copy */}
        <PrivacyTransactionId transactionId={txSignature} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // STATE 3: Wallet connected -> show payment confirmation UI
  // -------------------------------------------------------------------------

  async function handleSendTransaction() {
    if (!publicKey) {
      onError(tr("payment.solana.walletNotConnected"));
      return;
    }

    // -- Validate Solana network env var before any RPC call --
    // Catches missing/invalid VITE_SOLANA_NETWORK early so the user sees a
    // clear system error instead of a cryptic RPC or wallet error.
    let expectedGenesis: string;
    let validatedNetworkName: string;
    let rawNetworkKey: "devnet" | "testnet" | "mainnet-beta";
    try {
      rawNetworkKey = getValidatedSolanaNetwork();
      expectedGenesis = getExpectedGenesisHash();
      validatedNetworkName = getNetworkDisplayName();
    } catch (envErr: unknown) {
      onError(getErrorMessage(envErr, tr("payment.solana.transactionFailed")));
      return;
    }

    // -- Validate merchant address at call-time, not module load-time --
    const merchantAddressRaw =
      import.meta.env.VITE_SOLANA_MERCHANT_ADDRESS as string | undefined;
    if (!merchantAddressRaw) {
      onError("VITE_SOLANA_MERCHANT_ADDRESS is not set. Check your .env file.");
      return;
    }
    let merchantKey: PublicKey;
    try {
      merchantKey = new PublicKey(merchantAddressRaw);
    } catch {
      onError(`Invalid merchant public key: "${merchantAddressRaw}"`);
      return;
    }

    // -- The amount is server-authoritative; never fall back to a local constant --
    if (!quote) {
      onError(quoteError ?? tr("payment.solana.transactionFailed"));
      return;
    }

    onProcessingChange(true);

    try {
      // Math.floor guarantees a strict integer - floating-point lamports cause simulation failures.
      const lamports = Math.floor(quote.amountSol * LAMPORTS_PER_SOL);

      // -- Step 0: Network mismatch guard --
      // Compares the connected RPC's genesis hash against the known expected
      // genesis. If Phantom is set to Mainnet while the app uses Devnet, we
      // fail fast with a clear message instead of a cryptic Phantom warning.
      const genesisHash = await connection.getGenesisHash();
      if (genesisHash !== expectedGenesis) {
        throw new Error(
          tr("payment.solana.networkMismatch", {
            networkName: validatedNetworkName,
          }),
        );
      }

      // -- Step 0.5: Account presence checks --
      // Check that the payer (selected wallet) account exists on the network
      const payerInfo = await connection.getAccountInfo(publicKey);
      if (!payerInfo) {
        throw new Error(
          `This wallet has no SOL account on ${validatedNetworkName}. ` +
          `Airdrop more ${validatedNetworkName} SOL at faucet.solana.com.`
        );
      }

      // Check that the merchant account exists on the network
      const merchantInfo = await connection.getAccountInfo(merchantKey);
      if (!merchantInfo) {
        throw new Error(
          `Merchant wallet has no SOL account on ${validatedNetworkName}.`
        );
      }

      // -- Step 1 & 2: Transaction construction --
      // Use "confirmed" (not "finalized") for a fresher blockhash.
      // "finalized" can be 30+ slots old; Phantom simulates the tx with the
      // exact blockhash embedded in it, so a stale hash causes Phantom's
      // internal preflight to fail even when the on-chain execution succeeds.
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const transaction = buildSolanaPaymentTransaction({
        payer: publicKey,
        merchant: merchantKey,
        lamports,
        blockhash,
      });

      console.log("[SolanaPaymentFlow] Payment transaction built:", {
        payer: publicKey.toBase58(),
        merchant: merchantKey.toBase58(),
        lamports,
        blockhashLength: blockhash.length,
        blockhashPrefix: `${blockhash.slice(0, 8)}...`,
        transactionClass: transaction.constructor.name,
      });

      // -- Step 3a: Explicit balance check --
      // simulateTransaction() runs on an UNSIGNED tx (sigVerify:false) so it
      // can silently skip the fee-payer balance check -> false "pass".
      // We manually verify balance here to catch InsufficientFunds BEFORE
      // Phantom/Solflare shows its own simulation error to the user.
      const ESTIMATED_FEE_LAMPORTS = 100_000; // 0.0001 SOL upper bound for safety
      const balance = payerInfo.lamports;
      const totalRequired = lamports + ESTIMATED_FEE_LAMPORTS;
      console.log(
        `[SolanaPaymentFlow] Balance check: have ${balance} lamports, ` +
        `need ${totalRequired} (${lamports} transfer + ${ESTIMATED_FEE_LAMPORTS} fee estimate)`
      );
      if (balance < totalRequired) {
        throw new Error(
          `Insufficient SOL: wallet has ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL ` +
          `but needs at least ${(totalRequired / LAMPORTS_PER_SOL).toFixed(6)} SOL ` +
          `(${(lamports / LAMPORTS_PER_SOL).toFixed(6)} transfer + fee). ` +
          `Airdrop more ${validatedNetworkName} SOL at faucet.solana.com.`
        );
      }

      // -- Step 3b: Pre-simulation mirroring Phantom's approach --
      // We simulate WITHOUT replaceRecentBlockhash so that our simulation uses
      // the same fresh "confirmed" blockhash that Phantom will also use.
      // If our simulation passes, Phantom's internal simulation should too.
      console.log("[SolanaPaymentFlow] Running pre-send simulation...");
      const simulation = await connection.simulateTransaction(transaction, {
        sigVerify: false,
      });
      if (simulation.value.err) {
        console.error("[SolanaPaymentFlow] SIMULATION ERROR (exact):", simulation.value.err);
        console.error("[SolanaPaymentFlow] SIMULATION LOGS:", simulation.value.logs);
        const logSummary = simulation.value.logs?.find(
          (l) => l.includes("Error") || l.includes("failed") || l.includes("insufficient")
        );
        throw new Error(
          logSummary ?? `Simulation failed: ${JSON.stringify(simulation.value.err)}`
        );
      }
      console.log("[SolanaPaymentFlow] Simulation passed [SUCCESS] - presenting wallet for signature...");

      // -- Step 4: Send (only reached if simulation passed) --
      // We already ran our own simulation above with replaceRecentBlockhash:true.
      // Setting skipPreflight:true here prevents Phantom/Solflare from running
      // a SECOND internal simulation with their own (possibly stale) blockhash,
      // which causes the red "reverted during simulation" error line in the wallet
      // UI even though the transaction itself is valid and succeeds on-chain.
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
        maxRetries: 3,
      });
      setTxSignature(signature);
      console.log("[SolanaPaymentFlow] Transaction submitted with signature:", signature);

      // -- Step 5: Strict on-chain confirmation --
      // Wait for on-chain confirmation BEFORE calling the backend.
      // Use the object form { signature, blockhash, lastValidBlockHeight } so
      // the SDK can detect block-height expiry and fail fast rather than polling
      // indefinitely. This prevents the race where getParsedTransaction returns null.
      console.log("[SolanaPaymentFlow] Awaiting on-chain confirmation...");
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      // -- Step 6: On-chain error check --
      // confirmation.value.err is non-null when the validator executed the
      // transaction but it REVERTED (e.g. bad instruction, account constraint).
      // Without this check, the UI would show success for reverted transactions.
      if (confirmation.value.err) {
        console.error("[SolanaPaymentFlow] On-chain execution error:", confirmation.value.err);
        throw new Error(
          `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`
        );
      }
      console.log("[SolanaPaymentFlow] Transaction confirmed on-chain [SUCCESS]");

      // -- Step 7: Backend verification (only after confirmed + no error) --
      setVerifyingSignature(signature);

      try {
        const result = await verifySolanaPayment({ 
          txId: signature, 
          tier: tierKey,
          network: rawNetworkKey
        });
        if (!result.success) {
          throw new Error(result.message || "Payment verification did not complete.");
        }
        console.log("[SolanaPaymentFlow] Subscription verified:", result.subscriptionId);
        onSuccess();
        onProcessingChange(false);
      } catch (verifyErr: unknown) {
        console.error("[SolanaPaymentFlow] Backend verification error:", verifyErr);
        onError(getErrorMessage(verifyErr, "Failed to verify transaction. Please contact support."));
        setTxSignature(null);
        setVerifyingSignature(null);
        onProcessingChange(false);
      }
    } catch (err: unknown) {
      // -- Unified error handler --
      // All failure paths flow here: user rejection in Phantom/Solflare,
      // simulation failure, on-chain revert, network timeout, or balance errors.
      // SendTransactionError carries RPC simulation logs with the EXACT reason.

      // Detect wallet-specific provider errors to improve diagnostic clarity.
      // Solflare throws 'WalletSignTransactionError' on user rejection or
      // provider-level failures; Phantom uses similar error names.
      const errorRecord = getErrorRecord(err);
      const errorName = typeof errorRecord?.name === "string" ? errorRecord.name : "";
      if (
        errorName === 'WalletSignTransactionError' ||
        errorName === 'TransactionSignatureError' ||
        errorName === 'WalletSendTransactionError'
      ) {
        const errorCode = errorRecord?.code;
        console.error(
          `[SolanaPaymentFlow] Wallet provider error [${errorName}]:`,
          getErrorMessage(err, "Unknown wallet error"),
          errorCode != null ? `(code: ${String(errorCode)})` : ''
        );
      }

      const rawLogs = errorRecord?.logs;
      const simLogs = Array.isArray(rawLogs) ? rawLogs.filter((log): log is string => typeof log === "string") : undefined;
      if (simLogs?.length) {
        console.error("[SolanaPaymentFlow] SendTransactionError — RPC simulation logs:");
        simLogs.forEach((log, i) => console.error(`  [${i}] ${log}`));
      }
      console.error("[SolanaPaymentFlow] Transaction failed (full error object):", err);

      // Prefer a human-readable log line over the raw error.message
      const logError = simLogs?.find(
        (l) => l.includes("Error") || l.includes("failed") || l.includes("insufficient")
      );
      onError(logError ?? getErrorMessage(err, tr("payment.solana.transactionFailed")));
      setTxSignature(null);
      setVerifyingSignature(null);
      // Always re-enable the button on any error path
      onProcessingChange(false);
    }
  }

  async function handleRetry() {
    setTxSignature(null);
    setVerifyingSignature(null);
  }

  // -------------------------------------------------------------------------
  // Payment amount gate — the UI cannot show or send anything until the server
  // has told us how much SOL this tier costs.
  // -------------------------------------------------------------------------
  if (!quote) {
    return (
      <div className="rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 !p-5 flex flex-col gap-3">
        {quoteError ? (
          <>
            <p className="text-sm text-red-400 font-semibold">{quoteError}</p>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-[#94a3b8] hover:text-[#7C3AED] transition-colors font-medium self-start"
            >
              {tr("common.cancel")}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#7C3AED]" />
            <span className="text-xs text-[#64748b]">{tr("common.loading")}</span>
          </div>
        )}
      </div>
    );
  }

  const solAmount = quote.amountSol;
  const isAlternateBalanceSufficient = balances.alternate !== null && balances.alternate >= (solAmount + 0.0001);
  const isConfiguredBalanceInsufficient = balances.configured !== null && balances.configured < (solAmount + 0.0001);
  const showNetworkMismatchAlert = isConfiguredBalanceInsufficient && isAlternateBalanceSufficient;
  const showInsufficientFundsAlert = isConfiguredBalanceInsufficient && !isAlternateBalanceSufficient && !balances.loading;

  return (
    <div className="flex flex-col gap-4">
      {/* -- Connected Wallet Card -- */}
      <div className="flex items-center justify-between !rounded-3xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 !p-5">
        <div className="flex items-center gap-3 min-w-0">
          {/* Wallet icon */}
          {wallet?.adapter.icon ? (
            <img
              src={wallet.adapter.icon}
              alt={wallet.adapter.name}
              className="w-8 h-8 !rounded-xl flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 !rounded-xl bg-[#7C3AED]/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[#7C3AED] text-sm font-bold">SOL</span>
            </div>
          )}

          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">
              {wallet?.adapter.name ?? "Solana Wallet"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[#7C3AED] text-xs font-mono">
                {truncatePubKey(publicKey.toString())}
              </p>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="text-[10px] text-[#94a3b8] hover:text-[#7C3AED] transition-colors font-medium border border-white/10 !px-2 !py-1 rounded bg-white/5 whitespace-nowrap"
              >
                {copied ? tr("payment.solana.copied") : tr("payment.solana.copyAddress")}
              </button>
            </div>
          </div>
        </div>

        {/* Disconnect button */}
        <button
          id="solana-disconnect-btn"
          type="button"
          onClick={() => disconnect()}
          className="text-xs text-[#64748b] hover:text-red-400 transition-colors whitespace-nowrap pl-2 flex-shrink-0"
        >
          {tr("payment.solana.disconnect")}
        </button>
      </div>

      {/* -- Balance Info Card -- */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] !p-5 text-xs">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[#94a3b8]">
            <span>{tr("payment.solana.balanceConfigured", { networkName })}:</span>
            {balances.loading ? (
              <span className="text-[#64748b]">{tr("payment.solana.balanceLoading")}</span>
            ) : balances.configured !== null ? (
              <span className="font-semibold text-white font-mono">{balances.configured.toFixed(4)} SOL</span>
            ) : (
              <span className="text-red-400">{tr("payment.solana.balanceUnreachable")}</span>
            )}
          </div>
          <div className="flex items-center justify-between text-[#64748b]">
            <span>{tr("payment.solana.balanceAlternate", { alternateNetwork })}:</span>
            {balances.loading ? (
              <span>{tr("payment.solana.balanceLoading")}</span>
            ) : balances.alternate !== null ? (
              <span className="font-semibold font-mono">{balances.alternate.toFixed(4)} SOL</span>
            ) : (
              <span>{tr("payment.solana.balanceUnreachable")}</span>
            )}
          </div>
        </div>
      </div>

      {/* -- Transaction Details -- */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] !p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#64748b] mb-1">{tr("payment.checkout.plan")}</p>
            <p className="text-white font-bold">{tierName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#64748b] mb-1">{tr("payment.solana.amount")}</p>
            <p className="text-[#7C3AED] font-extrabold">{solAmount} SOL</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#64748b] mb-1">{tr("payment.solana.network")}</p>
            <p className="text-white font-bold">{networkName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#64748b] mb-1">{tr("payment.solana.usdEquivalent")}</p>
            <p className="text-[#94a3b8] font-semibold">{tierPrice}</p>
          </div>
        </div>
      </div>

      {/* -- Info Box -- */}
      <div className="rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 !p-5 text-sm">
        <p className="text-xs text-[#64748b] leading-relaxed">
          {tr("payment.solana.transferNotice", {
            amount: `${solAmount} SOL`,
            networkName,
          })}
        </p>
      </div>

      {/* -- Network Mismatch Warning -- */}
      {showNetworkMismatchAlert && (
        <div className="flex flex-col gap-2 !rounded-3xl border border-amber-500/30 bg-amber-500/10 !p-4 text-xs text-amber-300">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="font-bold">{tr("payment.solana.mismatchDetected")}</span>
          </div>
          <p className="leading-normal pl-6">
            {tr("payment.solana.mismatchExplanation", {
              balance: balances.alternate?.toFixed(4) || "0",
              alternateNetwork,
              networkName,
            })}
          </p>
        </div>
      )}

      {/* -- Insufficient Funds Warning -- */}
      {showInsufficientFundsAlert && (
        <div className="flex flex-col gap-2 !rounded-3xl border border-red-500/30 bg-red-500/10 !p-4 text-xs text-red-400">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-bold">{tr("payment.solana.insufficientBalanceDetected")}</span>
          </div>
          <p className="leading-normal pl-6">
            {tr("payment.solana.insufficientBalanceExplanation", {
              balance: balances.configured?.toFixed(4) || "0",
              networkName,
              required: solAmount.toString(),
            })}
          </p>
          <div className="pl-6 pt-1">
            <a
              href="https://faucet.solana.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 !rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:from-[#8B5CF6] hover:to-[#3B82F6] text-white font-bold text-xs uppercase tracking-wider transition-all"
            >
              {tr("payment.solana.faucetButton")}
            </a>
          </div>
        </div>
      )}


      {/* -- Error Message -- */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-3 !rounded-3xl border border-red-500/30 bg-red-500/10 !p-4 text-sm text-red-400"
        >
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorMsg}
        </div>
      )}

      {/* -- Action Buttons -- */}
      <div className="flex flex-col sm:flex-row gap-4 pt-2">
        <button
          id="solana-confirm-payment-btn"
          type="button"
          onClick={handleSendTransaction}
          disabled={isProcessing || verifyingSignature !== null}
          className="flex-1 !py-4 !rounded-full text-sm font-bold uppercase tracking-widest text-white bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:from-[#8B5CF6] hover:to-[#3B82F6] shadow-[0_10px_28px_-6px_rgba(124,58,237,0.55)] hover:shadow-[0_12px_36px_-6px_rgba(124,58,237,0.7)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-[#7C3AED] disabled:hover:to-[#2563EB] flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{tr("payment.solana.sending")}</span>
            </>
          ) : verifyingSignature ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{tr("payment.solana.verifying")}</span>
            </>
          ) : (
            <span>{tr("payment.solana.confirmPayment")}</span>
          )}
        </button>

        <button
          id="solana-cancel-btn"
          type="button"
          onClick={verifyingSignature ? handleRetry : onCancel}
          disabled={isProcessing && !verifyingSignature}
          className="flex-1 !py-4 !rounded-full text-sm font-medium border border-white/10 text-[#94a3b8] hover:text-white hover:bg-white/5 transition-all duration-200 disabled:opacity-50"
        >
          {verifyingSignature
            ? tr("payment.solana.tryAgain")
            : tr("payment.shared.cancel")}
        </button>
      </div>
    </div>
  );
}
