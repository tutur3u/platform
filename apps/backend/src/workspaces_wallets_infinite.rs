//! Handler for `GET /api/v1/workspaces/:wsId/wallets/infinite`.
//!
//! Ports the legacy Next.js route that lived at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/wallets/infinite/route.ts`, which
//! delegated to `@tuturuuu/apis/finance/wallets/infinite/route` (which in turn
//! reuses the base wallets `GET` from `@tuturuuu/apis/finance/wallets/route`).
//!
//! The route loads the wallets a caller is allowed to see for a workspace (using
//! the same permission tiers as the base wallets route) and then applies the
//! infinite-scroll envelope: `q` filter (case-insensitive substring on `name`),
//! `offset`/`limit` pagination, and the `{ data, hasMore, nextOffset,
//! totalCount }` JSON shape.
//!
//! NOTE: This module is fully self-contained per the porting constraints. The
//! workspace-id normalization, supabase auth-token extraction, and effective
//! permission aggregation helpers are copied (file-local) from
//! `workspace_permission_check.rs`/`workspace_habits_access.rs` because those
//! variants are private to their modules. See the structured notes for the list
//! of copied helpers.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_PERMISSION: &str = "admin";
const APP_SESSION_BEARER_PREFIX: &str = "ttr_app_";
const DEFAULT_LIMIT: i64 = 20;
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const MAX_LIMIT: i64 = 100;
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WALLETS_INFINITE_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WALLETS_INFINITE_PATH_SUFFIX: &str = "/wallets/infinite";

// Wallet column selects mirror the legacy route.
const FULL_WALLET_SELECT: &str = "*";
const INVOICE_SAFE_WALLET_SELECT: &str = "id,name,type,currency,icon,image_src";

pub(crate) async fn handle_workspaces_wallets_infinite_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = wallets_infinite_ws_id(request.path)?;

    Some(match request.method {
        "GET" => wallets_infinite_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn wallets_infinite_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return internal_error_response("Error fetching transaction wallets");
    }

    // --- Auth ---------------------------------------------------------------
    let Some(access_token) = request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // --- Resolve workspace + permissions -----------------------------------
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(id)) => id,
            // Missing/None normalization or unauthorized permission context maps
            // to the legacy 401 "Unauthorized" from getFinanceRouteContext.
            Ok(None) => return message_response(401, UNAUTHORIZED_MESSAGE),
            Err(()) => return internal_error_response("Error fetching transaction wallets"),
        };

    let permissions = match effective_workspace_permissions_for_user(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(permissions)) => permissions,
        Ok(None) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return internal_error_response("Error fetching transaction wallets"),
    };

    // --- Load wallets (mirrors base wallets GET branching) ------------------
    let wallets = match load_visible_wallets(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &permissions,
    )
    .await
    {
        Ok(wallets) => wallets,
        Err(error) => return error,
    };

    // --- Apply infinite envelope -------------------------------------------
    finite_envelope_response(request.url, wallets)
}

/// Mirrors the base wallets `GET` permission tiers and returns the wallet rows
/// the caller is allowed to see.
async fn load_visible_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    permissions: &EffectiveWorkspacePermissions,
) -> Result<Vec<Value>, BackendResponse> {
    let has_manage_finance = permissions.has("manage_finance");
    let has_create_invoices = permissions.has("create_invoices");
    let can_read_wallet_financial_fields =
        has_manage_finance || permissions.has("view_transactions");

    let default_invoice_wallet_id = if has_create_invoices {
        workspace_config_value(contact_data, outbound, ws_id, "default_wallet_id")
            .await
            .unwrap_or_default()
    } else {
        None
    };

    let can_read_all_for_invoice_creation = has_create_invoices
        && (default_invoice_wallet_id.is_none()
            || can_set_any_finance_wallet_on_create(permissions));

    // Tier 1: full manage_finance access.
    if has_manage_finance {
        return load_workspace_wallets(
            contact_data,
            outbound,
            ws_id,
            /* invoice_safe_only */ false,
            None,
        )
        .await
        .map_err(|_| internal_error_response("Error fetching transaction wallets"));
    }

    // Tier 2: invoice creators with override/no-default get every wallet
    // (invoice-safe fields only).
    if can_read_all_for_invoice_creation {
        return load_workspace_wallets(
            contact_data,
            outbound,
            ws_id,
            /* invoice_safe_only */ true,
            None,
        )
        .await
        .map_err(|_| internal_error_response("Error fetching transaction wallets"));
    }

    // Tier 3: wallet whitelist by role.
    let default_invoice_wallet_ids: Vec<String> = default_invoice_wallet_id
        .as_ref()
        .map(|id| vec![id.clone()])
        .unwrap_or_default();

    let user_role_ids = match workspace_user_role_ids(contact_data, outbound, ws_id, user_id).await
    {
        Ok(role_ids) => role_ids,
        Err(()) => return Err(internal_error_response("Error fetching user roles")),
    };

    if user_role_ids.is_empty() {
        if default_invoice_wallet_ids.is_empty() {
            return Ok(Vec::new());
        }

        let wallets = load_workspace_wallets(
            contact_data,
            outbound,
            ws_id,
            /* invoice_safe_only */ !can_read_wallet_financial_fields,
            Some(&default_invoice_wallet_ids),
        )
        .await
        .map_err(|_| internal_error_response("Error fetching wallet details"))?;

        return Ok(wallets);
    }

    let whitelist_rows = match wallet_whitelist_rows(contact_data, outbound, &user_role_ids).await {
        Ok(rows) => rows,
        Err(()) => {
            return Err(internal_error_response(
                "Error fetching whitelisted wallets",
            ));
        }
    };

    if whitelist_rows.is_empty() && default_invoice_wallet_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut wallet_ids: Vec<String> = Vec::new();
    for row in &whitelist_rows {
        if let Some(id) = row.wallet_id.as_ref()
            && !wallet_ids.iter().any(|existing| existing == id)
        {
            wallet_ids.push(id.clone());
        }
    }
    for id in &default_invoice_wallet_ids {
        if !wallet_ids.iter().any(|existing| existing == id) {
            wallet_ids.push(id.clone());
        }
    }

    let mut wallets = load_workspace_wallets(
        contact_data,
        outbound,
        ws_id,
        /* invoice_safe_only */ !can_read_wallet_financial_fields,
        Some(&wallet_ids),
    )
    .await
    .map_err(|_| internal_error_response("Error fetching wallet details"))?;

    // Attach the most-permissive viewing window per wallet (only when the caller
    // can read financial fields, mirroring legacy behavior).
    if can_read_wallet_financial_fields {
        let window_map = build_wallet_window_map(&whitelist_rows);
        for wallet in &mut wallets {
            let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
            let window = id.as_ref().and_then(|id| window_map.get(id));
            if let Some(object) = wallet.as_object_mut() {
                match window {
                    Some(window) => {
                        object.insert(
                            "viewing_window".to_owned(),
                            window
                                .viewing_window
                                .clone()
                                .map(Value::String)
                                .unwrap_or(Value::Null),
                        );
                        object.insert(
                            "custom_days".to_owned(),
                            window.custom_days.map(Value::from).unwrap_or(Value::Null),
                        );
                    }
                    None => {
                        // Legacy spreads `walletMap.get(id)?.viewing_window`,
                        // which yields `undefined` and is dropped by JSON when
                        // there is no whitelist entry for this wallet. Mirror
                        // that by leaving both keys absent.
                    }
                }
            }
        }
    }

    Ok(wallets)
}

/// Loads `private.workspace_wallets` rows for a workspace, optionally filtered
/// to a set of wallet ids, and attaches credit + audit data the way the legacy
/// `loadWorkspaceWallets` helper does.
async fn load_workspace_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    invoice_safe_only: bool,
    wallet_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let select = if invoice_safe_only {
        INVOICE_SAFE_WALLET_SELECT
    } else {
        FULL_WALLET_SELECT
    };

    let mut params: Vec<(&str, String)> = vec![
        ("select", select.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc".to_owned()),
    ];
    if let Some(ids) = wallet_ids {
        params.push(("id", in_filter(ids)));
    }

    let Some(url) = contact_data.rest_url("workspace_wallets", &params) else {
        return Err(());
    };
    let response =
        send_private_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let mut wallets = response.json::<Vec<Value>>().map_err(|_| ())?;

    if invoice_safe_only {
        // Invoice-safe select never requests credit data and never attaches
        // audit data (legacy returns the rows verbatim).
        return Ok(wallets);
    }

    // Attach credit data (FULL_WALLET_SELECT mirrors the legacy
    // `credit_wallets(limit, statement_date, payment_date)` relation, flattened).
    attach_wallet_credit_data(contact_data, outbound, &mut wallets).await?;

    // Attach best-effort audit data (storage-missing failures are swallowed and
    // the wallets returned unchanged, matching legacy behavior).
    attach_wallet_audit_data(contact_data, outbound, &mut wallets).await;

    Ok(wallets)
}

/// Mirrors `attachWalletCreditData` + `flattenWalletCreditData`: looks up the
/// matching `credit_wallets` row per wallet id and flattens
/// `{ limit, statement_date, payment_date }` onto each wallet.
async fn attach_wallet_credit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) -> Result<(), ()> {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.iter().any(|existing| existing == id)
        {
            wallet_ids.push(id.to_owned());
        }
    }

    if wallet_ids.is_empty() {
        return Ok(());
    }

    let Some(url) = contact_data.rest_url(
        "credit_wallets",
        &[
            (
                "select",
                "wallet_id,limit,statement_date,payment_date".to_owned(),
            ),
            ("wallet_id", in_filter(&wallet_ids)),
        ],
    ) else {
        return Err(());
    };
    // credit_wallets lives in the public schema.
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let credit_rows = response.json::<Vec<CreditWalletRow>>().map_err(|_| ())?;
    let mut credit_by_id: BTreeMap<String, &CreditWalletRow> = BTreeMap::new();
    for row in &credit_rows {
        if let Some(id) = row.wallet_id.as_ref() {
            credit_by_id.insert(id.clone(), row);
        }
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        let credit = id.as_ref().and_then(|id| credit_by_id.get(id).copied());
        if let (Some(object), Some(credit)) = (wallet.as_object_mut(), credit) {
            // Flatten matches `flattenWalletCreditData`.
            insert_optional_number(object, "limit", credit.limit);
            insert_optional_number(object, "statement_date", credit.statement_date);
            insert_optional_number(object, "payment_date", credit.payment_date);
        }
    }

    Ok(())
}

/// Mirrors `attachWalletAuditData` + `listWalletAuditStatuses`: calls the
/// `private.get_wallet_checkpoint_audit_status` RPC and decorates each wallet
/// with `audit_*` fields. Errors are swallowed (wallets returned unchanged),
/// matching the legacy try/catch and storage-missing fallbacks.
async fn attach_wallet_audit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.iter().any(|existing| existing == id)
        {
            wallet_ids.push(id.to_owned());
        }
    }

    if wallet_ids.is_empty() {
        return;
    }

    let Some(url) = contact_data.rpc_url("get_wallet_checkpoint_audit_status") else {
        return;
    };
    let body = json!({ "_wallet_ids": wallet_ids }).to_string();
    let Some(service_role_key) = contact_data.service_role_key() else {
        return;
    };
    let authorization = format!("Bearer {service_role_key}");

    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
    else {
        return;
    };

    if !is_success_status(response.status) {
        // Storage-missing or any error -> swallow, wallets unchanged.
        return;
    }

    let Ok(statuses) = response.json::<Vec<AuditStatusRow>>() else {
        return;
    };

    let mut status_by_id: BTreeMap<String, &AuditStatusRow> = BTreeMap::new();
    for status in &statuses {
        if let Some(id) = status.wallet_id.as_ref() {
            status_by_id.insert(id.clone(), status);
        }
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        let status = id.as_ref().and_then(|id| status_by_id.get(id).copied());
        if let (Some(object), Some(status)) = (wallet.as_object_mut(), status) {
            object.insert(
                "audit_actual_balance".to_owned(),
                opt_number_value(status.latest_actual_balance),
            );
            object.insert(
                "audit_balance".to_owned(),
                number_value(status.audited_balance),
            );
            object.insert(
                "audit_checkpoint_id".to_owned(),
                status
                    .latest_checkpoint_id
                    .clone()
                    .map(Value::String)
                    .unwrap_or(Value::Null),
            );
            object.insert(
                "audit_checked_at".to_owned(),
                status
                    .latest_checked_at
                    .clone()
                    .map(Value::String)
                    .unwrap_or(Value::Null),
            );
            object.insert(
                "audit_ledger_balance".to_owned(),
                number_value(status.ledger_balance),
            );
            object.insert(
                "audit_post_checkpoint_delta".to_owned(),
                number_value(status.post_checkpoint_delta),
            );
            object.insert(
                "audit_post_checkpoint_transaction_count".to_owned(),
                Value::from(status.post_checkpoint_transaction_count.unwrap_or(0)),
            );
            object.insert(
                "audit_status".to_owned(),
                Value::String(normalize_audit_status(status.status.as_deref())),
            );
            object.insert("audit_variance".to_owned(), number_value(status.variance));
        }
    }
}

// ---------------------------------------------------------------------------
// Workspace config + role lookups (public schema)
// ---------------------------------------------------------------------------

async fn workspace_config_value(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    config_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_configs",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{config_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceConfigRow>(&response)?
        .and_then(|row| row.value)
        .filter(|value| !value.is_empty()))
}

async fn workspace_user_role_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<RoleMemberRow>>().map_err(|_| ())?;
    let mut role_ids: Vec<String> = Vec::new();
    for row in rows {
        if let Some(id) = row.role_id
            && !role_ids.iter().any(|existing| existing == &id)
        {
            role_ids.push(id);
        }
    }
    Ok(role_ids)
}

async fn wallet_whitelist_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_ids: &[String],
) -> Result<Vec<WhitelistRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            ("select", "wallet_id,viewing_window,custom_days".to_owned()),
            ("role_id", in_filter(role_ids)),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<WhitelistRow>>().map_err(|_| ())
}

fn build_wallet_window_map(rows: &[WhitelistRow]) -> BTreeMap<String, WalletWindow> {
    let mut map: BTreeMap<String, WalletWindow> = BTreeMap::new();
    for row in rows {
        let Some(wallet_id) = row.wallet_id.as_ref() else {
            continue;
        };
        let candidate = WalletWindow {
            viewing_window: row.viewing_window.clone(),
            custom_days: row.custom_days,
        };
        match map.get(wallet_id) {
            None => {
                map.insert(wallet_id.clone(), candidate);
            }
            Some(existing) => {
                let existing_days =
                    viewing_window_days(existing.viewing_window.as_deref(), existing.custom_days);
                let current_days =
                    viewing_window_days(candidate.viewing_window.as_deref(), candidate.custom_days);
                if current_days > existing_days {
                    map.insert(wallet_id.clone(), candidate);
                }
            }
        }
    }
    map
}

fn viewing_window_days(window: Option<&str>, custom_days: Option<i64>) -> i64 {
    match window {
        None => 30,
        Some("1_day") => 1,
        Some("3_days") => 3,
        Some("7_days") => 7,
        Some("2_weeks") => 14,
        Some("1_month") => 30,
        Some("1_quarter") => 90,
        Some("1_year") => 365,
        Some("custom") => match custom_days {
            Some(days) if days >= 1 => days,
            _ => 30,
        },
        Some(_) => 30,
    }
}

// ---------------------------------------------------------------------------
// Infinite-scroll envelope
// ---------------------------------------------------------------------------

fn finite_envelope_response(request_url: Option<&str>, wallets: Vec<Value>) -> BackendResponse {
    let limit = parse_bounded_integer(
        query_value(request_url, "limit"),
        DEFAULT_LIMIT,
        1,
        MAX_LIMIT,
    );
    let offset = parse_bounded_integer(query_value(request_url, "offset"), 0, 0, 1_000_000_000);
    let normalized_query = query_value(request_url, "q").map(|value| value.trim().to_lowercase());

    let filtered: Vec<Value> = match normalized_query.as_deref() {
        Some(query) if !query.is_empty() => wallets
            .into_iter()
            .filter(|wallet| wallet_name(wallet).to_lowercase().contains(query))
            .collect(),
        // Legacy only filters when `q` is a non-empty (trimmed) string.
        _ => wallets,
    };

    let total = filtered.len() as i64;
    let start = offset.min(total);
    let end = (offset + limit).min(total);
    let data: Vec<Value> = filtered[start as usize..end as usize].to_vec();
    let data_len = data.len() as i64;

    let next_offset = if offset + data_len < total {
        Some(offset + data_len)
    } else {
        None
    };

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "hasMore": next_offset.is_some(),
            "nextOffset": next_offset,
            "totalCount": total,
        }),
    ))
}

fn wallet_name(wallet: &Value) -> String {
    wallet
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

fn parse_bounded_integer(value: Option<String>, fallback: i64, min: i64, max: i64) -> i64 {
    let Some(value) = value else {
        return fallback;
    };
    // Mirror JS `Number.parseInt(value, 10)` (leading digits, ignores trailing).
    match parse_leading_integer(&value) {
        Some(parsed) => parsed.clamp(min, max),
        None => fallback,
    }
}

fn parse_leading_integer(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.chars().peekable();
    let mut result = String::new();

    if matches!(chars.peek(), Some('+') | Some('-')) {
        result.push(chars.next().unwrap());
    }

    while let Some(&character) = chars.peek() {
        if character.is_ascii_digit() {
            result.push(character);
            chars.next();
        } else {
            break;
        }
    }

    if result.is_empty() || result == "+" || result == "-" {
        return None;
    }

    result.parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// Permissions (copied/adapted from workspace_permission_check.rs)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq)]
struct EffectiveWorkspacePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

impl EffectiveWorkspacePermissions {
    fn has(&self, permission: &str) -> bool {
        self.has_all_permissions || self.permissions.iter().any(|value| value == permission)
    }
}

fn can_set_any_finance_wallet_on_create(permissions: &EffectiveWorkspacePermissions) -> bool {
    // Mirrors `canSetAnyFinanceWalletOnCreate`.
    permissions.has("change_finance_wallets") || permissions.has("set_finance_wallets_on_create")
}

async fn effective_workspace_permissions_for_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    resolved_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<EffectiveWorkspacePermissions>, ()> {
    let Some(membership_type) = workspace_membership_type(
        contact_data,
        outbound,
        resolved_ws_id,
        user_id,
        access_token,
    )
    .await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, resolved_ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, resolved_ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, resolved_ws_id, &membership_type)
            .await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user_id);

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(Some(EffectiveWorkspacePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) = workspace_id_by_handle(
            contact_data,
            outbound,
            &handle,
            &DataAuth::AccessToken(access_token),
        )
        .await?
        {
            return Ok(Some(workspace_id));
        }
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
        None,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        auth,
        None,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
        None,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
        None,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceRow>(&response)
}

async fn workspace_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
        None,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        collect_role_permissions(&row, &mut permissions);
    }

    Ok(permissions)
}

async fn workspace_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{membership_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
        None,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
    accept_profile: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(profile) = accept_profile {
        request = request
            .with_header("Accept-Profile", profile)
            .with_header("Content-Profile", profile);
    }

    outbound.send(request).await.map_err(|_| ())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(
        contact_data,
        outbound,
        method,
        url,
        &DataAuth::ServiceRole,
        None,
    )
    .await
}

async fn send_private_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(
        contact_data,
        outbound,
        method,
        url,
        &DataAuth::ServiceRole,
        Some(PRIVATE_SCHEMA),
    )
    .await
}

// ---------------------------------------------------------------------------
// Auth-token extraction (copied from workspace_permission_check.rs, with
// app-session cookie support like the platform routes)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
struct SupabaseAuthCookieGroup {
    base: Option<String>,
    chunks: BTreeMap<usize, String>,
    duplicate: bool,
}

fn request_access_token(request: BackendRequest<'_>) -> Option<String> {
    bearer_access_token(request.authorization).or_else(|| {
        request
            .cookie
            .and_then(supabase_access_token_from_cookie_header)
    })
}

fn bearer_access_token(authorization: Option<&str>) -> Option<String> {
    let authorization = authorization?.trim();
    let token = authorization
        .strip_prefix("Bearer ")
        .or_else(|| authorization.strip_prefix("bearer "))?
        .trim();

    if token.is_empty() || token.starts_with(APP_SESSION_BEARER_PREFIX) {
        return None;
    }

    Some(token.to_owned())
}

fn supabase_access_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    let groups = supabase_auth_cookie_groups(cookie_header);

    groups
        .values()
        .filter_map(supabase_auth_cookie_value)
        .find_map(|value| access_token_from_supabase_cookie_value(&value))
}

fn supabase_auth_cookie_groups(cookie_header: &str) -> BTreeMap<String, SupabaseAuthCookieGroup> {
    let mut groups = BTreeMap::<String, SupabaseAuthCookieGroup>::new();

    for (name, value) in cookie_header
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
    {
        let Some((storage_key, chunk_index)) = supabase_auth_cookie_name_parts(name.trim()) else {
            continue;
        };
        let group = groups.entry(storage_key).or_default();

        match chunk_index {
            Some(index) => {
                if group
                    .chunks
                    .insert(index, value.trim().to_owned())
                    .is_some()
                {
                    group.duplicate = true;
                }
            }
            None => {
                if group.base.is_some() {
                    group.duplicate = true;
                }
                group.base = Some(value.trim().to_owned());
            }
        }
    }

    groups
}

fn supabase_auth_cookie_name_parts(name: &str) -> Option<(String, Option<usize>)> {
    if !name.starts_with("sb-") {
        return None;
    }

    if name.ends_with("-auth-token") {
        return Some((name.to_owned(), None));
    }

    let (storage_key, suffix) = name.rsplit_once('.')?;

    if !storage_key.ends_with("-auth-token") {
        return None;
    }

    suffix
        .parse::<usize>()
        .ok()
        .map(|index| (storage_key.to_owned(), Some(index)))
}

fn supabase_auth_cookie_value(group: &SupabaseAuthCookieGroup) -> Option<String> {
    if group.duplicate {
        return None;
    }

    match (&group.base, group.chunks.is_empty()) {
        (Some(base), true) => return Some(base.clone()),
        (Some(_), false) | (None, true) => return None,
        (None, false) => {}
    }

    let mut value = String::new();
    for index in 0..group.chunks.len() {
        value.push_str(group.chunks.get(&index)?);
    }

    Some(value)
}

fn access_token_from_supabase_cookie_value(cookie_value: &str) -> Option<String> {
    let session =
        if let Some(base64_body) = cookie_value.strip_prefix(SUPABASE_AUTH_COOKIE_BASE64_PREFIX) {
            let mut padded = base64_body.to_owned();
            while padded.len() % 4 != 0 {
                padded.push('=');
            }
            let decoded = URL_SAFE.decode(padded.as_bytes()).ok()?;
            serde_json::from_slice::<SupabaseCookieSession>(&decoded).ok()?
        } else if cookie_value.starts_with('{') {
            serde_json::from_str::<SupabaseCookieSession>(cookie_value).ok()?
        } else {
            return None;
        };

    session
        .access_token
        .filter(|token| !token.trim().is_empty())
}

// ---------------------------------------------------------------------------
// Shared value/JSON helpers
// ---------------------------------------------------------------------------

fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique_permissions(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Builds a PostgREST `in.(...)` filter value from a list of ids. Empty list
/// yields `in.()` (matches nothing), matching the JS `.in('id', [])` semantics.
fn in_filter(ids: &[String]) -> String {
    let mut unique: Vec<&String> = Vec::new();
    let mut seen: BTreeSet<&String> = BTreeSet::new();
    for id in ids {
        if seen.insert(id) {
            unique.push(id);
        }
    }
    let joined = unique
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(found_key, value)| (found_key == key).then(|| value.into_owned()))
}

fn insert_optional_number(object: &mut Map<String, Value>, key: &str, value: Option<f64>) {
    if let Some(value) = value {
        object.insert(key.to_owned(), number_value(value));
    }
}

fn number_value(value: f64) -> Value {
    serde_json::Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn opt_number_value(value: Option<f64>) -> Value {
    value.map(number_value).unwrap_or(Value::Null)
}

fn normalize_audit_status(status: Option<&str>) -> String {
    match status {
        Some("clean") => "clean".to_owned(),
        Some("no_checkpoint") => "no_checkpoint".to_owned(),
        Some("unresolved") => "unresolved".to_owned(),
        _ => "no_checkpoint".to_owned(),
    }
}

fn wallets_infinite_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WALLETS_INFINITE_PATH_PREFIX)?
        .strip_suffix(WALLETS_INFINITE_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn internal_error_response(message: &str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Row decoders
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SupabaseCookieSession {
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceConfigRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct RoleMemberRow {
    role_id: Option<String>,
}

#[derive(Deserialize)]
struct WhitelistRow {
    wallet_id: Option<String>,
    viewing_window: Option<String>,
    custom_days: Option<i64>,
}

struct WalletWindow {
    viewing_window: Option<String>,
    custom_days: Option<i64>,
}

#[derive(Deserialize)]
struct CreditWalletRow {
    wallet_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    limit: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    statement_date: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    payment_date: Option<f64>,
}

#[derive(Deserialize)]
struct AuditStatusRow {
    wallet_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    audited_balance: f64,
    #[serde(default, deserialize_with = "deserialize_optional_number")]
    latest_actual_balance: Option<f64>,
    latest_checked_at: Option<String>,
    latest_checkpoint_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    ledger_balance: f64,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    post_checkpoint_delta: f64,
    #[serde(default, deserialize_with = "deserialize_optional_integer")]
    post_checkpoint_transaction_count: Option<i64>,
    status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_number_or_zero")]
    variance: f64,
}

// Supabase may return numerics as strings or numbers; normalize like
// `toCheckpointNumber`.
fn deserialize_optional_number<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value.and_then(|value| value_to_number(&value)))
}

fn deserialize_number_or_zero<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value
        .and_then(|value| value_to_number(&value))
        .unwrap_or(0.0))
}

fn deserialize_optional_integer<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value
        .and_then(|value| value_to_number(&value))
        .map(|number| number as i64))
}

fn value_to_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => {
            let parsed = text.trim().parse::<f64>().ok()?;
            parsed.is_finite().then_some(parsed)
        }
        _ => None,
    }
}
