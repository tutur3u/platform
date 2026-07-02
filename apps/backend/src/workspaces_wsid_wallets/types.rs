use super::*;

// ---------------------------------------------------------------------------
// RPC request bodies
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub(super) struct HasWorkspacePermissionRequest<'a> {
    pub(super) p_permission: &'a str,
    pub(super) p_user_id: &'a str,
    pub(super) p_ws_id: &'a str,
}

#[derive(Serialize)]
pub(super) struct AuditStatusRpcRequest<'a> {
    pub(super) _wallet_ids: &'a [String],
}

// ---------------------------------------------------------------------------
// REST row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct WorkspaceIdRow {
    pub(super) id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceConfigRow {
    pub(super) value: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct RoleMembershipRow {
    pub(super) role_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WhitelistRow {
    #[serde(default)]
    pub(super) wallet_id: Option<String>,
    #[serde(default)]
    pub(super) viewing_window: Option<String>,
    #[serde(default)]
    pub(super) custom_days: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct CreditWalletRow {
    pub(super) wallet_id: String,
    #[serde(default)]
    pub(super) limit: Value,
    #[serde(default)]
    pub(super) statement_date: Value,
    #[serde(default)]
    pub(super) payment_date: Value,
}

#[derive(Deserialize)]
pub(super) struct AuditStatusRow {
    pub(super) wallet_id: String,
    #[serde(default)]
    pub(super) audited_balance: Option<Value>,
    #[serde(default)]
    pub(super) latest_actual_balance: Option<Value>,
    #[serde(default)]
    pub(super) latest_checked_at: Option<String>,
    #[serde(default)]
    pub(super) latest_checkpoint_id: Option<String>,
    #[serde(default)]
    pub(super) ledger_balance: Option<Value>,
    #[serde(default)]
    pub(super) post_checkpoint_delta: Option<Value>,
    #[serde(default)]
    pub(super) post_checkpoint_transaction_count: Option<Value>,
    #[serde(default)]
    pub(super) status: Option<String>,
    #[serde(default)]
    pub(super) variance: Option<Value>,
}
