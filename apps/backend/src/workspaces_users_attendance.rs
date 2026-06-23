use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

/// Dispatches `/api/v1/workspaces/:wsId/users/:userId/attendance`.
///
/// Returns `None` when the path does not match this route so the caller can
/// continue routing. Otherwise always returns `Some(..)`.
pub(crate) async fn handle_workspaces_users_attendance_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, user_id) = workspaces_users_attendance_ids(request.path)?;

    Some(match request.method {
        "GET" => attendance_response(config, request, ws_id, user_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn attendance_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = attendance_query_from_url(request.url);

    let Some(month) = query.month.as_deref().filter(|month| !month.is_empty()) else {
        return message_response(400, "Month is required");
    };

    // Resolve the calendar month boundaries the same way the legacy route does:
    // start = first instant of the given month, end = start + 1 month.
    let Some((start_date, end_date)) = month_range(month) else {
        return message_response(400, "Month is required");
    };

    // Authentication + permission check (mirrors getPermissions: must be an
    // authenticated member of the resolved workspace, otherwise 404).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return not_found_response();
    };
    let Some(caller_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return not_found_response();
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &caller_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return not_found_response(),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &caller_id).await
    {
        Ok(true) => {}
        Ok(false) | Err(()) => return not_found_response(),
    }

    match fetch_attendance(
        &config.contact_data,
        outbound,
        user_id,
        &start_date,
        &end_date,
        &query.group_ids,
    )
    .await
    {
        Ok(attendance) => {
            no_store_response(json_response(200, json!({ "attendance": attendance })))
        }
        Err(()) => message_response(500, "Error fetching attendance"),
    }
}

async fn fetch_attendance(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    start_date: &str,
    end_date: &str,
    group_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        (
            "select",
            "date,session_id,status,groups:workspace_user_groups(id,name)".to_owned(),
        ),
        ("user_id", format!("eq.{user_id}")),
        ("date", format!("gte.{start_date}")),
        ("date", format!("lt.{end_date}")),
    ];

    if !group_ids.is_empty() {
        params.push(("group_id", format!("in.({})", group_ids.join(","))));
    }

    let Some(url) = contact_data.rest_url("user_group_attendance", &params) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

// --- Workspace resolution + membership (mirrors getPermissions) ---

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
    _access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id,workspace_members!inner(user_id)".to_owned()),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

    // getPermissions uses requiredType ANY: any membership row is sufficient.
    Ok(!response.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
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

// --- Path + query parsing ---

struct AttendanceQuery {
    month: Option<String>,
    group_ids: Vec<String>,
}

fn attendance_query_from_url(request_url: Option<&str>) -> AttendanceQuery {
    let mut query = AttendanceQuery {
        month: None,
        group_ids: Vec::new(),
    };

    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "month" if query.month.is_none() => {
                let value = value.trim();
                if !value.is_empty() {
                    query.month = Some(value.to_owned());
                }
            }
            "groupIds" => {
                let value = value.trim();
                if !value.is_empty() {
                    query.group_ids.push(value.to_owned());
                }
            }
            _ => {}
        }
    }

    query
}

/// Extracts `(wsId, userId)` from
/// `/api/v1/workspaces/:wsId/users/:userId/attendance`.
fn workspaces_users_attendance_ids(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "users"
        && segments[6] == "attendance"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

/// Computes ISO-8601 `[start, end)` boundaries for the calendar month that
/// contains `month`, mirroring `new Date(month)` + `setMonth(+1)` in JS.
fn month_range(month: &str) -> Option<(String, String)> {
    let parsed = parse_date_parts(month)?;
    let (year, month_index) = (parsed.0, parsed.1);

    let start = format!("{year:04}-{:02}-01T00:00:00.000Z", month_index);

    let (end_year, end_month) = if month_index == 12 {
        (year + 1, 1)
    } else {
        (year, month_index + 1)
    };
    let end = format!("{end_year:04}-{:02}-01T00:00:00.000Z", end_month);

    Some((start, end))
}

/// Parses the leading `YYYY-MM` (or `YYYY-MM-DD...`) of a date string into
/// `(year, month_index_1_based)`.
fn parse_date_parts(value: &str) -> Option<(i32, u32)> {
    let trimmed = value.trim();
    let mut parts = trimmed.splitn(3, '-');
    let year: i32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&month) {
        return None;
    }
    Some((year, month))
}

// --- Workspace identifier helpers (mirror the habits reference) ---

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

// --- Response helpers ---

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": "Not found" })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
