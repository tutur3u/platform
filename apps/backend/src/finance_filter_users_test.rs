use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const FILTER_USERS_PATH: &str = "/api/v1/workspaces/ws-1/finance/filter-users";
const FILTER_USERS_URL: &str =
    "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/filter-users";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const TEST_APP_SESSION_SECRET: &str = "test-app-session-secret";

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
    config
        .app_coordination_secrets
        .push(TEST_APP_SESSION_SECRET.to_owned());
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co/", SERVICE_ROLE_KEY);
    config
}

fn request_with_bearer(url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer browser-access-token"),
        body_text: None,
        cookie: None,
        method: "GET",
        origin: None,
        path: FILTER_USERS_PATH,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn app_session_token(target_app: &str, scopes: Vec<String>) -> String {
    let header = contact::encode_app_session_part(br#"{"alg":"HS256","typ":"JWT"}"#);
    let payload = contact::encode_app_session_part(
        serde_json::to_string(&contact::AppCoordinationClaims {
            aud: contact::app_coordination_token_audience().to_owned(),
            email: Some("finance@example.com".to_owned()),
            exp: 4_102_444_800,
            iat: 1_700_000_000,
            iss: contact::app_coordination_token_issuer().to_owned(),
            jti: "finance-filter-users-test".to_owned(),
            origin_app: "finance".to_owned(),
            scopes,
            sub: "finance-user-1".to_owned(),
            target_app: target_app.to_owned(),
            typ: "app_coordination".to_owned(),
        })
        .expect("app-session payload"),
    );
    let unsigned = format!("{header}.{payload}");
    let signature = contact::sign_app_coordination_content(&unsigned, TEST_APP_SESSION_SECRET)
        .expect("app-session signature");

    format!(
        "{}{unsigned}.{signature}",
        contact::app_coordination_token_prefix()
    )
}

fn finance_app_session_bearer() -> String {
    format!(
        "Bearer {}",
        app_session_token("finance", vec![contact::APP_SESSION_SCOPE.to_owned()])
    )
}

fn successful_browser_responses(filter_users: &'static str) -> Vec<OutboundResponse> {
    vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "true"),
        outbound_response(200, filter_users),
    ]
}

#[tokio::test]
async fn finance_filter_users_returns_workspace_users_with_caller_token() {
    let outbound = RecordingOutboundClient::with_responses(successful_browser_responses(
        r#"[{"avatar_url":"https://example.com/avatar.png","display_name":"Ada","email":"ada@example.com","full_name":"Ada Lovelace","id":"user-1"}]"#,
    ));
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(FILTER_USERS_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "users": [
                {
                    "avatar_url": "https://example.com/avatar.png",
                    "display_name": "Ada",
                    "email": "ada@example.com",
                    "full_name": "Ada Lovelace",
                    "id": "user-1"
                }
            ]
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert!(calls[3].url.contains("/rest/v1/workspace_users?"));
    assert!(
        calls[3]
            .url
            .contains("select=id%2Cfull_name%2Cdisplay_name%2Cemail%2Cavatar_url")
    );
    assert!(calls[3].url.contains("ws_id=eq.resolved-ws"));
    assert!(calls[3].url.contains("order=full_name.asc"));
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer browser-access-token")
    );
}

#[tokio::test]
async fn finance_filter_users_returns_transaction_creators_with_service_role() {
    let url = "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/filter-users?type=transaction_creators";
    let outbound = RecordingOutboundClient::with_responses(successful_browser_responses(
        r#"[{"display_name":"Kai","id":"user-2"}]"#,
    ));
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(url),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({ "users": [{ "display_name": "Kai", "id": "user-2" }] })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert!(
        calls[3]
            .url
            .contains("/rest/v1/distinct_transaction_creators?")
    );
    assert!(calls[3].url.contains("select=id%2Cdisplay_name"));
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn finance_filter_users_accepts_app_session_for_invoice_creators() {
    let url = "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/filter-users?type=invoice_creators";
    let bearer = finance_app_session_bearer();
    let request = BackendRequest {
        authorization: Some(Box::leak(bearer.into_boxed_str())),
        ..request_with_bearer(url)
    };
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"id":"app-session-ws"}]"#),
        outbound_response(200, "true"),
        outbound_response(200, r#"[{"display_name":"Mina","id":"user-3"}]"#),
    ]);
    let response =
        handle_backend_request(&backend_config_with_contact_data(), request, &outbound).await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({ "users": [{ "display_name": "Mina", "id": "user-3" }] })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[0].url.contains("/rest/v1/workspaces?"));
    assert_eq!(
        calls[1].body.as_deref(),
        Some(
            r#"{"p_permission":"view_transactions","p_user_id":"finance-user-1","p_ws_id":"app-session-ws"}"#
        )
    );
    assert!(calls[2].url.contains("/rest/v1/distinct_invoice_creators?"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn finance_filter_users_rejects_missing_view_transactions() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "false"),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(FILTER_USERS_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body, json!({ "message": "Unauthorized" }));
}

#[tokio::test]
async fn finance_filter_users_preserves_branch_specific_failure_body() {
    let url = "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/filter-users?type=transaction_creators";
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "true"),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(url),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Failed to fetch transaction creators" })
    );
}
