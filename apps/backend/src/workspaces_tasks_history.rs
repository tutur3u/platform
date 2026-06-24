use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACE_TASKS_HISTORY_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_TASKS_HISTORY_PATH_SUFFIX: &str = "/tasks/history";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const TASK_HISTORY_RPC: &str = "get_workspace_task_history";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch task history";
// Reserved for parity with the legacy catch-all 500 ("Internal server error").
// All current failure paths map to specific 4xx/5xx messages above.
#[allow(dead_code)]
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 20;

// Mirrors MAX_COLOR_LENGTH / MAX_SEARCH_LENGTH guards from the legacy zod schema.
const MAX_COLOR_LENGTH: usize = 100;
const MAX_SEARCH_LENGTH: usize = 100;

const ALLOWED_CHANGE_TYPES: [&str; 8] = [
    "task_created",
    "field_updated",
    "assignee_added",
    "assignee_removed",
    "label_added",
    "label_removed",
    "project_linked",
    "project_unlinked",
];

const ALLOWED_FIELD_NAMES: [&str; 9] = [
    "name",
    "description",
    "priority",
    "end_date",
    "start_date",
    "estimation_points",
    "list_id",
    "completed",
    "deleted_at",
];

pub(crate) async fn handle_workspaces_tasks_history_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_tasks_history_ws_id(request.path)?;

    Some(match request.method {
        "GET" => task_history_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn task_history_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let _ = &user_id; // Authentication only; the RPC performs workspace authorization.

    let ws_id = resolve_workspace_id(raw_ws_id);

    // Parse + validate query parameters (mirrors the legacy zod schema).
    let url = request.url.and_then(|url| url::Url::parse(url).ok());

    let page = query_i64(url.as_ref(), "page", DEFAULT_PAGE);
    let page_size = query_i64(url.as_ref(), "pageSize", DEFAULT_PAGE_SIZE);

    let change_type = match enum_query(url.as_ref(), "change_type", &ALLOWED_CHANGE_TYPES) {
        Ok(value) => value,
        Err(()) => return invalid_query_response("change_type"),
    };
    let field_name = match enum_query(url.as_ref(), "field_name", &ALLOWED_FIELD_NAMES) {
        Ok(value) => value,
        Err(()) => return invalid_query_response("field_name"),
    };
    let board_id = match guid_query(url.as_ref(), "board_id") {
        Ok(value) => value,
        Err(()) => return invalid_query_response("board_id"),
    };
    let from = match bounded_query(url.as_ref(), "from", MAX_COLOR_LENGTH) {
        Ok(value) => value,
        Err(()) => return invalid_query_response("from"),
    };
    let to = match bounded_query(url.as_ref(), "to", MAX_COLOR_LENGTH) {
        Ok(value) => value,
        Err(()) => return invalid_query_response("to"),
    };
    let search = match bounded_query(url.as_ref(), "search", MAX_SEARCH_LENGTH) {
        Ok(value) => value,
        Err(()) => return invalid_query_response("search"),
    };

    // Build the RPC payload. Optional params are only included when present,
    // matching the `?? undefined` behavior of the legacy call.
    let mut rpc_params = Map::new();
    rpc_params.insert("p_ws_id".to_owned(), Value::String(ws_id));
    rpc_params.insert("p_page".to_owned(), Value::from(page));
    rpc_params.insert("p_page_size".to_owned(), Value::from(page_size));
    insert_optional_string(&mut rpc_params, "p_change_type", change_type);
    insert_optional_string(&mut rpc_params, "p_field_name", field_name);
    insert_optional_string(&mut rpc_params, "p_board_id", board_id);
    insert_optional_string(&mut rpc_params, "p_search", search);
    insert_optional_string(&mut rpc_params, "p_from", from);
    insert_optional_string(&mut rpc_params, "p_to", to);

    let history = match fetch_task_history(
        contact_data,
        outbound,
        &access_token,
        Value::Object(rpc_params),
    )
    .await
    {
        Ok(rows) => rows,
        Err(TaskHistoryError::AccessDenied) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(TaskHistoryError::Failed) => return error_response(500, FETCH_FAILED_MESSAGE),
    };

    // Total count from the first row's `total_count` (or 0 if empty).
    let total_count = history
        .first()
        .and_then(|row| row.get("total_count"))
        .and_then(value_as_i64)
        .unwrap_or(0);

    // Collect list ids referenced by list_id entries so we can resolve names.
    let mut list_ids = BTreeSet::<String>::new();
    for entry in &history {
        if entry.get("field_name").and_then(Value::as_str) != Some("list_id") {
            continue;
        }
        if let Some(id) = list_id_from_history_value(entry.get("old_value").unwrap_or(&Value::Null))
        {
            list_ids.insert(id);
        }
        if let Some(id) = list_id_from_history_value(entry.get("new_value").unwrap_or(&Value::Null))
        {
            list_ids.insert(id);
        }
    }

    let mut list_names_by_id = BTreeMap::<String, String>::new();
    if !list_ids.is_empty() {
        if let Ok(lists) = fetch_task_list_names(
            contact_data,
            outbound,
            &access_token,
            list_ids.iter().cloned().collect::<Vec<_>>(),
        )
        .await
        {
            for (id, name) in lists {
                list_names_by_id.insert(id, name);
            }
        }
        // On failure we fall back to empty names, mirroring the legacy code which
        // ignores `task_lists` query errors.
    }

    let formatted: Vec<Value> = history
        .into_iter()
        .map(|entry| format_history_entry(entry, &list_names_by_id))
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "data": formatted,
            "count": total_count,
            "page": page,
            "pageSize": page_size,
        }),
    ))
}

enum TaskHistoryError {
    AccessDenied,
    Failed,
}

async fn fetch_task_history(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    rpc_params: Value,
) -> Result<Vec<Value>, TaskHistoryError> {
    let rpc_url = contact_data
        .rpc_url(TASK_HISTORY_RPC)
        .ok_or(TaskHistoryError::Failed)?;
    let service_role_key = contact_data
        .service_role_key()
        .ok_or(TaskHistoryError::Failed)?;
    let authorization = format!("Bearer {access_token}");
    let body = serde_json::to_string(&rpc_params).map_err(|_| TaskHistoryError::Failed)?;

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
        .map_err(|_| TaskHistoryError::Failed)?;

    if !(200..300).contains(&response.status) {
        // The RPC raises `Access denied to workspace` which PostgREST surfaces
        // as a JSON error with that message; map it to 403.
        if response_message_matches(&response, ACCESS_DENIED_MESSAGE) {
            return Err(TaskHistoryError::AccessDenied);
        }
        return Err(TaskHistoryError::Failed);
    }

    match response
        .json::<Value>()
        .map_err(|_| TaskHistoryError::Failed)?
    {
        Value::Array(rows) => Ok(rows),
        Value::Null => Ok(Vec::new()),
        _ => Err(TaskHistoryError::Failed),
    }
}

async fn fetch_task_list_names(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    list_ids: Vec<String>,
) -> Result<Vec<(String, String)>, ()> {
    // PostgREST in.(...) list filter: in.("id1","id2").
    let quoted = list_ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    let in_filter = format!("in.({quoted})");

    let Some(url) = contact_data.rest_url(
        "task_lists",
        &[("select", "id,name".to_owned()), ("id", in_filter)],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut result = Vec::new();
    for row in rows {
        let id = row.get("id").and_then(Value::as_str);
        let name = row.get("name").and_then(Value::as_str);
        if let (Some(id), Some(name)) = (id, name) {
            if !name.is_empty() {
                result.push((id.to_owned(), name.to_owned()));
            }
        }
    }
    Ok(result)
}

fn format_history_entry(entry: Value, list_names_by_id: &BTreeMap<String, String>) -> Value {
    let Value::Object(map) = entry else {
        return entry;
    };

    let get = |key: &str| map.get(key).cloned().unwrap_or(Value::Null);
    let is_list_id = map.get("field_name").and_then(Value::as_str) == Some("list_id");

    let metadata = get("metadata");

    let old_value = if is_list_id {
        format_list_history_value(
            list_name_from_metadata(&metadata, "old_list_name"),
            list_names_by_id,
            map.get("old_value").unwrap_or(&Value::Null),
        )
    } else {
        // `entry.old_value ?? undefined` -> omit nulls.
        null_to_undefined(map.get("old_value").cloned())
    };

    let new_value = if is_list_id {
        format_list_history_value(
            list_name_from_metadata(&metadata, "new_list_name"),
            list_names_by_id,
            map.get("new_value").unwrap_or(&Value::Null),
        )
    } else {
        null_to_undefined(map.get("new_value").cloned())
    };

    let user = match map.get("user_id").and_then(Value::as_str) {
        Some(user_id) if !user_id.is_empty() => json!({
            "id": user_id,
            "name": non_empty_str(map.get("user_display_name")).unwrap_or("Unknown"),
            "avatar_url": get("user_avatar_url"),
        }),
        _ => Value::Null,
    };

    let mut out = Map::new();
    out.insert("id".to_owned(), get("id"));
    out.insert("task_id".to_owned(), get("task_id"));
    out.insert(
        "task_name".to_owned(),
        Value::String(
            non_empty_str(map.get("task_name"))
                .unwrap_or("Unknown Task")
                .to_owned(),
        ),
    );
    insert_if_some(
        &mut out,
        "task_deleted_at",
        null_to_undefined(map.get("task_deleted_at").cloned()),
    );
    out.insert(
        "task_permanently_deleted".to_owned(),
        Value::Bool(
            map.get("task_permanently_deleted")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        ),
    );
    insert_if_some(
        &mut out,
        "board_id",
        null_to_undefined(map.get("board_id").cloned()),
    );
    insert_if_some(
        &mut out,
        "board_name",
        null_to_undefined(map.get("board_name").cloned()),
    );
    insert_if_some(
        &mut out,
        "changed_by",
        null_to_undefined(map.get("changed_by").cloned()),
    );
    out.insert("changed_at".to_owned(), get("changed_at"));
    insert_if_some(
        &mut out,
        "change_type",
        null_to_undefined(map.get("change_type").cloned()),
    );
    insert_if_some(
        &mut out,
        "field_name",
        null_to_undefined(map.get("field_name").cloned()),
    );
    insert_if_some(&mut out, "old_value", old_value);
    insert_if_some(&mut out, "new_value", new_value);
    out.insert("metadata".to_owned(), metadata);
    out.insert("user".to_owned(), user);

    Value::Object(out)
}

/// Returns the formatted list value. Mirrors `formatListHistoryValue`:
/// if no id can be extracted, falls back to the metadata name (if any) or the
/// raw value; otherwise returns `{ id, name }`.
fn format_list_history_value(
    fallback_name: Option<String>,
    list_names_by_id: &BTreeMap<String, String>,
    value: &Value,
) -> Option<Value> {
    match list_id_from_history_value(value) {
        None => {
            // fallbackName ?? value
            match fallback_name {
                Some(name) => Some(Value::String(name)),
                None => null_to_undefined(Some(value.clone())),
            }
        }
        Some(id) => {
            let name = fallback_name.or_else(|| list_names_by_id.get(&id).cloned());
            Some(json!({
                "id": id,
                "name": name,
            }))
        }
    }
}

fn list_id_from_history_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        if is_guid(text) {
            return Some(text.to_owned());
        }
        return None;
    }
    if let Value::Object(map) = value {
        if let Some(id) = map.get("id").and_then(Value::as_str) {
            if is_guid(id) {
                return Some(id.to_owned());
            }
        }
    }
    None
}

fn list_name_from_metadata(metadata: &Value, key: &str) -> Option<String> {
    let Value::Object(map) = metadata else {
        return None;
    };
    map.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
}

// --- query parsing helpers -------------------------------------------------

fn optional_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
        .filter(|value| !value.is_empty())
}

fn query_i64(url: Option<&url::Url>, key: &str, default: i64) -> i64 {
    // Legacy: val ? parseInt(val, 10) : default. parseInt is lenient (leading
    // numeric prefix), but for our purposes a strict parse with default fallback
    // is adequate and safe.
    optional_query_value(url, key)
        .and_then(|value| value.trim().parse::<i64>().ok())
        .unwrap_or(default)
}

fn enum_query(url: Option<&url::Url>, key: &str, allowed: &[&str]) -> Result<Option<String>, ()> {
    match optional_query_value(url, key) {
        None => Ok(None),
        Some(value) => {
            if allowed.contains(&value.as_str()) {
                Ok(Some(value))
            } else {
                Err(())
            }
        }
    }
}

fn guid_query(url: Option<&url::Url>, key: &str) -> Result<Option<String>, ()> {
    match optional_query_value(url, key) {
        None => Ok(None),
        Some(value) => {
            if is_guid(&value) {
                Ok(Some(value))
            } else {
                Err(())
            }
        }
    }
}

fn bounded_query(url: Option<&url::Url>, key: &str, max_len: usize) -> Result<Option<String>, ()> {
    match optional_query_value(url, key) {
        None => Ok(None),
        Some(value) => {
            if value.chars().count() > max_len {
                Err(())
            } else {
                Ok(Some(value))
            }
        }
    }
}

fn insert_optional_string(map: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        map.insert(key.to_owned(), Value::String(value));
    }
}

// --- response/value helpers ------------------------------------------------

fn null_to_undefined(value: Option<Value>) -> Option<Value> {
    match value {
        Some(Value::Null) | None => None,
        Some(value) => Some(value),
    }
}

fn insert_if_some(map: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        map.insert(key.to_owned(), value);
    }
}

fn non_empty_str(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
}

fn value_as_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|f| f as i64)),
        Value::String(text) => text.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn response_message_matches(response: &OutboundResponse, expected: &str) -> bool {
    response
        .json::<Value>()
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .as_deref()
        == Some(expected)
}

// --- workspace id resolution ----------------------------------------------

/// Mirrors `resolveWorkspaceId` from `@tuturuuu/utils/constants`: the `internal`
/// slug maps to the root workspace id; everything else passes through verbatim.
/// (`personal` is resolved server-side via the DB in the legacy stack, but
/// `resolveWorkspaceId` itself only special-cases `internal`.)
fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_guid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

// --- path matching ---------------------------------------------------------

fn workspace_tasks_history_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_TASKS_HISTORY_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_TASKS_HISTORY_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// --- error responses -------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn invalid_query_response(field: &str) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "error": INVALID_QUERY_MESSAGE,
            "details": [{ "path": [field] }],
        }),
    ))
}
