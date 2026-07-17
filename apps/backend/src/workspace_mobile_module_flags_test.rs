use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const MODULE_FLAGS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=60";
const MODULE_FLAGS_PATH: &str = "/api/v1/workspaces/ws-1/mobile/module-flags";
const MODULE_FLAGS_URL: &str =
    "https://tuturuuu.localhost/api/v1/workspaces/ws-1/mobile/module-flags";
const ROOT_MODULE_FLAGS_PATH: &str = "/api/v1/workspaces/internal/mobile/module-flags";
const ROOT_MODULE_FLAGS_URL: &str =
    "https://tuturuuu.localhost/api/v1/workspaces/internal/mobile/module-flags";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
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
        path: MODULE_FLAGS_PATH,
        referer: None,
        request_id: None,
        url: Some(MODULE_FLAGS_URL),
    }
}

fn root_workspace_request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        path: ROOT_MODULE_FLAGS_PATH,
        url: Some(ROOT_MODULE_FLAGS_URL),
        ..request(method)
    }
}

fn request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method)
    }
}

fn root_workspace_request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..root_workspace_request(method)
    }
}

fn successful_member_responses(secret_body: &'static str) -> Vec<OutboundResponse> {
    vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"ws_id":"ws-1"}]"#),
        outbound_response(200, secret_body),
    ]
}

#[tokio::test]
async fn workspace_mobile_module_flags_returns_sorted_hidden_modules() {
    let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
        r#"[{"name":"MOBILE_HIDDEN_MODULES","value":"[\"drive\",\"custom\",7,\"cms\"]"},{"name":"MOBILE_HIDE_EXPERIMENTAL_MODULES","value":"yes"}]"#,
    ));

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
            "hiddenModuleIds": [
                "cms",
                "crm",
                "custom",
                "documents",
                "drive",
                "education",
                "inventory",
                "meet"
            ]
        })
    );
    assert_eq!(response.cache_control, Some(MODULE_FLAGS_CACHE_CONTROL));
    assert!(
        response
            .headers
            .iter()
            .all(|(name, _)| !name.eq_ignore_ascii_case("cdn-cache-control"))
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert!(calls[1].url.contains("/rest/v1/workspace_members?"));
    assert!(calls[1].url.contains("select=ws_id"));
    assert!(calls[1].url.contains("ws_id=eq.ws-1"));
    assert!(calls[1].url.contains("user_id=eq.user-1"));
    assert!(calls[2].url.contains("/rest/v1/workspace_secrets?"));
    assert!(calls[2].url.contains("select=name%2Cvalue"));
    assert!(calls[2].url.contains("ws_id=eq.ws-1"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn workspace_mobile_module_flags_supports_comma_secret_fallback() {
    let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
        r#"[{"name":"MOBILE_HIDDEN_MODULES","value":"reports, drive, , crm"},{"name":"MOBILE_HIDE_EXPERIMENTAL_MODULES","value":"false"}]"#,
    ));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({ "hiddenModuleIds": ["crm", "drive", "reports"] })
    );
}

#[tokio::test]
async fn workspace_mobile_module_flags_resolves_internal_workspace_slug() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"ws_id":"00000000-0000-0000-0000-000000000000"}]"#),
        outbound_response(200, r#"[]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        root_workspace_request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "hiddenModuleIds": [] }));
    assert!(
        outbound.calls()[1]
            .url
            .contains(&format!("ws_id=eq.{ROOT_WORKSPACE_ID}"))
    );
}

#[tokio::test]
async fn workspace_mobile_module_flags_requires_supabase_session() {
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
async fn workspace_mobile_module_flags_rejects_app_session_bearer() {
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
async fn workspace_mobile_module_flags_rejects_invalid_auth() {
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
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn workspace_mobile_module_flags_rejects_missing_membership() {
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
    assert_eq!(
        response.body,
        json!({ "error": "You don't have access to this workspace" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_mobile_module_flags_maps_membership_lookup_failure() {
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
        json!({ "error": "Failed to verify workspace membership" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_mobile_module_flags_maps_secret_lookup_failure() {
    let outbound =
        RecordingOutboundClient::with_responses(successful_member_responses(r#"not json"#));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "error": "Failed to load mobile module flags" })
    );
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn workspace_mobile_module_flags_rejects_unsupported_methods() {
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
