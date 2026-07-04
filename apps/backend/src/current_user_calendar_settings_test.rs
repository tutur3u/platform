use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::{Value, json};
use std::{cell::RefCell, collections::VecDeque};

const CALENDAR_SETTINGS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=30";
const CALENDAR_SETTINGS_PATH: &str = "/api/v1/users/calendar-settings";
const CALENDAR_SETTINGS_URL: &str = "https://tuturuuu.localhost/api/v1/users/calendar-settings";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const TEST_APP_SESSION_SECRET: &str = "test-app-session-secret";

#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
    body: Option<String>,
    headers: Vec<(String, String)>,
    method: OutboundMethod,
    url: String,
}

#[derive(Default)]
struct RecordingOutboundClient {
    calls: RefCell<Vec<RecordedOutboundRequest>>,
    responses: RefCell<VecDeque<OutboundResponse>>,
}

impl RecordingOutboundClient {
    fn with_responses(responses: Vec<OutboundResponse>) -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            responses: RefCell::new(responses.into()),
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
            headers: recorded_headers(&request.headers),
            method: request.method,
            url: request.url.to_owned(),
        });

        let response = self.responses.borrow_mut().pop_front();

        Box::pin(async move {
            response.ok_or_else(|| OutboundError::Transport("missing test response".to_owned()))
        })
    }
}

fn recorded_headers(headers: &[OutboundHeader<'_>]) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|header| (header.name.to_owned(), header.value.to_owned()))
        .collect()
}

fn recorded_header<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
}

fn outbound_response(status: u16, body_text: &'static str) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.to_owned(),
        headers: Vec::new(),
        status,
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config
        .app_coordination_secrets
        .push(TEST_APP_SESSION_SECRET.to_owned());
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co/", SERVICE_ROLE_KEY);
    config
}

fn request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        method,
        origin: None,
        path: CALENDAR_SETTINGS_PATH,
        referer: None,
        request_id: None,
        url: Some(CALENDAR_SETTINGS_URL),
    }
}

fn request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method)
    }
}

fn request_with_body(body_text: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        body_text: Some(body_text),
        ..request_with_bearer("PATCH")
    }
}

fn app_session_token(target_app: &str) -> String {
    let header = contact::encode_app_session_part(br#"{"alg":"HS256","typ":"JWT"}"#);
    let payload = contact::encode_app_session_part(
        serde_json::to_string(&contact::AppCoordinationClaims {
            aud: contact::app_coordination_token_audience().to_owned(),
            email: Some("calendar@example.com".to_owned()),
            exp: 4_102_444_800,
            iat: 1_700_000_000,
            iss: contact::app_coordination_token_issuer().to_owned(),
            jti: "calendar-settings-test".to_owned(),
            origin_app: "calendar".to_owned(),
            scopes: vec![contact::APP_SESSION_SCOPE.to_owned()],
            sub: "calendar-user-1".to_owned(),
            target_app: target_app.to_owned(),
            typ: "app_coordination".to_owned(),
        })
        .expect("app-session payload"),
    );
    let unsigned = format!("{header}.{payload}");
    let signature = contact::sign_app_coordination_content(&unsigned, TEST_APP_SESSION_SECRET)
        .expect("app-session signature");

    format!(
        "{}{unsigned}.{signature}",
        contact::app_coordination_token_prefix()
    )
}

fn calendar_app_session_request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some(Box::leak(
            format!("Bearer {}", app_session_token("calendar")).into_boxed_str(),
        )),
        ..request(method)
    }
}

#[tokio::test]
async fn calendar_settings_get_returns_existing_settings_for_browser_session() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(
            200,
            r#"{"timezone":"Asia/Ho_Chi_Minh","first_day_of_week":"monday","time_format":"24h"}"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "timezone": "Asia/Ho_Chi_Minh",
            "first_day_of_week": "monday",
            "time_format": "24h",
        })
    );
    assert_eq!(
        response.cache_control,
        Some(CALENDAR_SETTINGS_CACHE_CONTROL)
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        recorded_header(&calls[1], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert!(calls[1].url.contains("/rest/v1/user_private_details?"));
    assert!(calls[1].url.contains("user_id=eq.user-1"));
}

#[tokio::test]
async fn calendar_settings_get_defaults_null_values_to_auto() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(
            200,
            r#"{"timezone":null,"first_day_of_week":null,"time_format":null}"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "timezone": "auto",
            "first_day_of_week": "auto",
            "time_format": "auto",
        })
    );
}

#[tokio::test]
async fn calendar_settings_get_accepts_calendar_app_session() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"timezone":"UTC","first_day_of_week":"sunday","time_format":"12h"}"#,
    )]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        calendar_app_session_request("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["timezone"], json!("UTC"));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert!(calls[0].url.contains("user_id=eq.calendar-user-1"));
}

#[tokio::test]
async fn calendar_settings_rejects_missing_or_wrong_auth() {
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("GET"),
        &RecordingOutboundClient::default(),
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        BackendRequest {
            authorization: Some(Box::leak(
                format!("Bearer {}", app_session_token("finance")).into_boxed_str(),
            )),
            ..request("GET")
        },
        &RecordingOutboundClient::default(),
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
}

#[tokio::test]
async fn calendar_settings_get_maps_data_errors_to_legacy_body() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(500, r#"{"message":"database unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "error": "Failed to fetch user calendar settings" })
    );
}

#[tokio::test]
async fn calendar_settings_patch_updates_allowed_fields() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(
            200,
            r#"{"timezone":"Europe/Paris","first_day_of_week":"saturday","time_format":"12h"}"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_body(
            r#"{"timezone":"Europe/Paris","first_day_of_week":"saturday","time_format":"12h","ignored":true}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "timezone": "Europe/Paris",
            "first_day_of_week": "saturday",
            "time_format": "12h",
        })
    );
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Patch);
    assert_eq!(
        recorded_header(&calls[1], "Prefer"),
        Some("return=representation")
    );
    let body = serde_json::from_str::<Value>(calls[1].body.as_deref().unwrap()).unwrap();
    assert_eq!(body["timezone"], json!("Europe/Paris"));
    assert_eq!(body["first_day_of_week"], json!("saturday"));
    assert_eq!(body["time_format"], json!("12h"));
    assert!(body.get("ignored").is_none());
}

#[tokio::test]
async fn calendar_settings_patch_validates_body() {
    let outbound =
        RecordingOutboundClient::with_responses(vec![outbound_response(200, r#"{"id":"user-1"}"#)]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_body(r#"{"timezone":123,"first_day_of_week":"friday","time_format":"13h"}"#),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"], json!("Invalid request data"));
    assert!(response.body["details"].as_array().unwrap().len() >= 3);
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn calendar_settings_patch_maps_update_errors_to_legacy_body() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(500, r#"{"message":"database unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_body(r#"{"timezone":"UTC"}"#),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "error": "Failed to update user calendar settings" })
    );
}

#[tokio::test]
async fn calendar_settings_route_rejects_unsupported_methods() {
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("POST"),
        &RecordingOutboundClient::default(),
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, PATCH"));
}
