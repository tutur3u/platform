use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, contact, infrastructure_content_exports,
    outbound::{
        OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod, OutboundRequest,
        OutboundResponse,
    },
};
use serde_json::json;
use std::cell::RefCell;
use std::collections::VecDeque;

const LESSONS_PATH: &str = "/api/v1/infrastructure/lessons";
const PACKAGES_PATH: &str = "/api/v1/infrastructure/packages";
const PRIVATE_SCHEMA: &str = "private";
const WORKSPACE_ID: &str = "11111111-1111-4111-8111-111111111111";

#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
    headers: Vec<(String, String)>,
    method: OutboundMethod,
    url: String,
}

struct RecordingOutboundClient {
    calls: RefCell<Vec<RecordedOutboundRequest>>,
    responses: RefCell<VecDeque<OutboundResponse>>,
}

impl RecordingOutboundClient {
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
            headers: request
                .headers
                .iter()
                .map(|OutboundHeader { name, value }| (name.to_string(), value.to_string()))
                .collect(),
            method: request.method,
            url: request.url.to_owned(),
        });
        let response = self
            .responses
            .borrow_mut()
            .pop_front()
            .unwrap_or_else(|| outbound_response(200, "[]"));

        Box::pin(async move { Ok(response) })
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend-test");
    config.contact_data = contact::ContactDataConfig::new(
        "https://project-ref.supabase.co",
        "test-service-role-secret",
    );
    config
}

fn request(path: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer caller-access-token"),
        body_text: None,
        cookie: None,
        method: "GET",
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers: vec![
            ("content-type".to_owned(), APPLICATION_JSON.to_owned()),
            ("content-range".to_owned(), "0-1/2".to_owned()),
        ],
        status,
    }
}

fn header<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(header, _)| header.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
}

#[tokio::test]
async fn lessons_reads_private_posts_without_auth() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"[{"id":"lesson-1"},{"id":"lesson-2"}]"#,
    )]);
    let response = infrastructure_content_exports::handle_content_export_route(
        &backend_config_with_contact_data(),
        BackendRequest {
            authorization: None,
            ..request(
                LESSONS_PATH,
                "https://backend.test/api/v1/infrastructure/lessons?ws_id=ws-1&limit=2&offset=3",
            )
        },
        &outbound,
    )
    .await
    .expect("lessons route should match");

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "count": 2,
            "data": [
                { "id": "lesson-1" },
                { "id": "lesson-2" }
            ]
        })
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert!(calls[0].url.contains("/rest/v1/user_group_posts?"));
    assert!(calls[0].url.contains("workspace_user_groups.ws_id=eq.ws-1"));
    assert_eq!(header(&calls[0], "Accept-Profile"), Some(PRIVATE_SCHEMA));
    assert_eq!(header(&calls[0], "Range"), Some("3-4"));
    assert_eq!(header(&calls[0], "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn packages_rejects_missing_auth() {
    let outbound = RecordingOutboundClient::with_responses(vec![]);
    let response = infrastructure_content_exports::handle_content_export_route(
        &backend_config_with_contact_data(),
        BackendRequest {
            authorization: None,
            ..request(
                PACKAGES_PATH,
                "https://backend.test/api/v1/infrastructure/packages?ws_id=ws-1",
            )
        },
        &outbound,
    )
    .await
    .expect("packages route should match");

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "message": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn packages_reads_workspace_products_after_view_inventory_permission() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"creator_id":"other-user"}]"#),
        outbound_response(
            200,
            r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"view_inventory"}]}}]"#,
        ),
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[{"id":"product-1"}]"#),
    ]);
    let response = infrastructure_content_exports::handle_content_export_route(
        &backend_config_with_contact_data(),
        request(
            PACKAGES_PATH,
            "https://backend.test/api/v1/infrastructure/packages?ws_id=11111111-1111-4111-8111-111111111111&limit=1&offset=5",
        ),
        &outbound,
    )
    .await
    .expect("packages route should match");

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "count": 2,
            "data": [
                { "id": "product-1" }
            ]
        })
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 6);
    let product_call = calls.last().expect("product call should be last");
    assert!(product_call.url.contains("/rest/v1/workspace_products?"));
    assert!(product_call.url.contains("ws_id=eq."));
    assert!(product_call.url.contains(WORKSPACE_ID));
    assert_eq!(
        header(product_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(header(product_call, "Range"), Some("5-5"));
    assert_eq!(header(product_call, "Prefer"), Some("count=exact"));
}
