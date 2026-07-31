import { useLocalization } from "@/contexts/LocalizationContext";
import {
  fetchDayActivitySummary,
  type WalletDayActivitySummary,
  type WalletDaySwapSummary,
  type WalletDayToken,
} from "@/services/wallet/walletApi";
import { Close, Draggable } from "@carbon/icons-react";
import { SkeletonText, TextAreaSkeleton } from "@carbon/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TokenStack } from "./TokenStack";
import { resolveNativeSolTokenAddress } from "@/util/wallet-portfolio-mapper";
import { TimelineView } from "./TimelineView";
import { TxRow } from "./TxRow";
import { WalletSelector } from "./WalletSelector";
import styles from "./DayActivityPopup.module.scss";
import { ChartColumn } from "@carbon/react/icons";
import { TokenPriceChart } from "@/components/charts/TokenPriceChart/TokenPriceChart";
import { Flex } from "@/components/Flex";
import { Txt } from "@/components/Txt";
import { SegmentedControl } from "@/components/charts/shared/ChartControls";
import Tble, { TbleFilterType, TbleSortType } from "@/components/Tble";

interface DayActivityPopupProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: string[];
  dayTimestamp: number;
}

interface AggregatedTxGroup {
  action: "buy" | "sell";
  tokenSymbol: string;
  tokenLogoUri: string | null;
  totalAmount: number;
  totalVolumeUsd: number;
  tradeCount: number;
  swaps: WalletDaySwapSummary[];
}

const DEFAULT_POSITION = { x: 0, y: 100 };

export const DayActivityPopup: React.FC<DayActivityPopupProps> = ({
  isOpen,
  onClose,
  wallets,
  dayTimestamp,
}) => {
  const { fmt, tr } = useLocalization();
  const [selectedWallet, setSelectedWallet] = useState(wallets[0] ?? "");
  const [summary, setSummary] = useState<WalletDayActivitySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const [chartTokens, setChartTokens] = useState<WalletDayToken[]>([]);
  const [expandedTxGroup, setExpandedTxGroup] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [sidePanelTab, setSidePanelTab] = useState<"charts" | "detail">("charts");



  useEffect(() => {
    if (!isOpen) {
      setChartTokens([]);
      setExpandedTxGroup(null);
      setViewMode("list");
      return;
    }
    if (wallets.length > 0 && !wallets.includes(selectedWallet)) {
      setSelectedWallet(wallets[0] ?? "");
    }
  }, [isOpen, wallets, selectedWallet]);

  useEffect(() => {
    if (!isOpen || !selectedWallet) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDayActivitySummary(selectedWallet, dayTimestamp)
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load activity",
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedWallet, dayTimestamp]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      setPosition({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      setDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging]);

  const addChart = useCallback((token: WalletDayToken) => {
    const chartToken = {
      ...token,
      address: resolveNativeSolTokenAddress(token.address),
    };
    setChartTokens((prev) => {
      if (prev.some((item) => item.address == chartToken.address)) return prev;
      return [...prev, chartToken];
    });
  }, []);

  const removeChart = useCallback((address: string) => {
    setChartTokens((prev) => prev.filter((t) => t.address !== address));
  }, []);

  const clearCharts = useCallback(() => {
    setChartTokens([]);
  }, []);

  const tokenLogoMap = useMemo(() => {
    if (!summary) return {};
    const map: Record<string, string | null> = {};
    for (const t of summary.allTokens) {
      map[t.address] = t.logoUri;
    }
    return map;
  }, [summary]);

  const aggregatedTxs = useMemo((): AggregatedTxGroup[] => {
    if (!summary) return [];

    const logoMap = new Map<string, string | null>();
    for (const token of summary.allTokens) {
      logoMap.set(token.address, token.logoUri);
    }

    const groupMap = new Map<string, AggregatedTxGroup>();

    for (const swap of summary.swaps) {
      const boughtAddr = swap.boughtTokenAddress;
      const soldAddr = swap.soldTokenAddress;

      const boughtSym = swap.boughtSymbol;
      const soldSym = swap.soldSymbol;
      const isBuy = swap.action === "buy";

      const tokenAddr = isBuy ? boughtAddr : soldAddr;
      if (!tokenAddr) continue;
      const tokenSymbol = isBuy ? boughtSym : soldSym;
      if (!tokenSymbol) continue;

      const key = `${swap.action}-${tokenAddr}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.totalAmount += isBuy
          ? swap.boughtAmount
          : swap.soldAmount;
        existing.totalVolumeUsd += swap.valueUsd;
        existing.tradeCount += 1;
        existing.swaps.push(swap);
      } else {
        groupMap.set(key, {
          action: swap.action,
          tokenSymbol,
          tokenLogoUri: logoMap.get(tokenAddr) ?? null,
          totalAmount: isBuy ? swap.boughtAmount : swap.soldAmount,
          totalVolumeUsd: swap.valueUsd,
          tradeCount: 1,
          swaps: [swap],
        });
      }
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      const aTime = a.swaps[0]?.timestamp
        ? Date.parse(a.swaps[0].timestamp)
        : 0;
      const bTime = b.swaps[0]?.timestamp
        ? Date.parse(b.swaps[0].timestamp)
        : 0;
      return bTime - aTime;
    });
  }, [summary]);



  const tbleRows = useMemo(
    () =>
      aggregatedTxs.map((g) => ({
        id: `${g.action}-${g.tokenSymbol}`,
        action: g.action,
        amount: g.totalAmount,
        tokenSymbol: g.tokenSymbol,
        tokenLogoUri: g.tokenLogoUri,
        count: g.tradeCount,
        volume: g.totalVolumeUsd,
        _searchText: g.tokenSymbol,
      })),
    [aggregatedTxs],
  );

  const expandedGroupData = useMemo(
    () => aggregatedTxs.find((g) => `${g.action}-${g.tokenSymbol}` === expandedTxGroup) ?? null,
    [aggregatedTxs, expandedTxGroup],
  );

  const getTradesForToken = useCallback(
    (token: WalletDayToken) => {
      if (!summary) return [];
      const tokenAddr = token.address;
      return summary.swaps
        .filter((swap) => {
          const boughtAddr = swap.boughtTokenAddress;
          const soldAddr = swap.soldTokenAddress;
          return boughtAddr === tokenAddr || soldAddr === tokenAddr;
        })
        .map((swap) => {
          const boughtAddr = swap.boughtTokenAddress;
          const soldAddr = swap.soldTokenAddress;
          const isBoughtMatch = boughtAddr === tokenAddr;
          const isSoldMatch = soldAddr === tokenAddr;
          const tradeType: "buy" | "sell" = isBoughtMatch
            ? "buy"
            : isSoldMatch
              ? "sell"
              : "buy";
          const amount = isBoughtMatch
            ? swap.boughtAmount
            : isSoldMatch
              ? swap.soldAmount
              : swap.valueUsd;
          const price = isBoughtMatch
            ? swap.valueUsd / swap.boughtAmount || 0
            : swap.valueUsd / swap.soldAmount || 0;
          return {
            timestampMs: Date.parse(swap.timestamp),
            type: tradeType,
            price,
            amount,
            symbol: token.symbol,
          };
        })
        .filter((t) => t.timestampMs > 0);
    },
    [summary],
  );

  if (!isOpen) return null;

  const dateStr = new Date(dayTimestamp).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const hasCharts = chartTokens.length > 0;

  return (
    <div
      ref={panelRef}
      className={`${styles.card} ${dragging ? styles.dragging : ""}`}
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className={styles.header} onMouseDown={handleMouseDown}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <Draggable size={16} className={styles.dragIcon} />
            <h2 className={styles.title}>{tr("walletPage.activity")}</h2>
            <h3 className={styles.date}>{fmt.datetime.date(dateStr)}</h3>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={tr("common.cancel")}
          >
            <Close size={20} />
          </button>
        </div>
      </div>

      <div className={styles.columnGrid}>
        <div className={styles.mainContent}>
          {wallets.length > 1 && (
            <WalletSelector
              wallets={wallets}
              selected={selectedWallet}
              onSelect={setSelectedWallet}
            />
          )}

          {loading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingStatRows}>
                <div className={styles.loadingStatRow}>
                  <SkeletonText width="6rem" />
                  <SkeletonText width="4rem" />
                </div>
                <div className={styles.loadingStatRow}>
                  <SkeletonText width="8rem" />
                  <SkeletonText width="6rem" />
                </div>
                <div className={styles.loadingStatRow}>
                  <SkeletonText width="8rem" />
                  <SkeletonText width="4rem" />
                </div>
              </div>
              <TextAreaSkeleton />
              <TextAreaSkeleton />
            </div>
          )}

          {error && (
            <div className={styles.errorContainer}>
              <p className={styles.errorText}>{error}</p>
            </div>
          )}

          {summary && !loading && (
            <div className={styles.body}>
              <Flex dir="column" gap={0}>
                <Flex
                  dir="row"
                  align="center"
                  justify="between"
                  p={3}
                  pInline={4}
                >
                  <Flex dir="row" align="center" gap={2}>
                    <ChartColumn size={14} />
                    <Txt size="sm" secondary>
                      {tr("wallet.tradingVolume")}
                    </Txt>
                  </Flex>
                  <Txt size="sm" weight="semibold">
                    {fmt.num.compact.currency(
                      summary.buyVolumeUsd + summary.sellVolumeUsd,
                    )}
                  </Txt>
                </Flex>
                <Flex
                  dir="row"
                  align="center"
                  justify="between"
                  p={3}
                  pInline={4}
                >
                  <Txt size="sm" secondary>
                    {tr("wallet.tradingVolume")} ({tr("walletPage.buy")}/
                    {tr("walletPage.sell")})
                  </Txt>
                  <Flex dir="row" align="center" gap={1}>
                    <Txt size="sm" weight="semibold" style={{ color: "var(--yoca-success)" }}>
                      {fmt.num.compact.currency(summary.buyVolumeUsd)}
                    </Txt>
                    <Txt size="sm" secondary>
                      /
                    </Txt>
                    <Txt size="sm" weight="semibold" style={{ color: "var(--yoca-danger)" }}>
                      {fmt.num.compact.currency(summary.sellVolumeUsd)}
                    </Txt>
                  </Flex>
                </Flex>
                <Flex
                  dir="row"
                  align="center"
                  justify="between"
                  p={3}
                  pInline={4}
                >
                  <Txt size="sm" secondary>
                    {tr("wallet.transactionCount")} ({tr("walletPage.buy")}/
                    {tr("walletPage.sell")})
                  </Txt>
                  <Flex dir="row" align="center" gap={1}>
                    <Txt size="sm" weight="semibold" style={{ color: "var(--yoca-success)" }}>
                      {fmt.num.decimal(summary.buyTxCount)}
                    </Txt>
                    <Txt size="sm" secondary>
                      /
                    </Txt>
                    <Txt size="sm" weight="semibold" style={{ color: "var(--yoca-danger)" }}>
                      {fmt.num.decimal(summary.sellTxCount)}
                    </Txt>
                  </Flex>
                </Flex>
              </Flex>

              <div className={styles.section}>
                <div className={styles.sectionHeaderRow}>
                  <h3 className={styles.sectionTitle}>
                    {tr("wallet.tokensTraded")}
                  </h3>
                </div>
                <TokenStack
                  tokens={summary.allTokens}
                  totalTokens={summary.totalTokensTraded}
                  onTokenClick={addChart}
                />
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeaderRow}>
                  <h3 className={styles.sectionTitle}>
                    {tr("walletPage.transactions")}
                  </h3>
                  <SegmentedControl
                    options={[
                      { value: "list", label: tr("walletPage.list") },
                      {
                        value: "timeline",
                        label: tr("walletPage.timeline"),
                      },
                    ]}
                    value={viewMode}
                    onChange={(v) => {
                      setViewMode(v as "list" | "timeline");
                      setExpandedTxGroup(null);
                    }}
                    ariaLabel={tr("walletPage.viewMode")}
                  />
                </div>

                {viewMode === "list" ? (
                  <div className={styles.txList}>
                    {aggregatedTxs.length === 0 ? (
                      <p className={styles.emptyText}>
                        {tr("common.noData")}
                      </p>
                    ) : (
                      <>
                        <Tble
                          rows={tbleRows}
                          headers={[
                            { key: "action", header: tr("walletPage.action") },
                            { key: "amount", header: tr("walletPage.amount") },
                            { key: "token", header: tr("walletPage.token") },
                            { key: "count", header: tr("walletPage.trades") },
                            { key: "volume", header: tr("walletPage.totalVolume") },
                          ]}
                          enableSearch
                          searchFields={["_searchText"]}
                          enablePagination
                          pageSize={25}
                          boxed
                          sortConfigs={{
                            amount: { type: TbleSortType.Number },
                            count: { type: TbleSortType.Number },
                            volume: { type: TbleSortType.Number },
                          }}
                          filterSchema={{
                            action: { type: TbleFilterType.Select },
                          }}
                          cellRenderers={{
                            action: (v) => (
                              <span
                                style={{
                                  color:
                                    v === "buy"
                                      ? "var(--yoca-success)"
                                      : "var(--yoca-danger)",
                                  fontWeight: 600,
                                }}
                              >
                                {v === "buy"
                                  ? tr("walletPage.buy")
                                  : tr("walletPage.sell")}
                              </span>
                            ),
                            token: (_v, row) => (
                              <TxTokenCell
                                symbol={row.tokenSymbol as string}
                                logoUri={row.tokenLogoUri as string | null}
                              />
                            ),
                            amount: (v) => (
                              <Txt size="sm">
                                {fmt.num.compact.decimal(v as number)}
                              </Txt>
                            ),
                            count: (v) => (
                              <Txt size="sm" secondary>
                                {fmt.num.decimal(v as number)}
                              </Txt>
                            ),
                            volume: (v) => (
                              <Txt size="sm" weight="semibold">
                                {fmt.num.compact.currency(v as number)}
                              </Txt>
                            ),
                          }}
                          onRowClick={(row) => {
                            setExpandedTxGroup((prev) =>
                              prev === row.id ? null : (row.id as string),
                            );
                            setSidePanelTab("detail");
                          }}
                        />

                      </>
                    )}
                  </div>
                ) : (
                  <TimelineView
                    swaps={summary.swaps}
                    dayTimestamp={dayTimestamp}
                    tokenLogoMap={tokenLogoMap}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {(hasCharts || expandedGroupData) && (
          <div className={styles.sidePanel}>
            {hasCharts && expandedGroupData ? (
              <>
                <div className={styles.sidePanelHeader}>
                  <SegmentedControl
                    options={[
                      { value: "charts", label: "Charts" },
                      { value: "detail", label: "Detail" },
                    ]}
                    value={sidePanelTab}
                    onChange={(v) => setSidePanelTab(v as "charts" | "detail")}
                    ariaLabel="Side panel tabs"
                  />
                </div>
                <div className={styles.sidePanelBody}>
                  {sidePanelTab === "charts"
                    ? chartTokens.map((token) => (
                        <TokenPriceChart
                          key={token.address}
                          tokenAddress={token.address}
                          tokenSymbol={token.symbol}
                          tokenLogoUri={token.logoUri}
                          dayMs={dayTimestamp}
                          trades={getTradesForToken(token)}
                          priceHistory={token.priceHistory}
                          onRemove={() => removeChart(token.address)}
                        />
                      ))
                    : expandedGroupData.swaps.map((swap) => (
                        <TxRow
                          key={swap.transactionHash}
                          swap={swap}
                          logoMap={tokenLogoMap}
                        />
                      ))}
                </div>
              </>
            ) : hasCharts ? (
              <>
                <div className={styles.sidePanelHeader}>
                  <span className={styles.sidePanelTitle}>
                    {tr("wallet.tokensTraded")}
                  </span>
                  <button
                    className={styles.sidePanelCloseBtn}
                    onClick={clearCharts}
                    aria-label={tr("common.cancel")}
                  >
                    <Close size={16} />
                  </button>
                </div>
                <div className={styles.sidePanelBody}>
                  {chartTokens.map((token) => (
                    <TokenPriceChart
                      key={token.address}
                      tokenAddress={token.address}
                      tokenSymbol={token.symbol}
                      tokenLogoUri={token.logoUri}
                      dayMs={dayTimestamp}
                      trades={getTradesForToken(token)}
                      priceHistory={token.priceHistory}
                      onRemove={() => removeChart(token.address)}
                    />
                  ))}
                </div>
              </>
            ) : (() => {
              const group = expandedGroupData!;
              return (
                <>
                  <div className={styles.sidePanelHeader}>
                    <span className={styles.sidePanelTitle}>
                      {group.action === "buy"
                        ? tr("walletPage.buy")
                        : tr("walletPage.sell")}{" "}
                      {group.tokenSymbol}
                    </span>
                    <button
                      className={styles.sidePanelCloseBtn}
                      onClick={() => setExpandedTxGroup(null)}
                      aria-label={tr("common.cancel")}
                    >
                      <Close size={16} />
                    </button>
                  </div>
                  <div className={styles.sidePanelBody}>
                    {group.swaps.map((swap) => (
                      <TxRow
                        key={swap.transactionHash}
                        swap={swap}
                        logoMap={tokenLogoMap}
                      />
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

function TxTokenCell({
  symbol,
  logoUri,
}: {
  symbol: string;
  logoUri: string | null;
}) {
  const imageSize = 18;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      {logoUri ? (
        <img
          src={logoUri}
          alt={symbol}
          style={{
            width: imageSize,
            height: imageSize,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        <span
          style={{
            width: imageSize,
            height: imageSize,
            borderRadius: "50%",
            background: "var(--yoca-bg-soft)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--yoca-text-muted)",
          }}
        >
          {symbol?.[0] ?? "?"}
        </span>
      )}
      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--yoca-text-main)" }}>
        {symbol}
      </span>
    </span>
  );
}
