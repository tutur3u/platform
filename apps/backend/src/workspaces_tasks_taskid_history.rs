use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";
const TASK_NOT_FOUND_MESSAGE: &str = "Task not found";
const TASK_NOT_IN_WORKSPACE_MESSAGE: &str = "Task does not belong to this workspace";
const HISTORY_FETCH_FAILED_MESSAGE: &str = "Failed to fetch task history";

const TASK_HISTORY_RPC: &str = "get_task_history";

const DEFAULT_LIMIT: i64 = 50;
const DEFAULT_OFFSET: i64 = 0;

const CHANGE_TYPES: &[&str] = &[
    "task_created",
    "field_updated",
    "assignee_added",
    "assignee_removed",
    "label_added",
    "label_removed",
    "project_linked",
    "project_unlinked",
];

const FIELD_NAMES: &[&str] = &[
    "name",
    "description",
    "priority",
    "end_date",
    "start_date",
    "estimation_points",
    "list_id",
    "completed",
];

/// PostgREST returns RPC errors as `{ "message": "...", ... }`.
#[derive(serde::Deserialize)]
struct PostgrestError {
    message: Option<String>,
}

pub(crate) async fn handle_workspaces_tasks_taskid_history_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, task_id) = parse_history_path(request.path)?;

    Some(match request.method {
        "GET" => history_response(config, request, raw_ws_id, task_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn history_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Authenticate the caller. The legacy route relies on Supabase RLS via the
    // authenticated session inside the RPC, so the read must use the caller's
    // access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Parse + validate the query parameters (mirrors the legacy zod schema).
    let query = match parse_history_query(request.url) {
        Ok(query) => query,
        Err(issues) => return invalid_query_response(issues),
    };

    let ws_id = resolve_workspace_id(raw_ws_id);

    let body = json!({
        "p_ws_id": ws_id,
        "p_task_id": task_id,
        "p_limit": query.limit,
        "p_offset": query.offset,
        // The legacy route passes `undefined` (omitted) when these are absent.
        // Serializing `null` is equivalent for a PostgREST RPC with NULL defaults.
        "p_change_type": query.change_type,
        "p_field_name": query.field_name,
    })
    .to_string();

    let response = match send_caller_rpc(
        &config.contact_data,
        outbound,
        TASK_HISTORY_RPC,
        &body,
        &access_token,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return error_response(500, HISTORY_FETCH_FAILED_MESSAGE),
    };

    if !(200..300).contains(&response.status) {
        // Map known RPC error messages to legacy statuses.
        let message = postgrest_error_message(&response);
        return match message.as_deref() {
            Some(TASK_NOT_FOUND_MESSAGE) => error_response(404, TASK_NOT_FOUND_MESSAGE),
            Some(TASK_NOT_IN_WORKSPACE_MESSAGE) => {
                error_response(403, TASK_NOT_IN_WORKSPACE_MESSAGE)
            }
            Some(ACCESS_DENIED_MESSAGE) => error_response(403, ACCESS_DENIED_MESSAGE),
            _ => error_response(500, HISTORY_FETCH_FAILED_MESSAGE),
        };
    }

    // RPC returns a set of rows. A null/absent body yields an empty list.
    let rows: Vec<Value> = match response.json::<Option<Vec<Value>>>() {
        Ok(Some(rows)) => rows,
        Ok(None) => Vec::new(),
        Err(_) => return error_response(500, HISTORY_FETCH_FAILED_MESSAGE),
    };

    // Total count + task name come from the first row (or defaults if empty).
    let total_count = rows
        .first()
        .and_then(|row| row.get("total_count"))
        .and_then(value_as_i64)
        .unwrap_or(0);
    let task_name = rows
        .first()
        .and_then(|row| row.get("task_name"))
        .and_then(Value::as_str)
        .unwrap_or("Unknown Task")
        .to_owned();

    let formatted_history: Vec<Value> = rows.iter().map(format_history_entry).collect();

    no_store_response(json_response(
        200,
        json!({
            "history": formatted_history,
            "count": total_count,
            "limit": query.limit,
            "offset": query.offset,
            "task": {
                "id": task_id,
                "name": task_name,
            },
        }),
    ))
}

/// Maps an RPC row into the legacy response entry shape. Absent / null
/// optional fields are omitted, mirroring `?? undefined` in the legacy code.
fn format_history_entry(entry: &Value) -> Value {
    let mut object = serde_json::Map::new();

    // Always present.
    object.insert(
        "id".to_owned(),
        entry.get("id").cloned().unwrap_or(Value::Null),
    );
    object.insert(
        "task_id".to_owned(),
        entry.get("task_id").cloned().unwrap_or(Value::Null),
    );
    object.insert(
        "changed_at".to_owned(),
        entry.get("changed_at").cloned().unwrap_or(Value::Null),
    );
    object.insert(
        "metadata".to_owned(),
        entry.get("metadata").cloned().unwrap_or(Value::Null),
    );

    // Optional: omitted when null/absent (legacy `?? undefined`).
    insert_if_present(&mut object, "changed_by", entry.get("changed_by"));
    insert_if_present(&mut object, "change_type", entry.get("change_type"));
    insert_if_present(&mut object, "field_name", entry.get("field_name"));
    insert_if_present(&mut object, "old_value", entry.get("old_value"));
    insert_if_present(&mut object, "new_value", entry.get("new_value"));

    // user is built from the user_* columns; null when no user_id.
    let user_value = match entry.get("user_id") {
        Some(user_id) if !user_id.is_null() => {
            let name = entry
                .get("user_display_name")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty())
                .unwrap_or("Unknown");
            json!({
                "id": user_id,
                "name": name,
                "avatar_url": entry.get("user_avatar_url").cloned().unwrap_or(Value::Null),
            })
        }
        _ => Value::Null,
    };
    object.insert("user".to_owned(), user_value);

    Value::Object(object)
}

fn insert_if_present(
    object: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&Value>,
) {
    if let Some(value) = value
        && !value.is_null()
    {
        object.insert(key.to_owned(), value.clone());
    }
}

struct HistoryQuery {
    limit: i64,
    offset: i64,
    change_type: Option<String>,
    field_name: Option<String>,
}

/// Parses + validates the query string, mirroring the legacy zod schema.
/// Returns the parsed values or a list of validation issues for the 400 body.
fn parse_history_query(request_url: Option<&str>) -> Result<HistoryQuery, Vec<Value>> {
    let limit_raw = query_value(request_url, "limit");
    let offset_raw = query_value(request_url, "offset");
    let change_type_raw = query_value(request_url, "change_type");
    let field_name_raw = query_value(request_url, "field_name");

    // Legacy: `val ? parseInt(val, 10) : default`. A present non-numeric value
    // yields NaN in JS but here we keep the default to avoid sending NaN to the
    // RPC; integrator should verify if strict NaN behavior matters.
    let limit = limit_raw
        .as_deref()
        .filter(|value| !value.is_empty())
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(DEFAULT_LIMIT);
    let offset = offset_raw
        .as_deref()
        .filter(|value| !value.is_empty())
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(DEFAULT_OFFSET);

    let mut issues: Vec<Value> = Vec::new();

    let change_type = validate_enum(
        change_type_raw.as_deref(),
        CHANGE_TYPES,
        "change_type",
        &mut issues,
    );
    let field_name = validate_enum(
        field_name_raw.as_deref(),
        FIELD_NAMES,
        "field_name",
        &mut issues,
    );

    if issues.is_empty() {
        Ok(HistoryQuery {
            limit,
            offset,
            change_type,
            field_name,
        })
    } else {
        Err(issues)
    }
}

/// Validates an optional enum query param. Absent/empty -> None. A present
/// invalid value records a zod-style issue.
fn validate_enum(
    raw: Option<&str>,
    allowed: &[&str],
    field: &str,
    issues: &mut Vec<Value>,
) -> Option<String> {
    let value = raw.filter(|value| !value.is_empty())?;

    if allowed.contains(&value) {
        Some(value.to_owned())
    } else {
        issues.push(json!({
            "code": "invalid_enum_value",
            "path": [field],
            "message": format!(
                "Invalid enum value. Expected {}, received '{value}'",
                allowed
                    .iter()
                    .map(|option| format!("'{option}'"))
                    .collect::<Vec<_>>()
                    .join(" | ")
            ),
        }));
        None
    }
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

fn value_as_i64(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(number);
    }
    if let Some(number) = value.as_f64() {
        return Some(number as i64);
    }
    value.as_str().and_then(|text| text.parse::<i64>().ok())
}

fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(found_key, value)| (found_key == key).then(|| value.into_owned()))
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

/// Matches `/api/v1/workspaces/:wsId/tasks/:taskId/history` and returns
/// `(wsId, taskId)` when the path shape matches.
fn parse_history_path(path: &str) -> Option<(&str, &str)> {
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
        && segments[6] == "history"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn invalid_query_response(issues: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "error": INVALID_QUERY_MESSAGE,
            "details": issues,
        }),
    ))
}
