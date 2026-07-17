use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, contact,
    email_blacklist::{
        EMAIL_BLACKLIST_PATH, EmailBlacklistRoute, POSTGREST_SINGLE_JSON, email_blacklist_route,
        handle_email_blacklist_route, is_postgrest_single_not_found,
    },
    outbound::{
        OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod, OutboundRequest,
        OutboundResponse,
    },
};
use serde_json::json;
use std::cell::RefCell;
use std::collections::VecDeque;

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
            .unwrap_or_else(|| outbound_response(200, r#"[]"#));

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

fn request(path: &'static str) -> BackendRequest<'static> {
    request_with_method(path, "GET")
}

fn request_with_method(path: &'static str, method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer caller-access-token"),
        body_text: None,
        cookie: None,
        if_none_match: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some("https://backend.example.test/api/v1/infrastructure/email-blacklist"),
    }
}

fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
        status,
    }
}

fn recorded_header<'a>(request: &'a RecordedOutboundRequest, header: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(header))
        .map(|(_, value)| value.as_str())
}

#[test]
fn email_blacklist_route_matches_collection_and_entry_only() {
    assert_eq!(
        email_blacklist_route(EMAIL_BLACKLIST_PATH),
        Some(EmailBlacklistRoute::Collection)
    );
    assert_eq!(
        email_blacklist_route("/api/v1/infrastructure/email-blacklist/entry-1"),
        Some(EmailBlacklistRoute::Entry {
            entry_id: "entry-1".to_owned(),
        })
    );
    assert_eq!(
        email_blacklist_route("/api/v1/infrastructure/email-blacklist/entry-1/extra"),
        None
    );
    assert_eq!(email_blacklist_route("/api/v1/infrastructure/other"), None);
}

#[test]
fn postgrest_single_not_found_detects_pgrst116() {
    let response = OutboundResponse {
        body_text: r#"{"code":"PGRST116"}"#.to_owned(),
        headers: Vec::new(),
        status: 406,
    };

    assert!(is_postgrest_single_not_found(&response));
}

#[tokio::test]
async fn email_blacklist_collection_reads_ordered_rows_with_caller_token() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"root@example.com"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(200, r#"[{"id":"entry-1","value":"blocked@example.com"}]"#),
    ]);
    let response = handle_email_blacklist_route(&config, request(EMAIL_BLACKLIST_PATH), &outbound)
        .await
        .expect("route should handle collection GET");

    assert_eq!(response.status, 200);
    assert_eq!(response.body[0]["id"], "entry-1");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[1].url.contains("workspace_user_linked_users"));
    assert!(calls[1].url.contains("platform_user_id=eq.user-1"));
    assert!(
        calls[1]
            .url
            .contains("ws_id=eq.00000000-0000-0000-0000-000000000000")
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer caller-access-token")
    );
    assert!(calls[2].url.contains("email_blacklist"));
    assert!(calls[2].url.contains("order=created_at.desc"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer caller-access-token")
    );
}

#[tokio::test]
async fn email_blacklist_entry_reads_singular_row_and_maps_missing_to_404() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(406, r#"{"code":"PGRST116"}"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request("/api/v1/infrastructure/email-blacklist/entry-1"),
        &outbound,
    )
    .await
    .expect("route should handle entry GET");

    assert_eq!(response.status, 404);
    assert_eq!(
        response.body["message"],
        "Error fetching email blacklist entry"
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[2].url.contains("email_blacklist"));
    assert!(calls[2].url.contains("id=eq.entry-1"));
    assert_eq!(
        recorded_header(&calls[2], "Accept"),
        Some(POSTGREST_SINGLE_JSON)
    );
}

#[tokio::test]
async fn email_blacklist_preserves_detail_non_root_unauthorized_quirk() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[]"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request("/api/v1/infrastructure/email-blacklist/entry-1"),
        &outbound,
    )
    .await
    .expect("route should handle entry GET");

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn email_blacklist_delete_prefetches_entry_and_deletes_with_caller_token() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(200, r#"{"id":"entry-1"}"#),
        outbound_response(204, ""),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_method("/api/v1/infrastructure/email-blacklist/entry-1", "DELETE"),
        &outbound,
    )
    .await
    .expect("route should handle entry DELETE");

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({ "message": "Entry deleted successfully" })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert!(calls[2].url.contains("email_blacklist"));
    assert!(calls[2].url.contains("id=eq.entry-1"));
    assert_eq!(
        recorded_header(&calls[2], "Accept"),
        Some(POSTGREST_SINGLE_JSON)
    );
    assert_eq!(calls[3].method, OutboundMethod::Delete);
    assert!(calls[3].url.contains("email_blacklist"));
    assert!(calls[3].url.contains("id=eq.entry-1"));
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer caller-access-token")
    );
}

#[tokio::test]
async fn email_blacklist_delete_maps_missing_prefetch_to_404() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(406, r#"{"code":"PGRST116"}"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_method("/api/v1/infrastructure/email-blacklist/entry-1", "DELETE"),
        &outbound,
    )
    .await
    .expect("route should handle entry DELETE");

    assert_eq!(response.status, 404);
    assert_eq!(
        response.body,
        json!({ "message": "Email blacklist entry not found" })
    );
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn email_blacklist_delete_preserves_non_root_forbidden_status() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[]"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_method("/api/v1/infrastructure/email-blacklist/entry-1", "DELETE"),
        &outbound,
    )
    .await
    .expect("route should handle entry DELETE");

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 2);
}
