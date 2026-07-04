//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/product-warehouses/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/product-warehouses
//!
//! Returns inventory warehouse rows for the workspace. Read from
//! `private.inventory_warehouses` via service-role REST (mirroring the legacy
//! admin client `createAdminClient().schema('private')`).
//!
//! Auth mirrors `getPermissions(...)` + `containsPermission('view_inventory')`:
//! the caller must be a workspace member AND hold the `view_inventory`
//! permission. We reuse the shared `authorize_workspace_permission` helper,
//! which resolves the workspace id (including the `personal`/`internal` aliases
//! and handle lookups), verifies membership, and checks effective permissions
//! exactly like `getPermissions`.
//!
//! Response shape (matching the legacy route exactly):
//!   - Invalid query params           -> 400 `{ "message": "Invalid query parameters" }`
//!   - `?response=paginated`          -> 200 `{ "count": <exact>, "data": [...] }`
//!   - otherwise                      -> 200 `[...]` (raw rows array)
//!   - downstream read failure        -> 500 `{ "message": "Error fetching product warehouses" }`
//!
//! Only the GET method is migrated. POST (and any future methods) on this route
//! return `None` so the Cloudflare worker falls through to the still-active
//! Next.js route.
//!
//! NOTE on copied helpers: this module copies the small `is_success` and
//! `parse_content_range_count` helpers as file-local fns (they are private to
//! sibling modules such as `workspaces_inventory_audit_logs`). Nothing in
//! another module was edited.
//!
//! KNOWN BEHAVIORAL DIFFERENCE vs. legacy (documented in notes): the shared
//! `authorize_workspace_permission` helper maps "no auth user" to 401
//! Unauthorized, whereas the legacy `getPermissions` returns `null` -> 404 for
//! a missing principal. This is the same tradeoff already accepted by the
//! ported `workspaces_inventory_audit_logs` / `workspaces_inventory_analytics`
//! routes. The 404-vs-403 distinction for "member but lacking permission" is
//! preserved (Forbidden -> 403; not-a-member/unknown-workspace -> 404).

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_PRODUCT_WAREHOUSES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_PRODUCT_WAREHOUSES_PATH_SUFFIX: &str = "/product-warehouses";
const INVENTORY_WAREHOUSES_TABLE: &str = "inventory_warehouses";
const PRIVATE_SCHEMA: &str = "private";

const VIEW_INVENTORY_PERMISSION: &str = "view_inventory";

const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view inventory";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const LOAD_FAILED_MESSAGE: &str = "Error fetching product warehouses";

// Mirrors the Zod `InventoryApiListQuerySchema` bounds in
// apps/web/src/lib/inventory/api-list-query.ts.
const MAX_SEARCH_LENGTH: usize = 500; // q.max(MAX_SEARCH_LENGTH)
const DEFAULT_PAGE: i64 = 1;
const MIN_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MIN_PAGE_SIZE: i64 = 1;
const MAX_PAGE_SIZE: i64 = 1000; // pageSize.max(MAX_MEDIUM_TEXT_LENGTH)

pub(crate) async fn handle_workspaces_product_warehouses_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_product_warehouses_ws_id(request.path)?;

    Some(match request.method {
        "GET" => warehouses_response(config, request, raw_ws_id, outbound).await,
        // Only GET is migrated. Returning None lets the still-active Next.js
        // route serve POST (and any other) methods.
        _ => return None,
    })
}

async fn warehouses_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy order: normalize ws id + parse query, then permission check. The
    // observable result is identical for valid callers; we authorize first
    // (the helper also resolves the ws id), then parse the query. Query parsing
    // has no side effects, so ordering relative to the read does not matter.
    let should_paginate = should_return_paginated(request.url);

    let parsed = match QueryParams::parse(request.url) {
        Ok(parsed) => parsed,
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

    match fetch_warehouses(
        &config.contact_data,
        outbound,
        &ws_id,
        &parsed,
        should_paginate,
    )
    .await
    {
        Ok((rows, count)) => {
            if should_paginate {
                no_store_response(json_response(200, json!({ "count": count, "data": rows })))
            } else {
                no_store_response(json_response(200, Value::Array(rows)))
            }
        }
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Reads warehouse rows from `private.inventory_warehouses` via service-role
/// REST (matching `createAdminClient().schema('private')`). When paginating,
/// requests `count=exact` and parses the total from the PostgREST
/// `Content-Range` header; otherwise returns all matching rows with count 0
/// (the non-paginated branch ignores the count).
async fn fetch_warehouses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &QueryParams,
    should_paginate: bool,
) -> Result<(Vec<Value>, i64), ()> {
    let mut query: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];

    // Legacy: `if (q) query.ilike('name', `%${q}%`)` — only applied for a
    // non-empty `q` (default is the empty string).
    if !params.q.is_empty() {
        query.push((
            "name",
            format!("ilike.*{}*", escape_postgrest_like(&params.q)),
        ));
    }

    if should_paginate {
        let (start, end) = pagination_range(params.page, params.page_size);
        // PostgREST: range is inclusive [start, end]; supabase `.range()` emits
        // an `offset`/`limit` pair, but `Range` header semantics are easier to
        // reason about here. We use offset/limit query params to match the
        // sibling audit-logs port and avoid Range header coupling.
        let limit = (end - start + 1).max(0);
        query.push(("offset", start.to_string()));
        query.push(("limit", limit.to_string()));
    }

    let url = contact_data
        .rest_url(INVENTORY_WAREHOUSES_TABLE, &query)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Accept-Profile", PRIVATE_SCHEMA);

    if should_paginate {
        request = request.with_header("Prefer", "count=exact");
    }

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    let count = if should_paginate {
        response
            .header("content-range")
            .and_then(parse_content_range_count)
            .unwrap_or(0)
    } else {
        0
    };

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((rows, count))
}

/// Mirrors `getInventoryApiListRange`: start = (page - 1) * pageSize, end =
/// start + pageSize - 1 (inclusive).
fn pagination_range(page: i64, page_size: i64) -> (i64, i64) {
    let start = (page - 1) * page_size;
    let end = start + page_size - 1;
    (start, end)
}

/// Mirrors `shouldReturnPaginatedInventoryList`: paginate iff the `response`
/// query param equals exactly `paginated`.
fn should_return_paginated(request_url: Option<&str>) -> bool {
    let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        return false;
    };

    // `searchParams.get('response')` returns the first occurrence.
    url.query_pairs()
        .find(|(key, _)| key == "response")
        .map(|(_, value)| value == "paginated")
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Query parameter parsing (mirrors the Zod InventoryApiListQuerySchema).
// ---------------------------------------------------------------------------

struct QueryParams {
    q: String,
    page: i64,
    page_size: i64,
}

impl QueryParams {
    /// Parses + validates the query string like the Zod schema. Returns
    /// `Err(())` when any field fails validation, which the legacy route
    /// surfaces as HTTP 400.
    ///
    /// Schema:
    ///   q:        string, max 500, default ''
    ///   page:     coerce number, int, min 1, default 1
    ///   pageSize: coerce number, int, min 1, max 1000, default 10
    ///   response: enum(['paginated']).optional()  (validated: if present, must
    ///             equal 'paginated')
    fn parse(request_url: Option<&str>) -> Result<Self, ()> {
        let mut q_raw: Option<String> = None;
        let mut page_raw: Option<String> = None;
        let mut page_size_raw: Option<String> = None;
        let mut response_raw: Option<String> = None;

        if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
            // Mirror `Object.fromEntries(searchParams.entries())`: the last
            // occurrence of a repeated key wins.
            for (key, value) in url.query_pairs() {
                let value = value.into_owned();
                match key.as_ref() {
                    "q" => q_raw = Some(value),
                    "page" => page_raw = Some(value),
                    "pageSize" => page_size_raw = Some(value),
                    "response" => response_raw = Some(value),
                    _ => {}
                }
            }
        }

        // q: string, default '', max 500. A present value over the max fails.
        let q = q_raw.unwrap_or_default();
        if q.chars().count() > MAX_SEARCH_LENGTH {
            return Err(());
        }

        // response: optional enum. If present it must be exactly 'paginated'.
        if let Some(response) = response_raw.as_deref()
            && response != "paginated"
        {
            return Err(());
        }

        let page = parse_bounded_int(page_raw.as_deref(), DEFAULT_PAGE, MIN_PAGE, i64::MAX)?;
        let page_size = parse_bounded_int(
            page_size_raw.as_deref(),
            DEFAULT_PAGE_SIZE,
            MIN_PAGE_SIZE,
            MAX_PAGE_SIZE,
        )?;

        Ok(Self { q, page, page_size })
    }
}

/// Mirrors `z.coerce.number().int().min(min).max(max).default(default)`:
/// - missing -> default
/// - present: coerced like JS `Number(value)`; must be a finite integer within
///   `[min, max]`, otherwise the schema fails (Err).
fn parse_bounded_int(raw: Option<&str>, default: i64, min: i64, max: i64) -> Result<i64, ()> {
    let Some(raw) = raw else {
        return Ok(default);
    };

    // JS `Number('')` is 0; `Number('  ')` is 0; otherwise parse as a float and
    // require it to be a whole, finite number (Zod `.int()`).
    let trimmed = raw.trim();
    let number: f64 = if trimmed.is_empty() {
        0.0
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

// ---------------------------------------------------------------------------
// Misc helpers (copied as file-local fns; see module-level NOTE).
// ---------------------------------------------------------------------------

/// Escapes PostgREST `ilike` wildcards in the user-supplied search term so the
/// pattern matches the literal text (the legacy `%${q}%` interpolation does not
/// escape, but PostgREST uses `*` as the wildcard and `%`/`_` are SQL LIKE
/// wildcards; we escape `*`, `%`, and `_` to keep the substring search literal).
fn escape_postgrest_like(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(character, '*' | '%' | '_' | '\\') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

fn parse_content_range_count(content_range: &str) -> Option<i64> {
    let total = content_range.rsplit('/').next()?.trim();
    if total.is_empty() || total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => {
            // Legacy: `getPermissions(...)` returns null -> 404 `{ error: 'Not found' }`.
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            // Legacy: member without `view_inventory` -> 403 with this message.
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

fn workspaces_product_warehouses_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_PRODUCT_WAREHOUSES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_PRODUCT_WAREHOUSES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
