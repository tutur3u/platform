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
