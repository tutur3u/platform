use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const TASK_NOT_FOUND_MESSAGE: &str = "Task not found";
const LOAD_TASK_FAILED_MESSAGE: &str = "Failed to load task";
const RESOLVE_TIER_FAILED_MESSAGE: &str = "Failed to resolve task workspace tier";
const DEFAULT_TIER: &str = "FREE";
const RESOLVE_WORKSPACE_TIER_RPC: &str = "_resolve_workspace_tier";

const TASKS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const TASKS_PATH_SEGMENT: &str = "/tasks/";

// PostgREST nested select mirroring getWorkspaceTask in the legacy route.
const TASK_SELECT: &str = "id,display_number,name,description,priority,completed,completed_at,start_date,end_date,estimation_points,sort_key,created_at,closed_at,deleted_at,list_id,task_lists!inner(id,name,status,board_id,workspace_boards!inner(id,ws_id,name,workspace:workspaces(personal))),assignees:task_assignees(...users(id,display_name,avatar_url)),labels:task_labels(...workspace_task_labels(id,name,color,created_at)),projects:task_project_tasks(...task_projects(id,name,status))";

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
struct WorkspaceRow {
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceBoardRow {
    ws_id: Option<String>,
    name: Option<String>,
    workspace: Option<WorkspaceRow>,
}

#[derive(Deserialize)]
struct TaskListRow {
    name: Option<String>,
    status: Option<String>,
    board_id: Option<String>,
    workspace_boards: Option<WorkspaceBoardRow>,
}

#[derive(Deserialize)]
struct TaskRow {
    id: Option<String>,
    display_number: Option<Value>,
    name: Option<String>,
    description: Option<String>,
    priority: Option<Value>,
    completed: Option<bool>,
    completed_at: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    estimation_points: Option<Value>,
    sort_key: Option<Value>,
    created_at: Option<String>,
    closed_at: Option<String>,
    deleted_at: Option<String>,
    list_id: Option<String>,
    task_lists: Option<TaskListRow>,
    #[serde(default)]
    assignees: Vec<Value>,
    #[serde(default)]
    labels: Vec<Value>,
    #[serde(default)]
    projects: Vec<Value>,
}

pub(crate) async fn handle_workspaces_tasks_taskid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, task_id) = task_detail_path_parts(request.path)?;

    // Only the GET method is migrated. Every other method (PUT/PATCH/DELETE)
    // must fall through to the still-active Next.js route, so return None for
    // them instead of producing a 405.
    Some(match request.method {
        "GET" => task_detail_get_response(config, request, raw_ws_id, task_id, outbound).await?,
        _ => return None,
    })
}

async fn task_detail_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let contact_data = &config.contact_data;

    // App-session-authenticated requests (CLI/calendar/tasks apps) are not
    // resolvable here; fall through to the Next.js route which still handles
    // them via withSessionAuth's app-session path.
    if contact::request_has_app_session_token(request) {
        return None;
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Some(error_response(401, UNAUTHORIZED_MESSAGE));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Some(error_response(401, UNAUTHORIZED_MESSAGE));
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return Some(error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE)),
        };

    // Member fast-path. Non-members (guest board-share access) are intentionally
    // NOT handled here; we return None so the still-active Next.js route resolves
    // guest/board-share access correctly.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return None,
        Err(()) => return Some(error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE)),
    }

    let task = match fetch_workspace_task(contact_data, outbound, task_id).await {
        Ok(task) => task,
        Err(()) => return Some(error_response(500, LOAD_TASK_FAILED_MESSAGE)),
    };

    // Replicate getWorkspaceTask: the task must belong to the resolved workspace.
    let Some(task) = task.filter(|task| {
        task.task_lists
            .as_ref()
            .and_then(|list| list.workspace_boards.as_ref())
            .and_then(|board| board.ws_id.as_deref())
            == Some(resolved_ws_id.as_str())
    }) else {
        return Some(error_response(404, TASK_NOT_FOUND_MESSAGE));
    };

    let workspace_personal = task
        .task_lists
        .as_ref()
        .and_then(|list| list.workspace_boards.as_ref())
        .and_then(|board| board.workspace.as_ref())
        .and_then(|workspace| workspace.personal)
        .unwrap_or(false);

    let tier = match resolve_workspace_tier(contact_data, outbound, &resolved_ws_id).await {
        Ok(tier) => tier,
        Err(()) => return Some(error_response(500, RESOLVE_TIER_FAILED_MESSAGE)),
    };

    Some(no_store_response(json_response(
        200,
        json!({
            "task": serialize_task(&task),
            "taskWsId": resolved_ws_id,
            "taskWorkspacePersonal": workspace_personal,
            "taskWorkspaceTier": tier,
        }),
    )))
}

fn serialize_task(task: &TaskRow) -> Value {
    let assignee_ids = unique_entity_ids(&task.assignees);
    let label_ids = unique_entity_ids(&task.labels);
    let project_ids = unique_entity_ids(&task.projects);

    let (board_id, board_name, list_name, list_status) = match task.task_lists.as_ref() {
        Some(list) => (
            json!(list.board_id),
            json!(
                list.workspace_boards
                    .as_ref()
                    .and_then(|board| board.name.clone())
            ),
            json!(list.name),
            json!(list.status),
        ),
        None => (Value::Null, Value::Null, Value::Null, Value::Null),
    };

    json!({
        "id": task.id,
        "display_number": task.display_number,
        "name": task.name,
        "description": task.description,
        "priority": task.priority,
        "completed": task.completed,
        "completed_at": task.completed_at,
        "start_date": task.start_date,
        "end_date": task.end_date,
        "estimation_points": task.estimation_points,
        "sort_key": task.sort_key,
        "created_at": task.created_at,
        "closed_at": task.closed_at,
        "deleted_at": task.deleted_at,
        "list_id": task.list_id,
        "board_id": board_id,
        "board_name": board_name,
        "list_name": list_name,
        "list_status": list_status,
        "assignees": task.assignees,
        "labels": task.labels,
        "projects": task.projects,
        "assignee_ids": assignee_ids,
        "label_ids": label_ids,
        "project_ids": project_ids,
    })
}

fn unique_entity_ids(entries: &[Value]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut ids = Vec::new();

    for entry in entries {
        if let Some(id) = entry.get("id").and_then(Value::as_str)
            && !id.is_empty()
            && seen.insert(id.to_owned())
        {
            ids.push(id.to_owned());
        }
    }

    ids
}

async fn fetch_workspace_task(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Option<TaskRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            ("select", TASK_SELECT.to_owned()),
            ("id", format!("eq.{task_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn resolve_workspace_tier(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rpc_url(RESOLVE_WORKSPACE_TIER_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&json!({ "p_ws_id": ws_id })).map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
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

    // The RPC returns a scalar (string) tier; tolerate null -> default.
    let value = response.json::<Value>().map_err(|_| ())?;
    Ok(value
        .as_str()
        .filter(|tier| !tier.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| DEFAULT_TIER.to_owned()))
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
            workspace_id_by_handle(contact_data, outbound, &handle, access_token, false).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token, true).await?
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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

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
    service_role: bool,
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
    let response = if service_role {
        send_service_role_get(contact_data, outbound, &url).await?
    } else {
        send_caller_get(contact_data, outbound, &url, access_token).await?
    };

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
    let response = send_service_role_get(contact_data, outbound, &url).await?;

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

async fn send_service_role_get(
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

fn task_detail_path_parts(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(TASKS_PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(TASKS_PATH_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    let task_id = after_ws.split('/').next().unwrap_or("");
    // Must be exactly /tasks/<taskId> with no trailing sub-resource segments.
    if task_id.is_empty() || after_ws.contains('/') {
        return None;
    }

    Some((ws_id, task_id))
}

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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
