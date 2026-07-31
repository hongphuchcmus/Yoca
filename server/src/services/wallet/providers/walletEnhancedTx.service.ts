import { db } from "@sv/db/index.js";
import {
  walletEnhancedTransactions,
  walletEnhancedTokenTransfers,
  walletEnhancedNativeTransfers,
  walletEnhancedInstructions,
  walletEnhancedInnerInstructions,
  walletEnhancedTxMeta,
} from "@sv/db/schema.js";
import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { fetchHeliusAddressTransactions } from "./helius-tx-fetcher.js";
import { getMissingRanges, isMissingRangeSignificant } from "@sv/services/wallet/walletRange.utils.js";
import type { WalletRangeMs } from "@sv/services/wallet/walletRange.utils.js";
import type { HeliusEnhancedTransaction, HeliusEnhancedTokenTransfer, HeliusEnhancedNativeTransfer, HeliusEnhancedInstruction, HeliusEnhancedInnerInstruction } from "@sv/services/transactions.js";
import { dataUsage } from "@sv/middlewares/request-context.js";

type TokenTransferRow = {
  mint: string;
  tokenAmount: number;
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string | null;
  toTokenAccount: string | null;
  symbol: string | null;
  tokenSymbol: string | null;
  instructionIndex: number;
};

type NativeTransferRow = {
  amount: number;
  fromUserAccount: string;
  toUserAccount: string;
  transferIndex: number;
};

const TX_SYSTEM_PROGRAMS = new Set([
  "ComputeBudget111111111111111111111111111111",
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
]);

function extractProgramId(tx: HeliusEnhancedTransaction): string | null {
  const instructions = tx.instructions ?? [];
  for (const ins of instructions) {
    const programId = String(ins.programId ?? "").trim();
    if (programId && !TX_SYSTEM_PROGRAMS.has(programId)) {
      return programId;
    }
  }
  return null;
}

function txTimestampMs(tx: HeliusEnhancedTransaction): number {
  const tsSec = Number(tx.timestamp ?? tx.info?.timestamp ?? 0);
  return tsSec > 0 ? tsSec * 1000 : 0;
}

async function getCachedTxMeta(address: string): Promise<WalletRangeMs | null> {
  const rows = await db
    .select()
    .from(walletEnhancedTxMeta)
    .where(eq(walletEnhancedTxMeta.address, address))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.coveredFromMs == null || row.coveredToMs == null) return null;
  return { fromMs: row.coveredFromMs, toMs: row.coveredToMs };
}

async function getCachedTxsByRange(
  address: string,
  fromMs: number,
  toMs: number,
): Promise<HeliusEnhancedTransaction[]> {
  const txRows = await db
    .select()
    .from(walletEnhancedTransactions)
    .where(
      and(
        eq(walletEnhancedTransactions.address, address),
        gte(walletEnhancedTransactions.blockTimestampMs, fromMs),
        lte(walletEnhancedTransactions.blockTimestampMs, toMs),
      ),
    )
    .orderBy(walletEnhancedTransactions.blockTimestampMs);

  if (txRows.length === 0) return [];

  const signatures = txRows.map((r) => r.signature);

  const tokenRows = await db
    .select()
    .from(walletEnhancedTokenTransfers)
    .where(
      and(
        eq(walletEnhancedTokenTransfers.address, address),
        inArray(walletEnhancedTokenTransfers.signature, signatures),
      ),
    );

  const nativeRows = await db
    .select()
    .from(walletEnhancedNativeTransfers)
    .where(
      and(
        eq(walletEnhancedNativeTransfers.address, address),
        inArray(walletEnhancedNativeTransfers.signature, signatures),
      ),
    );

  const instructionRows = await db
    .select()
    .from(walletEnhancedInstructions)
    .where(
      and(
        eq(walletEnhancedInstructions.address, address),
        inArray(walletEnhancedInstructions.signature, signatures),
      ),
    );

  const innerRows = await db
    .select()
    .from(walletEnhancedInnerInstructions)
    .where(
      and(
        eq(walletEnhancedInnerInstructions.address, address),
        inArray(walletEnhancedInnerInstructions.signature, signatures),
      ),
    );

  const tokenBySig = new Map<string, TokenTransferRow[]>();
  for (const row of tokenRows) {
    const group = tokenBySig.get(row.signature);
    if (group) {
      group.push({
        mint: row.mint,
        tokenAmount: row.tokenAmount,
        fromUserAccount: row.fromUserAccount,
        toUserAccount: row.toUserAccount,
        fromTokenAccount: row.fromTokenAccount,
        toTokenAccount: row.toTokenAccount,
        symbol: row.symbol,
        tokenSymbol: row.tokenSymbol,
        instructionIndex: row.instructionIndex,
      });
    } else {
      tokenBySig.set(row.signature, [{
        mint: row.mint,
        tokenAmount: row.tokenAmount,
        fromUserAccount: row.fromUserAccount,
        toUserAccount: row.toUserAccount,
        fromTokenAccount: row.fromTokenAccount,
        toTokenAccount: row.toTokenAccount,
        symbol: row.symbol,
        tokenSymbol: row.tokenSymbol,
        instructionIndex: row.instructionIndex,
      }]);
    }
  }

  const nativeBySig = new Map<string, NativeTransferRow[]>();
  for (const row of nativeRows) {
    const group = nativeBySig.get(row.signature);
    if (group) {
      group.push({
        amount: row.amount,
        fromUserAccount: row.fromUserAccount,
        toUserAccount: row.toUserAccount,
        transferIndex: row.transferIndex,
      });
    } else {
      nativeBySig.set(row.signature, [{
        amount: row.amount,
        fromUserAccount: row.fromUserAccount,
        toUserAccount: row.toUserAccount,
        transferIndex: row.transferIndex,
      }]);
    }
  }

  const innerBySigAndIdx = new Map<string, HeliusEnhancedInnerInstruction[]>();
  for (const row of innerRows) {
    const key = `${row.signature}:${row.instructionIndex}`;
    const group = innerBySigAndIdx.get(key);
    const entry: HeliusEnhancedInnerInstruction = {
      programId: row.programId,
      data: row.data ?? undefined,
      accounts: row.accounts ?? undefined,
    };
    if (group) {
      group.push(entry);
    } else {
      innerBySigAndIdx.set(key, [entry]);
    }
  }

  const insBySig = new Map<string, HeliusEnhancedInstruction[]>();
  for (const row of instructionRows) {
    const group = insBySig.get(row.signature);
    const innerKey = `${row.signature}:${row.instructionIndex}`;
    const entry: HeliusEnhancedInstruction = {
      programId: row.programId,
      data: row.data ?? undefined,
      accounts: row.accounts ?? undefined,
      innerInstructions: innerBySigAndIdx.get(innerKey),
    };
    if (group) {
      group.push(entry);
    } else {
      insBySig.set(row.signature, [entry]);
    }
  }

  const result: HeliusEnhancedTransaction[] = [];

  for (const row of txRows) {
    const tokenTransfers = (tokenBySig.get(row.signature) ?? []).map((tt) => {
      const t: HeliusEnhancedTokenTransfer = {
        mint: tt.mint,
        tokenAmount: tt.tokenAmount,
        amount: tt.tokenAmount,
        fromUserAccount: tt.fromUserAccount,
        toUserAccount: tt.toUserAccount,
        fromTokenAccount: tt.fromTokenAccount ?? undefined,
        toTokenAccount: tt.toTokenAccount ?? undefined,
        symbol: tt.symbol ?? undefined,
        tokenSymbol: tt.tokenSymbol ?? undefined,
      };
      return t;
    });

    const nativeTransfers = (nativeBySig.get(row.signature) ?? []).map((nt) => {
      const n: HeliusEnhancedNativeTransfer = {
        amount: nt.amount,
        fromUserAccount: nt.fromUserAccount,
        toUserAccount: nt.toUserAccount,
      };
      return n;
    });

    const tsSec = Math.floor(row.blockTimestampMs / 1000);

    const instructions = insBySig.get(row.signature);

    const tx: HeliusEnhancedTransaction = {
      signature: row.signature,
      timestamp: tsSec,
      source: row.source ?? undefined,
      type: row.type ?? undefined,
      feePayer: row.feePayer,
      fee: row.fee ?? undefined,
      slot: row.slot ?? undefined,
      info: {
        feePayer: row.feePayer,
        fee: row.fee ?? undefined,
        slot: row.slot ?? undefined,
        timestamp: tsSec,
      },
      tokenTransfers,
      nativeTransfers,
      instructions,
    };

    result.push(tx);
  }

  return result;
}

const INSERT_CHUNK_SIZE = 3_000;

async function chunkedInsert<T extends PgTable>(
  table: T,
  rows: Array<T['$inferInsert']>,
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(table).values(rows.slice(i, i + INSERT_CHUNK_SIZE)).onConflictDoNothing();
  }
}

async function cacheTransactions(
  address: string,
  txs: HeliusEnhancedTransaction[],
  fromMs: number,
  toMs: number,
): Promise<void> {
  if (txs.length === 0) {
    await db
      .insert(walletEnhancedTxMeta)
      .values({ address, coveredFromMs: fromMs, coveredToMs: toMs })
      .onConflictDoUpdate({
        target: [walletEnhancedTxMeta.address],
        set: {
          fetchedAt: new Date(),
          coveredFromMs: sql`LEAST(COALESCE(${walletEnhancedTxMeta.coveredFromMs}, ${fromMs}), ${fromMs})`,
          coveredToMs: sql`GREATEST(COALESCE(${walletEnhancedTxMeta.coveredToMs}, ${toMs}), ${toMs})`,
        },
      });
    return;
  }

  const parentRows = txs.map((tx) => {
    const tsMs = txTimestampMs(tx);
    const programId = extractProgramId(tx);
    return {
      address,
      signature: tx.signature,
      blockTimestampMs: tsMs,
      slot: tx.slot ?? null,
      fee: tx.fee ?? null,
      feePayer: tx.feePayer ?? tx.info?.feePayer ?? address,
      source: tx.source ?? null,
      type: tx.type ?? null,
      programId,
    };
  });

  const tokenRows: Array<{
    address: string;
    signature: string;
    mint: string;
    tokenAmount: number;
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string | null;
    toTokenAccount: string | null;
    symbol: string | null;
    tokenSymbol: string | null;
    instructionIndex: number;
  }> = [];

  const nativeRows: Array<{
    address: string;
    signature: string;
    amount: number;
    fromUserAccount: string;
    toUserAccount: string;
    transferIndex: number;
  }> = [];

  const instructionRows: Array<{
    address: string;
    signature: string;
    instructionIndex: number;
    programId: string;
    data: string | null;
    accounts: string[] | null;
  }> = [];

  const innerInstructionRows: Array<{
    address: string;
    signature: string;
    instructionIndex: number;
    innerIndex: number;
    programId: string;
    data: string | null;
    accounts: string[] | null;
  }> = [];

  for (const tx of txs) {
    const tokenTransfers = tx.tokenTransfers ?? [];
    for (let i = 0; i < tokenTransfers.length; i++) {
      const tt = tokenTransfers[i];
      const mint = String(tt.mint ?? "").trim();
      const amount = Number(tt.tokenAmount ?? tt.amount ?? 0);
      const from = String(tt.fromUserAccount ?? tt.fromWallet ?? "").trim();
      const to = String(tt.toUserAccount ?? tt.toWallet ?? "").trim();
      const fromTA = String(tt.fromTokenAccount ?? "").trim() || null;
      const toTA = String(tt.toTokenAccount ?? "").trim() || null;
      if (!mint || amount <= 0 || !from || !to) continue;
      tokenRows.push({
        address,
        signature: tx.signature,
        mint,
        tokenAmount: amount,
        fromUserAccount: from,
        toUserAccount: to,
        fromTokenAccount: fromTA,
        toTokenAccount: toTA,
        symbol: tt.symbol ?? null,
        tokenSymbol: tt.tokenSymbol ?? null,
        instructionIndex: i,
      });
    }

    const nativeTransfers = tx.nativeTransfers ?? [];
    for (let i = 0; i < nativeTransfers.length; i++) {
      const nt = nativeTransfers[i];
      const amount = Number(nt.amount ?? 0);
      const from = String(nt.fromUserAccount ?? nt.fromWallet ?? "").trim();
      const to = String(nt.toUserAccount ?? nt.toWallet ?? "").trim();
      if (amount <= 0 || !from || !to) continue;
      nativeRows.push({
        address,
        signature: tx.signature,
        amount,
        fromUserAccount: from,
        toUserAccount: to,
        transferIndex: i,
      });
    }

    const instructions = tx.instructions ?? [];
    for (let i = 0; i < instructions.length; i++) {
      const ins = instructions[i];
      const programId = String(ins.programId ?? "").trim();
      if (!programId) continue;
      instructionRows.push({
        address,
        signature: tx.signature,
        instructionIndex: i,
        programId,
        data: ins.data ?? null,
        accounts: ins.accounts ?? null,
      });
      const innerInstructions = ins.innerInstructions ?? [];
      for (let j = 0; j < innerInstructions.length; j++) {
        const inner = innerInstructions[j];
        const innerProgramId = String(inner.programId ?? "").trim();
        if (!innerProgramId) continue;
        innerInstructionRows.push({
          address,
          signature: tx.signature,
          instructionIndex: i,
          innerIndex: j,
          programId: innerProgramId,
          data: inner.data ?? null,
          accounts: inner.accounts ?? null,
        });
      }
    }
  }

  await chunkedInsert(walletEnhancedTransactions, parentRows);
  await chunkedInsert(walletEnhancedTokenTransfers, tokenRows);
  await chunkedInsert(walletEnhancedNativeTransfers, nativeRows);
  await chunkedInsert(walletEnhancedInstructions, instructionRows);
  await chunkedInsert(walletEnhancedInnerInstructions, innerInstructionRows);

  await db
    .insert(walletEnhancedTxMeta)
    .values({ address, coveredFromMs: fromMs, coveredToMs: toMs })
    .onConflictDoUpdate({
      target: [walletEnhancedTxMeta.address],
      set: {
        fetchedAt: new Date(),
        coveredFromMs: sql`LEAST(COALESCE(${walletEnhancedTxMeta.coveredFromMs}, ${fromMs}), ${fromMs})`,
        coveredToMs: sql`GREATEST(COALESCE(${walletEnhancedTxMeta.coveredToMs}, ${toMs}), ${toMs})`,
      },
    });
}

export async function resolveEnhancedTransactions(
  address: string,
  fromMs: number,
  toMs: number,
): Promise<HeliusEnhancedTransaction[]> {
  const resolvedFromMs = Math.min(fromMs, toMs);
  const resolvedToMs = Math.max(fromMs, toMs);

  const coveredRange = await getCachedTxMeta(address);
  const missingRanges = getMissingRanges(
    { fromMs: resolvedFromMs, toMs: resolvedToMs },
    coveredRange,
  );

  for (const range of missingRanges) {
    if (isMissingRangeSignificant(range.fromMs, range.toMs)) {
      const result = await fetchHeliusAddressTransactions(address, {
        fromMs: range.fromMs,
        toMs: range.toMs,
      });
      await cacheTransactions(address, result.transactions, range.fromMs, range.toMs);
    }
  }

  const allTxs = await getCachedTxsByRange(address, resolvedFromMs, resolvedToMs);
  if (allTxs.length > 0) {
    dataUsage.record("db_result");
  }

  return allTxs;
}
