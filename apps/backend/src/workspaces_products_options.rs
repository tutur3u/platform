use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_PRODUCTS_OPTIONS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_PRODUCTS_OPTIONS_PATH_SUFFIX: &str = "/products/options";
const CATALOG_PRODUCTS_RPC: &str = "get_inventory_catalog_products";
const PRIVATE_SCHEMA: &str = "private";
const CATALOG_PRODUCTS_LIMIT: i64 = 10_000;

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// Mirrors `canViewInventoryCatalog` in
// apps/web/src/lib/inventory/permissions.ts: the caller may view the catalog
// when they hold ANY of these permissions. Workspace creators / admins are
// covered by the `has_all_permissions` shortcut inside
// `authorize_workspace_permission`.
const VIEW_INVENTORY_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

// Union of `canViewInventoryStock` and `canCreateInventorySales`
// (apps/web/src/lib/inventory/permissions.ts). The legacy route sets
// `includeStock` when the caller holds ANY of these permissions.
const INCLUDE_STOCK_PERMISSIONS: [&str; 6] = [
    // canViewInventoryStock
    "view_inventory_stock",
    "view_stock_quantity",
    "adjust_inventory_stock",
    "update_stock_quantity",
    // canCreateInventorySales
    "create_inventory_sales",
    "create_invoices",
];

pub(crate) async fn handle_workspaces_products_options_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_products_options_ws_id(request.path)?;

    Some(match request.method {
        "GET" => products_options_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn products_options_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // `canViewInventoryCatalog` gate. Resolves the workspace alias and confirms
    // the caller holds at least one catalog permission. The legacy route treats
    // a missing-permissions / unresolved-permission context the same as
    // `canViewInventoryCatalog === false`, i.e. 403 Forbidden (it never returns
    // 404 here).
    let ws_id = match authorize_catalog_access(contact_data, request, raw_ws_id, outbound).await {
        Ok(ws_id) => ws_id,
        Err(response) => return response,
    };

    // `includeStock = canViewInventoryStock(permissions) || canCreateInventorySales(permissions)`.
    let include_stock = match has_any_permission(
        contact_data,
        request,
        raw_ws_id,
        &INCLUDE_STOCK_PERMISSIONS,
        outbound,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let products = match fetch_catalog_products(contact_data, outbound, &ws_id, include_stock).await
    {
        Ok(products) => products,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    no_store_response(json_response(200, json!({ "data": products })))
}

/// Mirrors `canViewInventoryCatalog`: success if the caller holds ANY catalog
/// permission. Returns the resolved workspace id, or a ready-to-send error
/// response. Note that the legacy route never surfaces a 404 from this gate; a
/// missing permission context just means `canViewInventoryCatalog === false`,
/// which is a 403.
async fn authorize_catalog_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    let mut last_unauthorized = false;

    for permission in VIEW_INVENTORY_CATALOG_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; keep checking.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            // `getPermissions` returning null (no resolvable permission context)
            // makes `canViewInventoryCatalog` false in the legacy route, which is
            // surfaced as 403 Forbidden (not 404). Keep checking remaining
            // permissions in case another resolves, otherwise fall through to 403.
            Err(WorkspacePermissionAuthorizationError::NotFound) => {}
            Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
                last_unauthorized = true;
            }
            Err(WorkspacePermissionAuthorizationError::Internal) => {
                return Err(error_response(500, INTERNAL_SERVER_ERROR_MESSAGE));
            }
        }
    }

    if last_unauthorized {
        Err(error_response(401, UNAUTHORIZED_MESSAGE))
    } else {
        Err(error_response(403, FORBIDDEN_MESSAGE))
    }
}

/// Returns true when the caller holds ANY of `permissions`. Unlike
/// `authorize_catalog_access`, an unresolved permission context simply means
/// "no", since the legacy route only reads these to compute a boolean flag.
async fn has_any_permission(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    permissions: &[&str],
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    for permission in permissions {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(_) => return Ok(true),
            Err(
                WorkspacePermissionAuthorizationError::Forbidden
                | WorkspacePermissionAuthorizationError::NotFound
                | WorkspacePermissionAuthorizationError::Unauthorized,
            ) => {}
            Err(WorkspacePermissionAuthorizationError::Internal) => return Err(()),
        }
    }

    Ok(false)
}

/// Mirrors `getInventoryCatalogProducts({ includeStock, limit: 10_000,
/// sortBy: 'name', sortOrder: 'asc', status: 'active', wsId })` followed by the
/// per-product transform in the legacy route.
async fn fetch_catalog_products(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    include_stock: bool,
) -> Result<Vec<Value>, ()> {
    let rows = call_catalog_rpc(contact_data, outbound, ws_id, include_stock).await?;

    // The RPC returns `[{ product, total_count }]`; collect the non-null
    // `product` values.
    let mut products: Vec<Value> = rows
        .into_iter()
        .filter_map(|row| match row {
            Value::Object(mut map) => map.remove("product"),
            _ => None,
        })
        .filter(|product| !product.is_null())
        .collect();

    // Mirror `getInventoryCatalogProducts`: overlay `avatar_url` from
    // `workspace_products` for the returned product ids.
    let product_ids: Vec<String> = products
        .iter()
        .filter_map(|product| product.get("id").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();

    let avatar_by_id = if product_ids.is_empty() {
        Vec::new()
    } else {
        fetch_product_avatars(contact_data, outbound, ws_id, &product_ids).await?
    };

    for product in &mut products {
        if let Value::Object(map) = product
            && let Some(id) = map.get("id").and_then(Value::as_str).map(str::to_owned)
        {
            let avatar = avatar_by_id
                .iter()
                .find(|(product_id, _)| product_id == &id)
                .map(|(_, avatar)| avatar.clone())
                .unwrap_or(Value::Null);
            map.insert("avatar_url".to_owned(), avatar);
        }
    }

    Ok(products
        .into_iter()
        .map(|product| transform_product(product, include_stock))
        .collect())
}

/// Mirrors the per-product mapping in the legacy route:
/// - strip the joined `inventory_products` field, re-add it as the original
///   value (or `[]`) only when `includeStock`, otherwise `[]`;
/// - add `manufacturer` from `inventory_manufacturers.name` (else null);
/// - keep all other product fields untouched.
fn transform_product(product: Value, include_stock: bool) -> Value {
    let Value::Object(mut map) = product else {
        return product;
    };

    let inventory_products = map.remove("inventory_products");
    let manufacturer = map
        .get("inventory_manufacturers")
        .and_then(|value| value.get("name"))
        .cloned()
        .filter(|value| !value.is_null())
        .unwrap_or(Value::Null);

    let inventory_products = if include_stock {
        match inventory_products {
            Some(Value::Array(items)) => Value::Array(items),
            _ => Value::Array(Vec::new()),
        }
    } else {
        Value::Array(Vec::new())
    };

    map.insert("inventory_products".to_owned(), inventory_products);
    map.insert("manufacturer".to_owned(), manufacturer);

    Value::Object(map)
}

async fn call_catalog_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    include_stock: bool,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url(CATALOG_PRODUCTS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_include_stock": include_stock,
        "p_limit": CATALOG_PRODUCTS_LIMIT,
        "p_offset": 0,
        "p_sort_by": "name",
        "p_sort_order": "asc",
        "p_status": "active",
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
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

    match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => Ok(rows),
        Value::Null => Ok(Vec::new()),
        _ => Err(()),
    }
}

async fn fetch_product_avatars(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    product_ids: &[String],
) -> Result<Vec<(String, Value)>, ()> {
    let in_filter = format!("in.({})", product_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_products",
        &[
            ("select", "id,avatar_url".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", in_filter),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => rows,
        _ => Vec::new(),
    };

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let id = row.get("id").and_then(Value::as_str)?.to_owned();
            let avatar = row.get("avatar_url").cloned().unwrap_or(Value::Null);
            Some((id, avatar))
        })
        .collect())
}

fn workspaces_products_options_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_PRODUCTS_OPTIONS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_PRODUCTS_OPTIONS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
