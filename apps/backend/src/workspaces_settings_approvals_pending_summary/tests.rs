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
    let get = handle_workspaces_settings_approvals_pending_summary_route(
        &config,
        request("GET"),
        &get_client,
    )
    .await
    .unwrap();
    let head = handle_workspaces_settings_approvals_pending_summary_route(
        &config,
        request("HEAD"),
        &head_client,
    )
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
    let get = handle_workspaces_settings_approvals_pending_summary_route(
        &config,
        BackendRequest {
            authorization: None,
            ..request("GET")
        },
        &client,
    )
    .await
    .unwrap();
    let head = handle_workspaces_settings_approvals_pending_summary_route(
        &config,
        BackendRequest {
            authorization: None,
            ..request("HEAD")
        },
        &client,
    )
    .await
    .unwrap();
    assert_head_parity(&get, &head, 401);
    assert_ne!(get.body, serde_json::Value::Null);
    assert!(client.calls.borrow().is_empty());
}

#[tokio::test]
async fn unported_methods_fall_through_without_outbound() {
    let config = config();
    let client = Client::new(vec![]);
    for method in ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] {
        assert!(
            handle_workspaces_settings_approvals_pending_summary_route(
                &config,
                request(method),
                &client
            )
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
            handle_workspaces_settings_approvals_pending_summary_route(
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

const PATH: &str =
    "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/settings/approvals/pending-summary";
const URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/00000000-0000-0000-0000-000000000001/settings/approvals/pending-summary";

fn permission_responses(creator: &str, permission: &str) -> Vec<OutboundResponse> {
    vec![
        response(r#"{"id":"user-1"}"#),
        response(r#"[{"type":"MEMBER"}]"#),
        response(&format!(r#"[{{"creator_id":"{creator}"}}]"#)),
        response("[]"),
        response(&format!(r#"[{{"permission":"{permission}"}}]"#)),
    ]
}

#[tokio::test]
async fn head_success_preserves_counts_status_headers_and_outbound_sequence() {
    let mut responses = permission_responses("user-1", "manage_workspace_settings");
    responses.push(response(r#"[{"type":"MEMBER"}]"#));
    let mut reports = response("[]");
    reports
        .headers
        .push(("content-range".to_owned(), "0-2/3".to_owned()));
    let mut posts = response("[]");
    posts
        .headers
        .push(("content-range".to_owned(), "0-4/5".to_owned()));
    responses.extend([reports, posts]);
    let (get, head, calls) = pair(responses).await;
    assert_head_parity(&get, &head, 200);
    assert_eq!(get.body, json!({"pending":{"reports":3,"posts":5}}));
    assert_eq!(calls.len(), 8);
    assert!(
        calls[6]
            .url
            .contains("external_user_monthly_reports_workspace_view")
    );
    assert!(calls[7].url.contains("user_group_post_checks"));
    for call in &calls[6..] {
        assert_eq!(call.method, OutboundMethod::Get);
        assert!(
            call.headers
                .iter()
                .any(|(name, value)| name.eq_ignore_ascii_case("Prefer")
                    && value.contains("count=exact"))
        );
    }
}

#[tokio::test]
async fn head_permission_denial_preserves_403_and_stops_before_counts() {
    let (get, head, calls) = pair(permission_responses("other-user", "view_workspace")).await;
    assert_head_parity(&get, &head, 403);
    assert_eq!(
        get.body,
        json!({"error":"Insufficient permissions to view workspace settings"})
    );
    assert_eq!(calls.len(), 5);
    assert!(
        !calls
            .iter()
            .any(|call| call.url.contains("external_user_monthly_reports"))
    );
}
