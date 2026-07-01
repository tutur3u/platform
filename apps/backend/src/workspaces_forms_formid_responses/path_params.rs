use super::*;

// ---------------------------------------------------------------------------
// Query-param + path helpers.
// ---------------------------------------------------------------------------

/// `Number(searchParams.get(key) ?? default_str)` semantics: missing -> default,
/// present-but-non-numeric -> NaN.
pub(super) fn number_param(request_url: Option<&str>, key: &str, default: f64) -> f64 {
    let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) else {
        return default;
    };
    match url
        .query_pairs()
        .find_map(|(k, v)| (k == key).then(|| v.into_owned()))
    {
        None => default,
        Some(raw) => js_number(&raw),
    }
}

/// JS `Number(string)`: empty/whitespace string -> 0, valid numeric -> value, else NaN.
pub(super) fn js_number(raw: &str) -> f64 {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return 0.0;
    }
    trimmed.parse::<f64>().unwrap_or(f64::NAN)
}

/// `searchParams.get('q') ?? undefined` — returns the raw string when present.
pub(super) fn string_param(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    url.query_pairs()
        .find_map(|(k, v)| (k == key).then(|| v.into_owned()))
}

/// Matches `/api/v1/workspaces/{wsId}/forms/{formId}/responses` and returns
/// `(raw_ws_id, raw_form_id)`. Returns None when the path shape does not match.
pub(super) fn responses_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(RESPONSES_PATH_PREFIX)?;
    let rest = rest.strip_suffix(RESPONSES_PATH_SUFFIX)?;
    let (ws_id, form_id) = rest.split_once(FORMS_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || form_id.is_empty() || form_id.contains('/') {
        return None;
    }

    Some((ws_id, form_id))
}

pub(super) fn is_uuid_literal(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 36
        && trimmed.chars().enumerate().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
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
