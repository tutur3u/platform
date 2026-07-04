//! Handler for `GET /api/v1/workspaces/:wsId/products/:productId`.
//!
//! Ports the legacy Next.js GET handler from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/products/[productId]/route.ts`.
//!
//! Only the GET method is migrated. PATCH and DELETE return `None` so the
//! Cloudflare worker falls through to the still-active Next.js route.
//!
//! Auth mirrors `authorizeInventoryWorkspace` + `canViewInventoryCatalog`:
//!
//! - resolve browser session (Supabase access token from bearer/cookie),
//! - normalize the workspace id,
//! - verify workspace membership,
//! - require ANY of the inventory-catalog permissions,
//! - separately check ANY of the inventory-stock permissions to determine
//!   whether stock-quantity data is included in the response.
//!
//! Data:
//!
//! - `private.get_inventory_catalog_products` RPC (service-role, private schema)
//! - `workspace_products` REST table (service-role) for `avatar_url` enrichment
//!
//! Response shape exactly matches the legacy `formattedProduct` object.
//!
//! Status codes:
//!
//! - missing/invalid session                     -> 401 `{ "message": "Unauthorized" }`
//! - unresolved workspace / non-member           -> 404 `{ "error": "Not found" }`
//! - member lacking inventory-catalog permission -> 403 `{ "message": "Forbidden" }`
//! - product not found                           -> 404 `{ "message": "Product not found" }`
//! - upstream failure                            -> 500 `{ "message": "Error fetching product" }`
//!
//! Behavior gaps vs. the legacy route:
//!
//! - `authorize_workspace_permission` does not accept inventory app-session
//!   tokens (only browser access tokens / cookies). Legacy
//!   `authorizeInventoryWorkspace` accepts `appSessionTargets: ['inventory']`.
//!   This is the same accepted tradeoff as other inventory ports
//!   (`workspaces_wsid_inventory_batches`, etc.).
//! - The catalog-permission check and the stock-permission check are performed
//!   as separate sequential `authorize_workspace_permission` call loops (each
//!   loop terminates on first match). In the common case this is a small number
//!   of extra auth round-trips; worst case is `(6 + 4) × 5` outbound calls.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PRODUCTS_SEGMENT: &str = "products/";
const GET_CATALOG_RPC: &str = "get_inventory_catalog_products";
const PRIVATE_SCHEMA: &str = "private";
const WORKSPACE_PRODUCTS_TABLE: &str = "workspace_products";

/// Mirrors `canViewInventoryCatalog` in
/// `apps/web/src/lib/inventory/permissions.ts`.
const VIEW_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

/// Mirrors `canViewInventoryStock` in
/// `apps/web/src/lib/inventory/permissions.ts`.
const VIEW_STOCK_PERMISSIONS: [&str; 4] = [
    "view_inventory_stock",
    "view_stock_quantity",
    "adjust_inventory_stock",
    "update_stock_quantity",
];

#[derive(Deserialize)]
struct CatalogRpcRow {
    product: Option<Value>,
}

#[derive(Deserialize)]
struct AvatarRow {
    avatar_url: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_products_productid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, product_id) = extract_path_segments(request.path)?;

    Some(match request.method {
        "GET" => product_get_response(config, request, raw_ws_id, product_id, outbound).await,
        _ => return None,
    })
}

async fn product_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    product_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_catalog(&config.contact_data, request, raw_ws_id, outbound).await
        {
            Ok(id) => id,
            Err(response) => return response,
        };

    let can_view_stock =
        check_stock_permission(&config.contact_data, request, raw_ws_id, outbound).await;

    let product = match fetch_product_from_rpc(
        &config.contact_data,
        outbound,
        &ws_id,
        product_id,
        can_view_stock,
    )
    .await
    {
        Ok(Some(p)) => p,
        Ok(None) => {
            return no_store_response(json_response(
                404,
                json!({ "message": "Product not found" }),
            ));
        }
        Err(()) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error fetching product" }),
            ));
        }
    };

    let avatar_url = fetch_avatar_url(&config.contact_data, outbound, &ws_id, product_id)
        .await
        .ok()
        .flatten();

    no_store_response(json_response(
        200,
        format_product(product, avatar_url, can_view_stock),
    ))
}

/// Authorizes the caller for ANY of the inventory-catalog permissions.
///
/// Returns the resolved workspace id on success or a ready-to-send error
/// response. Mirrors the logic in `workspaces_wsid_inventory_batches`.
async fn authorize_inventory_catalog(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for &permission in &VIEW_CATALOG_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(auth) => return Ok(auth.ws_id),
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(err) => return Err(auth_error_response(err)),
        }
    }
    Err(no_store_response(json_response(
        403,
        json!({ "message": "Forbidden" }),
    )))
}

/// Returns `true` if the caller holds ANY inventory-stock permission.
///
/// Errors are treated as `false` (the stock fields are hidden rather than
/// returning an error), mirroring the legacy `canViewInventoryStock` fallback.
async fn check_stock_permission(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    for &permission in &VIEW_STOCK_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(_) => return true,
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(_) => return false,
        }
    }
    false
}

async fn fetch_product_from_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    product_id: &str,
    include_stock: bool,
) -> Result<Option<Value>, ()> {
    let rpc_url = contact_data.rpc_url(GET_CATALOG_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&json!({
        "p_include_stock": include_stock,
        "p_limit": 1,
        "p_offset": 0,
        "p_product_id": product_id,
        "p_sort_by": "created_at",
        "p_sort_order": "desc",
        "p_status": "all",
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<CatalogRpcRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| row.product))
}

async fn fetch_avatar_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    product_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            WORKSPACE_PRODUCTS_TABLE,
            &[
                ("select", "id,avatar_url".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", format!("eq.{product_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<AvatarRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| row.avatar_url))
}

/// Formats the raw RPC product into the legacy `formattedProduct` shape.
///
/// Mirrors the `formattedProduct` construction in the legacy GET handler,
/// including the `canViewStockQuantity` gating of stock / inventory fields.
fn format_product(product: Value, avatar_url: Option<String>, can_view_stock: bool) -> Value {
    let inv_products = product
        .get("inventory_products")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let first_inv = inv_products.first();

    let unit = if can_view_stock {
        field_at_path(first_inv, &["inventory_units", "name"])
    } else {
        Value::Null
    };

    let stock = if can_view_stock {
        Value::Array(
            inv_products
                .iter()
                .map(|inv| {
                    json!({
                        "amount":    get_field(inv, "amount"),
                        "min_amount": get_field(inv, "min_amount"),
                        "unit":      field_at_path(Some(inv), &["inventory_units", "name"]),
                        "warehouse": field_at_path(Some(inv), &["inventory_warehouses", "name"]),
                        "price":     get_field(inv, "price"),
                    })
                })
                .collect(),
        )
    } else {
        Value::Array(Vec::new())
    };

    let inventory = if can_view_stock {
        Value::Array(
            inv_products
                .iter()
                .map(|inv| {
                    json!({
                        "unit_id":      get_field(inv, "unit_id"),
                        "warehouse_id": get_field(inv, "warehouse_id"),
                        "amount":       get_field(inv, "amount"),
                        "min_amount":   get_field(inv, "min_amount"),
                        "price":        get_field(inv, "price"),
                    })
                })
                .collect(),
        )
    } else {
        Value::Array(Vec::new())
    };

    // Legacy: `item.inventory_products?.[0]?.min_amount || 0`
    // null / undefined → 0; numeric value preserved (0 || 0 = 0 is already 0).
    let min_amount = if can_view_stock {
        match first_inv.and_then(|inv| inv.get("min_amount")).cloned() {
            Some(Value::Null) | None => json!(0),
            Some(v) => v,
        }
    } else {
        json!(0)
    };

    let warehouse = if can_view_stock {
        field_at_path(first_inv, &["inventory_warehouses", "name"])
    } else {
        Value::Null
    };

    let owner = match product.get("inventory_owners") {
        Some(o) if !o.is_null() => json!({
            "id":   get_field(o, "id"),
            "name": get_field(o, "name"),
            "avatar_url": get_field(o, "avatar_url"),
            "linked_workspace_user_id": get_field(o, "linked_workspace_user_id"),
        }),
        _ => Value::Null,
    };

    let finance_category = match product.get("transaction_categories") {
        Some(tc) if !tc.is_null() => json!({
            "id":    get_field(tc, "id"),
            "name":  get_field(tc, "name"),
            "color": get_field(tc, "color"),
            "icon":  get_field(tc, "icon"),
        }),
        _ => Value::Null,
    };

    let stock_changes = if can_view_stock {
        Value::Array(
            product
                .get("product_stock_changes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .iter()
                .map(|c| {
                    json!({
                        "amount":      get_field(c, "amount"),
                        "creator":     get_field(c, "creator"),
                        "beneficiary": get_field(c, "beneficiary"),
                        "warehouse":   get_field(c, "warehouse"),
                        "created_at":  get_field(c, "created_at"),
                    })
                })
                .collect(),
        )
    } else {
        Value::Array(Vec::new())
    };

    json!({
        "archived":           product.get("archived").cloned().unwrap_or(json!(false)),
        "avatar_url":         avatar_url,
        "id":                 get_field(&product, "id"),
        "name":               get_field(&product, "name"),
        "manufacturer_id":    get_field(&product, "manufacturer_id"),
        "manufacturer":       field_at_path(product.get("inventory_manufacturers"), &["name"]),
        "description":        get_field(&product, "description"),
        "usage":              get_field(&product, "usage"),
        "unit":               unit,
        "stock":              stock,
        "inventory":          inventory,
        "min_amount":         min_amount,
        "warehouse":          warehouse,
        "category":           field_at_path(product.get("product_categories"), &["name"]),
        "category_id":        get_field(&product, "category_id"),
        "owner_id":           get_field(&product, "owner_id"),
        "owner":              owner,
        "finance_category_id": get_field(&product, "finance_category_id"),
        "finance_category":   finance_category,
        "ws_id":              get_field(&product, "ws_id"),
        "created_at":         get_field(&product, "created_at"),
        "stock_changes":      stock_changes,
    })
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
        }
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": "Not found" })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": "Forbidden" })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": "Failed to verify workspace access" }),
        )),
    }
}

/// Extracts `(raw_ws_id, product_id)` from the request path.
///
/// Only matches `/api/v1/workspaces/{wsId}/products/{productId}` with no
/// trailing segments. Returns `None` for any other path, causing the dispatch
/// chain to skip this handler.
fn extract_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let slash_idx = rest.find('/')?;
    let ws_id = &rest[..slash_idx];
    if ws_id.is_empty() {
        return None;
    }
    let after_ws = &rest[slash_idx + 1..];
    let product_id = after_ws.strip_prefix(PRODUCTS_SEGMENT)?;
    if product_id.is_empty() || product_id.contains('/') {
        return None;
    }
    Some((ws_id, product_id))
}

/// Extracts a field from a JSON object, returning `Null` when absent.
fn get_field(value: &Value, key: &str) -> Value {
    value.get(key).cloned().unwrap_or(Value::Null)
}

/// Walks a chain of object keys in a `Value`, returning `Null` on any miss.
fn field_at_path(root: Option<&Value>, keys: &[&str]) -> Value {
    let mut current = match root {
        Some(v) => v,
        None => return Value::Null,
    };
    for &key in keys {
        current = match current.get(key) {
            Some(v) => v,
            None => return Value::Null,
        };
    }
    current.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";
    const PROD: &str = "22222222-2222-4222-8222-222222222222";

    // --- path guard / segment extraction ------------------------------------

    #[test]
    fn extract_segments_matches_expected_path() {
        let path = format!("/api/v1/workspaces/{WS}/products/{PROD}");
        assert_eq!(extract_path_segments(&path), Some((WS, PROD)));
    }

    #[test]
    fn extract_segments_rejects_wrong_prefix() {
        assert_eq!(
            extract_path_segments("/api/workspaces/ws-1/products/p-1"),
            None
        );
    }

    #[test]
    fn extract_segments_rejects_empty_product_id() {
        let path = format!("/api/v1/workspaces/{WS}/products/");
        assert_eq!(extract_path_segments(&path), None);
    }

    #[test]
    fn extract_segments_rejects_trailing_segment() {
        let path = format!("/api/v1/workspaces/{WS}/products/{PROD}/something");
        assert_eq!(extract_path_segments(&path), None);
    }

    #[test]
    fn extract_segments_rejects_wrong_infix() {
        let path = format!("/api/v1/workspaces/{WS}/batches/{PROD}");
        assert_eq!(extract_path_segments(&path), None);
    }

    #[test]
    fn extract_segments_rejects_empty_ws_id() {
        let path = format!("/api/v1/workspaces//products/{PROD}");
        assert_eq!(extract_path_segments(&path), None);
    }

    #[test]
    fn extract_segments_rejects_short_path() {
        assert_eq!(extract_path_segments("/api/v1"), None);
        assert_eq!(extract_path_segments("/"), None);
    }

    // --- format_product response shaping -----------------------------------

    #[test]
    fn format_product_minimal_no_stock() {
        let product = json!({ "id": "prod-1", "name": "Widget", "ws_id": WS });
        let formatted = format_product(product, None, false);
        assert_eq!(formatted["id"], "prod-1");
        assert_eq!(formatted["name"], "Widget");
        assert_eq!(formatted["unit"], Value::Null);
        assert_eq!(formatted["stock"], json!([]));
        assert_eq!(formatted["inventory"], json!([]));
        assert_eq!(formatted["min_amount"], json!(0));
        assert_eq!(formatted["warehouse"], Value::Null);
        assert_eq!(formatted["stock_changes"], json!([]));
        assert_eq!(formatted["archived"], json!(false));
        assert!(formatted["avatar_url"].is_null());
    }

    #[test]
    fn format_product_with_stock_and_inventory() {
        let product = json!({
            "id": "prod-1",
            "name": "Widget",
            "ws_id": WS,
            "archived": false,
            "inventory_products": [{
                "amount": 10.0,
                "min_amount": 2.0,
                "unit_id": "unit-1",
                "warehouse_id": "wh-1",
                "price": 99.99,
                "inventory_units": { "name": "pcs" },
                "inventory_warehouses": { "name": "Main" }
            }],
            "product_stock_changes": [{
                "amount": 5.0,
                "creator": "user-1",
                "beneficiary": null,
                "warehouse": "Main",
                "created_at": "2024-01-01T00:00:00Z"
            }],
        });
        let formatted = format_product(
            product,
            Some("https://example.com/img.png".to_owned()),
            true,
        );
        assert_eq!(formatted["unit"], "pcs");
        assert_eq!(formatted["warehouse"], "Main");
        assert_eq!(formatted["min_amount"], json!(2.0));
        assert_eq!(formatted["avatar_url"], "https://example.com/img.png");
        assert_eq!(formatted["stock"].as_array().unwrap().len(), 1);
        assert_eq!(formatted["inventory"].as_array().unwrap().len(), 1);
        assert_eq!(formatted["stock_changes"].as_array().unwrap().len(), 1);
        assert_eq!(formatted["stock"][0]["unit"], "pcs");
        assert_eq!(formatted["stock"][0]["warehouse"], "Main");
        assert_eq!(formatted["inventory"][0]["unit_id"], "unit-1");
        assert_eq!(formatted["inventory"][0]["warehouse_id"], "wh-1");
    }

    #[test]
    fn format_product_null_min_amount_becomes_zero() {
        let product = json!({
            "id": "prod-1",
            "ws_id": WS,
            "inventory_products": [{ "min_amount": null, "amount": 5.0 }],
        });
        let formatted = format_product(product, None, true);
        assert_eq!(formatted["min_amount"], json!(0));
    }

    #[test]
    fn format_product_owner_and_finance_category() {
        let product = json!({
            "id": "prod-1",
            "ws_id": WS,
            "inventory_owners": {
                "id": "owner-1",
                "name": "Alice",
                "avatar_url": null,
                "linked_workspace_user_id": "user-1"
            },
            "transaction_categories": {
                "id": "cat-1",
                "name": "Sales",
                "color": "#ff0000",
                "icon": "shopping-cart"
            },
        });
        let formatted = format_product(product, None, false);
        assert_eq!(formatted["owner"]["id"], "owner-1");
        assert_eq!(formatted["owner"]["name"], "Alice");
        assert_eq!(formatted["finance_category"]["name"], "Sales");
        assert_eq!(formatted["finance_category"]["color"], "#ff0000");
    }

    #[test]
    fn format_product_null_owner_and_null_finance_category() {
        let product = json!({
            "id": "prod-1",
            "ws_id": WS,
            "inventory_owners": null,
            "transaction_categories": null,
        });
        let formatted = format_product(product, None, false);
        assert!(formatted["owner"].is_null());
        assert!(formatted["finance_category"].is_null());
    }

    #[test]
    fn format_product_manufacturer_from_nested_name() {
        let product = json!({
            "id": "prod-1",
            "ws_id": WS,
            "manufacturer_id": "mfr-1",
            "inventory_manufacturers": { "id": "mfr-1", "name": "Acme" },
        });
        let formatted = format_product(product, None, false);
        assert_eq!(formatted["manufacturer_id"], "mfr-1");
        assert_eq!(formatted["manufacturer"], "Acme");
    }

    #[test]
    fn format_product_category_from_nested_name() {
        let product = json!({
            "id": "prod-1",
            "ws_id": WS,
            "category_id": "cat-1",
            "product_categories": { "name": "Electronics" },
        });
        let formatted = format_product(product, None, false);
        assert_eq!(formatted["category_id"], "cat-1");
        assert_eq!(formatted["category"], "Electronics");
    }
}
