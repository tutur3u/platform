//! runtime helpers extracted from `lib.rs` (pure movement).

use crate::*;
use serde_json::Value;

pub(crate) fn parse_json_body(body_text: Option<&str>) -> Option<Value> {
    serde_json::from_str(body_text.unwrap_or_default()).ok()
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, path),
        ("POST", "/api/v1/infrastructure/languages")
            | ("POST", "/api/v1/infrastructure/sidebar")
            | ("POST", "/api/v1/infrastructure/sidebar/sizes")
    ) || contact::should_buffer_request_body(method, path)
        || changelog::should_buffer_request_body(method, path)
        || holidays::should_buffer_request_body(method, path)
        || auth_mfa::should_buffer_request_body(method, path)
        || user_profile::should_buffer_request_body(method, path)
        || current_user_default_workspace::should_buffer_request_body(method, path)
        || current_user_calendar_settings::should_buffer_request_body(method, path)
        || onboarding_progress::should_buffer_request_body(method, path)
        || infrastructure_cron_whitelist_domain_domain::should_buffer_request_body(method, path)
        || infrastructure_cron_whitelist_domains::should_buffer_request_body(method, path)
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn content_length_exceeds_request_body_limit(content_length: Option<&str>) -> bool {
    parse_content_length(content_length).is_some_and(|value| value > MAX_REQUEST_BODY_BYTES as u128)
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn parse_content_length(content_length: Option<&str>) -> Option<u128> {
    content_length.and_then(|value| {
        let value = value.trim();
        if value.is_empty() {
            None
        } else {
            value.parse::<u128>().ok()
        }
    })
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn content_length_is_missing_or_invalid(content_length: Option<&str>) -> bool {
    parse_content_length(content_length).is_none()
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn buffered_request_body_exceeds_limit(
    method: &str,
    path: &str,
    content_length: Option<&str>,
) -> bool {
    should_buffer_request_body(method, path)
        && content_length_exceeds_request_body_limit(content_length)
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn buffered_body_text_exceeds_request_body_limit(body_text: &str) -> bool {
    body_text.len() > MAX_REQUEST_BODY_BYTES
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct RuntimeRequestParts<'a> {
    pub(crate) authorization: Option<&'a str>,
    pub(crate) content_length: Option<&'a str>,
    pub(crate) cookie: Option<&'a str>,
    pub(crate) method: &'a str,
    pub(crate) origin: Option<&'a str>,
    pub(crate) path: &'a str,
    pub(crate) referer: Option<&'a str>,
    pub(crate) request_id: Option<&'a str>,
    pub(crate) url: Option<&'a str>,
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RuntimeRequestBodyPlan {
    Buffer,
    RejectLengthRequired,
    RejectTooLarge,
    Skip,
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum RuntimeResponseHeaderOperation {
    Append(&'static str, String),
    Set(&'static str, String),
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn runtime_request_body_plan(parts: &RuntimeRequestParts<'_>) -> RuntimeRequestBodyPlan {
    if !should_buffer_request_body(parts.method, parts.path) {
        RuntimeRequestBodyPlan::Skip
    } else if content_length_is_missing_or_invalid(parts.content_length) {
        RuntimeRequestBodyPlan::RejectLengthRequired
    } else if buffered_request_body_exceeds_limit(parts.method, parts.path, parts.content_length) {
        RuntimeRequestBodyPlan::RejectTooLarge
    } else {
        RuntimeRequestBodyPlan::Buffer
    }
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn backend_request_from_runtime_parts<'a>(
    parts: RuntimeRequestParts<'a>,
    body_text: Option<&'a str>,
) -> BackendRequest<'a> {
    BackendRequest {
        authorization: parts.authorization,
        body_text,
        cookie: parts.cookie,
        method: parts.method,
        origin: parts.origin,
        path: parts.path,
        referer: parts.referer,
        request_id: parts.request_id,
        url: parts.url,
    }
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn runtime_response_header_operations(
    response: &BackendResponse,
) -> Vec<RuntimeResponseHeaderOperation> {
    let mut operations = Vec::new();

    if let Some(content_type) = response.content_type {
        operations.push(RuntimeResponseHeaderOperation::Set(
            "Content-Type",
            content_type.to_owned(),
        ));
    }

    if let Some(allow) = response.allow {
        operations.push(RuntimeResponseHeaderOperation::Set(
            "Allow",
            allow.to_owned(),
        ));
    }

    if let Some(cache_control) = response.cache_control {
        operations.push(RuntimeResponseHeaderOperation::Set(
            "Cache-Control",
            cache_control.to_owned(),
        ));
    }

    if response.content_type == Some(APPLICATION_JSON) {
        for &(name, value) in json_security_headers() {
            operations.push(RuntimeResponseHeaderOperation::Set(name, value.to_owned()));
        }
    }

    for (name, value) in &response.headers {
        operations.push(RuntimeResponseHeaderOperation::Append(name, value.clone()));
    }

    operations
}
