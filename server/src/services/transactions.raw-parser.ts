/**
 * Raw Solana transaction parser.
 *
 * Uses the Solana JSON RPC `getTransaction` method with `jsonParsed` encoding
 * to fetch the transaction, then walks outer instructions → inner instructions
 * in their natural execution order to produce an ordered list of transfers.
 *
 * This gives the correct chronological sequence without any heuristics, matching
 * what Solscan shows in "Legacy Mode".
 */

import { getTokenMeta } from "@sv/services/tokens/token-info.js";
import { pFetch } from "@sv/util/rate-limit.js";
import { getNextkey, spec as heliusSpec } from "@sv/util/util-helius.js";

// ─── Types for Solana jsonParsed RPC response ─────────────────────────────────

interface ParsedInfo {
  source?: string;
  destination?: string;
  authority?: string;
  owner?: string;
  lamports?: number;
  amount?: string;
  mint?: string;
  tokenAmount?: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
  // transferChecked uses these field names too
}

interface ParsedInstruction {
  program?: string;
  programId: string;
  parsed?: {
    type: string;
    info: ParsedInfo;
  };
  accounts?: string[];
  data?: string;
  stackHeight?: number;
}

interface InnerInstructionGroup {
  index: number;
  instructions: ParsedInstruction[];
}

interface RpcTransactionResult {
  slot: number;
  blockTime?: number | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: Array<{
        pubkey: string;
        writable: boolean;
        signer: boolean;
        source?: string;
      }>;
      instructions: ParsedInstruction[];
    };
  };
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        uiAmount: number | null;
        decimals: number;
        amount: string;
      };
      owner?: string;
    }>;
    postTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        uiAmount: number | null;
        decimals: number;
        amount: string;
      };
      owner?: string;
    }>;
    innerInstructions?: InnerInstructionGroup[];
    logMessages?: string[];
  };
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type TransferKind = "spl" | "native";

export interface ParsedTransfer {
  /** 1-based sequential order as executed on-chain */
  order: number;
  /** "inner" = inside a CPI, "outer" = top-level instruction */
  level: "inner" | "outer";
  /** Depth in the call stack (stackHeight from the RPC, 1 = top-level) */
  stackHeight: number;
  /** Wallet owner address (resolved from ATA when possible, like Solscan) */
  fromAddr: string;
  /** Wallet owner address (resolved from ATA when possible, like Solscan) */
  toAddr: string;
  /** Raw ATA/token account address (original source field) */
  fromTokenAddr?: string;
  /** Raw ATA/token account address (original destination field) */
  toTokenAddr?: string;
  /** Token mint address; "SOL" for native transfers */
  mint: string;
  /** Human-readable amount (already divided by decimals / lamports) */
  amount: number;
  /** Raw amount string as-is from the instruction */
  rawAmount: string;
  /** Number of decimals (9 for native SOL and WSOL) */
  decimals: number;
  kind: TransferKind;
  /** The program that executed this transfer instruction */
  programId: string;
}

export interface RawParsedTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  feePayer: string;
  fee: number;
  err: unknown;
  transfers: ParsedTransfer[];
  /** mint address → symbol (e.g. "USDC", "SOL"). Missing = unknown. */
  mintSymbols: Record<string, string>;
  /** Raw preTokenBalances for USD enrichment (optional) */
  preTokenBalances: RpcTransactionResult["meta"]["preTokenBalances"];
  postTokenBalances: RpcTransactionResult["meta"]["postTokenBalances"];
  preBalances: number[];
  postBalances: number[];
  accountKeys: RpcTransactionResult["transaction"]["message"]["accountKeys"];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NATIVE_SOL_MINT = "SOL";
const TX_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

const TRANSFER_TYPES = new Set(["transfer", "transferChecked"]);

// ─── Core parser ─────────────────────────────────────────────────────────────

function isTransferInstruction(inst: ParsedInstruction): boolean {
  return Boolean(
    inst.parsed && TRANSFER_TYPES.has(inst.parsed.type),
  );
}

function extractTransfer(
  inst: ParsedInstruction,
  order: number,
  level: "inner" | "outer",
  ataOwnerMap: Map<string, string>,
): ParsedTransfer | null {
  if (!inst.parsed) return null;

  const info = inst.parsed.info;
  const stackHeight = inst.stackHeight ?? (level === "outer" ? 1 : 2);

  // Raw source/destination from the instruction (may be ATA or wallet)
  const rawFrom = String(info.source ?? info.authority ?? info.owner ?? "").trim();
  const rawTo = String(info.destination ?? "").trim();

  if (!rawFrom || !rawTo) return null;

  // Resolve ATA → wallet owner (Solscan-style display)
  const fromAddr = ataOwnerMap.get(rawFrom) ?? rawFrom;
  const toAddr = ataOwnerMap.get(rawTo) ?? rawTo;
  const fromTokenAddr = fromAddr !== rawFrom ? rawFrom : undefined;
  const toTokenAddr = toAddr !== rawTo ? rawTo : undefined;

  const isNative =
    inst.program === "system" ||
    inst.programId === "11111111111111111111111111111111";

  if (isNative) {
    const lamports = Number(info.lamports ?? 0);
    return {
      order,
      level,
      stackHeight,
      fromAddr,
      toAddr,
      fromTokenAddr,
      toTokenAddr,
      mint: NATIVE_SOL_MINT,
      amount: lamports / 1e9,
      rawAmount: String(lamports),
      decimals: 9,
      kind: "native",
      programId: inst.programId,
    };
  }

  // SPL token transfer
  if (info.tokenAmount) {
    // transferChecked — has mint + tokenAmount
    return {
      order,
      level,
      stackHeight,
      fromAddr,
      toAddr,
      fromTokenAddr,
      toTokenAddr,
      mint: String(info.mint ?? ""),
      amount: info.tokenAmount.uiAmount ?? 0,
      rawAmount: info.tokenAmount.amount,
      decimals: info.tokenAmount.decimals,
      kind: "spl",
      programId: inst.programId,
    };
  }

  // plain transfer — no mint on the instruction
  const rawAmount = String(info.amount ?? "0");
  return {
    order,
    level,
    stackHeight,
    fromAddr,
    toAddr,
    fromTokenAddr,
    toTokenAddr,
    mint: String(info.mint ?? ""),
    amount: Number(rawAmount),
    rawAmount,
    decimals: 0,
    kind: "spl",
    programId: inst.programId,
  };
}

function parseTransfers(result: RpcTransactionResult): ParsedTransfer[] {
  const outerInstructions = result.transaction.message.instructions;
  const innerGroups = result.meta.innerInstructions ?? [];

  // Build a quick lookup: outer instruction index → inner instructions
  const innerByIndex = new Map<number, ParsedInstruction[]>();
  for (const group of innerGroups) {
    innerByIndex.set(group.index, group.instructions);
  }

  // Build ATA → owner wallet map (Solscan-style: show wallets, not token accounts)
  // Sources:
  // 1. preTokenBalances / postTokenBalances — most reliable, includes accountIndex+owner
  // 2. transferChecked instructions — include both source ATA and authority (owner)
  const accountKeys = result.transaction.message.accountKeys.map((k) => k.pubkey);
  const ataOwnerMap = new Map<string, string>();

  for (const tb of [
    ...(result.meta.preTokenBalances ?? []),
    ...(result.meta.postTokenBalances ?? []),
  ]) {
    const ata = accountKeys[tb.accountIndex];
    const owner = tb.owner;
    if (ata && owner) {
      ataOwnerMap.set(ata, owner);
    }
  }

  // Also mine transferChecked instructions for source→authority mappings
  for (const group of innerGroups) {
    for (const inst of group.instructions) {
      if (inst.parsed?.type === "transferChecked") {
        const info = inst.parsed.info;
        const source = String(info.source ?? "").trim();
        const authority = String(info.authority ?? "").trim();
        if (source && authority && !ataOwnerMap.has(source)) {
          ataOwnerMap.set(source, authority);
        }
      }
    }
  }
  for (const inst of outerInstructions) {
    if (inst.parsed?.type === "transferChecked") {
      const info = inst.parsed.info;
      const source = String(info.source ?? "").trim();
      const authority = String(info.authority ?? "").trim();
      if (source && authority && !ataOwnerMap.has(source)) {
        ataOwnerMap.set(source, authority);
      }
    }
  }

  const transfers: ParsedTransfer[] = [];
  let order = 1;

  for (let i = 0; i < outerInstructions.length; i++) {
    const outer = outerInstructions[i];

    // 1. Outer instruction itself (rare — most real transfers are inner)
    if (isTransferInstruction(outer)) {
      const t = extractTransfer(outer, order++, "outer", ataOwnerMap);
      if (t) transfers.push(t);
    }

    // 2. Inner instructions triggered by this outer instruction, in order
    const inners = innerByIndex.get(i) ?? [];
    for (const inner of inners) {
      if (isTransferInstruction(inner)) {
        const t = extractTransfer(inner, order++, "inner", ataOwnerMap);
        if (t) transfers.push(t);
      }
    }
  }

  return transfers;
}

// ─── RPC fetch ───────────────────────────────────────────────────────────────

async function fetchRawTransaction(
  signature: string,
): Promise<RpcTransactionResult | null> {
  const apiKey = getNextkey();
  const rpcUrl = new URL("https://mainnet.helius-rpc.com/");
  rpcUrl.searchParams.set("api-key", apiKey);

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [
      signature,
      {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ],
  };

  const response = await pFetch(heliusSpec, "helius.svc.raw_transaction", rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Solana RPC request failed (${response.status}): ${await response.text().then((t) => t.slice(0, 200))}`,
    );
  }

  const json = (await response.json()) as {
    jsonrpc: string;
    id: number;
    result: RpcTransactionResult | null;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new Error(`Solana RPC error (${json.error.code}): ${json.error.message}`);
  }

  return json.result ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getRawParsedTransaction(
  signature: string,
): Promise<RawParsedTransaction | null> {
  const normalized = signature.trim();

  if (!TX_SIGNATURE_REGEX.test(normalized)) {
    return null;
  }

  const result = await fetchRawTransaction(normalized);
  if (!result) return null;

  const accountKeys = result.transaction.message.accountKeys;
  const feePayer = accountKeys.find((k) => k.signer)?.pubkey ?? "";

  // Build a mint→decimals map from token balance metadata
  // so we can fix up plain `transfer` instructions that lack decimals.
  const mintDecimalsFromBalances = new Map<string, number>();
  for (const tb of [
    ...(result.meta.preTokenBalances ?? []),
    ...(result.meta.postTokenBalances ?? []),
  ]) {
    if (tb.mint && !mintDecimalsFromBalances.has(tb.mint)) {
      mintDecimalsFromBalances.set(tb.mint, tb.uiTokenAmount.decimals);
    }
  }

  const rawTransfers = parseTransfers(result);

  // Fix decimals and amount for plain `transfer` instructions (decimals=0 placeholder).
  const transfers: ParsedTransfer[] = rawTransfers.map((t) => {
    if (t.kind === "spl" && t.decimals === 0 && t.mint) {
      const dec = mintDecimalsFromBalances.get(t.mint);
      if (dec !== undefined && dec > 0) {
        return {
          ...t,
          decimals: dec,
          amount: Number(t.rawAmount) / 10 ** dec,
        };
      }
    }
    return t;
  });

  // Enrich mint → symbol from local DB (fast, no network).
  const uniqueMints = Array.from(
    new Set(
      transfers
        .filter((t) => t.kind === "spl" && t.mint)
        .map((t) => t.mint),
    ),
  );

  const mintSymbols: Record<string, string> = { SOL: "SOL" };
  if (uniqueMints.length > 0) {
    try {
      const rows = await getTokenMeta(uniqueMints);
      for (const row of rows) {
        const r = row as { address?: string; symbol?: string };
        const addr = String(r.address ?? "").trim();
        const sym = String(r.symbol ?? "").trim();
        if (addr && sym) {
          mintSymbols[addr] = sym.toUpperCase();
        }
      }
    } catch {
      // Token meta lookup is best-effort; proceed without symbols.
    }
  }

  return {
    signature: result.transaction.signatures[0] ?? normalized,
    slot: result.slot,
    blockTime: result.blockTime ?? null,
    feePayer,
    fee: result.meta.fee,
    err: result.meta.err,
    transfers,
    mintSymbols,
    preTokenBalances: result.meta.preTokenBalances,
    postTokenBalances: result.meta.postTokenBalances,
    preBalances: result.meta.preBalances,
    postBalances: result.meta.postBalances,
    accountKeys,
  };
}
