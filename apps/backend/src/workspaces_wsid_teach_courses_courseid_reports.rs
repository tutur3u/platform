//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/reports`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/reports/route.ts`.
//!
//! ## Auth
//!
//! The legacy route uses `requireTeachWorkspaceAccess` with permission
//! `view_user_groups_reports`. This handler reproduces that via
//! `workspace_permission_check::authorize_workspace_permission`.
//!
//! ## Query params
//!
//! - `limit` – integer, default 30, clamped to [1, 100].
//!
//! ## GET response shape
//!
//! ```json
//! { "data": [{ "id": "...", "title": "...", "content": "...",
//!              "feedback": "...", "score": null, "scores": null,
//!              "created_at": "...", "updated_at": "...",
//!              "user_id": "...", "report_approval_status": "...",
//!              "user_full_name": "...", "user_display_name": "...",
//!              "user_email": "...",
//!              "user": { "id": "...", "display_name": "...",
//!                        "full_name": "...", "email": "..." } }] }
//! ```
//!
//! ## Behavior gaps
//!
//! - `POST` is intentionally not migrated; `None` is returned so the worker
//!   falls through to the still-live Next.js route.
//! - The `private` schema is accessed via the `Accept-Profile: private` header
//!   on the PostgREST GET request, which is equivalent to
//!   `sbAdmin.schema('private')` in the legacy route.

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

const REPORTS_PERMISSION: &str = "view_user_groups_reports";
const PRIVATE_SCHEMA: &str = "private";
const COURSE_NOT_FOUND_MSG: &str = "Course not found";
const REPORTS_FETCH_ERROR_MSG: &str = "Error fetching reports";
const UNAUTHORIZED_MSG: &str = "Unauthorized";
const DEFAULT_LIMIT: i64 = 30;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 100;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_reports_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, course_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => reports_get_response(config, request, raw_ws_id, course_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn reports_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Parse query params.
    let limit = parse_limit(request.url);

    // 2. Authenticate and check workspace permission.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        REPORTS_PERMISSION,
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
            return message_response(500, REPORTS_FETCH_ERROR_MSG);
        }
    };

    let ws_id = &authorization.ws_id;

    // 3. Validate that the course exists in this workspace.
    match validate_course(&config.contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, COURSE_NOT_FOUND_MSG),
        Err(()) => return message_response(500, REPORTS_FETCH_ERROR_MSG),
    }

    // 4. Fetch reports from the private schema view.
    match fetch_reports(&config.contact_data, outbound, course_id, limit).await {
        Ok(data) => no_store_response(json_response(200, json!({ "data": data }))),
        Err(()) => message_response(500, REPORTS_FETCH_ERROR_MSG),
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

/// Fetches reports from the `private.external_user_monthly_reports_workspace_view`
/// view, filtered by `group_id = course_id`, ordered by `created_at desc`,
/// limited to `limit` rows.
///
/// Each row is mapped to include a `user` object mirroring the legacy `.map`
/// transform:
///
/// ```json
/// {
///   ...report,
///   "user": {
///     "display_name": report.user_display_name,
///     "email": report.user_email,
///     "full_name": report.user_full_name,
///     "id": report.user_id
///   }
/// }
/// ```
async fn fetch_reports(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    limit: i64,
) -> Result<Value, ()> {
    let select = "id,title,content,feedback,score,scores,created_at,updated_at,user_id,report_approval_status,user_full_name,user_display_name,user_email";

    let url = contact_data
        .rest_url(
            "external_user_monthly_reports_workspace_view",
            &[
                ("select", select.to_owned()),
                ("group_id", format!("eq.{course_id}")),
                ("order", "created_at.desc".to_owned()),
                ("limit", limit.to_string()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<ReportRow>>().map_err(|_| ())?;

    let data: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.id,
                "title": row.title,
                "content": row.content,
                "feedback": row.feedback,
                "score": row.score,
                "scores": row.scores,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
                "user_id": row.user_id,
                "report_approval_status": row.report_approval_status,
                "user_full_name": row.user_full_name,
                "user_display_name": row.user_display_name,
                "user_email": row.user_email,
                "user": {
                    "display_name": row.user_display_name,
                    "email": row.user_email,
                    "full_name": row.user_full_name,
                    "id": row.user_id,
                },
            })
        })
        .collect();

    Ok(Value::Array(data))
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, courseId)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/reports`.
///
/// Returns `None` when the path shape does not match this route.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // Expected: api / v1 / workspaces / :wsId / teach / courses / :courseId / reports
    //           [0]   [1]     [2]        [3]     [4]     [5]        [6]          [7]
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
        || segments[7] != "reports"
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
// Query param helpers
// ---------------------------------------------------------------------------

/// Parses the `limit` query parameter, defaulting to 30, clamped to [1, 100],
/// mirroring the legacy `Math.min(Math.max(parseInt(...) || 30, 1), 100)`.
fn parse_limit(url: Option<&str>) -> i64 {
    let raw = url
        .and_then(|raw| url::Url::parse(raw).ok())
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(k, _)| k == "limit")
                .map(|(_, v)| v.into_owned())
        });

    let parsed = raw
        .as_deref()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let value = if parsed == 0 { DEFAULT_LIMIT } else { parsed };
    value.clamp(MIN_LIMIT, MAX_LIMIT)
}

// ---------------------------------------------------------------------------
// Serde types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ReportRow {
    id: Option<String>,
    title: Option<String>,
    content: Option<String>,
    #[serde(default)]
    feedback: Value,
    #[serde(default)]
    score: Value,
    #[serde(default)]
    scores: Value,
    created_at: Option<String>,
    updated_at: Option<String>,
    user_id: Option<String>,
    report_approval_status: Option<String>,
    user_full_name: Option<String>,
    user_display_name: Option<String>,
    user_email: Option<String>,
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

    #[test]
    fn extract_valid_path() {
        let ws_id = "ws-abc-123";
        let course_id = "course-uuid-456";
        let path = format!("/api/v1/workspaces/{ws_id}/teach/courses/{course_id}/reports");
        let result = extract_path_params(&path);
        assert_eq!(result, Some((ws_id, course_id)));
    }

    #[test]
    fn extract_no_trailing_slash() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/reports";
        let (ws, course) = extract_path_params(path).expect("should match");
        assert_eq!(ws, "ws1");
        assert_eq!(course, "c1");
    }

    #[test]
    fn extract_wrong_suffix_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/members";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_missing_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/reports";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_wrong_prefix_returns_none() {
        let path = "/api/workspaces/ws1/teach/courses/c1/reports";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_extra_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/reports/extra";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_empty_ws_id_returns_none() {
        let path = "/api/v1/workspaces//teach/courses/c1/reports";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn parse_limit_default() {
        assert_eq!(parse_limit(None), DEFAULT_LIMIT);
        assert_eq!(
            parse_limit(Some("http://example.com/api?foo=bar")),
            DEFAULT_LIMIT
        );
    }

    #[test]
    fn parse_limit_explicit() {
        assert_eq!(parse_limit(Some("http://example.com/api?limit=50")), 50);
    }

    #[test]
    fn parse_limit_clamp_min() {
        assert_eq!(
            parse_limit(Some("http://example.com/api?limit=0")),
            DEFAULT_LIMIT
        );
    }

    #[test]
    fn parse_limit_clamp_negative() {
        // Negative values parse as-is then clamp to MIN_LIMIT.
        assert_eq!(
            parse_limit(Some("http://example.com/api?limit=-5")),
            MIN_LIMIT
        );
    }

    #[test]
    fn parse_limit_clamp_max() {
        assert_eq!(
            parse_limit(Some("http://example.com/api?limit=200")),
            MAX_LIMIT
        );
    }

    #[test]
    fn parse_limit_invalid_string_gives_default() {
        assert_eq!(
            parse_limit(Some("http://example.com/api?limit=abc")),
            DEFAULT_LIMIT
        );
    }

    #[test]
    fn report_row_deserializes() {
        let v: ReportRow = serde_json::from_str(
            r#"{
                "id": "r1",
                "title": "March Report",
                "content": "Good progress",
                "feedback": "Keep it up",
                "score": 8.5,
                "scores": [8, 9],
                "created_at": "2024-03-01T00:00:00Z",
                "updated_at": "2024-03-02T00:00:00Z",
                "user_id": "u1",
                "report_approval_status": "APPROVED",
                "user_full_name": "Alice Smith",
                "user_display_name": "Alice",
                "user_email": "alice@example.com"
            }"#,
        )
        .unwrap();
        assert_eq!(v.id.as_deref(), Some("r1"));
        assert_eq!(v.title.as_deref(), Some("March Report"));
        assert_eq!(v.user_full_name.as_deref(), Some("Alice Smith"));
        assert_eq!(v.report_approval_status.as_deref(), Some("APPROVED"));
    }

    #[test]
    fn report_row_user_object_shape() {
        let row = ReportRow {
            id: Some("r1".to_owned()),
            title: Some("T".to_owned()),
            content: Some("C".to_owned()),
            feedback: json!("F"),
            score: json!(null),
            scores: json!(null),
            created_at: Some("2024-01-01T00:00:00Z".to_owned()),
            updated_at: Some("2024-01-02T00:00:00Z".to_owned()),
            user_id: Some("u1".to_owned()),
            report_approval_status: Some("PENDING".to_owned()),
            user_full_name: Some("Alice Smith".to_owned()),
            user_display_name: Some("Alice".to_owned()),
            user_email: Some("alice@example.com".to_owned()),
        };

        let result = json!({
            "id": row.id,
            "user": {
                "display_name": row.user_display_name,
                "email": row.user_email,
                "full_name": row.user_full_name,
                "id": row.user_id,
            },
        });

        assert_eq!(result["user"]["display_name"], "Alice");
        assert_eq!(result["user"]["full_name"], "Alice Smith");
        assert_eq!(result["user"]["email"], "alice@example.com");
        assert_eq!(result["user"]["id"], "u1");
    }
}
