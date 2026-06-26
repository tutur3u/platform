use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::{Value, json};
use std::{cell::RefCell, collections::VecDeque};

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const TIME_TRACKING_EXPORT_PATH: &str = "/api/time-tracking/export";
const TIME_TRACKING_EXPORT_URL: &str = "https://tuturuuu.localhost/api/time-tracking/export";
const TIME_TRACKING_EXPORT_FILTERED_URL: &str = "https://tuturuuu.localhost/api/time-tracking/export?period=week&page=2&limit=1200&search=ada%20test&startDate=2026-06-01&endDate=2026-06-30";

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

fn request(method: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        method,
        origin: None,
        path: TIME_TRACKING_EXPORT_PATH,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn request_with_bearer(method: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method, url)
    }
}

fn auth_user_response(email: &'static str) -> OutboundResponse {
    OutboundResponse {
        body_text: format!(r#"{{"id":"user-1","email":"{email}"}}"#),
        headers: Vec::new(),
        status: 200,
    }
}

#[tokio::test]
async fn time_tracking_export_returns_rpc_result_and_forwards_filters() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        auth_user_response("root@tuturuuu.com"),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(
            200,
            r#"{"data":[{"title":"Ada - 2026-06-22","sessionCount":1}],"pagination":{"page":2,"limit":1000,"total":1,"pages":1}}"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET", TIME_TRACKING_EXPORT_FILTERED_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "data": [{ "title": "Ada - 2026-06-22", "sessionCount": 1 }],
            "pagination": { "page": 2, "limit": 1000, "total": 1, "pages": 1 },
        })
    );
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );

    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert!(calls[1].url.contains("/rest/v1/workspace_members?"));
    assert!(calls[1].url.contains("select=type"));
    assert!(
        calls[1]
            .url
            .contains("ws_id=eq.00000000-0000-0000-0000-000000000000")
    );
    assert!(calls[1].url.contains("user_id=eq.user-1"));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(recorded_header(&calls[1], "apikey"), Some(SERVICE_ROLE_KEY));

    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/rpc/get_grouped_sessions_paginated"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(recorded_header(&calls[2], "apikey"), Some(SERVICE_ROLE_KEY));

    let rpc_body: Value = serde_json::from_str(calls[2].body.as_deref().expect("RPC request body"))
        .expect("valid RPC JSON");
    assert_eq!(
        rpc_body,
        json!({
            "p_ws_id": ROOT_WORKSPACE_ID,
            "p_period": "week",
            "p_page": 2,
            "p_limit": 1000,
            "p_search": "ada test",
            "p_start_date": "2026-06-01",
            "p_end_date": "2026-06-30",
            "p_timezone": "UTC",
        })
    );
}

#[tokio::test]
async fn time_tracking_export_rejects_missing_session_and_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();

    let missing_session_response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("GET", TIME_TRACKING_EXPORT_URL),
        &outbound,
    )
    .await;

    assert_eq!(missing_session_response.status, 401);
    assert_eq!(
        missing_session_response.body,
        json!({ "error": "Unauthorized" })
    );
    assert!(outbound.calls().is_empty());

    let unsupported_method_response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("POST", TIME_TRACKING_EXPORT_URL),
        &outbound,
    )
    .await;

    assert_eq!(unsupported_method_response.status, 405);
    assert_eq!(unsupported_method_response.allow, Some("GET"));
    assert_eq!(
        unsupported_method_response.body,
        json!({ "error": "method not allowed" })
    );
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn time_tracking_export_enforces_root_email_and_root_workspace() {
    let non_root_email_outbound =
        RecordingOutboundClient::with_responses(vec![auth_user_response("ada@example.com")]);

    let non_root_email_response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET", TIME_TRACKING_EXPORT_URL),
        &non_root_email_outbound,
    )
    .await;

    assert_eq!(non_root_email_response.status, 403);
    assert_eq!(
        non_root_email_response.body,
        json!({ "error": "Forbidden" })
    );
    assert_eq!(non_root_email_outbound.calls().len(), 1);

    let non_root_workspace_outbound =
        RecordingOutboundClient::with_responses(vec![auth_user_response("root@tuturuuu.com")]);

    let non_root_workspace_response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "GET",
            "https://tuturuuu.localhost/api/time-tracking/export?wsId=11111111-1111-1111-1111-111111111111",
        ),
        &non_root_workspace_outbound,
    )
    .await;

    assert_eq!(non_root_workspace_response.status, 403);
    assert_eq!(
        non_root_workspace_response.body,
        json!({ "error": "Forbidden" })
    );
    assert_eq!(non_root_workspace_outbound.calls().len(), 1);
}

#[tokio::test]
async fn time_tracking_export_returns_empty_result_when_rpc_fallback_cannot_recover() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        auth_user_response("root@tuturuuu.com"),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(500, r#"{"error":"RPC unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET", TIME_TRACKING_EXPORT_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "data": [],
            "pagination": { "page": 1, "limit": 100, "total": 0, "pages": 0 },
        })
    );
    assert_eq!(outbound.calls().len(), 3);
}
