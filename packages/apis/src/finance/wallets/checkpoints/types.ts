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

export type WalletCheckpointAuditStatusRow = {
  audited_balance: number | string;
  checkpoint_id?: string | null;
  checkpoint_ledger_balance: number | string | null;
  checked_at?: string | null;
  latest_actual_balance: number | string | null;
  latest_checked_at: string | null;
  latest_checkpoint_id: string | null;
  ledger_balance: number | string;
  post_checkpoint_delta: number | string;
  post_checkpoint_transaction_count: number | string;
  status: string;
  variance: number | string;
  wallet_id: string;
};

export type WalletCheckpointAuditStatus = {
  audited_balance: number;
  checkpoint_ledger_balance: number | null;
  latest_actual_balance: number | null;
  latest_checked_at: string | null;
  latest_checkpoint_id: string | null;
  ledger_balance: number;
  post_checkpoint_delta: number;
  post_checkpoint_transaction_count: number;
  status: 'clean' | 'no_checkpoint' | 'unresolved';
  variance: number;
  wallet_id: string;
};

export type WalletCheckpointHistoryInterval = WalletCheckpointInterval & {
  currency: string;
  wallet_id: string;
  wallet_name: string | null;
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

export type WalletCheckpointHistoryResponse =
  WalletCheckpointSummaryResponse & {
    audit_statuses: WalletCheckpointAuditStatus[];
    checkpoints: WalletCheckpoint[];
    intervals: WalletCheckpointHistoryInterval[];
  };

export type WalletCheckpointReconciliationPayload = {
  basis?: 'checkpoint' | 'interval';
  category_id?: string | null;
  description?: string | null;
};

export type WalletCheckpointReconciliationResponse = {
  checked_at: string;
  checkpoint_id: string;
  created: boolean;
  offset_amount: number;
  transaction_id: string | null;
  wallet_id: string;
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
