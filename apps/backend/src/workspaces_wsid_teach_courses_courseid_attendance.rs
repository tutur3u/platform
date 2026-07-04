//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/attendance`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/attendance/route.ts`.
//!
//! Auth model: mirrors `requireTeachWorkspaceAccess` which resolves and
//! normalises the workspace id, verifies session membership, and requires the
//! `view_user_groups` workspace permission.  After auth, the course is validated
//! against `workspace_user_groups` (id + ws_id + is_guest=false) using the
//! service-role client.
//!
//! Query params:
//!
//! - `date=YYYY-MM-DD` – returns all attendance rows for that exact date as
//!   `{ "data": [...] }`.
//! - `month=YYYY-MM` – aggregates attendance rows for the month into per-day
//!   summaries and returns `{ "days": [...] }` sorted ascending by date.
//!
//! Exactly one of `date` or `month` must be provided; supplying neither returns
//! `400 Bad Request`.
//!
//! POST is not migrated here; `None` is returned for non-GET methods so the
//! worker falls through to the still-live Next.js route.
//!
//! Behavior gaps: none for the GET path.

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

const PERMISSION: &str = "view_user_groups";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_attendance_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, raw_course_id) = extract_path_ids(request.path)?;

    Some(match request.method {
        "GET" => attendance_get(config, request, raw_ws_id, raw_course_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn attendance_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // ---- parse query params -----------------------------------------------
    let query = AttendanceQuery::from_url(request.url);

    let filter = match query.into_filter() {
        Ok(f) => f,
        Err(msg) => return message_response(400, msg),
    };

    // ---- auth ----------------------------------------------------------------
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        PERMISSION,
        outbound,
    )
    .await
    {
        Ok(a) => a,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    let ws_id = &authorization.ws_id;

    // ---- validate course -----------------------------------------------------
    match validate_course(&config.contact_data, outbound, ws_id, raw_course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Course not found"),
        Err(()) => return message_response(500, "Error fetching attendance"),
    }

    // ---- fetch attendance ----------------------------------------------------
    match filter {
        AttendanceFilter::ByDate(date) => {
            fetch_by_date(&config.contact_data, outbound, raw_course_id, &date).await
        }
        AttendanceFilter::ByMonth(start_date, end_date) => {
            fetch_by_month(
                &config.contact_data,
                outbound,
                raw_course_id,
                &start_date,
                &end_date,
            )
            .await
        }
    }
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Checks that a `workspace_user_groups` row exists with the given id, ws_id,
/// and `is_guest = false`.  Returns `Ok(true)` when found, `Ok(false)` when the
/// row does not exist, and `Err(())` on network or configuration errors.
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
                ("is_guest", "eq.false".to_owned()),
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
    Ok(rows.as_array().map(|a| !a.is_empty()).unwrap_or(false))
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct AttendanceRow {
    date: Option<String>,
    notes: Option<String>,
    status: Option<String>,
    user_id: Option<String>,
}

/// Fetches attendance rows for a specific date and returns
/// `{ "data": [...] }`.
async fn fetch_by_date(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    date: &str,
) -> BackendResponse {
    let rows = match fetch_attendance_rows(
        contact_data,
        outbound,
        course_id,
        AttendanceDateFilter::Exact(date),
    )
    .await
    {
        Ok(r) => r,
        Err(()) => return message_response(500, "Error fetching attendance"),
    };

    no_store_response(json_response(200, json!({ "data": rows })))
}

/// Fetches attendance rows for a month range and aggregates them into per-day
/// summaries, returning `{ "days": [...] }` sorted ascending by date.
async fn fetch_by_month(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    start_date: &str,
    end_date: &str,
) -> BackendResponse {
    let rows = match fetch_attendance_rows(
        contact_data,
        outbound,
        course_id,
        AttendanceDateFilter::Range {
            start_date,
            end_date,
        },
    )
    .await
    {
        Ok(r) => r,
        Err(()) => return message_response(500, "Error fetching attendance"),
    };

    // Aggregate into per-day summaries (mirrors the legacy Map accumulation).
    let mut days: std::collections::BTreeMap<String, DaySummary> =
        std::collections::BTreeMap::new();

    for row in &rows {
        let date = match row.get("date").and_then(|v| v.as_str()) {
            Some(d) => d.to_owned(),
            None => continue,
        };
        let entry = days.entry(date.clone()).or_insert_with(|| DaySummary {
            date: date.clone(),
            present: 0,
            absent: 0,
            late: 0,
            notes: 0,
            total_marked: 0,
        });
        let status = row.get("status").and_then(|v| v.as_str()).unwrap_or("");
        if status == "PRESENT" {
            entry.present += 1;
        }
        if status == "ABSENT" {
            entry.absent += 1;
        }
        if status == "LATE" {
            entry.late += 1;
        }
        let has_notes = row
            .get("notes")
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        if has_notes {
            entry.notes += 1;
        }
        entry.total_marked += 1;
    }

    let sorted: Vec<Value> = days
        .into_values()
        .map(|d| {
            json!({
                "date": d.date,
                "present": d.present,
                "absent": d.absent,
                "late": d.late,
                "notes": d.notes,
                "totalMarked": d.total_marked,
            })
        })
        .collect();

    no_store_response(json_response(200, json!({ "days": sorted })))
}

struct DaySummary {
    date: String,
    present: i64,
    absent: i64,
    late: i64,
    notes: i64,
    total_marked: i64,
}

enum AttendanceDateFilter<'a> {
    Exact(&'a str),
    Range {
        start_date: &'a str,
        end_date: &'a str,
    },
}

async fn fetch_attendance_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    date_filter: AttendanceDateFilter<'_>,
) -> Result<Vec<std::collections::HashMap<String, Value>>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "date,notes,status,user_id".to_owned()),
        ("group_id", format!("eq.{course_id}")),
    ];

    match date_filter {
        AttendanceDateFilter::Exact(date) => {
            params.push(("date", format!("eq.{date}")));
        }
        AttendanceDateFilter::Range {
            start_date,
            end_date,
        } => {
            params.push(("date", format!("gte.{start_date}")));
            params.push(("date", format!("lt.{end_date}")));
        }
    }

    let url = contact_data
        .rest_url("user_group_attendance", &params)
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

    response
        .json::<Vec<std::collections::HashMap<String, Value>>>()
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Query param parsing
// ---------------------------------------------------------------------------

enum AttendanceFilter {
    ByDate(String),
    ByMonth(String, String),
}

struct AttendanceQuery {
    date: Option<String>,
    month: Option<String>,
}

impl AttendanceQuery {
    fn from_url(url: Option<&str>) -> Self {
        let mut date = None;
        let mut month = None;

        if let Some(parsed) = url.and_then(|raw| url::Url::parse(raw).ok()) {
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    "date" => date = Some(value.into_owned()),
                    "month" => month = Some(value.into_owned()),
                    _ => {}
                }
            }
        }

        Self { date, month }
    }

    fn into_filter(self) -> Result<AttendanceFilter, &'static str> {
        // Validate date if provided.
        if let Some(d) = self.date {
            if is_valid_date(&d) {
                return Ok(AttendanceFilter::ByDate(d));
            } else {
                return Err("Invalid date");
            }
        }

        // Validate month if provided.
        if let Some(m) = self.month {
            if is_valid_month(&m) {
                let (start, end) = month_bounds(&m);
                return Ok(AttendanceFilter::ByMonth(start, end));
            } else {
                return Err("Invalid month");
            }
        }

        Err("Date or month is required")
    }
}

/// Returns `true` when the string matches the `YYYY-MM-DD` date pattern.
fn is_valid_date(s: &str) -> bool {
    if s.len() != 10 {
        return false;
    }
    let b = s.as_bytes();
    b[4] == b'-'
        && b[7] == b'-'
        && b[..4].iter().all(|c| c.is_ascii_digit())
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[8..10].iter().all(|c| c.is_ascii_digit())
}

/// Returns `true` when the string matches the `YYYY-MM` month pattern with a
/// valid month number (01-12).
fn is_valid_month(s: &str) -> bool {
    if s.len() != 7 {
        return false;
    }
    let b = s.as_bytes();
    if b[4] != b'-' {
        return false;
    }
    if !b[..4].iter().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if !b[5..7].iter().all(|c| c.is_ascii_digit()) {
        return false;
    }
    let month: u8 = (b[5] - b'0') * 10 + (b[6] - b'0');
    (1..=12).contains(&month)
}

/// Computes the inclusive start date and exclusive end date for the given
/// `YYYY-MM` month string, mirroring the legacy `getMonthBounds` function.
fn month_bounds(month: &str) -> (String, String) {
    // month is validated to be exactly "YYYY-MM" at this point.
    let year: i32 = month[..4].parse().unwrap_or(1970);
    let mo: u32 = month[5..7].parse().unwrap_or(1);

    let start = format!("{year:04}-{mo:02}-01");

    // Compute next month.
    let (next_year, next_month) = if mo == 12 {
        (year + 1, 1u32)
    } else {
        (year, mo + 1)
    };
    let end = format!("{next_year:04}-{next_month:02}-01");

    (start, end)
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, courseId)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/attendance`.
///
/// Returns `None` when the path does not match this route shape.
fn extract_path_ids(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "teach"
        && segments[5] == "courses"
        && !segments[6].is_empty()
        && segments[7] == "attendance"
    {
        Some((segments[3], segments[6]))
    } else {
        None
    }
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

    #[test]
    fn test_extract_path_ids_valid() {
        let (ws, course) =
            extract_path_ids("/api/v1/workspaces/ws-123/teach/courses/course-456/attendance")
                .unwrap();
        assert_eq!(ws, "ws-123");
        assert_eq!(course, "course-456");
    }

    #[test]
    fn test_extract_path_ids_missing_suffix() {
        assert!(extract_path_ids("/api/v1/workspaces/ws-123/teach/courses/course-456").is_none());
    }

    #[test]
    fn test_extract_path_ids_wrong_infix() {
        assert!(
            extract_path_ids("/api/v1/workspaces/ws-123/other/courses/course-456/attendance")
                .is_none()
        );
    }

    #[test]
    fn test_extract_path_ids_empty_ws() {
        assert!(
            extract_path_ids("/api/v1/workspaces//teach/courses/course-456/attendance").is_none()
        );
    }

    #[test]
    fn test_extract_path_ids_extra_segment() {
        assert!(
            extract_path_ids("/api/v1/workspaces/ws-123/teach/courses/course-456/attendance/extra")
                .is_none()
        );
    }

    #[test]
    fn test_is_valid_date() {
        assert!(is_valid_date("2024-03-15"));
        assert!(!is_valid_date("2024-3-15"));
        assert!(!is_valid_date("not-a-date"));
        assert!(!is_valid_date(""));
    }

    #[test]
    fn test_is_valid_month() {
        assert!(is_valid_month("2024-01"));
        assert!(is_valid_month("2024-12"));
        assert!(!is_valid_month("2024-13"));
        assert!(!is_valid_month("2024-00"));
        assert!(!is_valid_month("2024-1"));
        assert!(!is_valid_month("not-month"));
    }

    #[test]
    fn test_month_bounds_regular() {
        let (start, end) = month_bounds("2024-03");
        assert_eq!(start, "2024-03-01");
        assert_eq!(end, "2024-04-01");
    }

    #[test]
    fn test_month_bounds_december() {
        let (start, end) = month_bounds("2024-12");
        assert_eq!(start, "2024-12-01");
        assert_eq!(end, "2025-01-01");
    }

    #[test]
    fn test_attendance_query_no_params() {
        let query = AttendanceQuery::from_url(Some("http://example.com/api?"));
        assert!(query.into_filter().is_err());
    }

    #[test]
    fn test_attendance_query_date() {
        let query = AttendanceQuery::from_url(Some("http://example.com/api?date=2024-03-15"));
        match query.into_filter().unwrap() {
            AttendanceFilter::ByDate(d) => assert_eq!(d, "2024-03-15"),
            _ => panic!("expected ByDate"),
        }
    }

    #[test]
    fn test_attendance_query_month() {
        let query = AttendanceQuery::from_url(Some("http://example.com/api?month=2024-03"));
        match query.into_filter().unwrap() {
            AttendanceFilter::ByMonth(start, end) => {
                assert_eq!(start, "2024-03-01");
                assert_eq!(end, "2024-04-01");
            }
            _ => panic!("expected ByMonth"),
        }
    }

    #[test]
    fn test_attendance_query_invalid_date() {
        let query = AttendanceQuery::from_url(Some("http://example.com/api?date=not-a-date"));
        assert!(query.into_filter().is_err());
    }

    #[test]
    fn test_attendance_query_invalid_month() {
        let query = AttendanceQuery::from_url(Some("http://example.com/api?month=2024-13"));
        assert!(query.into_filter().is_err());
    }

    // Ensure unused import warning doesn't fire from serde derive.
    #[test]
    fn test_attendance_row_deserializes() {
        let v: AttendanceRow = serde_json::from_str(
            r#"{"date":"2024-01-01","notes":"ok","status":"PRESENT","user_id":"u1"}"#,
        )
        .unwrap();
        assert_eq!(v.date.as_deref(), Some("2024-01-01"));
        assert_eq!(v.status.as_deref(), Some("PRESENT"));
    }
}
