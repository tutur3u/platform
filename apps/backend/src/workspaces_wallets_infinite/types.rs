use super::*;

// ---------------------------------------------------------------------------
// Row decoders
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct SupabaseCookieSession {
    pub(super) access_token: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceIdRow {
    pub(super) id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    pub(super) membership_type: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceRow {
    pub(super) creator_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct PermissionRow {
    pub(super) permission: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceConfigRow {
    pub(super) value: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct RoleMemberRow {
    pub(super) role_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WhitelistRow {
    pub(super) wallet_id: Option<String>,
    pub(super) viewing_window: Option<String>,
    pub(super) custom_days: Option<i64>,
}

pub(super) struct WalletWindow {
    pub(super) viewing_window: Option<String>,
    pub(super) custom_days: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct CreditWalletRow {
    pub(super) wallet_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    pub(super) limit: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    pub(super) statement_date: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    pub(super) payment_date: Option<f64>,
}

#[derive(Deserialize)]
pub(super) struct AuditStatusRow {
    pub(super) wallet_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    pub(super) audited_balance: f64,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    pub(super) latest_actual_balance: Option<f64>,
    pub(super) latest_checked_at: Option<String>,
    pub(super) latest_checkpoint_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    pub(super) ledger_balance: f64,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    pub(super) post_checkpoint_delta: f64,
    #[serde(default, deserialize_with = "deserialize_optional_integer")]
    pub(super) post_checkpoint_transaction_count: Option<i64>,
    pub(super) status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    pub(super) variance: f64,
}

// ---------------------------------------------------------------------------
// Permissions model
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct EffectiveWorkspacePermissions {
    pub(super) has_all_permissions: bool,
    pub(super) permissions: Vec<String>,
}

impl EffectiveWorkspacePermissions {
    pub(super) fn has(&self, permission: &str) -> bool {
        self.has_all_permissions || self.permissions.iter().any(|value| value == permission)
    }
}

// ---------------------------------------------------------------------------
// Numeric deserializers (Supabase may return numerics as strings or numbers)
// ---------------------------------------------------------------------------

// Mirrors `toCheckpointNumber`.
pub(super) fn deserialize_optional_number<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value.and_then(|value| value_to_number(&value)))
}

pub(super) fn deserialize_number_or_zero<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value
        .and_then(|value| value_to_number(&value))
        .unwrap_or(0.0))
}

pub(super) fn deserialize_optional_integer<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value
        .and_then(|value| value_to_number(&value))
        .map(|number| number as i64))
}

pub(super) fn value_to_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => {
            let parsed = text.trim().parse::<f64>().ok()?;
            parsed.is_finite().then_some(parsed)
        }
        _ => None,
    }
}
