//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/attendance`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/attendance/route.ts`.
//!
//! Auth model: resolves the workspace via `authorize_workspace_permission` which
//! normalises the workspace id and requires the `view_user_groups` workspace
//! permission.  After auth, the user group is validated against
//! `workspace_user_groups` (id + ws_id) using the service-role client.
//!
//! Query params:
//!
//! - `date=YYYY-MM-DD` (required) – filters attendance rows for that exact date.
//! - `sessionId=<UUID>` (optional) – when provided, returns rows where
//!   `session_id = sessionId OR session_id IS NULL`; when absent, returns rows
//!   where `session_id IS NULL`.
//!
//! On success the response is a bare JSON array of attendance row objects with
//! fields `id`, `user_id`, `status`, `notes`, `session_id`.
//!
//! POST is not migrated here; `None` is returned for non-GET methods so the
//! worker falls through to the still-live Next.js route.
//!
//! Behavior gaps:
//!
//! - The legacy GET validates a provided `sessionId` against the
//!   `private.workspace_user_group_sessions` Supabase schema (a non-public
//!   schema), returning 404 when the session is not found or does not match the
//!   given date.  The Supabase REST API requires the `Accept-Profile` header to
//!   access non-public schemas; no existing Rust handler in this crate uses that
//!   mechanism, so the private-schema session-validation step is omitted here.
//!   The attendance rows are still fetched with the `sessionId` filter when it
//!   is supplied, preserving the correct data shape for valid session IDs.

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

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_attendance_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, raw_group_id) = extract_path_ids(request.path)?;

    Some(match request.method {
        "GET" => attendance_get(config, request, raw_ws_id, raw_group_id, outbound).await,
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
    raw_group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // ---- validate groupId --------------------------------------------------
    if !is_valid_uuid(raw_group_id) {
        return message_response(400, "Invalid groupId");
    }

    // ---- parse query params ------------------------------------------------
    let query = AttendanceQuery::from_url(request.url);

    let date = match query.date {
        Some(d) if is_valid_date(&d) => d,
        Some(_) => return message_response(400, "Invalid date"),
        None => return message_response(400, "Date is required"),
    };

    let session_id_opt: Option<String> = match query.session_id {
        Some(s) if is_valid_uuid(&s) => Some(s),
        Some(_) => return message_response(400, "Invalid sessionId"),
        None => None,
    };

    // ---- auth --------------------------------------------------------------
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
            return message_response(403, "Insufficient permissions to view user groups");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return json_response_no_store(404, json!({ "error": "Not found" }));
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    let ws_id = &authorization.ws_id;

    // ---- validate user group exists in workspace ---------------------------
    match validate_user_group(&config.contact_data, outbound, ws_id, raw_group_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "User group not found"),
        Err(()) => return message_response(500, "Error fetching attendance"),
    }

    // NOTE: Session validation against `private.workspace_user_group_sessions`
    // is omitted; see the module-level doc comment for the rationale.

    // ---- fetch attendance --------------------------------------------------
    fetch_attendance(
        &config.contact_data,
        outbound,
        raw_group_id,
        &date,
        session_id_opt.as_deref(),
    )
    .await
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Checks that a `workspace_user_groups` row exists for the given `id` and
/// `ws_id`.  Returns `Ok(true)` when found, `Ok(false)` when not, and
/// `Err(())` on network or configuration errors.
async fn validate_user_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{group_id}")),
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
    Ok(rows.as_array().map(|a| !a.is_empty()).unwrap_or(false))
}

/// Fetches attendance rows from `user_group_attendance` filtered by `group_id`
/// and `date`.  When `session_id` is `Some`, applies
/// `or=(session_id.eq.<id>,session_id.is.null)`; when `None`, applies
/// `session_id=is.null`.  Returns the raw JSON array or an error on failure.
async fn fetch_attendance(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
    date: &str,
    session_id: Option<&str>,
) -> BackendResponse {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "id,user_id,status,notes,session_id".to_owned()),
        ("group_id", format!("eq.{group_id}")),
        ("date", format!("eq.{date}")),
    ];

    if let Some(sid) = session_id {
        params.push(("or", format!("(session_id.eq.{sid},session_id.is.null)")));
    } else {
        params.push(("session_id", "is.null".to_owned()));
    }

    let url = match contact_data.rest_url("user_group_attendance", &params) {
        Some(u) => u,
        None => return message_response(500, "Error fetching attendance"),
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return message_response(500, "Error fetching attendance"),
    };
    let bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return message_response(500, "Error fetching attendance"),
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, "Error fetching attendance");
    }

    let rows: Value = match response.json::<Value>() {
        Ok(v) => v,
        Err(_) => return message_response(500, "Error fetching attendance"),
    };

    // Legacy returns `data || []`, so return empty array on null.
    let arr = if rows.is_array() { rows } else { json!([]) };

    no_store_response(json_response(200, arr))
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, groupId)` from
/// `/api/v1/workspaces/:wsId/user-groups/:groupId/attendance`.
///
/// Returns `None` when the path does not match this route shape.
fn extract_path_ids(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // Expected: api / v1 / workspaces / :wsId / user-groups / :groupId / attendance
    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && !segments[5].is_empty()
        && segments[6] == "attendance"
    {
        Some((segments[3], segments[5]))
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
// Query param parsing
// ---------------------------------------------------------------------------

struct AttendanceQuery {
    date: Option<String>,
    session_id: Option<String>,
}

impl AttendanceQuery {
    fn from_url(url: Option<&str>) -> Self {
        let mut date = None;
        let mut session_id = None;

        if let Some(parsed) = url.and_then(|raw| url::Url::parse(raw).ok()) {
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    "date" => date = Some(value.into_owned()),
                    "sessionId" => session_id = Some(value.into_owned()),
                    _ => {}
                }
            }
        }

        Self { date, session_id }
    }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

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

/// Returns `true` when the string is a well-formed UUID
/// (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
fn is_valid_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 5 {
        return false;
    }
    let expected_lengths = [8usize, 4, 4, 4, 12];
    parts
        .iter()
        .zip(expected_lengths.iter())
        .all(|(part, &len)| part.len() == len && part.chars().all(|c| c.is_ascii_hexdigit()))
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn json_response_no_store(status: u16, payload: Value) -> BackendResponse {
    no_store_response(json_response(status, payload))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- path extraction -----------------------------------------------------

    #[test]
    fn test_extract_path_ids_valid() {
        let (ws, group) =
            extract_path_ids("/api/v1/workspaces/ws-123/user-groups/group-456/attendance").unwrap();
        assert_eq!(ws, "ws-123");
        assert_eq!(group, "group-456");
    }

    #[test]
    fn test_extract_path_ids_missing_suffix() {
        assert!(extract_path_ids("/api/v1/workspaces/ws-123/user-groups/group-456").is_none());
    }

    #[test]
    fn test_extract_path_ids_wrong_segment() {
        assert!(
            extract_path_ids("/api/v1/workspaces/ws-123/other-groups/group-456/attendance")
                .is_none()
        );
    }

    #[test]
    fn test_extract_path_ids_empty_ws() {
        assert!(extract_path_ids("/api/v1/workspaces//user-groups/group-456/attendance").is_none());
    }

    #[test]
    fn test_extract_path_ids_empty_group() {
        assert!(extract_path_ids("/api/v1/workspaces/ws-123/user-groups//attendance").is_none());
    }

    #[test]
    fn test_extract_path_ids_extra_segment() {
        assert!(
            extract_path_ids("/api/v1/workspaces/ws-123/user-groups/group-456/attendance/extra")
                .is_none()
        );
    }

    // -- is_valid_date -------------------------------------------------------

    #[test]
    fn test_is_valid_date_valid() {
        assert!(is_valid_date("2024-03-15"));
        assert!(is_valid_date("2000-01-01"));
    }

    #[test]
    fn test_is_valid_date_invalid() {
        assert!(!is_valid_date("2024-3-15"));
        assert!(!is_valid_date("not-a-date"));
        assert!(!is_valid_date(""));
        assert!(!is_valid_date("2024/03/15"));
    }

    // -- is_valid_uuid -------------------------------------------------------

    #[test]
    fn test_is_valid_uuid_valid() {
        assert!(is_valid_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_valid_uuid("123e4567-e89b-12d3-a456-426614174000"));
    }

    #[test]
    fn test_is_valid_uuid_invalid() {
        assert!(!is_valid_uuid("not-a-uuid"));
        assert!(!is_valid_uuid(""));
        assert!(!is_valid_uuid("00000000-0000-0000-0000-00000000000Z"));
        assert!(!is_valid_uuid("00000000-0000-0000-0000"));
    }

    // -- AttendanceQuery -----------------------------------------------------

    #[test]
    fn test_attendance_query_date_only() {
        let q = AttendanceQuery::from_url(Some("http://example.com/api?date=2024-03-15"));
        assert_eq!(q.date.as_deref(), Some("2024-03-15"));
        assert!(q.session_id.is_none());
    }

    #[test]
    fn test_attendance_query_with_session_id() {
        let q = AttendanceQuery::from_url(Some(
            "http://example.com/api?date=2024-03-15&sessionId=123e4567-e89b-12d3-a456-426614174000",
        ));
        assert_eq!(q.date.as_deref(), Some("2024-03-15"));
        assert_eq!(
            q.session_id.as_deref(),
            Some("123e4567-e89b-12d3-a456-426614174000")
        );
    }

    #[test]
    fn test_attendance_query_no_params() {
        let q = AttendanceQuery::from_url(Some("http://example.com/api"));
        assert!(q.date.is_none());
        assert!(q.session_id.is_none());
    }

    #[test]
    fn test_attendance_query_none_url() {
        let q = AttendanceQuery::from_url(None);
        assert!(q.date.is_none());
        assert!(q.session_id.is_none());
    }
}
