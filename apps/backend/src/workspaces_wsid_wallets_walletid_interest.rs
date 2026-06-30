//! Handler for `GET /api/workspaces/:wsId/wallets/:walletId/interest`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/wallets/[walletId]/interest/route.ts`
//! which re-exports from
//! `packages/apis/src/finance/wallets/walletId/interest/route.ts`.
//!
//! # GET authentication and authorization
//!
//! The legacy route calls `getAccessibleWallet` with
//! `requiredPermission: 'view_transactions'` and `select: 'id'`, which:
//!
//! - Resolves the finance route auth context (session or CLI token).
//! - Requires the `view_transactions` workspace permission.
//! - Enforces a wallet-access whitelist gate: callers lacking `manage_finance`
//!   must belong to at least one workspace role whose wallet whitelist includes
//!   the requested wallet.
//! - Verifies the wallet exists in `private.workspace_wallets`.
//!
//! After the access check, the route calls the private RPC
//! `get_wallet_interest_summary` and returns the result JSON directly.
//!
//! # Behavior gaps vs. legacy
//!
//! - POST (enable interest tracking) is not ported; this handler returns `None`
//!   for every non-GET method so the Next.js route still handles it.
//! - The `BackendRequest` type does not surface an `API_KEY` header path, but
//!   the interest GET route does not use one — no gap there.
//! - The legacy route does not set explicit cache headers (no `no-store`);
//!   however this handler follows the crate convention and wraps with
//!   `no_store_response` to prevent accidental caching of sensitive financial
//!   data, matching the behavior of every other finance handler in this crate.

use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const INTEREST_PATH_PREFIX: &str = "/api/workspaces/";
const INTEREST_PATH_INFIX: &str = "/wallets/";
const INTEREST_PATH_SUFFIX: &str = "/interest";

const GET_WALLET_INTEREST_SUMMARY_RPC: &str = "get_wallet_interest_summary";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";

const INTEREST_SUMMARY_ERROR_MESSAGE: &str = "Error fetching interest summary";
const WALLET_NOT_FOUND_MESSAGE: &str = "Wallet not found";
const WALLET_ACCESS_ERROR_MESSAGE: &str = "Error fetching wallet access";
const WORKSPACE_WALLETS_ERROR_MESSAGE: &str = "Error fetching workspace wallets";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";

#[derive(Serialize)]
struct InterestSummaryRpcRequest<'a> {
    _actor_id: &'a str,
    _wallet_id: &'a str,
    _ws_id: &'a str,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_wsid_wallets_walletid_interest_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, wallet_id) = interest_path_segments(request.path)?;

    Some(match request.method {
        "GET" => interest_response(config, request, ws_id, wallet_id, outbound).await,
        _ => return None,
    })
}

async fn interest_response(
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
        Ok(authorization) => authorization,
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

    // Wallet access gate: callers lacking manage_finance only see wallets
    // whitelisted to one of their workspace roles.
    match ensure_wallet_access(&config.contact_data, outbound, &authorization, wallet_id).await {
        WalletAccess::Allowed => {}
        WalletAccess::NotFound => return message_response(404, WALLET_NOT_FOUND_MESSAGE),
        WalletAccess::AccessError => return message_response(500, WALLET_ACCESS_ERROR_MESSAGE),
    }

    // Wallet existence check in private.workspace_wallets.
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

    match fetch_interest_summary(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        wallet_id,
        &authorization.user_id,
    )
    .await
    {
        Ok(summary) => no_store_response(json_response(200, summary)),
        Err(InterestSummaryError::WalletNotFound) => {
            message_response(404, WALLET_NOT_FOUND_MESSAGE)
        }
        Err(InterestSummaryError::Internal) => {
            message_response(500, INTEREST_SUMMARY_ERROR_MESSAGE)
        }
    }
}

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
    let has_manage_finance = match has_workspace_permission(
        contact_data,
        outbound,
        &authorization.ws_id,
        MANAGE_FINANCE_PERMISSION,
        &authorization.user_id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return WalletAccess::AccessError,
    };

    if has_manage_finance {
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

#[derive(serde::Deserialize)]
struct RoleMembershipRow {
    role_id: Option<String>,
}

async fn fetch_role_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            ("select", "role_id, workspace_roles!inner(ws_id)".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RoleMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.role_id)
        .collect())
}

async fn wallet_in_whitelist(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    role_ids: &[String],
) -> Result<bool, ()> {
    let role_filter = format!("({})", role_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            ("select", "wallet_id".to_owned()),
            ("wallet_id", format!("eq.{wallet_id}")),
            ("role_id", format!("in.{role_filter}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
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
    let Some(url) = contact_data.rest_url(
        "workspace_wallets",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{wallet_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(!response.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

enum InterestSummaryError {
    WalletNotFound,
    Internal,
}

async fn fetch_interest_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    wallet_id: &str,
    actor_id: &str,
) -> Result<Value, InterestSummaryError> {
    let rpc_url = contact_data
        .rpc_url(GET_WALLET_INTEREST_SUMMARY_RPC)
        .ok_or(InterestSummaryError::Internal)?;
    let service_role_key = contact_data
        .service_role_key()
        .ok_or(InterestSummaryError::Internal)?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&InterestSummaryRpcRequest {
        _actor_id: actor_id,
        _wallet_id: wallet_id,
        _ws_id: ws_id,
    })
    .map_err(|_| InterestSummaryError::Internal)?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| InterestSummaryError::Internal)?;

    if !is_success_status(response.status) {
        return Err(InterestSummaryError::Internal);
    }

    // The private RPC returns a single jsonb value. PostgREST emits it
    // directly (not wrapped in an array).
    let value = response
        .json::<Value>()
        .map_err(|_| InterestSummaryError::Internal)?;

    // Legacy: if payload?.error === 'wallet_not_found' -> 404.
    // Any other payload.error -> 500.
    if let Some(error_field) = value.get("error").and_then(|v| v.as_str()) {
        if error_field == "wallet_not_found" {
            return Err(InterestSummaryError::WalletNotFound);
        }
        return Err(InterestSummaryError::Internal);
    }

    Ok(value)
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
    let authorization = format!("Bearer {service_role_key}");
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
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn interest_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(INTEREST_PATH_PREFIX)?;
    let rest = rest.strip_suffix(INTEREST_PATH_SUFFIX)?;
    let (ws_id, wallet_id) = rest.split_once(INTEREST_PATH_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || wallet_id.is_empty() || wallet_id.contains('/') {
        return None;
    }

    Some((ws_id, wallet_id))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::interest_path_segments;

    #[test]
    fn path_matches_valid_route() {
        let (ws, wallet) =
            interest_path_segments("/api/workspaces/ws-abc/wallets/wlt-123/interest")
                .expect("should match");
        assert_eq!(ws, "ws-abc");
        assert_eq!(wallet, "wlt-123");
    }

    #[test]
    fn path_rejects_wrong_suffix() {
        assert!(
            interest_path_segments("/api/workspaces/ws-abc/wallets/wlt-123/credit-summary")
                .is_none()
        );
    }

    #[test]
    fn path_rejects_extra_segments() {
        assert!(
            interest_path_segments("/api/workspaces/ws-abc/wallets/wlt-123/interest/extra")
                .is_none()
        );
    }

    #[test]
    fn path_rejects_empty_ws_id() {
        assert!(interest_path_segments("/api/workspaces//wallets/wlt-123/interest").is_none());
    }

    #[test]
    fn path_rejects_empty_wallet_id() {
        assert!(interest_path_segments("/api/workspaces/ws-abc/wallets//interest").is_none());
    }

    #[test]
    fn path_rejects_wrong_prefix() {
        assert!(
            interest_path_segments("/api/v1/workspaces/ws-abc/wallets/wlt-123/interest").is_none()
        );
    }

    #[test]
    fn path_accepts_uuid_segments() {
        let uuid_ws = "550e8400-e29b-41d4-a716-446655440000";
        let uuid_wallet = "660e8400-e29b-41d4-a716-446655440001";
        let path = format!("/api/workspaces/{uuid_ws}/wallets/{uuid_wallet}/interest");
        let (ws, wallet) = interest_path_segments(&path).expect("should match");
        assert_eq!(ws, uuid_ws);
        assert_eq!(wallet, uuid_wallet);
    }
}
