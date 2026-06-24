use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACE_INVENTORY_CHECKOUTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_INVENTORY_CHECKOUTS_PATH_SUFFIX: &str = "/inventory/checkouts";
const LIST_CHECKOUTS_RPC: &str = "list_inventory_checkouts";
const PRIVATE_SCHEMA: &str = "private";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to load inventory checkouts";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";

const DEFAULT_PAGE_SIZE: i64 = 25;
const MAX_PAGE_SIZE: i64 = 100;
const MAX_SEARCH_LENGTH: usize = 120;

// Mirrors `canViewInventorySales` in
// apps/web/src/lib/inventory/permissions.ts (any of these permissions grants
// access). Workspace creators / admins are covered by `has_all_permissions`
// inside `authorize_workspace_permission`.
const VIEW_INVENTORY_SALES_PERMISSIONS: [&str; 2] = ["view_inventory_sales", "view_invoices"];

// Mirrors `CheckoutStatusSchema` in
// apps/web/src/lib/inventory/commerce/schemas.ts. The list query also accepts
// the literal `all`, which is normalized to "no status filter".
const CHECKOUT_STATUSES: [&str; 4] = ["reserved", "completed", "cancelled", "expired"];

/// Validated + normalized list query, mirroring `normalizePagination` and the
/// status/search normalization performed by `listCheckouts` in
/// apps/web/src/lib/inventory/commerce/checkouts.ts.
struct CheckoutListQuery {
    limit: i64,
    offset: i64,
    search: Option<String>,
    status: Option<String>,
}

pub(crate) async fn handle_workspace_inventory_checkouts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_inventory_checkouts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => checkouts_list_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn checkouts_list_response(
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

    let query = match parse_list_query(request.url) {
        Ok(query) => query,
        Err(response) => return *response,
    };

    match fetch_checkouts(&config.contact_data, outbound, &ws_id, &query).await {
        Ok(result) => no_store_response(json_response(200, result)),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-sales permissions. Returns the resolved workspace id on success,
/// or a ready-to-send error response.
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

fn parse_list_query(request_url: Option<&str>) -> Result<CheckoutListQuery, Box<BackendResponse>> {
    let mut page: Option<i64> = None;
    let mut page_size: Option<i64> = None;
    let mut search: Option<String> = None;
    let mut status: Option<String> = None;
    let mut errors: Vec<Value> = Vec::new();

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" => match parse_positive_int(&value) {
                    Some(parsed) => page = Some(parsed),
                    None => errors.push(query_issue(
                        "page",
                        "Invalid input: expected an integer greater than or equal to 1",
                    )),
                },
                "pageSize" => match parse_positive_int(&value) {
                    Some(parsed) if parsed <= MAX_PAGE_SIZE => page_size = Some(parsed),
                    _ => errors.push(query_issue(
                        "pageSize",
                        "Invalid input: expected an integer between 1 and 100",
                    )),
                },
                "q" => {
                    let trimmed = value.trim();
                    if trimmed.chars().count() > MAX_SEARCH_LENGTH {
                        errors.push(query_issue("q", "Too long"));
                    } else if !trimmed.is_empty() {
                        search = Some(trimmed.to_owned());
                    }
                }
                "status" => {
                    let value = value.as_ref();
                    if value == "all" || CHECKOUT_STATUSES.contains(&value) {
                        status = Some(value.to_owned());
                    } else {
                        errors.push(query_issue("status", "Invalid option"));
                    }
                }
                _ => {}
            }
        }
    }

    if !errors.is_empty() {
        return Err(Box::new(no_store_response(json_response(
            400,
            json!({ "message": INVALID_QUERY_MESSAGE, "errors": errors }),
        ))));
    }

    // Mirrors `normalizePagination`: limit = clamp(pageSize ?? 25, 1..=100),
    // offset = (max(1, page ?? 1) - 1) * limit.
    let limit = page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);
    let offset = (page.unwrap_or(1).max(1) - 1) * limit;
    // Mirrors `status && status !== 'all' ? status : null`.
    let status = status.filter(|value| value != "all");

    Ok(CheckoutListQuery {
        limit,
        offset,
        search,
        status,
    })
}

async fn fetch_checkouts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &CheckoutListQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(LIST_CHECKOUTS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_limit": query.limit,
        "p_offset": query.offset,
        "p_search": query.search,
        "p_status": query.status,
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

    let rows = response.json::<Value>().map_err(|_| ())?;

    Ok(map_rpc_list(&rows))
}

/// Mirrors `mapRpcList(rows, 'checkout')` in
/// apps/web/src/lib/inventory/commerce/checkouts.ts:
///   count = rows[0].total_count ?? 0
///   data  = rows.map(row => row.checkout).filter(Boolean)
fn map_rpc_list(rows: &Value) -> Value {
    let rows = rows.as_array();

    let count = rows
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("total_count"))
        .and_then(Value::as_i64)
        .unwrap_or(0);

    let data: Vec<Value> = rows
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get("checkout"))
                // `.filter(Boolean)` drops null/false-y checkout values.
                .filter(|checkout| !checkout.is_null())
                .cloned()
                .collect()
        })
        .unwrap_or_default();

    json!({
        "count": count,
        "data": data,
    })
}

fn parse_positive_int(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Mirrors `z.coerce.number().int().min(1)`: coerce to number, reject
    // non-integers and values below 1.
    let parsed = trimmed.parse::<f64>().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 || parsed < 1.0 {
        return None;
    }
    Some(parsed as i64)
}

fn query_issue(field: &str, message: &str) -> Value {
    json!({
        "path": [field],
        "message": message,
    })
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

fn workspace_inventory_checkouts_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_INVENTORY_CHECKOUTS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_INVENTORY_CHECKOUTS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
