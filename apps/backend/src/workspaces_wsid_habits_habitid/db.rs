use super::*;

// ============================================================================
// SUPABASE READS (habit + events + completions, service-role / admin client)
// ============================================================================

pub(super) async fn fetch_habit(
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

pub(super) async fn fetch_habit_events(
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
pub(super) fn map_event(event: &Value) -> Value {
    let occurrence_date = event.get("occurrence_date");
    let completed = event.get("completed");

    match event
        .get("workspace_calendar_events")
        .filter(|v| v.is_object())
    {
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
pub(super) struct CompletionRow {
    pub(super) occurrence_date: Option<String>,
    pub(super) completed_at: Option<String>,
}

pub(super) struct Completion {
    pub(super) occurrence_date: String,
    pub(super) completed_at: Option<String>,
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
