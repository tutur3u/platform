//! Handler for `GET /api/v1/workspaces/:wsId/users/:userId/user-groups`.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/users/[userId]/user-groups/route.ts`.
//!
//! The legacy route supports two authentication modes:
//!   1. An `API_KEY` request header validated against `workspace_api_keys`
//!      (scrypt-hashed comparison) — the service-role path.
//!   2. A Supabase session (cookie / bearer) resolved through the finance route
//!      context, which authenticates the user and confirms workspace membership.
//!
//! `BackendRequest` does NOT currently expose the raw `API_KEY` header (it only
//! surfaces `authorization`, `cookie`, etc.), and reproducing the scrypt-based
//! API-key validation would require new shared helpers + header plumbing in
//! `lib.rs`. Per the task constraints this module touches no other file, so we
//! implement the Supabase-session path only. Requests carrying `API_KEY` but no
//! session bearer/cookie will fall through to the `Unauthorized` branch here.
//! See notes — the integrator must verify whether the SDK/API-key callers of
//! this endpoint need to be preserved before this route is wired up.
//!
//! In both legacy modes the response body and supabase query are identical: a
//! JSON array of `workspace_user_groups_users` rows, each embedding the joined
//! `workspace_user_groups` record with an added `sessions` array of scheduled
//! session dates (`YYYY-MM-DD`, `Asia/Ho_Chi_Minh` timezone).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_INFIX: &str = "/users/";
const PATH_SUFFIX: &str = "/user-groups";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const FETCH_USERS_FAILED_MESSAGE: &str = "Error fetching workspace users";
const INVALID_USER_ID_MESSAGE: &str = "Invalid user ID";
const INVALID_WORKSPACE_ID_MESSAGE: &str = "Invalid workspace ID";

// Matches the legacy `DEFAULT_TIMEZONE` (Asia/Ho_Chi_Minh, a fixed UTC+7 zone
// with no DST), used by `listUserGroupSessionDatesByGroupIds` to bucket session
// `starts_at` timestamps into local calendar dates.
const SESSION_TZ_OFFSET_MINUTES: i64 = 7 * 60;

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
    group_id: Option<String>,
    starts_at: Option<String>,
}

pub(crate) async fn handle_workspaces_users_userid_user_groups_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, user_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => user_groups_response(config, request, raw_ws_id, user_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn user_groups_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy parameter validation (400s) runs before auth.
    if user_id.trim().is_empty() {
        return message_response(400, INVALID_USER_ID_MESSAGE);
    }
    if raw_ws_id.trim().is_empty() {
        return message_response(400, INVALID_WORKSPACE_ID_MESSAGE);
    }

    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(caller_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &caller_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    // Mirror the finance-route-context access check: the caller must be a member
    // of the workspace they are reading user groups from.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &caller_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let mut rows = match fetch_user_group_memberships(
        contact_data,
        outbound,
        &resolved_ws_id,
        user_id,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_USERS_FAILED_MESSAGE),
    };

    // Best-effort session-date enrichment. If the sessions subsystem is
    // unavailable, fall back to empty schedules instead of failing the request
    // (matching the legacy try/catch behavior).
    let group_ids = collect_group_ids(&rows);
    let sessions_by_group =
        fetch_session_dates(contact_data, outbound, &resolved_ws_id, &group_ids)
            .await
            .unwrap_or_default();
    attach_session_dates(&mut rows, &sessions_by_group);

    no_store_response(json_response(200, Value::Array(rows)))
}

/// Reproduces the legacy supabase query:
/// `from('workspace_user_groups_users')
///   .select('*, workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(*)')
///   .eq('workspace_user_groups.ws_id', wsId)
///   .eq('user_id', userId)`.
async fn fetch_user_group_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            (
                "select",
                "*,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(*)"
                    .to_owned(),
            ),
            ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    match response.json::<Vec<Value>>() {
        Ok(rows) => Ok(rows),
        Err(_) => Err(()),
    }
}

/// Reproduces `listUserGroupSessionDatesByGroupIds`:
/// `from('workspace_user_group_sessions')
///   .select('group_id, starts_at')
///   .eq('ws_id', wsId)
///   .in('group_id', groupIds)
///   .eq('status', 'scheduled')
///   .order('starts_at')`,
/// then buckets `starts_at` into unique `YYYY-MM-DD` dates (Asia/Ho_Chi_Minh).
async fn fetch_session_dates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_ids: &[String],
) -> Result<Vec<(String, Vec<String>)>, ()> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_filter = format!(
        "in.({})",
        group_ids
            .iter()
            .map(|id| postgrest_in_value(id))
            .collect::<Vec<_>>()
            .join(",")
    );

    let Some(url) = contact_data.rest_url(
        "workspace_user_group_sessions",
        &[
            ("select", "group_id,starts_at".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("group_id", in_filter),
            ("status", "eq.scheduled".to_owned()),
            ("order", "starts_at".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let sessions = response.json::<Vec<SessionRow>>().map_err(|_| ())?;

    // Preserve insertion order (already ordered by starts_at) while keeping a
    // unique, ordered date list per group.
    let mut result: Vec<(String, Vec<String>)> = Vec::new();
    for session in sessions {
        let (Some(group_id), Some(starts_at)) = (session.group_id, session.starts_at) else {
            continue;
        };
        let Some(date) = local_date_in_session_tz(&starts_at) else {
            continue;
        };

        match result.iter_mut().find(|(gid, _)| *gid == group_id) {
            Some((_, dates)) => {
                if !dates.contains(&date) {
                    dates.push(date);
                }
            }
            None => result.push((group_id, vec![date])),
        }
    }

    Ok(result)
}

fn collect_group_ids(rows: &[Value]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for row in rows {
        if let Some(id) = embedded_group_id(row) {
            if !ids.iter().any(|existing| existing == &id) {
                ids.push(id);
            }
        }
    }
    ids
}

fn embedded_group_id(row: &Value) -> Option<String> {
    row.get("workspace_user_groups")?
        .get("id")?
        .as_str()
        .map(|id| id.to_owned())
}

fn attach_session_dates(rows: &mut [Value], sessions_by_group: &[(String, Vec<String>)]) {
    for row in rows.iter_mut() {
        let Some(obj) = row.as_object_mut() else {
            continue;
        };
        let Some(group) = obj.get_mut("workspace_user_groups") else {
            continue;
        };
        let Some(group_obj) = group.as_object_mut() else {
            continue;
        };
        let Some(group_id) = group_obj
            .get("id")
            .and_then(Value::as_str)
            .map(|id| id.to_owned())
        else {
            continue;
        };

        let dates = sessions_by_group
            .iter()
            .find(|(gid, _)| *gid == group_id)
            .map(|(_, dates)| dates.clone())
            .unwrap_or_default();

        group_obj.insert(
            "sessions".to_owned(),
            Value::Array(dates.into_iter().map(Value::String).collect()),
        );
    }
}

// ---------------------------------------------------------------------------
// Workspace resolution + membership (mirrors workspace_habits_access.rs).
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
// Path + identifier helpers (copied file-local from workspace_habits_access.rs;
// those are private to that module, so they are duplicated here per the
// single-file constraint).
// ---------------------------------------------------------------------------

fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let rest = rest.strip_suffix(PATH_SUFFIX)?;

    // `rest` is now `<wsId>/users/<userId>`.
    let (ws_id, after) = rest.split_once(PATH_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if after.is_empty() || after.contains('/') {
        return None;
    }

    Some((ws_id, after))
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

/// Escapes a value for use inside a PostgREST `in.(...)` list. Values containing
/// reserved characters must be double-quoted; embedded quotes are escaped by
/// doubling. The group ids here are UUIDs in practice, but we quote defensively.
fn postgrest_in_value(value: &str) -> String {
    if value
        .chars()
        .any(|c| c == ',' || c == '"' || c == '(' || c == ')' || c.is_whitespace())
    {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}

/// Converts a supabase `timestamptz` string into its `YYYY-MM-DD` calendar date
/// in the Asia/Ho_Chi_Minh (UTC+7, no DST) timezone.
///
/// Handles ISO-8601 forms such as `2024-01-15T10:30:00+00:00`,
/// `2024-01-15T10:30:00.123456Z`, and space-separated variants. Returns `None`
/// if the timestamp cannot be parsed (the caller skips that session).
fn local_date_in_session_tz(timestamp: &str) -> Option<String> {
    let (mut year, mut month, mut day, hour, minute, offset_minutes) = parse_timestamp(timestamp)?;

    // Convert the wall-clock minutes-of-day to UTC, then to the target tz.
    let total_minutes = (hour as i64) * 60 + (minute as i64);
    // local_minutes_utc = wall_clock - source_offset
    let utc_minutes = total_minutes - offset_minutes;
    // target wall clock = utc + target_offset
    let mut target_minutes = utc_minutes + SESSION_TZ_OFFSET_MINUTES;

    // Roll days as needed.
    while target_minutes < 0 {
        target_minutes += 24 * 60;
        let (py, pm, pd) = previous_day(year, month, day);
        year = py;
        month = pm;
        day = pd;
    }
    while target_minutes >= 24 * 60 {
        target_minutes -= 24 * 60;
        let (ny, nm, nd) = next_day(year, month, day);
        year = ny;
        month = nm;
        day = nd;
    }

    Some(format!("{year:04}-{month:02}-{day:02}"))
}

/// Parses an ISO-8601 timestamp into
/// `(year, month, day, hour, minute, offset_minutes)`.
fn parse_timestamp(value: &str) -> Option<(i64, u32, u32, u32, u32, i64)> {
    let value = value.trim();

    // Split date and time on 'T' or a space.
    let sep_idx = value.find(|c| c == 'T' || c == 't' || c == ' ')?;
    let date_part = &value[..sep_idx];
    let time_and_offset = &value[sep_idx + 1..];

    let mut date_iter = date_part.split('-');
    let year: i64 = date_iter.next()?.parse().ok()?;
    let month: u32 = date_iter.next()?.parse().ok()?;
    let day: u32 = date_iter.next()?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    // Separate the offset from the time portion.
    let (time_part, offset_minutes) = split_offset(time_and_offset)?;

    let mut time_iter = time_part.split(':');
    let hour: u32 = time_iter.next()?.parse().ok()?;
    let minute: u32 = time_iter.next().unwrap_or("0").parse().ok()?;
    if hour >= 24 || minute >= 60 {
        return None;
    }

    Some((year, month, day, hour, minute, offset_minutes))
}

/// Splits the trailing timezone offset from a time string, returning the
/// time-only slice and the offset in minutes (0 when absent / `Z`).
fn split_offset(time: &str) -> Option<(&str, i64)> {
    if let Some(stripped) = time.strip_suffix('Z').or_else(|| time.strip_suffix('z')) {
        return Some((stripped, 0));
    }

    // Look for a '+' or a '-' that introduces the offset. The '-' must appear
    // in the offset region (after the seconds), so search from a position past
    // the hour/minute fields. We scan from the end for the last '+' or '-'.
    let bytes = time.as_bytes();
    for idx in (0..bytes.len()).rev() {
        let c = bytes[idx] as char;
        if c == '+' || c == '-' {
            // Ensure this is plausibly an offset (HH or HH:MM follows).
            let offset_str = &time[idx + 1..];
            let sign = if c == '-' { -1 } else { 1 };
            let offset_minutes = parse_offset_minutes(offset_str)? * sign;
            return Some((&time[..idx], offset_minutes));
        }
    }

    // No offset present; treat as UTC (the supabase default serialization).
    Some((time, 0))
}

fn parse_offset_minutes(offset: &str) -> Option<i64> {
    // Accept "HH", "HHMM", or "HH:MM".
    let cleaned = offset.replace(':', "");
    if cleaned.len() == 2 {
        let hours: i64 = cleaned.parse().ok()?;
        return Some(hours * 60);
    }
    if cleaned.len() == 4 {
        let hours: i64 = cleaned[..2].parse().ok()?;
        let minutes: i64 = cleaned[2..].parse().ok()?;
        return Some(hours * 60 + minutes);
    }
    None
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

fn next_day(year: i64, month: u32, day: u32) -> (i64, u32, u32) {
    if day < days_in_month(year, month) {
        (year, month, day + 1)
    } else if month < 12 {
        (year, month + 1, 1)
    } else {
        (year + 1, 1, 1)
    }
}

fn previous_day(year: i64, month: u32, day: u32) -> (i64, u32, u32) {
    if day > 1 {
        (year, month, day - 1)
    } else if month > 1 {
        let prev_month = month - 1;
        (year, prev_month, days_in_month(year, prev_month))
    } else {
        (year - 1, 12, days_in_month(year - 1, 12))
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
