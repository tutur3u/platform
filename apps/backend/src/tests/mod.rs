//! Backend unit-test suite (split by area to stay under the 700-LOC ceiling).
//!
//! Shared `use` imports + test helpers (`request`, `RecordingOutboundClient`,
//! `backend_config_*`) live here; the actual `#[test]`/`#[tokio::test]` cases are
//! grouped into `g00`..`gNN` submodules that pull these in via `use super::*`.

use super::contact::{
    APP_SESSION_COOKIE_NAME, APP_SESSION_SCOPE, AppCoordinationClaims,
    CONTACT_DATA_LAYER_NOT_READY_MESSAGE, CURRENT_USER_FULL_NAME_PATH, CURRENT_USER_PROFILE_PATH,
    SUPPORT_INQUIRIES_PATH, verify_app_session_token,
};
use super::onboarding_progress::ONBOARDING_PROGRESS_PATH;
use super::outbound::{
    OutboundError, OutboundFuture, OutboundHttpClient, OutboundMethod, OutboundRequest,
    OutboundResponse,
};
use super::*;
use std::{cell::RefCell, collections::VecDeque};
fn request(method: &'static str, path: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some("https://tuturuuu.localhost/test"),
    }
}
fn request_with_body(
    method: &'static str,
    path: &'static str,
    body_text: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        body_text: Some(body_text),
        ..request(method, path)
    }
}
fn authorized_request(method: &'static str, path: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer secret"),
        ..request(method, path)
    }
}
fn backend_config_with_internal_token() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.internal_token = "secret".to_owned();
    config
}
fn backend_config_with_app_session_secret() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config
        .app_coordination_secrets
        .push("test-app-session-secret".to_owned());
    config
}
fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = backend_config_with_internal_token();
    config
        .app_coordination_secrets
        .push("test-app-session-secret".to_owned());
    config.contact_data = contact::ContactDataConfig::new(
        "https://project-ref.supabase.co/",
        "test-service-role-secret",
    );
    config
}
fn backend_config_with_aurora_health() -> BackendConfig {
    let mut config = backend_config_with_contact_data();
    config.aurora_external_url = "https://aurora.example.test/".to_owned();
    config.aurora_external_workspace_id = "aurora-workspace".to_owned();
    config
}
fn backend_config_with_discord_cron() -> BackendConfig {
    let mut config = backend_config_with_internal_token();
    config.cron_secret = "cron-secret".to_owned();
    config.discord_app_deployment_url = "https://discord.example.test".to_owned();
    config
}
#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
    body: Option<String>,
    headers: Vec<(String, String)>,
    method: OutboundMethod,
    url: String,
}
struct RecordingOutboundClient {
    calls: RefCell<Vec<RecordedOutboundRequest>>,
    responses: RefCell<VecDeque<OutboundResponse>>,
}
impl Default for RecordingOutboundClient {
    fn default() -> Self {
        Self::with_response(200, r#"{"ok":true}"#)
    }
}
impl RecordingOutboundClient {
    fn with_response(status: u16, body_text: impl Into<String>) -> Self {
        Self::with_responses(vec![outbound_response(status, body_text)])
    }

    fn with_responses(responses: Vec<OutboundResponse>) -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            responses: RefCell::new(VecDeque::from(responses)),
        }
    }

    fn calls(&self) -> Vec<RecordedOutboundRequest> {
        self.calls.borrow().clone()
    }
}
impl OutboundHttpClient for RecordingOutboundClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        self.calls.borrow_mut().push(RecordedOutboundRequest {
            body: request.body.map(str::to_owned),
            headers: request
                .headers
                .iter()
                .map(|header| (header.name.to_owned(), header.value.to_owned()))
                .collect(),
            method: request.method,
            url: request.url.to_owned(),
        });
        let response = self
            .responses
            .borrow_mut()
            .pop_front()
            .unwrap_or_else(|| outbound_response(200, r#"{"ok":true}"#));

        Box::pin(async move { Ok(response) })
    }
}
fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    outbound_response_with_headers(status, body_text, Vec::new())
}
fn outbound_response_with_headers(
    status: u16,
    body_text: impl Into<String>,
    headers: Vec<(String, String)>,
) -> OutboundResponse {
    let mut response_headers = vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())];
    response_headers.extend(headers);

    OutboundResponse {
        body_text: body_text.into(),
        headers: response_headers,
        status,
    }
}
fn supabase_auth_cookie_value(access_token: &str) -> String {
    format!(
        "base64-{}",
        contact::encode_app_session_part(format!(r#"{{"access_token":"{access_token}"}}"#))
    )
}
fn leaked_test_str(value: String) -> &'static str {
    Box::leak(value.into_boxed_str())
}
fn decoded_query_value(raw_url: &str, key: &str) -> Option<String> {
    url::Url::parse(raw_url)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}
fn request_with_origin(
    method: &'static str,
    path: &'static str,
    origin: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        origin: Some(origin),
        ..request(method, path)
    }
}
fn request_with_cookie(
    method: &'static str,
    path: &'static str,
    cookie: String,
) -> BackendRequest<'static> {
    BackendRequest {
        cookie: Some(Box::leak(cookie.into_boxed_str())),
        url: Some("https://tanstack.tuturuuu.localhost/contact"),
        ..request(method, path)
    }
}
fn request_with_bearer(
    method: &'static str,
    path: &'static str,
    token: String,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some(Box::leak(format!("Bearer {token}").into_boxed_str())),
        url: Some("https://tanstack.tuturuuu.localhost/contact"),
        ..request(method, path)
    }
}
fn app_session_claims(target_app: &str, scopes: Vec<&str>, exp: u64) -> AppCoordinationClaims {
    AppCoordinationClaims {
        aud: contact::app_coordination_token_audience().to_owned(),
        email: Some("app-session@example.com".to_owned()),
        exp,
        iat: 0,
        iss: contact::app_coordination_token_issuer().to_owned(),
        jti: "test-jti".to_owned(),
        origin_app: "web".to_owned(),
        scopes: scopes.into_iter().map(str::to_owned).collect(),
        sub: "app-session-user-1".to_owned(),
        target_app: target_app.to_owned(),
        typ: "app_coordination".to_owned(),
    }
}
fn app_session_token(claims: &AppCoordinationClaims) -> String {
    let encoded_header = contact::encode_app_session_part(r#"{"alg":"HS256","typ":"JWT"}"#);
    let encoded_payload = contact::encode_app_session_part(serde_json::to_string(claims).unwrap());
    let unsigned = format!("{encoded_header}.{encoded_payload}");
    let signature = contact::sign_app_coordination_content(&unsigned, "test-app-session-secret")
        .expect("test app-session signature");

    format!(
        "{}{unsigned}.{signature}",
        contact::app_coordination_token_prefix()
    )
}
fn valid_app_session_token() -> String {
    app_session_token(&app_session_claims(
        "platform",
        vec![APP_SESSION_SCOPE, "cli:access"],
        4_102_444_800,
    ))
}
fn header_value<'a>(response: &'a BackendResponse, header: &str) -> Option<&'a str> {
    response
        .headers
        .iter()
        .find(|(name, _)| *name == header)
        .map(|(_, value)| value.as_str())
}
fn recorded_header<'a>(request: &'a RecordedOutboundRequest, header: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(header))
        .map(|(_, value)| value.as_str())
}
fn assert_mobile_version_policy_row(rows: &[Value], id: &str, value: &str) {
    let row = rows
        .iter()
        .find(|row| row["id"] == id)
        .unwrap_or_else(|| panic!("missing mobile version policy row {id}"));

    assert_eq!(row["value"], value);
}
fn sha256_hex_for_test(value: &str) -> String {
    let digest = <sha2::Sha256 as sha2::Digest>::digest(value.as_bytes());
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        let _ = std::fmt::Write::write_fmt(&mut encoded, format_args!("{byte:02x}"));
    }
    encoded
}
fn browser_recovery_request(
    origin: Option<&'static str>,
    referer: Option<&'static str>,
    cookie: Option<&'static str>,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie,
        method: "POST",
        origin,
        path: BROWSER_STATE_RECOVERY_PATH,
        referer,
        request_id: None,
        url: Some("https://tuturuuu.localhost/~recover-browser-state"),
    }
}

mod g00;
mod g01;
mod g02;
mod g03;
mod g04;
mod g05;
mod g06;
mod g07;
mod g08;
mod g09;
mod g10;
mod g11;
mod g12;
mod g13;
mod g14;
mod g15;
mod g16;
