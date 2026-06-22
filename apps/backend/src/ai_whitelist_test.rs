use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, ai_whitelist, contact,
    outbound::{
        OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod, OutboundRequest,
        OutboundResponse,
    },
};
use serde_json::json;
use std::cell::RefCell;
use std::collections::VecDeque;

const AI_WHITELIST_DOMAINS_PATH: &str = "/api/v1/infrastructure/ai/whitelist/domains";
const AI_WHITELIST_EMAILS_PATH: &str = "/api/v1/infrastructure/ai/whitelist/emails";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";

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
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co", SERVICE_ROLE_KEY);
    config
}

fn request_with_bearer(path: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
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
    outbound_response_with_headers(
        status,
        body_text,
        vec![
            ("content-type".to_owned(), APPLICATION_JSON.to_owned()),
            ("content-range".to_owned(), "20-29/42".to_owned()),
        ],
    )
}

fn outbound_response_with_headers(
    status: u16,
    body_text: impl Into<String>,
    headers: Vec<(String, String)>,
) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers,
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

fn query_value(request: &RecordedOutboundRequest, key: &str) -> Option<String> {
    let url = url::Url::parse(&request.url).ok()?;

    url.query_pairs()
        .find(|(query_key, _)| query_key == key)
        .map(|(_, value)| value.into_owned())
}

#[tokio::test]
async fn ai_whitelist_email_list_requires_tuturuuu_user_and_queries_private_rows() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"[{"email":"member@example.com","enabled":true,"created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_bearer(
            AI_WHITELIST_EMAILS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/emails?page=3&pageSize=10&q= member ",
        ),
        &outbound,
    )
    .await
    .expect("email whitelist route should match");

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "count": 42,
            "data": [
                {
                    "email": "member@example.com",
                    "enabled": true,
                    "created_at": "2026-01-01T00:00:00Z",
                }
            ]
        })
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );

    let data_call = calls.last().expect("private whitelist email call");
    assert_eq!(data_call.method, OutboundMethod::Get);
    assert!(data_call.url.contains("/rest/v1/ai_whitelisted_emails?"));
    assert_eq!(
        query_value(data_call, "select").as_deref(),
        Some("email,enabled,created_at")
    );
    assert_eq!(
        query_value(data_call, "email").as_deref(),
        Some("ilike.%member%")
    );
    assert_eq!(
        query_value(data_call, "order").as_deref(),
        Some("created_at.desc")
    );
    assert_eq!(header(data_call, "Accept-Profile"), Some("private"));
    assert_eq!(header(data_call, "Content-Profile"), Some("private"));
    assert_eq!(header(data_call, "Range"), Some("20-29"));
    assert_eq!(header(data_call, "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn ai_whitelist_domain_list_parses_js_style_pagination_and_rejects_non_company_users() {
    let forbidden_outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"member@example.com"}"#,
    )]);
    let forbidden_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_bearer(
            AI_WHITELIST_DOMAINS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domains",
        ),
        &forbidden_outbound,
    )
    .await
    .expect("domain whitelist route should match");

    assert_eq!(forbidden_response.status, 403);
    assert_eq!(
        forbidden_response.body,
        json!({ "message": "You are not allowed to perform this action" })
    );
    assert_eq!(forbidden_outbound.calls().len(), 1);

    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"[{"domain":"example.com","description":null,"enabled":true,"created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_bearer(
            AI_WHITELIST_DOMAINS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domains?page=2abc&pageSize=10abc&q=   ",
        ),
        &outbound,
    )
    .await
    .expect("domain whitelist route should match");

    assert_eq!(response.status, 200);
    let calls = outbound.calls();
    let data_call = calls.last().expect("private whitelist domain call");
    assert!(data_call.url.contains("/rest/v1/ai_whitelisted_domains?"));
    assert_eq!(
        query_value(data_call, "select").as_deref(),
        Some("domain,description,enabled,created_at")
    );
    assert!(query_value(data_call, "domain").is_none());
    assert_eq!(header(data_call, "Range"), Some("10-19"));
}
