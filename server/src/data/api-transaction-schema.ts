export class Block {
  hash: string = "";
  height: string = "";
  slot: string = "";
  time: string = "";
}

export class TransactionResult {
  errorMessage: string = "";
  success: boolean = false;
}

export class Transaction {
  balanceUpdatesCount?: number = 0;
  fee: string = "";
  feePayer: string = "";
  index: number = 0;
  instructionsCount: number = 0;
  recentBlockhash: string = "";
  result: TransactionResult = new TransactionResult();
  signature: string = "";
  signer: string = "";
  tokenBalanceUpdatesCount?: number = 0;
}

export class SolanaTransaction {
  block: Block = new Block();
  transaction: Transaction = new Transaction();
}

export class SolanaTransactions {
  transactions: SolanaTransaction[] = [];
}

export class TransactionData {
  solana: SolanaTransactions = new SolanaTransactions();
}

export class TransactionResponse {
  data: TransactionData = new TransactionData();
}

export interface RawBlock {
  Hash?: string;
  Height?: string;
  Slot?: string;
  Time?: string;
}

export interface RawTransactionResult {
  ErrorMessage?: string;
  Success?: boolean;
}

export interface RawTransaction {
  BalanceUpdatesCount?: number;
  Fee?: string;
  FeePayer?: string;
  Index?: number;
  InstructionsCount?: number;
  RecentBlockhash?: string;
  Result?: RawTransactionResult;
  Signature?: string;
  Signer?: string;
  TokenBalanceUpdatesCount?: number;
}

export interface RawSolanaTransaction {
  Block?: RawBlock;
  Transaction?: RawTransaction;
}

export interface RawSolanaData {
  Transactions?: RawSolanaTransaction[];
}

export interface RawApiResponse {
  data?: {
    Solana?: RawSolanaData;
  };
}
