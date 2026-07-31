import { describe, expect, it } from "vitest";
import type { ChatToolResult } from "../../src/services/chat/chat.types.js";
import { buildResponseGenerationPrompt } from "../../src/services/chat/chat.prompts.js";
import {
  computeFallbackConfidence,
  hasCappedToolResults,
  synthesizeFollowUpActions,
} from "../../src/services/chat/chat.orchestrator.js";

const pnlResult: ChatToolResult = {
  name: "get_wallet_realized_pnl_desc_breakdown",
  input: { address: "wallet-1" },
  data: {
    realizedPnlUsd: 2613.42,
    tokenBreakdowns: [
      { token: "CHEETAH", realizedPnlUsd: 2849.07 },
      { token: "COOKED", realizedPnlUsd: -235.65 },
    ],
    coverage: { isCapped: false, scope: "complete_filtered_result" },
  },
};

describe("chat response guardrails", () => {
  it("synthesizes grounded follow-up actions when the model omits them", () => {
    const actions = synthesizeFollowUpActions([pnlResult]);

    expect(actions.length).toBeGreaterThanOrEqual(3);
    expect(actions.length).toBeLessThanOrEqual(5);
    expect(actions.every((action) => action.index === null)).toBe(true);
    expect(actions.some((action) => action.label.includes("CHEETAH"))).toBe(true);
  });


  it("detects capped nested coverage and lowers fallback confidence", () => {
    const capped: ChatToolResult = {
      ...pnlResult,
      data: { compact: { coverage: { isCapped: true } } },
    };

    expect(hasCappedToolResults([capped])).toBe(true);
    expect(computeFallbackConfidence([capped])).toBe("Low");
  });

  it("defaults uncapped complete-looking results to Medium, not High", () => {
    expect(computeFallbackConfidence([pnlResult])).toBe("Medium");
  });

  it("keeps the response prompt compact and truncates oversized result payloads", () => {
    const prompt = buildResponseGenerationPrompt("Summarize PnL", [{
      ...pnlResult,
      data: { rows: Array.from({ length: 800 }, (_, index) => ({ symbol: `TOKEN${index}`, pnlUsd: index })) },
    }]);

    expect(prompt).toContain("JSON CONTRACT");
    expect(prompt).toContain("NON-NEGOTIABLE PRIORITIES");
    expect(prompt).toContain("truncated");
    expect(prompt).not.toContain("EXAMPLE:");
    expect(prompt).not.toContain("ANALYSIS FRAMEWORK");
    expect(prompt.length).toBeLessThan(9000);
  });
});
