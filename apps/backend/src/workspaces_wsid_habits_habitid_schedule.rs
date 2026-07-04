//! Handler for `GET /api/v1/workspaces/:wsId/habits/:habitId/schedule`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habits/[habitId]/schedule/route.ts`.
//!
//! Returns scheduling status and upcoming events (next 30 days) for a habit.
//!
//! Legacy auth order (mirrored exactly):
//!
//!   1. Validate BOTH `wsId` AND `habitId` as GUIDs — `400`
//!      "Invalid workspace or habit ID".
//!   2. `isHabitsEnabled` gate via service-role read (BEFORE auth) — `404`
//!      "Not found". Since both IDs are UUID-validated at step 1, `wsId` is
//!      used directly without `normalizeWorkspaceId`.
//!   3. Resolve authenticated session user — `401` "Please sign in to view
//!      schedule".
//!   4. Verify workspace membership — `500`/`403`.
//!   5. Fetch `workspace_habits` — `404` "Habit not found".
//!
//! On success: compute 30-day occurrences, read `habit_calendar_events` and
//! `habit_skipped_occurrences`, build per-occurrence status, return
//! `{ habit, scheduling, schedule }`.
//!
//! Behavior gaps:
//!
//!   - Only GET is migrated; POST returns `None` (falls through to Next.js).
//!   - The `isHabitsEnabled` gate leaks feature availability to unauthenticated
//!     callers — kept as-is for behavioral fidelity with the legacy route.
//!   - Dates computed in UTC (mirrors Cloudflare Workers runtime behavior).
//!   - Workspace-id normalization helpers and the recurrence calendar are
//!     COPIED file-local because their private fns in sibling modules cannot be
//!     imported without editing those files, which is out of scope.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";

// ============================================================================
// ROUTE ENTRY
// ============================================================================

pub(crate) async fn handle_workspaces_wsid_habits_habitid_schedule_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, habit_id) = schedule_path_params(request.path)?;
    Some(match request.method {
        "GET" => schedule_get(config, request, raw_ws_id, habit_id, outbound).await,
        _ => return None,
    })
}

async fn schedule_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    habit_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !is_uuid(ws_id) || !is_uuid(habit_id) {
        return err(400, "Invalid workspace or habit ID");
    }

    let cd = &config.contact_data;

    // isHabitsEnabled before auth (exact legacy order).
    if !habits_enabled(cd, outbound, ws_id).await.unwrap_or(false) {
        return err(404, "Not found");
    }

    let Some(tok) = supabase_auth::request_access_token(request) else {
        return err(401, "Please sign in to view schedule");
    };
    let Some(uid) = supabase_auth::fetch_supabase_auth_user(cd, &tok, outbound)
        .await
        .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err(401, "Please sign in to view schedule");
    };

    match verify_member(cd, outbound, ws_id, &uid).await {
        Ok(true) => {}
        Ok(false) => return err(403, "You don't have access to this workspace"),
        Err(()) => return err(500, "Failed to verify workspace membership"),
    }

    let Some(habit) = fetch_habit(cd, outbound, habit_id, ws_id)
        .await
        .ok()
        .flatten()
    else {
        return err(404, "Habit not found");
    };

    let now = utc_today();
    let range_end = now.add_days(30);
    let start_str = now.to_iso();
    let end_str = range_end.to_iso();

    let upcoming = occurrences_in_range(&habit, now, range_end);
    let events = fetch_events(cd, outbound, habit_id, &start_str, &end_str)
        .await
        .unwrap_or_default();
    let skips = fetch_skips(cd, outbound, ws_id, habit_id, &start_str, &end_str)
        .await
        .unwrap_or_default();

    let sched_set: std::collections::HashSet<&str> =
        events.iter().map(|e| e.occurrence_date.as_str()).collect();
    let skip_set: std::collections::HashSet<&str> = skips
        .iter()
        .filter(|s| s.revoked_at.is_none())
        .map(|s| s.occurrence_date.as_str())
        .collect();

    let schedule: Vec<serde_json::Value> = upcoming
        .iter()
        .map(|occ| {
            let d = occ.to_iso();
            let scheduled = sched_set.contains(d.as_str());
            let skipped = skip_set.contains(d.as_str());
            let ev = events.iter().find(|e| e.occurrence_date == d);
            let completed = ev.map(|e| e.completed).unwrap_or(false);
            let status = if completed {
                "completed"
            } else if scheduled {
                "scheduled"
            } else if skipped {
                "skipped"
            } else {
                "to_be_scheduled"
            };
            let event_field: serde_json::Value = if scheduled {
                ev.map(|e| {
                    json!({
                        "id": e.cal_id,
                        "title": e.cal_title,
                        "start_at": e.cal_start_at,
                        "end_at": e.cal_end_at,
                    })
                })
                .unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::Null
            };
            json!({
                "occurrence_date": d,
                "scheduled": scheduled,
                "completed": completed,
                "skipped": skipped,
                "status": status,
                "event": event_field,
            })
        })
        .collect();

    let sched_cnt = schedule.iter().filter(|s| s["scheduled"] == true).count();
    let skip_cnt = schedule.iter().filter(|s| s["skipped"] == true).count();
    let unsched_cnt = schedule
        .iter()
        .filter(|s| s["scheduled"] != true && s["skipped"] != true)
        .count();

    no_store_response(json_response(
        200,
        json!({
            "habit": {
                "id": habit.id,
                "name": habit.name,
                "frequency": habit.frequency,
                "recurrence_interval": habit.recurrence_interval,
                "auto_schedule": habit.auto_schedule,
                "is_active": habit.is_active,
            },
            "scheduling": {
                "totalOccurrences": schedule.len(),
                "scheduledCount": sched_cnt,
                "skippedCount": skip_cnt,
                "unscheduledCount": unsched_cnt,
                "isFullyScheduled": unsched_cnt == 0,
            },
            "schedule": schedule,
        }),
    ))
}

// ============================================================================
// PATH MATCHING
// ============================================================================

/// Matches `/api/v1/workspaces/{wsId}/habits/{habitId}/schedule` (7 segments).
/// Returns `None` when the shape does not match — never panics on short paths.
fn schedule_path_params(path: &str) -> Option<(&str, &str)> {
    let segs: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    if segs.len() != 7
        || segs.first() != Some(&"api")
        || segs.get(1) != Some(&"v1")
        || segs.get(2) != Some(&"workspaces")
        || segs.get(4) != Some(&"habits")
        || segs.get(6) != Some(&"schedule")
    {
        return None;
    }
    let ws_id = *segs.get(3)?;
    let habit_id = *segs.get(5)?;
    if ws_id.is_empty() || habit_id.is_empty() {
        return None;
    }
    Some((ws_id, habit_id))
}

// ============================================================================
// DOMAIN TYPES
// ============================================================================

struct HabitData {
    id: String,
    name: serde_json::Value,
    frequency: String,
    recurrence_interval: i64,
    auto_schedule: serde_json::Value,
    is_active: serde_json::Value,
    start_date: String,
    end_date: Option<String>,
    days_of_week: Vec<i64>,
    monthly_type: Option<String>,
    day_of_month: Option<i64>,
    week_of_month: Option<i64>,
    day_of_week_monthly: Option<i64>,
}

struct EventRow {
    occurrence_date: String,
    completed: bool,
    cal_id: serde_json::Value,
    cal_title: serde_json::Value,
    cal_start_at: serde_json::Value,
    cal_end_at: serde_json::Value,
}

struct SkipRow {
    occurrence_date: String,
    revoked_at: Option<String>,
}

// ============================================================================
// SUPABASE READS
// ============================================================================

#[derive(Deserialize)]
struct HabitRow {
    id: Option<String>,
    name: Option<serde_json::Value>,
    frequency: Option<String>,
    recurrence_interval: Option<i64>,
    auto_schedule: Option<serde_json::Value>,
    is_active: Option<serde_json::Value>,
    start_date: Option<String>,
    end_date: Option<String>,
    days_of_week: Option<Vec<i64>>,
    monthly_type: Option<String>,
    day_of_month: Option<i64>,
    week_of_month: Option<i64>,
    day_of_week_monthly: Option<i64>,
}

async fn fetch_habit(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
    ws_id: &str,
) -> Result<Option<HabitData>, ()> {
    let url = cd
        .rest_url(
            "workspace_habits",
            &[
                ("select", "*".to_owned()),
                ("id", format!("eq.{habit_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("deleted_at", "is.null".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = service_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    let Some(row) = resp
        .json::<Vec<HabitRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };
    let (Some(id), Some(start_date)) = (row.id, row.start_date) else {
        return Ok(None);
    };
    Ok(Some(HabitData {
        id,
        name: row.name.unwrap_or(serde_json::Value::Null),
        frequency: row.frequency.unwrap_or_else(|| "daily".to_owned()),
        recurrence_interval: row.recurrence_interval.filter(|v| *v > 0).unwrap_or(1),
        auto_schedule: row.auto_schedule.unwrap_or(serde_json::Value::Null),
        is_active: row.is_active.unwrap_or(serde_json::Value::Null),
        start_date,
        end_date: row.end_date.filter(|v| !v.trim().is_empty()),
        days_of_week: row.days_of_week.unwrap_or_default(),
        monthly_type: row.monthly_type,
        day_of_month: row.day_of_month,
        week_of_month: row.week_of_month,
        day_of_week_monthly: row.day_of_week_monthly,
    }))
}

#[derive(Deserialize)]
struct EventRaw {
    occurrence_date: Option<String>,
    completed: Option<bool>,
    workspace_calendar_events: Option<serde_json::Value>,
}

async fn fetch_events(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Vec<EventRow>, ()> {
    let url = cd
        .rest_url(
            "habit_calendar_events",
            &[
                (
                    "select",
                    "occurrence_date,completed,workspace_calendar_events(id,title,start_at,end_at)"
                        .to_owned(),
                ),
                ("habit_id", format!("eq.{habit_id}")),
                ("occurrence_date", format!("gte.{range_start}")),
                ("occurrence_date", format!("lte.{range_end}")),
                ("order", "occurrence_date.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = service_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<EventRaw>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|raw| {
            let occurrence_date = raw.occurrence_date?;
            let cal = raw
                .workspace_calendar_events
                .as_ref()
                .and_then(|v| v.as_object());
            let get = |k: &str| -> serde_json::Value {
                cal.and_then(|m| m.get(k))
                    .cloned()
                    .unwrap_or(serde_json::Value::Null)
            };
            Some(EventRow {
                occurrence_date,
                completed: raw.completed.unwrap_or(false),
                cal_id: get("id"),
                cal_title: get("title"),
                cal_start_at: get("start_at"),
                cal_end_at: get("end_at"),
            })
        })
        .collect())
}

#[derive(Deserialize)]
struct SkipRaw {
    occurrence_date: Option<String>,
    revoked_at: Option<String>,
}

async fn fetch_skips(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    habit_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Vec<SkipRow>, ()> {
    let url = cd
        .rest_url(
            "habit_skipped_occurrences",
            &[
                ("select", "occurrence_date,revoked_at".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("habit_id", format!("eq.{habit_id}")),
                ("occurrence_date", format!("gte.{range_start}")),
                ("occurrence_date", format!("lte.{range_end}")),
                ("order", "occurrence_date.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = service_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<SkipRaw>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|r| {
            r.occurrence_date.map(|d| SkipRow {
                occurrence_date: d,
                revoked_at: r.revoked_at,
            })
        })
        .collect())
}

// ============================================================================
// WORKSPACE HELPERS (file-local copies — private in sibling modules)
// ============================================================================

#[derive(Deserialize)]
struct MemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct SecretRow {
    value: Option<String>,
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
    let resp = service_get(cd, outbound, &url).await?;
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

async fn habits_enabled(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = cd
        .rest_url(
            "workspace_secrets",
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("eq.{ENABLE_HABITS_SECRET}")),
                ("order", "created_at.desc".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = service_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<SecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.value)
        .as_deref()
        == Some("true"))
}

async fn service_get(
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
// RECURRENCE CALENDAR (port of getOccurrencesInRange / findNextOccurrence)
// ============================================================================

fn occurrences_in_range(
    h: &HabitData,
    range_start: CivilDate,
    range_end: CivilDate,
) -> Vec<CivilDate> {
    let mut out = Vec::new();
    let Some(start_date) = CivilDate::parse(&h.start_date) else {
        return out;
    };
    let end_date = h.end_date.as_deref().and_then(CivilDate::parse);
    let mut cur = if range_start < start_date {
        start_date
    } else {
        range_start
    };
    let Some(first) = next_occurrence(h, cur, true, start_date, end_date) else {
        return out;
    };
    cur = first;
    loop {
        if cur > range_end || end_date.is_some_and(|e| cur > e) {
            break;
        }
        out.push(cur);
        let Some(next) = next_occurrence(h, cur, false, start_date, end_date) else {
            break;
        };
        cur = next;
        if out.len() > 365 {
            break;
        }
    }
    out
}

fn next_occurrence(
    h: &HabitData,
    from: CivilDate,
    inclusive: bool,
    start: CivilDate,
    end: Option<CivilDate>,
) -> Option<CivilDate> {
    let mut cur = if inclusive { from } else { from.add_days(1) };
    if cur < start {
        cur = start;
    }
    if end.is_some_and(|e| cur > e) {
        return None;
    }
    if h.frequency == "yearly" {
        return next_yearly(h, start, cur, end);
    }
    let mut probe = cur;
    for _ in 0..366 {
        if matches_pattern(h, probe, start) {
            return if end.is_some_and(|e| probe > e) {
                None
            } else {
                Some(probe)
            };
        }
        probe = probe.add_days(1);
        if end.is_some_and(|e| probe > e) {
            return None;
        }
    }
    None
}

fn next_yearly(
    h: &HabitData,
    start: CivilDate,
    cur: CivilDate,
    end: Option<CivilDate>,
) -> Option<CivilDate> {
    let interval = h.recurrence_interval.max(1);
    let (tm, td) = (start.month, start.day);
    let is_feb29 = tm == 2 && td == 29;
    let mut yr = cur.year;
    if cur > CivilDate::from_ymd_clamped(yr, tm, td) {
        yr += 1;
    }
    let diff = yr - start.year;
    if diff < 0 {
        yr = start.year;
    } else if diff % interval != 0 {
        yr = start.year + ((diff + interval - 1) / interval) * interval;
    }
    for _ in 0..100 {
        if is_feb29 && !is_leap(yr) {
            yr += interval;
            continue;
        }
        if is_valid_ymd(yr, tm, td) {
            let c = CivilDate::from_ymd(yr, tm, td);
            if c >= cur {
                return if end.is_some_and(|e| c > e) {
                    None
                } else {
                    Some(c)
                };
            }
        }
        yr += interval;
    }
    None
}

fn matches_pattern(h: &HabitData, d: CivilDate, start: CivilDate) -> bool {
    let iv = h.recurrence_interval.max(1);
    match h.frequency.as_str() {
        "daily" | "custom" => {
            let diff = d.epoch_day() - start.epoch_day();
            diff >= 0 && diff % iv == 0
        }
        "weekly" => {
            let targets: Vec<i64> = if h.days_of_week.is_empty() {
                vec![start.day_of_week()]
            } else {
                h.days_of_week.clone()
            };
            let dow = d.day_of_week();
            if !targets.contains(&dow) {
                return false;
            }
            if iv == 1 {
                return true;
            }
            let wdiff = (d.start_of_week().epoch_day() - start.start_of_week().epoch_day()) / 7;
            wdiff >= 0 && wdiff % iv == 0
        }
        "monthly" => {
            let mdiff = (d.year - start.year) * 12 + (d.month - start.month);
            if mdiff < 0 || mdiff % iv != 0 {
                return false;
            }
            match h.monthly_type.as_deref() {
                Some("day_of_month") => {
                    let td = h.day_of_month.unwrap_or(start.day);
                    d.day == td.min(days_in_month(d.year, d.month))
                }
                Some("day_of_week") => {
                    let tw = h.week_of_month.unwrap_or(1);
                    let tdow = h.day_of_week_monthly.unwrap_or(start.day_of_week());
                    if d.day_of_week() != tdow {
                        return false;
                    }
                    if tw == 5 {
                        d.add_days(7).month != d.month
                    } else {
                        (d.day + 6) / 7 == tw
                    }
                }
                _ => d.day == start.day,
            }
        }
        "yearly" => {
            d.month == start.month
                && d.day == start.day
                && (d.year - start.year) >= 0
                && (d.year - start.year) % iv == 0
        }
        _ => false,
    }
}

// ============================================================================
// CIVIL DATE
// ============================================================================

#[derive(Clone, Copy, PartialEq, Eq)]
struct CivilDate {
    year: i64,
    month: i64,
    day: i64,
}

impl PartialOrd for CivilDate {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for CivilDate {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.epoch_day().cmp(&other.epoch_day())
    }
}

impl CivilDate {
    fn from_ymd(y: i64, m: i64, d: i64) -> Self {
        Self {
            year: y,
            month: m,
            day: d,
        }
    }
    fn from_ymd_clamped(y: i64, m: i64, d: i64) -> Self {
        Self {
            year: y,
            month: m,
            day: d.min(days_in_month(y, m)).max(1),
        }
    }
    fn parse(value: &str) -> Option<Self> {
        let t = value.trim();
        if t.len() < 10 || t.as_bytes()[4] != b'-' || t.as_bytes()[7] != b'-' {
            return None;
        }
        let y: i64 = t.get(0..4)?.parse().ok()?;
        let m: i64 = t.get(5..7)?.parse().ok()?;
        let d: i64 = t.get(8..10)?.parse().ok()?;
        if !(1..=12).contains(&m) || d < 1 || d > days_in_month(y, m) {
            return None;
        }
        Some(Self {
            year: y,
            month: m,
            day: d,
        })
    }
    fn to_iso(self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
    fn epoch_day(self) -> i64 {
        let y = if self.month <= 2 {
            self.year - 1
        } else {
            self.year
        };
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = y - era * 400;
        let doy =
            (153 * (if self.month > 2 {
                self.month - 3
            } else {
                self.month + 9
            }) + 2)
                / 5
                + self.day
                - 1;
        era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468
    }
    fn from_epoch_day(n: i64) -> Self {
        let z = n + 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = doy - (153 * mp + 2) / 5 + 1;
        let month = if mp < 10 { mp + 3 } else { mp - 9 };
        Self {
            year: if month <= 2 { y + 1 } else { y },
            month,
            day,
        }
    }
    fn add_days(self, d: i64) -> Self {
        Self::from_epoch_day(self.epoch_day() + d)
    }
    fn day_of_week(self) -> i64 {
        let d = (self.epoch_day() % 7 + 4) % 7;
        if d < 0 { d + 7 } else { d }
    }
    fn start_of_week(self) -> Self {
        self.add_days(-self.day_of_week())
    }
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap(y) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}
fn is_valid_ymd(y: i64, m: i64, d: i64) -> bool {
    (1..=12).contains(&m) && d >= 1 && d <= days_in_month(y, m)
}
fn utc_today() -> CivilDate {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    CivilDate::from_epoch_day(secs.div_euclid(86_400))
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
// TESTS (pure/sync helpers only)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route() {
        let ws = "aaaaaaaa-0000-0000-0000-000000000000";
        let h = "bbbbbbbb-0000-0000-0000-000000000000";
        assert_eq!(
            schedule_path_params(&format!("/api/v1/workspaces/{ws}/habits/{h}/schedule")),
            Some((ws, h))
        );
    }

    #[test]
    fn path_guard_rejects_other_routes() {
        assert_eq!(schedule_path_params("/api/v1/workspaces/ws/habits/h"), None);
        assert_eq!(
            schedule_path_params("/api/v1/workspaces/ws/habits/h/schedule/extra"),
            None
        );
        assert_eq!(
            schedule_path_params("/api/v1/workspaces/ws/habits/h/stats"),
            None
        );
        assert_eq!(
            schedule_path_params("/api/workspaces/ws/habits/h/schedule"),
            None
        );
        assert_eq!(schedule_path_params("/"), None);
        assert_eq!(schedule_path_params(""), None);
        assert_eq!(
            schedule_path_params("/api/v1/workspaces//habits/h/schedule"),
            None
        );
    }

    #[test]
    fn uuid_validation_works() {
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid(""));
        assert!(!is_uuid("personal"));
    }

    #[test]
    fn civil_date_add_days_round_trips() {
        let d = CivilDate::from_ymd(2026, 1, 15);
        assert_eq!(d.add_days(30).to_iso(), "2026-02-14");
        assert_eq!(d.add_days(0).to_iso(), "2026-01-15");
        assert_eq!(d.add_days(-1).to_iso(), "2026-01-14");
    }

    #[test]
    fn daily_occurrences_30_days() {
        let h = HabitData {
            id: "h".into(),
            name: serde_json::Value::Null,
            frequency: "daily".into(),
            recurrence_interval: 1,
            auto_schedule: serde_json::Value::Null,
            is_active: serde_json::Value::Null,
            start_date: "2026-01-01".into(),
            end_date: None,
            days_of_week: vec![],
            monthly_type: None,
            day_of_month: None,
            week_of_month: None,
            day_of_week_monthly: None,
        };
        let start = CivilDate::from_ymd(2026, 6, 1);
        let end = CivilDate::from_ymd(2026, 6, 30);
        assert_eq!(occurrences_in_range(&h, start, end).len(), 30);
    }

    #[test]
    fn weekly_monday_occurrences_in_june_2026() {
        // 2026-01-05 is a Monday (day_of_week = 1).
        let h = HabitData {
            id: "h".into(),
            name: serde_json::Value::Null,
            frequency: "weekly".into(),
            recurrence_interval: 1,
            auto_schedule: serde_json::Value::Null,
            is_active: serde_json::Value::Null,
            start_date: "2026-01-05".into(),
            end_date: None,
            days_of_week: vec![1],
            monthly_type: None,
            day_of_month: None,
            week_of_month: None,
            day_of_week_monthly: None,
        };
        // June 2026 Mondays: 1, 8, 15, 22, 29 => 5 occurrences.
        let start = CivilDate::from_ymd(2026, 6, 1);
        let end = CivilDate::from_ymd(2026, 6, 30);
        assert_eq!(occurrences_in_range(&h, start, end).len(), 5);
    }
}
