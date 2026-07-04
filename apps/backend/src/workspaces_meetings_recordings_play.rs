//! Handler for
//! `GET /api/v1/workspaces/:wsId/meetings/:meetingId/recordings/:sessionId/play`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/play/route.ts`.
//!
//! Behavior:
//!   1. Resolve the authenticated Supabase user (401 `{ "error": "Unauthorized" }`).
//!   2. Verify workspace membership of type `MEMBER`
//!      (500 `{ "error": "Failed to verify workspace membership" }` on lookup
//!      failure, 403 `{ "error": "Workspace access denied" }` when not a member).
//!   3. Load the `recording_sessions` row by `id` + `meeting_id`
//!      (404 `{ "error": "Recording session not found" }`).
//!   4. Load all `audio_chunks` for the session ordered by `chunk_order` asc
//!      (500 `{ "error": "Failed to fetch audio chunks" }` on read failure,
//!      404 `{ "error": "No audio chunks found for this recording session" }`
//!      when empty).
//!   5. Create a 1-hour signed Storage URL for each chunk and drop those without
//!      a URL (404 `{ "error": "No valid audio chunks found" }` when none
//!      remain).
//!   6. Return 200
//!      `{ success: true, sessionId, sessionStatus, chunks: [...], message }`.
//!
//! Notes / assumptions:
//!   - The legacy route relies on RLS via the caller's session for every read
//!     (recording_sessions, audio_chunks, membership). This Worker port uses the
//!     service-role key for all reads, gating access with an explicit
//!     `workspace_members` membership check (MEMBER) before reading any data,
//!     mirroring `workspace_habits_access.rs`.
//!   - `wsId` is used as-is for the membership lookup, matching the legacy
//!     `verifyWorkspaceMembershipType({ wsId, ... })` which does NOT normalize
//!     the identifier. The `internal` slug is mapped to the root workspace id to
//!     match `resolveWorkspaceId` semantics used elsewhere; `personal` is not
//!     specially resolved here because the legacy route does not resolve it.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const STORAGE_BUCKET: &str = "workspaces";
const SIGNED_URL_EXPIRES_IN: u32 = 3600;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const SESSION_NOT_FOUND_MESSAGE: &str = "Recording session not found";
const CHUNKS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch audio chunks";
const NO_CHUNKS_MESSAGE: &str = "No audio chunks found for this recording session";
const NO_VALID_CHUNKS_MESSAGE: &str = "No valid audio chunks found";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const SUCCESS_MESSAGE: &str = "Audio chunks retrieved successfully";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct RecordingSessionRow {
    status: Option<String>,
}

#[derive(Deserialize)]
struct AudioChunkRow {
    id: Option<String>,
    chunk_order: Option<i64>,
    storage_path: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct SignedUrlRow {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

#[derive(Serialize)]
struct PlaybackChunk {
    #[serde(rename = "chunkId")]
    chunk_id: Option<String>,
    #[serde(rename = "chunkOrder")]
    chunk_order: Option<i64>,
    url: String,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
}

/// Path: `/api/v1/workspaces/<wsId>/meetings/<meetingId>/recordings/<sessionId>/play`.
/// Returns `(ws_id, meeting_id, session_id)` when the path matches.
fn playback_path_params(path: &str) -> Option<(&str, &str, &str)> {
    let segments = crate::path_segments(path);

    if segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "meetings"
        && segments[6] == "recordings"
        && segments[8] == "play"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
        && !segments[7].is_empty()
    {
        Some((segments[3], segments[5], segments[7]))
    } else {
        None
    }
}

pub(crate) async fn handle_workspaces_meetings_recordings_play_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, meeting_id, session_id) = playback_path_params(request.path)?;

    Some(match request.method {
        "GET" => playback_response(config, request, ws_id, meeting_id, session_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn playback_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    meeting_id: &str,
    session_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

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

    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Verify the recording session exists and belongs to this meeting.
    let session = match recording_session(contact_data, outbound, session_id, meeting_id).await {
        Ok(Some(session)) => session,
        Ok(None) => return message_response(404, SESSION_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    // Get all audio chunks for this session.
    let chunks = match audio_chunks(contact_data, outbound, session_id).await {
        Ok(chunks) => chunks,
        Err(()) => return message_response(500, CHUNKS_FETCH_FAILED_MESSAGE),
    };

    if chunks.is_empty() {
        return message_response(404, NO_CHUNKS_MESSAGE);
    }

    // Generate signed URLs for each chunk, dropping any without a valid URL.
    let mut valid_chunks: Vec<PlaybackChunk> = Vec::new();
    for chunk in chunks {
        let Some(storage_path) = chunk.storage_path.as_deref() else {
            continue;
        };
        let Some(signed_url) = create_signed_url(contact_data, outbound, storage_path).await else {
            continue;
        };

        valid_chunks.push(PlaybackChunk {
            chunk_id: chunk.id,
            chunk_order: chunk.chunk_order,
            url: signed_url,
            created_at: chunk.created_at,
        });
    }

    if valid_chunks.is_empty() {
        return message_response(404, NO_VALID_CHUNKS_MESSAGE);
    }

    no_store_response(json_response(
        200,
        json!({
            "success": true,
            "sessionId": session_id,
            "sessionStatus": session.status,
            "chunks": valid_chunks,
            "message": SUCCESS_MESSAGE,
        }),
    ))
}

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
    let response = send_service_role_get(contact_data, outbound, &url).await?;

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

async fn recording_session(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_id: &str,
    meeting_id: &str,
) -> Result<Option<RecordingSessionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "recording_sessions",
        &[
            ("select", "status".to_owned()),
            ("id", format!("eq.{session_id}")),
            ("meeting_id", format!("eq.{meeting_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RecordingSessionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn audio_chunks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_id: &str,
) -> Result<Vec<AudioChunkRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "audio_chunks",
        &[
            (
                "select",
                "id,chunk_order,storage_path,created_at".to_owned(),
            ),
            ("session_id", format!("eq.{session_id}")),
            ("order", "chunk_order.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<AudioChunkRow>>().map_err(|_| ())
}

/// Create a signed Storage URL via `POST <origin>/storage/v1/object/sign/<bucket>/<path>`
/// with `{ "expiresIn": 3600 }`, mirroring the Supabase JS client. Returns the
/// fully-qualified `signedUrl` (`<origin>/storage/v1` + the returned
/// `signedURL`), or `None` when signing fails or no URL is returned.
async fn create_signed_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_path: &str,
) -> Option<String> {
    let storage_base = storage_origin(contact_data)?;
    let service_role_key = contact_data.service_role_key()?;
    let authorization = format!("Bearer {service_role_key}");
    let url = format!("{storage_base}/object/sign/{STORAGE_BUCKET}/{storage_path}");
    let body = json!({ "expiresIn": SIGNED_URL_EXPIRES_IN }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    let signed = response.json::<SignedUrlRow>().ok()?.signed_url?;
    if signed.trim().is_empty() {
        return None;
    }

    Some(format!("{storage_base}{signed}"))
}

/// Derive the Supabase Storage base (`<origin>/storage/v1`) from the REST base
/// URL. `ContactDataConfig` exposes no raw origin accessor, so reuse `rest_url`
/// and rewrite the `/rest/v1/...` segment to `/storage/v1`.
fn storage_origin(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest_url = contact_data.rest_url("__origin__", &[])?;
    let origin = rest_url.split("/rest/v1/").next()?;
    if origin.is_empty() {
        return None;
    }
    Some(format!("{origin}/storage/v1"))
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
