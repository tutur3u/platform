use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::HashMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_MODE_ERROR_MESSAGE: &str = "Failed to resolve workspace mode";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/calendar/schedulable-tasks";

const GET_USER_TASKS_RPC: &str = "get_user_tasks_with_relations";

// Mirrors the RPC arguments the legacy route supplies. The optional
// (undefined) filters in the TS source are omitted entirely so the SQL
// function defaults apply.
#[derive(Serialize)]
struct GetUserTasksRpcRequest<'a> {
    p_exclude_personally_completed: bool,
    p_exclude_personally_unassigned: bool,
    p_filter_self_managed_only: bool,
    p_include_deleted: bool,
    p_list_statuses: [&'a str; 4],
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Deserialize)]
struct RpcTaskRow {
    task_id: Option<String>,
    task_name: Option<String>,
    sched_total_duration: Option<f64>,
    sched_is_splittable: Option<bool>,
    sched_min_split_duration_minutes: Option<f64>,
    sched_max_split_duration_minutes: Option<f64>,
    sched_calendar_hours: Option<Value>,
    sched_auto_schedule: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspacePersonalRow {
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct TaskEventRow {
    task_id: Option<String>,
    scheduled_minutes: Option<f64>,
    completed: Option<bool>,
}

#[derive(Deserialize)]
struct DirectEventRow {
    task_id: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
}

#[derive(Default, Clone, Copy)]
struct Scheduling {
    scheduled_minutes: f64,
    completed_minutes: f64,
}

pub(crate) async fn handle_workspaces_calendar_schedulable_tasks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = schedulable_tasks_ws_id(request.path)?;

    Some(match request.method {
        "GET" => schedulable_tasks_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn schedulable_tasks_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let search_query = search_query(request.url);

    // Resolve workspace mode (personal). The TS route fetches this but does not
    // actually use it in the scheduling fetch beyond passing isPersonalWorkspace
    // (which the helper ignores). We still mirror the error semantics.
    if resolve_workspace_personal(&config.contact_data, outbound, &resolved_ws_id)
        .await
        .is_err()
    {
        return error_response(500, WORKSPACE_MODE_ERROR_MESSAGE);
    }

    let tasks = match fetch_schedulable_tasks(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        search_query.as_deref(),
    )
    .await
    {
        Ok(tasks) => tasks,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|task| {
            task.get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .filter(|id| !id.is_empty())
        })
        .collect();

    if task_ids.is_empty() {
        return no_store_response(json_response(200, json!({ "tasks": [] })));
    }

    // Junction-based scheduling (task_calendar_events) and direct events
    // (workspace_calendar_events). The TS route only logs errors here, so a
    // failure in either query is treated as "no rows" and yields zeroed
    // scheduling rather than a 500.
    let junction_rows =
        fetch_task_calendar_events(&config.contact_data, outbound, &resolved_ws_id, &task_ids)
            .await
            .unwrap_or_default();

    let direct_rows =
        fetch_direct_calendar_events(&config.contact_data, outbound, &resolved_ws_id, &task_ids)
            .await
            .unwrap_or_default();

    let mut scheduling_map: HashMap<String, Scheduling> = HashMap::new();

    for event in junction_rows {
        let Some(task_id) = event.task_id else {
            continue;
        };
        let entry = scheduling_map.entry(task_id).or_default();
        let scheduled_minutes = event.scheduled_minutes.unwrap_or(0.0);
        entry.scheduled_minutes += scheduled_minutes;
        if event.completed.unwrap_or(false) {
            entry.completed_minutes += scheduled_minutes;
        }
    }

    for event in direct_rows {
        let Some(task_id) = event.task_id else {
            continue;
        };
        let scheduled_minutes =
            duration_minutes(event.start_at.as_deref(), event.end_at.as_deref());
        let current = scheduling_map.get(&task_id).copied();
        if current.is_none_or(|value| value.scheduled_minutes == 0.0) {
            scheduling_map.insert(
                task_id,
                Scheduling {
                    scheduled_minutes,
                    completed_minutes: 0.0,
                },
            );
        }
    }

    let tasks_with_progress: Vec<Value> = tasks
        .into_iter()
        .map(|mut task| {
            let scheduling = task
                .get("id")
                .and_then(Value::as_str)
                .and_then(|id| scheduling_map.get(id))
                .copied()
                .unwrap_or_default();
            task.insert(
                "scheduled_minutes".to_owned(),
                number_value(scheduling.scheduled_minutes),
            );
            task.insert(
                "completed_minutes".to_owned(),
                number_value(scheduling.completed_minutes),
            );
            Value::Object(task)
        })
        .collect();

    no_store_response(json_response(200, json!({ "tasks": tasks_with_progress })))
}

/// Mirrors `fetchSchedulableTasksForWorkspace`: run the RPC, filter to
/// auto-schedulable rows with positive duration (+ optional name search), then
/// hydrate full task rows and merge the scheduling-derived fields.
async fn fetch_schedulable_tasks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    search_query: Option<&str>,
) -> Result<Vec<Map<String, Value>>, ()> {
    let rpc_url = contact_data.rpc_url(GET_USER_TASKS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&GetUserTasksRpcRequest {
        p_exclude_personally_completed: false,
        p_exclude_personally_unassigned: false,
        p_filter_self_managed_only: false,
        p_include_deleted: false,
        p_list_statuses: ["not_started", "active", "review", "done"],
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<RpcTaskRow> = response.json().map_err(|_| ())?;

    let normalized_search = search_query
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    let schedulable_rows: Vec<RpcTaskRow> = rows
        .into_iter()
        .filter(|row| {
            row.sched_auto_schedule.unwrap_or(true) && row.sched_total_duration.unwrap_or(0.0) > 0.0
        })
        .filter(|row| match &normalized_search {
            Some(query) => row
                .task_name
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .contains(query),
            None => true,
        })
        .collect();

    if schedulable_rows.is_empty() {
        return Ok(Vec::new());
    }

    let task_ids: Vec<String> = schedulable_rows
        .iter()
        .filter_map(|row| row.task_id.clone())
        .collect();

    let mut scheduling_by_id: HashMap<String, &RpcTaskRow> = HashMap::new();
    for row in &schedulable_rows {
        if let Some(id) = row.task_id.as_deref() {
            scheduling_by_id.insert(id.to_owned(), row);
        }
    }

    let task_rows = fetch_full_task_rows(contact_data, outbound, &task_ids).await?;

    let mut task_by_id: HashMap<String, Map<String, Value>> = HashMap::new();
    for mut task in task_rows {
        if let Some(id) = task.get("id").and_then(Value::as_str).map(str::to_owned) {
            // Resolve ws_id from the embedded relation before stripping it.
            let resolved_ws_id = task
                .get("task_lists")
                .and_then(|lists| lists.get("workspace_boards"))
                .and_then(|boards| boards.get("ws_id"))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| ws_id.to_owned());
            task.remove("task_lists");
            task.insert("ws_id".to_owned(), Value::String(resolved_ws_id));
            task_by_id.insert(id, task);
        }
    }

    // Preserve RPC ordering of task_ids, dropping any without a hydrated row.
    let mut result = Vec::new();
    for task_id in &task_ids {
        let (Some(mut task), Some(scheduling)) = (
            task_by_id.remove(task_id),
            scheduling_by_id.get(task_id).copied(),
        ) else {
            continue;
        };

        task.insert(
            "total_duration".to_owned(),
            optional_number(scheduling.sched_total_duration),
        );
        task.insert(
            "is_splittable".to_owned(),
            Value::Bool(scheduling.sched_is_splittable.unwrap_or(false)),
        );
        task.insert(
            "min_split_duration_minutes".to_owned(),
            optional_number(scheduling.sched_min_split_duration_minutes),
        );
        task.insert(
            "max_split_duration_minutes".to_owned(),
            optional_number(scheduling.sched_max_split_duration_minutes),
        );
        task.insert(
            "calendar_hours".to_owned(),
            scheduling
                .sched_calendar_hours
                .clone()
                .unwrap_or(Value::Null),
        );
        task.insert(
            "auto_schedule".to_owned(),
            Value::Bool(scheduling.sched_auto_schedule.unwrap_or(true)),
        );

        result.push(task);
    }

    Ok(result)
}

async fn fetch_full_task_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_ids: &[String],
) -> Result<Vec<Map<String, Value>>, ()> {
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            (
                "select",
                "*,task_lists!inner(workspace_boards!inner(ws_id))".to_owned(),
            ),
            ("id", in_filter(task_ids)),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Map<String, Value>>>().map_err(|_| ())
}

async fn fetch_task_calendar_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    task_ids: &[String],
) -> Result<Vec<TaskEventRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_calendar_events",
        &[
            (
                "select",
                "task_id,scheduled_minutes,completed,workspace_calendar_events!inner(ws_id)"
                    .to_owned(),
            ),
            ("task_id", in_filter(task_ids)),
            ("workspace_calendar_events.ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<TaskEventRow>>().map_err(|_| ())
}

async fn fetch_direct_calendar_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    task_ids: &[String],
) -> Result<Vec<DirectEventRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_calendar_events",
        &[
            ("select", "task_id,start_at,end_at".to_owned()),
            ("task_id", in_filter(task_ids)),
            ("ws_id", format!("eq.{ws_id}")),
            ("task_id", "not.is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<DirectEventRow>>().map_err(|_| ())
}

async fn resolve_workspace_personal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "personal".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspacePersonalRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.personal)
        .unwrap_or(false))
}

// --- workspace id normalization + membership (copied from
// workspace_habits_access.rs private helpers; that module's helpers are not
// pub(crate), so they are duplicated here as file-local fns per the
// single-file constraint) ---

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;

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
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;

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
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_request(contact_data, outbound, &url).await?;

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

async fn send_caller_request(
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

async fn send_service_role_request(
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

// --- small helpers ---

fn schedulable_tasks_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn search_query(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|raw| url::Url::parse(raw).ok())?;
    let value = url
        .query_pairs()
        .find_map(|(key, value)| (key == "q").then(|| value.into_owned()))?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn in_filter(values: &[String]) -> String {
    // PostgREST `in` filter: in.(a,b,c). Quote each value to be safe with UUIDs
    // containing reserved characters (none for UUIDs, but quoting is harmless).
    let joined = values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

fn duration_minutes(start_at: Option<&str>, end_at: Option<&str>) -> f64 {
    let (Some(start), Some(end)) = (start_at, end_at) else {
        return 0.0;
    };
    let (Ok(start_ms), Ok(end_ms)) = (parse_epoch_ms(start), parse_epoch_ms(end)) else {
        return 0.0;
    };
    ((end_ms - start_ms) / 60000.0).round()
}

/// Best-effort RFC3339 / ISO-8601 timestamp -> epoch milliseconds. Mirrors
/// JS `new Date(value).getTime()` for the timestamp shapes Supabase returns
/// (e.g. `2026-06-24T10:30:00+00:00` or `...Z`, with optional fractional
/// seconds). Returns Err if the string cannot be parsed.
fn parse_epoch_ms(value: &str) -> Result<f64, ()> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return Err(());
    }

    let year: i64 = value.get(0..4).and_then(|s| s.parse().ok()).ok_or(())?;
    let month: i64 = value.get(5..7).and_then(|s| s.parse().ok()).ok_or(())?;
    let day: i64 = value.get(8..10).and_then(|s| s.parse().ok()).ok_or(())?;
    let hour: i64 = value.get(11..13).and_then(|s| s.parse().ok()).ok_or(())?;
    let minute: i64 = value.get(14..16).and_then(|s| s.parse().ok()).ok_or(())?;
    let second: i64 = value.get(17..19).and_then(|s| s.parse().ok()).ok_or(())?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return Err(());
    }

    // Parse optional fractional seconds and timezone offset from the remainder.
    let rest = &value[19..];
    let mut idx = 0usize;
    let rest_bytes = rest.as_bytes();
    let mut frac_ms = 0.0f64;
    if rest_bytes.first() == Some(&b'.') {
        idx += 1;
        let frac_start = idx;
        while idx < rest_bytes.len() && rest_bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        let frac_str = &rest[frac_start..idx];
        if !frac_str.is_empty() {
            // Use up to milliseconds precision.
            let mut millis = String::new();
            for (i, c) in frac_str.chars().enumerate() {
                if i >= 3 {
                    break;
                }
                millis.push(c);
            }
            while millis.len() < 3 {
                millis.push('0');
            }
            frac_ms = millis.parse::<f64>().unwrap_or(0.0);
        }
    }

    // Timezone offset in seconds.
    let mut offset_seconds: i64 = 0;
    let tz = &rest[idx..];
    if tz == "Z" || tz == "z" || tz.is_empty() {
        offset_seconds = 0;
    } else if let Some(sign_char) = tz.chars().next()
        && (sign_char == '+' || sign_char == '-')
    {
        let sign = if sign_char == '-' { -1 } else { 1 };
        let digits: String = tz[1..].chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.len() >= 4 {
            let oh: i64 = digits[0..2].parse().unwrap_or(0);
            let om: i64 = digits[2..4].parse().unwrap_or(0);
            offset_seconds = sign * (oh * 3600 + om * 60);
        } else if digits.len() >= 2 {
            let oh: i64 = digits[0..2].parse().unwrap_or(0);
            offset_seconds = sign * oh * 3600;
        }
    }

    let days = days_from_civil(year, month, day);
    let utc_seconds = days * 86400 + hour * 3600 + minute * 60 + second - offset_seconds;
    Ok(utc_seconds as f64 * 1000.0 + frac_ms)
}

/// Days since 1970-01-01 (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn optional_number(value: Option<f64>) -> Value {
    match value {
        Some(v) => number_value(v),
        None => Value::Null,
    }
}

fn number_value(value: f64) -> Value {
    if value.fract() == 0.0 && value.is_finite() {
        json!(value as i64)
    } else {
        serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
