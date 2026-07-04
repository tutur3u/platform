//! Handler for `GET /api/workspaces/:wsId/wallets/:walletId/interest/calculate`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/wallets/[walletId]/interest/calculate/route.ts`
//! which re-exports from
//! `packages/apis/src/finance/wallets/walletId/interest/calculate/route.ts`.
//!
//! ## Auth model
//!
//! Uses `authorize_finance_permission` with the `view_transactions` permission,
//! matching the legacy `getAccessibleWallet` call with
//! `requiredPermission: 'view_transactions'`.
//!
//! The legacy route also enforces a wallet whitelist gate for callers who lack
//! the `manage_finance` permission (via `getAccessibleWallet`). This handler
//! reproduces that gate using the same service-role queries used in
//! `workspaces_wallets_walletid_credit_summary`.
//!
//! ## Query parameters
//!
//! - `from` – start date in `YYYY-MM-DD` format; defaults to January 1st of
//!   the current year.
//! - `to` – end date in `YYYY-MM-DD` format; defaults to today.
//!
//! ## Response
//!
//! On success the raw RPC result is returned as JSON with no wrapper object,
//! matching the legacy `return NextResponse.json(calculation)` call.
//!
//! ## Status codes
//!
//! | Condition | Status |
//! |-----------|--------|
//! | Missing/invalid session or unresolved workspace | 401 |
//! | Caller lacks `view_transactions` | 403 |
//! | Wallet not accessible (whitelist gate) | 404 |
//! | Wallet not found in `private.workspace_wallets` | 404 |
//! | Invalid date format | 400 |
//! | `from` > `to` | 400 |
//! | RPC upstream error | 500 |
//! | `payload.error == "wallet_not_found"` | 404 |
//! | `payload.error == "not_enabled"` | 404 |
//! | `payload.error == "disabled"` | 400 |
//! | Other `payload.error` value | 500 |
//! | Success | 200 (no-store) |
//!
//! ## Behavior gaps
//!
//! None known.

use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const PATH_PREFIX: &str = "/api/workspaces/";
const PATH_INFIX: &str = "/wallets/";
const PATH_SUFFIX: &str = "/interest/calculate";
const PRIVATE_SCHEMA: &str = "private";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const CALCULATE_WALLET_INTEREST_RPC: &str = "calculate_wallet_interest";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const WALLET_NOT_FOUND_MESSAGE: &str = "Wallet not found";
const WALLET_ACCESS_ERROR_MESSAGE: &str = "Error fetching wallet access";
const WORKSPACE_WALLETS_ERROR_MESSAGE: &str = "Error fetching workspace wallets";
const CALCULATE_ERROR_MESSAGE: &str = "Error calculating interest";
const INTEREST_NOT_ENABLED_MESSAGE: &str = "Interest tracking not enabled for this wallet";
const INTEREST_DISABLED_MESSAGE: &str = "Interest tracking is disabled for this wallet";
const INVALID_DATE_FORMAT_MESSAGE: &str = "Invalid date format. Use YYYY-MM-DD";
const DATE_ORDER_MESSAGE: &str = "from date must be before or equal to to date";

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct CalculateWalletInterestRequest<'a> {
    _actor_id: &'a str,
    _from_date: &'a str,
    _to_date: &'a str,
    _wallet_id: &'a str,
    _ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_wsid_wallets_walletid_interest_calculate_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, wallet_id) = extract_path_segments(request.path)?;

    Some(match request.method {
        "GET" => calculate_interest_response(config, request, raw_ws_id, wallet_id, outbound).await,
        _ => return None,
    })
}

async fn calculate_interest_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    wallet_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, WORKSPACE_WALLETS_ERROR_MESSAGE);
        }
    };

    // Wallet whitelist gate — mirrors getAccessibleWallet's manage_finance /
    // workspace_role_wallet_whitelist check.
    match ensure_wallet_access(&config.contact_data, outbound, &authorization, wallet_id).await {
        WalletAccess::Allowed => {}
        WalletAccess::NotFound => return message_response(404, WALLET_NOT_FOUND_MESSAGE),
        WalletAccess::AccessError => return message_response(500, WALLET_ACCESS_ERROR_MESSAGE),
    }

    // Wallet existence check via private.workspace_wallets (maybeSingle in
    // legacy; we check for a non-empty result set).
    match wallet_exists(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        wallet_id,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(404, WALLET_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, WORKSPACE_WALLETS_ERROR_MESSAGE),
    }

    // Parse query params with legacy defaults.
    let (default_from, default_to) = today_and_year_start();
    let from_date = query_param(request.url, "from").unwrap_or(default_from);
    let to_date = query_param(request.url, "to").unwrap_or(default_to);

    if !is_valid_date_format(&from_date) || !is_valid_date_format(&to_date) {
        return message_response(400, INVALID_DATE_FORMAT_MESSAGE);
    }
    if from_date > to_date {
        return message_response(400, DATE_ORDER_MESSAGE);
    }

    match call_calculate_interest_rpc(
        &config.contact_data,
        outbound,
        &authorization,
        wallet_id,
        &from_date,
        &to_date,
    )
    .await
    {
        Ok(result) => no_store_response(json_response(200, result)),
        Err(CalcError::WalletNotFound) => message_response(404, WALLET_NOT_FOUND_MESSAGE),
        Err(CalcError::NotEnabled) => message_response(404, INTEREST_NOT_ENABLED_MESSAGE),
        Err(CalcError::Disabled) => message_response(400, INTEREST_DISABLED_MESSAGE),
        Err(CalcError::Internal) => message_response(500, CALCULATE_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Wallet access gate (mirrors getAccessibleWallet's whitelist logic)
// ---------------------------------------------------------------------------

enum WalletAccess {
    Allowed,
    NotFound,
    AccessError,
}

async fn ensure_wallet_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    wallet_id: &str,
) -> WalletAccess {
    let has_manage = match has_workspace_permission(
        contact_data,
        outbound,
        &authorization.ws_id,
        MANAGE_FINANCE_PERMISSION,
        &authorization.user_id,
    )
    .await
    {
        Ok(v) => v,
        Err(()) => return WalletAccess::AccessError,
    };

    if has_manage {
        return WalletAccess::Allowed;
    }

    let role_ids = match fetch_role_ids(
        contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
    )
    .await
    {
        Ok(ids) => ids,
        Err(()) => return WalletAccess::AccessError,
    };

    if role_ids.is_empty() {
        return WalletAccess::NotFound;
    }

    match wallet_in_whitelist(contact_data, outbound, wallet_id, &role_ids).await {
        Ok(true) => WalletAccess::Allowed,
        Ok(false) => WalletAccess::NotFound,
        Err(()) => WalletAccess::AccessError,
    }
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<bool>().map_err(|_| ())
}

async fn fetch_role_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_role_members",
            &[
                ("select", "role_id, workspace_roles!inner(ws_id)".to_owned()),
                ("user_id", format!("eq.{user_id}")),
                ("workspace_roles.ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    #[derive(serde::Deserialize)]
    struct Row {
        role_id: Option<String>,
    }
    Ok(response
        .json::<Vec<Row>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|r| r.role_id)
        .collect())
}

async fn wallet_in_whitelist(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    role_ids: &[String],
) -> Result<bool, ()> {
    let role_filter = format!("({})", role_ids.join(","));
    let url = contact_data
        .rest_url(
            "workspace_role_wallet_whitelist",
            &[
                ("select", "wallet_id".to_owned()),
                ("wallet_id", format!("eq.{wallet_id}")),
                ("role_id", format!("in.{role_filter}")),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(!response.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

async fn wallet_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    wallet_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_wallets",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{wallet_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(!response.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

// ---------------------------------------------------------------------------
// RPC call
// ---------------------------------------------------------------------------

enum CalcError {
    WalletNotFound,
    NotEnabled,
    Disabled,
    Internal,
}

async fn call_calculate_interest_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    wallet_id: &str,
    from_date: &str,
    to_date: &str,
) -> Result<Value, CalcError> {
    let rpc_url = contact_data
        .rpc_url(CALCULATE_WALLET_INTEREST_RPC)
        .ok_or(CalcError::Internal)?;
    let service_role_key = contact_data.service_role_key().ok_or(CalcError::Internal)?;
    let bearer = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&CalculateWalletInterestRequest {
        _actor_id: &authorization.user_id,
        _from_date: from_date,
        _to_date: to_date,
        _wallet_id: wallet_id,
        _ws_id: &authorization.ws_id,
    })
    .map_err(|_| CalcError::Internal)?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| CalcError::Internal)?;
    if !(200..300).contains(&response.status) {
        return Err(CalcError::Internal);
    }
    let value = response.json::<Value>().map_err(|_| CalcError::Internal)?;
    // Mirror the legacy `payload?.error` checks.
    match value.get("error").and_then(|e| e.as_str()) {
        Some("wallet_not_found") => Err(CalcError::WalletNotFound),
        Some("not_enabled") => Err(CalcError::NotEnabled),
        Some("disabled") => Err(CalcError::Disabled),
        Some(_) => Err(CalcError::Internal),
        None => Ok(value),
    }
}

// ---------------------------------------------------------------------------
// Shared outbound helper
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

fn extract_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let rest = rest.strip_suffix(PATH_SUFFIX)?;
    let (ws_id, wallet_id) = rest.split_once(PATH_INFIX)?;
    if ws_id.is_empty() || ws_id.contains('/') || wallet_id.is_empty() || wallet_id.contains('/') {
        return None;
    }
    Some((ws_id, wallet_id))
}

/// Extracts a query-parameter value from the request URL, percent-decoding it.
/// Returns `None` when the key is absent or its decoded value is empty.
fn query_param(url: Option<&str>, key: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        if k == key {
            let decoded = url::form_urlencoded::parse(format!("{k}={v}").as_bytes())
                .next()
                .map(|(_, value)| value.into_owned())
                .unwrap_or_default();
            if decoded.is_empty() {
                return None;
            }
            return Some(decoded);
        }
    }
    None
}

/// Returns `(year_start, today)` as `YYYY-MM-DD` strings derived from the
/// system clock via UNIX-timestamp arithmetic (no external date crate needed).
fn today_and_year_start() -> (String, String) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let (y, m, d) = unix_to_ymd(secs);
    let today = format!("{y:04}-{m:02}-{d:02}");
    let year_start = format!("{y:04}-01-01");
    (year_start, today)
}

/// Converts a UNIX timestamp (seconds since epoch) to `(year, month, day)` in
/// the proleptic Gregorian calendar using Howard Hinnant's `civil_from_days`
/// algorithm.
fn unix_to_ymd(secs: u64) -> (u32, u32, u32) {
    let days = secs / 86_400;
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y_adj = if m <= 2 { y + 1 } else { y };
    (y_adj as u32, m as u32, d as u32)
}

/// Returns `true` when `s` matches `YYYY-MM-DD` (digit characters only; no
/// calendar-range validation is performed beyond what the database enforces).
fn is_valid_date_format(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[..4].iter().all(|c| c.is_ascii_digit())
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[8..10].iter().all(|c| c.is_ascii_digit())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_segments_parses_valid_path() {
        let path = "/api/workspaces/ws-123/wallets/wallet-456/interest/calculate";
        assert_eq!(extract_path_segments(path), Some(("ws-123", "wallet-456")));
    }

    #[test]
    fn path_segments_rejects_wrong_prefix() {
        let path = "/api/v1/workspaces/ws-123/wallets/wallet-456/interest/calculate";
        assert!(extract_path_segments(path).is_none());
    }

    #[test]
    fn path_segments_rejects_wrong_suffix() {
        let path = "/api/workspaces/ws-123/wallets/wallet-456/interest/detect";
        assert!(extract_path_segments(path).is_none());
    }

    #[test]
    fn path_segments_rejects_empty_ws_id() {
        let path = "/api/workspaces//wallets/wallet-456/interest/calculate";
        assert!(extract_path_segments(path).is_none());
    }

    #[test]
    fn path_segments_rejects_empty_wallet_id() {
        let path = "/api/workspaces/ws-123/wallets//interest/calculate";
        assert!(extract_path_segments(path).is_none());
    }

    #[test]
    fn path_segments_rejects_slash_in_ws_id() {
        let path = "/api/workspaces/a/b/wallets/wallet-456/interest/calculate";
        assert!(extract_path_segments(path).is_none());
    }

    #[test]
    fn date_format_valid() {
        assert!(is_valid_date_format("2024-01-01"));
        assert!(is_valid_date_format("2026-12-31"));
        assert!(is_valid_date_format("2000-06-15"));
    }

    #[test]
    fn date_format_invalid() {
        assert!(!is_valid_date_format("2024-1-1"));
        assert!(!is_valid_date_format("24-01-01"));
        assert!(!is_valid_date_format("2024/01/01"));
        assert!(!is_valid_date_format("not-a-date"));
        assert!(!is_valid_date_format(""));
        assert!(!is_valid_date_format("2024-01-0x"));
    }

    #[test]
    fn unix_to_ymd_known_dates() {
        // 2024-01-01 00:00:00 UTC = 1_704_067_200
        assert_eq!(unix_to_ymd(1_704_067_200), (2024, 1, 1));
        // 2000-01-01 00:00:00 UTC = 946_684_800
        assert_eq!(unix_to_ymd(946_684_800), (2000, 1, 1));
        // 1970-01-01 00:00:00 UTC = 0
        assert_eq!(unix_to_ymd(0), (1970, 1, 1));
    }

    #[test]
    fn query_param_extracts_from_value() {
        assert_eq!(
            query_param(
                Some("https://example.com/api?from=2024-01-01&to=2024-12-31"),
                "from"
            ),
            Some("2024-01-01".to_owned())
        );
    }

    #[test]
    fn query_param_extracts_to_value() {
        assert_eq!(
            query_param(
                Some("https://example.com/api?from=2024-01-01&to=2024-12-31"),
                "to"
            ),
            Some("2024-12-31".to_owned())
        );
    }

    #[test]
    fn query_param_returns_none_when_absent() {
        assert_eq!(query_param(Some("https://example.com/api"), "from"), None);
        assert_eq!(query_param(None, "from"), None);
    }
}
