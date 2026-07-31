import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rlFetch: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@sv/util/rate-limit.js", () => ({
  defineProvider: (spec: unknown) => spec,
  pFetch: mocks.rlFetch,
  rlFetch: mocks.rlFetch,
}));

vi.mock("@sv/util/util-mobula.js", () => ({
  getEndpoint: (path: string) => new URL(`https://api.mobula.io/api${path}`),
  getRequiredHeaders: () => ({ "Content-Type": "application/json" }),
  limiter: {},
  spec: {
    id: "mobula",
    limiter: {},
  },
}));

vi.mock("@sv/db/index.js", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

import "@sv/util/date.js";
import { getWalletBalanceHistory } from "@sv/services/wallet/walletCharts.service.js";

function configureCacheRows(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

describe("getWalletBalanceHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upstream error handling", () => {
    it("returns null when upstream returns an error status", async () => {
      configureCacheRows([]);
      mocks.rlFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [{ title: "Internal Server Error", detail: "" }],
          }),
          { status: 500 },
        ),
      );

      const result = await getWalletBalanceHistory(
        "SupRAxJybdbv68r1PDXDq9LWKgdzLsmPwiyj41RM5SF",
        "30D",
      );
      expect(result).toBeNull();
    });

    it("returns null when upstream returns an empty body", async () => {
      configureCacheRows([]);
      mocks.rlFetch.mockResolvedValue(new Response("", { status: 200 }));

      const result = await getWalletBalanceHistory(
        "SupRAxJybdbv68r1PDXDq9LWKgdzLsmPwiyj41RM5SF",
        "30D",
      );
      expect(result).toBeNull();
    });

    it("returns null when upstream returns a malformed body", async () => {
      configureCacheRows([]);
      mocks.rlFetch.mockResolvedValue(new Response("{", { status: 200 }));

      const result = await getWalletBalanceHistory(
        "SupRAxJybdbv68r1PDXDq9LWKgdzLsmPwiyj41RM5SF",
        "30D",
      );
      expect(result).toBeNull();
    });
  });

  describe("caching", () => {
    it("uses valid fresh cached data without calling the upstream API", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-09T12:00:00.000Z"));
      const NOW_MS = Date.now();
      const DAY_MS = 86_400_000;
      // 31 daily points covering the full 30-day range
      const points = Array.from({ length: 31 }, (_, i) => ({
        timestampMs: NOW_MS - (30 - i) * DAY_MS,
        usdValue: 100 + i,
        updatedAtMs: NOW_MS,
      }));
      configureCacheRows(points);

      const result = await getWalletBalanceHistory(
        "SupRAxJybdbv68r1PDXDq9LWKgdzLsmPwiyj41RM5SF",
        "30D",
      );

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(28);
      expect(mocks.rlFetch).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
