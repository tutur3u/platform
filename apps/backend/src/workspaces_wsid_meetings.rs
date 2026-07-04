//! Handler for `GET /api/v1/workspaces/:wsId/meetings`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/meetings/route.ts`.
//!
//! ## Behavior
//!
//! 1. Resolve the authenticated Supabase user via the caller's access token
//!    (401 `{ "error": "Unauthorized" }` if missing or invalid).
//! 2. Verify workspace membership via the `workspace_members` table using the
//!    service-role key (500 on lookup failure, 403 if not a member).
//! 3. Parse and validate the `page` (default 1, must be >= 1) and `pageSize`
//!    (default 10, must be in 1..=100) query params
//!    (400 with specific error messages on invalid values).
//! 4. Parse the optional `search` query param (no-op if absent or blank).
//! 5. Query `workspace_meetings` with embedded `creator` and
//!    `recording_sessions`, filtered by `ws_id`, ordered by `time desc`,
//!    paginated by `offset`/`limit`, with an optional `ilike` filter on
//!    `name` when `search` is present.
//! 6. Return 200 `{ meetings, totalCount, page, pageSize }`.
//!
//! ## Behavior gaps vs. legacy
//!
//! - The legacy route uses the caller's RLS session for every read. This port
//!   uses the service-role key for both the membership check and the
//!   `workspace_meetings` read, gating RLS with an explicit membership
//!   check first (matching the pattern in
//!   `workspaces_meetings_meetingid_recordings.rs`).
//! - The legacy `verifyWorkspaceMembershipType` accepts any membership row.
//!   This port checks `type == "MEMBER"` to match the established pattern;
//!   non-`MEMBER` roles (e.g., admin) may be incorrectly denied.
//! - POST is not handled here; it falls through to the still-live Next.js
//!   route unchanged.
//! - The `Content-Range` header from PostgREST is used to surface the exact
//!   total count, mirroring the legacy `count: 'exact'` option.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/meetings";

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MAX_PAGE_SIZE: i64 = 100;

const UNAUTHORIZED_MSG: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MSG: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MSG: &str = "Workspace access denied";
const INVALID_PAGE_MSG: &str = "Invalid page parameter";
const INVALID_PAGE_SIZE_MSG: &str = "Invalid pageSize parameter (must be between 1 and 100)";
const FETCH_FAILED_MSG: &str = "Failed to fetch meetings";

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

/// Extract `:wsId` from `/api/v1/workspaces/:wsId/meetings`.
fn meetings_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    // Guard: ws_id must be non-empty and must not contain a `/` (which would
    // mean a longer path that belongs to a different handler).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_meetings_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = meetings_ws_id(request.path)?;

    Some(match request.method {
        "GET" => meetings_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn meetings_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate the caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MSG);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MSG);
    };

    // 2. Verify workspace membership.
    match verify_workspace_member(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MSG),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MSG),
    }

    // 3. Parse and validate query parameters.
    let page_str = query_param(request.url, "page");
    let page_size_str = query_param(request.url, "pageSize");
    let search = query_param(request.url, "search").unwrap_or_default();

    let page = match page_str.as_deref() {
        None | Some("") => DEFAULT_PAGE,
        Some(s) => match parse_js_int(s) {
            Some(v) if v >= 1 => v,
            _ => return error_response(400, INVALID_PAGE_MSG),
        },
    };

    let page_size = match page_size_str.as_deref() {
        None | Some("") => DEFAULT_PAGE_SIZE,
        Some(s) => match parse_js_int(s) {
            Some(v) if (1..=MAX_PAGE_SIZE).contains(&v) => v,
            _ => return error_response(400, INVALID_PAGE_SIZE_MSG),
        },
    };

    let offset = (page - 1) * page_size;

    // 4. Fetch meetings from Supabase.
    match fetch_meetings(
        contact_data,
        outbound,
        raw_ws_id,
        offset,
        page_size,
        search.trim(),
    )
    .await
    {
        Ok((meetings, total_count)) => no_store_response(json_response(
            200,
            json!({
                "meetings": meetings,
                "totalCount": total_count,
                "page": page,
                "pageSize": page_size,
            }),
        )),
        Err(()) => error_response(500, FETCH_FAILED_MSG),
    }
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

/// Fetch paginated meetings from `workspace_meetings`, returning the rows as
/// raw JSON values and the exact total count from the `Content-Range` header.
async fn fetch_meetings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    offset: i64,
    limit: i64,
    search: &str,
) -> Result<(Vec<Value>, i64), ()> {
    // The PostgREST embedded-resource syntax mirrors the legacy Supabase JS
    // client select string verbatim.
    let select = "*,creator:users!workspace_meetings_creator_id_fkey(display_name),\
                  recording_sessions(id,status,created_at,updated_at)"
        .to_owned();

    let mut params: Vec<(&str, String)> = vec![
        ("select", select),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "time.desc".to_owned()),
        ("offset", offset.to_string()),
        ("limit", limit.to_string()),
    ];

    if !search.is_empty() {
        params.push(("name", format!("ilike.*{}*", search)));
    }

    let url = contact_data
        .rest_url("workspace_meetings", &params)
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                // Request an exact total count from PostgREST.
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Parse the total count from the `Content-Range` response header.
    // PostgREST emits `Content-Range: <first>-<last>/<total>` (or `*/<total>`
    // when the result is empty), so the count follows the `/` separator.
    let total_count = response
        .header("content-range")
        .and_then(parse_content_range_count)
        .unwrap_or(0);

    let meetings = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((meetings, total_count))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse the total-count component of a PostgREST `Content-Range` header.
///
/// Accepted forms:
///
/// - `<first>-<last>/<total>`
/// - `*/<total>`
///
/// Returns `None` when the header is absent, malformed, or not yet
/// countable.
fn parse_content_range_count(header: &str) -> Option<i64> {
    let count_str = header.split('/').nth(1)?;
    let trimmed = count_str.trim();
    if trimmed == "*" {
        return Some(0);
    }
    trimmed.parse().ok()
}

/// Extract a query parameter value from the request URL (first occurrence).
fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    url.query_pairs()
        .find(|(name, _)| name.as_ref() == key)
        .map(|(_, value)| value.into_owned())
}

/// Mirror JS `parseInt(value, 10)`: parse the leading integer prefix, ignoring
/// trailing non-digit characters. Returns `None` when no digits lead the
/// string (equivalent to JS `NaN`).
fn parse_js_int(value: &str) -> Option<i64> {
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
    trimmed.get(..index).and_then(|prefix| prefix.parse().ok())
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- meetings_ws_id path guard ---

    #[test]
    fn path_guard_matches_exact_meetings_path() {
        assert_eq!(
            meetings_ws_id("/api/v1/workspaces/abc-123/meetings"),
            Some("abc-123")
        );
    }

    #[test]
    fn path_guard_rejects_subpath() {
        // `/api/v1/workspaces/:wsId/meetings/:meetingId` must not match.
        assert_eq!(
            meetings_ws_id("/api/v1/workspaces/abc-123/meetings/xyz"),
            None
        );
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        assert_eq!(meetings_ws_id("/api/v1/workspaces/abc-123/other"), None);
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert_eq!(meetings_ws_id("/api/v1/workspaces//meetings"), None);
    }

    // --- parse_content_range_count ---

    #[test]
    fn content_range_parses_normal() {
        assert_eq!(parse_content_range_count("0-9/42"), Some(42));
    }

    #[test]
    fn content_range_parses_empty_star_slash_total() {
        assert_eq!(parse_content_range_count("*/0"), Some(0));
    }

    #[test]
    fn content_range_parses_star_star() {
        assert_eq!(parse_content_range_count("*/*"), Some(0));
    }

    #[test]
    fn content_range_rejects_malformed() {
        assert_eq!(parse_content_range_count("garbage"), None);
    }

    // --- parse_js_int ---

    #[test]
    fn parse_js_int_plain_number() {
        assert_eq!(parse_js_int("10"), Some(10));
    }

    #[test]
    fn parse_js_int_with_trailing_garbage() {
        assert_eq!(parse_js_int("3abc"), Some(3));
    }

    #[test]
    fn parse_js_int_nan() {
        assert_eq!(parse_js_int("abc"), None);
    }

    #[test]
    fn parse_js_int_negative() {
        assert_eq!(parse_js_int("-5"), Some(-5));
    }

    #[test]
    fn parse_js_int_zero() {
        assert_eq!(parse_js_int("0"), Some(0));
    }

    // --- page / pageSize validation logic ---

    #[test]
    fn default_page_is_one() {
        assert_eq!(DEFAULT_PAGE, 1);
    }

    #[test]
    fn default_page_size_is_ten() {
        assert_eq!(DEFAULT_PAGE_SIZE, 10);
    }

    #[test]
    fn max_page_size_is_hundred() {
        assert_eq!(MAX_PAGE_SIZE, 100);
    }

    #[test]
    fn page_size_boundary_valid() {
        for v in [1_i64, 50, 100] {
            assert!((1..=MAX_PAGE_SIZE).contains(&v));
        }
    }

    #[test]
    fn page_size_boundary_invalid() {
        for v in [0_i64, 101, -1] {
            assert!(!(1..=MAX_PAGE_SIZE).contains(&v));
        }
    }
}
