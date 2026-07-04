use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_ID_MESSAGE: &str = "Invalid task or history ID";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";
const TASK_NOT_FOUND_MESSAGE: &str = "Task not found";
const TASK_NOT_IN_WORKSPACE_MESSAGE: &str = "Task does not belong to this workspace";
const HISTORY_NOT_FOUND_MESSAGE: &str = "History entry not found";
const SNAPSHOT_FETCH_FAILED_MESSAGE: &str = "Failed to fetch task snapshot";

const TASK_SNAPSHOT_RPC: &str = "get_task_snapshot_at_history";
const TASK_RELATIONSHIPS_RPC: &str = "get_task_relationships_at_snapshot";

/// PostgREST returns RPC errors as `{ "message": "...", ... }`.
#[derive(Deserialize)]
struct PostgrestError {
    message: Option<String>,
}

#[derive(Deserialize, Default)]
struct TaskRelationshipsSnapshot {
    #[serde(default)]
    assignees: Vec<Value>,
    #[serde(default)]
    labels: Vec<Value>,
    #[serde(default)]
    projects: Vec<Value>,
}

#[derive(Deserialize)]
struct TaskHistoryRow {
    id: Value,
    changed_at: Value,
    change_type: Value,
    field_name: Value,
}

pub(crate) async fn handle_workspaces_tasks_snapshot_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, task_id, history_id) = parse_snapshot_path(request.path)?;

    Some(match request.method {
        "GET" => snapshot_response(config, request, raw_ws_id, task_id, history_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn snapshot_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    task_id: &str,
    history_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Authenticate the caller. The legacy route relies on Supabase RLS via the
    // authenticated session, so reads here must use the caller's access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    if !is_uuid_literal(task_id) || !is_uuid_literal(history_id) {
        return message_response(400, INVALID_ID_MESSAGE);
    }

    let ws_id = resolve_workspace_id(raw_ws_id);

    // 1. Reconstruct the task snapshot at the history point.
    let task_snapshot = match fetch_task_snapshot(
        &config.contact_data,
        outbound,
        &access_token,
        &ws_id,
        task_id,
        history_id,
    )
    .await
    {
        Ok(value) => value,
        Err(SnapshotError::Mapped(status, message)) => return message_response(status, message),
        Err(SnapshotError::Internal) => {
            return message_response(500, SNAPSHOT_FETCH_FAILED_MESSAGE);
        }
    };

    // 2. Relationships at the snapshot point. Failures here are non-fatal; the
    //    legacy route continues with empty relationships.
    let relationships = fetch_relationships_snapshot(
        &config.contact_data,
        outbound,
        &access_token,
        &ws_id,
        task_id,
        history_id,
    )
    .await
    .unwrap_or_default();

    // 3. History entry details for context (RLS-scoped read).
    let history_entry =
        fetch_history_entry(&config.contact_data, outbound, &access_token, history_id).await;

    // Merge task snapshot with relationships, preserving snapshot fields.
    let mut full_snapshot = match task_snapshot {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    full_snapshot.insert(
        "assignees".to_owned(),
        Value::Array(relationships.assignees),
    );
    full_snapshot.insert("labels".to_owned(), Value::Array(relationships.labels));
    full_snapshot.insert("projects".to_owned(), Value::Array(relationships.projects));

    let history_entry_value = match history_entry {
        Some(entry) => json!({
            "id": entry.id,
            "changed_at": entry.changed_at,
            "change_type": entry.change_type,
            "field_name": entry.field_name,
        }),
        None => Value::Null,
    };

    no_store_response(json_response(
        200,
        json!({
            "snapshot": Value::Object(full_snapshot),
            "historyEntry": history_entry_value,
        }),
    ))
}

enum SnapshotError {
    /// A legacy-mapped (status, message) pair.
    Mapped(u16, &'static str),
    /// Any other failure -> 500 "Failed to fetch task snapshot".
    Internal,
}

async fn fetch_task_snapshot(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    ws_id: &str,
    task_id: &str,
    history_id: &str,
) -> Result<Value, SnapshotError> {
    let body = json!({
        "p_ws_id": ws_id,
        "p_task_id": task_id,
        "p_history_id": history_id,
    })
    .to_string();

    let response = send_caller_rpc(
        contact_data,
        outbound,
        TASK_SNAPSHOT_RPC,
        &body,
        access_token,
    )
    .await
    .map_err(|()| SnapshotError::Internal)?;

    if (200..300).contains(&response.status) {
        // RPC returns a single jsonb/record. Treat a null body as an empty object.
        return Ok(response.json::<Value>().unwrap_or(Value::Null));
    }

    // Map known RPC error messages to legacy statuses.
    let message = postgrest_error_message(&response);
    Err(match message.as_deref() {
        Some(ACCESS_DENIED_MESSAGE) => SnapshotError::Mapped(403, ACCESS_DENIED_MESSAGE),
        Some(TASK_NOT_FOUND_MESSAGE) => SnapshotError::Mapped(404, TASK_NOT_FOUND_MESSAGE),
        Some(TASK_NOT_IN_WORKSPACE_MESSAGE) => {
            SnapshotError::Mapped(403, TASK_NOT_IN_WORKSPACE_MESSAGE)
        }
        Some(HISTORY_NOT_FOUND_MESSAGE) => SnapshotError::Mapped(404, HISTORY_NOT_FOUND_MESSAGE),
        _ => SnapshotError::Internal,
    })
}

async fn fetch_relationships_snapshot(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    ws_id: &str,
    task_id: &str,
    history_id: &str,
) -> Result<TaskRelationshipsSnapshot, ()> {
    let body = json!({
        "p_ws_id": ws_id,
        "p_task_id": task_id,
        "p_history_id": history_id,
    })
    .to_string();

    let response = send_caller_rpc(
        contact_data,
        outbound,
        TASK_RELATIONSHIPS_RPC,
        &body,
        access_token,
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // A null/absent payload yields the default (empty) relationships.
    match response.json::<Option<TaskRelationshipsSnapshot>>() {
        Ok(Some(relationships)) => Ok(relationships),
        Ok(None) => Ok(TaskRelationshipsSnapshot::default()),
        Err(_) => Err(()),
    }
}

async fn fetch_history_entry(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    history_id: &str,
) -> Option<TaskHistoryRow> {
    let url = contact_data.rest_url(
        "task_history",
        &[
            (
                "select",
                "id,changed_at,change_type,field_name,changed_by".to_owned(),
            ),
            ("id", format!("eq.{history_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;
    let service_role_key = contact_data.service_role_key()?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    response
        .json::<Vec<TaskHistoryRow>>()
        .ok()?
        .into_iter()
        .next()
}

async fn send_caller_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let url = contact_data.rpc_url(function).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

fn postgrest_error_message(response: &OutboundResponse) -> Option<String> {
    response
        .json::<PostgrestError>()
        .ok()
        .and_then(|error| error.message)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

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

/// Matches `/api/v1/workspaces/:wsId/tasks/:taskId/snapshot/:historyId` and
/// returns `(wsId, taskId, historyId)` when the path shape matches.
fn parse_snapshot_path(path: &str) -> Option<(&str, &str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "tasks"
        && segments[6] == "snapshot"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
        && !segments[7].is_empty()
    {
        Some((segments[3], segments[5], segments[7]))
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
