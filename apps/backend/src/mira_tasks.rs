use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_TASKS_PATH: &str = "/api/v1/mira/tasks";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_TASKS_FAILED_MESSAGE: &str = "Failed to fetch tasks";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const GET_USER_ACCESSIBLE_TASKS_RPC: &str = "get_user_accessible_tasks";
const LIST_STATUSES: [&str; 4] = ["not_started", "active", "review", "done"];
const ACTIVE_LIST_STATUSES: [&str; 2] = ["not_started", "active"];

const MS_PER_DAY: i64 = 86_400_000;

// Mirrors the RPC arguments the legacy route supplies. `p_ws_id` is conditional:
// for personal workspaces the TS source passes `undefined` (so the param is
// omitted entirely and the SQL default applies); for team workspaces it passes
// the workspace id. `skip_serializing_if` reproduces that exactly.
#[derive(Serialize)]
struct GetUserAccessibleTasksRpcRequest<'a> {
    p_user_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_ws_id: Option<&'a str>,
    p_include_deleted: bool,
    p_list_statuses: [&'a str; 4],
}

#[derive(Deserialize)]
struct RpcTask {
    task_id: Option<String>,
    task_name: Option<String>,
    task_description: Option<String>,
    task_priority: Option<String>,
    task_end_date: Option<String>,
    task_list_id: Option<String>,
    task_created_at: Option<String>,
}

#[derive(Deserialize)]
struct TaskListBoard {
    id: Option<String>,
    name: Option<String>,
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct TaskListRow {
    id: Option<String>,
    name: Option<String>,
    status: Option<String>,
    // `board:workspace_boards!inner(...)` aliases the embedded relation to
    // `board`. PostgREST returns it as an object for a to-one inner relation.
    board: Option<TaskListBoard>,
}

#[derive(Deserialize)]
struct DailyStatsRow {
    tasks_completed: Option<i64>,
}

// Output shape mirrors the legacy mapped task object exactly (field order +
// nullability). `priority` defaults to "normal" when absent/empty.
#[derive(Serialize)]
struct MappedTask {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
    priority: String,
    end_date: Option<String>,
    created_at: Option<String>,
    list_id: Option<String>,
    list_name: Option<String>,
    list_status: Option<String>,
    board_id: Option<String>,
    board_name: Option<String>,
    ws_id: Option<String>,
}

pub(crate) async fn handle_mira_tasks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MIRA_TASKS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => mira_tasks_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn mira_tasks_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
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

    let query = query_params(request.url);
    let ws_id = query.get("wsId").map(String::as_str);
    let is_personal = query.get("isPersonal").map(String::as_str) == Some("true");

    // Match the tasks page behavior:
    // - personal workspaces: fetch ALL tasks across workspaces (p_ws_id omitted)
    // - team workspaces: fetch tasks only for that workspace (empty wsId omitted)
    let workspace_filter: Option<&str> = if is_personal {
        None
    } else {
        ws_id.filter(|value| !value.is_empty())
    };

    // Fetch accessible tasks via the RPC. A non-2xx / parse failure maps to the
    // legacy `tasksError` 500 branch.
    let rpc_tasks =
        match fetch_accessible_tasks(&config.contact_data, outbound, &user_id, workspace_filter)
            .await
        {
            Ok(rows) => rows,
            Err(()) => return error_response(500, FETCH_TASKS_FAILED_MESSAGE),
        };

    // Unique non-null list ids.
    let mut seen_list_ids: HashSet<String> = HashSet::new();
    let mut list_ids: Vec<String> = Vec::new();
    for task in &rpc_tasks {
        if let Some(list_id) = task.task_list_id.as_deref() {
            if seen_list_ids.insert(list_id.to_owned()) {
                list_ids.push(list_id.to_owned());
            }
        }
    }

    // Fetch list/board info. Mirrors the legacy `if (listsData)` semantics: any
    // failure is treated as an empty map (no 500), so use unwrap_or_default.
    let mut lists_map: HashMap<String, TaskListRow> = HashMap::new();
    if !list_ids.is_empty() {
        let lists = fetch_task_lists(&config.contact_data, outbound, &list_ids)
            .await
            .unwrap_or_default();
        for list in lists {
            if let Some(id) = list.id.clone() {
                lists_map.insert(id, list);
            }
        }
    }

    // Map tasks to the simplified format.
    let tasks: Vec<MappedTask> = rpc_tasks
        .into_iter()
        .map(|task| {
            let list = task
                .task_list_id
                .as_deref()
                .and_then(|list_id| lists_map.get(list_id));
            let board = list.and_then(|list| list.board.as_ref());
            let priority = match task.task_priority {
                Some(value) if !value.is_empty() => value,
                _ => "normal".to_owned(),
            };
            MappedTask {
                id: task.task_id,
                name: task.task_name,
                description: task.task_description,
                priority,
                end_date: task.task_end_date,
                created_at: task.task_created_at,
                list_id: task.task_list_id,
                list_name: list.and_then(|list| list.name.clone()),
                list_status: list.and_then(|list| list.status.clone()),
                board_id: board.and_then(|board| board.id.clone()),
                board_name: board.and_then(|board| board.name.clone()),
                ws_id: board.and_then(|board| board.ws_id.clone()),
            }
        })
        .collect();

    // Categorize by due date (UTC; the deployment runtime is UTC, matching the
    // legacy server-side `setHours`/`toISOString` behavior).
    let now_ms = now_millis();
    let today_start = utc_day_start(now_ms);
    let today_end = today_start + MS_PER_DAY - 1; // 23:59:59.999
    let next_week_end = today_start + 8 * MS_PER_DAY - 1; // +7 days, end of day

    let mut overdue: Vec<&MappedTask> = Vec::new();
    let mut today: Vec<&MappedTask> = Vec::new();
    let mut upcoming_with_date: Vec<&MappedTask> = Vec::new();
    let mut no_due_date: Vec<&MappedTask> = Vec::new();

    for task in &tasks {
        if !is_active_list_task(task) {
            continue;
        }
        match task.end_date.as_deref().and_then(parse_epoch_ms) {
            Some(end_ms) => {
                if end_ms < now_ms {
                    overdue.push(task);
                } else if end_ms >= today_start && end_ms <= today_end && end_ms >= now_ms {
                    today.push(task);
                } else if end_ms > today_end && end_ms <= next_week_end {
                    upcoming_with_date.push(task);
                }
            }
            None => {
                // Either no end_date or an unparseable end_date. The legacy code
                // only routes truly-missing end_date into the no-due-date bucket;
                // an unparseable date yields NaN comparisons that are all false,
                // so it is dropped. Mirror that by only bucketing when absent.
                if task.end_date.is_none() {
                    no_due_date.push(task);
                }
            }
        }
    }

    sort_by_end_date(&mut overdue);
    sort_by_end_date(&mut today);
    sort_by_end_date(&mut upcoming_with_date);
    sort_no_due_date(&mut no_due_date);

    // upcoming = upcomingWithDate ++ noDueDate
    let upcoming_len = upcoming_with_date.len() + no_due_date.len();
    let upcoming: Vec<&MappedTask> = upcoming_with_date
        .into_iter()
        .chain(no_due_date.into_iter())
        .collect();

    // Today's completed task count from daily stats (errors -> 0).
    let today_str = utc_date_string(now_ms);
    let completed_today =
        fetch_completed_today(&config.contact_data, outbound, &user_id, &today_str)
            .await
            .unwrap_or(0);

    let total = overdue.len() + today.len() + upcoming_len;

    no_store_response(json_response(
        200,
        json!({
            "overdue": overdue,
            "today": today,
            "upcoming": upcoming,
            "stats": {
                "total": total,
                "completed_today": completed_today,
            },
        }),
    ))
}

async fn fetch_accessible_tasks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    ws_id: Option<&str>,
) -> Result<Vec<RpcTask>, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_USER_ACCESSIBLE_TASKS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&GetUserAccessibleTasksRpcRequest {
        p_user_id: user_id,
        p_ws_id: ws_id,
        p_include_deleted: false,
        p_list_statuses: LIST_STATUSES,
    })
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

    response.json::<Vec<RpcTask>>().map_err(|_| ())
}

async fn fetch_task_lists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    list_ids: &[String],
) -> Result<Vec<TaskListRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_lists",
        &[
            (
                "select",
                "id,name,status,board:workspace_boards!inner(id,name,ws_id)".to_owned(),
            ),
            ("id", in_filter(list_ids)),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<TaskListRow>>().map_err(|_| ())
}

async fn fetch_completed_today(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    today_str: &str,
) -> Result<i64, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_daily_stats",
        &[
            ("select", "tasks_completed".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("date", format!("eq.{today_str}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<DailyStatsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.tasks_completed)
        .unwrap_or(0))
}

async fn send_service_role_request(
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

// --- small helpers ---

fn is_active_list_task(task: &MappedTask) -> bool {
    task.list_status
        .as_deref()
        .is_some_and(|status| ACTIVE_LIST_STATUSES.contains(&status))
}

fn sort_by_end_date(tasks: &mut [&MappedTask]) {
    tasks.sort_by(|a, b| {
        let a_ms = a.end_date.as_deref().and_then(parse_epoch_ms).unwrap_or(0);
        let b_ms = b.end_date.as_deref().and_then(parse_epoch_ms).unwrap_or(0);
        a_ms.cmp(&b_ms)
    });
}

fn sort_no_due_date(tasks: &mut [&MappedTask]) {
    tasks.sort_by(|a, b| {
        let a_priority = priority_rank(&a.priority);
        let b_priority = priority_rank(&b.priority);
        if a_priority != b_priority {
            // Higher priority first.
            return b_priority.cmp(&a_priority);
        }
        // Then created_at, newest first.
        match (a.created_at.as_deref(), b.created_at.as_deref()) {
            (Some(a_created), Some(b_created)) => {
                if a_created > b_created {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                }
            }
            _ => std::cmp::Ordering::Equal,
        }
    });
}

fn priority_rank(priority: &str) -> i32 {
    match priority {
        "critical" => 4,
        "high" => 3,
        "normal" => 2,
        "low" => 1,
        _ => 2,
    }
}

fn query_params(request_url: Option<&str>) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Some(url) = request_url.and_then(|raw| url::Url::parse(raw).ok()) {
        for (key, value) in url.query_pairs() {
            map.entry(key.into_owned())
                .or_insert_with(|| value.into_owned());
        }
    }
    map
}

fn in_filter(values: &[String]) -> String {
    let joined = values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// UTC midnight (00:00:00.000) of the day containing `epoch_ms`.
fn utc_day_start(epoch_ms: i64) -> i64 {
    epoch_ms.div_euclid(MS_PER_DAY) * MS_PER_DAY
}

/// UTC `YYYY-MM-DD` for `epoch_ms` (matches JS `toISOString().split('T')[0]`).
fn utc_date_string(epoch_ms: i64) -> String {
    let days = epoch_ms.div_euclid(MS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

/// Best-effort RFC3339 / ISO-8601 timestamp -> epoch milliseconds. Mirrors JS
/// `new Date(value).getTime()` for the timestamp shapes Supabase returns
/// (e.g. `2026-06-24T10:30:00+00:00` or `...Z`, with optional fractional
/// seconds). Returns None if the string cannot be parsed. A bare date
/// (`YYYY-MM-DD`) is also supported (treated as UTC midnight) to match JS Date.
fn parse_epoch_ms(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();

    // Date-only form: YYYY-MM-DD.
    if bytes.len() == 10 && bytes[4] == b'-' && bytes[7] == b'-' {
        let year: i64 = value.get(0..4)?.parse().ok()?;
        let month: i64 = value.get(5..7)?.parse().ok()?;
        let day: i64 = value.get(8..10)?.parse().ok()?;
        if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
            return None;
        }
        return Some(days_from_civil(year, month, day) * MS_PER_DAY);
    }

    if bytes.len() < 19 {
        return None;
    }

    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let rest = &value[19..];
    let mut idx = 0usize;
    let rest_bytes = rest.as_bytes();
    let mut frac_ms = 0i64;
    if rest_bytes.first() == Some(&b'.') {
        idx += 1;
        let frac_start = idx;
        while idx < rest_bytes.len() && rest_bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        let frac_str = &rest[frac_start..idx];
        if !frac_str.is_empty() {
            let mut millis = String::new();
            for (i, c) in frac_str.chars().enumerate() {
                if i >= 3 {
                    break;
                }
                millis.push(c);
            }
            while millis.len() < 3 {
                millis.push('0');
            }
            frac_ms = millis.parse::<i64>().unwrap_or(0);
        }
    }

    let mut offset_seconds: i64 = 0;
    let tz = &rest[idx..];
    if !(tz == "Z" || tz == "z" || tz.is_empty()) {
        if let Some(sign_char) = tz.chars().next() {
            if sign_char == '+' || sign_char == '-' {
                let sign = if sign_char == '-' { -1 } else { 1 };
                let digits: String = tz[1..].chars().filter(|c| c.is_ascii_digit()).collect();
                if digits.len() >= 4 {
                    let oh: i64 = digits[0..2].parse().unwrap_or(0);
                    let om: i64 = digits[2..4].parse().unwrap_or(0);
                    offset_seconds = sign * (oh * 3600 + om * 60);
                } else if digits.len() >= 2 {
                    let oh: i64 = digits[0..2].parse().unwrap_or(0);
                    offset_seconds = sign * oh * 3600;
                }
            }
        }
    }

    let days = days_from_civil(year, month, day);
    let utc_seconds = days * 86400 + hour * 3600 + minute * 60 + second - offset_seconds;
    Some(utc_seconds * 1000 + frac_ms)
}

/// Days since 1970-01-01 (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// Inverse of `days_from_civil`: days since 1970-01-01 -> (year, month, day).
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
