//! Handler for `GET /api/v1/workspaces/:wsId/inventory/products`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/products/route.ts`.
//!
//! The legacy GET handler:
//!
//!   1. `authorizeInventoryWorkspace(req, id, { appSessionTargets: ['inventory',
//!      'finance'] })` — resolves the session (Supabase bearer/cookie or inventory/
//!      finance app-session token), normalizes the workspace id, verifies workspace
//!      membership, and loads the caller's effective permissions.
//!      Unauthenticated → 401; workspace not found / null permissions → 404;
//!      not a member → 403; membership-lookup failure → 500.
//!   2. Permission gates:
//!      - `canViewInventory = canViewInventoryCatalog || canCreateInventorySales`.
//!        Failing → 403 `{ message: 'Unauthorized' }`.
//!      - `canViewStockQuantity = canViewInventoryStock || canCreateInventorySales`.
//!        Controls which stock-related fields are returned.
//!   3. Parses `SearchParamsSchema` (`q`, `page`, `pageSize`, `categoryId`,
//!      `manufacturerId`, `sortBy`, `sortOrder`, `status`). Invalid → 400.
//!   4. Calls `private.get_inventory_catalog_products` RPC with service-role key.
//!   5. Fetches `avatar_url` from `workspace_products` for the returned product ids.
//!   6. Maps each RPC row to the documented response shape, gating stock fields on
//!      `canViewStockQuantity`.
//!   7. Returns `{ data, count }` with no-store cache headers.
//!
//! Only GET is migrated. POST returns `None` so the Cloudflare worker falls
//! through to the still-active Next.js route.
//!
//! BEHAVIOR GAPS:
//!
//!   - App-session tokens (`ttr_app_*`) for the `finance` target are accepted here
//!     (we include `"finance"` in `APP_SESSION_TARGETS`). Inventory app-session
//!     tokens are also accepted. Standard Supabase bearer/cookie sessions work as
//!     in every other inventory handler.
//!   - The `canViewInventory` gate returns 403 `{ message: "Unauthorized" }` to
//!     match the legacy route's exact response body (not the usual `"Forbidden"`).
//!   - RLS is not active on the RPC call (service-role key used), matching
//!     `createAdminClient()` in the legacy handler. An explicit `p_ws_id` filter
//!     scopes the result.
//!   - The legacy `normalizeUuid` helper rejects `categoryId`/`manufacturerId`
//!     that do not match the UUID pattern and returns `{ count: 0, data: [] }`.
//!     This port applies the same guard: non-UUID → empty response, not 400.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/inventory/products";
const APP_SESSION_TARGETS: [&str; 2] = ["inventory", "finance"];
const RPC_NAME: &str = "get_inventory_catalog_products";
const PRIVATE_SCHEMA: &str = "private";
const ADMIN_PERMISSION: &str = "admin";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_FOUND_MESSAGE: &str = "Not found";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory products";

// Mirrors MAX_SEARCH_LENGTH / MAX_MEDIUM_TEXT_LENGTH from @tuturuuu/utils/constants.
const MAX_SEARCH_LENGTH: usize = 500;
const MAX_PAGE_SIZE: i64 = 1000;
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const DEFAULT_SORT_BY: &str = "created_at";
const DEFAULT_SORT_ORDER: &str = "desc";
const DEFAULT_STATUS: &str = "active";

// Union of canViewInventoryCatalog + canCreateInventorySales permission ids
// (apps/web/src/lib/inventory/permissions.ts). The access gate grants access
// when the caller holds ANY of these. admin / has_all_permissions is handled
// separately.
const VIEW_INVENTORY_PERMISSIONS: [&str; 8] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
    "create_inventory_sales",
    "create_invoices",
];

// Union of canViewInventoryStock + canCreateInventorySales permission ids.
// When the caller holds ANY of these, stock-related fields are included.
const VIEW_STOCK_PERMISSIONS: [&str; 6] = [
    "view_inventory_stock",
    "view_stock_quantity",
    "adjust_inventory_stock",
    "update_stock_quantity",
    "create_inventory_sales",
    "create_invoices",
];

// ---------------------------------------------------------------------------
// Types for deserialization
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
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
struct AvatarRow {
    id: Option<String>,
    avatar_url: Option<Value>,
}

#[derive(Deserialize)]
struct RpcProductRow {
    #[serde(default)]
    total_count: Option<i64>,
    #[serde(default)]
    product: Option<Value>,
}

// ---------------------------------------------------------------------------
// Auth helpers (mirrors workspaces_wsid_inventory_categories.rs)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct InventoryUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MembershipCheck {
    Member,
    NotMember,
}

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

// ---------------------------------------------------------------------------
// Query parameter struct
// ---------------------------------------------------------------------------

struct ProductsQuery {
    q: String,
    page: i64,
    page_size: i64,
    category_id: Option<String>,
    manufacturer_id: Option<String>,
    sort_by: String,
    sort_order: String,
    status: String,
}

// ---------------------------------------------------------------------------
// Public handler entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_inventory_products_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = inventory_products_ws_id(request.path)?;

    Some(match request.method {
        "GET" => inventory_products_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

async fn inventory_products_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return msg_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
    }

    // --- authorizeInventoryWorkspace -----------------------------------------
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return err_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return err_response(404, NOT_FOUND_MESSAGE),
        };

    match member_check(&config.contact_data, outbound, &resolved_ws_id, &user).await {
        Ok(MembershipCheck::Member) => {}
        Ok(MembershipCheck::NotMember) => return msg_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return msg_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let permissions =
        match effective_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(Some(p)) => p,
            Ok(None) | Err(()) => return err_response(404, NOT_FOUND_MESSAGE),
        };

    // --- Parse query parameters ----------------------------------------------
    let query = match parse_products_query(request.url) {
        Ok(q) => q,
        Err(()) => return msg_response(400, INVALID_QUERY_MESSAGE),
    };

    // --- Permission gates ----------------------------------------------------
    let can_view_inventory = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|p| VIEW_INVENTORY_PERMISSIONS.contains(&p.as_str()));

    if !can_view_inventory {
        // Legacy returns `{ message: "Unauthorized" }` (not "Forbidden") here.
        return msg_response(403, UNAUTHORIZED_MESSAGE);
    }

    let can_view_stock = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|p| VIEW_STOCK_PERMISSIONS.contains(&p.as_str()));

    // --- Fetch data via RPC --------------------------------------------------
    let offset = (query.page - 1) * query.page_size;
    let rows = match fetch_rpc_products(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &query,
        can_view_stock,
        query.page_size,
        offset,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return msg_response(500, LOAD_FAILED_MESSAGE),
    };

    let count = rows.first().and_then(|r| r.total_count).unwrap_or(0);
    let products: Vec<Value> = rows
        .into_iter()
        .filter_map(|r| r.product)
        .filter(|p| !p.is_null())
        .collect();

    // --- Fetch avatar_url for each product id --------------------------------
    let product_ids: Vec<&str> = products
        .iter()
        .filter_map(|p| p.get("id").and_then(Value::as_str))
        .collect();

    let avatar_map = fetch_avatar_urls(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &product_ids,
    )
    .await;

    // --- Map products to response shape --------------------------------------
    let data: Vec<Value> = products
        .iter()
        .map(|item| map_product(item, can_view_stock, &avatar_map))
        .collect();

    no_store_response(json_response(200, json!({ "data": data, "count": count })))
}

// ---------------------------------------------------------------------------
// RPC call
// ---------------------------------------------------------------------------

async fn fetch_rpc_products(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ProductsQuery,
    include_stock: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<RpcProductRow>, ()> {
    // normalizeUuid: if categoryId / manufacturerId is provided but not a valid
    // UUID, the legacy handler returns { count: 0, data: [] } immediately.
    let p_category_id = match &query.category_id {
        Some(id) if !is_uuid(id) => return Ok(Vec::new()),
        other => other.as_deref(),
    };
    let p_manufacturer_id = match &query.manufacturer_id {
        Some(id) if !is_uuid(id) => return Ok(Vec::new()),
        other => other.as_deref(),
    };

    let trimmed_search = query.q.trim();
    let p_search: Option<&str> = if trimmed_search.is_empty() {
        None
    } else {
        Some(trimmed_search)
    };

    let rpc_url = contact_data.rpc_url(RPC_NAME).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let auth_header = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&json!({
        "p_ws_id": ws_id,
        "p_limit": limit,
        "p_offset": offset,
        "p_search": p_search,
        "p_include_stock": include_stock,
        "p_category_id": p_category_id,
        "p_manufacturer_id": p_manufacturer_id,
        "p_sort_by": &query.sort_by,
        "p_sort_order": &query.sort_order,
        "p_status": &query.status,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
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

    response.json::<Vec<RpcProductRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Avatar URL fetch
// ---------------------------------------------------------------------------

async fn fetch_avatar_urls(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    product_ids: &[&str],
) -> std::collections::HashMap<String, Value> {
    if product_ids.is_empty() {
        return std::collections::HashMap::new();
    }

    // Build PostgREST `in.(id1,id2,...)` filter.
    let ids_filter = format!("in.({})", product_ids.join(","));
    let url = match contact_data.rest_url(
        "workspace_products",
        &[
            ("select", "id,avatar_url".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", ids_filter),
        ],
    ) {
        Some(u) => u,
        None => return std::collections::HashMap::new(),
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return std::collections::HashMap::new(),
    };
    let auth_header = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(r) if (200..300).contains(&r.status) => r,
        _ => return std::collections::HashMap::new(),
    };

    let rows: Vec<AvatarRow> = match response.json::<Vec<AvatarRow>>() {
        Ok(r) => r,
        Err(_) => return std::collections::HashMap::new(),
    };

    rows.into_iter()
        .filter_map(|row| row.id.map(|id| (id, row.avatar_url.unwrap_or(Value::Null))))
        .collect()
}

// ---------------------------------------------------------------------------
// Product response mapping
// ---------------------------------------------------------------------------

fn select_primary_inventory(inventories: &[Value]) -> Option<&Value> {
    if inventories.is_empty() {
        return None;
    }

    inventories.iter().min_by(|a, b| {
        let key_a = inventory_sort_key(a);
        let key_b = inventory_sort_key(b);
        key_a.cmp(&key_b)
    })
}

fn inventory_sort_key(inv: &Value) -> String {
    let warehouse_id = inv
        .get("warehouse_id")
        .and_then(Value::as_str)
        .unwrap_or("");
    let unit_id = inv.get("unit_id").and_then(Value::as_str).unwrap_or("");
    let created_at = inv.get("created_at").and_then(Value::as_str).unwrap_or("");
    format!("{warehouse_id}|{unit_id}|{created_at}")
}

fn map_product(
    item: &Value,
    can_view_stock: bool,
    avatar_map: &std::collections::HashMap<String, Value>,
) -> Value {
    let id = item.get("id").cloned().unwrap_or(Value::Null);
    let id_str = id.as_str().unwrap_or("");

    let avatar_url = avatar_map.get(id_str).cloned().unwrap_or(Value::Null);

    let inventory_products: &[Value] = item
        .get("inventory_products")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);

    let primary = select_primary_inventory(inventory_products);

    let unit = if can_view_stock {
        primary
            .and_then(|p| p.get("inventory_units"))
            .and_then(|u| u.get("name"))
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    let stock: Value = if can_view_stock {
        Value::Array(
            inventory_products
                .iter()
                .map(|inv| {
                    json!({
                        "amount": inv.get("amount").cloned().unwrap_or(Value::Null),
                        "min_amount": inv.get("min_amount").cloned().unwrap_or(Value::Null),
                        "unit": inv.get("inventory_units").and_then(|u| u.get("name")).cloned().unwrap_or(Value::Null),
                        "warehouse": inv.get("inventory_warehouses").and_then(|w| w.get("name")).cloned().unwrap_or(Value::Null),
                        "price": inv.get("price").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect(),
        )
    } else {
        Value::Array(Vec::new())
    };

    let inventory: Value = if can_view_stock {
        Value::Array(
            inventory_products
                .iter()
                .map(|inv| {
                    json!({
                        "unit_id": inv.get("unit_id").cloned().unwrap_or(Value::Null),
                        "warehouse_id": inv.get("warehouse_id").cloned().unwrap_or(Value::Null),
                        "amount": inv.get("amount").cloned().unwrap_or(Value::Null),
                        "min_amount": inv.get("min_amount").and_then(Value::as_f64).unwrap_or(0.0),
                        "price": inv.get("price").and_then(Value::as_f64).unwrap_or(0.0),
                        "unit_name": inv.get("inventory_units").and_then(|u| u.get("name")).cloned().unwrap_or(Value::Null),
                        "warehouse_name": inv.get("inventory_warehouses").and_then(|w| w.get("name")).cloned().unwrap_or(Value::Null),
                    })
                })
                .collect(),
        )
    } else {
        Value::Array(Vec::new())
    };

    let min_amount = if can_view_stock {
        primary
            .and_then(|p| p.get("min_amount"))
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    let warehouse = if can_view_stock {
        primary
            .and_then(|p| p.get("inventory_warehouses"))
            .and_then(|w| w.get("name"))
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    let owner = item.get("inventory_owners").and_then(|o| {
        if o.is_null() {
            None
        } else {
            Some(json!({
                "id": o.get("id").cloned().unwrap_or(Value::Null),
                "name": o.get("name").cloned().unwrap_or(Value::Null),
                "avatar_url": o.get("avatar_url").cloned().unwrap_or(Value::Null),
                "linked_workspace_user_id": o.get("linked_workspace_user_id").cloned().unwrap_or(Value::Null),
            }))
        }
    });

    let finance_category = item.get("transaction_categories").and_then(|tc| {
        if tc.is_null() {
            None
        } else {
            Some(json!({
                "id": tc.get("id").cloned().unwrap_or(Value::Null),
                "name": tc.get("name").cloned().unwrap_or(Value::Null),
                "color": tc.get("color").cloned().unwrap_or(Value::Null),
                "icon": tc.get("icon").cloned().unwrap_or(Value::Null),
            }))
        }
    });

    json!({
        "archived": item.get("archived").and_then(Value::as_bool).unwrap_or(false),
        "avatar_url": avatar_url,
        "id": id,
        "name": item.get("name").cloned().unwrap_or(Value::Null),
        "manufacturer_id": item.get("manufacturer_id").cloned().unwrap_or(Value::Null),
        "manufacturer": item.get("inventory_manufacturers").and_then(|m| m.get("name")).cloned().unwrap_or(Value::Null),
        "description": item.get("description").cloned().unwrap_or(Value::Null),
        "usage": item.get("usage").cloned().unwrap_or(Value::Null),
        "unit": unit,
        "stock": stock,
        "inventory": inventory,
        "min_amount": min_amount,
        "warehouse": warehouse,
        "category": item.get("product_categories").and_then(|c| c.get("name")).cloned().unwrap_or(Value::Null),
        "category_id": item.get("category_id").cloned().unwrap_or(Value::Null),
        "owner_id": item.get("owner_id").cloned().unwrap_or(Value::Null),
        "owner": owner.unwrap_or(Value::Null),
        "finance_category_id": item.get("finance_category_id").cloned().unwrap_or(Value::Null),
        "finance_category": finance_category.unwrap_or(Value::Null),
        "ws_id": item.get("ws_id").cloned().unwrap_or(Value::Null),
        "created_at": item.get("created_at").cloned().unwrap_or(Value::Null),
    })
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

fn parse_products_query(request_url: Option<&str>) -> Result<ProductsQuery, ()> {
    let mut q_raw: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut category_id_raw: Option<String> = None;
    let mut manufacturer_id_raw: Option<String> = None;
    let mut sort_by_raw: Option<String> = None;
    let mut sort_order_raw: Option<String> = None;
    let mut status_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) {
        for (key, value) in url.query_pairs() {
            let value = value.into_owned();
            match key.as_ref() {
                "q" => q_raw = Some(value),
                "page" => page_raw = Some(value),
                "pageSize" => page_size_raw = Some(value),
                "categoryId" => category_id_raw = Some(value),
                "manufacturerId" => manufacturer_id_raw = Some(value),
                "sortBy" => sort_by_raw = Some(value),
                "sortOrder" => sort_order_raw = Some(value),
                "status" => status_raw = Some(value),
                _ => {}
            }
        }
    }

    // `q`: string, max 500, default ''.
    let q = match q_raw {
        None => String::new(),
        Some(v) => {
            if v.chars().count() > MAX_SEARCH_LENGTH {
                return Err(());
            }
            v
        }
    };

    // `page` / `pageSize`: coerce number, int, min 1.
    let page = coerce_int_param(page_raw.as_deref(), 1, i64::MAX, DEFAULT_PAGE)?;
    let page_size = coerce_int_param(
        page_size_raw.as_deref(),
        1,
        MAX_PAGE_SIZE,
        DEFAULT_PAGE_SIZE,
    )?;

    // `categoryId` / `manufacturerId`: z.guid().optional().
    // Non-UUID values are stored so the RPC guard can detect them (empty
    // response, not 400).
    let category_id = category_id_raw.filter(|v| !v.is_empty());
    let manufacturer_id = manufacturer_id_raw.filter(|v| !v.is_empty());

    // `sortBy`: optional enum.
    const VALID_SORT_BY: [&str; 7] = [
        "id",
        "name",
        "manufacturer",
        "description",
        "usage",
        "category_id",
        "created_at",
    ];
    let sort_by = match sort_by_raw.as_deref() {
        None | Some("") => DEFAULT_SORT_BY.to_owned(),
        Some(v) if VALID_SORT_BY.contains(&v) => v.to_owned(),
        Some(_) => return Err(()),
    };

    // `sortOrder`: optional enum.
    let sort_order = match sort_order_raw.as_deref() {
        None | Some("") => DEFAULT_SORT_ORDER.to_owned(),
        Some("asc") => "asc".to_owned(),
        Some("desc") => "desc".to_owned(),
        Some(_) => return Err(()),
    };

    // `status`: enum, default 'active'.
    let status = match status_raw.as_deref() {
        None | Some("") | Some("active") => DEFAULT_STATUS.to_owned(),
        Some("archived") => "archived".to_owned(),
        Some("all") => "all".to_owned(),
        Some(_) => return Err(()),
    };

    Ok(ProductsQuery {
        q,
        page,
        page_size,
        category_id,
        manufacturer_id,
        sort_by,
        sort_order,
        status,
    })
}

/// Mirrors `z.coerce.number().int().min(min).max(max).default(default)`.
fn coerce_int_param(raw: Option<&str>, min: i64, max: i64, default: i64) -> Result<i64, ()> {
    let Some(raw) = raw else {
        return Ok(default);
    };

    let trimmed = raw.trim();
    let number: f64 = if trimmed.is_empty() {
        return Err(());
    } else {
        trimmed.parse::<f64>().map_err(|_| ())?
    };

    if !number.is_finite() || number.fract() != 0.0 {
        return Err(());
    }

    let value = number as i64;
    if value < min || value > max {
        return Err(());
    }

    Ok(value)
}

/// Validates that `s` looks like a UUID (8-4-4-4-12 hex with hyphens).
fn is_uuid(s: &str) -> bool {
    let s = s.trim();
    if s.len() != 36 {
        return false;
    }
    s.chars().enumerate().all(|(i, c)| match i {
        8 | 13 | 18 | 23 => c == '-',
        _ => c.is_ascii_hexdigit(),
    })
}

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

fn inventory_products_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Auth helpers (mirrors workspaces_wsid_inventory_categories.rs)
// ---------------------------------------------------------------------------

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<InventoryUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &APP_SESSION_TARGETS).ok()?;

        let id = identity.id;
        return (!id.trim().is_empty()).then_some(InventoryUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = user.id.filter(|id| !id.trim().is_empty())?;

    Some(InventoryUser {
        access_token: Some(access_token),
        id,
    })
}

async fn member_check(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<MembershipCheck, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(MembershipCheck::NotMember);
    };

    if membership_type == "MEMBER" {
        Ok(MembershipCheck::Member)
    } else {
        Ok(MembershipCheck::NotMember)
    }
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<EffectivePermissions>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user.id.as_str());

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(Some(EffectivePermissions {
        has_all_permissions: is_creator || permissions.iter().any(|p| p == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{}", user.id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(first_row::<WorkspaceMembershipRow>(&response)?
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
    let response = send_service_role(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    first_row::<WorkspaceRow>(&response)
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
    let response = send_service_role(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !(200..300).contains(&response.status) {
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
    let response = send_service_role(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<String>, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_uuid(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_valid_workspace_handle(&handle) {
            if let Some(at) = user.access_token.as_deref()
                && let Some(id) = workspace_id_by_handle(
                    contact_data,
                    outbound,
                    &handle,
                    &DataAuth::AccessToken(at),
                )
                .await?
            {
                return Ok(Some(id));
            }
            if let Some(id) =
                workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole)
                    .await?
            {
                return Ok(Some(id));
            }
        }
    }

    Ok(Some(resolved))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &InventoryUser,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn send_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(contact_data, outbound, method, url, &DataAuth::ServiceRole).await
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(token) => format!("Bearer {token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Utility helpers
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
            if let Some(rp) = map.get("workspace_role_permissions") {
                collect_role_permissions(rp, permissions);
            }
            if let Some(wr) = map.get("workspace_roles") {
                collect_role_permissions(wr, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for p in values {
        if !permissions.iter().any(|x| x == &p) {
            permissions.push(p);
        }
    }
}

fn first_row<T: for<'de> Deserialize<'de>>(response: &OutboundResponse) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_valid_workspace_handle(s: &str) -> bool {
    let len = s.len();
    if len == 0 || len > 64 {
        return false;
    }
    s.chars().enumerate().all(|(i, c)| {
        let edge = i == 0 || i + 1 == len;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!edge && matches!(c, '_' | '-'))
    })
}

fn msg_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn err_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            inventory_products_ws_id("/api/v1/workspaces/ws-123/inventory/products"),
            Some("ws-123")
        );
        assert_eq!(
            inventory_products_ws_id("/api/v1/workspaces/personal/inventory/products"),
            Some("personal")
        );
        assert_eq!(
            inventory_products_ws_id(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/inventory/products"
            ),
            Some("00000000-0000-0000-0000-000000000000")
        );
    }

    #[test]
    fn path_guard_rejects_non_matching() {
        // Empty ws_id.
        assert_eq!(
            inventory_products_ws_id("/api/v1/workspaces//inventory/products"),
            None
        );
        // Missing v1.
        assert_eq!(
            inventory_products_ws_id("/api/workspaces/ws-1/inventory/products"),
            None
        );
        // Different suffix.
        assert_eq!(
            inventory_products_ws_id("/api/v1/workspaces/ws-1/inventory/categories"),
            None
        );
        // Nested id after the collection route.
        assert_eq!(
            inventory_products_ws_id("/api/v1/workspaces/ws-1/inventory/products/abc"),
            None
        );
    }

    #[test]
    fn query_defaults_are_applied() {
        let q = parse_products_query(Some("https://x.test/")).expect("defaults");
        assert_eq!(q.q, "");
        assert_eq!(q.page, DEFAULT_PAGE);
        assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
        assert_eq!(q.sort_by, DEFAULT_SORT_BY);
        assert_eq!(q.sort_order, DEFAULT_SORT_ORDER);
        assert_eq!(q.status, DEFAULT_STATUS);
        assert!(q.category_id.is_none());
        assert!(q.manufacturer_id.is_none());
    }

    #[test]
    fn query_parses_valid_params() {
        let q = parse_products_query(Some(
            "https://x.test/?q=widget&page=2&pageSize=25&sortBy=name&sortOrder=asc&status=archived",
        ))
        .expect("valid");
        assert_eq!(q.q, "widget");
        assert_eq!(q.page, 2);
        assert_eq!(q.page_size, 25);
        assert_eq!(q.sort_by, "name");
        assert_eq!(q.sort_order, "asc");
        assert_eq!(q.status, "archived");
    }

    #[test]
    fn query_rejects_invalid_params() {
        // Invalid sortBy.
        assert!(parse_products_query(Some("https://x.test/?sortBy=invalid")).is_err());
        // Invalid sortOrder.
        assert!(parse_products_query(Some("https://x.test/?sortOrder=random")).is_err());
        // Invalid status.
        assert!(parse_products_query(Some("https://x.test/?status=unknown")).is_err());
        // Non-integer page.
        assert!(parse_products_query(Some("https://x.test/?page=abc")).is_err());
        // pageSize above max.
        assert!(parse_products_query(Some("https://x.test/?pageSize=1001")).is_err());
        // page below min.
        assert!(parse_products_query(Some("https://x.test/?page=0")).is_err());
    }

    #[test]
    fn is_uuid_accepts_valid_uuids() {
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn is_uuid_rejects_invalid() {
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid(""));
        assert!(!is_uuid("550e8400-e29b-41d4-a716-44665544000"));
    }

    #[test]
    fn select_primary_inventory_picks_lexicographic_minimum() {
        let inv_a: Value = json!({
            "warehouse_id": "b",
            "unit_id": "x",
            "created_at": "2024-01-01"
        });
        let inv_b: Value = json!({
            "warehouse_id": "a",
            "unit_id": "z",
            "created_at": "2025-01-01"
        });
        let inventories = vec![inv_a, inv_b];
        let primary = select_primary_inventory(&inventories).expect("primary");
        assert_eq!(
            primary.get("warehouse_id").and_then(Value::as_str),
            Some("a")
        );
    }

    #[test]
    fn select_primary_inventory_empty_returns_none() {
        assert!(select_primary_inventory(&[]).is_none());
    }
}
