use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Path shape: /api/v1/workspaces/{wsId}/api-keys/{keyId}/usage-logs
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/usage-logs";
const API_KEYS_SEGMENT: &str = "/api-keys/";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "You don't have access to this workspace";
const NO_PERMISSION_MESSAGE: &str = "You do not have permission to manage API keys";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const PERMISSION_CHECK_ERROR_MESSAGE: &str = "Error checking permission";
const KEY_NOT_FOUND_MESSAGE: &str = "API key not found";
const FETCH_LOGS_ERROR_MESSAGE: &str = "Error fetching usage logs";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// Mirrors @tuturuuu/utils/constants caps used by the zod schema.
const MAX_COLOR_LENGTH: usize = 50;
const MAX_SHORT_TEXT_LENGTH: usize = 100;
const MAX_LONG_TEXT_LENGTH: usize = 10000;

const MANAGE_API_KEYS_PERMISSION: &str = "manage_api_keys";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";

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
struct ApiKeyRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct StatsRow {
    status_code: Option<i64>,
    response_time_ms: Option<f64>,
}

struct UsageLogsQuery {
    page: String,
    page_size: String,
    from: Option<String>,
    to: Option<String>,
    status: Option<String>,
    endpoint: Option<String>,
}

pub(crate) async fn handle_workspaces_api_keys_keyid_usage_logs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, key_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => usage_logs_response(config, request, raw_ws_id, key_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn usage_logs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    key_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Validate query parameters first (mirrors zod safeParse before auth).
    let query = match parse_query(request.url) {
        Ok(query) => query,
        Err(errors) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE, "errors": errors }),
            ));
        }
    };

    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // assertWorkspaceApiKeysAccess: membership + manage_api_keys permission.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => {
            return no_store_response(json_response(
                500,
                json!({ "error": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
            ));
        }
    }

    match has_manage_api_keys_permission(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_PERMISSION_MESSAGE),
        Err(()) => return message_response(500, PERMISSION_CHECK_ERROR_MESSAGE),
    }

    // Verify the API key belongs to this workspace (service role).
    match api_key_exists(contact_data, outbound, key_id, &resolved_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, KEY_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(404, KEY_NOT_FOUND_MESSAGE),
    }

    // Fetch paginated logs + exact count.
    let (logs, count) =
        match fetch_logs(contact_data, outbound, key_id, &resolved_ws_id, &query).await {
            Ok(result) => result,
            Err(()) => return message_response(500, FETCH_LOGS_ERROR_MESSAGE),
        };

    // Compute stats (best-effort; legacy ignores stats query errors).
    let stats = match fetch_stats(contact_data, outbound, key_id, &resolved_ws_id, &query).await {
        Ok(rows) => compute_stats(count, &rows),
        Err(()) => stats_value(count, 0.0, 0.0),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": logs,
            "count": count,
            "stats": stats,
        }),
    ))
}

fn compute_stats(count: usize, rows: &[StatsRow]) -> Value {
    if rows.is_empty() {
        return stats_value(count, 0.0, 0.0);
    }

    let success_count = rows
        .iter()
        .filter(|row| matches!(row.status_code, Some(code) if (200..300).contains(&code)))
        .count();
    let success_rate = (success_count as f64 / rows.len() as f64) * 100.0;

    let valid_times: Vec<f64> = rows.iter().filter_map(|row| row.response_time_ms).collect();
    let avg_response_time = if valid_times.is_empty() {
        0.0
    } else {
        valid_times.iter().sum::<f64>() / valid_times.len() as f64
    };

    stats_value(count, success_rate, avg_response_time)
}

fn stats_value(total_requests: usize, success_rate: f64, avg_response_time: f64) -> Value {
    json!({
        "totalRequests": total_requests,
        "successRate": success_rate,
        "avgResponseTime": avg_response_time,
    })
}

async fn fetch_logs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    key_id: &str,
    ws_id: &str,
    query: &UsageLogsQuery,
) -> Result<(Vec<Value>, usize), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("api_key_id", format!("eq.{key_id}")),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    append_log_filters(&mut params, query);

    let Some(url) = contact_data.rest_url("workspace_api_key_usage_logs", &params) else {
        return Err(());
    };

    let (start, end) = page_range(query);
    let range = format!("{start}-{end}");

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((rows, count))
}

async fn fetch_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    key_id: &str,
    ws_id: &str,
    query: &UsageLogsQuery,
) -> Result<Vec<StatsRow>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "status_code,response_time_ms".to_owned()),
        ("api_key_id", format!("eq.{key_id}")),
        ("ws_id", format!("eq.{ws_id}")),
    ];
    // Stats query applies only from/to filters (mirrors legacy).
    if let Some(from) = query.from.as_deref().filter(|value| !value.is_empty()) {
        params.push(("created_at", format!("gte.{from}")));
    }
    if let Some(to) = query.to.as_deref().filter(|value| !value.is_empty()) {
        params.push(("created_at", format!("lte.{to}")));
    }

    let Some(url) = contact_data.rest_url("workspace_api_key_usage_logs", &params) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
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

    response.json::<Vec<StatsRow>>().map_err(|_| ())
}

fn append_log_filters(params: &mut Vec<(&'static str, String)>, query: &UsageLogsQuery) {
    if let Some(from) = query.from.as_deref().filter(|value| !value.is_empty()) {
        params.push(("created_at", format!("gte.{from}")));
    }
    if let Some(to) = query.to.as_deref().filter(|value| !value.is_empty()) {
        params.push(("created_at", format!("lte.{to}")));
    }
    if let Some(status) = query.status.as_deref().filter(|value| !value.is_empty()) {
        if let Some(status_code) = parse_int_prefix(status) {
            params.push(("status_code", format!("eq.{status_code}")));
        }
    }
    if let Some(endpoint) = query.endpoint.as_deref().filter(|value| !value.is_empty()) {
        params.push(("endpoint", format!("ilike.*{endpoint}*")));
    }
}

fn page_range(query: &UsageLogsQuery) -> (i64, i64) {
    // Mirrors JS parseInt + (page-1)*size .. page*size-1 arithmetic.
    let page = parse_int_prefix(&query.page).unwrap_or(0);
    let size = parse_int_prefix(&query.page_size).unwrap_or(0);
    let start = (page - 1) * size;
    let end = page * size - 1;
    (start, end)
}

async fn api_key_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    key_id: &str,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_api_keys",
        &[
            ("select", "id,ws_id".to_owned()),
            ("id", format!("eq.{key_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<ApiKeyRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn has_manage_api_keys_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_user_id": user_id,
        "p_ws_id": ws_id,
        "p_permission": MANAGE_API_KEYS_PERMISSION,
    }))
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

    Ok(response.json::<bool>().unwrap_or(false))
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

    // verifyWorkspaceMembershipType defaults to requiredType "MEMBER" and
    // requires an exact match (not OWNER/ADMIN), mirrored here.
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

// --- Workspace id normalization (copied from workspace_habits_access.rs,
// where these helpers are private; self-contained here as required). ---

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

// --- Helpers ---

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<usize>().ok()
}

/// Parses a leading integer (mirrors JS parseInt with base 10 prefix scan).
fn parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

fn parse_query(request_url: Option<&str>) -> Result<UsageLogsQuery, Vec<Value>> {
    let mut page: Option<String> = None;
    let mut page_size: Option<String> = None;
    let mut from: Option<String> = None;
    let mut to: Option<String> = None;
    let mut status: Option<String> = None;
    let mut endpoint: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        // Object.fromEntries keeps the last value for duplicate keys.
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" => page = Some(value.into_owned()),
                "pageSize" => page_size = Some(value.into_owned()),
                "from" => from = Some(value.into_owned()),
                "to" => to = Some(value.into_owned()),
                "status" => status = Some(value.into_owned()),
                "endpoint" => endpoint = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let mut errors: Vec<Value> = Vec::new();

    // Length caps mirror the zod schema; only present strings are validated.
    if let Some(value) = page.as_deref() {
        validate_max(value, MAX_LONG_TEXT_LENGTH, "page", &mut errors);
    }
    if let Some(value) = page_size.as_deref() {
        validate_max(value, MAX_LONG_TEXT_LENGTH, "pageSize", &mut errors);
    }
    if let Some(value) = from.as_deref() {
        validate_max(value, MAX_COLOR_LENGTH, "from", &mut errors);
    }
    if let Some(value) = to.as_deref() {
        validate_max(value, MAX_COLOR_LENGTH, "to", &mut errors);
    }
    if let Some(value) = status.as_deref() {
        validate_max(value, MAX_SHORT_TEXT_LENGTH, "status", &mut errors);
    }
    if let Some(value) = endpoint.as_deref() {
        validate_max(value, MAX_LONG_TEXT_LENGTH, "endpoint", &mut errors);
    }

    if !errors.is_empty() {
        return Err(errors);
    }

    Ok(UsageLogsQuery {
        page: page.unwrap_or_else(|| "1".to_owned()),
        page_size: page_size.unwrap_or_else(|| "10".to_owned()),
        from,
        to,
        status,
        endpoint,
    })
}

fn validate_max(value: &str, max: usize, field: &str, errors: &mut Vec<Value>) {
    // zod string length counts UTF-16 code units; chars() is a close enough
    // approximation for the ASCII query values these fields carry.
    let length = value.chars().count();
    if length > max {
        errors.push(json!({
            "code": "too_big",
            "maximum": max,
            "type": "string",
            "inclusive": true,
            "path": [field],
            "message": format!("String must contain at most {max} character(s)"),
        }));
    }
}

fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let rest = rest.strip_suffix(PATH_SUFFIX)?;
    // rest == "{wsId}/api-keys/{keyId}"
    let (ws_id, key_id) = rest.split_once(API_KEYS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if key_id.is_empty() || key_id.contains('/') {
        return None;
    }

    Some((ws_id, key_id))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
