//! Handler for `GET /api/v1/workspaces/:wsId/users/groups/possible-excluded`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/groups/possible-excluded/route.ts`.
//! The legacy route also exposes a `POST` handler (same query logic but params
//! read from the JSON request body); only `GET` is ported here, and every
//! non-GET method returns `None` so the worker falls through to the still-live
//! Next.js route.
//!
//! Legacy GET behavior:
//!   1. Parse query params (`includedGroups`, `q`, `page`, `pageSize`,
//!      `paginated`).
//!   2. Call `getPermissions({ wsId, request })`; if it returns `null` respond
//!      `404 { "error": "Not found" }`.
//!   3. Call the Supabase RPC `get_possible_excluded_groups` with `_ws_id` and
//!      `included_groups`, selecting `id, name, amount`, ordered by `name`.
//!   4. If `q` is set, apply a case-insensitive `ilike` filter on `name`.
//!   5. If paginated (explicit `paginated=true`, or any of `page`/`pageSize`/`q`
//!      is present), apply `Range` pagination and return
//!      `{ "data": [...], "count": N, "pageSize": N }`.
//!   6. Otherwise return the bare row array `data || []`.
//!
//! Auth is delegated to
//! `workspace_permission_check::authorize_workspace_permission` with the
//! `view_user_groups` permission.
//!
//! BEHAVIOR GAPS vs legacy:
//!   * The legacy route only checks that `getPermissions` returns a non-null
//!     value (i.e., that the caller is a workspace member with any permissions),
//!     but does NOT gate on a specific named permission. This port enforces
//!     `view_user_groups`, which is slightly stricter: a workspace member who
//!     lacks that permission will receive `403` here instead of `200`.
//!   * The legacy route maps all `getPermissions`-null outcomes to
//!     `404 { "error": "Not found" }`. This handler maps both `Unauthorized`
//!     and `NotFound` to that same response, and `Forbidden` to
//!     `403 { "message": "..." }`.
//!   * The legacy POST path (body-sourced params) is not ported; this handler
//!     returns `None` for non-GET methods.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users/groups/possible-excluded";
const VIEW_PERMISSION: &str = "view_user_groups";
const RPC_NAME: &str = "get_possible_excluded_groups";

const NOT_FOUND_MESSAGE: &str = "Not found";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view user groups";
const FETCH_ERROR_MESSAGE: &str = "Error fetching possible excluded groups";

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;
const MAX_SEARCH_LENGTH: usize = 100;

pub(crate) async fn handle_workspaces_wsid_users_groups_possible_excluded_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = possible_excluded_ws_id(request.path)?;

    Some(match request.method {
        "GET" => possible_excluded_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn possible_excluded_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return error_response(404, NOT_FOUND_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    let query = PossibleExcludedQuery::from_url(request.url);

    match fetch_possible_excluded(contact_data, outbound, &authorization.ws_id, &query).await {
        Ok(result) => no_store_response(json_response(200, result)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

struct PossibleExcludedQuery {
    included_groups: Vec<String>,
    q: Option<String>,
    page: i64,
    page_size: i64,
    is_paginated: bool,
}

impl PossibleExcludedQuery {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut included_groups_raw: Vec<String> = Vec::new();
        let mut q_param: Option<String> = None;
        let mut page_param: Option<String> = None;
        let mut page_size_param: Option<String> = None;
        let mut paginated_param: Option<String> = None;

        if let Some(parsed) = request_url.and_then(|raw| url::Url::parse(raw).ok()) {
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    "includedGroups" => {
                        // Each value may itself be comma-separated.
                        for entry in value.split(',') {
                            let trimmed = entry.trim();
                            if !trimmed.is_empty() {
                                included_groups_raw.push(trimmed.to_owned());
                            }
                        }
                    }
                    "q" if q_param.is_none() => q_param = Some(value.into_owned()),
                    "page" if page_param.is_none() => page_param = Some(value.into_owned()),
                    "pageSize" if page_size_param.is_none() => {
                        page_size_param = Some(value.into_owned());
                    }
                    "paginated" if paginated_param.is_none() => {
                        paginated_param = Some(value.into_owned());
                    }
                    _ => {}
                }
            }
        }

        // Clamp the search query to MAX_SEARCH_LENGTH characters.
        let q = q_param
            .filter(|v| !v.is_empty())
            .map(|v| v.chars().take(MAX_SEARCH_LENGTH).collect::<String>());

        let page = page_param
            .as_deref()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|&n| n >= 1)
            .unwrap_or(DEFAULT_PAGE);

        let page_size = page_size_param
            .as_deref()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|&n| n >= 1)
            .map(|n| n.min(MAX_PAGE_SIZE))
            .unwrap_or(DEFAULT_PAGE_SIZE);

        // Mirror legacy: `isPaginated = sp.paginated || page !== undefined || pageSize !== undefined || q !== undefined`
        let explicit_paginated = paginated_param.as_deref() == Some("true");
        let has_page = page_param.is_some();
        let has_page_size = page_size_param.is_some();
        let has_q = q.is_some();
        let is_paginated = explicit_paginated || has_page || has_page_size || has_q;

        Self {
            included_groups: included_groups_raw,
            q,
            page,
            page_size,
            is_paginated,
        }
    }

    /// Inclusive zero-based PostgREST `Range` bounds for the current page.
    fn range_bounds(&self) -> (i64, i64) {
        let start = (self.page - 1) * self.page_size;
        let end = self.page * self.page_size - 1;
        (start, end)
    }
}

async fn fetch_possible_excluded(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &PossibleExcludedQuery,
) -> Result<Value, ()> {
    let Some(base_url) = contact_data.rpc_url(RPC_NAME) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    // Build PostgREST query string.
    // `select=id,name,amount` mirrors `.select('id, name, amount')`.
    // `order=name.asc` mirrors `.order('name')`.
    let mut rpc_url = format!("{base_url}?select=id,name,amount&order=name.asc");

    // `.ilike('name', '%q%')` -> `name=ilike.*q*`
    if let Some(search) = &query.q {
        let escaped = search.replace('*', "**").replace('%', "%25");
        rpc_url.push_str(&format!("&name=ilike.*{escaped}*"));
    }

    let body = json!({
        "_ws_id": ws_id,
        "included_groups": query.included_groups,
    })
    .to_string();

    let range_header = if query.is_paginated {
        let (start, end) = query.range_bounds();
        Some(format!("{start}-{end}"))
    } else {
        None
    };

    let mut outbound_request = OutboundRequest::new(OutboundMethod::Post, &rpc_url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Content-Type", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_body(&body);

    if let Some(range_header) = range_header.as_deref() {
        outbound_request = outbound_request
            .with_header("Prefer", "count=exact")
            .with_header("Range-Unit", "items")
            .with_header("Range", range_header);
    }

    let response = outbound.send(outbound_request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    if query.is_paginated {
        let count = content_range_total(response.header("content-range")).unwrap_or(0);
        let data = response.json::<Value>().map_err(|_| ())?;
        let data = if data.is_array() { data } else { json!([]) };
        Ok(json!({
            "data": data,
            "count": count,
            "pageSize": query.page_size,
        }))
    } else {
        // Non-paginated: bare array, `data || []`.
        let data = response.json::<Value>().map_err(|_| ())?;
        if data.is_array() {
            Ok(data)
        } else {
            Ok(json!([]))
        }
    }
}

/// Parses the total row count from a PostgREST `Content-Range` header value,
/// e.g. `0-49/256` -> 256, or `*/0` -> 0.
fn content_range_total(header: Option<&str>) -> Option<i64> {
    let total = header?.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn possible_excluded_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

    fn query(url: &str) -> PossibleExcludedQuery {
        PossibleExcludedQuery::from_url(Some(url))
    }

    // ── path guard ────────────────────────────────────────────────────────────

    #[test]
    fn ws_id_extracted_from_exact_path() {
        assert_eq!(
            possible_excluded_ws_id("/api/v1/workspaces/abc-123/users/groups/possible-excluded"),
            Some("abc-123")
        );
    }

    #[test]
    fn ws_id_extracted_for_uuid() {
        assert_eq!(
            possible_excluded_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/users/groups/possible-excluded"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn ws_id_accepts_personal_slug() {
        assert_eq!(
            possible_excluded_ws_id("/api/v1/workspaces/personal/users/groups/possible-excluded"),
            Some("personal")
        );
    }

    #[test]
    fn ws_id_rejects_wrong_prefix() {
        assert_eq!(
            possible_excluded_ws_id("/api/workspaces/abc/users/groups/possible-excluded"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_trailing_segment() {
        assert_eq!(
            possible_excluded_ws_id("/api/v1/workspaces/abc/users/groups/possible-excluded/extra"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_empty_segment() {
        assert_eq!(
            possible_excluded_ws_id("/api/v1/workspaces//users/groups/possible-excluded"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_different_suffix() {
        assert_eq!(
            possible_excluded_ws_id("/api/v1/workspaces/abc/users/groups"),
            None
        );
    }

    // ── query parsing ─────────────────────────────────────────────────────────

    #[test]
    fn defaults_when_no_params() {
        let q = query("https://example.com/api/v1/workspaces/ws/users/groups/possible-excluded");
        assert!(q.included_groups.is_empty());
        assert!(q.q.is_none());
        assert_eq!(q.page, 1);
        assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
        assert!(!q.is_paginated);
    }

    #[test]
    fn paginated_true_sets_is_paginated() {
        let q = query("https://example.com/path?paginated=true");
        assert!(q.is_paginated);
    }

    #[test]
    fn page_param_sets_is_paginated() {
        let q = query("https://example.com/path?page=2");
        assert!(q.is_paginated);
        assert_eq!(q.page, 2);
    }

    #[test]
    fn page_size_param_sets_is_paginated() {
        let q = query("https://example.com/path?pageSize=10");
        assert!(q.is_paginated);
        assert_eq!(q.page_size, 10);
    }

    #[test]
    fn q_param_sets_is_paginated() {
        let q = query("https://example.com/path?q=hello");
        assert!(q.is_paginated);
        assert_eq!(q.q.as_deref(), Some("hello"));
    }

    #[test]
    fn page_size_clamped_to_max() {
        let q = query("https://example.com/path?pageSize=9999");
        assert_eq!(q.page_size, MAX_PAGE_SIZE);
    }

    #[test]
    fn included_groups_parsed_from_comma_separated() {
        let q = query("https://example.com/path?includedGroups=a,b,c");
        assert_eq!(q.included_groups, vec!["a", "b", "c"]);
    }

    #[test]
    fn included_groups_parsed_from_repeated_params() {
        let q = query("https://example.com/path?includedGroups=a&includedGroups=b");
        assert_eq!(q.included_groups, vec!["a", "b"]);
    }

    #[test]
    fn range_bounds_first_page() {
        let q = PossibleExcludedQuery {
            included_groups: vec![],
            q: None,
            page: 1,
            page_size: 50,
            is_paginated: true,
        };
        assert_eq!(q.range_bounds(), (0, 49));
    }

    #[test]
    fn range_bounds_second_page() {
        let q = PossibleExcludedQuery {
            included_groups: vec![],
            q: None,
            page: 2,
            page_size: 50,
            is_paginated: true,
        };
        assert_eq!(q.range_bounds(), (50, 99));
    }

    // ── content-range parsing ─────────────────────────────────────────────────

    #[test]
    fn content_range_total_parses_total() {
        assert_eq!(content_range_total(Some("0-49/256")), Some(256));
        assert_eq!(content_range_total(Some("*/0")), Some(0));
        assert_eq!(content_range_total(Some("0-0/*")), None);
        assert_eq!(content_range_total(None), None);
    }

    // ── response shapes ───────────────────────────────────────────────────────

    #[test]
    fn message_response_uses_message_key() {
        let resp = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "message": FORBIDDEN_MESSAGE }));
    }

    #[test]
    fn error_response_uses_error_key() {
        let resp = error_response(404, NOT_FOUND_MESSAGE);
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body, json!({ "error": NOT_FOUND_MESSAGE }));
    }
}
