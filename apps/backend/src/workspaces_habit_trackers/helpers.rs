use super::*;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

pub(super) fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

pub(super) fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(string) => string.clone(),
        Value::Null => String::new(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        other => other.to_string(),
    }
}

pub(super) fn value_to_finite_number(value: &Value) -> Option<f64> {
    // Mirrors JS `Number(value)` followed by `Number.isFinite`.
    let number = match value {
        Value::Number(number) => number.as_f64(),
        Value::String(string) => string.trim().parse::<f64>().ok(),
        Value::Bool(flag) => Some(if *flag { 1.0 } else { 0.0 }),
        Value::Null => Some(0.0),
        _ => None,
    }?;
    number.is_finite().then_some(number)
}

pub(super) fn number_or(value: &Value, fallback: f64) -> f64 {
    // JS `Number(row.x ?? fallback)` — null/undefined -> fallback.
    match value {
        Value::Null => fallback,
        other => value_to_finite_number(other).unwrap_or(fallback),
    }
}

pub(super) fn enum_or(value: &Value, allowed: &[&str], fallback: &str) -> String {
    match value.as_str() {
        Some(string) if allowed.contains(&string) => string.to_owned(),
        _ => fallback.to_owned(),
    }
}

pub(super) fn value_string_length(value: &Value) -> usize {
    match value {
        Value::String(string) => string.chars().count(),
        Value::Null => 0, // unreachable in practice for this branch
        other => other.to_string().chars().count(),
    }
}

pub(super) fn json_number(value: f64) -> Value {
    if value.is_finite() {
        if value.fract() == 0.0 && value.abs() < 9_007_199_254_740_992.0 {
            Value::Number((value as i64).into())
        } else {
            serde_json::Number::from_f64(value)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        }
    } else {
        Value::Null
    }
}

pub(super) fn round_to_one(value: f64) -> f64 {
    // Mirrors JS `Number(x.toFixed(1))`.
    (value * 10.0).round() / 10.0
}

pub(super) fn opt_f64_value(value: Option<f64>) -> Value {
    match value {
        Some(number) => json_number(number),
        None => Value::Null,
    }
}

pub(super) fn opt_str_value(value: Option<&str>) -> Value {
    match value {
        Some(string) => Value::String(string.to_owned()),
        None => Value::Null,
    }
}

pub(super) fn streak_i64(streak: &Value, key: &str) -> i64 {
    streak.get(key).and_then(Value::as_i64).unwrap_or(0)
}

pub(super) fn streak_f64(streak: &Value, key: &str) -> f64 {
    streak.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}
