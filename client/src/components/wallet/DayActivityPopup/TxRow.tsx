import { useLocalization } from "@/contexts/LocalizationContext";
import type { WalletDaySwapSummary } from "@/services/wallet/walletApi";
import { TknImg } from "@/components/TknImg";
import { TrendNum } from "@/components/TrendNum";
import { Flex } from "@/components/Flex";
import { Txt } from "@/components/Txt";
import { ArrowRight, ExternalLink } from "lucide-react";
import styles from "./TxRow.module.scss";
import { WRAPPED_SOL_MINT_ADDRESS } from "@/config/constants";

function resolveLogoUri(
  address: string | null | undefined,
  logoMap: Record<string, string | null> | undefined,
): string | undefined {
  if (!address || !logoMap) return undefined;
  return logoMap[address] ?? logoMap[WRAPPED_SOL_MINT_ADDRESS] ?? undefined;
}

interface TxRowProps {
  swap: WalletDaySwapSummary;
  logoMap?: Record<string, string | null>;
}

export const TxRow: React.FC<TxRowProps> = ({ swap, logoMap }) => {
  const { fmt } = useLocalization();

  const timeStr = new Date(swap.timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  const soldSym = swap.soldSymbol?.toUpperCase() ?? "?";
  const boughtSym = swap.boughtSymbol?.toUpperCase() ?? "?";
  const soldLogo = resolveLogoUri(swap.soldTokenAddress, logoMap);
  const boughtLogo = resolveLogoUri(swap.boughtTokenAddress, logoMap);

  return (
    <div className={styles.txRow}>
      <Flex gap={8} align="center">
        <Txt size="sm" secondary mono>
          {timeStr}
        </Txt>
        <TrendNum
          value={swap.soldAmount}
          direction="out"
          prefixes="plus-minus"
          formatter={fmt.num.compact.decimal}
          size="sm"
        />
        <TknImg size={18} src={soldLogo} />
        <Txt size="sm" mono>
          {soldSym}
        </Txt>
        <ArrowRight size={14} className={styles.arrow} />
        <TrendNum
          value={swap.boughtAmount}
          direction="in"
          prefixes="plus-minus"
          formatter={fmt.num.compact.decimal}
          size="sm"
        />
        <TknImg size={18} src={boughtLogo} />
        <Txt size="sm" mono>
          {boughtSym}
        </Txt>
        <div className={styles.spacer} />
        <Txt size="sm" weight="semibold">
          {fmt.num.compact.currency(swap.valueUsd)}
        </Txt>
        <a
          href={`https://solscan.io/tx/${swap.transactionHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.solscanLink}
          title="Open in Solscan"
        >
          <ExternalLink size={14} />
        </a>
      </Flex>
    </div>
  );
};
