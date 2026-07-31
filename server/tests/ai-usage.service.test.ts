import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sv/db/index.js", () => ({ db: {} }));
vi.mock("@sv/db/schema.js", () => ({
  aiDailyUsage: {},
  subscriptions: {},
}));

import {
  getAiDailyLimit,
  getAiFeatureRequiredTier,
  getUtcUsageWindow,
  isAiFeatureLocked,
  isAiUsageLimitEnabled,
  selectHighestTier,
} from "@sv/services/ai-usage.service.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI usage policy", () => {
  it("uses the configured Ask Yoca AI limits", () => {
    expect(getAiDailyLimit("ask_yoca_ai", "Free")).toBe(5);
    expect(getAiDailyLimit("ask_yoca_ai", "Lite")).toBe(8);
    expect(getAiDailyLimit("ask_yoca_ai", "Plus")).toBe(12);
    expect(getAiDailyLimit("ask_yoca_ai", "Pro")).toBe(20);
  });

  it("uses the configured Volatility Signal Summary limits", () => {
    expect(getAiDailyLimit("volatility_signal_summary", "Free")).toBe(5);
    expect(getAiDailyLimit("volatility_signal_summary", "Lite")).toBe(8);
    expect(getAiDailyLimit("volatility_signal_summary", "Plus")).toBe(12);
    expect(getAiDailyLimit("volatility_signal_summary", "Pro")).toBe(20);
  });

  it("uses the configured remaining AI feature limits", () => {
    expect(getAiDailyLimit("general_ai_chat", "Free")).toBe(5);
    expect(getAiDailyLimit("general_ai_chat", "Lite")).toBe(8);
    expect(getAiDailyLimit("general_ai_chat", "Plus")).toBe(12);
    expect(getAiDailyLimit("general_ai_chat", "Pro")).toBe(20);

    expect(getAiDailyLimit("token_chart_news_summary", "Free")).toBe(5);
    expect(getAiDailyLimit("token_chart_news_summary", "Lite")).toBe(8);
    expect(getAiDailyLimit("token_chart_news_summary", "Plus")).toBe(12);
    expect(getAiDailyLimit("token_chart_news_summary", "Pro")).toBe(20);

    expect(getAiDailyLimit("wallet_ai_analysis", "Free")).toBe(0);
    expect(getAiDailyLimit("wallet_ai_analysis", "Lite")).toBe(0);
    expect(getAiDailyLimit("wallet_ai_analysis", "Plus")).toBe(12);
    expect(getAiDailyLimit("wallet_ai_analysis", "Pro")).toBe(20);

    expect(getAiDailyLimit("wash_trading_ai_analysis", "Free")).toBe(0);
    expect(getAiDailyLimit("wash_trading_ai_analysis", "Lite")).toBe(0);
    expect(getAiDailyLimit("wash_trading_ai_analysis", "Plus")).toBe(3);
    expect(getAiDailyLimit("wash_trading_ai_analysis", "Pro")).toBe(5);

    expect(getAiDailyLimit("wash_trading_ai_chat", "Free")).toBe(0);
    expect(getAiDailyLimit("wash_trading_ai_chat", "Lite")).toBe(0);
    expect(getAiDailyLimit("wash_trading_ai_chat", "Plus")).toBe(5);
    expect(getAiDailyLimit("wash_trading_ai_chat", "Pro")).toBe(10);
  });

  it("locks premium AI analysis features until Plus", () => {
    expect(getAiFeatureRequiredTier("wallet_ai_analysis")).toBe("Plus");
    expect(getAiFeatureRequiredTier("wash_trading_ai_analysis")).toBe("Plus");
    expect(getAiFeatureRequiredTier("wash_trading_ai_chat")).toBe("Plus");
    expect(isAiFeatureLocked("wallet_ai_analysis", "Free")).toBe(true);
    expect(isAiFeatureLocked("wallet_ai_analysis", "Lite")).toBe(true);
    expect(isAiFeatureLocked("wallet_ai_analysis", "Plus")).toBe(false);
    expect(isAiFeatureLocked("wash_trading_ai_analysis", "Pro")).toBe(false);
    expect(isAiFeatureLocked("wash_trading_ai_chat", "Lite")).toBe(true);
    expect(isAiFeatureLocked("wash_trading_ai_chat", "Plus")).toBe(false);
  });

  it("can disable AI usage limits and premium locks with env flag", () => {
    vi.stubEnv("AI_USAGE_LIMIT_ENABLED", "false");

    expect(isAiUsageLimitEnabled()).toBe(false);
    expect(isAiFeatureLocked("wallet_ai_analysis", "Free")).toBe(false);
    expect(isAiFeatureLocked("wash_trading_ai_analysis", "Lite")).toBe(false);
  });

  it("resets at the next UTC midnight", () => {
    expect(getUtcUsageWindow(new Date("2026-06-23T23:59:59.000Z"))).toEqual({
      usageDate: "2026-06-23",
      resetsAt: "2026-06-24T00:00:00.000Z",
    });
  });

  it("uses the highest valid paid tier", () => {
    expect(selectHighestTier([])).toBe("Free");
    expect(selectHighestTier(["Lite", "Pro", "Plus"])).toBe("Pro");
  });
});
