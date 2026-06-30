//! Mirrors `apps/web/src/app/api/workspaces/[wsId]/wallets/route.ts` (GET only).
//!
//! That route delegates to `packages/apis/src/finance/wallets/route.ts` GET,
//! which is also what the `/api/v1/workspaces/:wsId/wallets` handler mirrors.
//! The only difference between this module and `workspaces_wallets` is the
//! mount path: this handler owns `/api/workspaces/:wsId/wallets` (no `v1`).
//!
//! Behavior gaps (none significant):
//!
//! - POST is not migrated; returning `None` falls through to the still-live
//!   Next.js route.
//! - `flattenWalletCreditList` is called via `attach_and_flatten_credit_data`;
//!   the TS double-call on the "no roles, default wallet" branch is a no-op for
//!   non-credit wallets and is reproduced faithfully.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WALLETS_PATH_PREFIX: &str = "/api/workspaces/";
const WALLETS_PATH_SUFFIX: &str = "/wallets";

const FINANCE_APP_SESSION_TARGETS: [&str; 2] = ["finance", "platform"];
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const GET_WALLET_CHECKPOINT_AUDIT_STATUS_RPC: &str = "get_wallet_checkpoint_audit_status";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PRIVATE_SCHEMA: &str = "private";

const DEFAULT_WALLET_CONFIG_ID: &str = "default_wallet_id";

const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const CREATE_INVOICES_PERMISSION: &str = "create_invoices";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const CHANGE_FINANCE_WALLETS_PERMISSION: &str = "change_finance_wallets";
const SET_FINANCE_WALLETS_ON_CREATE_PERMISSION: &str = "set_finance_wallets_on_create";

const FULL_WALLET_SELECT: &str = "*";
const INVOICE_SAFE_WALLET_SELECT: &str = "id,name,type,currency,icon,image_src";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE: &str = "Error fetching transaction wallets";
const ERROR_FETCHING_USER_ROLES_MESSAGE: &str = "Error fetching user roles";
const ERROR_FETCHING_WHITELISTED_WALLETS_MESSAGE: &str = "Error fetching whitelisted wallets";
const ERROR_FETCHING_WALLET_DETAILS_MESSAGE: &str = "Error fetching wallet details";

pub(crate) async fn handle_workspaces_wsid_wallets_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = wallets_ws_id(request.path)?;

    Some(match request.method {
        "GET" => wallets_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn wallets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE);
    }
    let contact_data = &config.contact_data;

    let Some(user) = authenticated_finance_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let Ok(Some(ws_id)) = normalize_workspace_id(contact_data, outbound, raw_ws_id, &user).await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match is_workspace_member(contact_data, outbound, &ws_id, &user.id).await {
        Ok(true) => {}
        Ok(false) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    }

    let has_manage_finance = match permission(
        contact_data,
        outbound,
        &ws_id,
        MANAGE_FINANCE_PERMISSION,
        &user.id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let has_create_invoices = match permission(
        contact_data,
        outbound,
        &ws_id,
        CREATE_INVOICES_PERMISSION,
        &user.id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let has_view_transactions = match permission(
        contact_data,
        outbound,
        &ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        &user.id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let can_read_wallet_financial_fields = has_manage_finance || has_view_transactions;

    let default_invoice_wallet_id = if has_create_invoices {
        workspace_config(contact_data, outbound, &ws_id, DEFAULT_WALLET_CONFIG_ID)
            .await
            .unwrap_or_default()
    } else {
        None
    };

    let can_read_all_wallets_for_invoice_creation = if has_create_invoices {
        if default_invoice_wallet_id.is_none() {
            true
        } else {
            let can_change = match permission(
                contact_data,
                outbound,
                &ws_id,
                CHANGE_FINANCE_WALLETS_PERMISSION,
                &user.id,
            )
            .await
            {
                Ok(value) => value,
                Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
            };
            if can_change {
                true
            } else {
                match permission(
                    contact_data,
                    outbound,
                    &ws_id,
                    SET_FINANCE_WALLETS_ON_CREATE_PERMISSION,
                    &user.id,
                )
                .await
                {
                    Ok(value) => value,
                    Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
                }
            }
        }
    } else {
        false
    };

    if has_manage_finance {
        return match load_workspace_wallets(contact_data, outbound, &ws_id, false, None).await {
            Ok(data) => no_store_response(json_response(200, Value::Array(data))),
            Err(()) => message_response(500, ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE),
        };
    }

    if can_read_all_wallets_for_invoice_creation {
        return match load_workspace_wallets(contact_data, outbound, &ws_id, true, None).await {
            Ok(data) => no_store_response(json_response(200, Value::Array(data))),
            Err(()) => message_response(500, ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE),
        };
    }

    let default_invoice_wallet_ids: Vec<String> =
        default_invoice_wallet_id.clone().into_iter().collect();

    let role_ids = match fetch_role_ids(contact_data, outbound, &ws_id, &user.id).await {
        Ok(role_ids) => role_ids,
        Err(()) => return message_response(500, ERROR_FETCHING_USER_ROLES_MESSAGE),
    };

    if role_ids.is_empty() {
        if default_invoice_wallet_ids.is_empty() {
            return no_store_response(json_response(200, Value::Array(Vec::new())));
        }

        return match load_workspace_wallets(
            contact_data,
            outbound,
            &ws_id,
            !can_read_wallet_financial_fields,
            Some(&default_invoice_wallet_ids),
        )
        .await
        {
            Ok(data) => no_store_response(json_response(200, Value::Array(data))),
            Err(()) => message_response(500, ERROR_FETCHING_WALLET_DETAILS_MESSAGE),
        };
    }

    let whitelist = match fetch_whitelist(contact_data, outbound, &role_ids).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, ERROR_FETCHING_WHITELISTED_WALLETS_MESSAGE),
    };

    if whitelist.is_empty() && default_invoice_wallet_ids.is_empty() {
        return no_store_response(json_response(200, Value::Array(Vec::new())));
    }

    let mut wallet_ids: Vec<String> = Vec::new();
    for row in &whitelist {
        if let Some(id) = &row.wallet_id
            && !wallet_ids.contains(id)
        {
            wallet_ids.push(id.clone());
        }
    }
    for id in &default_invoice_wallet_ids {
        if !wallet_ids.contains(id) {
            wallet_ids.push(id.clone());
        }
    }

    let wallets = match load_workspace_wallets(
        contact_data,
        outbound,
        &ws_id,
        !can_read_wallet_financial_fields,
        Some(&wallet_ids),
    )
    .await
    {
        Ok(data) => data,
        Err(()) => return message_response(500, ERROR_FETCHING_WALLET_DETAILS_MESSAGE),
    };

    let wallet_map = build_wallet_window_map(&whitelist);

    let wallets_with_window: Vec<Value> = if can_read_wallet_financial_fields {
        wallets
            .into_iter()
            .map(|mut wallet| {
                if let Some(obj) = wallet.as_object_mut() {
                    let window = obj
                        .get("id")
                        .and_then(Value::as_str)
                        .and_then(|id| wallet_map.get(id));
                    if let Some(window) = window {
                        obj.insert("viewing_window".to_owned(), window.viewing_window.clone());
                        obj.insert("custom_days".to_owned(), window.custom_days.clone());
                    }
                }
                wallet
            })
            .collect()
    } else {
        wallets
    };

    no_store_response(json_response(200, Value::Array(wallets_with_window)))
}

// ---------------------------------------------------------------------------
// Wallet loading
// ---------------------------------------------------------------------------

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
        params.push(("id", format!("in.({})", ids.join(","))));
    }

    let Some(url) = contact_data.rest_url("workspace_wallets", &params) else {
        return Err(());
    };
    let response = send_private_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let mut data = response.json::<Vec<Value>>().map_err(|_| ())?;

    if invoice_safe_only {
        return Ok(data);
    }

    attach_and_flatten_credit_data(contact_data, outbound, &mut data).await?;
    attach_wallet_audit_data(contact_data, outbound, &mut data).await;

    Ok(data)
}

async fn attach_and_flatten_credit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) -> Result<(), ()> {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.contains(&id.to_owned())
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
                "wallet_id, limit, statement_date, payment_date".to_owned(),
            ),
            ("wallet_id", format!("in.({})", wallet_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let credit_rows = response.json::<Vec<CreditWalletRow>>().map_err(|_| ())?;
    let mut credit_by_wallet: std::collections::HashMap<String, &CreditWalletRow> =
        std::collections::HashMap::new();
    for row in &credit_rows {
        credit_by_wallet.insert(row.wallet_id.clone(), row);
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        if let (Some(id), Some(obj)) = (id, wallet.as_object_mut())
            && let Some(credit) = credit_by_wallet.get(&id)
        {
            obj.insert("limit".to_owned(), credit.limit.clone());
            obj.insert("statement_date".to_owned(), credit.statement_date.clone());
            obj.insert("payment_date".to_owned(), credit.payment_date.clone());
        }
    }

    Ok(())
}

async fn attach_wallet_audit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.contains(&id.to_owned())
        {
            wallet_ids.push(id.to_owned());
        }
    }

    if wallet_ids.is_empty() {
        return;
    }

    let statuses = match fetch_wallet_audit_statuses(contact_data, outbound, &wallet_ids).await {
        Ok(statuses) => statuses,
        Err(()) => return,
    };

    let mut by_wallet: std::collections::HashMap<String, &AuditStatusRow> =
        std::collections::HashMap::new();
    for status in &statuses {
        by_wallet.insert(status.wallet_id.clone(), status);
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        if let (Some(id), Some(obj)) = (id, wallet.as_object_mut())
            && let Some(status) = by_wallet.get(&id)
        {
            obj.insert(
                "audit_actual_balance".to_owned(),
                opt_number(status.latest_actual_balance.as_ref()),
            );
            obj.insert(
                "audit_balance".to_owned(),
                json!(checkpoint_number(status.audited_balance.as_ref())),
            );
            obj.insert(
                "audit_checkpoint_id".to_owned(),
                opt_string(&status.latest_checkpoint_id),
            );
            obj.insert(
                "audit_checked_at".to_owned(),
                opt_string(&status.latest_checked_at),
            );
            obj.insert(
                "audit_ledger_balance".to_owned(),
                json!(checkpoint_number(status.ledger_balance.as_ref())),
            );
            obj.insert(
                "audit_post_checkpoint_delta".to_owned(),
                json!(checkpoint_number(status.post_checkpoint_delta.as_ref())),
            );
            obj.insert(
                "audit_post_checkpoint_transaction_count".to_owned(),
                count_number(status.post_checkpoint_transaction_count.as_ref()),
            );
            obj.insert(
                "audit_status".to_owned(),
                json!(clamp_status(&status.status)),
            );
            obj.insert(
                "audit_variance".to_owned(),
                json!(checkpoint_number(status.variance.as_ref())),
            );
        }
    }
}

async fn fetch_wallet_audit_statuses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_ids: &[String],
) -> Result<Vec<AuditStatusRow>, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_WALLET_CHECKPOINT_AUDIT_STATUS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&AuditStatusRpcRequest {
        _wallet_ids: wallet_ids,
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
        return Ok(Vec::new());
    }

    Ok(response.json::<Vec<AuditStatusRow>>().unwrap_or_default())
}

// ---------------------------------------------------------------------------
// Whitelist + viewing windows
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
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

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

async fn fetch_whitelist(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_ids: &[String],
) -> Result<Vec<WhitelistRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            (
                "select",
                "wallet_id, viewing_window, custom_days".to_owned(),
            ),
            ("role_id", format!("in.({})", role_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<WhitelistRow>>().map_err(|_| ())
}

struct WalletWindow {
    viewing_window: Value,
    custom_days: Value,
}

fn build_wallet_window_map(
    whitelist: &[WhitelistRow],
) -> std::collections::HashMap<String, WalletWindow> {
    let mut map: std::collections::HashMap<String, (Option<String>, Option<i64>)> =
        std::collections::HashMap::new();

    for item in whitelist {
        let Some(wallet_id) = &item.wallet_id else {
            continue;
        };
        match map.get(wallet_id) {
            None => {
                map.insert(
                    wallet_id.clone(),
                    (item.viewing_window.clone(), item.custom_days),
                );
            }
            Some((existing_window, existing_custom)) => {
                let existing_days =
                    viewing_window_days(existing_window.as_deref(), *existing_custom);
                let current_days =
                    viewing_window_days(item.viewing_window.as_deref(), item.custom_days);
                if current_days > existing_days {
                    map.insert(
                        wallet_id.clone(),
                        (item.viewing_window.clone(), item.custom_days),
                    );
                }
            }
        }
    }

    map.into_iter()
        .map(|(wallet_id, (window, custom))| {
            (
                wallet_id,
                WalletWindow {
                    viewing_window: window.map_or(Value::Null, Value::String),
                    custom_days: custom.map_or(Value::Null, |c| json!(c)),
                },
            )
        })
        .collect()
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
// Workspace config
// ---------------------------------------------------------------------------

async fn workspace_config(
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
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceConfigRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .filter(|value| !value.is_empty()))
}

// ---------------------------------------------------------------------------
// Permissions (has_workspace_permission RPC)
// ---------------------------------------------------------------------------

async fn permission(
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

async fn is_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
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
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .is_empty())
}

// ---------------------------------------------------------------------------
// Authentication + workspace normalization
// ---------------------------------------------------------------------------

struct AuthenticatedFinanceUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

async fn authenticated_finance_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedFinanceUser> {
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) =
            contact::resolve_app_session_identity(config, request, &FINANCE_APP_SESSION_TARGETS)
            && let Some(id) = non_empty_user_id(identity.id)
        {
            return Some(AuthenticatedFinanceUser {
                access_token: None,
                id,
            });
        }

        if let Ok(identity) = contact::resolve_cli_app_session_identity(config, request)
            && let Some(id) = non_empty_user_id(identity.id)
        {
            return Some(AuthenticatedFinanceUser {
                access_token: None,
                id,
            });
        }
    }

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(AuthenticatedFinanceUser {
        access_token: Some(access_token),
        id,
    })
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedFinanceUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
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
    user: &AuthenticatedFinanceUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
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
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

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

async fn send_public_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(contact_data, outbound, url, &DataAuth::ServiceRole).await
}

async fn send_private_rest_request(
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
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Value normalization helpers
// ---------------------------------------------------------------------------

fn checkpoint_number(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(n)) => n.as_f64().filter(|v| v.is_finite()).unwrap_or(0.0),
        Some(Value::String(s)) => s
            .parse::<f64>()
            .ok()
            .filter(|v| v.is_finite())
            .unwrap_or(0.0),
        _ => 0.0,
    }
}

fn opt_number(value: Option<&Value>) -> Value {
    match value {
        None | Some(Value::Null) => Value::Null,
        other => json!(checkpoint_number(other)),
    }
}

fn count_number(value: Option<&Value>) -> Value {
    let parsed = match value {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    };

    if parsed.is_finite() && parsed.fract() == 0.0 {
        json!(parsed as i64)
    } else {
        json!(parsed)
    }
}

fn opt_string(value: &Option<String>) -> Value {
    value
        .as_ref()
        .map_or(Value::Null, |s| Value::String(s.clone()))
}

fn clamp_status(status: &Option<String>) -> &'static str {
    match status.as_deref() {
        Some("clean") => "clean",
        Some("unresolved") => "unresolved",
        _ => "no_checkpoint",
    }
}

// ---------------------------------------------------------------------------
// ws_id <-> slug helpers
// ---------------------------------------------------------------------------

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

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn wallets_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WALLETS_PATH_PREFIX)?
        .strip_suffix(WALLETS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct AuditStatusRpcRequest<'a> {
    _wallet_ids: &'a [String],
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceConfigRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct RoleMembershipRow {
    role_id: Option<String>,
}

#[derive(Deserialize)]
struct WhitelistRow {
    #[serde(default)]
    wallet_id: Option<String>,
    #[serde(default)]
    viewing_window: Option<String>,
    #[serde(default)]
    custom_days: Option<i64>,
}

#[derive(Deserialize)]
struct CreditWalletRow {
    wallet_id: String,
    #[serde(default)]
    limit: Value,
    #[serde(default)]
    statement_date: Value,
    #[serde(default)]
    payment_date: Value,
}

#[derive(Deserialize)]
struct AuditStatusRow {
    wallet_id: String,
    #[serde(default)]
    audited_balance: Option<Value>,
    #[serde(default)]
    latest_actual_balance: Option<Value>,
    #[serde(default)]
    latest_checked_at: Option<String>,
    #[serde(default)]
    latest_checkpoint_id: Option<String>,
    #[serde(default)]
    ledger_balance: Option<Value>,
    #[serde(default)]
    post_checkpoint_delta: Option<Value>,
    #[serde(default)]
    post_checkpoint_transaction_count: Option<Value>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    variance: Option<Value>,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_wallets_path() {
        assert_eq!(
            wallets_ws_id("/api/workspaces/abc-123/wallets"),
            Some("abc-123")
        );
    }

    #[test]
    fn path_guard_matches_uuid_ws_id() {
        let uuid = "00000000-0000-0000-0000-000000000001";
        let path = format!("/api/workspaces/{uuid}/wallets");
        assert_eq!(wallets_ws_id(&path), Some(uuid));
    }

    #[test]
    fn path_guard_rejects_v1_prefix() {
        assert_eq!(wallets_ws_id("/api/v1/workspaces/abc-123/wallets"), None);
    }

    #[test]
    fn path_guard_rejects_sub_path() {
        assert_eq!(wallets_ws_id("/api/workspaces/abc-123/wallets/extra"), None);
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert_eq!(wallets_ws_id("/api/workspaces//wallets"), None);
    }

    #[test]
    fn path_guard_rejects_unrelated_path() {
        assert_eq!(wallets_ws_id("/api/workspaces/abc-123/transactions"), None);
    }

    #[test]
    fn viewing_window_days_1_day() {
        assert_eq!(viewing_window_days(Some("1_day"), None), 1);
    }

    #[test]
    fn viewing_window_days_custom_valid() {
        assert_eq!(viewing_window_days(Some("custom"), Some(45)), 45);
    }

    #[test]
    fn viewing_window_days_custom_zero_falls_back() {
        assert_eq!(viewing_window_days(Some("custom"), Some(0)), 30);
    }

    #[test]
    fn viewing_window_days_none_defaults_to_30() {
        assert_eq!(viewing_window_days(None, None), 30);
    }

    #[test]
    fn checkpoint_number_from_finite_f64() {
        assert_eq!(checkpoint_number(Some(&json!(1.5))), 1.5);
    }

    #[test]
    fn checkpoint_number_from_string() {
        assert_eq!(checkpoint_number(Some(&json!("2.5"))), 2.5);
    }

    #[test]
    fn checkpoint_number_null_gives_zero() {
        assert_eq!(checkpoint_number(None), 0.0);
    }

    #[test]
    fn clamp_status_known_values() {
        assert_eq!(clamp_status(&Some("clean".to_owned())), "clean");
        assert_eq!(clamp_status(&Some("unresolved".to_owned())), "unresolved");
        assert_eq!(clamp_status(&Some("other".to_owned())), "no_checkpoint");
        assert_eq!(clamp_status(&None), "no_checkpoint");
    }

    #[test]
    fn is_workspace_uuid_literal_valid() {
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
    }

    #[test]
    fn is_workspace_uuid_literal_rejects_short() {
        assert!(!is_workspace_uuid_literal("abc"));
    }

    #[test]
    fn is_workspace_handle_valid() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("ws123"));
    }

    #[test]
    fn is_workspace_handle_rejects_empty() {
        assert!(!is_workspace_handle(""));
    }

    #[test]
    fn is_workspace_handle_rejects_leading_dash() {
        assert!(!is_workspace_handle("-bad"));
    }
}
