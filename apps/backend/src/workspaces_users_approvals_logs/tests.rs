use super::*;
use crate::outbound::OutboundFuture;
use std::{cell::RefCell, collections::VecDeque};

#[derive(Clone, Debug, Eq, PartialEq)]
struct Call {
    method: OutboundMethod,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
}

struct Client {
    responses: RefCell<VecDeque<OutboundResponse>>,
    calls: RefCell<Vec<Call>>,
}

impl Client {
    fn new(responses: Vec<OutboundResponse>) -> Self {
        Self {
            responses: RefCell::new(responses.into()),
            calls: RefCell::new(Vec::new()),
        }
    }
}

impl OutboundHttpClient for Client {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        self.calls.borrow_mut().push(Call {
            method: request.method,
            url: request.url.to_owned(),
            headers: request
                .headers
                .iter()
                .map(|header| (header.name.to_owned(), header.value.to_owned()))
                .collect(),
            body: request.body.map(str::to_owned),
        });
        let response = self
            .responses
            .borrow_mut()
            .pop_front()
            .expect("unexpected outbound request");
        Box::pin(async move { Ok(response) })
    }
}

fn response(body: &str) -> OutboundResponse {
    OutboundResponse {
        status: 200,
        body_text: body.to_owned(),
        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
    }
}

fn config() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.contact_data = contact::ContactDataConfig::new(
        "https://project-ref.supabase.co/",
        "test-service-role-secret",
    );
    config
}

fn request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        body_text: None,
        cookie: None,
        if_none_match: None,
        method,
        origin: None,
        path: PATH,
        referer: None,
        request_id: None,
        url: Some(URL),
    }
}

fn assert_head_parity(get: &BackendResponse, head: &BackendResponse, status: u16) {
    assert_eq!(get.status, status);
    assert!(!get.body_empty);
    assert_eq!(head.status, get.status);
    assert_eq!(head.cache_control, get.cache_control);
    assert_eq!(head.content_type, get.content_type);
    assert_eq!(head.headers, get.headers);
    assert_eq!(head.allow, get.allow);
    assert_eq!(get.cache_control, Some(crate::NO_STORE_CACHE_CONTROL));
    assert!(
        get.headers
            .iter()
            .any(|(name, value)| *name == "cdn-cache-control"
                && value == crate::NO_STORE_CDN_CACHE_CONTROL)
    );
    assert!(head.body_empty);
    assert!(head.body_text.is_none());
    assert_eq!(head.body, serde_json::Value::Null);
}

async fn pair(responses: Vec<OutboundResponse>) -> (BackendResponse, BackendResponse, Vec<Call>) {
    let config = config();
    let get_client = Client::new(responses.clone());
    let head_client = Client::new(responses);
    let get = handle_workspaces_users_approvals_logs_route(&config, request("GET"), &get_client)
        .await
        .unwrap();
    let head = handle_workspaces_users_approvals_logs_route(&config, request("HEAD"), &head_client)
        .await
        .unwrap();
    assert!(get_client.responses.borrow().is_empty());
    assert!(head_client.responses.borrow().is_empty());
    assert_eq!(*get_client.calls.borrow(), *head_client.calls.borrow());
    let calls = get_client.calls.borrow().clone();
    (get, head, calls)
}

#[tokio::test]
async fn head_missing_auth_keeps_status_and_no_store_without_outbound() {
    let config = config();
    let client = Client::new(vec![]);
    let get = handle_workspaces_users_approvals_logs_route(
        &config,
        BackendRequest {
            authorization: None,
            ..request("GET")
        },
        &client,
    )
    .await
    .unwrap();
    let head = handle_workspaces_users_approvals_logs_route(
        &config,
        BackendRequest {
            authorization: None,
            ..request("HEAD")
        },
        &client,
    )
    .await
    .unwrap();
    assert_head_parity(&get, &head, 404);
    assert_ne!(get.body, serde_json::Value::Null);
    assert!(client.calls.borrow().is_empty());
}

#[tokio::test]
async fn unported_methods_fall_through_without_outbound() {
    let config = config();
    let client = Client::new(vec![]);
    for method in ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] {
        assert!(
            handle_workspaces_users_approvals_logs_route(&config, request(method), &client)
                .await
                .is_none(),
            "{method}"
        );
    }
    assert!(client.calls.borrow().is_empty());
}

#[tokio::test]
async fn unrelated_paths_fall_through_without_outbound() {
    let config = config();
    let client = Client::new(vec![]);
    for method in ["GET", "HEAD"] {
        assert!(
            handle_workspaces_users_approvals_logs_route(
                &config,
                BackendRequest {
                    path: "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/other",
                    ..request(method)
                },
                &client
            )
            .await
            .is_none()
        );
    }
    assert!(client.calls.borrow().is_empty());
}

const PATH: &str = "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/users/approvals/logs";
const URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/users/approvals/logs?kind=reports&reportId=report-1";

fn permission_responses(allowed: bool) -> Vec<OutboundResponse> {
    vec![
        response(r#"{"id":"user-1"}"#),
        response(r#"[{"type":"MEMBER"}]"#),
        response(if allowed { "true" } else { "false" }),
    ]
}

#[tokio::test]
async fn head_success_preserves_nonnull_log_status_headers_and_outbound_sequence() {
    let mut responses = permission_responses(true);
    responses.push(response(
        r#"[{"id":"log-1","report_id":"report-1","content":"approved"}]"#,
    ));
    let (get, head, calls) = pair(responses).await;
    assert_head_parity(&get, &head, 200);
    assert_eq!(
        get.body,
        json!({"id":"log-1","report_id":"report-1","content":"approved"})
    );
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert!(calls[2].url.contains("rpc/has_workspace_permission"));
    let permission: serde_json::Value =
        serde_json::from_str(calls[2].body.as_ref().unwrap()).unwrap();
    assert_eq!(permission["p_permission"], "approve_reports");
    assert!(
        calls[3]
            .url
            .contains("external_user_monthly_report_logs_workspace_view")
    );
    assert!(calls[3].url.contains("report_id=eq.report-1"));
}

#[tokio::test]
async fn head_permission_denial_preserves_403_and_stops_before_log_read() {
    let (get, head, calls) = pair(permission_responses(false)).await;
    assert_head_parity(&get, &head, 403);
    assert_eq!(get.body, json!({"message":"Unauthorized"}));
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert!(
        !calls
            .iter()
            .any(|call| call.url.contains("logs_workspace_view"))
    );
}
