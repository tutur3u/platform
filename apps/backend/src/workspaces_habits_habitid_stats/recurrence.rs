use super::*;

// ============================================================================
// RECURRENCE CALENDAR (port of getOccurrencesInRange, UTC / no-timezone path)
// ============================================================================

/// Port of `getOccurrencesInRange` for the default (no-timezone) UTC path.
pub(super) fn get_occurrences_in_range(
    habit: &Habit,
    range_start: CivilDate,
    range_end: CivilDate,
) -> Vec<CivilDate> {
    let mut occurrences = Vec::new();

    let Some(start_date) = CivilDate::parse_date_prefix(&habit.start_date) else {
        return occurrences;
    };
    let end_date = habit
        .end_date
        .as_deref()
        .and_then(CivilDate::parse_date_prefix);

    let mut current = range_start;
    if current < start_date {
        current = start_date;
    }

    let Some(first) = find_next_occurrence(habit, current, true, start_date, end_date) else {
        return occurrences;
    };

    let mut current_occurrence = first;
    loop {
        if current_occurrence > range_end {
            break;
        }
        if let Some(end) = end_date
            && current_occurrence > end
        {
            break;
        }

        occurrences.push(current_occurrence);

        let Some(next) =
            find_next_occurrence(habit, current_occurrence, false, start_date, end_date)
        else {
            break;
        };
        current_occurrence = next;

        // Safety check mirrors the TS implementation.
        if occurrences.len() > 365 {
            break;
        }
    }

    occurrences
}

/// Port of `findNextOccurrence`.
fn find_next_occurrence(
    habit: &Habit,
    from_date: CivilDate,
    inclusive: bool,
    start_date: CivilDate,
    end_date: Option<CivilDate>,
) -> Option<CivilDate> {
    let mut current = from_date;

    if !inclusive {
        current = current.add_days(1);
    }
    if current < start_date {
        current = start_date;
    }
    if let Some(end) = end_date
        && current > end
    {
        return None;
    }

    if habit.frequency == "yearly" {
        return find_next_yearly_occurrence(habit, start_date, current, end_date);
    }

    // Search up to 366 days.
    let mut probe = current;
    for _ in 0..366 {
        if matches_recurrence_pattern(habit, probe, start_date) {
            if let Some(end) = end_date
                && probe > end
            {
                return None;
            }
            return Some(probe);
        }
        probe = probe.add_days(1);
        if let Some(end) = end_date
            && probe > end
        {
            return None;
        }
    }

    None
}

/// Port of `findNextYearlyOccurrence`.
fn find_next_yearly_occurrence(
    habit: &Habit,
    start_date: CivilDate,
    current: CivilDate,
    end_date: Option<CivilDate>,
) -> Option<CivilDate> {
    let interval = habit.recurrence_interval.max(1);
    let target_month = start_date.month; // 1..=12
    let target_day = start_date.day;
    let is_leap_year_date = target_month == 2 && target_day == 29;

    let mut candidate_year = current.year;

    // Compare against this-year's target date.
    let this_year_target = CivilDate::from_ymd_clamped(candidate_year, target_month, target_day);
    if current > this_year_target {
        candidate_year += 1;
    }

    let start_year = start_date.year;
    let years_diff = candidate_year - start_year;
    if years_diff < 0 {
        candidate_year = start_year;
    } else if years_diff % interval != 0 {
        // Round up to next valid interval year (ceil division).
        let steps = (years_diff + interval - 1) / interval;
        candidate_year = start_year + steps * interval;
    }

    for _ in 0..100 {
        if is_leap_year_date && !is_leap_year(candidate_year) {
            candidate_year += interval;
            continue;
        }

        // Only valid when the (month, day) actually exists for this year.
        if is_valid_ymd(candidate_year, target_month, target_day) {
            let candidate = CivilDate::from_ymd(candidate_year, target_month, target_day);
            if candidate >= current {
                if let Some(end) = end_date
                    && candidate > end
                {
                    return None;
                }
                return Some(candidate);
            }
        }

        candidate_year += interval;
    }

    None
}

/// Port of `matchesRecurrencePattern`.
fn matches_recurrence_pattern(habit: &Habit, date: CivilDate, start_date: CivilDate) -> bool {
    let interval = habit.recurrence_interval.max(1);
    match habit.frequency.as_str() {
        "daily" => matches_daily_pattern(start_date, date, interval),
        "weekly" => matches_weekly_pattern(habit, start_date, date, interval),
        "monthly" => matches_monthly_pattern(habit, start_date, date, interval),
        "yearly" => matches_yearly_pattern(start_date, date, interval),
        // Custom is treated as "every N days" from start.
        "custom" => matches_daily_pattern(start_date, date, interval),
        _ => false,
    }
}

fn matches_daily_pattern(start_date: CivilDate, date: CivilDate, interval: i64) -> bool {
    let days_diff = date.epoch_day() - start_date.epoch_day();
    days_diff >= 0 && days_diff % interval == 0
}

fn matches_weekly_pattern(
    habit: &Habit,
    start_date: CivilDate,
    date: CivilDate,
    interval: i64,
) -> bool {
    // 0 = Sunday .. 6 = Saturday (dayjs .day()).
    let target_days: Vec<i64> = if !habit.days_of_week.is_empty() {
        habit.days_of_week.clone()
    } else {
        vec![start_date.day_of_week()]
    };

    let day_of_week = date.day_of_week();
    if !target_days.contains(&day_of_week) {
        return false;
    }

    if interval == 1 {
        return true;
    }

    // dayjs `startOf('week')` uses Sunday as the first day by default.
    let start_week = start_date.start_of_week();
    let date_week = date.start_of_week();
    let weeks_diff = (date_week.epoch_day() - start_week.epoch_day()) / 7;

    weeks_diff >= 0 && weeks_diff % interval == 0
}

fn matches_monthly_pattern(
    habit: &Habit,
    start_date: CivilDate,
    date: CivilDate,
    interval: i64,
) -> bool {
    let months_diff = (date.year - start_date.year) * 12 + (date.month - start_date.month);
    if months_diff < 0 || months_diff % interval != 0 {
        return false;
    }

    match habit.monthly_type.as_deref() {
        Some("day_of_month") => {
            let target_day = habit.day_of_month.unwrap_or(start_date.day);
            matches_day_of_month(date, target_day)
        }
        Some("day_of_week") => {
            let target_week = habit.week_of_month.unwrap_or(1);
            let target_day_of_week = habit
                .day_of_week_monthly
                .unwrap_or(start_date.day_of_week());
            matches_nth_weekday(date, target_week, target_day_of_week)
        }
        // Default: same day as start date.
        _ => date.day == start_date.day,
    }
}

fn matches_yearly_pattern(start_date: CivilDate, date: CivilDate, interval: i64) -> bool {
    if date.month != start_date.month || date.day != start_date.day {
        return false;
    }
    let years_diff = date.year - start_date.year;
    years_diff >= 0 && years_diff % interval == 0
}

fn matches_day_of_month(date: CivilDate, target_day: i64) -> bool {
    let last_day = days_in_month(date.year, date.month);
    let actual_target_day = target_day.min(last_day);
    date.day == actual_target_day
}

fn matches_nth_weekday(date: CivilDate, week: i64, day_of_week: i64) -> bool {
    if date.day_of_week() != day_of_week {
        return false;
    }

    if week == 5 {
        // "Last" weekday of month: adding 7 days lands in a different month.
        return date.add_days(7).month != date.month;
    }

    let week_of_month = (date.day + 6) / 7; // ceil(day / 7)
    week_of_month == week
}
