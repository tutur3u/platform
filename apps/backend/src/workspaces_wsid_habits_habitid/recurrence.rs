use super::*;

// ============================================================================
// HABIT RECURRENCE (extracted from the full habit row for streak math)
// ============================================================================

/// Normalized habit recurrence inputs used by the calendar/streak logic.
pub(super) struct Habit {
    pub(super) start_date: String,
    pub(super) end_date: Option<String>,
    pub(super) frequency: String,
    pub(super) recurrence_interval: i64,
    pub(super) days_of_week: Vec<i64>,
    pub(super) monthly_type: Option<String>,
    pub(super) day_of_month: Option<i64>,
    pub(super) week_of_month: Option<i64>,
    pub(super) day_of_week_monthly: Option<i64>,
}

pub(super) fn habit_recurrence_from_value(value: &Value) -> Habit {
    let str_field = |key: &str| -> Option<String> {
        value.get(key).and_then(Value::as_str).map(|s| s.to_owned())
    };
    let i64_field = |key: &str| -> Option<i64> { value.get(key).and_then(Value::as_i64) };

    Habit {
        start_date: str_field("start_date").unwrap_or_default(),
        end_date: str_field("end_date").filter(|value| !value.trim().is_empty()),
        frequency: str_field("frequency").unwrap_or_else(|| "daily".to_owned()),
        // Legacy never normalizes a missing interval (the column is NOT NULL in
        // practice). Default to 1 to keep modulo math well-defined.
        recurrence_interval: i64_field("recurrence_interval")
            .filter(|value| *value > 0)
            .unwrap_or(1),
        days_of_week: value
            .get("days_of_week")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(Value::as_i64).collect())
            .unwrap_or_default(),
        monthly_type: str_field("monthly_type"),
        day_of_month: i64_field("day_of_month"),
        week_of_month: i64_field("week_of_month"),
        day_of_week_monthly: i64_field("day_of_week_monthly"),
    }
}

// ============================================================================
// STREAK COMPUTATION (port of calculateHabitStreak / fetchHabitStreak)
// ============================================================================

pub(super) struct HabitStreak {
    pub(super) current_streak: i64,
    pub(super) best_streak: i64,
    pub(super) total_completions: i64,
    pub(super) completion_rate: i64,
    pub(super) last_completed_at: Option<String>,
}

/// Port of `calculateHabitStreak`. `completions` are the full set of completions
/// (occurrence_date desc), matching `fetchHabitStreak`.
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

// ============================================================================
// RECURRENCE CALENDAR (port of getOccurrencesInRange, UTC / no-timezone path)
// ============================================================================

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

        if occurrences.len() > 365 {
            break;
        }
    }

    occurrences
}

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

fn find_next_yearly_occurrence(
    habit: &Habit,
    start_date: CivilDate,
    current: CivilDate,
    end_date: Option<CivilDate>,
) -> Option<CivilDate> {
    let interval = habit.recurrence_interval.max(1);
    let target_month = start_date.month;
    let target_day = start_date.day;
    let is_leap_year_date = target_month == 2 && target_day == 29;

    let mut candidate_year = current.year;

    let this_year_target = CivilDate::from_ymd_clamped(candidate_year, target_month, target_day);
    if current > this_year_target {
        candidate_year += 1;
    }

    let start_year = start_date.year;
    let years_diff = candidate_year - start_year;
    if years_diff < 0 {
        candidate_year = start_year;
    } else if years_diff % interval != 0 {
        let steps = (years_diff + interval - 1) / interval;
        candidate_year = start_year + steps * interval;
    }

    for _ in 0..100 {
        if is_leap_year_date && !is_leap_year(candidate_year) {
            candidate_year += interval;
            continue;
        }

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

fn matches_recurrence_pattern(habit: &Habit, date: CivilDate, start_date: CivilDate) -> bool {
    let interval = habit.recurrence_interval.max(1);
    match habit.frequency.as_str() {
        "daily" => matches_daily_pattern(start_date, date, interval),
        "weekly" => matches_weekly_pattern(habit, start_date, date, interval),
        "monthly" => matches_monthly_pattern(habit, start_date, date, interval),
        "yearly" => matches_yearly_pattern(start_date, date, interval),
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
        return date.add_days(7).month != date.month;
    }

    let week_of_month = (date.day + 6) / 7;
    week_of_month == week
}

// ============================================================================
// CIVIL DATE (proleptic Gregorian, no external date crate)
// ============================================================================

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) struct CivilDate {
    pub(super) year: i64,
    pub(super) month: i64,
    pub(super) day: i64,
}

impl PartialOrd for CivilDate {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for CivilDate {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.epoch_day().cmp(&other.epoch_day())
    }
}

impl CivilDate {
    pub(super) fn from_ymd(year: i64, month: i64, day: i64) -> Self {
        Self { year, month, day }
    }

    pub(super) fn from_ymd_clamped(year: i64, month: i64, day: i64) -> Self {
        let last = days_in_month(year, month);
        Self {
            year,
            month,
            day: day.min(last).max(1),
        }
    }

    pub(super) fn parse_date_prefix(value: &str) -> Option<Self> {
        let trimmed = value.trim();
        if trimmed.len() < 10 {
            return None;
        }
        let bytes = trimmed.as_bytes();
        if bytes[4] != b'-' || bytes[7] != b'-' {
            return None;
        }
        let year: i64 = trimmed.get(0..4)?.parse().ok()?;
        let month: i64 = trimmed.get(5..7)?.parse().ok()?;
        let day: i64 = trimmed.get(8..10)?.parse().ok()?;
        if !(1..=12).contains(&month) {
            return None;
        }
        if day < 1 || day > days_in_month(year, month) {
            return None;
        }
        Some(Self { year, month, day })
    }

    pub(super) fn to_iso_date(self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    pub(super) fn epoch_day(self) -> i64 {
        let y = if self.month <= 2 {
            self.year - 1
        } else {
            self.year
        };
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = y - era * 400;
        let doy =
            (153 * (if self.month > 2 {
                self.month - 3
            } else {
                self.month + 9
            }) + 2)
                / 5
                + self.day
                - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe - 719468
    }

    pub(super) fn from_epoch_day(epoch_day: i64) -> Self {
        let z = epoch_day + 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = doy - (153 * mp + 2) / 5 + 1;
        let month = if mp < 10 { mp + 3 } else { mp - 9 };
        Self {
            year: if month <= 2 { y + 1 } else { y },
            month,
            day,
        }
    }

    pub(super) fn add_days(self, delta: i64) -> Self {
        Self::from_epoch_day(self.epoch_day() + delta)
    }

    pub(super) fn day_of_week(self) -> i64 {
        let dow = (self.epoch_day() % 7 + 4) % 7;
        if dow < 0 { dow + 7 } else { dow }
    }

    pub(super) fn start_of_week(self) -> Self {
        self.add_days(-self.day_of_week())
    }
}

pub(super) fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

pub(super) fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

pub(super) fn is_valid_ymd(year: i64, month: i64, day: i64) -> bool {
    (1..=12).contains(&month) && day >= 1 && day <= days_in_month(year, month)
}

pub(super) fn current_utc_date() -> CivilDate {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    CivilDate::from_epoch_day(secs.div_euclid(86_400))
}

/// JavaScript `Math.round`: round half away from zero (values here are >= 0).
pub(super) fn round_half_away(value: f64) -> i64 {
    (value + 0.5).floor() as i64
}
