import client from "@/api/main";
import Tble, { TbleFilterType, TbleSortType, type TbleFilterValue, type TbleSelectFilterOption, type TbleSortValue } from "@/components/Tble";
import { useGet, UseGetResp } from "@/hooks/useGet";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useEffect, useMemo, useState } from "react";
import { IconActionButton, SegmentedControl } from "@/components/charts/shared/ChartControls";
import { TknImg } from "../TknImg";
import { Flex } from "../Flex";
import { Txt } from "../Txt";
import { CpyBtn } from "../CpyBtn";
import { TrendNum } from "../TrendNum";
import styles from "./WalletTransactionActivity.module.scss";
import { ArrowRight, Clock, ExternalLink } from "lucide-react";
import { SOLSCAN_TX_URL } from "@/config/constants";
import { Link } from "react-router";
import { resolveNativeSolTokenAddress } from "@/util/wallet-portfolio-mapper";

type WalletSwapData = {
  transactions: {
    transactionHash: string;
    actId: string;
    blockTimestampMs: number;
    bought: {
      address: string;
      amount: number;
      symbol: string | null;
      name: string | null;
      logoUri: string | null;
      priceUsd: number | null;
    };
    sold: {
      address: string;
      amount: number;
      symbol: string | null;
      name: string | null;
      logoUri: string | null;
      priceUsd: number | null;
    };
    totalValueUsd: number | null;
  }[];
  cursor: string | null;
};

type ActivityTab = "swaps" | "transfers";
type TableFilters = Record<string, TbleFilterValue>;

const SEARCH_DEBOUNCE_MS = 300;

function getRangeFilter(value: TbleFilterValue): { min?: number; max?: number } {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  const min = "min" in value && typeof value.min === "number" ? value.min : undefined;
  const max = "max" in value && typeof value.max === "number" ? value.max : undefined;
  return { min, max };
}

function getCompositeFilter(value: TbleFilterValue): Record<string, TbleFilterValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  if ("min" in value || "max" in value) return {};
  return value as Record<string, TbleFilterValue>;
}

function getSelectedValues(value: TbleFilterValue): string[] {
  return Array.isArray(value) ? value : [];
}

function firstSelected(value: TbleFilterValue): string | undefined {
  return getSelectedValues(value)[0];
}

function mergeMinValueUsd(hiddenLowValue: boolean, explicitMin?: number): number | undefined {
  if (!hiddenLowValue) return explicitMin;
  return explicitMin == null ? 1 : Math.max(1, explicitMin);
}

function makeTokenOptions(items: Array<{ address: string; symbol: string | null; name?: string | null }>): TbleSelectFilterOption[] {
  const byAddress = new Map<string, TbleSelectFilterOption>();
  for (const item of items) {
    const address = item.address.trim();
    if (!address || byAddress.has(address)) continue;
    byAddress.set(address, {
      value: address,
      label: item.symbol?.toUpperCase() ?? item.name ?? address,
    });
  }
  return Array.from(byAddress.values()).sort((left, right) => left.label.localeCompare(right.label));
}

type WalletTransferData = {
  transactions: {
    transactionHash: string;
    actId: string;
    blockTimestampMs: number;
    token: {
      address: string;
      amount: number;
      symbol: string | null;
      name: string | null;
      logoUri: string | null;
      priceUsd: number | null;
    };
    direction: "send" | "receive";
    counterpartyAddress: string;
    valueUsd: number;
  }[];
  cursor: string | null;
};

function LowValueFilter({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { tr } = useLocalization();

  return (
    <Flex
      className={styles.lowValueFilter}
      align="center"
      justify="end"
      gap={2}
      pBlock={3}
      pInline={4}
    >
      <label className={styles.checkboxLabel} htmlFor={id}>
        <input
          id={id}
          className={styles.checkboxInput}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.checkboxBox} aria-hidden="true" />
        <span>{tr("walletPage.hideLowValue")}</span>
      </label>
    </Flex>
  );
}

function AddressCell({
  address,
  secondary = false,
}: {
  address: string;
  secondary?: boolean;
}) {
  const { fmt } = useLocalization();
  return (
    <Flex gap={2} align="center">
      <Txt size="sm" weight={secondary ? "regular" : "bold"}>
        {fmt.text.address(address)}
      </Txt>
      <CpyBtn copyWhat={address} size="xs" />
    </Flex>
  );
}

function TokenAmountCell({
  address,
  amount,
  symbol,
  logoUri,
  direction,
}: {
  address: string;
  amount: number;
  symbol: string;
  logoUri: string | null;
  direction: "in" | "out" | "none";
}) {
  const { fmt } = useLocalization();
  return (
    <Flex gap={4} align="center">
      <TrendNum
        value={amount}
        direction={direction}
        prefixes="none"
        formatter={fmt.num.compact.decimal}
        size="sm"
      />
      <Flex gap={2} align="center">
        <Link
          to={`/tokens/${resolveNativeSolTokenAddress(address)}`}
          title={symbol}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <TknImg size={22} src={logoUri} />
          <Txt size="sm">{symbol}</Txt>
        </Link>
        <CpyBtn copyWhat={address} size="xs" />
      </Flex>
    </Flex>
  );
}

function SwapFlowCell({
  sold,
  bought,
}: {
  sold: {
    address: string;
    amount: number;
    symbol: string | null;
    logoUri: string | null;
  };
  bought: {
    address: string;
    amount: number;
    symbol: string | null;
    logoUri: string | null;
  };
}) {
  const soldSym = sold.symbol?.toUpperCase() ?? sold.address;
  const boughtSym = bought.symbol?.toUpperCase() ?? bought.address;
  return (
    <Flex gap={4} align="center">
      <TokenAmountCell
        address={sold.address}
        amount={sold.amount}
        symbol={soldSym}
        logoUri={sold.logoUri}
        direction="out"
      />
      <ArrowRight size={14} />
      <TokenAmountCell
        address={bought.address}
        amount={bought.amount}
        symbol={boughtSym}
        logoUri={bought.logoUri}
        direction="in"
      />
    </Flex>
  );
}

function TransferFlowCell({
  direction,
  walletAddress,
  counterpartyAddress,
}: {
  direction: "send" | "receive";
  walletAddress: string;
  counterpartyAddress: string;
}) {
  return (
    <Flex gap={4} align="center">
      <AddressCell
        address={direction === "send" ? walletAddress : counterpartyAddress}
        secondary={direction === "receive"}
      />
      <ArrowRight size={14} />
      <AddressCell
        address={direction === "send" ? counterpartyAddress : walletAddress}
        secondary={direction === "send"}
      />
    </Flex>
  );
}

export function WalletTransactionActivity({ address }: { address: string }) {
  const { tr, fmt } = useLocalization();
  const [hideLowValue, setHideLowValue] = useState(false);
  const [activeActivityTab, setActiveActivityTab] = useState<ActivityTab>("swaps");
  const [swapSearch, setSwapSearch] = useState("");
  const [debouncedSwapSearch, setDebouncedSwapSearch] = useState("");
  const [swapFilters, setSwapFilters] = useState<TableFilters>({});
  const [swapSort, setSwapSort] = useState<TbleSortValue>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [debouncedTransferSearch, setDebouncedTransferSearch] = useState("");
  const [transferFilters, setTransferFilters] = useState<TableFilters>({});
  const [transferSort, setTransferSort] = useState<TbleSortValue>(null);
  const [timeFormat, setTimeFormat] = useState<"relativeShort" | "datetime" | "date">("relativeShort");
  const cycleTimeFormat = () => setTimeFormat((prev) =>
    prev === "relativeShort" ? "datetime"
    : prev === "datetime" ? "date"
    : "relativeShort",
  );
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSwapSearch(swapSearch), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [swapSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedTransferSearch(transferSearch), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [transferSearch]);

  const swapQuery = useMemo(() => {
    const flowFilter = getCompositeFilter(swapFilters.flow ?? null);
    const valueFilter = getRangeFilter(swapFilters.value ?? null);
    return {
      search: debouncedSwapSearch.trim() || undefined,
      soldTokenAddress: firstSelected(flowFilter.sold ?? null),
      boughtTokenAddress: firstSelected(flowFilter.bought ?? null),
      minValueUsd: mergeMinValueUsd(hideLowValue, valueFilter.min),
      maxValueUsd: valueFilter.max,
      sortBy: swapSort?.key === "value" ? ("value" as const) : undefined,
      sortDirection: swapSort?.direction,
    };
  }, [debouncedSwapSearch, hideLowValue, swapFilters, swapSort]);

  const transferQuery = useMemo(() => {
    const flowFilter = getCompositeFilter(transferFilters.flow ?? null);
    const tokenFilter = getCompositeFilter(transferFilters.token ?? null);
    const amountFilter = getRangeFilter(tokenFilter.amount ?? null);
    const valueFilter = getRangeFilter(transferFilters.value ?? null);
    return {
      search: debouncedTransferSearch.trim() || undefined,
      direction: firstSelected(flowFilter.direction ?? null) as "send" | "receive" | undefined,
      counterpartyAddress: firstSelected(flowFilter.counterparty ?? null),
      tokenAddress: firstSelected(tokenFilter.symbol ?? null),
      minTokenAmount: amountFilter.min,
      maxTokenAmount: amountFilter.max,
      minValueUsd: mergeMinValueUsd(hideLowValue, valueFilter.min),
      maxValueUsd: valueFilter.max,
      sortBy: transferSort?.key === "value" ? ("value" as const) : undefined,
      sortDirection: transferSort?.direction,
    };
  }, [debouncedTransferSearch, hideLowValue, transferFilters, transferSort]);

  const swapResp: UseGetResp<WalletSwapData> = useGet(
    client.api.wallets.swaps.history[":address"],
    200,
    {
      param: { address },
      query: swapQuery,
    },
    { enabled: activeActivityTab == "swaps" },
  );

  const transferResp: UseGetResp<WalletTransferData> = useGet(
    client.api.wallets.transfers.history[":address"],
    200,
    { param: { address }, query: transferQuery },
    { enabled: activeActivityTab == "transfers" },
  );
  // Swap rows – plain text
  const swapRows = useMemo(() => {
    const transactions = swapResp.data?.transactions ?? [];
    return transactions.map((tx) => {
      const soldSym = tx.sold.symbol?.toUpperCase() ?? tx.sold.address;
      const boughtSym = tx.bought.symbol?.toUpperCase() ?? tx.bought.address;
      const timeLabel = timeFormat === "relativeShort"
        ? fmt.datetime.relativeShort(tx.blockTimestampMs, true)
        : timeFormat === "datetime"
          ? fmt.datetime.datetime(tx.blockTimestampMs)
          : fmt.datetime.date(tx.blockTimestampMs);
      const time = <Txt size="sm">{timeLabel}</Txt>;

      const flowDisplay = (
        <SwapFlowCell
          sold={{
            address: tx.sold.address,
            amount: tx.sold.amount,
            symbol: tx.sold.symbol,
            logoUri: tx.sold.logoUri,
          }}
          bought={{
            address: tx.bought.address,
            amount: tx.bought.amount,
            symbol: tx.bought.symbol,
            logoUri: tx.bought.logoUri,
          }}
        />
      );
      const value = (
        <Txt size="sm">{fmt.num.compact.currency(tx.totalValueUsd)}</Txt>
      );

      const transaction = (
        <IconActionButton
          href={`${SOLSCAN_TX_URL}/${tx.transactionHash}`}
          label={tr("walletPage.openInSolscan")}
          icon={ExternalLink}
          target="_blank"
        />
      );

      return {
        id: `${tx.transactionHash}-${tx.actId}`,
        time,
        flow: flowDisplay,
        value,
        transaction,
        soldSymbol: soldSym,
        soldTokenAddress: tx.sold.address,
        boughtSymbol: boughtSym,
        boughtTokenAddress: tx.bought.address,
        totalValueUsd: tx.totalValueUsd,
        blockTimestampMs: tx.blockTimestampMs,
        _searchText: `${soldSym} ${boughtSym} ${tx.totalValueUsd ?? ""}`,
      };
    });
  }, [swapResp.data, fmt, timeFormat, tr]);

  // Transfer rows – plain text
  const transferRows = useMemo(() => {
    const transactions = transferResp.data?.transactions ?? [];

    return transactions
      .map((tx) => {
        const tokenSym = tx.token.symbol?.toUpperCase() ?? tx.token.address;
        const timeLabel = timeFormat === "relativeShort"
          ? fmt.datetime.relativeShort(tx.blockTimestampMs, true)
          : timeFormat === "datetime"
            ? fmt.datetime.datetime(tx.blockTimestampMs)
            : fmt.datetime.date(tx.blockTimestampMs);
        const time = <Txt size="sm">{timeLabel}</Txt>;

        const flowDisplay = (
          <TransferFlowCell
            direction={tx.direction}
            walletAddress={address}
            counterpartyAddress={tx.counterpartyAddress}
          />
        );

        const tokenDisplay = (
          <TokenAmountCell
            address={tx.token.address}
            amount={tx.token.amount}
            symbol={tokenSym}
            logoUri={tx.token.logoUri}
            direction={tx.direction == "send" ? "out" : "in"}
          />
        );
        const value = (
          <Txt size="sm">{fmt.num.compact.currency(tx.valueUsd)}</Txt>
        );

        const transaction = (
          <IconActionButton
            href={`${SOLSCAN_TX_URL}/${tx.transactionHash}`}
            label={tr("walletPage.openInSolscan")}
            icon={ExternalLink}
            target="_blank"
          />
        );

        return {
          id: `${tx.transactionHash}-${tx.actId}`,
          time,
          flow: flowDisplay,
          token: tokenDisplay,
          value,
          transaction,
          direction: tx.direction,
          counterpartyAddress: tx.counterpartyAddress,
          tokenSymbol: tokenSym,
          tokenAddress: tx.token.address,
          tokenAmount: tx.token.amount,
          valueUsd: tx.valueUsd,
          blockTimestampMs: tx.blockTimestampMs,
          _searchText: `${tokenSym} ${tx.valueUsd} ${tx.counterpartyAddress}`,
        };
      });
  }, [transferResp.data, fmt, address, timeFormat, tr]);

  // Headers – plain text
  const swapSoldOptions = useMemo(
    () => makeTokenOptions((swapResp.data?.transactions ?? []).map((tx) => ({
      address: tx.sold.address,
      symbol: tx.sold.symbol,
      name: tx.sold.name,
    }))),
    [swapResp.data],
  );
  const swapBoughtOptions = useMemo(
    () => makeTokenOptions((swapResp.data?.transactions ?? []).map((tx) => ({
      address: tx.bought.address,
      symbol: tx.bought.symbol,
      name: tx.bought.name,
    }))),
    [swapResp.data],
  );
  const transferTokenOptions = useMemo(
    () => makeTokenOptions((transferResp.data?.transactions ?? []).map((tx) => ({
      address: tx.token.address,
      symbol: tx.token.symbol,
      name: tx.token.name,
    }))),
    [transferResp.data],
  );
  const transferCounterpartyOptions = useMemo(
    () => Array.from(new Set((transferResp.data?.transactions ?? []).map((tx) => tx.counterpartyAddress).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right))
      .map((item) => ({ label: fmt.text.address(item), value: item })),
    [fmt, transferResp.data],
  );
  const swapHeaders = [
    { key: "time", header: tr("walletPage.time") },
    { key: "flow", header: tr("walletPage.pair") },
    { key: "value", header: tr("walletPage.value") },
    {
      key: "transaction",
      header: tr("walletPage.transaction"),
      align: "center" as const,
    },
  ];

  const transferHeaders = [
    { key: "time", header: tr("walletPage.time") },
    { key: "flow", header: tr("walletPage.transfer") },
    { key: "token", header: tr("walletPage.token") },
    { key: "value", header: tr("walletPage.value") },
    {
      key: "transaction",
      header: tr("walletPage.transaction"),
      align: "center" as const,
    },
  ];

  const swapLoading = swapResp.isLoading;
  const transferLoading = transferResp.isLoading;

  return (
    <div className={styles.root}>
      <div className={styles.tabsHeader}>
        <SegmentedControl
          options={[
            { value: "swaps", label: tr("walletPage.activityTabSwaps") },
            { value: "transfers", label: tr("walletPage.activityTabTransfers") },
          ]}
          value={activeActivityTab}
          onChange={(value) => setActiveActivityTab(value as ActivityTab)}
          ariaLabel={tr("walletPage.activityTypeLabel")}
        />
        <div className={styles.headerSpacer} />
        <LowValueFilter
          id="hide-low-value"
          checked={hideLowValue}
          onChange={setHideLowValue}
        />
      </div>

      {activeActivityTab == "swaps" ? (
        <Tble
          key="swaps"
          rows={swapRows}
          headers={swapHeaders}
          loading={swapLoading}
          height="auto"
          enablePagination
          pageSize={8}
          boxed
          pageUnknown
          enableSearch
          searchFields={["_searchText"]}
          searchValue={swapSearch}
          onSearchChange={setSwapSearch}
          filterValues={swapFilters}
          onFilterValuesChange={setSwapFilters}
          sortValue={swapSort}
          onSortChange={setSwapSort}
          clientFiltering={false}
          clientSorting={false}
          filterSchema={{
            flow: {
              type: TbleFilterType.Composite,
              filters: {
                sold: { type: TbleFilterType.Select, field: "soldTokenAddress", options: swapSoldOptions },
                bought: { type: TbleFilterType.Select, field: "boughtTokenAddress", options: swapBoughtOptions },
              },
            },
            value: { type: TbleFilterType.Range, field: "totalValueUsd", min: 0, max: 1_000_000, step: 1 },
          }}
          sortConfigs={{
            time: { type: TbleSortType.Number, field: "blockTimestampMs" },
            value: { type: TbleSortType.Number, field: "totalValueUsd" },
          }}
          headerActions={{
            time: (
              <button
                type="button"
                className={styles.timeFormatBtn}
                aria-label={tr("walletPage.timeFormatAriaLabel")}
                onClick={(e) => { e.stopPropagation(); cycleTimeFormat(); }}
              >
                <Clock size={13} />
              </button>
            ),
          }}
        />
      ) : (
        <Tble
          key="transfers"
          rows={transferRows}
          headers={transferHeaders}
          loading={transferLoading}
          height="auto"
          enablePagination
          pageSize={8}
          boxed
          pageUnknown
          enableSearch
          searchFields={["_searchText"]}
          searchValue={transferSearch}
          onSearchChange={setTransferSearch}
          filterValues={transferFilters}
          onFilterValuesChange={setTransferFilters}
          sortValue={transferSort}
          onSortChange={setTransferSort}
          clientFiltering={false}
          clientSorting={false}
          filterSchema={{
            flow: {
              type: TbleFilterType.Composite,
              filters: {
                direction: { type: TbleFilterType.Select, field: "direction" },
                counterparty: { type: TbleFilterType.Select, field: "counterpartyAddress", options: transferCounterpartyOptions },
              },
            },
            token: {
              type: TbleFilterType.Composite,
              filters: {
                symbol: { type: TbleFilterType.Select, field: "tokenAddress", options: transferTokenOptions },
                amount: { type: TbleFilterType.Range, field: "tokenAmount", min: 0, max: 1_000_000, step: 0.01 },
              },
            },
            value: { type: TbleFilterType.Range, field: "valueUsd", min: 0, max: 1_000_000, step: 1 },
          }}
          sortConfigs={{
            time: { type: TbleSortType.Number, field: "blockTimestampMs" },
            value: { type: TbleSortType.Number, field: "valueUsd" },
          }}
          headerActions={{
            time: (
              <button
                type="button"
                className={styles.timeFormatBtn}
                aria-label={tr("walletPage.timeFormatAriaLabel")}
                onClick={(e) => { e.stopPropagation(); cycleTimeFormat(); }}
              >
                <Clock size={13} />
              </button>
            ),
          }}
        />
      )}
    </div>
  );
}
