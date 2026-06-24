use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_PRODUCT_SUPPLIERS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_PRODUCT_SUPPLIERS_PATH_SUFFIX: &str = "/product-suppliers";

const PRIVATE_SCHEMA: &str = "private";
const INVENTORY_SUPPLIERS_TABLE: &str = "inventory_suppliers";
const VIEW_INVENTORY_PERMISSION: &str = "view_inventory";

const NOT_FOUND_MESSAGE: &str = "Not found";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view inventory";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
// Mirrors the (slightly mislabeled) error message in the legacy route.
const FETCH_FAILED_MESSAGE: &str = "Error fetching workspace user groups";

// Mirrors the zod schema in apps/web/src/lib/inventory/api-list-query.ts which
// references MAX_SEARCH_LENGTH / MAX_MEDIUM_TEXT_LENGTH from
// packages/utils/src/constants.ts.
const MAX_SEARCH_LENGTH: usize = 500;
const MAX_MEDIUM_TEXT_LENGTH: usize = 1000;

/// Parsed + validated list query parameters. Mirrors `InventoryApiListQuery`.
struct InventoryListQuery {
    q: String,
    page: u32,
    page_size: u32,
    paginate: bool,
}

pub(crate) async fn handle_workspaces_product_suppliers_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_product_suppliers_ws_id(request.path)?;

    // Only GET is migrated. Every other method must fall through to the still
    // active Next.js route (POST, etc.) by returning None.
    match request.method {
        "GET" => Some(product_suppliers_response(config, request, raw_ws_id, outbound).await),
        _ => None,
    }
}

async fn product_suppliers_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route parses and validates the query BEFORE checking
    // permissions, returning 400 on an invalid query regardless of auth.
    let query = match parse_inventory_list_query(request.url) {
        Ok(query) => query,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE }),
            ));
        }
    };

    let ws_id = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        VIEW_INVENTORY_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(error) => return auth_error_response(error),
    };

    match fetch_inventory_suppliers(&config.contact_data, outbound, &ws_id, &query).await {
        Ok((data, count)) => {
            if query.paginate {
                no_store_response(json_response(
                    200,
                    json!({ "count": count.unwrap_or(0), "data": data }),
                ))
            } else {
                no_store_response(json_response(200, Value::Array(data)))
            }
        }
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": FETCH_FAILED_MESSAGE }),
        )),
    }
}

/// Reads `inventory_suppliers` from the `private` schema using the service-role
/// key, mirroring `createAdminClient().schema('private')` in the legacy route.
/// Returns the rows plus the exact total count when pagination is requested.
async fn fetch_inventory_suppliers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &InventoryListQuery,
) -> Result<(Vec<Value>, Option<u64>), ()> {
    let mut params: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];

    if !query.q.is_empty() {
        // Matches `.ilike('name', `%${q}%`)`.
        params.push(("name", format!("ilike.%{}%", query.q)));
    }

    if query.paginate {
        let (start, end) = inventory_list_range(query.page, query.page_size);
        // PostgREST honours limit/offset for ranged reads; combined with the
        // `Prefer: count=exact` header below this reproduces `.range(start, end)`
        // with `{ count: 'exact' }`.
        params.push(("offset", start.to_string()));
        params.push(("limit", (end - start + 1).to_string()));
    }

    let Some(url) = contact_data.rest_url(INVENTORY_SUPPLIERS_TABLE, &params) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Accept-Profile", PRIVATE_SCHEMA);

    if query.paginate {
        outbound_request = outbound_request.with_header("Prefer", "count=exact");
    }

    let response = outbound.send(outbound_request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = if query.paginate {
        parse_content_range_count(response.header("Content-Range"))
    } else {
        None
    };

    let data = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((data, count))
}

/// Mirrors `getInventoryApiListRange`: zero-based inclusive [start, end].
fn inventory_list_range(page: u32, page_size: u32) -> (u64, u64) {
    let start = (u64::from(page) - 1) * u64::from(page_size);
    let end = start + u64::from(page_size) - 1;
    (start, end)
}

/// Parses the PostgREST `Content-Range` header (e.g. `0-9/42` or `*/42`),
/// returning the total count after the slash.
fn parse_content_range_count(header: Option<&str>) -> Option<u64> {
    let total = header?.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<u64>().ok()
}

/// Parses + validates the list query, mirroring `InventoryApiListQuerySchema`'s
/// `safeParse` semantics (returns Err on any validation failure -> 400).
fn parse_inventory_list_query(request_url: Option<&str>) -> Result<InventoryListQuery, ()> {
    let mut q: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut response_raw: Option<String> = None;

    if let Some(request_url) = request_url {
        if let Ok(parsed) = url::Url::parse(request_url) {
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    "q" => q = Some(value.into_owned()),
                    "page" => page_raw = Some(value.into_owned()),
                    "pageSize" => page_size_raw = Some(value.into_owned()),
                    "response" => response_raw = Some(value.into_owned()),
                    _ => {}
                }
            }
        }
    }

    // q: z.string().max(MAX_SEARCH_LENGTH).default('')
    let q = q.unwrap_or_default();
    if q.chars().count() > MAX_SEARCH_LENGTH {
        return Err(());
    }

    // page: z.coerce.number().int().min(1).default(1)
    let page = coerce_int_min_default(page_raw.as_deref(), 1, None)?;
    // pageSize: z.coerce.number().int().min(1).max(MAX_MEDIUM_TEXT_LENGTH).default(10)
    let page_size = coerce_int_min_default(
        page_size_raw.as_deref(),
        10,
        Some(MAX_MEDIUM_TEXT_LENGTH as u32),
    )?;

    // response: z.enum(['paginated']).optional()
    if let Some(response_value) = response_raw.as_deref()
        && response_value != "paginated"
    {
        return Err(());
    }

    // shouldReturnPaginatedInventoryList: response === 'paginated'
    let paginate = response_raw.as_deref() == Some("paginated");

    Ok(InventoryListQuery {
        q,
        page,
        page_size,
        paginate,
    })
}

/// Mirrors `z.coerce.number().int().min(1)[.max(max)].default(default)`.
/// Absent -> default. Present -> JS `Number(value)` coercion: must be a finite
/// integer >= 1 (and <= max when provided), else validation fails.
fn coerce_int_min_default(value: Option<&str>, default: u32, max: Option<u32>) -> Result<u32, ()> {
    let Some(value) = value else {
        return Ok(default);
    };

    let number = js_number_coerce(value).ok_or(())?;

    if !number.is_finite() || number.fract() != 0.0 {
        return Err(());
    }
    if number < 1.0 {
        return Err(());
    }
    if let Some(max) = max
        && number > f64::from(max)
    {
        return Err(());
    }

    Ok(number as u32)
}

/// Approximates JavaScript's `Number(value)` for query-string inputs.
/// Empty / whitespace-only strings coerce to 0 (which then fails `.min(1)`),
/// non-numeric strings coerce to NaN (returned as None -> validation failure).
fn js_number_coerce(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        // Number("") === 0
        return Some(0.0);
    }
    trimmed.parse::<f64>().ok()
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        // Legacy: `getPermissions` returning null -> 404 { error: 'Not found' }.
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        // Legacy: missing `view_inventory` -> 403 { message }.
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

fn workspaces_product_suppliers_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_PRODUCT_SUPPLIERS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_PRODUCT_SUPPLIERS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
