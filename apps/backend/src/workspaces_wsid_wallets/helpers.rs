use super::*;

// ---------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------

pub(super) fn checkpoint_number(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(n)) => n.as_f64().filter(|v| v.is_finite()).unwrap_or(0.0),
        Some(Value::String(s)) => s
            .parse::<f64>()
            .ok()
            .filter(|v| v.is_finite())
            .unwrap_or(0.0),
        _ => 0.0,
    }
}

pub(super) fn opt_number(value: Option<&Value>) -> Value {
    match value {
        None | Some(Value::Null) => Value::Null,
        other => json!(checkpoint_number(other)),
    }
}

pub(super) fn count_number(value: Option<&Value>) -> Value {
    let parsed = match value {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    };

    if parsed.is_finite() && parsed.fract() == 0.0 {
        json!(parsed as i64)
    } else {
        json!(parsed)
    }
}

pub(super) fn opt_string(value: &Option<String>) -> Value {
    value
        .as_ref()
        .map_or(Value::Null, |s| Value::String(s.clone()))
}

pub(super) fn clamp_status(status: &Option<String>) -> &'static str {
    match status.as_deref() {
        Some("clean") => "clean",
        Some("unresolved") => "unresolved",
        _ => "no_checkpoint",
    }
}

// ---------------------------------------------------------------------------
// Workspace ID / slug helpers
// ---------------------------------------------------------------------------

pub(super) fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

pub(super) fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

pub(super) fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

pub(super) fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

pub(super) fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

// ---------------------------------------------------------------------------
// HTTP / response helpers
// ---------------------------------------------------------------------------

pub(super) fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

pub(super) fn wallets_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WALLETS_PATH_PREFIX)?
        .strip_suffix(WALLETS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
