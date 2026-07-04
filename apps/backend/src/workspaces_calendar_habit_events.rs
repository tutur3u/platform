use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const HABIT_EVENTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const HABIT_EVENTS_PATH_SUFFIX: &str = "/calendar/habit-events";

// Legacy response messages (mirrors apps/web .../calendar/habit-events/route.ts).
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_FOUND_MESSAGE: &str = "Not found";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch habit calendar events";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

const HABIT_EVENTS_SELECT: &str = "event_id,completed,workspace_habits!inner(ws_id),workspace_calendar_events!inner(start_at,end_at)";

#[derive(Serialize)]
struct HabitEventsResponse {
    #[serde(rename = "habitEventIds")]
    habit_event_ids: Vec<String>,
    #[serde(rename = "completedHabitEventIds")]
    completed_habit_event_ids: Vec<String>,
}

#[derive(Deserialize)]
struct HabitEventRow {
    event_id: Option<String>,
    #[serde(default)]
    completed: Option<bool>,
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
struct WorkspaceSecretRow {
    value: Option<String>,
}

pub(crate) async fn handle_workspaces_calendar_habit_events_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = habit_events_ws_id(request.path)?;

    Some(match request.method {
        "GET" => habit_events_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn habit_events_response(
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

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // Legacy: normalizeWorkspaceId failures bubble to the catch-all 500.
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // isHabitsEnabled(wsId) -> habitsNotFoundResponse() (404) when disabled.
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return error_response(404, NOT_FOUND_MESSAGE);
    }

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let (start_at, end_at) = match parse_query(request.url) {
        Ok(parsed) => parsed,
        Err(details) => return invalid_query_response(details),
    };

    match fetch_habit_events(contact_data, outbound, &resolved_ws_id, &start_at, &end_at).await {
        Ok(rows) => {
            let habit_event_ids: Vec<String> = rows
                .iter()
                .filter_map(|row| row.event_id.clone())
                .filter(|event_id| !event_id.is_empty())
                .collect();
            let completed_habit_event_ids: Vec<String> = rows
                .iter()
                .filter(|row| row.completed.unwrap_or(false))
                .filter_map(|row| row.event_id.clone())
                .filter(|event_id| !event_id.is_empty())
                .collect();

            no_store_response(json_response(
                200,
                HabitEventsResponse {
                    habit_event_ids,
                    completed_habit_event_ids,
                },
            ))
        }
        Err(()) => error_response(500, FETCH_FAILED_MESSAGE),
    }
}

async fn fetch_habit_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    start_at: &str,
    end_at: &str,
) -> Result<Vec<HabitEventRow>, ()> {
    // Mirrors the legacy PostgREST query:
    //   .select(event_id, completed, workspace_habits!inner(ws_id),
    //           workspace_calendar_events!inner(start_at, end_at))
    //   .eq('workspace_habits.ws_id', wsId)
    //   .lt('workspace_calendar_events.start_at', end_at)
    //   .gt('workspace_calendar_events.end_at', start_at)
    let Some(url) = contact_data.rest_url(
        "habit_calendar_events",
        &[
            ("select", HABIT_EVENTS_SELECT.to_owned()),
            ("workspace_habits.ws_id", format!("eq.{ws_id}")),
            ("workspace_calendar_events.start_at", format!("lt.{end_at}")),
            ("workspace_calendar_events.end_at", format!("gt.{start_at}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<HabitEventRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Workspace resolution / access (mirrors workspace_habits_access.rs helpers).
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

async fn habits_workspace_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{ENABLE_HABITS_SECRET}")),
            ("order", "created_at.desc".to_owned()),
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
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
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

// ---------------------------------------------------------------------------
// Query parsing (mirrors the zod querySchema: start_at/end_at datetime).
// ---------------------------------------------------------------------------

fn parse_query(request_url: Option<&str>) -> Result<(String, String), Vec<serde_json::Value>> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok());

    let start_at = query_value(url.as_ref(), "start_at");
    let end_at = query_value(url.as_ref(), "end_at");

    let mut issues = Vec::new();
    let start_at = validate_datetime("start_at", start_at, &mut issues);
    let end_at = validate_datetime("end_at", end_at, &mut issues);

    if let (Some(start_at), Some(end_at)) = (start_at, end_at) {
        Ok((start_at, end_at))
    } else {
        Err(issues)
    }
}

fn validate_datetime(
    field: &str,
    value: Option<String>,
    issues: &mut Vec<serde_json::Value>,
) -> Option<String> {
    match value {
        None => {
            issues.push(json!({
                "code": "invalid_type",
                "expected": "string",
                "received": "null",
                "path": [field],
                "message": "Required",
            }));
            None
        }
        Some(value) if is_iso_datetime(&value) => Some(value),
        Some(_) => {
            issues.push(json!({
                "code": "invalid_string",
                "validation": "datetime",
                "path": [field],
                "message": "Invalid datetime",
            }));
            None
        }
    }
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find(|(pair_key, _)| pair_key == key)
        .map(|(_, value)| value.into_owned())
}

/// Loose RFC 3339 / ISO-8601 datetime acceptance approximating zod's
/// `.datetime()`. Requires at least `YYYY-MM-DDTHH:MM:SS` and treats a
/// trailing `Z` or numeric offset / fractional seconds as valid.
fn is_iso_datetime(value: &str) -> bool {
    let value = value.trim();
    let bytes = value.as_bytes();
    // Minimum length: 2024-01-01T00:00:00 (19 chars).
    if bytes.len() < 19 {
        return false;
    }

    let is_digit = |index: usize| bytes.get(index).is_some_and(u8::is_ascii_digit);
    let is_char = |index: usize, character: u8| bytes.get(index) == Some(&character);

    is_digit(0)
        && is_digit(1)
        && is_digit(2)
        && is_digit(3)
        && is_char(4, b'-')
        && is_digit(5)
        && is_digit(6)
        && is_char(7, b'-')
        && is_digit(8)
        && is_digit(9)
        && (is_char(10, b'T') || is_char(10, b't'))
        && is_digit(11)
        && is_digit(12)
        && is_char(13, b':')
        && is_digit(14)
        && is_digit(15)
        && is_char(16, b':')
        && is_digit(17)
        && is_digit(18)
        && value[19..]
            .chars()
            .all(|character| matches!(character, '0'..='9' | '.' | '+' | '-' | ':' | 'Z' | 'z'))
}

// ---------------------------------------------------------------------------
// Path matching / helpers.
// ---------------------------------------------------------------------------

fn habit_events_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(HABIT_EVENTS_PATH_PREFIX)?
        .strip_suffix(HABIT_EVENTS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn invalid_query_response(details: Vec<serde_json::Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "error": INVALID_QUERY_MESSAGE, "details": details }),
    ))
}
