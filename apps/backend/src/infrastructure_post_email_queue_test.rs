use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, contact, infrastructure_post_email_queue,
    outbound::{
        OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod, OutboundRequest,
        OutboundResponse,
    },
};
use serde_json::json;
use std::cell::RefCell;
use std::collections::VecDeque;

const POST_EMAIL_QUEUE_PATH: &str = "/api/v1/infrastructure/post-email-queue";
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

fn request(path: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        body_text: None,
        cookie: None,
        method: "GET",
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some("https://backend.test/api/v1/infrastructure/post-email-queue"),
    }
}

fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
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
async fn post_email_queue_returns_legacy_summary_payload_and_queries_service_role_rows() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@example.com"}"#),
        outbound_response(200, r#"[{"id":"root-membership"}]"#),
        outbound_response(
            200,
            r#"[
                {"status":"queued"},
                {"status":"processing"},
                {"status":"sent"},
                {"status":"failed"},
                {"status":"blocked"},
                {"status":"cancelled"},
                {"status":"skipped"}
            ]"#,
        ),
        outbound_response(
            200,
            r#"[
                {"ws_id":"ws-a","status":"queued"},
                {"ws_id":"ws-b","status":"processing"},
                {"ws_id":"ws-a","status":"processing"},
                {"ws_id":null,"status":"sent"},
                {"ws_id":"","status":"queued"}
            ]"#,
        ),
        outbound_response(
            200,
            r#"[
                {"batch_id":"batch-new","status":"failed","last_attempt_at":"2026-01-02T00:00:00Z","created_at":"2026-01-02T00:00:00Z"},
                {"batch_id":"batch-new","status":"sent","last_attempt_at":"2026-01-02T00:00:00Z","created_at":"2026-01-02T00:00:00Z"},
                {"batch_id":"batch-old","status":"sent","last_attempt_at":"2026-01-01T00:00:00Z","created_at":"2026-01-01T00:00:00Z"},
                {"batch_id":null,"status":"sent","last_attempt_at":"2026-01-03T00:00:00Z","created_at":"2026-01-03T00:00:00Z"}
            ]"#,
        ),
    ]);
    let response = infrastructure_post_email_queue::handle_post_email_queue_route(
        &backend_config_with_contact_data(),
        request(POST_EMAIL_QUEUE_PATH),
        &outbound,
    )
    .await
    .expect("post email queue route should match");

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "summary": {
                "queued": 1,
                "processing": 1,
                "sent": 1,
                "failed": 1,
                "blocked": 1,
                "cancelled": 1,
                "total": 7,
            },
            "byWorkspace": [
                {
                    "ws_id": "ws-a",
                    "queued": 1,
                    "processing": 1,
                    "sent": 0,
                    "failed": 0,
                    "blocked": 0,
                    "cancelled": 0,
                    "total": 2,
                },
                {
                    "ws_id": "ws-b",
                    "queued": 0,
                    "processing": 1,
                    "sent": 0,
                    "failed": 0,
                    "blocked": 0,
                    "cancelled": 0,
                    "total": 1,
                }
            ],
            "recentBatches": [
                {
                    "batch_id": "batch-new",
                    "claimed": 2,
                    "sent": 1,
                    "failed": 1,
                    "last_attempt_at": "2026-01-02T00:00:00Z",
                },
                {
                    "batch_id": "batch-old",
                    "claimed": 1,
                    "sent": 1,
                    "failed": 0,
                    "last_attempt_at": "2026-01-01T00:00:00Z",
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 5);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        header(&calls[1], "Authorization"),
        Some("Bearer browser-access-token")
    );

    let summary_call = &calls[2];
    assert!(summary_call.url.contains("/rest/v1/post_email_queue?"));
    assert_eq!(
        query_value(summary_call, "select").as_deref(),
        Some("status")
    );
    assert_eq!(
        header(summary_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );

    let workspace_call = &calls[3];
    assert_eq!(
        query_value(workspace_call, "select").as_deref(),
        Some("ws_id,status")
    );
    assert_eq!(
        query_value(workspace_call, "order").as_deref(),
        Some("created_at.desc")
    );

    let batch_call = &calls[4];
    assert_eq!(
        query_value(batch_call, "select").as_deref(),
        Some("batch_id,status,last_attempt_at,created_at")
    );
    assert_eq!(
        query_value(batch_call, "batch_id").as_deref(),
        Some("not.is.null")
    );
    assert_eq!(query_value(batch_call, "limit").as_deref(), Some("100"));
    assert_eq!(
        query_value(batch_call, "order").as_deref(),
        Some("last_attempt_at.desc")
    );
}

#[tokio::test]
async fn post_email_queue_preserves_auth_and_partial_failure_behavior() {
    let forbidden_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"member@example.com"}"#),
        outbound_response(200, "[]"),
    ]);
    let forbidden = infrastructure_post_email_queue::handle_post_email_queue_route(
        &backend_config_with_contact_data(),
        request(POST_EMAIL_QUEUE_PATH),
        &forbidden_outbound,
    )
    .await
    .expect("post email queue route should match");

    assert_eq!(forbidden.status, 403);
    assert_eq!(forbidden.body, json!({ "message": "Forbidden" }));

    let partial_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@example.com"}"#),
        outbound_response(200, r#"[{"id":"root-membership"}]"#),
        outbound_response(200, r#"[{"status":"queued"}]"#),
        outbound_response(500, r#"{"message":"workspace failure"}"#),
        outbound_response(500, r#"{"message":"batch failure"}"#),
    ]);
    let partial = infrastructure_post_email_queue::handle_post_email_queue_route(
        &backend_config_with_contact_data(),
        request(POST_EMAIL_QUEUE_PATH),
        &partial_outbound,
    )
    .await
    .expect("post email queue route should match");

    assert_eq!(partial.status, 200);
    assert_eq!(
        partial.body,
        json!({
            "summary": {
                "queued": 1,
                "processing": 0,
                "sent": 0,
                "failed": 0,
                "blocked": 0,
                "cancelled": 0,
                "total": 1,
            },
            "byWorkspace": [],
            "recentBatches": [],
        })
    );
}

#[tokio::test]
async fn post_email_queue_summary_failure_is_fatal() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"admin@example.com"}"#),
        outbound_response(200, r#"[{"id":"root-membership"}]"#),
        outbound_response(500, r#"{"message":"summary failure"}"#),
    ]);
    let response = infrastructure_post_email_queue::handle_post_email_queue_route(
        &backend_config_with_contact_data(),
        request(POST_EMAIL_QUEUE_PATH),
        &outbound,
    )
    .await
    .expect("post email queue route should match");

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error fetching post email queue" })
    );
    assert_eq!(outbound.calls().len(), 3);
}
