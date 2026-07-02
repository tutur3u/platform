//! Handler for `GET /api/v1/hive/servers/:serverId/workflows`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/workflows/route.ts`
//!
//! ## Auth model
//!
//! Mirrors `requireHiveAccess` from the legacy `_shared.ts`:
//!
//! - `401` `{ "error": "Unauthorized" }` — missing or invalid session.
//! - `500` `{ "error": "Failed to resolve Hive access" }` — internal error
//!   resolving access.
//! - `403` `{ "error": "Hive access required" }` — authenticated but lacks
//!   member or admin access.
//!
//! ## Data access
//!
//! The legacy `listHiveWorkflows` helper queries `hive_workflows` via the
//! `HIVE_DATABASE_URL` direct Postgres connection.  This Worker reads the same
//! table through Supabase REST (PostgREST), following the pattern established
//! by `hive_servers_workflows_runs.rs`.  If the `hive_workflows` table is not
//! exposed through PostgREST, the fetch step will fail and a 500 response will
//! be returned instead of falling through to Next.js.
//!
//! ## Ported methods
//!
//! - `GET` — fully ported; returns `{ "workflows": [...] }`.
//! - `POST` — returns `None` (falls through to the still-live Next.js handler).

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_WORKFLOWS_TABLE: &str = "hive_workflows";
const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];

const WORKFLOW_COLUMNS: &str = concat!(
    "archived_at,",
    "created_at,",
    "created_by,",
    "definition,",
    "description,",
    "enabled,",
    "id,",
    "name,",
    "server_id,",
    "updated_at,",
    "updated_by,",
    "version"
);

// ---------------------------------------------------------------------------
// Row / output types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct HiveWorkflowRow {
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
struct HiveWorkflow {
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

/// Mirrors `parseDefinition` from `workflow-store.ts`:
/// keeps edges/nodes arrays, always forces `version` to 1.
fn parse_definition(raw: Value) -> Value {
    let fallback = json!({ "edges": [], "nodes": [], "version": 1 });

    let obj = match raw.as_object() {
        Some(o) => o,
        None => return fallback,
    };

    let edges = match obj.get("edges") {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        _ => Value::Array(Vec::new()),
    };
    let nodes = match obj.get("nodes") {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        _ => Value::Array(Vec::new()),
    };

    json!({ "edges": edges, "nodes": nodes, "version": 1 })
}

impl From<HiveWorkflowRow> for HiveWorkflow {
    fn from(row: HiveWorkflowRow) -> Self {
        Self {
            archived_at: row.archived_at,
            created_at: row.created_at,
            created_by: row.created_by,
            definition: parse_definition(row.definition),
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

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

/// Returns the `serverId` segment when `path` is exactly
/// `/api/v1/hive/servers/{serverId}/workflows`.
fn parse_workflows_path(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "workflows"
    {
        Some(segments[4])
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_hive_servers_serverid_workflows_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let server_id = parse_workflows_path(request.path)?;

    // POST and all other methods fall through to the Next.js handler.
    Some(match request.method {
        "GET" => workflows_response(config, request, server_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

async fn workflows_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Auth: mirrors requireHiveAccess.
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

    // Fetch workflows from Supabase REST.
    let rows =
        match fetch_workflows(&config.contact_data, server_id, access.is_admin, outbound).await {
            Ok(rows) => rows,
            Err(()) => return failed_to_load_workflows_response(),
        };

    let workflows = rows.into_iter().map(HiveWorkflow::from).collect::<Vec<_>>();

    no_store_response(json_response(
        200,
        json!({
            "workflows": workflows,
        }),
    ))
}

async fn fetch_workflows(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    is_admin: bool,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<HiveWorkflowRow>, ()> {
    // listHiveWorkflows: where server_id = serverId and archived_at is null
    // [and enabled = true -- non-admin], order by updated_at desc, created_at desc.
    let mut params = vec![
        ("select", WORKFLOW_COLUMNS.to_owned()),
        ("server_id", format!("eq.{server_id}")),
        ("archived_at", "is.null".to_owned()),
        ("order", "updated_at.desc,created_at.desc".to_owned()),
    ];

    if !is_admin {
        params.push(("enabled", "eq.true".to_owned()));
    }

    let Some(url) = contact_data.rest_url(HIVE_WORKFLOWS_TABLE, &params) else {
        return Err(());
    };

    service_role_get::<HiveWorkflowRow>(contact_data, &url, outbound).await
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

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn failed_to_resolve_hive_access_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to resolve Hive access",
        }),
    ))
}

fn hive_access_required_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({
            "error": "Hive access required",
        }),
    ))
}

fn failed_to_load_workflows_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Internal Server Error",
        }),
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{parse_definition, parse_workflows_path};
    use serde_json::{Value, json};

    // --- parse_workflows_path ---

    #[test]
    fn matches_valid_workflows_path() {
        assert_eq!(
            parse_workflows_path("/api/v1/hive/servers/some-server-id/workflows"),
            Some("some-server-id")
        );
        assert_eq!(
            parse_workflows_path(
                "/api/v1/hive/servers/550e8400-e29b-41d4-a716-446655440000/workflows"
            ),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
    }

    #[test]
    fn matches_path_without_leading_slash() {
        assert_eq!(
            parse_workflows_path("api/v1/hive/servers/my-server/workflows"),
            Some("my-server")
        );
    }

    #[test]
    fn does_not_match_missing_workflows_segment() {
        assert!(parse_workflows_path("/api/v1/hive/servers/some-server-id").is_none());
    }

    #[test]
    fn does_not_match_extra_segments() {
        assert!(
            parse_workflows_path("/api/v1/hive/servers/some-server-id/workflows/runs").is_none()
        );
        assert!(
            parse_workflows_path("/api/v1/hive/servers/some-server-id/workflows/abc/runs")
                .is_none()
        );
    }

    #[test]
    fn does_not_match_wrong_prefix() {
        assert!(parse_workflows_path("/api/v2/hive/servers/some-server-id/workflows").is_none());
        assert!(parse_workflows_path("/hive/servers/some-server-id/workflows").is_none());
    }

    #[test]
    fn does_not_match_empty_server_id() {
        // trim_matches strips slashes; double-slash collapses to nothing.
        assert!(parse_workflows_path("/api/v1/hive/servers//workflows").is_none());
    }

    // --- parse_definition ---

    #[test]
    fn parse_definition_passes_through_valid_arrays() {
        let raw = json!({
            "edges": [{ "id": "e1", "source": "a", "target": "b" }],
            "nodes": [{ "id": "n1", "type": "log", "position": { "x": 0, "y": 0 }, "data": { "label": "L" } }],
            "version": 1
        });
        let result = parse_definition(raw);
        assert!(result["edges"].as_array().unwrap().len() == 1);
        assert!(result["nodes"].as_array().unwrap().len() == 1);
        assert_eq!(result["version"], 1);
    }

    #[test]
    fn parse_definition_falls_back_on_non_array_fields() {
        let raw = json!({ "edges": "bad", "nodes": null, "version": 2 });
        let result = parse_definition(raw);
        assert_eq!(result["edges"], Value::Array(vec![]));
        assert_eq!(result["nodes"], Value::Array(vec![]));
        // version is always forced to 1
        assert_eq!(result["version"], 1);
    }

    #[test]
    fn parse_definition_handles_null_input() {
        let result = parse_definition(Value::Null);
        assert_eq!(result["edges"], Value::Array(vec![]));
        assert_eq!(result["nodes"], Value::Array(vec![]));
        assert_eq!(result["version"], 1);
    }
}
