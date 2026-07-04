//! Handler for `GET /api/v1/workspaces/:wsId/time-tracking/requests/:id/comments`.
//!
//! Ports the legacy Next.js GET handler at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/comments/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route calls `resolveSessionAuthContext` with `allowAppSessionAuth: true`
//! followed by `verifyWorkspaceMembershipType`. This handler reproduces that path:
//!
//! - Extract the caller access token from the request (Bearer or cookie, plus
//!   app-session tokens).
//! - Resolve the Supabase user from the token.
//! - Check that the caller is a workspace member via a service-role read.
//! - Verify the time-tracking request belongs to the workspace (private schema).
//! - Fetch all comments from `private.time_tracking_request_comments_with_users`
//!   for the request, ordered by `created_at` ascending.
//!
//! ## Response shape
//!
//! `200 OK  { "comments": [...] }` — all columns from the view, ordered ascending.
//!
//! ## Status codes (matching legacy)
//!
//! - `401` – missing or invalid session token / user not found.
//! - `403` – authenticated but not a workspace member.
//! - `404` – request not found or does not belong to the workspace.
//! - `500` – membership lookup / request lookup / upstream DB failure.
//!
//! ## Behaviour gaps
//!
//! - `POST` (create comment) is not implemented here; `None` is returned so the
//!   request falls through to the still-live Next.js handler.
//! - Workspace ID normalization (resolving "personal" / handle slugs) is not
//!   performed; the path segment is forwarded verbatim to the membership and
//!   request existence checks. In practice, all callers use UUID workspace IDs
//!   for this endpoint.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const VERIFY_REQUEST_FAILED_MESSAGE: &str = "Failed to verify request";
const REQUEST_NOT_FOUND_MESSAGE: &str = "Request not found";
const FETCH_COMMENTS_FAILED_MESSAGE: &str = "Failed to fetch comments";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct TimeTrackingRequestIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_time_tracking_requests_id_comments_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (ws_id, request_id) = extract_path_ids(request.path)?;

    Some(match request.method {
        "GET" => comments_get_response(config, request, ws_id, request_id, outbound).await,
        _ => return None,
    })
}

async fn comments_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    request_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the caller. The legacy route allows app-session auth.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Verify the caller is a member of the workspace.
    match verify_workspace_member(contact_data, outbound, ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Verify the time-tracking request belongs to this workspace.
    match request_belongs_to_workspace(contact_data, outbound, ws_id, request_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, REQUEST_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(500, VERIFY_REQUEST_FAILED_MESSAGE),
    }

    // Fetch all comments ordered by created_at ascending.
    match fetch_comments(contact_data, outbound, request_id).await {
        Ok(comments) => no_store_response(json_response(200, json!({ "comments": comments }))),
        Err(()) => error_response(500, FETCH_COMMENTS_FAILED_MESSAGE),
    }
}

/// Check that the caller has any workspace membership row.
async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        .is_some())
}

/// Verify the time-tracking request exists and belongs to the workspace.
///
/// Queries `private.time_tracking_requests` using the service-role key.
async fn request_belongs_to_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    request_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "time_tracking_requests",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{request_id}")),
            ("workspace_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    // Private schema table -> Accept-Profile: private.
    let response = send_service_role_get(contact_data, outbound, &url, true).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<TimeTrackingRequestIdRow>>()
        .map_err(|_| ())?
        .is_empty())
}

/// Fetch all comments for the request from
/// `private.time_tracking_request_comments_with_users`, ordered by
/// `created_at` ascending (matching the legacy `order('created_at', { ascending: true })`).
async fn fetch_comments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    request_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "time_tracking_request_comments_with_users",
        &[
            ("select", "*".to_owned()),
            ("request_id", format!("eq.{request_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, true).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        req = req.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(req).await.map_err(|_| ())
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// Extract `(ws_id, request_id)` from
/// `/api/v1/workspaces/:wsId/time-tracking/requests/:id/comments`.
///
/// Returns `None` if the path does not match exactly.
fn extract_path_ids(path: &str) -> Option<(&str, &str)> {
    let mut segments = path.trim_start_matches('/').split('/');

    if segments.next()? != "api" {
        return None;
    }
    if segments.next()? != "v1" {
        return None;
    }
    if segments.next()? != "workspaces" {
        return None;
    }
    let ws_id = segments.next()?;
    if segments.next()? != "time-tracking" {
        return None;
    }
    if segments.next()? != "requests" {
        return None;
    }
    let request_id = segments.next()?;
    if segments.next()? != "comments" {
        return None;
    }
    // No trailing segments allowed.
    if segments.next().is_some() {
        return None;
    }

    if ws_id.is_empty() || request_id.is_empty() {
        return None;
    }

    Some((ws_id, request_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_uuid_ws_and_request_id() {
        let path = "/api/v1/workspaces/123e4567-e89b-12d3-a456-426614174000/time-tracking/requests/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/comments";
        let result = extract_path_ids(path);
        assert_eq!(
            result,
            Some((
                "123e4567-e89b-12d3-a456-426614174000",
                "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
            ))
        );
    }

    #[test]
    fn path_guard_matches_slug_ws_id() {
        let path = "/api/v1/workspaces/my-workspace/time-tracking/requests/req-123/comments";
        let result = extract_path_ids(path);
        assert_eq!(result, Some(("my-workspace", "req-123")));
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        let path = "/api/v1/workspaces/ws1/time-tracking/requests/req1/activity";
        assert_eq!(extract_path_ids(path), None);
    }

    #[test]
    fn path_guard_rejects_extra_trailing_segment() {
        let path = "/api/v1/workspaces/ws1/time-tracking/requests/req1/comments/extra";
        assert_eq!(extract_path_ids(path), None);
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        let path = "/api/v1/workspaces//time-tracking/requests/req1/comments";
        assert_eq!(extract_path_ids(path), None);
    }

    #[test]
    fn path_guard_rejects_empty_request_id() {
        let path = "/api/v1/workspaces/ws1/time-tracking/requests//comments";
        assert_eq!(extract_path_ids(path), None);
    }

    #[test]
    fn path_guard_rejects_missing_requests_segment() {
        let path = "/api/v1/workspaces/ws1/time-tracking/req1/comments";
        assert_eq!(extract_path_ids(path), None);
    }

    #[test]
    fn path_guard_rejects_wrong_api_prefix() {
        let path = "/api/workspaces/ws1/time-tracking/requests/req1/comments";
        assert_eq!(extract_path_ids(path), None);
    }

    #[test]
    fn path_guard_rejects_no_leading_slash_mismatch() {
        // trim_start_matches handles both with and without leading slash.
        let path = "api/v1/workspaces/ws1/time-tracking/requests/req1/comments";
        assert_eq!(extract_path_ids(path), Some(("ws1", "req1")));
    }
}
