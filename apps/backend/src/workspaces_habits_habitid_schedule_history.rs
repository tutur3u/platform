//! Handler for
//! `GET /api/v1/workspaces/:wsId/habits/:habitId/schedule/history`.
//!
//! Ports
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habits/[habitId]/schedule/history/route.ts`.
//!
//! Returns the per-occurrence schedule history of a habit within a date range
//! (default: today-30d .. today+30d). For every recurrence occurrence in the
//! range it derives a status of `completed | scheduled | skipped |
//! to_be_scheduled`, plus the linked calendar event (when any) and the active
//! skip's `revoked_at`. It also returns aggregate counts.
//!
//! The recurrence calendar (`getOccurrencesInRange` and friends from
//! `@tuturuuu/ai/scheduling`) is reimplemented locally. Dates are computed in
//! UTC, mirroring the legacy route's reliance on `new Date()` / `toISOString()`
//! running on the (UTC) server.
//!
//! IMPORTANT: this module is fully self-contained per the porting constraints.
//! The workspace-id normalization, membership verification, habits-enabled
//! checks, REST request senders, and the recurrence calendar are COPIED
//! (file-local) from `workspace_habits_access.rs` /
//! `workspaces_habits_habitid_stats.rs` because their original fns are private
//! there and editing those files is out of scope for this port.

use serde::Deserialize;
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

// ============================================================================
// ROUTE ENTRY
// ============================================================================

pub(crate) async fn handle_workspaces_habits_habitid_schedule_history_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, habit_id) = schedule_history_path_params(request.path)?;

    Some(match request.method {
        "GET" => schedule_history_response(config, request, raw_ws_id, habit_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn schedule_history_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    habit_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !is_uuid(habit_id) {
        return error_response(400, "Invalid habit ID");
    }

    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // Legacy: normalizeWorkspaceId failure surfaces as membership lookup failure.
            Err(()) => return error_response(500, "Failed to verify workspace membership"),
        };

    // isHabitsEnabled gate -> habitsNotFoundResponse (404).
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return error_response(404, "Not found");
    }

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "Forbidden"),
        Err(()) => return error_response(500, "Failed to verify workspace membership"),
    }

    let habit = match fetch_habit(contact_data, outbound, habit_id, &resolved_ws_id).await {
        Ok(Some(habit)) => habit,
        Ok(None) => return error_response(404, "Habit not found"),
        Err(()) => return error_response(404, "Habit not found"),
    };

    // ------------------------------------------------------------------
    // Query parsing: start/end are optional `YYYY-MM-DD` dates.
    // ------------------------------------------------------------------
    let url = request.url.and_then(|url| url::Url::parse(url).ok());
    let raw_start = optional_query_value(url.as_ref(), "start");
    let raw_end = optional_query_value(url.as_ref(), "end");

    if let Some(value) = raw_start.as_deref()
        && !is_iso_date(value)
    {
        return invalid_query_response();
    }
    if let Some(value) = raw_end.as_deref()
        && !is_iso_date(value)
    {
        return invalid_query_response();
    }

    // Range dates. The legacy code builds Date objects from the params (or now
    // +/- 30 days), then uses `.toISOString().split('T')[0]` for every consumer
    // (both the occurrence calculation and the Supabase occurrence_date filters).
    // Because start is parsed at T00:00:00Z and end at T23:59:59.999Z, the date
    // portion is simply the provided string; defaults are today -/+ 30 days.
    let today = current_utc_date();
    let range_start = match raw_start.as_deref() {
        Some(value) => match CivilDate::parse_date_prefix(value) {
            Some(date) => date,
            None => return invalid_query_response(),
        },
        None => today.add_days(-30),
    };
    let range_end = match raw_end.as_deref() {
        Some(value) => match CivilDate::parse_date_prefix(value) {
            Some(date) => date,
            None => return invalid_query_response(),
        },
        None => today.add_days(30),
    };

    let range_start_str = range_start.to_iso_date();
    let range_end_str = range_end.to_iso_date();

    // ------------------------------------------------------------------
    // Parallel-in-spirit reads (sequential here): scheduled events,
    // completions, and skip history.
    // ------------------------------------------------------------------
    let scheduled_events = match fetch_scheduled_events(
        contact_data,
        outbound,
        habit_id,
        &range_start_str,
        &range_end_str,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, "Internal server error"),
    };

    let completions = match fetch_completions(
        contact_data,
        outbound,
        habit_id,
        &range_start_str,
        &range_end_str,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, "Internal server error"),
    };

    let skips = match fetch_skip_history(
        contact_data,
        outbound,
        &resolved_ws_id,
        habit_id,
        &range_start_str,
        &range_end_str,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, "Internal server error"),
    };

    let occurrences = get_occurrences_in_range(&habit, range_start, range_end);

    // Build per-date lookup maps. The legacy `new Map(...)` keeps the LAST entry
    // for a duplicate key; emulate that by inserting in iteration order so later
    // rows overwrite earlier ones.
    let mut scheduled_by_date: std::collections::HashMap<&str, &ScheduledEvent> =
        std::collections::HashMap::new();
    for entry in &scheduled_events {
        scheduled_by_date.insert(entry.occurrence_date.as_str(), entry);
    }
    let mut completions_by_date: std::collections::HashMap<&str, &Completion> =
        std::collections::HashMap::new();
    for entry in &completions {
        completions_by_date.insert(entry.occurrence_date.as_str(), entry);
    }
    // Active skips only (revoked_at is null), keyed by occurrence_date.
    let mut active_skips_by_date: std::collections::HashMap<&str, &Skip> =
        std::collections::HashMap::new();
    for skip in skips.iter().filter(|skip| skip.revoked_at.is_none()) {
        active_skips_by_date.insert(skip.occurrence_date.as_str(), skip);
    }

    let mut scheduled_count = 0_usize;
    let mut completed_count = 0_usize;
    let mut skipped_count = 0_usize;
    let mut to_be_scheduled_count = 0_usize;

    let entries: Vec<serde_json::Value> = occurrences
        .iter()
        .map(|occurrence| {
            let occurrence_date = occurrence.to_iso_date();
            let scheduled = scheduled_by_date.get(occurrence_date.as_str()).copied();
            let completed = completions_by_date.get(occurrence_date.as_str()).copied();
            let skipped = active_skips_by_date.get(occurrence_date.as_str()).copied();
            let linked_event = scheduled.and_then(|entry| entry.event.as_ref());

            let status = if completed.is_some() {
                "completed"
            } else if scheduled.is_some() {
                "scheduled"
            } else if skipped.is_some() {
                "skipped"
            } else {
                "to_be_scheduled"
            };

            match status {
                "completed" => completed_count += 1,
                "scheduled" => scheduled_count += 1,
                "skipped" => skipped_count += 1,
                _ => to_be_scheduled_count += 1,
            }

            // event_id: linkedEvent?.id ?? completed?.event_id ?? null
            let event_id = linked_event
                .and_then(|event| event.id.clone())
                .or_else(|| completed.and_then(|c| c.event_id.clone()));
            let start_at = linked_event.and_then(|event| event.start_at.clone());
            let end_at = linked_event.and_then(|event| event.end_at.clone());
            let revoked_at = skipped.and_then(|skip| skip.revoked_at.clone());

            json!({
                "occurrence_date": occurrence_date,
                "status": status,
                "event_id": event_id,
                "start_at": start_at,
                "end_at": end_at,
                "canRevoke": status == "skipped",
                "revoked_at": revoked_at,
            })
        })
        .collect();

    let body = json!({
        "entries": entries,
        "summary": {
            "scheduledCount": scheduled_count,
            "completedCount": completed_count,
            "skippedCount": skipped_count,
            "toBeScheduledCount": to_be_scheduled_count,
        },
    });

    no_store_response(json_response(200, body))
}

// ============================================================================
// PATH MATCHING
// ============================================================================

/// Matches `/api/v1/workspaces/{wsId}/habits/{habitId}/schedule/history` and
/// extracts the two dynamic segments. Returns `None` when the shape mismatches.
fn schedule_history_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "habits"
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

// ============================================================================
// SUPABASE READS
// ============================================================================

#[derive(Deserialize)]
struct HabitRow {
    id: Option<String>,
    name: Option<String>,
    frequency: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    recurrence_interval: Option<i64>,
    days_of_week: Option<Vec<i64>>,
    monthly_type: Option<String>,
    day_of_month: Option<i64>,
    week_of_month: Option<i64>,
    day_of_week_monthly: Option<i64>,
}

/// Normalized habit recurrence inputs used by the calendar logic.
struct Habit {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    name: String,
    frequency: String,
    start_date: String,
    end_date: Option<String>,
    recurrence_interval: i64,
    days_of_week: Vec<i64>,
    monthly_type: Option<String>,
    day_of_month: Option<i64>,
    week_of_month: Option<i64>,
    day_of_week_monthly: Option<i64>,
}

async fn fetch_habit(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
    ws_id: &str,
) -> Result<Option<Habit>, ()> {
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

    let Some(row) = response
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

    Ok(Some(Habit {
        id,
        name: row.name.unwrap_or_default(),
        frequency: row.frequency.unwrap_or_else(|| "daily".to_owned()),
        start_date,
        end_date: row.end_date.filter(|value| !value.trim().is_empty()),
        recurrence_interval: row
            .recurrence_interval
            .filter(|value| *value > 0)
            .unwrap_or(1),
        days_of_week: row.days_of_week.unwrap_or_default(),
        monthly_type: row.monthly_type,
        day_of_month: row.day_of_month,
        week_of_month: row.week_of_month,
        day_of_week_monthly: row.day_of_week_monthly,
    }))
}

#[derive(Deserialize)]
struct LinkedEvent {
    id: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
}

#[derive(Deserialize)]
struct ScheduledEventRow {
    occurrence_date: Option<String>,
    // PostgREST returns the embedded row as an object (or null) for a
    // to-one relationship.
    workspace_calendar_events: Option<LinkedEvent>,
}

struct ScheduledEvent {
    occurrence_date: String,
    event: Option<LinkedEvent>,
}

async fn fetch_scheduled_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Vec<ScheduledEvent>, ()> {
    let Some(url) = contact_data.rest_url(
        "habit_calendar_events",
        &[
            (
                "select",
                "occurrence_date,completed,workspace_calendar_events(id,start_at,end_at)"
                    .to_owned(),
            ),
            ("habit_id", format!("eq.{habit_id}")),
            ("occurrence_date", format!("gte.{range_start}")),
            ("occurrence_date", format!("lte.{range_end}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ScheduledEventRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| {
            row.occurrence_date.map(|occurrence_date| ScheduledEvent {
                occurrence_date,
                event: row.workspace_calendar_events,
            })
        })
        .collect())
}

#[derive(Deserialize)]
struct CompletionRow {
    occurrence_date: Option<String>,
    event_id: Option<String>,
}

struct Completion {
    occurrence_date: String,
    event_id: Option<String>,
}

async fn fetch_completions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Vec<Completion>, ()> {
    let Some(url) = contact_data.rest_url(
        "habit_completions",
        &[
            ("select", "occurrence_date,event_id,completed_at".to_owned()),
            ("habit_id", format!("eq.{habit_id}")),
            ("occurrence_date", format!("gte.{range_start}")),
            ("occurrence_date", format!("lte.{range_end}")),
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
                event_id: row.event_id,
            })
        })
        .collect())
}

#[derive(Deserialize)]
struct SkipRow {
    occurrence_date: Option<String>,
    revoked_at: Option<String>,
}

struct Skip {
    occurrence_date: String,
    revoked_at: Option<String>,
}

/// Port of `listHabitSkipHistory` (returns ALL skips in range, active and
/// revoked, ordered by occurrence_date asc).
async fn fetch_skip_history(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    habit_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Vec<Skip>, ()> {
    let Some(url) = contact_data.rest_url(
        "habit_skipped_occurrences",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("habit_id", format!("eq.{habit_id}")),
            ("occurrence_date", format!("gte.{range_start}")),
            ("occurrence_date", format!("lte.{range_end}")),
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
        .json::<Vec<SkipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| {
            row.occurrence_date.map(|occurrence_date| Skip {
                occurrence_date,
                revoked_at: row.revoked_at.filter(|value| !value.trim().is_empty()),
            })
        })
        .collect())
}

// ============================================================================
// RECURRENCE CALENDAR (port of getOccurrencesInRange, UTC / no-timezone path)
// ============================================================================

/// Port of `getOccurrencesInRange` for the default (no-timezone) UTC path.
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

        // Safety check mirrors the TS implementation.
        if occurrences.len() > 365 {
            break;
        }
    }

    occurrences
}

/// Port of `findNextOccurrence`.
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

    // Search up to 366 days.
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

/// Port of `findNextYearlyOccurrence`.
fn find_next_yearly_occurrence(
    habit: &Habit,
    start_date: CivilDate,
    current: CivilDate,
    end_date: Option<CivilDate>,
) -> Option<CivilDate> {
    let interval = habit.recurrence_interval.max(1);
    let target_month = start_date.month; // 1..=12
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

/// Port of `matchesRecurrencePattern`.
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

    let week_of_month = (date.day + 6) / 7; // ceil(day / 7)
    week_of_month == week
}

// ============================================================================
// CIVIL DATE (proleptic Gregorian, no external date crate)
// ============================================================================

/// A timezone-free calendar date. All recurrence math operates on calendar
/// fields, mirroring the dayjs.utc / no-timezone path used by the web app.
#[derive(Clone, Copy, PartialEq, Eq)]
struct CivilDate {
    year: i64,
    month: i64, // 1..=12
    day: i64,   // 1..=31
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

    /// Parse a leading `YYYY-MM-DD` out of an ISO date or datetime string.
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

    /// Days since 1970-01-01 (Howard Hinnant's days_from_civil).
    fn epoch_day(self) -> i64 {
        let y = if self.month <= 2 {
            self.year - 1
        } else {
            self.year
        };
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = y - era * 400; // [0, 399]
        let doy =
            (153 * (if self.month > 2 {
                self.month - 3
            } else {
                self.month + 9
            }) + 2)
                / 5
                + self.day
                - 1; // [0, 365]
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
        era * 146097 + doe - 719468
    }

    fn from_epoch_day(epoch_day: i64) -> Self {
        let z = epoch_day + 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = z - era * 146097; // [0, 146096]
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
        let mp = (5 * doy + 2) / 153; // [0, 11]
        let day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
        let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
        Self {
            year: if month <= 2 { y + 1 } else { y },
            month,
            day,
        }
    }

    fn add_days(self, delta: i64) -> Self {
        Self::from_epoch_day(self.epoch_day() + delta)
    }

    /// 0 = Sunday .. 6 = Saturday (matches dayjs `.day()`).
    fn day_of_week(self) -> i64 {
        let dow = (self.epoch_day() % 7 + 4) % 7;
        if dow < 0 { dow + 7 } else { dow }
    }

    /// Sunday-based start of week (dayjs default).
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

/// Current server date in UTC. Mirrors the legacy `new Date()` on the server
/// (Cloudflare Workers run in UTC).
fn current_utc_date() -> CivilDate {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    CivilDate::from_epoch_day(secs.div_euclid(86_400))
}

fn is_uuid(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

/// Strict `YYYY-MM-DD` validation (mirrors zod's `z.string().date()`).
fn is_iso_date(value: &str) -> bool {
    CivilDate::parse_date_prefix(value).is_some() && value.trim().len() == 10
}

fn optional_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
        .filter(|value| !value.is_empty())
}

// ============================================================================
// WORKSPACE ACCESS HELPERS
//
// COPIED (file-local) from `workspace_habits_access.rs` /
// `workspaces_habits_habitid_stats.rs` because those fns are private there and
// editing those files is out of scope for this port.
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

fn invalid_query_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "error": "Invalid query", "details": [] }),
    ))
}
