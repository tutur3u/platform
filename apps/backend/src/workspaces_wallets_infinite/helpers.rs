use super::*;

// ---------------------------------------------------------------------------
// Shared value/JSON helpers
// ---------------------------------------------------------------------------

pub(super) fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

pub(super) fn extend_unique_permissions(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

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

pub(super) fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

pub(super) fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Builds a PostgREST `in.(...)` filter value from a list of ids. Empty list
/// yields `in.()` (matches nothing), matching the JS `.in('id', [])` semantics.
pub(super) fn in_filter(ids: &[String]) -> String {
    let mut unique: Vec<&String> = Vec::new();
    let mut seen: BTreeSet<&String> = BTreeSet::new();
    for id in ids {
        if seen.insert(id) {
            unique.push(id);
        }
    }
    let joined = unique
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

pub(super) fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(found_key, value)| (found_key == key).then(|| value.into_owned()))
}

pub(super) fn insert_optional_number(
    object: &mut Map<String, Value>,
    key: &str,
    value: Option<f64>,
) {
    if let Some(value) = value {
        object.insert(key.to_owned(), number_value(value));
    }
}

pub(super) fn number_value(value: f64) -> Value {
    serde_json::Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

pub(super) fn opt_number_value(value: Option<f64>) -> Value {
    value.map(number_value).unwrap_or(Value::Null)
}

pub(super) fn normalize_audit_status(status: Option<&str>) -> String {
    match status {
        Some("clean") => "clean".to_owned(),
        Some("no_checkpoint") => "no_checkpoint".to_owned(),
        Some("unresolved") => "unresolved".to_owned(),
        _ => "no_checkpoint".to_owned(),
    }
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

pub(super) fn internal_error_response(message: &str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}
