use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, contact,
    infrastructure_cron_whitelist_domain_domain, infrastructure_cron_whitelist_domains,
    outbound::{
        OutboundFuture, OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse,
    },
};
use std::cell::RefCell;
use std::collections::VecDeque;

const COLLECTION_PATH: &str = "/api/v1/infrastructure/cron/whitelist/domains";
const DETAIL_PATH: &str = "/api/v1/infrastructure/cron/whitelist/domain/example.com";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";

#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
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

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend-test");
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co", SERVICE_ROLE_KEY);
    config
}

fn request(
    method: &'static str,
    path: &'static str,
    body_text: Option<&'static str>,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        body_text,
        cookie: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some("https://backend.test/api/v1/infrastructure/cron/whitelist/domains"),
    }
}

fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
        status,
    }
}

fn auth_user_response(email: &str) -> OutboundResponse {
    outbound_response(200, format!(r#"{{"id":"user-1","email":"{email}"}}"#))
}

#[tokio::test]
async fn cron_whitelist_collection_rejects_xwf_subdomain_before_private_rpc() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        auth_user_response("member@xwf.tuturuuu.com"),
        outbound_response(200, r#"{"count":0,"data":[]}"#),
    ]);

    let response =
        infrastructure_cron_whitelist_domains::handle_infrastructure_cron_whitelist_domains_route(
            &backend_config_with_contact_data(),
            request("GET", COLLECTION_PATH, None),
            &outbound,
        )
        .await
        .expect("cron whitelist collection route should match");

    assert_eq!(response.status, 403);
    let calls = outbound.calls();
    assert_eq!(calls.len(), 1, "xwf users must not reach private RPCs");
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
}

#[tokio::test]
async fn cron_whitelist_detail_rejects_xwf_subdomain_before_private_rpc() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        auth_user_response("member@xwf.tuturuuu.com"),
        outbound_response(200, r#"{"ok":true}"#),
    ]);

    let response =
        infrastructure_cron_whitelist_domain_domain::handle_infrastructure_cron_whitelist_domain_domain_route(
            &backend_config_with_contact_data(),
            request("PUT", DETAIL_PATH, Some(r#"{"enabled":false}"#)),
            &outbound,
        )
        .await
        .expect("cron whitelist detail route should match");

    assert_eq!(response.status, 403);
    assert_eq!(
        outbound.calls().len(),
        1,
        "xwf users must not reach private RPCs"
    );
}

#[tokio::test]
async fn cron_whitelist_detail_allows_exact_tuturuuu_admin() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        auth_user_response("Admin@TUTURUUU.COM"),
        outbound_response(200, r#"{"ok":true}"#),
    ]);

    let response =
        infrastructure_cron_whitelist_domain_domain::handle_infrastructure_cron_whitelist_domain_domain_route(
            &backend_config_with_contact_data(),
            request("PUT", DETAIL_PATH, Some(r#"{"enabled":false}"#)),
            &outbound,
        )
        .await
        .expect("cron whitelist detail route should match");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, serde_json::json!({ "success": true }));
    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Post);
    assert!(
        calls[1]
            .url
            .ends_with("/rest/v1/rpc/update_managed_cron_whitelisted_domain_enabled")
    );
}
