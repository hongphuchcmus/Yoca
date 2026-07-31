import client from "@/api/main";
import {
    TimeSeriesTradesScatterChart,
    type TimeSeriesDataPoint,
} from "@/components/charts/TimeSeriesTradesScatterChart";
import { CpyBtn } from "@/components/CpyBtn";
import { PillTabs } from "@/components/common/PillTabs/PillTabs";
import Tble from "@/components/Tble";
import { TknImg } from "@/components/TknImg";
import { TrendNum } from "@/components/TrendNum";
import { Txt } from "@/components/Txt";
import { SOLSCAN_TX_URL } from "@/config/constants";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useCarbonTokens } from "@/hooks/useCarbonToken";
import { useGet } from "@/hooks/useGet";
import overwriteStyles from "@/styles/_overwrite.module.scss";
import { cds } from "@/util/carbon-theme";
import { Column, Grid, IconButton, Link, Stack, Tooltip } from "@carbon/react";
import { ChartAverage, Launch } from "@carbon/react/icons";
import { useMemo, useState } from "react";
import { useParams } from "react-router";

type TokenAverageTradePriceProps = {
  walletAddress: string;
  tokenAddress: string;
  tokenImgUrl: string | null;
  tokenSymbol: string | null;
  tokenName: string | null;
  tokenCurrentPrice: number | null;
  avgBuyPrice: number;
  avgSellPrice: number;
};

type TokenPriceDayRange = "7" | "30" | "90";

/** Visible ticker in the last-traded table; full symbol/name in tooltip. */
const TOKEN_TICKER_VISIBLE_CHARS = 4;

function shortTokenTicker(
  symbol: string | undefined | null,
  tokenAddress: string,
): string {
  const s = (symbol ?? "").trim();
  if (s.length > TOKEN_TICKER_VISIBLE_CHARS) {
    return `${s.slice(0, TOKEN_TICKER_VISIBLE_CHARS).toUpperCase()}...`;
  }
  if (s.length > 0) {
    return s.toUpperCase();
  }
  const addr = tokenAddress.trim();
  if (addr.length <= TOKEN_TICKER_VISIBLE_CHARS) {
    return addr;
  }
  return `${addr.slice(0, TOKEN_TICKER_VISIBLE_CHARS)}...`;
}

function tokenRowTooltip(
  symbol: string | undefined | null,
  tokenAddress: string,
  name: string | undefined | null,
): string {
  const lines: string[] = [];
  const sym = symbol?.trim();
  if (sym) {
    lines.push(sym.toUpperCase());
  } else {
    lines.push(tokenAddress);
  }
  const n = name?.trim();
  if (n && n.toLowerCase() !== sym?.toLowerCase()) {
    lines.push(n);
  }
  return lines.join("\n");
}

export function TokenAverageTradePrice({
  walletAddress,
  tokenAddress,
  tokenImgUrl,
  tokenSymbol,
  tokenName,
  tokenCurrentPrice,
  avgBuyPrice,
  avgSellPrice,
}: TokenAverageTradePriceProps) {
  const { sellColor, buyColor } = useCarbonTokens({
    sellColor: cds.supportError,
    buyColor: cds.supportWarning,
  });
  const { fmt, tr } = useLocalization();
  const [selectedTimeRange, setSelectedTimeRange] =
    useState<TokenPriceDayRange>("7");

  const priceData = useGet(
    client.api.tokens.markets.chart[":address"].daily,
    200,
    {
      param: { address: tokenAddress },
      query: {
        days: selectedTimeRange.toString(),
      },
    },
    {
      select: (data) => {
        return data.map((dataPoint) => ({
          unixTimeMs: dataPoint.unixTimestampMs,
          value: dataPoint.price,
        }));
      },
    },
  );
  const recentTrades = useGet(
    client.api.wallets[":walletAddress"].trades[":tokenAddress"],
    200,
    {
      param: {
        walletAddress,
        tokenAddress,
      },
    },
  );

  const recentTradesRows = useMemo(() => {
    if (!recentTrades.data) return [];

    return recentTrades.data.map((trade, index) => {
      const isBuy = trade.tradeAction == "buy";
      const amount = isBuy ? trade.baseAmount : trade.quoteAmount;
      const symbol = tokenSymbol;

      return {
        id: index.toString(),
        time: fmt.datetime.relativeShort(trade.blockUnixTimeMs, true),
        tradeAction: (
          <span
            style={{
              color: isBuy ? cds.supportSuccess : cds.supportError,
              textTransform: "uppercase",
            }}
          >
            {isBuy ? tr("walletPage.buy") : tr("walletPage.sell")}
          </span>
        ),
        amount: fmt.num.compact.unit(amount, symbol?.toUpperCase() || null),
        value: fmt.num.compact.currency(trade.volumeUsd),
        transaction: (
          <IconButton
            href={`${SOLSCAN_TX_URL}/${trade.transactionHash}`}
            label={tr("walletPage.openInSolscan")}
            kind="ghost"
            size="sm"
          >
            <Launch size={18} />
          </IconButton>
        ),
      };
    });
  }, [recentTrades.data, fmt]);

  return (
    <Stack>
      <Grid narrow className={overwriteStyles.grdNarrowCustom}>
        <Column sm={2} md={2} lg={4}>
          <Stack
            orientation="horizontal"
            gap={3}
            style={{ justifyContent: "start", alignItems: "center" }}
          >
            <TknImg src={tokenImgUrl} alt={tokenSymbol} size={48} />
            <Stack>
              <Stack orientation="horizontal" style={{ alignItems: "center" }}>
                <Link
                  style={{
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                  }}
                >
                  {tokenSymbol ??
                    fmt.text.address(tokenAddress, {
                      maxLength: 4,
                    })}
                </Link>
                <CpyBtn size="xs" copyWhat={tokenAddress} />
              </Stack>

              <Txt size="sm" secondary ellipsis>
                {tokenName}
              </Txt>
            </Stack>
          </Stack>
        </Column>

        <Column sm={1} md={3} lg={6}>
          <Txt size="xl" align="center" stretch>
            {fmt.num.compact.currency(tokenCurrentPrice)}
          </Txt>
        </Column>

        <Column sm={1} md={3} lg={6}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              justifyContent: "end",
              alignItems: "center",
            }}
          >
            <PillTabs
              options={[
                { label: "7d", value: "7" },
                { label: "30d", value: "30" },
                { label: "90d", value: "90" },
              ]}
              value={selectedTimeRange}
              onChange={(v) => setSelectedTimeRange(v as TokenPriceDayRange)}
              size="sm"
            />
          </div>
        </Column>
      </Grid>
      <TimeSeriesTradesScatterChart
        markLines={[
          {
            label: tr("walletPage.avgBuyPrice"),
            value: avgBuyPrice,
            color: buyColor,
          },
          {
            label: tr("walletPage.avgSellPrice"),
            value: avgSellPrice,
            color: sellColor,
          },
        ]}
        valueFormatter={fmt.num.compact.currency}
        data={priceData.data as TimeSeriesDataPoint[] | undefined}
        trades={[]}
        loading={priceData.isLoading}
      />
      <Tble
        title={tr("walletPage.recentTrades")}
        description={tr("walletPage.recentTradesDescription")}
        loading={recentTrades.isLoading}
        rows={recentTradesRows}
        headers={[
          {
            key: "time",
            header: tr("walletPage.time"),
            align: "end",
            width: "10%",
          },
          {
            key: "tradeAction",
            header: tr("walletPage.action"),
            align: "center",
          },
          {
            key: "amount",
            header: tr("walletPage.amount"),
            align: "end",
          },
          {
            key: "value",
            header: `${tr("walletPage.value")}`,
            align: "end",
          },
          {
            key: "transaction",
            header: tr("walletPage.transaction"),
            align: "center",
          },
        ]}
        boxed
        enablePagination
        // stickyHeader
        pageSize={8}
      />
    </Stack>
  );
}

export function TokenDetailsDemo({
  setSelectedToken,
}: {
  setSelectedToken: React.Dispatch<
    React.SetStateAction<{
      address: string;
      symbol: string;
      avgBuyCost: number;
      avgSellCost: number;
    } | null>
  >;
}) {
  const { address } = useParams<{
    address: string;
  }>();

  // const [selectedToken, setSelectedToken] = useState<{
  //   address: string;
  //   symbol: string;
  //   avgBuyCost: number;
  //   avgSellCost: number;
  // } | null>(null);

  const { tr, lang, fmt } = useLocalization();

  const walletTokenDetails = useGet(
    client.api.wallets[":address"]["recent-traded-desc-breakdown"],
    200,
    {
      param: { address: address || "" },
    },
    {
      enabled: !!address,
    },
  );

  const tokenAddresses = useMemo(
    () =>
      walletTokenDetails.data
        ?.map((details) => details.tokenAddress)
        .join(",") || null,
    [walletTokenDetails.data],
  );

  const tokenMeta = useGet(
    client.api.tokens.meta[":addresses"],
    200,
    { param: { addresses: tokenAddresses || "" } },
    {
      enabled: !!tokenAddresses,
      select: (data) => {
        return Object.fromEntries(data.map((item) => [item.address, item]));
      },
    },
  );

  const tokenMarket = useGet(
    client.api.tokens.markets[":addresses"],
    200,
    { param: { addresses: tokenAddresses || "" } },
    {
      enabled: !!tokenAddresses,
    },
  );

  const rows = useMemo(() => {
    if (!walletTokenDetails.data) return [];

    return walletTokenDetails.data.map((details) => {
      const metaForToken = tokenMeta.data?.[details.tokenAddress];
      const sym = metaForToken?.symbol;
      const nm = metaForToken?.name;
      const tickerShort = shortTokenTicker(sym, details.tokenAddress);
      const tooltip = tokenRowTooltip(sym, details.tokenAddress, nm);

      return {
        id: details.tokenAddress,
        token: (
          <Stack
            orientation="horizontal"
            gap={2}
            style={{ alignItems: "center", minWidth: 0, maxWidth: "11rem" }}
          >
            <TknImg
              size={42}
              loading={tokenMeta.isLoading}
              src={metaForToken?.imageUrl}
            />
            <Stack style={{ minWidth: 0 }}>
              <Stack
                orientation="horizontal"
                style={{ alignItems: "center", gap: "0.25rem" }}
              >
                <Tooltip label={tooltip} align="right-top">
                  <Link
                    style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}
                  >
                    {tickerShort}
                  </Link>
                </Tooltip>
                <CpyBtn size="xs" copyWhat={details.tokenAddress} />
              </Stack>
              <small style={{ whiteSpace: "nowrap" }}>
                {fmt.datetime.relativeShort(
                  details.lastTradeUnixTime * 1000,
                  true,
                )}
              </small>
            </Stack>
          </Stack>
        ),
        balance:
          details.balanceAmount == null || details.balanceAmount == 0 ? (
            <p>{tr("walletPage.soldAll")}</p>
          ) : (
            <Stack>
              <p>
                {fmt.num.compact.currency(
                  tokenMarket.data?.[details.tokenAddress]?.priceUsd
                    ? tokenMarket.data?.[details.tokenAddress]?.priceUsd *
                      details.balanceAmount
                    : null,
                )}
              </p>
              <p>{fmt.num.compact.decimal(details.balanceAmount)}</p>
            </Stack>
          ),
        pnl: (
          <Stack style={{ justifyContent: "inherit" }}>
            <TrendNum
              prefixes="plus-minus"
              value={details.unrealizedProfitUsd + details.realizedProfitUsd}
              formatter={fmt.num.compact.currency}
            />
            <TrendNum
              prefixes="plus-minus"
              value={
                details.realizedProfitPercent + details.unrealizedProfitPercent
              }
              formatter={fmt.num.percent}
            />
          </Stack>
        ),
        realizedPnl: (
          <Stack style={{ justifyContent: "inherit" }}>
            <TrendNum
              prefixes="plus-minus"
              value={details.realizedProfitUsd}
              formatter={fmt.num.compact.currency}
            />
            <TrendNum
              prefixes="plus-minus"
              value={details.realizedProfitPercent}
              formatter={fmt.num.percent}
            />
          </Stack>
        ),
        unrealizedPnl: (
          <TrendNum
            prefixes="plus-minus"
            value={details.unrealizedProfitUsd}
            formatter={fmt.num.compact.currency}
          />
        ),
        buy: (
          <Stack style={{ justifyContent: "inherit" }}>
            <p>{fmt.num.compact.currency(details.totalBoughtUsd)}</p>
            <p>{fmt.num.compact.decimal(details.totalBoughtAmount)}</p>
          </Stack>
        ),
        sell: (
          <Stack style={{ justifyContent: "inherit" }}>
            <p>{fmt.num.compact.currency(details.totalSoldUsd)}</p>
            <p>{fmt.num.compact.decimal(details.totalSoldAmount)}</p>
          </Stack>
        ),
        net: (
          <TrendNum
            prefixes="plus-minus"
            value={details.totalSoldUsd - details.totalBoughtUsd}
            formatter={fmt.num.compact.currency}
          />
        ),
        tradeCount: (
          <span>
            <TrendNum
              value={details.totalBuyCount}
              formatter={fmt.num.compact.decimal}
              prefixes="none"
            />{" "}
            /{" "}
            <TrendNum
              value={-details.totalSellCount}
              formatter={fmt.num.compact.decimal}
              prefixes="none"
            />
          </span>
        ),
        avgTradePrice: (
          <Stack style={{ justifyContent: "inherit" }}>
            <p>{fmt.num.compact.currency(details.avgBuyCost)}</p>
            <p>{fmt.num.compact.currency(details.avgSellCost)}</p>
          </Stack>
        ),
        tradePriceGraph: (
          <IconButton
            kind="ghost"
            label={tr("walletPage.averageTradingPrice")}
            align="bottom-right"
            onClick={() =>
              setSelectedToken({
                address: details.tokenAddress,
                symbol: metaForToken?.symbol?.toUpperCase() ?? "Unknown",
                avgBuyCost: details.avgBuyCost,
                avgSellCost: details.avgSellCost,
              })
            }
          >
            <ChartAverage />
          </IconButton>
        ),
      };
    });
  }, [
    walletTokenDetails.data,
    tokenMeta.isLoading,
    tokenMeta.data,
    tokenMarket.data,
    lang,
  ]);

  if (!address) {
    return <></>;
  }

  return (
    // <PageWrapper
    //   extraHeaderPanel={{
    //     isOpen: !!selectedToken,
    //     content: selectedToken && (
    //       <TokenAverageTradePrice
    //         walletAddress={address}
    //         tokenAddress={selectedToken.address}
    //         tokenImgUrl={
    //           tokenMeta.data?.[selectedToken.address]?.imageUrl || null
    //         }
    //         tokenName={tokenMeta.data?.[selectedToken.address]?.name || null}
    //         tokenSymbol={
    //           tokenMeta.data?.[selectedToken.address]?.symbol || null
    //         }
    //         tokenCurrentPrice={
    //           tokenMarket.data?.[selectedToken.address]?.priceUsd || null
    //         }
    //         avgBuyPrice={selectedToken.avgBuyCost}
    //         avgSellPrice={selectedToken.avgSellCost}
    //       />
    //     ),
    //     size: "lg",
    //     onClose: () => setSelectedToken(null),
    //   }}
    // >
    <Tble
      loading={walletTokenDetails.isLoading}
      boxed
      title={tr("walletPage.tokensLastTraded")}
      description={tr("walletPage.tokensLastTradedDescription")}
      rows={rows}
      height="auto"
      enablePagination
      headers={[
        {
          key: "token",
          header: `${tr("walletPage.token")} / ${tr("walletPage.time")}`,
          align: "start",
          minWidth: "11rem",
        },
        {
          key: "balance",
          header: tr("walletPage.balance"),
          align: "center",
          minWidth: "7.5rem",
        },
        { key: "pnl", header: tr("walletPage.profit"), minWidth: "6.5rem" },
        {
          key: "realizedPnl",
          header: tr("walletPage.realizedProfit"),
          minWidth: "9.5rem",
        },
        {
          key: "unrealizedPnl",
          header: tr("walletPage.unrealizedProfit"),
          minWidth: "10.5rem",
        },
        {
          key: "buy",
          header: tr("walletPage.totalBought"),
          align: "end",
          minWidth: "8.5rem",
        },
        {
          key: "sell",
          header: tr("walletPage.totalSold"),
          align: "end",
          minWidth: "7.5rem",
        },
        {
          key: "net",
          header: tr("walletPage.netValue"),
          align: "end",
          minWidth: "6rem",
        },
        {
          key: "tradeCount",
          header: tr("walletPage.transactions"),
          align: "end",
          minWidth: "11.5rem",
        },
        {
          key: "avgTradePrice",
          header: tr("walletPage.avgBuySellPrice"),
          align: "end",
          minWidth: "9.5rem",
        },
        {
          key: "tradePriceGraph",
          header: tr("walletPage.graph"),
          align: "center",
          minWidth: "3.5rem",
        },
      ]}
    />
    // </PageWrapper>
  );
}
