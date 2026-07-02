//! Handler for `GET /api/v1/workspaces/:wsId/users`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/route.ts` (GET only; the
//! legacy `POST` insert path is intentionally left to the still-live Next.js
//! route by returning `None` for every non-`GET` method).
//!
//! Legacy GET behavior:
//!   * If an `API_KEY` request header is present, the legacy route validates a
//!     workspace API key and reads with the admin (service-role) client.
//!   * Otherwise it resolves the finance route auth context
//!     (`resolveFinanceRouteAuthContext` accepts finance/platform app-session
//!     tokens and CLI access tokens, falling back to the Supabase session) and
//!     calls `getPermissions`. If `getPermissions` returns `null` (no workspace
//!     membership / no effective permissions) it responds `401` with
//!     `{ "message": "Unauthorized" }`.
//!   * It then reads workspace users via the `get_workspace_users` RPC with the
//!     admin (service-role) client, requesting an exact count, ordering by
//!     `full_name` then `display_name` (ascending, nulls last), and paginating
//!     via `from`/`to`/`limit` query params.
//!   * On a query error it responds `500` with
//!     `{ "message": "Error fetching workspace users" }`.
//!   * On success it responds `200` with `{ "data": [...], "count": N }`
//!     (`data || []`, `count ?? 0`).
//!
//! Auth fidelity / gaps:
//!   * The legacy session path only requires workspace membership
//!     (`getPermissions` truthy), NOT a specific permission. The shared
//!     `authorize_finance_permission` helper (which matches the accepted token
//!     types: finance/platform app sessions, CLI tokens, and Supabase sessions)
//!     requires a named permission, so this port enforces
//!     `view_users_public_info` — the permission used by the sibling
//!     `get_workspace_users` route (`/teach/users`). This is slightly STRICTER
//!     than legacy: a workspace member holding some other permission but not
//!     `view_users_public_info` would receive `401` here instead of `200`. All
//!     "no access" outcomes still collapse to `401 { "message": "Unauthorized" }`,
//!     matching the legacy 401-only auth behavior.
//!   * GAP: `BackendRequest` does not surface the raw `API_KEY` header, so the
//!     legacy API-key code path cannot be reproduced. This handler implements
//!     the session path (the common case) only.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users";
const USERS_PERMISSION: &str = "view_users_public_info";
const GET_WORKSPACE_USERS_RPC: &str = "get_workspace_users";
const ERROR_MESSAGE: &str = "Error fetching workspace users";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;
// PostgREST applies the `order` query string to the RPC result set. Mirrors the
// legacy `.order('full_name', { ascending: true, nullsFirst: false })` followed
// by `.order('display_name', { ascending: true, nullsFirst: false })`.
const ORDER: &str = "full_name.asc.nullslast,display_name.asc.nullslast";

pub(crate) async fn handle_workspaces_wsid_users_2_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = users_ws_id(request.path)?;

    Some(match request.method {
        "GET" => users_response(config, request, raw_ws_id, outbound).await,
        // Every non-GET method (POST/PUT/PATCH/DELETE) falls through to the
        // still-live Next.js route — do NOT emit a 405 here.
        _ => return None,
    })
}

async fn users_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization =
        match authorize_finance_permission(config, request, raw_ws_id, USERS_PERMISSION, outbound)
            .await
        {
            Ok(authorization) => authorization,
            // Legacy `getDataFromSession` only ever returns `401` for the
            // auth/membership gate; collapse every "no access" variant to `401`.
            Err(
                FinanceAuthorizationError::Unauthorized
                | FinanceAuthorizationError::NotFound
                | FinanceAuthorizationError::Forbidden,
            ) => {
                return message_response(401, UNAUTHORIZED_MESSAGE);
            }
            Err(FinanceAuthorizationError::Internal) => return error_response(),
        };

    let query = UsersQuery::from_url(request.url);

    match fetch_workspace_users(&config.contact_data, outbound, &authorization.ws_id, &query).await
    {
        Ok((count, data)) => {
            no_store_response(json_response(200, json!({ "data": data, "count": count })))
        }
        Err(()) => error_response(),
    }
}

struct UsersQuery {
    search_query: String,
    range_start: i64,
    range_end: i64,
}

impl UsersQuery {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut q_param: Option<String> = None;
        let mut query_param: Option<String> = None;
        let mut from_param: Option<String> = None;
        let mut to_param: Option<String> = None;
        let mut limit_param: Option<String> = None;

        if let Some(parsed) = request_url.and_then(|raw| url::Url::parse(raw).ok()) {
            // `searchParams.get(..)` returns the first occurrence, so only the
            // first value for each key is retained.
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    "q" if q_param.is_none() => q_param = Some(value.into_owned()),
                    "query" if query_param.is_none() => query_param = Some(value.into_owned()),
                    "from" if from_param.is_none() => from_param = Some(value.into_owned()),
                    "to" if to_param.is_none() => to_param = Some(value.into_owned()),
                    "limit" if limit_param.is_none() => limit_param = Some(value.into_owned()),
                    _ => {}
                }
            }
        }

        // `const query = searchParams.get('q') || searchParams.get('query')`
        // then `query ?? ''`. An empty `q` is falsy and falls through to
        // `query`; a missing `query` becomes `''`.
        let search_query = q_param
            .filter(|value| !value.is_empty())
            .or(query_param)
            .unwrap_or_default();

        // Legacy: `parseInt(searchParams.get('from') || '0', 10)` etc., then the
        // `applyPagination` clamping.
        let from = js_parse_int(&falsy_default(from_param.as_deref(), "0"));
        let to = js_parse_int(&falsy_default(to_param.as_deref(), "-1"));
        let limit = js_parse_int(&falsy_default(limit_param.as_deref(), "50"));

        let (range_start, range_end) = pagination_range(from, to, limit);

        Self {
            search_query,
            range_start,
            range_end,
        }
    }
}

/// Mirrors the legacy `applyPagination` clamping and returns the inclusive
/// PostgREST range bounds (`range(safeFrom, ..)`).
///
/// `from`/`to`/`limit` are `None` when the legacy `parseInt` would have yielded
/// `NaN` (a non-finite value).
fn pagination_range(from: Option<i64>, to: Option<i64>, limit: Option<i64>) -> (i64, i64) {
    let safe_from = match from {
        Some(value) if value >= 0 => value,
        _ => 0,
    };
    let safe_limit = match limit {
        Some(value) if value > 0 => value.min(MAX_PAGE_SIZE),
        _ => DEFAULT_PAGE_SIZE,
    };
    let default_end = safe_from + safe_limit - 1;

    let range_end = match to {
        Some(value) if value >= safe_from => value.min(default_end),
        _ => default_end,
    };

    (safe_from, range_end)
}

async fn fetch_workspace_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &UsersQuery,
) -> Result<(i64, Value), ()> {
    let Some(base_url) = contact_data.rpc_url(GET_WORKSPACE_USERS_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let request_url = format!("{base_url}?order={ORDER}");

    // Body mirrors the RPC named arguments from the legacy route.
    let body = json!({
        "_ws_id": ws_id,
        "included_groups": [],
        "excluded_groups": [],
        "search_query": query.search_query,
        "include_archived": true,
        "link_status": "all",
    })
    .to_string();

    let range_header = format!("{}-{}", query.range_start, query.range_end);

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &request_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                // `{ count: 'exact' }` -> exact total in the Content-Range header.
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", &range_header)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // PostgREST returns 200 (or 206 Partial Content when a Range is applied).
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `count ?? 0`.
    let count = content_range_total(response.header("content-range")).unwrap_or(0);
    // `data || []`.
    let data = response.json::<Value>().map_err(|_| ())?;
    let data = if data.is_array() { data } else { json!([]) };

    Ok((count, data))
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

/// Mirrors JavaScript `value || default`: an empty string is falsy and is
/// replaced by `default`.
fn falsy_default(value: Option<&str>, default: &str) -> String {
    match value {
        Some(value) if !value.is_empty() => value.to_owned(),
        _ => default.to_owned(),
    }
}

/// Approximates `Number.parseInt(value, 10)`: skips leading ASCII whitespace,
/// reads an optional sign and the leading run of decimal digits, ignoring any
/// trailing characters. Returns `None` for the `NaN` case (no digits).
fn js_parse_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    let mut negative = false;

    if let Some(&first) = bytes.first()
        && (first == b'+' || first == b'-')
    {
        negative = first == b'-';
        index = 1;
    }

    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index == digits_start {
        return None;
    }

    let magnitude = trimmed[digits_start..index].parse::<i64>().ok()?;
    Some(if negative { -magnitude } else { magnitude })
}

fn users_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, ERROR_MESSAGE)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(url: &str) -> UsersQuery {
        UsersQuery::from_url(Some(url))
    }

    #[test]
    fn extracts_ws_id_from_exact_path() {
        assert_eq!(
            users_ws_id("/api/v1/workspaces/ws-123/users"),
            Some("ws-123")
        );
    }

    #[test]
    fn extracts_uuid_ws_id() {
        assert_eq!(
            users_ws_id("/api/v1/workspaces/11111111-1111-4111-8111-111111111111/users"),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn rejects_wrong_mount_paths() {
        // Non-v1 mount belongs to the sibling handler.
        assert_eq!(users_ws_id("/api/workspaces/ws-123/users"), None);
        assert_eq!(users_ws_id("/workspaces/ws-123/users"), None);
    }

    #[test]
    fn rejects_missing_or_extended_suffix() {
        assert_eq!(users_ws_id("/api/v1/workspaces/ws-123/users/count"), None);
        assert_eq!(users_ws_id("/api/v1/workspaces/ws-123/members"), None);
        assert_eq!(users_ws_id("/api/v1/workspaces/ws-123"), None);
    }

    #[test]
    fn rejects_empty_and_nested_ws_id() {
        assert_eq!(users_ws_id("/api/v1/workspaces//users"), None);
        assert_eq!(users_ws_id("/api/v1/workspaces/ws/sub/users"), None);
    }

    #[test]
    fn js_parse_int_matches_parse_int_semantics() {
        assert_eq!(js_parse_int("12"), Some(12));
        assert_eq!(js_parse_int("  12"), Some(12));
        assert_eq!(js_parse_int("12abc"), Some(12));
        assert_eq!(js_parse_int("-3"), Some(-3));
        assert_eq!(js_parse_int("+7"), Some(7));
        assert_eq!(js_parse_int("0"), Some(0));
        assert_eq!(js_parse_int("-1"), Some(-1));
        // NaN cases.
        assert_eq!(js_parse_int("abc"), None);
        assert_eq!(js_parse_int(""), None);
        assert_eq!(js_parse_int("-"), None);
    }

    #[test]
    fn falsy_default_replaces_empty_with_default() {
        assert_eq!(falsy_default(None, "0"), "0");
        assert_eq!(falsy_default(Some(""), "0"), "0");
        assert_eq!(falsy_default(Some("5"), "0"), "5");
    }

    #[test]
    fn pagination_defaults_to_first_page() {
        // No params -> from=0, to=-1, limit=50 -> range 0-49.
        let q = query("https://x.localhost/api/v1/workspaces/ws/users");
        assert_eq!((q.range_start, q.range_end), (0, 49));
    }

    #[test]
    fn pagination_honors_from_and_limit() {
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?from=10&limit=20");
        assert_eq!((q.range_start, q.range_end), (10, 29));
    }

    #[test]
    fn pagination_clamps_limit_to_max() {
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?limit=9999");
        assert_eq!((q.range_start, q.range_end), (0, MAX_PAGE_SIZE - 1));
    }

    #[test]
    fn pagination_uses_explicit_to_when_in_range() {
        // to=5 (>= from) and below the limit ceiling -> range 0-5.
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?to=5&limit=50");
        assert_eq!((q.range_start, q.range_end), (0, 5));
    }

    #[test]
    fn pagination_ignores_to_below_from() {
        // to=3 < from=10 -> fall back to limit window.
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?from=10&to=3&limit=20");
        assert_eq!((q.range_start, q.range_end), (10, 29));
    }

    #[test]
    fn pagination_caps_to_at_limit_window() {
        // to=1000 exceeds the limit window (from=0,limit=50 -> 49).
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?to=1000&limit=50");
        assert_eq!((q.range_start, q.range_end), (0, 49));
    }

    #[test]
    fn pagination_treats_negative_and_invalid_from_as_zero() {
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?from=-5&limit=10");
        assert_eq!((q.range_start, q.range_end), (0, 9));
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?from=abc&limit=10");
        assert_eq!((q.range_start, q.range_end), (0, 9));
    }

    #[test]
    fn pagination_treats_invalid_or_nonpositive_limit_as_default() {
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?limit=0");
        assert_eq!((q.range_start, q.range_end), (0, DEFAULT_PAGE_SIZE - 1));
        let q = query("https://x.localhost/api/v1/workspaces/ws/users?limit=-3");
        assert_eq!((q.range_start, q.range_end), (0, DEFAULT_PAGE_SIZE - 1));
    }

    #[test]
    fn search_query_prefers_q_then_query() {
        assert_eq!(
            query("https://x.localhost/api/v1/workspaces/ws/users?q=alice").search_query,
            "alice"
        );
        // Empty q falls through to query.
        assert_eq!(
            query("https://x.localhost/api/v1/workspaces/ws/users?q=&query=bob").search_query,
            "bob"
        );
        // Missing both -> empty string.
        assert_eq!(
            query("https://x.localhost/api/v1/workspaces/ws/users").search_query,
            ""
        );
        // q wins over query when present and non-empty.
        assert_eq!(
            query("https://x.localhost/api/v1/workspaces/ws/users?q=alice&query=bob").search_query,
            "alice"
        );
    }

    #[test]
    fn content_range_total_parses_total() {
        assert_eq!(content_range_total(Some("0-49/256")), Some(256));
        assert_eq!(content_range_total(Some("*/0")), Some(0));
        assert_eq!(content_range_total(Some("0-0/*")), None);
        assert_eq!(content_range_total(None), None);
    }

    #[test]
    fn error_response_matches_legacy_shape() {
        let response = error_response();
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": ERROR_MESSAGE }));
    }

    #[test]
    fn unauthorized_response_matches_legacy_shape() {
        let response = message_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "message": "Unauthorized" }));
    }
}
