use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const MIRA_ACHIEVEMENTS_PATH: &str = "/api/v1/mira/achievements";
const MIRA_ACHIEVEMENTS_URL: &str = "https://tuturuuu.localhost/api/v1/mira/achievements";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";

#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
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

fn query_value(request: &RecordedOutboundRequest, key: &str) -> Option<String> {
    url::Url::parse(&request.url)
        .ok()?
        .query_pairs()
        .find(|(query_key, _)| query_key == key)
        .map(|(_, value)| value.into_owned())
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

fn request(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        if_none_match: None,
        method,
        origin: None,
        path: MIRA_ACHIEVEMENTS_PATH,
        referer: None,
        request_id: None,
        url: Some(MIRA_ACHIEVEMENTS_URL),
    }
}

fn request_with_bearer(method: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        ..request(method)
    }
}

#[tokio::test]
async fn mira_achievements_returns_catalog_with_unlock_stats() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"mira@example.com"}"#),
        outbound_response(
            200,
            r#"[
                {"id":"ach-1","category":"focus","sort_order":1,"xp_reward":50,"title":"First"},
                {"id":"ach-2","category":"focus","sort_order":2,"xp_reward":20,"title":"Second"},
                {"id":"ach-3","category":"social","sort_order":1,"xp_reward":5,"title":"Third"}
            ]"#,
        ),
        outbound_response(
            200,
            r#"[
                {"achievement_id":"ach-1","unlocked_at":"2026-01-01T00:00:00Z"},
                {"achievement_id":"ach-3","unlocked_at":null}
            ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "achievements": [
                {
                    "id": "ach-1",
                    "category": "focus",
                    "sort_order": 1,
                    "xp_reward": 50,
                    "title": "First",
                    "is_unlocked": true,
                    "unlocked_at": "2026-01-01T00:00:00Z",
                },
                {
                    "id": "ach-2",
                    "category": "focus",
                    "sort_order": 2,
                    "xp_reward": 20,
                    "title": "Second",
                    "is_unlocked": false,
                    "unlocked_at": null,
                },
                {
                    "id": "ach-3",
                    "category": "social",
                    "sort_order": 1,
                    "xp_reward": 5,
                    "title": "Third",
                    "is_unlocked": true,
                    "unlocked_at": null,
                },
            ],
            "grouped": {
                "focus": [
                    {
                        "id": "ach-1",
                        "category": "focus",
                        "sort_order": 1,
                        "xp_reward": 50,
                        "title": "First",
                        "is_unlocked": true,
                        "unlocked_at": "2026-01-01T00:00:00Z",
                    },
                    {
                        "id": "ach-2",
                        "category": "focus",
                        "sort_order": 2,
                        "xp_reward": 20,
                        "title": "Second",
                        "is_unlocked": false,
                        "unlocked_at": null,
                    },
                ],
                "social": [
                    {
                        "id": "ach-3",
                        "category": "social",
                        "sort_order": 1,
                        "xp_reward": 5,
                        "title": "Third",
                        "is_unlocked": true,
                        "unlocked_at": null,
                    },
                ],
            },
            "stats": {
                "total": 3,
                "unlocked": 2,
                "total_xp_earned": 55,
                "completion_percentage": 67,
            },
        })
    );
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );

    let achievements_call = &calls[1];
    assert_eq!(achievements_call.method, OutboundMethod::Get);
    assert!(
        achievements_call
            .url
            .contains("/rest/v1/mira_achievements?")
    );
    assert_eq!(
        query_value(achievements_call, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        query_value(achievements_call, "order").as_deref(),
        Some("category,sort_order")
    );
    assert_eq!(
        recorded_header(achievements_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(achievements_call, "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(achievements_call, "Content-Profile"),
        Some("private")
    );

    let user_achievements_call = &calls[2];
    assert!(
        user_achievements_call
            .url
            .contains("/rest/v1/mira_user_achievements?")
    );
    assert_eq!(
        query_value(user_achievements_call, "select").as_deref(),
        Some("achievement_id,unlocked_at")
    );
    assert_eq!(
        query_value(user_achievements_call, "user_id").as_deref(),
        Some("eq.user-1")
    );
    assert_eq!(
        recorded_header(user_achievements_call, "Authorization"),
        Some("Bearer browser-access-token")
    );
}

#[tokio::test]
async fn mira_achievements_preserves_user_achievement_fallback() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"mira@example.com"}"#),
        outbound_response(
            200,
            r#"[{"id":"ach-1","category":"focus","sort_order":1,"xp_reward":50}]"#,
        ),
        outbound_response(500, r#"{"error":"rls failed"}"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["stats"]["unlocked"], json!(0));
    assert_eq!(response.body["stats"]["total_xp_earned"], json!(0));
    assert_eq!(
        response.body["achievements"][0]["is_unlocked"],
        json!(false)
    );
}

#[tokio::test]
async fn mira_achievements_requires_session_and_claims_route() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("GET"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn mira_achievements_rejects_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("POST"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body, json!({ "error": "method not allowed" }));
    assert!(outbound.calls().is_empty());
}
