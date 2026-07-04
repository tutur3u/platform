use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INVALID_IDS_MESSAGE: &str = "Invalid workspace or task ID";
const INVALID_QUERY_MESSAGE: &str = "Invalid query";
const TASK_NOT_FOUND_MESSAGE: &str = "Task not found";
const TASK_WORKSPACE_NOT_FOUND_MESSAGE: &str = "Task workspace not found";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

const DAY_MILLIS: i128 = 24 * 60 * 60 * 1_000;

pub(crate) async fn handle_workspaces_tasks_taskid_schedule_history_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, task_id) = parse_schedule_history_path(request.path)?;

    Some(match request.method {
        "GET" => schedule_history_response(config, request, ws_id, task_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn schedule_history_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy: `!validate(wsId) || !validate(taskId)` -> 400.
    if !is_uuid_literal(ws_id) || !is_uuid_literal(task_id) {
        return error_response(400, INVALID_IDS_MESSAGE);
    }

    // Authenticate the caller.
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

    // Verify membership for the requested workspace. A lookup failure mirrors the
    // legacy thrown error, which is caught and returned as 500 Internal server error.
    match has_workspace_access(&config.contact_data, outbound, ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    }

    // Fetch task -> embedded workspace ws_id (service role / admin client).
    let task_ws_id = match fetch_task_workspace_id(&config.contact_data, outbound, task_id).await {
        Ok(TaskWorkspace::Missing) => return error_response(404, TASK_NOT_FOUND_MESSAGE),
        Ok(TaskWorkspace::WorkspaceMissing) => {
            return error_response(404, TASK_WORKSPACE_NOT_FOUND_MESSAGE);
        }
        Ok(TaskWorkspace::Found(workspace_id)) => workspace_id,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    // If the task lives in a different workspace, require access to it too.
    if task_ws_id != ws_id {
        match has_workspace_access(&config.contact_data, outbound, &task_ws_id, &user_id).await {
            Ok(true) => {}
            Ok(false) => return error_response(404, TASK_NOT_FOUND_MESSAGE),
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        }
    }

    // Parse + validate the date query (mirrors the legacy zod `.date()` schema).
    let query = match parse_query(request.url) {
        Ok(query) => query,
        Err(issues) => return invalid_query_response(issues),
    };

    let now_millis = now_millis();
    let range_start_millis = match query.start.as_deref() {
        Some(date) => date_to_millis(date, "00:00:00.000"),
        None => Some(now_millis - 30 * DAY_MILLIS),
    };
    let range_end_millis = match query.end.as_deref() {
        Some(date) => date_to_millis(date, "23:59:59.999"),
        None => Some(now_millis + 30 * DAY_MILLIS),
    };
    let (Some(range_start_millis), Some(range_end_millis)) = (range_start_millis, range_end_millis)
    else {
        // Defensive: validated dates above already guaranteed parseability, but
        // bail to the catch-all 500 if construction unexpectedly fails.
        return error_response(500, INTERNAL_ERROR_MESSAGE);
    };
    let range_start_iso = iso8601_from_millis(range_start_millis);
    let range_end_iso = iso8601_from_millis(range_end_millis);

    // Three reads. Settings uses the caller token (RLS, user-scoped); the two
    // event reads use the service role / admin client, matching the legacy code.
    let total_duration = match fetch_total_duration(
        &config.contact_data,
        outbound,
        task_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let junction_rows = match fetch_junction_events(
        &config.contact_data,
        outbound,
        task_id,
        ws_id,
        &range_start_iso,
        &range_end_iso,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let direct_rows = match fetch_direct_events(
        &config.contact_data,
        outbound,
        task_id,
        ws_id,
        &range_start_iso,
        &range_end_iso,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    // Build the de-duplicated entry map keyed by calendar event id, preserving
    // legacy insertion order (junction first, then direct), then sort by start_at.
    let mut entries: Vec<ScheduleEntry> = Vec::new();
    let mut seen_event_ids: Vec<String> = Vec::new();

    for row in &junction_rows {
        let Some(event) = row.workspace_calendar_events.as_ref() else {
            continue;
        };
        let Some(event_id) = event.id.as_deref().filter(|id| !id.is_empty()) else {
            continue;
        };
        let (Some(start_at), Some(end_at)) = (event.start_at.as_deref(), event.end_at.as_deref())
        else {
            continue;
        };
        let actual_minutes = minutes_between(start_at, end_at);
        let scheduled_minutes = row.scheduled_minutes.unwrap_or(actual_minutes);
        let has_ended = parse_iso8601_millis(end_at).map(|ms| ms <= now_millis) == Some(true);
        let status = if has_ended && scheduled_minutes != actual_minutes {
            "trimmed"
        } else if has_ended {
            "completed"
        } else {
            "scheduled"
        };
        seen_event_ids.push(event_id.to_owned());
        entries.push(ScheduleEntry {
            event_id: event_id.to_owned(),
            date: start_at.split('T').next().unwrap_or("").to_owned(),
            start_at: start_at.to_owned(),
            end_at: end_at.to_owned(),
            scheduled_minutes: actual_minutes,
            status,
        });
    }

    for row in &direct_rows {
        let Some(event_id) = row.id.as_deref().filter(|id| !id.is_empty()) else {
            continue;
        };
        if seen_event_ids.iter().any(|seen| seen == event_id) {
            continue;
        }
        let (Some(start_at), Some(end_at)) = (row.start_at.as_deref(), row.end_at.as_deref())
        else {
            continue;
        };
        let actual_minutes = minutes_between(start_at, end_at);
        let has_ended = parse_iso8601_millis(end_at).map(|ms| ms <= now_millis) == Some(true);
        let status = if has_ended { "completed" } else { "scheduled" };
        seen_event_ids.push(event_id.to_owned());
        entries.push(ScheduleEntry {
            event_id: event_id.to_owned(),
            date: start_at.split('T').next().unwrap_or("").to_owned(),
            start_at: start_at.to_owned(),
            end_at: end_at.to_owned(),
            scheduled_minutes: actual_minutes,
            status,
        });
    }

    entries.sort_by(|left, right| left.start_at.cmp(&right.start_at));

    let scheduled_minutes: i64 = entries.iter().map(|entry| entry.scheduled_minutes).sum();
    let total_minutes = ((total_duration * 60.0).round() as i64).max(0);

    let entries_json: Vec<Value> = entries
        .iter()
        .map(|entry| {
            json!({
                "event_id": entry.event_id,
                "date": entry.date,
                "start_at": entry.start_at,
                "end_at": entry.end_at,
                "scheduled_minutes": entry.scheduled_minutes,
                "status": entry.status,
            })
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "entries": entries_json,
            "summary": {
                "totalMinutes": total_minutes,
                "scheduledMinutes": scheduled_minutes,
                "remainingMinutes": (total_minutes - scheduled_minutes).max(0),
            },
        }),
    ))
}

struct ScheduleEntry {
    event_id: String,
    date: String,
    start_at: String,
    end_at: String,
    scheduled_minutes: i64,
    status: &'static str,
}

struct ScheduleQuery {
    start: Option<String>,
    end: Option<String>,
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

/// Verifies the caller is a `MEMBER` of `ws_id`. Uses the service role to read
/// the membership row filtered by user, equivalent to the RLS-scoped lookup in
/// the legacy route. Returns `Err(())` on transport/parse failure so the caller
/// can map it to the legacy 500 (the legacy helper throws on lookup failure).
async fn has_workspace_access(
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

enum TaskWorkspace {
    Found(String),
    /// Task row not found.
    Missing,
    /// Task found but the embedded workspace ws_id is absent.
    WorkspaceMissing,
}

/// Mirrors `fetchTaskWithWorkspace`: tasks -> task_lists!inner ->
/// workspace_boards!inner(ws_id), via service role / admin client.
async fn fetch_task_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<TaskWorkspace, ()> {
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            (
                "select",
                "id,name,task_lists!inner(workspace_boards!inner(ws_id))".to_owned(),
            ),
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

    let rows = response.json::<Vec<TaskRow>>().map_err(|_| ())?;
    let Some(row) = rows.into_iter().next() else {
        return Ok(TaskWorkspace::Missing);
    };

    let ws_id = row
        .task_lists
        .and_then(|lists| lists.workspace_boards)
        .and_then(|board| board.ws_id)
        .filter(|ws_id| !ws_id.is_empty());

    match ws_id {
        Some(ws_id) => Ok(TaskWorkspace::Found(ws_id)),
        None => Ok(TaskWorkspace::WorkspaceMissing),
    }
}

/// `task_user_scheduling_settings.total_duration` for (task, user). Read with the
/// caller's token (RLS, user-scoped) like the legacy `supabase` client. Returns
/// `0.0` when absent.
async fn fetch_total_duration(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<f64, ()> {
    let Some(url) = contact_data.rest_url(
        "task_user_scheduling_settings",
        &[
            ("select", "total_duration".to_owned()),
            ("task_id", format!("eq.{task_id}")),
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
        .json::<Vec<SchedulingSettingsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.total_duration)
        .unwrap_or(0.0))
}

/// `task_calendar_events` joined to `workspace_calendar_events!inner`, filtered
/// by task, ws_id and the start_at range. Service role / admin client.
async fn fetch_junction_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
    ws_id: &str,
    range_start_iso: &str,
    range_end_iso: &str,
) -> Result<Vec<JunctionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_calendar_events",
        &[
            (
                "select",
                "scheduled_minutes,workspace_calendar_events!inner(id,start_at,end_at,ws_id)"
                    .to_owned(),
            ),
            ("task_id", format!("eq.{task_id}")),
            ("workspace_calendar_events.ws_id", format!("eq.{ws_id}")),
            (
                "workspace_calendar_events.start_at",
                format!("gte.{range_start_iso}"),
            ),
            (
                "workspace_calendar_events.start_at",
                format!("lte.{range_end_iso}"),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<JunctionRow>>().map_err(|_| ())
}

/// `workspace_calendar_events` directly linked to the task, filtered by ws_id
/// and the start_at range. Service role / admin client.
async fn fetch_direct_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
    ws_id: &str,
    range_start_iso: &str,
    range_end_iso: &str,
) -> Result<Vec<DirectRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_calendar_events",
        &[
            ("select", "id,start_at,end_at,ws_id".to_owned()),
            ("task_id", format!("eq.{task_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("start_at", format!("gte.{range_start_iso}")),
            ("start_at", format!("lte.{range_end_iso}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<DirectRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Outbound helpers (copied from the reference handlers; private there, so they
// are re-declared file-locally instead of editing the shared modules).
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
// Deserialization rows
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct TaskRow {
    task_lists: Option<TaskListRow>,
}

#[derive(Deserialize)]
struct TaskListRow {
    workspace_boards: Option<WorkspaceBoardRow>,
}

#[derive(Deserialize)]
struct WorkspaceBoardRow {
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct SchedulingSettingsRow {
    total_duration: Option<f64>,
}

#[derive(Deserialize)]
struct JunctionRow {
    scheduled_minutes: Option<i64>,
    workspace_calendar_events: Option<CalendarEventRow>,
}

#[derive(Deserialize)]
struct CalendarEventRow {
    id: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
}

#[derive(Deserialize)]
struct DirectRow {
    id: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Query parsing + path matching
// ---------------------------------------------------------------------------

/// Mirrors the legacy zod schema: `start`/`end` are optional `YYYY-MM-DD` dates.
/// A present, malformed value records a zod-style issue and yields a 400.
fn parse_query(request_url: Option<&str>) -> Result<ScheduleQuery, Vec<Value>> {
    let start_raw = query_value(request_url, "start");
    let end_raw = query_value(request_url, "end");

    let mut issues: Vec<Value> = Vec::new();
    let start = validate_date(start_raw.as_deref(), "start", &mut issues);
    let end = validate_date(end_raw.as_deref(), "end", &mut issues);

    if issues.is_empty() {
        Ok(ScheduleQuery { start, end })
    } else {
        Err(issues)
    }
}

fn validate_date(raw: Option<&str>, field: &str, issues: &mut Vec<Value>) -> Option<String> {
    // Legacy treats absent (`?? undefined`) as None; an empty string is also
    // absent here since `searchParams.get` would never yield `undefined`.
    let value = raw.filter(|value| !value.is_empty())?;

    if is_iso_date(value) {
        Some(value.to_owned())
    } else {
        issues.push(json!({
            "code": "invalid_string",
            "validation": "date",
            "path": [field],
            "message": "Invalid date",
        }));
        None
    }
}

/// Validates `YYYY-MM-DD` (the format accepted by zod `.date()`), including a
/// basic month/day range check and real calendar-day check.
fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    if bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let (Some(year), Some(month), Some(day)) = (
        value.get(0..4).and_then(|s| s.parse::<i128>().ok()),
        value.get(5..7).and_then(|s| s.parse::<i128>().ok()),
        value.get(8..10).and_then(|s| s.parse::<i128>().ok()),
    ) else {
        return false;
    };
    if !(1..=12).contains(&month) {
        return false;
    }
    let max_day = days_in_month(year, month);
    (1..=max_day).contains(&day)
}

fn days_in_month(year: i128, month: i128) -> i128 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

/// Builds epoch millis for `<date>T<time>Z` where `date` is a validated
/// `YYYY-MM-DD` and `time` is e.g. `00:00:00.000`.
fn date_to_millis(date: &str, time: &str) -> Option<i128> {
    parse_iso8601_millis(&format!("{date}T{time}Z"))
}

fn minutes_between(start_at: &str, end_at: &str) -> i64 {
    let (Some(start), Some(end)) = (parse_iso8601_millis(start_at), parse_iso8601_millis(end_at))
    else {
        return 0;
    };
    let diff_minutes = ((end - start) as f64) / 60_000.0;
    (diff_minutes.round() as i64).max(0)
}

fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(found_key, value)| (found_key == key).then(|| value.into_owned()))
}

/// Matches `/api/v1/workspaces/:wsId/tasks/:taskId/schedule/history` and returns
/// `(wsId, taskId)` when the path shape matches.
fn parse_schedule_history_path(path: &str) -> Option<(&str, &str)> {
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
        && segments[6] == "schedule"
        && segments[7] == "history"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
    {
        Some((segments[3], segments[5]))
    } else {
        None
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

// ---------------------------------------------------------------------------
// Time helpers (copied from auth_qr_login_challenges.rs; private there, so they
// are re-declared file-locally instead of editing that module).
// ---------------------------------------------------------------------------

fn now_millis() -> i128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i128)
        .unwrap_or(0)
}

fn parse_iso8601_millis(value: &str) -> Option<i128> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i128 = value.get(0..4)?.parse().ok()?;
    let month: i128 = value.get(5..7)?.parse().ok()?;
    let day: i128 = value.get(8..10)?.parse().ok()?;
    let hour: i128 = value.get(11..13)?.parse().ok()?;
    let minute: i128 = value.get(14..16)?.parse().ok()?;
    let second: i128 = value.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut rest = &value[19..];
    let mut millis_fraction: i128 = 0;

    if let Some(stripped) = rest.strip_prefix('.') {
        let frac_end = stripped
            .find(|character: char| !character.is_ascii_digit())
            .unwrap_or(stripped.len());
        let frac = &stripped[..frac_end];
        rest = &stripped[frac_end..];

        let mut frac_millis = String::new();
        for index in 0..3 {
            frac_millis.push(frac.as_bytes().get(index).map_or('0', |&b| b as char));
        }
        millis_fraction = frac_millis.parse().unwrap_or(0);
    }

    let offset_seconds: i128 = parse_offset_seconds(rest);

    let days = days_from_civil(year, month, day);
    let epoch_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_seconds;

    Some(epoch_seconds * 1_000 + millis_fraction)
}

fn parse_offset_seconds(tz: &str) -> i128 {
    let tz = tz.trim();
    if tz.is_empty() || tz == "Z" || tz == "z" {
        return 0;
    }

    let (sign, body) = match tz.as_bytes().first() {
        Some(b'+') => (1i128, &tz[1..]),
        Some(b'-') => (-1i128, &tz[1..]),
        _ => return 0,
    };

    let body = body.replace(':', "");
    let hours: i128 = body.get(0..2).and_then(|h| h.parse().ok()).unwrap_or(0);
    let minutes: i128 = body.get(2..4).and_then(|m| m.parse().ok()).unwrap_or(0);

    sign * (hours * 3_600 + minutes * 60)
}

fn days_from_civil(year: i128, month: i128, day: i128) -> i128 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn iso8601_from_millis(millis: i128) -> String {
    let total_seconds = millis.div_euclid(1_000);
    let frac_millis = millis.rem_euclid(1_000);
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{frac_millis:03}Z")
}

fn civil_from_days(days: i128) -> (i128, i128, i128) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}
