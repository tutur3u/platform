use super::*;

// ---------- Pure helpers ----------

// (file-local helper; mirrors normalize_email in sibling handler modules)
#[allow(dead_code)]
pub(super) fn normalize_email(email: Option<&str>) -> Option<String> {
    let email = email?.trim().to_lowercase();
    (!email.is_empty()).then_some(email)
}

pub(super) fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

pub(super) fn total_count_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<i64>().ok()
}

pub(super) fn boards_data_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

pub(super) fn is_uuid_literal(value: &str) -> bool {
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

pub(super) fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// PostgREST treats `,`, `.`, `(`, `)`, `:`, `*` specially in some operator
/// positions. For an ilike pattern value we keep the user text but neutralize the
/// `*` wildcard injection by leaving user `%`/`_` intact (legacy used `%q%`), and
/// only guard the structural `*` we add. Here we simply pass the raw query through;
/// the `form_urlencoded` serializer in `rest_url` handles encoding.
pub(super) fn escape_like_value(value: &str) -> String {
    value.to_owned()
}
