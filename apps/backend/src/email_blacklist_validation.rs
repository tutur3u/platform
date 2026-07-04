use serde_json::{Map, Value, json};

use crate::{BackendResponse, json_response, no_store_response};

const MAX_NAME_LENGTH: usize = 255;
const MAX_SEARCH_LENGTH: usize = 500;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct EmailBlacklistCreateInput {
    pub(crate) entry_type: EmailBlacklistEntryType,
    pub(crate) reason: Option<String>,
    pub(crate) value: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum EmailBlacklistEntryType {
    Domain,
    Email,
}

impl EmailBlacklistEntryType {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Domain => "domain",
            Self::Email => "email",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct EmailBlacklistUpdateInput {
    pub(crate) reason: Option<String>,
    pub(crate) reason_present: bool,
}

pub(crate) enum EmailBlacklistBodyError {
    InvalidRequest(Vec<Value>),
    Internal,
}

pub(crate) fn create_input_from_body(
    body_text: Option<&str>,
) -> Result<EmailBlacklistCreateInput, EmailBlacklistBodyError> {
    let object = json_object_from_body(body_text)?;
    let mut errors = Vec::new();

    let entry_type = match object.get("entry_type").and_then(Value::as_str) {
        Some("email") => Some(EmailBlacklistEntryType::Email),
        Some("domain") => Some(EmailBlacklistEntryType::Domain),
        _ => {
            errors.push(invalid_entry_type_issue());
            None
        }
    };
    let value = validate_string_field(
        &mut errors,
        object.get("value"),
        "value",
        Some(1),
        Some(MAX_NAME_LENGTH),
    );
    let reason = validate_optional_string_field(
        &mut errors,
        object.get("reason"),
        "reason",
        Some(MAX_SEARCH_LENGTH),
    );

    if !errors.is_empty() {
        return Err(EmailBlacklistBodyError::InvalidRequest(errors));
    }

    Ok(EmailBlacklistCreateInput {
        entry_type: entry_type.expect("entry type is validated"),
        reason,
        value: value.expect("value is validated"),
    })
}

pub(crate) fn update_input_from_body(
    body_text: Option<&str>,
) -> Result<EmailBlacklistUpdateInput, EmailBlacklistBodyError> {
    let object = json_object_from_body(body_text)?;
    let mut errors = Vec::new();
    let reason_present = object.contains_key("reason");
    let reason = validate_optional_string_field(
        &mut errors,
        object.get("reason"),
        "reason",
        Some(MAX_SEARCH_LENGTH),
    );

    if !errors.is_empty() {
        return Err(EmailBlacklistBodyError::InvalidRequest(errors));
    }

    Ok(EmailBlacklistUpdateInput {
        reason,
        reason_present,
    })
}

pub(crate) fn invalid_request_data_response(errors: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": "Invalid request data",
            "errors": errors,
        }),
    ))
}

pub(crate) fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Internal server error" }),
    ))
}

pub(crate) fn is_valid_blacklist_email(value: &str) -> bool {
    let Some((local_part, domain)) = value.split_once('@') else {
        return false;
    };

    !local_part.is_empty()
        && local_part.bytes().all(is_email_local_byte)
        && is_valid_domain_labels(domain, false)
}

pub(crate) fn is_valid_blacklist_domain(value: &str) -> bool {
    is_valid_domain_labels(value, true)
}

fn json_object_from_body(
    body_text: Option<&str>,
) -> Result<Map<String, Value>, EmailBlacklistBodyError> {
    let value = serde_json::from_str::<Value>(body_text.unwrap_or_default())
        .map_err(|_| EmailBlacklistBodyError::Internal)?;

    match value {
        Value::Object(object) => Ok(object),
        other => Err(EmailBlacklistBodyError::InvalidRequest(vec![
            invalid_object_issue(&other),
        ])),
    }
}

fn validate_string_field(
    errors: &mut Vec<Value>,
    value: Option<&Value>,
    field: &'static str,
    min_length: Option<usize>,
    max_length: Option<usize>,
) -> Option<String> {
    let Some(value) = value else {
        errors.push(invalid_type_issue(field, "string", "undefined"));
        return None;
    };
    let Some(value) = value.as_str() else {
        errors.push(invalid_type_issue(field, "string", value_type_name(value)));
        return None;
    };
    let length = value.chars().count();

    if let Some(min_length) = min_length
        && length < min_length
    {
        errors.push(too_small_string_issue(field, min_length));
        return None;
    }
    if let Some(max_length) = max_length
        && length > max_length
    {
        errors.push(too_big_string_issue(field, max_length));
        return None;
    }

    Some(value.to_owned())
}

fn validate_optional_string_field(
    errors: &mut Vec<Value>,
    value: Option<&Value>,
    field: &'static str,
    max_length: Option<usize>,
) -> Option<String> {
    match value {
        None => None,
        Some(value) => validate_string_field(errors, Some(value), field, None, max_length),
    }
}

fn is_valid_domain_labels(value: &str, require_alpha_tld: bool) -> bool {
    let labels = value.split('.').collect::<Vec<_>>();

    if labels.len() < 2 {
        return false;
    }
    if require_alpha_tld
        && !labels.last().is_some_and(|label| {
            label.len() >= 2 && label.bytes().all(|byte| byte.is_ascii_alphabetic())
        })
    {
        return false;
    }

    labels.into_iter().all(is_valid_domain_label)
}

fn is_valid_domain_label(label: &str) -> bool {
    let bytes = label.as_bytes();

    !bytes.is_empty()
        && bytes.len() <= 63
        && bytes[0].is_ascii_alphanumeric()
        && bytes[bytes.len() - 1].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
}

fn is_email_local_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'%' | b'+' | b'-')
}

fn invalid_entry_type_issue() -> Value {
    json!({
        "code": "invalid_value",
        "values": ["email", "domain"],
        "path": ["entry_type"],
        "message": "Invalid option: expected one of \"email\"|\"domain\"",
    })
}

fn invalid_object_issue(value: &Value) -> Value {
    json!({
        "expected": "object",
        "code": "invalid_type",
        "path": [],
        "message": format!("Invalid input: expected object, received {}", value_type_name(value)),
    })
}

fn invalid_type_issue(
    field: &'static str,
    expected: &'static str,
    received: &'static str,
) -> Value {
    json!({
        "expected": expected,
        "code": "invalid_type",
        "path": [field],
        "message": format!("Invalid input: expected {expected}, received {received}"),
    })
}

fn too_small_string_issue(field: &'static str, minimum: usize) -> Value {
    json!({
        "origin": "string",
        "code": "too_small",
        "minimum": minimum,
        "inclusive": true,
        "path": [field],
        "message": format!("Too small: expected string to have >={minimum} characters"),
    })
}

fn too_big_string_issue(field: &'static str, maximum: usize) -> Value {
    json!({
        "origin": "string",
        "code": "too_big",
        "maximum": maximum,
        "inclusive": true,
        "path": [field],
        "message": format!("Too big: expected string to have <={maximum} characters"),
    })
}

fn value_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}
