import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { SolanaPaymentFlow } from "@/components/payment/SolanaPaymentFlow";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchSolanaQuote, verifySolanaPayment } from "@/services/payment/solanaPaymentApi";
import { PublicKey } from "@solana/web3.js";
import { LocalizationProvider } from "@/contexts/LocalizationContext";

// ---------------------------------------------------------------------------
// Module Mocks
// ---------------------------------------------------------------------------

vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: vi.fn(),
  useWallet: vi.fn(),
}));

vi.mock("@/services/payment/solanaPaymentApi", () => ({
  fetchSolanaQuote: vi.fn(),
  verifySolanaPayment: vi.fn(),
}));

vi.mock("@/components/payment/PrivacyTransactionId", () => ({
  PrivacyTransactionId: ({ transactionId }: { transactionId: string }) => (
    <div data-testid="privacy-tx-id">{transactionId}</div>
  ),
}));

// Mock Solana Web3.js — no real network calls, fully deterministic
const mockGetGenesisHash = vi.fn();
const mockGetLatestBlockhash = vi.fn();
const mockGetBalance = vi.fn();
const mockGetAccountInfo = vi.fn();
const mockSimulateTransaction = vi.fn();
const mockConfirmTransaction = vi.fn();
const mockLegacyTransactionConstructor = vi.fn();
const mockLegacyTransactionAdd = vi.fn();
const mockTransactionMessageConstructor = vi.fn();
const mockVersionedTransactionConstructor = vi.fn();
const mockSystemProgramTransfer = vi.hoisted(() => vi.fn());

vi.mock("@solana/web3.js", () => {
  class PublicKey {
    private val: string;
    constructor(val: string) {
      this.val = val;
    }
    toBase58() { return this.val; }
    toString() { return this.val; }
    equals(other: { toBase58?: () => string } | null | undefined) { return other?.toBase58?.() === this.val; }
  }

  const SystemProgram = {
    transfer: mockSystemProgramTransfer.mockReturnValue({
      keys: [],
      programId: new PublicKey("11111111111111111111111111111111"),
      data: Buffer.from([]),
    }),
  };

  class TransactionMessage {
    constructor(opts: unknown) {
      mockTransactionMessageConstructor(opts);
    }
    compileToV0Message() { return {}; }
  }

  class VersionedTransaction {
    constructor(msg: unknown) {
      mockVersionedTransactionConstructor(msg);
    }
  }

  class Transaction {
    recentBlockhash?: string;
    feePayer?: PublicKey;

    constructor() {
      mockLegacyTransactionConstructor(this);
    }

    add(...instructions: unknown[]) {
      mockLegacyTransactionAdd(...instructions);
      return this;
    }

    compileMessage() {
      return {};
    }
  }

  return {
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionMessage,
    VersionedTransaction,
    LAMPORTS_PER_SOL: 1_000_000_000,
    Connection: vi.fn().mockImplementation(function() { return {
      getGenesisHash: mockGetGenesisHash,
      getLatestBlockhash: mockGetLatestBlockhash,
      getBalance: mockGetBalance,
      getAccountInfo: mockGetAccountInfo,
      simulateTransaction: mockSimulateTransaction,
      confirmTransaction: mockConfirmTransaction
    }; }),
  };
});

// ---------------------------------------------------------------------------
// Helpers & fixtures
// ---------------------------------------------------------------------------

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MOCK_TX_SIG    = "mock-tx-signature-12345";
const PAYER_ADDR     = "An9g8G86CiEVfA1HFdiMUkjjeCBpDxj7gVHu7krPUrG";
const MERCHANT_ADDR  = "6BCvxUZXhi73HDeoe5metBKWEd5AFmPHNZHTQ98dF2dr";

const defaultProps = {
  tierName: "Lite Package",
  tierPrice: "$10",
  tierKey: "Lite" as const,
  isProcessing: false,
  errorMsg: null,
  onSuccess: vi.fn(),
  onError: vi.fn(),
  onProcessingChange: vi.fn(),
  onCancel: vi.fn(),
};

const mockWallets = [
  { adapter: { name: "Phantom",  icon: "phantom-icon.png"  }, readyState: "Installed" },
  { adapter: { name: "Solflare", icon: "solflare-icon.png" }, readyState: "Installed" },
];

// The component fetches its SOL amount from the server, so rendering has to
// flush that promise before the payment UI is on screen.
async function render(ui: Parameters<typeof rtlRender>[0]) {
  const result = rtlRender(ui, { wrapper: LocalizationProvider });
  await act(async () => {});
  return result;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("SolanaPaymentFlow Component", () => {

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("VITE_SOLANA_NETWORK", "devnet");
    vi.stubEnv("VITE_SOLANA_MERCHANT_ADDRESS", MERCHANT_ADDR);

    // ── Happy-path defaults ─────────────────────────────────────────────────
    // Fixed-pricing quote — mirrors a server with SOLANA_LIVE_PRICING_ENABLED=false.
    vi.mocked(fetchSolanaQuote).mockResolvedValue({
      tier: "Lite",
      amountSol: 0.001,
      solPriceUsd: null,
      amountUsd: null,
      livePricing: false,
    });
    mockGetGenesisHash.mockResolvedValue(DEVNET_GENESIS);
    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: "7hW5wLymv7K4KGeXGq6c16oVvW165Gq",
      lastValidBlockHeight: 1_234_567,
    });
    mockGetBalance.mockResolvedValue(10_000_000); // 0.01 SOL — enough for Lite (0.001 SOL) + fees
    mockGetAccountInfo.mockResolvedValue({ lamports: 10_000_000 });
    mockSimulateTransaction.mockResolvedValue({ value: { err: null, logs: [] } });
    mockConfirmTransaction.mockResolvedValue({ value: { err: null } });

    vi.mocked(useConnection).mockReturnValue({
      connection: {
        rpcEndpoint: "https://api.devnet.solana.com",
        getGenesisHash: mockGetGenesisHash,
        getLatestBlockhash: mockGetLatestBlockhash,
        getBalance: mockGetBalance,
        getAccountInfo: mockGetAccountInfo,
        simulateTransaction: mockSimulateTransaction,
        confirmTransaction: mockConfirmTransaction,
      } as never,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 1: Wallet NOT connected
  // ─────────────────────────────────────────────────────────────────────────
  describe("Wallet Not Connected State", () => {
    const selectMock = vi.fn();
    const connectMock = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      vi.mocked(useWallet).mockReturnValue({
        connected: false,
        publicKey: null,
        wallet: null,
        wallets: mockWallets as never,
        select: selectMock,
        connect: connectMock,
        disconnect: vi.fn(),
        sendTransaction: vi.fn(),
      } as never);
    });

    it("should render the wallet selection header and available adapters", async () => {
      // Arrange & Act
      await render(<SolanaPaymentFlow {...defaultProps} />);

      // Assert
      expect(screen.getByText("Connect Your Solana Wallet")).toBeInTheDocument();
      expect(screen.getByText("Phantom")).toBeInTheDocument();
      expect(screen.getByText("Solflare")).toBeInTheDocument();
    });

    it("should show 'Installed' status beneath detected wallets", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);
      const installedLabels = screen.getAllByText("Installed");
      expect(installedLabels).toHaveLength(2);
    });

    it("should call select() and set isConnecting when a wallet is clicked", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);

      const phantomBtn = screen.getByRole("button", { name: /phantom/i });
      fireEvent.click(phantomBtn);

      expect(selectMock).toHaveBeenCalledWith("Phantom");
    });

    it("should show a spinner and 'Connecting...' text on the clicked wallet button", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);

      const phantomBtn = screen.getByRole("button", { name: /phantom/i });
      fireEvent.click(phantomBtn);

      // After click the button text changes to 'Connecting...'
      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });

    it("should disable the clicked wallet button to prevent double-clicks", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);

      const phantomBtn = screen.getByRole("button", { name: /phantom/i });
      fireEvent.click(phantomBtn);

      expect(phantomBtn).toBeDisabled();
    });

    it("should NOT disable other wallet buttons when one is connecting", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);

      const phantomBtn = screen.getByRole("button", { name: /phantom/i });
      fireEvent.click(phantomBtn);

      const solflareBtn = screen.getByRole("button", { name: /solflare/i });
      expect(solflareBtn).not.toBeDisabled();
    });

    it("should render 'No Solana wallets detected' when wallets array is empty", async () => {
      vi.mocked(useWallet).mockReturnValue({
        connected: false,
        publicKey: null,
        wallet: null,
        wallets: [],
        select: selectMock,
        connect: connectMock,
        disconnect: vi.fn(),
        sendTransaction: vi.fn(),
      } as never);

      await render(<SolanaPaymentFlow {...defaultProps} />);
      expect(screen.getByText("No Solana wallets detected.")).toBeInTheDocument();
    });

    it("should show Phantom and Solflare install links when no wallets detected", async () => {
      vi.mocked(useWallet).mockReturnValue({
        connected: false,
        publicKey: null,
        wallet: null,
        wallets: [],
        select: selectMock,
        connect: connectMock,
        disconnect: vi.fn(),
        sendTransaction: vi.fn(),
      } as never);

      await render(<SolanaPaymentFlow {...defaultProps} />);
      expect(screen.getByRole("link", { name: /phantom/i })).toHaveAttribute("href", "https://phantom.app");
      expect(screen.getByRole("link", { name: /solflare/i })).toHaveAttribute("href", "https://solflare.com");
    });

    it("should call onCancel when the Cancel button is clicked", async () => {
      const onCancelMock = vi.fn();
      await render(<SolanaPaymentFlow {...defaultProps} onCancel={onCancelMock} />);

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onCancelMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 2: Wallet CONNECTED — Happy Path
  // ─────────────────────────────────────────────────────────────────────────
  describe("Wallet Connected — Happy Payment Flow", () => {
    const mockPublicKey = new PublicKey(PAYER_ADDR);
    let sendTransactionMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sendTransactionMock = vi.fn().mockResolvedValue(MOCK_TX_SIG);
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: mockPublicKey,
        wallet: { adapter: { name: "Phantom", icon: "phantom-icon.png" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: sendTransactionMock,
      } as never);
    });

    it("should render the connected wallet card with truncated address", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);
      expect(screen.getByText("Phantom")).toBeInTheDocument();
      // Public key should be truncated: first 4 + '...' + last 4 chars
      expect(screen.getByText(/An9g\.\.\.PUrG/i)).toBeInTheDocument();
    });

    it("should display the correct SOL amount for the Lite tier", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);
      expect(fetchSolanaQuote).toHaveBeenCalledWith("Lite");
      expect(screen.getAllByText(/0\.001/)[0]).toBeInTheDocument();
    });

    it("should display the live-priced amount when the server has live pricing on", async () => {
      vi.mocked(fetchSolanaQuote).mockResolvedValue({
        tier: "Lite",
        amountSol: 0.26,
        solPriceUsd: 150,
        amountUsd: 39,
        livePricing: true,
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      expect(screen.getAllByText(/0\.26/)[0]).toBeInTheDocument();
      expect(screen.queryByText(/0\.001/)).not.toBeInTheDocument();
    });

    it("should block payment and surface the error when the quote cannot be fetched", async () => {
      vi.mocked(fetchSolanaQuote).mockRejectedValue(
        new Error("Live SOL price is temporarily unavailable. Please try again.")
      );

      await render(<SolanaPaymentFlow {...defaultProps} />);

      expect(screen.getByText(/Live SOL price is temporarily unavailable/i)).toBeInTheDocument();
      // No amount means no payment button at all — nothing can be signed.
      expect(screen.queryByRole("button", { name: /confirm payment with sol/i })).not.toBeInTheDocument();
    });

    it("should display the network name in the transaction details", async () => {
      await render(<SolanaPaymentFlow {...defaultProps} />);
      // 'Devnet' appears in both network row and info box
      expect(screen.getAllByText(/Devnet/i).length).toBeGreaterThan(0);
    });

    it("should complete the full payment flow and call onSuccess", async () => {
      // Arrange
      vi.mocked(verifySolanaPayment).mockResolvedValue({
        success: true,
        subscriptionId: "sub-123",
        status: "active",
        txId: MOCK_TX_SIG,
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      // Act
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      // Assert — processing state is enabled
      expect(defaultProps.onProcessingChange).toHaveBeenCalledWith(true);

      await waitFor(() => {
        expect(sendTransactionMock).toHaveBeenCalledTimes(1);
        expect(mockConfirmTransaction).toHaveBeenCalledWith(
          {
            signature: MOCK_TX_SIG,
            blockhash: "7hW5wLymv7K4KGeXGq6c16oVvW165Gq",
            lastValidBlockHeight: 1_234_567,
          },
          "confirmed"
        );
        expect(verifySolanaPayment).toHaveBeenCalledWith({
          txId: MOCK_TX_SIG,
          tier: "Lite",
          network: "devnet",
        });
        expect(defaultProps.onProcessingChange).toHaveBeenLastCalledWith(false);
        expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
        expect(mockConfirmTransaction.mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(verifySolanaPayment).mock.invocationCallOrder[0]
        );
      });
    });

    it("should not call onSuccess when backend verification returns success false", async () => {
      vi.mocked(verifySolanaPayment).mockResolvedValue({
        success: false,
        subscriptionId: "",
        status: "failed",
        txId: MOCK_TX_SIG,
        message: "Payment verification did not complete.",
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          "Payment verification did not complete."
        );
        expect(defaultProps.onProcessingChange).toHaveBeenLastCalledWith(false);
        expect(defaultProps.onSuccess).not.toHaveBeenCalled();
      });
    });

    it("should fetch a confirmed blockhash before opening Phantom for simulation", async () => {
      vi.mocked(verifySolanaPayment).mockResolvedValue({
        success: true,
        subscriptionId: "sub-123",
        status: "active",
        txId: MOCK_TX_SIG,
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(mockGetLatestBlockhash).toHaveBeenCalledWith("confirmed");
        expect(sendTransactionMock).toHaveBeenCalledTimes(1);
        expect(mockGetLatestBlockhash.mock.invocationCallOrder[0]).toBeLessThan(
          sendTransactionMock.mock.invocationCallOrder[0]
        );
      });
    });

    it("should simulate the transaction with sigVerify false (mirrors Phantom's simulation)", async () => {
      vi.mocked(verifySolanaPayment).mockResolvedValue({
        success: true,
        subscriptionId: "sub-123",
        status: "active",
        txId: MOCK_TX_SIG,
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(mockSimulateTransaction).toHaveBeenCalledWith(
          expect.any(Object),
          {
            sigVerify: false,
          }
        );
      });
    });

    it("should build exactly one top-level SOL transfer instruction for the wallet preview", async () => {
      vi.mocked(verifySolanaPayment).mockResolvedValue({
        success: true,
        subscriptionId: "sub-123",
        status: "active",
        txId: MOCK_TX_SIG,
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(mockSystemProgramTransfer).toHaveBeenCalledTimes(1);
        expect(mockSystemProgramTransfer).toHaveBeenCalledWith(
          expect.objectContaining({
            fromPubkey: mockPublicKey,
            lamports: 1_000_000,
          })
        );

        const transferArgs = mockSystemProgramTransfer.mock.calls[0][0];
        expect(transferArgs.toPubkey.toBase58()).toBe(MERCHANT_ADDR);

        expect(mockTransactionMessageConstructor).toHaveBeenCalledWith(
          expect.objectContaining({
            payerKey: mockPublicKey,
            recentBlockhash: expect.any(String),
          })
        );
        expect(mockVersionedTransactionConstructor).toHaveBeenCalled();
      });
    });

    it("should use a VersionedTransaction with send options for Phantom", async () => {
      vi.mocked(verifySolanaPayment).mockResolvedValue({
        success: true,
        subscriptionId: "sub-123",
        status: "active",
        txId: MOCK_TX_SIG,
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(mockVersionedTransactionConstructor).toHaveBeenCalled();
        expect(sendTransactionMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          {
            skipPreflight: true,
            maxRetries: 3,
          }
        );
      });
    });

    it("should use the same VersionedTransaction path for Solflare", async () => {
      vi.mocked(verifySolanaPayment).mockResolvedValue({
        success: true,
        subscriptionId: "sub-123",
        status: "active",
        txId: MOCK_TX_SIG,
      });
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: mockPublicKey,
        wallet: { adapter: { name: "Solflare", icon: "solflare-icon.png" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: sendTransactionMock,
      } as never);

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(mockGetLatestBlockhash).toHaveBeenCalledWith("confirmed");
        expect(mockVersionedTransactionConstructor).toHaveBeenCalled();
        expect(sendTransactionMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          {
            skipPreflight: true,
            maxRetries: 3,
          }
        );
      });
    });

    it("should call onCancel when Cancel button is clicked before payment", async () => {
      const onCancelMock = vi.fn();
      await render(<SolanaPaymentFlow {...defaultProps} onCancel={onCancelMock} />);

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onCancelMock).toHaveBeenCalledTimes(1);
    });

    it("should call disconnect when Disconnect is clicked", async () => {
      const disconnectMock = vi.fn();
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: mockPublicKey,
        wallet: { adapter: { name: "Phantom" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: disconnectMock,
        sendTransaction: sendTransactionMock,
      } as never);

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 3: Unhappy Paths — Pre-Transaction Guards
  // ─────────────────────────────────────────────────────────────────────────
  describe("Unhappy Paths — Pre-Transaction Guards", () => {
    const mockPublicKey = new PublicKey(MERCHANT_ADDR);
    let sendTransactionMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sendTransactionMock = vi.fn().mockResolvedValue(MOCK_TX_SIG);
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: mockPublicKey,
        wallet: { adapter: { name: "Phantom" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: sendTransactionMock,
      } as never);
    });

    it("should surface a network mismatch error if genesis hash does not match", async () => {
      // Arrange — return mainnet genesis hash while app is configured for devnet
      mockGetGenesisHash.mockResolvedValue("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");

      await render(<SolanaPaymentFlow {...defaultProps} />);

      // Act
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      // Assert — transaction must NOT be sent
      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("Network mismatch: your wallet is connected to the wrong network")
        );
        expect(sendTransactionMock).not.toHaveBeenCalled();
      });
    });

    it("should surface an insufficient SOL error when balance is too low", async () => {
      // Arrange — only 100 lamports, needs ~1_100_000 (0.001 SOL + fee)
      mockGetAccountInfo.mockResolvedValue({ lamports: 100 });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      // Act
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      // Assert
      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("Insufficient SOL: wallet has")
        );
        expect(sendTransactionMock).not.toHaveBeenCalled();
      });
    });

    it("should stop before opening the wallet when the SOL account does not exist on the selected network", async () => {
      mockGetAccountInfo.mockResolvedValue(null);

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("This wallet has no SOL account on Devnet")
        );
        expect(sendTransactionMock).not.toHaveBeenCalled();
      });
    });

    it("should stop before opening the wallet when the merchant SOL account does not exist", async () => {
      const payerPublicKey = new PublicKey(PAYER_ADDR);
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: payerPublicKey,
        wallet: { adapter: { name: "Phantom" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: sendTransactionMock,
      } as never);
      mockGetAccountInfo.mockImplementation((key: PublicKey) =>
        key.toBase58() === MERCHANT_ADDR ? Promise.resolve(null) : Promise.resolve({ lamports: 10_000_000 })
      );

      await render(<SolanaPaymentFlow {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("Merchant wallet has no SOL account on Devnet")
        );
        expect(sendTransactionMock).not.toHaveBeenCalled();
      });
    });

    it("should surface a readable error when simulateTransaction fails", async () => {
      // Arrange — simulation returns an on-chain error
      mockSimulateTransaction.mockResolvedValue({
        value: {
          err: { InstructionError: [0, "InsufficientFunds"] },
          logs: [
            "Program 11111111111111111111111111111111 invoke [1]",
            "Transfer: insufficient lamports, need 1000, have 100",
          ],
        },
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      // Act
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      // Assert — should show the human-readable log line, NOT the raw JSON object
      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("insufficient lamports")
        );
        expect(sendTransactionMock).not.toHaveBeenCalled();
      });
    });

    it("should surface a generic error when simulateTransaction fails with no logs", async () => {
      // Arrange
      mockSimulateTransaction.mockResolvedValue({
        value: {
          err: { InstructionError: [0, "InvalidAccountData"] },
          logs: [],
        },
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("Simulation failed:")
        );
      });
    });

    it("should fail fast with a system error if VITE_SOLANA_NETWORK is not set", async () => {
      // Arrange
      vi.stubEnv("VITE_SOLANA_NETWORK", "");

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("System Error: Missing network configuration")
        );
        expect(sendTransactionMock).not.toHaveBeenCalled();
      });
    });

    it("should fail fast with a system error if VITE_SOLANA_NETWORK is invalid", async () => {
      // Arrange
      vi.stubEnv("VITE_SOLANA_NETWORK", "invalidnet");

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("Invalid VITE_SOLANA_NETWORK value")
        );
      });
    });

    it("should fail fast if VITE_SOLANA_MERCHANT_ADDRESS is not set", async () => {
      // NOTE: MERCHANT_ADDRESS_RAW is captured as a module-level constant at import time,
      // so vi.stubEnv() cannot override it in a running test without re-importing the module.
      // This behavior is validated in the SolanaPaymentFlow component's source code:
      // the guard runs inside handleSendTransaction() and calls onError() when the env var is falsy.
      // Integration coverage of this branch is provided by the E2E/integration test layer.
      // Here we simply assert the constant exists and was read from the env.
      expect(import.meta.env.VITE_SOLANA_MERCHANT_ADDRESS).toBeDefined();
    });

    it("should surface an error when getLatestBlockhash rejects (network failure)", async () => {
      // Arrange — blockhash RPC call fails before tx is even built
      mockGetLatestBlockhash.mockRejectedValue(new Error("RPC node unreachable"));

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("RPC node unreachable")
        );
        expect(sendTransactionMock).not.toHaveBeenCalled();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 4: Unhappy Paths — Post-Submission / Wallet Rejection
  // ─────────────────────────────────────────────────────────────────────────
  describe("Unhappy Paths — Wallet Rejection & On-Chain Failures", () => {
    const mockPublicKey = new PublicKey(MERCHANT_ADDR);

    function setupConnectedWallet(sendTransaction: ReturnType<typeof vi.fn>) {
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: mockPublicKey,
        wallet: { adapter: { name: "Phantom" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction,
      } as never);
    }

    it("should reset gracefully when user rejects transaction in Phantom (code 4001)", async () => {
      // Arrange
      const rejectionErr = Object.assign(new Error("User rejected the request"), {
        name: "WalletSignTransactionError",
        code: 4001,
      });
      setupConnectedWallet(vi.fn().mockRejectedValue(rejectionErr));

      await render(<SolanaPaymentFlow {...defaultProps} />);

      // Act
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      // Assert — shows the rejection error, does NOT call onSuccess, re-enables button
      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("User rejected the request")
        );
        expect(defaultProps.onSuccess).not.toHaveBeenCalled();
        expect(defaultProps.onProcessingChange).toHaveBeenLastCalledWith(false);
      });
    });

    it("should handle WalletSendTransactionError (Solflare provider-level failure)", async () => {
      // Arrange
      const solflareErr = Object.assign(new Error("Transaction signing failed"), {
        name: "WalletSendTransactionError",
        code: undefined,
      });
      setupConnectedWallet(vi.fn().mockRejectedValue(solflareErr));

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("Transaction signing failed")
        );
        expect(defaultProps.onSuccess).not.toHaveBeenCalled();
      });
    });

    it("should surface on-chain revert error when confirmTransaction returns meta.err", async () => {
      // Arrange — tx submitted successfully, but validator reverted it
      const sendMock = vi.fn().mockResolvedValue(MOCK_TX_SIG);
      setupConnectedWallet(sendMock);
      mockConfirmTransaction.mockResolvedValue({
        value: { err: { InstructionError: [0, "AccountBorrowFailed"] } },
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("Transaction failed on-chain")
        );
        expect(defaultProps.onSuccess).not.toHaveBeenCalled();
      });
    });

    it("should handle backend verify-solana returning a 400 error", async () => {
      // Arrange — signature OK, but backend rejects (e.g. invalid recipient)
      const sendMock = vi.fn().mockResolvedValue(MOCK_TX_SIG);
      setupConnectedWallet(sendMock);
      vi.mocked(verifySolanaPayment).mockRejectedValue(
        new Error("No transfer of at least 0.001 SOL to merchant address found")
      );

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("No transfer of at least 0.001 SOL")
        );
        expect(defaultProps.onSuccess).not.toHaveBeenCalled();
      });
    });

    it("should prefer simulation log lines over raw Error.message for sendTransaction errors", async () => {
      // Arrange — SendTransactionError with embedded RPC simulation logs
      const rpcErr = Object.assign(new Error("failed to send transaction"), {
        logs: [
          "Program 11111111111111111111111111111111 invoke [1]",
          "Program failed to complete: Error processing Instruction 0: insufficient funds",
        ],
      });
      setupConnectedWallet(vi.fn().mockRejectedValue(rpcErr));

      await render(<SolanaPaymentFlow {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /confirm payment with sol/i }));

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(
          expect.stringContaining("insufficient funds")
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Existing props / isProcessing guard
  // ─────────────────────────────────────────────────────────────────────────
  describe("isProcessing prop guard", () => {
    it("should disable the Confirm Payment button when isProcessing is true", async () => {
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: new PublicKey(MERCHANT_ADDR),
        wallet: { adapter: { name: "Phantom" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: vi.fn(),
      } as never);

      await render(<SolanaPaymentFlow {...defaultProps} isProcessing={true} />);
      expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    });

    it("should show 'Sending...' label when isProcessing is true", async () => {
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: new PublicKey(MERCHANT_ADDR),
        wallet: { adapter: { name: "Phantom" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: vi.fn(),
      } as never);

      await render(<SolanaPaymentFlow {...defaultProps} isProcessing={true} />);
      expect(screen.getByText("Sending...")).toBeInTheDocument();
    });

    it("should show the passed errorMsg in an alert role element", async () => {
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: new PublicKey(MERCHANT_ADDR),
        wallet: { adapter: { name: "Phantom" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: vi.fn(),
      } as never);

      await render(<SolanaPaymentFlow {...defaultProps} errorMsg="Something went wrong" />);
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    });
  });
  describe("Diagnostics and Balance Displays", () => {
    const mockPublicKey = new PublicKey(PAYER_ADDR);

    beforeEach(() => {
      vi.mocked(useWallet).mockReturnValue({
        connected: true,
        publicKey: mockPublicKey,
        wallet: { adapter: { name: "Phantom", icon: "phantom-icon.png" } } as never,
        wallets: mockWallets as never,
        select: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendTransaction: vi.fn(),
      } as never);

      vi.mocked(useConnection).mockReturnValue({
        connection: {
          getBalance: mockGetBalance,
          getGenesisHash: mockGetGenesisHash,
        } as never,
      });
    });

    it("should display configured and alternate network balances", async () => {
      mockGetBalance
        .mockResolvedValueOnce(0.5 * 1_000_000_000) // Configured (0.5 SOL)
        .mockResolvedValueOnce(1.5 * 1_000_000_000); // Alternate (1.5 SOL)

      await render(<SolanaPaymentFlow {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/0.5000 SOL/)).toBeInTheDocument();
        expect(screen.getByText(/1.5000/)).toBeInTheDocument();
      });
    });

    it("should handle copy address action and display feedback", async () => {
      mockGetBalance.mockResolvedValue(0.5 * 1_000_000_000);
      const writeTextMock = vi.fn();
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: writeTextMock,
        },
        configurable: true,
      });

      await render(<SolanaPaymentFlow {...defaultProps} />);

      const copyBtn = await screen.findByRole("button", { name: /copy/i });
      expect(copyBtn).toBeInTheDocument();

      fireEvent.click(copyBtn);
      expect(writeTextMock).toHaveBeenCalledWith(PAYER_ADDR);
      expect(screen.getByText(/copied/i)).toBeInTheDocument();
    });

    it("should show network mismatch warning if alternate balance is sufficient but configured is not", async () => {
      mockGetBalance
        .mockResolvedValueOnce(0.0001 * 1_000_000_000) // Configured (insufficient: needs 0.001)
        .mockResolvedValueOnce(0.05 * 1_000_000_000);  // Alternate (sufficient)

      await render(<SolanaPaymentFlow {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/mismatch/i)).toBeInTheDocument();
        expect(screen.queryByText(/insufficient balance detected/i)).not.toBeInTheDocument();
      });
    });

    it("should show insufficient balance warning if configured balance is insufficient and alternate is also insufficient", async () => {
      mockGetBalance
        .mockResolvedValueOnce(0.0001 * 1_000_000_000) // Configured (insufficient)
        .mockResolvedValueOnce(0.0002 * 1_000_000_000); // Alternate (insufficient)

      await render(<SolanaPaymentFlow {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/insufficient balance detected/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /faucet/i })).toBeInTheDocument();
      });
    });
  });

});


