import { describe, it, expect } from "vitest";
import { DATA_TRANSFORMERS } from "@sv/services/chat/data-transformers.js";

function ts(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

describe("balanceHistoryTransformer", () => {
  const t = DATA_TRANSFORMERS.get_balance_history;

  it("returns empty data for null/undefined input", () => {
    const r = t(null);
    expect(r).toEqual({ labels: [], datasets: [{ name: "Balance", values: [] }] });
  });

  it("returns empty data for non-array input", () => {
    const r = t({});
    expect(r).toEqual({ labels: [], datasets: [{ name: "Balance", values: [] }] });
  });

  it("converts points to [timestampMs, usdValue] pairs", () => {
    const t1 = ts(2026, 5, 16);
    const t2 = ts(2026, 5, 17);
    const input = [
      { timestampMs: t1, usdValue: 1000.50 },
      { timestampMs: t2, usdValue: 1050.75 },
    ];
    const r = t(input) as { labels: string[]; datasets: { name: string; values: [number, number][] }[] };
    expect(r.labels).toEqual(["2026-05-16", "2026-05-17"]);
    expect(r.datasets[0].name).toBe("Balance");
    expect(r.datasets[0].values).toEqual([
      [t1, 1000.50],
      [t2, 1050.75],
    ]);
  });

  it("preserves order of points", () => {
    const t1 = ts(2026, 5, 17);
    const t2 = ts(2026, 5, 16);
    const input = [
      { timestampMs: t1, usdValue: 200 },
      { timestampMs: t2, usdValue: 100 },
    ];
    const r = t(input) as { datasets: { values: [number, number][] }[] };
    expect(r.datasets[0].values).toEqual([
      [t1, 200],
      [t2, 100],
    ]);
  });
});

describe("pnlChartTransformer", () => {
  const t = DATA_TRANSFORMERS.get_wallet_pnl_history;

  it("returns empty datasets for null input", () => {
    const r = t(null) as { labels: string[]; datasets: { name: string; values: unknown[] }[] };
    expect(r.labels).toEqual([]);
    expect(r.datasets).toHaveLength(2);
    expect(r.datasets[0].values).toEqual([]);
    expect(r.datasets[1].values).toEqual([]);
  });

  it("converts daily and cumulative PnL to [timestamp, value] pairs", () => {
    const t1 = ts(2026, 5, 16);
    const t2 = ts(2026, 5, 17);
    const input = {
      dailyPnL: [
        { timestamp: t1, value: 500 },
        { timestamp: t2, value: -200 },
      ],
      cumulativePnL: [
        { timestamp: t1, value: 500 },
        { timestamp: t2, value: 300 },
      ],
    };
    const r = t(input) as { labels: string[]; datasets: { name: string; values: [number, number | null][] }[] };
    expect(r.labels).toEqual(["2026-05-16", "2026-05-17"]);
    expect(r.datasets[0].name).toBe("Daily PnL");
    expect(r.datasets[0].values).toEqual([
      [t1, 500],
      [t2, -200],
    ]);
    expect(r.datasets[1].name).toBe("Cumulative PnL");
    expect(r.datasets[1].values).toEqual([
      [t1, 500],
      [t2, 300],
    ]);
  });

  it("fills null for missing daily PnL timestamps", () => {
    const t1 = ts(2026, 5, 16);
    const t2 = ts(2026, 5, 17);
    const input = {
      dailyPnL: [
        { timestamp: t1, value: 500 },
      ],
      cumulativePnL: [
        { timestamp: t1, value: 500 },
        { timestamp: t2, value: 800 },
      ],
    };
    const r = t(input) as { datasets: { values: [number, number | null][] }[] };
    expect(r.datasets[0].values).toEqual([
      [t1, 500],
      [t2, null],
    ]);
    expect(r.datasets[1].values).toEqual([
      [t1, 500],
      [t2, 800],
    ]);
  });

  it("handles empty arrays", () => {
    const r = t({ dailyPnL: [], cumulativePnL: [] }) as { datasets: { values: unknown[] }[] };
    expect(r.datasets[0].values).toEqual([]);
    expect(r.datasets[1].values).toEqual([]);
  });
});

describe("realizedPnlBreakdownTransformer", () => {
  const t = DATA_TRANSFORMERS.get_wallet_realized_pnl_desc_breakdown;

  it("maps stored PnL fields to the names exposed to the chat model", () => {
    const r = t([
      {
        tokenAddress: "AnsemTokenAddress",
        symbol: "ANSEM",
        realizedProfitUsd: 668847,
        unrealizedProfitUsd: 142901,
        totalTradeCount: 37,
        totalBoughtUsd: 250000,
        totalSoldUsd: 918847,
      },
    ]);

    expect(r).toEqual([
      {
        tokenAddress: "AnsemTokenAddress",
        token: "ANSEM",
        symbol: "ANSEM",
        realizedPnlUsd: 668847,
        realizedProfitUsd: 668847,
        pnlUsd: 668847,
        unrealizedPnlUsd: 142901,
        totalPnlUsd: 811748,
        trades: 37,
        tradeCount: 37,
        totalTradeCount: 37,
        totalBoughtUsd: 250000,
        totalSoldUsd: 918847,
      },
    ]);
  });

  it("uses the token address when the provider has no symbol", () => {
    const r = t([
      {
        tokenAddress: "UnknownTokenAddress",
        symbol: null,
        realizedProfitUsd: 100,
        unrealizedProfitUsd: 25,
        totalTradeCount: 2,
        totalBoughtUsd: 50,
        totalSoldUsd: 150,
      },
    ]);

    expect(r).toEqual([
      expect.objectContaining({
        tokenAddress: "UnknownTokenAddress",
        token: "UnknownTokenAddress",
        symbol: null,
      }),
    ]);
  });

  it("rejects malformed non-tabular data", () => {
    expect(t({ token: "ANSEM" })).toEqual([]);
  });
});

describe("tokenPrice24hTransformer", () => {
  const t = DATA_TRANSFORMERS.get_token_price_24h;

  it("returns empty data for non-array input", () => {
    const r = t(null);
    expect(r).toEqual({ labels: [], datasets: [{ name: "Price", values: [] }] });
  });

  it("converts points to [unixTimestampMs, price] pairs", () => {
    const input = [
      { unixTimestampMs: 1715904000000, price: 150.25 },
      { unixTimestampMs: 1715907600000, price: 151.00 },
    ];
    const r = t(input) as { labels: string[]; datasets: { name: string; values: [number, number][] }[] };
    expect(r.datasets[0].values).toEqual([
      [1715904000000, 150.25],
      [1715907600000, 151.00],
    ]);
  });
});

describe("tokenPriceDailyTransformer", () => {
  const t = DATA_TRANSFORMERS.get_token_price_daily;

  it("returns empty data for non-array input", () => {
    const r = t([]);
    expect(r).toEqual({ labels: [], datasets: [{ name: "Price", values: [] }] });
  });

  it("converts points to [unixTimestampMs, price] pairs", () => {
    const input = [
      { unixTimestampMs: 1715904000000, price: 150.25 },
      { unixTimestampMs: 1715990400000, price: 151.00 },
    ];
    const r = t(input) as { datasets: { values: [number, number][] }[] };
    expect(r.datasets[0].values).toEqual([
      [1715904000000, 150.25],
      [1715990400000, 151.00],
    ]);
  });
});

describe("drawdownChartTransformer", () => {
  const t = DATA_TRANSFORMERS.get_drawdown_chart;

  it("returns empty data for non-array input", () => {
    const r = t(null);
    expect(r).toEqual({ labels: [], datasets: [{ name: "Drawdown", values: [] }] });
  });

  it("converts points to [timestamp, drawdown] pairs", () => {
    const t1 = ts(2026, 5, 16);
    const t2 = ts(2026, 5, 17);
    const input = [
      { timestamp: t1, date: "2026-05-16", value: 100, drawdown: 0 },
      { timestamp: t2, date: "2026-05-17", value: 90, drawdown: -0.1 },
    ];
    const r = t(input) as { labels: string[]; datasets: { name: string; values: [number, number][] }[] };
    expect(r.labels).toEqual(["2026-05-16", "2026-05-17"]);
    expect(r.datasets[0].name).toBe("Drawdown");
    expect(r.datasets[0].values).toEqual([
      [t1, 0],
      [t2, -0.1],
    ]);
  });

  it("handles negative drawdown values correctly", () => {
    const t1 = ts(2026, 5, 16);
    const t2 = ts(2026, 5, 20);
    const input = [
      { timestamp: t1, date: "2026-05-16", value: 100, drawdown: 0 },
      { timestamp: t2, date: "2026-05-20", value: 70, drawdown: -0.3 },
    ];
    const r = t(input) as { datasets: { values: [number, number][] }[] };
    expect(r.datasets[0].values).toEqual([
      [t1, 0],
      [t2, -0.3],
    ]);
  });
});
