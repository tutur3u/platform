use super::*;

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
pub(super) struct Habit {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    name: String,
    pub(super) frequency: String,
    pub(super) start_date: String,
    pub(super) end_date: Option<String>,
    pub(super) recurrence_interval: i64,
    pub(super) days_of_week: Vec<i64>,
    pub(super) monthly_type: Option<String>,
    pub(super) day_of_month: Option<i64>,
    pub(super) week_of_month: Option<i64>,
    pub(super) day_of_week_monthly: Option<i64>,
}

pub(super) async fn fetch_habit(
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
pub(super) struct LinkedEvent {
    pub(super) id: Option<String>,
    pub(super) start_at: Option<String>,
    pub(super) end_at: Option<String>,
}

#[derive(Deserialize)]
struct ScheduledEventRow {
    occurrence_date: Option<String>,
    // PostgREST returns the embedded row as an object (or null) for a
    // to-one relationship.
    workspace_calendar_events: Option<LinkedEvent>,
}

pub(super) struct ScheduledEvent {
    pub(super) occurrence_date: String,
    pub(super) event: Option<LinkedEvent>,
}

pub(super) async fn fetch_scheduled_events(
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

pub(super) struct Completion {
    pub(super) occurrence_date: String,
    pub(super) event_id: Option<String>,
}

pub(super) async fn fetch_completions(
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

pub(super) struct Skip {
    pub(super) occurrence_date: String,
    pub(super) revoked_at: Option<String>,
}

/// Port of `listHabitSkipHistory` (returns ALL skips in range, active and
/// revoked, ordered by occurrence_date asc).
pub(super) async fn fetch_skip_history(
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
