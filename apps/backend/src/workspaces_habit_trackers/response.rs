use super::*;

// ---------------------------------------------------------------------------
// Tracker -> JSON serialization
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

// ---------------------------------------------------------------------------
// Per-member streak summaries and card assembly
// ---------------------------------------------------------------------------

pub(super) struct MemberSummary {
    member_index: usize,
    total: f64,
    entry_count: f64,
    current_period_total: f64,
    streak: Value,
    // Latest-stat overlay (only applied to the current-member fallback).
    latest_value: Option<Value>,
    latest_entry_id: Option<Value>,
    latest_entry_date: Option<Value>,
    latest_occurred_at: Option<Value>,
    latest_values: Option<Value>,
}

pub(super) fn build_member_summary(
    tracker: &HabitTracker,
    member_index: usize,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> MemberSummary {
    let summary = compute_streak_summary(tracker, entries, actions);
    MemberSummary {
        member_index,
        total: summary.total,
        entry_count: summary.entry_count,
        current_period_total: summary.current_period_total,
        streak: summary.streak,
        latest_value: None,
        latest_entry_id: None,
        latest_entry_date: None,
        latest_occurred_at: None,
        latest_values: None,
    }
}

pub(super) fn member_summary_json(summary: &MemberSummary, members: &[Member]) -> Value {
    let mut object = serde_json::Map::new();
    object.insert(
        "member".to_owned(),
        member_json(&members[summary.member_index]),
    );
    object.insert("total".to_owned(), json_number(summary.total));
    object.insert("entry_count".to_owned(), json_number(summary.entry_count));
    object.insert(
        "current_period_total".to_owned(),
        json_number(summary.current_period_total),
    );
    if let Some(value) = &summary.latest_value {
        object.insert("latest_value".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_id {
        object.insert("latest_entry_id".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_date {
        object.insert("latest_entry_date".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_occurred_at {
        object.insert("latest_occurred_at".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_values {
        object.insert("latest_values".to_owned(), value.clone());
    }
    object.insert("streak".to_owned(), summary.streak.clone());
    Value::Object(object)
}

/// Member summary for an arbitrary scope user that is not a workspace member
/// (the "You" fallback in `buildFallbackMemberSummary`).
pub(super) struct FallbackMemberSummary {
    total: f64,
    entry_count: f64,
    current_period_total: f64,
    streak: Value,
    latest_value: Option<Value>,
    latest_entry_id: Option<Value>,
    latest_entry_date: Option<Value>,
    latest_occurred_at: Option<Value>,
    latest_values: Option<Value>,
    member: Value,
}

pub(super) fn fallback_member_summary_json(summary: &FallbackMemberSummary) -> Value {
    let mut object = serde_json::Map::new();
    object.insert("member".to_owned(), summary.member.clone());
    object.insert("total".to_owned(), json_number(summary.total));
    object.insert("entry_count".to_owned(), json_number(summary.entry_count));
    object.insert(
        "current_period_total".to_owned(),
        json_number(summary.current_period_total),
    );
    if let Some(value) = &summary.latest_value {
        object.insert("latest_value".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_id {
        object.insert("latest_entry_id".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_date {
        object.insert("latest_entry_date".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_occurred_at {
        object.insert("latest_occurred_at".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_values {
        object.insert("latest_values".to_owned(), value.clone());
    }
    object.insert("streak".to_owned(), summary.streak.clone());
    Value::Object(object)
}

pub(super) fn build_leaderboard(
    member_summaries: &[MemberSummary],
    members: &[Member],
) -> Vec<Value> {
    let mut indexed: Vec<&MemberSummary> = member_summaries.iter().collect();
    indexed.sort_by(|left, right| {
        let lcs = streak_i64(&left.streak, "current_streak");
        let rcs = streak_i64(&right.streak, "current_streak");
        if rcs != lcs {
            return rcs.cmp(&lcs);
        }
        let lbs = streak_i64(&left.streak, "best_streak");
        let rbs = streak_i64(&right.streak, "best_streak");
        if rbs != lbs {
            return rbs.cmp(&lbs);
        }
        let lcr = streak_f64(&left.streak, "consistency_rate");
        let rcr = streak_f64(&right.streak, "consistency_rate");
        if rcr != lcr {
            return rcr.partial_cmp(&lcr).unwrap_or(std::cmp::Ordering::Equal);
        }
        right
            .current_period_total
            .partial_cmp(&left.current_period_total)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    indexed
        .into_iter()
        .map(|summary| {
            json!({
                "member": member_json(&members[summary.member_index]),
                "current_streak": streak_i64(&summary.streak, "current_streak"),
                "best_streak": streak_i64(&summary.streak, "best_streak"),
                "consistency_rate": json_number(streak_f64(&summary.streak, "consistency_rate")),
                "current_period_total": json_number(summary.current_period_total),
            })
        })
        .collect()
}

pub(super) fn build_team_summary(member_summaries: &[MemberSummary]) -> Value {
    let active_members = member_summaries
        .iter()
        .filter(|summary| summary.entry_count > 0.0)
        .count();
    let denominator = if active_members > 0 {
        active_members
    } else if !member_summaries.is_empty() {
        member_summaries.len()
    } else {
        1
    } as f64;

    let total_entries: f64 = member_summaries
        .iter()
        .map(|summary| summary.entry_count)
        .sum();
    let total_value: f64 = member_summaries.iter().map(|summary| summary.total).sum();
    let average_consistency = round_to_one(
        member_summaries
            .iter()
            .map(|summary| streak_f64(&summary.streak, "consistency_rate"))
            .sum::<f64>()
            / denominator,
    );
    let top_streak = member_summaries
        .iter()
        .map(|summary| streak_i64(&summary.streak, "current_streak"))
        .max()
        .unwrap_or(0)
        .max(0);

    json!({
        "active_members": active_members,
        "total_entries": json_number(total_entries),
        "total_value": json_number(total_value),
        "average_consistency_rate": json_number(average_consistency),
        "top_streak": top_streak,
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) fn build_tracker_card_summary(
    tracker: &HabitTracker,
    members: &[Member],
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
    scope: Scope,
    scope_user_id: Option<&str>,
    latest_stat: Option<&LatestStat>,
) -> Value {
    // Group entries / actions by user.
    let member_summaries: Vec<MemberSummary> = members
        .iter()
        .enumerate()
        .map(|(index, member)| {
            let member_entries: Vec<&HabitEntry> = entries
                .iter()
                .copied()
                .filter(|entry| entry.user_id == member.user_id)
                .collect();
            let member_actions: Vec<&StreakAction> = actions
                .iter()
                .copied()
                .filter(|action| action.user_id == member.user_id)
                .collect();
            build_member_summary(tracker, index, &member_entries, &member_actions)
        })
        .collect();

    let leaderboard: Vec<Value> = build_leaderboard(&member_summaries, members)
        .into_iter()
        .take(5)
        .collect();

    // current_member: only when scope != team.
    let current_member = if scope == Scope::Team {
        Value::Null
    } else {
        match build_current_member_summary(
            tracker,
            members,
            entries,
            actions,
            scope_user_id,
            &member_summaries,
            latest_stat,
        ) {
            Some(value) => value,
            None => Value::Null,
        }
    };

    let mut object = serde_json::Map::new();
    object.insert("tracker".to_owned(), tracker_json(tracker));
    // `current_member` is omitted (undefined) in JS when not present; serde
    // `Value::Null` is the closest equivalent and JSON-serializes the same for
    // an absent optional consumed by the client.
    if !current_member.is_null() {
        object.insert("current_member".to_owned(), current_member);
    }
    object.insert("team".to_owned(), build_team_summary(&member_summaries));
    object.insert("leaderboard".to_owned(), Value::Array(leaderboard));
    Value::Object(object)
}

/// Reproduces `applyLatestStatsToMemberSummary(buildFallbackMemberSummary(...))`.
#[allow(clippy::too_many_arguments)]
pub(super) fn build_current_member_summary(
    tracker: &HabitTracker,
    members: &[Member],
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
    scope_user_id: Option<&str>,
    member_summaries: &[MemberSummary],
    latest_stat: Option<&LatestStat>,
) -> Option<Value> {
    let scope_user_id = scope_user_id?;

    // existing member summary?
    if let Some(existing_index) = member_summaries
        .iter()
        .position(|summary| members[summary.member_index].user_id == scope_user_id)
    {
        let mut summary = clone_member_summary(&member_summaries[existing_index]);
        apply_latest_stats(&mut summary, latest_stat);
        return Some(member_summary_json(&summary, members));
    }

    // Fallback "You" summary, only if the scope user has entries or actions.
    let member_entries: Vec<&HabitEntry> = entries
        .iter()
        .copied()
        .filter(|entry| entry.user_id == scope_user_id)
        .collect();
    let member_actions: Vec<&StreakAction> = actions
        .iter()
        .copied()
        .filter(|action| action.user_id == scope_user_id)
        .collect();
    if member_entries.is_empty() && member_actions.is_empty() {
        return None;
    }

    let summary = compute_streak_summary(tracker, &member_entries, &member_actions);
    let mut fallback = FallbackMemberSummary {
        total: summary.total,
        entry_count: summary.entry_count,
        current_period_total: summary.current_period_total,
        streak: summary.streak,
        latest_value: None,
        latest_entry_id: None,
        latest_entry_date: None,
        latest_occurred_at: None,
        latest_values: None,
        member: json!({
            "user_id": scope_user_id,
            "workspace_user_id": Value::Null,
            "display_name": "You",
            "email": Value::Null,
            "avatar_url": Value::Null,
        }),
    };
    apply_latest_stats_fallback(&mut fallback, latest_stat);
    Some(fallback_member_summary_json(&fallback))
}

pub(super) fn clone_member_summary(summary: &MemberSummary) -> MemberSummary {
    MemberSummary {
        member_index: summary.member_index,
        total: summary.total,
        entry_count: summary.entry_count,
        current_period_total: summary.current_period_total,
        streak: summary.streak.clone(),
        latest_value: summary.latest_value.clone(),
        latest_entry_id: summary.latest_entry_id.clone(),
        latest_entry_date: summary.latest_entry_date.clone(),
        latest_occurred_at: summary.latest_occurred_at.clone(),
        latest_values: summary.latest_values.clone(),
    }
}

pub(super) fn apply_latest_stats(summary: &mut MemberSummary, latest_stat: Option<&LatestStat>) {
    let Some(stat) = latest_stat else {
        return;
    };
    summary.latest_value = Some(opt_f64_value(stat.latest_primary_value));
    summary.latest_entry_id = Some(opt_str_value(stat.latest_entry_id.as_deref()));
    summary.latest_entry_date = Some(opt_str_value(stat.latest_entry_date.as_deref()));
    summary.latest_occurred_at = Some(opt_str_value(stat.latest_occurred_at.as_deref()));
    summary.latest_values = Some(latest_values_value(stat));
}

pub(super) fn apply_latest_stats_fallback(
    summary: &mut FallbackMemberSummary,
    latest_stat: Option<&LatestStat>,
) {
    let Some(stat) = latest_stat else {
        return;
    };
    summary.latest_value = Some(opt_f64_value(stat.latest_primary_value));
    summary.latest_entry_id = Some(opt_str_value(stat.latest_entry_id.as_deref()));
    summary.latest_entry_date = Some(opt_str_value(stat.latest_entry_date.as_deref()));
    summary.latest_occurred_at = Some(opt_str_value(stat.latest_occurred_at.as_deref()));
    summary.latest_values = Some(latest_values_value(stat));
}

pub(super) fn latest_values_value(stat: &LatestStat) -> Value {
    // latest_values ? normalizeEntryValues(latest_values) : null
    match &stat.latest_values {
        Some(value) if !value.is_null() => normalize_entry_values(value),
        _ => Value::Null,
    }
}
