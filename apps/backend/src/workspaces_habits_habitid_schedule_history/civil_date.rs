// ============================================================================
// CIVIL DATE (proleptic Gregorian, no external date crate)
// ============================================================================

/// A timezone-free calendar date. All recurrence math operates on calendar
/// fields, mirroring the dayjs.utc / no-timezone path used by the web app.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) struct CivilDate {
    pub(super) year: i64,
    pub(super) month: i64, // 1..=12
    pub(super) day: i64,   // 1..=31
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

    /// Parse a leading `YYYY-MM-DD` out of an ISO date or datetime string.
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

    /// Days since 1970-01-01 (Howard Hinnant's days_from_civil).
    pub(super) fn epoch_day(self) -> i64 {
        let y = if self.month <= 2 {
            self.year - 1
        } else {
            self.year
        };
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = y - era * 400; // [0, 399]
        let doy =
            (153 * (if self.month > 2 {
                self.month - 3
            } else {
                self.month + 9
            }) + 2)
                / 5
                + self.day
                - 1; // [0, 365]
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
        era * 146097 + doe - 719468
    }

    fn from_epoch_day(epoch_day: i64) -> Self {
        let z = epoch_day + 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = z - era * 146097; // [0, 146096]
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
        let mp = (5 * doy + 2) / 153; // [0, 11]
        let day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
        let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
        Self {
            year: if month <= 2 { y + 1 } else { y },
            month,
            day,
        }
    }

    pub(super) fn add_days(self, delta: i64) -> Self {
        Self::from_epoch_day(self.epoch_day() + delta)
    }

    /// 0 = Sunday .. 6 = Saturday (matches dayjs `.day()`).
    pub(super) fn day_of_week(self) -> i64 {
        let dow = (self.epoch_day() % 7 + 4) % 7;
        if dow < 0 { dow + 7 } else { dow }
    }

    /// Sunday-based start of week (dayjs default).
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

/// Current server date in UTC. Mirrors the legacy `new Date()` on the server
/// (Cloudflare Workers run in UTC).
pub(super) fn current_utc_date() -> CivilDate {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    CivilDate::from_epoch_day(secs.div_euclid(86_400))
}

pub(super) fn is_uuid(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

/// Strict `YYYY-MM-DD` validation (mirrors zod's `z.string().date()`).
pub(super) fn is_iso_date(value: &str) -> bool {
    CivilDate::parse_date_prefix(value).is_some() && value.trim().len() == 10
}

pub(super) fn optional_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
        .filter(|value| !value.is_empty())
}
