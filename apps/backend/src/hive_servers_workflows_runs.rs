use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_WORKFLOWS_TABLE: &str = "hive_workflows";
const HIVE_WORKFLOW_RUNS_TABLE: &str = "hive_workflow_runs";
const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HiveWorkflowRun {
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

impl From<HiveWorkflowRunRow> for HiveWorkflowRun {
    fn from(row: HiveWorkflowRunRow) -> Self {
        Self {
            actor_user_id: row.actor_user_id,
            created_at: row.created_at,
            error: row.error,
            finished_at: row.finished_at,
            id: row.id,
            input: normalize_json(row.input),
            output: normalize_json(row.output),
            research_session_id: row.research_session_id,
            server_id: row.server_id,
            started_at: row.started_at,
            status: row.status,
            step_trace: normalize_trace(row.step_trace),
            workflow_id: row.workflow_id,
        }
    }
}

fn normalize_json(value: Value) -> Value {
    // mapHiveWorkflowRun uses asJson(): undefined -> null, otherwise passthrough.
    value
}

fn normalize_trace(value: Value) -> Value {
    // parseTrace(): arrays pass through, anything else becomes [].
    if value.is_array() {
        value
    } else {
        Value::Array(Vec::new())
    }
}

pub(crate) async fn handle_hive_servers_workflows_runs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (server_id, workflow_id) = parse_runs_path(request.path)?;

    Some(match request.method {
        "GET" => runs_response(config, request, server_id, workflow_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn runs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    workflow_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
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
        Err(()) => return failed_to_load_runs_response(),
    }

    let rows =
        match fetch_workflow_runs(&config.contact_data, server_id, workflow_id, outbound).await {
            Ok(rows) => rows,
            Err(()) => return failed_to_load_runs_response(),
        };

    let runs = rows
        .into_iter()
        .map(HiveWorkflowRun::from)
        .collect::<Vec<_>>();

    no_store_response(json_response(
        200,
        json!({
            "runs": runs,
        }),
    ))
}

async fn workflow_exists(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    workflow_id: &str,
    is_admin: bool,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    // getHiveWorkflow: id == workflowId, server_id == serverId, archived_at is null,
    // and (isAdmin OR enabled = true).
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

async fn fetch_workflow_runs(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    workflow_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<HiveWorkflowRunRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_WORKFLOW_RUNS_TABLE,
        &[
            ("select", WORKFLOW_RUN_COLUMNS.to_owned()),
            ("server_id", format!("eq.{server_id}")),
            ("workflow_id", format!("eq.{workflow_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "50".to_owned()),
        ],
    ) else {
        return Err(());
    };

    service_role_get::<HiveWorkflowRunRow>(contact_data, &url, outbound).await
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

fn parse_runs_path(path: &str) -> Option<(&str, &str)> {
    // /api/v1/hive/servers/{serverId}/workflows/{workflowId}/runs
    let segments = path_segments(path);

    if segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "workflows"
        && !segments[6].is_empty()
        && segments[7] == "runs"
    {
        Some((segments[4], segments[6]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
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

fn failed_to_resolve_hive_access_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to resolve Hive access",
        }),
    ))
}

fn workflow_not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({
            "error": "Hive workflow not found",
        }),
    ))
}

fn failed_to_load_runs_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Internal Server Error",
        }),
    ))
}
