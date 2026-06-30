//! Handler for `GET /api/v1/workspaces/:wsId/product-units`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/product-units/route.ts`.
//!
//! Behavior parity with the legacy GET handler:
//!   1. `authorizeInventoryWorkspace` -> resolve/normalize wsId + verify the
//!      caller is a workspace member, then compute effective permissions.
//!      Implemented here via the shared `authorize_workspace_permission`
//!      helper, which normalizes the wsId, verifies membership, and computes
//!      effective permissions in one pass.
//!   2. `canViewInventoryCatalog(permissions) || canManageInventorySetup(permissions)`
//!      -> caller must hold ANY of the combined inventory-catalog/setup
//!      permissions. Workspace creators/admins are covered by
//!      `has_all_permissions` inside `authorize_workspace_permission`.
//!   3. Parse the inventory list query (`q`, `page`, `pageSize`, `response`);
//!      invalid params -> 400 `{ message: 'Invalid query parameters' }`.
//!   4. Read `private.inventory_units` via service-role REST (matching
//!      `sbAdmin.schema('private').from('inventory_units').select('*')`),
//!      filtered by `ws_id`, optional `ilike(name, %q%)`, optional pagination
//!      range, optional exact count, ordered by `name`.
//!   5. On query error -> 500 `{ message: 'Error fetching product units' }`.
//!   6. Paginated response -> `{ count, data }`; otherwise the raw `data` array.
//!
//! Only GET is migrated. The legacy route also defines POST (create a unit),
//! which is NOT migrated; this handler returns `None` for every non-GET method
//! so the Cloudflare worker falls through to the still-active Next.js route.
//! We therefore never emit `method_not_allowed` here.
//!
//! Behavior gaps versus the legacy route:
//!   * The legacy route accepts the `inventory` app-session token (via
//!     `resolveSessionAuthContext` with `allowAppSessionAuth`). The shared
//!     `authorize_workspace_permission` helper only honors Supabase
//!     access tokens (bearer or auth cookie) and ignores app-session tokens, so
//!     inventory app-session callers are not served here and fall through to the
//!     Next.js route (which still handles them). Matches `workspaces_inventory_owners`.
//!   * The legacy route returns 403 `{ message: 'Forbidden' }` for an
//!     authenticated non-member but 404 `{ error: 'Not found' }` when
//!     `getPermissions` yields no permission context. The shared helper collapses
//!     both into 404 `{ error: 'Not found' }` (a non-member has no permission
//!     context). Matches `workspaces_inventory_owners`.
//!   * Legacy ordering is membership-verify -> query-parse (400) -> catalog
//!     permission (403). Because the shared helper fuses membership verification
//!     with the permission check, the catalog permission is evaluated before the
//!     query is parsed. A member lacking all catalog/setup permissions who also
//!     sends an invalid query therefore receives 403 here instead of the legacy
//!     400. Authentication precedence (401/404/500 before 400) is preserved.

use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const UNITS_TABLE: &str = "inventory_units";
const PRIVATE_SCHEMA: &str = "private";
const FETCH_ERROR_MESSAGE: &str = "Error fetching product units";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions to view inventory";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

// Combined permission set for `canViewInventoryCatalog(p) || canManageInventorySetup(p)`
// from apps/web/src/lib/inventory/permissions.ts (deduplicated): access is
// granted when the caller holds ANY of these permissions.
const VIEW_OR_MANAGE_PERMISSIONS: [&str; 7] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
    "manage_inventory_setup",
];

// Zod schema bounds from apps/web/src/lib/inventory/api-list-query.ts:
//   q: max(MAX_SEARCH_LENGTH=500), default ''
//   page: coerce int, min 1, default 1
//   pageSize: coerce int, min 1, max(MAX_MEDIUM_TEXT_LENGTH=1000), default 10
//   response: enum(['paginated']) optional
const MAX_SEARCH_LENGTH: usize = 500;
const MAX_PAGE_SIZE: i64 = 1000;
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;

#[derive(Serialize)]
struct PaginatedResponse {
    count: u64,
    data: Vec<Value>,
}

struct ListQuery {
    q: String,
    page: i64,
    page_size: i64,
    paginate: bool,
}

pub(crate) async fn handle_workspaces_wsid_product_units_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = product_units_ws_id(request.path)?;

    // Only GET is migrated. Every other method (e.g. POST) must fall through to
    // the still-active Next.js route, so return `None` for them.
    Some(match request.method {
        "GET" => product_units_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn product_units_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Authenticate + authorize first, matching the legacy ordering where
    // `authorizeInventoryWorkspace` runs before any query parsing.
    let ws_id =
        match authorize_inventory_view(&config.contact_data, request, raw_ws_id, outbound).await {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    let query = match parse_list_query(request.url) {
        Ok(query) => query,
        Err(()) => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    match fetch_product_units(&config.contact_data, outbound, &ws_id, &query).await {
        Ok((data, count)) => {
            if query.paginate {
                no_store_response(json_response(
                    200,
                    PaginatedResponse {
                        count: count.unwrap_or(0),
                        data,
                    },
                ))
            } else {
                no_store_response(json_response(200, Value::Array(data)))
            }
        }
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// combined inventory catalog/setup permissions. Returns the resolved workspace
/// id on success, or a ready-to-send error response.
///
/// `authorize_workspace_permission` performs the wsId normalization +
/// membership verification that the legacy `authorizeInventoryWorkspace` does.
async fn authorize_inventory_view(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_OR_MANAGE_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // catalog/setup checks grant access when ANY permission is present,
            // so keep checking the remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    // Member without any catalog/setup permission -> legacy 403 from the
    // `canViewInventoryCatalog || canManageInventorySetup` gate.
    Err(message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE))
}

/// Reads `private.inventory_units` via service-role REST (matching
/// `sbAdmin.schema('private').from('inventory_units').select('*')`), filtered by
/// `ws_id`, optionally `ilike(name, %q%)`, optionally ranged, ordered by `name`.
/// Rows are returned as raw JSON to preserve the `select('*')` shape exactly.
async fn fetch_product_units(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
) -> Result<(Vec<Value>, Option<u64>), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name".to_owned()),
    ];

    if !query.q.is_empty() {
        params.push(("name", format!("ilike.*{}*", escape_ilike(&query.q))));
    }

    if query.paginate {
        let (start, end) = list_range(query.page, query.page_size);
        params.push(("offset", start.to_string()));
        // PostgREST `limit` matches the inclusive `.range(start, end)` window:
        // `range(start, end)` returns `end - start + 1` rows.
        params.push(("limit", (end - start + 1).to_string()));
    }

    let Some(url) = contact_data.rest_url(UNITS_TABLE, &params) else {
        return Err(());
    };

    // Request an exact count via `Prefer: count=exact` only when paginating,
    // matching `count: shouldPaginate ? 'exact' : undefined`.
    let response = send_units_request(contact_data, outbound, &url, query.paginate).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let data = response.json::<Vec<Value>>().map_err(|_| ())?;
    let count = if query.paginate {
        parse_content_range_total(response.header("Content-Range"))
    } else {
        None
    };

    Ok((data, count))
}

async fn send_units_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    want_count: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        // `private` schema read, matching `sbAdmin.schema('private')`.
        .with_header("Accept-Profile", PRIVATE_SCHEMA);

    if want_count {
        request = request.with_header("Prefer", "count=exact");
    }

    outbound.send(request).await.map_err(|_| ())
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            message_response(401, UNAUTHORIZED_MESSAGE)
        }
        WorkspacePermissionAuthorizationError::NotFound => error_response(404, NOT_FOUND_MESSAGE),
        WorkspacePermissionAuthorizationError::Forbidden => {
            message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE)
        }
        WorkspacePermissionAuthorizationError::Internal => {
            message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE)
        }
    }
}

// --- Query parsing -----------------------------------------------------------

fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut q: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut response_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "q" if q.is_none() => q = Some(value.into_owned()),
                "page" if page_raw.is_none() => page_raw = Some(value.into_owned()),
                "pageSize" if page_size_raw.is_none() => page_size_raw = Some(value.into_owned()),
                "response" if response_raw.is_none() => response_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    // q: string, max 500, default ''.
    let q = q.unwrap_or_default();
    if q.chars().count() > MAX_SEARCH_LENGTH {
        return Err(());
    }

    // page: coerce number, int, min 1, default 1.
    let page = match page_raw {
        Some(value) => coerce_int_min(&value, 1)?,
        None => DEFAULT_PAGE,
    };

    // pageSize: coerce number, int, min 1, max 1000, default 10.
    let page_size = match page_size_raw {
        Some(value) => {
            let parsed = coerce_int_min(&value, 1)?;
            if parsed > MAX_PAGE_SIZE {
                return Err(());
            }
            parsed
        }
        None => DEFAULT_PAGE_SIZE,
    };

    // response: enum(['paginated']) optional. Any present value other than
    // exactly 'paginated' fails the enum.
    let paginate = match response_raw.as_deref() {
        Some("paginated") => true,
        Some(_) => return Err(()),
        None => false,
    };

    Ok(ListQuery {
        q,
        page,
        page_size,
        paginate,
    })
}

// Mirrors zod `coerce.number().int().min(min)`: `Number(value)` then reject
// NaN / non-integers / below-min. `z.coerce.number()` uses JS `Number()`, which
// accepts leading/trailing whitespace and rejects empty-after-trim as NaN.
fn coerce_int_min(value: &str, min: i64) -> Result<i64, ()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(());
    }

    // JS Number() accepts floats; .int() then requires an integer value.
    let parsed: f64 = trimmed.parse::<f64>().map_err(|_| ())?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return Err(());
    }

    let parsed = parsed as i64;
    if parsed < min {
        return Err(());
    }

    Ok(parsed)
}

fn list_range(page: i64, page_size: i64) -> (i64, i64) {
    let start = (page - 1) * page_size;
    let end = start + page_size - 1;
    (start, end)
}

// PostgREST returns `Content-Range: <start>-<end>/<total>` (or `*/<total>`).
fn parse_content_range_total(header: Option<&str>) -> Option<u64> {
    let header = header?;
    let total = header.rsplit('/').next()?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<u64>().ok()
}

fn escape_ilike(value: &str) -> String {
    // Preserve user input verbatim inside the `*<q>*` PostgREST pattern, matching
    // the legacy `%${q}%` interpolation (which performs no escaping either).
    value.to_owned()
}

// --- Path helpers ------------------------------------------------------------

fn product_units_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "product-units"] if !ws_id.is_empty() => Some(ws_id),
        _ => None,
    }
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route() {
        assert_eq!(
            product_units_ws_id("/api/v1/workspaces/abc/product-units"),
            Some("abc")
        );
        assert_eq!(
            product_units_ws_id(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/product-units"
            ),
            Some("00000000-0000-0000-0000-000000000000")
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Wrong leaf.
        assert_eq!(
            product_units_ws_id("/api/v1/workspaces/abc/product-categories"),
            None
        );
        // Trailing id segment (item route, not the collection).
        assert_eq!(
            product_units_ws_id("/api/v1/workspaces/abc/product-units/123"),
            None
        );
        // Missing v1.
        assert_eq!(
            product_units_ws_id("/api/workspaces/abc/product-units"),
            None
        );
        // Short path must not panic.
        assert_eq!(product_units_ws_id("/api/v1"), None);
        assert_eq!(product_units_ws_id("/"), None);
        // Empty ws id.
        assert_eq!(
            product_units_ws_id("/api/v1/workspaces//product-units"),
            None
        );
    }

    #[test]
    fn parse_list_query_defaults() {
        let query = parse_list_query(Some("https://x.test/api/v1/workspaces/w/product-units"))
            .expect("defaults parse");
        assert_eq!(query.q, "");
        assert_eq!(query.page, DEFAULT_PAGE);
        assert_eq!(query.page_size, DEFAULT_PAGE_SIZE);
        assert!(!query.paginate);
    }

    #[test]
    fn parse_list_query_paginated_with_values() {
        let query = parse_list_query(Some(
            "https://x.test/api/v1/workspaces/w/product-units?q=box&page=3&pageSize=25&response=paginated",
        ))
        .expect("valid query");
        assert_eq!(query.q, "box");
        assert_eq!(query.page, 3);
        assert_eq!(query.page_size, 25);
        assert!(query.paginate);
    }

    #[test]
    fn parse_list_query_rejects_invalid_params() {
        // Non-integer page.
        assert!(parse_list_query(Some("https://x.test/p?page=abc")).is_err());
        // page below min.
        assert!(parse_list_query(Some("https://x.test/p?page=0")).is_err());
        // pageSize over max.
        assert!(parse_list_query(Some("https://x.test/p?pageSize=1001")).is_err());
        // Non-enum response.
        assert!(parse_list_query(Some("https://x.test/p?response=all")).is_err());
        // Empty response value still fails the enum.
        assert!(parse_list_query(Some("https://x.test/p?response=")).is_err());
        // q over 500 chars.
        let long_q = "a".repeat(501);
        assert!(parse_list_query(Some(&format!("https://x.test/p?q={long_q}"))).is_err());
    }

    #[test]
    fn parse_list_query_accepts_max_length_q() {
        let max_q = "a".repeat(500);
        let query = parse_list_query(Some(&format!("https://x.test/p?q={max_q}")))
            .expect("500 chars allowed");
        assert_eq!(query.q.chars().count(), 500);
    }

    #[test]
    fn list_range_matches_supabase_range_semantics() {
        // page 1, size 10 -> rows 0..=9
        assert_eq!(list_range(1, 10), (0, 9));
        // page 3, size 25 -> rows 50..=74
        assert_eq!(list_range(3, 25), (50, 74));
    }

    #[test]
    fn parse_content_range_total_reads_count() {
        assert_eq!(parse_content_range_total(Some("0-9/42")), Some(42));
        assert_eq!(parse_content_range_total(Some("*/7")), Some(7));
        assert_eq!(parse_content_range_total(Some("0-9/*")), None);
        assert_eq!(parse_content_range_total(None), None);
    }

    #[test]
    fn paginated_response_shape() {
        let payload = PaginatedResponse {
            count: 3,
            data: vec![json!({"id": 1})],
        };
        assert_eq!(
            serde_json::to_value(&payload).unwrap(),
            json!({ "count": 3, "data": [{ "id": 1 }] })
        );
    }
}
