use super::*;

// ---------------------------------------------------------------------------
// Small utilities.
// ---------------------------------------------------------------------------

pub(super) fn student_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok())?;
    url.query_pairs().find_map(|(key, value)| {
        (key == "studentId" && !value.trim().is_empty()).then(|| value.into_owned())
    })
}

/// Renders a PostgREST `in.(...)` list. Wraps each id in double quotes to keep
/// UUIDs/handles safe regardless of content.
pub(super) fn in_list(ids: &[String]) -> String {
    let inner = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "")))
        .collect::<Vec<_>>()
        .join(",");
    format!("({inner})")
}

/// PostgREST embedded relations come back either as an object or a
/// single-element array. Returns the first object either way.
pub(super) fn first_object(value: Option<&Value>) -> Option<&Value> {
    match value {
        Some(Value::Object(_)) => value,
        Some(Value::Array(items)) => items.iter().find(|item| item.is_object()),
        _ => None,
    }
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Milliseconds since the Unix epoch.
pub(super) fn now_millis() -> i128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i128)
        .unwrap_or(0)
}

/// Current time as an ISO-8601 / RFC-3339 UTC string with millisecond
/// precision (e.g. `2024-01-02T03:04:05.678Z`), matching JS `toISOString()`.
pub(super) fn now_iso() -> String {
    millis_to_iso(now_millis())
}

/// Parses an ISO-8601 timestamp (the subset Postgres/`toISOString` emit) to
/// epoch milliseconds. Returns None on parse failure (mirrors JS `NaN` guard).
pub(super) fn parse_iso_millis(value: &str) -> Option<i128> {
    let value = value.trim();
    // Expected forms: YYYY-MM-DDTHH:MM:SS[.fff][Z|+hh:mm].
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;

    // Fractional seconds (optional).
    let mut idx = 19;
    let mut millis_frac: i64 = 0;
    if bytes.get(idx) == Some(&b'.') {
        idx += 1;
        let frac_start = idx;
        while idx < bytes.len() && bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        let frac = &value[frac_start..idx];
        // Take up to the first 3 digits (milliseconds).
        let mut ms = String::from("000");
        for (i, ch) in frac.chars().take(3).enumerate() {
            ms.replace_range(i..i + 1, &ch.to_string());
        }
        millis_frac = ms.parse().unwrap_or(0);
    }

    // Timezone offset (optional). Postgres/JS emit `Z` (UTC) here; if an offset
    // is present, fold it in.
    let mut offset_minutes: i64 = 0;
    if idx < bytes.len() {
        match bytes[idx] {
            b'Z' | b'z' => {}
            b'+' | b'-' => {
                let sign = if bytes[idx] == b'-' { -1 } else { 1 };
                let oh: i64 = value.get(idx + 1..idx + 3)?.parse().ok()?;
                let om: i64 = value
                    .get(idx + 4..idx + 6)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                offset_minutes = sign * (oh * 60 + om);
            }
            _ => {}
        }
    }

    let days = days_from_civil(year, month, day);
    let total_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;
    Some(total_seconds as i128 * 1_000 + millis_frac as i128)
}

fn millis_to_iso(millis: i128) -> String {
    let total_seconds = millis.div_euclid(1_000) as i64;
    let ms = millis.rem_euclid(1_000) as i64;
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{ms:03}Z")
}

/// Days from 1970-01-01 to the given civil date (Howard Hinnant's algorithm).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of `days_from_civil`.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (if month <= 2 { y + 1 } else { y }, month, day)
}
