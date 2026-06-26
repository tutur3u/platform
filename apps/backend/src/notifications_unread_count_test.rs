use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const NOTIFICATIONS_UNREAD_COUNT_PATH: &str = "/api/v1/notifications/unread-count";
const NOTIFICATIONS_UNREAD_COUNT_URL: &str =
    "https://tuturuuu.localhost/api/v1/notifications/unread-count";
const NOTIFICATIONS_UNREAD_COUNT_SCOPED_URL: &str = "https://tuturuuu.localhost/api/v1/notifications/unread-count?wsId=11111111-1111-1111-1111-111111111111";
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

fn outbound_count_response(total: usize) -> OutboundResponse {
    OutboundResponse {
        body_text: "[]".to_owned(),
        headers: vec![("content-range".to_owned(), format!("0-0/{total}"))],
        status: 200,
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co/", SERVICE_ROLE_KEY);
    config
}

fn request(method: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        method,
        origin: None,
        path: NOTIFICATIONS_UNREAD_COUNT_PATH,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn request_with_bearer(method: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method, url)
    }
}

#[tokio::test]
async fn notifications_unread_count_returns_scoped_count() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"Ada@Example.COM"}"#),
        outbound_response(
            200,
            r#"[{"ws_id":"11111111-1111-1111-1111-111111111111"},{"ws_id":"22222222-2222-2222-2222-222222222222"}]"#,
        ),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_count_response(7),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET", NOTIFICATIONS_UNREAD_COUNT_SCOPED_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "count": 7 }));
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );

    assert!(calls[1].url.contains("/rest/v1/workspace_members?"));
    assert!(calls[1].url.contains("select=ws_id"));
    assert!(calls[1].url.contains("user_id=eq.user-1"));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer browser-access-token")
    );

    assert!(calls[2].url.contains("/rest/v1/workspace_members?"));
    assert!(
        calls[2]
            .url
            .contains("ws_id=eq.11111111-1111-1111-1111-111111111111")
    );
    assert!(calls[2].url.contains("select=type"));

    assert!(calls[3].url.contains("/rest/v1/notifications?"));
    assert!(calls[3].url.contains("select=id"));
    assert!(calls[3].url.contains("read_at=is.null"));
    assert!(
        calls[3]
            .url
            .contains("ws_id=eq.11111111-1111-1111-1111-111111111111")
    );
    assert!(calls[3].url.contains("scope.in.%28user%2Csystem%29"));
    assert!(calls[3].url.contains("email.eq.%22ada%40example.com%22"));
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(recorded_header(&calls[3], "Prefer"), Some("count=exact"));
    assert_eq!(recorded_header(&calls[3], "Range"), Some("0-0"));
}

#[tokio::test]
async fn notifications_unread_count_rejects_invalid_workspace_query() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"ada@example.com"}"#,
    )]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "GET",
            "https://tuturuuu.localhost/api/v1/notifications/unread-count?wsId=not-a-guid",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"], json!("Invalid query parameters"));
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn notifications_unread_count_requires_session_and_claims_route() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("GET", NOTIFICATIONS_UNREAD_COUNT_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn notifications_unread_count_rejects_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("POST", NOTIFICATIONS_UNREAD_COUNT_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body, json!({ "error": "method not allowed" }));
    assert!(outbound.calls().is_empty());
}
