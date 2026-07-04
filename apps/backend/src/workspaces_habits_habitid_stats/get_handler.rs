use super::*;

pub(super) async fn stats_response(
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
        return error_response(401, "Please sign in to view stats");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Please sign in to view stats");
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // Legacy: normalizeWorkspaceId failure surfaces as membership lookup failure.
            Err(()) => return error_response(500, "Failed to verify workspace membership"),
        };

    // isHabitsEnabled gate (returns the same 404 the legacy habitsNotFoundResponse uses).
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return error_response(404, "Not found");
    }

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "You don't have access to this workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace membership"),
    }

    let habit = match fetch_habit(contact_data, outbound, habit_id, &resolved_ws_id).await {
        Ok(Some(habit)) => habit,
        Ok(None) => return error_response(404, "Habit not found"),
        Err(()) => return error_response(404, "Habit not found"),
    };

    // Streak: all completions ordered by occurrence_date desc.
    let all_completions = match fetch_all_completions(contact_data, outbound, habit_id).await {
        Ok(rows) => rows,
        Err(()) => return error_response(500, "Internal server error"),
    };
    let streak = calculate_habit_streak(&habit, &all_completions);

    // Recent completions (last 30 days) — projected fields only.
    let today = current_utc_date();
    let thirty_days_ago = today.add_days(-30);
    let recent_completions = match fetch_recent_completions(
        contact_data,
        outbound,
        habit_id,
        &thirty_days_ago.to_iso_date(),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, "Internal server error"),
    };

    // Total occurrences since the habit's start date.
    let Some(start_date) = CivilDate::parse_date_prefix(&habit.start_date) else {
        return error_response(500, "Internal server error");
    };
    let total_occurrences = get_occurrences_in_range(&habit, start_date, today).len();

    // Weekly completion trend (last 4 weeks).
    let weekly_trend = build_weekly_trend(&habit, today, &recent_completions);

    let body = json!({
        "habit": {
            "id": habit.id,
            "name": habit.name,
            "frequency": habit.frequency,
            "start_date": habit.start_date,
        },
        "streak": {
            "current_streak": streak.current_streak,
            "best_streak": streak.best_streak,
            "total_completions": streak.total_completions,
            "completion_rate": streak.completion_rate,
            "last_completed_at": streak.last_completed_at,
        },
        "stats": {
            "totalOccurrencesSinceStart": total_occurrences,
            "recentCompletions": recent_completions
                .iter()
                .map(|c| json!({
                    "occurrence_date": c.occurrence_date,
                    "completed_at": c.completed_at,
                }))
                .collect::<Vec<_>>(),
            "weeklyTrend": weekly_trend,
        },
    });

    no_store_response(json_response(200, body))
}
