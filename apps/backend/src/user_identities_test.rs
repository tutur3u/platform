use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const USER_IDENTITIES_CACHE_CONTROL: &str = "private, max-age=30, stale-while-revalidate=30";
const USER_IDENTITIES_PATH: &str = "/api/v1/users/me/identities";
const USER_IDENTITIES_URL: &str = "https://tuturuuu.localhost/api/v1/users/me/identities";

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
        path: USER_IDENTITIES_PATH,
        referer: None,
        request_id: None,
        url: Some(USER_IDENTITIES_URL),
    }
}

fn request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method)
    }
}

#[tokio::test]
async fn user_identities_returns_linked_identities_and_can_unlink_flag() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","identities":[{"id":"identity-1","provider":"email"},{"id":"identity-2","provider":"google","identity_data":{"email":"ada@example.com"}}]}"#,
    )]);

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
            "identities": [
                { "id": "identity-1", "provider": "email" },
                {
                    "id": "identity-2",
                    "provider": "google",
                    "identity_data": { "email": "ada@example.com" }
                }
            ],
            "canUnlink": true
        })
    );
    assert_eq!(response.cache_control, Some(USER_IDENTITIES_CACHE_CONTROL));
    assert!(
        response
            .headers
            .iter()
            .all(|(name, _)| !name.eq_ignore_ascii_case("cdn-cache-control"))
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(recorded_header(&calls[0], "apikey"), Some(SERVICE_ROLE_KEY));
}

#[tokio::test]
async fn user_identities_defaults_missing_identity_list_to_empty() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"ada@example.com"}"#,
    )]);

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
            "identities": [],
            "canUnlink": false
        })
    );
}

#[tokio::test]
async fn user_identities_requires_two_identities_before_unlink_is_allowed() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","identities":[{"id":"identity-1","provider":"email"}]}"#,
    )]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["canUnlink"], json!(false));
}

#[tokio::test]
async fn user_identities_requires_supabase_session() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn user_identities_rejects_app_session_bearer() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        BackendRequest {
            authorization: Some("Bearer ttr_app_fake"),
            ..request("GET")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn user_identities_maps_supabase_auth_error_messages_to_legacy_bad_request() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        401,
        r#"{"message":"JWT expired"}"#,
    )]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body, json!({ "message": "JWT expired" }));
    assert!(response.headers.iter().any(|(name, value)| {
        name.eq_ignore_ascii_case("cdn-cache-control") && value == "no-store"
    }));
}

#[tokio::test]
async fn user_identities_falls_back_to_default_auth_error_message() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(500, "{}")]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(
        response.body,
        json!({ "message": "Failed to load linked identities" })
    );
}

#[tokio::test]
async fn user_identities_returns_internal_error_for_invalid_success_json() {
    let outbound =
        RecordingOutboundClient::with_responses(vec![outbound_response(200, "not-json")]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body, json!({ "message": "Internal server error" }));
}

#[tokio::test]
async fn user_identities_returns_internal_error_for_transport_failure() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body, json!({ "message": "Internal server error" }));
}

#[tokio::test]
async fn user_identities_rejects_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("POST"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert!(outbound.calls().is_empty());
}
