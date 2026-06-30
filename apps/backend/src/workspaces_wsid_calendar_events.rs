//! Handler for `GET /api/v1/workspaces/:wsId/calendar/events`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendar/events/route.ts`
//! (GET only; the legacy `POST` insert path stays live in Next.js, so this
//! handler returns `None` for every non-GET method).
//!
//! Legacy GET flow:
//!
//!   1. `resolveSessionAuthContext(request, { allowAppSessionAuth: true })`
//!      resolves the caller. Failure -> `401 { "error": "Unauthorized" }`.
//!   2. `verifyWorkspaceMembershipType({ wsId, userId, supabase })` with the
//!      default `requiredType: 'MEMBER'`. A lookup error maps to
//!      `500 { "error": "Failed to verify workspace membership" }`; a missing
//!      or non-`MEMBER` membership maps to
//!      `403 { "error": "Workspace access denied" }`.
//!   3. Validates that `start_at` and `end_at` query params are present;
//!      missing params -> `400 { "error": "Start and end dates are required" }`.
//!   4. Reads `workspace_calendar_events` with the admin (service-role) client
//!      (RLS bypassed), filtered by `ws_id`, date-range overlap
//!      (`start_at < end_at_param` AND `end_at > start_at_param`), ordered
//!      ascending by `start_at`.
//!   5. Returns `200 { "data": [...], "count": N }`.
//!
//! Behavior notes / gaps:
//!
//!   * The legacy route calls `decryptEventsFromStorage` to transparently
//!     decrypt E2EE-encrypted event fields (title, description, location).
//!     Reproducing that key-derivation chain is too heavy to port here, so
//!     encrypted events are returned as-is with their cipher-text values.
//!     Workspaces that have not enabled E2EE are unaffected — their events
//!     are stored in plain text and returned correctly.
//!   * The legacy route accepts app-session tokens
//!     (`allowAppSessionAuth: true`). App-session callers fall through to the
//!     still-live Next.js route; this handler implements only the common
//!     Supabase-session path (bearer token or `sb-*-auth-token` cookie).
//!   * The raw `wsId` path segment is forwarded without normalization
//!     (`normalizeWorkspaceId` is not applied here), matching the behavior of
//!     sibling calendar handlers in this crate.

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
const DATES_REQUIRED_MESSAGE: &str = "Start and end dates are required";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "An error occurred while processing your request";

pub(crate) async fn handle_workspaces_wsid_calendar_events_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = calendar_events_ws_id(request.path)?;

    Some(match request.method {
        "GET" => events_get_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn events_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    // Resolve the caller's Supabase session (excludes app-session tokens).
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

    // Mirror `verifyWorkspaceMembershipType` with default `requiredType: 'MEMBER'`.
    match verify_workspace_membership(contact_data, outbound, ws_id, &user_id, &access_token).await
    {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Validate required date-range query params.
    let (start_at, end_at) = match parse_date_range_params(request.url) {
        Some(pair) => pair,
        None => return error_response(400, DATES_REQUIRED_MESSAGE),
    };

    match fetch_calendar_events(contact_data, outbound, ws_id, &start_at, &end_at).await {
        Ok(events) => {
            let count = events.len();
            no_store_response(json_response(
                200,
                json!({ "data": events, "count": count }),
            ))
        }
        Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

/// Mirrors `verifyWorkspaceMembershipType` with the default `requiredType:
/// 'MEMBER'`. Returns `Ok(true)` for a `MEMBER` membership, `Ok(false)` for a
/// missing or non-`MEMBER` membership (legacy `403`), and `Err(())` for a
/// lookup failure (legacy `500`).
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

    #[derive(serde::Deserialize)]
    struct MembershipRow {
        #[serde(rename = "type")]
        membership_type: Option<String>,
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

/// Reads `workspace_calendar_events` via the service-role client (bypassing
/// RLS) to match the legacy `sbAdmin` data access pattern. Applies the
/// date-range overlap filter used by the legacy route:
///   `start_at < end_at_param` AND `end_at > start_at_param`.
async fn fetch_calendar_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    start_at: &str,
    end_at: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_calendar_events",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                // Event starts before range ends.
                ("start_at", format!("lt.{end_at}")),
                // Event ends after range starts.
                ("end_at", format!("gt.{start_at}")),
                ("order", "start_at".to_owned()),
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

    response.json::<Vec<Value>>().map_err(|_| ())
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

/// Extracts and validates `start_at` and `end_at` from the request URL's query
/// string. Returns `None` if either param is absent or empty, matching the
/// legacy `400` branch.
fn parse_date_range_params(request_url: Option<&str>) -> Option<(String, String)> {
    let parsed = url::Url::parse(request_url?).ok()?;
    let mut start_at = None;
    let mut end_at = None;
    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "start_at" if !value.is_empty() => start_at = Some(value.into_owned()),
            "end_at" if !value.is_empty() => end_at = Some(value.into_owned()),
            _ => {}
        }
    }
    Some((start_at?, end_at?))
}

fn calendar_events_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "calendar", "events"] if !ws_id.is_empty() => {
            Some(ws_id)
        }
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
    fn ws_id_matches_exact_mount_path() {
        assert_eq!(
            calendar_events_ws_id("/api/v1/workspaces/ws-123/calendar/events"),
            Some("ws-123")
        );
    }

    #[test]
    fn ws_id_ignores_unrelated_paths() {
        // Missing `v1` prefix.
        assert_eq!(
            calendar_events_ws_id("/api/workspaces/ws-123/calendar/events"),
            None
        );
        // Trailing segment (e.g. a specific event ID).
        assert_eq!(
            calendar_events_ws_id("/api/v1/workspaces/ws-123/calendar/events/evt-1"),
            None
        );
        // Sibling resource.
        assert_eq!(
            calendar_events_ws_id("/api/v1/workspaces/ws-123/calendar/categories"),
            None
        );
        // Short path must not panic.
        assert_eq!(calendar_events_ws_id("/api/v1/workspaces"), None);
    }

    #[test]
    fn ws_id_rejects_empty_workspace_segment() {
        assert_eq!(
            calendar_events_ws_id("/api/v1/workspaces//calendar/events"),
            None
        );
    }

    #[test]
    fn parse_date_range_params_accepts_both_params() {
        let result = parse_date_range_params(Some(
            "https://example.com/api/v1/workspaces/ws-1/calendar/events\
             ?start_at=2024-01-01T00:00:00Z&end_at=2024-01-31T23:59:59Z",
        ));
        assert_eq!(
            result,
            Some((
                "2024-01-01T00:00:00Z".to_owned(),
                "2024-01-31T23:59:59Z".to_owned()
            ))
        );
    }

    #[test]
    fn parse_date_range_params_rejects_missing_start_at() {
        let result = parse_date_range_params(Some(
            "https://example.com/api/path?end_at=2024-01-31T23:59:59Z",
        ));
        assert!(result.is_none());
    }

    #[test]
    fn parse_date_range_params_rejects_missing_end_at() {
        let result = parse_date_range_params(Some(
            "https://example.com/api/path?start_at=2024-01-01T00:00:00Z",
        ));
        assert!(result.is_none());
    }

    #[test]
    fn parse_date_range_params_rejects_empty_values() {
        let result = parse_date_range_params(Some(
            "https://example.com/api/path?start_at=&end_at=2024-01-31T23:59:59Z",
        ));
        assert!(result.is_none());
    }

    #[test]
    fn parse_date_range_params_returns_none_for_missing_url() {
        assert!(parse_date_range_params(None).is_none());
    }

    #[test]
    fn error_response_uses_legacy_error_key() {
        let resp = error_response(400, DATES_REQUIRED_MESSAGE);
        assert_eq!(resp.status, 400);
        assert_eq!(
            resp.body,
            json!({ "error": "Start and end dates are required" })
        );

        let resp = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(resp.status, 401);
        assert_eq!(resp.body, json!({ "error": "Unauthorized" }));

        let resp = error_response(403, ACCESS_DENIED_MESSAGE);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "error": "Workspace access denied" }));

        let resp = error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        assert_eq!(resp.status, 500);
        assert_eq!(
            resp.body,
            json!({ "error": "Failed to verify workspace membership" })
        );
    }
}
