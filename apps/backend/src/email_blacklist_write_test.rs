use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, contact,
    email_blacklist::handle_email_blacklist_route,
    outbound::{
        OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod, OutboundRequest,
        OutboundResponse,
    },
};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::collections::VecDeque;

const EMAIL_BLACKLIST_PATH: &str = "/api/v1/infrastructure/email-blacklist";
const EMAIL_BLACKLIST_ENTRY_PATH: &str = "/api/v1/infrastructure/email-blacklist/entry-1";

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

fn request_with_body(
    path: &'static str,
    method: &'static str,
    body_text: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer caller-access-token"),
        body_text: Some(body_text),
        cookie: None,
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
async fn email_blacklist_post_creates_entry_with_user_id_and_caller_token() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(
            201,
            r#"{"id":"entry-1","entry_type":"email","value":"blocked@example.com","reason":"spam","added_by_user_id":"user-1"}"#,
        ),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_body(
            EMAIL_BLACKLIST_PATH,
            "POST",
            r#"{"entry_type":"email","value":"blocked@example.com","reason":"spam","ignored":true}"#,
        ),
        &outbound,
    )
    .await
    .expect("route should handle collection POST");

    assert_eq!(response.status, 201);
    assert_eq!(response.body["id"], "entry-1");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    let insert_call = calls.last().expect("insert call");
    assert_eq!(insert_call.method, OutboundMethod::Post);
    assert!(insert_call.url.contains("email_blacklist"));
    assert_eq!(query_value(insert_call, "select").as_deref(), Some("*"));
    assert_eq!(
        recorded_header(insert_call, "Authorization"),
        Some("Bearer caller-access-token")
    );
    assert_eq!(
        recorded_header(insert_call, "Prefer"),
        Some("return=representation")
    );
    assert_eq!(
        recorded_header(insert_call, "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    let body = request_body(insert_call);
    assert_eq!(body["entry_type"], "email");
    assert_eq!(body["value"], "blocked@example.com");
    assert_eq!(body["reason"], "spam");
    assert_eq!(body["added_by_user_id"], "user-1");
    assert!(body.get("ignored").is_none());
}

#[tokio::test]
async fn email_blacklist_post_preserves_zod_style_validation_body() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_body(
            EMAIL_BLACKLIST_PATH,
            "POST",
            r#"{"entry_type":"ip","value":"","reason":1}"#,
        ),
        &outbound,
    )
    .await
    .expect("route should handle collection POST");

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid request data");
    assert_eq!(
        response.body["errors"],
        json!([
            {
                "code": "invalid_value",
                "values": ["email", "domain"],
                "path": ["entry_type"],
                "message": "Invalid option: expected one of \"email\"|\"domain\"",
            },
            {
                "origin": "string",
                "code": "too_small",
                "minimum": 1,
                "inclusive": true,
                "path": ["value"],
                "message": "Too small: expected string to have >=1 characters",
            },
            {
                "expected": "string",
                "code": "invalid_type",
                "path": ["reason"],
                "message": "Invalid input: expected string, received number",
            }
        ])
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn email_blacklist_post_rejects_invalid_email_before_insert() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_body(
            EMAIL_BLACKLIST_PATH,
            "POST",
            r#"{"entry_type":"email","value":"blocked@example"}"#,
        ),
        &outbound,
    )
    .await
    .expect("route should handle collection POST");

    assert_eq!(response.status, 400);
    assert_eq!(
        response.body,
        json!({ "message": "Invalid email address format" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn email_blacklist_post_maps_duplicate_entries_to_conflict() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(409, r#"{"code":"23505"}"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_body(
            EMAIL_BLACKLIST_PATH,
            "POST",
            r#"{"entry_type":"domain","value":"example.com"}"#,
        ),
        &outbound,
    )
    .await
    .expect("route should handle collection POST");

    assert_eq!(response.status, 409);
    assert_eq!(
        response.body,
        json!({ "message": "This entry already exists in the blacklist" })
    );
}

#[tokio::test]
async fn email_blacklist_put_prefetches_and_updates_reason_with_caller_token() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(200, r#"{"id":"entry-1"}"#),
        outbound_response(200, r#"{"id":"entry-1","reason":"updated"}"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_body(
            EMAIL_BLACKLIST_ENTRY_PATH,
            "PUT",
            r#"{"reason":"updated","ignored":true}"#,
        ),
        &outbound,
    )
    .await
    .expect("route should handle entry PUT");

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({ "id": "entry-1", "reason": "updated" })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert!(calls[2].url.contains("id=eq.entry-1"));

    let update_call = calls.last().expect("update call");
    assert_eq!(update_call.method, OutboundMethod::Patch);
    assert!(update_call.url.contains("email_blacklist"));
    assert!(update_call.url.contains("id=eq.entry-1"));
    assert_eq!(query_value(update_call, "select").as_deref(), Some("*"));
    assert_eq!(
        recorded_header(update_call, "Authorization"),
        Some("Bearer caller-access-token")
    );
    assert_eq!(request_body(update_call), json!({ "reason": "updated" }));
}

#[tokio::test]
async fn email_blacklist_put_maps_missing_prefetch_to_not_found() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
        outbound_response(406, r#"{"code":"PGRST116"}"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_body(EMAIL_BLACKLIST_ENTRY_PATH, "PUT", r#"{"reason":"updated"}"#),
        &outbound,
    )
    .await
    .expect("route should handle entry PUT");

    assert_eq!(response.status, 404);
    assert_eq!(
        response.body,
        json!({ "message": "Email blacklist entry not found" })
    );
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn email_blacklist_put_validates_body_before_prefetch() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"link-1"}]"#),
    ]);
    let response = handle_email_blacklist_route(
        &config,
        request_with_body(EMAIL_BLACKLIST_ENTRY_PATH, "PUT", r#"{"reason":1}"#),
        &outbound,
    )
    .await
    .expect("route should handle entry PUT");

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid request data");
    assert_eq!(
        response.body["errors"],
        json!([
            {
                "expected": "string",
                "code": "invalid_type",
                "path": ["reason"],
                "message": "Invalid input: expected string, received number",
            }
        ])
    );
    assert_eq!(outbound.calls().len(), 2);
}
