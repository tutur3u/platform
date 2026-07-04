//! Handler for `GET /api/v1/workspaces/:wsId/time-tracking/breaks`.
//!
//! Ports the legacy Next.js GET handler from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/breaks/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route calls `resolveSessionAuthContext` with
//! `allowAppSessionAuth: true`, then verifies workspace membership via
//! `verifyWorkspaceMembershipType`. This handler mirrors that flow using
//! `supabase_auth::request_access_token` + `fetch_supabase_auth_user` for the
//! caller identity, then the same workspace-member check as the sibling
//! `workspaces_time_tracking_sessions_breaks_active` handler.
//!
//! ## Query parameters
//!
//! - `sessionId` — single session GUID (optional).
//! - `sessionIds` — comma-separated session GUIDs (optional).
//! - `summaryOnly` — `"true"` | `"false"` (optional, default `false`).
//!
//! At least one `sessionId` / `sessionIds` value must be supplied; the union is
//! de-duplicated before use.
//!
//! ## Response shapes
//!
//! **`summaryOnly=true`**
//!
//! ```json
//! { "breaksBySession": { "<session_id>": [{ "break_duration_seconds": 120 }] } }
//! ```
//!
//! **`summaryOnly=false` (default, single session only)**
//!
//! ```json
//! { "breaks": [ { /* all time_tracking_breaks columns + break_type embed */ } ] }
//! ```
//!
//! ## Behavior gaps vs. legacy
//!
//! - The `POST` method is not handled; this handler returns `None` for it so the
//!   request falls through to the still-live Next.js route.
//! - `request_access_token` does not distinguish regular session tokens from
//!   app-session tokens; both are forwarded the same way (same as the sibling
//!   breaks-active handler).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_time_tracking_breaks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = breaks_path_ws_id(request.path)?;

    Some(match request.method {
        "GET" => breaks_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn breaks_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Resolve workspace id (handles "personal", "internal", handles, UUIDs).
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(id) => id,
            Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    // Verify workspace membership.
    match verify_workspace_member(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Parse query parameters.
    let query = parse_query_params(request.url);

    // Collect and deduplicate session IDs.
    let session_ids = collect_session_ids(&query);

    if session_ids.is_empty() {
        return error_response(400, "At least one sessionId is required");
    }

    if query.summary_only {
        // Summary path: return total break durations grouped by session.
        match fetch_breaks_summary(contact_data, outbound, &session_ids, &ws_id, &user_id).await {
            Ok(by_session) => {
                no_store_response(json_response(200, json!({ "breaksBySession": by_session })))
            }
            Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    } else {
        if session_ids.len() > 1 {
            return error_response(400, "Detailed break fetch only supports a single sessionId");
        }
        let session_id = &session_ids[0];
        match fetch_breaks_detail(contact_data, outbound, session_id, &ws_id, &user_id).await {
            Ok(breaks) => no_store_response(json_response(200, json!({ "breaks": breaks }))),
            Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    }
}

// ---------------------------------------------------------------------------
// Query param parsing
// ---------------------------------------------------------------------------

struct BreakQueryParams {
    session_id: Option<String>,
    session_ids_raw: Option<String>,
    summary_only: bool,
}

fn parse_query_params(request_url: Option<&str>) -> BreakQueryParams {
    let mut session_id: Option<String> = None;
    let mut session_ids_raw: Option<String> = None;
    let mut summary_only = false;

    if let Some(raw_url) = request_url
        && let Ok(parsed) = url::Url::parse(raw_url)
    {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "sessionId" if !value.is_empty() => {
                    session_id = Some(value.into_owned());
                }
                "sessionIds" if !value.is_empty() => {
                    session_ids_raw = Some(value.into_owned());
                }
                "summaryOnly" => {
                    summary_only = value.as_ref() == "true";
                }
                _ => {}
            }
        }
    }

    BreakQueryParams {
        session_id,
        session_ids_raw,
        summary_only,
    }
}

/// Mirrors the legacy JS logic:
///
/// ```text
/// const requestedSessionIds = [
///   ...(parsedQuery.data.sessionId ? [parsedQuery.data.sessionId] : []),
///   ...(parsedQuery.data.sessionIds || '')
///     .split(',').map(id => id.trim()).filter(Boolean),
/// ];
/// const sessionIds = Array.from(new Set(requestedSessionIds));
/// ```
///
/// Invalid GUID values are silently dropped (the legacy validator only
/// rejects non-GUID `sessionId` — `sessionIds` has no per-element
/// validation).
fn collect_session_ids(query: &BreakQueryParams) -> Vec<String> {
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut ordered: Vec<String> = Vec::new();

    let push =
        |id: String, seen: &mut std::collections::HashSet<String>, ordered: &mut Vec<String>| {
            let trimmed = id.trim().to_owned();
            if !trimmed.is_empty() && seen.insert(trimmed.clone()) {
                ordered.push(trimmed);
            }
        };

    if let Some(ref sid) = query.session_id {
        push(sid.clone(), &mut seen, &mut ordered);
    }

    if let Some(ref raw) = query.session_ids_raw {
        for part in raw.split(',') {
            push(part.to_owned(), &mut seen, &mut ordered);
        }
    }

    ordered
}

// ---------------------------------------------------------------------------
// Supabase queries
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BreakSummaryRow {
    session_id: Option<String>,
    break_duration_seconds: Option<i64>,
}

#[derive(Serialize)]
struct BreakDurationEntry {
    break_duration_seconds: i64,
}

/// Fetch `time_tracking_breaks` rows for the summary path, then group them
/// by `session_id` in memory, mirroring the legacy JS aggregation.
async fn fetch_breaks_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_ids: &[String],
    ws_id: &str,
    user_id: &str,
) -> Result<HashMap<String, Vec<BreakDurationEntry>>, ()> {
    let select =
        "session_id,break_duration_seconds,session:time_tracking_sessions!inner(ws_id,user_id)";

    // PostgREST IN filter: session_id=in.(id1,id2,...)
    let in_filter = format!("in.({})", session_ids.join(","));

    let url = contact_data
        .rest_url(
            "time_tracking_breaks",
            &[
                ("select", select.to_owned()),
                ("session_id", in_filter),
                ("session.ws_id", format!("eq.{ws_id}")),
                ("session.user_id", format!("eq.{user_id}")),
                ("break_duration_seconds", "not.is.null".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<BreakSummaryRow>>().map_err(|_| ())?;

    let mut by_session: HashMap<String, Vec<BreakDurationEntry>> = HashMap::new();
    for row in rows {
        if let Some(sid) = row.session_id {
            by_session.entry(sid).or_default().push(BreakDurationEntry {
                break_duration_seconds: row.break_duration_seconds.unwrap_or(0),
            });
        }
    }

    Ok(by_session)
}

/// Fetch full break detail rows for a single session, then strip the embedded
/// `session` join field from each row (mirroring the legacy destructure
/// `{ session: _session, ...breakRecord }`).
async fn fetch_breaks_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_id: &str,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let select =
        "*,break_type:workspace_break_types(*),session:time_tracking_sessions!inner(ws_id,user_id)";

    let url = contact_data
        .rest_url(
            "time_tracking_breaks",
            &[
                ("select", select.to_owned()),
                ("session_id", format!("eq.{session_id}")),
                ("session.ws_id", format!("eq.{ws_id}")),
                ("session.user_id", format!("eq.{user_id}")),
                ("order", "break_start.desc".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    // Strip the embedded `session` key from each row.
    let breaks = rows
        .into_iter()
        .map(|mut row| {
            if let Value::Object(ref mut map) = row {
                map.remove("session");
            }
            row
        })
        .collect();

    Ok(breaks)
}

// ---------------------------------------------------------------------------
// Auth / workspace helpers (mirrored from breaks-active sibling handler)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved);
        }

        if let Some(ws_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(ws_id);
        }
        if let Some(ws_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(ws_id);
        }
    }

    Ok(resolved)
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

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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

async fn workspace_id_by_handle(
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

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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

async fn workspace_id_by_handle_service_role(
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

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Match `/api/v1/workspaces/{wsId}/time-tracking/breaks` and return the raw
/// `wsId` segment. Returns `None` when the path does not match this shape.
fn breaks_path_ws_id(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    if segments.len() == 6
        && segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(3).map(|s| !s.is_empty()).unwrap_or(false)
        && segments.get(4) == Some(&"time-tracking")
        && segments.get(5) == Some(&"breaks")
    {
        segments.get(3).copied()
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Workspace id helpers
// ---------------------------------------------------------------------------

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, ch)| {
        let is_edge = index == 0 || index + 1 == length;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!is_edge && matches!(ch, '_' | '-'))
    })
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- path guard ---

    #[test]
    fn path_matches_exact_shape() {
        let ws_id = "11111111-1111-1111-1111-111111111111";
        let path = format!("/api/v1/workspaces/{ws_id}/time-tracking/breaks");
        assert_eq!(breaks_path_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn path_no_leading_slash() {
        let ws_id = "11111111-1111-1111-1111-111111111111";
        let path = format!("api/v1/workspaces/{ws_id}/time-tracking/breaks");
        assert_eq!(breaks_path_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn path_wrong_suffix_returns_none() {
        assert!(breaks_path_ws_id("/api/v1/workspaces/ws123/time-tracking/sessions").is_none());
    }

    #[test]
    fn path_extra_segment_returns_none() {
        assert!(breaks_path_ws_id("/api/v1/workspaces/ws123/time-tracking/breaks/extra").is_none());
    }

    #[test]
    fn path_missing_ws_id_returns_none() {
        assert!(breaks_path_ws_id("/api/v1/workspaces//time-tracking/breaks").is_none());
    }

    // --- query param parsing ---

    #[test]
    fn parse_session_id_only() {
        let url = "https://host/api/v1/workspaces/ws/time-tracking/breaks\
            ?sessionId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        let q = parse_query_params(Some(url));
        assert_eq!(
            q.session_id.as_deref(),
            Some("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        );
        assert!(q.session_ids_raw.is_none());
        assert!(!q.summary_only);
    }

    #[test]
    fn parse_summary_only_true() {
        let url = "https://host/path?sessionId=id1&summaryOnly=true";
        let q = parse_query_params(Some(url));
        assert!(q.summary_only);
    }

    #[test]
    fn parse_summary_only_false() {
        let url = "https://host/path?sessionId=id1&summaryOnly=false";
        let q = parse_query_params(Some(url));
        assert!(!q.summary_only);
    }

    #[test]
    fn parse_no_url() {
        let q = parse_query_params(None);
        assert!(q.session_id.is_none());
        assert!(!q.summary_only);
    }

    // --- collect_session_ids ---

    #[test]
    fn collect_single_session_id() {
        let q = BreakQueryParams {
            session_id: Some("aaa".to_owned()),
            session_ids_raw: None,
            summary_only: false,
        };
        assert_eq!(collect_session_ids(&q), vec!["aaa"]);
    }

    #[test]
    fn collect_deduplicates() {
        let q = BreakQueryParams {
            session_id: Some("aaa".to_owned()),
            session_ids_raw: Some("aaa,bbb".to_owned()),
            summary_only: false,
        };
        let ids = collect_session_ids(&q);
        assert_eq!(ids, vec!["aaa", "bbb"]);
    }

    #[test]
    fn collect_trims_whitespace() {
        let q = BreakQueryParams {
            session_id: None,
            session_ids_raw: Some(" aaa , bbb ".to_owned()),
            summary_only: false,
        };
        let ids = collect_session_ids(&q);
        assert_eq!(ids, vec!["aaa", "bbb"]);
    }

    #[test]
    fn collect_empty_when_no_params() {
        let q = BreakQueryParams {
            session_id: None,
            session_ids_raw: None,
            summary_only: false,
        };
        assert!(collect_session_ids(&q).is_empty());
    }

    // --- workspace id helpers ---

    #[test]
    fn uuid_literal_recognised() {
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
    }

    #[test]
    fn handle_recognised() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-starts-with-dash"));
    }

    #[test]
    fn resolve_internal_slug() {
        assert_eq!(
            resolve_workspace_id(INTERNAL_WORKSPACE_SLUG),
            ROOT_WORKSPACE_ID
        );
        assert_eq!(resolve_workspace_id("other"), "other");
    }
}
