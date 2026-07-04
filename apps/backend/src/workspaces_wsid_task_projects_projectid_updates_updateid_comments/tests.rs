use super::*;
use crate::outbound::{OutboundFuture, OutboundResponse};
use std::{cell::RefCell, collections::VecDeque};

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
                .map(|header| (header.name.to_owned(), header.value.to_owned()))
                .collect(),
            method: request.method,
            url: request.url.to_owned(),
        });
        let response = self
            .responses
            .borrow_mut()
            .pop_front()
            .expect("test response queue exhausted");
        Box::pin(async move { Ok(response) })
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.contact_data = contact::ContactDataConfig::new(
        "https://project-ref.supabase.co/",
        "test-service-role-secret",
    );
    config
}

fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
        status,
    }
}

fn request() -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer user-token"),
        body_text: None,
        cookie: None,
        method: "GET",
        origin: None,
        path: "/api/v1/workspaces/ws-1/task-projects/project-1/updates/update-1/comments",
        referer: None,
        request_id: None,
        url: Some(
            "https://tuturuuu.localhost/api/v1/workspaces/ws-1/task-projects/project-1/updates/update-1/comments",
        ),
    }
}

#[test]
fn match_path_accepts_valid_paths() {
    assert_eq!(
        match_path("/api/v1/workspaces/ws1/task-projects/p1/updates/u1/comments"),
        Some(("ws1", "p1", "u1"))
    );
    assert_eq!(
        match_path(
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000\
                /task-projects/11111111-1111-1111-1111-111111111111\
                /updates/22222222-2222-2222-2222-222222222222/comments"
        ),
        Some((
            "00000000-0000-0000-0000-000000000000",
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
        ))
    );
}

#[test]
fn match_path_rejects_invalid_paths() {
    // Missing prefix.
    assert_eq!(
        match_path("/api/workspaces/ws1/task-projects/p1/updates/u1/comments"),
        None
    );
    // Missing /comments suffix.
    assert_eq!(
        match_path("/api/v1/workspaces/ws1/task-projects/p1/updates/u1"),
        None
    );
    // Extra trailing segment.
    assert_eq!(
        match_path("/api/v1/workspaces/ws1/task-projects/p1/updates/u1/comments/extra"),
        None
    );
    // Empty ws_id.
    assert_eq!(
        match_path("/api/v1/workspaces//task-projects/p1/updates/u1/comments"),
        None
    );
    // Empty project_id.
    assert_eq!(
        match_path("/api/v1/workspaces/ws1/task-projects//updates/u1/comments"),
        None
    );
    // Empty update_id.
    assert_eq!(
        match_path("/api/v1/workspaces/ws1/task-projects/p1/updates//comments"),
        None
    );
    // Slash in update_id.
    assert_eq!(
        match_path("/api/v1/workspaces/ws1/task-projects/p1/updates/u1/foo/comments"),
        None
    );
    // Unrelated path.
    assert_eq!(match_path("/health"), None);
    assert_eq!(match_path(""), None);
}

#[tokio::test]
async fn get_comments_rejects_update_outside_requested_project_before_comment_fetch() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"id":"project-1"}]"#),
        outbound_response(200, r#"[]"#),
    ]);

    let response = handle_workspaces_wsid_task_projects_projectid_updates_updateid_comments_route(
        &config,
        request(),
        &outbound,
    )
    .await
    .expect("route should match");

    assert_eq!(response.status, 404);
    assert_eq!(response.body, json!({ "error": "Update not found" }));
    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert!(calls.iter().any(|call| {
        call.url.contains("/rest/v1/task_project_updates?")
            && call.url.contains("id=eq.update-1")
            && call.url.contains("project_id=eq.project-1")
    }));
    assert!(
        calls
            .iter()
            .all(|call| !call.url.contains("/rest/v1/task_project_update_comments?")),
        "comments must not be fetched when update scope validation fails"
    );
}

#[tokio::test]
async fn get_comments_fetches_comments_after_project_and_update_scope_match() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"id":"project-1"}]"#),
        outbound_response(200, r#"[{"id":"update-1"}]"#),
        outbound_response(
            200,
            r#"[{"id":"comment-1","parent_id":null,"content":"hello","user":{"id":"user-1","display_name":"Ada","avatar_url":null}}]"#,
        ),
    ]);

    let response = handle_workspaces_wsid_task_projects_projectid_updates_updateid_comments_route(
        &config,
        request(),
        &outbound,
    )
    .await
    .expect("route should match");

    assert_eq!(response.status, 200);
    assert_eq!(response.body["comments"][0]["id"], json!("comment-1"));
    let calls = outbound.calls();
    assert_eq!(calls.len(), 5);
    assert!(calls.iter().any(|call| {
        call.url.contains("/rest/v1/task_projects?")
            && call.url.contains("id=eq.project-1")
            && call.url.contains("ws_id=eq.ws-1")
    }));
    assert!(calls.iter().any(|call| {
        call.url.contains("/rest/v1/task_project_update_comments?")
            && call.url.contains("update_id=eq.update-1")
    }));
}

#[test]
fn build_comment_tree_creates_threaded_structure() {
    let raw = vec![
        json!({
            "id": "c1",
            "parent_id": null,
            "content": "top",
            "user": { "id": "u1", "display_name": "Alice", "avatar_url": null }
        }),
        json!({
            "id": "c2",
            "parent_id": "c1",
            "content": "reply",
            "user": { "id": "u2", "display_name": "Bob", "avatar_url": null }
        }),
    ];

    let tree = build_comment_tree(raw);
    assert_eq!(tree.len(), 1, "one top-level comment");

    let top = &tree[0];
    assert_eq!(top["id"], json!("c1"));
    let replies = top["replies"].as_array().expect("replies array");
    assert_eq!(replies.len(), 1);
    assert_eq!(replies[0]["id"], json!("c2"));
    assert_eq!(replies[0]["replies"], json!([]));
}

#[test]
fn build_comment_tree_handles_empty_input() {
    let tree = build_comment_tree(vec![]);
    assert!(tree.is_empty());
}

#[test]
fn build_comment_tree_ignores_non_object_values() {
    let raw = vec![json!("not an object"), json!(42)];
    let tree = build_comment_tree(raw);
    assert!(tree.is_empty());
}

#[test]
fn build_comment_tree_drops_comments_with_unknown_parent() {
    let raw = vec![json!({
        "id": "c2",
        "parent_id": "ghost",
        "content": "orphan",
        "user": null
    })];
    // parent "ghost" does not exist in the map, so c2 is not top-level.
    let tree = build_comment_tree(raw);
    assert!(tree.is_empty());
}
