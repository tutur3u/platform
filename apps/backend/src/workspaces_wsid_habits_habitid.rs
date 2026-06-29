//! Handler for `GET /api/v1/workspaces/:wsId/habits/:habitId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habits/[habitId]/route.ts`.
//!
//! GET returns a single habit together with its scheduled calendar events and a
//! computed streak. The legacy auth model is:
//!   1. validate `habitId` is a GUID (else `400` "Invalid habit ID");
//!   2. resolve the authenticated session user (else `401` "Please sign in to
//!      view habits");
//!   3. normalize the workspace id (`personal`/`internal`/handle aliases);
//!   4. verify workspace membership (`MEMBER`), returning `500` "Failed to
//!      verify workspace membership" on lookup failure and `403` "You don't
//!      have access to this workspace" when not a member;
//!   5. gate on the `ENABLE_HABITS` workspace secret (else `404` "Not found",
//!      mirroring `habitsNotFoundResponse`);
//!   6. read `workspace_habits` (id + ws_id, deleted_at is null) with the admin
//!      (service-role) client; missing -> `404` "Habit not found".
//!
//! On success it reads `habit_calendar_events` (embedding
//! `workspace_calendar_events`) ordered by `occurrence_date` asc, computes the
//! streak from `habit_completions` (mirroring `fetchHabitStreak` ->
//! `calculateHabitStreak`), and returns `{ habit, events, streak }`.
//!
//! Behavior gaps / notes:
//!   * Only GET is migrated. PUT/DELETE (and any other method) return `None` so
//!     the worker falls through to the still-live Next.js route.
//!   * Like the legacy route, the events read and the completions read are
//!     best-effort: a failure surfaces as an empty list (`?? []` / `|| []`),
//!     not an error.
//!   * `normalizeWorkspaceId` failure surfaces as `500` "Failed to verify
//!     workspace membership" (matching the sibling habits handlers' reading of
//!     the legacy flow rather than the bare try/catch `Internal server error`).
//!   * The recurrence calendar + streak math is reimplemented locally (the web
//!     app uses `@tuturuuu/ai/scheduling`'s `getOccurrencesInRange` and the
//!     `calculateHabitStreak` helper); dates are computed in UTC, mirroring the
//!     server's `new Date()` / `toISOString()` reliance.
//!   * The workspace-id normalization, membership verification, and
//!     habits-enabled checks are COPIED from `workspace_habits_access.rs` /
//!     `workspaces_habits_habitid_stats.rs` because those fns are private and
//!     editing those modules is out of scope for this port.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// ============================================================================
// ROUTE ENTRY
// ============================================================================

pub(crate) async fn handle_workspaces_wsid_habits_habitid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, habit_id) = habit_path_params(request.path)?;

    Some(match request.method {
        "GET" => habit_get_response(config, request, raw_ws_id, habit_id, outbound).await,
        // PUT/DELETE (and any other method) are still served by the live Next.js
        // route, so fall through instead of returning a 405.
        _ => return None,
    })
}

async fn habit_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    habit_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // z.guid() validation -> 400 "Invalid habit ID".
    if !is_uuid(habit_id) {
        return error_response(400, "Invalid habit ID");
    }

    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Please sign in to view habits");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Please sign in to view habits");
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // Legacy: normalizeWorkspaceId failure surfaces as membership lookup failure.
            Err(()) => return error_response(500, "Failed to verify workspace membership"),
        };

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "You don't have access to this workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace membership"),
    }

    // isHabitsEnabled gate (returns the same 404 the legacy habitsNotFoundResponse uses).
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return error_response(404, "Not found");
    }

    // Fetch the habit (full row preserved verbatim for the response).
    let habit_value = match fetch_habit(contact_data, outbound, habit_id, &resolved_ws_id).await {
        Ok(Some(value)) => value,
        Ok(None) | Err(()) => return error_response(404, "Habit not found"),
    };

    // Scheduled events — best-effort (legacy ignores read errors via `?? []`).
    let events = fetch_habit_events(contact_data, outbound, habit_id)
        .await
        .unwrap_or_default();

    // Streak — best-effort completions read (legacy `fetchHabitStreak` uses `|| []`).
    let completions = fetch_all_completions(contact_data, outbound, habit_id)
        .await
        .unwrap_or_default();
    let habit_recurrence = habit_recurrence_from_value(&habit_value);
    let streak = calculate_habit_streak(&habit_recurrence, &completions);

    let body = json!({
        "habit": habit_value,
        "events": events,
        "streak": {
            "current_streak": streak.current_streak,
            "best_streak": streak.best_streak,
            "total_completions": streak.total_completions,
            "completion_rate": streak.completion_rate,
            "last_completed_at": streak.last_completed_at,
        },
    });

    no_store_response(json_response(200, body))
}

// ============================================================================
// PATH MATCHING
// ============================================================================

/// Matches `/api/v1/workspaces/{wsId}/habits/{habitId}` and extracts the two
/// dynamic segments. Returns `None` (so other handlers / Next.js still run)
/// whenever the shape does not match — never panics on short paths.
fn habit_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() != 6 {
        return None;
    }
    if segments.first() != Some(&"api")
        || segments.get(1) != Some(&"v1")
        || segments.get(2) != Some(&"workspaces")
        || segments.get(4) != Some(&"habits")
    {
        return None;
    }

    let ws_id = *segments.get(3)?;
    let habit_id = *segments.get(5)?;
    if ws_id.is_empty() || habit_id.is_empty() {
        return None;
    }

    Some((ws_id, habit_id))
}

// ============================================================================
// SUPABASE READS (habit + events + completions, service-role / admin client)
// ============================================================================

async fn fetch_habit(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
    ws_id: &str,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_habits",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{habit_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("deleted_at", "is.null".to_owned()),
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
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_habit_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "habit_calendar_events",
        &[
            (
                "select",
                "id,occurrence_date,completed,workspace_calendar_events(id,title,start_at,end_at,color)"
                    .to_owned(),
            ),
            ("habit_id", format!("eq.{habit_id}")),
            ("order", "occurrence_date.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .iter()
        .map(map_event)
        .collect())
}

/// Mirrors the legacy event projection. When the embedded
/// `workspace_calendar_events` is present, its `id/title/start_at/end_at/color`
/// are surfaced (null preserved); when it is null, those keys are omitted
/// (matching JS `e.workspace_calendar_events?.field === undefined`).
fn map_event(event: &Value) -> Value {
    let occurrence_date = event.get("occurrence_date");
    let completed = event.get("completed");

    match event.get("workspace_calendar_events").filter(|v| v.is_object()) {
        Some(calendar_event) => json!({
            "id": calendar_event.get("id"),
            "title": calendar_event.get("title"),
            "start_at": calendar_event.get("start_at"),
            "end_at": calendar_event.get("end_at"),
            "color": calendar_event.get("color"),
            "occurrence_date": occurrence_date,
            "completed": completed,
        }),
        None => json!({
            "occurrence_date": occurrence_date,
            "completed": completed,
        }),
    }
}

#[derive(Deserialize)]
struct CompletionRow {
    occurrence_date: Option<String>,
    completed_at: Option<String>,
}

struct Completion {
    occurrence_date: String,
    completed_at: Option<String>,
}

async fn fetch_all_completions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
) -> Result<Vec<Completion>, ()> {
    let Some(url) = contact_data.rest_url(
        "habit_completions",
        &[
            ("select", "occurrence_date,completed_at".to_owned()),
            ("habit_id", format!("eq.{habit_id}")),
            ("order", "occurrence_date.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CompletionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| {
            row.occurrence_date.map(|occurrence_date| Completion {
                occurrence_date,
                completed_at: row.completed_at,
            })
        })
        .collect())
}

// ============================================================================
// HABIT RECURRENCE (extracted from the full habit row for streak math)
// ============================================================================

/// Normalized habit recurrence inputs used by the calendar/streak logic.
struct Habit {
    start_date: String,
    end_date: Option<String>,
    frequency: String,
    recurrence_interval: i64,
    days_of_week: Vec<i64>,
    monthly_type: Option<String>,
    day_of_month: Option<i64>,
    week_of_month: Option<i64>,
    day_of_week_monthly: Option<i64>,
}

fn habit_recurrence_from_value(value: &Value) -> Habit {
    let str_field = |key: &str| -> Option<String> {
        value
            .get(key)
            .and_then(Value::as_str)
            .map(|s| s.to_owned())
    };
    let i64_field = |key: &str| -> Option<i64> { value.get(key).and_then(Value::as_i64) };

    Habit {
        start_date: str_field("start_date").unwrap_or_default(),
        end_date: str_field("end_date").filter(|value| !value.trim().is_empty()),
        frequency: str_field("frequency").unwrap_or_else(|| "daily".to_owned()),
        // Legacy never normalizes a missing interval (the column is NOT NULL in
        // practice). Default to 1 to keep modulo math well-defined.
        recurrence_interval: i64_field("recurrence_interval")
            .filter(|value| *value > 0)
            .unwrap_or(1),
        days_of_week: value
            .get("days_of_week")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(Value::as_i64).collect())
            .unwrap_or_default(),
        monthly_type: str_field("monthly_type"),
        day_of_month: i64_field("day_of_month"),
        week_of_month: i64_field("week_of_month"),
        day_of_week_monthly: i64_field("day_of_week_monthly"),
    }
}

// ============================================================================
// STREAK COMPUTATION (port of calculateHabitStreak / fetchHabitStreak)
// ============================================================================

struct HabitStreak {
    current_streak: i64,
    best_streak: i64,
    total_completions: i64,
    completion_rate: i64,
    last_completed_at: Option<String>,
}

/// Port of `calculateHabitStreak`. `completions` are the full set of completions
/// (occurrence_date desc), matching `fetchHabitStreak`.
fn calculate_habit_streak(habit: &Habit, completions: &[Completion]) -> HabitStreak {
    if completions.is_empty() {
        return HabitStreak {
            current_streak: 0,
            best_streak: 0,
            total_completions: 0,
            completion_rate: 0,
            last_completed_at: None,
        };
    }

    let mut sorted: Vec<&Completion> = completions.iter().collect();
    sorted.sort_by(|a, b| b.occurrence_date.cmp(&a.occurrence_date));

    let mut completed_dates: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for completion in &sorted {
        completed_dates.insert(completion.occurrence_date.as_str());
    }

    let mut current_streak: i64 = 0;
    let mut best_streak: i64 = 0;
    let mut temp_streak: i64 = 0;

    let today = current_utc_date();
    let Some(start_date) = CivilDate::parse_date_prefix(&habit.start_date) else {
        return HabitStreak {
            current_streak: 0,
            best_streak: 0,
            total_completions: completions.len() as i64,
            completion_rate: 0,
            last_completed_at: sorted.first().and_then(|c| c.completed_at.clone()),
        };
    };
    let occurrences = get_occurrences_in_range(habit, start_date, today);
    let last_index = occurrences.len().saturating_sub(1);

    for i in (0..occurrences.len()).rev() {
        let date_str = occurrences[i].to_iso_date();
        if completed_dates.contains(date_str.as_str()) {
            temp_streak += 1;
            if i == last_index {
                current_streak = temp_streak;
            }
        } else {
            if temp_streak > best_streak {
                best_streak = temp_streak;
            }
            temp_streak = 0;
            if current_streak == 0 && i == last_index {
                current_streak = 0;
            }
        }
    }

    if temp_streak > best_streak {
        best_streak = temp_streak;
    }
    if current_streak < temp_streak {
        current_streak = temp_streak;
    }

    let total_occurrences = occurrences.len() as i64;
    let completion_rate = if total_occurrences > 0 {
        round_half_away((completions.len() as f64 / total_occurrences as f64) * 100.0)
    } else {
        0
    };

    HabitStreak {
        current_streak,
        best_streak: best_streak.max(current_streak),
        total_completions: completions.len() as i64,
        completion_rate,
        last_completed_at: sorted.first().and_then(|c| c.completed_at.clone()),
    }
}

// ============================================================================
// RECURRENCE CALENDAR (port of getOccurrencesInRange, UTC / no-timezone path)
// ============================================================================

fn get_occurrences_in_range(
    habit: &Habit,
    range_start: CivilDate,
    range_end: CivilDate,
) -> Vec<CivilDate> {
    let mut occurrences = Vec::new();

    let Some(start_date) = CivilDate::parse_date_prefix(&habit.start_date) else {
        return occurrences;
    };
    let end_date = habit
        .end_date
        .as_deref()
        .and_then(CivilDate::parse_date_prefix);

    let mut current = range_start;
    if current < start_date {
        current = start_date;
    }

    let Some(first) = find_next_occurrence(habit, current, true, start_date, end_date) else {
        return occurrences;
    };

    let mut current_occurrence = first;
    loop {
        if current_occurrence > range_end {
            break;
        }
        if let Some(end) = end_date
            && current_occurrence > end
        {
            break;
        }

        occurrences.push(current_occurrence);

        let Some(next) =
            find_next_occurrence(habit, current_occurrence, false, start_date, end_date)
        else {
            break;
        };
        current_occurrence = next;

        if occurrences.len() > 365 {
            break;
        }
    }

    occurrences
}

fn find_next_occurrence(
    habit: &Habit,
    from_date: CivilDate,
    inclusive: bool,
    start_date: CivilDate,
    end_date: Option<CivilDate>,
) -> Option<CivilDate> {
    let mut current = from_date;

    if !inclusive {
        current = current.add_days(1);
    }
    if current < start_date {
        current = start_date;
    }
    if let Some(end) = end_date
        && current > end
    {
        return None;
    }

    if habit.frequency == "yearly" {
        return find_next_yearly_occurrence(habit, start_date, current, end_date);
    }

    let mut probe = current;
    for _ in 0..366 {
        if matches_recurrence_pattern(habit, probe, start_date) {
            if let Some(end) = end_date
                && probe > end
            {
                return None;
            }
            return Some(probe);
        }
        probe = probe.add_days(1);
        if let Some(end) = end_date
            && probe > end
        {
            return None;
        }
    }

    None
}

fn find_next_yearly_occurrence(
    habit: &Habit,
    start_date: CivilDate,
    current: CivilDate,
    end_date: Option<CivilDate>,
) -> Option<CivilDate> {
    let interval = habit.recurrence_interval.max(1);
    let target_month = start_date.month;
    let target_day = start_date.day;
    let is_leap_year_date = target_month == 2 && target_day == 29;

    let mut candidate_year = current.year;

    let this_year_target = CivilDate::from_ymd_clamped(candidate_year, target_month, target_day);
    if current > this_year_target {
        candidate_year += 1;
    }

    let start_year = start_date.year;
    let years_diff = candidate_year - start_year;
    if years_diff < 0 {
        candidate_year = start_year;
    } else if years_diff % interval != 0 {
        let steps = (years_diff + interval - 1) / interval;
        candidate_year = start_year + steps * interval;
    }

    for _ in 0..100 {
        if is_leap_year_date && !is_leap_year(candidate_year) {
            candidate_year += interval;
            continue;
        }

        if is_valid_ymd(candidate_year, target_month, target_day) {
            let candidate = CivilDate::from_ymd(candidate_year, target_month, target_day);
            if candidate >= current {
                if let Some(end) = end_date
                    && candidate > end
                {
                    return None;
                }
                return Some(candidate);
            }
        }

        candidate_year += interval;
    }

    None
}

fn matches_recurrence_pattern(habit: &Habit, date: CivilDate, start_date: CivilDate) -> bool {
    let interval = habit.recurrence_interval.max(1);
    match habit.frequency.as_str() {
        "daily" => matches_daily_pattern(start_date, date, interval),
        "weekly" => matches_weekly_pattern(habit, start_date, date, interval),
        "monthly" => matches_monthly_pattern(habit, start_date, date, interval),
        "yearly" => matches_yearly_pattern(start_date, date, interval),
        "custom" => matches_daily_pattern(start_date, date, interval),
        _ => false,
    }
}

fn matches_daily_pattern(start_date: CivilDate, date: CivilDate, interval: i64) -> bool {
    let days_diff = date.epoch_day() - start_date.epoch_day();
    days_diff >= 0 && days_diff % interval == 0
}

fn matches_weekly_pattern(
    habit: &Habit,
    start_date: CivilDate,
    date: CivilDate,
    interval: i64,
) -> bool {
    let target_days: Vec<i64> = if !habit.days_of_week.is_empty() {
        habit.days_of_week.clone()
    } else {
        vec![start_date.day_of_week()]
    };

    let day_of_week = date.day_of_week();
    if !target_days.contains(&day_of_week) {
        return false;
    }

    if interval == 1 {
        return true;
    }

    let start_week = start_date.start_of_week();
    let date_week = date.start_of_week();
    let weeks_diff = (date_week.epoch_day() - start_week.epoch_day()) / 7;

    weeks_diff >= 0 && weeks_diff % interval == 0
}

fn matches_monthly_pattern(
    habit: &Habit,
    start_date: CivilDate,
    date: CivilDate,
    interval: i64,
) -> bool {
    let months_diff = (date.year - start_date.year) * 12 + (date.month - start_date.month);
    if months_diff < 0 || months_diff % interval != 0 {
        return false;
    }

    match habit.monthly_type.as_deref() {
        Some("day_of_month") => {
            let target_day = habit.day_of_month.unwrap_or(start_date.day);
            matches_day_of_month(date, target_day)
        }
        Some("day_of_week") => {
            let target_week = habit.week_of_month.unwrap_or(1);
            let target_day_of_week = habit
                .day_of_week_monthly
                .unwrap_or(start_date.day_of_week());
            matches_nth_weekday(date, target_week, target_day_of_week)
        }
        _ => date.day == start_date.day,
    }
}

fn matches_yearly_pattern(start_date: CivilDate, date: CivilDate, interval: i64) -> bool {
    if date.month != start_date.month || date.day != start_date.day {
        return false;
    }
    let years_diff = date.year - start_date.year;
    years_diff >= 0 && years_diff % interval == 0
}

fn matches_day_of_month(date: CivilDate, target_day: i64) -> bool {
    let last_day = days_in_month(date.year, date.month);
    let actual_target_day = target_day.min(last_day);
    date.day == actual_target_day
}

fn matches_nth_weekday(date: CivilDate, week: i64, day_of_week: i64) -> bool {
    if date.day_of_week() != day_of_week {
        return false;
    }

    if week == 5 {
        return date.add_days(7).month != date.month;
    }

    let week_of_month = (date.day + 6) / 7;
    week_of_month == week
}

// ============================================================================
// CIVIL DATE (proleptic Gregorian, no external date crate)
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
    fn from_ymd(year: i64, month: i64, day: i64) -> Self {
        Self { year, month, day }
    }

    fn from_ymd_clamped(year: i64, month: i64, day: i64) -> Self {
        let last = days_in_month(year, month);
        Self {
            year,
            month,
            day: day.min(last).max(1),
        }
    }

    fn parse_date_prefix(value: &str) -> Option<Self> {
        let trimmed = value.trim();
        if trimmed.len() < 10 {
            return None;
        }
        let bytes = trimmed.as_bytes();
        if bytes[4] != b'-' || bytes[7] != b'-' {
            return None;
        }
        let year: i64 = trimmed.get(0..4)?.parse().ok()?;
        let month: i64 = trimmed.get(5..7)?.parse().ok()?;
        let day: i64 = trimmed.get(8..10)?.parse().ok()?;
        if !(1..=12).contains(&month) {
            return None;
        }
        if day < 1 || day > days_in_month(year, month) {
            return None;
        }
        Some(Self { year, month, day })
    }

    fn to_iso_date(self) -> String {
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
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe - 719468
    }

    fn from_epoch_day(epoch_day: i64) -> Self {
        let z = epoch_day + 719468;
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

    fn add_days(self, delta: i64) -> Self {
        Self::from_epoch_day(self.epoch_day() + delta)
    }

    fn day_of_week(self) -> i64 {
        let dow = (self.epoch_day() % 7 + 4) % 7;
        if dow < 0 { dow + 7 } else { dow }
    }

    fn start_of_week(self) -> Self {
        self.add_days(-self.day_of_week())
    }
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i64, month: i64) -> i64 {
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

fn is_valid_ymd(year: i64, month: i64, day: i64) -> bool {
    (1..=12).contains(&month) && day >= 1 && day <= days_in_month(year, month)
}

fn current_utc_date() -> CivilDate {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    CivilDate::from_epoch_day(secs.div_euclid(86_400))
}

/// JavaScript `Math.round`: round half away from zero (values here are >= 0).
fn round_half_away(value: f64) -> i64 {
    (value + 0.5).floor() as i64
}

fn is_uuid(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

// ============================================================================
// WORKSPACE ACCESS HELPERS
//
// COPIED (file-local) from `workspace_habits_access.rs` because those fns are
// private there and editing that file is out of scope for this port.
// ============================================================================

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
    is_uuid(value)
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

// ============================================================================
// TESTS (pure/sync helpers only)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route() {
        assert_eq!(
            habit_path_params("/api/v1/workspaces/ws-123/habits/habit-9"),
            Some(("ws-123", "habit-9"))
        );
    }

    #[test]
    fn path_guard_rejects_other_routes() {
        // Trailing segment (e.g. the /stats sub-route) must not match.
        assert_eq!(
            habit_path_params("/api/v1/workspaces/ws/habits/h/stats"),
            None
        );
        // The collection route (no habitId) must not match.
        assert_eq!(habit_path_params("/api/v1/workspaces/ws/habits"), None);
        // Empty dynamic segments collapse and are rejected.
        assert_eq!(habit_path_params("/api/v1/workspaces//habits/h"), None);
        assert_eq!(habit_path_params("/api/v1/workspaces/ws/habits/"), None);
        // Wrong prefix / missing version.
        assert_eq!(habit_path_params("/api/workspaces/ws/habits/h"), None);
        assert_eq!(habit_path_params("/api/v1/workspace/ws/habits/h"), None);
        // Short path must not panic and must return None.
        assert_eq!(habit_path_params("/api/v1"), None);
        assert_eq!(habit_path_params("/"), None);
        assert_eq!(habit_path_params(""), None);
    }

    #[test]
    fn uuid_validation_matches_legacy_shape() {
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_uuid("a1b2c3d4-e5f6-7890-abcd-ef0123456789"));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("12345"));
        assert!(!is_uuid(""));
    }

    #[test]
    fn map_event_includes_calendar_fields_when_present() {
        let event = json!({
            "id": "link-1",
            "occurrence_date": "2026-01-02",
            "completed": true,
            "workspace_calendar_events": {
                "id": "evt-1",
                "title": "Morning run",
                "start_at": "2026-01-02T06:00:00Z",
                "end_at": "2026-01-02T06:30:00Z",
                "color": "BLUE"
            }
        });

        let mapped = map_event(&event);
        assert_eq!(mapped["id"], json!("evt-1"));
        assert_eq!(mapped["title"], json!("Morning run"));
        assert_eq!(mapped["start_at"], json!("2026-01-02T06:00:00Z"));
        assert_eq!(mapped["end_at"], json!("2026-01-02T06:30:00Z"));
        assert_eq!(mapped["color"], json!("BLUE"));
        assert_eq!(mapped["occurrence_date"], json!("2026-01-02"));
        assert_eq!(mapped["completed"], json!(true));
    }

    #[test]
    fn map_event_omits_calendar_fields_when_embedded_null() {
        let event = json!({
            "id": "link-2",
            "occurrence_date": "2026-01-03",
            "completed": false,
            "workspace_calendar_events": null
        });

        let mapped = map_event(&event);
        assert_eq!(mapped["occurrence_date"], json!("2026-01-03"));
        assert_eq!(mapped["completed"], json!(false));
        // Calendar-derived keys are omitted entirely (matches JS optional chaining).
        let object = mapped.as_object().unwrap();
        assert!(!object.contains_key("id"));
        assert!(!object.contains_key("title"));
        assert!(!object.contains_key("start_at"));
        assert!(!object.contains_key("color"));
    }

    #[test]
    fn streak_is_zero_for_no_completions() {
        let habit = Habit {
            start_date: "2026-01-01".to_owned(),
            end_date: None,
            frequency: "daily".to_owned(),
            recurrence_interval: 1,
            days_of_week: vec![],
            monthly_type: None,
            day_of_month: None,
            week_of_month: None,
            day_of_week_monthly: None,
        };
        let streak = calculate_habit_streak(&habit, &[]);
        assert_eq!(streak.current_streak, 0);
        assert_eq!(streak.best_streak, 0);
        assert_eq!(streak.total_completions, 0);
        assert_eq!(streak.completion_rate, 0);
        assert_eq!(streak.last_completed_at, None);
    }

    #[test]
    fn habit_recurrence_from_value_applies_defaults() {
        let value = json!({
            "id": "abc",
            "start_date": "2026-02-01",
            "frequency": "weekly",
            "days_of_week": [1, 3, 5],
            "recurrence_interval": 2
        });
        let habit = habit_recurrence_from_value(&value);
        assert_eq!(habit.start_date, "2026-02-01");
        assert_eq!(habit.frequency, "weekly");
        assert_eq!(habit.recurrence_interval, 2);
        assert_eq!(habit.days_of_week, vec![1, 3, 5]);
        assert_eq!(habit.end_date, None);

        // Missing fields fall back to legacy-safe defaults.
        let empty = habit_recurrence_from_value(&json!({}));
        assert_eq!(empty.frequency, "daily");
        assert_eq!(empty.recurrence_interval, 1);
        assert!(empty.days_of_week.is_empty());
    }

    #[test]
    fn round_half_away_matches_js_math_round() {
        assert_eq!(round_half_away(0.0), 0);
        assert_eq!(round_half_away(49.5), 50);
        assert_eq!(round_half_away(50.4), 50);
        assert_eq!(round_half_away(99.5), 100);
    }
}
