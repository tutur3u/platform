use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const WALLET_PATH_PREFIX: &str = "/api/workspaces/";
const WALLET_PATH_INFIX: &str = "/wallets/";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const WALLET_AUDIT_STATUS_RPC: &str = "get_wallet_checkpoint_audit_status";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";

const WALLET_NOT_FOUND_MESSAGE: &str = "Wallet not found";
const WALLET_ACCESS_ERROR_MESSAGE: &str = "Error fetching wallet access";
const WORKSPACE_WALLETS_ERROR_MESSAGE: &str = "Error fetching workspace wallets";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct WalletAuditStatusRequest<'a> {
    _wallet_ids: [&'a str; 1],
}

#[derive(Deserialize)]
struct RoleMembershipRow {
    role_id: Option<String>,
}

#[derive(Deserialize)]
struct WhitelistRow {
    #[serde(default)]
    wallet_id: Option<String>,
}

#[derive(Deserialize)]
struct CreditWalletRow {
    #[serde(default)]
    limit: Option<Value>,
    #[serde(default)]
    statement_date: Option<Value>,
    #[serde(default)]
    payment_date: Option<Value>,
}

#[derive(Deserialize)]
struct WalletAuditStatusRow {
    #[serde(default)]
    wallet_id: Option<String>,
    #[serde(default)]
    audited_balance: Option<Value>,
    #[serde(default)]
    latest_actual_balance: Option<Value>,
    #[serde(default)]
    latest_checked_at: Option<Value>,
    #[serde(default)]
    latest_checkpoint_id: Option<Value>,
    #[serde(default)]
    ledger_balance: Option<Value>,
    #[serde(default)]
    post_checkpoint_delta: Option<Value>,
    #[serde(default)]
    post_checkpoint_transaction_count: Option<Value>,
    #[serde(default)]
    status: Option<Value>,
    #[serde(default)]
    variance: Option<Value>,
}

pub(crate) async fn handle_workspaces_wallets_walletid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, wallet_id) = wallet_path_segments(request.path)?;

    Some(match request.method {
        "GET" => wallet_response(config, request, ws_id, wallet_id, outbound).await,
        // Other methods (PUT/DELETE) are not migrated yet; return None so the
        // Cloudflare worker falls through to the still-active Next.js route.
        _ => return None,
    })
}

async fn wallet_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    wallet_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirrors getAccessibleWallet({ requiredPermission: 'view_transactions',
    // select: '*, credit_wallets(limit, statement_date, payment_date)' })
    // followed by flattenWalletCreditData + attachWalletAuditData.
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

    // private.workspace_wallets row (select '*', maybeSingle()).
    let mut wallet = match fetch_wallet(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        wallet_id,
    )
    .await
    {
        Ok(Some(wallet)) => wallet,
        Ok(None) => return message_response(404, WALLET_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, WORKSPACE_WALLETS_ERROR_MESSAGE),
    };

    // flattenWalletCreditData: merge credit_wallets(limit, statement_date,
    // payment_date) onto the wallet when a credit row exists.
    if let Ok(Some(credit)) = fetch_credit_wallet(&config.contact_data, outbound, wallet_id).await {
        if let Some(limit) = credit.limit {
            wallet.insert("limit".to_owned(), limit);
        }
        if let Some(statement_date) = credit.statement_date {
            wallet.insert("statement_date".to_owned(), statement_date);
        }
        if let Some(payment_date) = credit.payment_date {
            wallet.insert("payment_date".to_owned(), payment_date);
        }
    }

    // attachWalletAuditData: best-effort. On any error / missing storage /
    // absent status the legacy route returns the (flattened) wallet unchanged.
    if let Ok(Some(status)) =
        fetch_wallet_audit_status(&config.contact_data, outbound, wallet_id).await
    {
        attach_audit_fields(&mut wallet, status);
    }

    no_store_response(json_response(200, Value::Object(wallet)))
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

    Ok(!response
        .json::<Vec<WhitelistRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn fetch_wallet(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    wallet_id: &str,
) -> Result<Option<Map<String, Value>>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_wallets",
        &[
            ("select", "*".to_owned()),
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

    Ok(response
        .json::<Vec<Map<String, Value>>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_credit_wallet(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
) -> Result<Option<CreditWalletRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "credit_wallets",
        &[
            (
                "select",
                "wallet_id, limit, statement_date, payment_date".to_owned(),
            ),
            ("wallet_id", format!("eq.{wallet_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CreditWalletRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_wallet_audit_status(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
) -> Result<Option<WalletAuditStatusRow>, ()> {
    let rpc_url = contact_data.rpc_url(WALLET_AUDIT_STATUS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&WalletAuditStatusRequest {
        _wallet_ids: [wallet_id],
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

    Ok(response
        .json::<Vec<WalletAuditStatusRow>>()
        .map_err(|_| ())?
        .into_iter()
        .find(|row| row.wallet_id.as_deref() == Some(wallet_id)))
}

fn attach_audit_fields(wallet: &mut Map<String, Value>, status: WalletAuditStatusRow) {
    // normalizeAuditStatus coerces numeric strings to numbers; nullable balance
    // fields stay null. status defaults to 'no_checkpoint' for unknown values.
    wallet.insert(
        "audit_actual_balance".to_owned(),
        nullable_number(status.latest_actual_balance),
    );
    wallet.insert(
        "audit_balance".to_owned(),
        number_value(status.audited_balance),
    );
    wallet.insert(
        "audit_checkpoint_id".to_owned(),
        string_or_null(status.latest_checkpoint_id),
    );
    wallet.insert(
        "audit_checked_at".to_owned(),
        string_or_null(status.latest_checked_at),
    );
    wallet.insert(
        "audit_ledger_balance".to_owned(),
        number_value(status.ledger_balance),
    );
    wallet.insert(
        "audit_post_checkpoint_delta".to_owned(),
        number_value(status.post_checkpoint_delta),
    );
    wallet.insert(
        "audit_post_checkpoint_transaction_count".to_owned(),
        number_value(status.post_checkpoint_transaction_count),
    );
    wallet.insert("audit_status".to_owned(), normalize_status(status.status));
    wallet.insert("audit_variance".to_owned(), number_value(status.variance));
}

fn normalize_status(value: Option<Value>) -> Value {
    let status = value.and_then(|value| value.as_str().map(str::to_owned));
    match status.as_deref() {
        Some("clean") | Some("no_checkpoint") | Some("unresolved") => {
            Value::String(status.unwrap())
        }
        _ => Value::String("no_checkpoint".to_owned()),
    }
}

// toCheckpointNumber: numbers pass through; numeric strings are parsed; anything
// else (including null/undefined) becomes 0.
fn number_value(value: Option<Value>) -> Value {
    json!(to_checkpoint_number(value.as_ref()))
}

// Nullable variants (latest_actual_balance) preserve SQL NULL, otherwise apply
// toCheckpointNumber.
fn nullable_number(value: Option<Value>) -> Value {
    match value {
        None | Some(Value::Null) => Value::Null,
        Some(ref inner) => json!(to_checkpoint_number(Some(inner))),
    }
}

fn string_or_null(value: Option<Value>) -> Value {
    match value {
        Some(Value::String(s)) => Value::String(s),
        _ => Value::Null,
    }
}

fn to_checkpoint_number(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(number)) => number.as_f64().filter(|n| n.is_finite()).unwrap_or(0.0),
        Some(Value::String(text)) => text.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    // File-local copy of finance_auth::has_workspace_permission (a private fn in
    // that module) so this handler does not need to edit shared files.
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

fn wallet_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WALLET_PATH_PREFIX)?;
    let (ws_id, wallet_id) = rest.split_once(WALLET_PATH_INFIX)?;

    // Reject empty/multi-segment values so this matcher only handles the base
    // /api/workspaces/:wsId/wallets/:walletId shape. Any deeper path (e.g.
    // /credit-summary, /checkpoints, /checkpoints/history) keeps a trailing '/'
    // in wallet_id and is left to its own more-specific handler.
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
