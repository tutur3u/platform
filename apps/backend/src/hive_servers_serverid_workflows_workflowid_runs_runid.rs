//! Handler for `GET /api/v1/hive/servers/:serverId/workflows/:workflowId/runs/:runId`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/workflows/[workflowId]/runs/[runId]/route.ts`
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
//! The legacy `getHiveWorkflow` and `getHiveWorkflowRun` functions read from
//! the separate Hive Postgres database via `HIVE_DATABASE_URL`. This handler
//! reaches the same `hive_workflows` and `hive_workflow_runs` tables through
//! the Supabase REST endpoint with the service-role key, mirroring the pattern
//! used in `hive_servers_workflows_runs.rs`.
//!
//! ## Behavior gaps
//!
//! None known. The GET path is fully ported. Non-GET methods return `None` so
//! they fall through to the still-live Next.js route.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];
const HIVE_WORKFLOWS_TABLE: &str = "hive_workflows";
const HIVE_WORKFLOW_RUNS_TABLE: &str = "hive_workflow_runs";
const WORKFLOW_RUN_COLUMNS: &str = concat!(
    "actor_user_id,",
    "created_at,",
    "error,",
    "finished_at,",
    "id,",
    "input,",
    "output,",
    "research_session_id,",
    "server_id,",
    "started_at,",
    "status,",
    "step_trace,",
    "workflow_id"
);

// ----------------------------------------------------------------------------
// Database row types.
// ----------------------------------------------------------------------------

#[derive(Deserialize)]
struct HiveWorkflowExistsRow {
    #[allow(dead_code)]
    id: String,
}

#[derive(Deserialize)]
struct HiveWorkflowRunRow {
    actor_user_id: Option<String>,
    created_at: Option<String>,
    error: Option<String>,
    finished_at: Option<String>,
    id: Option<String>,
    #[serde(default)]
    input: Value,
    #[serde(default)]
    output: Value,
    research_session_id: Option<String>,
    server_id: Option<String>,
    started_at: Option<String>,
    status: Option<String>,
    #[serde(default)]
    step_trace: Value,
    workflow_id: Option<String>,
}

// ----------------------------------------------------------------------------
// Output type.
// ----------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HiveWorkflowRunOut {
    actor_user_id: Option<String>,
    created_at: Option<String>,
    error: Option<String>,
    finished_at: Option<String>,
    id: Option<String>,
    input: Value,
    output: Value,
    research_session_id: Option<String>,
    server_id: Option<String>,
    started_at: Option<String>,
    status: Option<String>,
    step_trace: Value,
    workflow_id: Option<String>,
}

impl From<HiveWorkflowRunRow> for HiveWorkflowRunOut {
    fn from(row: HiveWorkflowRunRow) -> Self {
        Self {
            actor_user_id: row.actor_user_id,
            created_at: row.created_at,
            error: row.error,
            finished_at: row.finished_at,
            id: row.id,
            input: row.input,
            output: row.output,
            research_session_id: row.research_session_id,
            server_id: row.server_id,
            started_at: row.started_at,
            status: row.status,
            step_trace: normalize_trace(row.step_trace),
            workflow_id: row.workflow_id,
        }
    }
}

fn normalize_trace(value: Value) -> Value {
    // parseTrace(): arrays pass through, anything else becomes [].
    if value.is_array() {
        value
    } else {
        Value::Array(Vec::new())
    }
}

// ----------------------------------------------------------------------------
// Route entry point.
// ----------------------------------------------------------------------------

pub(crate) async fn handle_hive_servers_serverid_workflows_workflowid_runs_runid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (server_id, workflow_id, run_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, server_id, workflow_id, run_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    workflow_id: &str,
    run_id: &str,
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

    // --- Verify the workflow exists (mirrors `getHiveWorkflow`) ---

    match workflow_exists(
        &config.contact_data,
        server_id,
        workflow_id,
        access.is_admin,
        outbound,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return workflow_not_found_response(),
        Err(()) => return internal_error_response(),
    }

    // --- Fetch the single run (mirrors `getHiveWorkflowRun`) ---

    let run = match fetch_run(
        &config.contact_data,
        server_id,
        workflow_id,
        run_id,
        outbound,
    )
    .await
    {
        Ok(Some(run)) => run,
        Ok(None) => return run_not_found_response(),
        Err(()) => return internal_error_response(),
    };

    let run_value = serde_json::to_value(HiveWorkflowRunOut::from(run)).unwrap_or(Value::Null);

    no_store_response(json_response(200, json!({ "run": run_value })))
}

// ----------------------------------------------------------------------------
// Data fetching.
// ----------------------------------------------------------------------------

async fn workflow_exists(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    workflow_id: &str,
    is_admin: bool,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    let mut params = vec![
        ("select", "id".to_owned()),
        ("id", format!("eq.{workflow_id}")),
        ("server_id", format!("eq.{server_id}")),
        ("archived_at", "is.null".to_owned()),
        ("limit", "1".to_owned()),
    ];

    if !is_admin {
        params.push(("enabled", "eq.true".to_owned()));
    }

    let Some(url) = contact_data.rest_url(HIVE_WORKFLOWS_TABLE, &params) else {
        return Err(());
    };

    let rows = service_role_get::<HiveWorkflowExistsRow>(contact_data, &url, outbound).await?;

    Ok(!rows.is_empty())
}

async fn fetch_run(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    workflow_id: &str,
    run_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<HiveWorkflowRunRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_WORKFLOW_RUNS_TABLE,
        &[
            ("select", WORKFLOW_RUN_COLUMNS.to_owned()),
            ("id", format!("eq.{run_id}")),
            ("server_id", format!("eq.{server_id}")),
            ("workflow_id", format!("eq.{workflow_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let rows = service_role_get::<HiveWorkflowRunRow>(contact_data, &url, outbound).await?;

    Ok(rows.into_iter().next())
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
// Path matching:
// /api/v1/hive/servers/{serverId}/workflows/{workflowId}/runs/{runId}
// (9 segments)
// ----------------------------------------------------------------------------

fn parse_path(path: &str) -> Option<(&str, &str, &str)> {
    let trimmed = path.split('?').next().unwrap_or(path);
    let segments: Vec<&str> = trimmed
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    if segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "workflows"
        && !segments[6].is_empty()
        && segments[7] == "runs"
        && !segments[8].is_empty()
    {
        Some((segments[4], segments[6], segments[8]))
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

fn run_not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({ "error": "Hive workflow run not found" }),
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
        let result = parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2/runs/run-3");
        assert_eq!(result, Some(("srv-1", "wf-2", "run-3")));
    }

    #[test]
    fn matches_uuid_segments() {
        let result = parse_path(concat!(
            "/api/v1/hive/servers/550e8400-e29b-41d4-a716-446655440000",
            "/workflows/660e8400-e29b-41d4-a716-446655440000",
            "/runs/770e8400-e29b-41d4-a716-446655440000"
        ));
        assert_eq!(
            result,
            Some((
                "550e8400-e29b-41d4-a716-446655440000",
                "660e8400-e29b-41d4-a716-446655440000",
                "770e8400-e29b-41d4-a716-446655440000"
            ))
        );
    }

    #[test]
    fn strips_query_string_before_matching() {
        let result = parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2/runs/run-3?foo=bar");
        assert_eq!(result, Some(("srv-1", "wf-2", "run-3")));
    }

    #[test]
    fn does_not_match_runs_list_path() {
        // 8 segments — the list route, not the individual run route.
        let result = parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2/runs");
        assert_eq!(result, None);
    }

    #[test]
    fn does_not_match_short_paths() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2"),
            None
        );
        assert_eq!(parse_path("/api/v1/hive/servers/srv-1"), None);
    }

    #[test]
    fn does_not_match_empty_server_id() {
        assert_eq!(
            parse_path("/api/v1/hive/servers//workflows/wf-2/runs/run-3"),
            None
        );
    }

    #[test]
    fn does_not_match_empty_workflow_id() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv-1/workflows//runs/run-3"),
            None
        );
    }

    #[test]
    fn does_not_match_empty_run_id() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv-1/workflows/wf-2/runs/"),
            None
        );
    }

    #[test]
    fn does_not_match_wrong_version() {
        assert_eq!(
            parse_path("/api/v2/hive/servers/srv-1/workflows/wf-2/runs/run-3"),
            None
        );
    }

    #[test]
    fn works_without_leading_slash() {
        let result = parse_path("api/v1/hive/servers/srv-1/workflows/wf-2/runs/run-3");
        assert_eq!(result, Some(("srv-1", "wf-2", "run-3")));
    }

    #[test]
    fn normalize_trace_passes_array() {
        use serde_json::json;
        let arr = json!([{"step": "a"}]);
        assert_eq!(super::normalize_trace(arr.clone()), arr);
    }

    #[test]
    fn normalize_trace_replaces_non_array_with_empty() {
        use serde_json::{Value, json};
        assert_eq!(
            super::normalize_trace(json!({"key": "val"})),
            Value::Array(Vec::new())
        );
        assert_eq!(
            super::normalize_trace(Value::Null),
            Value::Array(Vec::new())
        );
    }
}
