//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/posts`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/posts/route.ts`.
//!
//! ## Auth
//!
//! The legacy route uses `requireTeachWorkspaceAccess` with permission
//! `view_user_groups_posts`. This handler reproduces that via
//! `workspace_permission_check::authorize_workspace_permission`.
//!
//! ## GET query params
//!
//! - `limit` – integer 1–100, default 20 (same clamping as legacy).
//! - `cursor` – ISO timestamp; when provided only rows with
//!   `created_at < cursor` are returned (cursor-based pagination).
//!
//! ## GET response shape
//!
//! ```json
//! { "count": 42, "data": [...], "nextCursor": "2024-01-01T00:00:00Z" }
//! ```
//!
//! `count` is the total matching row count (from `Content-Range`).
//! `nextCursor` is the `created_at` of the last returned row when
//! `data.length === limit`, otherwise `null`.
//!
//! ## Behavior gaps
//!
//! - `POST` is intentionally not migrated; `None` is returned so the worker
//!   falls through to the still-live Next.js route.
//! - The legacy route reads from the `private` Supabase schema via the
//!   admin (service-role) client. This handler reproduces that by adding the
//!   `Accept-Profile: private` header to the PostgREST request.
//! - The legacy `validateTeachCourse` helper checks `workspace_user_groups`
//!   with the admin client. This handler replicates that directly.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PERMISSION: &str = "view_user_groups_posts";
const PRIVATE_SCHEMA: &str = "private";
const COURSE_NOT_FOUND_MSG: &str = "Course not found";
const POSTS_FETCH_ERROR_MSG: &str = "Error fetching posts";
const UNAUTHORIZED_MSG: &str = "Unauthorized";

const DEFAULT_LIMIT: i64 = 20;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 100;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_posts_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, course_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => posts_get_response(config, request, raw_ws_id, course_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn posts_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Authenticate and check workspace permission.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MSG);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MSG);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, POSTS_FETCH_ERROR_MSG);
        }
    };

    let ws_id = &authorization.ws_id;

    // 2. Validate that the course (workspace_user_group) exists in this workspace.
    match validate_course(&config.contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, COURSE_NOT_FOUND_MSG),
        Err(()) => return message_response(500, POSTS_FETCH_ERROR_MSG),
    }

    // 3. Parse pagination query params.
    let (limit, cursor) = parse_query_params(request.url);

    // 4. Fetch posts from the private schema.
    match fetch_posts(
        &config.contact_data,
        outbound,
        course_id,
        limit,
        cursor.as_deref(),
    )
    .await
    {
        Ok((count, data)) => {
            // Mirror: nextCursor = posts.length === limit ? posts[last]?.created_at ?? null : null
            let next_cursor: Value = if data.len() as i64 == limit {
                data.last()
                    .and_then(|row| row.get("created_at"))
                    .cloned()
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            };

            no_store_response(json_response(
                200,
                json!({
                    "count": count,
                    "data": data,
                    "nextCursor": next_cursor,
                }),
            ))
        }
        Err(()) => message_response(500, POSTS_FETCH_ERROR_MSG),
    }
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Checks that a `workspace_user_groups` row with `id = course_id` and
/// `ws_id = ws_id` exists, mirroring `validateTeachCourse` in the legacy route.
async fn validate_course(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    course_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{course_id}")),
                ("ws_id", format!("eq.{ws_id}")),
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

    let rows = response.json::<Value>().map_err(|_| ())?;
    Ok(rows.as_array().is_some_and(|arr| !arr.is_empty()))
}

/// Fetches posts from the `private.user_group_posts` table.
///
/// Returns `(total_count, rows)`.  The `total_count` comes from the PostgREST
/// `Content-Range` response header (set when `Prefer: count=exact` is sent).
async fn fetch_posts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    limit: i64,
    cursor: Option<&str>,
) -> Result<(i64, Vec<Value>), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("group_id", format!("eq.{course_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", limit.to_string()),
    ];

    if let Some(cursor_val) = cursor {
        params.push(("created_at", format!("lt.{cursor_val}")));
    }

    let url = contact_data
        .rest_url("user_group_posts", &params)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                // Request exact total count; PostgREST returns it in Content-Range.
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // PostgREST sets `Content-Range: <start>-<end>/<total>` (or `*/<total>`
    // when the result set is empty). Mirror legacy `count ?? 0`.
    let count: i64 = response
        .header("Content-Range")
        .and_then(|h| h.split('/').nth(1))
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(0);

    let data: Vec<Value> = response
        .json::<Option<Vec<Value>>>()
        .map_err(|_| ())?
        .unwrap_or_default();

    Ok((count, data))
}

// ---------------------------------------------------------------------------
// Query param parsing
// ---------------------------------------------------------------------------

/// Parses `limit` and `cursor` from the request URL.
///
/// `limit` mirrors the legacy JS logic:
///
/// - Parse as integer; if missing, unparseable, or zero, default to 20.
/// - Clamp to \[1, 100\].
///
/// `cursor` is the raw string value of the `cursor` query param.
fn parse_query_params(url: Option<&str>) -> (i64, Option<String>) {
    let mut raw_limit: Option<i64> = None;
    let mut cursor: Option<String> = None;

    if let Some(parsed) = url.and_then(|raw| url::Url::parse(raw).ok()) {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "limit" => raw_limit = value.parse::<i64>().ok(),
                "cursor" if !value.is_empty() => {
                    cursor = Some(value.into_owned());
                }
                _ => {}
            }
        }
    }

    // Mirror: `parseInt(raw) || 20` (0 and NaN both fall back to default).
    let limit = match raw_limit {
        Some(n) if n != 0 => n.clamp(MIN_LIMIT, MAX_LIMIT),
        _ => DEFAULT_LIMIT,
    };

    (limit, cursor)
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, courseId)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/posts`.
///
/// Returns `None` when the path shape does not match this route.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // Expected: api / v1 / workspaces / :wsId / teach / courses / :courseId / posts
    //           [0]   [1]     [2]        [3]     [4]     [5]        [6]        [7]
    if segments.len() != 8 {
        return None;
    }

    let ws_id = segments.get(3)?;
    let course_id = segments.get(6)?;

    if segments[0] != "api"
        || segments[1] != "v1"
        || segments[2] != "workspaces"
        || ws_id.is_empty()
        || segments[4] != "teach"
        || segments[5] != "courses"
        || course_id.is_empty()
        || segments[7] != "posts"
    {
        return None;
    }

    Some((ws_id, course_id))
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- extract_path_params ---

    #[test]
    fn extract_valid_path() {
        let ws_id = "ws-abc-123";
        let course_id = "course-uuid-456";
        let path = format!("/api/v1/workspaces/{ws_id}/teach/courses/{course_id}/posts");
        assert_eq!(extract_path_params(&path), Some((ws_id, course_id)));
    }

    #[test]
    fn extract_mismatched_paths_return_none() {
        // Wrong terminal segment.
        assert!(extract_path_params("/api/v1/workspaces/ws1/teach/courses/c1/members").is_none());
        // Missing courseId segment.
        assert!(extract_path_params("/api/v1/workspaces/ws1/teach/courses/posts").is_none());
        // Wrong API prefix.
        assert!(extract_path_params("/api/workspaces/ws1/teach/courses/c1/posts").is_none());
        // Extra trailing segment.
        assert!(
            extract_path_params("/api/v1/workspaces/ws1/teach/courses/c1/posts/extra").is_none()
        );
    }

    // --- parse_query_params ---

    #[test]
    fn parse_query_defaults_and_no_url() {
        assert_eq!(parse_query_params(None), (DEFAULT_LIMIT, None));
        assert_eq!(
            parse_query_params(Some("http://example.com/api?")),
            (DEFAULT_LIMIT, None)
        );
    }

    #[test]
    fn parse_query_limit_clamping() {
        // Custom limit within range.
        assert_eq!(
            parse_query_params(Some("http://example.com/api?limit=50")),
            (50, None)
        );
        // Over max -> clamped.
        assert_eq!(
            parse_query_params(Some("http://example.com/api?limit=200")).0,
            MAX_LIMIT
        );
        // Under min -> clamped.
        assert_eq!(
            parse_query_params(Some("http://example.com/api?limit=-5")).0,
            MIN_LIMIT
        );
        // Zero and invalid -> default.
        assert_eq!(
            parse_query_params(Some("http://example.com/api?limit=0")).0,
            DEFAULT_LIMIT
        );
        assert_eq!(
            parse_query_params(Some("http://example.com/api?limit=abc")).0,
            DEFAULT_LIMIT
        );
    }

    #[test]
    fn parse_query_cursor() {
        let (limit, cursor) = parse_query_params(Some(
            "http://example.com/api?limit=10&cursor=2024-01-15T12:00:00Z",
        ));
        assert_eq!(limit, 10);
        assert_eq!(cursor.as_deref(), Some("2024-01-15T12:00:00Z"));
        // Empty cursor is ignored.
        let (_, empty_cursor) = parse_query_params(Some("http://example.com/api?cursor="));
        assert!(empty_cursor.is_none());
    }
}
