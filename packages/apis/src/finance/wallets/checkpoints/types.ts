export type WalletCheckpointRow = {
  actual_balance: number | string;
  checked_at: string;
  created_at: string;
  created_by: string | null;
  currency: string;
  id: string;
  ledger_balance: number | string;
  note: string | null;
  updated_at: string;
  wallet_id: string;
};

export type WalletCheckpoint = {
  actual_balance: number;
  checked_at: string;
  created_at: string;
  created_by: string | null;
  currency: string;
  current_ledger_balance: number;
  current_variance: number;
  id: string;
  ledger_balance: number;
  note: string | null;
  original_variance: number;
  updated_at: string;
  wallet_id: string;
};

export type WalletCheckpointIntervalRow = {
  actual_delta: number | string;
  end_actual_balance: number | string;
  end_checked_at: string;
  end_checkpoint_id: string;
  interval_variance: number | string;
  ledger_delta: number | string;
  start_actual_balance: number | string;
  start_checked_at: string;
  start_checkpoint_id: string;
  transaction_count: number | string;
};

export type WalletCheckpointInterval = {
  actual_delta: number;
  end_actual_balance: number;
  end_checked_at: string;
  end_checkpoint_id: string;
  interval_variance: number;
  is_clean: boolean;
  ledger_delta: number;
  start_actual_balance: number;
  start_checked_at: string;
  start_checkpoint_id: string;
  transaction_count: number;
};

export type WalletCheckpointListResponse = {
  data: WalletCheckpoint[];
  intervals: WalletCheckpointInterval[];
  latest: WalletCheckpoint | null;
};

export type WalletCheckpointSummaryWallet = {
  balance: number;
  currency: string;
  icon: string | null;
  id: string;
  image_src: string | null;
  name: string | null;
  type: string | null;
};

export type WalletCheckpointCurrencyTotal = {
  actual_total: number;
  checkpoint_count: number;
  currency: string;
  ledger_total: number;
  variance_total: number;
};

export type WalletCheckpointSummaryResponse = {
  latest_checkpoints: WalletCheckpoint[];
  totals_by_currency: WalletCheckpointCurrencyTotal[];
  wallets: WalletCheckpointSummaryWallet[];
};

export type WalletCheckpointPayload = {
  actual_balance: number;
  checked_at?: string;
  note?: string | null;
};

export type WalletCheckpointBatchPayload = {
  checked_at?: string;
  entries: Array<{
    actual_balance: number;
    note?: string | null;
    wallet_id: string;
  }>;
};
