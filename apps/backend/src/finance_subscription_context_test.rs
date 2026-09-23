use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{cell::RefCell, collections::VecDeque};

const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const SUBSCRIPTION_CONTEXT_PATH: &str =
    "/api/v1/workspaces/ws-1/finance/invoices/subscription/context";
const SUBSCRIPTION_CONTEXT_URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/invoices/subscription/context?userId=user-1&month=2026-06&groupIds=group-1";
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
        headers: serde_json::from_str::<serde_json::Value>(body_text)
            .ok()
            .and_then(|value| {
                value
                    .as_array()
                    .map(|rows| vec![("content-range".to_owned(), format!("*/{}", rows.len()))])
            })
            .unwrap_or_default(),
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
        if_none_match: None,
        method: "GET",
        origin: None,
        path: SUBSCRIPTION_CONTEXT_PATH,
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
            jti: "finance-subscription-context-test".to_owned(),
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

fn successful_browser_responses(
    valid_groups: &'static str,
    attendance: &'static str,
    latest_invoices: &'static str,
) -> Vec<OutboundResponse> {
    vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "true"),
        outbound_response(200, valid_groups),
        outbound_response(200, attendance),
        outbound_response(200, latest_invoices),
    ]
}

#[tokio::test]
async fn finance_subscription_context_returns_attendance_and_latest_paid_invoice() {
    let outbound = RecordingOutboundClient::with_responses(successful_browser_responses(
        r#"[{"group_id":"group-1"}]"#,
        r#"[{"date":"2026-06-05","group_id":"group-1","status":"PRESENT"}]"#,
        r#"[
          {"finance_invoices":{"completed_at":null,"created_at":"2026-07-10T00:00:00.000Z","valid_until":"2026-08-01"},"user_group_id":"group-1"},
          {"finance_invoices":{"completed_at":"2026-06-10T00:00:00.000Z","created_at":"2026-06-10T00:00:00.000Z","valid_until":"2026-06-01"},"user_group_id":"group-1"},
          {"finance_invoices":{"completed_at":"2026-08-10T00:00:00.000Z","created_at":"2026-08-10T00:00:00.000Z","valid_until":null},"user_group_id":"group-1"},
          {"finance_invoices":{"completed_at":"2026-05-10T00:00:00.000Z","created_at":"2026-05-10T00:00:00.000Z","valid_until":"2026-07-01"},"user_group_id":"group-1"}
        ]"#,
    ));
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(SUBSCRIPTION_CONTEXT_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "attendance": [
                {
                    "date": "2026-06-05",
                    "group_id": "group-1",
                    "status": "PRESENT"
                }
            ],
            "latestInvoices": [
                {
                    "created_at": "2026-05-10T00:00:00.000Z",
                    "group_id": "group-1",
                    "valid_until": "2026-07-01"
                }
            ]
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 6);
    assert!(
        calls[3]
            .url
            .contains("/rest/v1/workspace_user_groups_users?")
    );
    assert!(calls[3].url.contains("user_id=eq.user-1"));
    assert!(calls[3].url.contains("role=eq.STUDENT"));
    assert!(
        calls[3]
            .url
            .contains("workspace_user_groups.ws_id=eq.resolved-ws")
    );
    assert!(calls[3].url.contains("group_id=in.%28%22group-1%22%29"));
    assert!(calls[4].url.contains("/rest/v1/user_group_attendance?"));
    assert!(calls[4].url.contains("date=gte.2026-06-01"));
    assert!(calls[4].url.contains("date=lt.2026-07-01"));
    assert!(
        calls[5]
            .url
            .contains("/rest/v1/finance_invoice_user_groups?")
    );
    assert!(
        calls[5]
            .url
            .contains("finance_invoices.completed_at=not.is.null")
    );

    for call in &calls[3..=5] {
        assert_eq!(
            recorded_header(call, "Authorization"),
            Some("Bearer test-service-role-secret")
        );
    }
}

#[tokio::test]
async fn finance_subscription_context_uses_month_count_for_attendance_bound() {
    let outbound = RecordingOutboundClient::with_responses(successful_browser_responses(
        r#"[{"group_id":"group-1"}]"#,
        r#"[]"#,
        r#"[]"#,
    ));
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/invoices/subscription/context?userId=user-1&month=2026-06&monthCount=3&groupIds=group-1",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 6);
    assert!(calls[4].url.contains("date=gte.2026-06-01"));
    assert!(calls[4].url.contains("date=lt.2026-09-01"));
}

#[tokio::test]
async fn finance_subscription_context_rejects_invalid_month_count() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "true"),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/invoices/subscription/context?userId=user-1&month=2026-06&monthCount=13&groupIds=group-1",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(
        response.body,
        json!({ "message": "monthCount must be an integer between 1 and 12" })
    );
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn finance_subscription_context_short_circuits_when_query_is_incomplete() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "true"),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "https://tuturuuu.localhost/api/v1/workspaces/ws-1/finance/invoices/subscription/context?month=2026-06",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "attendance": [],
            "latestInvoices": []
        })
    );
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn finance_subscription_context_accepts_app_session_tokens() {
    let bearer = finance_app_session_bearer();
    let request = BackendRequest {
        authorization: Some(Box::leak(bearer.into_boxed_str())),
        ..request_with_bearer(SUBSCRIPTION_CONTEXT_URL)
    };
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"id":"app-session-ws"}]"#),
        outbound_response(200, "true"),
        outbound_response(200, r#"[{"group_id":"group-1"}]"#),
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[]"#),
    ]);
    let response =
        handle_backend_request(&backend_config_with_contact_data(), request, &outbound).await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["latestInvoices"], json!([]));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 5);
    assert_eq!(
        calls[1].body.as_deref(),
        Some(
            r#"{"p_permission":"create_invoices","p_user_id":"finance-user-1","p_ws_id":"app-session-ws"}"#
        )
    );
    assert!(
        calls[2]
            .url
            .contains("workspace_user_groups.ws_id=eq.app-session-ws")
    );
}

#[tokio::test]
async fn finance_subscription_context_rejects_missing_create_invoice_permission() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "false"),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(SUBSCRIPTION_CONTEXT_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body, json!({ "message": "Unauthorized" }));
}

#[tokio::test]
async fn finance_subscription_context_preserves_failure_body() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "true"),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(SUBSCRIPTION_CONTEXT_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error fetching subscription invoice context" })
    );
}

#[tokio::test]
async fn finance_subscription_context_preserves_exact_months_and_legacy_cutoff() {
    let outbound = RecordingOutboundClient::with_responses(successful_browser_responses(
        r#"[{"group_id":"group-1"}]"#,
        "[]",
        r#"[
          {"user_group_id":"group-1","finance_invoices":{"completed_at":"2026-01-01","created_at":"2026-01-01","valid_until":"2026-02-01"}},
          {"user_group_id":"group-1","finance_invoices":{"completed_at":"2026-03-01","created_at":"2026-03-01","valid_until":"2026-04-01","subscription_months":["2026-03-01"]}},
          {"user_group_id":"group-1","finance_invoices":{"completed_at":"2026-05-01","created_at":"2026-05-01","valid_until":"2026-06-01","subscription_months":["2026-05-01"]}},
          {"user_group_id":"group-1","finance_invoices":{"completed_at":null,"valid_until":"2026-07-01","subscription_months":["2026-06-01"]}}
        ]"#,
    ));
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(SUBSCRIPTION_CONTEXT_URL),
        &outbound,
    )
    .await;
    assert_eq!(response.status, 200);
    assert_eq!(
        response.body["latestInvoices"],
        json!([
          {"group_id":"group-1","created_at":"2026-01-01","valid_until":"2026-02-01"},
          {"group_id":"group-1","created_at":"2026-03-01","valid_until":"2026-04-01","covered_months":["2026-03-01"]},
          {"group_id":"group-1","created_at":"2026-05-01","valid_until":"2026-06-01","covered_months":["2026-05-01"]}
        ])
    );
    assert!(
        outbound.calls()[5]
            .url
            .contains("finance_invoices.ws_id=eq.resolved-ws")
    );
}

fn coverage_page(length: usize, total: usize) -> OutboundResponse {
    let rows = vec![
        json!({"user_group_id":"group-1","finance_invoices":{"completed_at":"2026-03-01","valid_until":"2026-04-01","subscription_months":["2026-03-01"]}});
        length
    ];
    OutboundResponse {
        status: 200,
        body_text: serde_json::to_string(&rows).unwrap(),
        headers: vec![("content-range".to_owned(), format!("*/{total}"))],
    }
}

#[tokio::test]
async fn finance_subscription_context_reads_all_coverage_pages() {
    let mut responses = successful_browser_responses(r#"[{"group_id":"group-1"}]"#, "[]", "[]");
    responses.pop();
    responses.push(coverage_page(500, 501));
    responses.push(coverage_page(1, 501));
    let outbound = RecordingOutboundClient::with_responses(responses);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(SUBSCRIPTION_CONTEXT_URL),
        &outbound,
    )
    .await;
    assert_eq!(response.status, 200);
    assert_eq!(
        response.body["latestInvoices"].as_array().unwrap().len(),
        501
    );
    assert!(outbound.calls()[6].url.contains("offset=500"));
}

#[tokio::test]
async fn finance_subscription_context_rejects_truncated_or_changing_pages() {
    for second_page in [coverage_page(0, 501), coverage_page(2, 502)] {
        let mut responses = successful_browser_responses(r#"[{"group_id":"group-1"}]"#, "[]", "[]");
        responses.pop();
        responses.push(coverage_page(500, 501));
        responses.push(second_page);
        let outbound = RecordingOutboundClient::with_responses(responses);
        let response = handle_backend_request(
            &backend_config_with_contact_data(),
            request_with_bearer(SUBSCRIPTION_CONTEXT_URL),
            &outbound,
        )
        .await;
        assert_eq!(response.status, 500);
        assert!(response.body.get("latestInvoices").is_none());
    }
}

#[tokio::test]
async fn finance_subscription_context_rejects_missing_counts() {
    let mut responses = successful_browser_responses(r#"[{"group_id":"group-1"}]"#, "[]", "[]");
    responses[4].headers.clear();
    let outbound = RecordingOutboundClient::with_responses(responses);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(SUBSCRIPTION_CONTEXT_URL),
        &outbound,
    )
    .await;
    assert_eq!(response.status, 500);
}
