//! Handler for `GET /api/workspaces/:wsId/wallets/:walletId/interest/rates`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/wallets/[walletId]/interest/rates/route.ts`
//! which re-exports from
//! `packages/apis/src/finance/wallets/walletId/interest/rates/route.ts`.
//!
//! ## Auth model
//!
//! Uses `authorize_finance_permission` with the `view_transactions` permission,
//! matching the legacy `getAccessibleWallet` call with
//! `requiredPermission: 'view_transactions'`.
//!
//! The legacy route also enforces a wallet whitelist gate for callers who lack
//! the `manage_finance` permission (via `getAccessibleWallet`). This handler
//! reproduces that gate using the same service-role queries as the sibling
//! `workspaces_wsid_wallets_walletid_interest_calculate` handler.
//!
//! ## Response shape
//!
//! On success the handler returns the raw `wallet_interest_rates` array as JSON
//! with no wrapper object, matching the legacy `return NextResponse.json(rates)`.
//!
//! ## Status codes
//!
//! | Condition | Status |
//! |-----------|--------|
//! | Missing/invalid session or unresolved workspace | 401 |
//! | Caller lacks `view_transactions` | 403 |
//! | Wallet not accessible (whitelist gate) | 404 |
//! | Wallet not found in `private.workspace_wallets` | 404 |
//! | No interest config for wallet | 404 |
//! | Upstream read error (configs or rates) | 500 |
//! | Success | 200 (no-store) |
//!
//! ## Behavior gaps
//!
//! - POST (add new rate) is not ported; this handler returns `None` for every
//!   non-GET method so the Next.js route still handles it.
//! - The legacy route reads `wallet_interest_configs` and `wallet_interest_rates`
//!   using the user-scoped Supabase client (RLS active). This handler uses the
//!   service-role key instead (RLS bypassed), consistent with every other
//!   finance handler in this crate. The effective behavior is identical for
//!   authenticated callers because the wallet access gate has already been
//!   enforced above.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const PATH_PREFIX: &str = "/api/workspaces/";
const PATH_INFIX: &str = "/wallets/";
const PATH_SUFFIX: &str = "/interest/rates";
const PRIVATE_SCHEMA: &str = "private";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const WALLET_NOT_FOUND_MESSAGE: &str = "Wallet not found";
const WALLET_ACCESS_ERROR_MESSAGE: &str = "Error fetching wallet access";
const WORKSPACE_WALLETS_ERROR_MESSAGE: &str = "Error fetching workspace wallets";
const INTEREST_NOT_ENABLED_MESSAGE: &str = "Interest tracking not enabled for this wallet";
const RATES_ERROR_MESSAGE: &str = "Error fetching interest rates";

#[derive(serde::Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Deserialize)]
struct InterestConfigRow {
    id: String,
}

pub(crate) async fn handle_workspaces_wsid_wallets_walletid_interest_rates_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, wallet_id) = extract_path_segments(request.path)?;

    Some(match request.method {
        "GET" => rates_response(config, request, raw_ws_id, wallet_id, outbound).await,
        _ => return None,
    })
}

async fn rates_response(
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

    // Wallet existence check via private.workspace_wallets.
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

    // Fetch the interest config for the wallet.
    let config_id = match fetch_interest_config_id(&config.contact_data, outbound, wallet_id).await
    {
        Ok(Some(id)) => id,
        Ok(None) => return message_response(404, INTEREST_NOT_ENABLED_MESSAGE),
        Err(()) => return message_response(500, RATES_ERROR_MESSAGE),
    };

    // Fetch the rate history ordered by effective_from descending.
    match fetch_interest_rates(&config.contact_data, outbound, &config_id).await {
        Ok(rates) => no_store_response(json_response(200, rates)),
        Err(()) => message_response(500, RATES_ERROR_MESSAGE),
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
    #[derive(Deserialize)]
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
// Interest config + rates reads
// ---------------------------------------------------------------------------

async fn fetch_interest_config_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "wallet_interest_configs",
            &[
                ("select", "id".to_owned()),
                ("wallet_id", format!("eq.{wallet_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let mut rows = response.json::<Vec<InterestConfigRow>>().map_err(|_| ())?;
    Ok(rows.drain(..).next().map(|r| r.id))
}

async fn fetch_interest_rates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    config_id: &str,
) -> Result<Value, ()> {
    let url = contact_data
        .rest_url(
            "wallet_interest_rates",
            &[
                ("select", "*".to_owned()),
                ("config_id", format!("eq.{config_id}")),
                ("order", "effective_from.desc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Value>().map_err(|_| ())
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::extract_path_segments;

    #[test]
    fn path_matches_valid_route() {
        let (ws, wallet) =
            extract_path_segments("/api/workspaces/ws-abc/wallets/wlt-123/interest/rates")
                .expect("should match");
        assert_eq!(ws, "ws-abc");
        assert_eq!(wallet, "wlt-123");
    }

    #[test]
    fn path_rejects_wrong_suffix() {
        assert!(
            extract_path_segments("/api/workspaces/ws-abc/wallets/wlt-123/interest/calculate")
                .is_none()
        );
    }

    #[test]
    fn path_rejects_extra_segments() {
        assert!(
            extract_path_segments("/api/workspaces/ws-abc/wallets/wlt-123/interest/rates/extra")
                .is_none()
        );
    }

    #[test]
    fn path_rejects_empty_ws_id() {
        assert!(extract_path_segments("/api/workspaces//wallets/wlt-123/interest/rates").is_none());
    }

    #[test]
    fn path_rejects_empty_wallet_id() {
        assert!(extract_path_segments("/api/workspaces/ws-abc/wallets//interest/rates").is_none());
    }

    #[test]
    fn path_rejects_wrong_prefix() {
        assert!(
            extract_path_segments("/api/v1/workspaces/ws-abc/wallets/wlt-123/interest/rates")
                .is_none()
        );
    }

    #[test]
    fn path_rejects_slash_in_ws_id() {
        assert!(
            extract_path_segments("/api/workspaces/a/b/wallets/wlt-123/interest/rates").is_none()
        );
    }

    #[test]
    fn path_accepts_uuid_segments() {
        let uuid_ws = "550e8400-e29b-41d4-a716-446655440000";
        let uuid_wallet = "660e8400-e29b-41d4-a716-446655440001";
        let path = format!("/api/workspaces/{uuid_ws}/wallets/{uuid_wallet}/interest/rates");
        let (ws, wallet) = extract_path_segments(&path).expect("should match");
        assert_eq!(ws, uuid_ws);
        assert_eq!(wallet, uuid_wallet);
    }
}
