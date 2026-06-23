use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_STATISTICS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_STATISTICS_PATH_SUFFIX: &str = "/inventory/statistics";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";

// Public-schema RPCs returning a scalar count.
const PRODUCTS_COUNT_RPC: &str = "get_workspace_products_count";
const INVENTORY_PRODUCTS_COUNT_RPC: &str = "get_inventory_products_count";
// Private-schema RPC returning rows with a `total_count` column.
const INVENTORY_BATCHES_RPC: &str = "get_inventory_batches";

// Mirrors `canViewInventoryDashboard` in
// apps/web/src/lib/inventory/permissions.ts: access is granted when the caller
// holds ANY of these permissions. Workspace creators / admins are covered by
// `has_all_permissions` inside `authorize_workspace_permission`.
const VIEW_INVENTORY_DASHBOARD_PERMISSIONS: [&str; 2] =
    ["view_inventory_dashboard", "view_inventory"];

#[derive(Serialize)]
struct WorkspaceInventoryStatisticsResponse {
    batches: i64,
    categories: i64,
    #[serde(rename = "inventoryProducts")]
    inventory_products: i64,
    products: i64,
    promotions: i64,
    suppliers: i64,
    units: i64,
    warehouses: i64,
}

pub(crate) async fn handle_workspaces_inventory_statistics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_statistics_ws_id(request.path)?;

    Some(match request.method {
        "GET" => statistics_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn statistics_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_dashboard(&config.contact_data, request, raw_ws_id, outbound)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    let contact_data = &config.contact_data;

    // Each statistic mirrors the legacy `countOrZero` helper: any individual
    // failure resolves to 0 instead of failing the whole response. The legacy
    // route fans these out with `Promise.all`; the observable output (a single
    // statistics object) is identical when run sequentially.
    let products = rpc_scalar_count(contact_data, outbound, PRODUCTS_COUNT_RPC, &ws_id, None)
        .await
        .unwrap_or(0);
    let inventory_products = rpc_scalar_count(
        contact_data,
        outbound,
        INVENTORY_PRODUCTS_COUNT_RPC,
        &ws_id,
        None,
    )
    .await
    .unwrap_or(0);
    let categories = exact_count(contact_data, outbound, "product_categories", &ws_id, false)
        .await
        .unwrap_or(0);
    let batches = inventory_batches_count(contact_data, outbound, &ws_id)
        .await
        .unwrap_or(0);
    let warehouses = exact_count(contact_data, outbound, "inventory_warehouses", &ws_id, true)
        .await
        .unwrap_or(0);
    let units = exact_count(contact_data, outbound, "inventory_units", &ws_id, true)
        .await
        .unwrap_or(0);
    let suppliers = exact_count(contact_data, outbound, "inventory_suppliers", &ws_id, true)
        .await
        .unwrap_or(0);
    let promotions = exact_count(contact_data, outbound, "workspace_promotions", &ws_id, true)
        .await
        .unwrap_or(0);

    no_store_response(json_response(
        200,
        WorkspaceInventoryStatisticsResponse {
            batches,
            categories,
            inventory_products,
            products,
            promotions,
            suppliers,
            units,
            warehouses,
        },
    ))
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-dashboard permissions. Returns the resolved workspace id on
/// success, or a ready-to-send error response.
async fn authorize_inventory_dashboard(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_DASHBOARD_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // `canViewInventoryDashboard` grants access when ANY permission is
            // present, so keep checking the remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Mirrors `sbAdmin.rpc(<fn>, { ws_id })` for the scalar-count RPCs and coerces
/// the scalar result with `Number(data ?? 0)`. Runs as service role to match the
/// legacy admin client.
async fn rpc_scalar_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    ws_id: &str,
    profile: Option<&str>,
) -> Result<i64, ()> {
    let url = contact_data.rpc_url(function).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({ "ws_id": ws_id })).map_err(|_| ())?;

    let mut request = OutboundRequest::new(OutboundMethod::Post, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Content-Type", APPLICATION_JSON)
        .with_body(&body);
    if let Some(profile) = profile {
        request = request
            .with_header("Accept-Profile", profile)
            .with_header("Content-Profile", profile);
    }

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Value>()
        .map(|value| value_as_count(&value))
        .unwrap_or(0))
}

/// Mirrors `getInventoryBatches({ limit: 1, sbAdmin, wsId })`: a private-schema
/// RPC returning rows shaped `{ batch, total_count }`; the count is read from the
/// first row's `total_count`.
async fn inventory_batches_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let url = contact_data.rpc_url(INVENTORY_BATCHES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_limit": 1,
        "p_offset": 0,
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows
        .first()
        .and_then(|row| row.get("total_count"))
        .map(value_as_count)
        .unwrap_or(0))
}

/// Mirrors `.from(<table>).select('id', { count: 'exact', head: true }).eq('ws_id', wsId)`.
/// Reads the total from PostgREST's `Content-Range` header (this outbound client
/// has no HEAD verb, so we use GET + `count=exact` with `limit=1`). When
/// `private_schema` is set the table lives in the `private` schema, matching the
/// legacy `inventory = sbAdmin.schema('private')` client.
async fn exact_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
    private_schema: bool,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            table,
            &[
                ("select", "id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Prefer", "count=exact");
    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .header("content-range")
        .and_then(parse_content_range_count)
        .unwrap_or(0))
}

/// Coerces a JSON value to an integer count, mirroring JS `Number(value ?? 0)`.
/// Accepts numbers directly and numeric strings (PostgREST may return bigints as
/// strings); anything else resolves to 0.
fn value_as_count(value: &Value) -> i64 {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|float| float as i64))
            .unwrap_or(0),
        Value::String(text) => text
            .trim()
            .parse::<f64>()
            .map(|float| float as i64)
            .unwrap_or(0),
        _ => 0,
    }
}

/// Parses the total count from a PostgREST `Content-Range` header value such as
/// `0-24/100` or `*/100`. Returns the value after the final `/`.
fn parse_content_range_count(content_range: &str) -> Option<i64> {
    let total = content_range.rsplit('/').next()?.trim();
    if total.is_empty() || total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

fn workspaces_inventory_statistics_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_STATISTICS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_STATISTICS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
