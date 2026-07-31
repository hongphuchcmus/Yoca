import { TrendNum } from "@/components/TrendNum";
import { useLocalization } from "@/contexts/LocalizationContext";
import type { WalletWinrateStats } from "@/hooks/useWalletWinrate";
import type {
  WalletOverviewMultiPeriodResponse,
  WalletOverviewPeriodKey,
} from "@/services/wallet/walletApi";
import { cds } from "@/util/carbon-theme";
import styles from "./WalletHero.module.scss";

interface WalletHeroProps {
  overview: WalletOverviewMultiPeriodResponse | null;
  selectedPeriod: WalletOverviewPeriodKey;
  loading: boolean;
  winRateStats: WalletWinrateStats | null;
  winRateLoading: boolean;
}

function formatCompact(val: number | null | undefined, fmt: ReturnType<typeof useLocalization>["fmt"]): string {
  if (val == null || !Number.isFinite(val)) return "\u2014";
  return fmt.num.compact.currency(val);
}

export function WalletHero({
  overview,
  selectedPeriod,
  winRateStats,
  winRateLoading,
}: WalletHeroProps) {
  const { tr, fmt } = useLocalization();

  const selectedStats = overview?.periods?.[selectedPeriod] ?? null;
  const holdings = overview?.holdings ?? null;

  const totalAssetValue =
    holdings?.totalAssetValueUsd ?? overview?.totalAssetValueUsd ?? null;
  const totalPnL =
    selectedStats?.pnl?.totalUsd ?? overview?.pnlUsdTotal ?? null;
  const pnlRealized = selectedStats?.pnl?.realizedUsd ?? null;
  const pnlUnrealized = selectedStats?.pnl?.unrealizedUsd ?? null;
  const tradingVolume =
    selectedStats?.tradingVolumeUsd ?? overview?.tradingVolumeUsd24h ?? null;
  const buyVolumeUsd = selectedStats?.buy?.volumeUsd ?? null;
  const sellVolumeUsd = selectedStats?.sell?.volumeUsd ?? null;
  const buyTxCount = selectedStats?.buy?.transactionCount ?? null;
  const sellTxCount = selectedStats?.sell?.transactionCount ?? null;
  const tokenTraded =
    selectedStats?.tokensTradedCount ?? overview?.tokensTradedCount ?? null;
  const numberOfTokenHolding =
    holdings?.tokensHoldingCount ?? overview?.tokensHoldingCount ?? null;
  const safeWinRate = Math.max(0, Math.min(100, winRateStats?.winRate ?? 0));
  const hasWinRateStats =
    winRateStats !== null && Number.isFinite(winRateStats.winRate);
  const isHighWinRate = safeWinRate >= 50;

  return (
    <div className={styles.hero}>
      {/* Winrate */}
      <div className={styles.cell}>
        <span className={styles.label}>{tr("walletPage.tokenWinRate.title")}</span>

        <span
          className={styles.mainValue}
          style={{
            color: isHighWinRate ? cds.supportSuccess : cds.supportError,
          }}
        >
          {winRateLoading || !hasWinRateStats
            ? "\u2014"
            : fmt.num.percent(safeWinRate)}
        </span>

        <div className={styles.progressBar} aria-hidden="true">
          <div
            className={styles.progressWin}
            style={{
              width: `${winRateLoading || !hasWinRateStats ? 0 : safeWinRate}%`,
            }}
          />
          <div
            className={styles.progressLoss}
            style={{
              width: `${winRateLoading || !hasWinRateStats ? 0 : 100 - safeWinRate}%`,
            }}
          />
        </div>

        <span className={styles.subText}>
          {winRateLoading || !winRateStats
            ? "\u2014"
            : tr("walletPage.tokenWinRate.summaryShort", {
                profitableCount: fmt.num.compact.decimal(
                  winRateStats.profitableTokenCount,
                ),
                totalCount: fmt.num.compact.decimal(winRateStats.totalTokenCount),
              })}
        </span>

        <div className={styles.spacer} />

        <div className={styles.footer}>
          <span className={styles.footerLabel}>{tr("walletPage.tokenWinRate.avgWin")}</span>
          <TrendNum
            value={winRateLoading ? null : (winRateStats?.avgWinUsd ?? null)}
            direction="in"
            prefixes="plus-minus"
            size="sm"
            formatter={fmt.num.compact.currency}
          />
          <span className={styles.dot}>·</span>
          <span className={styles.footerLabel}>{tr("walletPage.tokenWinRate.avgLoss")}</span>
          <TrendNum
            value={winRateLoading ? null : (winRateStats?.avgLossUsd ?? null)}
            direction="out"
            prefixes="plus-minus"
            size="sm"
            formatter={fmt.num.compact.currency}
          />
        </div>
      </div>

      {/* Total Asset Value */}
      <div className={styles.cell}>
        <span className={styles.label}>{tr("wallet.totalAssetValue")}</span>

        <span className={styles.mainValue}>
          {formatCompact(totalAssetValue, fmt)}
        </span>

        {pnlUnrealized != null &&
          Number.isFinite(pnlUnrealized) &&
          totalAssetValue != null &&
          totalAssetValue > 0 && (
            <div className={styles.subRow}>
              <TrendNum
                value={(pnlUnrealized / totalAssetValue) * 100}
                prefixes="arrow"
                formatter={fmt.num.percent}
              />
            </div>
          )}

        <div className={styles.spacer} />

        <div className={styles.footer}>
          <span className={styles.footerLabel}>
            {fmt.num.compact.decimal(numberOfTokenHolding)}{" "}
            {tr("wallet.tokensHolding")}
          </span>
          {tokenTraded != null && (
            <>
              <span className={styles.dot}>·</span>
              <span className={styles.footerLabel}>
                {fmt.num.compact.decimal(tokenTraded)}{" "}
                {tr("wallet.tokensTraded")}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Total PnL */}
      <div className={styles.cell}>
        <span className={styles.label}>{tr("wallet.totalPnL")}</span>

        <div className={styles.mainValue}>
          <TrendNum
            value={totalPnL}
            prefixes="arrow"
            size="inherit"
            formatter={(value) => fmt.num.currency(value ?? 0)}
          />
        </div>

        <div className={styles.spacer} />

        <div className={styles.footer}>
          <span className={styles.footerLabel}>{tr("wallet.realizedPnL")}</span>
          <TrendNum
            value={pnlRealized}
            prefixes="arrow"
            formatter={fmt.num.compact.currency}
          />
          <span className={styles.dot}>·</span>
          <span className={styles.footerLabel}>{tr("wallet.unrealizedPnL")}</span>
          <TrendNum
            value={pnlUnrealized}
            prefixes="arrow"
            formatter={fmt.num.compact.currency}
          />
        </div>
      </div>

      {/* Trading Volume */}
      <div className={styles.cell}>
        <span className={styles.label}>{tr("wallet.tradingVolume")}</span>

        <span className={styles.mainValue}>
          {formatCompact(tradingVolume, fmt)}
        </span>

        <div className={styles.subRow}>
          <TrendNum
            value={buyVolumeUsd}
            prefixes="none"
            formatter={fmt.num.compact.currency}
          />
          <span className={styles.subLabel}>{tr("walletPage.buy")}</span>
          <span className={styles.dot}>·</span>
          <TrendNum
            direction="out"
            value={sellVolumeUsd}
            prefixes="none"
            formatter={fmt.num.compact.currency}
          />
          <span className={styles.subLabel}>{tr("walletPage.sell")}</span>
        </div>

        <div className={styles.spacer} />

        <div className={styles.footer}>
          <span className={styles.footerLabel}>{tr("walletPage.transaction")}:</span>
          <TrendNum
            direction="in"
            value={buyTxCount}
            prefixes="none"
            formatter={fmt.num.compact.currency}
          />
          <span className={styles.footerLabel}>{tr("walletPage.buy")}</span>
          <span className={styles.dot}>·</span>
          <TrendNum
            value={sellTxCount}
            prefixes="none"
            formatter={fmt.num.compact.decimal}
          />
          <span className={styles.footerLabel}>{tr("walletPage.sell")}</span>
        </div>
      </div>
    </div>
  );
}

export default WalletHero;
