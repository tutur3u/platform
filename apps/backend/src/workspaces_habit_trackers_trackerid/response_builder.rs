use super::*;

// ---------------------------------------------------------------------------
// Response assembly
// ---------------------------------------------------------------------------

pub(super) async fn build_detail_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    viewer_id: &str,
    tracker_id: &str,
    query: &DetailQuery,
) -> Result<Value, HabitError> {
    // Members + tracker + entries + streak actions, mirroring the legacy
    // `Promise.all([...])`.
    let members = list_habit_tracker_members(contact_data, outbound, ws_id)
        .await
        .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    let tracker = match load_tracker(contact_data, outbound, ws_id, tracker_id).await {
        Ok(Some(tracker)) => tracker,
        Ok(None) => return Err(HabitError::new(404, MSG_TRACKER_NOT_FOUND)),
        Err(()) => return Err(HabitError::new(500, MSG_LOAD_TRACKER_FAILED)),
    };

    let entries = list_tracker_entries(contact_data, outbound, ws_id, tracker_id)
        .await
        .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;
    let actions = list_tracker_streak_actions(contact_data, outbound, ws_id, tracker_id)
        .await
        .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    let scope_user_id = resolve_scope_user_id(&members, viewer_id, query);

    let latest_stats = get_latest_tracker_stats(
        contact_data,
        outbound,
        ws_id,
        scope_user_id.as_deref(),
        tracker_id,
    )
    .await
    .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    // Per-member summaries.
    let entry_refs: Vec<&HabitEntry> = entries.iter().collect();
    let action_refs: Vec<&StreakAction> = actions.iter().collect();

    let member_summaries: Vec<MemberSummary> = members
        .iter()
        .enumerate()
        .map(|(index, member)| {
            let member_entries: Vec<&HabitEntry> = entry_refs
                .iter()
                .copied()
                .filter(|entry| entry.user_id == member.user_id)
                .collect();
            let member_actions: Vec<&StreakAction> = action_refs
                .iter()
                .copied()
                .filter(|action| action.user_id == member.user_id)
                .collect();
            build_member_summary(&tracker, index, &member_entries, &member_actions)
        })
        .collect();

    let leaderboard = build_leaderboard(&member_summaries, &members);

    let current_member = match build_current_member_summary(
        &tracker,
        &members,
        &entry_refs,
        &action_refs,
        scope_user_id.as_deref(),
        &member_summaries,
        latest_stats.as_ref(),
    ) {
        Some(value) => value,
        None => Value::Null,
    };

    let team = build_team_summary(&member_summaries);

    let member_summaries_json: Vec<Value> = member_summaries
        .iter()
        .map(|summary| member_summary_json(summary, &members))
        .collect();

    // Recent entries: sort by occurred_at desc, take 50, attach member.
    let recent_entries = build_recent_entries(&entries, &members);

    // current_period_metrics depends on scope.
    let current_period_metrics = build_current_period_metrics(
        &tracker,
        &entry_refs,
        &action_refs,
        query.scope,
        &current_member,
        &members,
    );

    let mut object = Map::new();
    object.insert("tracker".to_owned(), tracker_json(&tracker));
    object.insert("entries".to_owned(), Value::Array(recent_entries));
    // `current_member` is `undefined` in JS when absent; omit it entirely so the
    // serialized JSON matches (an absent optional, not `null`).
    if !current_member.is_null() {
        object.insert("current_member".to_owned(), current_member);
    }
    object.insert("team".to_owned(), team);
    object.insert(
        "member_summaries".to_owned(),
        Value::Array(member_summaries_json),
    );
    object.insert("leaderboard".to_owned(), Value::Array(leaderboard));
    object.insert(
        "current_period_metrics".to_owned(),
        Value::Array(current_period_metrics),
    );

    Ok(Value::Object(object))
}

pub(super) fn resolve_scope_user_id(
    members: &[Member],
    viewer_id: &str,
    query: &DetailQuery,
) -> Option<String> {
    match query.scope {
        Scope::Team => None,
        Scope::Member => {
            if let Some(requested) = query.user_id.as_deref()
                && members.iter().any(|member| member.user_id == requested)
            {
                return Some(requested.to_owned());
            }
            Some(viewer_id.to_owned())
        }
        Scope::SelfScope => Some(viewer_id.to_owned()),
    }
}

/// `current_period_metrics`: team scope aggregates across members; otherwise it
/// uses the current-member's metric series. When there is no current member,
/// the legacy route yields `[]`. All variants are tail-sliced to 12.
pub(super) fn build_current_period_metrics(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
    scope: Scope,
    current_member: &Value,
    members: &[Member],
) -> Vec<Value> {
    if scope == Scope::Team {
        let metrics = aggregate_metrics_for_team(tracker, entries, actions);
        return tail(metrics, METRICS_TAIL);
    }

    // The legacy code keys off `currentMemberSummary` (truthy / falsy). We only
    // have the serialized JSON; `Value::Null` means "no current member".
    if current_member.is_null() {
        return Vec::new();
    }

    // Determine which user's entries/actions to use: the current member's
    // `member.user_id`.
    let Some(user_id) = current_member
        .get("member")
        .and_then(|member| member.get("user_id"))
        .and_then(Value::as_str)
    else {
        return Vec::new();
    };
    let _ = members; // kept for parity with the legacy signature.

    let member_entries: Vec<&HabitEntry> = entries
        .iter()
        .copied()
        .filter(|entry| entry.user_id == user_id)
        .collect();
    let member_actions: Vec<&StreakAction> = actions
        .iter()
        .copied()
        .filter(|action| action.user_id == user_id)
        .collect();

    let metrics = build_metric_series(tracker, &member_entries, &member_actions);
    let metrics_json: Vec<Value> = metrics.iter().map(metric_json).collect();
    tail(metrics_json, METRICS_TAIL)
}

fn tail(mut values: Vec<Value>, count: usize) -> Vec<Value> {
    if values.len() > count {
        values.split_off(values.len() - count)
    } else {
        values
    }
}

// ---------------------------------------------------------------------------
// Member summaries, leaderboard, team
// ---------------------------------------------------------------------------

pub(super) struct MemberSummary {
    pub(super) member_index: usize,
    pub(super) total: f64,
    pub(super) entry_count: f64,
    pub(super) current_period_total: f64,
    pub(super) streak: Value,
    pub(super) latest_value: Option<Value>,
    pub(super) latest_entry_id: Option<Value>,
    pub(super) latest_entry_date: Option<Value>,
    pub(super) latest_occurred_at: Option<Value>,
    pub(super) latest_values: Option<Value>,
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
    let mut object = Map::new();
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

struct FallbackMemberSummary {
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

fn fallback_member_summary_json(summary: &FallbackMemberSummary) -> Value {
    let mut object = Map::new();
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

fn clone_member_summary(summary: &MemberSummary) -> MemberSummary {
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

fn apply_latest_stats(summary: &mut MemberSummary, latest_stat: Option<&LatestStat>) {
    let Some(stat) = latest_stat else {
        return;
    };
    summary.latest_value = Some(opt_f64_value(stat.latest_primary_value));
    summary.latest_entry_id = Some(opt_str_value(stat.latest_entry_id.as_deref()));
    summary.latest_entry_date = Some(opt_str_value(stat.latest_entry_date.as_deref()));
    summary.latest_occurred_at = Some(opt_str_value(stat.latest_occurred_at.as_deref()));
    summary.latest_values = Some(latest_values_value(stat));
}

fn apply_latest_stats_fallback(
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

fn latest_values_value(stat: &LatestStat) -> Value {
    match &stat.latest_values {
        Some(value) if !value.is_null() => normalize_entry_values(value),
        _ => Value::Null,
    }
}

/// Port of `aggregateMetricsForTeam`: sum each member's metric series across the
/// shared window list (the windows come from an empty-entry series).
pub(super) fn aggregate_metrics_for_team(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> Vec<Value> {
    let windows = build_metric_series(tracker, &[], &[]);

    // Group entries / actions by user.
    let mut entries_by_user: HashMap<&str, Vec<&HabitEntry>> = HashMap::new();
    for entry in entries {
        entries_by_user
            .entry(entry.user_id.as_str())
            .or_default()
            .push(entry);
    }
    let mut actions_by_user: HashMap<&str, Vec<&StreakAction>> = HashMap::new();
    for action in actions {
        actions_by_user
            .entry(action.user_id.as_str())
            .or_default()
            .push(action);
    }

    let mut totals: HashMap<String, (f64, f64)> = HashMap::new();
    for (user_id, member_entries) in &entries_by_user {
        let member_actions = actions_by_user.get(user_id).cloned().unwrap_or_default();
        let metrics = build_metric_series(tracker, member_entries, &member_actions);
        for metric in metrics {
            let current = totals.entry(metric.period_start).or_insert((0.0, 0.0));
            current.0 += metric.total;
            current.1 += metric.entry_count;
        }
    }

    windows
        .into_iter()
        .map(|window| {
            let (total, entry_count) = totals
                .get(&window.period_start)
                .copied()
                .unwrap_or((0.0, 0.0));
            json!({
                "period_start": window.period_start,
                "period_end": window.period_end,
                "total": json_number(total),
                "success": false,
                "used_freeze": false,
                "used_repair": false,
                "entry_count": json_number(entry_count),
            })
        })
        .collect()
}
