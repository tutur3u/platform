use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const HABITS_ACCESS_PATH: &str =
    "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/habits/access";
const HABITS_ACCESS_URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/11111111-1111-4111-8111-111111111111/habits/access";
const HANDLE_HABITS_ACCESS_PATH: &str = "/api/v1/workspaces/team-alpha/habits/access";
const HANDLE_HABITS_ACCESS_URL: &str =
    "https://tuturuuu.localhost/api/v1/workspaces/team-alpha/habits/access";
const INTERNAL_HABITS_ACCESS_PATH: &str = "/api/v1/workspaces/internal/habits/access";
const INTERNAL_HABITS_ACCESS_URL: &str =
    "https://tuturuuu.localhost/api/v1/workspaces/internal/habits/access";
const PERSONAL_HABITS_ACCESS_PATH: &str = "/api/v1/workspaces/personal/habits/access";
const PERSONAL_HABITS_ACCESS_URL: &str =
    "https://tuturuuu.localhost/api/v1/workspaces/personal/habits/access";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const WORKSPACE_ID: &str = "11111111-1111-4111-8111-111111111111";

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
        path: HABITS_ACCESS_PATH,
        referer: None,
        request_id: None,
        url: Some(HABITS_ACCESS_URL),
    }
}

fn personal_request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        path: PERSONAL_HABITS_ACCESS_PATH,
        url: Some(PERSONAL_HABITS_ACCESS_URL),
        ..request(method)
    }
}

fn internal_request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        path: INTERNAL_HABITS_ACCESS_PATH,
        url: Some(INTERNAL_HABITS_ACCESS_URL),
        ..request(method)
    }
}

fn handle_request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        path: HANDLE_HABITS_ACCESS_PATH,
        url: Some(HANDLE_HABITS_ACCESS_URL),
        ..request(method)
    }
}

fn request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer user-access-token"),
        ..request(method)
    }
}

fn internal_request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer user-access-token"),
        ..internal_request(method)
    }
}

fn handle_request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer user-access-token"),
        ..handle_request(method)
    }
}

fn personal_request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer user-access-token"),
        ..personal_request(method)
    }
}

fn successful_member_responses(secret_body: &'static str) -> Vec<OutboundResponse> {
    vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, secret_body),
    ]
}

#[tokio::test]
async fn workspace_habits_access_returns_enabled_for_true_secret() {
    let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
        r#"[{"value":"true"}]"#,
    ));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "enabled": true }));
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert!(calls[1].url.contains("/rest/v1/workspace_members?"));
    assert!(calls[1].url.contains("select=type"));
    assert!(calls[1].url.contains(&format!("ws_id=eq.{WORKSPACE_ID}")));
    assert!(calls[1].url.contains("user_id=eq.user-1"));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert!(calls[2].url.contains("/rest/v1/workspace_secrets?"));
    assert!(calls[2].url.contains("select=value"));
    assert!(calls[2].url.contains(&format!("ws_id=eq.{WORKSPACE_ID}")));
    assert!(calls[2].url.contains("name=eq.ENABLE_HABITS"));
    assert!(calls[2].url.contains("order=created_at.desc"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn workspace_habits_access_resolves_internal_workspace_slug() {
    let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
        r#"[{"value":"true"}]"#,
    ));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        internal_request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "enabled": true }));
    assert!(
        outbound.calls()[1]
            .url
            .contains(&format!("ws_id=eq.{ROOT_WORKSPACE_ID}"))
    );
    assert!(
        outbound.calls()[2]
            .url
            .contains(&format!("ws_id=eq.{ROOT_WORKSPACE_ID}"))
    );
}

#[tokio::test]
async fn workspace_habits_access_resolves_workspace_handle_with_service_role_fallback() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"value":"true"}]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        handle_request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "enabled": true }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 5);
    assert!(calls[1].url.contains("/rest/v1/workspaces?"));
    assert!(calls[1].url.contains("handle=eq.team-alpha"));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer user-access-token")
    );
    assert!(calls[2].url.contains("/rest/v1/workspaces?"));
    assert!(calls[2].url.contains("handle=eq.team-alpha"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert!(calls[3].url.contains("ws_id=eq.resolved-ws"));
    assert!(calls[4].url.contains("ws_id=eq.resolved-ws"));
}

#[tokio::test]
async fn workspace_habits_access_keeps_secret_value_comparison_exact() {
    let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
        r#"[{"value":"TRUE"}]"#,
    ));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "enabled": false }));
}

#[tokio::test]
async fn workspace_habits_access_treats_missing_or_unreadable_secret_as_disabled() {
    let outbound = RecordingOutboundClient::with_responses(successful_member_responses(r#"[]"#));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "enabled": false }));

    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(500, r#"{"message":"secret lookup failed"}"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "enabled": false }));
}

#[tokio::test]
async fn workspace_habits_access_resolves_personal_workspace_for_caller() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"personal-ws"}]"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"value":"true"}]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        personal_request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "enabled": true }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert!(calls[1].url.contains("/rest/v1/workspaces?"));
    assert!(calls[1].url.contains("personal=eq.true"));
    assert!(calls[1].url.contains("workspace_members.user_id=eq.user-1"));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer user-access-token")
    );
    assert!(calls[2].url.contains("ws_id=eq.personal-ws"));
    assert!(calls[3].url.contains("ws_id=eq.personal-ws"));
}

#[tokio::test]
async fn workspace_habits_access_maps_personal_workspace_lookup_failure_to_access_error() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        personal_request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Failed to verify workspace access" })
    );
}

#[tokio::test]
async fn workspace_habits_access_requires_supabase_session() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "message": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn workspace_habits_access_rejects_app_session_bearer() {
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
    assert_eq!(response.body, json!({ "message": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn workspace_habits_access_rejects_invalid_supabase_session() {
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

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "message": "Unauthorized" }));
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn workspace_habits_access_rejects_missing_workspace_membership() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body, json!({ "message": "Forbidden" }));
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_habits_access_rejects_guest_workspace_membership() {
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
    assert_eq!(response.body, json!({ "message": "Forbidden" }));
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_habits_access_maps_membership_lookup_failure() {
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
        json!({ "message": "Failed to verify workspace access" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_habits_access_rejects_unsupported_methods() {
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
