import { buildActivitySnapshotFromProviders, buildHoldingsSnapshotFromPortfolio, buildOverviewResponse, getLatestOverviewCacheRow, getOverviewFromFreshCache, OVERVIEW_PERIOD_KEYS } from "@sv/services/wallet/walletData.core.js";
import type { WalletOverview, WalletOverviewPeriodKey, WalletOverviewQueryOptions } from "@sv/services/wallet/dtos/walletDataObjects.js";
import { saveOverviewCache } from "@sv/services/wallet/db/walletDataCacher.js";
import { dataUsage } from "@sv/middlewares/request-context.js";
import { getWalletPortfolio } from "@sv/services/wallet/walletPortfolio.service.js";

export async function getWalletOverview(address: string, query?: WalletOverviewQueryOptions): Promise<WalletOverview> {
    if (query?.force) {
        dataUsage.record("forced_refresh");
    }

    const cacheRow = await getLatestOverviewCacheRow(address);
    const cachedOverview = query?.force ? null : getOverviewFromFreshCache(cacheRow, address);
    if (cachedOverview) {
        dataUsage.record("db_result");
        console.log("[wallet-overview]", {
            address,
            cacheHit: true,
            periods: OVERVIEW_PERIOD_KEYS,
        });
        return cachedOverview;
    }

    const portfolio = await getWalletPortfolio(address, { force: query?.force });
    const holdingsSnapshot = await buildHoldingsSnapshotFromPortfolio(portfolio, cacheRow);
    const { periodSnapshots, providerFailuresByPeriod } = await buildActivitySnapshotFromProviders(address, cacheRow);

    const holdingsUsedCache = holdingsSnapshot.source == "overview-cache";
    const activityUsedCache = cacheRow != null && OVERVIEW_PERIOD_KEYS.some(
        (period) => providerFailuresByPeriod[period],
    );
    if (holdingsUsedCache || activityUsedCache) {
        dataUsage.record("db_result", "stale_fallback");
    }

    const overview = buildOverviewResponse({
        address,
        holdingsSnapshot,
        periodSnapshots,
    });

    await saveOverviewCache(overview);

    console.log("[wallet-overview]", {
        address,
        cacheHit: false,
        holdingsSource: holdingsSnapshot.source,
        periodSources: OVERVIEW_PERIOD_KEYS.reduce((acc, period) => {
            acc[period] = overview.periods[period].source;
            return acc;
        }, {} as Record<WalletOverviewPeriodKey, string>),
        providerFailuresByPeriod,
    });

    return overview;
}
