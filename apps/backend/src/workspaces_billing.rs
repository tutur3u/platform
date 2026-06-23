//! GET /api/v1/workspaces/:wsId/billing
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/billing/route.ts`.
//!
//! Auth: caller must be authenticated (Supabase session) and must hold the
//! `manage_subscription` permission for the workspace (checked via the
//! `has_workspace_permission` RPC, mirroring the legacy
//! `checkManageSubscriptionPermission`). All Supabase reads here use the
//! service-role key, exactly like the legacy route's `createAdminClient()`
//! (`sbAdmin`) usage, so RLS is intentionally bypassed and the explicit
//! permission check is the gate.
//!
//! Polar: the legacy route fetches product catalog (`fetchProducts`) and the
//! subscription seat list (`fetchSubscription` -> `customerSeats.listSeats`)
//! from the external Polar API. The Rust `BackendConfig` does not yet carry
//! Polar credentials, and the worker target cannot read process env, so Polar
//! data is fetched best-effort via env (`POLAR_ACCESS_TOKEN`, `POLAR_SANDBOX`)
//! only on the native target. When unavailable, `products` falls back to `[]`
//! and `seatList` falls back to `[]`, which matches the legacy error-path
//! behavior (both helpers swallow Polar errors and return empty). See notes.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const BILLING_PATH_PREFIX: &str = "/api/v1/workspaces/";
const BILLING_PATH_SUFFIX: &str = "/billing";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const MANAGE_SUBSCRIPTION_PERMISSION: &str = "manage_subscription";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const SEAT_ACTIVE_STATUSES: &[&str] = &["active", "trialing"];

pub(crate) async fn handle_workspaces_billing_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = billing_ws_id(request.path)?;

    Some(match request.method {
        "GET" => billing_get_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn billing_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate user.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "UNAUTHORIZED");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "UNAUTHORIZED");
    };

    let ws_id = resolve_workspace_id(raw_ws_id);

    // Permission gate (manage_subscription).
    match has_manage_subscription_permission(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "FORBIDDEN"),
        // Legacy `checkManageSubscriptionPermission` returns false on error,
        // which produces a 403. Mirror that fail-closed behavior.
        Err(()) => return error_response(403, "FORBIDDEN"),
    }

    // Fetch billing data (legacy fetches these in parallel; here sequentially).
    let is_personal = is_personal_workspace(contact_data, outbound, &ws_id)
        .await
        .unwrap_or(false);

    let subscription = match fetch_subscription(contact_data, outbound, &ws_id).await {
        Ok(value) => value,
        Err(()) => None,
    };

    // Subscription creation/lookup failure -> 404 (matches legacy).
    let Some(subscription) = subscription else {
        return error_response(404, "SUBSCRIPTION_NOT_FOUND");
    };

    let products = fetch_products(outbound).await.unwrap_or_default();
    let credit_packs = fetch_credit_packs(contact_data, outbound)
        .await
        .unwrap_or_default();
    let seat_status = get_seat_status(contact_data, outbound, &ws_id).await;
    let orders = fetch_workspace_orders(contact_data, outbound, &ws_id)
        .await
        .unwrap_or_default();

    let seat_list = subscription.seat_list.clone();

    let payload = json!({
        "isPersonalWorkspace": is_personal,
        "subscription": subscription,
        "products": products,
        "creditPacks": credit_packs,
        "orders": orders,
        "seatList": seat_list,
        "seatStatus": seat_status,
    });

    no_store_response(json_response(200, payload))
}

// ---------------------------------------------------------------------------
// Permission / workspace helpers
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

async fn has_manage_subscription_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: MANAGE_SUBSCRIPTION_PERMISSION,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");
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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

#[derive(Deserialize)]
struct WorkspacePersonalRow {
    personal: Option<bool>,
}

/// Mirrors `isPersonalWorkspace(wsId)`: looks up the workspace's `personal`
/// flag. Resolved IDs are uuids here (root workspace is never personal).
async fn is_personal_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    if ws_id == ROOT_WORKSPACE_ID {
        return Ok(false);
    }

    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "personal".to_owned()),
                ("id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspacePersonalRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.personal)
        .unwrap_or(false))
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceSubscriptionRow {
    id: Option<Value>,
    status: Option<Value>,
    created_at: Option<Value>,
    current_period_start: Option<Value>,
    current_period_end: Option<Value>,
    cancel_at_period_end: Option<Value>,
    product_id: Option<String>,
    seat_count: Option<Value>,
    polar_subscription_id: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
struct SubscriptionProductRow {
    id: Option<Value>,
    name: Option<Value>,
    description: Option<Value>,
    price: Option<Value>,
    recurring_interval: Option<Value>,
    tier: Option<Value>,
    pricing_model: Option<Value>,
    price_per_seat: Option<Value>,
    max_seats: Option<Value>,
}

#[derive(Serialize)]
struct SubscriptionPayload {
    id: Value,
    status: Value,
    #[serde(rename = "createdAt")]
    created_at: Value,
    #[serde(rename = "currentPeriodStart")]
    current_period_start: Value,
    #[serde(rename = "currentPeriodEnd")]
    current_period_end: Value,
    #[serde(rename = "cancelAtPeriodEnd")]
    cancel_at_period_end: Value,
    product: SubscriptionProductRow,
    #[serde(rename = "seatCount")]
    seat_count: Value,
    #[serde(rename = "seatList")]
    seat_list: Value,
}

/// Mirrors `fetchSubscription(polar, sbAdmin, wsId)`.
/// Returns `Ok(None)` when no active subscription/product is found (the
/// legacy helper returns `null`, which the route maps to a 404).
async fn fetch_subscription(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<SubscriptionPayload>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_subscriptions",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("status", "eq.active".to_owned()),
                ("order", "created_at.desc".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let Some(db_sub) = response
        .json::<Vec<WorkspaceSubscriptionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };

    let Some(product_id) = db_sub.product_id.filter(|id| !id.trim().is_empty()) else {
        return Ok(None);
    };

    let Some(product) = fetch_subscription_product(contact_data, outbound, &product_id).await?
    else {
        return Ok(None);
    };

    // Seat list comes from Polar; best-effort, empty on failure (legacy parity).
    let seat_list = match &db_sub.polar_subscription_id {
        Some(polar_subscription_id) if !polar_subscription_id.trim().is_empty() => {
            fetch_seat_list(outbound, polar_subscription_id)
                .await
                .unwrap_or_else(|| Value::Array(Vec::new()))
        }
        _ => Value::Array(Vec::new()),
    };

    Ok(Some(SubscriptionPayload {
        id: db_sub.id.unwrap_or(Value::Null),
        status: db_sub.status.unwrap_or(Value::Null),
        created_at: db_sub.created_at.unwrap_or(Value::Null),
        current_period_start: db_sub.current_period_start.unwrap_or(Value::Null),
        current_period_end: db_sub.current_period_end.unwrap_or(Value::Null),
        cancel_at_period_end: db_sub.cancel_at_period_end.unwrap_or(Value::Null),
        product,
        seat_count: db_sub.seat_count.unwrap_or(Value::Null),
        seat_list,
    }))
}

async fn fetch_subscription_product(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_id: &str,
) -> Result<Option<SubscriptionProductRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_subscription_products",
            &[
                (
                    "select",
                    "id,name,description,price,recurring_interval,tier,pricing_model,price_per_seat,max_seats"
                        .to_owned(),
                ),
                ("id", format!("eq.{product_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response =
        send_service_role_get(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<SubscriptionProductRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

// ---------------------------------------------------------------------------
// Credit packs (private schema)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CreditPackRow {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
    price: Option<Value>,
    currency: Option<String>,
    tokens: Option<Value>,
    expiry_days: Option<Value>,
    archived: Option<bool>,
}

#[derive(Serialize)]
struct CreditPackPayload {
    id: Option<String>,
    name: String,
    description: Option<String>,
    price: f64,
    currency: String,
    tokens: f64,
    #[serde(rename = "expiryDays")]
    expiry_days: f64,
    archived: bool,
}

async fn fetch_credit_packs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<CreditPackPayload>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_credit_packs",
            &[
                ("select", "*".to_owned()),
                ("archived", "eq.false".to_owned()),
                ("order", "price.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response =
        send_service_role_get(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        // Legacy returns [] on error.
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<CreditPackRow>>().map_err(|_| ())?;

    Ok(rows
        .into_iter()
        .map(|pack| CreditPackPayload {
            id: pack.id,
            name: pack.name.unwrap_or_default(),
            description: pack.description,
            price: number_value(pack.price.as_ref()),
            currency: pack
                .currency
                .unwrap_or_else(|| "usd".to_owned())
                .to_lowercase(),
            tokens: number_value(pack.tokens.as_ref()),
            expiry_days: number_value(pack.expiry_days.as_ref()),
            archived: pack.archived.unwrap_or(false),
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct OrderRow {
    id: Option<Value>,
    created_at: Option<Value>,
    billing_reason: Option<String>,
    total_amount: Option<Value>,
    currency: Option<String>,
    status: Option<Value>,
    product_id: Option<String>,
    credit_pack_id: Option<String>,
}

#[derive(Deserialize)]
struct OrderProductRow {
    id: Option<String>,
    name: Option<String>,
    price: Option<Value>,
}

#[derive(Serialize)]
struct OrderPayload {
    id: Value,
    #[serde(rename = "createdAt")]
    created_at: Value,
    #[serde(rename = "billingReason")]
    billing_reason: String,
    #[serde(rename = "totalAmount")]
    total_amount: Value,
    #[serde(rename = "originalAmount")]
    original_amount: f64,
    currency: String,
    status: Value,
    #[serde(rename = "productName")]
    product_name: String,
}

async fn fetch_workspace_orders(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<OrderPayload>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_orders",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.desc".to_owned()),
                ("limit", "10".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Ok(Vec::new());
    }

    let order_rows = response.json::<Vec<OrderRow>>().map_err(|_| ())?;

    let mut subscription_product_ids: Vec<String> = Vec::new();
    let mut credit_pack_ids: Vec<String> = Vec::new();
    for order in &order_rows {
        if let Some(id) = order.product_id.as_ref().filter(|id| !id.is_empty()) {
            if !subscription_product_ids
                .iter()
                .any(|existing| existing == id)
            {
                subscription_product_ids.push(id.clone());
            }
        }
        if let Some(id) = order.credit_pack_id.as_ref().filter(|id| !id.is_empty()) {
            if !credit_pack_ids.iter().any(|existing| existing == id) {
                credit_pack_ids.push(id.clone());
            }
        }
    }

    let subscription_products = if subscription_product_ids.is_empty() {
        Vec::new()
    } else {
        fetch_order_subscription_products(contact_data, outbound, &subscription_product_ids).await?
    };
    let credit_packs = if credit_pack_ids.is_empty() {
        Vec::new()
    } else {
        fetch_order_credit_packs(contact_data, outbound, &credit_pack_ids).await?
    };

    Ok(order_rows
        .into_iter()
        .map(|order| {
            let credit_pack = order.credit_pack_id.as_ref().and_then(|id| {
                credit_packs
                    .iter()
                    .find(|p| p.id.as_deref() == Some(id.as_str()))
            });
            let subscription_product = order.product_id.as_ref().and_then(|id| {
                subscription_products
                    .iter()
                    .find(|p| p.id.as_deref() == Some(id.as_str()))
            });

            let original_amount = subscription_product
                .and_then(|p| p.price.as_ref().map(number_value_ref))
                .or_else(|| credit_pack.and_then(|p| p.price.as_ref().map(number_value_ref)))
                .unwrap_or(0.0);
            let product_name = subscription_product
                .and_then(|p| p.name.clone())
                .or_else(|| credit_pack.and_then(|p| p.name.clone()))
                .unwrap_or_else(|| "N/A".to_owned());

            OrderPayload {
                id: order.id.unwrap_or(Value::Null),
                created_at: order.created_at.unwrap_or(Value::Null),
                billing_reason: order.billing_reason.unwrap_or_else(|| "unknown".to_owned()),
                total_amount: order.total_amount.unwrap_or(Value::Number(0.into())),
                original_amount,
                currency: order.currency.unwrap_or_else(|| "usd".to_owned()),
                status: order.status.unwrap_or(Value::Null),
                product_name,
            }
        })
        .collect())
}

async fn fetch_order_subscription_products(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ids: &[String],
) -> Result<Vec<OrderProductRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_subscription_products",
            &[
                ("select", "id,name,price".to_owned()),
                ("id", in_filter(ids)),
            ],
        )
        .ok_or(())?;
    let response =
        send_service_role_get(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        // Legacy: a fetch error here aborts orders to []. Surface as Err so the
        // caller falls back to [] via unwrap_or_default.
        return Err(());
    }

    response.json::<Vec<OrderProductRow>>().map_err(|_| ())
}

async fn fetch_order_credit_packs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ids: &[String],
) -> Result<Vec<OrderProductRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_credit_packs",
            &[
                ("select", "id,name,price".to_owned()),
                ("id", in_filter(ids)),
            ],
        )
        .ok_or(())?;
    let response =
        send_service_role_get(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<OrderProductRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Seat status
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SeatSubscriptionRow {
    seat_count: Option<Value>,
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct SeatProductRow {
    pricing_model: Option<String>,
    price_per_seat: Option<Value>,
}

/// Mirrors `getSeatStatus(sbAdmin, wsId)`. Returns a JSON object. Note: the
/// legacy code uses `Infinity` for non-seat-based seatCount/availableSeats;
/// JSON cannot represent Infinity, and `NextResponse.json` serializes
/// `Infinity` to `null`. We emit `null` to match the wire output.
async fn get_seat_status(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Value {
    // Conservative fail-closed default matching legacy error branches.
    let conservative = json!({
        "isSeatBased": true,
        "seatCount": 0,
        "memberCount": 0,
        "availableSeats": 0,
        "canAddMember": false,
        "pricePerSeat": Value::Null,
    });

    let subscription = match fetch_seat_subscription(contact_data, outbound, ws_id).await {
        Ok(value) => value,
        Err(()) => return conservative,
    };

    let product = match &subscription {
        Some(sub) => match &sub.product_id {
            Some(product_id) if !product_id.trim().is_empty() => {
                match fetch_seat_product(contact_data, outbound, product_id).await {
                    Ok(value) => value,
                    Err(()) => return conservative,
                }
            }
            _ => None,
        },
        None => None,
    };

    let member_count = count_workspace_members(contact_data, outbound, ws_id)
        .await
        .unwrap_or(0);

    let is_seat_based = subscription.is_some()
        && product.as_ref().and_then(|p| p.pricing_model.as_deref()) == Some("seat_based");

    if !is_seat_based {
        // Infinity -> null on the wire.
        return json!({
            "isSeatBased": false,
            "seatCount": Value::Null,
            "memberCount": member_count,
            "availableSeats": Value::Null,
            "canAddMember": true,
            "pricePerSeat": Value::Null,
        });
    }

    let seat_count = subscription
        .as_ref()
        .and_then(|s| s.seat_count.as_ref())
        .and_then(|v| v.as_i64())
        .unwrap_or(1);
    let available_seats = (seat_count - member_count).max(0);

    json!({
        "isSeatBased": true,
        "seatCount": seat_count,
        "memberCount": member_count,
        "availableSeats": available_seats,
        "canAddMember": available_seats > 0,
        "pricePerSeat": product
            .and_then(|p| p.price_per_seat)
            .unwrap_or(Value::Null),
    })
}

async fn fetch_seat_subscription(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<SeatSubscriptionRow>, ()> {
    let status_filter = format!("in.({})", SEAT_ACTIVE_STATUSES.join(","));
    let url = contact_data
        .rest_url(
            "workspace_subscriptions",
            &[
                ("select", "seat_count,product_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("status", status_filter),
                ("order", "created_at.desc".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<SeatSubscriptionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_seat_product(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_id: &str,
) -> Result<Option<SeatProductRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_subscription_products",
            &[
                ("select", "pricing_model,price_per_seat".to_owned()),
                ("id", format!("eq.{product_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response =
        send_service_role_get(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<SeatProductRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn count_workspace_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "ws_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", "0-0"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Parse total from Content-Range: `0-0/<total>` or `*/<total>`.
    if let Some(content_range) = response.header("content-range") {
        if let Some(total) = content_range.rsplit('/').next() {
            if let Ok(parsed) = total.trim().parse::<i64>() {
                return Ok(parsed);
            }
        }
    }

    // Fallback: count returned rows (no Range cap was effectively applied).
    Ok(response
        .json::<Vec<Value>>()
        .map(|rows| rows.len() as i64)
        .unwrap_or(0))
}

// ---------------------------------------------------------------------------
// Polar (best-effort, native-only credentials)
// ---------------------------------------------------------------------------

/// Mirrors `fetchProducts(polar)` filtering. Best-effort: returns `[]` when
/// Polar credentials are unavailable or the request fails (legacy parity).
async fn fetch_products(outbound: &impl OutboundHttpClient) -> Option<Vec<Value>> {
    let creds = polar_credentials()?;
    let url = format!(
        "{}/v1/products/?is_archived=false&limit=100",
        creds.api_base
    );
    let authorization = format!("Bearer {}", creds.access_token);
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return Some(Vec::new());
    }

    let parsed = response.json::<PolarProductsList>().ok()?;
    let items = parsed.items.unwrap_or_default();

    Some(
        items
            .into_iter()
            .filter(|product| {
                !is_ai_credit_pack_product(product)
                    && parse_workspace_product_tier(product).is_some()
            })
            .collect(),
    )
}

#[derive(Deserialize)]
struct PolarProductsList {
    items: Option<Vec<Value>>,
}

fn is_ai_credit_pack_product(product: &Value) -> bool {
    product
        .get("metadata")
        .and_then(|m| m.get("product_type"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_lowercase() == "ai_credit_pack")
        .unwrap_or(false)
}

fn parse_workspace_product_tier(product: &Value) -> Option<String> {
    let tier = product
        .get("metadata")
        .and_then(|m| m.get("product_tier"))
        .and_then(|v| v.as_str())?;
    let upper = tier.trim().to_uppercase();
    matches!(upper.as_str(), "FREE" | "PLUS" | "PRO" | "ENTERPRISE").then_some(upper)
}

/// Mirrors `polar.customerSeats.listSeats({ subscriptionId })`, returning the
/// `seats` array. Best-effort: `None` on failure so the caller falls back to
/// an empty array (legacy parity).
async fn fetch_seat_list(
    outbound: &impl OutboundHttpClient,
    subscription_id: &str,
) -> Option<Value> {
    let creds = polar_credentials()?;
    let url = format!(
        "{}/v1/customer-seats/?subscription_id={}",
        creds.api_base, subscription_id
    );
    let authorization = format!("Bearer {}", creds.access_token);
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    let body = response.json::<Value>().ok()?;
    body.get("seats").cloned()
}

struct PolarCredentials {
    access_token: String,
    api_base: &'static str,
}

/// Reads Polar credentials from the environment. Only available on the native
/// target; the worker target cannot read process env, so this returns `None`
/// there and Polar-derived fields fall back to empty (see module docs / notes).
#[cfg(feature = "native")]
fn polar_credentials() -> Option<PolarCredentials> {
    let access_token = std::env::var("POLAR_ACCESS_TOKEN")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())?;
    let sandbox = std::env::var("POLAR_SANDBOX")
        .map(|value| value.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let api_base = if sandbox {
        "https://sandbox-api.polar.sh"
    } else {
        "https://api.polar.sh"
    };

    Some(PolarCredentials {
        access_token,
        api_base,
    })
}

#[cfg(not(feature = "native"))]
fn polar_credentials() -> Option<PolarCredentials> {
    None
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema_profile: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(profile) = schema_profile {
        request = request
            .with_header("Accept-Profile", profile)
            .with_header("Content-Profile", profile);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn in_filter(ids: &[String]) -> String {
    format!("in.({})", ids.join(","))
}

fn number_value(value: Option<&Value>) -> f64 {
    value.map(number_value_ref).unwrap_or(0.0)
}

fn number_value_ref(value: &Value) -> f64 {
    match value {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::String(s) => s.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn billing_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(BILLING_PATH_PREFIX)?
        .strip_suffix(BILLING_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}
