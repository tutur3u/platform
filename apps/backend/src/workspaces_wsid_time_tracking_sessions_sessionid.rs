//! Handler for `GET /api/v1/workspaces/:wsId/time-tracking/sessions/:sessionId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/[sessionId]/route.ts`.
//!
//! Auth model (legacy GET): resolve the authenticated session user via
//! `resolveSessionAuthContext` with `allowAppSessionAuth: true` (accepts both
//! Supabase session tokens and app-session tokens), normalize the workspace
//! slug via `normalizeWorkspaceId`, then require workspace membership via
//! `verifyWorkspaceMembershipType`.
//!
//! The data read uses the admin (service-role) client in the legacy route, so
//! RLS is bypassed and the read is scoped by `ws_id`, `id`, and `user_id`.
//!
//! The select expression joins related rows:
//!
//! - `category:time_tracking_categories(*)`
//! - `task:tasks(*)`
//!
//! Legacy status codes preserved:
//!
//! - missing/invalid session            -> `401 { "error": "Unauthorized" }`
//! - membership lookup transport error  -> `500 { "error": "Failed to verify workspace access" }`
//! - not a workspace member             -> `403 { "error": "Workspace access denied" }`
//! - session not found / query failure  -> `404 { "error": "Session not found" }`
//! - success                            -> `200 { "session": { ... } }`
//!
//! PATCH and DELETE are left to the still-live Next.js route (this handler returns
//! `None` for every non-GET method). No behavior gaps for the common authenticated
//! GET path.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MID: &str = "/time-tracking/sessions/";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_time_tracking_sessions_sessionid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, session_id) = session_path_params(request.path)?;

    Some(match request.method {
        "GET" => session_get_response(config, request, raw_ws_id, session_id, outbound).await,
        _ => return None,
    })
}

/// Extracts `(ws_id, session_id)` from the request path.
///
/// Accepts paths of the form:
/// `/api/v1/workspaces/<ws_id>/time-tracking/sessions/<session_id>`
///
/// Returns `None` if the path does not match, or if either segment is empty or
/// contains a `/`.
fn session_path_params(path: &str) -> Option<(&str, &str)> {
    let after_prefix = path.strip_prefix(PATH_PREFIX)?;
    let mid_pos = after_prefix.find(PATH_MID)?;
    let ws_id = &after_prefix[..mid_pos];
    let session_id = &after_prefix[mid_pos + PATH_MID.len()..];

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if session_id.is_empty() || session_id.contains('/') {
        return None;
    }
    Some((ws_id, session_id))
}

async fn session_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    session_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    // Legacy route uses allowAppSessionAuth: true.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, "Unauthorized");
    };

    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    // Legacy route normalizes the workspace slug (personal/internal/handle).
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(id)) => id,
            Ok(None) => return error_response(500, "Failed to verify workspace access"),
            Err(()) => return error_response(500, "Failed to verify workspace access"),
        };

    match verify_workspace_member(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "Workspace access denied"),
        Err(()) => return error_response(500, "Failed to verify workspace access"),
    }

    match fetch_session(contact_data, outbound, &ws_id, session_id, &user_id).await {
        Ok(Some(session)) => no_store_response(json_response(200, json!({ "session": session }))),
        Ok(None) => error_response(404, "Session not found"),
        Err(()) => error_response(500, "Internal server error"),
    }
}

/// Fetches the time tracking session row with its category and task joins.
///
/// Returns:
///
/// - `Ok(Some(value))` when the session exists and belongs to the user
/// - `Ok(None)` when the session is not found
/// - `Err(())` on a transport or parsing failure
async fn fetch_session(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_id: &str,
    user_id: &str,
) -> Result<Option<Value>, ()> {
    // Mirror the legacy `.select("*, category:time_tracking_categories(*), task:tasks(*)")`
    // filtered by id, ws_id, and user_id.
    let select_expr = "*,category:time_tracking_categories(*),task:tasks(*)".to_owned();
    let url = contact_data
        .rest_url(
            "time_tracking_sessions",
            &[
                ("select", select_expr),
                ("id", format!("eq.{session_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

/// Resolves a workspace slug (personal/internal/handle/UUID) to a concrete UUID.
///
/// Returns:
///
/// - `Ok(Some(id))` on success
/// - `Ok(None)` when the identifier is structurally invalid
/// - `Err(())` on transient lookup failure
async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let trimmed = raw_ws_id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token)
            .await
            .map(Some);
    }

    if is_workspace_uuid(trimmed) {
        return Ok(Some(trimmed.to_owned()));
    }

    let handle = trimmed.to_lowercase();
    if is_workspace_handle(&handle) {
        if let Some(id) =
            workspace_id_by_handle_caller(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(Some(id));
        }
        if let Some(id) = workspace_id_by_handle_service(contact_data, outbound, &handle).await? {
            return Ok(Some(id));
        }
        return Ok(Some(handle));
    }

    Ok(None)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                (
                    "select",
                    "id,workspace_members!inner(user_id,type)".to_owned(),
                ),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle_caller(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<WorkspaceMemberRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn send_caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn is_workspace_uuid(value: &str) -> bool {
    let v = value.trim();
    v.len() == 36
        && v.chars().enumerate().all(|(i, ch)| match i {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let len = value.len();
    if len == 0 || len > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, ch)| {
        let edge = i == 0 || i + 1 == len;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!edge && matches!(ch, '_' | '-'))
    })
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_and_session_ids() {
        assert_eq!(
            session_path_params("/api/v1/workspaces/abc-123/time-tracking/sessions/sess-456"),
            Some(("abc-123", "sess-456"))
        );
    }

    #[test]
    fn path_guard_accepts_uuid_segments() {
        let ws = "00000000-0000-0000-0000-000000000000";
        let sess = "11111111-1111-1111-1111-111111111111";
        let path = format!("/api/v1/workspaces/{ws}/time-tracking/sessions/{sess}");
        assert_eq!(session_path_params(&path), Some((ws, sess)));
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert_eq!(
            session_path_params("/api/v1/workspaces//time-tracking/sessions/sess-1"),
            None
        );
    }

    #[test]
    fn path_guard_rejects_empty_session_id() {
        assert_eq!(
            session_path_params("/api/v1/workspaces/ws-1/time-tracking/sessions/"),
            None
        );
    }

    #[test]
    fn path_guard_rejects_extra_trailing_segment() {
        assert_eq!(
            session_path_params("/api/v1/workspaces/ws-1/time-tracking/sessions/sess-1/extra"),
            None
        );
    }

    #[test]
    fn path_guard_rejects_unrelated_path() {
        assert_eq!(session_path_params("/api/v1/other"), None);
        assert_eq!(session_path_params("/totally/unrelated"), None);
    }

    #[test]
    fn path_guard_rejects_missing_mid_segment() {
        assert_eq!(
            session_path_params("/api/v1/workspaces/ws-1/time-tracking/categories"),
            None
        );
    }

    #[test]
    fn uuid_detection_accepts_valid_uuid() {
        assert!(is_workspace_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_workspace_uuid("a1b2c3d4-e5f6-7890-abcd-ef1234567890"));
    }

    #[test]
    fn uuid_detection_rejects_non_uuid() {
        assert!(!is_workspace_uuid("personal"));
        assert!(!is_workspace_uuid("short"));
        assert!(!is_workspace_uuid(""));
    }

    #[test]
    fn handle_detection_accepts_valid_handle() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("abc"));
        assert!(is_workspace_handle("my_ws_1"));
    }

    #[test]
    fn handle_detection_rejects_leading_or_trailing_dash() {
        assert!(!is_workspace_handle("-bad"));
        assert!(!is_workspace_handle("bad-"));
        assert!(!is_workspace_handle(""));
    }

    #[test]
    fn error_response_shapes_error_body() {
        let resp = error_response(404, "Session not found");
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body, json!({ "error": "Session not found" }));
    }
}
