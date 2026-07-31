import { describe, expect, it } from "vitest";
import {
  filterDuplicateToolCalls,
  normalizeToolInput,
} from "@sv/services/chat/chat-tool-normalizer.js";
import { buildTransactionCoverage, TOOL_DEFINITIONS } from "@sv/services/chat/chat.tools.js";
import { repairMissingDataRefs } from "@sv/services/chat/chat.orchestrator.js";
import { buildToolSelectionPrompt } from "@sv/services/chat/chat.prompts.js";
import { sanitizeSessionMessages } from "@sv/services/chat/chat-session.js";
import { compactWalletSwaps, compactWalletTransfers } from "@sv/services/wallet/walletTxCompaction.service.js";
import type { ChartSpec, ChatToolCall, ChatToolResult, TableSpec } from "@sv/services/chat/chat.types.js";
import type { WalletSwap, WalletTransfer } from "@sv/services/wallet/dtos/walletDataObjects.js";
const NOW_MS = Date.UTC(2026, 5, 23, 12, 0, 0, 0);

describe("chat tool normalization", () => {
  it("resolves relative date language into stable absolute windows and caps detailed limits", () => {
    const input = normalizeToolInput(
      "get_wallet_swaps",
      { address: "wallet", limit: 999, ignored: true },
      { query: "show swaps for the last 7 days", nowMs: NOW_MS },
    );

    expect(input).toEqual({
      address: "wallet",
      fromMs: NOW_MS - 7 * 24 * 60 * 60 * 1000,
      limit: 100,
      toMs: NOW_MS,
    });
  });

  it("caps compact transaction tools at 500", () => {
    const input = normalizeToolInput(
      "get_wallet_transfers_compact",
      { address: "wallet", limit: 999 },
      { query: "overview", nowMs: NOW_MS },
    );

    expect(input.limit).toBe(500);
  });

  it("filters duplicate tool calls while preserving fresh calls", () => {
    const seen = new Set<string>();
    const first: ChatToolCall = { type: "tool_use", name: "get_wallet_swaps", input: { address: "a", limit: 20 } };
    const duplicate: ChatToolCall = { type: "tool_use", name: "get_wallet_swaps", input: { address: "b", limit: 20 } };
    const fresh: ChatToolCall = { type: "tool_use", name: "get_wallet_transfers", input: { address: "a", limit: 20 } };

    expect(filterDuplicateToolCalls([first], seen).fresh).toHaveLength(1);
    const result = filterDuplicateToolCalls([duplicate, fresh], seen);

    expect(result.duplicateCount).toBe(1);
    expect(result.fresh.map((call) => call.name)).toEqual(["get_wallet_transfers"]);
  });
});


describe("chat tool selection prompt", () => {
  it("includes balanced wallet bundle guidance", () => {
    const prompt = buildToolSelectionPrompt(
      "Give me a wallet overview",
      TOOL_DEFINITIONS,
      ["wallet"],
    );

    expect(prompt).toContain("COMPLEMENTARY TOOL SELECTION");
    expect(prompt).toContain("get_wallet_overview + get_wallet_realized_pnl_desc_breakdown + get_wallet_portfolio");
    expect(prompt).toContain("get_wallet_realized_pnl_desc_breakdown + get_wallet_overview");
    expect(prompt).toContain("get_drawdown_chart + get_wallet_overview");
  });

  it("preserves Vietnamese language detection guidance", () => {
    const prompt = buildToolSelectionPrompt(
      "Tong quan vi nay the nao?",
      TOOL_DEFINITIONS,
      ["wallet"],
      undefined,
      undefined,
      "vi",
    );

    expect(prompt).toContain("Tong quan vi nay the nao?");
    expect(prompt).toContain("the user's language is 'vi'");
    expect(prompt).toContain('"language":"vi"');
  });
});

describe("transaction tool coverage metadata", () => {
  it("marks capped transaction results as limited samples", () => {
    const coverage = buildTransactionCoverage(650, 500);

    expect(coverage).toMatchObject({
      limit: 500,
      availableCount: 650,
      analyzedCount: 500,
      returnedCount: 500,
      isCapped: true,
      scope: "limited_filtered_sample",
    });
    expect(coverage.note).toContain("500/650+");
    expect(coverage.note).toContain("Do not treat as complete history");
  });

  it("marks non-capped transaction results as complete for the known bounded result", () => {
    const coverage = buildTransactionCoverage(42, 100);

    expect(coverage).toMatchObject({
      limit: 100,
      availableCount: 42,
      analyzedCount: 42,
      returnedCount: 42,
      isCapped: false,
      scope: "complete_filtered_result",
    });
    expect(coverage.note).toContain("Analyzed all 42 available rows for this query window");
  });

  it("marks results that hit the limit as capped because more rows may exist", () => {
    const coverage = buildTransactionCoverage(500, 500);

    expect(coverage.isCapped).toBe(true);
    expect(coverage.scope).toBe("limited_filtered_sample");
    expect(coverage.note).toContain("capped at limit (500)");
  });
});
describe("wallet transaction compaction", () => {
  it("summarizes swaps by action and token", () => {
    const swaps: WalletSwap[] = [
      {
        transactionHash: "tx1",
        transactionType: "trade",
        blockTimestampIso: "2026-06-22T00:00:00.000Z",
        subcategory: null,
        walletAddress: "wallet",
        pairAddress: "",
        tokensInvolved: "USDC/ABC",
        bought: { address: "token-abc", amount: 10, symbol: "ABC", name: "ABC", logoUri: null, priceUsd: 2, valueUsd: 20 },
        sold: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 20, symbol: "USDC", name: "USD Coin", logoUri: null, priceUsd: 1, valueUsd: 20 },
        totalValueUsd: 20,
        baseQuotePrice: null,
      },
      {
        transactionHash: "tx2",
        transactionType: "trade",
        blockTimestampIso: "2026-06-23T00:00:00.000Z",
        subcategory: null,
        walletAddress: "wallet",
        pairAddress: "",
        tokensInvolved: "ABC/USDC",
        bought: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 15, symbol: "USDC", name: "USD Coin", logoUri: null, priceUsd: 1, valueUsd: 15 },
        sold: { address: "token-abc", amount: 5, symbol: "ABC", name: "ABC", logoUri: null, priceUsd: 3, valueUsd: 15 },
        totalValueUsd: 15,
        baseQuotePrice: null,
      },
    ];

    const summary = compactWalletSwaps(swaps);

    expect(summary.totalTrades).toBe(2);
    expect(summary.buyTxCount).toBe(1);
    expect(summary.sellTxCount).toBe(1);
    expect(summary.totalVolumeUsd).toBe(35);
    expect(summary.totalTokensTraded).toBe(2);
  });


  it("summarizes transfers by direction", () => {
    const transfers: WalletTransfer[] = [
      { from: "other", to: "wallet", amount: 10, amountUsd: 25, timestamp: "2026-06-22T00:00:00.000Z", tokenAddress: "token", tokenSymbol: "TOK", transactionSignature: "tx1", instructionIndex: 0 },
      { from: "wallet", to: "other", amount: 4, amountUsd: 12, timestamp: "2026-06-23T00:00:00.000Z", tokenAddress: "token", tokenSymbol: "TOK", transactionSignature: "tx2", instructionIndex: 1 },
    ];

    const summary = compactWalletTransfers(transfers, "wallet");

    expect(summary.totalTransfers).toBe(2);
    expect(summary.inCount).toBe(1);
    expect(summary.outCount).toBe(1);
    expect(summary.totalValueUsd).toBe(37);
  });
});

describe("chat session sanitizer", () => {
  it("removes assistant data blobs and preserves refs", () => {
    const sanitized = sanitizeSessionMessages([
      { role: "user", content: "hello", data: { keep: true } },
      { role: "assistant", content: "answer", data: { big: true }, dataRefs: [{ id: "0" }] },
    ]);

    expect(sanitized[0]).toHaveProperty("data");
    expect(sanitized[1]).not.toHaveProperty("data");
    expect(sanitized[1]).toHaveProperty("dataRefs");
  });
});

describe("chat response dataRef repair", () => {
  it("repairs a missing table dataRef from compatible tool result hints", () => {
    const tables = [{ id: "swap_rows", columns: "txHash:Tx,token:Token" } as TableSpec];
    const charts: ChartSpec[] = [];
    const results: ChatToolResult[] = [
      { name: "get_wallet_transfers", input: {}, data: {}, fullData: { transfers: [] } },
      { name: "get_wallet_swaps", input: {}, data: {}, fullData: { swaps: [{ transactionHash: "tx" }] } },
    ];

    expect(repairMissingDataRefs(charts, tables, results)).toBe(1);
    expect(tables[0].dataRef).toBe("1");
  });

  it("repairs a missing chart dataRef when only one usable result exists", () => {
    const charts = [{ id: "balance", type: "area" } as ChartSpec];
    const tables: TableSpec[] = [];
    const results: ChatToolResult[] = [
      { name: "get_balance_history", input: {}, data: {}, fullData: [{ timestampMs: 1, usdValue: 10 }] },
    ];

    expect(repairMissingDataRefs(charts, tables, results)).toBe(1);
    expect(charts[0].dataRef).toBe("0");
  });
});
