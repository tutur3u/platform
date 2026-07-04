use super::*;

// ---------------------------------------------------------------------------
// Tracker / member -> JSON serialization
// ---------------------------------------------------------------------------

pub(super) fn tracker_json(tracker: &HabitTracker) -> Value {
    json!({
        "id": tracker.id,
        "ws_id": tracker.ws_id,
        "name": tracker.name,
        "description": tracker.description,
        "color": tracker.color,
        "icon": tracker.icon,
        "tracking_mode": tracker.tracking_mode,
        "target_period": tracker.target_period,
        "target_operator": tracker.target_operator,
        "target_value": json_number(tracker.target_value),
        "primary_metric_key": tracker.primary_metric_key,
        "aggregation_strategy": tracker.aggregation_strategy,
        "input_schema": tracker.input_schema,
        "quick_add_values": tracker
            .quick_add_values
            .iter()
            .map(|value| json_number(*value))
            .collect::<Vec<_>>(),
        "freeze_allowance": json_number(tracker.freeze_allowance),
        "recovery_window_periods": json_number(tracker.recovery_window_periods),
        "use_case": tracker.use_case,
        "template_category": tracker.template_category,
        "composer_mode": tracker.composer_mode,
        "composer_config": tracker.composer_config,
        "start_date": tracker.start_date,
        "created_by": tracker.created_by,
        "is_active": tracker.is_active,
        "archived_at": tracker.archived_at,
        "created_at": tracker.created_at,
        "updated_at": tracker.updated_at,
    })
}

pub(super) fn member_json(member: &Member) -> Value {
    json!({
        "user_id": member.user_id,
        "workspace_user_id": member.workspace_user_id,
        "display_name": member.display_name,
        "email": member.email,
        "avatar_url": member.avatar_url,
    })
}

/// Builds the response `entries` array: sort by occurred_at desc, take 50,
/// attach a `member` field (or null).
pub(super) fn build_recent_entries(entries: &[HabitEntry], members: &[Member]) -> Vec<Value> {
    let mut indexed: Vec<&HabitEntry> = entries.iter().collect();
    // occurred_at is an ISO-8601 UTC timestamp from Postgres; lexicographic desc
    // matches chronological desc for valid timestamps, matching JS getTime().
    indexed.sort_by(|left, right| right.occurred_at.cmp(&left.occurred_at));
    indexed.truncate(MAX_RECENT_ENTRIES);

    indexed
        .into_iter()
        .map(|entry| {
            let mut object = entry.full.clone();
            let member = members
                .iter()
                .find(|member| member.user_id == entry.user_id);
            object.insert(
                "member".to_owned(),
                match member {
                    Some(member) => member_json(member),
                    None => Value::Null,
                },
            );
            Value::Object(object)
        })
        .collect()
}
