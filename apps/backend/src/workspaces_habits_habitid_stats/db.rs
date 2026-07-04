use super::*;

// ============================================================================
// SUPABASE READS (habit + completions)
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
    pub(super) id: String,
    pub(super) name: String,
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

#[derive(Deserialize)]
struct CompletionRow {
    occurrence_date: Option<String>,
    completed_at: Option<String>,
}

pub(super) struct Completion {
    pub(super) occurrence_date: String,
    pub(super) completed_at: Option<String>,
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
        // Legacy code never normalizes a missing interval; the column is NOT NULL
        // in practice. Default to 1 to keep modulo math well-defined.
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

pub(super) async fn fetch_all_completions(
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

pub(super) async fn fetch_recent_completions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    habit_id: &str,
    since_date: &str,
) -> Result<Vec<Completion>, ()> {
    let Some(url) = contact_data.rest_url(
        "habit_completions",
        &[
            ("select", "occurrence_date,completed_at".to_owned()),
            ("habit_id", format!("eq.{habit_id}")),
            ("occurrence_date", format!("gte.{since_date}")),
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
