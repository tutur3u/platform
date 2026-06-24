use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Workspace-id normalization constants (mirror workspace_habits_access.rs).
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// Legacy response messages + status codes.
const INVALID_IDS_MESSAGE: &str = "Invalid workspace or task ID";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_TASK_FAILED_MESSAGE: &str = "Failed to load task";
const TASK_NOT_FOUND_MESSAGE: &str = "Task not found";
const LOAD_RELATIONSHIPS_FAILED_MESSAGE: &str = "Failed to load task relationships";

// Allowed task priorities (mirrors @tuturuuu/types isTaskPriority).
const TASK_PRIORITIES: &[&str] = &["critical", "high", "normal", "low"];

// ---------------------------------------------------------------------------
// Supabase row shapes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

/// `tasks` row used only to validate the task belongs to the workspace.
#[derive(Deserialize)]
struct TaskWorkspaceRow {
    list: Option<TaskWorkspaceList>,
}

#[derive(Deserialize)]
struct TaskWorkspaceList {
    board: Option<TaskWorkspaceBoard>,
}

#[derive(Deserialize)]
struct TaskWorkspaceBoard {
    ws_id: Option<String>,
}

/// Embedded board info for a related task.
#[derive(Deserialize)]
struct RelationshipBoard {
    name: Option<String>,
    ticket_prefix: Option<String>,
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct RelationshipList {
    board: Option<RelationshipBoard>,
}

/// Full related-task row (matches the legacy nested select).
#[derive(Deserialize)]
struct RelationshipTaskRow {
    id: String,
    name: String,
    display_number: Option<i64>,
    completed_at: Option<String>,
    closed_at: Option<String>,
    priority: Option<String>,
    board_id: Option<String>,
    deleted_at: Option<String>,
    list: Option<RelationshipList>,
}

#[derive(Deserialize)]
struct SourceRelationshipRow {
    #[serde(rename = "type")]
    relationship_type: Option<String>,
    target_task: Option<RelationshipTaskRow>,
}

#[derive(Deserialize)]
struct TargetRelationshipRow {
    #[serde(rename = "type")]
    relationship_type: Option<String>,
    source_task: Option<RelationshipTaskRow>,
}

// ---------------------------------------------------------------------------
// Response shapes (mirror TaskRelationshipsResponse / RelatedTaskInfo)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct RelatedTaskInfo {
    id: String,
    name: String,
    display_number: Option<i64>,
    completed: bool,
    priority: Option<String>,
    board_id: Option<String>,
    board_name: Option<String>,
    ticket_prefix: Option<String>,
}

#[derive(Serialize)]
struct TaskRelationshipsResponse {
    #[serde(rename = "parentTask")]
    parent_task: Option<RelatedTaskInfo>,
    #[serde(rename = "childTasks")]
    child_tasks: Vec<RelatedTaskInfo>,
    #[serde(rename = "blockedBy")]
    blocked_by: Vec<RelatedTaskInfo>,
    blocking: Vec<RelatedTaskInfo>,
    #[serde(rename = "relatedTasks")]
    related_tasks: Vec<RelatedTaskInfo>,
}

// ---------------------------------------------------------------------------
// Route entrypoint
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_tasks_taskid_relationships_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, task_id) = parse_relationships_path(request.path)?;

    // Only GET is migrated. Other methods (POST/DELETE) must fall through to the
    // still-active Next.js route, so return None for them.
    Some(match request.method {
        "GET" => relationships_response(config, request, raw_ws_id, task_id, outbound).await,
        _ => return None,
    })
}

async fn relationships_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy validates `taskId` with `z.guid()` -> 400 on invalid.
    if !is_uuid_literal(task_id) {
        return error_response(400, INVALID_IDS_MESSAGE);
    }

    // Authenticate the caller via Supabase.
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

    // Normalize the workspace id (handles `personal`, `internal`, handles).
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
        // Legacy returns 403 when normalizeWorkspaceId cannot resolve membership
        // (verifyWorkspaceMembershipType then reports !ok). We surface 500 only
        // on lookup failures and 403 below, matching the legacy outcomes.
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    // Verify the caller is a workspace MEMBER (default requiredType in legacy).
    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Confirm the task exists, is not soft-deleted, and lives in this workspace.
    match task_in_workspace(&config.contact_data, outbound, task_id, &resolved_ws_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, TASK_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(500, LOAD_TASK_FAILED_MESSAGE),
    }

    // Fetch outgoing (source) relationships.
    let source_rows =
        match fetch_source_relationships(&config.contact_data, outbound, task_id).await {
            Ok(rows) => rows,
            Err(()) => return error_response(500, LOAD_RELATIONSHIPS_FAILED_MESSAGE),
        };

    // Fetch incoming (target) relationships.
    let target_rows =
        match fetch_target_relationships(&config.contact_data, outbound, task_id).await {
            Ok(rows) => rows,
            Err(()) => return error_response(500, LOAD_RELATIONSHIPS_FAILED_MESSAGE),
        };

    let mut result = TaskRelationshipsResponse {
        parent_task: None,
        child_tasks: Vec::new(),
        blocked_by: Vec::new(),
        blocking: Vec::new(),
        related_tasks: Vec::new(),
    };

    for relationship in source_rows {
        let Some(target_task) = relationship.target_task else {
            continue;
        };
        if target_task.deleted_at.is_some()
            || related_task_ws_id(&target_task).as_deref() != Some(resolved_ws_id.as_str())
        {
            continue;
        }
        let task_info = to_task_info(&target_task);
        match relationship.relationship_type.as_deref() {
            Some("parent_child") => result.child_tasks.push(task_info),
            Some("blocks") => result.blocking.push(task_info),
            Some("related") => result.related_tasks.push(task_info),
            _ => {}
        }
    }

    for relationship in target_rows {
        let Some(source_task) = relationship.source_task else {
            continue;
        };
        if source_task.deleted_at.is_some()
            || related_task_ws_id(&source_task).as_deref() != Some(resolved_ws_id.as_str())
        {
            continue;
        }
        let task_info = to_task_info(&source_task);
        match relationship.relationship_type.as_deref() {
            Some("parent_child") => result.parent_task = Some(task_info),
            Some("blocks") => result.blocked_by.push(task_info),
            Some("related") if !result.related_tasks.iter().any(|t| t.id == task_info.id) => {
                result.related_tasks.push(task_info);
            }
            _ => {}
        }
    }

    no_store_response(json_response(200, result))
}

// ---------------------------------------------------------------------------
// Task / relationship reads (service role, mirroring sbAdmin)
// ---------------------------------------------------------------------------

async fn task_in_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            (
                "select",
                "id,list:task_lists!inner(board:workspace_boards!inner(ws_id))".to_owned(),
            ),
            ("id", format!("eq.{task_id}")),
            ("deleted_at", "is.null".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let row = response
        .json::<Vec<TaskWorkspaceRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();

    Ok(match row {
        Some(row) => {
            row.list
                .and_then(|list| list.board)
                .and_then(|board| board.ws_id)
                .as_deref()
                == Some(ws_id)
        }
        None => false,
    })
}

async fn fetch_source_relationships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Vec<SourceRelationshipRow>, ()> {
    let select = format!(
        "type,target_task:tasks!task_relationships_target_task_id_fkey({})",
        RELATED_TASK_SELECT
    );
    let Some(url) = contact_data.rest_url(
        "task_relationships",
        &[
            ("select", select),
            ("source_task_id", format!("eq.{task_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<SourceRelationshipRow>>()
        .map_err(|_| ())
}

async fn fetch_target_relationships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Vec<TargetRelationshipRow>, ()> {
    let select = format!(
        "type,source_task:tasks!task_relationships_source_task_id_fkey({})",
        RELATED_TASK_SELECT
    );
    let Some(url) = contact_data.rest_url(
        "task_relationships",
        &[
            ("select", select),
            ("target_task_id", format!("eq.{task_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<TargetRelationshipRow>>()
        .map_err(|_| ())
}

/// Nested PostgREST select for a related task (matches the legacy embed).
const RELATED_TASK_SELECT: &str = "id,name,display_number,completed_at,closed_at,priority,board_id,deleted_at,list:task_lists(board:workspace_boards(name,ticket_prefix,ws_id))";

fn related_task_ws_id(task: &RelationshipTaskRow) -> Option<String> {
    task.list
        .as_ref()
        .and_then(|list| list.board.as_ref())
        .and_then(|board| board.ws_id.clone())
}

fn to_task_info(task: &RelationshipTaskRow) -> RelatedTaskInfo {
    let board = task.list.as_ref().and_then(|list| list.board.as_ref());

    let priority = task
        .priority
        .as_deref()
        .filter(|p| TASK_PRIORITIES.contains(p))
        .map(|p| p.to_owned());

    RelatedTaskInfo {
        id: task.id.clone(),
        name: task.name.clone(),
        display_number: task.display_number,
        completed: task.closed_at.is_some() || task.completed_at.is_some(),
        priority,
        board_id: task.board_id.clone(),
        board_name: board.and_then(|b| b.name.clone()),
        ticket_prefix: board.and_then(|b| b.ticket_prefix.clone()),
    }
}

// ---------------------------------------------------------------------------
// Workspace-id normalization + membership (copied from workspace_habits_access.rs;
// those are private fns in that module, so we inline file-local copies here to
// avoid editing the shared module).
// ---------------------------------------------------------------------------

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

    if !is_uuid_literal(&resolved_ws_id) {
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

// ---------------------------------------------------------------------------
// Outbound helpers (copied from workspace_habits_access.rs private fns)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Path + id helpers
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/tasks/{taskId}/relationships`.
fn parse_relationships_path(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "tasks"
        && segments[6] == "relationships"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
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
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_uuid_literal(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 36
        && trimmed
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
