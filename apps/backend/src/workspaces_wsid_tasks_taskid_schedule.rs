//! Handler for `GET /api/v1/workspaces/:wsId/tasks/:taskId/schedule`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/schedule/route.ts`.
//!
//! Auth flow:
//!
//!   1. UUID-validate both path params — `400`.
//!   2. Resolve authenticated session user — `401`.
//!   3. Verify `workspace_members` row for `wsId` — `403`.
//!   4. Fetch task with list/board join — `404` "Task not found".
//!   5. If task lives in a different workspace, verify membership there — `404`.
//!   6. Fetch `task_user_scheduling_settings` (service-role, filtered by
//!      `task_id` + `user_id`) and calendar events via service role.
//!   7. Combine events, compute metrics, return `{ task, scheduling, events }`.
//!
//! Behavior gaps:
//!
//!   - Only GET is migrated; POST returns `None` (falls through to Next.js).
//!   - Settings are read with service role + explicit user filter (same rows as
//!     the legacy RLS path).
//!   - Membership check mirrors `verifyWorkspaceMembershipType` default
//!     (`requiredType = 'MEMBER'`): access requires `type = 'MEMBER'` exactly.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) async fn handle_workspaces_wsid_tasks_taskid_schedule_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (ws_id, task_id) = path_params(request.path)?;
    Some(match request.method {
        "GET" => get_handler(config, request, ws_id, task_id, outbound).await,
        _ => return None,
    })
}

async fn get_handler(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !is_uuid(ws_id) || !is_uuid(task_id) {
        return err(400, "Invalid workspace or task ID");
    }
    let cd = &config.contact_data;

    let Some(tok) = supabase_auth::request_access_token(request) else {
        return err(401, "Unauthorized");
    };
    let Some(uid) = supabase_auth::fetch_supabase_auth_user(cd, &tok, outbound)
        .await
        .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err(401, "Unauthorized");
    };

    match verify_member(cd, outbound, ws_id, &uid).await {
        Ok(true) => {}
        Ok(false) => return err(403, "You don't have access to this workspace"),
        Err(()) => return err(500, "Internal server error"),
    }

    let task = match fetch_task(cd, outbound, task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return err(404, "Task not found"),
        Err(()) => return err(500, "Internal server error"),
    };

    let task_ws = task
        .task_lists
        .as_ref()
        .and_then(|tl| tl.workspace_boards.as_ref())
        .and_then(|wb| wb.ws_id.as_deref())
        .unwrap_or("");
    if task_ws.is_empty() {
        return err(404, "Task workspace not found");
    }
    if task_ws != ws_id {
        match verify_member(cd, outbound, task_ws, &uid).await {
            Ok(true) => {}
            Ok(false) | Err(()) => return err(404, "Task not found"),
        }
    }

    let settings = fetch_settings(cd, outbound, task_id, &uid)
        .await
        .unwrap_or(None);

    let task_events = fetch_task_cal_events(cd, outbound, task_id)
        .await
        .unwrap_or_default();
    let direct_events = fetch_direct_cal_events(cd, outbound, task_id, ws_id)
        .await
        .unwrap_or_default();

    // Mirror the TS eventsWithRealDuration map: recompute duration from timestamps.
    let mut combined: Vec<Value> = task_events
        .iter()
        .map(|te| {
            let cal = te.workspace_calendar_events.as_ref();
            let mins = dur_mins(
                cal.and_then(|c| c.start_at.as_deref()),
                cal.and_then(|c| c.end_at.as_deref()),
            );
            json!({
                "id":   cal.and_then(|c| c.id.as_deref()),
                "title": cal.and_then(|c| c.title.as_deref()),
                "start_at": cal.and_then(|c| c.start_at.as_deref()),
                "end_at": cal.and_then(|c| c.end_at.as_deref()),
                "color": cal.and_then(|c| c.color.as_deref()),
                "scheduled_minutes": mins,
                "completed": te.completed.unwrap_or(false),
            })
        })
        .collect();

    let existing_ids: std::collections::HashSet<&str> = task_events
        .iter()
        .filter_map(|te| {
            te.workspace_calendar_events
                .as_ref()
                .and_then(|c| c.id.as_deref())
        })
        .collect();

    for de in &direct_events {
        if de.id.as_deref().is_none_or(|id| existing_ids.contains(id)) {
            continue;
        }
        let mins = dur_mins(de.start_at.as_deref(), de.end_at.as_deref());
        combined.push(json!({
            "id": de.id,
            "title": de.title,
            "start_at": de.start_at,
            "end_at": de.end_at,
            "color": de.color,
            "scheduled_minutes": mins,
            "completed": false,
        }));
    }

    let scheduled_mins: i64 = combined
        .iter()
        .map(|e| e["scheduled_minutes"].as_i64().unwrap_or(0))
        .sum();
    let completed_mins: i64 = combined
        .iter()
        .map(|e| {
            if e["completed"].as_bool().unwrap_or(false) {
                e["scheduled_minutes"].as_i64().unwrap_or(0)
            } else {
                0
            }
        })
        .sum();
    let total_dur = settings.as_ref().and_then(|s| s.total_duration);
    let total_mins = total_dur.unwrap_or(0) * 60;
    let remaining = (total_mins - scheduled_mins).max(0);
    let progress = if total_mins > 0 {
        (scheduled_mins as f64 / total_mins as f64) * 100.0
    } else {
        0.0
    };

    no_store_response(json_response(
        200,
        json!({
            "task": {
                "id": task.id,
                "name": task.name,
                "total_duration": total_dur,
                "is_splittable": settings.as_ref().and_then(|s| s.is_splittable).unwrap_or(false),
                "min_split_duration_minutes": settings.as_ref().and_then(|s| s.min_split_duration_minutes),
                "max_split_duration_minutes": settings.as_ref().and_then(|s| s.max_split_duration_minutes),
                "calendar_hours": settings.as_ref().and_then(|s| s.calendar_hours.as_deref()),
                "auto_schedule": settings.as_ref().and_then(|s| s.auto_schedule).unwrap_or(false),
            },
            "scheduling": {
                "totalMinutes": total_mins,
                "scheduledMinutes": scheduled_mins,
                "completedMinutes": completed_mins,
                "remainingMinutes": remaining,
                "progress": progress,
                "isFullyScheduled": scheduled_mins >= total_mins,
            },
            "events": combined,
        }),
    ))
}

// ============================================================================
// PATH MATCHING
// ============================================================================

/// Extracts `(wsId, taskId)` from
/// `/api/v1/workspaces/{wsId}/tasks/{taskId}/schedule`.
///
/// Uses `segs.get(i)` throughout — never panics on short paths.
fn path_params(path: &str) -> Option<(&str, &str)> {
    let segs: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    if segs.len() != 7
        || segs.first() != Some(&"api")
        || segs.get(1) != Some(&"v1")
        || segs.get(2) != Some(&"workspaces")
        || segs.get(4) != Some(&"tasks")
        || segs.get(6) != Some(&"schedule")
    {
        return None;
    }
    let ws = segs.get(3).copied()?;
    let task = segs.get(5).copied()?;
    if ws.is_empty() || task.is_empty() {
        return None;
    }
    Some((ws, task))
}

// ============================================================================
// SUPABASE ROW TYPES
// ============================================================================

#[derive(Deserialize)]
struct BoardRow {
    ws_id: Option<String>,
}
#[derive(Deserialize)]
struct ListRow {
    workspace_boards: Option<BoardRow>,
}
#[derive(Deserialize)]
struct TaskRow {
    id: Option<Value>,
    name: Option<Value>,
    task_lists: Option<ListRow>,
}
#[derive(Deserialize)]
struct SettingsRow {
    total_duration: Option<i64>,
    is_splittable: Option<bool>,
    min_split_duration_minutes: Option<i64>,
    max_split_duration_minutes: Option<i64>,
    calendar_hours: Option<String>,
    auto_schedule: Option<bool>,
}
#[derive(Deserialize)]
struct CalEmbed {
    id: Option<String>,
    title: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    color: Option<String>,
}
#[derive(Deserialize)]
struct TaskCalRow {
    completed: Option<bool>,
    workspace_calendar_events: Option<CalEmbed>,
}
#[derive(Deserialize)]
struct DirectCalRow {
    id: Option<String>,
    title: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    color: Option<String>,
}
#[derive(Deserialize)]
struct MemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

// ============================================================================
// SUPABASE READS
// ============================================================================

async fn fetch_task(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Option<TaskRow>, ()> {
    let url = cd
        .rest_url(
            "tasks",
            &[
                (
                    "select",
                    "*,task_lists!inner(id,workspace_boards!inner(ws_id))".to_owned(),
                ),
                ("id", format!("eq.{task_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<TaskRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_settings(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
    user_id: &str,
) -> Result<Option<SettingsRow>, ()> {
    let url = cd
        .rest_url(
            "task_user_scheduling_settings",
            &[
                (
                    "select",
                    concat!(
                        "total_duration,is_splittable,",
                        "min_split_duration_minutes,max_split_duration_minutes,",
                        "calendar_hours,auto_schedule"
                    )
                    .to_owned(),
                ),
                ("task_id", format!("eq.{task_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<SettingsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_task_cal_events(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Vec<TaskCalRow>, ()> {
    let url = cd
        .rest_url(
            "task_calendar_events",
            &[
                (
                    "select",
                    concat!(
                        "id,scheduled_minutes,completed,created_at,",
                        "workspace_calendar_events(id,title,start_at,end_at,color)"
                    )
                    .to_owned(),
                ),
                ("task_id", format!("eq.{task_id}")),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<TaskCalRow>>().map_err(|_| ())
}

async fn fetch_direct_cal_events(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
    ws_id: &str,
) -> Result<Vec<DirectCalRow>, ()> {
    let url = cd
        .rest_url(
            "workspace_calendar_events",
            &[
                ("select", "id,title,start_at,end_at,color".to_owned()),
                ("task_id", format!("eq.{task_id}")),
                ("ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<DirectCalRow>>().map_err(|_| ())
}

async fn verify_member(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = cd
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<MemberRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|r| r.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn svc_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

fn err(status: u16, msg: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": msg })))
}

// ============================================================================
// DURATION HELPERS
// ============================================================================

/// `round((end_ms - start_ms) / 60_000)` for ISO-8601 timestamps; 0 on error.
fn dur_mins(start: Option<&str>, end: Option<&str>) -> i64 {
    let (Some(s), Some(e)) = (start, end) else {
        return 0;
    };
    let (Some(s_ms), Some(e_ms)) = (epoch_ms(s), epoch_ms(e)) else {
        return 0;
    };
    ((e_ms - s_ms) as f64 / 60_000.0).round() as i64
}

/// Best-effort ISO-8601 / RFC-3339 -> epoch milliseconds.
fn epoch_ms(value: &str) -> Option<i64> {
    let v = value.trim();
    let b = v.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' {
        return None;
    }
    let yr: i64 = v.get(0..4)?.parse().ok()?;
    let mo: i64 = v.get(5..7)?.parse().ok()?;
    let dy: i64 = v.get(8..10)?.parse().ok()?;
    let hr: i64 = v.get(11..13)?.parse().ok()?;
    let mn: i64 = v.get(14..16)?.parse().ok()?;
    let sc: i64 = v.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&mo) || !(1..=31).contains(&dy) {
        return None;
    }
    let rest = &v[19..];
    let rb = rest.as_bytes();
    let mut idx = 0usize;
    let mut frac = 0i64;
    if rb.first() == Some(&b'.') {
        idx += 1;
        let fs = idx;
        while idx < rb.len() && rb[idx].is_ascii_digit() {
            idx += 1;
        }
        let fs_str = &rest[fs..idx];
        if !fs_str.is_empty() {
            let mut ms = String::new();
            for (i, c) in fs_str.chars().enumerate() {
                if i >= 3 {
                    break;
                }
                ms.push(c);
            }
            while ms.len() < 3 {
                ms.push('0');
            }
            frac = ms.parse::<i64>().unwrap_or(0);
        }
    }
    let mut off: i64 = 0;
    let tz = &rest[idx..];
    if !(tz == "Z" || tz == "z" || tz.is_empty())
        && let Some(sc) = tz.chars().next()
        && (sc == '+' || sc == '-')
    {
        let sign: i64 = if sc == '-' { -1 } else { 1 };
        let digs: String = tz[1..].chars().filter(|c| c.is_ascii_digit()).collect();
        if digs.len() >= 4 {
            let oh: i64 = digs[0..2].parse().unwrap_or(0);
            let om: i64 = digs[2..4].parse().unwrap_or(0);
            off = sign * (oh * 3600 + om * 60);
        } else if digs.len() >= 2 {
            off = sign * digs[0..2].parse::<i64>().unwrap_or(0) * 3600;
        }
    }
    let days = days_civil(yr, mo, dy);
    let utc = days * 86400 + hr * 3600 + mn * 60 + sc - off;
    Some(utc * 1000 + frac)
}

fn days_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn is_uuid(v: &str) -> bool {
    let v = v.trim();
    v.len() == 36
        && v.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "aaaaaaaa-0000-0000-0000-000000000000";
    const TASK: &str = "bbbbbbbb-0000-0000-0000-000000000000";

    #[test]
    fn path_matches_exact_route() {
        assert_eq!(
            path_params(&format!("/api/v1/workspaces/{WS}/tasks/{TASK}/schedule")),
            Some((WS, TASK))
        );
    }

    #[test]
    fn path_rejects_wrong_routes() {
        assert_eq!(
            path_params(&format!("/api/v1/workspaces/{WS}/tasks/{TASK}")),
            None
        );
        assert_eq!(
            path_params(&format!(
                "/api/v1/workspaces/{WS}/tasks/{TASK}/schedule/extra"
            )),
            None
        );
        assert_eq!(
            path_params(&format!("/api/v1/workspaces/{WS}/habits/{TASK}/schedule")),
            None
        );
        assert_eq!(
            path_params(&format!("/api/workspaces/{WS}/tasks/{TASK}/schedule")),
            None
        );
        assert_eq!(
            path_params(&format!("/api/v1/workspaces//tasks/{TASK}/schedule")),
            None
        );
        assert_eq!(path_params("/"), None);
        assert_eq!(path_params(""), None);
    }

    #[test]
    fn uuid_check() {
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("personal"));
        assert!(!is_uuid(""));
    }

    #[test]
    fn dur_mins_computes_correctly() {
        assert_eq!(
            dur_mins(Some("2026-06-29T10:00:00Z"), Some("2026-06-29T11:30:00Z")),
            90
        );
        assert_eq!(
            dur_mins(Some("2026-06-29T10:00:00Z"), Some("2026-06-29T10:00:00Z")),
            0
        );
        assert_eq!(dur_mins(None, Some("2026-06-29T10:00:00Z")), 0);
    }

    #[test]
    fn epoch_ms_parses_zulu() {
        // 2026-06-29T00:00:00Z = 1_782_691_200_000 ms.
        assert_eq!(epoch_ms("2026-06-29T00:00:00Z"), Some(1_782_691_200_000));
    }

    #[test]
    fn epoch_ms_parses_offset() {
        // +07:00 offset: equivalent to 2026-06-29T00:00:00Z.
        assert_eq!(
            epoch_ms("2026-06-29T07:00:00+07:00"),
            Some(1_782_691_200_000)
        );
    }

    #[test]
    fn epoch_ms_rejects_bad_input() {
        assert!(epoch_ms("not-a-date").is_none());
        assert!(epoch_ms("").is_none());
        assert!(epoch_ms("2026-06-29").is_none());
    }
}
