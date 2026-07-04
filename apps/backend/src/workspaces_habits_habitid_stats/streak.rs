use super::*;

// ============================================================================
// STREAK + STATS COMPUTATION
// ============================================================================

pub(super) struct HabitStreak {
    pub(super) current_streak: i64,
    pub(super) best_streak: i64,
    pub(super) total_completions: i64,
    pub(super) completion_rate: i64,
    pub(super) last_completed_at: Option<String>,
}

/// Port of `calculateHabitStreak`. `completions` are assumed to be the full set
/// of completions (occurrence_date desc), matching `fetchHabitStreak`.
pub(super) fn calculate_habit_streak(habit: &Habit, completions: &[Completion]) -> HabitStreak {
    if completions.is_empty() {
        return HabitStreak {
            current_streak: 0,
            best_streak: 0,
            total_completions: 0,
            completion_rate: 0,
            last_completed_at: None,
        };
    }

    // Sort newest-first (input is already desc, but make it explicit/stable).
    let mut sorted: Vec<&Completion> = completions.iter().collect();
    sorted.sort_by(|a, b| b.occurrence_date.cmp(&a.occurrence_date));

    let mut completed_dates: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for completion in &sorted {
        completed_dates.insert(completion.occurrence_date.as_str());
    }

    let mut current_streak: i64 = 0;
    let mut best_streak: i64 = 0;
    let mut temp_streak: i64 = 0;

    let today = current_utc_date();
    let Some(start_date) = CivilDate::parse_date_prefix(&habit.start_date) else {
        return HabitStreak {
            current_streak: 0,
            best_streak: 0,
            total_completions: completions.len() as i64,
            completion_rate: 0,
            last_completed_at: sorted.first().and_then(|c| c.completed_at.clone()),
        };
    };
    let occurrences = get_occurrences_in_range(habit, start_date, today);
    let last_index = occurrences.len().saturating_sub(1);

    // Walk occurrences from most-recent backward, mirroring the TS loop exactly.
    for i in (0..occurrences.len()).rev() {
        let date_str = occurrences[i].to_iso_date();
        if completed_dates.contains(date_str.as_str()) {
            temp_streak += 1;
            if i == last_index {
                current_streak = temp_streak;
            }
        } else {
            if temp_streak > best_streak {
                best_streak = temp_streak;
            }
            temp_streak = 0;
            if current_streak == 0 && i == last_index {
                current_streak = 0;
            }
        }
    }

    if temp_streak > best_streak {
        best_streak = temp_streak;
    }
    if current_streak < temp_streak {
        current_streak = temp_streak;
    }

    let total_occurrences = occurrences.len() as i64;
    let completion_rate = if total_occurrences > 0 {
        // Math.round of (completions / occurrences * 100).
        round_half_away((completions.len() as f64 / total_occurrences as f64) * 100.0)
    } else {
        0
    };

    HabitStreak {
        current_streak,
        best_streak: best_streak.max(current_streak),
        total_completions: completions.len() as i64,
        completion_rate,
        last_completed_at: sorted.first().and_then(|c| c.completed_at.clone()),
    }
}

/// Port of the weekly-trend loop (last 4 weeks, oldest week first).
pub(super) fn build_weekly_trend(
    habit: &Habit,
    today: CivilDate,
    recent_completions: &[Completion],
) -> Vec<serde_json::Value> {
    let mut weekly_trend = Vec::with_capacity(4);

    for i in (0..=3).rev() {
        let week_start = today.add_days(-((i + 1) * 7));
        let week_end = today.add_days(-(i * 7));

        let week_occurrences = get_occurrences_in_range(habit, week_start, week_end);

        let completed_in_week = recent_completions
            .iter()
            .filter(|completion| {
                let Some(date) = CivilDate::parse_date_prefix(&completion.occurrence_date) else {
                    return false;
                };
                // weekStart <= date < weekEnd
                date >= week_start && date < week_end
            })
            .count();

        weekly_trend.push(json!({
            "week": format!("Week {}", 4 - i),
            "completed": completed_in_week,
            "total": week_occurrences.len(),
        }));
    }

    weekly_trend
}
