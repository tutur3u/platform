use super::*;

// ---------------------------------------------------------------------------
// Row decoding types (used across multiple submodules)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct WalletWhitelistWindowRow {
    pub(super) wallet_id: Option<String>,
    pub(super) viewing_window: Option<String>,
    pub(super) custom_days: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct CheckpointRow {
    pub(super) id: String,
    pub(super) wallet_id: String,
    pub(super) checked_at: String,
    pub(super) actual_balance: Option<Value>,
    pub(super) ledger_balance: Option<Value>,
    pub(super) currency: Option<String>,
    pub(super) note: Option<String>,
    pub(super) created_by: Option<String>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Deserialize)]
pub(super) struct IntervalRow {
    pub(super) actual_delta: Option<Value>,
    pub(super) end_actual_balance: Option<Value>,
    pub(super) end_checked_at: String,
    pub(super) end_checkpoint_id: String,
    pub(super) interval_variance: Option<Value>,
    pub(super) ledger_delta: Option<Value>,
    pub(super) start_actual_balance: Option<Value>,
    pub(super) start_checked_at: String,
    pub(super) start_checkpoint_id: String,
    pub(super) transaction_count: Option<Value>,
}

// ---------------------------------------------------------------------------
// Local domain structs
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub(super) struct SummaryWallet {
    pub(super) id: String,
    pub(super) name: Option<String>,
    pub(super) currency: String,
    pub(super) balance: f64,
    pub(super) wallet_type: Option<String>,
    pub(super) icon: Option<String>,
    pub(super) image_src: Option<String>,
}

#[derive(Clone)]
pub(super) struct NormalizedCheckpoint {
    pub(super) actual_balance: f64,
    pub(super) checked_at: String,
    pub(super) created_at: String,
    pub(super) created_by: Option<String>,
    pub(super) currency: String,
    pub(super) current_ledger_balance: f64,
    pub(super) current_variance: f64,
    pub(super) id: String,
    pub(super) ledger_balance: f64,
    pub(super) note: Option<String>,
    pub(super) original_variance: f64,
    pub(super) updated_at: String,
    pub(super) wallet_id: String,
}

/// Result of resolving which wallets the caller can see, plus their viewing
/// windows (mirrors `listAccessibleCheckpointWallets`).
pub(super) struct CheckpointWalletAccess {
    pub(super) wallets: Vec<SummaryWallet>,
    pub(super) window_starts_by_wallet_id: HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// Error enums
// ---------------------------------------------------------------------------

pub(super) enum BuildError {
    /// Checkpoint table query failed -> 500 "Error fetching wallet checkpoints".
    Checkpoints,
    /// Any other failure -> 500 "Error fetching wallet checkpoint history".
    Internal,
}

pub(super) enum CheckpointFetchError {
    StorageMissing,
    Failed,
}
