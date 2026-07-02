use super::*;

// ---------------------------------------------------------------------------
// Streak engine (port of streaks.ts)
// ---------------------------------------------------------------------------

const DAY_MS: i64 = 86_400_000;
const WEEK_STARTS_ON: i64 = 1;

#[derive(Clone)]
pub(super) struct PeriodWindow {
    period_start: String,
    period_end: String,
}

#[derive(Clone)]
pub(super) struct EffectiveMetric {
    period_start: String,
    period_end: String,
    total: f64,
    success: bool,
    used_freeze: bool,
    used_repair: bool,
    #[allow(dead_code)]
    entry_count: f64,
    is_current_period: bool,
}

pub(super) struct StreakSummary {
    pub(super) streak: Value,
    pub(super) current_period_total: f64,
    pub(super) total: f64,
    pub(super) entry_count: f64,
}

/// Days since the Unix epoch (UTC) for a `YYYY-MM-DD` key, using
/// Howard Hinnant's civil-from-days inverse. Returns 0 on parse failure.
pub(super) fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

pub(super) fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month, day)
}

pub(super) fn parse_date_key_days(value: &str) -> i64 {
    let parts: Vec<&str> = value.get(0..10).unwrap_or(value).split('-').collect();
    if parts.len() != 3 {
        return 0;
    }
    let year: i64 = parts[0].parse().unwrap_or(1970);
    let month: i64 = parts[1].parse().unwrap_or(1);
    let day: i64 = parts[2].parse().unwrap_or(1);
    days_from_civil(year, month, day)
}

pub(super) fn format_date_key_from_days(days: i64) -> String {
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

/// JS `getUTCDay`: Sunday=0. Epoch day 0 (1970-01-01) is Thursday (4).
pub(super) fn utc_weekday(days: i64) -> i64 {
    ((days % 7) + 4).rem_euclid(7)
}

pub(super) fn start_of_utc_week_days(days: i64) -> i64 {
    let current_day = utc_weekday(days);
    let diff = (current_day - WEEK_STARTS_ON + 7) % 7;
    days - diff
}

pub(super) fn today_days() -> i64 {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    now_ms.div_euclid(DAY_MS)
}

pub(super) fn today_date_key() -> String {
    format_date_key_from_days(today_days())
}

pub(super) fn get_period_window_for_date(date_key: &str, weekly: bool) -> PeriodWindow {
    let days = parse_date_key_days(date_key);
    if weekly {
        let period_start = start_of_utc_week_days(days);
        PeriodWindow {
            period_start: format_date_key_from_days(period_start),
            period_end: format_date_key_from_days(period_start + 6),
        }
    } else {
        let key = format_date_key_from_days(days);
        PeriodWindow {
            period_start: key.clone(),
            period_end: key,
        }
    }
}

pub(super) fn current_period_window(weekly: bool) -> PeriodWindow {
    get_period_window_for_date(&today_date_key(), weekly)
}

pub(super) fn enumerate_period_windows(
    start_date: &str,
    end_date: &str,
    weekly: bool,
) -> Vec<PeriodWindow> {
    let mut windows = Vec::new();
    if weekly {
        let mut cursor =
            parse_date_key_days(&get_period_window_for_date(start_date, true).period_start);
        let end = parse_date_key_days(&get_period_window_for_date(end_date, true).period_start);
        while cursor <= end {
            windows.push(PeriodWindow {
                period_start: format_date_key_from_days(cursor),
                period_end: format_date_key_from_days(cursor + 6),
            });
            cursor += 7;
        }
        return windows;
    }

    let mut cursor = parse_date_key_days(start_date);
    let end = parse_date_key_days(end_date);
    while cursor <= end {
        let key = format_date_key_from_days(cursor);
        windows.push(PeriodWindow {
            period_start: key.clone(),
            period_end: key,
        });
        cursor += 1;
    }
    windows
}

pub(super) fn compare_to_target(total: f64, tracker: &HabitTracker) -> bool {
    if tracker.target_operator == "eq" {
        total == tracker.target_value
    } else {
        total >= tracker.target_value
    }
}

pub(super) fn get_entry_numeric_value(tracker: &HabitTracker, entry: &HabitEntry) -> f64 {
    if tracker.aggregation_strategy == "count_entries" {
        return 1.0;
    }

    if tracker.aggregation_strategy == "boolean_any" {
        // raw = values[primary_metric_key] ?? primary_value ?? false
        let raw = entry
            .values
            .get(&tracker.primary_metric_key)
            .filter(|value| !value.is_null())
            .cloned()
            .or_else(|| {
                entry.primary_value.map(|value| {
                    Value::Number(serde_json::Number::from_f64(value).unwrap_or_else(|| 0.into()))
                })
            });
        return match raw {
            Some(Value::Bool(flag))
                if flag => {
                    1.0
                }
            Some(Value::Number(number)) => {
                let value = number.as_f64().unwrap_or(0.0);
                if value > 0.0 { 1.0 } else { 0.0 }
            }
            Some(other)
                // String(rawValue).length > 0
                if value_string_length(&other) > 0 => {
                    1.0
                }
            None => {
                // Both values[key] and primary_value are absent, so JS falls
                // back to the literal `false` (a boolean) → `false ? 1 : 0` = 0.
                0.0
            }
            _ => 0.0,
        };
    }

    // raw = primary_value ?? values[primary_metric_key]
    let raw = entry.primary_value.or_else(|| {
        entry
            .values
            .get(&tracker.primary_metric_key)
            .and_then(Value::as_f64)
    });
    match raw {
        Some(value) if value.is_finite() => value,
        _ => 0.0,
    }
}

pub(super) fn build_metric_series(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> Vec<EffectiveMetric> {
    let weekly = tracker.target_period == "weekly";
    let current_period = current_period_window(weekly);
    let today_key = today_date_key();
    let start_date = if tracker.start_date <= today_key {
        tracker.start_date.clone()
    } else {
        today_key
    };
    let windows = enumerate_period_windows(&start_date, &current_period.period_end, weekly);

    // period_start -> (total, entry_count) preserving the JS aggregation modes.
    let mut totals: std::collections::HashMap<String, (f64, f64)> =
        std::collections::HashMap::new();
    let mut action_by_period: std::collections::HashMap<String, (bool, bool)> =
        std::collections::HashMap::new();

    for entry in entries {
        let period = get_period_window_for_date(&entry.entry_date, weekly);
        let current = totals.entry(period.period_start).or_insert((0.0, 0.0));
        let value = get_entry_numeric_value(tracker, entry);
        match tracker.aggregation_strategy.as_str() {
            "max" => current.0 = current.0.max(value),
            "count_entries" => current.0 += 1.0,
            "boolean_any" => current.0 = current.0.max(value),
            _ => current.0 += value,
        }
        current.1 += 1.0;
    }

    for action in actions {
        let entry = action_by_period
            .entry(action.period_start.clone())
            .or_insert((false, false));
        if action.action_type == "freeze" {
            entry.0 = true;
        } else if action.action_type == "repair" {
            entry.1 = true;
        }
    }

    windows
        .into_iter()
        .map(|window| {
            let (total, entry_count) = totals
                .get(&window.period_start)
                .copied()
                .unwrap_or((0.0, 0.0));
            let (used_freeze, used_repair) = action_by_period
                .get(&window.period_start)
                .copied()
                .unwrap_or((false, false));
            let success = compare_to_target(total, tracker);
            EffectiveMetric {
                is_current_period: window.period_start == current_period.period_start,
                period_start: window.period_start,
                period_end: window.period_end,
                total,
                success,
                used_freeze,
                used_repair,
                entry_count,
            }
        })
        .collect()
}

pub(super) fn count_best_streak(metrics: &[EffectiveMetric]) -> i64 {
    let mut best = 0;
    let mut current = 0;
    for metric in metrics {
        if metric.success || metric.used_freeze || metric.used_repair {
            current += 1;
            best = best.max(current);
        } else {
            current = 0;
        }
    }
    best
}

pub(super) fn count_current_streak(metrics: &[EffectiveMetric]) -> i64 {
    let mut index = metrics.len() as i64 - 1;
    if index < 0 {
        return 0;
    }
    if let Some(last) = metrics.get(index as usize)
        && last.is_current_period
        && !last.success
    {
        index -= 1;
    }
    let mut streak = 0;
    while index >= 0 {
        let Some(metric) = metrics.get(index as usize) else {
            break;
        };
        if !(metric.success || metric.used_freeze || metric.used_repair) {
            break;
        }
        streak += 1;
        index -= 1;
    }
    streak
}

pub(super) fn build_recovery_window(tracker: &HabitTracker, metrics: &[EffectiveMetric]) -> Value {
    if tracker.recovery_window_periods <= 0.0 {
        return json!({ "eligible": false, "action": Value::Null });
    }
    let weekly = tracker.target_period == "weekly";

    // [...closed].reverse().find(!success && !freeze && !repair)
    let failed_metric = metrics
        .iter()
        .filter(|metric| !metric.is_current_period)
        .rev()
        .find(|metric| !metric.success && !metric.used_freeze && !metric.used_repair);

    let Some(failed_metric) = failed_metric else {
        return json!({ "eligible": false, "action": Value::Null });
    };

    let current_period_start = parse_date_key_days(&current_period_window(weekly).period_start);
    let failed_period_start = parse_date_key_days(&failed_metric.period_start);
    let distance = if weekly {
        (current_period_start - failed_period_start) / 7
    } else {
        current_period_start - failed_period_start
    };

    if distance as f64 > tracker.recovery_window_periods {
        return json!({ "eligible": false, "action": Value::Null });
    }

    let failed_period_end = parse_date_key_days(&failed_metric.period_end);
    let expiry_days = if weekly {
        failed_period_end + (tracker.recovery_window_periods as i64) * 7
    } else {
        failed_period_end + tracker.recovery_window_periods as i64
    };

    json!({
        "eligible": true,
        "period_start": failed_metric.period_start,
        "period_end": failed_metric.period_end,
        "expires_on": format_date_key_from_days(expiry_days),
        "action": "repair",
    })
}

pub(super) fn count_perfect_weeks(metrics: &[EffectiveMetric], tracker: &HabitTracker) -> i64 {
    let closed: Vec<&EffectiveMetric> = metrics
        .iter()
        .filter(|metric| !metric.is_current_period)
        .collect();

    if tracker.target_period == "weekly" {
        return closed
            .iter()
            .filter(|metric| metric.success || metric.used_freeze || metric.used_repair)
            .count() as i64;
    }

    // Group daily metrics by ISO week start.
    let mut by_week: std::collections::HashMap<String, Vec<&&EffectiveMetric>> =
        std::collections::HashMap::new();
    for metric in &closed {
        let week_start = get_period_window_for_date(&metric.period_start, true).period_start;
        by_week.entry(week_start).or_default().push(metric);
    }

    let mut perfect_weeks = 0;
    for metrics_for_week in by_week.values() {
        if metrics_for_week.len() < 7 {
            continue;
        }
        if metrics_for_week
            .iter()
            .all(|metric| metric.success || metric.used_freeze || metric.used_repair)
        {
            perfect_weeks += 1;
        }
    }
    perfect_weeks
}

pub(super) fn compute_streak_summary(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> StreakSummary {
    let metrics = build_metric_series(tracker, entries, actions);
    let effective: Vec<&EffectiveMetric> = metrics
        .iter()
        .filter(|metric| !metric.is_current_period)
        .collect();
    let current_metric = metrics.iter().find(|metric| metric.is_current_period);
    let success_metrics: Vec<&EffectiveMetric> = metrics
        .iter()
        .filter(|metric| metric.success || metric.used_freeze || metric.used_repair)
        .collect();
    let freezes_used = actions
        .iter()
        .filter(|action| action.action_type == "freeze")
        .count() as i64;
    let total_closed_periods = effective.len();
    let consistency_rate = if total_closed_periods == 0 {
        0.0
    } else {
        let succeeded = effective
            .iter()
            .filter(|metric| metric.success || metric.used_freeze || metric.used_repair)
            .count() as f64;
        round_to_one((succeeded / total_closed_periods as f64) * 100.0)
    };

    let last_success_date = success_metrics
        .last()
        .map(|metric| Value::String(metric.period_end.clone()))
        .unwrap_or(Value::Null);

    let streak = json!({
        "current_streak": count_current_streak(&metrics),
        "best_streak": count_best_streak(&metrics),
        "last_success_date": last_success_date,
        "freeze_count": json_number(tracker.freeze_allowance),
        "freezes_used": freezes_used,
        "perfect_week_count": count_perfect_weeks(&metrics, tracker),
        "consistency_rate": json_number(consistency_rate),
        "recovery_window": build_recovery_window(tracker, &metrics),
    });

    StreakSummary {
        streak,
        current_period_total: current_metric.map(|metric| metric.total).unwrap_or(0.0),
        total: metrics.iter().map(|metric| metric.total).sum(),
        entry_count: entries.len() as f64,
    }
}
