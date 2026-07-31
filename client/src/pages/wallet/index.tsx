import client from "@/api/main";
import { Card } from "@/components/common/Card/Card";
import { PnLChart } from "@/components/charts/PnLChart/index.ts";
import { WalletTopbar } from "@/components/wallet/WalletTopbar/WalletTopbar.tsx";
import { WalletHero } from "@/components/wallet/WalletHero/WalletHero.tsx";
import { WalletHoldingsPanel } from "@/components/wallet/WalletHoldingsPanel/WalletHoldingsPanel.tsx";
import { RightSidebar } from "./RightSidebar.tsx";
import {
  WalletChat,
  ChatContextProvider,
} from "@/components/wallet/WalletChat";
import { useWalletWinrate } from "@/hooks/useWalletWinrate";

import { PageWrapper } from "@/components/wrapper/PageWrapper.tsx";
import { useLocalization } from "@/contexts/LocalizationContext.tsx";
import { useGet, type UseGetResp } from "@/hooks/useGet";
import {
  type WalletPortfolioItem,
  type WalletOverviewMultiPeriodResponse,
} from "@/services/wallet/walletApi.ts";
import { AiGenerate, Close } from "@carbon/icons-react";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";

import { mapPortfolioItems } from "../../util/wallet-portfolio-mapper.ts";
import styles from "./index.module.scss";
import {
  TokenAverageTradePrice,
  TokenDetailsDemo,
} from "./TokenDetailsDemo.tsx";
// import { BalanceChart } from "@/components/charts/BalanceChart/BalanceChart.tsx";
import { DayActivityPopup } from "@/components/wallet/DayActivityPopup/DayActivityPopup.tsx";
import { AiSwapSummaryModal } from "@/components/wallet/AiSwapSummaryModal";
import { BalanceChartV2 } from "@/components/charts/BalanceChartV2/BalanceChartV2.tsx";
import type { WalletOverviewPeriodKey } from "@/services/wallet/walletApi.ts";
import { WalletTransactionActivity } from "@/components/WalletTransactionActivity/WalletTransactionActivity";

type ChatPosition = "right" | "left" | "fullscreen";

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export default function WalletPage() {
  const { tr, lang } = useLocalization();
  const { address } = useParams<{ address: string }>();
  const walletAddress = address ?? "";

  const portfolioRequest: UseGetResp<WalletPortfolioItem[]> = useGet(
    client.api.wallets.portfolio,
    200,
    { query: { address: walletAddress } },
    { enabled: Boolean(walletAddress) && walletAddress != "null" },
  );
  const portfolio = portfolioRequest.data ?? [];

  const overviewRequest: UseGetResp<WalletOverviewMultiPeriodResponse> = useGet(
    client.api.wallets.overview,
    200,
    { query: { address: walletAddress, period: "24H" } },
    { enabled: Boolean(walletAddress) && walletAddress != "null" },
  );
  const overviewReport = overviewRequest.data ?? null;

  const [selectedPeriod, setSelectedPeriod] =
    useState<WalletOverviewPeriodKey>("24H");
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPosition, setChatPosition] = useState<ChatPosition>("right");



  const { stats, loading } = useWalletWinrate(
    walletAddress,
    selectedPeriod,
  );
  const [selectedToken, setSelectedToken] = useState<{
    address: string;
    symbol: string;
    avgBuyCost: number;
    avgSellCost: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedToken) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedToken(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedToken]);

  const walletTokenDetails = useGet(
    client.api.wallets[":address"]["recent-traded-desc-breakdown"],
    200,
    { param: { address: address || "" } },
    { enabled: !!address },
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
      select: (data) =>
        Object.fromEntries(data.map((item) => [item.address, item])),
    },
  );

  const tokenMarket = useGet(
    client.api.tokens.markets[":addresses"],
    200,
    { param: { addresses: tokenAddresses || "" } },
    { enabled: !!tokenAddresses },
  );

  const [dayPopupOpen, setDayPopupOpen] = useState(false);
  const [dayPopupTimestamp, setDayPopupTimestamp] = useState(0);

  const [aiSwapSummaryOpen, setAiSwapSummaryOpen] = useState(false);

  const { meta: portfolioMeta } = useMemo(
    () => mapPortfolioItems(portfolio),
    [portfolio],
  );
  const portfolioMetaAsMap = useMemo(() => {
    const map = new Map<
      number,
      { tokenAddress: string; logoUri: string | null; fullName: string | null }
    >();
    for (let i = 0; i < portfolioMeta.length; i++) {
      const meta = portfolioMeta[i];
      if (meta) {
        map.set(i, {
          tokenAddress: meta.tokenAddress,
          logoUri: meta.logoUri ?? null,
          fullName: meta.fullName ?? null,
        });
      }
    }
    return map;
  }, [portfolioMeta]);



  useEffect(() => {
    const handleChatShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.repeat ||
        !event.shiftKey ||
        event.code !== "Slash" ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      setIsChatOpen(true);
    };

    window.addEventListener("keydown", handleChatShortcut);
    return () => window.removeEventListener("keydown", handleChatShortcut);
  }, []);
  if (!address) {
    return (
      <PageWrapper>
        <div>{tr("walletPage.addressNotFound")}</div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      noMarketTickers
      wideContent
    >
      <div className={`${styles.pageLayout}${isRightSidebarOpen ? ` ${styles.rightSidebarExpanded}` : ''}`}>
        <div className={styles.shell}>
          {/* <PageHeader
            eyebrow="Wallet Intelligence"
            title="Wallet Detail"
            subtitle="Track holdings, capital flow, trading performance, and recent on-chain activity for this address."
          /> */}

          <WalletTopbar
            address={walletAddress}
            currentPeriod={selectedPeriod}
            onPeriodChange={(period) => setSelectedPeriod(period)}
          />

          <WalletHero
            overview={overviewReport}
            selectedPeriod={selectedPeriod}
            loading={overviewRequest.isLoading}
            winRateStats={stats}
            winRateLoading={loading}
          />

          <div className={styles.body}>
            <main className={styles.mainCol}>
              {/* Balance History */}
              <Card>
                <BalanceChartV2
                  minHeight={324}
                  address={walletAddress}
                  onClickDay={(ts) => {
                    setDayPopupTimestamp(ts);
                    setDayPopupOpen(true);
                  }}
                />
              </Card>

              {/* Profit & Loss */}
              <Card>
                <PnLChart
                  minHeight={324}
                  initialFilters={{ wallets: [walletAddress] }}
                  onDayClick={(_wallet, ts) => {
                    setDayPopupTimestamp(ts);
                    setDayPopupOpen(true);
                  }}
                />
              </Card>

              {/* Activity Tables */}
              <Card>
                <WalletTransactionActivity address={walletAddress} />
              </Card>
            </main>

            <aside className={styles.sideCol}>
              <Card>
                <WalletHoldingsPanel
                  walletAddress={walletAddress}
                  portfolio={portfolio}
                  portfolioMeta={portfolioMetaAsMap}
                  loading={portfolioRequest.isLoading}
                />
              </Card>
            </aside>
          </div>

          <section className={styles.tokenDetailsWrapper}>
            <TokenDetailsDemo setSelectedToken={setSelectedToken} />
          </section>
        </div>

        {/* Modal chat panel (right/left dock + fullscreen) */}
        <ChatContextProvider
          addresses={[walletAddress]}
          contextType="wallet"
          lang={lang}
        >
          {!isChatOpen && (
            <button
              type="button"
              className={styles.chatLauncher}
              onClick={() => setIsChatOpen(true)}
              title={tr("chat.shortcutHint")}
            >
              <AiGenerate size={18} />
              <span>{tr("chat.launcherLabel")}</span>
              <kbd>{tr("chat.shortcutHint")}</kbd>
            </button>
          )}

          <RightSidebar
            onToggle={setIsRightSidebarOpen}
            isChatOpen={isChatOpen}
            onChatToggle={() => setIsChatOpen((v) => !v)}
          />

          {isChatOpen && (
            <div className={styles.chatOverlay} data-position={chatPosition}>
              <div className={styles.chatPanel}>
                <WalletChat
                  variant="sidebar"
                  chatPosition={chatPosition}
                  onChatPositionChange={setChatPosition}
                  onRequestClose={() => setIsChatOpen(false)}
                />
              </div>
            </div>
          )}

        </ChatContextProvider>

        {selectedToken && (
          <div
            className={styles.tokenGraphOverlay}
            role="presentation"
            onClick={() => setSelectedToken(null)}
          >
            <aside
              className={styles.tokenGraphPanel}
              aria-label={tr("walletPage.averageTradingPrice")}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.tokenGraphHeader}>
                <div>
                  <span className={styles.tokenGraphEyebrow}>
                    {tr("walletPage.graph")}
                  </span>
                  <h2 className={styles.tokenGraphTitle}>
                    {tr("walletPage.averageTradingPrice")}
                  </h2>
                </div>
                <button
                  type="button"
                  className={styles.tokenGraphCloseBtn}
                  aria-label={tr("common.cancel")}
                  onClick={() => setSelectedToken(null)}
                >
                  <Close size={20} />
                </button>
              </div>

              <div className={styles.tokenGraphContent}>
                <TokenAverageTradePrice
                  walletAddress={address}
                  tokenAddress={selectedToken.address}
                  tokenImgUrl={
                    tokenMeta.data?.[selectedToken.address]?.imageUrl || null
                  }
                  tokenName={tokenMeta.data?.[selectedToken.address]?.name || null}
                  tokenSymbol={
                    tokenMeta.data?.[selectedToken.address]?.symbol || null
                  }
                  tokenCurrentPrice={
                    tokenMarket.data?.[selectedToken.address]?.priceUsd || null
                  }
                  avgBuyPrice={selectedToken.avgBuyCost}
                  avgSellPrice={selectedToken.avgSellCost}
                />
              </div>
            </aside>
          </div>
        )}
      </div>

      <DayActivityPopup
        isOpen={dayPopupOpen}
        onClose={() => setDayPopupOpen(false)}
        wallets={[walletAddress]}
        dayTimestamp={dayPopupTimestamp}
      />

      <AiSwapSummaryModal
        isOpen={aiSwapSummaryOpen}
        onClose={() => setAiSwapSummaryOpen(false)}
        walletAddress={walletAddress}
      />

    </PageWrapper>
  );
}
