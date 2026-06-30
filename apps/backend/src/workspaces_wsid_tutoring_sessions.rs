//! Handler for `GET /api/v1/workspaces/:wsId/tutoring/sessions`.
//!
//! Ports the legacy Next.js route at:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tutoring/sessions/route.ts`
//!
//! ## GET behavior
//!
//! - Authenticates the caller, normalizes the workspace id, and requires the
//!   `view_user_groups` permission (404 when there is no workspace access, 403
//!   when the permission is missing).
//! - Validates the query string (400 on failure).
//! - Reads `private.workspace_tutoring_sessions` via the service-role client
//!   with an optional set of column filters and server-side pagination, using
//!   PostgREST `Range` + `Prefer: count=exact` to retrieve the total count.
//! - Resolves related groups (`public.workspace_user_groups`) and users
//!   (`public.workspace_users`) and inlines them into each session row.
//! - Returns `{ data, count, page, pageSize, totalPages }`.
//!
//! ## Behavior gaps vs legacy
//!
//! - `Prefer: count=exact` + `Content-Range` parsing replaces the Supabase
//!   JS client's built-in `count` option; the numeric total is extracted from
//!   the `Content-Range` response header (e.g. `0-19/57` → 57).
//! - POST (and all other methods) return `None` so the worker falls through to
//!   the still-live Next.js route.

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/tutoring/sessions";
const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const PRIVATE_SCHEMA: &str = "private";
const TUTORING_SESSIONS_TABLE: &str = "workspace_tutoring_sessions";
const GROUPS_TABLE: &str = "workspace_user_groups";
const USERS_TABLE: &str = "workspace_users";

const SESSION_SELECT: &str = "id,ws_id,group_id,student_user_id,teacher_user_id,\
     session_date,start_time,duration_minutes,reason_type,reason_detail,content,\
     attendance_status,parent_message_preview,source_feedback_id,resolved_at,\
     created_by,created_at,updated_at";

const DEFAULT_PAGE: u32 = 1;
const DEFAULT_PAGE_SIZE: u32 = 20;
const MAX_PAGE_SIZE: u32 = 100;

const NOT_FOUND_MSG: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MSG: &str = "Insufficient permissions";
const INVALID_QUERY_MSG: &str = "Invalid query";
const FAILED_MSG: &str = "Failed to list sessions";

// ---------------------------------------------------------------------------
// Query parameter struct
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct SessionListQuery {
    from_date: Option<String>,
    to_date: Option<String>,
    teacher_id: Option<String>,
    group_id: Option<String>,
    student_user_id: Option<String>,
    reason_type: Option<String>,
    attendance_status: Option<String>,
    page: u32,
    page_size: u32,
}

#[derive(Debug)]
#[allow(clippy::enum_variant_names)]
enum QueryParseError {
    InvalidUuid(&'static str),
    InvalidDate(&'static str),
    InvalidReasonType,
    InvalidAttendanceStatus,
    InvalidPage,
    InvalidPageSize,
}

// ---------------------------------------------------------------------------
// Supabase row shapes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TutoringSessionRow {
    id: Option<Value>,
    ws_id: Option<Value>,
    group_id: Option<String>,
    student_user_id: Option<String>,
    teacher_user_id: Option<String>,
    session_date: Option<Value>,
    start_time: Option<Value>,
    duration_minutes: Option<Value>,
    reason_type: Option<Value>,
    reason_detail: Option<Value>,
    content: Option<Value>,
    attendance_status: Option<Value>,
    parent_message_preview: Option<Value>,
    source_feedback_id: Option<Value>,
    resolved_at: Option<Value>,
    created_by: Option<Value>,
    created_at: Option<Value>,
    updated_at: Option<Value>,
}

#[derive(Deserialize)]
struct GroupRow {
    id: Option<String>,
    name: Option<Value>,
}

#[derive(Deserialize)]
struct UserRow {
    id: Option<String>,
    full_name: Option<Value>,
    display_name: Option<Value>,
    email: Option<Value>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_tutoring_sessions_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tutoring_sessions_get(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn tutoring_sessions_get(
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
        VIEW_USER_GROUPS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return error_response(403, INSUFFICIENT_PERMISSIONS_MSG);
        }
        Err(
            WorkspacePermissionAuthorizationError::NotFound
            | WorkspacePermissionAuthorizationError::Unauthorized,
        ) => {
            return error_response(404, NOT_FOUND_MSG);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, FAILED_MSG);
        }
    };
    let ws_id = authorization.ws_id;

    let query = match parse_query(request.url) {
        Ok(q) => q,
        Err(e) => return invalid_query_response(e),
    };

    // -----------------------------------------------------------------------
    // Fetch sessions (private schema, service-role)
    // -----------------------------------------------------------------------

    let from = (query.page - 1) * query.page_size;
    let to = from + query.page_size - 1;
    let range_value = format!("{from}-{to}");

    let mut params: Vec<(&str, String)> = vec![
        ("select", SESSION_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "session_date.desc,start_time.desc".to_owned()),
    ];
    if let Some(from_date) = &query.from_date {
        params.push(("session_date", format!("gte.{from_date}")));
    }
    if let Some(to_date) = &query.to_date {
        params.push(("session_date", format!("lte.{to_date}")));
    }
    if let Some(teacher_id) = &query.teacher_id {
        params.push(("teacher_user_id", format!("eq.{teacher_id}")));
    }
    if let Some(group_id) = &query.group_id {
        params.push(("group_id", format!("eq.{group_id}")));
    }
    if let Some(student_user_id) = &query.student_user_id {
        params.push(("student_user_id", format!("eq.{student_user_id}")));
    }
    if let Some(reason_type) = &query.reason_type {
        params.push(("reason_type", format!("eq.{reason_type}")));
    }
    if let Some(attendance_status) = &query.attendance_status {
        params.push(("attendance_status", format!("eq.{attendance_status}")));
    }

    let Some(url) = contact_data.rest_url(TUTORING_SESSIONS_TABLE, &params) else {
        return error_response(500, FAILED_MSG);
    };

    let session_response = match send_service_role_get(
        contact_data,
        outbound,
        &url,
        Some(PRIVATE_SCHEMA),
        Some(&range_value),
    )
    .await
    {
        Ok(r) => r,
        Err(()) => return error_response(500, FAILED_MSG),
    };

    if !is_success(session_response.status) {
        return error_response(500, FAILED_MSG);
    }

    let count = parse_content_range_count(session_response.header("Content-Range"));

    let sessions: Vec<TutoringSessionRow> = match session_response.json() {
        Ok(rows) => rows,
        Err(_) => return error_response(500, FAILED_MSG),
    };

    // -----------------------------------------------------------------------
    // Fetch related groups and users
    // -----------------------------------------------------------------------

    let group_ids: Vec<String> = {
        let mut ids: Vec<String> = sessions.iter().filter_map(|s| s.group_id.clone()).collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    };

    let user_ids: Vec<String> = {
        let mut ids: Vec<String> = sessions
            .iter()
            .flat_map(|s| {
                [s.student_user_id.clone(), s.teacher_user_id.clone()]
                    .into_iter()
                    .flatten()
            })
            .collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    };

    let groups = if group_ids.is_empty() {
        Vec::new()
    } else {
        let group_in = format!("in.({})", group_ids.join(","));
        let group_params: Vec<(&str, String)> =
            vec![("select", "id,name".to_owned()), ("id", group_in)];
        let Some(group_url) = contact_data.rest_url(GROUPS_TABLE, &group_params) else {
            return error_response(500, FAILED_MSG);
        };
        let r = match send_service_role_get(contact_data, outbound, &group_url, None, None).await {
            Ok(r) => r,
            Err(()) => return error_response(500, FAILED_MSG),
        };
        if !is_success(r.status) {
            return error_response(500, FAILED_MSG);
        }
        match r.json::<Vec<GroupRow>>() {
            Ok(rows) => rows,
            Err(_) => return error_response(500, FAILED_MSG),
        }
    };

    let users = if user_ids.is_empty() {
        Vec::new()
    } else {
        let user_in = format!("in.({})", user_ids.join(","));
        let user_params: Vec<(&str, String)> = vec![
            ("select", "id,full_name,display_name,email".to_owned()),
            ("id", user_in),
        ];
        let Some(user_url) = contact_data.rest_url(USERS_TABLE, &user_params) else {
            return error_response(500, FAILED_MSG);
        };
        let r = match send_service_role_get(contact_data, outbound, &user_url, None, None).await {
            Ok(r) => r,
            Err(()) => return error_response(500, FAILED_MSG),
        };
        if !is_success(r.status) {
            return error_response(500, FAILED_MSG);
        }
        match r.json::<Vec<UserRow>>() {
            Ok(rows) => rows,
            Err(_) => return error_response(500, FAILED_MSG),
        }
    };

    // -----------------------------------------------------------------------
    // Build enriched response
    // -----------------------------------------------------------------------

    let data: Vec<Value> = sessions
        .iter()
        .map(|session| {
            let group = session
                .group_id
                .as_deref()
                .and_then(|gid| groups.iter().find(|g| g.id.as_deref() == Some(gid)))
                .map(|g| json!({ "id": g.id, "name": g.name }));

            let student = session
                .student_user_id
                .as_deref()
                .and_then(|uid| users.iter().find(|u| u.id.as_deref() == Some(uid)))
                .map(|u| {
                    json!({
                        "id": u.id,
                        "full_name": u.full_name,
                        "display_name": u.display_name,
                        "email": u.email,
                    })
                });

            let teacher = session
                .teacher_user_id
                .as_deref()
                .and_then(|uid| users.iter().find(|u| u.id.as_deref() == Some(uid)))
                .map(|u| {
                    json!({
                        "id": u.id,
                        "full_name": u.full_name,
                        "display_name": u.display_name,
                        "email": u.email,
                    })
                });

            json!({
                "id": session.id,
                "ws_id": session.ws_id,
                "group_id": session.group_id,
                "student_user_id": session.student_user_id,
                "teacher_user_id": session.teacher_user_id,
                "session_date": session.session_date,
                "start_time": session.start_time,
                "duration_minutes": session.duration_minutes,
                "reason_type": session.reason_type,
                "reason_detail": session.reason_detail,
                "content": session.content,
                "attendance_status": session.attendance_status,
                "parent_message_preview": session.parent_message_preview,
                "source_feedback_id": session.source_feedback_id,
                "resolved_at": session.resolved_at,
                "created_by": session.created_by,
                "created_at": session.created_at,
                "updated_at": session.updated_at,
                "group": group,
                "student": student,
                "teacher": teacher,
            })
        })
        .collect();

    let page = query.page;
    let page_size = query.page_size;
    let total_pages = ((count as u32).div_ceil(page_size)).max(1);

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "count": count,
            "page": page,
            "pageSize": page_size,
            "totalPages": total_pages,
        }),
    ))
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema: Option<&str>,
    range: Option<&str>,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(schema) = schema {
        req = req
            .with_header("Accept-Profile", schema)
            .with_header("Content-Profile", schema)
            .with_header("Prefer", "count=exact");
    }

    if let Some(range) = range {
        req = req
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }

    outbound.send(req).await.map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

// ---------------------------------------------------------------------------
// Content-Range parsing: "0-19/57" → 57
// ---------------------------------------------------------------------------

fn parse_content_range_count(header: Option<&str>) -> u64 {
    let Some(value) = header else {
        return 0;
    };
    // Format: "<range>/<total>" or "*/<total>"
    value
        .rsplit_once('/')
        .and_then(|(_, total)| total.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

fn parse_query(request_url: Option<&str>) -> Result<SessionListQuery, QueryParseError> {
    let mut query = SessionListQuery {
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
        ..SessionListQuery::default()
    };

    let Some(parsed) = request_url.and_then(|u| url::Url::parse(u).ok()) else {
        return Ok(query);
    };

    for (key, value) in parsed.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "fromDate" => {
                let v = value.trim();
                if v.is_empty() {
                    continue;
                }
                if !is_date_str(v) {
                    return Err(QueryParseError::InvalidDate("fromDate"));
                }
                query.from_date = Some(v.to_owned());
            }
            "toDate" => {
                let v = value.trim();
                if v.is_empty() {
                    continue;
                }
                if !is_date_str(v) {
                    return Err(QueryParseError::InvalidDate("toDate"));
                }
                query.to_date = Some(v.to_owned());
            }
            "teacherId" => {
                let v = value.trim();
                if v.is_empty() {
                    continue;
                }
                if !is_uuid(v) {
                    return Err(QueryParseError::InvalidUuid("teacherId"));
                }
                query.teacher_id = Some(v.to_owned());
            }
            "groupId" => {
                let v = value.trim();
                if v.is_empty() {
                    continue;
                }
                if !is_uuid(v) {
                    return Err(QueryParseError::InvalidUuid("groupId"));
                }
                query.group_id = Some(v.to_owned());
            }
            "studentUserId" => {
                let v = value.trim();
                if v.is_empty() {
                    continue;
                }
                if !is_uuid(v) {
                    return Err(QueryParseError::InvalidUuid("studentUserId"));
                }
                query.student_user_id = Some(v.to_owned());
            }
            "reasonType" => {
                if value.is_empty() {
                    continue;
                }
                if !matches!(
                    value.as_str(),
                    "ABSENT_RECOVERY" | "WEAK_SUPPORT" | "CUSTOM"
                ) {
                    return Err(QueryParseError::InvalidReasonType);
                }
                query.reason_type = Some(value);
            }
            "attendanceStatus" => {
                if value.is_empty() {
                    continue;
                }
                if !matches!(value.as_str(), "PENDING" | "DONE" | "NO_SHOW" | "CANCELLED") {
                    return Err(QueryParseError::InvalidAttendanceStatus);
                }
                query.attendance_status = Some(value);
            }
            "page" => {
                query.page = parse_int_min(&value, 1).ok_or(QueryParseError::InvalidPage)?;
            }
            "pageSize" => {
                let ps = parse_int_min(&value, 1).ok_or(QueryParseError::InvalidPageSize)?;
                if ps > MAX_PAGE_SIZE {
                    return Err(QueryParseError::InvalidPageSize);
                }
                query.page_size = ps;
            }
            _ => {}
        }
    }

    Ok(query)
}

fn parse_int_min(value: &str, min: u32) -> Option<u32> {
    let parsed = value.trim().parse::<i64>().ok()?;
    if parsed < min as i64 {
        return None;
    }
    u32::try_from(parsed).ok()
}

fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(i, b)| match i {
        8 | 13 | 18 | 23 => *b == b'-',
        _ => b.is_ascii_hexdigit(),
    })
}

/// Validates that a string looks like a calendar date (`YYYY-MM-DD`).
fn is_date_str(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[8..].iter().all(u8::is_ascii_digit)
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

fn extract_ws_id(path: &str) -> Option<&str> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let ws_id = rest.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn invalid_query_response(error: QueryParseError) -> BackendResponse {
    let issue = match error {
        QueryParseError::InvalidUuid(field) => {
            json!({ "path": [field], "message": "Invalid uuid" })
        }
        QueryParseError::InvalidDate(field) => {
            json!({ "path": [field], "message": "Invalid date" })
        }
        QueryParseError::InvalidReasonType => {
            json!({ "path": ["reasonType"], "message": "Invalid enum value" })
        }
        QueryParseError::InvalidAttendanceStatus => {
            json!({ "path": ["attendanceStatus"], "message": "Invalid enum value" })
        }
        QueryParseError::InvalidPage => {
            json!({ "path": ["page"], "message": "Invalid input" })
        }
        QueryParseError::InvalidPageSize => {
            json!({ "path": ["pageSize"], "message": "Invalid input" })
        }
    };

    no_store_response(json_response(
        400,
        json!({ "message": INVALID_QUERY_MSG, "issues": [issue] }),
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- path extraction ---

    #[test]
    fn extracts_ws_id_from_valid_path() {
        let ws_id = extract_ws_id("/api/v1/workspaces/abc-123/tutoring/sessions");
        assert_eq!(ws_id, Some("abc-123"));
    }

    #[test]
    fn returns_none_for_wrong_prefix() {
        assert!(extract_ws_id("/api/v2/workspaces/abc-123/tutoring/sessions").is_none());
    }

    #[test]
    fn returns_none_for_wrong_suffix() {
        assert!(extract_ws_id("/api/v1/workspaces/abc-123/tutoring/queue").is_none());
    }

    #[test]
    fn returns_none_for_extra_segment() {
        assert!(extract_ws_id("/api/v1/workspaces/abc/extra/tutoring/sessions").is_none());
    }

    #[test]
    fn returns_none_for_empty_ws_id() {
        assert!(extract_ws_id("/api/v1/workspaces//tutoring/sessions").is_none());
    }

    // --- Content-Range parsing ---

    #[test]
    fn parses_content_range_count() {
        assert_eq!(parse_content_range_count(Some("0-19/57")), 57);
        assert_eq!(parse_content_range_count(Some("*/100")), 100);
        assert_eq!(parse_content_range_count(Some("0-0/1")), 1);
        assert_eq!(parse_content_range_count(None), 0);
        assert_eq!(parse_content_range_count(Some("garbage")), 0);
    }

    // --- UUID validation ---

    #[test]
    fn accepts_valid_uuid() {
        assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn rejects_short_uuid() {
        assert!(!is_uuid("550e8400-e29b-41d4-a716"));
    }

    // --- date validation ---

    #[test]
    fn accepts_valid_date() {
        assert!(is_date_str("2025-01-15"));
    }

    #[test]
    fn rejects_invalid_date_format() {
        assert!(!is_date_str("25-01-15"));
        assert!(!is_date_str("2025/01/15"));
        assert!(!is_date_str("not-a-date"));
    }

    // --- int parsing ---

    #[test]
    fn parse_int_min_rejects_below_minimum() {
        assert!(parse_int_min("0", 1).is_none());
    }

    #[test]
    fn parse_int_min_accepts_valid() {
        assert_eq!(parse_int_min("5", 1), Some(5));
    }

    // --- query parsing ---

    #[test]
    fn parse_query_defaults() {
        let q = parse_query(None).unwrap();
        assert_eq!(q.page, 1);
        assert_eq!(q.page_size, 20);
        assert!(q.from_date.is_none());
    }

    #[test]
    fn parse_query_with_filters() {
        let q = parse_query(Some(
            "https://example.com/api/v1/workspaces/ws/tutoring/sessions\
             ?fromDate=2025-01-01&toDate=2025-06-30\
             &reasonType=ABSENT_RECOVERY&attendanceStatus=DONE\
             &page=2&pageSize=10",
        ))
        .unwrap();
        assert_eq!(q.from_date.as_deref(), Some("2025-01-01"));
        assert_eq!(q.to_date.as_deref(), Some("2025-06-30"));
        assert_eq!(q.reason_type.as_deref(), Some("ABSENT_RECOVERY"));
        assert_eq!(q.attendance_status.as_deref(), Some("DONE"));
        assert_eq!(q.page, 2);
        assert_eq!(q.page_size, 10);
    }

    #[test]
    fn parse_query_rejects_invalid_reason_type() {
        let result = parse_query(Some("https://example.com/?reasonType=UNKNOWN"));
        assert!(matches!(result, Err(QueryParseError::InvalidReasonType)));
    }

    #[test]
    fn parse_query_rejects_page_size_over_max() {
        let result = parse_query(Some("https://example.com/?pageSize=101"));
        assert!(matches!(result, Err(QueryParseError::InvalidPageSize)));
    }
}
