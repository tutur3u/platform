//! response helpers extracted from `lib.rs` (pure movement).

use crate::*;
use serde::Serialize;
use serde_json::{Value, json};

pub(crate) fn success_response() -> BackendResponse {
    json_response(200, json!({ "message": "Success" }))
}

pub(crate) fn not_implemented_response() -> BackendResponse {
    json_response(501, json!({ "message": "Not implemented" }))
}

pub(crate) fn set_cookie_success_response(
    cookie_name: &str,
    cookie_value: &str,
) -> BackendResponse {
    let mut response = success_response();
    response
        .headers
        .push(("set-cookie", format_cookie(cookie_name, cookie_value)));
    response
}

pub(crate) fn delete_cookie_success_response(cookie_name: &'static str) -> BackendResponse {
    let mut response = success_response();
    response
        .headers
        .push(("set-cookie", format!("{cookie_name}={COOKIE_DELETE_VALUE}")));
    response
}

pub(crate) fn format_cookie(cookie_name: &str, cookie_value: &str) -> String {
    format!("{cookie_name}={cookie_value}; Path=/")
}

pub(crate) fn json_response(status: u16, payload: impl Serialize) -> BackendResponse {
    json_response_inner(status, payload, None)
}

pub(crate) fn json_response_with_cache_control(
    status: u16,
    payload: impl Serialize,
    cache_control: &'static str,
) -> BackendResponse {
    json_response_inner(status, payload, Some(cache_control))
}

pub(crate) fn json_response_inner(
    status: u16,
    payload: impl Serialize,
    cache_control: Option<&'static str>,
) -> BackendResponse {
    BackendResponse {
        allow: None,
        body: serde_json::to_value(payload).unwrap_or_else(|_| json!({ "error": "serialize" })),
        body_empty: false,
        body_text: None,
        cache_control,
        content_type: Some(APPLICATION_JSON),
        headers: Vec::new(),
        status,
    }
}

pub(crate) fn text_response(
    status: u16,
    body: impl Into<String>,
    content_type: &'static str,
) -> BackendResponse {
    BackendResponse {
        allow: None,
        body: Value::Null,
        body_empty: false,
        body_text: Some(body.into()),
        cache_control: None,
        content_type: Some(content_type),
        headers: Vec::new(),
        status,
    }
}

pub(crate) fn request_body_too_large_response() -> BackendResponse {
    json_response(
        413,
        json!({
            "error": "request body too large",
            "maxBytes": MAX_REQUEST_BODY_BYTES,
        }),
    )
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
pub(crate) fn request_body_length_required_response() -> BackendResponse {
    json_response(
        411,
        json!({
            "error": "request body content length required",
            "maxBytes": MAX_REQUEST_BODY_BYTES,
        }),
    )
}

pub(crate) fn empty_response(status: u16) -> BackendResponse {
    BackendResponse {
        allow: None,
        body: Value::Null,
        body_empty: true,
        body_text: None,
        cache_control: None,
        content_type: None,
        headers: Vec::new(),
        status,
    }
}

pub(crate) fn empty_response_with_cache_control(
    status: u16,
    cache_control: &'static str,
) -> BackendResponse {
    let mut response = empty_response(status);
    response.cache_control = Some(cache_control);
    response
}

pub(crate) fn no_store_response(mut response: BackendResponse) -> BackendResponse {
    response.cache_control = Some(NO_STORE_CACHE_CONTROL);
    response
        .headers
        .push(("cdn-cache-control", NO_STORE_CDN_CACHE_CONTROL.to_owned()));
    response
}

pub(crate) fn method_not_allowed(_method: &str, allow: &'static str) -> BackendResponse {
    BackendResponse {
        allow: Some(allow),
        body: json!({ "error": "method not allowed" }),
        body_empty: false,
        body_text: None,
        cache_control: None,
        content_type: Some(APPLICATION_JSON),
        headers: Vec::new(),
        status: 405,
    }
}
