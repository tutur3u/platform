use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const MENTIONS_PATH: &str = "/api/v1/workspaces/ws-1/Mention";
const MENTIONS_URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/ws-1/Mention";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";

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
        if_none_match: None,
        method,
        origin: None,
        path: MENTIONS_PATH,
        referer: None,
        request_id: None,
        url: Some(MENTIONS_URL),
    }
}

fn request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method)
    }
}

#[tokio::test]
async fn workspace_mentions_returns_workspace_emails_with_caller_token() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(
            200,
            r#"[{"email":"ada@example.com"},{"email":"grace@example.com"}]"#,
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
        json!({ "email": ["ada@example.com", "grace@example.com"] })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert!(calls[1].url.contains("/rest/v1/workspace_members?"));
    assert!(calls[1].url.contains("select=type"));
    assert!(calls[1].url.contains("ws_id=eq.ws-1"));
    assert!(calls[1].url.contains("user_id=eq.user-1"));
    assert!(calls[2].url.contains("/rest/v1/workspace_users?"));
    assert!(calls[2].url.contains("select=email"));
    assert!(calls[2].url.contains("ws_id=eq.ws-1"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer browser-access-token")
    );
}

#[tokio::test]
async fn workspace_mentions_requires_supabase_session() {
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
async fn workspace_mentions_rejects_missing_workspace_membership() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "[]"),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body, json!({ "error": "Forbidden" }));
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_mentions_rejects_guest_workspace_membership() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"GUEST"}]"#),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body, json!({ "error": "Forbidden" }));
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_mentions_maps_membership_lookup_failure() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(500, r#"{"message":"workspace_members failed"}"#),
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
        json!({ "error": "Failed to verify workspace access" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_mentions_maps_invalid_membership_json_to_lookup_failure() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "not json"),
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
        json!({ "error": "Failed to verify workspace access" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_mentions_preserves_workspace_user_error_message() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(400, r#"{"message":"email select failed"}"#),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body, json!({ "error": "email select failed" }));
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn workspace_mentions_rejects_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("POST"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert!(outbound.calls().is_empty());
}
