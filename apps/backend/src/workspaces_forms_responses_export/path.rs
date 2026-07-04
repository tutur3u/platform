use super::*;

// ---------------------------------------------------------------------------
// Path matching + UUID/handle validation.
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/forms/{formId}/responses/export` and returns
/// `(raw_ws_id, raw_form_id)`. Returns None when the path shape does not match.
pub(super) fn workspace_responses_export_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WORKSPACE_RESPONSES_EXPORT_PATH_PREFIX)?;
    let rest = rest.strip_suffix(WORKSPACE_RESPONSES_EXPORT_PATH_SUFFIX)?;
    let (ws_id, form_id) = rest.split_once(WORKSPACE_RESPONSES_EXPORT_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || form_id.is_empty() || form_id.contains('/') {
        return None;
    }

    Some((ws_id, form_id))
}

pub(super) fn is_workspace_uuid_literal(value: &str) -> bool {
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

/// Extracts a single query-param value from the request URL (first occurrence).
pub(super) fn query_param(url: Option<&str>, name: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, query)| query)?;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == name {
            return Some(percent_decode(value));
        }
    }
    None
}

/// Minimal application/x-www-form-urlencoded value decoder (`+` -> space, `%XX`).
pub(super) fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let high = (bytes[index + 1] as char).to_digit(16);
                let low = (bytes[index + 2] as char).to_digit(16);
                match (high, low) {
                    (Some(high), Some(low)) => {
                        out.push((high * 16 + low) as u8);
                        index += 3;
                    }
                    _ => {
                        out.push(bytes[index]);
                        index += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
