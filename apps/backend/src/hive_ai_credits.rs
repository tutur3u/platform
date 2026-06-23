use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const HIVE_AI_CREDITS_PATH: &str = "/api/v1/hive/ai/credits";
const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const CREDIT_BALANCE_RPC: &str = "get_or_create_credit_balance";

// Tier resolved as one of these literal strings; defaults to FREE.
const TIER_FREE: &str = "FREE";

// ---------------------------------------------------------------------------
// Row types
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

#[derive(Deserialize)]
struct WorkspaceSubscriptionRow {
    created_at: Option<String>,
    status: Option<String>,
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSubscriptionProductRow {
    id: String,
    tier: Option<String>,
}

#[derive(Deserialize)]
struct CreditBalanceRow {
    id: String,
    period_end: Option<String>,
    period_start: Option<String>,
    #[serde(default)]
    total_allocated: Option<serde_json::Value>,
    #[serde(default)]
    total_used: Option<serde_json::Value>,
    #[serde(default)]
    bonus_credits: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct CreditPackPurchaseRow {
    #[serde(default)]
    tokens_granted: Option<serde_json::Value>,
    #[serde(default)]
    tokens_remaining: Option<serde_json::Value>,
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct PlanAllocationRow {
    #[serde(default)]
    allowed_features: Option<Vec<String>>,
    #[serde(default)]
    allowed_models: Option<Vec<String>>,
    #[serde(default)]
    daily_limit: Option<serde_json::Value>,
    #[serde(default)]
    max_output_tokens_per_request: Option<serde_json::Value>,
    #[serde(default)]
    default_image_model: Option<String>,
    #[serde(default)]
    default_language_model: Option<String>,
}

#[derive(Deserialize)]
struct CreditTransactionRow {
    #[serde(default)]
    amount: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct WorkspaceSubscriptionSeatRow {
    #[serde(default)]
    seat_count: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Error handling mirroring HiveAiAccessError (message + status)
// ---------------------------------------------------------------------------

struct CreditError {
    status: u16,
    message: &'static str,
}

impl CreditError {
    const fn new(status: u16, message: &'static str) -> Self {
        Self { status, message }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_hive_ai_credits_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != HIVE_AI_CREDITS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => hive_ai_credits_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn hive_ai_credits_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user =
        match hive_access::authenticated_user(config, request, &HIVE_APP_SESSION_TARGETS, outbound)
            .await
        {
            Ok(user) => user,
            Err(()) => return error_response(401, "Unauthorized"),
        };

    let access =
        match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
            Ok(access) => access,
            Err(()) => return error_response(500, "Failed to resolve Hive access"),
        };

    if !access.has_access() {
        return error_response(403, "Hive access required");
    }

    let Some(ws_id) = query_value(request.url, "wsId").filter(|value| !value.is_empty()) else {
        return error_response(400, "wsId is required");
    };

    match get_hive_ai_credit_status(&config.contact_data, &user.id, &ws_id, outbound).await {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(error) => error_response(error.status, error.message),
    }
}

// ---------------------------------------------------------------------------
// getHiveAiCreditStatus port
// ---------------------------------------------------------------------------

async fn get_hive_ai_credit_status(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<serde_json::Value, CreditError> {
    let normalized_ws_id =
        resolve_hive_workspace_id(contact_data, user_id, ws_id, outbound).await?;
    let tier = normalize_tier(
        get_workspace_tier(contact_data, &normalized_ws_id, outbound)
            .await
            .as_deref(),
    );
    let balance_scope = if tier == TIER_FREE {
        "user"
    } else {
        "workspace"
    };

    // RPC: get_or_create_credit_balance
    let balance = credit_balance(contact_data, user_id, &normalized_ws_id, outbound)
        .await
        .map_err(|()| CreditError::new(500, "Failed to get credit balance"))?
        .ok_or_else(|| CreditError::new(500, "No credit balance found"))?;

    let included_allocated = to_f64(balance.total_allocated.as_ref());
    let included_used = to_f64(balance.total_used.as_ref());
    let bonus_credits = to_f64(balance.bonus_credits.as_ref());
    let included_remaining = included_allocated + bonus_credits - included_used;

    // Pay-as-you-go credit packs
    let payg_rows = credit_pack_purchases(contact_data, &normalized_ws_id, outbound)
        .await
        .map_err(|()| CreditError::new(500, "Failed to get pay-as-you-go balances"))?;

    let payg_total_granted = payg_rows
        .iter()
        .map(|row| to_f64(row.tokens_granted.as_ref()))
        .sum::<f64>();
    let payg_remaining = payg_rows
        .iter()
        .map(|row| to_f64(row.tokens_remaining.as_ref()))
        .sum::<f64>();
    let payg_used = payg_total_granted - payg_remaining;
    let next_expiry = payg_rows
        .iter()
        .filter_map(|row| row.expires_at.clone())
        .min();

    let total_allocated = included_allocated + payg_total_granted;
    let total_used = included_used + payg_used;
    let remaining = included_remaining + payg_remaining;
    let total_pool = total_allocated + bonus_credits;
    let percent_used = if total_pool > 0.0 {
        (total_used / total_pool) * 100.0
    } else {
        0.0
    };

    // Plan allocations (best-effort; errors fall back to defaults)
    let allocation = plan_allocation(contact_data, &tier, outbound)
        .await
        .unwrap_or(None);
    let (fallback_image_model, fallback_language_model) = fallback_default_models(&tier);

    let allowed_features = allocation
        .as_ref()
        .and_then(|allocation| allocation.allowed_features.clone())
        .unwrap_or_default();
    let allowed_models = allocation
        .as_ref()
        .and_then(|allocation| allocation.allowed_models.clone())
        .unwrap_or_default();
    let daily_limit = allocation
        .as_ref()
        .and_then(|allocation| optional_f64(allocation.daily_limit.as_ref()));
    let max_output_tokens = allocation
        .as_ref()
        .and_then(|allocation| optional_f64(allocation.max_output_tokens_per_request.as_ref()));
    let default_image_model = allocation
        .as_ref()
        .and_then(|allocation| allocation.default_image_model.clone())
        .unwrap_or(fallback_image_model);
    let default_language_model = allocation
        .as_ref()
        .and_then(|allocation| allocation.default_language_model.clone())
        .unwrap_or(fallback_language_model);

    // Daily usage from credit transactions (best-effort)
    let daily_used = daily_used(contact_data, &balance.id, outbound)
        .await
        .unwrap_or(0.0);

    // Seat count for workspace-scoped balances (best-effort)
    let seat_count = if balance_scope == "workspace" {
        seat_count(contact_data, &normalized_ws_id, outbound)
            .await
            .unwrap_or(None)
    } else {
        None
    };

    // NOTE: legacy also performs a best-effort Redis snapshot write
    // (writeAiCreditSnapshot). It never throws and does not affect the
    // response, so it is intentionally omitted from this port.

    Ok(json!({
        "allowedFeatures": allowed_features,
        "allowedModels": allowed_models,
        "balanceScope": balance_scope,
        "bonusCredits": bonus_credits,
        "dailyLimit": daily_limit,
        "dailyUsed": daily_used,
        "defaultImageModel": default_image_model,
        "defaultLanguageModel": default_language_model,
        "maxOutputTokens": max_output_tokens,
        "payg": {
            "nextExpiry": next_expiry,
            "remaining": payg_remaining,
            "totalGranted": payg_total_granted,
            "totalUsed": payg_used,
        },
        "percentUsed": percent_used,
        "periodEnd": balance.period_end,
        "periodStart": balance.period_start,
        "remaining": remaining,
        "seatCount": seat_count,
        "tier": tier,
        "totalAllocated": total_allocated,
        "totalUsed": total_used,
    }))
}

// ---------------------------------------------------------------------------
// resolveHiveWorkspaceId port
// ---------------------------------------------------------------------------

async fn resolve_hive_workspace_id(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, CreditError> {
    let trimmed = raw_ws_id.trim();
    let normalized_ws_id = if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        hive_personal_workspace_id(contact_data, user_id, outbound).await?
    } else {
        resolve_workspace_id(trimmed)
    };

    // verifyWorkspaceMembershipType (requiredType MEMBER, admin client)
    match workspace_membership_type(contact_data, &normalized_ws_id, user_id, outbound).await {
        Err(()) => Err(CreditError::new(500, "Failed to verify workspace access")),
        Ok(None) => Err(CreditError::new(403, "Workspace access denied")),
        Ok(Some(membership_type)) => {
            if membership_type == "MEMBER" {
                Ok(normalized_ws_id)
            } else {
                Err(CreditError::new(403, "Workspace access denied"))
            }
        }
    }
}

async fn hive_personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, CreditError> {
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
        return Err(CreditError::new(500, "Personal workspace lookup failed"));
    };

    let rows = service_role_get::<WorkspaceIdRow>(contact_data, &url, None, outbound)
        .await
        .map_err(|()| CreditError::new(500, "Personal workspace lookup failed"))?;

    rows.into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or_else(|| CreditError::new(404, "Personal workspace not found"))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
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

    let rows =
        service_role_get::<WorkspaceMembershipRow>(contact_data, &url, None, outbound).await?;

    Ok(rows.into_iter().next().and_then(|row| row.membership_type))
}

// ---------------------------------------------------------------------------
// getWorkspaceTier port (-> getWorkspaceTierMap)
// ---------------------------------------------------------------------------

async fn get_workspace_tier(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    let resolved_ws_id = resolve_workspace_id(ws_id);

    // Confirm the workspace exists.
    let workspace_url = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{resolved_ws_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;
    let workspace_rows =
        service_role_get::<WorkspaceIdRow>(contact_data, &workspace_url, None, outbound)
            .await
            .ok()?;
    let workspace_id = workspace_rows.into_iter().next().and_then(|row| row.id)?;

    // Active subscriptions for the workspace.
    let subscriptions_url = contact_data.rest_url(
        "workspace_subscriptions",
        &[
            ("select", "ws_id,created_at,status,product_id".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
        ],
    )?;
    let mut subscriptions = service_role_get::<WorkspaceSubscriptionRow>(
        contact_data,
        &subscriptions_url,
        None,
        outbound,
    )
    .await
    .ok()?;

    // Resolve product tiers via private.workspace_subscription_products.
    let product_ids: Vec<String> = subscriptions
        .iter()
        .filter_map(|subscription| subscription.product_id.clone())
        .collect();
    let mut tier_by_product: std::collections::HashMap<String, Option<String>> =
        std::collections::HashMap::new();

    if !product_ids.is_empty() {
        let in_filter = format!("in.({})", product_ids.join(","));
        let products_url = contact_data.rest_url(
            "workspace_subscription_products",
            &[("select", "id,tier".to_owned()), ("id", in_filter)],
        )?;
        let products = service_role_get::<WorkspaceSubscriptionProductRow>(
            contact_data,
            &products_url,
            Some(PRIVATE_SCHEMA),
            outbound,
        )
        .await
        .ok()?;
        for product in products {
            tier_by_product.insert(product.id, product.tier);
        }
    }

    // extractTierFromSubscriptions: active only, sorted by created_at desc, take first.
    subscriptions.retain(|subscription| subscription.status.as_deref() == Some("active"));
    subscriptions.sort_by(|a, b| {
        b.created_at
            .as_deref()
            .unwrap_or("")
            .cmp(a.created_at.as_deref().unwrap_or(""))
    });

    subscriptions
        .into_iter()
        .next()
        .and_then(|subscription| subscription.product_id)
        .and_then(|product_id| tier_by_product.get(&product_id).cloned())
        .flatten()
}

// ---------------------------------------------------------------------------
// Credit balance RPC
// ---------------------------------------------------------------------------

async fn credit_balance(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<CreditBalanceRow>, ()> {
    let url = contact_data.rpc_url(CREDIT_BALANCE_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "p_user_id": user_id, "p_ws_id": ws_id }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // RPC may return an array of rows or a single object; firstRow() in legacy.
    if let Ok(rows) = response.json::<Vec<CreditBalanceRow>>() {
        return Ok(rows.into_iter().next());
    }

    Ok(response.json::<CreditBalanceRow>().ok())
}

// ---------------------------------------------------------------------------
// Pay-as-you-go credit pack purchases
// ---------------------------------------------------------------------------

async fn credit_pack_purchases(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<CreditPackPurchaseRow>, ()> {
    let now = now_iso8601();
    let Some(url) = contact_data.rest_url(
        "workspace_credit_pack_purchases",
        &[
            (
                "select",
                "tokens_granted,tokens_remaining,expires_at,status".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "in.(active,canceled)".to_owned()),
            ("expires_at", format!("gt.{now}")),
        ],
    ) else {
        return Err(());
    };

    service_role_get::<CreditPackPurchaseRow>(contact_data, &url, None, outbound).await
}

// ---------------------------------------------------------------------------
// Plan allocations
// ---------------------------------------------------------------------------

async fn plan_allocation(
    contact_data: &contact::ContactDataConfig,
    tier: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<PlanAllocationRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "ai_credit_plan_allocations",
        &[
            ("select", "*".to_owned()),
            ("tier", format!("eq.{tier}")),
            ("is_active", "eq.true".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let rows = service_role_get::<PlanAllocationRow>(contact_data, &url, None, outbound).await?;
    Ok(rows.into_iter().next())
}

// ---------------------------------------------------------------------------
// Daily usage
// ---------------------------------------------------------------------------

async fn daily_used(
    contact_data: &contact::ContactDataConfig,
    balance_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<f64, ()> {
    let today_start = today_utc_start_iso8601();
    let Some(url) = contact_data.rest_url(
        "ai_credit_transactions",
        &[
            ("select", "amount".to_owned()),
            ("balance_id", format!("eq.{balance_id}")),
            ("transaction_type", "eq.deduction".to_owned()),
            ("created_at", format!("gte.{today_start}")),
        ],
    ) else {
        return Err(());
    };

    let rows = service_role_get::<CreditTransactionRow>(contact_data, &url, None, outbound).await?;
    Ok(rows
        .iter()
        .map(|row| to_f64(row.amount.as_ref()).abs())
        .sum::<f64>())
}

// ---------------------------------------------------------------------------
// Seat count
// ---------------------------------------------------------------------------

async fn seat_count(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
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

    let rows = service_role_get::<WorkspaceSubscriptionSeatRow>(contact_data, &url, None, outbound)
        .await?;
    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| optional_f64(row.seat_count.as_ref())))
}

// ---------------------------------------------------------------------------
// Shared service-role GET helper
// ---------------------------------------------------------------------------

async fn service_role_get<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    url: &str,
    schema: Option<&str>,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<T>, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        request = request
            .with_header("Accept-Profile", schema)
            .with_header("Content-Profile", schema);
    }

    let response: OutboundResponse = outbound.send(request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<T>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn normalize_tier(value: Option<&str>) -> String {
    match value {
        Some("ENTERPRISE") => "ENTERPRISE",
        Some("PLUS") => "PLUS",
        Some("PRO") => "PRO",
        _ => TIER_FREE,
    }
    .to_owned()
}

fn fallback_default_models(tier: &str) -> (String, String) {
    let image_model = if tier == TIER_FREE {
        "google/imagen-4.0-fast-generate-001"
    } else {
        "google/imagen-4.0-generate-001"
    };

    (
        image_model.to_owned(),
        "google/gemini-2.5-flash-lite".to_owned(),
    )
}

/// Number(value ?? 0) — null/undefined => 0, numbers and numeric strings parsed.
fn to_f64(value: Option<&serde_json::Value>) -> f64 {
    optional_f64(value).unwrap_or(0.0)
}

/// Coerce a JSON value (number or numeric string) to f64, mirroring Number().
fn optional_f64(value: Option<&serde_json::Value>) -> Option<f64> {
    match value {
        None | Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::Number(number)) => number.as_f64(),
        Some(serde_json::Value::String(text)) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = url::Url::parse(request_url?).ok()?;
    url.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Time helpers (ISO-8601 UTC, matching JS Date#toISOString output shape)
// ---------------------------------------------------------------------------

fn unix_millis_now() -> i64 {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    duration.as_secs() as i64 * 1_000 + i64::from(duration.subsec_millis())
}

fn now_iso8601() -> String {
    unix_millis_to_iso_timestamp(unix_millis_now())
}

/// Start of the current UTC day (00:00:00.000Z), matching `setUTCHours(0,0,0,0)`.
fn today_utc_start_iso8601() -> String {
    let millis = unix_millis_now();
    let day_millis = millis.div_euclid(86_400_000) * 86_400_000;
    unix_millis_to_iso_timestamp(day_millis)
}

fn unix_millis_to_iso_timestamp(unix_millis: i64) -> String {
    let seconds = unix_millis.div_euclid(1_000);
    let millis = unix_millis.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    (year + if month <= 2 { 1 } else { 0 }, month, day)
}
