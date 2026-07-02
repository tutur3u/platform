use super::*;

/// Coerces a JSON value to an integer count, mirroring JS `Number(value ?? 0)`.
pub(super) fn value_as_count(value: &Value) -> i64 {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|float| float as i64))
            .unwrap_or(0),
        Value::String(text) => text
            .trim()
            .parse::<f64>()
            .map(|float| float as i64)
            .unwrap_or(0),
        _ => 0,
    }
}

/// Mirrors JS `Number(value)` for numeric line quantities (numbers or numeric
/// strings); anything else resolves to 0.
pub(super) fn value_as_number(value: &Value) -> f64 {
    match value {
        Value::Number(number) => number.as_f64().unwrap_or(0.0),
        Value::String(text) => text.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

pub(super) fn string_or_null(value: &Option<String>) -> Value {
    match value {
        Some(text) => Value::String(text.clone()),
        None => Value::Null,
    }
}

pub(super) fn value_or_null(value: &Option<Value>) -> Value {
    value.clone().unwrap_or(Value::Null)
}

pub(super) fn first_truthy_string<const N: usize>(candidates: [Option<&str>; N]) -> Value {
    for candidate in candidates {
        if let Some(text) = candidate
            && !text.is_empty()
        {
            return Value::String(text.to_owned());
        }
    }
    Value::Null
}

/// Builds a JSON number from an f64 quantity sum, emitting an integer when the
/// value is whole (matching JS number serialization for `reduce` of integers).
pub(super) fn number_value(value: f64) -> Value {
    if value.fract() == 0.0 && value.abs() < (i64::MAX as f64) {
        json!(value as i64)
    } else {
        serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

pub(super) fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
