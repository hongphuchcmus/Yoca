import client from "@/api/main";
import {
  MarketStats,
  NewsTab,
  PoolSelector,
  RecentTransactions,
  TokenAIChat,
  TokenChart,
  TokenHeader,
  VolatilitySignals,
  TopHolders,
} from "@/components/token";
import { PageWrapper } from "@/components/wrapper/PageWrapper";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useGet } from "@/hooks/useGet";
import { dexLabel } from "@/util/format";
import { InlineLoading } from "@carbon/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import styles from "./index.module.scss";

function useTokenPageData(address: string, poolAddress: string) {
  const baseMeta = useGet(
    client.api.tokens.details[":addresses"],
    200,
    {
      param: { addresses: address },
    },
    {
      select: (dataArr) =>
        dataArr.map((data) => ({
          ...data.meta,
          ...data.details,
        })),
    },
  );

  const topPools = useGet(client.api.tokens[":address"].pools, 200, {
    param: { address },
  });

  const holders = useGet(client.api.tokens.holders[":address"], 200, {
    param: { address },
  });

  const holdersStats = useGet(
    client.api.tokens.holders.stats[":addresses"],
    200,
    {
      param: { addresses: address },
    },
  );

  const marketData = useGet(client.api.tokens.markets[":addresses"], 200, {
    param: { addresses: address },
  });

  const trades = useGet(client.api.tokens.pools.trades[":address"], 200, {
    param: { address: poolAddress },
  });

  const poolData = useGet(client.api.tokens.pools[":addresses"], 200, {
    param: { addresses: poolAddress },
    query: { refresh: "false" },
  });

  const isLoading =
    baseMeta.isLoading || topPools.isLoading || marketData.isLoading;
  const pairLoading = trades.isLoading || poolData.isLoading;

  // Only block on critical data errors, not holders (which depends on Moralis API)
  const error = baseMeta.error || topPools.error || marketData.error;
  const pairError = trades.error || poolData.error;

  if (isLoading || error || pairLoading) {
    return {
      isLoading,
      error,
      pairLoading,
      pairError,
      data: null as null,
    };
  }

  const metaFromApi = Array.isArray(baseMeta.data)
    ? (baseMeta.data[0] ?? null)
    : (baseMeta.data ?? null);
  const holdersInfo = Array.isArray(holdersStats.data)
    ? (holdersStats.data[0] ?? null)
    : (holdersStats.data ?? null);
  const pool = poolData.data?.[0] ?? null;

  if (!pool || !baseMeta.data) {
    return {
      isLoading: false,
      error: new Error(
        !pool ? "Pool data is unavailable" : "Token metadata is unavailable",
      ),
      data: null as null,
    };
  }

  const fallbackSymbol = pool?.poolName?.split(" / ")[0] || "UNKNOWN";
  const fallbackName =
    fallbackSymbol !== "UNKNOWN" ? fallbackSymbol : "Unknown Token";

  const meta = {
    ...metaFromApi,
    name:
      metaFromApi?.name && metaFromApi.name !== "Unknown Token"
        ? metaFromApi.name
        : fallbackName,
    symbol:
      metaFromApi?.symbol && metaFromApi.symbol !== "UNKNOWN"
        ? metaFromApi.symbol
        : fallbackSymbol,
    address: metaFromApi?.address ?? address,
    imageUrl: metaFromApi?.imageUrl ?? pool?.baseImageUrl ?? undefined,
  };

  const normalizedTopPools = (topPools.data ?? []).filter((p) => !!p?.data);

  return {
    isLoading: false,
    error: null,
    pairLoading,
    pairError,
    data: {
      meta,
      topPools: normalizedTopPools,
      holders: holders.data ?? [],
      holdersInfo,
      market: marketData.data?.[address] ?? null,
      trades: trades.data ?? [],
      pool,
    },
  };
}

export default function TokenPage() {
  const navigate = useNavigate();
  const { tr, fmt } = useLocalization();

  const { address, poolAddress } = useParams<{
    address: string;
    poolAddress: string;
  }>();

  const safeAddress = address ?? "";
  const safePoolAddress = poolAddress ?? "";
  const result = useTokenPageData(safeAddress, safePoolAddress);

  const [pairData, setPairData] = useState<
    NonNullable<typeof result.data>["pool"] | null
  >(null);

  useEffect(() => {
    setPairData(null);
  }, [poolAddress]);

  useEffect(() => {
    const nextPool = result.data?.pool ?? null;
    if (!nextPool) {
      return;
    }

    if (nextPool.poolAddress === poolAddress) {
      setPairData(nextPool);
    }
  }, [poolAddress, result.data?.pool]);

  if (!address || !poolAddress) {
    return <>Forgot to add address!</>;
  }

  if (poolAddress && !result.error && (result.pairLoading || !pairData)) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          width: "100%",
        }}
      >
        <div style={{ width: "fit-content" }}>
          <InlineLoading status="active" description="Loading token data..." />
        </div>
      </div>
    );
  }

  if (result.isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          width: "100%",
        }}
      >
        <div style={{ width: "fit-content" }}>
          <InlineLoading status="active" description="Loading token data..." />
        </div>
      </div>
    );
  }

  if (result.error || !result.data || !result.data.meta) {
    return (
      <PageWrapper>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Data Unavailable</h2>
          <p>
            {result.error instanceof Error
              ? result.error.message
              : "Could not load token details. Please try again later."}
          </p>
        </div>
      </PageWrapper>
    );
  }

  const { meta, topPools, holders, holdersInfo, market, trades } = result.data;
  const pool = pairData;

  if (!pool) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          width: "100%",
        }}
      >
        <div style={{ width: "fit-content" }}>
          <InlineLoading status="active" description="Loading token data..." />
        </div>
      </div>
    );
  }

  return (
    <PageWrapper>
      <div className={styles.tokenPoolPage}>
        <section className={styles.pageHero}>
          <div className={styles.pageHeroEyebrow}>{tr("token.poolPage.eyebrow")}</div>
          <div className={styles.pageHeroBody}>
            <div className={styles.pageHeroTitleRow}>
              <h1 className={styles.pageHeroTitle}>
                {pool.poolName || `${meta.symbol} Pool`}
              </h1>
              {pool.dexId && (
                <span className={styles.heroBadge}>{dexLabel(pool.dexId)}</span>
              )}
            </div>
            <p className={styles.pageHeroDescription}>
              {tr("token.poolPage.description")}
            </p>
          </div>

        </section>

        <div className={styles.tokenPageGrid}>
          <div className={styles.leftColumn}>
          <div className={styles.sidebarGroup}>
            <section className={styles.sidebarHeroCard}>
              <TokenHeader
                name={meta.name}
                symbol={meta.symbol}
                address={meta.address}
                imageUrl={meta.imageUrl ?? undefined}
                coinGeckoId={meta.coingeckoId ?? null}
                discordInvite={meta.linkDiscord}
                websiteUrl={meta.linkHomepage}
                twitterHandle={meta.twitterScreenName}
                sidebar
              />
            </section>

            <section className={styles.sidebarSection}>
              <PoolSelector
                pools={topPools.map((p) => ({
                  dexId: p.data.dexId,
                  poolAddress: p.data.poolAddress,
                  poolName: p.data.poolName,
                  liquidityUsd: p.data.liquidityUsd,
                  volumeUsd24h: p.data.volumeUsd24h,
                }))}
                selectedPool={{
                  poolAddress: pool?.poolAddress ?? "",
                  dexId: pool?.dexId ?? "unknown",
                  liquidityUsd: pool?.liquidityUsd ?? 0,
                  poolName: pool?.poolName ?? "-",
                  volumeUsd24h: pool?.volumeUsd24h ?? 0,
                }}
                onPoolChange={(newPoolAddress) =>
                  navigate(`/tokens/${address}/${newPoolAddress}`)
                }
              />
            </section>

            <section className={styles.sidebarSection}>
              <MarketStats
                data={market}
                pool={pool}
                topHolders={holders}
                holdersInfo={holdersInfo}
                marketsCount={topPools.length}
              />
            </section>

            {holders.length > 0 && (
              <section className={styles.sidebarSection}>
                <TopHolders holders={holders} />
              </section>
            )}

            <section className={styles.sidebarSection}>
              <NewsTab
                address={address}
                symbol={meta.symbol}
                name={meta.name}
              />
            </section>
          </div>
          </div>

          <div className={styles.rightColumn}>
            <TokenChart pool={pool} />

            <VolatilitySignals
              address={address}
              symbol={meta.symbol}
              name={meta.name}
            />

            <TokenAIChat
              address={address}
              symbol={meta.symbol}
              name={meta.name}
              timeframe="24h"
            />

            <RecentTransactions
              trades={trades.map((trade) => {
                const kind = trade.buyTokenAddress == address ? "buy" : "sell";

                const amount =
                  kind == "buy" ? trade.buyTokenAmount : trade.sellTokenAmount;

                const priceUsd =
                  kind == "buy"
                    ? trade.buyTokenPriceUsd
                    : trade.sellTokenPriceUsd;

                // Price in quote token (e.g. SOL per base token)
                const priceQuote =
                  kind == "buy"
                    ? trade.sellTokenAmount / trade.buyTokenAmount
                    : trade.buyTokenAmount / trade.sellTokenAmount;

                return {
                  kind,
                  amount,
                  fromAddress: trade.signerAddress,
                  id: trade.id,
                  timestamp: trade.blockTimestamp,
                  txHash: trade.transactionHash,
                  volumeUsd: trade.volumeInUsd,
                  priceUsd,
                  priceQuote,
                };
              })}
              baseMeta={{
                address,
                symbol: meta.symbol,
                imageUrl: meta.imageUrl ?? null,
              }}
              tokenAddress={""}
              tokenSymbol={""}
              quoteMeta={{
                address: "",
                symbol: "",
                imageUrl: null,
              }}
            />
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
