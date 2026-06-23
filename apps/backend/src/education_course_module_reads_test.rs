use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const LINKED_MODULES_PATH: &str = "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/quiz-sets/22222222-2222-4222-8222-222222222222/linked-modules";
const LINKED_MODULES_URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/11111111-1111-4111-8111-111111111111/quiz-sets/22222222-2222-4222-8222-222222222222/linked-modules?page=2&pageSize=10&q=Intro";
const COURSE_MODULES_PATH: &str =
    "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/course-modules";
const COURSE_MODULES_URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/11111111-1111-4111-8111-111111111111/course-modules?page=2&pageSize=10&q=Intro";
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

fn outbound_response_with_header(
    status: u16,
    body_text: &'static str,
    header_name: &'static str,
    header_value: &'static str,
) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.to_owned(),
        headers: vec![(header_name.to_owned(), header_value.to_owned())],
        status,
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co/", SERVICE_ROLE_KEY);
    config
}

fn request(path: &'static str, url: &'static str, method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer user-access-token"),
        body_text: None,
        cookie: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn unauthenticated_request(
    path: &'static str,
    url: &'static str,
    method: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        ..request(path, url, method)
    }
}

fn authorization_success_responses(data_response: OutboundResponse) -> Vec<OutboundResponse> {
    let mut responses = vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
        outbound_response(
            200,
            r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"ai_lab"}]}}]"#,
        ),
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[{"value":"true"}]"#),
    ];
    responses.push(data_response);
    responses
}

#[tokio::test]
async fn course_modules_read_returns_paginated_workspace_modules() {
    let outbound = RecordingOutboundClient::with_responses(authorization_success_responses(
        outbound_response_with_header(
            200,
            r#"[{"id":"module-1","name":"Intro","is_public":true,"is_published":false,"workspace_user_groups":{"ws_id":"11111111-1111-4111-8111-111111111111"}}]"#,
            "content-range",
            "10-19/42",
        ),
    ));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(COURSE_MODULES_PATH, COURSE_MODULES_URL, "GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "data": [{
                "id": "module-1",
                "name": "Intro",
                "is_public": true,
                "is_published": false,
            }],
            "count": 42,
            "page": 2,
            "pageSize": 10,
        })
    );

    let calls = outbound.calls();
    let data_call = calls.last().expect("data call");
    assert!(data_call.url.contains("/rest/v1/workspace_course_modules?"));
    assert!(data_call.url.contains("workspace_user_groups.ws_id=eq."));
    assert!(data_call.url.contains("name=ilike."));
    assert_eq!(recorded_header(data_call, "Range"), Some("10-19"));
    assert_eq!(recorded_header(data_call, "Prefer"), Some("count=exact"));
    assert_eq!(
        recorded_header(data_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn linked_modules_read_verifies_quiz_set_workspace_before_listing_modules() {
    let mut responses = authorization_success_responses(outbound_response(
        200,
        r#"[{"id":"22222222-2222-4222-8222-222222222222"}]"#,
    ));
    responses.push(outbound_response_with_header(
        200,
        r#"[{"id":"module-1","group_id":"group-1","name":"Intro","is_public":true,"is_published":true}]"#,
        "content-range",
        "10-19/1",
    ));
    let outbound = RecordingOutboundClient::with_responses(responses);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(LINKED_MODULES_PATH, LINKED_MODULES_URL, "GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "data": [{
                "id": "module-1",
                "group_id": "group-1",
                "name": "Intro",
                "is_public": true,
                "is_published": true,
            }],
            "count": 1,
            "page": 2,
            "pageSize": 10,
        })
    );

    let calls = outbound.calls();
    let set_call = &calls[calls.len() - 2];
    let data_call = calls.last().expect("linked modules call");
    assert!(set_call.url.contains("/rest/v1/workspace_quiz_sets?"));
    assert!(set_call.url.contains("ws_id=eq."));
    assert!(data_call.url.contains("/rest/v1/course_module_quiz_sets?"));
    assert!(data_call.url.contains("set_id=eq."));
    assert!(
        data_call
            .url
            .contains("workspace_course_modules.name=ilike.")
    );
}

#[tokio::test]
async fn linked_modules_read_rejects_sets_outside_workspace() {
    let outbound = RecordingOutboundClient::with_responses(authorization_success_responses(
        outbound_response(200, r#"[]"#),
    ));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(LINKED_MODULES_PATH, LINKED_MODULES_URL, "GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.body, json!({ "message": "Quiz set not found" }));
    assert_eq!(outbound.calls().len(), 7);
}

#[tokio::test]
async fn education_reads_require_browser_supabase_auth() {
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        unauthenticated_request(COURSE_MODULES_PATH, COURSE_MODULES_URL, "GET"),
        &RecordingOutboundClient::default(),
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "message": "Unauthorized" }));
}

#[tokio::test]
async fn education_reads_require_enabled_education_workspace() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
        outbound_response(
            200,
            r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"ai_lab"}]}}]"#,
        ),
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[{"value":"false"}]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(COURSE_MODULES_PATH, COURSE_MODULES_URL, "GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(
        response.body,
        json!({ "message": "Education is not enabled for this workspace" })
    );
}

#[tokio::test]
async fn education_read_query_preserves_legacy_page_size_defaults() {
    let url = "https://tuturuuu.localhost/api/v1/workspaces/11111111-1111-4111-8111-111111111111/course-modules?page=0&pageSize=250";
    let outbound = RecordingOutboundClient::with_responses(authorization_success_responses(
        outbound_response_with_header(200, r#"[]"#, "content-range", "0-99/0"),
    ));

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(COURSE_MODULES_PATH, url, "GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["page"], json!(1));
    assert_eq!(response.body["pageSize"], json!(100));
    assert_eq!(
        recorded_header(outbound.calls().last().unwrap(), "Range"),
        Some("0-99")
    );
}

#[tokio::test]
async fn education_reads_reject_unsupported_methods() {
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(COURSE_MODULES_PATH, COURSE_MODULES_URL, "POST"),
        &RecordingOutboundClient::default(),
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
}
