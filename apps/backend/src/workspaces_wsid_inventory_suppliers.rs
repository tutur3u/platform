//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/suppliers/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/inventory/suppliers
//!
//! Lists `private.inventory_suppliers` rows for the workspace, mirroring the
//! legacy GET handler:
//!   ```ts
//!   inventory
//!     .from('inventory_suppliers')
//!     .select('*', { count: shouldPaginate ? 'exact' : undefined })
//!     .eq('ws_id', wsId)
//!     [.ilike('name', `%${q}%`)]   // when q is non-empty
//!     [.range(start, end)]         // when paginated
//!     .order('name')
//!   ```
//! reading with `createAdminClient().schema('private')` (service-role,
//! RLS-bypassing). The table read is identical to the sibling
//! `workspaces_product_suppliers` port (same table / schema / service-role).
//!
//! Auth mirrors `authorizeInventoryWorkspace` + the GET permission gate
//! `canViewInventoryCatalog(permissions) || canManageInventorySetup(permissions)`.
//! That gate grants access when the caller holds ANY of the union of the two
//! permission sets (see `apps/web/src/lib/inventory/permissions.ts`):
//!   - canViewInventoryCatalog: view_inventory_catalog, manage_inventory_catalog,
//!     view_inventory, create_inventory, update_inventory, delete_inventory
//!   - canManageInventorySetup: manage_inventory_setup, create_inventory,
//!     update_inventory, delete_inventory
//!     We reuse the shared `authorize_workspace_permission` helper once per
//!     permission, granting access on the first match (same approach as the sibling
//!     `workspaces_wsid_inventory_batches` port). Workspace creators / admins are
//!     covered by `has_all_permissions` inside the helper.
//!
//! Query parsing mirrors `parseInventoryApiListQuery`
//! (`InventoryApiListQuerySchema`):
//!   - `q`:        string, max 500, default `''`
//!   - `page`:     coerce int, min 1, default 1
//!   - `pageSize`: coerce int, min 1, max 1000, default 10
//!   - `response`: optional enum, must equal `'paginated'` if present
//!     Any value the Zod schema would reject surfaces as HTTP 400
//!     `{ "message": "Invalid query parameters" }`.
//!
//! Response shape (matching the legacy route exactly):
//!   - paginated     -> `{ "count": count ?? 0, "data": data ?? [] }`
//!   - non-paginated -> `{ "data": data ?? [] }`   (no `count` field)
//!
//! Status codes:
//!   - missing/invalid session                       -> 401 `{ "message": "Unauthorized" }`
//!   - unresolved workspace / null permissions       -> 404 `{ "error": "Not found" }`
//!   - membership lookup failed                       -> 500 `{ "message": "Failed to verify workspace access" }`
//!   - member lacking inventory permission           -> 403 `{ "message": "Forbidden" }`
//!   - invalid query parameters                       -> 400 `{ "message": "Invalid query parameters" }`
//!   - upstream read failure / unconfigured backend   -> 500 `{ "message": "Failed to fetch inventory suppliers" }`
//!
//! Only the GET method is migrated. POST (and any future methods) return `None`
//! so the worker falls through to the still-active Next.js route.
//!
//! BEHAVIOR GAPS / NOTES (shared with the other inventory ports):
//!   * The shared `authorize_workspace_permission` helper folds the legacy
//!     distinct "non-member" case (legacy 403 `{ message: 'Forbidden' }`) into
//!     `NotFound` (404 `{ error: 'Not found' }`); the legacy 404 for an unknown
//!     workspace / null permissions and the 403 for a member who lacks the
//!     permission are preserved exactly. This matches `workspaces_product_suppliers`.
//!   * The legacy route runs query parsing AFTER membership resolution but BEFORE
//!     the explicit permission boolean check. We parse the query first (before
//!     auth) so that an invalid query for an authenticated member lacking the
//!     permission still returns 400 (matching legacy), at the cost of returning
//!     400 ahead of the 401/404 auth signals for an unauthenticated caller with a
//!     bad query. Same tradeoff as the `workspaces_product_suppliers` sibling.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_WSID_INVENTORY_SUPPLIERS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_WSID_INVENTORY_SUPPLIERS_PATH_SUFFIX: &str = "/inventory/suppliers";

const PRIVATE_SCHEMA: &str = "private";
const INVENTORY_SUPPLIERS_TABLE: &str = "inventory_suppliers";

const NOT_FOUND_MESSAGE: &str = "Not found";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch inventory suppliers";

// Mirrors the Zod `InventoryApiListQuerySchema` bounds in
// apps/web/src/lib/inventory/api-list-query.ts (MAX_SEARCH_LENGTH /
// MAX_MEDIUM_TEXT_LENGTH from packages/utils/src/constants.ts).
const MAX_SEARCH_LENGTH: usize = 500;
const MAX_MEDIUM_TEXT_LENGTH: u32 = 1000;

// Union of `canViewInventoryCatalog` + `canManageInventorySetup` permissions
// (apps/web/src/lib/inventory/permissions.ts). Holding ANY of these grants
// access to the GET handler.
const VIEW_INVENTORY_SUPPLIERS_PERMISSIONS: [&str; 7] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
    "manage_inventory_setup",
];

/// Parsed + validated list query parameters. Mirrors `InventoryApiListQuery`.
struct InventoryListQuery {
    q: String,
    page: u32,
    page_size: u32,
    paginate: bool,
}

pub(crate) async fn handle_workspaces_wsid_inventory_suppliers_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_wsid_inventory_suppliers_ws_id(request.path)?;

    // Only GET is migrated. Every other method (POST and any future verbs) must
    // fall through to the still-active Next.js route, so return `None`.
    Some(match request.method {
        "GET" => suppliers_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn suppliers_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Parse + validate the query first; an invalid query is a 400 regardless of
    // the permission boolean (see module gap note).
    let query = match parse_inventory_list_query(request.url) {
        Ok(query) => query,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE }),
            ));
        }
    };

    let ws_id =
        match authorize_inventory_view(&config.contact_data, request, raw_ws_id, outbound).await {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match fetch_inventory_suppliers(&config.contact_data, outbound, &ws_id, &query).await {
        Ok((data, count)) => {
            if query.paginate {
                no_store_response(json_response(
                    200,
                    json!({ "count": count.unwrap_or(0), "data": data }),
                ))
            } else {
                no_store_response(json_response(200, json!({ "data": data })))
            }
        }
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": FETCH_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller, succeeding if they hold ANY of the inventory
/// view/manage permissions. Returns the resolved workspace id, or a ready-to-send
/// error response.
async fn authorize_inventory_view(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_SUPPLIERS_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy gate
            // grants access when ANY permission is present, so keep checking the
            // remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
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

    // Matches `.order('name')` (default ascending).
    params.push(("order", "name".to_owned()));

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

    if let Some(request_url) = request_url
        && let Ok(parsed) = url::Url::parse(request_url)
    {
        // Mirror `searchParams.forEach` building `rawParams`: last value wins.
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

    // q: z.string().max(MAX_SEARCH_LENGTH).default('')
    let q = q.unwrap_or_default();
    if q.chars().count() > MAX_SEARCH_LENGTH {
        return Err(());
    }

    // page: z.coerce.number().int().min(1).default(1)
    let page = coerce_int_min_default(page_raw.as_deref(), 1, None)?;
    // pageSize: z.coerce.number().int().min(1).max(MAX_MEDIUM_TEXT_LENGTH).default(10)
    let page_size = coerce_int_min_default(page_size_raw.as_deref(), 10, Some(MAX_MEDIUM_TEXT_LENGTH))?;

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
        // Legacy: unknown workspace / `getPermissions` null -> 404 { error }.
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        // Legacy: member lacking the permission -> 403 { message }.
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        // Legacy: membership lookup failed -> 500 { message }.
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

fn workspaces_wsid_inventory_suppliers_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_WSID_INVENTORY_SUPPLIERS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_WSID_INVENTORY_SUPPLIERS_PATH_SUFFIX)?;

    // A non-empty ws_id with no remaining slashes guarantees this is exactly the
    // `/inventory/suppliers` collection route (and not a nested sub-resource).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";

    fn url(query: &str) -> String {
        format!("https://tuturuuu.localhost/api/v1/workspaces/{WS}/inventory/suppliers{query}")
    }

    // --- path guard / ws id extraction ------------------------------------

    #[test]
    fn ws_id_matches_exact_collection_path() {
        assert_eq!(
            workspaces_wsid_inventory_suppliers_ws_id(&format!(
                "/api/v1/workspaces/{WS}/inventory/suppliers"
            )),
            Some(WS)
        );
    }

    #[test]
    fn ws_id_rejects_non_matching_paths() {
        // Wrong prefix (no v1).
        assert_eq!(
            workspaces_wsid_inventory_suppliers_ws_id(
                "/api/workspaces/ws-1/inventory/suppliers"
            ),
            None
        );
        // Nested sub-resource (trailing segment remains).
        assert_eq!(
            workspaces_wsid_inventory_suppliers_ws_id(
                "/api/v1/workspaces/ws-1/inventory/suppliers/sup-1"
            ),
            None
        );
        // Different suffix.
        assert_eq!(
            workspaces_wsid_inventory_suppliers_ws_id(
                "/api/v1/workspaces/ws-1/inventory/batches"
            ),
            None
        );
        // Empty ws id.
        assert_eq!(
            workspaces_wsid_inventory_suppliers_ws_id("/api/v1/workspaces//inventory/suppliers"),
            None
        );
        // Embedded slash in ws id segment.
        assert_eq!(
            workspaces_wsid_inventory_suppliers_ws_id(
                "/api/v1/workspaces/a/b/inventory/suppliers"
            ),
            None
        );
        // Unrelated short path must not panic / match.
        assert_eq!(workspaces_wsid_inventory_suppliers_ws_id("/api/v1"), None);
    }

    // --- query parsing -----------------------------------------------------

    #[test]
    fn query_defaults_when_missing() {
        let parsed = parse_inventory_list_query(Some(&url(""))).expect("defaults parse");
        assert_eq!(parsed.q, "");
        assert_eq!(parsed.page, 1);
        assert_eq!(parsed.page_size, 10);
        assert!(!parsed.paginate);
    }

    #[test]
    fn query_parses_valid_values() {
        let parsed = parse_inventory_list_query(Some(&url("?q=acme&page=3&pageSize=25")))
            .expect("valid parse");
        assert_eq!(parsed.q, "acme");
        assert_eq!(parsed.page, 3);
        assert_eq!(parsed.page_size, 25);
    }

    #[test]
    fn query_accepts_and_flags_paginated_response_enum() {
        let parsed =
            parse_inventory_list_query(Some(&url("?response=paginated"))).expect("paginated");
        assert!(parsed.paginate);
    }

    #[test]
    fn query_rejects_invalid_response_enum() {
        assert!(parse_inventory_list_query(Some(&url("?response=all"))).is_err());
    }

    #[test]
    fn query_rejects_out_of_range_values() {
        assert!(parse_inventory_list_query(Some(&url("?page=0"))).is_err());
        assert!(parse_inventory_list_query(Some(&url("?pageSize=0"))).is_err());
        assert!(parse_inventory_list_query(Some(&url("?pageSize=1001"))).is_err());
        assert!(parse_inventory_list_query(Some(&url("?page=1.5"))).is_err());
        assert!(parse_inventory_list_query(Some(&url("?page=abc"))).is_err());
    }

    #[test]
    fn query_rejects_overlong_search() {
        let long = "x".repeat(MAX_SEARCH_LENGTH + 1);
        assert!(parse_inventory_list_query(Some(&url(&format!("?q={long}")))).is_err());
        let max = "x".repeat(MAX_SEARCH_LENGTH);
        assert!(parse_inventory_list_query(Some(&url(&format!("?q={max}")))).is_ok());
    }

    #[test]
    fn query_last_repeated_key_wins() {
        let parsed =
            parse_inventory_list_query(Some(&url("?page=2&page=5"))).expect("repeated key");
        assert_eq!(parsed.page, 5);
    }

    // --- list range --------------------------------------------------------

    #[test]
    fn list_range_is_zero_based_inclusive() {
        assert_eq!(inventory_list_range(1, 10), (0, 9));
        assert_eq!(inventory_list_range(3, 25), (50, 74));
    }

    // --- content-range count parsing --------------------------------------

    #[test]
    fn content_range_count_parses_total() {
        assert_eq!(parse_content_range_count(Some("0-9/42")), Some(42));
        assert_eq!(parse_content_range_count(Some("*/7")), Some(7));
    }

    #[test]
    fn content_range_count_handles_unknown_total() {
        assert_eq!(parse_content_range_count(Some("*/*")), None);
        assert_eq!(parse_content_range_count(None), None);
        assert_eq!(parse_content_range_count(Some("garbage")), None);
    }
}
