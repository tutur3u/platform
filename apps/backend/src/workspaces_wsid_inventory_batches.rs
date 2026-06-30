//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/batches/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/inventory/batches
//!
//! Lists inventory batches for the workspace via the
//! `private.get_inventory_batches` RPC (mirroring `getInventoryBatches` in
//! `apps/web/src/lib/inventory/product-rpc.ts`, which calls the RPC with the
//! admin / service-role client `createAdminClient().schema('private')`).
//!
//! Auth mirrors `authorizeInventoryWorkspace` + `canViewInventoryCatalog`:
//!   1. resolve the session (Supabase access token from bearer/cookie),
//!   2. normalize the workspace id (`personal`/`internal` aliases + handle
//!      lookup),
//!   3. verify workspace membership,
//!   4. require ANY of the inventory-catalog permissions
//!      (`view_inventory_catalog`, `manage_inventory_catalog`, `view_inventory`,
//!      `create_inventory`, `update_inventory`, `delete_inventory`).
//!      We reuse the shared `authorize_workspace_permission` helper once per
//!      permission (granting access on the first match), exactly like the sibling
//!      `workspaces_inventory_bundles` port.
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
//! Read window mirrors the legacy handler exactly:
//!   - `?response=paginated` -> `limit = pageSize`, `offset = (page - 1) * pageSize`
//!   - otherwise             -> `limit = 10_000`, `offset = 0`
//!
//! Response shape (matching the legacy route exactly): the GET handler always
//! returns `NextResponse.json(result)` where `result = { count, data }`
//! (`count = Number(rows[0]?.total_count ?? 0)`,
//! `data = rows.map(r => r.batch).filter(Boolean)`), regardless of pagination.
//!
//! Status codes:
//!   - missing/invalid session                       -> 401 `{ "message": "Unauthorized" }`
//!   - unresolved workspace / non-member             -> 404 `{ "error": "Not found" }`
//!     (see NOTE below on the 401/404/403 mapping)
//!   - member lacking inventory-catalog permission   -> 403 `{ "message": "Forbidden" }`
//!   - invalid query parameters                      -> 400 `{ "message": "Invalid query parameters" }`
//!   - upstream read failure / unconfigured backend  -> 500 `{ "message": "Failed to fetch inventory batches" }`
//!
//! Only the GET method is migrated. POST (and any future methods) return `None`
//! so the Cloudflare worker falls through to the still-active Next.js route.
//!
//! NOTE on the auth status mapping (shared with the other inventory ports): the
//! shared `authorize_workspace_permission` helper maps "no auth user" to 401
//! Unauthorized, whereas the legacy `resolveSessionAuthContext` /
//! `verifyWorkspaceMembershipType` flow distinguishes 401 (no session), 404
//! (unknown workspace), 403 (non-member), and 500 (membership lookup failed).
//! The helper folds "non-member" into NotFound (404) rather than 403; this is
//! the same accepted tradeoff as `workspaces_inventory_bundles` and
//! `workspaces_inventory_analytics`. The "member but lacking permission" path is
//! preserved exactly as 403.

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

const WORKSPACES_WSID_INVENTORY_BATCHES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_WSID_INVENTORY_BATCHES_PATH_SUFFIX: &str = "/inventory/batches";
const GET_INVENTORY_BATCHES_RPC: &str = "get_inventory_batches";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory batches";

// Mirrors the Zod `InventoryApiListQuerySchema` bounds in
// apps/web/src/lib/inventory/api-list-query.ts.
const MAX_SEARCH_LENGTH: usize = 500; // q.max(MAX_SEARCH_LENGTH)
const DEFAULT_PAGE: i64 = 1;
const MIN_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MIN_PAGE_SIZE: i64 = 1;
const MAX_PAGE_SIZE: i64 = 1000; // pageSize.max(MAX_MEDIUM_TEXT_LENGTH)

// Mirrors the legacy non-paginated read window: `limit: 10_000, offset: 0`.
const NON_PAGINATED_LIMIT: i64 = 10_000;

// Mirrors `canViewInventoryCatalog` in
// apps/web/src/lib/inventory/permissions.ts (any of these permissions grants
// access). Workspace creators / admins are covered by `has_all_permissions`
// inside `authorize_workspace_permission`.
const VIEW_INVENTORY_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

#[derive(Deserialize)]
struct BatchListRow {
    /// `total_count` from the RPC; the first row carries the total.
    #[serde(default)]
    total_count: Option<i64>,
    /// `batch` JSON column produced by the RPC.
    #[serde(default)]
    batch: Option<Value>,
}

pub(crate) async fn handle_workspaces_wsid_inventory_batches_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_wsid_inventory_batches_ws_id(request.path)?;

    // Only GET is migrated. Every other method (POST and any future verbs) must
    // fall through to the still-active Next.js route, so return `None`.
    Some(match request.method {
        "GET" => batches_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn batches_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_catalog(&config.contact_data, request, raw_ws_id, outbound).await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    let query = match QueryParams::parse(request.url) {
        Ok(query) => query,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE }),
            ));
        }
    };

    let (limit, offset) = query.read_window(should_return_paginated(request.url));

    match fetch_batches(
        &config.contact_data,
        outbound,
        &ws_id,
        limit,
        offset,
        &query.q,
    )
    .await
    {
        Ok(rows) => no_store_response(json_response(200, map_rpc_list(rows))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-catalog permissions. Returns the resolved workspace id on success,
/// or a ready-to-send error response.
async fn authorize_inventory_catalog(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_CATALOG_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // `canViewInventoryCatalog` grants access when ANY permission is
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

/// Mirrors `getInventoryBatches` (apps/web/src/lib/inventory/product-rpc.ts):
/// calls the `private.get_inventory_batches` RPC with the service role and
/// returns the raw SETOF rows. `p_search` is the trimmed search term, or SQL
/// NULL (`p_search: search?.trim() || undefined`) when empty.
async fn fetch_batches(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    limit: i64,
    offset: i64,
    search: &str,
) -> Result<Vec<BatchListRow>, ()> {
    let rpc_url = contact_data.rpc_url(GET_INVENTORY_BATCHES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    // `p_search: search?.trim() || undefined` => trimmed, empty -> SQL NULL.
    let trimmed = search.trim();
    let p_search: Option<&str> = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    };

    let body = serde_json::to_string(&json!({
        "p_limit": limit,
        "p_offset": offset,
        "p_search": p_search,
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

    if !is_success(response.status) {
        return Err(());
    }

    // A SETOF-returning RPC over PostgREST yields a JSON array of rows.
    response.json::<Vec<BatchListRow>>().map_err(|_| ())
}

/// Mirrors the `getInventoryBatches` post-processing:
/// `count = Number(rows[0]?.total_count ?? 0)`,
/// `data = rows.map(r => r.batch).filter(Boolean)`.
fn map_rpc_list(rows: Vec<BatchListRow>) -> Value {
    let count = rows.first().and_then(|row| row.total_count).unwrap_or(0);
    let data: Vec<Value> = rows
        .into_iter()
        .filter_map(|row| row.batch)
        // `filter(Boolean)` drops null / falsy batch values.
        .filter(|batch| !batch.is_null())
        .collect();

    json!({ "count": count, "data": data })
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

    /// Mirrors the legacy `getInventoryBatches` limit/offset selection:
    ///   - paginated -> `limit = pageSize`, `offset = (page - 1) * pageSize`
    ///   - otherwise -> `limit = 10_000`, `offset = 0`
    fn read_window(&self, should_paginate: bool) -> (i64, i64) {
        if should_paginate {
            (self.page_size, (self.page - 1) * self.page_size)
        } else {
            (NON_PAGINATED_LIMIT, 0)
        }
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

fn workspaces_wsid_inventory_batches_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_WSID_INVENTORY_BATCHES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_WSID_INVENTORY_BATCHES_PATH_SUFFIX)?;

    // A non-empty ws_id with no remaining slashes guarantees this is exactly the
    // `/inventory/batches` collection route (and not e.g. a nested sub-resource).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";

    fn url(query: &str) -> String {
        format!("https://tuturuuu.localhost/api/v1/workspaces/{WS}/inventory/batches{query}")
    }

    // --- path guard / ws id extraction ------------------------------------

    #[test]
    fn ws_id_matches_exact_collection_path() {
        assert_eq!(
            workspaces_wsid_inventory_batches_ws_id(&format!(
                "/api/v1/workspaces/{WS}/inventory/batches"
            )),
            Some(WS)
        );
    }

    #[test]
    fn ws_id_rejects_non_matching_paths() {
        // Wrong prefix (no v1).
        assert_eq!(
            workspaces_wsid_inventory_batches_ws_id("/api/workspaces/ws-1/inventory/batches"),
            None
        );
        // Nested sub-resource (trailing segment remains).
        assert_eq!(
            workspaces_wsid_inventory_batches_ws_id(
                "/api/v1/workspaces/ws-1/inventory/batches/batch-1"
            ),
            None
        );
        // Different suffix.
        assert_eq!(
            workspaces_wsid_inventory_batches_ws_id("/api/v1/workspaces/ws-1/inventory/bundles"),
            None
        );
        // Empty ws id.
        assert_eq!(
            workspaces_wsid_inventory_batches_ws_id("/api/v1/workspaces//inventory/batches"),
            None
        );
        // Embedded slash in ws id segment.
        assert_eq!(
            workspaces_wsid_inventory_batches_ws_id("/api/v1/workspaces/a/b/inventory/batches"),
            None
        );
        // Unrelated short path must not panic / match.
        assert_eq!(workspaces_wsid_inventory_batches_ws_id("/api/v1"), None);
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

    // --- pagination decision + read window --------------------------------

    #[test]
    fn should_paginate_only_for_exact_paginated_value() {
        assert!(should_return_paginated(Some(&url("?response=paginated"))));
        assert!(!should_return_paginated(Some(&url("?response=all"))));
        assert!(!should_return_paginated(Some(&url(""))));
        assert!(!should_return_paginated(None));
    }

    #[test]
    fn read_window_paginated_uses_page_size_and_offset() {
        let params = QueryParams {
            q: String::new(),
            page: 3,
            page_size: 25,
        };
        assert_eq!(params.read_window(true), (25, 50));
    }

    #[test]
    fn read_window_non_paginated_uses_large_limit_zero_offset() {
        let params = QueryParams {
            q: String::new(),
            page: 3,
            page_size: 25,
        };
        assert_eq!(params.read_window(false), (NON_PAGINATED_LIMIT, 0));
    }

    // --- response shaping --------------------------------------------------

    #[test]
    fn map_rpc_list_empty_rows() {
        assert_eq!(map_rpc_list(Vec::new()), json!({ "count": 0, "data": [] }));
    }

    #[test]
    fn map_rpc_list_uses_first_total_count_and_filters_null_batches() {
        let rows = vec![
            BatchListRow {
                total_count: Some(7),
                batch: Some(json!({ "id": "b1" })),
            },
            BatchListRow {
                total_count: Some(7),
                batch: None,
            },
            BatchListRow {
                total_count: Some(7),
                batch: Some(Value::Null),
            },
            BatchListRow {
                total_count: Some(7),
                batch: Some(json!({ "id": "b2" })),
            },
        ];

        assert_eq!(
            map_rpc_list(rows),
            json!({
                "count": 7,
                "data": [ { "id": "b1" }, { "id": "b2" } ],
            })
        );
    }
}
