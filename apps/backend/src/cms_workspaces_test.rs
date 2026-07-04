use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const CMS_WORKSPACES_PATH: &str = "/api/v1/cms/workspaces";
const CMS_WORKSPACES_URL: &str = "https://tuturuuu.localhost/api/v1/cms/workspaces";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const CMS_WORKSPACE_ID: &str = "11111111-1111-1111-1111-111111111111";

#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
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

fn query_value(request: &RecordedOutboundRequest, key: &str) -> Option<String> {
    url::Url::parse(&request.url)
        .ok()?
        .query_pairs()
        .find(|(query_key, _)| query_key == key)
        .map(|(_, value)| value.into_owned())
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
        path: CMS_WORKSPACES_PATH,
        referer: None,
        request_id: None,
        url: Some(CMS_WORKSPACES_URL),
    }
}

fn request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method)
    }
}

#[tokio::test]
async fn cms_workspaces_returns_root_admin_accessible_workspaces() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@example.com"}"#),
        outbound_response(
            200,
            r#"[
                {
                    "id":"00000000-0000-0000-0000-000000000000",
                    "name":"Root",
                    "avatar_url":null,
                    "logo_url":null,
                    "personal":false,
                    "created_at":"2026-01-01T00:00:00Z",
                    "workspace_members":[{"user_id":"user-1"}]
                },
                {
                    "id":"11111111-1111-1111-1111-111111111111",
                    "name":"CMS",
                    "avatar_url":"https://example.com/avatar.png",
                    "logo_url":null,
                    "personal":false,
                    "created_at":"2026-01-02T00:00:00Z",
                    "workspace_members":[{"user_id":"user-1"}]
                }
            ]"#,
        ),
        outbound_response(200, "[]"),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"creator_id":"user-1"}]"#),
        outbound_response(
            200,
            r#"[{"canonical_project_id":"canonical-1","is_enabled":true}]"#,
        ),
        outbound_response(200, r#"[{"is_active":true}]"#),
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
        json!([
            {
                "id": ROOT_WORKSPACE_ID,
                "name": "Root",
                "avatar_url": null,
                "logo_url": null,
                "personal": false,
                "created_at": "2026-01-01T00:00:00Z",
                "workspace_members": [{"user_id": "user-1"}],
                "tier": null,
            },
            {
                "id": CMS_WORKSPACE_ID,
                "name": "CMS",
                "avatar_url": "https://example.com/avatar.png",
                "logo_url": null,
                "personal": false,
                "created_at": "2026-01-02T00:00:00Z",
                "workspace_members": [{"user_id": "user-1"}],
                "tier": null,
            },
        ])
    );
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 7);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );

    let workspaces_call = &calls[1];
    assert_eq!(workspaces_call.method, OutboundMethod::Get);
    assert!(workspaces_call.url.contains("/rest/v1/workspaces?"));
    assert_eq!(
        query_value(workspaces_call, "select").as_deref(),
        Some("id,name,avatar_url,logo_url,personal,created_at,workspace_members!inner(user_id)")
    );
    assert_eq!(
        query_value(workspaces_call, "workspace_members.user_id").as_deref(),
        Some("eq.user-1")
    );
    assert_eq!(
        recorded_header(workspaces_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );

    let subscriptions_call = &calls[2];
    assert!(
        subscriptions_call
            .url
            .contains("/rest/v1/workspace_subscriptions?")
    );
    assert_eq!(
        query_value(subscriptions_call, "ws_id").as_deref(),
        Some("in.(00000000-0000-0000-0000-000000000000,11111111-1111-1111-1111-111111111111)")
    );

    let root_membership_call = &calls[3];
    assert_eq!(
        query_value(root_membership_call, "ws_id").as_deref(),
        Some("eq.00000000-0000-0000-0000-000000000000")
    );
    assert_eq!(
        query_value(root_membership_call, "user_id").as_deref(),
        Some("eq.user-1")
    );

    let root_creator_call = &calls[4];
    assert_eq!(
        query_value(root_creator_call, "select").as_deref(),
        Some("creator_id")
    );

    let binding_call = &calls[5];
    assert!(
        binding_call
            .url
            .contains("/rest/v1/workspace_external_project_bindings?")
    );
    assert_eq!(
        query_value(binding_call, "ws_id").as_deref(),
        Some("eq.11111111-1111-1111-1111-111111111111")
    );

    let canonical_project_call = &calls[6];
    assert!(
        canonical_project_call
            .url
            .contains("/rest/v1/canonical_external_projects?")
    );
    assert_eq!(
        query_value(canonical_project_call, "id").as_deref(),
        Some("eq.canonical-1")
    );
}

#[tokio::test]
async fn cms_workspaces_requires_session_and_claims_route() {
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
async fn cms_workspaces_rejects_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("POST"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body, json!({ "error": "method not allowed" }));
    assert!(outbound.calls().is_empty());
}
