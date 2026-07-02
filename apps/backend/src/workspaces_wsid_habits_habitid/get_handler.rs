use super::*;

pub(super) async fn habit_get_response(
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
