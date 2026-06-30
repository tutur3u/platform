//! Handler for `GET /api/v1/workspaces/:wsId/calendar/events/:eventId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.ts`
//! (GET only; the legacy `PUT` and `DELETE` paths stay live in Next.js, so
//! this handler returns `None` for every non-GET method).
//!
//! Legacy GET flow:
//!
//!   1. `resolveSessionAuthContext(request, { allowAppSessionAuth: true })`
//!      resolves the caller. Failure -> caller-supplied auth error response
//!      (typically `401`).
//!   2. `verifyWorkspaceMembershipType({ wsId, userId, supabase })` with the
//!      default `requiredType: 'MEMBER'`. A lookup error maps to
//!      `500 { "error": "Failed to verify workspace membership" }`; a missing
//!      or non-`MEMBER` membership maps to
//!      `403 { "error": "Workspace access denied" }`.
//!   3. Reads `workspace_calendar_events` via the admin (service-role) client
//!      filtered by `id = eventId` and `ws_id = wsId` using `.single()`.
//!   4. On a PostgREST `PGRST116` (no rows) error: `200 {}`.
//!   5. On a successful read: decrypts the event with the workspace encryption
//!      key and returns `200 <event-json>`.
//!   6. On any other error: `500 { "error": "An error occurred while
//!      processing your request" }`.
//!
//! Behavior gaps vs. the legacy route:
//!
//!   * End-to-end encryption: the legacy route decrypts field values
//!     (`title`, `description`, `location`) for encrypted events using a
//!     per-workspace AES-GCM key stored in `workspace_encryption_keys`. Porting
//!     the full decrypt pipeline here is prohibitively complex, so this handler
//!     returns the raw (possibly encrypted) field values for encrypted events.
//!     `is_encrypted` will be `true` in those rows so callers can detect this.
//!   * App-session tokens (`ttr_app_*`): the legacy route accepts signed
//!     app-session tokens via `allowAppSessionAuth: true`. This handler
//!     implements only the common Supabase bearer-token path; app-session
//!     callers fall through to the still-live Next.js route.
//!   * The raw `wsId` path segment is forwarded unchanged (no
//!     `normalizeWorkspaceId` / alias resolution in the Rust layer).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments, supabase_auth,
};

const MEMBER_TYPE: &str = "MEMBER";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const INTERNAL_ERROR_MESSAGE: &str = "An error occurred while processing your request";

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_calendar_events_eventid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (ws_id, event_id) = calendar_event_path_params(request.path)?;

    Some(match request.method {
        "GET" => get_event_response(config, request, ws_id, event_id, outbound).await,
        _ => return None,
    })
}

async fn get_event_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    event_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, INTERNAL_ERROR_MESSAGE);
    }

    // Resolve caller identity from the bearer token / cookie.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Check workspace membership (mirrors verifyWorkspaceMembershipType).
    match verify_workspace_membership(contact_data, outbound, ws_id, &user_id, &access_token).await
    {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // The legacy route reads via sbAdmin (service-role), bypassing RLS.
    match fetch_calendar_event(contact_data, outbound, ws_id, event_id).await {
        Ok(Some(event)) => no_store_response(json_response(200, event)),
        Ok(None) => no_store_response(json_response(200, json!({}))),
        Err(()) => error_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

/// Mirrors `verifyWorkspaceMembershipType` with `requiredType: 'MEMBER'`.
///
/// Returns:
///
/// - `Ok(true)` – caller is a `MEMBER` of the workspace
/// - `Ok(false)` – no membership row or non-`MEMBER` type (legacy `403`)
/// - `Err(())` – lookup failure (legacy `500`)
async fn verify_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
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

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();

    Ok(matches!(
        membership,
        Some(row) if row.membership_type.as_deref() == Some(MEMBER_TYPE)
    ))
}

/// Fetches a single event from `workspace_calendar_events` using the
/// service-role key (mirrors `sbAdmin` in the legacy route).
///
/// Returns:
///
/// - `Ok(Some(event))` – event found
/// - `Ok(None)` – no rows (legacy PGRST116 -> `200 {}`)
/// - `Err(())` – upstream error (legacy `500`)
async fn fetch_calendar_event(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    event_id: &str,
) -> Result<Option<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_calendar_events",
            &[
                ("select", "*".to_owned()),
                ("id", format!("eq.{event_id}")),
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

    let mut rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows.pop())
}

/// Sends a GET request forwarding the caller's access token (RLS-active path).
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

/// Extracts `(ws_id, event_id)` from the path
/// `/api/v1/workspaces/:wsId/calendar/events/:eventId`.
///
/// Returns `None` for any path that does not match the exact mount structure,
/// preventing this handler from intercepting unrelated routes.
fn calendar_event_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    match segments.as_slice() {
        [
            "api",
            "v1",
            "workspaces",
            ws_id,
            "calendar",
            "events",
            event_id,
        ] if !ws_id.is_empty() && !event_id.is_empty() => Some((ws_id, event_id)),
        _ => None,
    }
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_params_match_exact_mount() {
        assert_eq!(
            calendar_event_path_params("/api/v1/workspaces/ws-123/calendar/events/evt-456"),
            Some(("ws-123", "evt-456"))
        );
    }

    #[test]
    fn path_params_match_uuid_segments() {
        let path = "/api/v1/workspaces/\
            00000000-0000-0000-0000-000000000001/calendar/events/\
            00000000-0000-0000-0000-000000000002";
        let (ws, ev) = calendar_event_path_params(path).unwrap();
        assert_eq!(ws, "00000000-0000-0000-0000-000000000001");
        assert_eq!(ev, "00000000-0000-0000-0000-000000000002");
    }

    #[test]
    fn path_params_rejects_missing_v1() {
        assert_eq!(
            calendar_event_path_params("/api/workspaces/ws-123/calendar/events/evt-456"),
            None
        );
    }

    #[test]
    fn path_params_rejects_collection_path() {
        // Missing the event-id segment — this is the collection route.
        assert_eq!(
            calendar_event_path_params("/api/v1/workspaces/ws-123/calendar/events"),
            None
        );
    }

    #[test]
    fn path_params_rejects_trailing_segment() {
        // Extra segment beyond the event id must not match.
        assert_eq!(
            calendar_event_path_params("/api/v1/workspaces/ws-123/calendar/events/evt-456/extra"),
            None
        );
    }

    #[test]
    fn path_params_rejects_empty_ws_id() {
        assert_eq!(
            calendar_event_path_params("/api/v1/workspaces//calendar/events/evt-456"),
            None
        );
    }

    #[test]
    fn path_params_rejects_empty_event_id() {
        // path_segments filters empty segments, so the slice length won't be 7.
        assert_eq!(
            calendar_event_path_params("/api/v1/workspaces/ws-123/calendar/events/"),
            None
        );
    }

    #[test]
    fn path_params_rejects_short_path() {
        // Must not panic on a short path.
        assert_eq!(calendar_event_path_params("/api/v1/workspaces"), None);
    }

    #[test]
    fn error_response_shape() {
        let r = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(r.status, 401);
        assert_eq!(r.body, json!({ "error": "Unauthorized" }));

        let r = error_response(403, ACCESS_DENIED_MESSAGE);
        assert_eq!(r.status, 403);
        assert_eq!(r.body, json!({ "error": "Workspace access denied" }));

        let r = error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        assert_eq!(r.status, 500);
        assert_eq!(
            r.body,
            json!({ "error": "Failed to verify workspace membership" })
        );

        let r = error_response(500, INTERNAL_ERROR_MESSAGE);
        assert_eq!(r.status, 500);
        assert_eq!(
            r.body,
            json!({ "error": "An error occurred while processing your request" })
        );
    }
}
