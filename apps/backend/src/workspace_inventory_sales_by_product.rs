use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACE_INVENTORY_SALES_BY_PRODUCT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_INVENTORY_SALES_BY_PRODUCT_PATH_SUFFIX: &str = "/inventory/sales/by-product";
const PRIVATE_SCHEMA: &str = "private";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory sales by product";
const SESSION_LIMIT: usize = 500;

// Mirrors `canViewInventorySales` in apps/web/src/lib/inventory/permissions.ts
// (any of these permissions grants access). Workspace creators / admins are
// covered by `has_all_permissions` inside `authorize_workspace_permission`.
const VIEW_INVENTORY_SALES_PERMISSIONS: [&str; 2] = ["view_inventory_sales", "view_invoices"];

#[derive(Deserialize)]
struct CheckoutSessionRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct CheckoutLineRow {
    product_id: Option<String>,
    quantity: Option<f64>,
    subtotal_amount: Option<f64>,
}

#[derive(Deserialize)]
struct ProductRow {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Serialize)]
struct ProductSalesRow {
    #[serde(rename = "productId")]
    product_id: String,
    revenue: f64,
    #[serde(rename = "unitsSold")]
    units_sold: f64,
    #[serde(rename = "productName")]
    product_name: String,
}

struct SalesAggregate {
    product_id: String,
    revenue: f64,
    units_sold: f64,
}

pub(crate) async fn handle_workspace_inventory_sales_by_product_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_inventory_sales_by_product_ws_id(request.path)?;

    Some(match request.method {
        "GET" => sales_by_product_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn sales_by_product_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_sales(&config.contact_data, request, raw_ws_id, outbound).await {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match fetch_sales_by_product(&config.contact_data, outbound, &ws_id).await {
        Ok(rows) => no_store_response(json_response(200, json!({ "data": rows }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-sales view permissions. Returns the resolved workspace id on
/// success, or a ready-to-send error response.
async fn authorize_inventory_sales(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_SALES_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // `canViewInventorySales` grants access when ANY permission is
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

/// Replicates `getInventorySalesByProduct`: collects completed checkout
/// sessions (most recent `SESSION_LIMIT`), aggregates their line items into
/// per-product revenue + units sold, then joins product names.
async fn fetch_sales_by_product(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<ProductSalesRow>, ()> {
    let session_ids = fetch_completed_session_ids(contact_data, outbound, ws_id).await?;
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }

    let lines = fetch_checkout_lines(contact_data, outbound, &session_ids).await?;
    let aggregates = aggregate_sales_by_product(lines);
    if aggregates.is_empty() {
        return Ok(Vec::new());
    }

    let product_ids: Vec<String> = aggregates
        .iter()
        .map(|aggregate| aggregate.product_id.clone())
        .collect();
    let name_by_id = fetch_product_names(contact_data, outbound, &product_ids).await?;

    Ok(aggregates
        .into_iter()
        .map(|aggregate| {
            let product_name = name_by_id
                .get(&aggregate.product_id)
                .cloned()
                .unwrap_or_else(|| aggregate.product_id.clone());
            ProductSalesRow {
                product_id: aggregate.product_id,
                revenue: aggregate.revenue,
                units_sold: aggregate.units_sold,
                product_name,
            }
        })
        .collect())
}

async fn fetch_completed_session_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "inventory_checkout_sessions",
            &[
                ("select", "id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("status", "eq.completed".to_owned()),
                ("order", "completed_at.desc".to_owned()),
                ("limit", SESSION_LIMIT.to_string()),
            ],
        )
        .ok_or(())?;

    let response = send_private_rest_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CheckoutSessionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.id)
        .collect())
}

async fn fetch_checkout_lines(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_ids: &[String],
) -> Result<Vec<CheckoutLineRow>, ()> {
    let url = contact_data
        .rest_url(
            "inventory_checkout_lines",
            &[
                ("select", "product_id,quantity,subtotal_amount".to_owned()),
                (
                    "checkout_session_id",
                    format!("in.({})", session_ids.join(",")),
                ),
            ],
        )
        .ok_or(())?;

    let response = send_private_rest_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<CheckoutLineRow>>().map_err(|_| ())
}

async fn fetch_product_names(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_ids: &[String],
) -> Result<HashMap<String, String>, ()> {
    // `workspace_products` lives in the public schema (no Accept-Profile).
    let url = contact_data
        .rest_url(
            "workspace_products",
            &[
                ("select", "id,name".to_owned()),
                ("id", format!("in.({})", product_ids.join(","))),
            ],
        )
        .ok_or(())?;

    let response = send_public_rest_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ProductRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| match (row.id, row.name) {
            (Some(id), Some(name)) => Some((id, name)),
            _ => None,
        })
        .collect())
}

/// Pure aggregation mirroring `aggregateSalesByProduct`: groups completed-sale
/// line items per product into revenue + units sold, sorted by revenue desc.
fn aggregate_sales_by_product(lines: Vec<CheckoutLineRow>) -> Vec<SalesAggregate> {
    let mut order: Vec<String> = Vec::new();
    let mut by_product: HashMap<String, SalesAggregate> = HashMap::new();

    for line in lines {
        let Some(product_id) = line.product_id else {
            continue;
        };

        let entry = by_product.entry(product_id.clone()).or_insert_with(|| {
            order.push(product_id.clone());
            SalesAggregate {
                product_id,
                revenue: 0.0,
                units_sold: 0.0,
            }
        });
        entry.revenue += line.subtotal_amount.unwrap_or(0.0);
        entry.units_sold += line.quantity.unwrap_or(0.0);
    }

    let mut aggregates: Vec<SalesAggregate> = order
        .into_iter()
        .filter_map(|product_id| by_product.remove(&product_id))
        .collect();

    aggregates.sort_by(|a, b| {
        b.revenue
            .partial_cmp(&a.revenue)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    aggregates
}

async fn send_private_rest_get(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_public_rest_get(
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

fn workspace_inventory_sales_by_product_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_INVENTORY_SALES_BY_PRODUCT_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_INVENTORY_SALES_BY_PRODUCT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
