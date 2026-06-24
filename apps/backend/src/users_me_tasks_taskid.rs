use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_TASK_ID_MESSAGE: &str = "Invalid task ID";
const TASK_NOT_FOUND_MESSAGE: &str = "Task not found";
const TASK_WORKSPACE_NOT_FOUND_MESSAGE: &str = "Task workspace not found";
const TASK_BOARD_NOT_FOUND_MESSAGE: &str = "Task board not found";
const VERIFY_ACCESS_FAILED_MESSAGE: &str = "Failed to verify task access";
const LOAD_LISTS_FAILED_MESSAGE: &str = "Failed to load task lists";
const RESOLVE_TIER_FAILED_MESSAGE: &str = "Failed to resolve task workspace tier";

const RESOLVE_TIER_RPC: &str = "_resolve_workspace_tier";
const DEFAULT_TIER: &str = "FREE";

/// Embedded PostgREST select mirroring the legacy `sbAdmin.from('tasks').select(...)`.
/// Aliases match the legacy join names exactly.
const TASK_SELECT: &str = "*,\
list:task_lists!inner(id,name,board_id,board:workspace_boards(id,ws_id,workspace:workspaces(personal))),\
assignees:task_assignees(user_id,users(id,display_name,avatar_url)),\
labels:task_labels(label_id,workspace_task_labels(id,name,color,created_at)),\
projects:task_project_tasks(project_id,task_projects(id,name,status))";

#[derive(serde::Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_users_me_tasks_taskid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let task_id = parse_task_path(request.path)?;

    Some(match request.method {
        "GET" => task_response(config, request, task_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn task_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy: `if (!validate(taskId)) -> 400`.
    if !is_uuid_literal(task_id) {
        return error_response(400, INVALID_TASK_ID_MESSAGE);
    }

    // Legacy: `resolveAuthenticatedSessionUser(supabase)` -> 401 on failure.
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

    // Legacy: `sbAdmin.from('tasks').select(...).eq('id', taskId).maybeSingle()`.
    // The admin client bypasses RLS, so we use the service-role key here.
    let task = match fetch_task(&config.contact_data, outbound, task_id).await {
        Ok(Some(task)) => task,
        // `taskError || !task` both map to a 404 in the legacy route.
        Ok(None) | Err(()) => return error_response(404, TASK_NOT_FOUND_MESSAGE),
    };

    // Legacy: `task.list?.board?.ws_id`.
    let Some(task_ws_id) = task
        .get("list")
        .and_then(|list| list.get("board"))
        .and_then(|board| board.get("ws_id"))
        .and_then(Value::as_str)
        .filter(|ws_id| !ws_id.is_empty())
        .map(str::to_owned)
    else {
        return error_response(404, TASK_WORKSPACE_NOT_FOUND_MESSAGE);
    };

    // Legacy: `verifyWorkspaceMembershipType({ wsId, userId, supabase })` using the
    // caller's RLS-scoped client. `membership_lookup_failed` -> 500, otherwise
    // (missing / wrong type) -> 404.
    match verify_workspace_member(
        &config.contact_data,
        outbound,
        &task_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return error_response(404, TASK_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(500, VERIFY_ACCESS_FAILED_MESSAGE),
    }

    // Legacy: `task.list?.board_id`.
    let Some(board_id) = task
        .get("list")
        .and_then(|list| list.get("board_id"))
        .and_then(Value::as_str)
        .filter(|board_id| !board_id.is_empty())
        .map(str::to_owned)
    else {
        return error_response(404, TASK_BOARD_NOT_FOUND_MESSAGE);
    };

    // Legacy: `sbAdmin.from('task_lists').select('*').eq('board_id', boardId)
    //          .eq('deleted', false).order('position').order('created_at')`.
    let available_lists =
        match fetch_available_lists(&config.contact_data, outbound, &board_id).await {
            Ok(lists) => lists,
            Err(()) => return error_response(500, LOAD_LISTS_FAILED_MESSAGE),
        };

    let transformed_task = transform_task(&task);

    let workspace_personal = task
        .get("list")
        .and_then(|list| list.get("board"))
        .and_then(|board| board.get("workspace"))
        .and_then(|workspace| workspace.get("personal"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // Legacy: `sbAdmin.rpc('_resolve_workspace_tier', { p_ws_id: taskWsId })`.
    let tier = match resolve_workspace_tier(&config.contact_data, outbound, &task_ws_id).await {
        Ok(tier) => tier.unwrap_or_else(|| DEFAULT_TIER.to_owned()),
        Err(()) => return error_response(500, RESOLVE_TIER_FAILED_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "task": transformed_task,
            "availableLists": available_lists,
            "taskWsId": task_ws_id,
            "taskWorkspacePersonal": workspace_personal,
            "taskWorkspaceTier": tier,
        }),
    ))
}

/// Mirrors the legacy `transformedTask` reshaping of the embedded join rows.
fn transform_task(task: &Value) -> Value {
    let mut object = match task.as_object() {
        Some(object) => object.clone(),
        None => return task.clone(),
    };

    // assignees: { id: users.id || user_id, user_id, display_name, avatar_url }
    if let Some(assignees) = task.get("assignees").and_then(Value::as_array) {
        let mapped: Vec<Value> = assignees
            .iter()
            .map(|assignee| {
                let user = assignee.get("users");
                let user_id = assignee.get("user_id").cloned().unwrap_or(Value::Null);
                let id = user
                    .and_then(|user| user.get("id"))
                    .filter(|id| !id.is_null())
                    .cloned()
                    .unwrap_or_else(|| user_id.clone());
                json!({
                    "id": id,
                    "user_id": user_id,
                    // Legacy spreads `?.display_name` which is `undefined` when the
                    // user is absent; we serialize null in that case.
                    "display_name": user
                        .and_then(|user| user.get("display_name"))
                        .cloned()
                        .unwrap_or(Value::Null),
                    "avatar_url": user
                        .and_then(|user| user.get("avatar_url"))
                        .cloned()
                        .unwrap_or(Value::Null),
                })
            })
            .collect();
        object.insert("assignees".to_owned(), Value::Array(mapped));
    }

    // labels: map -> workspace_task_labels, filter(Boolean)
    if let Some(labels) = task.get("labels").and_then(Value::as_array) {
        let mapped: Vec<Value> = labels
            .iter()
            .filter_map(|label| label.get("workspace_task_labels"))
            .filter(|value| !value.is_null())
            .cloned()
            .collect();
        object.insert("labels".to_owned(), Value::Array(mapped));
    }

    // projects: map -> task_projects, filter(Boolean)
    if let Some(projects) = task.get("projects").and_then(Value::as_array) {
        let mapped: Vec<Value> = projects
            .iter()
            .filter_map(|project| project.get("task_projects"))
            .filter(|value| !value.is_null())
            .cloned()
            .collect();
        object.insert("projects".to_owned(), Value::Array(mapped));
    }

    Value::Object(object)
}

async fn fetch_task(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Option<Value>, ()> {
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_available_lists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_lists",
        &[
            ("select", "*".to_owned()),
            ("board_id", format!("eq.{board_id}")),
            ("deleted", "eq.false".to_owned()),
            ("order", "position.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Mirrors `verifyWorkspaceMembershipType` with the default `requiredType: 'MEMBER'`.
/// Uses the caller's access token (RLS-scoped), matching the legacy use of the
/// session client. Returns `Ok(true)` only for an existing `MEMBER` row; a
/// missing/other-type row is `Ok(false)` (-> 404), a request failure is `Err(())`
/// (-> 500, `membership_lookup_failed`).
async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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

/// Mirrors `sbAdmin.rpc('_resolve_workspace_tier', { p_ws_id })`. Returns the
/// resolved tier string (or `None` when the RPC returns null).
async fn resolve_workspace_tier(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data.rpc_url(RESOLVE_TIER_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "p_ws_id": ws_id }).to_string();

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

    // A scalar RPC returns the bare value (e.g. `"FREE"` or `null`).
    let value: Value = response.json::<Value>().map_err(|_| ())?;
    Ok(match value {
        Value::String(tier) if !tier.is_empty() => Some(tier),
        _ => None,
    })
}

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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

/// Matches `/api/v1/users/me/tasks/:taskId` and returns `taskId` when the shape
/// matches.
fn parse_task_path(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "users"
        && segments[3] == "me"
        && segments[4] == "tasks"
        && !segments[5].is_empty()
    {
        Some(segments[5])
    } else {
        None
    }
}

/// Mirrors `uuid`'s `validate`: a canonical 8-4-4-4-12 hyphenated hex UUID.
fn is_uuid_literal(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
