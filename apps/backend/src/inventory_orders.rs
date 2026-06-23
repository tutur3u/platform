use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INVENTORY_ORDERS_PATH: &str = "/api/v1/inventory/orders";
const INVENTORY_APP_SESSION_TARGETS: [&str; 2] = ["storefront", "inventory"];
const PRIVATE_SCHEMA: &str = "private";
const PRIVATE_CACHE_CONTROL: &str = "private, no-store";
const INVENTORY_CHECKOUT_SESSIONS_TABLE: &str = "inventory_checkout_sessions";
const INVENTORY_CHECKOUT_LINES_TABLE: &str = "inventory_checkout_lines";
const INVENTORY_STOREFRONTS_TABLE: &str = "inventory_storefronts";
const COMPLETED_STATUS: &str = "completed";

const CHECKOUT_HISTORY_SELECT: &str = "id,ws_id,storefront_id,public_token,status,customer_auth_uid,customer_name,customer_email,customer_phone,note,currency,subtotal_amount,platform_fee_amount,processing_fee_estimate_amount,conversion_fee_estimate_amount,total_amount,expires_at,completed_at,created_at,finance_invoice_id,polar_checkout_id,polar_checkout_url,polar_environment,polar_order_id,polar_product_id,polar_status";

const CHECKOUT_LINE_SELECT: &str = "id,checkout_session_id,listing_id,bundle_id,variant_id,product_id,unit_id,warehouse_id,title,quantity,unit_price,subtotal_amount";

#[derive(Deserialize)]
struct CheckoutHistoryRow {
    completed_at: Option<Value>,
    conversion_fee_estimate_amount: Option<Value>,
    created_at: Option<Value>,
    currency: Option<Value>,
    customer_auth_uid: Option<Value>,
    customer_email: Option<Value>,
    customer_name: Option<Value>,
    customer_phone: Option<Value>,
    expires_at: Option<Value>,
    finance_invoice_id: Option<Value>,
    id: String,
    note: Option<Value>,
    platform_fee_amount: Option<Value>,
    polar_checkout_id: Option<Value>,
    polar_checkout_url: Option<Value>,
    polar_environment: Option<Value>,
    polar_order_id: Option<Value>,
    polar_product_id: Option<Value>,
    polar_status: Option<Value>,
    processing_fee_estimate_amount: Option<Value>,
    public_token: Option<Value>,
    status: Option<Value>,
    storefront_id: String,
    subtotal_amount: Option<Value>,
    total_amount: Option<Value>,
    ws_id: Option<Value>,
}

#[derive(Deserialize)]
struct CheckoutLineRow {
    bundle_id: Option<Value>,
    checkout_session_id: String,
    id: Option<Value>,
    listing_id: Option<Value>,
    product_id: Option<Value>,
    quantity: Option<Value>,
    subtotal_amount: Option<Value>,
    title: Option<Value>,
    unit_id: Option<Value>,
    unit_price: Option<Value>,
    variant_id: Option<Value>,
    warehouse_id: Option<Value>,
}

#[derive(Clone, Deserialize)]
struct StorefrontLookupRow {
    id: String,
    name: Option<Value>,
    slug: Option<Value>,
}

struct SearchParams {
    limit: i64,
    offset: i64,
    store_slug: Option<String>,
}

pub(crate) async fn handle_inventory_orders_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != INVENTORY_ORDERS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => orders_get_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn orders_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(customer_auth_uid) = authenticated_inventory_user(config, request, outbound).await
    else {
        return unauthorized_response();
    };

    let params = match parse_search_params(request.url) {
        Ok(params) => params,
        Err(response) => return response,
    };

    match list_checkout_order_history(&config.contact_data, outbound, &customer_auth_uid, &params)
        .await
    {
        Ok(payload) => success_response(payload),
        Err(()) => error_response(),
    }
}

async fn list_checkout_order_history(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    customer_auth_uid: &str,
    params: &SearchParams,
) -> Result<Value, ()> {
    // Optional storefront slug filter.
    let storefront_filter = match params.store_slug.as_deref() {
        Some(slug) => match load_storefront_by_slug(contact_data, outbound, slug).await? {
            Some(storefront) => Some(storefront),
            // Unknown slug -> empty result set (matches legacy behaviour).
            None => return Ok(json!({ "count": 0, "data": [] })),
        },
        None => None,
    };

    let range_to = params.offset + params.limit - 1;
    let mut query_params: Vec<(&str, String)> = vec![
        ("select", CHECKOUT_HISTORY_SELECT.to_owned()),
        ("customer_auth_uid", format!("eq.{customer_auth_uid}")),
        ("status", format!("eq.{COMPLETED_STATUS}")),
        ("order", "completed_at.desc,created_at.desc".to_owned()),
        ("offset", params.offset.to_string()),
        ("limit", params.limit.to_string()),
    ];
    if let Some(storefront) = storefront_filter.as_ref() {
        query_params.push(("storefront_id", format!("eq.{}", storefront.id)));
    }

    let Some(url) = contact_data.rest_url(INVENTORY_CHECKOUT_SESSIONS_TABLE, &query_params) else {
        return Err(());
    };
    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        None,
        Some(PRIVATE_SCHEMA),
        true,
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows: Vec<CheckoutHistoryRow> = response.json().map_err(|_| ())?;
    let total_count = content_range_total(&response).unwrap_or(rows.len() as u64);

    let checkout_ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
    let lines = load_checkout_lines(contact_data, outbound, &checkout_ids).await?;
    let mut lines_by_checkout: HashMap<String, Vec<&CheckoutLineRow>> = HashMap::new();
    for line in &lines {
        lines_by_checkout
            .entry(line.checkout_session_id.clone())
            .or_default()
            .push(line);
    }

    let storefronts_by_id = if let Some(storefront) = storefront_filter.as_ref() {
        let mut map = HashMap::new();
        map.insert(storefront.id.clone(), storefront.clone());
        map
    } else {
        let storefront_ids: Vec<String> =
            rows.iter().map(|row| row.storefront_id.clone()).collect();
        let loaded = load_storefront_lookup_by_ids(contact_data, outbound, &storefront_ids).await?;
        loaded
            .into_iter()
            .map(|s| (s.id.clone(), s))
            .collect::<HashMap<String, _>>()
    };

    let data: Vec<Value> = rows
        .iter()
        .filter_map(|row| {
            let storefront = storefronts_by_id.get(&row.storefront_id)?;
            let row_lines = lines_by_checkout
                .get(&row.id)
                .map(|lines| lines.as_slice())
                .unwrap_or(&[]);
            Some(map_order_history_item(row, row_lines, storefront))
        })
        .collect();

    Ok(json!({ "count": total_count, "data": data }))
}

async fn load_storefront_by_slug(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    slug: &str,
) -> Result<Option<StorefrontLookupRow>, ()> {
    let Some(url) = contact_data.rest_url(
        INVENTORY_STOREFRONTS_TABLE,
        &[
            ("select", "id,name,slug".to_owned()),
            ("slug", format!("eq.{slug}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        None,
        Some(PRIVATE_SCHEMA),
        false,
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<StorefrontLookupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn load_checkout_lines(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    checkout_ids: &[String],
) -> Result<Vec<CheckoutLineRow>, ()> {
    if checkout_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("in.({})", checkout_ids.join(","));
    let Some(url) = contact_data.rest_url(
        INVENTORY_CHECKOUT_LINES_TABLE,
        &[
            ("select", CHECKOUT_LINE_SELECT.to_owned()),
            ("checkout_session_id", in_list),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        None,
        Some(PRIVATE_SCHEMA),
        false,
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<CheckoutLineRow>>().map_err(|_| ())
}

async fn load_storefront_lookup_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storefront_ids: &[String],
) -> Result<Vec<StorefrontLookupRow>, ()> {
    let mut unique: Vec<String> = Vec::new();
    for id in storefront_ids {
        if !id.is_empty() && !unique.iter().any(|existing| existing == id) {
            unique.push(id.clone());
        }
    }
    if unique.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("in.({})", unique.join(","));
    let Some(url) = contact_data.rest_url(
        INVENTORY_STOREFRONTS_TABLE,
        &[("select", "id,name,slug".to_owned()), ("id", in_list)],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        None,
        Some(PRIVATE_SCHEMA),
        false,
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<StorefrontLookupRow>>().map_err(|_| ())
}

fn map_order_history_item(
    row: &CheckoutHistoryRow,
    lines: &[&CheckoutLineRow],
    storefront: &StorefrontLookupRow,
) -> Value {
    let checkout = map_checkout(row, lines);
    let checkout_lines = checkout
        .get("lines")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));

    json!({
        "checkout": checkout,
        "completedAt": value_or_null(&row.completed_at),
        "createdAt": value_or_null(&row.created_at),
        "currency": value_or_null(&row.currency),
        "id": row.id,
        "lines": checkout_lines,
        "polarStatus": value_or_null(&row.polar_status),
        "publicToken": value_or_null(&row.public_token),
        "status": value_or_null(&row.status),
        "storefrontId": storefront.id,
        "storefrontName": value_or_null(&storefront.name),
        "storefrontSlug": value_or_null(&storefront.slug),
        "totalAmount": value_or_null(&row.total_amount),
    })
}

fn map_checkout(row: &CheckoutHistoryRow, lines: &[&CheckoutLineRow]) -> Value {
    let mapped_lines: Vec<Value> = lines
        .iter()
        .map(|line| {
            json!({
                "bundleId": value_or_null(&line.bundle_id),
                "id": value_or_null(&line.id),
                "listingId": value_or_null(&line.listing_id),
                "variantId": value_or_null(&line.variant_id),
                "productId": value_or_null(&line.product_id),
                "quantity": value_or_null(&line.quantity),
                "subtotalAmount": value_or_null(&line.subtotal_amount),
                "title": value_or_null(&line.title),
                "unitId": value_or_null(&line.unit_id),
                "unitPrice": value_or_null(&line.unit_price),
                "warehouseId": value_or_null(&line.warehouse_id),
            })
        })
        .collect();

    json!({
        "completedAt": value_or_null(&row.completed_at),
        "conversionFeeEstimateAmount": value_or_null(&row.conversion_fee_estimate_amount),
        "currency": value_or_null(&row.currency),
        "customerAuthUid": value_or_null(&row.customer_auth_uid),
        "customerEmail": value_or_null(&row.customer_email),
        "customerName": value_or_null(&row.customer_name),
        "customerPhone": value_or_null(&row.customer_phone),
        "expiresAt": value_or_null(&row.expires_at),
        "financeInvoiceId": value_or_null(&row.finance_invoice_id),
        "id": row.id,
        "wsId": value_or_null(&row.ws_id),
        "lines": mapped_lines,
        "note": value_or_null(&row.note),
        "platformFeeAmount": value_or_null(&row.platform_fee_amount),
        "polarCheckoutId": value_or_null(&row.polar_checkout_id),
        "polarCheckoutUrl": value_or_null(&row.polar_checkout_url),
        "polarEnvironment": value_or_null(&row.polar_environment),
        "polarOrderId": value_or_null(&row.polar_order_id),
        "polarProductId": value_or_null(&row.polar_product_id),
        "polarStatus": value_or_null(&row.polar_status),
        "processingFeeEstimateAmount": value_or_null(&row.processing_fee_estimate_amount),
        "publicToken": value_or_null(&row.public_token),
        "status": value_or_null(&row.status),
        "subtotalAmount": value_or_null(&row.subtotal_amount),
        "totalAmount": value_or_null(&row.total_amount),
    })
}

fn value_or_null(value: &Option<Value>) -> Value {
    value.clone().unwrap_or(Value::Null)
}

fn content_range_total(response: &OutboundResponse) -> Option<u64> {
    response
        .header("content-range")
        .and_then(|range| range.split('/').nth(1))
        .and_then(|total| total.trim().parse::<u64>().ok())
}

async fn authenticated_inventory_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id);
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;

    non_empty_user_id(user.id?)
}

#[allow(clippy::too_many_arguments)]
async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
    schema_profile: Option<&str>,
    count_exact: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(profile) = schema_profile {
        request = request
            .with_header("Accept-Profile", profile)
            .with_header("Content-Profile", profile);
    }

    if count_exact {
        request = request.with_header("Prefer", "count=exact");
    }

    if let Some(body) = body {
        request = request
            .with_header("Content-Type", APPLICATION_JSON)
            .with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn parse_search_params(url: Option<&str>) -> Result<SearchParams, BackendResponse> {
    let mut limit_raw: Option<String> = None;
    let mut offset_raw: Option<String> = None;
    let mut store_slug_raw: Option<String> = None;

    if let Some(raw_url) = url
        && let Ok(parsed) = url::Url::parse(raw_url)
    {
        for (name, value) in parsed.query_pairs() {
            match name.as_ref() {
                "limit" => limit_raw = Some(value.into_owned()),
                "offset" => offset_raw = Some(value.into_owned()),
                "storeSlug" => store_slug_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let mut issues: Vec<Value> = Vec::new();

    let limit = match coerce_int(limit_raw.as_deref()) {
        CoerceResult::Default => 50,
        CoerceResult::Value(value) if (1..=100).contains(&value) => value,
        _ => {
            issues.push(json!({
                "path": ["limit"],
                "message": "Invalid limit",
            }));
            50
        }
    };

    let offset = match coerce_int(offset_raw.as_deref()) {
        CoerceResult::Default => 0,
        CoerceResult::Value(value) if value >= 0 => value,
        _ => {
            issues.push(json!({
                "path": ["offset"],
                "message": "Invalid offset",
            }));
            0
        }
    };

    if !issues.is_empty() {
        return Err(invalid_query_response(issues));
    }

    let store_slug = store_slug_raw
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());

    Ok(SearchParams {
        limit,
        offset,
        store_slug,
    })
}

enum CoerceResult {
    Default,
    Value(i64),
    Invalid,
}

fn coerce_int(raw: Option<&str>) -> CoerceResult {
    match raw {
        None => CoerceResult::Default,
        // z.coerce.number() treats an empty string as 0.
        Some(value) if value.is_empty() => CoerceResult::Value(0),
        Some(value) => match value.trim().parse::<f64>() {
            Ok(number) if number.fract() == 0.0 && number.is_finite() => {
                CoerceResult::Value(number as i64)
            }
            _ => CoerceResult::Invalid,
        },
    }
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn success_response(payload: Value) -> BackendResponse {
    let mut response = json_response(200, payload);
    response.cache_control = Some(PRIVATE_CACHE_CONTROL);
    response
}

fn unauthorized_response() -> BackendResponse {
    json_response(401, json!({ "error": "Unauthorized" }))
}

fn invalid_query_response(issues: Vec<Value>) -> BackendResponse {
    json_response(
        400,
        json!({ "message": "Invalid query parameters", "errors": issues }),
    )
}

fn error_response() -> BackendResponse {
    json_response(500, json!({ "message": "Failed to load order history" }))
}
