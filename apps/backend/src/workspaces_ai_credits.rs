use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACES_AI_CREDITS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_AI_CREDITS_PATH_SUFFIX: &str = "/ai/credits";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// App-session targets allowed by the legacy route (`allowAppSessionAuth`).
const AI_CREDITS_APP_SESSION_TARGETS: &[&str] = &["chat", "mind", "tasks"];

const RESOLVE_WORKSPACE_TIER_RPC: &str = "_resolve_workspace_tier";
const GET_OR_CREATE_CREDIT_BALANCE_RPC: &str = "get_or_create_credit_balance";

// ---------------------------------------------------------------------------
// Supabase row/RPC types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Serialize)]
struct ResolveWorkspaceTierRpcRequest<'a> {
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct GetOrCreateCreditBalanceRpcRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
}

#[derive(Deserialize)]
struct CreditBalanceRow {
    id: Option<String>,
    #[serde(default)]
    total_allocated: Option<Value>,
    #[serde(default)]
    total_used: Option<Value>,
    #[serde(default)]
    bonus_credits: Option<Value>,
    #[serde(default)]
    period_start: Option<Value>,
    #[serde(default)]
    period_end: Option<Value>,
}

#[derive(Deserialize)]
struct PaygRow {
    #[serde(default)]
    tokens_granted: Option<Value>,
    #[serde(default)]
    tokens_remaining: Option<Value>,
    #[serde(default)]
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct AllocationRow {
    #[serde(default)]
    allowed_features: Option<Vec<String>>,
    #[serde(default)]
    allowed_models: Option<Vec<String>>,
    #[serde(default)]
    daily_limit: Option<Value>,
    #[serde(default)]
    default_image_model: Option<String>,
    #[serde(default)]
    default_language_model: Option<String>,
    #[serde(default)]
    max_output_tokens_per_request: Option<Value>,
}

#[derive(Deserialize)]
struct CreditTransactionRow {
    #[serde(default)]
    amount: Option<Value>,
}

#[derive(Deserialize)]
struct WorkspaceSubscriptionRow {
    #[serde(default)]
    seat_count: Option<Value>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_ai_credits_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspaces_ai_credits_ws_id(request.path)?;

    Some(match request.method {
        "GET" => ai_credits_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn ai_credits_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Resolve the caller identity from a Supabase access token, or from an
    // allowed app-session token (chat/mind/tasks), mirroring the legacy
    // `withSessionAuth({ allowAppSessionAuth })` behavior.
    let Some(user_id) = resolve_user_id(config, request, outbound).await else {
        return message_response(401, "Unauthorized");
    };

    // Resolve the workspace id (handles the `personal` slug + `internal` alias).
    let resolved_ws_id =
        match resolve_ai_credits_workspace_id(&config.contact_data, outbound, raw_ws_id, &user_id)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response("Failed to get AI credit status"),
        };

    // Workspace membership check (legacy: verifyWorkspaceMembershipType).
    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, "Workspace access denied"),
        Err(()) => return message_response(500, "Failed to verify workspace membership"),
    }

    // Resolve workspace tier (default FREE).
    let tier = resolve_workspace_tier(&config.contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or_else(|| "FREE".to_owned());

    let balance_scope = if tier == "FREE" { "user" } else { "workspace" };

    // Get or create current period balance.
    let balance = match get_or_create_credit_balance(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
    )
    .await
    {
        Ok(Some(balance)) => balance,
        Ok(None) => return message_response(500, "No balance found"),
        Err(()) => return message_response(500, "Failed to get credit balance"),
    };

    let Some(balance_id) = balance.id.clone() else {
        return message_response(500, "No balance found");
    };

    let included_allocated = value_to_number(balance.total_allocated.as_ref());
    let included_used = value_to_number(balance.total_used.as_ref());
    let bonus_credits = value_to_number(balance.bonus_credits.as_ref());
    let included_remaining = included_allocated + bonus_credits - included_used;

    // Pay-as-you-go credit packs (active/canceled, not yet expired).
    let now_iso = current_utc_iso();
    let payg_rows =
        match fetch_payg_rows(&config.contact_data, outbound, &resolved_ws_id, &now_iso).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, "Failed to get pay-as-you-go balances"),
        };

    let payg_total_granted: f64 = payg_rows
        .iter()
        .map(|row| value_to_number(row.tokens_granted.as_ref()))
        .sum();
    let payg_remaining: f64 = payg_rows
        .iter()
        .map(|row| value_to_number(row.tokens_remaining.as_ref()))
        .sum();
    let payg_used = payg_total_granted - payg_remaining;

    let mut expiries: Vec<&str> = payg_rows
        .iter()
        .filter_map(|row| row.expires_at.as_deref())
        .collect();
    // ISO-8601 UTC strings sort lexicographically in chronological order.
    expiries.sort_unstable();
    let next_expiry = expiries.first().map(|value| value.to_string());

    let total_allocated = included_allocated + payg_total_granted;
    let total_used = included_used + payg_used;
    let remaining = included_remaining + payg_remaining;
    let total_pool = total_allocated + bonus_credits;
    let percent_used = if total_pool > 0.0 {
        (total_used / total_pool) * 100.0
    } else {
        0.0
    };

    // Tier allocation (best-effort; missing rows fall back to defaults).
    let allocation = fetch_allocation(&config.contact_data, outbound, &tier).await;

    let (fallback_image_model, fallback_language_model) = fallback_default_models(&tier);

    let allowed_models = allocation
        .as_ref()
        .and_then(|allocation| allocation.allowed_models.clone())
        .unwrap_or_default();
    let allowed_features = allocation
        .as_ref()
        .and_then(|allocation| allocation.allowed_features.clone())
        .unwrap_or_default();
    let daily_limit = allocation
        .as_ref()
        .and_then(|allocation| allocation.daily_limit.as_ref())
        .map(|value| value_to_number(Some(value)));
    let max_output_tokens = allocation
        .as_ref()
        .and_then(|allocation| allocation.max_output_tokens_per_request.as_ref())
        .map(|value| value_to_number(Some(value)));
    let default_image_model = allocation
        .as_ref()
        .and_then(|allocation| allocation.default_image_model.clone())
        .unwrap_or(fallback_image_model);
    let default_language_model = allocation
        .as_ref()
        .and_then(|allocation| allocation.default_language_model.clone())
        .unwrap_or(fallback_language_model);

    // Daily usage (scoped to the balance).
    let today_start = current_utc_day_start_iso();
    let daily_transactions =
        fetch_daily_transactions(&config.contact_data, outbound, &balance_id, &today_start)
            .await
            .unwrap_or_default();
    let daily_used: f64 = daily_transactions
        .iter()
        .map(|transaction| value_to_number(transaction.amount.as_ref()).abs())
        .sum();

    // Seat count for PAID workspaces.
    let seat_count = if balance_scope == "workspace" {
        fetch_seat_count(&config.contact_data, outbound, &resolved_ws_id)
            .await
            .unwrap_or(None)
    } else {
        None
    };

    // NOTE: the legacy route also calls `writeAiCreditSnapshot(...)` to warm a
    // KV cache. That side effect is intentionally not replicated here (see
    // module notes) because it is a best-effort cache write and the Worker
    // backend has no equivalent binding wired through this handler.

    let body = json!({
        "totalAllocated": number_value(total_allocated),
        "totalUsed": number_value(total_used),
        "remaining": number_value(remaining),
        "bonusCredits": number_value(bonus_credits),
        "percentUsed": number_value(percent_used),
        "included": {
            "totalAllocated": number_value(included_allocated),
            "totalUsed": number_value(included_used),
            "bonusCredits": number_value(bonus_credits),
            "remaining": number_value(included_remaining),
        },
        "payg": {
            "totalGranted": number_value(payg_total_granted),
            "totalUsed": number_value(payg_used),
            "remaining": number_value(payg_remaining),
            "nextExpiry": next_expiry,
        },
        "periodStart": balance.period_start.clone().unwrap_or(Value::Null),
        "periodEnd": balance.period_end.clone().unwrap_or(Value::Null),
        "tier": tier,
        "allowedModels": allowed_models,
        "allowedFeatures": allowed_features,
        "defaultImageModel": default_image_model,
        "defaultLanguageModel": default_language_model,
        "dailyLimit": daily_limit.map(number_value),
        "dailyUsed": number_value(daily_used),
        "maxOutputTokens": max_output_tokens.map(number_value),
        "balanceScope": balance_scope,
        "seatCount": seat_count.map(number_value),
    });

    no_store_response(json_response(200, body))
}

// ---------------------------------------------------------------------------
// Auth / identity
// ---------------------------------------------------------------------------

async fn resolve_user_id(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    // Prefer an app-session identity when an app-session token is present.
    if contact::request_has_app_session_token(request) {
        return contact::resolve_app_session_identity(
            config,
            request,
            AI_CREDITS_APP_SESSION_TARGETS,
        )
        .ok()
        .map(|identity| identity.id)
        .filter(|id| !id.trim().is_empty());
    }

    let access_token = supabase_auth::request_access_token(request)?;
    supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
        .await
        .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
}

// ---------------------------------------------------------------------------
// Workspace resolution + membership
// ---------------------------------------------------------------------------

async fn resolve_ai_credits_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
) -> Result<String, ()> {
    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id).await;
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG)
    {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    Ok(raw_ws_id.to_owned())
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<String, ()> {
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn verify_workspace_member(
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        .is_some())
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

async fn resolve_workspace_tier(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Option<String> {
    let rpc_url = contact_data.rpc_url(RESOLVE_WORKSPACE_TIER_RPC)?;
    let body = serde_json::to_string(&ResolveWorkspaceTierRpcRequest { p_ws_id: ws_id }).ok()?;
    let response = send_service_role_rpc(contact_data, outbound, &rpc_url, &body)
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    // The RPC returns a scalar tier string (possibly JSON-encoded).
    response
        .json::<Value>()
        .ok()
        .and_then(|value| value.as_str().map(|tier| tier.to_owned()))
        .filter(|tier| !tier.is_empty())
}

async fn get_or_create_credit_balance(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<CreditBalanceRow>, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_OR_CREATE_CREDIT_BALANCE_RPC)
        .ok_or(())?;
    let body = serde_json::to_string(&GetOrCreateCreditBalanceRpcRequest {
        p_ws_id: ws_id,
        p_user_id: user_id,
    })
    .map_err(|_| ())?;
    let response = send_service_role_rpc(contact_data, outbound, &rpc_url, &body).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // The RPC may return a single row object or an array of rows.
    let value = response.json::<Value>().map_err(|_| ())?;
    let row = match value {
        Value::Array(mut rows) => {
            if rows.is_empty() {
                return Ok(None);
            }
            serde_json::from_value::<CreditBalanceRow>(rows.remove(0)).map_err(|_| ())?
        }
        Value::Null => return Ok(None),
        other => serde_json::from_value::<CreditBalanceRow>(other).map_err(|_| ())?,
    };

    Ok(Some(row))
}

// ---------------------------------------------------------------------------
// REST table reads
// ---------------------------------------------------------------------------

async fn fetch_payg_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    now_iso: &str,
) -> Result<Vec<PaygRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_credit_pack_purchases",
        &[
            (
                "select",
                "tokens_granted,tokens_remaining,expires_at,status".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "in.(active,canceled)".to_owned()),
            ("expires_at", format!("gt.{now_iso}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<PaygRow>>().map_err(|_| ())
}

async fn fetch_allocation(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    tier: &str,
) -> Option<AllocationRow> {
    let url = contact_data.rest_url(
        "ai_credit_plan_allocations",
        &[
            ("select", "*".to_owned()),
            ("tier", format!("eq.{tier}")),
            ("is_active", "eq.true".to_owned()),
            ("limit", "1".to_owned()),
        ],
    )?;
    let response = send_service_role_rest_request(contact_data, outbound, &url)
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    response
        .json::<Vec<AllocationRow>>()
        .ok()
        .and_then(|rows| rows.into_iter().next())
}

async fn fetch_daily_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    balance_id: &str,
    today_start_iso: &str,
) -> Result<Vec<CreditTransactionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "ai_credit_transactions",
        &[
            ("select", "amount".to_owned()),
            ("balance_id", format!("eq.{balance_id}")),
            ("transaction_type", "eq.deduction".to_owned()),
            ("created_at", format!("gte.{today_start_iso}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<CreditTransactionRow>>().map_err(|_| ())
}

async fn fetch_seat_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<f64>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_subscriptions",
        &[
            ("select", "seat_count".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "eq.active".to_owned()),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSubscriptionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| {
            row.seat_count
                .as_ref()
                .map(|value| value_to_number(Some(value)))
        }))
}

// ---------------------------------------------------------------------------
// Outbound helpers (copied from the workspace_habits_access reference shape).
// ---------------------------------------------------------------------------

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

async fn send_service_role_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    rpc_url: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

fn fallback_default_models(tier: &str) -> (String, String) {
    let image = if tier == "FREE" {
        "google/imagen-4.0-fast-generate-001"
    } else {
        "google/imagen-4.0-generate-001"
    };
    (image.to_owned(), "google/gemini-3.1-flash-lite".to_owned())
}

/// Coerce a JSON value (number, numeric string, bool, or null) into an f64,
/// mirroring the legacy `Number(value ?? 0)` semantics.
fn value_to_number(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        Some(Value::String(text)) => text.trim().parse::<f64>().unwrap_or(0.0),
        Some(Value::Bool(flag)) if *flag => 1.0,
        _ => 0.0,
    }
}

/// Build a JSON number value, preferring an integer representation when the
/// value is integral (matching JS number serialization for whole numbers).
fn number_value(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 9.007_199_254_740_992e15 {
        json!(value as i64)
    } else if let Some(number) = serde_json::Number::from_f64(value) {
        Value::Number(number)
    } else {
        json!(0)
    }
}

// ---------------------------------------------------------------------------
// Time helpers (no chrono dependency; compute ISO-8601 UTC strings inline).
// ---------------------------------------------------------------------------

fn unix_seconds_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn current_utc_iso() -> String {
    iso_from_unix_seconds(unix_seconds_now())
}

fn current_utc_day_start_iso() -> String {
    let seconds = unix_seconds_now();
    let day_start = seconds - seconds.rem_euclid(86_400);
    iso_from_unix_seconds(day_start)
}

/// Convert a UTC unix timestamp (seconds) into an ISO-8601 string with a
/// trailing `Z`, e.g. `2026-06-24T00:00:00.000Z`, matching JS `toISOString`.
fn iso_from_unix_seconds(total_seconds: i64) -> String {
    let days = total_seconds.div_euclid(86_400);
    let seconds_of_day = total_seconds.rem_euclid(86_400);

    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

/// Days since the Unix epoch -> (year, month, day), via Howard Hinnant's
/// civil-from-days algorithm.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = if month <= 2 { year + 1 } else { year };

    (year, month, day)
}

// ---------------------------------------------------------------------------
// Path matching + responses
// ---------------------------------------------------------------------------

fn workspaces_ai_credits_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_AI_CREDITS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_AI_CREDITS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn error_response(message: &str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "error": message })))
}
