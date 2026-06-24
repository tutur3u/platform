use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const CREDIT_SUMMARY_PATH_PREFIX: &str = "/api/workspaces/";
const CREDIT_SUMMARY_PATH_INFIX: &str = "/wallets/";
const CREDIT_SUMMARY_PATH_SUFFIX: &str = "/credit-summary";
const GET_CREDIT_WALLET_SUMMARY_RPC: &str = "get_credit_wallet_summary";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";

const CREDIT_SUMMARY_ERROR_MESSAGE: &str = "Error fetching credit wallet summary";
const NOT_CREDIT_WALLET_MESSAGE: &str = "Not a credit wallet";
const WALLET_NOT_FOUND_MESSAGE: &str = "Wallet not found";
const WALLET_ACCESS_ERROR_MESSAGE: &str = "Error fetching wallet access";
const WORKSPACE_WALLETS_ERROR_MESSAGE: &str = "Error fetching workspace wallets";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";

#[derive(Serialize)]
struct CreditWalletSummaryRpcRequest<'a> {
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

#[derive(Deserialize)]
struct RoleMembershipRow {
    role_id: Option<String>,
}

pub(crate) async fn handle_workspaces_wallets_walletid_credit_summary_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, wallet_id) = credit_summary_path_segments(request.path)?;

    Some(match request.method {
        "GET" => credit_summary_response(config, request, ws_id, wallet_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn credit_summary_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    wallet_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirrors getAccessibleWallet({ requiredPermission: 'view_transactions',
    // select: 'id' }) followed by the private.get_credit_wallet_summary RPC.
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

    // getAccessibleWallet whitelist gate: callers lacking manage_finance only
    // see wallets explicitly whitelisted to one of their workspace roles.
    match ensure_wallet_access(&config.contact_data, outbound, &authorization, wallet_id).await {
        WalletAccess::Allowed => {}
        WalletAccess::NotFound => return message_response(404, WALLET_NOT_FOUND_MESSAGE),
        WalletAccess::AccessError => return message_response(500, WALLET_ACCESS_ERROR_MESSAGE),
    }

    // private.workspace_wallets existence check (select 'id', maybeSingle()).
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

    match fetch_credit_summary(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        wallet_id,
        &authorization.user_id,
    )
    .await
    {
        Ok(Some(summary)) => no_store_response(json_response(200, summary)),
        Ok(None) => message_response(400, NOT_CREDIT_WALLET_MESSAGE),
        Err(()) => message_response(500, CREDIT_SUMMARY_ERROR_MESSAGE),
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
        Ok(role_ids) => role_ids,
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

async fn fetch_credit_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    wallet_id: &str,
    actor_id: &str,
) -> Result<Option<Value>, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_CREDIT_WALLET_SUMMARY_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&CreditWalletSummaryRpcRequest {
        _actor_id: actor_id,
        _wallet_id: wallet_id,
        _ws_id: ws_id,
    })
    .map_err(|_| ())?;
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
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    // The function returns a single jsonb value (or NULL), so PostgREST emits
    // the value directly rather than wrapping it in an array.
    let value = response.json::<Value>().map_err(|_| ())?;

    if value.is_null() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    // File-local copy of finance_auth::has_workspace_permission (a private fn
    // in that module) so this handler does not need to edit shared files.
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

fn credit_summary_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(CREDIT_SUMMARY_PATH_PREFIX)?;
    let rest = rest.strip_suffix(CREDIT_SUMMARY_PATH_SUFFIX)?;
    let (ws_id, wallet_id) = rest.split_once(CREDIT_SUMMARY_PATH_INFIX)?;

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
