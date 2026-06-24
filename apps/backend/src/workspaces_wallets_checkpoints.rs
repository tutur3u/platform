//! Handler for `GET /api/workspaces/:wsId/wallets/checkpoints`.
//!
//! Ports the legacy Next.js route
//! `apps/web/src/app/api/workspaces/[wsId]/wallets/checkpoints/route.ts`
//! (which delegates to
//! `packages/apis/src/finance/wallets/checkpoints/route.ts`).
//!
//! ONLY the `GET` method is migrated. The legacy route also defines `POST`
//! (batch checkpoint creation). This handler returns `None` for every method
//! other than `GET`, so the Cloudflare worker falls through to the still-active
//! Next.js route for the unmigrated `POST`.
//!
//! The legacy GET flow is:
//!   1. Resolve finance auth + `view_transactions` permission for the workspace
//!      (`getWalletRouteContext`). Missing/unresolvable user -> 401; missing
//!      `view_transactions` -> 403.
//!   2. List wallets the caller can see (all wallets for `manage_finance`
//!      holders; otherwise role-whitelisted wallets, each with a viewing
//!      window) via `listAccessibleCheckpointWallets`.
//!   3. If no wallets, return an empty summary payload.
//!   4. Read checkpoints from `private.workspace_wallet_checkpoints` filtered to
//!      those wallet ids, optionally `gte` the oldest viewing-window start,
//!      ordered `checked_at desc, created_at desc` (NO limit on the collection
//!      route). Storage-missing -> degrade to wallets-only payload.
//!   5. Window-filter the rows, take the latest checkpoint per wallet, enrich
//!      each latest with a fresh ledger balance via `get_wallet_ledger_balance_at`,
//!      normalize, and aggregate per-currency totals.
//!
//! Response shape: `{ latest_checkpoints, totals_by_currency, wallets }`.
//!
//! NOTE: This module is fully self-contained. Several helpers below are
//! file-local copies of private helpers that live in `finance_auth.rs` and the
//! sibling `workspaces_wallets_checkpoints_history.rs` module (e.g.
//! `has_workspace_permission`, the viewing-window math, ISO-8601 millis
//! parsing/formatting, number coercion). They are duplicated here on purpose so
//! this migration touches exactly one file. See the task notes.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const PATH_PREFIX: &str = "/api/workspaces/";
const PATH_SUFFIX: &str = "/wallets/checkpoints";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";

const WALLET_CHECKPOINT_SELECT: &str = "id,wallet_id,checked_at,actual_balance,ledger_balance,currency,note,created_by,created_at,updated_at";

const ERROR_FETCHING_CHECKPOINTS: &str = "Error fetching wallet checkpoints";
const ERROR_FETCHING_SUMMARY: &str = "Error fetching wallet checkpoint summary";

const DEFAULT_VIEWING_WINDOW_DAYS: i64 = 30;

// ---------------------------------------------------------------------------
// Row decoding types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RoleMemberRow {
    role_id: Option<String>,
}

#[derive(Deserialize)]
struct WalletWhitelistWindowRow {
    wallet_id: Option<String>,
    viewing_window: Option<String>,
    custom_days: Option<i64>,
}

#[derive(Deserialize)]
struct SummaryWalletRow {
    id: Option<String>,
    name: Option<String>,
    currency: Option<Value>,
    balance: Option<Value>,
    #[serde(rename = "type")]
    wallet_type: Option<String>,
    icon: Option<String>,
    image_src: Option<String>,
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

// ---------------------------------------------------------------------------
// Local domain structs
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct SummaryWallet {
    id: String,
    name: Option<String>,
    currency: String,
    balance: f64,
    wallet_type: Option<String>,
    icon: Option<String>,
    image_src: Option<String>,
}

#[derive(Clone)]
struct NormalizedCheckpoint {
    actual_balance: f64,
    checked_at: String,
    created_at: String,
    created_by: Option<String>,
    currency: String,
    current_ledger_balance: f64,
    current_variance: f64,
    id: String,
    ledger_balance: f64,
    note: Option<String>,
    original_variance: f64,
    updated_at: String,
    wallet_id: String,
}

/// Result of resolving which wallets the caller can see, plus their viewing
/// windows (mirrors `listAccessibleCheckpointWallets`).
struct CheckpointWalletAccess {
    wallets: Vec<SummaryWallet>,
    window_starts_by_wallet_id: HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wallets_checkpoints_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = match_path(request.path)?;

    // Only GET is migrated. POST (and any other verb) must fall through to the
    // still-active Next.js route, so return None rather than 405.
    match request.method {
        "GET" => Some(summary_response(config, request, ws_id, outbound).await),
        _ => None,
    }
}

async fn summary_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
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
        // Legacy returns 401 Unauthorized when there is no authenticated user or
        // the workspace cannot be resolved (getFinanceRouteContext path).
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, "Unauthorized");
        }
        // Legacy returns 403 "Insufficient permissions" when view_transactions is
        // absent (getWalletRouteContext path).
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        // The route's outer try/catch maps unexpected failures to this 500.
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, ERROR_FETCHING_SUMMARY);
        }
    };

    match build_summary(config, outbound, &authorization).await {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(BuildError::Checkpoints) => message_response(500, ERROR_FETCHING_CHECKPOINTS),
        Err(BuildError::Internal) => message_response(500, ERROR_FETCHING_SUMMARY),
    }
}

enum BuildError {
    /// Checkpoint table query failed -> 500 "Error fetching wallet checkpoints".
    Checkpoints,
    /// Any other failure -> 500 "Error fetching wallet checkpoint summary".
    Internal,
}

async fn build_summary(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
) -> Result<Value, BuildError> {
    let contact_data = &config.contact_data;
    let ws_id = &authorization.ws_id;
    let user_id = &authorization.user_id;

    // manage_finance holders see every wallet; otherwise wallets are limited to
    // the role whitelist.
    let has_manage_finance = has_workspace_permission(
        contact_data,
        outbound,
        ws_id,
        MANAGE_FINANCE_PERMISSION,
        user_id,
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    let access = list_accessible_checkpoint_wallets(
        contact_data,
        outbound,
        ws_id,
        user_id,
        has_manage_finance,
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    let wallet_ids: Vec<String> = access.wallets.iter().map(|w| w.id.clone()).collect();

    if wallet_ids.is_empty() {
        return Ok(json!({
            "latest_checkpoints": [],
            "totals_by_currency": [],
            "wallets": [],
        }));
    }

    // --- Checkpoints from private.workspace_wallet_checkpoints --------------
    let oldest_window_start = oldest_window_start(&access.window_starts_by_wallet_id);
    let checkpoint_rows = match fetch_checkpoint_rows(
        contact_data,
        outbound,
        &wallet_ids,
        oldest_window_start.as_deref(),
    )
    .await
    {
        Ok(rows) => rows,
        // Storage-missing degrades to wallets-only payload (wallets preserved).
        Err(CheckpointFetchError::StorageMissing) => {
            return Ok(json!({
                "latest_checkpoints": [],
                "totals_by_currency": [],
                "wallets": access.wallets.iter().map(summary_wallet_value).collect::<Vec<_>>(),
            }));
        }
        Err(CheckpointFetchError::Failed) => return Err(BuildError::Checkpoints),
    };

    let checkpoint_rows =
        filter_checkpoint_rows_by_window(checkpoint_rows, &access.window_starts_by_wallet_id);

    // Latest checkpoint per wallet (rows are already ordered newest-first).
    let mut seen_wallets: HashMap<String, ()> = HashMap::new();
    let mut latest_checkpoints = Vec::new();
    for row in &checkpoint_rows {
        if seen_wallets.contains_key(&row.wallet_id) {
            continue;
        }
        seen_wallets.insert(row.wallet_id.clone(), ());
        let current_ledger = ledger_balance_for_read(
            contact_data,
            outbound,
            &row.wallet_id,
            &row.checked_at,
            to_number(&row.ledger_balance),
        )
        .await
        .map_err(|_| BuildError::Internal)?;
        latest_checkpoints.push(normalize_checkpoint(row, Some(current_ledger)));
    }

    let totals = summarize_checkpoint_totals(&latest_checkpoints);

    Ok(json!({
        "latest_checkpoints": latest_checkpoints.iter().map(checkpoint_value).collect::<Vec<_>>(),
        "totals_by_currency": totals,
        "wallets": access.wallets.iter().map(summary_wallet_value).collect::<Vec<_>>(),
    }))
}

// ---------------------------------------------------------------------------
// Wallet access (listAccessibleCheckpointWallets)
// ---------------------------------------------------------------------------

async fn list_accessible_checkpoint_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    has_manage_finance: bool,
) -> Result<CheckpointWalletAccess, ()> {
    let mut window_starts_by_wallet_id: HashMap<String, String> = HashMap::new();
    let mut restricted_wallet_ids: Option<Vec<String>> = None;

    if !has_manage_finance {
        let role_ids = role_ids_for_member(contact_data, outbound, ws_id, user_id).await?;
        if role_ids.is_empty() {
            return Ok(CheckpointWalletAccess {
                wallets: Vec::new(),
                window_starts_by_wallet_id,
            });
        }

        let whitelist_rows = whitelist_window_rows(contact_data, outbound, &role_ids).await?;
        window_starts_by_wallet_id = build_checkpoint_window_starts(&whitelist_rows);

        // Unique wallet ids (preserve first-seen order).
        let mut seen: HashMap<String, ()> = HashMap::new();
        let mut ids = Vec::new();
        for row in &whitelist_rows {
            if let Some(wallet_id) = row.wallet_id.as_ref()
                && seen.insert(wallet_id.clone(), ()).is_none()
            {
                ids.push(wallet_id.clone());
            }
        }

        if ids.is_empty() {
            return Ok(CheckpointWalletAccess {
                wallets: Vec::new(),
                window_starts_by_wallet_id,
            });
        }

        restricted_wallet_ids = Some(ids);
    }

    let wallets = fetch_summary_wallets(
        contact_data,
        outbound,
        ws_id,
        restricted_wallet_ids.as_deref(),
    )
    .await?;

    Ok(CheckpointWalletAccess {
        wallets,
        window_starts_by_wallet_id,
    })
}

async fn role_ids_for_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    // workspace_role_members joined to workspace_roles!inner(ws_id) filtered by
    // ws_id. PostgREST embedded filter expressed as workspace_roles.ws_id=eq...
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            ("select", "role_id,workspace_roles!inner(ws_id)".to_owned()),
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
    let rows = response.json::<Vec<RoleMemberRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|row| row.role_id).collect())
}

async fn whitelist_window_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_ids: &[String],
) -> Result<Vec<WalletWhitelistWindowRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            ("select", "wallet_id,viewing_window,custom_days".to_owned()),
            ("role_id", format!("in.({})", role_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<WalletWhitelistWindowRow>>()
        .map_err(|_| ())
}

async fn fetch_summary_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    restricted_wallet_ids: Option<&[String]>,
) -> Result<Vec<SummaryWallet>, ()> {
    let mut params = vec![
        (
            "select",
            "id,name,currency,balance,type,icon,image_src".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc".to_owned()),
    ];
    if let Some(ids) = restricted_wallet_ids {
        params.push(("id", format!("in.({})", ids.join(","))));
    }

    let Some(url) = contact_data.rest_url("workspace_wallets", &params) else {
        return Err(());
    };
    // private schema read.
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<SummaryWalletRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().map(normalize_summary_wallet).collect())
}

fn normalize_summary_wallet(row: SummaryWalletRow) -> SummaryWallet {
    SummaryWallet {
        id: row.id.unwrap_or_default(),
        name: row.name,
        currency: row
            .currency
            .as_ref()
            .and_then(value_to_string)
            .unwrap_or_else(|| "USD".to_owned()),
        balance: to_number(&row.balance),
        wallet_type: row.wallet_type,
        icon: row.icon,
        image_src: row.image_src,
    }
}

// ---------------------------------------------------------------------------
// Checkpoint rows
// ---------------------------------------------------------------------------

enum CheckpointFetchError {
    StorageMissing,
    Failed,
}

async fn fetch_checkpoint_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_ids: &[String],
    oldest_window_start: Option<&str>,
) -> Result<Vec<CheckpointRow>, CheckpointFetchError> {
    // The collection route applies NO limit (unlike the history route).
    let mut params = vec![
        ("select", WALLET_CHECKPOINT_SELECT.to_owned()),
        ("wallet_id", format!("in.({})", wallet_ids.join(","))),
        // .order('checked_at', desc).order('created_at', desc)
        ("order", "checked_at.desc,created_at.desc".to_owned()),
    ];
    if let Some(window_start) = oldest_window_start {
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

fn normalize_checkpoint(
    row: &CheckpointRow,
    current_ledger_balance: Option<f64>,
) -> NormalizedCheckpoint {
    let actual_balance = to_number(&row.actual_balance);
    let ledger_balance = to_number(&row.ledger_balance);
    let current_ledger = current_ledger_balance.unwrap_or(ledger_balance);

    NormalizedCheckpoint {
        actual_balance,
        checked_at: row.checked_at.clone(),
        created_at: row.created_at.clone(),
        created_by: row.created_by.clone(),
        currency: row.currency.clone().unwrap_or_default(),
        current_ledger_balance: current_ledger,
        current_variance: actual_balance - current_ledger,
        id: row.id.clone(),
        ledger_balance,
        note: row.note.clone(),
        original_variance: actual_balance - ledger_balance,
        updated_at: row.updated_at.clone(),
        wallet_id: row.wallet_id.clone(),
    }
}

fn checkpoint_value(checkpoint: &NormalizedCheckpoint) -> Value {
    json!({
        "actual_balance": checkpoint.actual_balance,
        "checked_at": checkpoint.checked_at,
        "created_at": checkpoint.created_at,
        "created_by": checkpoint.created_by,
        "currency": checkpoint.currency,
        "current_ledger_balance": checkpoint.current_ledger_balance,
        "current_variance": checkpoint.current_variance,
        "id": checkpoint.id,
        "ledger_balance": checkpoint.ledger_balance,
        "note": checkpoint.note,
        "original_variance": checkpoint.original_variance,
        "updated_at": checkpoint.updated_at,
        "wallet_id": checkpoint.wallet_id,
    })
}

fn summary_wallet_value(wallet: &SummaryWallet) -> Value {
    json!({
        "balance": wallet.balance,
        "currency": wallet.currency,
        "icon": wallet.icon,
        "id": wallet.id,
        "image_src": wallet.image_src,
        "name": wallet.name,
        "type": wallet.wallet_type,
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
) -> Result<f64, ()> {
    let mut body = Map::new();
    body.insert(
        "_checked_at".to_owned(),
        Value::String(checked_at.to_owned()),
    );
    body.insert("_wallet_id".to_owned(), Value::String(wallet_id.to_owned()));

    match private_rpc(
        contact_data,
        outbound,
        "get_wallet_ledger_balance_at",
        &Value::Object(body),
    )
    .await
    {
        Ok(response) => {
            if is_success(response.status) {
                let value = response.json::<Value>().map_err(|_| ())?;
                Ok(value_to_number(&value).unwrap_or(0.0))
            } else if response_is_storage_missing(&response) {
                Ok(fallback_ledger_balance)
            } else {
                Err(())
            }
        }
        Err(()) => Err(()),
    }
}

// ---------------------------------------------------------------------------
// Totals (summarizeCheckpointTotals)
// ---------------------------------------------------------------------------

fn summarize_checkpoint_totals(checkpoints: &[NormalizedCheckpoint]) -> Vec<Value> {
    use std::collections::BTreeMap;

    struct Total {
        actual_total: f64,
        checkpoint_count: i64,
        ledger_total: f64,
        variance_total: f64,
    }

    // BTreeMap keeps currencies sorted (mirrors localeCompare sort).
    let mut totals: BTreeMap<String, Total> = BTreeMap::new();
    for checkpoint in checkpoints {
        let entry = totals.entry(checkpoint.currency.clone()).or_insert(Total {
            actual_total: 0.0,
            checkpoint_count: 0,
            ledger_total: 0.0,
            variance_total: 0.0,
        });
        entry.actual_total += checkpoint.actual_balance;
        entry.ledger_total += checkpoint.current_ledger_balance;
        entry.variance_total += checkpoint.current_variance;
        entry.checkpoint_count += 1;
    }

    totals
        .into_iter()
        .map(|(currency, total)| {
            json!({
                "actual_total": total.actual_total,
                "checkpoint_count": total.checkpoint_count,
                "currency": currency,
                "ledger_total": total.ledger_total,
                "variance_total": total.variance_total,
            })
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Viewing-window helpers (checkpoints/access.ts)
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

/// `now - days` as a millisecond-precision ISO-8601 UTC string, matching
/// JS `new Date(...).toISOString()`.
fn checkpoint_window_start(days: i64) -> String {
    let now_ms = now_unix_millis();
    let start_ms = now_ms - days * 24 * 60 * 60 * 1000;
    iso8601_from_millis(start_ms)
}

fn build_checkpoint_window_starts(rows: &[WalletWhitelistWindowRow]) -> HashMap<String, String> {
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

fn oldest_window_start(window_starts: &HashMap<String, String>) -> Option<String> {
    let mut oldest: Option<(i64, String)> = None;
    for start in window_starts.values() {
        if let Some(time) = parse_iso_millis(start) {
            match &oldest {
                Some((oldest_time, _)) if *oldest_time <= time => {}
                _ => oldest = Some((time, start.clone())),
            }
        }
    }
    oldest.map(|(_, start)| start)
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

// ---------------------------------------------------------------------------
// Permission RPC (has_workspace_permission), file-local copy of finance_auth's
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

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn match_path(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
