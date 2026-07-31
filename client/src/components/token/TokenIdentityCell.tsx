import { Stack, Tooltip } from "@carbon/react";
import { type ComponentProps } from "react";
import { TknImg } from "../TknImg";
import { Txt } from "../Txt";

type TooltipAlign = ComponentProps<typeof Tooltip>["align"];

export interface TokenIdentityCellProps {
  symbol: string;
  fullName?: string | null;
  imageUrl?: string | null;
  imageSize?: number;
  tooltipAlign?: TooltipAlign;
  emphasizeSymbol?: boolean;
  fullNameMaxLength?: number;
}

export function TokenIdentityCell({
  symbol,
  fullName,
  imageUrl,
  imageSize = 30,
  tooltipAlign = "right",
  emphasizeSymbol = false,
  fullNameMaxLength,
}: TokenIdentityCellProps): React.ReactElement {
  const normalizedSymbol = symbol?.trim().toUpperCase() || "UNKNOWN";
  const normalizedFullName = fullName?.trim() || "";
  const displayedFullName =
    fullNameMaxLength != null && normalizedFullName.length > fullNameMaxLength
      ? `${normalizedFullName.slice(0, fullNameMaxLength).trimEnd()}…`
      : normalizedFullName;
  const tooltipLabel = normalizedFullName || normalizedSymbol;
  const source = imageUrl || null;

  return (
    <Stack orientation="horizontal" gap={2} style={{ alignItems: "center" }}>
      <TknImg src={source} alt={normalizedSymbol} size={imageSize} />
      <Tooltip label={tooltipLabel} align={tooltipAlign}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          {emphasizeSymbol ? (
            <strong>{normalizedSymbol}</strong>
          ) : (
            <span>{normalizedSymbol}</span>
          )}
          {displayedFullName && <Txt size="sm" secondary>{displayedFullName}</Txt>}
        </div>
      </Tooltip>
    </Stack>
  );
}

export default TokenIdentityCell;
