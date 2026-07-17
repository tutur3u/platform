use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, ai_whitelist, contact,
    outbound::{
        OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod, OutboundRequest,
        OutboundResponse,
    },
};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::collections::VecDeque;

const AI_WHITELIST_DOMAINS_PATH: &str = "/api/v1/infrastructure/ai/whitelist/domains";
const AI_WHITELIST_DOMAIN_DETAIL_PATH: &str =
    "/api/v1/infrastructure/ai/whitelist/domain/example.com";
const AI_WHITELIST_EMAIL_DETAIL_PATH: &str =
    "/api/v1/infrastructure/ai/whitelist/member%40example.com";
const AI_WHITELIST_EMAILS_PATH: &str = "/api/v1/infrastructure/ai/whitelist/emails";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";

#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
    body: Option<String>,
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
            body: request.body.map(str::to_owned),
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
    request_with_bearer_method(path, url, "GET")
}

fn request_with_bearer_method(
    path: &'static str,
    url: &'static str,
    method: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        body_text: None,
        cookie: None,
        if_none_match: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn request_with_body(
    path: &'static str,
    url: &'static str,
    method: &'static str,
    body_text: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        body_text: Some(body_text),
        ..request_with_bearer_method(path, url, method)
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

fn request_body(request: &RecordedOutboundRequest) -> Value {
    serde_json::from_str(request.body.as_deref().expect("request body")).expect("JSON body")
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

#[tokio::test]
async fn ai_whitelist_email_post_creates_private_row_with_default_enabled() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(
            201,
            r#"{"email":"member@example.com","enabled":true,"created_at":"2026-01-01T00:00:00Z"}"#,
        ),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_EMAILS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/emails",
            "POST",
            r#"{"email":"member@example.com"}"#,
        ),
        &outbound,
    )
    .await
    .expect("email whitelist collection route should match");

    assert_eq!(response.status, 201);
    assert_eq!(
        response.body,
        json!({
            "data": {
                "email": "member@example.com",
                "enabled": true,
                "created_at": "2026-01-01T00:00:00Z",
            }
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    let insert_call = calls.last().expect("private whitelist email insert");
    assert_eq!(insert_call.method, OutboundMethod::Post);
    assert!(insert_call.url.contains("/rest/v1/ai_whitelisted_emails?"));
    assert_eq!(query_value(insert_call, "select").as_deref(), Some("*"));
    assert_eq!(
        header(insert_call, "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(header(insert_call, "Accept-Profile"), Some("private"));
    assert_eq!(header(insert_call, "Content-Profile"), Some("private"));
    assert_eq!(header(insert_call, "Content-Type"), Some(APPLICATION_JSON));
    assert_eq!(header(insert_call, "Prefer"), Some("return=representation"));
    assert_eq!(
        header(insert_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        request_body(insert_call),
        json!({
            "email": "member@example.com",
            "enabled": true,
        })
    );
}

#[tokio::test]
async fn ai_whitelist_domain_post_trims_payload_and_creates_private_row() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(
            201,
            r#"{"domain":"example.com","description":"Example domain","enabled":false,"created_at":"2026-01-01T00:00:00Z"}"#,
        ),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_DOMAINS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domains",
            "POST",
            r#"{"domain":" example.com ","description":" Example domain ","enabled":false}"#,
        ),
        &outbound,
    )
    .await
    .expect("domain whitelist collection route should match");

    assert_eq!(response.status, 201);
    assert_eq!(
        response.body,
        json!({
            "data": {
                "domain": "example.com",
                "description": "Example domain",
                "enabled": false,
                "created_at": "2026-01-01T00:00:00Z",
            }
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    let insert_call = calls.last().expect("private whitelist domain insert");
    assert_eq!(insert_call.method, OutboundMethod::Post);
    assert!(insert_call.url.contains("/rest/v1/ai_whitelisted_domains?"));
    assert_eq!(query_value(insert_call, "select").as_deref(), Some("*"));
    assert_eq!(
        header(insert_call, "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(header(insert_call, "Accept-Profile"), Some("private"));
    assert_eq!(header(insert_call, "Content-Profile"), Some("private"));
    assert_eq!(header(insert_call, "Content-Type"), Some(APPLICATION_JSON));
    assert_eq!(header(insert_call, "Prefer"), Some("return=representation"));
    assert_eq!(
        request_body(insert_call),
        json!({
            "description": "Example domain",
            "domain": "example.com",
            "enabled": false,
        })
    );
}

#[tokio::test]
async fn ai_whitelist_post_rejects_non_company_users_before_body_parse() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"member@example.com"}"#,
    )]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_EMAILS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/emails",
            "POST",
            "not json",
        ),
        &outbound,
    )
    .await
    .expect("email whitelist collection route should match");

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body,
        json!({ "message": "You are not allowed to perform this action" })
    );
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn ai_whitelist_post_preserves_collection_failure_bodies() {
    let invalid_email_outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#,
    )]);
    let invalid_email_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_EMAILS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/emails",
            "POST",
            r#"{"email":"not an email","enabled":"true"}"#,
        ),
        &invalid_email_outbound,
    )
    .await
    .expect("email whitelist collection route should match");

    assert_eq!(invalid_email_response.status, 400);
    assert_eq!(
        invalid_email_response.body,
        json!({ "message": "Invalid whitelist email payload" })
    );
    assert_eq!(invalid_email_outbound.calls().len(), 1);

    let invalid_domain_outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#,
    )]);
    let invalid_domain_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_DOMAINS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domains",
            "POST",
            r#"{"domain":"   "}"#,
        ),
        &invalid_domain_outbound,
    )
    .await
    .expect("domain whitelist collection route should match");

    assert_eq!(invalid_domain_response.status, 400);
    assert_eq!(
        invalid_domain_response.body,
        json!({ "message": "Invalid whitelist domain payload" })
    );
    assert_eq!(invalid_domain_outbound.calls().len(), 1);

    let invalid_json_outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#,
    )]);
    let invalid_json_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_DOMAINS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domains",
            "POST",
            "not json",
        ),
        &invalid_json_outbound,
    )
    .await
    .expect("domain whitelist collection route should match");

    assert_eq!(invalid_json_response.status, 500);
    assert_eq!(
        invalid_json_response.body_text.as_deref(),
        Some("Internal Server Error")
    );
    assert_eq!(invalid_json_outbound.calls().len(), 1);

    let insert_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let insert_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_EMAILS_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/emails",
            "POST",
            r#"{"email":"member@example.com"}"#,
        ),
        &insert_outbound,
    )
    .await
    .expect("email whitelist collection route should match");

    assert_eq!(insert_response.status, 500);
    assert_eq!(
        insert_response.body_text.as_deref(),
        Some("Internal Server Error")
    );
}

#[tokio::test]
async fn ai_whitelist_email_delete_decodes_path_and_deletes_private_row() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(204, ""),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_bearer_method(
            AI_WHITELIST_EMAIL_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/member%40example.com",
            "DELETE",
        ),
        &outbound,
    )
    .await
    .expect("email whitelist detail route should match");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "success": true }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    let delete_call = calls.last().expect("private whitelist email delete");
    assert_eq!(delete_call.method, OutboundMethod::Delete);
    assert!(delete_call.url.contains("/rest/v1/ai_whitelisted_emails?"));
    assert_eq!(
        query_value(delete_call, "email").as_deref(),
        Some("eq.member@example.com")
    );
    assert_eq!(header(delete_call, "Accept-Profile"), Some("private"));
    assert_eq!(header(delete_call, "Content-Profile"), Some("private"));
    assert_eq!(
        header(delete_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn ai_whitelist_email_put_decodes_path_and_patches_enabled() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(204, ""),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_EMAIL_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/member%40example.com",
            "PUT",
            r#"{"enabled":false}"#,
        ),
        &outbound,
    )
    .await
    .expect("email whitelist detail route should match");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "success": true }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    let update_call = calls.last().expect("private whitelist email update");
    assert_eq!(update_call.method, OutboundMethod::Patch);
    assert!(update_call.url.contains("/rest/v1/ai_whitelisted_emails?"));
    assert_eq!(
        query_value(update_call, "email").as_deref(),
        Some("eq.member@example.com")
    );
    assert_eq!(update_call.body.as_deref(), Some(r#"{"enabled":false}"#));
    assert_eq!(header(update_call, "Accept-Profile"), Some("private"));
    assert_eq!(header(update_call, "Content-Profile"), Some("private"));
    assert_eq!(header(update_call, "Content-Type"), Some(APPLICATION_JSON));
    assert_eq!(header(update_call, "Prefer"), Some("return=minimal"));
    assert_eq!(
        header(update_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn ai_whitelist_email_delete_preserves_email_required_response() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#,
    )]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_bearer_method(
            "/api/v1/infrastructure/ai/whitelist/",
            "https://backend.test/api/v1/infrastructure/ai/whitelist/",
            "DELETE",
        ),
        &outbound,
    )
    .await
    .expect("email whitelist detail route should match");

    assert_eq!(response.status, 400);
    assert_eq!(response.body, json!({ "message": "Email is required" }));
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn ai_whitelist_email_put_preserves_email_required_response() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#,
    )]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            "/api/v1/infrastructure/ai/whitelist/",
            "https://backend.test/api/v1/infrastructure/ai/whitelist/",
            "PUT",
            r#"{"enabled":true}"#,
        ),
        &outbound,
    )
    .await
    .expect("email whitelist detail route should match");

    assert_eq!(response.status, 400);
    assert_eq!(response.body, json!({ "message": "Email is required" }));
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn ai_whitelist_domain_delete_deletes_private_row() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(204, ""),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_bearer_method(
            AI_WHITELIST_DOMAIN_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domain/example.com",
            "DELETE",
        ),
        &outbound,
    )
    .await
    .expect("domain whitelist detail route should match");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "success": true }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    let delete_call = calls.last().expect("private whitelist domain delete");
    assert_eq!(delete_call.method, OutboundMethod::Delete);
    assert!(delete_call.url.contains("/rest/v1/ai_whitelisted_domains?"));
    assert_eq!(
        query_value(delete_call, "domain").as_deref(),
        Some("eq.example.com")
    );
    assert_eq!(header(delete_call, "Accept-Profile"), Some("private"));
    assert_eq!(header(delete_call, "Content-Profile"), Some("private"));
}

#[tokio::test]
async fn ai_whitelist_domain_put_patches_private_row_with_js_truthy_enabled() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(204, ""),
    ]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_DOMAIN_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domain/example.com",
            "PUT",
            r#"{"enabled":"false"}"#,
        ),
        &outbound,
    )
    .await
    .expect("domain whitelist detail route should match");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "success": true }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    let update_call = calls.last().expect("private whitelist domain update");
    assert_eq!(update_call.method, OutboundMethod::Patch);
    assert!(update_call.url.contains("/rest/v1/ai_whitelisted_domains?"));
    assert_eq!(
        query_value(update_call, "domain").as_deref(),
        Some("eq.example.com")
    );
    assert_eq!(update_call.body.as_deref(), Some(r#"{"enabled":true}"#));
    assert_eq!(header(update_call, "Accept-Profile"), Some("private"));
    assert_eq!(header(update_call, "Content-Profile"), Some("private"));
    assert_eq!(header(update_call, "Content-Type"), Some(APPLICATION_JSON));
    assert_eq!(header(update_call, "Prefer"), Some("return=minimal"));
}

#[tokio::test]
async fn ai_whitelist_delete_rejects_non_company_users_before_delete() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"member@example.com"}"#,
    )]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_bearer_method(
            AI_WHITELIST_DOMAIN_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domain/example.com",
            "DELETE",
        ),
        &outbound,
    )
    .await
    .expect("domain whitelist detail route should match");

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body,
        json!({ "message": "You are not allowed to perform this action" })
    );
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn ai_whitelist_put_rejects_non_company_users_before_body_parse() {
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"member@example.com"}"#,
    )]);
    let response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_DOMAIN_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domain/example.com",
            "PUT",
            "not json",
        ),
        &outbound,
    )
    .await
    .expect("domain whitelist detail route should match");

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body,
        json!({ "message": "You are not allowed to perform this action" })
    );
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn ai_whitelist_put_preserves_method_specific_failure_bodies() {
    let invalid_email_outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#,
    )]);
    let invalid_email_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_EMAIL_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/member%40example.com",
            "PUT",
            "not json",
        ),
        &invalid_email_outbound,
    )
    .await
    .expect("email whitelist detail route should match");

    assert_eq!(invalid_email_response.status, 500);
    assert_eq!(
        invalid_email_response.body,
        json!({ "message": "Error updating AI whitelist email" })
    );
    assert_eq!(invalid_email_outbound.calls().len(), 1);

    let invalid_domain_outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#,
    )]);
    let invalid_domain_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_DOMAIN_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domain/example.com",
            "PUT",
            "null",
        ),
        &invalid_domain_outbound,
    )
    .await
    .expect("domain whitelist detail route should match");

    assert_eq!(invalid_domain_response.status, 500);
    assert_eq!(
        invalid_domain_response.body_text.as_deref(),
        Some("Internal Server Error")
    );
    assert_eq!(invalid_domain_outbound.calls().len(), 1);

    let email_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let email_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_EMAIL_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/member%40example.com",
            "PUT",
            r#"{"enabled":true}"#,
        ),
        &email_outbound,
    )
    .await
    .expect("email whitelist detail route should match");

    assert_eq!(email_response.status, 500);
    assert_eq!(
        email_response.body,
        json!({ "message": "Error updating AI whitelist email" })
    );

    let domain_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@tuturuuu.com"}"#),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let domain_response = ai_whitelist::handle_ai_whitelist_route(
        &backend_config_with_contact_data(),
        request_with_body(
            AI_WHITELIST_DOMAIN_DETAIL_PATH,
            "https://backend.test/api/v1/infrastructure/ai/whitelist/domain/example.com",
            "PUT",
            r#"{"enabled":true}"#,
        ),
        &domain_outbound,
    )
    .await
    .expect("domain whitelist detail route should match");

    assert_eq!(domain_response.status, 500);
    assert_eq!(
        domain_response.body_text.as_deref(),
        Some("Internal Server Error")
    );
    assert_eq!(
        domain_response.content_type,
        Some("text/plain;charset=UTF-8")
    );
}
