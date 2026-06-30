//! Handler for `GET /api/v1/hive/servers/:serverId/research-sessions/:sessionId`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/research-sessions/[sessionId]/route.ts`
//!
//! ## Auth model
//!
//! Mirrors `requireHiveAccess` from the legacy `_shared.ts`:
//!
//! - `401` `{ "error": "Unauthorized" }` — missing/invalid session.
//! - `500` `{ "error": "Failed to resolve Hive access" }` — internal error
//!   while resolving access.
//! - `403` `{ "error": "Hive access required" }` — authenticated but lacks
//!   access.
//!
//! ## Data access
//!
//! The legacy `getHiveResearchSession` reads from the separate Hive Postgres
//! database via `HIVE_DATABASE_URL`. This handler reaches the same
//! `hive_research_sessions` table through the Supabase REST endpoint with the
//! service-role key, mirroring the pattern used in
//! `hive_servers_research_sessions_export.rs`.
//!
//! ## Portability note
//!
//! The PATCH method is NOT handled here. `return None` for PATCH lets the
//! request fall through to the still-live Next.js route handler.

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
// Database row and output types.
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
// Route entry point.
// ----------------------------------------------------------------------------

pub(crate) async fn handle_hive_servers_serverid_research_sessions_sessionid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (server_id, session_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, server_id, session_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    session_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // --- Auth gate: mirrors `requireHiveAccess` ---

    let user =
        match hive_access::authenticated_user(config, request, &HIVE_APP_SESSION_TARGETS, outbound)
            .await
        {
            Ok(user) => user,
            Err(()) => return unauthorized_response(),
        };

    let access =
        match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
            Ok(access) => access,
            Err(()) => return failed_to_resolve_hive_access_response(),
        };

    if !access.has_access() {
        return hive_access_required_response();
    }

    // --- Fetch the session ---

    let session = match fetch_session(&config.contact_data, server_id, session_id, outbound).await {
        Ok(Some(session)) => session,
        Ok(None) => return session_not_found_response(),
        Err(()) => return internal_error_response(),
    };

    let session_value = serde_json::to_value(SessionOut::from(session)).unwrap_or(Value::Null);

    no_store_response(json_response(200, json!({ "session": session_value })))
}

// ----------------------------------------------------------------------------
// Data fetching.
// ----------------------------------------------------------------------------

async fn fetch_session(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    session_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<SessionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_RESEARCH_SESSIONS_TABLE,
        &[
            (
                "select",
                "id,server_id,name,description,status,created_by,started_at,ended_at,metadata,created_at,updated_at"
                    .to_owned(),
            ),
            ("id", format!("eq.{session_id}")),
            ("server_id", format!("eq.{server_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<SessionRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

// ----------------------------------------------------------------------------
// Path matching:
// /api/v1/hive/servers/{serverId}/research-sessions/{sessionId}  (7 segments)
// ----------------------------------------------------------------------------

fn parse_path(path: &str) -> Option<(&str, &str)> {
    let trimmed = path.split('?').next().unwrap_or(path);
    let segments: Vec<&str> = trimmed
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "research-sessions"
        && !segments[6].is_empty()
    {
        Some((segments[4], segments[6]))
    } else {
        None
    }
}

// ----------------------------------------------------------------------------
// Error responses.
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

fn session_not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({ "error": "Hive research session not found" }),
    ))
}

fn internal_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Internal Server Error" }),
    ))
}

// ----------------------------------------------------------------------------
// Tests.
// ----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::parse_path;

    #[test]
    fn matches_valid_path() {
        let result = parse_path("/api/v1/hive/servers/srv-1/research-sessions/sess-2");
        assert_eq!(result, Some(("srv-1", "sess-2")));
    }

    #[test]
    fn matches_uuid_segments() {
        let result = parse_path(
            "/api/v1/hive/servers/550e8400-e29b-41d4-a716-446655440000/research-sessions/660e8400-e29b-41d4-a716-446655440000",
        );
        assert_eq!(
            result,
            Some((
                "550e8400-e29b-41d4-a716-446655440000",
                "660e8400-e29b-41d4-a716-446655440000"
            ))
        );
    }

    #[test]
    fn strips_query_string_before_matching() {
        let result = parse_path("/api/v1/hive/servers/srv-1/research-sessions/sess-2?foo=bar");
        assert_eq!(result, Some(("srv-1", "sess-2")));
    }

    #[test]
    fn does_not_match_export_sub_route() {
        // Export route has 8 segments ending in "export".
        let result = parse_path("/api/v1/hive/servers/srv-1/research-sessions/sess-2/export");
        assert_eq!(result, None);
    }

    #[test]
    fn does_not_match_short_paths() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv-1/research-sessions"),
            None
        );
        assert_eq!(parse_path("/api/v1/hive/servers/srv-1"), None);
    }

    #[test]
    fn does_not_match_empty_server_id() {
        assert_eq!(
            parse_path("/api/v1/hive/servers//research-sessions/sess-2"),
            None
        );
    }

    #[test]
    fn does_not_match_empty_session_id() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv-1/research-sessions/"),
            None
        );
    }

    #[test]
    fn does_not_match_wrong_version() {
        assert_eq!(
            parse_path("/api/v2/hive/servers/srv-1/research-sessions/sess-2"),
            None
        );
    }

    #[test]
    fn works_without_leading_slash() {
        let result = parse_path("api/v1/hive/servers/srv-1/research-sessions/sess-2");
        assert_eq!(result, Some(("srv-1", "sess-2")));
    }
}
