use super::*;

// ---------------------------------------------------------------------------
// JSON coercion helpers
// ---------------------------------------------------------------------------

/// asRecord: object pass-through, else {} (also drops arrays, matching the TS
/// `!Array.isArray` guard).
pub(super) fn as_record_owned(value: &Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    }
}

/// asRecord as an embedded value (object).
pub(super) fn as_record_value(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Object(map)) => Value::Object(map.clone()),
        _ => Value::Object(Map::new()),
    }
}

/// `value ?? []`: returns the array verbatim when present, else `[]`.
pub(super) fn array_or_empty(value: Option<&Value>) -> Value {
    match value {
        Some(v @ Value::Array(_)) => v.clone(),
        _ => Value::Array(Vec::new()),
    }
}

/// `value ?? null` distinguishing absent/null (both -> null) from a present
/// value.
pub(super) fn null_if_absent(value: Option<&Value>) -> Value {
    match value {
        Some(v) if !v.is_null() => v.clone(),
        _ => Value::Null,
    }
}

/// sort_order as i64 (default 0 when absent / non-numeric).
pub(super) fn sort_order_of(value: &Value) -> i64 {
    value.get("sort_order").and_then(Value::as_i64).unwrap_or(0)
}

/// created_at as a comparable string (empty when absent).
pub(super) fn created_at_of(value: &Value) -> String {
    value
        .get("created_at")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

/// Mirrors the legacy `generatedAt = new Date().toISOString()` default.
/// Reuses the proven `now_iso8601` pattern from `shared_task_boards.rs`.
pub(super) fn now_iso8601() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let days = now / 86_400;
    let secs_of_day = now % 86_400;
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    let (year, month, day) = civil_from_days(days as i64);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

// Howard Hinnant's days-from-civil algorithm, inverted.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}
