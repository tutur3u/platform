use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

// Hive product data lives in a separate Postgres database in the legacy app
// (HIVE_DATABASE_URL via getHiveSql). In the backend, these hive_* tables are
// reached through the same Supabase REST endpoint with the service role key,
// exactly like hive_servers_workflows_runs.rs already does.

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];
const NDJSON_CONTENT_TYPE: &str = "application/x-ndjson; charset=utf-8";
const TIMELINE_LIMIT: usize = 500;

const HIVE_RESEARCH_SESSIONS_TABLE: &str = "hive_research_sessions";
const HIVE_WORLD_EVENTS_TABLE: &str = "hive_world_events";
const HIVE_NPC_RUNS_TABLE: &str = "hive_npc_runs";
const HIVE_WORKFLOW_RUNS_TABLE: &str = "hive_workflow_runs";
const HIVE_WORKFLOWS_TABLE: &str = "hive_workflows";
const HIVE_SIMULATION_TICKS_TABLE: &str = "hive_simulation_ticks";
const HIVE_RESEARCH_SESSION_EVENTS_TABLE: &str = "hive_research_session_events";

// ----------------------------------------------------------------------------
// Database row types (PostgREST JSON shapes).
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

#[derive(Deserialize)]
struct WorldEventRow {
    actor_user_id: Option<String>,
    created_at: Option<String>,
    event_type: Option<String>,
    id: Option<String>,
    #[serde(default)]
    payload: Value,
    #[serde(default)]
    op_seq: Value,
    research_session_id: Option<String>,
    #[serde(default)]
    revision: Value,
}

#[derive(Deserialize)]
struct NpcRunRow {
    actor_user_id: Option<String>,
    #[serde(default)]
    autonomous: Value,
    credit_source: Option<String>,
    credit_ws_id: Option<String>,
    #[serde(default)]
    credits_deducted: Value,
    created_at: Option<String>,
    error: Option<String>,
    id: Option<String>,
    #[serde(default)]
    input_context: Value,
    #[serde(default)]
    input_tokens: Value,
    interaction_id: Option<String>,
    #[serde(default)]
    llm_cost: Value,
    llm_model: Option<String>,
    llm_provider: Option<String>,
    npc_id: Option<String>,
    npc_name: Option<String>,
    #[serde(default)]
    output_decision: Value,
    #[serde(default)]
    output_tokens: Value,
    prompt_mode: Option<String>,
    #[serde(default)]
    reasoning_tokens: Value,
    research_session_id: Option<String>,
    status: Option<String>,
    target_npc_id: Option<String>,
    target_npc_name: Option<String>,
    trigger: Option<String>,
}

#[derive(Deserialize)]
struct WorkflowRunRow {
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

#[derive(Deserialize)]
struct WorkflowMetaRow {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct SimulationTickRow {
    actions_count: Option<Value>,
    error: Option<String>,
    finished_at: Option<String>,
    id: Option<String>,
    #[serde(default)]
    llm_spend: Value,
    research_session_id: Option<String>,
    server_id: Option<String>,
    started_at: Option<String>,
    status: Option<String>,
    #[serde(default)]
    summary: Value,
}

#[derive(Deserialize)]
struct SessionEventRow {
    actor_user_id: Option<String>,
    created_at: Option<String>,
    event_kind: Option<String>,
    id: Option<String>,
    #[serde(default)]
    payload: Value,
    server_id: Option<String>,
    session_id: Option<String>,
    source_id: Option<String>,
    source_type: Option<String>,
}

// ----------------------------------------------------------------------------
// Output session shape (mapHiveResearchSession).
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
            metadata: as_json(row.metadata),
            name: row.name,
            server_id: row.server_id,
            started_at: row.started_at,
            status: row.status,
            updated_at: row.updated_at,
        }
    }
}

// A timeline item carries its createdAt for sorting and a JSON payload.
struct TimelineItem {
    created_at: Option<String>,
    value: Value,
}

// ----------------------------------------------------------------------------
// Route entry point.
// ----------------------------------------------------------------------------

pub(crate) async fn handle_hive_servers_research_sessions_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (server_id, session_id) = parse_export_path(request.path)?;

    Some(match request.method {
        "GET" => export_response(config, request, server_id, session_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    session_id: &str,
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

    // getHiveResearchSession: returns null if the session does not exist for the
    // server. The export returns 404 in that case.
    let session = match fetch_session(&config.contact_data, server_id, session_id, outbound).await {
        Ok(Some(session)) => session,
        Ok(None) => return session_not_found_response(),
        Err(()) => return internal_error_response(),
    };

    let timeline = match build_timeline(
        &config.contact_data,
        server_id,
        session_id,
        access.is_admin,
        outbound,
    )
    .await
    {
        Ok(timeline) => timeline,
        Err(()) => return internal_error_response(),
    };

    let timeline_values: Vec<Value> = timeline.into_iter().map(|item| item.value).collect();

    let session_value = serde_json::to_value(SessionOut::from(session)).unwrap_or(Value::Null);

    let export = json!({
        "exportedAt": current_iso8601(),
        "formatVersion": 1,
        "serverId": server_id,
        "session": session_value,
        "timeline": timeline_values,
    });

    let filename_json = format!("hive-research-{session_id}.json");
    let filename_jsonl = format!("hive-research-{session_id}.jsonl");

    if request_format_is_jsonl(request) {
        let mut lines: Vec<String> = Vec::with_capacity(timeline_values.len().saturating_add(1));
        lines.push(json!({ "kind": "session", "session": export["session"].clone() }).to_string());
        for item in timeline_values.iter() {
            lines.push(item.to_string());
        }
        let body = lines.join("\n");

        let mut response = crate::text_response(200, body, NDJSON_CONTENT_TYPE);
        response.headers.push((
            "content-disposition",
            format!("attachment; filename=\"{filename_jsonl}\""),
        ));
        return no_store_response(response);
    }

    let mut response = json_response(200, export);
    response.headers.push((
        "content-disposition",
        format!("attachment; filename=\"{filename_json}\""),
    ));
    no_store_response(response)
}

// ----------------------------------------------------------------------------
// Session lookup.
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

    let rows = service_role_get::<SessionRow>(contact_data, &url, outbound).await?;
    Ok(rows.into_iter().next())
}

// ----------------------------------------------------------------------------
// Timeline assembly (listHiveResearchTimeline with researchSessionId filter).
// ----------------------------------------------------------------------------

async fn build_timeline(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    session_id: &str,
    is_admin: bool,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<TimelineItem>, ()> {
    let limit = TIMELINE_LIMIT.to_string();

    // hive_world_events
    let events = fetch_world_events(contact_data, server_id, session_id, &limit, outbound).await?;

    // hive_npc_runs (joined npc names via embedded resources)
    let runs = fetch_npc_runs(contact_data, server_id, session_id, &limit, outbound).await?;

    // hive_workflow_runs (+ workflow names). Legacy wraps this query in
    // .catch(() => []), so failures degrade to an empty list rather than erroring.
    let workflow_runs: Vec<(WorkflowRunRow, Option<String>)> = fetch_workflow_runs(
        contact_data,
        server_id,
        session_id,
        is_admin,
        &limit,
        outbound,
    )
    .await
    .unwrap_or_default();

    // hive_simulation_ticks — also .catch(() => []) in legacy.
    let ticks: Vec<SimulationTickRow> =
        fetch_simulation_ticks(contact_data, server_id, session_id, &limit, outbound)
            .await
            .unwrap_or_default();

    // hive_research_session_events
    let session_events =
        fetch_session_events(contact_data, server_id, session_id, &limit, outbound).await?;

    let mut items: Vec<TimelineItem> = Vec::new();
    items.extend(events.into_iter().map(map_event));
    items.extend(group_npc_runs(runs.into_iter().map(map_npc_run).collect()));
    items.extend(workflow_runs.into_iter().map(map_workflow_run));
    items.extend(ticks.into_iter().map(map_simulation_tick));
    items.extend(session_events.into_iter().map(map_session_event));

    // Sort by createdAt descending. ISO-8601 timestamps from Postgres sort
    // lexicographically in the same order as chronologically.
    items.sort_by(|a, b| created_at_key(b).cmp(created_at_key(a)));
    items.truncate(TIMELINE_LIMIT);

    Ok(items)
}

fn created_at_key(item: &TimelineItem) -> &str {
    item.created_at.as_deref().unwrap_or("")
}

async fn fetch_world_events(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    session_id: &str,
    limit: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<WorldEventRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_WORLD_EVENTS_TABLE,
        &[
            (
                "select",
                "id,server_id,actor_user_id,op_seq,revision,event_type,payload,research_session_id,created_at"
                    .to_owned(),
            ),
            ("server_id", format!("eq.{server_id}")),
            ("research_session_id", format!("eq.{session_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", limit.to_owned()),
        ],
    ) else {
        return Err(());
    };
    service_role_get::<WorldEventRow>(contact_data, &url, outbound).await
}

async fn fetch_npc_runs(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    session_id: &str,
    limit: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<NpcRunRow>, ()> {
    // Legacy joins hive_npcs twice for npc_name/target_npc_name. We fetch the
    // run rows and resolve names from a single hive_npcs lookup for the server.
    let Some(url) = contact_data.rest_url(
        HIVE_NPC_RUNS_TABLE,
        &[
            (
                "select",
                "id,server_id,npc_id,actor_user_id,prompt_mode,input_context,output_decision,interaction_id,target_npc_id,trigger,status,error,llm_provider,llm_model,llm_cost,input_tokens,output_tokens,reasoning_tokens,credits_deducted,credit_ws_id,credit_source,autonomous,research_session_id,created_at"
                    .to_owned(),
            ),
            ("server_id", format!("eq.{server_id}")),
            ("research_session_id", format!("eq.{session_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", limit.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let mut rows = service_role_get::<NpcRunRow>(contact_data, &url, outbound).await?;

    // Resolve npc names for the server (source + target).
    let npc_names = fetch_npc_names(contact_data, server_id, outbound)
        .await
        .unwrap_or_default();
    for row in rows.iter_mut() {
        if let Some(npc_id) = row.npc_id.as_deref() {
            row.npc_name = npc_names
                .iter()
                .find(|(id, _)| id == npc_id)
                .map(|(_, n)| n.clone());
        }
        if let Some(target_id) = row.target_npc_id.as_deref() {
            row.target_npc_name = npc_names
                .iter()
                .find(|(id, _)| id == target_id)
                .map(|(_, n)| n.clone());
        }
    }

    Ok(rows)
}

async fn fetch_npc_names(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<(String, String)>, ()> {
    let Some(url) = contact_data.rest_url(
        "hive_npcs",
        &[
            ("select", "id,name".to_owned()),
            ("server_id", format!("eq.{server_id}")),
        ],
    ) else {
        return Err(());
    };
    let rows = service_role_get::<WorkflowMetaRow>(contact_data, &url, outbound).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| match (row.id, row.name) {
            (Some(id), Some(name)) => Some((id, name)),
            _ => None,
        })
        .collect())
}

async fn fetch_workflow_runs(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    session_id: &str,
    is_admin: bool,
    limit: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<(WorkflowRunRow, Option<String>)>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_WORKFLOW_RUNS_TABLE,
        &[
            (
                "select",
                "id,workflow_id,server_id,actor_user_id,status,input,output,step_trace,error,started_at,finished_at,created_at,research_session_id"
                    .to_owned(),
            ),
            ("server_id", format!("eq.{server_id}")),
            ("research_session_id", format!("eq.{session_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", limit.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let runs = service_role_get::<WorkflowRunRow>(contact_data, &url, outbound).await?;

    // Workflows for the server: legacy joins on workflow id + server id, requires
    // archived_at is null, and (isAdmin OR enabled = true). Use these to both
    // filter runs and resolve workflow_name.
    let mut params = vec![
        ("select", "id,name".to_owned()),
        ("server_id", format!("eq.{server_id}")),
        ("archived_at", "is.null".to_owned()),
    ];
    if !is_admin {
        params.push(("enabled", "eq.true".to_owned()));
    }
    let Some(workflows_url) = contact_data.rest_url(HIVE_WORKFLOWS_TABLE, &params) else {
        return Err(());
    };
    let workflows =
        service_role_get::<WorkflowMetaRow>(contact_data, &workflows_url, outbound).await?;

    let allowed: Vec<(String, Option<String>)> = workflows
        .into_iter()
        .filter_map(|row| row.id.map(|id| (id, row.name)))
        .collect();

    let result = runs
        .into_iter()
        .filter_map(|run| {
            let workflow_id = run.workflow_id.as_deref()?;
            let workflow_name = allowed
                .iter()
                .find(|(id, _)| id == workflow_id)
                .map(|(_, name)| name.clone())?;
            Some((run, workflow_name))
        })
        .collect();

    Ok(result)
}

async fn fetch_simulation_ticks(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    session_id: &str,
    limit: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<SimulationTickRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_SIMULATION_TICKS_TABLE,
        &[
            (
                "select",
                "id,server_id,research_session_id,started_at,finished_at,status,actions_count,llm_spend,summary,error"
                    .to_owned(),
            ),
            ("server_id", format!("eq.{server_id}")),
            ("research_session_id", format!("eq.{session_id}")),
            ("order", "started_at.desc".to_owned()),
            ("limit", limit.to_owned()),
        ],
    ) else {
        return Err(());
    };
    service_role_get::<SimulationTickRow>(contact_data, &url, outbound).await
}

async fn fetch_session_events(
    contact_data: &contact::ContactDataConfig,
    server_id: &str,
    session_id: &str,
    limit: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<SessionEventRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_RESEARCH_SESSION_EVENTS_TABLE,
        &[
            (
                "select",
                "id,session_id,server_id,actor_user_id,event_kind,source_type,source_id,payload,created_at"
                    .to_owned(),
            ),
            ("server_id", format!("eq.{server_id}")),
            ("session_id", format!("eq.{session_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", limit.to_owned()),
        ],
    ) else {
        return Err(());
    };
    service_role_get::<SessionEventRow>(contact_data, &url, outbound).await
}

// ----------------------------------------------------------------------------
// Mapping helpers (mirror research-timeline.ts map* functions).
// ----------------------------------------------------------------------------

fn map_event(row: WorldEventRow) -> TimelineItem {
    let created_at = row.created_at.clone();
    // revision: Number(op_seq ?? revision ?? 0)
    let revision = to_number(&row.op_seq)
        .or_else(|| to_number(&row.revision))
        .unwrap_or(0.0);
    let value = json!({
        "actorUserId": row.actor_user_id,
        "createdAt": row.created_at,
        "eventType": row.event_type,
        "id": row.id,
        "kind": "event",
        "payload": as_json(row.payload),
        "researchSessionId": row.research_session_id,
        "revision": number_value(revision),
    });
    TimelineItem { created_at, value }
}

// Intermediate representation of a mapped NPC run, used by group_npc_runs.
struct MappedNpcRun {
    actor_user_id: Option<String>,
    autonomous: bool,
    credit_source: Option<String>,
    credit_ws_id: Option<String>,
    credits_deducted: f64,
    created_at: Option<String>,
    error: Option<String>,
    id: Option<String>,
    input_context: Value,
    input_tokens: f64,
    interaction_id: Option<String>,
    llm_cost: f64,
    llm_model: Option<String>,
    llm_provider: Option<String>,
    npc_id: Option<String>,
    npc_name: Option<String>,
    output_decision: Value,
    output_tokens: f64,
    prompt_mode: Option<String>,
    reasoning_tokens: f64,
    research_session_id: Option<String>,
    status: String,
    target_npc_id: Option<String>,
    target_npc_name: Option<String>,
    trigger: String,
}

fn map_npc_run(row: NpcRunRow) -> MappedNpcRun {
    MappedNpcRun {
        actor_user_id: row.actor_user_id,
        autonomous: row.autonomous == Value::Bool(true),
        credit_source: row.credit_source,
        credit_ws_id: row.credit_ws_id,
        credits_deducted: to_number(&row.credits_deducted).unwrap_or(0.0),
        created_at: row.created_at,
        error: row.error,
        id: row.id,
        input_context: as_json(row.input_context),
        input_tokens: to_number(&row.input_tokens).unwrap_or(0.0),
        interaction_id: row.interaction_id,
        llm_cost: to_number(&row.llm_cost).unwrap_or(0.0),
        llm_model: row.llm_model,
        llm_provider: row.llm_provider,
        npc_id: row.npc_id,
        npc_name: row.npc_name,
        output_decision: as_json(row.output_decision),
        output_tokens: to_number(&row.output_tokens).unwrap_or(0.0),
        prompt_mode: row.prompt_mode,
        reasoning_tokens: to_number(&row.reasoning_tokens).unwrap_or(0.0),
        research_session_id: row.research_session_id,
        status: row.status.unwrap_or_else(|| "completed".to_owned()),
        target_npc_id: row.target_npc_id,
        target_npc_name: row.target_npc_name,
        trigger: row.trigger.unwrap_or_else(|| "manual".to_owned()),
    }
}

fn npc_run_to_value(run: &MappedNpcRun) -> Value {
    json!({
        "actorUserId": run.actor_user_id,
        "autonomous": run.autonomous,
        "creditSource": run.credit_source,
        "creditWsId": run.credit_ws_id,
        "creditsDeducted": number_value(run.credits_deducted),
        "createdAt": run.created_at,
        "error": run.error,
        "id": run.id,
        "inputContext": run.input_context,
        "inputTokens": number_value(run.input_tokens),
        "interactionId": run.interaction_id,
        "kind": "run",
        "llmCost": number_value(run.llm_cost),
        "llmModel": run.llm_model,
        "llmProvider": run.llm_provider,
        "npcId": run.npc_id,
        "npcName": run.npc_name,
        "outputDecision": run.output_decision,
        "outputTokens": number_value(run.output_tokens),
        "promptMode": run.prompt_mode,
        "reasoningTokens": number_value(run.reasoning_tokens),
        "researchSessionId": run.research_session_id,
        "status": run.status,
        "targetNpcId": run.target_npc_id,
        "targetNpcName": run.target_npc_name,
        "trigger": run.trigger,
    })
}

fn aggregate_status(runs: &[MappedNpcRun]) -> &'static str {
    if runs.iter().any(|run| run.status == "failed") {
        return "failed";
    }
    if runs.iter().any(|run| run.status == "running") {
        return "running";
    }
    if !runs.is_empty() && runs.iter().all(|run| run.status == "skipped") {
        return "skipped";
    }
    "completed"
}

fn group_npc_runs(runs: Vec<MappedNpcRun>) -> Vec<TimelineItem> {
    // Preserve insertion order of interaction groups (JS Map order).
    let mut order: Vec<String> = Vec::new();
    let mut grouped: std::collections::HashMap<String, Vec<MappedNpcRun>> =
        std::collections::HashMap::new();
    let mut standalone: Vec<MappedNpcRun> = Vec::new();

    for run in runs {
        match run.interaction_id.clone() {
            Some(interaction_id) if !interaction_id.is_empty() => {
                if !grouped.contains_key(&interaction_id) {
                    order.push(interaction_id.clone());
                }
                grouped.entry(interaction_id).or_default().push(run);
            }
            _ => standalone.push(run),
        }
    }

    let mut items: Vec<TimelineItem> = Vec::new();

    for interaction_id in order {
        let group = grouped.remove(&interaction_id).unwrap_or_default();
        // Sort ascending by createdAt.
        let mut sorted = group;
        sorted.sort_by(|a, b| {
            a.created_at
                .as_deref()
                .unwrap_or("")
                .cmp(b.created_at.as_deref().unwrap_or(""))
        });

        if sorted.is_empty() {
            continue;
        }

        // latestRun = max by createdAt; reduce keeps the last max when ties.
        let mut latest_idx = 0usize;
        for (idx, run) in sorted.iter().enumerate() {
            let latest = sorted[latest_idx].created_at.as_deref().unwrap_or("");
            if run.created_at.as_deref().unwrap_or("") > latest {
                latest_idx = idx;
            }
        }
        let latest_created_at = sorted[latest_idx].created_at.clone();
        let first = &sorted[0];

        let credits_deducted: f64 = sorted.iter().map(|r| r.credits_deducted).sum();
        let llm_cost: f64 = sorted.iter().map(|r| r.llm_cost).sum();
        let autonomous = sorted.iter().any(|r| r.autonomous);
        let status = aggregate_status(&sorted);
        let runs_values: Vec<Value> = sorted.iter().map(npc_run_to_value).collect();

        let value = json!({
            "actorUserId": first.actor_user_id,
            "autonomous": autonomous,
            "createdAt": latest_created_at,
            "creditSource": first.credit_source,
            "creditWsId": first.credit_ws_id,
            "creditsDeducted": number_value(credits_deducted),
            "id": interaction_id,
            "interactionId": interaction_id,
            "kind": "interaction",
            "llmCost": number_value(llm_cost),
            "llmModel": first.llm_model,
            "llmProvider": first.llm_provider,
            "npcName": first.npc_name,
            "researchSessionId": first.research_session_id,
            "runs": runs_values,
            "status": status,
            "targetNpcName": first.target_npc_name,
            "trigger": first.trigger,
        });

        items.push(TimelineItem {
            created_at: latest_created_at_clone(&sorted, latest_idx),
            value,
        });
    }

    for run in standalone {
        let created_at = run.created_at.clone();
        items.push(TimelineItem {
            created_at,
            value: npc_run_to_value(&run),
        });
    }

    items
}

fn latest_created_at_clone(sorted: &[MappedNpcRun], latest_idx: usize) -> Option<String> {
    sorted.get(latest_idx).and_then(|r| r.created_at.clone())
}

fn map_workflow_run((row, workflow_name): (WorkflowRunRow, Option<String>)) -> TimelineItem {
    let created_at = row.created_at.clone();
    let value = json!({
        "actorUserId": row.actor_user_id,
        "createdAt": row.created_at,
        "error": row.error,
        "finishedAt": row.finished_at,
        "id": row.id,
        "input": as_json(row.input),
        "kind": "workflow_run",
        "output": as_json(row.output),
        "researchSessionId": row.research_session_id,
        "serverId": row.server_id,
        "startedAt": row.started_at,
        "status": row.status,
        "stepTrace": parse_trace(row.step_trace),
        "workflowId": row.workflow_id,
        "workflowName": workflow_name,
    });
    TimelineItem { created_at, value }
}

fn map_simulation_tick(row: SimulationTickRow) -> TimelineItem {
    // createdAt maps to started_at in the legacy mapper.
    let created_at = row.started_at.clone();
    let value = json!({
        "actionsCount": row.actions_count,
        "createdAt": row.started_at,
        "error": row.error,
        "finishedAt": row.finished_at,
        "id": row.id,
        "kind": "simulation_tick",
        "llmSpend": number_value(to_number(&row.llm_spend).unwrap_or(0.0)),
        "researchSessionId": row.research_session_id,
        "serverId": row.server_id,
        "startedAt": row.started_at,
        "status": row.status,
        "summary": as_json(row.summary),
    });
    TimelineItem { created_at, value }
}

fn map_session_event(row: SessionEventRow) -> TimelineItem {
    let created_at = row.created_at.clone();
    let value = json!({
        "actorUserId": row.actor_user_id,
        "createdAt": row.created_at,
        "eventKind": row.event_kind,
        "id": row.id,
        "kind": "session_event",
        "payload": as_json(row.payload),
        "researchSessionId": row.session_id,
        "serverId": row.server_id,
        "sessionId": row.session_id,
        "sourceId": row.source_id,
        "sourceType": row.source_type,
    });
    TimelineItem { created_at, value }
}

// ----------------------------------------------------------------------------
// Small JS-semantics helpers.
// ----------------------------------------------------------------------------

fn as_json(value: Value) -> Value {
    // asJson(): undefined -> null, otherwise passthrough. serde gives Null for
    // missing fields already, so this is the identity for our purposes.
    value
}

fn parse_trace(value: Value) -> Value {
    if value.is_array() {
        value
    } else {
        Value::Array(Vec::new())
    }
}

// Number(...) coercion approximating JS: numbers passthrough, numeric strings
// parse, null/empty -> 0 handled by callers via unwrap_or(0.0).
fn to_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                Some(0.0)
            } else {
                trimmed.parse::<f64>().ok()
            }
        }
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::Null => None,
        _ => None,
    }
}

// Render an f64 back to JSON, using an integer when it has no fractional part to
// match JS JSON.stringify output for whole numbers.
fn number_value(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 9.007_199_254_740_992e15 {
        json!(value as i64)
    } else {
        serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

// ----------------------------------------------------------------------------
// Shared service-role GET.
// ----------------------------------------------------------------------------

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
// Path matching: /api/v1/hive/servers/{serverId}/research-sessions/{sessionId}/export
// ----------------------------------------------------------------------------

fn parse_export_path(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "research-sessions"
        && !segments[6].is_empty()
        && segments[7] == "export"
    {
        Some((segments[4], segments[6]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    let trimmed = match path.split('?').next() {
        Some(value) => value,
        None => path,
    };
    trimmed
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn request_format_is_jsonl(request: BackendRequest<'_>) -> bool {
    // request.nextUrl.searchParams.get('format') === 'jsonl'
    let query = request
        .url
        .and_then(|url| url.split_once('?').map(|(_, q)| q))
        .or_else(|| request.path.split_once('?').map(|(_, q)| q));

    let Some(query) = query else {
        return false;
    };

    query.split('&').any(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        key == "format" && value == "jsonl"
    })
}

// ----------------------------------------------------------------------------
// Error responses (match legacy status/body).
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
// ISO-8601 timestamp matching JS new Date().toISOString()
// (YYYY-MM-DDTHH:mm:ss.sssZ). Self-contained to avoid cross-module coupling.
// ----------------------------------------------------------------------------

fn current_iso8601() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    millis_to_iso8601(now as i64)
}

fn millis_to_iso8601(millis: i64) -> String {
    let total_seconds = millis.div_euclid(1_000);
    let millis_part = millis.rem_euclid(1_000);
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis_part:03}Z")
}

// Howard Hinnant's civil_from_days algorithm.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}
