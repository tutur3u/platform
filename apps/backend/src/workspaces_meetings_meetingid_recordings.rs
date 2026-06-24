//! Handler for
//! `GET /api/v1/workspaces/:wsId/meetings/:meetingId/recordings`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/route.ts`.
//!
//! Behavior:
//!   1. Resolve the authenticated Supabase user
//!      (401 `{ "error": "Unauthorized" }`).
//!   2. Verify workspace membership of type `MEMBER`
//!      (500 `{ "error": "Failed to verify workspace membership" }` on lookup
//!      failure, 403 `{ "error": "Workspace access denied" }` when not a member).
//!   3. Verify the meeting exists in `workspace_meetings` by `id` + `ws_id`
//!      (404 `{ "error": "Meeting not found" }`).
//!   4. Validate the optional `status` query param against the set of distinct
//!      `status` values present in `recording_sessions`
//!      (500 `{ "error": "Failed to fetch valid statuses" }` on read failure,
//!      400 `{ "error": "Invalid status values", invalidStatuses, validStatuses }`
//!      when any requested value is unknown).
//!   5. Validate the optional `limit` query param (integer in `1..=100`,
//!      400 `{ "error": "Invalid limit. Must be a number between 1 and 100" }`).
//!   6. Query `recording_sessions` (`id,status,created_at,updated_at`,
//!      `meeting_id=eq`, `status != recording`, ordered `created_at` desc, with
//!      the optional status `in.()` filter and optional limit)
//!      (500 `{ "error": "Failed to fetch recording sessions" }`).
//!   7. Fetch `private.recording_transcripts` (`*`) for the matched session ids
//!      (500 `{ "error": "Failed to fetch recording transcripts" }`) and attach
//!      each transcript (or `null`) to its session.
//!   8. Return 200 `{ success: true, sessions: [ { ..., transcript } ] }`.
//!      Any unexpected failure returns 500 `{ "error": "Internal server error" }`.
//!
//! Notes / assumptions:
//!   - The legacy route relies on RLS via the caller's session for every read.
//!     This Worker port uses the service-role key for all reads, gating access
//!     with an explicit `workspace_members` membership check (`MEMBER`) before
//!     reading any data, mirroring `workspace_habits_access.rs` and
//!     `workspaces_meetings_recordings_play.rs`.
//!   - Legacy `verifyWorkspaceMembershipType` accepts any membership row; this
//!     port narrows to `type == "MEMBER"` to match the established port pattern
//!     (`workspaces_meetings_recordings_play.rs`). Integrator should confirm this
//!     is acceptable for non-`MEMBER` roles.
//!   - The `internal` slug is mapped to the root workspace id to match
//!     `resolveWorkspaceId` semantics; `personal` is not specially resolved here
//!     because the legacy route does not resolve it. The resolved id is used for
//!     both the membership check and the `workspace_meetings` lookup.
//!   - `recording_transcripts` lives in the `private` schema and is read with the
//!     `Accept-Profile: private` header, mirroring the legacy
//!     `sbAdmin.schema('private')` admin read.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
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
const VALID_STATUSES_FETCH_FAILED_MESSAGE: &str = "Failed to fetch valid statuses";
const INVALID_LIMIT_MESSAGE: &str = "Invalid limit. Must be a number between 1 and 100";
const SESSIONS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch recording sessions";
const TRANSCRIPTS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch recording transcripts";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct MeetingIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct StatusRow {
    status: Option<String>,
}

#[derive(Deserialize)]
struct RecordingSessionRow {
    id: Option<String>,
    status: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

/// A transcript row is returned verbatim (legacy `select('*')`), so capture it
/// as an arbitrary JSON object and key it by `session_id`.
#[derive(Deserialize)]
struct TranscriptRow {
    session_id: Option<String>,
    #[serde(flatten)]
    fields: serde_json::Map<String, Value>,
}

/// Path: `/api/v1/workspaces/<wsId>/meetings/<meetingId>/recordings`.
/// Returns `(ws_id, meeting_id)` when the path matches.
fn recordings_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = crate::path_segments(path);

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "meetings"
        && segments[6] == "recordings"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

pub(crate) async fn handle_workspaces_meetings_meetingid_recordings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, meeting_id) = recordings_path_params(request.path)?;

    Some(match request.method {
        "GET" => recordings_response(config, request, ws_id, meeting_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn recordings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    meeting_id: &str,
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

    // Verify the meeting exists and belongs to this workspace.
    match meeting_exists(contact_data, outbound, meeting_id, &resolved_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, MEETING_NOT_FOUND_MESSAGE),
        // Legacy ignores the lookup error and only checks for a missing row, so a
        // failed lookup surfaces as "Meeting not found".
        Err(()) => return message_response(404, MEETING_NOT_FOUND_MESSAGE),
    }

    // Parse query parameters.
    let status_param = query_param(request.url, "status");
    let limit_param = query_param(request.url, "limit");

    // Validate the status filter against the distinct statuses in the table.
    let mut statuses_to_filter: Vec<String> = Vec::new();
    if let Some(status_param) = status_param.as_deref().filter(|value| !value.is_empty()) {
        let valid_statuses = match distinct_recording_statuses(contact_data, outbound).await {
            Ok(statuses) => statuses,
            Err(()) => return message_response(500, VALID_STATUSES_FETCH_FAILED_MESSAGE),
        };

        let requested_statuses: Vec<String> = status_param
            .split(',')
            .map(|value| value.trim().to_owned())
            .collect();
        let invalid_statuses: Vec<String> = requested_statuses
            .iter()
            .filter(|value| !valid_statuses.contains(*value))
            .cloned()
            .collect();

        if !invalid_statuses.is_empty() {
            return no_store_response(json_response(
                400,
                json!({
                    "error": "Invalid status values",
                    "invalidStatuses": invalid_statuses,
                    "validStatuses": valid_statuses,
                }),
            ));
        }

        statuses_to_filter = requested_statuses;
    }

    // Validate the limit parameter (integer in 1..=100, JS parseInt-style prefix).
    let mut limit: Option<i64> = None;
    if let Some(limit_param) = limit_param.as_deref().filter(|value| !value.is_empty()) {
        match parse_js_int(limit_param) {
            Some(parsed) if (1..=100).contains(&parsed) => limit = Some(parsed),
            _ => return message_response(400, INVALID_LIMIT_MESSAGE),
        }
    }

    // Fetch the recording sessions.
    let sessions = match recording_sessions(
        contact_data,
        outbound,
        meeting_id,
        &statuses_to_filter,
        limit,
    )
    .await
    {
        Ok(sessions) => sessions,
        Err(()) => return message_response(500, SESSIONS_FETCH_FAILED_MESSAGE),
    };

    let session_ids: Vec<String> = sessions
        .iter()
        .filter_map(|session| session.id.clone())
        .collect();

    let transcripts = if session_ids.is_empty() {
        Vec::new()
    } else {
        match recording_transcripts(contact_data, outbound, &session_ids).await {
            Ok(transcripts) => transcripts,
            Err(()) => return message_response(500, TRANSCRIPTS_FETCH_FAILED_MESSAGE),
        }
    };

    let response_sessions: Vec<Value> = sessions
        .into_iter()
        .map(|session| {
            let transcript = session
                .id
                .as_deref()
                .and_then(|id| transcript_for_session(&transcripts, id))
                .unwrap_or(Value::Null);

            json!({
                "id": session.id,
                "status": session.status,
                "created_at": session.created_at,
                "updated_at": session.updated_at,
                "transcript": transcript,
            })
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "success": true,
            "sessions": response_sessions,
        }),
    ))
}

/// Build the `transcript` object for a session id from the fetched transcript
/// rows, reconstructing the original row shape (`session_id` + flattened fields).
fn transcript_for_session(transcripts: &[TranscriptRow], session_id: &str) -> Option<Value> {
    let transcript = transcripts
        .iter()
        .find(|row| row.session_id.as_deref() == Some(session_id))?;

    let mut object = transcript.fields.clone();
    object.insert(
        "session_id".to_owned(),
        Value::String(session_id.to_owned()),
    );
    Some(Value::Object(object))
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
    let Some(url) = contact_data.rest_url(
        "workspace_meetings",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{meeting_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<MeetingIdRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn distinct_recording_statuses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url("recording_sessions", &[("select", "status".to_owned())])
    else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<StatusRow>>().map_err(|_| ())?;
    let mut statuses: Vec<String> = Vec::new();
    for row in rows {
        if let Some(status) = row.status
            && !statuses.contains(&status)
        {
            statuses.push(status);
        }
    }
    Ok(statuses)
}

async fn recording_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    meeting_id: &str,
    statuses_to_filter: &[String],
    limit: Option<i64>,
) -> Result<Vec<RecordingSessionRow>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "id,status,created_at,updated_at".to_owned()),
        ("meeting_id", format!("eq.{meeting_id}")),
        ("status", "neq.recording".to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];

    if !statuses_to_filter.is_empty() {
        let joined = statuses_to_filter.join(",");
        params.push(("status", format!("in.({joined})")));
    }

    if let Some(limit) = limit {
        params.push(("limit", limit.to_string()));
    }

    let Some(url) = contact_data.rest_url("recording_sessions", &params) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<RecordingSessionRow>>().map_err(|_| ())
}

async fn recording_transcripts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_ids: &[String],
) -> Result<Vec<TranscriptRow>, ()> {
    let joined = session_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "recording_transcripts",
        &[
            ("select", "*".to_owned()),
            ("session_id", format!("in.({joined})")),
        ],
    ) else {
        return Err(());
    };
    // `recording_transcripts` lives in the `private` schema.
    let response = send_service_role_get(contact_data, outbound, &url, true).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<TranscriptRow>>().map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

/// Extract a query parameter from the request URL (returns the first occurrence).
fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    url.query_pairs()
        .find(|(name, _)| name.as_ref() == key)
        .map(|(_, value)| value.into_owned())
}

/// Mirror JS `parseInt(value, 10)`: parse the leading optional-sign integer
/// prefix, ignoring trailing non-digit characters. Returns `None` when no
/// digits lead the string (JS `NaN`).
fn parse_js_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    if matches!(bytes.first(), Some(b'+' | b'-')) {
        index += 1;
    }
    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == digits_start {
        return None;
    }
    trimmed.get(..index).and_then(|prefix| prefix.parse().ok())
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
