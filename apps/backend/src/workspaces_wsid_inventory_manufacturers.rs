//! Handler for `GET /api/v1/workspaces/:wsId/inventory/manufacturers`.
//!
//! Mirrors the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/manufacturers/route.ts`.
//!
//! Only the GET method is migrated. The legacy route also defines POST (create
//! an inventory manufacturer) which is NOT migrated yet, so this handler returns
//! `None` for every non-GET method to let the Cloudflare worker fall through to
//! the still-active Next.js route.
//!
//! Behavior parity with the legacy GET handler:
//!   1. `authorizeInventoryWorkspace` -> resolve/normalize wsId + verify the
//!      caller is a workspace member. Implemented here via the shared
//!      `authorize_workspace_permission` helper (it normalizes the wsId,
//!      verifies membership, and computes effective permissions in one pass).
//!   2. Permission gate: the legacy route grants access when
//!      `canViewInventoryCatalog(permissions) || canManageInventorySetup(permissions)`.
//!      The UNION of those two permission sets is checked below (ANY grants
//!      access); workspace creators/admins are covered by `has_all_permissions`
//!      inside `authorize_workspace_permission`.
//!   3. Parse the list query (`q`, `page`, `pageSize`, `response`) exactly like
//!      `parseInventoryApiListQuery` (a Zod `safeParse`). Invalid input -> 400
//!      `{ message: "Invalid query parameters" }`.
//!   4. Read `private.inventory_manufacturers` via service-role REST (matching
//!      `sbAdmin.schema('private').from('inventory_manufacturers')`), filtered by
//!      `ws_id`, optional `name ilike %q%`, ordered by `name`. When
//!      `?response=paginated` is set, request `count=exact` + the page range and
//!      respond `{ count, data }`; otherwise respond `{ data }`.
//!   5. Upstream read failure -> 500
//!      `{ message: "Failed to fetch inventory manufacturers" }`.
//!
//! BEHAVIOR GAP (ordering): the legacy route checks workspace membership FIRST
//! (`authorizeInventoryWorkspace` -> 403 for non-members), then parses the query
//! (400), then checks the catalog/setup permission (403). The shared
//! `authorize_workspace_permission` helper fuses membership + permission, so this
//! handler performs the full authorization (401/403/404/500) BEFORE query parsing
//! (400). The only divergent case is an authenticated workspace MEMBER who both
//! lacks every catalog/setup permission AND sends a malformed query: legacy
//! returns 400, this handler returns 403. Every other case matches. This mirrors
//! the established `workspaces_inventory_bundles` / `workspaces_inventory_owners`
//! precedent.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_MANUFACTURERS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_MANUFACTURERS_PATH_SUFFIX: &str = "/inventory/manufacturers";
const MANUFACTURERS_TABLE: &str = "inventory_manufacturers";
const PRIVATE_SCHEMA: &str = "private";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory manufacturers";

// Mirrors `MAX_SEARCH_LENGTH` (packages/utils/src/constants.ts): `q` upper bound.
const MAX_SEARCH_LENGTH: usize = 500;
// Mirrors `MAX_MEDIUM_TEXT_LENGTH`: `pageSize` upper bound.
const MAX_PAGE_SIZE: i64 = 1000;
const MIN_PAGE_SIZE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MIN_PAGE: i64 = 1;
const DEFAULT_PAGE: i64 = 1;

// Union of `canViewInventoryCatalog` and `canManageInventorySetup`
// (apps/web/src/lib/inventory/permissions.ts). The legacy GET grants access when
// EITHER predicate is true, so holding ANY of these permissions grants access.
const VIEW_OR_MANAGE_PERMISSIONS: [&str; 7] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
    "manage_inventory_setup",
];

/// Parsed + validated `parseInventoryApiListQuery` result. Invalid inputs
/// surface as HTTP 400 (mirroring the Zod `safeParse` failure), so parsing
/// returns `Err(())` for any out-of-range / non-conforming value.
struct ManufacturerListQuery {
    /// `q`: search term, `None` when empty/missing (legacy `if (q)` is falsy for
    /// the empty string, so no `ilike` filter is applied).
    q: Option<String>,
    /// `page`: validated 1-based page number.
    page: i64,
    /// `pageSize`: validated page size.
    page_size: i64,
    /// `response === 'paginated'`.
    paginate: bool,
}

pub(crate) async fn handle_workspaces_wsid_inventory_manufacturers_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_manufacturers_ws_id(request.path)?;

    // Only GET is migrated. Every other method (e.g. POST) must fall through to
    // the still-active Next.js route, so return `None` for them.
    Some(match request.method {
        "GET" => list_manufacturers_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn list_manufacturers_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let request_url = request.url;

    let ws_id = match authorize_inventory_access(&config.contact_data, request, raw_ws_id, outbound)
        .await
    {
        Ok(ws_id) => ws_id,
        Err(response) => return response,
    };

    let query = match parse_query(request_url) {
        Ok(query) => query,
        // The legacy route returns `{ message: 'Invalid query parameters' }`.
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE }),
            ));
        }
    };

    match fetch_manufacturers(&config.contact_data, outbound, &ws_id, &query).await {
        Ok((rows, count)) => {
            // Mirror the legacy response shape: paginated -> `{ count, data }`,
            // otherwise `{ data }`.
            let payload = if query.paginate {
                json!({ "count": count, "data": rows })
            } else {
                json!({ "data": rows })
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
///
/// `authorize_workspace_permission` also performs the wsId normalization +
/// membership verification that the legacy `authorizeInventoryWorkspace` does; a
/// non-member surfaces as `Forbidden` from the first permission check, matching
/// the legacy 403.
async fn authorize_inventory_access(
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
            // A single missing permission does not deny access; access is granted
            // when ANY permission is present, so keep checking the rest.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Reads `private.inventory_manufacturers` via service-role REST (matching
/// `sbAdmin.schema('private').from('inventory_manufacturers').select('*')`),
/// filtered by `ws_id`, optionally `name ilike %q%`, ordered by `name`.
///
/// Returns `(rows, count)`. `count` is the exact total from the `Content-Range`
/// header when paginating (falling back to `0`, matching legacy `count ?? 0`);
/// for non-paginated reads `count` is unused.
async fn fetch_manufacturers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ManufacturerListQuery,
) -> Result<(Vec<Value>, i64), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name".to_owned()),
    ];
    if let Some(q) = &query.q {
        // Mirrors `.ilike('name', `%${q}%`)`; rest_url URL-encodes the value.
        params.push(("name", format!("ilike.%{q}%")));
    }

    let url = contact_data
        .rest_url(MANUFACTURERS_TABLE, &params)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Accept-Profile", PRIVATE_SCHEMA);

    // `count: 'exact'` + `.range(start, end)` only when `?response=paginated`.
    let range = range_header(query);
    if query.paginate {
        outbound_request = outbound_request
            .with_header("Prefer", "count=exact")
            .with_header("Range-Unit", "items")
            .with_header("Range", &range);
    }

    let response = outbound.send(outbound_request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let count = if query.paginate {
        total_count_from_content_range(&response).unwrap_or(0)
    } else {
        0
    };

    Ok((rows, count))
}

/// `range(start, end)` where `start = (page - 1) * pageSize` and
/// `end = start + pageSize - 1`.
fn range_header(query: &ManufacturerListQuery) -> String {
    let start = (query.page - 1) * query.page_size;
    let end = start + query.page_size - 1;
    format!("{start}-{end}")
}

/// Extracts the exact total from the PostgREST `Content-Range: a-b/total`
/// header (matching the legacy `count ?? 0` fallback when absent/unparseable).
fn total_count_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let (_, total) = response.header("content-range")?.rsplit_once('/')?;
    total.parse::<i64>().ok()
}

/// Parses + validates `InventoryApiListQuerySchema`:
///   q:        z.string().max(500).default('')
///   page:     z.coerce.number().int().min(1).default(1)
///   pageSize: z.coerce.number().int().min(1).max(1000).default(10)
///   response: z.enum(['paginated']).optional()
///
/// Returns `Err(())` for any value the Zod schema would reject. Unknown query
/// keys are ignored, matching Zod's default key-stripping; repeated keys take
/// the last occurrence, matching `searchParams.forEach`.
fn parse_query(request_url: Option<&str>) -> Result<ManufacturerListQuery, ()> {
    let mut q_raw: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut response_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
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

    // `q`: no trim; `.max(500)`; default ''. `if (q)` is falsy for '' -> None.
    let q = match q_raw {
        None => None,
        Some(value) => {
            if value.chars().count() > MAX_SEARCH_LENGTH {
                return Err(());
            }
            if value.is_empty() { None } else { Some(value) }
        }
    };

    // `page` / `pageSize`: coerced numbers, integer, within range.
    let page = parse_number_param(page_raw.as_deref(), MIN_PAGE, i64::MAX, DEFAULT_PAGE)?;
    let page_size = parse_number_param(
        page_size_raw.as_deref(),
        MIN_PAGE_SIZE,
        MAX_PAGE_SIZE,
        DEFAULT_PAGE_SIZE,
    )?;

    // `response`: enum(['paginated']).optional() -> only 'paginated' or absent.
    let paginate = match response_raw.as_deref() {
        None => false,
        Some("paginated") => true,
        Some(_) => return Err(()),
    };

    Ok(ManufacturerListQuery {
        q,
        page,
        page_size,
        paginate,
    })
}

/// Mirrors `z.coerce.number().int().min(min).max(max).default(default)`:
///   - missing -> `Ok(default)`
///   - present: coerced like JS `Number(value)` (empty/whitespace -> 0); must be
///     a finite whole number within `[min, max]`, otherwise `Err`.
fn parse_number_param(raw: Option<&str>, min: i64, max: i64, default: i64) -> Result<i64, ()> {
    let Some(raw) = raw else {
        return Ok(default);
    };

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

fn workspaces_inventory_manufacturers_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_MANUFACTURERS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_MANUFACTURERS_PATH_SUFFIX)?;

    // A non-empty ws_id with no remaining slashes guarantees this is exactly the
    // `/inventory/manufacturers` collection route (and not a nested path).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            workspaces_inventory_manufacturers_ws_id(
                "/api/v1/workspaces/ws-123/inventory/manufacturers"
            ),
            Some("ws-123")
        );
        assert_eq!(
            workspaces_inventory_manufacturers_ws_id(
                "/api/v1/workspaces/personal/inventory/manufacturers"
            ),
            Some("personal")
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Missing ws_id segment.
        assert_eq!(
            workspaces_inventory_manufacturers_ws_id("/api/v1/workspaces//inventory/manufacturers"),
            None
        );
        // Nested resource (e.g. an :id) must not match the collection route.
        assert_eq!(
            workspaces_inventory_manufacturers_ws_id(
                "/api/v1/workspaces/ws-1/extra/inventory/manufacturers"
            ),
            None
        );
        // Different suffix.
        assert_eq!(
            workspaces_inventory_manufacturers_ws_id("/api/v1/workspaces/ws-1/inventory/owners"),
            None
        );
        // Missing the /api/v1 prefix.
        assert_eq!(
            workspaces_inventory_manufacturers_ws_id(
                "/api/workspaces/ws-1/inventory/manufacturers"
            ),
            None
        );
        // Trailing segment after the suffix.
        assert_eq!(
            workspaces_inventory_manufacturers_ws_id(
                "/api/v1/workspaces/ws-1/inventory/manufacturers/123"
            ),
            None
        );
    }

    #[test]
    fn parse_query_applies_defaults_when_absent() {
        let query = parse_query(Some("https://x.test/api?ignored=1")).expect("valid");
        assert_eq!(query.q, None);
        assert_eq!(query.page, DEFAULT_PAGE);
        assert_eq!(query.page_size, DEFAULT_PAGE_SIZE);
        assert!(!query.paginate);
    }

    #[test]
    fn parse_query_no_url_uses_defaults() {
        let query = parse_query(None).expect("valid");
        assert_eq!(query.q, None);
        assert_eq!(query.page, DEFAULT_PAGE);
        assert_eq!(query.page_size, DEFAULT_PAGE_SIZE);
        assert!(!query.paginate);
    }

    #[test]
    fn parse_query_reads_valid_values() {
        let query = parse_query(Some(
            "https://x.test/api?q=acme&page=3&pageSize=25&response=paginated",
        ))
        .expect("valid");
        assert_eq!(query.q.as_deref(), Some("acme"));
        assert_eq!(query.page, 3);
        assert_eq!(query.page_size, 25);
        assert!(query.paginate);
    }

    #[test]
    fn parse_query_empty_q_is_none() {
        let query = parse_query(Some("https://x.test/api?q=")).expect("valid");
        assert_eq!(query.q, None);
    }

    #[test]
    fn parse_query_rejects_overlong_q() {
        let long = "a".repeat(MAX_SEARCH_LENGTH + 1);
        assert!(parse_query(Some(&format!("https://x.test/api?q={long}"))).is_err());
    }

    #[test]
    fn parse_query_rejects_invalid_numbers() {
        // Below min.
        assert!(parse_query(Some("https://x.test/api?page=0")).is_err());
        // Non-numeric.
        assert!(parse_query(Some("https://x.test/api?page=abc")).is_err());
        // Non-integer.
        assert!(parse_query(Some("https://x.test/api?pageSize=2.5")).is_err());
        // Above max page size.
        assert!(parse_query(Some("https://x.test/api?pageSize=1001")).is_err());
    }

    #[test]
    fn parse_query_rejects_invalid_response_value() {
        assert!(parse_query(Some("https://x.test/api?response=full")).is_err());
    }

    #[test]
    fn range_header_computes_zero_based_range() {
        let query = ManufacturerListQuery {
            q: None,
            page: 1,
            page_size: 10,
            paginate: true,
        };
        assert_eq!(range_header(&query), "0-9");

        let query = ManufacturerListQuery {
            q: None,
            page: 3,
            page_size: 25,
            paginate: true,
        };
        assert_eq!(range_header(&query), "50-74");
    }
}
