use super::*;

// ---------------------------------------------------------------------------
// JSON coercion helpers (mirror store.ts / cms-capabilities.ts helpers)
// ---------------------------------------------------------------------------

pub(super) fn as_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
        _ => None,
    }
}

pub(super) fn as_nullable_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(n)) if n.as_f64().map(f64::is_finite).unwrap_or(false) => {
            Value::Number(n.clone())
        }
        _ => Value::Null,
    }
}

pub(super) fn as_string_array(value: Option<&Value>) -> Value {
    json!(as_string_array_vec(value))
}

pub(super) fn as_string_array_vec(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

pub(super) fn normalize_string_array(value: Option<&Value>) -> Vec<String> {
    dedupe_strings(as_string_array_vec(value))
}

pub(super) fn as_json_object(value: Option<&Value>) -> Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    }
}

pub(super) fn as_json_object_owned(value: &Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    }
}

/// Like as_json_object but yields a JSON value (object), mirroring asJsonObject's
/// use as an embedded value in the response.
pub(super) fn as_json_object_value(value: Option<&Value>) -> Value {
    Value::Object(as_json_object(value))
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

pub(super) fn workspaces_external_projects_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    // ws_id must be a single path segment so we never collide with subpaths such
    // as `/external-projects/summary` or `/external-projects/assets/:id`.
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

pub(super) fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
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

pub(super) fn is_workspace_handle_candidate(value: &str) -> bool {
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

pub(super) fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

pub(super) fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}
