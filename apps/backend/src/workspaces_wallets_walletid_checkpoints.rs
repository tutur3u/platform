//! Handler for `GET /api/workspaces/:wsId/wallets/:walletId/checkpoints`.
//!
//! Ports the GET method of the legacy Next.js route
//! `apps/web/src/app/api/workspaces/[wsId]/wallets/[walletId]/checkpoints/route.ts`
//! (which delegates to
//! `packages/apis/src/finance/wallets/walletId/checkpoints/route.ts`).
//!
//! Legacy GET flow:
//!   1. Validate `walletId` is a UUID (400 "Invalid wallet ID" otherwise).
//!   2. `getAccessibleWallet({ requiredPermission: 'view_transactions',
//!      select: 'id,currency,balance' })`: finance auth + `view_transactions`
//!      permission, then a whitelist gate for callers lacking `manage_finance`,
//!      then a `private.workspace_wallets` existence check.
//!   3. `getAccessibleCheckpointWindowStart`: for non-`manage_finance` callers,
//!      compute a per-wallet viewing-window start (defaulting to 30 days).
//!   4. Read checkpoints from `private.workspace_wallet_checkpoints` filtered by
//!      `wallet_id` (+ optional `checked_at>=window`), ordered newest-first,
//!      limited.
//!   5. Window-filter rows, enrich each with a fresh ledger balance via the
//!      `get_wallet_ledger_balance_at` RPC, normalize.
//!   6. List intervals via `list_wallet_checkpoint_intervals`, window-filter,
//!      normalize.
//!   7. Return `{ data, intervals, latest: data[0] ?? null }`.
//!
//! "Checkpoint storage missing" errors on the checkpoint table query degrade to
//! `{ data: [], intervals: [], latest: null }` with a 200, exactly like legacy.
//!
//! Only the GET method is migrated. Every other method returns `None` so the
//! Cloudflare worker falls through to the still-active Next.js POST route.
//!
//! NOTE: this module is intentionally self-contained. The viewing-window/time
//! helpers and the `has_workspace_permission` RPC helper are file-local copies
//! of logic that also lives in `workspaces_wallets_checkpoints_history.rs` and
//! (for the permission RPC) `finance_auth.rs`. They are copied rather than
//! shared because those are private to their modules and this task only writes
//! this one file.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const CHECKPOINTS_PATH_PREFIX: &str = "/api/workspaces/";
const CHECKPOINTS_PATH_INFIX: &str = "/wallets/";
const CHECKPOINTS_PATH_SUFFIX: &str = "/checkpoints";
const PRIVATE_SCHEMA: &str = "private";

const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const GET_WALLET_LEDGER_BALANCE_AT_RPC: &str = "get_wallet_ledger_balance_at";
const LIST_WALLET_CHECKPOINT_INTERVALS_RPC: &str = "list_wallet_checkpoint_intervals";

const WALLET_CHECKPOINT_SELECT: &str = "id,wallet_id,checked_at,actual_balance,ledger_balance,currency,note,created_by,created_at,updated_at";

const INVALID_WALLET_ID_MESSAGE: &str = "Invalid wallet ID";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const WALLET_NOT_FOUND_MESSAGE: &str = "Wallet not found";
const WALLET_ACCESS_ERROR_MESSAGE: &str = "Error fetching wallet access";
const WORKSPACE_WALLETS_ERROR_MESSAGE: &str = "Error fetching workspace wallets";
const ERROR_FETCHING_CHECKPOINTS_MESSAGE: &str = "Error fetching wallet checkpoints";
const ERROR_CALCULATING_BALANCES_MESSAGE: &str = "Error calculating wallet checkpoint balances";

const DEFAULT_VIEWING_WINDOW_DAYS: i64 = 30;

// ---------------------------------------------------------------------------
// Row decoding types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RoleMemberRow {
    role_id: Option<String>,
}

#[derive(Deserialize)]
struct WhitelistWindowRow {
    #[serde(default)]
    wallet_id: Option<String>,
    #[serde(default)]
    viewing_window: Option<String>,
    #[serde(default)]
    custom_days: Option<i64>,
}

#[derive(Deserialize)]
struct CheckpointRow {
    id: String,
    wallet_id: String,
    checked_at: String,
    actual_balance: Option<Value>,
    ledger_balance: Option<Value>,
    currency: Option<String>,
    note: Option<String>,
    created_by: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct IntervalRow {
    actual_delta: Option<Value>,
    end_actual_balance: Option<Value>,
    end_checked_at: String,
    end_checkpoint_id: String,
    interval_variance: Option<Value>,
    ledger_delta: Option<Value>,
    start_actual_balance: Option<Value>,
    start_checked_at: String,
    start_checkpoint_id: String,
    transaction_count: Option<Value>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wallets_walletid_checkpoints_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, wallet_id) = checkpoints_path_segments(request.path)?;

    // Only GET is migrated; every other method falls through to the still-active
    // Next.js route (POST and friends), so we must return None for them.
    Some(match request.method {
        "GET" => checkpoints_response(config, request, ws_id, wallet_id, outbound).await,
        _ => return None,
    })
}

async fn checkpoints_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    wallet_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. walletIdSchema.safeParse(walletId)
    if !is_uuid(wallet_id) {
        return message_response(400, INVALID_WALLET_ID_MESSAGE);
    }

    // 2. getAccessibleWallet (view_transactions): authenticate, normalize the
    // workspace id, and require view_transactions.
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

    let contact_data = &config.contact_data;

    // manage_finance unlocks every wallet + disables the viewing window.
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
        Err(()) => return message_response(500, WALLET_ACCESS_ERROR_MESSAGE),
    };

    // For non-manage_finance callers, the role ids drive both the whitelist gate
    // and the viewing-window computation, so resolve them once.
    let role_ids = if has_manage_finance {
        None
    } else {
        match fetch_role_ids(
            contact_data,
            outbound,
            &authorization.ws_id,
            &authorization.user_id,
        )
        .await
        {
            Ok(role_ids) => Some(role_ids),
            Err(()) => return message_response(500, WALLET_ACCESS_ERROR_MESSAGE),
        }
    };

    // getAccessibleWallet whitelist gate: callers lacking manage_finance only see
    // wallets explicitly whitelisted to one of their workspace roles.
    if let Some(role_ids) = role_ids.as_deref() {
        if role_ids.is_empty() {
            return message_response(404, WALLET_NOT_FOUND_MESSAGE);
        }

        match wallet_in_whitelist(contact_data, outbound, wallet_id, role_ids).await {
            Ok(true) => {}
            Ok(false) => return message_response(404, WALLET_NOT_FOUND_MESSAGE),
            Err(()) => return message_response(500, WALLET_ACCESS_ERROR_MESSAGE),
        }
    }

    // private.workspace_wallets existence check (select 'id,currency,balance',
    // maybeSingle()). The legacy route selects currency/balance too but the GET
    // body never reads them, so an id existence check is sufficient.
    match wallet_exists(contact_data, outbound, &authorization.ws_id, wallet_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, WALLET_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, WORKSPACE_WALLETS_ERROR_MESSAGE),
    }

    // 3. getAccessibleCheckpointWindowStart.
    let window_start = match accessible_checkpoint_window_start(
        contact_data,
        outbound,
        wallet_id,
        has_manage_finance,
        role_ids.as_deref(),
    )
    .await
    {
        Ok(window_start) => window_start,
        Err(()) => return message_response(500, ERROR_FETCHING_CHECKPOINTS_MESSAGE),
    };

    // windowStartsByWalletId = window_start ? { [walletId]: window_start } : {}
    let mut window_starts_by_wallet_id: HashMap<String, String> = HashMap::new();
    if let Some(window_start) = window_start.as_ref() {
        window_starts_by_wallet_id.insert(wallet_id.to_owned(), window_start.clone());
    }

    // 4. Read checkpoints from private.workspace_wallet_checkpoints.
    let limit = checkpoint_limit(request.url);
    let checkpoint_rows = match fetch_checkpoint_rows(
        contact_data,
        outbound,
        wallet_id,
        window_start.as_deref(),
        limit,
    )
    .await
    {
        Ok(rows) => rows,
        // Storage missing -> empty 200 payload.
        Err(CheckpointFetchError::StorageMissing) => {
            return no_store_response(json_response(200, empty_payload()));
        }
        Err(CheckpointFetchError::Failed) => {
            return message_response(500, ERROR_FETCHING_CHECKPOINTS_MESSAGE);
        }
    };

    // 5-7. Build the response (per-row ledger RPC + intervals).
    match build_payload(
        contact_data,
        outbound,
        wallet_id,
        checkpoint_rows,
        &window_starts_by_wallet_id,
        limit,
    )
    .await
    {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(BuildError::Internal) => message_response(500, ERROR_CALCULATING_BALANCES_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Response building (steps 5-7)
// ---------------------------------------------------------------------------

enum BuildError {
    /// Any other failure -> 500 "Error calculating wallet checkpoint balances".
    Internal,
}

async fn build_payload(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    checkpoint_rows: Vec<CheckpointRow>,
    window_starts_by_wallet_id: &HashMap<String, String>,
    limit: i64,
) -> Result<Value, BuildError> {
    // filterCheckpointRowsByWindow
    let checkpoint_rows =
        filter_checkpoint_rows_by_window(checkpoint_rows, window_starts_by_wallet_id);

    // Enrich each checkpoint with a fresh ledger balance (per-row RPC).
    let mut checkpoints: Vec<Value> = Vec::with_capacity(checkpoint_rows.len());
    for row in &checkpoint_rows {
        let current_ledger = ledger_balance_for_read(
            contact_data,
            outbound,
            wallet_id,
            &row.checked_at,
            to_number(&row.ledger_balance),
        )
        .await?;
        checkpoints.push(normalize_checkpoint_value(row, current_ledger));
    }

    // listCheckpointIntervals + filterCheckpointIntervalsByWindow
    let interval_rows = list_checkpoint_intervals(contact_data, outbound, wallet_id, limit).await?;
    let intervals: Vec<Value> = interval_rows
        .into_iter()
        .filter(|interval| interval_visible(interval, wallet_id, window_starts_by_wallet_id))
        .map(|interval| interval_value(&interval))
        .collect();

    let latest = checkpoints.first().cloned().unwrap_or(Value::Null);

    Ok(json!({
        "data": checkpoints,
        "intervals": intervals,
        "latest": latest,
    }))
}

// ---------------------------------------------------------------------------
// Wallet access gate (getAccessibleWallet)
// ---------------------------------------------------------------------------

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
    let response = service_role_get(contact_data, outbound, &url, false).await?;

    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RoleMemberRow>>()
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
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            ("select", "wallet_id".to_owned()),
            ("wallet_id", format!("eq.{wallet_id}")),
            ("role_id", format!("in.({})", role_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;

    if !is_success(response.status) {
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
    // private schema read.
    let response = service_role_get(contact_data, outbound, &url, true).await?;

    if !is_success(response.status) {
        return Err(());
    }

    Ok(!response.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

// ---------------------------------------------------------------------------
// Viewing-window start (getAccessibleCheckpointWindowStart)
// ---------------------------------------------------------------------------

async fn accessible_checkpoint_window_start(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    has_manage_finance: bool,
    role_ids: Option<&[String]>,
) -> Result<Option<String>, ()> {
    if has_manage_finance {
        return Ok(None);
    }

    // role_ids is always Some(..) here for non-manage_finance callers, but guard
    // defensively.
    let role_ids = role_ids.unwrap_or(&[]);

    // roleIds.length === 0 -> default window.
    if role_ids.is_empty() {
        return Ok(Some(checkpoint_window_start(DEFAULT_VIEWING_WINDOW_DAYS)));
    }

    let whitelist_rows = whitelist_window_rows(contact_data, outbound, wallet_id, role_ids).await?;
    let window_starts = build_checkpoint_window_starts(&whitelist_rows);

    Ok(Some(window_starts.get(wallet_id).cloned().unwrap_or_else(
        || checkpoint_window_start(DEFAULT_VIEWING_WINDOW_DAYS),
    )))
}

async fn whitelist_window_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    role_ids: &[String],
) -> Result<Vec<WhitelistWindowRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            (
                "select",
                "wallet_id, viewing_window, custom_days".to_owned(),
            ),
            ("wallet_id", format!("eq.{wallet_id}")),
            ("role_id", format!("in.({})", role_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<WhitelistWindowRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Checkpoint rows (private.workspace_wallet_checkpoints)
// ---------------------------------------------------------------------------

enum CheckpointFetchError {
    StorageMissing,
    Failed,
}

async fn fetch_checkpoint_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    window_start: Option<&str>,
    limit: i64,
) -> Result<Vec<CheckpointRow>, CheckpointFetchError> {
    let mut params = vec![
        ("select", WALLET_CHECKPOINT_SELECT.to_owned()),
        ("wallet_id", format!("eq.{wallet_id}")),
        // .order('checked_at', desc).order('created_at', desc)
        ("order", "checked_at.desc,created_at.desc".to_owned()),
        ("limit", limit.to_string()),
    ];
    if let Some(window_start) = window_start {
        params.push(("checked_at", format!("gte.{window_start}")));
    }

    let Some(url) = contact_data.rest_url("workspace_wallet_checkpoints", &params) else {
        return Err(CheckpointFetchError::Failed);
    };
    let response = service_role_get(contact_data, outbound, &url, true)
        .await
        .map_err(|_| CheckpointFetchError::Failed)?;

    if !is_success(response.status) {
        if response_is_storage_missing(&response) {
            return Err(CheckpointFetchError::StorageMissing);
        }
        return Err(CheckpointFetchError::Failed);
    }

    response
        .json::<Vec<CheckpointRow>>()
        .map_err(|_| CheckpointFetchError::Failed)
}

fn normalize_checkpoint_value(row: &CheckpointRow, current_ledger_balance: f64) -> Value {
    let actual_balance = to_number(&row.actual_balance);
    let ledger_balance = to_number(&row.ledger_balance);

    json!({
        "actual_balance": actual_balance,
        "checked_at": row.checked_at,
        "created_at": row.created_at,
        "created_by": row.created_by,
        "currency": row.currency.clone().unwrap_or_default(),
        "current_ledger_balance": current_ledger_balance,
        "current_variance": actual_balance - current_ledger_balance,
        "id": row.id,
        "ledger_balance": ledger_balance,
        "note": row.note,
        "original_variance": actual_balance - ledger_balance,
        "updated_at": row.updated_at,
        "wallet_id": row.wallet_id,
    })
}

// ---------------------------------------------------------------------------
// Ledger balance RPC (get_wallet_ledger_balance_at)
// ---------------------------------------------------------------------------

async fn ledger_balance_for_read(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    checked_at: &str,
    fallback_ledger_balance: f64,
) -> Result<f64, BuildError> {
    let mut body = Map::new();
    body.insert(
        "_checked_at".to_owned(),
        Value::String(checked_at.to_owned()),
    );
    body.insert("_wallet_id".to_owned(), Value::String(wallet_id.to_owned()));

    let response = private_rpc(
        contact_data,
        outbound,
        GET_WALLET_LEDGER_BALANCE_AT_RPC,
        &Value::Object(body),
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    if is_success(response.status) {
        let value = response.json::<Value>().map_err(|_| BuildError::Internal)?;
        Ok(value_to_number(&value).unwrap_or(0.0))
    } else if response_is_storage_missing(&response) {
        // getLedgerBalanceForCheckpointRead: storage missing -> fallback to the
        // checkpoint row's own ledger balance.
        Ok(fallback_ledger_balance)
    } else {
        Err(BuildError::Internal)
    }
}

// ---------------------------------------------------------------------------
// Interval RPC (list_wallet_checkpoint_intervals)
// ---------------------------------------------------------------------------

async fn list_checkpoint_intervals(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    limit: i64,
) -> Result<Vec<IntervalRow>, BuildError> {
    let mut body = Map::new();
    body.insert("_limit".to_owned(), Value::from(limit));
    body.insert("_wallet_id".to_owned(), Value::String(wallet_id.to_owned()));

    let response = private_rpc(
        contact_data,
        outbound,
        LIST_WALLET_CHECKPOINT_INTERVALS_RPC,
        &Value::Object(body),
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    if !is_success(response.status) {
        // listCheckpointIntervals swallows storage-missing errors -> [].
        if response_is_storage_missing(&response) {
            return Ok(Vec::new());
        }
        return Err(BuildError::Internal);
    }

    response
        .json::<Vec<IntervalRow>>()
        .map_err(|_| BuildError::Internal)
}

fn interval_value(row: &IntervalRow) -> Value {
    let variance = to_number(&row.interval_variance);
    json!({
        "actual_delta": to_number(&row.actual_delta),
        "end_actual_balance": to_number(&row.end_actual_balance),
        "end_checked_at": row.end_checked_at,
        "end_checkpoint_id": row.end_checkpoint_id,
        "interval_variance": variance,
        "is_clean": variance == 0.0,
        "ledger_delta": to_number(&row.ledger_delta),
        "start_actual_balance": to_number(&row.start_actual_balance),
        "start_checked_at": row.start_checked_at,
        "start_checkpoint_id": row.start_checkpoint_id,
        "transaction_count": to_number(&row.transaction_count),
    })
}

// ---------------------------------------------------------------------------
// Permission RPC (has_workspace_permission); file-local copy of finance_auth's
// private helper since it is not exported.
// ---------------------------------------------------------------------------

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
    let body = json!({
        "p_permission": permission,
        "p_user_id": user_id,
        "p_ws_id": ws_id,
    })
    .to_string();
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

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

async fn private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &Value,
) -> Result<OutboundResponse, ()> {
    let rpc_url = contact_data.rpc_url(function).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body_text = serde_json::to_string(body).map_err(|_| ())?;

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body_text),
        )
        .await
        .map_err(|_| ())
}

/// Heuristic equivalent of `isCheckpointStorageMissing`: a non-2xx response
/// whose body mentions checkpoint storage objects + a "missing" indicator.
fn response_is_storage_missing(response: &OutboundResponse) -> bool {
    let Ok(value) = response.json::<Value>() else {
        return false;
    };
    let text = error_text(&value).to_lowercase();

    let mentions = text.contains("workspace_wallet_checkpoints")
        || text.contains("wallet_checkpoint")
        || text.contains("get_wallet_ledger_balance_at")
        || text.contains("list_wallet_checkpoint_intervals")
        || text.contains("create_workspace_wallet_checkpoints_batch")
        || text.contains("get_wallet_checkpoint_audit_status")
        || text.contains("create_wallet_checkpoint_reconciliation");

    if !mentions {
        return false;
    }

    let code = value.get("code").and_then(Value::as_str).unwrap_or("");
    if matches!(code, "42P01" | "42883" | "PGRST202" | "PGRST205") {
        return true;
    }

    text.contains("does not exist")
        || text.contains("could not find")
        || text.contains("schema cache")
}

fn error_text(value: &Value) -> String {
    ["message", "details", "hint"]
        .iter()
        .filter_map(|key| value.get(*key).and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------------------------------
// Window helpers (checkpoints/access.ts)
// ---------------------------------------------------------------------------

fn viewing_window_days(viewing_window: Option<&str>, custom_days: Option<i64>) -> i64 {
    match viewing_window {
        Some("custom") => match custom_days {
            Some(days) if days >= 1 => days,
            _ => DEFAULT_VIEWING_WINDOW_DAYS,
        },
        Some("1_day") => 1,
        Some("3_days") => 3,
        Some("7_days") => 7,
        Some("2_weeks") => 14,
        Some("1_month") => 30,
        Some("1_quarter") => 90,
        Some("1_year") => 365,
        Some(_) => DEFAULT_VIEWING_WINDOW_DAYS,
        None => DEFAULT_VIEWING_WINDOW_DAYS,
    }
}

/// `now - days` as a millisecond-precision ISO-8601 UTC string, matching JS
/// `new Date(...).toISOString()`.
fn checkpoint_window_start(days: i64) -> String {
    let now_ms = now_unix_millis();
    let start_ms = now_ms - days * 24 * 60 * 60 * 1000;
    iso8601_from_millis(start_ms)
}

fn build_checkpoint_window_starts(rows: &[WhitelistWindowRow]) -> HashMap<String, String> {
    // For each wallet pick the widest (largest days) window.
    let mut widest: HashMap<String, i64> = HashMap::new();
    for row in rows {
        let Some(wallet_id) = row.wallet_id.as_ref() else {
            continue;
        };
        let days = viewing_window_days(row.viewing_window.as_deref(), row.custom_days);
        let entry = widest.entry(wallet_id.clone()).or_insert(days);
        if days > *entry {
            *entry = days;
        }
    }

    widest
        .into_iter()
        .map(|(wallet_id, days)| (wallet_id, checkpoint_window_start(days)))
        .collect()
}

fn is_at_or_after_window_start(checked_at: &str, window_start: &str) -> bool {
    match (parse_iso_millis(checked_at), parse_iso_millis(window_start)) {
        (Some(checked), Some(window)) => checked >= window,
        _ => false,
    }
}

fn checkpoint_visible_for_wallet(
    checked_at: &str,
    wallet_id: &str,
    window_starts: &HashMap<String, String>,
) -> bool {
    match window_starts.get(wallet_id) {
        None => true,
        Some(window_start) => is_at_or_after_window_start(checked_at, window_start),
    }
}

fn filter_checkpoint_rows_by_window(
    rows: Vec<CheckpointRow>,
    window_starts: &HashMap<String, String>,
) -> Vec<CheckpointRow> {
    if window_starts.is_empty() {
        return rows;
    }
    rows.into_iter()
        .filter(|row| checkpoint_visible_for_wallet(&row.checked_at, &row.wallet_id, window_starts))
        .collect()
}

fn interval_visible(
    interval: &IntervalRow,
    wallet_id: &str,
    window_starts: &HashMap<String, String>,
) -> bool {
    let Some(window_start) = window_starts.get(wallet_id) else {
        return true;
    };
    is_at_or_after_window_start(&interval.start_checked_at, window_start)
        && is_at_or_after_window_start(&interval.end_checked_at, window_start)
}

// ---------------------------------------------------------------------------
// Number coercion (toCheckpointNumber)
// ---------------------------------------------------------------------------

fn to_number(value: &Option<Value>) -> f64 {
    value.as_ref().and_then(value_to_number).unwrap_or(0.0)
}

fn value_to_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64().filter(|n| n.is_finite()),
        Value::String(s) => s.trim().parse::<f64>().ok().filter(|n| n.is_finite()),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Limit parsing (getCheckpointLimit)
// ---------------------------------------------------------------------------

fn checkpoint_limit(url: Option<&str>) -> i64 {
    let parsed = url
        .and_then(|url| url::Url::parse(url).ok())
        .and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "limit")
                .map(|(_, value)| value.into_owned())
        })
        .and_then(|raw| raw.trim().parse::<i64>().ok());

    match parsed {
        Some(value) => value.clamp(1, 100),
        None => 25,
    }
}

// ---------------------------------------------------------------------------
// Time helpers (ISO-8601 millis)
// ---------------------------------------------------------------------------

fn now_unix_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Format a UTC millisecond timestamp as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
fn iso8601_from_millis(millis: i64) -> String {
    let total_secs = millis.div_euclid(1000);
    let millis_part = millis.rem_euclid(1000);

    let days = total_secs.div_euclid(86_400);
    let secs_of_day = total_secs.rem_euclid(86_400);

    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis_part:03}Z")
}

/// Parse an ISO-8601 timestamp into UTC millis. Supports the
/// `YYYY-MM-DDTHH:MM:SS(.sss)?(Z|+hh:mm)?` shapes Supabase emits. Returns None
/// on anything unparseable (mirrors `Number.isFinite(Date.parse(...))`).
fn parse_iso_millis(input: &str) -> Option<i64> {
    let bytes = input.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i64 = input.get(0..4)?.parse().ok()?;
    if bytes.get(4) != Some(&b'-') {
        return None;
    }
    let month: i64 = input.get(5..7)?.parse().ok()?;
    if bytes.get(7) != Some(&b'-') {
        return None;
    }
    let day: i64 = input.get(8..10)?.parse().ok()?;
    let sep = bytes.get(10)?;
    if *sep != b'T' && *sep != b' ' {
        return None;
    }
    let hour: i64 = input.get(11..13)?.parse().ok()?;
    if bytes.get(13) != Some(&b':') {
        return None;
    }
    let minute: i64 = input.get(14..16)?.parse().ok()?;
    if bytes.get(16) != Some(&b':') {
        return None;
    }
    let second: i64 = input.get(17..19)?.parse().ok()?;

    // Optional fractional seconds.
    let mut idx = 19;
    let mut millis_part: i64 = 0;
    if bytes.get(idx) == Some(&b'.') {
        idx += 1;
        let mut frac = String::new();
        while let Some(&b) = bytes.get(idx) {
            if b.is_ascii_digit() {
                frac.push(b as char);
                idx += 1;
            } else {
                break;
            }
        }
        // Use the first 3 fractional digits as milliseconds.
        let mut frac3 = frac.chars().take(3).collect::<String>();
        while frac3.len() < 3 {
            frac3.push('0');
        }
        millis_part = frac3.parse().unwrap_or(0);
    }

    // Optional timezone offset.
    let mut offset_minutes: i64 = 0;
    match bytes.get(idx) {
        None | Some(b'Z') => {}
        Some(&sign @ (b'+' | b'-')) => {
            let off_h: i64 = input.get(idx + 1..idx + 3)?.parse().ok()?;
            // Accept "+hh:mm" or "+hhmm".
            let off_m: i64 = if bytes.get(idx + 3) == Some(&b':') {
                input.get(idx + 4..idx + 6)?.parse().ok()?
            } else {
                input
                    .get(idx + 3..idx + 5)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0)
            };
            let magnitude = off_h * 60 + off_m;
            offset_minutes = if sign == b'+' { magnitude } else { -magnitude };
        }
        _ => return None,
    }

    let days = days_from_civil(year, month, day);
    let secs = days * 86_400 + hour * 3600 + minute * 60 + second - offset_minutes * 60;
    Some(secs * 1000 + millis_part)
}

/// Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of `days_from_civil`: (year, month, day) from days since epoch.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month, day)
}

// ---------------------------------------------------------------------------
// Response payloads / path matching
// ---------------------------------------------------------------------------

fn empty_payload() -> Value {
    json!({
        "data": [],
        "intervals": [],
        "latest": Value::Null,
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Matches `/api/workspaces/:wsId/wallets/:walletId/checkpoints`, returning the
/// `(wsId, walletId)` dynamic segments. Rejects paths whose segments contain
/// `/` so sibling routes (e.g. `.../checkpoints/history`) do not match here.
fn checkpoints_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(CHECKPOINTS_PATH_PREFIX)?;
    let rest = rest.strip_suffix(CHECKPOINTS_PATH_SUFFIX)?;
    let (ws_id, wallet_id) = rest.split_once(CHECKPOINTS_PATH_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || wallet_id.is_empty() || wallet_id.contains('/') {
        return None;
    }

    Some((ws_id, wallet_id))
}

/// `walletIdSchema`: a canonical 8-4-4-4-12 hex UUID (case-insensitive).
fn is_uuid(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }
    value.chars().enumerate().all(|(index, c)| match index {
        8 | 13 | 18 | 23 => c == '-',
        _ => c.is_ascii_hexdigit(),
    })
}
