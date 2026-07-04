use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_SESSION_ID_MESSAGE: &str = "Invalid session ID format";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const SESSION_NOT_FOUND_MESSAGE: &str = "Session not found";
const FETCH_ACTIVE_BREAK_FAILED_MESSAGE: &str = "Failed to fetch active break";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

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
struct SessionRow {
    #[allow(dead_code)]
    id: Option<String>,
}

/// Active break row mirroring the legacy select. The embedded
/// `workspace_break_types` relation is kept as opaque JSON and then flattened
/// into a single `break_type` object (or null) to match the legacy transform.
#[derive(Deserialize)]
struct ActiveBreakRow {
    id: Option<String>,
    session_id: Option<String>,
    break_type_id: Option<String>,
    break_type_name: Option<String>,
    break_start: Option<String>,
    break_end: Option<String>,
    break_duration_seconds: Option<i64>,
    #[serde(default)]
    workspace_break_types: Value,
}

#[derive(Serialize)]
struct ActiveBreakOut {
    id: Option<String>,
    session_id: Option<String>,
    break_type_id: Option<String>,
    break_type_name: Option<String>,
    break_start: Option<String>,
    break_end: Option<String>,
    break_duration_seconds: Option<i64>,
    break_type: Value,
}

pub(crate) async fn handle_workspaces_time_tracking_sessions_breaks_active_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, session_id) = breaks_active_path_params(request.path)?;

    Some(match request.method {
        "GET" => breaks_active_response(config, request, raw_ws_id, session_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn breaks_active_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    session_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Validate session id as a GUID first, mirroring the legacy z.guid() check
    // which runs before auth.
    if !is_guid(session_id) {
        return error_response(400, INVALID_SESSION_ID_MESSAGE);
    }

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
            Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    // Verify workspace membership. Lookup failure -> 500, non-member -> 403,
    // matching the legacy `membership_lookup_failed` / `!ok` branches.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Verify the session belongs to this workspace and user. The legacy route
    // reads this through the admin (service-role) client and returns 404 on any
    // error or missing row.
    match session_belongs_to_user(
        contact_data,
        outbound,
        session_id,
        &resolved_ws_id,
        &user_id,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return error_response(404, SESSION_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(404, SESSION_NOT_FOUND_MESSAGE),
    }

    // Fetch the active break (break_end is null) via the admin client.
    let active_break = match active_break(contact_data, outbound, session_id).await {
        Ok(active_break) => active_break,
        Err(()) => return error_response(500, FETCH_ACTIVE_BREAK_FAILED_MESSAGE),
    };

    let transformed = active_break.map(transform_break);

    match transformed {
        Some(value) => {
            // Serialize explicitly so a serialization failure maps to the legacy
            // catch-all 500 instead of panicking.
            match serde_json::to_value(value) {
                Ok(break_value) => {
                    no_store_response(json_response(200, json!({ "break": break_value })))
                }
                Err(_) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
            }
        }
        None => no_store_response(json_response(200, json!({ "break": Value::Null }))),
    }
}

/// Flatten the embedded `workspace_break_types` relation into a single
/// `break_type` value. PostgREST returns an array for the embed; the legacy
/// transform takes the first element when it is an array, otherwise the value
/// itself, and null when absent.
fn transform_break(row: ActiveBreakRow) -> ActiveBreakOut {
    let break_type = match row.workspace_break_types {
        Value::Array(mut items) => {
            if items.is_empty() {
                Value::Null
            } else {
                items.swap_remove(0)
            }
        }
        Value::Null => Value::Null,
        other => other,
    };

    ActiveBreakOut {
        id: row.id,
        session_id: row.session_id,
        break_type_id: row.break_type_id,
        break_type_name: row.break_type_name,
        break_start: row.break_start,
        break_end: row.break_end,
        break_duration_seconds: row.break_duration_seconds,
        break_type,
    }
}

/// Confirm the session exists and belongs to the given workspace and user.
/// Read via service role (the legacy route uses the admin client here).
async fn session_belongs_to_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_id: &str,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "time_tracking_sessions",
        &[
            ("select", "id,ws_id,user_id".to_owned()),
            ("id", format!("eq.{session_id}")),
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
        .json::<Vec<SessionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .is_some())
}

/// Fetch the most recent active break for the session (break_end is null).
/// Read via service role to mirror the legacy admin client. Returns Ok(None)
/// when there is no active break.
async fn active_break(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_id: &str,
) -> Result<Option<ActiveBreakRow>, ()> {
    let select = "id,session_id,break_type_id,break_type_name,break_start,break_end,\
break_duration_seconds,workspace_break_types:break_type_id(id,name,icon,color)";

    let Some(url) = contact_data.rest_url(
        "time_tracking_breaks",
        &[
            ("select", select.to_owned()),
            ("session_id", format!("eq.{session_id}")),
            ("break_end", "is.null".to_owned()),
            ("order", "break_start.desc".to_owned()),
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
        .json::<Vec<ActiveBreakRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
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

/// Match `/api/v1/workspaces/{wsId}/time-tracking/sessions/{sessionId}/breaks/active`
/// and return `(wsId, sessionId)` raw segments. Returns None when the path does
/// not match this exact shape.
fn breaks_active_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "time-tracking"
        && segments[5] == "sessions"
        && !segments[6].is_empty()
        && segments[7] == "breaks"
        && segments[8] == "active"
    {
        Some((segments[3], segments[6]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
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

/// Validate a v-style UUID/GUID literal, mirroring the legacy `z.guid()` check
/// (canonical 36-char hyphenated hex form).
fn is_guid(value: &str) -> bool {
    is_workspace_uuid_literal(value)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
