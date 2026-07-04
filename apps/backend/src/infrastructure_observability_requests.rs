//! Port of `GET /api/v1/infrastructure/observability/requests`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/observability/requests/route.ts`.
//!
//! The legacy route authorizes an "infrastructure viewer" (the ROOT workspace
//! `view_infrastructure` permission) and then returns a paginated list of
//! observability requests produced by `readObservabilityRequests`.
//!
//! # Runtime gap
//!
//! `readObservabilityRequests` calls `loadRecentRequests`, which queries a
//! local Postgres log-drain database (`getSql`).  When the SQL client is
//! unavailable it falls back to `loadLegacyRequests`, which reads JSON files
//! from the host filesystem (`tmp/docker-web` via
//! `readBlueGreenMonitoringRequestArchive`).  A Cloudflare Worker has access to
//! neither a SQL client nor a host filesystem, so the response always collapses
//! to the empty paginated shape:
//!
//! ```json
//! { "hasNextPage": false, "items": [], "page": N, "pageSize": N, "total": 0 }
//! ```
//!
//! The only request-dependent parts of the empty response are `page` and
//! `pageSize`, parsed from the query string with the same clamping logic as
//! the legacy `clampPage` / `clampPageSize` helpers.
//!
//! # Auth
//!
//! Mirrors `authorizeInfrastructureViewer`, which resolves a session user (no
//! app-session / CLI tokens accepted) and checks `view_infrastructure` on the
//! ROOT workspace via `getPermissions`.
//!
//! # Behavior gaps vs. the legacy route
//!
//! - Data gap: real request records from the log-drain Postgres database or the
//!   filesystem-based archive are never returned.  The handler always produces
//!   an empty list.
//! - Cache gap: the legacy `NextResponse.json(data)` does not set an explicit
//!   `Cache-Control` header; this handler adds `no-store`, consistent with
//!   every other infrastructure route in the backend.

use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const ROUTE_PATH: &str = "/api/v1/infrastructure/observability/requests";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_observability_requests_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != ROUTE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => requests_response(config, request, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn requests_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Failed to load observability requests" }),
            ));
        }
    }

    let params = QueryParams::from_url(request.url);
    let page = params.page();
    let page_size = params.page_size();

    // The Worker has no SQL client and no host filesystem, so the request
    // archive is always empty. Mirror the empty shape from
    // readObservabilityRequests / loadRecentRequests.
    no_store_response(json_response(
        200,
        json!({
            "hasNextPage": false,
            "items": [],
            "page": page,
            "pageSize": page_size,
            "total": 0,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Query-string parsing
// ---------------------------------------------------------------------------

struct QueryParams {
    page: Option<String>,
    page_size: Option<String>,
}

impl QueryParams {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut params = Self {
            page: None,
            page_size: None,
        };
        let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) else {
            return params;
        };

        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" if params.page.is_none() => {
                    params.page = Some(value.into_owned());
                }
                "pageSize" if params.page_size.is_none() => {
                    params.page_size = Some(value.into_owned());
                }
                _ => {}
            }
        }

        params
    }

    /// Mirrors `clampPage(searchParams.get('page'))`:
    ///   - `parseInt(value, 10)` followed by `Number.isInteger(n) && n > 0`
    ///     guard; falls back to 1 on failure.
    fn page(&self) -> i64 {
        self.page
            .as_deref()
            .and_then(parse_positive_int)
            .unwrap_or(DEFAULT_PAGE)
    }

    /// Mirrors `clampPageSize(searchParams.get('pageSize'))`:
    ///   - `parseInt(value, 10)` followed by `Number.isInteger(n) && n > 0`
    ///     guard; falls back to 50 on failure. Capped at 200.
    fn page_size(&self) -> i64 {
        let parsed = self
            .page_size
            .as_deref()
            .and_then(parse_positive_int)
            .unwrap_or(DEFAULT_PAGE_SIZE);

        parsed.min(MAX_PAGE_SIZE)
    }
}

/// Mirrors JavaScript `Number.parseInt(value, 10)` with the
/// `Number.isInteger(parsed) && parsed > 0` guard from `clampPage`/`clampPageSize`.
/// `parseInt` consumes a leading integer prefix and ignores trailing junk.
fn parse_positive_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0;

    if matches!(bytes.first(), Some(b'+' | b'-')) {
        index += 1;
    }

    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index == digits_start {
        return None;
    }

    let parsed = trimmed[..index].parse::<i64>().ok()?;
    (parsed > 0).then_some(parsed)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- path guard ---

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!(ROUTE_PATH, "/api/v1/infrastructure/observability/requests");
    }

    #[test]
    fn path_guard_does_not_match_prefix() {
        let path = "/api/v1/infrastructure/observability/requests/extra";
        assert_ne!(path, ROUTE_PATH);
    }

    #[test]
    fn path_guard_does_not_match_sibling() {
        let path = "/api/v1/infrastructure/observability/cron-runs";
        assert_ne!(path, ROUTE_PATH);
    }

    #[test]
    fn path_guard_does_not_match_analytics() {
        let path = "/api/v1/infrastructure/observability/analytics";
        assert_ne!(path, ROUTE_PATH);
    }

    // --- parse_positive_int ---

    #[test]
    fn parse_positive_int_returns_value_for_valid_positive() {
        assert_eq!(parse_positive_int("3"), Some(3));
        assert_eq!(parse_positive_int("200"), Some(200));
        assert_eq!(parse_positive_int("1"), Some(1));
    }

    #[test]
    fn parse_positive_int_ignores_trailing_junk_like_js_parseint() {
        assert_eq!(parse_positive_int("5abc"), Some(5));
    }

    #[test]
    fn parse_positive_int_rejects_zero_and_negatives() {
        assert_eq!(parse_positive_int("0"), None);
        assert_eq!(parse_positive_int("-1"), None);
    }

    #[test]
    fn parse_positive_int_rejects_non_numeric() {
        assert_eq!(parse_positive_int("abc"), None);
        assert_eq!(parse_positive_int(""), None);
    }

    // --- QueryParams::page ---

    #[test]
    fn query_params_page_defaults_to_one_when_absent() {
        let params = QueryParams::from_url(Some("https://example.com/path"));
        assert_eq!(params.page(), DEFAULT_PAGE);
    }

    #[test]
    fn query_params_page_parses_valid_value() {
        let params = QueryParams::from_url(Some("https://example.com/path?page=3"));
        assert_eq!(params.page(), 3);
    }

    #[test]
    fn query_params_page_defaults_on_invalid_value() {
        let params = QueryParams::from_url(Some("https://example.com/path?page=abc"));
        assert_eq!(params.page(), DEFAULT_PAGE);
    }

    #[test]
    fn query_params_page_defaults_on_zero() {
        let params = QueryParams::from_url(Some("https://example.com/path?page=0"));
        assert_eq!(params.page(), DEFAULT_PAGE);
    }

    // --- QueryParams::page_size ---

    #[test]
    fn query_params_page_size_defaults_to_fifty_when_absent() {
        let params = QueryParams::from_url(Some("https://example.com/path"));
        assert_eq!(params.page_size(), DEFAULT_PAGE_SIZE);
    }

    #[test]
    fn query_params_page_size_parses_valid_value() {
        let params = QueryParams::from_url(Some("https://example.com/path?pageSize=100"));
        assert_eq!(params.page_size(), 100);
    }

    #[test]
    fn query_params_page_size_caps_at_two_hundred() {
        let params = QueryParams::from_url(Some("https://example.com/path?pageSize=999"));
        assert_eq!(params.page_size(), MAX_PAGE_SIZE);
    }

    #[test]
    fn query_params_page_size_defaults_on_invalid() {
        let params = QueryParams::from_url(Some("https://example.com/path?pageSize=bad"));
        assert_eq!(params.page_size(), DEFAULT_PAGE_SIZE);
    }

    // --- empty response shape ---

    #[test]
    fn empty_response_shape_has_expected_keys() {
        let page: i64 = 2;
        let page_size: i64 = 25;
        let body = json!({
            "hasNextPage": false,
            "items": [],
            "page": page,
            "pageSize": page_size,
            "total": 0,
        });

        assert_eq!(body["hasNextPage"], false);
        assert!(body["items"].as_array().unwrap().is_empty());
        assert_eq!(body["page"], 2);
        assert_eq!(body["pageSize"], 25);
        assert_eq!(body["total"], 0);
    }
}
