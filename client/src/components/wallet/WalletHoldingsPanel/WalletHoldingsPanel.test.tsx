import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletHoldingsPanel } from "./WalletHoldingsPanel";
import type { WalletPortfolioItem } from "@/services/wallet/walletApi";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toggleToken: vi.fn(),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useUserTheme: () => ({ themeRef: { current: null } }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/contexts/LocalizationContext", () => ({
  useLocalization: () => ({
    lang: "en",
    tr: (key: string, params?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "walletPage.token": "Token",
        "walletPage.price": "Price",
        "walletPage.holding": "Holding",
        "walletPage.value": "Value",
        "walletPage.portfolio": "Portfolio",
        "marketPage.addToWatchlist": "Add to watchlist",
        "marketPage.removeFromWatchlist": "Remove from watchlist",
        "table.filterLabel": `Filter: ${params?.column ?? ""}`,
        "table.apply": "Apply",
        "table.searchPlaceholder": "Search table...",
        "table.searchAriaLabel": "Search table",
        "table.filterSearchPlaceholder": "Search table...",
        "table.from": "Min",
        "table.to": "Max",
        "table.clearFilter": "Clear filter",
        "table.pageRangeText": `Page ${params?.count} of ${params?.total}`,
        "table.page": `Page ${params?.count}`,
        "table.itemsPerPageText": "Items per page",
        "table.previousPage": "Previous page",
        "table.nextPage": "Next page",
        "common.cancel": "Cancel",
        "common.loading": "Loading",
        "common.noData": "No data",
      };
      return labels[key] ?? key;
    },
    fmt: {
      num: {
        currency: (value: number) => `$${value.toFixed(2)}`,
      },
    },
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { userId: "user-1" } }),
}));

vi.mock("@/contexts/WatchlistContext", () => ({
  useWatchlist: () => ({
    tokenWatchlist: [],
    tokenPending: {},
    toggleToken: mocks.toggleToken,
  }),
}));

vi.mock("@/components/charts/AssetDistribution/AssetDistribution.tsx", () => ({
  AssetDistribution: () => <div data-testid="asset-distribution" />,
}));

vi.mock("@/components/token/TokenIdentityCell.tsx", () => ({
  TokenIdentityCell: ({ symbol }: { symbol: string }) => <span>{symbol}</span>,
}));

vi.mock("@/components/tables/TableCellRenderer.tsx", () => ({
  renderBase: (value: unknown) => String(value),
  renderReducedNumber: (value: string) => value,
}));

vi.mock("@/util/wallet-portfolio-mapper.ts", () => ({
  mapPortfolioItems: (portfolio: WalletPortfolioItem[]) =>
    portfolio.length == 0
      ? { rows: [], meta: [] }
      : {
          rows: [
            ["SOL", 100, 1.5, 150],
            ["USDC", 1, 25, 25],
          ],
          meta: [
            {
              tokenAddress:
                portfolio[0]?.tokenAddress == "native"
                  ? "native"
                  : "So11111111111111111111111111111111111111112",
              logoUri: null,
              fullName: "Solana",
            },
            { tokenAddress: "usdc-token-address", logoUri: null, fullName: "USD Coin" },
          ],
        },
  buildPortfolioMetaMap: () => new Map([
    ["SOL", { logoUri: null, fullName: "Solana" }],
    ["USDC", { logoUri: null, fullName: "USD Coin" }],
  ]),
  resolveNativeSolTokenAddress: (tokenAddress: string) =>
    tokenAddress == "native"
      ? "So11111111111111111111111111111111111111112"
      : tokenAddress,
}));

describe("WalletHoldingsPanel", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.toggleToken.mockReset();
  });

  function renderPanel() {
    render(
      <WalletHoldingsPanel
        walletAddress="wallet-1"
        portfolio={[{} as WalletPortfolioItem]}
        portfolioMeta={new Map()}
        loading={false}
      />,
    );
  }

  it("renders condensed holding/value column", () => {
    renderPanel();

    expect(screen.getByText("Holding / Value")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });

  it("keeps the chart mounted and shows a table-shaped skeleton while the portfolio loads", () => {
    render(
      <WalletHoldingsPanel
        walletAddress="wallet-1"
        portfolio={[]}
        portfolioMeta={new Map()}
        loading
      />,
    );

    expect(screen.getByTestId("asset-distribution")).toBeInTheDocument();
    expect(screen.getByTestId("portfolio-skeleton")).toBeInTheDocument();
  });

  it("searches holdings by token name", () => {
    renderPanel();

    fireEvent.change(screen.getByRole("textbox", { name: "Search table" }), {
      target: { value: "usd coin" },
    });

    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.queryByText("SOL")).not.toBeInTheDocument();
  });

  it("filters holdings by value range", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Filter: Holding / Value" }));
    const dialog = screen.getByRole("dialog", { name: "Filter: Holding / Value" });
    fireEvent.change(within(dialog).getAllByLabelText("Min")[1], { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    expect(screen.getByText("SOL")).toBeInTheDocument();
    expect(screen.queryByText("USDC")).not.toBeInTheDocument();
  });

  it("watchlist action does not trigger row navigation", () => {
    renderPanel();

    fireEvent.click(screen.getAllByRole("button", { name: "Add to watchlist" })[0]);

    expect(mocks.toggleToken).toHaveBeenCalledWith("So11111111111111111111111111111111111111112");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("navigates to non-native token rows", () => {
    renderPanel();

    fireEvent.click(screen.getByText("SOL"));

    expect(mocks.navigate).toHaveBeenCalledWith("/tokens/So11111111111111111111111111111111111111112");
  });

  it("opens native SOL holdings through the Wrapped SOL token page", () => {
    render(
      <WalletHoldingsPanel
        walletAddress="wallet-1"
        portfolio={[
          {
            tokenAddress: "native",
            symbol: "SOL",
            amount: 1.5,
            valueUsd: 150,
          },
        ]}
        portfolioMeta={new Map()}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByText("SOL"));

    expect(mocks.navigate).toHaveBeenCalledWith(
      "/tokens/So11111111111111111111111111111111111111112",
    );
  });
});
