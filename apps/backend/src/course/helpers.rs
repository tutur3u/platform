use super::*;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/// Mirrors toRichTextContent: returns the value only when it is a `{ type: "doc" }`
/// object (with `content` being an array when present), otherwise `null`.
pub(super) fn to_rich_text_content(value: Value) -> Value {
    let Value::Object(ref map) = value else {
        return Value::Null;
    };
    let is_doc = map.get("type").and_then(Value::as_str) == Some("doc");
    if !is_doc {
        return Value::Null;
    }
    if let Some(content) = map.get("content")
        && !content.is_array()
    {
        return Value::Null;
    }
    value
}

pub(super) fn round_percent(numerator: usize, denominator: usize) -> u64 {
    if denominator == 0 {
        return 0;
    }
    // Math.round((completed / total) * 100)
    let value = (numerator as f64 / denominator as f64) * 100.0;
    value.round() as u64
}

pub(super) fn is_uuid_literal(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 36
        && trimmed.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

/// Extracts a query parameter value from the request URL, decoding it. Returns
/// `None` when absent or empty.
pub(super) fn query_param(url: Option<&str>, key: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        if k == key {
            let decoded = url::form_urlencoded::parse(format!("{k}={v}").as_bytes())
                .next()
                .map(|(_, value)| value.into_owned())
                .unwrap_or_default();
            if decoded.is_empty() {
                return None;
            }
            return Some(decoded);
        }
    }
    None
}

// ─── Response builders ───────────────────────────────────────────────────────

pub(super) fn error_message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

pub(super) fn error_message_response_with_code(
    status: u16,
    message: &str,
    code: &str,
) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "code": code, "error": message }),
    ))
}

/// Mirrors the 400 zod-validation responses. The legacy includes `errors`
/// (the zod issues array); we emit an empty array to keep the shape `{ error, errors }`.
pub(super) fn invalid_param_response(message: &str) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "error": message, "errors": Value::Array(Vec::new()) }),
    ))
}

/// Mirrors tulearnAccessErrorResponse: `{ message }` with 403/404.
pub(super) fn tulearn_access_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
