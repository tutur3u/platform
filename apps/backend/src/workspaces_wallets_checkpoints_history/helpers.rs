use super::*;

// ---------------------------------------------------------------------------
// Number coercion (toCheckpointNumber)
// ---------------------------------------------------------------------------

pub(super) fn to_number(value: &Option<Value>) -> f64 {
    value.as_ref().and_then(value_to_number).unwrap_or(0.0)
}

pub(super) fn nullable_number(value: &Option<Value>) -> Value {
    match value {
        Some(Value::Null) | None => Value::Null,
        Some(inner) => value_to_number(inner)
            .map(|n| json!(n))
            .unwrap_or(Value::Null),
    }
}

pub(super) fn value_to_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64().filter(|n| n.is_finite()),
        Value::String(s) => s.trim().parse::<f64>().ok().filter(|n| n.is_finite()),
        _ => None,
    }
}

pub(super) fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Limit parsing (getCheckpointLimit)
// ---------------------------------------------------------------------------

pub(super) fn checkpoint_limit(url: Option<&str>) -> i64 {
    let parsed = url
        .and_then(|url| url::Url::parse(url).ok())
        .and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "limit")
                .map(|(_, value)| value.into_owned())
        })
        .and_then(|raw| raw.trim().parse::<i64>().ok());

    match parsed {
        Some(value) => value.clamp(1, 100),
        None => 25,
    }
}

// ---------------------------------------------------------------------------
// Time helpers (ISO-8601 millis)
// ---------------------------------------------------------------------------

pub(super) fn now_unix_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Format a UTC millisecond timestamp as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
pub(super) fn iso8601_from_millis(millis: i64) -> String {
    let total_secs = millis.div_euclid(1000);
    let millis_part = millis.rem_euclid(1000);

    let days = total_secs.div_euclid(86_400);
    let secs_of_day = total_secs.rem_euclid(86_400);

    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis_part:03}Z")
}

/// Parse an ISO-8601 timestamp into UTC millis. Supports the
/// `YYYY-MM-DDTHH:MM:SS(.sss)?(Z|+hh:mm)?` shapes Supabase emits. Returns None
/// on anything unparseable (mirrors `Number.isFinite(Date.parse(...))`).
pub(super) fn parse_iso_millis(input: &str) -> Option<i64> {
    let bytes = input.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i64 = input.get(0..4)?.parse().ok()?;
    if bytes.get(4) != Some(&b'-') {
        return None;
    }
    let month: i64 = input.get(5..7)?.parse().ok()?;
    if bytes.get(7) != Some(&b'-') {
        return None;
    }
    let day: i64 = input.get(8..10)?.parse().ok()?;
    let sep = bytes.get(10)?;
    if *sep != b'T' && *sep != b' ' {
        return None;
    }
    let hour: i64 = input.get(11..13)?.parse().ok()?;
    if bytes.get(13) != Some(&b':') {
        return None;
    }
    let minute: i64 = input.get(14..16)?.parse().ok()?;
    if bytes.get(16) != Some(&b':') {
        return None;
    }
    let second: i64 = input.get(17..19)?.parse().ok()?;

    // Optional fractional seconds.
    let mut idx = 19;
    let mut millis_part: i64 = 0;
    if bytes.get(idx) == Some(&b'.') {
        idx += 1;
        let mut frac = String::new();
        while let Some(&b) = bytes.get(idx) {
            if b.is_ascii_digit() {
                frac.push(b as char);
                idx += 1;
            } else {
                break;
            }
        }
        // Use the first 3 fractional digits as milliseconds.
        let mut frac3 = frac.chars().take(3).collect::<String>();
        while frac3.len() < 3 {
            frac3.push('0');
        }
        millis_part = frac3.parse().unwrap_or(0);
    }

    // Optional timezone offset.
    let mut offset_minutes: i64 = 0;
    match bytes.get(idx) {
        None | Some(b'Z') => {}
        Some(&sign @ (b'+' | b'-')) => {
            let off_h: i64 = input.get(idx + 1..idx + 3)?.parse().ok()?;
            // Accept "+hh:mm" or "+hhmm".
            let off_m: i64 = if bytes.get(idx + 3) == Some(&b':') {
                input.get(idx + 4..idx + 6)?.parse().ok()?
            } else {
                input
                    .get(idx + 3..idx + 5)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0)
            };
            let magnitude = off_h * 60 + off_m;
            offset_minutes = if sign == b'+' { magnitude } else { -magnitude };
        }
        _ => return None,
    }

    let days = days_from_civil(year, month, day);
    let secs = days * 86_400 + hour * 3600 + minute * 60 + second - offset_minutes * 60;
    Some(secs * 1000 + millis_part)
}

/// Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm).
pub(super) fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of `days_from_civil`: (year, month, day) from days since epoch.
pub(super) fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
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

// ---------------------------------------------------------------------------
// Response payloads / path matching
// ---------------------------------------------------------------------------

pub(super) fn empty_payload() -> Value {
    json!({
        "audit_statuses": [],
        "checkpoints": [],
        "intervals": [],
        "latest_checkpoints": [],
        "totals_by_currency": [],
        "wallets": [],
    })
}

pub(super) fn wallets_only_payload(wallets: &[SummaryWallet]) -> Value {
    json!({
        "audit_statuses": [],
        "checkpoints": [],
        "intervals": [],
        "latest_checkpoints": [],
        "totals_by_currency": [],
        "wallets": wallets.iter().map(summary_wallet_value).collect::<Vec<_>>(),
    })
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

pub(super) fn match_path(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
