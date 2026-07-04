use super::*;

pub(super) fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

pub(super) fn is_uuid(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}
