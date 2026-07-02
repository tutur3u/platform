//! Handler for `GET /api/v1/hive/servers/:serverId/workflows/:workflowId`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/workflows/[workflowId]/route.ts`
//!
//! ## Auth model
//!
//! Mirrors `requireHiveAccess` from the legacy `_shared.ts`:
//!
//! - `401` `{ "error": "Unauthorized" }` — missing/invalid session.
//! - `500` `{ "error": "Failed to resolve Hive access" }` — internal error
//!   while resolving access.
//! - `403` `{ "error": "Hive access required" }` — authenticated but lacks
//!   access (neither member nor admin).
//!
//! ## Data access
//!
//! The legacy `getHiveWorkflow` queries the `hive_workflows` table which lives
//! in the main Supabase Postgres instance (migration
//! `20260514150000_add_hive_graph_workflows.sql`). This handler reads it through
//! the Supabase REST endpoint with the service-role key, applying the same
//! filters as the legacy store function:
//!
//! - `id = workflowId`
//! - `server_id = serverId`
//! - `archived_at IS NULL`
//! - if the caller is NOT an admin: `enabled = true` (non-admin members only
//!   see enabled workflows).
//!
//! ## Portability note — non-GET methods
//!
//! PATCH and DELETE are NOT handled here. `return None` lets them fall through
//! to the still-live Next.js route handlers.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];
const HIVE_WORKFLOWS_TABLE: &str = "hive_workflows";

// ----------------------------------------------------------------------------
// Database row and output types.
// ----------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkflowRow {
    archived_at: Option<String>,
    created_at: Option<String>,
    created_by: Option<String>,
    #[serde(default)]
    definition: Value,
    description: Option<String>,
    enabled: Option<bool>,
    id: Option<String>,
    name: Option<String>,
    server_id: Option<String>,
    updated_at: Option<String>,
    updated_by: Option<String>,
    version: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowOut {
    archived_at: Option<String>,
    created_at: Option<String>,
    created_by: Option<String>,
    definition: Value,
    description: Option<String>,
    enabled: Option<bool>,
    id: Option<String>,
    name: Option<String>,
    server_id: Option<String>,
    updated_at: Option<String>,
    updated_by: Option<String>,
    version: Option<i64>,
}

impl From<WorkflowRow> for WorkflowOut {
    fn from(row: WorkflowRow) -> Self {
        Self {
            archived_at: row.archived_at,
            created_at: row.created_at,
            created_by: row.created_by,
            definition: row.definition,
            description: row.description,
            enabled: row.enabled,
            id: row.id,
            name: row.name,
            server_id: row.server_id,
            updated_at: row.updated_at,
            updated_by: row.updated_by,
            version: row.version,
        }
    }
}

// ----------------------------------------------------------------------------
// Route entry point.
// ----------------------------------------------------------------------------

pub(crate) async fn handle_hive_servers_serverid_workflows_workflowid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (server_id, workflow_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, server_id, workflow_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    workflow_id: &str,
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

    // --- Fetch the workflow ---

    let workflow = match fetch_workflow(
        &config.contact_data,
        server_id,
        workflow_id,
        access.is_admin,
        outbound,
    )
    .await
    {
        Ok(Some(wf)) => wf,
        Ok(None) => return workflow_not_found_response(),
        Err(()) => return internal_error_response(),
    };

    let workflow_value = serde_json::to_value(WorkflowOut::from(workflow)).unwrap_or(Value::Null);

    no_store_response(json_response(200, json!({ "workflow": workflow_value })))
}

// ----------------------------------------------------------------------------
// Data fetching.
// ----------------------------------------------------------------------------

async fn fetch_workflow(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    workflow_id: &str,
    is_admin: bool,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<WorkflowRow>, ()> {
    // Build filter list — admins can see disabled workflows; members can only
    // see enabled ones. This mirrors the legacy SQL:
    //   and (${isAdmin} or enabled = true)
    let mut filters: Vec<(&str, String)> = vec![
        (
            "select",
            "id,server_id,name,description,enabled,version,definition,\
             created_by,updated_by,archived_at,created_at,updated_at"
                .to_owned(),
        ),
        ("id", format!("eq.{workflow_id}")),
        ("server_id", format!("eq.{server_id}")),
        ("archived_at", "is.null".to_owned()),
        ("limit", "1".to_owned()),
    ];

    if !is_admin {
        filters.push(("enabled", "eq.true".to_owned()));
    }

    let Some(url) = contact_data.rest_url(HIVE_WORKFLOWS_TABLE, &filters) else {
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

    let rows = response.json::<Vec<WorkflowRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

// ----------------------------------------------------------------------------
// Path matching:
// /api/v1/hive/servers/{serverId}/workflows/{workflowId}  (7 segments)
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
        && segments[5] == "workflows"
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

fn workflow_not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({ "error": "Hive workflow not found" }),
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
        let result = parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2");
        assert_eq!(result, Some(("srv-1", "wf-2")));
    }

    #[test]
    fn matches_uuid_segments() {
        let result = parse_path(
            "/api/v1/hive/servers/550e8400-e29b-41d4-a716-446655440000/\
             workflows/660e8400-e29b-41d4-a716-446655440000",
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
        let result = parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2?foo=bar");
        assert_eq!(result, Some(("srv-1", "wf-2")));
    }

    #[test]
    fn does_not_match_sub_routes() {
        // Any path with more than 7 segments should not match.
        let result = parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2/runs");
        assert_eq!(result, None);
    }

    #[test]
    fn does_not_match_short_paths() {
        assert_eq!(parse_path("/api/v1/hive/servers/srv-1/workflows"), None);
        assert_eq!(parse_path("/api/v1/hive/servers/srv-1"), None);
    }

    #[test]
    fn does_not_match_empty_server_id() {
        assert_eq!(parse_path("/api/v1/hive/servers//workflows/wf-2"), None);
    }

    #[test]
    fn does_not_match_empty_workflow_id() {
        assert_eq!(parse_path("/api/v1/hive/servers/srv-1/workflows/"), None);
    }

    #[test]
    fn does_not_match_wrong_version() {
        assert_eq!(
            parse_path("/api/v2/hive/servers/srv-1/workflows/wf-2"),
            None
        );
    }

    #[test]
    fn does_not_match_wrong_resource_name() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv-1/research-sessions/sess-2"),
            None
        );
    }

    #[test]
    fn works_without_leading_slash() {
        let result = parse_path("api/v1/hive/servers/srv-1/workflows/wf-2");
        assert_eq!(result, Some(("srv-1", "wf-2")));
    }
}
