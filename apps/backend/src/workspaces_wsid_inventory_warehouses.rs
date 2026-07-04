//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/warehouses/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/inventory/warehouses
//!
//! Lists inventory warehouses for the workspace by reading the
//! `private.inventory_warehouses` table with the admin (service-role) client
//! (`createAdminClient().schema('private')`), mirroring the legacy GET handler:
//!   - `.select('*', { count: shouldPaginate ? 'exact' : undefined })`
//!   - `.eq('ws_id', wsId)`
//!   - `if (q) .ilike('name', '%q%')`
//!   - `if (shouldPaginate) .range(start, end)` where
//!     `start = (page - 1) * pageSize`, `end = start + pageSize - 1`
//!   - `.order('name')` (ascending)
//!
//! Auth mirrors `authorizeInventoryWorkspace` followed by the inline permission
//! check `canViewInventoryCatalog(permissions) || canManageInventorySetup(permissions)`:
//!   1. resolve the session (Supabase access token from bearer/cookie),
//!   2. normalize the workspace id (`personal`/`internal` aliases + handle
//!      lookup),
//!   3. verify workspace membership,
//!   4. require ANY of the catalog/setup permissions (the union of
//!      `canViewInventoryCatalog` and `canManageInventorySetup`).
//!      We reuse the shared `authorize_workspace_permission` helper once per
//!      permission (granting on the first match), exactly like the sibling
//!      `workspaces_wsid_inventory_batches` / `workspaces_inventory_bundles` ports.
//!
//! Query parsing mirrors `parseInventoryApiListQuery`
//! (`InventoryApiListQuerySchema`):
//!   - `q`:        string, max 500 (`MAX_SEARCH_LENGTH`), default `''`
//!   - `page`:     coerce int, min 1, default 1
//!   - `pageSize`: coerce int, min 1, max 1000 (`MAX_MEDIUM_TEXT_LENGTH`), default 10
//!   - `response`: optional enum, must equal `'paginated'` if present
//!     Any value the Zod schema would reject surfaces as HTTP 400
//!     `{ "message": "Invalid query parameters" }`.
//!
//! Response shape (matching the legacy route exactly):
//!   - `?response=paginated` -> `{ "count": <total>, "data": [...] }`
//!     (`count` is taken from PostgREST's `Content-Range` header total, with a
//!     `?? 0` fallback)
//!   - otherwise             -> `{ "data": [...] }` (NO `count` field)
//!
//! Status codes:
//!   - missing/invalid session                       -> 401 `{ "message": "Unauthorized" }`
//!   - unresolved workspace / non-member             -> 404 `{ "error": "Not found" }`
//!     (see NOTE below on the 401/404/403 mapping)
//!   - member lacking catalog/setup permission       -> 403 `{ "message": "Forbidden" }`
//!   - invalid query parameters                      -> 400 `{ "message": "Invalid query parameters" }`
//!   - upstream read failure / unconfigured backend  -> 500 `{ "message": "Failed to fetch inventory warehouses" }`
//!
//! Only the GET method is migrated. POST (and any future methods) return `None`
//! so the Cloudflare worker falls through to the still-active Next.js route.
//!
//! GAP / NOTE on the auth status + ordering (shared with the sibling inventory
//! ports): the shared `authorize_workspace_permission` helper bundles membership
//! and permission checks, and maps "non-member" to NotFound (404) rather than
//! the legacy 403. The legacy flow also parses the query (400) BEFORE the
//! inventory-permission check (403), whereas this port performs auth+permission
//! first. These differences only affect the rare "authenticated member lacking
//! the inventory permission with a malformed query" edge case (legacy 400 vs.
//! 403 here) and the non-member 403-vs-404 distinction. This is the same
//! accepted tradeoff documented in `workspaces_wsid_inventory_batches` and
//! `workspaces_inventory_bundles`. The "member but lacking permission" path is
//! preserved exactly as 403, and the success / 401 / 400 (for authorized
//! callers) paths are faithful.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WAREHOUSES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WAREHOUSES_PATH_SUFFIX: &str = "/inventory/warehouses";
const WAREHOUSES_TABLE: &str = "inventory_warehouses";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory warehouses";

// Mirrors the Zod `InventoryApiListQuerySchema` bounds in
// apps/web/src/lib/inventory/api-list-query.ts.
const MAX_SEARCH_LENGTH: usize = 500; // q.max(MAX_SEARCH_LENGTH)
const DEFAULT_PAGE: i64 = 1;
const MIN_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MIN_PAGE_SIZE: i64 = 1;
const MAX_PAGE_SIZE: i64 = 1000; // pageSize.max(MAX_MEDIUM_TEXT_LENGTH)

// Mirrors `canViewInventoryCatalog(permissions) || canManageInventorySetup(permissions)`
// in apps/web/src/lib/inventory/permissions.ts. This is the DEDUPLICATED UNION
// of both permission lists (any one of these grants access). Workspace creators
// / admins are covered by `has_all_permissions` inside
// `authorize_workspace_permission`.
const CATALOG_OR_SETUP_PERMISSIONS: [&str; 7] = [
    // canViewInventoryCatalog
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
    // canManageInventorySetup adds (create/update/delete_inventory already listed)
    "manage_inventory_setup",
];

pub(crate) async fn handle_workspaces_wsid_inventory_warehouses_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = warehouses_ws_id(request.path)?;

    // Only GET is migrated. Every other method (POST and any future verbs) must
    // fall through to the still-active Next.js route, so return `None`.
    Some(match request.method {
        "GET" => warehouses_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn warehouses_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let request_url = request.url;

    let ws_id = match authorize_catalog_or_setup(&config.contact_data, request, raw_ws_id, outbound)
        .await
    {
        Ok(ws_id) => ws_id,
        Err(response) => return response,
    };

    let query = match QueryParams::parse(request_url) {
        Ok(query) => query,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE }),
            ));
        }
    };

    let should_paginate = should_return_paginated(request_url);

    match fetch_warehouses(
        &config.contact_data,
        outbound,
        &ws_id,
        &query,
        should_paginate,
    )
    .await
    {
        Ok((data, count)) => {
            // Legacy: paginated -> { count, data }; otherwise -> { data }.
            let payload = if should_paginate {
                json!({ "count": count, "data": data })
            } else {
                json!({ "data": data })
            };
            no_store_response(json_response(200, payload))
        }
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// catalog/setup permissions. Returns the resolved workspace id on success, or a
/// ready-to-send error response.
async fn authorize_catalog_or_setup(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in CATALOG_OR_SETUP_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy check
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

/// Reads `private.inventory_warehouses` with the service role (RLS bypassed,
/// scoped purely by the `ws_id` filter), mirroring the legacy admin-client read.
/// Returns the parsed rows plus the total count (only meaningful when paginated;
/// `0` otherwise).
async fn fetch_warehouses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &QueryParams,
    should_paginate: bool,
) -> Result<(Vec<Value>, i64), ()> {
    // `.order('name')` => PostgREST `order=name.asc` (supabase-js default).
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc".to_owned()),
    ];

    // `if (q) query.ilike('name', '%q%')` — only when `q` is non-empty (JS
    // truthiness). supabase-js sends the pattern verbatim, so `%q%` reaches
    // PostgREST as the SQL ILIKE pattern.
    if !query.q.is_empty() {
        params.push(("name", format!("ilike.%{}%", query.q)));
    }

    // `if (shouldPaginate) query.range(start, end)` => supabase-js sets
    // `offset = start` and `limit = end - start + 1 = pageSize`.
    if should_paginate {
        let start = (query.page - 1) * query.page_size;
        params.push(("offset", start.to_string()));
        params.push(("limit", query.page_size.to_string()));
    }

    let url = contact_data.rest_url(WAREHOUSES_TABLE, &params).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &bearer)
        .with_header("apikey", service_role_key)
        // The table lives in the `private` schema.
        .with_header("Accept-Profile", PRIVATE_SCHEMA);

    // `count: 'exact'` => `Prefer: count=exact`; the total is returned in the
    // `Content-Range` response header.
    if should_paginate {
        request = request.with_header("Prefer", "count=exact");
    }

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    let count = if should_paginate {
        parse_content_range_count(response.header("Content-Range"))
    } else {
        0
    };

    // `data ?? []` — a successful read yields a JSON array of rows.
    let data = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((data, count))
}

/// Parses PostgREST's `Content-Range` header (e.g. `0-9/100`, `*/100`,
/// `0-9/*`), returning the total after the final `/`. Mirrors supabase-js's
/// `count` (which is `null` when unknown), folded to the legacy `count ?? 0`.
fn parse_content_range_count(header: Option<&str>) -> i64 {
    header
        .and_then(|value| value.rsplit('/').next())
        .and_then(|total| total.trim().parse::<i64>().ok())
        .unwrap_or(0)
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
    ///   response: enum(['paginated']).optional()  (if present, must equal
    ///             'paginated')
    fn parse(request_url: Option<&str>) -> Result<Self, ()> {
        let mut q_raw: Option<String> = None;
        let mut page_raw: Option<String> = None;
        let mut page_size_raw: Option<String> = None;
        let mut response_raw: Option<String> = None;

        if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
            // Mirror `searchParams.forEach` building `rawParams`: the last
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

fn warehouses_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WAREHOUSES_PATH_PREFIX)?
        .strip_suffix(WAREHOUSES_PATH_SUFFIX)?;

    // A non-empty ws_id with no remaining slashes guarantees this is exactly the
    // `/inventory/warehouses` collection route (and not a nested sub-resource).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";

    fn url(query: &str) -> String {
        format!("https://tuturuuu.localhost/api/v1/workspaces/{WS}/inventory/warehouses{query}")
    }

    // --- path guard / ws id extraction ------------------------------------

    #[test]
    fn ws_id_matches_exact_collection_path() {
        assert_eq!(
            warehouses_ws_id(&format!("/api/v1/workspaces/{WS}/inventory/warehouses")),
            Some(WS)
        );
    }

    #[test]
    fn ws_id_rejects_non_matching_paths() {
        // Wrong prefix (no v1).
        assert_eq!(
            warehouses_ws_id("/api/workspaces/ws-1/inventory/warehouses"),
            None
        );
        // Nested sub-resource (trailing segment remains).
        assert_eq!(
            warehouses_ws_id("/api/v1/workspaces/ws-1/inventory/warehouses/wh-1"),
            None
        );
        // Different suffix.
        assert_eq!(
            warehouses_ws_id("/api/v1/workspaces/ws-1/inventory/batches"),
            None
        );
        // Empty ws id.
        assert_eq!(
            warehouses_ws_id("/api/v1/workspaces//inventory/warehouses"),
            None
        );
        // Embedded slash in ws id segment.
        assert_eq!(
            warehouses_ws_id("/api/v1/workspaces/a/b/inventory/warehouses"),
            None
        );
        // Unrelated short path must not panic / match.
        assert_eq!(warehouses_ws_id("/api/v1"), None);
    }

    // --- query parsing -----------------------------------------------------

    #[test]
    fn query_defaults_when_missing() {
        let parsed = QueryParams::parse(Some(&url(""))).expect("defaults parse");
        assert_eq!(parsed.q, "");
        assert_eq!(parsed.page, 1);
        assert_eq!(parsed.page_size, 10);
    }

    #[test]
    fn query_parses_valid_values() {
        let parsed =
            QueryParams::parse(Some(&url("?q=widget&page=3&pageSize=25"))).expect("valid parse");
        assert_eq!(parsed.q, "widget");
        assert_eq!(parsed.page, 3);
        assert_eq!(parsed.page_size, 25);
    }

    #[test]
    fn query_accepts_paginated_response_enum() {
        assert!(QueryParams::parse(Some(&url("?response=paginated"))).is_ok());
    }

    #[test]
    fn query_rejects_invalid_response_enum() {
        assert!(QueryParams::parse(Some(&url("?response=all"))).is_err());
    }

    #[test]
    fn query_rejects_out_of_range_values() {
        assert!(QueryParams::parse(Some(&url("?page=0"))).is_err());
        assert!(QueryParams::parse(Some(&url("?pageSize=0"))).is_err());
        assert!(QueryParams::parse(Some(&url("?pageSize=1001"))).is_err());
        assert!(QueryParams::parse(Some(&url("?page=1.5"))).is_err());
        assert!(QueryParams::parse(Some(&url("?page=abc"))).is_err());
    }

    #[test]
    fn query_rejects_overlong_search() {
        let long = "x".repeat(MAX_SEARCH_LENGTH + 1);
        assert!(QueryParams::parse(Some(&url(&format!("?q={long}")))).is_err());
        let max = "x".repeat(MAX_SEARCH_LENGTH);
        assert!(QueryParams::parse(Some(&url(&format!("?q={max}")))).is_ok());
    }

    #[test]
    fn query_last_repeated_key_wins() {
        let parsed = QueryParams::parse(Some(&url("?page=2&page=5"))).expect("repeated key");
        assert_eq!(parsed.page, 5);
    }

    // --- pagination decision ----------------------------------------------

    #[test]
    fn should_paginate_only_for_exact_paginated_value() {
        assert!(should_return_paginated(Some(&url("?response=paginated"))));
        assert!(!should_return_paginated(Some(&url("?response=all"))));
        assert!(!should_return_paginated(Some(&url(""))));
        assert!(!should_return_paginated(None));
    }

    // --- Content-Range count parsing --------------------------------------

    #[test]
    fn content_range_count_parses_total() {
        assert_eq!(parse_content_range_count(Some("0-9/100")), 100);
        assert_eq!(parse_content_range_count(Some("*/42")), 42);
        assert_eq!(parse_content_range_count(Some("0-0/1")), 1);
    }

    #[test]
    fn content_range_count_falls_back_to_zero() {
        assert_eq!(parse_content_range_count(None), 0);
        assert_eq!(parse_content_range_count(Some("0-9/*")), 0);
        assert_eq!(parse_content_range_count(Some("garbage")), 0);
    }
}
