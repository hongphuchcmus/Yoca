/**
 * Wallet Portfolio Mapper
 *
 * Converts raw WalletPortfolioItem[] from the API into the tuple format
 * expected by the <Table> component, while applying a resilient label
 * fallback chain and preserving numeric types for sort/filter stability.
 *
 * Label fallback order:
 *   tokenAddress SOL/WSOL disambiguation → symbol → name → shortened tokenAddress → "Unknown"
 *
 * @module util/wallet-portfolio-mapper
 */

import type { WalletPortfolioItem } from '@/services/wallet/walletApi';
import { WRAPPED_SOL_MINT_ADDRESS } from '@/config/constants';

const SOL_ALIAS_MINT = 'So11111111111111111111111111111111111111111';
const SOL_SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111';

function normalizeAddress(address: string | undefined): string {
    return (address ?? '').trim().toLowerCase();
}

function isWrappedSolToken(tokenAddress: string | undefined): boolean {
    return normalizeAddress(tokenAddress) === WRAPPED_SOL_MINT_ADDRESS.toLowerCase();
}

export function isNativeSolToken(tokenAddress: string | undefined): boolean {
    const normalized = normalizeAddress(tokenAddress);
    return normalized === 'native'
        || normalized === 'sol'
        || normalized === SOL_ALIAS_MINT.toLowerCase()
        || normalized === SOL_SYSTEM_PROGRAM_ADDRESS.toLowerCase();
}

export function resolveNativeSolTokenAddress(tokenAddress: string): string {
    return isNativeSolToken(tokenAddress)
        ? WRAPPED_SOL_MINT_ADDRESS
        : tokenAddress;
}

/**
 * Per-row metadata that cannot be encoded in the display tuple.
 * Stored in a parallel array aligned by index with the row tuples.
 */
export interface PortfolioRowMeta {
    /** Resolved display label (same value as col 0 of the row tuple) */
    label: string;
    /** Full token name used for hover labels when available */
    fullName?: string;
    /** Logo image URL – undefined when enrichment data was absent */
    logoUri?: string;
    /** Raw on-chain token address */
    tokenAddress: string;
}

/**
 * Resolves the display label for a portfolio token using the documented
 * fallback chain, with a special-case disambiguation for SOL vs Wrapped SOL.
 */
export function resolveTokenLabel(
    item: Pick<WalletPortfolioItem, 'symbol' | 'name' | 'tokenAddress'>,
): string {
    if (isWrappedSolToken(item.tokenAddress)) return 'Wrapped SOL';
    if (isNativeSolToken(item.tokenAddress)) return 'SOL';

    if (item.symbol?.trim().toUpperCase() === 'WSOL') return 'Wrapped SOL';
    if (item.symbol?.trim()) return item.symbol.trim();

    if (item.name?.trim().toLowerCase().includes('wrapped sol')) return 'Wrapped SOL';
    if (item.name?.trim()) return item.name.trim();

    if (item.tokenAddress) {
        const addr = item.tokenAddress;
        return addr.length > 8
            ? `${addr.slice(0, 4)}\u2026${addr.slice(-4)}`
            : addr;
    }
    return 'Unknown';
}

/**
 * Maps WalletPortfolioItem[] to the formats consumed by <Table>.
 *
 * Columns (0-indexed):
 *   0  label      string  – resolved display label
 *   1  priceUsd   number  – USD price per token (0 if absent)
 *   2  amount     number  – token holding amount (0 if absent)
 *   3  valueUsd   number  – USD value of holding (0 if absent)
 *
 * Keeping columns 1–3 as numbers allows SortType.Number to work correctly.
 * (24h change is omitted: portfolio API does not reliably provide it.)
 *
 * @returns rows   Row tuples consumable by <Table dataEntries={rows}>.
 * @returns meta   Parallel metadata array for logo rendering.
 */
export function mapPortfolioItems(items: WalletPortfolioItem[]): {
    rows: (string | number)[][];
    meta: PortfolioRowMeta[];
} {
    const rows: (string | number)[][] = [];
    const meta: PortfolioRowMeta[] = [];

    for (const item of items) {
        const label = resolveTokenLabel(item);

        rows.push([
            label,
            item.priceUsd ?? 0,
            item.amount ?? 0,
            item.valueUsd ?? 0,
        ]);

        meta.push({
            label,
            fullName: item.name?.trim() || undefined,
            logoUri: item.logoUri,
            tokenAddress: item.tokenAddress,
        });
    }

    return { rows, meta };
}

/**
 * Builds a Map<label, PortfolioRowMeta> for O(1) lookups in cell renderers.
 *
 * When duplicate labels exist (rare), the first occurrence wins.
 */
export function buildPortfolioMetaMap(
    meta: PortfolioRowMeta[],
): Map<string, PortfolioRowMeta> {
    const map = new Map<string, PortfolioRowMeta>();
    for (const m of meta) {
        if (!map.has(m.label)) {
            map.set(m.label, m);
        }
    }
    return map;
}
