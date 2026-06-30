//! Handler for `GET /api/v1/workspaces/:wsId/meetings/:meetingId/stream`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/stream/route.ts`.
//!
//! ## Behavior
//!
//! 1. Authenticate the caller via a Supabase session bearer token
//!    (401 `{ "error": "Unauthorized" }` when absent or invalid).
//! 2. Verify workspace membership
//!    (500 `{ "error": "Failed to verify workspace membership" }` on lookup
//!    failure; 403 `{ "error": "Workspace access denied" }` when not a member).
//! 3. Verify the meeting exists in `workspace_meetings` by `id` + `ws_id`
//!    (404 `{ "error": "Meeting not found" }`).
//! 4. Fetch the `private.meet_stream_live_inputs` row for the meeting
//!    (500 `{ "error": "Failed to load stream state" }` on read failure).
//! 5. Return 200 `{ "stream": <serialized> | null }`.
//!
//! ## Behavior gaps vs. legacy
//!
//! - The legacy route accepts `allowAppSessionAuth: { targetApp: 'meet' }` which
//!   supports a non-standard app-session token alongside regular session tokens.
//!   This port uses the standard bearer-token path only. App-session tokens for
//!   the `meet` target are not forwarded by `BackendRequest` in a form that can be
//!   detected here, so that code path falls through to Next.js.
//! - POST and PATCH methods are not ported (they call the Cloudflare Stream API
//!   which is not accessible from this worker). Those methods return `None` so the
//!   request falls through to the still-live Next.js route.
//! - The `internal` workspace slug is resolved to the root workspace UUID to match
//!   `resolveWorkspaceId` semantics; `personal` is not resolved here (the legacy
//!   route normalizes it via `normalizeWorkspaceId` with a DB lookup, but no
//!   meetings are expected under the personal workspace).

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const MEETING_NOT_FOUND_MESSAGE: &str = "Meeting not found";
const STREAM_LOAD_FAILED_MESSAGE: &str = "Failed to load stream state";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct MeetingRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct MeetStreamLiveInputRow {
    id: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    ended_at: Option<String>,
    cloudflare_live_input_uid: Option<String>,
    whep_url: Option<String>,
    whip_url: Option<String>,
    status: Option<String>,
}

/// Path: `/api/v1/workspaces/<wsId>/meetings/<meetingId>/stream`.
///
/// Returns `(ws_id, meeting_id)` when the path matches; `None` otherwise.
fn stream_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = crate::path_segments(path);

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "meetings"
        && segments[6] == "stream"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

pub(crate) async fn handle_workspaces_wsid_meetings_meetingid_stream_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, meeting_id) = stream_path_params(request.path)?;

    Some(match request.method {
        "GET" => stream_get_response(config, request, raw_ws_id, meeting_id, outbound).await,
        _ => return None,
    })
}

async fn stream_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    meeting_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Step 1: authenticate the caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let ws_id = resolve_workspace_id(raw_ws_id);

    // Step 2: verify workspace membership.
    match verify_workspace_member(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Step 3: verify the meeting exists in this workspace.
    match meeting_exists(contact_data, outbound, meeting_id, &ws_id).await {
        Ok(true) => {}
        Ok(false) | Err(()) => return message_response(404, MEETING_NOT_FOUND_MESSAGE),
    }

    // Step 4: fetch the stream live-input row from the private schema.
    let stream_row =
        match fetch_meet_stream_live_input(contact_data, outbound, meeting_id, &ws_id).await {
            Ok(row) => row,
            Err(()) => return message_response(500, STREAM_LOAD_FAILED_MESSAGE),
        };

    // Step 5: serialize and return.
    let stream_value = stream_row.map(|row| {
        json!({
            "createdAt": row.created_at,
            "endedAt": row.ended_at,
            "id": row.id,
            "liveInputUid": row.cloudflare_live_input_uid,
            "playbackUrl": row.whep_url,
            "publishUrl": row.whip_url,
            "status": row.status,
            "updatedAt": row.updated_at,
        })
    });

    no_store_response(json_response(200, json!({ "stream": stream_value })))
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

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

    let response = send_service_role_get(contact_data, outbound, &url, false).await?;

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

async fn meeting_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    meeting_id: &str,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_meetings",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{meeting_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<MeetingRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn fetch_meet_stream_live_input(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    meeting_id: &str,
    ws_id: &str,
) -> Result<Option<MeetStreamLiveInputRow>, ()> {
    // `meet_stream_live_inputs` lives in the `private` schema.
    let url = contact_data
        .rest_url(
            "meet_stream_live_inputs",
            &[
                (
                    "select",
                    "id,created_at,updated_at,ended_at,cloudflare_live_input_uid,whep_url,whip_url,status"
                        .to_owned(),
                ),
                ("meeting_id", format!("eq.{meeting_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url, true).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MeetStreamLiveInputRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
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

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_matches_stream() {
        let (ws, meeting) =
            stream_path_params("/api/v1/workspaces/ws-abc/meetings/meet-xyz/stream")
                .expect("should match");
        assert_eq!(ws, "ws-abc");
        assert_eq!(meeting, "meet-xyz");
    }

    #[test]
    fn path_rejects_missing_segment() {
        assert!(stream_path_params("/api/v1/workspaces/ws-abc/meetings/meet-xyz").is_none());
    }

    #[test]
    fn path_rejects_wrong_suffix() {
        assert!(
            stream_path_params("/api/v1/workspaces/ws-abc/meetings/meet-xyz/recordings").is_none()
        );
    }

    #[test]
    fn path_rejects_empty_ws_id() {
        assert!(stream_path_params("/api/v1/workspaces//meetings/meet-xyz/stream").is_none());
    }

    #[test]
    fn path_rejects_empty_meeting_id() {
        assert!(stream_path_params("/api/v1/workspaces/ws-abc/meetings//stream").is_none());
    }

    #[test]
    fn resolve_internal_slug() {
        assert_eq!(
            resolve_workspace_id("internal"),
            ROOT_WORKSPACE_ID.to_owned()
        );
        assert_eq!(
            resolve_workspace_id("INTERNAL"),
            ROOT_WORKSPACE_ID.to_owned()
        );
    }

    #[test]
    fn resolve_regular_id_unchanged() {
        let id = "some-uuid-1234";
        assert_eq!(resolve_workspace_id(id), id.to_owned());
    }
}
