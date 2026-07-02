//! Handler for `GET /api/v1/hive/servers/:serverId/research-sessions`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/research-sessions/route.ts`
//!
//! ## Auth
//!
//! Mirrors `requireHiveAccess` from the legacy shared helper:
//!
//! - `401` `{ "error": "Unauthorized" }` — missing/invalid session.
//! - `500` `{ "error": "Failed to resolve Hive access" }` — internal error
//!   resolving access.
//! - `403` `{ "error": "Hive access required" }` — authenticated but no
//!   Hive access.
//!
//! ## Data layer gap — sort order
//!
//! The legacy `listHiveResearchSessions` queries a separate Hive Postgres
//! database (`HIVE_DATABASE_URL`) using a `CASE WHEN status = 'running' THEN 0
//! ELSE 1 END, started_at DESC` sort so that running sessions always appear
//! first. PostgREST does not support `CASE` expressions in the `order`
//! parameter, so this handler orders by `started_at.desc` only. The
//! `activeSession` field in the response is still computed correctly (first
//! session whose `status` equals `"running"`). The only observable difference
//! is that within `sessions`, a running session that has a lower `started_at`
//! than a non-running session will not bubble to the top.
//!
//! All other behaviour — auth, JSON shape, cache headers — is an exact match.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];
const HIVE_RESEARCH_SESSIONS_TABLE: &str = "hive_research_sessions";

// ----------------------------------------------------------------------------
// Database row type (PostgREST JSON shape).
// ----------------------------------------------------------------------------

#[derive(Deserialize)]
struct SessionRow {
    created_at: Option<String>,
    created_by: Option<String>,
    description: Option<String>,
    ended_at: Option<String>,
    id: Option<String>,
    #[serde(default)]
    metadata: Value,
    name: Option<String>,
    server_id: Option<String>,
    started_at: Option<String>,
    status: Option<String>,
    updated_at: Option<String>,
}

// ----------------------------------------------------------------------------
// Output session shape (mirrors mapHiveResearchSession).
// ----------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionOut {
    created_at: Option<String>,
    created_by: Option<String>,
    description: Option<String>,
    ended_at: Option<String>,
    id: Option<String>,
    metadata: Value,
    name: Option<String>,
    server_id: Option<String>,
    started_at: Option<String>,
    status: Option<String>,
    updated_at: Option<String>,
}

impl From<SessionRow> for SessionOut {
    fn from(row: SessionRow) -> Self {
        Self {
            created_at: row.created_at,
            created_by: row.created_by,
            description: row.description,
            ended_at: row.ended_at,
            id: row.id,
            metadata: row.metadata,
            name: row.name,
            server_id: row.server_id,
            started_at: row.started_at,
            status: row.status,
            updated_at: row.updated_at,
        }
    }
}

// ----------------------------------------------------------------------------
// Path guard.
// Matches exactly: /api/v1/hive/servers/{serverId}/research-sessions
// (7 non-empty segments, last segment must be "research-sessions").
// ----------------------------------------------------------------------------

fn parse_path(path: &str) -> Option<&str> {
    let segments = path_segments(path);
    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "research-sessions"
    {
        Some(segments[4])
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    let trimmed = match path.split('?').next() {
        Some(v) => v,
        None => path,
    };
    trimmed
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

// ----------------------------------------------------------------------------
// Route entry point.
// ----------------------------------------------------------------------------

pub(crate) async fn handle_hive_servers_serverid_research_sessions_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let server_id = parse_path(request.path)?;

    // Non-GET methods (POST, PATCH, DELETE) belong to the still-live Next.js
    // route handler. Return None so they fall through.
    Some(match request.method {
        "GET" => list_response(config, request, server_id, outbound).await,
        _ => return None,
    })
}

async fn list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // --- Auth gate: mirrors requireHiveAccess ---

    let user =
        match hive_access::authenticated_user(config, request, &HIVE_APP_SESSION_TARGETS, outbound)
            .await
        {
            Ok(user) => user,
            Err(()) => return unauthorized_response(),
        };

    let _access =
        match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
            Ok(access) => access,
            Err(()) => return failed_to_resolve_hive_access_response(),
        };

    if !_access.has_access() {
        return hive_access_required_response();
    }

    // --- Fetch sessions from Supabase REST ---

    let rows = match fetch_sessions(&config.contact_data, server_id, outbound).await {
        Ok(rows) => rows,
        Err(()) => return internal_error_response(),
    };

    let sessions: Vec<SessionOut> = rows.into_iter().map(SessionOut::from).collect();

    // activeSession: first session whose status is "running", or null.
    let active_session: Value = sessions
        .iter()
        .find(|s| s.status.as_deref() == Some("running"))
        .and_then(|s| serde_json::to_value(s).ok())
        .unwrap_or(Value::Null);

    let sessions_value = serde_json::to_value(&sessions).unwrap_or(Value::Array(vec![]));

    no_store_response(json_response(
        200,
        json!({
            "activeSession": active_session,
            "sessions": sessions_value,
        }),
    ))
}

// ----------------------------------------------------------------------------
// Supabase REST data access.
// ----------------------------------------------------------------------------

async fn fetch_sessions(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<SessionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_RESEARCH_SESSIONS_TABLE,
        &[
            (
                "select",
                "id,server_id,name,description,status,created_by,started_at,ended_at,metadata,created_at,updated_at"
                    .to_owned(),
            ),
            ("server_id", format!("eq.{server_id}")),
            ("status", "neq.archived".to_owned()),
            ("order", "started_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    service_role_get::<SessionRow>(contact_data, &url, outbound).await
}

async fn service_role_get<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    url: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<T>, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<T>>().map_err(|_| ())
}

// ----------------------------------------------------------------------------
// Error responses matching legacy status/body.
// ----------------------------------------------------------------------------

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

fn failed_to_resolve_hive_access_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to resolve Hive access" }),
    ))
}

fn hive_access_required_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "error": "Hive access required" }),
    ))
}

fn internal_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Internal Server Error" }),
    ))
}

// ----------------------------------------------------------------------------
// Tests (pure/sync helpers only; no async handler calls).
// ----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::parse_path;

    #[test]
    fn matches_valid_research_sessions_path() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/some-server-id/research-sessions"),
            Some("some-server-id")
        );
        assert_eq!(
            parse_path(
                "/api/v1/hive/servers/550e8400-e29b-41d4-a716-446655440000/research-sessions"
            ),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
    }

    #[test]
    fn matches_path_without_leading_slash() {
        assert_eq!(
            parse_path("api/v1/hive/servers/abc/research-sessions"),
            Some("abc")
        );
    }

    #[test]
    fn ignores_query_string() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv1/research-sessions?foo=bar"),
            Some("srv1")
        );
    }

    #[test]
    fn does_not_match_sub_routes() {
        // Sub-routes like /export are handled by separate modules.
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv1/research-sessions/session-id/export"),
            None
        );
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv1/research-sessions/session-id"),
            None
        );
    }

    #[test]
    fn does_not_match_wrong_last_segment() {
        assert_eq!(parse_path("/api/v1/hive/servers/srv1/economy"), None);
    }

    #[test]
    fn does_not_match_base_servers_path() {
        assert_eq!(parse_path("/api/v1/hive/servers"), None);
    }

    #[test]
    fn does_not_match_wrong_version() {
        assert_eq!(
            parse_path("/api/v2/hive/servers/srv1/research-sessions"),
            None
        );
    }

    #[test]
    fn does_not_match_empty_server_id() {
        // Would produce an empty segment which is filtered out, giving wrong count.
        assert_eq!(parse_path("/api/v1/hive/servers//research-sessions"), None);
    }
}
