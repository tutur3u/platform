use super::*;

pub(super) async fn schedule_history_response(
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
