//! Handler for `GET /api/v1/users/me/tasks/:taskId/schedule`.
//!
//! Ports the GET handler from:
//! `apps/web/src/app/api/v1/users/me/tasks/[taskId]/schedule/route.ts`.
//!
//! Auth: `withSessionAuth` with `allowAppSessionAuth: ['calendar','tasks']`
//! is reproduced via `hive_access::authenticated_user` with the same targets.
//!
//! Cache: 200 responses carry `private, max-age=5, stale-while-revalidate=10`.
//! Errors are no-store.
//!
//! Behavior gaps:
//!
//! - Personal-workspace and membership lookups use the service-role key with
//!   explicit user-id filters instead of the legacy user-scoped RLS client.
//! - The two final queries (task-calendar events + direct events) run
//!   sequentially rather than concurrently (`Promise.all`).
//! - Events with a null `workspace_calendar_events` row have `null` JSON
//!   fields rather than absent fields (serde serialises `None` as `null`).
//! - PATCH and POST return `None` so they fall through to Next.js.

use std::collections::HashSet;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const PATH_PREFIX: &str = "/api/v1/users/me/tasks/";
const PATH_SUFFIX: &str = "/schedule";
const SCHEDULE_CACHE_CONTROL: &str = "private, max-age=5, stale-while-revalidate=10";
const APP_SESSION_TARGETS: &[&str] = &["calendar", "tasks"];

#[derive(Deserialize)]
struct TaskBasicRow {
    id: String,
    name: Option<String>,
}

#[derive(Deserialize)]
struct UserSchedulingSettingsRow {
    total_duration: Option<f64>,
    is_splittable: Option<bool>,
    min_split_duration_minutes: Option<i64>,
    max_split_duration_minutes: Option<i64>,
    calendar_hours: Option<String>,
    auto_schedule: Option<bool>,
}

#[derive(Deserialize)]
struct CalendarEventRow {
    id: Option<String>,
    title: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    color: Option<String>,
}

#[derive(Deserialize)]
struct TaskCalendarEventRow {
    completed: Option<bool>,
    workspace_calendar_events: Option<CalendarEventRow>,
}

pub(crate) async fn handle_users_me_tasks_taskid_schedule_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let task_id = extract_task_id(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, task_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match hive_access::authenticated_user(config, request, APP_SESSION_TARGETS, outbound)
        .await
    {
        Ok(u) => u,
        Err(()) => return err(401, "Unauthorized"),
    };
    if !is_valid_uuid(task_id) {
        return no_store_response(json_response(400, json!({ "error": "Invalid task ID" })));
    }
    let cd = &config.contact_data;
    if !cd.configured() {
        return err(500, "Internal server error");
    }
    let personal_ws_id = match fetch_personal_ws(cd, &user.id, outbound).await {
        Ok(Some(id)) => id,
        Ok(None) => {
            return no_store_response(json_response(
                404,
                json!({ "error": "Personal workspace not found" }),
            ));
        }
        Err(()) => return err(500, "Internal server error"),
    };
    let task_ws_id = match fetch_task_ws(cd, task_id, outbound).await {
        Ok(Some(id)) => id,
        Ok(None) => {
            return no_store_response(json_response(404, json!({ "error": "Task not found" })));
        }
        Err(()) => return err(500, "Internal server error"),
    };
    match check_membership(cd, &task_ws_id, &user.id, outbound).await {
        Ok(true) => {}
        Ok(false) => {
            return no_store_response(json_response(404, json!({ "error": "Task not found" })));
        }
        Err(()) => {
            return no_store_response(json_response(
                500,
                json!({ "error": "Failed to verify workspace access" }),
            ));
        }
    }
    let task = match fetch_task(cd, task_id, outbound).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return no_store_response(json_response(404, json!({ "error": "Task not found" })));
        }
        Err(()) => return err(500, "Internal server error"),
    };
    let settings = match fetch_settings(cd, task_id, &user.id, outbound).await {
        Ok(s) => s,
        Err(()) => return err(500, "Internal server error"),
    };
    let eff_total = settings.as_ref().and_then(|s| s.total_duration);
    let eff_split = settings
        .as_ref()
        .and_then(|s| s.is_splittable)
        .unwrap_or(false);
    let eff_min = settings.as_ref().and_then(|s| s.min_split_duration_minutes);
    let eff_max = settings.as_ref().and_then(|s| s.max_split_duration_minutes);
    let eff_hours: Value = settings
        .as_ref()
        .and_then(|s| s.calendar_hours.as_deref())
        .map(|h| json!(h))
        .unwrap_or(Value::Null);
    let eff_auto = settings
        .as_ref()
        .and_then(|s| s.auto_schedule)
        .unwrap_or(false);
    let task_events = match fetch_task_events(cd, task_id, &personal_ws_id, outbound).await {
        Ok(r) => r,
        Err(()) => return err(500, "Internal server error"),
    };
    let direct_events = match fetch_direct_events(cd, task_id, &personal_ws_id, outbound).await {
        Ok(r) => r,
        Err(()) => return err(500, "Internal server error"),
    };
    let mut seen: HashSet<String> = HashSet::new();
    let mut combined: Vec<Value> = Vec::with_capacity(task_events.len());
    for te in &task_events {
        let completed = te.completed.unwrap_or(false);
        let ev = te.workspace_calendar_events.as_ref();
        let mins = ev
            .and_then(|e| dur_mins(e.start_at.as_deref(), e.end_at.as_deref()))
            .unwrap_or(0);
        if let Some(id) = ev.and_then(|e| e.id.as_deref()) {
            seen.insert(id.to_owned());
        }
        combined.push(json!({
            "id": ev.and_then(|e| e.id.as_deref()),
            "title": ev.and_then(|e| e.title.as_deref()),
            "start_at": ev.and_then(|e| e.start_at.as_deref()),
            "end_at": ev.and_then(|e| e.end_at.as_deref()),
            "color": ev.and_then(|e| e.color.as_deref()),
            "scheduled_minutes": mins,
            "completed": completed,
        }));
    }
    for de in &direct_events {
        if de["id"].as_str().is_some_and(|id| seen.contains(id)) {
            continue;
        }
        let mins = dur_mins(de["start_at"].as_str(), de["end_at"].as_str()).unwrap_or(0);
        combined.push(json!({
            "id": de["id"].as_str(),
            "title": de["title"].as_str(),
            "start_at": de["start_at"].as_str(),
            "end_at": de["end_at"].as_str(),
            "color": de["color"].as_str(),
            "scheduled_minutes": mins,
            "completed": false,
        }));
    }
    let sched: i64 = combined
        .iter()
        .filter_map(|e| e["scheduled_minutes"].as_i64())
        .sum();
    let done: i64 = combined
        .iter()
        .filter_map(|e| {
            if e["completed"].as_bool().unwrap_or(false) {
                e["scheduled_minutes"].as_i64()
            } else {
                None
            }
        })
        .sum();
    let total = (eff_total.unwrap_or(0.0) * 60.0) as i64;
    let progress = if total > 0 {
        (sched as f64 / total as f64) * 100.0
    } else {
        0.0
    };
    let mut resp = json_response(
        200,
        json!({
            "calendar_ws_id": personal_ws_id,
            "task_ws_id": task_ws_id,
            "task": {
                "id": task.id, "name": task.name,
                "total_duration": eff_total, "is_splittable": eff_split,
                "min_split_duration_minutes": eff_min, "max_split_duration_minutes": eff_max,
                "calendar_hours": eff_hours, "auto_schedule": eff_auto,
            },
            "scheduling": {
                "totalMinutes": total, "scheduledMinutes": sched,
                "completedMinutes": done, "remainingMinutes": (total - sched).max(0),
                "progress": progress, "isFullyScheduled": sched >= total,
            },
            "events": combined,
        }),
    );
    resp.cache_control = Some(SCHEDULE_CACHE_CONTROL);
    resp
}

async fn fetch_personal_ws(
    cd: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let resp = srget(
        cd,
        outbound,
        "workspaces",
        &[
            ("select", "id,workspace_members!inner(user_id)".to_owned()),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    ok2(resp)?.json::<Vec<Value>>().map_err(|_| ()).map(|rows| {
        rows.into_iter()
            .next()
            .and_then(|r| r["id"].as_str().map(str::to_owned))
    })
}

async fn fetch_task_ws(
    cd: &contact::ContactDataConfig,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let resp = srget(
        cd,
        outbound,
        "tasks",
        &[
            (
                "select",
                "id,task_lists!inner(workspace_boards!inner(ws_id))".to_owned(),
            ),
            ("id", format!("eq.{task_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    ok2(resp)?.json::<Vec<Value>>().map_err(|_| ()).map(|rows| {
        rows.into_iter().next().and_then(|r| {
            r["task_lists"]["workspace_boards"]["ws_id"]
                .as_str()
                .map(str::to_owned)
        })
    })
}

async fn check_membership(
    cd: &contact::ContactDataConfig,
    ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    let resp = srget(
        cd,
        outbound,
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    ok2(resp)?
        .json::<Vec<Value>>()
        .map_err(|_| ())
        .map(|rows| !rows.is_empty())
}

async fn fetch_task(
    cd: &contact::ContactDataConfig,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<TaskBasicRow>, ()> {
    let resp = srget(
        cd,
        outbound,
        "tasks",
        &[
            ("select", "id,name".to_owned()),
            ("id", format!("eq.{task_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    ok2(resp)?
        .json::<Vec<TaskBasicRow>>()
        .map_err(|_| ())
        .map(|r| r.into_iter().next())
}

async fn fetch_settings(
    cd: &contact::ContactDataConfig,
    task_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<UserSchedulingSettingsRow>, ()> {
    let resp = srget(cd, outbound, "task_user_scheduling_settings", &[
        ("select", "total_duration,is_splittable,min_split_duration_minutes,max_split_duration_minutes,calendar_hours,auto_schedule".to_owned()),
        ("task_id", format!("eq.{task_id}")),
        ("user_id", format!("eq.{user_id}")),
        ("limit", "1".to_owned()),
    ]).await?;
    ok2(resp)?
        .json::<Vec<UserSchedulingSettingsRow>>()
        .map_err(|_| ())
        .map(|r| r.into_iter().next())
}

async fn fetch_task_events(
    cd: &contact::ContactDataConfig,
    task_id: &str,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<TaskCalendarEventRow>, ()> {
    let resp = srget(
        cd,
        outbound,
        "task_calendar_events",
        &[
            (
                "select",
                "completed,workspace_calendar_events(id,title,start_at,end_at,color,ws_id)"
                    .to_owned(),
            ),
            ("task_id", format!("eq.{task_id}")),
            ("workspace_calendar_events.ws_id", format!("eq.{ws_id}")),
        ],
    )
    .await?;
    ok2(resp)?
        .json::<Vec<TaskCalendarEventRow>>()
        .map_err(|_| ())
}

async fn fetch_direct_events(
    cd: &contact::ContactDataConfig,
    task_id: &str,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let resp = srget(
        cd,
        outbound,
        "workspace_calendar_events",
        &[
            ("select", "id,title,start_at,end_at,color".to_owned()),
            ("task_id", format!("eq.{task_id}")),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    )
    .await?;
    ok2(resp)?.json::<Vec<Value>>().map_err(|_| ())
}

async fn srget(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<OutboundResponse, ()> {
    let url = cd.rest_url(table, params).ok_or(())?;
    let srk = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {srk}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())
}

fn ok2(r: OutboundResponse) -> Result<OutboundResponse, ()> {
    if (200..300).contains(&r.status) {
        Ok(r)
    } else {
        Err(())
    }
}

fn extract_task_id(path: &str) -> Option<&str> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let id = rest.strip_suffix(PATH_SUFFIX)?;
    (!id.is_empty() && !id.contains('/')).then_some(id)
}

fn is_valid_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 36 {
        return false;
    }
    for (i, &byte) in b.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if byte != b'-' {
                    return false;
                }
            }
            _ => {
                if !byte.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

fn dur_mins(start: Option<&str>, end: Option<&str>) -> Option<i64> {
    let s = parse_ms(start?)?;
    let e = parse_ms(end?)?;
    Some(((e - s) as f64 / 60_000.0).round() as i64)
}

/// Parse ISO 8601 timestamp to epoch milliseconds.
///
/// Handles:
///
/// - `YYYY-MM-DDTHH:MM:SS[.frac]Z`
/// - `YYYY-MM-DDTHH:MM:SS[.frac]+HH:MM`
fn parse_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.len() < 19 {
        return None;
    }
    let y: i64 = s.get(0..4)?.parse().ok()?;
    let mo: i64 = s.get(5..7)?.parse().ok()?;
    let d: i64 = s.get(8..10)?.parse().ok()?;
    let h: i64 = s.get(11..13)?.parse().ok()?;
    let mi: i64 = s.get(14..16)?.parse().ok()?;
    let sc: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) {
        return None;
    }
    let rest = &s[19..];
    let rb = rest.as_bytes();
    let mut idx = 0usize;
    let mut frac = 0i64;
    if rb.first() == Some(&b'.') {
        idx += 1;
        let fs = idx;
        while idx < rb.len() && rb[idx].is_ascii_digit() {
            idx += 1;
        }
        let fstr = &rest[fs..idx];
        if !fstr.is_empty() {
            let mut ms = String::new();
            for c in fstr.chars().take(3) {
                ms.push(c);
            }
            while ms.len() < 3 {
                ms.push('0');
            }
            frac = ms.parse::<i64>().unwrap_or(0);
        }
    }
    let mut off: i64 = 0;
    if let Some(sc2) = rest[idx..].chars().next()
        && (sc2 == '+' || sc2 == '-')
    {
        let sign: i64 = if sc2 == '-' { -1 } else { 1 };
        let digs: String = rest[idx + 1..]
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect();
        if digs.len() >= 4 {
            let oh: i64 = digs[0..2].parse().unwrap_or(0);
            let om: i64 = digs[2..4].parse().unwrap_or(0);
            off = sign * (oh * 3600 + om * 60);
        }
    }
    let yy = if mo <= 2 { y - 1 } else { y };
    let era = if yy >= 0 { yy } else { yy - 399 } / 400;
    let yoe = yy - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let utc = days * 86400 + h * 3600 + mi * 60 + sc - off;
    Some(utc * 1000 + frac)
}

fn err(status: u16, msg: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": msg })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_and_rejects() {
        assert_eq!(
            extract_task_id("/api/v1/users/me/tasks/550e8400-e29b-41d4-a716-446655440000/schedule"),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
        assert_eq!(
            extract_task_id("/api/v1/users/me/tasks/abc/schedule"),
            Some("abc")
        );
        assert!(extract_task_id("/api/v1/users/me/tasks//schedule").is_none());
        assert!(extract_task_id("/api/v1/users/me/tasks/abc/schedule/extra").is_none());
        assert!(extract_task_id("/api/v2/users/me/tasks/abc/schedule").is_none());
        assert!(extract_task_id("/api/v1/users/me/tasks/a/b/schedule").is_none());
    }

    #[test]
    fn uuid_validates_and_rejects() {
        assert!(is_valid_uuid("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-44665544000"));
        assert!(!is_valid_uuid("gggggggg-e29b-41d4-a716-446655440000"));
        assert!(!is_valid_uuid("550e8400xe29b-41d4-a716-446655440000"));
    }

    #[test]
    fn parse_ms_zulu_and_offset_match() {
        let zulu = parse_ms("2026-06-29T10:30:00Z").unwrap();
        let plus = parse_ms("2026-06-29T16:00:00+05:30").unwrap();
        assert_eq!(zulu, plus);
    }

    #[test]
    fn parse_ms_fractional_seconds() {
        let base = parse_ms("2026-06-29T10:30:00Z").unwrap();
        let frac = parse_ms("2026-06-29T10:30:00.123Z").unwrap();
        assert_eq!(frac - base, 123);
    }

    #[test]
    fn dur_mins_computes_correctly() {
        assert_eq!(
            dur_mins(Some("2026-06-29T09:00:00Z"), Some("2026-06-29T10:30:00Z")),
            Some(90)
        );
        assert!(dur_mins(None, Some("2026-06-29T10:00:00Z")).is_none());
    }
}
