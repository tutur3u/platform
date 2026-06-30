use super::contact::{
    APP_SESSION_COOKIE_NAME, APP_SESSION_SCOPE, AppCoordinationClaims,
    CONTACT_DATA_LAYER_NOT_READY_MESSAGE, CURRENT_USER_FULL_NAME_PATH, CURRENT_USER_PROFILE_PATH,
    SUPPORT_INQUIRIES_PATH, verify_app_session_token,
};
use super::onboarding_progress::ONBOARDING_PROGRESS_PATH;
use super::outbound::{
    OutboundError, OutboundFuture, OutboundHttpClient, OutboundMethod, OutboundRequest,
    OutboundResponse,
};
use super::*;
use std::{cell::RefCell, collections::VecDeque};

fn request(method: &'static str, path: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some("https://tuturuuu.localhost/test"),
    }
}

fn request_with_body(
    method: &'static str,
    path: &'static str,
    body_text: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        body_text: Some(body_text),
        ..request(method, path)
    }
}

fn authorized_request(method: &'static str, path: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer secret"),
        ..request(method, path)
    }
}

fn backend_config_with_internal_token() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.internal_token = "secret".to_owned();
    config
}

fn backend_config_with_app_session_secret() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config
        .app_coordination_secrets
        .push("test-app-session-secret".to_owned());
    config
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = backend_config_with_internal_token();
    config
        .app_coordination_secrets
        .push("test-app-session-secret".to_owned());
    config.contact_data = contact::ContactDataConfig::new(
        "https://project-ref.supabase.co/",
        "test-service-role-secret",
    );
    config
}

fn backend_config_with_aurora_health() -> BackendConfig {
    let mut config = backend_config_with_contact_data();
    config.aurora_external_url = "https://aurora.example.test/".to_owned();
    config.aurora_external_workspace_id = "aurora-workspace".to_owned();
    config
}

fn backend_config_with_discord_cron() -> BackendConfig {
    let mut config = backend_config_with_internal_token();
    config.cron_secret = "cron-secret".to_owned();
    config.discord_app_deployment_url = "https://discord.example.test".to_owned();
    config
}

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

impl Default for RecordingOutboundClient {
    fn default() -> Self {
        Self::with_response(200, r#"{"ok":true}"#)
    }
}

impl RecordingOutboundClient {
    fn with_response(status: u16, body_text: impl Into<String>) -> Self {
        Self::with_responses(vec![outbound_response(status, body_text)])
    }

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
            .unwrap_or_else(|| outbound_response(200, r#"{"ok":true}"#));

        Box::pin(async move { Ok(response) })
    }
}

fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    outbound_response_with_headers(status, body_text, Vec::new())
}

fn outbound_response_with_headers(
    status: u16,
    body_text: impl Into<String>,
    headers: Vec<(String, String)>,
) -> OutboundResponse {
    let mut response_headers = vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())];
    response_headers.extend(headers);

    OutboundResponse {
        body_text: body_text.into(),
        headers: response_headers,
        status,
    }
}

fn supabase_auth_cookie_value(access_token: &str) -> String {
    format!(
        "base64-{}",
        contact::encode_app_session_part(format!(r#"{{"access_token":"{access_token}"}}"#))
    )
}

fn leaked_test_str(value: String) -> &'static str {
    Box::leak(value.into_boxed_str())
}

fn decoded_query_value(raw_url: &str, key: &str) -> Option<String> {
    url::Url::parse(raw_url)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

#[tokio::test]
async fn async_handler_preserves_pure_route_dispatch_without_outbound_calls() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, authorized_request("GET", "/api/health"), &outbound).await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["status"], "ok");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn outbound_client_boundary_accepts_mocked_requests() {
    let outbound = RecordingOutboundClient::default();
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, "https://api.example.test/rpc")
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(r#"{"hello":"world"}"#),
        )
        .await
        .expect("mock outbound response");

    assert_eq!(
        outbound.calls(),
        vec![RecordedOutboundRequest {
            body: Some(r#"{"hello":"world"}"#.to_owned()),
            headers: vec![("Content-Type".to_owned(), APPLICATION_JSON.to_owned())],
            method: OutboundMethod::Post,
            url: "https://api.example.test/rpc".to_owned(),
        }]
    );
    assert_eq!(response.status, 200);
    assert_eq!(response.header("Content-Type"), Some(APPLICATION_JSON));

    let payload: serde_json::Value = response.json().expect("json payload");
    assert_eq!(payload["ok"], true);
}

#[tokio::test]
async fn onboarding_progress_requires_authenticated_user() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("GET", ONBOARDING_PROGRESS_PATH), &outbound).await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn onboarding_progress_reads_current_user_row() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-123","email":"ada@example.com"}"#),
        outbound_response(
            200,
            r#"[{"user_id":"user-123","current_step":"workspace","tour_completed":false}]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "GET",
            ONBOARDING_PROGRESS_PATH,
            "supabase-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["user_id"], "user-123");
    assert_eq!(response.body["current_step"], "workspace");
    assert_eq!(response.body["tour_completed"], false);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer supabase-access-token")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/onboarding_progress?select=*&user_id=eq.user-123&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn onboarding_progress_returns_null_when_row_is_missing() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-123","email":"ada@example.com"}"#),
        outbound_response(200, "[]"),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "GET",
            ONBOARDING_PROGRESS_PATH,
            "supabase-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, Value::Null);
}

#[tokio::test]
async fn onboarding_progress_patch_filters_fields_and_upserts() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-123","email":"ada@example.com"}"#),
        outbound_response(
            201,
            r#"[{"user_id":"user-123","current_step":"profile","tour_completed":true}]"#,
        ),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                body_text: Some(
                    r#"{"current_step":"profile","tour_completed":true,"invited_emails":["team@example.com"],"ignored":"value"}"#,
                ),
                ..request_with_bearer(
                    "PATCH",
                    ONBOARDING_PROGRESS_PATH,
                    "supabase-access-token".to_owned(),
                )
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["user_id"], "user-123");
    assert_eq!(response.body["current_step"], "profile");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Post);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/onboarding_progress?select=*&on_conflict=user_id"
    );
    assert_eq!(
        recorded_header(&calls[1], "Prefer"),
        Some("resolution=merge-duplicates,return=representation")
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[1].body.as_deref().unwrap()).unwrap(),
        json!({
            "current_step": "profile",
            "invited_emails": ["team@example.com"],
            "tour_completed": true,
            "user_id": "user-123",
        })
    );
}

#[tokio::test]
async fn onboarding_progress_patch_rejects_invalid_or_empty_updates() {
    let config = backend_config_with_contact_data();
    let invalid_json_outbound = RecordingOutboundClient::with_response(
        200,
        r#"{"id":"user-123","email":"ada@example.com"}"#,
    );
    let invalid_json_response = handle_backend_request(
        &config,
        BackendRequest {
            body_text: Some("not-json"),
            ..request_with_bearer(
                "PATCH",
                ONBOARDING_PROGRESS_PATH,
                "supabase-access-token".to_owned(),
            )
        },
        &invalid_json_outbound,
    )
    .await;

    assert_eq!(invalid_json_response.status, 400);
    assert_eq!(
        invalid_json_response.body["message"],
        "Invalid request body"
    );
    assert_eq!(invalid_json_outbound.calls().len(), 1);

    let empty_outbound = RecordingOutboundClient::with_response(
        200,
        r#"{"id":"user-123","email":"ada@example.com"}"#,
    );
    let empty_response = handle_backend_request(
        &config,
        BackendRequest {
            body_text: Some(r#"{"ignored":"value"}"#),
            ..request_with_bearer(
                "PATCH",
                ONBOARDING_PROGRESS_PATH,
                "supabase-access-token".to_owned(),
            )
        },
        &empty_outbound,
    )
    .await;

    assert_eq!(empty_response.status, 400);
    assert_eq!(empty_response.body["message"], "No valid fields to update");
    assert_eq!(empty_outbound.calls().len(), 1);
}

#[tokio::test]
async fn onboarding_progress_rejects_unsupported_methods() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", ONBOARDING_PROGRESS_PATH),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, PATCH"));
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn discord_cron_proxy_requires_configured_cron_secret() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", DISCORD_DAILY_REPORT_CRON_PATH),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["ok"], false);
    assert_eq!(response.body["error"], MISSING_CRON_SECRET_MESSAGE);
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn discord_cron_proxy_rejects_wrong_bearer() {
    let config = backend_config_with_discord_cron();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        authorized_request("GET", DISCORD_DAILY_REPORT_CRON_PATH),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "ok": false }));
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn discord_daily_report_cron_proxy_passes_upstream_status_body_and_auth() {
    let config = backend_config_with_discord_cron();
    let outbound =
        RecordingOutboundClient::with_response(202, r#"{"ok":true,"route":"daily-report"}"#);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer cron-secret"),
            ..request("GET", DISCORD_DAILY_REPORT_CRON_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 202);
    assert_eq!(response.body["ok"], true);
    assert_eq!(response.body["route"], "daily-report");
    assert_eq!(
        outbound.calls(),
        vec![RecordedOutboundRequest {
            body: None,
            headers: vec![
                ("Content-Type".to_owned(), APPLICATION_JSON.to_owned()),
                ("Authorization".to_owned(), "Bearer cron-secret".to_owned()),
            ],
            method: OutboundMethod::Post,
            url: "https://discord.example.test/daily-report".to_owned(),
        }]
    );
}

#[tokio::test]
async fn discord_wol_cron_proxy_uses_invalid_json_fallback() {
    let config = backend_config_with_discord_cron();
    let outbound = RecordingOutboundClient::with_response(503, "not json");
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer cron-secret"),
            ..request("GET", DISCORD_WOL_DAILY_REMIND_CRON_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 503);
    assert_eq!(response.body["ok"], false);
    assert_eq!(response.body["error"], INVALID_DISCORD_JSON_MESSAGE);
    assert_eq!(
        outbound.calls(),
        vec![RecordedOutboundRequest {
            body: None,
            headers: vec![
                ("Content-Type".to_owned(), APPLICATION_JSON.to_owned()),
                ("Authorization".to_owned(), "Bearer cron-secret".to_owned()),
            ],
            method: OutboundMethod::Post,
            url: "https://discord.example.test/wol-reminder".to_owned(),
        }]
    );
}

#[tokio::test]
async fn discord_cron_proxy_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_discord_cron();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request("POST", DISCORD_DAILY_REPORT_CRON_PATH),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_whitelist_me_requires_session_auth_before_private_lookup() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/ai/whitelist/me"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_whitelist_me_accepts_satellite_app_session_targets() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "calendar",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_response(200, r#"[{"enabled":true}]"#);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/ai/whitelist/me", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "email": "app-session@example.com",
            "enabled": true,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/ai_whitelisted_emails?")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "select").as_deref(),
        Some("enabled")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "email").as_deref(),
        Some("eq.app-session@example.com")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "limit").as_deref(),
        Some("1")
    );
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn ai_whitelist_me_rejects_wrong_app_session_target_without_fallback() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "platform",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_bearer("GET", "/api/v1/ai/whitelist/me", token)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_whitelist_me_skips_private_lookup_when_user_has_no_email() {
    let config = backend_config_with_contact_data();
    let mut claims = app_session_claims("calendar", vec![APP_SESSION_SCOPE], 4_102_444_800);
    claims.email = None;
    let token = app_session_token(&claims);
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/ai/whitelist/me", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "email": null,
            "enabled": false,
        })
    );
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_whitelist_me_accepts_browser_supabase_cookie_and_missing_row() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"member@example.com"}"#),
        outbound_response(200, "[]"),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/ai/whitelist/me")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "email": "member@example.com",
            "enabled": false,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        decoded_query_value(&calls[1].url, "email").as_deref(),
        Some("eq.member@example.com")
    );
}

#[tokio::test]
async fn ai_whitelist_me_maps_private_lookup_failures_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "calendar",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_response(200, "not-json");

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/ai/whitelist/me", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Internal server error");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn ai_whitelist_me_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/ai/whitelist/me"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn nova_me_team_requires_session_auth_before_private_lookup() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("GET", "/api/v1/nova/me/team"), &outbound).await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn nova_me_team_accepts_nova_app_session_target() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "nova",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[{"team_id":"6a5cbf77-7d95-427f-a263-9705bd416f3d"}]"#,
    );

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/nova/me/team", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "teamId": "6a5cbf77-7d95-427f-a263-9705bd416f3d",
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/nova_team_members?")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "select").as_deref(),
        Some("team_id")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "user_id").as_deref(),
        Some("eq.app-session-user-1")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "limit").as_deref(),
        Some("2")
    );
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn nova_me_team_rejects_wrong_app_session_target_without_fallback() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "platform",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_bearer("GET", "/api/v1/nova/me/team", token)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn nova_me_team_accepts_browser_supabase_cookie_and_missing_row() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, "[]"),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/nova/me/team")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "teamId": null }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        decoded_query_value(&calls[1].url, "user_id").as_deref(),
        Some("eq.browser-user-1")
    );
}

#[tokio::test]
async fn nova_me_team_maps_private_lookup_failures_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "nova",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_response(500, r#"{"message":"failed"}"#);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/nova/me/team", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Failed to load current team");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn nova_me_team_maps_duplicate_team_rows_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "nova",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"team_id":"6a5cbf77-7d95-427f-a263-9705bd416f3d"},
                {"team_id":"9a6ae7c2-5f3e-41d7-b422-f457df8970f6"}
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/nova/me/team", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Failed to load current team");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn nova_me_team_maps_missing_data_layer_to_legacy_error_without_outbound_call() {
    let config = backend_config_with_app_session_secret();
    let token = app_session_token(&app_session_claims(
        "nova",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/nova/me/team", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Failed to load current team");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn nova_me_team_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("POST", "/api/v1/nova/me/team"), &outbound).await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn task_board_status_templates_requires_session_before_admin_read() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/task-board-status-templates"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn task_board_status_templates_reads_ordered_global_templates() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let templates = r#"[
            {
                "id":"template-default",
                "name":"Default",
                "description":null,
                "statuses":[
                    {
                        "status":"not_started",
                        "name":"Not Started",
                        "color":"gray",
                        "allow_multiple":true
                    }
                ],
                "is_default":true,
                "created_at":"2025-06-08T14:00:08+00:00",
                "updated_at":"2026-05-07T14:21:00+00:00"
            }
        ]"#;
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, templates),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/task-board-status-templates")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "templates": [
                {
                    "id": "template-default",
                    "name": "Default",
                    "description": null,
                    "statuses": [
                        {
                            "status": "not_started",
                            "name": "Not Started",
                            "color": "gray",
                            "allow_multiple": true,
                        }
                    ],
                    "is_default": true,
                    "created_at": "2025-06-08T14:00:08+00:00",
                    "updated_at": "2026-05-07T14:21:00+00:00",
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert!(
        calls[1]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/task_board_status_templates?")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "order").as_deref(),
        Some("is_default.desc,name.asc")
    );
    assert_eq!(recorded_header(&calls[1], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn task_board_status_templates_accepts_supabase_bearer_before_cookie() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("stale-browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"mobile-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, "[]"),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer mobile-access-token"),
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/task-board-status-templates")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "templates": [] }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer mobile-access-token")
    );
}

#[tokio::test]
async fn task_board_status_templates_rejects_app_session_without_cookie_fallback() {
    let config = backend_config_with_contact_data();
    let token = valid_app_session_token();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_bearer("GET", "/api/v1/task-board-status-templates", token)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn task_board_status_templates_maps_admin_read_failures_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/task-board-status-templates")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Failed to fetch status templates");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn task_board_status_templates_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/task-board-status-templates"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_access_requires_session_auth_before_private_lookup() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/users/me/hive-access"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_access_accepts_current_user_app_session_targets() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"enabled":true}]"#),
        outbound_response(200, r#"[{"enabled":true,"allow_role_management":true}]"#),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/users/me/hive-access", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.cache_control,
        Some("private, max-age=300, stale-while-revalidate=60")
    );
    assert_eq!(
        response.body,
        json!({
            "hasAccess": true,
            "isAdmin": true,
            "isMember": true,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/hive_members?")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "select").as_deref(),
        Some("enabled")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "user_id").as_deref(),
        Some("eq.app-session-user-1")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "limit").as_deref(),
        Some("1")
    );
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );

    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert!(
        calls[1]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/platform_user_roles?")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "select").as_deref(),
        Some("enabled,allow_role_management")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "user_id").as_deref(),
        Some("eq.app-session-user-1")
    );
}

#[tokio::test]
async fn hive_access_rejects_wrong_app_session_target_without_fallback() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "storefront",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_bearer("GET", "/api/v1/users/me/hive-access", token)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_access_accepts_browser_supabase_cookie_and_missing_rows() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, "[]"),
        outbound_response(200, r#"[{"enabled":true,"allow_role_management":false}]"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/users/me/hive-access")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "hasAccess": false,
            "isAdmin": false,
            "isMember": false,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "user_id").as_deref(),
        Some("eq.browser-user-1")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "user_id").as_deref(),
        Some("eq.browser-user-1")
    );
}

#[tokio::test]
async fn hive_access_maps_table_failures_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_response(500, r#"{"message":"failed"}"#);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/users/me/hive-access", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Failed to resolve Hive access");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn hive_access_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/users/me/hive-access"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_ai_models_requires_hive_session_before_private_lookup() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("GET", "/api/v1/hive/ai/models"), &outbound).await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_ai_models_rejects_wrong_app_session_target_without_fallback() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "calendar",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_bearer("GET", "/api/v1/hive/ai/models", token)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_ai_models_requires_member_or_admin_access_before_model_lookup() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"enabled":false}]"#),
        outbound_response(200, r#"[{"enabled":true,"allow_role_management":false}]"#),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/hive/ai/models", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Hive access required");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn hive_ai_models_reads_private_models_with_default_filters() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"enabled":true}]"#),
        outbound_response(200, r#"[{"enabled":false,"allow_role_management":false}]"#),
        outbound_response(
            200,
            r#"[
                    {
                        "context_window":1048576,
                        "description":"Fast model",
                        "id":"google/gemini-2.5-flash",
                        "is_enabled":true,
                        "name":"",
                        "provider":null,
                        "tags":["fast","hive"],
                        "type":"language"
                    }
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/hive/ai/models", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "models": [
                {
                    "context": 1048576,
                    "description": "Fast model",
                    "disabled": false,
                    "label": "gemini-2.5-flash",
                    "provider": "google",
                    "tags": ["fast", "hive"],
                    "value": "google/gemini-2.5-flash",
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(
        calls[2]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/ai_gateway_models?")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "select").as_deref(),
        Some("context_window,description,id,is_enabled,name,provider,tags,type")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "order").as_deref(),
        Some("provider.asc,name.asc")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "type").as_deref(),
        Some("eq.language")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "is_enabled").as_deref(),
        Some("eq.true")
    );
    assert_eq!(
        recorded_header(&calls[2], "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[2], "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn hive_ai_models_accepts_browser_session_and_all_disabled_query() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, r#"[{"enabled":false}]"#),
        outbound_response(200, r#"[{"enabled":true,"allow_role_management":true}]"#),
        outbound_response(
            200,
            r#"[
                    {
                        "context_window":null,
                        "description":null,
                        "id":"custom-model",
                        "is_enabled":false,
                        "name":"Custom Model",
                        "provider":"",
                        "tags":null,
                        "type":"image"
                    }
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            url: Some("https://tuturuuu.localhost/api/v1/hive/ai/models?enabled=false&type=all"),
            ..request("GET", "/api/v1/hive/ai/models")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "models": [
                {
                    "disabled": true,
                    "label": "Custom Model",
                    "provider": "custom-model",
                    "value": "custom-model",
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(decoded_query_value(&calls[3].url, "type"), None);
    assert_eq!(decoded_query_value(&calls[3].url, "is_enabled"), None);
}

#[tokio::test]
async fn hive_ai_models_maps_private_lookup_failures_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"enabled":true}]"#),
        outbound_response(200, r#"[{"enabled":false,"allow_role_management":false}]"#),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/hive/ai/models", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["error"], "Failed to list AI models");
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn hive_ai_models_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/hive/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_models_get_reads_private_models_with_default_language_filter() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {
                    "id":"openai/gpt-5-mini",
                    "provider":"openai",
                    "type":"language",
                    "is_enabled":true
                }
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!([
            {
                "id": "openai/gpt-5-mini",
                "provider": "openai",
                "type": "language",
                "is_enabled": true
            }
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/ai_gateway_models?")
    );
    let select = decoded_query_value(&calls[0].url, "select").unwrap();
    assert!(select.contains("cache_read_price_per_token"));
    assert!(select.contains("web_search_price"));
    assert_eq!(
        decoded_query_value(&calls[0].url, "order").as_deref(),
        Some("provider.asc,name.asc")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "type").as_deref(),
        Some("eq.language")
    );
    assert_eq!(decoded_query_value(&calls[0].url, "provider"), None);
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(recorded_header(&calls[0], "Range"), None);
    assert_eq!(recorded_header(&calls[0], "Prefer"), None);
}

#[tokio::test]
async fn ai_models_get_preserves_filters_search_ids_and_pagination() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response_with_headers(
        200,
        r#"[
                {
                    "id":"google/gemini-3.1-flash-lite",
                    "provider":"google",
                    "name":"Gemini Flash Lite"
                }
            ]"#,
        vec![("content-range".to_owned(), "25-49/123".to_owned())],
    )]);
    let ids = std::iter::once("model-0".to_owned())
        .chain((0..105).map(|index| format!("model-{index}")))
        .collect::<Vec<_>>()
        .join(",");

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(leaked_test_str(format!(
                    "https://tuturuuu.localhost/api/v1/infrastructure/ai/models?format=paginated&page=2.9&limit=25.8&provider=google&enabled=false&type=all&q=ge,mini%25(pro)&tag=thinking&ids={ids}"
                ))),
                ..request("GET", "/api/v1/infrastructure/ai/models")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "data": [
                {
                    "id": "google/gemini-3.1-flash-lite",
                    "provider": "google",
                    "name": "Gemini Flash Lite"
                }
            ],
            "pagination": {
                "page": 2,
                "limit": 25,
                "total": 123,
            },
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        decoded_query_value(&calls[0].url, "provider").as_deref(),
        Some("eq.google")
    );
    assert_eq!(decoded_query_value(&calls[0].url, "type"), None);
    assert_eq!(
        decoded_query_value(&calls[0].url, "is_enabled").as_deref(),
        Some("eq.false")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "tags").as_deref(),
        Some("cs.{thinking}")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "or").as_deref(),
        Some(
            "(id.ilike.%geminipro%,name.ilike.%geminipro%,provider.ilike.%geminipro%,description.ilike.%geminipro%)"
        )
    );
    let id_filter = decoded_query_value(&calls[0].url, "id").unwrap();
    assert!(id_filter.starts_with("in.("));
    assert!(id_filter.ends_with(')'));
    let filtered_ids = id_filter
        .trim_start_matches("in.(")
        .trim_end_matches(')')
        .split(',')
        .collect::<Vec<_>>();
    assert_eq!(filtered_ids.len(), 100);
    assert_eq!(filtered_ids[0], "model-0");
    assert_eq!(filtered_ids[1], "model-1");
    assert!(!filtered_ids.contains(&"model-100"));
    assert_eq!(recorded_header(&calls[0], "Range-Unit"), Some("items"));
    assert_eq!(recorded_header(&calls[0], "Range"), Some("25-49"));
    assert_eq!(recorded_header(&calls[0], "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn ai_models_get_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_models_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching AI Models");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_models_get_fails_closed_when_supabase_rejects_request() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(500, r#"{"error":"failed"}"#);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching AI Models");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn aurora_ml_metrics_get_reads_public_rows_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"metric-1","model":"lstm","rmse":0.42,"weighted_score":0.91}
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/ml-metrics"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!([
            {"id":"metric-1","model":"lstm","rmse":0.42,"weighted_score":0.91}
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_metrics?select=*"
    );
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn aurora_statistical_metrics_get_reads_public_rows_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"metric-2","model":"arima","no_scaling":true,"weighted_score":0.88}
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/statistical-metrics"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!([
            {"id":"metric-2","model":"arima","no_scaling":true,"weighted_score":0.88}
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_metrics?select=*"
    );
}

#[tokio::test]
async fn aurora_forecast_get_reads_public_rows_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"[
                    {
                        "id":"stat-1",
                        "date":"2026-01-02T08:30:00Z",
                        "auto_arima":1.25,
                        "auto_arima_lo_90":1.0,
                        "auto_arima_hi_90":1.5
                    }
                ]"#,
        ),
        outbound_response(
            200,
            r#"[
                    {
                        "id":"ml-1",
                        "date":"2026-01-03",
                        "xgboost":3.15,
                        "catboost":2.71
                    }
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/forecast"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "statistical_forecast": [
                {
                    "id": "stat-1",
                    "date": "2026-01-02",
                    "auto_arima": 1.25,
                    "auto_arima_lo_90": 1.0,
                    "auto_arima_hi_90": 1.5
                }
            ],
            "ml_forecast": [
                {
                    "id": "ml-1",
                    "date": "2026-01-03",
                    "xgboost": 3.15,
                    "catboost": 2.71
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_forecast?select=*&order=date.asc"
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_forecast?select=*&order=date.asc"
    );

    for call in calls {
        assert_eq!(recorded_header(&call, "Accept"), Some(APPLICATION_JSON));
        assert_eq!(
            recorded_header(&call, "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(
            recorded_header(&call, "apikey"),
            Some("test-service-role-secret")
        );
    }
}

#[tokio::test]
async fn aurora_ml_metrics_post_ingests_external_metrics() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"{
                    "lstm": {
                        "RMSE": 0.42,
                        "Directional_Accuracy": 0.75,
                        "Turning_Point_Accuracy": 0.5,
                        "Weighted_Score": 0.91
                    }
                }"#,
        ),
        outbound_response(201, ""),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Success");
    assert_eq!(response.body["data"]["lstm"]["Weighted_Score"], 0.91);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(calls[1].url, "https://aurora.example.test/ml_metrics");
    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_metrics"
    );
    assert_eq!(
        recorded_header(&calls[2], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(recorded_header(&calls[2], "Prefer"), Some("return=minimal"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[2].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "model": "lstm",
                "rmse": 0.42,
                "directional_accuracy": 0.75,
                "turning_point_accuracy": 0.5,
                "weighted_score": 0.91
            }
        ])
    );
}

#[tokio::test]
async fn aurora_statistical_metrics_post_ingests_scaling_buckets() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"{
                    "no_scaling": [
                        {
                            "Model": "AutoARIMA",
                            "RMSE": 1.2,
                            "Weighted_Score": 0.8
                        }
                    ],
                    "with_scaling": [
                        {
                            "Model": "AutoETS",
                            "RMSE": 0.9,
                            "Directional_Accuracy": 0.7,
                            "Turning_Point_Accuracy": 0.6,
                            "Weighted_Score": 0.95
                        }
                    ]
                }"#,
        ),
        outbound_response(201, ""),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/statistical-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(
        calls[1].url,
        "https://aurora.example.test/statistical_metrics"
    );
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_metrics"
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[2].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "model": "AutoARIMA",
                "rmse": 1.2,
                "weighted_score": 0.8,
                "no_scaling": true
            },
            {
                "ws_id": "aurora-workspace",
                "model": "AutoETS",
                "rmse": 0.9,
                "directional_accuracy": 0.7,
                "turning_point_accuracy": 0.6,
                "weighted_score": 0.95,
                "no_scaling": false
            }
        ])
    );
}

#[tokio::test]
async fn aurora_forecast_post_ingests_statistical_and_ml_forecasts() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"{
                    "statistical_forecast": [
                        {
                            "AutoARIMA": 1.1,
                            "AutoARIMA-lo-90": 0.9,
                            "AutoARIMA-hi-90": 1.3,
                            "AutoETS": 1.0,
                            "AutoETS-lo-90": 0.8,
                            "AutoETS-hi-90": 1.2,
                            "AutoTheta": 1.4,
                            "AutoTheta-lo-90": 1.1,
                            "AutoTheta-hi-90": 1.7,
                            "CES": 1.5,
                            "CES-lo-90": 1.2,
                            "CES-hi-90": 1.8,
                            "date": "2026-01-02"
                        }
                    ],
                    "ml_forecast": [
                        {
                            "elasticnet": 2.1,
                            "lightgbm": 2.2,
                            "xgboost": 2.3,
                            "catboost": 2.4,
                            "date": "2026-01-03"
                        }
                    ]
                }"#,
        ),
        outbound_response(201, ""),
        outbound_response(201, ""),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/forecast",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "Success");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[1].url, "https://aurora.example.test/forecast");
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_forecast"
    );
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_forecast"
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[2].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "auto_arima": 1.1,
                "auto_arima_lo_90": 0.9,
                "auto_arima_hi_90": 1.3,
                "auto_ets": 1.0,
                "auto_ets_lo_90": 0.8,
                "auto_ets_hi_90": 1.2,
                "auto_theta": 1.4,
                "auto_theta_lo_90": 1.1,
                "auto_theta_hi_90": 1.7,
                "ces": 1.5,
                "ces_lo_90": 1.2,
                "ces_hi_90": 1.8,
                "date": "2026-01-02"
            }
        ])
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[3].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "elasticnet": 2.1,
                "lightgbm": 2.2,
                "xgboost": 2.3,
                "catboost": 2.4,
                "date": "2026-01-03"
            }
        ])
    );
}

#[tokio::test]
async fn aurora_ingest_post_preserves_legacy_config_and_auth_errors() {
    let mut missing_url = backend_config_with_aurora_health();
    missing_url.aurora_external_url.clear();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &missing_url,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Aurora API URL not configured");
    assert_eq!(outbound.calls().len(), 0);

    let mut missing_workspace = backend_config_with_aurora_health();
    missing_workspace.aurora_external_workspace_id.clear();
    let response = handle_backend_request(
        &missing_workspace,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body["message"],
        "Aurora workspace ID not configured"
    );
    assert_eq!(outbound.calls().len(), 0);

    let config = backend_config_with_aurora_health();
    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/aurora/ml-metrics"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Not authenticated");
    assert_eq!(outbound.calls().len(), 0);

    let outbound =
        RecordingOutboundClient::with_response(200, r#"{"id":"user-1","email":"ada@example.com"}"#);
    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Unauthorized email domain");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn aurora_health_post_requires_authenticated_supabase_user() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("POST", "/api/v1/aurora/health"), &outbound).await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Not authenticated");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_health_post_rejects_non_tuturuuu_email_domain() {
    let config = backend_config_with_aurora_health();
    let outbound =
        RecordingOutboundClient::with_response(200, r#"{"id":"user-1","email":"ada@example.com"}"#);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/health",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Unauthorized email domain");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn aurora_health_post_maps_upstream_failure_to_legacy_error() {
    let config = backend_config_with_aurora_health();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(503, r#"{"ok":false}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("POST", "/api/v1/aurora/health")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Error fetching health");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(calls[1].url, "https://aurora.example.test/health");
    assert_eq!(calls[1].headers, Vec::<(String, String)>::new());
}

#[tokio::test]
async fn aurora_health_post_returns_legacy_success_when_upstream_is_ok() {
    let config = backend_config_with_aurora_health();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(200, r#"{"ok":true}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("POST", "/api/v1/aurora/health")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body, json!({ "message": "Success" }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(calls[1].url, "https://aurora.example.test/health");
}

#[tokio::test]
async fn aurora_health_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("GET", "/api/v1/aurora/health"), &outbound).await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("POST"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_metrics_get_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/v1/aurora/forecast",
        "/api/v1/aurora/ml-metrics",
        "/api/v1/aurora/statistical-metrics",
    ] {
        let response = handle_backend_request(&config, request("DELETE", path), &outbound).await;

        assert_eq!(response.status, 405, "{path}");
        assert_eq!(response.allow, Some("GET, POST"), "{path}");
        assert_eq!(response.body["error"], "method not allowed", "{path}");
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_forecast_get_fails_closed_with_legacy_message() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[]"#),
        outbound_response(500, r#"{"error":"failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/forecast"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching forecast data");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn aurora_metrics_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/v1/aurora/ml-metrics",
        "/api/v1/aurora/statistical-metrics",
    ] {
        let response = handle_backend_request(&config, request("GET", path), &outbound).await;

        assert_eq!(response.status, 500, "{path}");
        assert_eq!(response.body["error"], "Internal Server Error", "{path}");
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_forecast_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/forecast"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching forecast data");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_domains_aggregates_sorted_unique_domains() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"[
                    {"url":"https://Example.com/docs"},
                    {"url":"not a url"},
                    {"url":"https://beta.example/path"}
                ]"#,
        ),
        outbound_response(
            200,
            r#"[
                    {"url":"https://alpha.example"},
                    {"url":"https://example.com/queued"},
                    {"url":null}
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/personal/crawlers/domains"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["cached"], false);
    assert_eq!(
        response.body["domains"],
        json!(["alpha.example", "beta.example", "example.com"])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/crawled_urls?select=url"
    );
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/crawled_url_next_urls?select=url&skipped=eq.false"
    );

    for call in calls {
        assert_eq!(recorded_header(&call, "Accept"), Some(APPLICATION_JSON));
        assert_eq!(
            recorded_header(&call, "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(
            recorded_header(&call, "apikey"),
            Some("test-service-role-secret")
        );
        assert_eq!(recorded_header(&call, "Range-Unit"), Some("items"));
        assert_eq!(recorded_header(&call, "Range"), Some("0-999"));
    }
}

#[tokio::test]
async fn crawler_uncrawled_filters_existing_urls_and_groups_results() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response_with_headers(
            200,
            r#"[{"url":"https://example.com/new"}]"#,
            vec![("content-range".to_owned(), "0-0/3".to_owned())],
        ),
        outbound_response(
            200,
            r#"[
                    {
                        "created_at":"2026-01-02T00:00:00Z",
                        "origin_id":"origin-1",
                        "origin_url":"https://seed.example",
                        "skipped":false,
                        "url":"https://example.com/already"
                    },
                    {
                        "created_at":"2026-01-03T00:00:00Z",
                        "origin_id":"origin-1",
                        "origin_url":"https://seed.example",
                        "skipped":false,
                        "url":"https://example.com/new"
                    }
                ]"#,
        ),
        outbound_response(200, r#"[{"url":"https://example.com/already/"}]"#),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/personal/crawlers/uncrawled?page=2&pageSize=2&domain=example.com&search=new",
                ),
                ..request("GET", "/api/personal/crawlers/uncrawled")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body["pagination"],
        json!({
            "page": 2,
            "pageSize": 2,
            "totalPages": 2,
            "totalItems": 3,
        })
    );
    assert_eq!(
        response.body["uncrawledUrls"],
        json!([
            {
                "created_at": "2026-01-03T00:00:00Z",
                "origin_id": "origin-1",
                "origin_url": "https://seed.example",
                "skipped": false,
                "url": "https://example.com/new",
            }
        ])
    );
    assert_eq!(
        response.body["groupedUrls"],
        json!({
            "origin-1": [
                {
                    "created_at": "2026-01-03T00:00:00Z",
                    "origin_id": "origin-1",
                    "origin_url": "https://seed.example",
                    "skipped": false,
                    "url": "https://example.com/new",
                }
            ]
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[0].url.contains("/rest/v1/crawled_url_next_urls?"));
    assert!(calls[0].url.contains("select=url"));
    assert!(calls[0].url.contains("skipped=eq.false"));
    assert!(calls[0].url.contains("url=ilike.%25example.com%25"));
    assert!(calls[0].url.contains("url=ilike.%25new%25"));
    assert_eq!(recorded_header(&calls[0], "Range"), Some("0-0"));
    assert_eq!(recorded_header(&calls[0], "Prefer"), Some("count=exact"));

    assert!(calls[1].url.contains("/rest/v1/crawled_url_next_urls?"));
    assert!(calls[1].url.contains("origin_url%3Aurl"));
    assert_eq!(recorded_header(&calls[1], "Range"), Some("2-3"));
    assert_eq!(recorded_header(&calls[1], "Prefer"), None);

    assert!(calls[2].url.contains("/rest/v1/crawled_urls?select=url"));
    assert!(calls[2].url.contains("url=in."));
    assert_eq!(recorded_header(&calls[2], "Range"), None);
}

#[tokio::test]
async fn crawler_status_requires_non_empty_url_query() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for request_url in [
        None,
        Some("https://tuturuuu.localhost/api/v1/workspaces/ws-ignored/crawlers/status"),
        Some("https://tuturuuu.localhost/api/v1/workspaces/ws-ignored/crawlers/status?url="),
    ] {
        let response = handle_backend_request(
            &config,
            BackendRequest {
                url: request_url,
                ..request("GET", "/api/v1/workspaces/ws-ignored/crawlers/status")
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 400);
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert_eq!(
            response.body,
            json!({ "message": "Missing required parameter: url" })
        );
    }

    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_status_returns_null_payload_when_crawled_url_is_missing() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, "[]");

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/workspace-a/crawlers/status?url=https%3A%2F%2Fexample.com%2Fmissing",
                ),
                ..request("GET", "/api/v1/workspaces/workspace-a/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "crawledUrl": null,
            "relatedUrls": [],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        decoded_query_value(&calls[0].url, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "url").as_deref(),
        Some("eq.https://example.com/missing")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "limit").as_deref(),
        Some("1")
    );
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn crawler_status_returns_raw_crawled_url_and_related_urls() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r##"[
                    {
                        "id": "crawl-1",
                        "url": "https://example.com/docs?x=1&y=2",
                        "markdown": "# Raw",
                        "html": "<main>Raw</main>",
                        "metadata": {"depth": 2}
                    }
                ]"##,
        ),
        outbound_response(
            200,
            r#"[
                    {
                        "id": "next-2",
                        "origin_id": "crawl-1",
                        "url": "https://example.com/b",
                        "created_at": "2026-01-03T00:00:00Z"
                    },
                    {
                        "id": "next-1",
                        "origin_id": "crawl-1",
                        "url": "https://example.com/a",
                        "created_at": "2026-01-02T00:00:00Z"
                    }
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ignored-workspace/crawlers/status?url=https%3A%2F%2Fexample.com%2Fdocs%3Fx%3D1%26y%3D2",
                ),
                ..request("GET", "/api/v1/workspaces/ignored-workspace/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "crawledUrl": {
                "id": "crawl-1",
                "url": "https://example.com/docs?x=1&y=2",
                "markdown": "# Raw",
                "html": "<main>Raw</main>",
                "metadata": {"depth": 2},
            },
            "relatedUrls": [
                {
                    "id": "next-2",
                    "origin_id": "crawl-1",
                    "url": "https://example.com/b",
                    "created_at": "2026-01-03T00:00:00Z",
                },
                {
                    "id": "next-1",
                    "origin_id": "crawl-1",
                    "url": "https://example.com/a",
                    "created_at": "2026-01-02T00:00:00Z",
                },
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/crawled_urls?")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "url").as_deref(),
        Some("eq.https://example.com/docs?x=1&y=2")
    );
    assert!(
        calls[1]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/crawled_url_next_urls?")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "origin_id").as_deref(),
        Some("eq.crawl-1")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "order").as_deref(),
        Some("created_at.desc")
    );
}

#[tokio::test]
async fn crawler_status_maps_crawled_url_query_failure_to_legacy_message() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(500, r#"{"error":"failed"}"#);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ws-a/crawlers/status?url=https%3A%2F%2Fexample.com",
                ),
                ..request("GET", "/api/v1/workspaces/ws-a/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error fetching crawled URL" })
    );
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn crawler_status_maps_related_url_query_failure_to_legacy_message() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"id":"crawl-1","url":"https://example.com"}]"#),
        outbound_response(500, r#"{"error":"failed"}"#),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ws-a/crawlers/status?url=https%3A%2F%2Fexample.com",
                ),
                ..request("GET", "/api/v1/workspaces/ws-a/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error fetching related URLs" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn crawler_list_requires_tuturuuu_session_before_admin_read() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/personal/crawlers/list"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_list_rejects_non_tuturuuu_session_before_admin_read() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("external-access-token");
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{"id":"user-1","email":"member@example.com"}"#,
    );

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/personal/crawlers/list")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn crawler_list_reads_raw_rows_with_filters_and_count() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("internal-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"operator@tuturuuu.com"}"#),
        outbound_response_with_headers(
            200,
            r#"[
                    {
                        "id":"crawl-1",
                        "url":"https://example.com/docs",
                        "markdown":"hello",
                        "html":"<main>hello</main>",
                        "created_at":"2026-01-02T00:00:00Z"
                    }
                ]"#,
            vec![("content-range".to_owned(), "50-99/123".to_owned())],
        ),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                cookie: Some(leaked_test_str(format!(
                    "sb-project-ref-auth-token={cookie_value}"
                ))),
                url: Some(
                    "https://tuturuuu.localhost/api/personal/crawlers/list?page=2&pageSize=50&domain=example.com/docs&search=hello",
                ),
                ..request("GET", "/api/personal/crawlers/list")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["count"], 123);
    assert_eq!(
        response.body["data"],
        json!([
            {
                "id": "crawl-1",
                "url": "https://example.com/docs",
                "markdown": "hello",
                "html": "<main>hello</main>",
                "created_at": "2026-01-02T00:00:00Z",
            }
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer internal-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert!(
        calls[1]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/crawled_urls?")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "order").as_deref(),
        Some("created_at.desc")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "url").as_deref(),
        Some("ilike.%example.com%")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "or").as_deref(),
        Some("(url.ilike.%hello%,markdown.ilike.%hello%,html.ilike.%hello%)")
    );
    assert_eq!(recorded_header(&calls[1], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(recorded_header(&calls[1], "Range-Unit"), Some("items"));
    assert_eq!(recorded_header(&calls[1], "Range"), Some("50-99"));
    assert_eq!(recorded_header(&calls[1], "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn crawler_routes_reject_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/personal/crawlers/domains",
        "/api/personal/crawlers/list",
        "/api/personal/crawlers/uncrawled",
        "/api/v1/workspaces/ws-a/crawlers/status",
    ] {
        let response = handle_backend_request(&config, request("POST", path), &outbound).await;

        assert_eq!(response.status, 405, "{path}");
        assert_eq!(response.allow, Some("GET"), "{path}");
        assert_eq!(response.body["error"], "method not allowed", "{path}");
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_routes_fail_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/personal/crawlers/domains",
        "/api/personal/crawlers/list",
        "/api/personal/crawlers/uncrawled",
        "/api/v1/workspaces/ws-a/crawlers/status",
    ] {
        let request = if path.ends_with("/status") {
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ws-a/crawlers/status?url=https%3A%2F%2Fexample.com",
                ),
                ..request("GET", path)
            }
        } else {
            request("GET", path)
        };
        let response = handle_backend_request(&config, request, &outbound).await;

        assert_eq!(response.status, 500, "{path}");
        if path.ends_with("/status") {
            assert_eq!(
                response.body["message"], "Error fetching crawled URL",
                "{path}"
            );
        } else {
            assert_eq!(response.body["error"], "Internal Server Error", "{path}");
        }
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_get_lists_public_holidays_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026},
                {"id":"holiday-2","date":"2026-04-30","name":"Reunification Day","year":2026}
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/internal/holidays"),
            ..request("GET", "/api/v1/internal/holidays")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!([
            {"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026},
            {"id":"holiday-2","date":"2026-04-30","name":"Reunification Day","year":2026}
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=*&order=date.asc"
    );
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn holidays_get_preserves_legacy_year_filter_parsing() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[]"#),
    ]);

    let filtered = handle_backend_request(
        &config,
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/internal/holidays?year=2026abc"),
            ..request("GET", "/api/v1/internal/holidays")
        },
        &outbound,
    )
    .await;
    let ignored_zero = handle_backend_request(
        &config,
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/internal/holidays?year=0"),
            ..request("GET", "/api/v1/internal/holidays")
        },
        &outbound,
    )
    .await;

    assert_eq!(filtered.status, 200);
    assert_eq!(ignored_zero.status, 200);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert!(calls[0].url.contains("year=eq.2026"));
    assert!(!calls[1].url.contains("year=eq."));
}

#[tokio::test]
async fn holidays_get_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("PATCH", "/api/v1/internal/holidays"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, POST"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/internal/holidays"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching holidays");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_post_requires_authenticated_root_workspace_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_body(
            "POST",
            "/api/v1/internal/holidays",
            r#"{"date":"2026-01-01","name":"New Year"}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_post_validates_payload_after_membership_check() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays",
                r#"{"date":"2026/01/01","name":""}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid input");
    assert!(response.body["errors"]["fieldErrors"]["date"].is_array());
    assert!(response.body["errors"]["fieldErrors"]["name"].is_array());
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_post_rejects_root_workspace_guests() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("guest-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-guest"}"#),
        outbound_response(200, r#"{"type":"GUEST"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays",
                r#"{"date":"2026-01-01","name":"New Year"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_post_rejects_duplicate_dates() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(200, r#"{"id":"holiday-existing"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays",
                r#"{"date":"2026-01-01","name":"New Year"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 409);
    assert_eq!(
        response.body["message"],
        "A holiday already exists for this date"
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&date=eq.2026-01-01&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
}

#[tokio::test]
async fn holidays_post_creates_holiday_with_user_token_rls() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(
            406,
            r#"{
                    "code":"PGRST116",
                    "details":"The result contains 0 rows",
                    "hint":null,
                    "message":"JSON object requested, multiple (or no) rows returned"
                }"#,
        ),
        outbound_response(
            201,
            r#"{"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026}"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "theme=dark; sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays",
                r#"{"date":"2026-01-01","name":"New Year"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 201);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["id"], "holiday-1");
    assert_eq!(response.body["date"], "2026-01-01");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/workspace_members?select=type&ws_id=eq.00000000-0000-0000-0000-000000000000&user_id=eq.user-1&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[1], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&date=eq.2026-01-01&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(calls[3].method, OutboundMethod::Post);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=*"
    );
    assert_eq!(
        recorded_header(&calls[3], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[3], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[3], "Prefer"),
        Some("return=representation")
    );
    assert_eq!(
        recorded_header(&calls[3], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            calls[3].body.as_ref().expect("insert request body")
        )
        .expect("insert request json"),
        json!({
            "date": "2026-01-01",
            "name": "New Year",
        })
    );
}

#[tokio::test]
async fn holidays_bulk_requires_authenticated_root_workspace_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_body(
            "POST",
            "/api/v1/internal/holidays/bulk",
            r#"{"holidays":[{"date":"2026-01-01","name":"New Year"}]}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_bulk_validates_payload_after_membership_check() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{"holidays":[{"date":"2026/01/01","name":""}],"replaceExisting":"yes"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid input");
    assert!(response.body["errors"]["fieldErrors"]["holidays"].is_array());
    assert!(response.body["errors"]["fieldErrors"]["replaceExisting"].is_array());
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_bulk_imports_with_replace_existing_and_user_token_rls() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(204, ""),
        outbound_response(
            201,
            r#"[
                    {"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026},
                    {"id":"holiday-2","date":"2027-01-01","name":"New Year","year":2027}
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "theme=dark; sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{
                        "holidays":[
                            {"date":"2026-01-01","name":"New Year","ignored":true},
                            {"date":"2027-01-01","name":"New Year"},
                            {"date":"2026-04-30","name":"Reunification Day"}
                        ],
                        "replaceExisting":true
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 201);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Holidays imported successfully");
    assert_eq!(response.body["imported"], 2);
    assert_eq!(response.body["yearsAffected"], json!([2026, 2027]));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/workspace_members?select=type&ws_id=eq.00000000-0000-0000-0000-000000000000&user_id=eq.user-1&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[1], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer admin-access-token")
    );

    assert_eq!(calls[2].method, OutboundMethod::Delete);
    assert_eq!(
        decoded_query_value(&calls[2].url, "year").as_deref(),
        Some("in.(2026,2027)")
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );

    assert_eq!(calls[3].method, OutboundMethod::Post);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?on_conflict=date&select=*"
    );
    assert_eq!(recorded_header(&calls[3], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[3], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[3], "Prefer"),
        Some("resolution=merge-duplicates,return=representation")
    );
    assert_eq!(
        recorded_header(&calls[3], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            calls[3].body.as_ref().expect("bulk upsert request body")
        )
        .expect("bulk upsert request json"),
        json!([
            {"date": "2026-01-01", "name": "New Year"},
            {"date": "2027-01-01", "name": "New Year"},
            {"date": "2026-04-30", "name": "Reunification Day"}
        ])
    );
}

#[tokio::test]
async fn holidays_bulk_maps_delete_errors_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(500, r#"{"message":"db unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{"holidays":[{"date":"2026-01-01","name":"New Year"}],"replaceExisting":true}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error deleting existing holidays");
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn holidays_bulk_maps_insert_errors_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(500, r#"{"message":"db unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{"holidays":[{"date":"2026-01-01","name":"New Year"}]}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error inserting holidays");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert_eq!(
        recorded_header(&calls[2], "Prefer"),
        Some("resolution=ignore-duplicates,return=representation")
    );
}

#[tokio::test]
async fn holidays_item_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/internal/holidays/holiday-1"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("PUT, DELETE"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_put_requires_authenticated_root_workspace_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_body(
            "PUT",
            "/api/v1/internal/holidays/holiday-1",
            r#"{"date":"2026-01-02"}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_put_validates_payload_after_membership_check() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"date":"2026/01/02","name":""}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid input");
    assert!(response.body["errors"]["fieldErrors"]["date"].is_array());
    assert!(response.body["errors"]["fieldErrors"]["name"].is_array());
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_put_rejects_empty_update_body() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body("PUT", "/api/v1/internal/holidays/holiday-1", r#"{}"#)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "No updates provided");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_put_returns_not_found_when_holiday_is_missing() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(
            406,
            r#"{
                    "code":"PGRST116",
                    "details":"The result contains 0 rows",
                    "hint":null,
                    "message":"JSON object requested, multiple (or no) rows returned"
                }"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"name":"Updated"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.body["message"], "Holiday not found");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&id=eq.holiday-1&limit=1"
    );
}

#[tokio::test]
async fn holidays_put_rejects_duplicate_dates() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(200, r#"{"id":"holiday-1"}"#),
        outbound_response(200, r#"{"id":"holiday-existing"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"date":"2026-01-02"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 409);
    assert_eq!(
        response.body["message"],
        "A holiday already exists for this date"
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&date=eq.2026-01-02&id=neq.holiday-1&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer admin-access-token")
    );
}

#[tokio::test]
async fn holidays_put_updates_holiday_with_user_token_rls() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(200, r#"{"id":"holiday-1"}"#),
        outbound_response(
            406,
            r#"{
                    "code":"PGRST116",
                    "details":"The result contains 0 rows",
                    "hint":null,
                    "message":"JSON object requested, multiple (or no) rows returned"
                }"#,
        ),
        outbound_response(
            200,
            r#"{"id":"holiday-1","date":"2026-01-02","name":"Updated","year":2026}"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "theme=dark; sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"date":"2026-01-02","name":"Updated","ignored":true}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["id"], "holiday-1");
    assert_eq!(response.body["name"], "Updated");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 5);
    assert_eq!(calls[4].method, OutboundMethod::Patch);
    assert_eq!(
        calls[4].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=*&id=eq.holiday-1"
    );
    assert_eq!(
        recorded_header(&calls[4], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[4], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[4], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[4], "Prefer"),
        Some("return=representation")
    );
    assert_eq!(
        recorded_header(&calls[4], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            calls[4].body.as_ref().expect("update request body")
        )
        .expect("update request json"),
        json!({
            "date": "2026-01-02",
            "name": "Updated",
        })
    );
}

#[tokio::test]
async fn holidays_delete_deletes_holiday_with_user_token_rls() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(204, ""),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("DELETE", "/api/v1/internal/holidays/holiday-1")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Holiday deleted");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Delete);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?id=eq.holiday-1"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn holidays_delete_maps_supabase_errors_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(500, r#"{"message":"db unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("DELETE", "/api/v1/internal/holidays/holiday-1")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error deleting holiday");
}

#[tokio::test]
async fn changelog_slug_get_reads_published_entry_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{
                "id":"entry-1",
                "title":"Platform release",
                "slug":"platform-release",
                "content":{"type":"doc"},
                "summary":"A shipped platform update",
                "category":"feature",
                "version":"2026.6",
                "cover_image_url":null,
                "is_published":true,
                "published_at":"2026-06-01T00:00:00Z",
                "created_at":"2026-05-31T00:00:00Z",
                "updated_at":"2026-06-01T00:00:00Z"
            }"#,
    );

    let response = handle_backend_request(
        &config,
        request(
            "GET",
            "/api/v1/infrastructure/changelog/slug/platform-release",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["slug"], "platform-release");
    assert_eq!(response.body["is_published"], true);
    assert_eq!(response.body["published_at"], "2026-06-01T00:00:00Z");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/changelog_entries?select=*&slug=eq.platform-release&is_published=eq.true&published_at=not.is.null"
    );
    assert_eq!(
        recorded_header(&calls[0], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn changelog_slug_get_maps_postgrest_single_error_to_not_found() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        406,
        r#"{
                "code":"PGRST116",
                "details":"The result contains 0 rows",
                "hint":null,
                "message":"JSON object requested, multiple (or no) rows returned"
            }"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/infrastructure/changelog/slug/missing"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Changelog entry not found");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn changelog_slug_get_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request(
            "POST",
            "/api/v1/infrastructure/changelog/slug/platform-release",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn changelog_slug_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request(
            "GET",
            "/api/v1/infrastructure/changelog/slug/platform-release",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Changelog entry not found");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn changelog_list_get_reads_public_entries_with_exact_count() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response_with_headers(
        200,
        r#"[
                {
                    "id":"entry-1",
                    "title":"Security update",
                    "slug":"security-update",
                    "is_published":true,
                    "published_at":"2026-06-01T00:00:00Z"
                }
            ]"#,
        vec![("content-range".to_owned(), "5-5/6".to_owned())],
    )]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/infrastructure/changelog?page=2&pageSize=5&published=false&category=security",
                ),
                ..request("GET", "/api/v1/infrastructure/changelog")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["data"][0]["slug"], "security-update");
    assert_eq!(
        response.body["pagination"],
        json!({
            "page": 2,
            "pageSize": 5,
            "total": 6,
            "totalPages": 2,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(calls[0].url.contains("/rest/v1/changelog_entries?"));
    assert!(calls[0].url.contains("select=*"));
    assert!(
        calls[0]
            .url
            .contains("order=published_at.desc.nullslast%2Ccreated_at.desc")
    );
    assert!(calls[0].url.contains("is_published=eq.true"));
    assert!(calls[0].url.contains("published_at=not.is.null"));
    assert!(calls[0].url.contains("category=eq.security"));
    assert!(!calls[0].url.contains("is_published=eq.false"));
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(recorded_header(&calls[0], "Range-Unit"), Some("items"));
    assert_eq!(recorded_header(&calls[0], "Range"), Some("5-9"));
    assert_eq!(recorded_header(&calls[0], "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn changelog_list_get_allows_manage_changelog_cookie_to_read_drafts() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response_with_headers(
            200,
            r#"[
                    {
                        "id":"entry-2",
                        "title":"Draft entry",
                        "slug":"draft-entry",
                        "category":"feature",
                        "is_published":false,
                        "published_at":null
                    }
                ]"#,
            vec![("content-range".to_owned(), "0-0/1".to_owned())],
        ),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                cookie: Some(leaked_test_str(
                    format!("theme=dark; sb-project-ref-auth-token={cookie_value}")
                )),
                url: Some(
                    "https://tuturuuu.localhost/api/v1/infrastructure/changelog?published=false&category=feature",
                ),
                ..request("GET", "/api/v1/infrastructure/changelog")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["data"][0]["slug"], "draft-entry");
    assert_eq!(response.body["data"][0]["is_published"], false);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Post);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/rpc/has_workspace_permission"
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            calls[1].body.as_ref().expect("permission request body")
        )
        .expect("permission request json"),
        json!({
            "p_permission": "manage_changelog",
            "p_user_id": "user-1",
            "p_ws_id": "00000000-0000-0000-0000-000000000000",
        })
    );
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert!(calls[2].url.contains("is_published=eq.false"));
    assert!(calls[2].url.contains("category=eq.feature"));
    assert!(!calls[2].url.contains("published_at=not.is.null"));
}

#[tokio::test]
async fn changelog_detail_get_falls_back_to_public_read_for_duplicate_auth_cookies() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{
                "id":"entry-3",
                "title":"Published detail",
                "slug":"published-detail",
                "is_published":true,
                "published_at":"2026-06-01T00:00:00Z"
            }"#,
    );

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}; sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/infrastructure/changelog/entry-3")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["slug"], "published-detail");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/changelog_entries?select=*&id=eq.entry-3&is_published=eq.true&published_at=not.is.null"
    );
    assert_eq!(
        recorded_header(&calls[0], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
}

#[tokio::test]
async fn changelog_detail_get_allows_manage_changelog_cookie_to_read_draft() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(
            200,
            r#"{
                    "id":"entry-4",
                    "title":"Draft detail",
                    "slug":"draft-detail",
                    "is_published":false,
                    "published_at":null
                }"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/infrastructure/changelog/entry-4")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["slug"], "draft-detail");
    assert_eq!(response.body["is_published"], false);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/changelog_entries?select=*&id=eq.entry-4"
    );
    assert_eq!(
        recorded_header(&calls[2], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
}

#[tokio::test]
async fn changelog_post_creates_entry_with_caller_token_and_normalized_slug() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(
            201,
            r#"{
                    "id":"entry-1",
                    "title":"Platform release",
                    "slug":"platform-release",
                    "creator_id":"user-1"
                }"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/infrastructure/changelog",
                r#"{
                        "title":"Platform release",
                        "slug":"Platform Release!",
                        "content":{"type":"doc","content":[]},
                        "summary":"A shipped update",
                        "category":"feature",
                        "version":"2026.6",
                        "cover_image_url":"https://example.com/cover.png"
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 201);
    assert_eq!(response.body["slug"], "platform-release");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/changelog_entries?select=*"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[2], "Prefer"),
        Some("return=representation")
    );
    let body = serde_json::from_str::<serde_json::Value>(
        calls[2].body.as_ref().expect("create request body"),
    )
    .expect("create request json");
    assert_eq!(body["slug"], "platform-release");
    assert_eq!(body["creator_id"], "user-1");
    assert_eq!(body["content"], json!({"type":"doc","content":[]}));
}

#[tokio::test]
async fn changelog_post_maps_duplicate_slug_to_conflict() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(409, r#"{"code":"23505","message":"duplicate key"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/infrastructure/changelog",
                r#"{
                        "title":"Platform release",
                        "slug":"platform-release",
                        "content":{"type":"doc"},
                        "category":"feature"
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 409);
    assert_eq!(
        response.body["message"],
        "A changelog entry with this slug already exists"
    );
}

#[tokio::test]
async fn changelog_put_returns_not_found_before_update_when_entry_is_missing() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(406, r#"{"code":"PGRST116"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/infrastructure/changelog/missing-entry",
                r#"{"slug":"Updated Slug","summary":null}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.body["message"], "Changelog entry not found");
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn changelog_publish_maps_prefetch_errors_to_legacy_not_found() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(500, r#"{"message":"temporary database failure"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/infrastructure/changelog/entry-1/publish",
                r#"{"is_published":true}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.body["message"], "Changelog entry not found");
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn changelog_publish_keeps_existing_published_timestamp() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(
            200,
            r#"{"id":"entry-1","published_at":"2026-06-01T00:00:00Z"}"#,
        ),
        outbound_response(
            200,
            r#"{"id":"entry-1","is_published":true,"published_at":"2026-06-01T00:00:00Z"}"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/infrastructure/changelog/entry-1/publish",
                r#"{"is_published":true}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["is_published"], true);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[3].method, OutboundMethod::Patch);
    let body = serde_json::from_str::<serde_json::Value>(
        calls[3].body.as_ref().expect("publish request body"),
    )
    .expect("publish request json");
    assert_eq!(body["is_published"], true);
    assert_eq!(body["published_at"], "2026-06-01T00:00:00Z");
}

#[tokio::test]
async fn changelog_delete_removes_existing_entry() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(200, r#"{"id":"entry-1"}"#),
        outbound_response(204, ""),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("DELETE", "/api/v1/infrastructure/changelog/entry-1")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body["message"],
        "Changelog entry deleted successfully"
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[3].method, OutboundMethod::Delete);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/changelog_entries?id=eq.entry-1"
    );
}

#[tokio::test]
async fn changelog_writes_require_manage_changelog_permission() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_body(
            "POST",
            "/api/v1/infrastructure/changelog",
            r#"{"title":"A","slug":"a","content":{"type":"doc"},"category":"feature"}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(outbound.calls().len(), 0);

    let cookie_value = supabase_auth_cookie_value("member-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-2"}"#),
        outbound_response(200, "false"),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/infrastructure/changelog",
                r#"{"title":"A","slug":"a","content":{"type":"doc"},"category":"feature"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn admin_task_embedding_stats_requires_tuturuuu_admin_before_task_counts() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/admin/tasks/embeddings/stats"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(
        response.body["message"],
        "Unauthorized - Tuturuuu admin access required"
    );
    assert_eq!(outbound.calls().len(), 0);

    let cookie_value = supabase_auth_cookie_value("external-access-token");
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{"id":"user-1","email":"member@example.com"}"#,
    );

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/admin/tasks/embeddings/stats")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer external-access-token")
    );
}

#[tokio::test]
async fn admin_task_embedding_stats_counts_total_and_missing_embeddings() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"member@xwf.tuturuuu.com"}"#),
        outbound_response_with_headers(
            200,
            "[]",
            vec![("content-range".to_owned(), "0-0/250".to_owned())],
        ),
        outbound_response_with_headers(
            200,
            "[]",
            vec![("content-range".to_owned(), "0-0/100".to_owned())],
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/admin/tasks/embeddings/stats")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "total": 250,
            "withEmbeddings": 150,
            "withoutEmbeddings": 100,
            "percentageComplete": 60.0,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/tasks?select=id"
    );
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/tasks?select=id&embedding=is.null"
    );

    for call in calls.iter().skip(1) {
        assert_eq!(call.method, OutboundMethod::Get);
        assert_eq!(recorded_header(call, "Accept"), Some(APPLICATION_JSON));
        assert_eq!(
            recorded_header(call, "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(
            recorded_header(call, "apikey"),
            Some("test-service-role-secret")
        );
        assert_eq!(recorded_header(call, "Range-Unit"), Some("items"));
        assert_eq!(recorded_header(call, "Range"), Some("0-0"));
        assert_eq!(recorded_header(call, "Prefer"), Some("count=exact"));
    }
}

#[tokio::test]
async fn admin_task_embedding_stats_maps_supabase_count_errors() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"member@tuturuuu.com"}"#),
        outbound_response(500, r#"{"message":"count failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/admin/tasks/embeddings/stats")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Failed to fetch task statistics");
    assert_eq!(response.body["error"], "count failed");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn admin_task_embedding_stats_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/admin/tasks/embeddings/stats"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn workspace_limits_requires_authenticated_session_before_counting() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/workspaces/limits"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn workspace_limits_bypasses_counts_for_tuturuuu_email() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("internal-access-token");
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{"id":"user-1","email":"member@tuturuuu.com"}"#,
    );

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/workspaces/limits")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "canCreate": true,
            "currentCount": 0,
            "limit": 0,
            "remaining": null,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer internal-access-token")
    );
}

#[tokio::test]
async fn workspace_limits_counts_non_deleted_external_user_workspaces() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("external-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"member@example.com"}"#),
        outbound_response_with_headers(
            200,
            "[]",
            vec![("content-range".to_owned(), "0-0/5".to_owned())],
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/workspaces/limits")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "canCreate": true,
            "currentCount": 5,
            "limit": 10,
            "remaining": 5,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/workspaces?select=id&creator_id=eq.user-1&deleted=eq.false"
    );
    assert_eq!(recorded_header(&calls[1], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(recorded_header(&calls[1], "Range-Unit"), Some("items"));
    assert_eq!(recorded_header(&calls[1], "Range"), Some("0-0"));
    assert_eq!(recorded_header(&calls[1], "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn workspace_limits_denies_external_user_at_limit() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("external-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"member@example.com"}"#),
        outbound_response_with_headers(
            200,
            "[]",
            vec![("content-range".to_owned(), "0-0/10".to_owned())],
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/workspaces/limits")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "canCreate": false,
            "currentCount": 10,
            "limit": 10,
            "remaining": 0,
        })
    );
}

#[tokio::test]
async fn workspace_limits_maps_count_errors_to_legacy_error_body() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("external-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"member@example.com"}"#),
        outbound_response(500, r#"{"message":"count failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/workspaces/limits")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Error checking workspace limit");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn workspace_limits_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/workspaces/limits"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn topic_announcement_verification_get_verifies_pending_contact() {
    let config = backend_config_with_contact_data();
    let token_hash = sha256_hex_for_test("token value");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{
                    "id":"verification-1",
                    "expires_at":"9999-01-01T00:00:00.000Z",
                    "status":"pending"
                }"#,
        ),
        outbound_response(204, ""),
    ]);

    let response = handle_backend_request(
        &config,
        request(
            "GET",
            "/api/v1/topic-announcement-verifications/token%20value",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.content_type, Some("text/html; charset=utf-8"));
    assert!(
        response
            .body_text
            .as_deref()
            .unwrap_or_default()
            .contains("Email verified")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        format!(
            "https://project-ref.supabase.co/rest/v1/topic_announcement_contact_verifications?select=id%2Cexpires_at%2Cstatus&token_hash=eq.{token_hash}"
        )
    );
    assert_eq!(
        recorded_header(&calls[0], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[0], "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );

    assert_eq!(calls[1].method, OutboundMethod::Patch);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/topic_announcement_contact_verifications?id=eq.verification-1"
    );
    assert_eq!(recorded_header(&calls[1], "Prefer"), Some("return=minimal"));
    let patch_body = calls[1].body.as_deref().unwrap_or_default();
    assert!(patch_body.contains(r#""status":"verified""#));
    assert!(patch_body.contains(r#""verified_at":"#));
}

#[tokio::test]
async fn topic_announcement_verification_get_maps_missing_token_to_legacy_html_404() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        406,
        r#"{
                "code":"PGRST116",
                "details":"The result contains 0 rows",
                "hint":null,
                "message":"JSON object requested, multiple (or no) rows returned"
            }"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/topic-announcement-verifications/missing"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert!(
        response
            .body_text
            .as_deref()
            .unwrap_or_default()
            .contains("Verification link unavailable")
    );
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn topic_announcement_verification_get_marks_expired_token_but_ignores_update_error() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{
                    "id":"verification-expired",
                    "expires_at":"2000-01-01T00:00:00.000Z",
                    "status":"pending"
                }"#,
        ),
        outbound_response(500, r#"{"message":"update failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/topic-announcement-verifications/expired"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 410);
    assert!(
        response
            .body_text
            .as_deref()
            .unwrap_or_default()
            .contains("Verification link expired")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Patch);
    assert_eq!(calls[1].body.as_deref(), Some(r#"{"status":"expired"}"#));
}

#[tokio::test]
async fn topic_announcement_verification_get_reports_verified_update_failure() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{
                    "id":"verification-1",
                    "expires_at":"9999-01-01T00:00:00.000Z",
                    "status":"pending"
                }"#,
        ),
        outbound_response(500, r#"{"message":"update failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/topic-announcement-verifications/token"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert!(
        response
            .body_text
            .as_deref()
            .unwrap_or_default()
            .contains("Verification failed")
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn topic_announcement_verification_route_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/topic-announcement-verifications/token"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn topic_announcement_verification_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/topic-announcement-verifications/token"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert!(
        response
            .body_text
            .as_deref()
            .unwrap_or_default()
            .contains("Verification failed")
    );
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn infrastructure_mobile_versions_rejects_missing_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request("GET", mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn infrastructure_mobile_versions_rejects_missing_root_permission() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "false"),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request("GET", mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Forbidden");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert!(calls[0].url.ends_with("/auth/v1/user"));
    assert!(
        calls[1]
            .url
            .ends_with("/rest/v1/rpc/has_workspace_permission")
    );
    assert_eq!(calls[1].method, OutboundMethod::Post);
    assert_eq!(
        calls[1].body.as_deref(),
        Some(
            r#"{"p_permission":"manage_workspace_roles","p_user_id":"user-1","p_ws_id":"00000000-0000-0000-0000-000000000000"}"#
        )
    );
}

#[tokio::test]
async fn infrastructure_mobile_versions_returns_admin_policy_snapshot() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(
            200,
            r#"[
                    {"id":"MOBILE_IOS_EFFECTIVE_VERSION","value":"1.2.0"},
                    {"id":"MOBILE_IOS_MINIMUM_VERSION","value":"1.1.0"},
                    {"id":"MOBILE_IOS_OTP_ENABLED","value":true},
                    {"id":"MOBILE_IOS_STORE_URL","value":"https://apps.apple.com/app/id1"},
                    {"id":"MOBILE_ANDROID_EFFECTIVE_VERSION","value":"1.3.0"},
                    {"id":"MOBILE_ANDROID_MINIMUM_VERSION","value":"1.2.0"},
                    {"id":"MOBILE_ANDROID_OTP_ENABLED","value":"no"},
                    {"id":"MOBILE_ANDROID_STORE_URL","value":"https://play.google.com/store/apps/details?id=example.app"},
                    {"id":"WEB_OTP_ENABLED","value":"yes"}
                ]"#,
        ),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ios"]["effectiveVersion"], "1.2.0");
    assert_eq!(response.body["ios"]["minimumVersion"], "1.1.0");
    assert_eq!(response.body["ios"]["otpEnabled"], true);
    assert_eq!(
        response.body["ios"]["storeUrl"],
        "https://apps.apple.com/app/id1"
    );
    assert_eq!(response.body["android"]["effectiveVersion"], "1.3.0");
    assert_eq!(response.body["android"]["minimumVersion"], "1.2.0");
    assert_eq!(response.body["android"]["otpEnabled"], false);
    assert_eq!(response.body["webOtpEnabled"], true);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[2].url.contains("select=id%2Cvalue"));
    assert!(calls[2].url.contains("MOBILE_IOS_EFFECTIVE_VERSION"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn infrastructure_mobile_versions_put_rejects_missing_auth_before_body_validation() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request_with_body(
            "PUT",
            mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH,
            r#"{"ios":null}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn infrastructure_mobile_versions_put_upserts_normalized_policy_rows() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(204, ""),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "PUT",
                mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH,
                r#"{
                        "ios": {
                            "effectiveVersion": " 2.0.0 ",
                            "minimumVersion": "1.5.0",
                            "otpEnabled": true,
                            "storeUrl": " https://apps.apple.com/app/id1 "
                        },
                        "android": {
                            "effectiveVersion": null,
                            "minimumVersion": null,
                            "otpEnabled": false,
                            "storeUrl": ""
                        },
                        "webOtpEnabled": true
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "success");
    assert_eq!(response.body["data"]["ios"]["effectiveVersion"], "2.0.0");
    assert_eq!(response.body["data"]["ios"]["minimumVersion"], "1.5.0");
    assert_eq!(response.body["data"]["ios"]["otpEnabled"], true);
    assert_eq!(
        response.body["data"]["ios"]["storeUrl"],
        "https://apps.apple.com/app/id1"
    );
    assert_eq!(
        response.body["data"]["android"]["effectiveVersion"],
        Value::Null
    );
    assert_eq!(
        response.body["data"]["android"]["minimumVersion"],
        Value::Null
    );
    assert_eq!(response.body["data"]["android"]["otpEnabled"], false);
    assert_eq!(response.body["data"]["android"]["storeUrl"], Value::Null);
    assert_eq!(response.body["data"]["webOtpEnabled"], true);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    let upsert_call = &calls[2];
    assert_eq!(upsert_call.method, OutboundMethod::Post);
    assert!(
        upsert_call
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/workspace_configs?")
    );
    assert!(upsert_call.url.contains("on_conflict=ws_id%2Cid"));
    assert_eq!(
        recorded_header(upsert_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(upsert_call, "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(upsert_call, "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(
        recorded_header(upsert_call, "Prefer"),
        Some("resolution=merge-duplicates,return=minimal")
    );

    let rows: Vec<Value> = serde_json::from_str(upsert_call.body.as_deref().unwrap()).unwrap();
    assert_eq!(rows.len(), 9);
    assert_mobile_version_policy_row(&rows, "MOBILE_IOS_EFFECTIVE_VERSION", "2.0.0");
    assert_mobile_version_policy_row(&rows, "MOBILE_IOS_MINIMUM_VERSION", "1.5.0");
    assert_mobile_version_policy_row(&rows, "MOBILE_IOS_OTP_ENABLED", "true");
    assert_mobile_version_policy_row(
        &rows,
        "MOBILE_IOS_STORE_URL",
        "https://apps.apple.com/app/id1",
    );
    assert_mobile_version_policy_row(&rows, "MOBILE_ANDROID_EFFECTIVE_VERSION", "");
    assert_mobile_version_policy_row(&rows, "MOBILE_ANDROID_MINIMUM_VERSION", "");
    assert_mobile_version_policy_row(&rows, "MOBILE_ANDROID_OTP_ENABLED", "false");
    assert_mobile_version_policy_row(&rows, "MOBILE_ANDROID_STORE_URL", "");
    assert_mobile_version_policy_row(&rows, "WEB_OTP_ENABLED", "true");
    assert!(rows.iter().all(|row| {
        row["ws_id"] == "00000000-0000-0000-0000-000000000000"
            && row["updated_at"]
                .as_str()
                .is_some_and(|value| value.ends_with('Z'))
    }));
}

#[tokio::test]
async fn infrastructure_mobile_versions_put_returns_invalid_body_errors_after_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "PUT",
                mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH,
                r#"{"ios":{},"android":{"otpEnabled":"yes"}}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid request body");
    assert_eq!(response.body["errors"][0]["path"][0], "otpEnabled");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn infrastructure_mobile_versions_put_returns_policy_validation_errors() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "PUT",
                mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH,
                r#"{
                        "ios": {
                            "effectiveVersion": "1.0",
                            "minimumVersion": "2.0.0"
                        },
                        "android": {
                            "effectiveVersion": "1.0.0"
                        }
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid mobile version policy");
    assert!(
        response.body["errors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|error| error == "ios: effective version must use x.y.z format")
    );
    assert!(
        response.body["errors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|error| error == "android: store URL is required when a version is set")
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn infrastructure_mobile_versions_put_returns_legacy_save_error() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "PUT",
                mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH,
                r#"{
                        "ios": {},
                        "android": {},
                        "webOtpEnabled": false
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body["message"],
        "Failed to save mobile version policies"
    );
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn infrastructure_mobile_versions_returns_legacy_load_error_after_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(
            200,
            r#"[{"id":"MOBILE_IOS_EFFECTIVE_VERSION","value":"1.2.0"}]"#,
        ),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request("GET", mobile_version::INFRASTRUCTURE_MOBILE_VERSIONS_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body["message"],
        "Failed to load mobile version policies"
    );
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn mobile_version_check_reads_policy_and_returns_update_recommendation() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"MOBILE_ANDROID_EFFECTIVE_VERSION","value":"1.3.0"},
                {"id":"MOBILE_ANDROID_MINIMUM_VERSION","value":"1.1.0"},
                {"id":"MOBILE_ANDROID_OTP_ENABLED","value":"yes"},
                {"id":"MOBILE_ANDROID_STORE_URL","value":"https://play.google.com/store/apps/details?id=example.app"}
            ]"#,
    );
    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some("https://tuturuuu.localhost/api/v1/mobile/version-check?platform=android&version=1.2.0"),
                ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["platform"], "android");
    assert_eq!(response.body["currentVersion"], "1.2.0");
    assert_eq!(response.body["effectiveVersion"], "1.3.0");
    assert_eq!(response.body["minimumVersion"], "1.1.0");
    assert_eq!(response.body["otpEnabled"], true);
    assert_eq!(
        response.body["storeUrl"],
        "https://play.google.com/store/apps/details?id=example.app"
    );
    assert_eq!(response.body["status"], "update-recommended");
    assert_eq!(response.body["shouldUpdate"], true);
    assert_eq!(response.body["requiresUpdate"], false);
    assert_eq!(
        header_value(&response, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(
        header_value(&response, "access-control-allow-methods"),
        Some(MOBILE_AUTH_CORS_ALLOW_METHODS)
    );
    assert_eq!(
        header_value(&response, "access-control-allow-headers"),
        Some(MOBILE_AUTH_CORS_ALLOW_HEADERS)
    );
    assert_eq!(
        header_value(&response, "access-control-max-age"),
        Some(MOBILE_AUTH_CORS_MAX_AGE)
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    let call = &calls[0];
    assert_eq!(call.method, OutboundMethod::Get);
    assert!(
        call.url
            .starts_with("https://project-ref.supabase.co/rest/v1/workspace_configs?")
    );
    assert!(call.url.contains("select=id%2Cvalue"));
    assert!(
        call.url
            .contains("ws_id=eq.00000000-0000-0000-0000-000000000000")
    );
    assert!(call.url.contains("MOBILE_ANDROID_EFFECTIVE_VERSION"));
    assert_eq!(
        recorded_header(call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(call, "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn mobile_version_check_returns_update_required_and_supported_states() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"[
                    {"id":"MOBILE_IOS_EFFECTIVE_VERSION","value":"2.0.0"},
                    {"id":"MOBILE_IOS_MINIMUM_VERSION","value":"1.5.0"},
                    {"id":"MOBILE_IOS_STORE_URL","value":"https://apps.apple.com/app/id1"}
                ]"#,
        ),
        outbound_response(200, r#"[]"#),
    ]);
    let required = handle_backend_request(
        &config,
        BackendRequest {
            url: Some(
                "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.4.9",
            ),
            ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
        },
        &outbound,
    )
    .await;
    let supported = handle_backend_request(
        &config,
        BackendRequest {
            url: Some(
                "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.0.0",
            ),
            ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(required.status, 200);
    assert_eq!(required.body["status"], "update-required");
    assert_eq!(required.body["shouldUpdate"], true);
    assert_eq!(required.body["requiresUpdate"], true);
    assert_eq!(supported.status, 200);
    assert_eq!(supported.body["status"], "supported");
    assert_eq!(supported.body["shouldUpdate"], false);
    assert_eq!(supported.body["requiresUpdate"], false);
}

#[tokio::test]
async fn mobile_version_check_validates_query_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for (url, message) in [
        (
            "https://tuturuuu.localhost/api/v1/mobile/version-check?version=1.2.3",
            r#"Invalid option: expected one of "ios"|"android""#,
        ),
        (
            "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios",
            "Invalid input: expected string, received null",
        ),
        (
            "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.2",
            "Version must use x.y.z format",
        ),
    ] {
        let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(url),
                ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 400, "{url}");
        assert_eq!(response.body["error"], message);
        assert_eq!(
            header_value(&response, "access-control-allow-origin"),
            Some("*")
        );
    }

    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn mobile_version_check_fails_closed_when_policy_data_is_unavailable_or_invalid() {
    let outbound = RecordingOutboundClient::with_response(200, r#"[]"#);
    let unavailable = handle_backend_request(
        &BackendConfig::new("test", "backend"),
        BackendRequest {
            url: Some(
                "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.2.3",
            ),
            ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(unavailable.status, 500);
    assert_eq!(
        unavailable.body["error"],
        mobile_version::mobile_version_policy_error()
    );
    assert_eq!(outbound.calls().len(), 0);

    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[{"id":"MOBILE_IOS_EFFECTIVE_VERSION","value":"1.2.0"}]"#,
    );
    let invalid_policy = handle_backend_request(
        &config,
        BackendRequest {
            url: Some(
                "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.2.3",
            ),
            ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(invalid_policy.status, 500);
    assert_eq!(
        invalid_policy.body["error"],
        mobile_version::mobile_version_policy_error()
    );
}

#[tokio::test]
async fn otp_settings_reads_web_config_without_mobile_policy_validation() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, r#"[{"value":"true"}]"#);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/auth/otp/settings?client=web&platform="),
            ..request("GET", mobile_version::OTP_SETTINGS_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["otpEnabled"], true);
    assert_eq!(
        header_value(&response, "access-control-allow-origin"),
        Some("*")
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    let call = &calls[0];
    assert_eq!(call.method, OutboundMethod::Get);
    assert!(call.url.contains("select=value"));
    assert!(call.url.contains("id=eq.WEB_OTP_ENABLED"));
    assert!(!call.url.contains("MOBILE_IOS_EFFECTIVE_VERSION"));
}

#[tokio::test]
async fn otp_settings_fails_open_for_web_when_config_is_unavailable() {
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &BackendConfig::new("test", "backend"),
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/auth/otp/settings?client=tulearn"),
            ..request("GET", mobile_version::OTP_SETTINGS_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["otpEnabled"], false);
    assert!(
        response.body["diagnosticCode"]
            .as_str()
            .unwrap()
            .starts_with("AUTH-OTP-SETTINGS-")
    );
    assert_eq!(
        header_value(&response, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn otp_settings_reads_mobile_policy_and_fails_closed() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"MOBILE_IOS_OTP_ENABLED","value":true},
                {"id":"MOBILE_ANDROID_OTP_ENABLED","value":"false"}
            ]"#,
    );
    let response = handle_backend_request(
        &config,
        BackendRequest {
            url: Some(
                "https://tuturuuu.localhost/api/v1/auth/otp/settings?client=mobile&platform=ios",
            ),
            ..request("GET", mobile_version::OTP_SETTINGS_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["otpEnabled"], true);
    assert!(
        outbound.calls()[0]
            .url
            .contains("MOBILE_ANDROID_EFFECTIVE_VERSION")
    );

    let unavailable = handle_backend_request(
            &BackendConfig::new("test", "backend"),
            BackendRequest {
                url: Some("https://tuturuuu.localhost/api/v1/auth/otp/settings?client=mobile&platform=android"),
                ..request("GET", mobile_version::OTP_SETTINGS_PATH)
            },
            &RecordingOutboundClient::default(),
        )
        .await;

    assert_eq!(unavailable.status, 500);
    assert!(
        unavailable.body["diagnosticCode"]
            .as_str()
            .unwrap()
            .starts_with("AUTH-OTP-SETTINGS-")
    );
    assert_eq!(unavailable.body["error"], "Failed to load OTP settings");
}

#[tokio::test]
async fn otp_settings_validates_query_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for (url, message) in [
        (
            "https://tuturuuu.localhost/api/v1/auth/otp/settings",
            r#"Invalid option: expected one of "web"|"mobile"|"tulearn""#,
        ),
        (
            "https://tuturuuu.localhost/api/v1/auth/otp/settings?client=mobile",
            "Mobile OTP settings requests must include a platform",
        ),
        (
            "https://tuturuuu.localhost/api/v1/auth/otp/settings?client=web&platform=windows",
            r#"Invalid option: expected one of "ios"|"android""#,
        ),
    ] {
        let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(url),
                ..request("GET", mobile_version::OTP_SETTINGS_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 400, "{url}");
        assert_eq!(response.body["error"], message);
        assert_eq!(
            header_value(&response, "access-control-allow-origin"),
            Some("*")
        );
    }

    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn mobile_version_check_rejects_unsupported_methods_but_leaves_options_route_owned() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let rejected = handle_backend_request(
        &config,
        request("POST", mobile_version::MOBILE_VERSION_CHECK_PATH),
        &outbound,
    )
    .await;
    let options = handle_backend_request(
        &config,
        request("OPTIONS", mobile_version::MOBILE_VERSION_CHECK_PATH),
        &outbound,
    )
    .await;

    assert_eq!(rejected.status, 405);
    assert_eq!(rejected.allow, Some("GET, OPTIONS"));
    assert_eq!(options.status, 204);
    assert_eq!(
        header_value(&options, "access-control-allow-methods"),
        Some(MOBILE_AUTH_CORS_ALLOW_METHODS)
    );
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn otp_settings_rejects_unsupported_methods_but_leaves_options_route_owned() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let rejected = handle_backend_request(
        &config,
        request("POST", mobile_version::OTP_SETTINGS_PATH),
        &outbound,
    )
    .await;
    let options = handle_backend_request(
        &config,
        request("OPTIONS", mobile_version::OTP_SETTINGS_PATH),
        &outbound,
    )
    .await;

    assert_eq!(rejected.status, 405);
    assert_eq!(rejected.allow, Some("GET, OPTIONS"));
    assert_eq!(options.status, 204);
    assert_eq!(
        header_value(&options, "access-control-allow-methods"),
        Some(MOBILE_AUTH_CORS_ALLOW_METHODS)
    );
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn infrastructure_timezones_rejects_missing_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request("GET", timezones::INFRASTRUCTURE_TIMEZONES_PATH),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn infrastructure_timezones_rejects_missing_root_operator_permission() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "false"),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request("GET", timezones::INFRASTRUCTURE_TIMEZONES_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Forbidden");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert!(calls[0].url.ends_with("/auth/v1/user"));
    assert!(
        calls[1]
            .url
            .ends_with("/rest/v1/rpc/has_workspace_permission")
    );
    assert_eq!(
        calls[1].body.as_deref(),
        Some(
            r#"{"p_permission":"manage_workspace_roles","p_user_id":"user-1","p_ws_id":"00000000-0000-0000-0000-000000000000"}"#
        )
    );
}

#[tokio::test]
async fn infrastructure_timezones_reads_private_rows_for_root_operators() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(
            200,
            r#"[
                    {
                        "id":"timezone-1",
                        "value":"Asia/Ho_Chi_Minh",
                        "abbr":"+07",
                        "offset":7,
                        "isdst":false,
                        "text":"Ho Chi Minh",
                        "utc":["Asia/Ho_Chi_Minh"],
                        "created_at":"2026-01-01 00:00:00+00"
                    }
                ]"#,
        ),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", timezones::INFRASTRUCTURE_TIMEZONES_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body[0]["value"], "Asia/Ho_Chi_Minh");
    assert_eq!(response.body[0]["utc"][0], "Asia/Ho_Chi_Minh");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[2].url.contains("/rest/v1/timezones?"));
    assert!(
        calls[2]
            .url
            .contains("select=id%2Cvalue%2Cabbr%2Coffset%2Cisdst%2Ctext%2Cutc%2Ccreated_at")
    );
    assert!(calls[2].url.contains("order=value.asc"));
    assert_eq!(
        recorded_header(&calls[2], "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[2], "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}

#[tokio::test]
async fn infrastructure_timezones_returns_legacy_load_error_after_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request("GET", timezones::INFRASTRUCTURE_TIMEZONES_PATH)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching timezones");
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn infrastructure_timezones_put_rejects_missing_auth_before_body_parse() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request_with_body(
            "PUT",
            "/api/v1/infrastructure/timezones/timezone-1",
            "not json",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn infrastructure_timezones_post_rejects_missing_auth_before_body_parse() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request_with_body("POST", timezones::INFRASTRUCTURE_TIMEZONES_PATH, "not json"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn infrastructure_timezones_post_inserts_private_row_for_root_operators() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(201, ""),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "POST",
                timezones::INFRASTRUCTURE_TIMEZONES_PATH,
                r#"{
                        "id": null,
                        "value":"Asia/Ho_Chi_Minh",
                        "abbr":"+07",
                        "offset":7,
                        "isdst":false,
                        "text":"Ho Chi Minh",
                        "utc":"Asia/Ho_Chi_Minh, UTC"
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "success");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    let insert_call = &calls[2];
    assert_eq!(insert_call.method, OutboundMethod::Post);
    assert!(insert_call.url.contains("/rest/v1/timezones"));
    assert_eq!(
        recorded_header(insert_call, "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(insert_call, "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(insert_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(insert_call, "Prefer"),
        Some("return=minimal")
    );

    let body: Value = serde_json::from_str(insert_call.body.as_deref().unwrap()).unwrap();
    assert!(body.get("id").is_none());
    assert_eq!(body["value"], "Asia/Ho_Chi_Minh");
    assert_eq!(body["abbr"], "+07");
    assert_eq!(body["offset"], 7);
    assert_eq!(body["isdst"], false);
    assert_eq!(body["text"], "Ho Chi Minh");
    assert_eq!(body["utc"], json!(["Asia/Ho_Chi_Minh", "UTC"]));
}

#[tokio::test]
async fn infrastructure_timezones_put_patches_private_row_for_root_operators() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(204, ""),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "PUT",
                "/api/v1/infrastructure/timezones/timezone-1",
                r#"{
                        "value":"Asia/Ho_Chi_Minh",
                        "abbr":"+07",
                        "offset":7,
                        "isdst":false,
                        "text":"Ho Chi Minh",
                        "utc":"Asia/Ho_Chi_Minh, UTC"
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "success");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    let update_call = &calls[2];
    assert_eq!(update_call.method, OutboundMethod::Patch);
    assert!(update_call.url.contains("/rest/v1/timezones?"));
    assert!(update_call.url.contains("id=eq.timezone-1"));
    assert_eq!(
        recorded_header(update_call, "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(update_call, "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(update_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(update_call, "Prefer"),
        Some("return=minimal")
    );

    let body: Value = serde_json::from_str(update_call.body.as_deref().unwrap()).unwrap();
    assert_eq!(body["value"], "Asia/Ho_Chi_Minh");
    assert_eq!(body["abbr"], "+07");
    assert_eq!(body["offset"], 7);
    assert_eq!(body["isdst"], false);
    assert_eq!(body["text"], "Ho Chi Minh");
    assert_eq!(body["utc"], json!(["Asia/Ho_Chi_Minh", "UTC"]));
}

#[tokio::test]
async fn infrastructure_timezones_delete_removes_private_row_for_root_operators() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(204, ""),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request("DELETE", "/api/v1/infrastructure/timezones/timezone-1")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "success");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    let delete_call = &calls[2];
    assert_eq!(delete_call.method, OutboundMethod::Delete);
    assert!(delete_call.url.contains("/rest/v1/timezones?"));
    assert!(delete_call.url.contains("id=eq.timezone-1"));
    assert_eq!(delete_call.body, None);
    assert_eq!(
        recorded_header(delete_call, "Accept-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(delete_call, "Content-Profile"),
        Some("private")
    );
    assert_eq!(
        recorded_header(delete_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(delete_call, "Prefer"),
        Some("return=minimal")
    );
}

#[tokio::test]
async fn infrastructure_timezones_writes_return_legacy_errors_after_auth() {
    let config = backend_config_with_contact_data();
    let create_invalid_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
    ]);
    let create_invalid_response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body("POST", timezones::INFRASTRUCTURE_TIMEZONES_PATH, "not json")
        },
        &create_invalid_outbound,
    )
    .await;

    assert_eq!(create_invalid_response.status, 500);
    assert_eq!(
        create_invalid_response.body["message"],
        "Error creating timezone"
    );
    assert_eq!(create_invalid_outbound.calls().len(), 2);

    let create_save_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let create_save_response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "POST",
                timezones::INFRASTRUCTURE_TIMEZONES_PATH,
                r#"{"value":"Asia/Ho_Chi_Minh"}"#,
            )
        },
        &create_save_outbound,
    )
    .await;

    assert_eq!(create_save_response.status, 500);
    assert_eq!(
        create_save_response.body["message"],
        "Error creating timezone"
    );
    assert_eq!(create_save_outbound.calls().len(), 3);

    let update_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
    ]);
    let update_response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request_with_body(
                "PUT",
                "/api/v1/infrastructure/timezones/timezone-1",
                "not json",
            )
        },
        &update_outbound,
    )
    .await;

    assert_eq!(update_response.status, 500);
    assert_eq!(update_response.body["message"], "Error updating timezone");
    assert_eq!(update_outbound.calls().len(), 2);

    let delete_outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "true"),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);
    let delete_response = handle_backend_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            ..request("DELETE", "/api/v1/infrastructure/timezones/timezone-1")
        },
        &delete_outbound,
    )
    .await;

    assert_eq!(delete_response.status, 500);
    assert_eq!(delete_response.body["message"], "Error deleting timezone");
    assert_eq!(delete_outbound.calls().len(), 3);
}

#[test]
fn native_outbound_client_installs_tls_provider_before_construction() {
    let _client = outbound::NativeOutboundHttpClient::default();
}

#[test]
fn outbound_errors_are_display_safe() {
    let error = OutboundError::Transport("upstream unavailable".to_owned());

    assert_eq!(error.to_string(), "upstream unavailable");
}

fn request_with_origin(
    method: &'static str,
    path: &'static str,
    origin: &'static str,
) -> BackendRequest<'static> {
    BackendRequest {
        origin: Some(origin),
        ..request(method, path)
    }
}

fn request_with_cookie(
    method: &'static str,
    path: &'static str,
    cookie: String,
) -> BackendRequest<'static> {
    BackendRequest {
        cookie: Some(Box::leak(cookie.into_boxed_str())),
        url: Some("https://tanstack.tuturuuu.localhost/contact"),
        ..request(method, path)
    }
}

fn request_with_bearer(
    method: &'static str,
    path: &'static str,
    token: String,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some(Box::leak(format!("Bearer {token}").into_boxed_str())),
        url: Some("https://tanstack.tuturuuu.localhost/contact"),
        ..request(method, path)
    }
}

fn app_session_claims(target_app: &str, scopes: Vec<&str>, exp: u64) -> AppCoordinationClaims {
    AppCoordinationClaims {
        aud: contact::app_coordination_token_audience().to_owned(),
        email: Some("app-session@example.com".to_owned()),
        exp,
        iat: 0,
        iss: contact::app_coordination_token_issuer().to_owned(),
        jti: "test-jti".to_owned(),
        origin_app: "web".to_owned(),
        scopes: scopes.into_iter().map(str::to_owned).collect(),
        sub: "app-session-user-1".to_owned(),
        target_app: target_app.to_owned(),
        typ: "app_coordination".to_owned(),
    }
}

fn app_session_token(claims: &AppCoordinationClaims) -> String {
    let encoded_header = contact::encode_app_session_part(r#"{"alg":"HS256","typ":"JWT"}"#);
    let encoded_payload = contact::encode_app_session_part(serde_json::to_string(claims).unwrap());
    let unsigned = format!("{encoded_header}.{encoded_payload}");
    let signature = contact::sign_app_coordination_content(&unsigned, "test-app-session-secret")
        .expect("test app-session signature");

    format!(
        "{}{unsigned}.{signature}",
        contact::app_coordination_token_prefix()
    )
}

fn valid_app_session_token() -> String {
    app_session_token(&app_session_claims(
        "platform",
        vec![APP_SESSION_SCOPE, "cli:access"],
        4_102_444_800,
    ))
}

fn header_value<'a>(response: &'a BackendResponse, header: &str) -> Option<&'a str> {
    response
        .headers
        .iter()
        .find(|(name, _)| *name == header)
        .map(|(_, value)| value.as_str())
}

fn recorded_header<'a>(request: &'a RecordedOutboundRequest, header: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(header))
        .map(|(_, value)| value.as_str())
}

fn assert_mobile_version_policy_row(rows: &[Value], id: &str, value: &str) {
    let row = rows
        .iter()
        .find(|row| row["id"] == id)
        .unwrap_or_else(|| panic!("missing mobile version policy row {id}"));

    assert_eq!(row["value"], value);
}

fn sha256_hex_for_test(value: &str) -> String {
    let digest = <sha2::Sha256 as sha2::Digest>::digest(value.as_bytes());
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        let _ = std::fmt::Write::write_fmt(&mut encoded, format_args!("{byte:02x}"));
    }
    encoded
}

fn browser_recovery_request(
    origin: Option<&'static str>,
    referer: Option<&'static str>,
    cookie: Option<&'static str>,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie,
        method: "POST",
        origin,
        path: BROWSER_STATE_RECOVERY_PATH,
        referer,
        request_id: None,
        url: Some("https://tuturuuu.localhost/~recover-browser-state"),
    }
}

#[test]
fn content_length_guard_matches_request_body_limit() {
    assert!(!content_length_exceeds_request_body_limit(None));
    assert!(!content_length_exceeds_request_body_limit(Some("")));
    assert!(!content_length_exceeds_request_body_limit(Some(
        "not-a-number"
    )));
    assert!(!content_length_exceeds_request_body_limit(Some("65536")));
    assert!(!content_length_exceeds_request_body_limit(Some(" 65536 ")));
    assert!(content_length_exceeds_request_body_limit(Some("65537")));
}

#[test]
fn body_buffering_is_limited_to_routes_that_parse_json_payloads() {
    for path in [
        "/api/v1/infrastructure/languages",
        "/api/v1/infrastructure/changelog",
        "/api/v1/infrastructure/sidebar",
        "/api/v1/infrastructure/sidebar/sizes",
        "/api/v1/internal/holidays",
        "/api/v1/internal/holidays/bulk",
        "/api/auth/mfa/totp/factors",
        SUPPORT_INQUIRIES_PATH,
    ] {
        assert!(should_buffer_request_body("POST", path), "{path}");
    }

    assert!(should_buffer_request_body(
        "POST",
        "/api/v1/infrastructure/changelog/entry-1/publish"
    ));
    assert!(should_buffer_request_body(
        "PUT",
        "/api/v1/infrastructure/changelog/entry-1"
    ));
    assert!(should_buffer_request_body(
        "PUT",
        "/api/v1/internal/holidays/holiday-1"
    ));
    assert!(should_buffer_request_body(
        "PATCH",
        CURRENT_USER_PROFILE_PATH
    ));
    assert!(should_buffer_request_body(
        "PATCH",
        CURRENT_USER_FULL_NAME_PATH
    ));
    assert!(should_buffer_request_body(
        "PATCH",
        current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH
    ));
    assert!(should_buffer_request_body(
        "PATCH",
        current_user_calendar_settings::CURRENT_USER_CALENDAR_SETTINGS_PATH
    ));
    assert!(should_buffer_request_body(
        "PATCH",
        "/api/v1/inquiries/inquiry-1"
    ));
    assert!(should_buffer_request_body(
        "PATCH",
        ONBOARDING_PROGRESS_PATH
    ));
    assert!(!should_buffer_request_body(
        "POST",
        CURRENT_USER_PROFILE_PATH
    ));
    assert!(!should_buffer_request_body(
        "GET",
        CURRENT_USER_FULL_NAME_PATH
    ));
    assert!(!should_buffer_request_body(
        "PUT",
        "/api/v1/internal/holidays/bulk"
    ));
    assert!(!should_buffer_request_body(
        "DELETE",
        "/api/v1/infrastructure/changelog/entry-1"
    ));
    assert!(!should_buffer_request_body(
        "POST",
        "/api/v1/infrastructure/changelog/upload"
    ));
    assert!(!should_buffer_request_body(
        "POST",
        "/api/v1/inquiries/inquiry-1/media-urls"
    ));
    assert!(!should_buffer_request_body("GET", ONBOARDING_PROGRESS_PATH));
    assert!(!should_buffer_request_body("PATCH", SUPPORT_INQUIRIES_PATH));

    for (method, path) in [
        ("GET", "/healthz"),
        ("GET", "/readyz"),
        ("GET", "/api/migration/manifest"),
        ("POST", "/~recover-browser-state"),
        ("POST", "/internal/jobs/noop"),
        ("GET", CURRENT_USER_PROFILE_PATH),
        (
            "GET",
            current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
        ),
    ] {
        assert!(!should_buffer_request_body(method, path), "{method} {path}");
    }
}

#[test]
fn oversized_body_guard_only_applies_to_buffered_routes() {
    assert!(buffered_request_body_exceeds_limit(
        "POST",
        "/api/v1/infrastructure/languages",
        Some("65537")
    ));

    for (method, path) in [
        ("GET", "/healthz"),
        ("GET", "/readyz"),
        ("GET", "/api/migration/manifest"),
        ("POST", "/~recover-browser-state"),
        ("POST", "/internal/jobs/noop"),
        ("GET", CURRENT_USER_PROFILE_PATH),
    ] {
        assert!(
            !buffered_request_body_exceeds_limit(method, path, Some("65537")),
            "{method} {path}"
        );
    }
}

#[test]
fn buffered_body_text_guard_matches_request_body_limit() {
    assert!(!buffered_body_text_exceeds_request_body_limit(
        &"a".repeat(MAX_REQUEST_BODY_BYTES)
    ));
    assert!(buffered_body_text_exceeds_request_body_limit(
        &"a".repeat(MAX_REQUEST_BODY_BYTES + 1)
    ));
}

#[cfg(feature = "native")]
#[tokio::test]
async fn native_buffered_request_body_rejects_oversized_payloads() {
    use axum::body::Body;

    let response =
        native::buffer_native_request_body(Body::from(vec![b'a'; MAX_REQUEST_BODY_BYTES + 1]))
            .await
            .unwrap_err();

    assert_eq!(response.status, 413);
    assert_eq!(response.body["error"], "request body too large");
    assert_eq!(
        response.body["maxBytes"].as_u64(),
        Some(MAX_REQUEST_BODY_BYTES as u64)
    );
}

#[cfg(feature = "native")]
#[tokio::test]
async fn native_buffered_request_body_preserves_valid_payloads() {
    use axum::body::Body;

    let body_text = native::buffer_native_request_body(Body::from(r#"{"locale":"vi"}"#))
        .await
        .expect("body should buffer");

    assert_eq!(body_text.as_deref(), Some(r#"{"locale":"vi"}"#));
}

#[test]
fn runtime_request_body_plan_requires_known_length_for_buffered_worker_requests() {
    for content_length in [None, Some(""), Some(" "), Some("not-a-number")] {
        let parts = RuntimeRequestParts {
            authorization: None,
            content_length,
            cookie: None,
            method: "POST",
            origin: None,
            path: "/api/v1/infrastructure/sidebar",
            referer: None,
            request_id: None,
            url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/sidebar"),
        };

        assert_eq!(
            runtime_request_body_plan(&parts),
            RuntimeRequestBodyPlan::RejectLengthRequired,
            "{content_length:?}"
        );
    }

    for content_length in [Some("0"), Some("65536"), Some(" 65536 ")] {
        let parts = RuntimeRequestParts {
            authorization: None,
            content_length,
            cookie: None,
            method: "POST",
            origin: None,
            path: "/api/v1/infrastructure/sidebar",
            referer: None,
            request_id: None,
            url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/sidebar"),
        };

        assert_eq!(
            runtime_request_body_plan(&parts),
            RuntimeRequestBodyPlan::Buffer,
            "{content_length:?}"
        );
    }
}

#[test]
fn request_body_too_large_response_reports_limit() {
    let response = request_body_too_large_response();

    assert_eq!(response.status, 413);
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(response.body["error"], "request body too large");
    assert_eq!(
        response.body["maxBytes"].as_u64(),
        Some(MAX_REQUEST_BODY_BYTES as u64)
    );
}

#[test]
fn request_body_length_required_response_reports_limit() {
    let response = request_body_length_required_response();

    assert_eq!(response.status, 411);
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(
        response.body["error"],
        "request body content length required"
    );
    assert_eq!(
        response.body["maxBytes"].as_u64(),
        Some(MAX_REQUEST_BODY_BYTES as u64)
    );
}

#[test]
fn runtime_request_parts_map_to_backend_request_with_body_plan() {
    let parts = RuntimeRequestParts {
        authorization: Some("Bearer secret"),
        content_length: Some("31"),
        cookie: Some("a=1; b=2"),
        method: "POST",
        origin: Some("https://tanstack.tuturuuu.localhost"),
        path: "/api/v1/infrastructure/languages",
        referer: Some("https://tanstack.tuturuuu.localhost/settings"),
        request_id: Some("request-worker-1"),
        url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/languages"),
    };

    assert_eq!(
        runtime_request_body_plan(&parts),
        RuntimeRequestBodyPlan::Buffer
    );

    let request =
        backend_request_from_runtime_parts(parts, Some(r#"{"locale":"vi","enabled":true}"#));

    assert_eq!(
        request,
        BackendRequest {
            authorization: Some("Bearer secret"),
            body_text: Some(r#"{"locale":"vi","enabled":true}"#),
            cookie: Some("a=1; b=2"),
            method: "POST",
            origin: Some("https://tanstack.tuturuuu.localhost"),
            path: "/api/v1/infrastructure/languages",
            referer: Some("https://tanstack.tuturuuu.localhost/settings"),
            request_id: Some("request-worker-1"),
            url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/languages"),
        }
    );
}

#[test]
fn runtime_request_body_plan_rejects_oversized_buffered_worker_requests() {
    let oversized = RuntimeRequestParts {
        authorization: None,
        content_length: Some("65537"),
        cookie: None,
        method: "POST",
        origin: None,
        path: "/api/v1/infrastructure/sidebar",
        referer: None,
        request_id: None,
        url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/sidebar"),
    };

    assert_eq!(
        runtime_request_body_plan(&oversized),
        RuntimeRequestBodyPlan::RejectTooLarge
    );

    let unbuffered = RuntimeRequestParts {
        method: "POST",
        path: "/internal/jobs/noop",
        ..oversized
    };

    assert_eq!(
        runtime_request_body_plan(&unbuffered),
        RuntimeRequestBodyPlan::Skip
    );
}

#[test]
fn runtime_response_header_operations_set_standard_headers_and_append_custom_headers() {
    let mut response =
        json_response_with_cache_control(202, json!({ "ok": true }), NO_STORE_CACHE_CONTROL);
    response.allow = Some("GET");
    response.headers.push(("set-cookie", "a=1".to_owned()));
    response.headers.push(("set-cookie", "b=2".to_owned()));

    let operations = runtime_response_header_operations(&response);

    assert_eq!(
        operations[0],
        RuntimeResponseHeaderOperation::Set("Content-Type", APPLICATION_JSON.to_owned())
    );
    assert_eq!(
        operations[1],
        RuntimeResponseHeaderOperation::Set("Allow", "GET".to_owned())
    );
    assert_eq!(
        operations[2],
        RuntimeResponseHeaderOperation::Set("Cache-Control", NO_STORE_CACHE_CONTROL.to_owned())
    );

    for &(name, value) in json_security_headers() {
        assert!(
            operations.contains(&RuntimeResponseHeaderOperation::Set(name, value.to_owned())),
            "{name}"
        );
    }

    assert_eq!(
        operations
            .iter()
            .filter(|operation| matches!(
                operation,
                RuntimeResponseHeaderOperation::Append("set-cookie", _)
            ))
            .count(),
        2
    );
    assert!(operations.contains(&RuntimeResponseHeaderOperation::Append(
        "set-cookie",
        "a=1".to_owned()
    )));
    assert!(operations.contains(&RuntimeResponseHeaderOperation::Append(
        "set-cookie",
        "b=2".to_owned()
    )));
}

#[test]
fn runtime_response_header_operations_skip_json_security_headers_for_text() {
    let response = text_response(200, "ok", "text/plain");

    assert_eq!(
        runtime_response_header_operations(&response),
        vec![RuntimeResponseHeaderOperation::Set(
            "Content-Type",
            "text/plain".to_owned()
        )]
    );
}

#[test]
fn app_session_token_verification_accepts_current_user_targets() {
    let claims = verify_app_session_token(
        &valid_app_session_token(),
        &backend_config_with_app_session_secret().app_coordination_secrets,
        contact::current_user_app_session_targets(),
        1,
    )
    .expect("valid app session");

    assert_eq!(claims.sub, "app-session-user-1");
    assert_eq!(claims.email.as_deref(), Some("app-session@example.com"));
    assert_eq!(claims.target_app, "platform");
}

#[test]
fn app_session_token_verification_rejects_bad_target_scope_and_expiry() {
    let config = backend_config_with_app_session_secret();

    let bad_target = app_session_token(&app_session_claims(
        "unknown-app",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    assert_eq!(
        verify_app_session_token(
            &bad_target,
            &config.app_coordination_secrets,
            contact::current_user_app_session_targets(),
            1,
        ),
        Err("App session target mismatch".to_owned())
    );

    let missing_scope = app_session_token(&app_session_claims(
        "platform",
        vec!["cli:access"],
        4_102_444_800,
    ));
    assert_eq!(
        verify_app_session_token(
            &missing_scope,
            &config.app_coordination_secrets,
            contact::current_user_app_session_targets(),
            1,
        ),
        Err("App session missing required scope".to_owned())
    );

    let expired = app_session_token(&app_session_claims("platform", vec![APP_SESSION_SCOPE], 1));
    assert_eq!(
        verify_app_session_token(
            &expired,
            &config.app_coordination_secrets,
            contact::current_user_app_session_targets(),
            1,
        ),
        Err("Token expired".to_owned())
    );
}

#[test]
fn contact_data_status_reports_safe_configuration_state() {
    let configured =
        contact::ContactDataConfig::new("https://project-ref.supabase.co/", "secret-value");
    let configured_status = serde_json::to_value(configured.status()).unwrap();

    assert_eq!(configured_status["configured"], true);
    assert_eq!(configured_status["missing"], json!([]));
    assert_eq!(
        configured_status["supabaseOrigin"],
        "https://project-ref.supabase.co"
    );
    assert!(!format!("{configured:?}").contains("secret-value"));
    assert!(format!("{configured:?}").contains("<configured>"));

    let missing = contact::ContactDataConfig::disabled();
    let missing_status = serde_json::to_value(missing.status()).unwrap();

    assert_eq!(missing_status["configured"], false);
    assert_eq!(
        missing_status["missing"],
        json!(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
    );
    assert_eq!(missing_status["supabaseOrigin"], Value::Null);
    assert!(format!("{missing:?}").contains("<empty>"));

    let invalid = contact::ContactDataConfig::new("not-a-url", "secret-value");
    let invalid_status = serde_json::to_value(invalid.status()).unwrap();

    assert_eq!(invalid_status["configured"], false);
    assert_eq!(invalid_status["missing"], json!(["SUPABASE_URL"]));
    assert_eq!(invalid_status["supabaseOrigin"], Value::Null);
}

#[test]
fn healthz_reports_runtime() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/healthz"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ok"], true);
    assert_eq!(response.body["runtime"], "rust");
}

#[test]
fn legacy_api_health_route_is_migrated() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/api/health"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some("no-store"));
    assert_eq!(response.body["status"], "ok");
}

#[test]
fn legacy_api_health_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", "/api/health"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[test]
fn legacy_calendar_mock_route_is_migrated() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/api/v1/calendar/mock"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(response.body["data"].as_array().unwrap().len(), 3);
    assert_eq!(response.body["data"][0]["id"], 1);
    assert_eq!(response.body["data"][0]["title"], "Event 1");
    assert_eq!(response.body["data"][0]["start_at"], "2023-10-01T10:00:00Z");
    assert_eq!(response.body["data"][0]["end_at"], "2023-10-01T11:00:00Z");
}

#[test]
fn legacy_calendar_mock_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", "/api/v1/calendar/mock"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[test]
fn retired_legacy_api_routes_return_terminal_removed_responses() {
    for (method, path, message) in [
        (
            "GET",
            "/api/share/course/9f7d44c7-ccab-4ff5-9b7a-25b85edda5a6",
            RETIRED_SHARE_COURSE_MESSAGE,
        ),
        ("GET", "/api/sync-logs", RETIRED_SYNC_LOGS_MESSAGE),
        (
            "POST",
            "/api/payment/migrations/subscriptions/cross-check",
            RETIRED_SUBSCRIPTION_CROSS_CHECK_MESSAGE,
        ),
        ("GET", "/api/users/search", RETIRED_USER_SEARCH_MESSAGE),
        (
            "GET",
            "/api/v1/proxy/tuturuuu",
            RETIRED_TUTURUUU_PROXY_MESSAGE,
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 410, "{method} {path}");
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], RETIRED_LEGACY_API_ERROR);
        assert_eq!(response.body["message"], message);
    }
}

#[test]
fn retired_legacy_api_routes_reject_unsupported_methods() {
    for (method, path, allow) in [
        ("POST", "/api/share/course/example-course-id", "GET"),
        ("POST", "/api/sync-logs", "GET"),
        (
            "GET",
            "/api/payment/migrations/subscriptions/cross-check",
            "POST",
        ),
        ("DELETE", "/api/users/search", "GET"),
        ("POST", "/api/v1/proxy/tuturuuu", "GET"),
    ] {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 405, "{method} {path}");
        assert_eq!(response.allow, Some(allow));
        assert_eq!(response.body["error"], "method not allowed");
    }
}

#[test]
fn retired_legacy_api_routes_do_not_match_nested_maintained_paths() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request(
            "POST",
            "/api/payment/migrations/subscriptions/cross-check/phase-1",
        ),
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.body["error"], "not found");
}

#[test]
fn retired_legacy_api_responses_use_json_body_shape() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request("GET", "/api/users/search"),
    );

    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert!(!response.body_empty);
    assert_eq!(response.body["error"], RETIRED_LEGACY_API_ERROR);
    assert_eq!(response.body["message"], RETIRED_USER_SEARCH_MESSAGE);
}

#[test]
fn legacy_user_field_types_route_is_migrated() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", USER_FIELD_TYPES_PATH),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(
        response.body,
        json!([
            { "id": "TEXT" },
            { "id": "NUMBER" },
            { "id": "BOOLEAN" },
            { "id": "DATE" },
            { "id": "DATETIME" },
        ])
    );
}

#[test]
fn legacy_user_field_types_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", USER_FIELD_TYPES_PATH),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[tokio::test]
async fn default_workspace_get_requires_auth() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(
            "GET",
            current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn default_workspace_get_returns_default_for_supabase_session() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(
            200,
            r#"[{"default_workspace_id":"00000000-0000-0000-0000-000000000001"}]"#,
        ),
        outbound_response(
            200,
            r#"[{"id":"00000000-0000-0000-0000-000000000001","name":"Team","personal":false,"workspace_members":[{"user_id":"user-1"}]}]"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "GET",
            current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.cache_control,
        Some("private, max-age=300, stale-while-revalidate=60")
    );
    assert_eq!(
        response.body,
        json!({"id":"00000000-0000-0000-0000-000000000001","name":"Team","personal":false})
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert!(calls[2].url.contains("workspace_members%21inner"));
}

#[tokio::test]
async fn default_workspace_get_accepts_app_session_and_falls_back_to_personal() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"[{"default_workspace_id":"00000000-0000-0000-0000-000000000002"}]"#,
        ),
        outbound_response(200, "[]"),
        outbound_response(
            200,
            r#"[{"id":"00000000-0000-0000-0000-000000000003","name":"Personal","personal":true}]"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "GET",
            current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
            valid_app_session_token(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({"id":"00000000-0000-0000-0000-000000000003","name":"Personal","personal":true})
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(
        calls
            .iter()
            .all(|call| recorded_header(call, "Authorization")
                == Some("Bearer test-service-role-secret"))
    );
    assert!(calls[2].url.contains("personal=eq.true"));
}

#[tokio::test]
async fn default_workspace_get_returns_null_on_data_failure() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(500, r#"{"message":"database unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "GET",
            current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, Value::Null);
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn default_workspace_patch_requires_normal_auth_and_valid_body() {
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(
            "PATCH",
            current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
            valid_app_session_token(),
        ),
        &RecordingOutboundClient::default(),
    )
    .await;
    assert_eq!(response.status, 401);

    let outbound = RecordingOutboundClient::with_response(200, r#"{"id":"user-1"}"#);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        BackendRequest {
            body_text: Some(r#"{"workspaceId":"not-a-uuid"}"#),
            ..request_with_bearer(
                "PATCH",
                current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"], "Invalid request data");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn default_workspace_patch_clears_default_workspace() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(204, ""),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        BackendRequest {
            body_text: Some(r#"{"workspaceId":null}"#),
            ..request_with_bearer(
                "PATCH",
                current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({"success": true}));
    let calls = outbound.calls();
    assert_eq!(calls[1].method, OutboundMethod::Patch);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/user_private_details?user_id=eq.user-1"
    );
    assert_eq!(recorded_header(&calls[1], "Prefer"), Some("return=minimal"));
    assert_eq!(
        serde_json::from_str::<Value>(calls[1].body.as_deref().unwrap()).unwrap()["default_workspace_id"],
        Value::Null
    );
}

#[tokio::test]
async fn default_workspace_patch_sets_workspace_after_membership() {
    let workspace_id = "00000000-0000-0000-0000-000000000004";
    let body = format!(r#"{{"workspaceId":"{workspace_id}"}}"#);
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"[{"ws_id":"00000000-0000-0000-0000-000000000004"}]"#),
        outbound_response(204, ""),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        BackendRequest {
            body_text: Some(&body),
            ..request_with_bearer(
                "PATCH",
                current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    let calls = outbound.calls();
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert!(calls[1].url.contains("workspace_members?select=ws_id"));
    assert_eq!(calls[2].method, OutboundMethod::Patch);
    assert_eq!(
        serde_json::from_str::<Value>(calls[2].body.as_deref().unwrap()).unwrap()["default_workspace_id"],
        workspace_id
    );
}

#[tokio::test]
async fn default_workspace_patch_returns_400_for_membership_and_update_failures() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, "[]"),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        BackendRequest {
            body_text: Some(r#"{"workspaceId":"00000000-0000-0000-0000-000000000005"}"#),
            ..request_with_bearer(
                "PATCH",
                current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;
    assert_eq!(response.status, 400);
    assert_eq!(
        response.body["error"],
        "Workspace not found or access denied"
    );
    assert_eq!(outbound.calls().len(), 2);

    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(500, r#"{"message":"cannot update"}"#),
    ]);
    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        BackendRequest {
            body_text: Some(r#"{"workspaceId":null}"#),
            ..request_with_bearer(
                "PATCH",
                current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;
    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"], "cannot update");
}

#[tokio::test]
async fn default_workspace_route_rejects_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request(
            "POST",
            current_user_default_workspace::CURRENT_USER_DEFAULT_WORKSPACE_PATH,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, PATCH"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[test]
fn current_user_profile_requires_app_session_auth() {
    let response = route_request(
        &backend_config_with_app_session_secret(),
        request("GET", CURRENT_USER_PROFILE_PATH),
    );

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Unauthorized");
}

#[test]
fn current_user_profile_requires_app_coordination_secret_for_tokens() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request_with_bearer("GET", CURRENT_USER_PROFILE_PATH, valid_app_session_token()),
    );

    assert_eq!(response.status, 503);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body["message"],
        "App coordination secret is not configured"
    );
}

#[test]
fn current_user_profile_returns_app_session_identity_preview() {
    let response = route_request(
        &backend_config_with_app_session_secret(),
        request_with_cookie(
            "GET",
            CURRENT_USER_PROFILE_PATH,
            format!("{APP_SESSION_COOKIE_NAME}={}", valid_app_session_token()),
        ),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        header_value(&response, "cdn-cache-control"),
        Some("no-store")
    );
    assert_eq!(response.body["id"], "app-session-user-1");
    assert_eq!(response.body["email"], "app-session@example.com");
    assert_eq!(response.body["created_at"], "1970-01-01T00:00:00.000Z");
    assert_eq!(response.body["display_name"], Value::Null);
    assert_eq!(response.body["default_workspace_id"], Value::Null);
}

#[tokio::test]
async fn current_user_profile_reads_contact_data_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"[{"id":"app-session-user-1","display_name":"Ada","avatar_url":"https://cdn.example.test/avatar.png","created_at":"2026-06-20T00:00:00.000Z"}]"#,
        ),
        outbound_response(
            200,
            r#"[{"email":"ada@example.com","full_name":"Ada Lovelace","new_email":null,"default_workspace_id":"ws_123"}]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", CURRENT_USER_PROFILE_PATH, valid_app_session_token()),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["id"], "app-session-user-1");
    assert_eq!(response.body["email"], "ada@example.com");
    assert_eq!(response.body["display_name"], "Ada");
    assert_eq!(
        response.body["avatar_url"],
        "https://cdn.example.test/avatar.png"
    );
    assert_eq!(response.body["full_name"], "Ada Lovelace");
    assert_eq!(response.body["default_workspace_id"], "ws_123");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/users?select=id%2Cdisplay_name%2Cavatar_url%2Ccreated_at&id=eq.app-session-user-1&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/user_private_details?select=full_name%2Cnew_email%2Cemail%2Cdefault_workspace_id&user_id=eq.app-session-user-1&limit=1"
    );
}

#[test]
fn current_user_profile_rejects_wrong_app_session_target() {
    let token = app_session_token(&app_session_claims(
        "unknown-app",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let response = route_request(
        &backend_config_with_app_session_secret(),
        request_with_bearer("GET", CURRENT_USER_PROFILE_PATH, token),
    );

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "App session target mismatch");
}

#[test]
fn current_user_profile_patch_requires_auth_before_data_layer_placeholder() {
    let response = route_request(
        &backend_config_with_app_session_secret(),
        request_with_body(
            "PATCH",
            CURRENT_USER_PROFILE_PATH,
            r#"{"display_name":"New"}"#,
        ),
    );

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
}

#[test]
fn current_user_profile_patch_requires_same_origin_for_cookie_auth() {
    let token = valid_app_session_token();
    let response = route_request(
        &backend_config_with_app_session_secret(),
        BackendRequest {
            body_text: Some(r#"{"display_name":"New"}"#),
            cookie: Some(Box::leak(
                format!("{APP_SESSION_COOKIE_NAME}={token}").into_boxed_str(),
            )),
            method: "PATCH",
            origin: Some("https://evil.example"),
            path: CURRENT_USER_PROFILE_PATH,
            url: Some("https://tanstack.tuturuuu.localhost/contact"),
            ..request("PATCH", CURRENT_USER_PROFILE_PATH)
        },
    );

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body["message"],
        "Profile updates require same-origin confirmation"
    );
}

#[test]
fn current_user_profile_patch_returns_data_layer_placeholder_after_auth() {
    let response = route_request(
        &backend_config_with_app_session_secret(),
        BackendRequest {
            body_text: Some(r#"{"display_name":"New"}"#),
            origin: Some("https://tanstack.tuturuuu.localhost"),
            ..request_with_cookie(
                "PATCH",
                CURRENT_USER_PROFILE_PATH,
                format!("{APP_SESSION_COOKIE_NAME}={}", valid_app_session_token()),
            )
        },
    );

    assert_eq!(response.status, 503);
    assert_eq!(response.body["code"], "CONTACT_DATA_LAYER_NOT_READY");
    assert_eq!(
        response.body["message"],
        CONTACT_DATA_LAYER_NOT_READY_MESSAGE
    );
}

#[tokio::test]
async fn current_user_profile_patch_persists_to_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(204, "");
    let response = handle_backend_request(
            &config,
            BackendRequest {
                body_text: Some(
                    r#"{"display_name":"Ada","bio":null,"avatar_url":"https://cdn.example.test/avatar.png","ignored":"value"}"#,
                ),
                ..request_with_bearer(
                    "PATCH",
                    CURRENT_USER_PROFILE_PATH,
                    valid_app_session_token(),
                )
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "Profile updated successfully");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Patch);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/users?id=eq.app-session-user-1"
    );
    assert_eq!(recorded_header(&calls[0], "prefer"), Some("return=minimal"));
    assert_eq!(
        serde_json::from_str::<Value>(calls[0].body.as_deref().unwrap()).unwrap(),
        json!({
            "avatar_url": "https://cdn.example.test/avatar.png",
            "bio": null,
            "display_name": "Ada",
        })
    );
}

#[tokio::test]
async fn current_user_full_name_requires_authenticated_supabase_session() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request_with_body(
            "PATCH",
            CURRENT_USER_FULL_NAME_PATH,
            r#"{"full_name":"Ada Lovelace"}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn current_user_full_name_validates_body_after_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{"id":"user-123","email":"ada@example.com"}"#,
    );
    let response = handle_backend_request(
        &config,
        BackendRequest {
            body_text: Some(r#"{"full_name":"   "}"#),
            ..request_with_bearer(
                "PATCH",
                CURRENT_USER_FULL_NAME_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid full name");
    assert_eq!(response.body["errors"][0]["path"], json!(["full_name"]));
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn current_user_full_name_upserts_private_details_with_caller_token() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-123","email":"ada@example.com"}"#),
        outbound_response(204, ""),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            body_text: Some(r#"{"full_name":" Ada Lovelace ","ignored":"value"}"#),
            ..request_with_bearer(
                "PATCH",
                CURRENT_USER_FULL_NAME_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({ "message": "Full name updated successfully" })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Post);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/user_private_details?on_conflict=user_id"
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[1], "Prefer"),
        Some("resolution=merge-duplicates,return=minimal")
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[1].body.as_deref().unwrap()).unwrap(),
        json!({
            "full_name": "Ada Lovelace",
            "user_id": "user-123",
        })
    );
}

#[tokio::test]
async fn current_user_full_name_returns_update_error_for_supabase_failure() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-123","email":"ada@example.com"}"#),
        outbound_response(500, r#"{"message":"database unavailable"}"#),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            body_text: Some(r#"{"full_name":"Ada Lovelace"}"#),
            ..request_with_bearer(
                "PATCH",
                CURRENT_USER_FULL_NAME_PATH,
                "browser-access-token".to_owned(),
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error updating full name" })
    );
}

#[tokio::test]
async fn devbox_cache_requires_authentication() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let list_response =
        handle_backend_request(&config, request("GET", "/api/v1/devboxes/cache"), &outbound).await;
    let prune_response = handle_backend_request(
        &config,
        request("POST", "/api/v1/devboxes/cache/prune"),
        &outbound,
    )
    .await;

    assert_eq!(list_response.status, 401);
    assert_eq!(list_response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(list_response.body["message"], "Unauthorized");
    assert_eq!(prune_response.status, 401);
    assert_eq!(prune_response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(prune_response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn devbox_cache_accepts_cli_app_session_root_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, r#"{"type":"MEMBER"}"#);
    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/devboxes/cache", valid_app_session_token()),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["caches"], json!([]));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/workspace_members?")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "select").as_deref(),
        Some("type")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "ws_id").as_deref(),
        Some("eq.00000000-0000-0000-0000-000000000000")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "user_id").as_deref(),
        Some("eq.app-session-user-1")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "limit").as_deref(),
        Some("1")
    );
    assert_eq!(
        recorded_header(&calls[0], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn devbox_cache_rejects_cli_app_session_without_cli_scope() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "platform",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/devboxes/cache", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn devbox_cache_accepts_browser_supabase_root_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);
    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "GET",
            "/api/v1/devboxes/cache",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["caches"], json!([]));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert!(
        calls[1]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/workspace_members?")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "user_id").as_deref(),
        Some("eq.browser-user-1")
    );
    assert_eq!(
        recorded_header(&calls[1], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
}

#[tokio::test]
async fn devbox_cache_prune_accepts_cli_app_session_root_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, r#"{"type":"MEMBER"}"#);
    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/devboxes/cache/prune",
            valid_app_session_token(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Devbox cache prune requested.");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/workspace_members?")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "user_id").as_deref(),
        Some("eq.app-session-user-1")
    );
    assert_eq!(
        recorded_header(&calls[0], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
}

#[tokio::test]
async fn devbox_cache_prune_accepts_browser_supabase_root_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);
    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/devboxes/cache/prune",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "Devbox cache prune requested.");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        decoded_query_value(&calls[1].url, "user_id").as_deref(),
        Some("eq.browser-user-1")
    );
}

#[tokio::test]
async fn devbox_cache_rejects_root_workspace_guest() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, r#"{"type":"GUEST"}"#);
    let list_response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/devboxes/cache", valid_app_session_token()),
        &outbound,
    )
    .await;
    let prune_response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/devboxes/cache/prune",
            valid_app_session_token(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(list_response.status, 403);
    assert_eq!(list_response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(list_response.body["message"], "Forbidden");
    assert_eq!(prune_response.status, 403);
    assert_eq!(prune_response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(prune_response.body["message"], "Forbidden");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn devbox_cache_rejects_unsupported_methods() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let method_response = handle_backend_request(
        &config,
        request("POST", "/api/v1/devboxes/cache"),
        &outbound,
    )
    .await;

    assert_eq!(method_response.status, 405);
    assert_eq!(method_response.allow, Some("GET"));

    let prune_response = handle_backend_request(
        &config,
        request("GET", "/api/v1/devboxes/cache/prune"),
        &outbound,
    )
    .await;

    assert_eq!(prune_response.status, 405);
    assert_eq!(prune_response.allow, Some("POST"));
    assert_eq!(outbound.calls().len(), 0);
}

#[test]
fn support_inquiry_requires_auth_before_parsing_body() {
    let response = route_request(
        &backend_config_with_app_session_secret(),
        request_with_body("POST", SUPPORT_INQUIRIES_PATH, "{}"),
    );

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Unauthorized");
}

#[test]
fn support_inquiry_requires_same_origin_for_cookie_auth() {
    let token = valid_app_session_token();
    let response = route_request(
        &backend_config_with_app_session_secret(),
        BackendRequest {
            body_text: Some(
                r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
            ),
            cookie: Some(Box::leak(
                format!("{APP_SESSION_COOKIE_NAME}={token}").into_boxed_str(),
            )),
            method: "POST",
            origin: Some("https://evil.example"),
            path: SUPPORT_INQUIRIES_PATH,
            url: Some("https://tanstack.tuturuuu.localhost/contact"),
            ..request("POST", SUPPORT_INQUIRIES_PATH)
        },
    );

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body["message"],
        "Support inquiry creation requires same-origin confirmation"
    );
}

#[test]
fn support_inquiry_validates_payload_after_auth() {
    let response = route_request(
        &backend_config_with_app_session_secret(),
        BackendRequest {
            body_text: Some(
                r#"{"name":"J","email":"bad","type":"sales","product":"bad","subject":"Hi","message":"short"}"#,
            ),
            origin: Some("https://tanstack.tuturuuu.localhost"),
            ..request_with_cookie(
                "POST",
                SUPPORT_INQUIRIES_PATH,
                format!("{APP_SESSION_COOKIE_NAME}={}", valid_app_session_token()),
            )
        },
    );

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid request body");
    assert!(
        response.body["errors"]
            .as_array()
            .is_some_and(|errors| errors.len() >= 6)
    );
}

#[test]
fn support_inquiry_returns_data_layer_placeholder_for_valid_bearer_request() {
    let response = route_request(
        &backend_config_with_app_session_secret(),
        BackendRequest {
            body_text: Some(
                r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
            ),
            ..request_with_bearer("POST", SUPPORT_INQUIRIES_PATH, valid_app_session_token())
        },
    );

    assert_eq!(response.status, 503);
    assert_eq!(response.body["code"], "CONTACT_DATA_LAYER_NOT_READY");
    assert_eq!(
        response.body["message"],
        CONTACT_DATA_LAYER_NOT_READY_MESSAGE
    );
}

#[tokio::test]
async fn support_inquiry_async_handler_requires_contact_data_config() {
    let config = backend_config_with_app_session_secret();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
            &config,
            BackendRequest {
                body_text: Some(
                    r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
                ),
                ..request_with_bearer("POST", SUPPORT_INQUIRIES_PATH, valid_app_session_token())
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 503);
    assert_eq!(response.body["code"], "CONTACT_DATA_LAYER_NOT_READY");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn support_inquiry_persists_to_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(201, r#"[{"id":"support-inquiry-123"}]"#);
    let response = handle_backend_request(
            &config,
            BackendRequest {
                body_text: Some(
                    r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
                ),
                ..request_with_bearer("POST", SUPPORT_INQUIRIES_PATH, valid_app_session_token())
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 201);
    assert_eq!(response.body["success"], true);
    assert_eq!(response.body["inquiryId"], "support-inquiry-123");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Post);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/support_inquiries?select=id"
    );
    assert_eq!(
        recorded_header(&calls[0], "prefer"),
        Some("return=representation")
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[0].body.as_deref().unwrap()).unwrap(),
        json!({
            "creator_id": "app-session-user-1",
            "email": "jane@example.com",
            "message": "Please help me with this issue.",
            "name": "Jane",
            "product": "web",
            "subject": "Need help",
            "type": "support",
        })
    );
}

#[tokio::test]
async fn support_inquiry_patch_validates_body_before_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        request_with_body(
            "PATCH",
            "/api/v1/inquiries/inquiry-1",
            r#"{"is_read":"yes"}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"], "Invalid request body");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn support_inquiry_patch_requires_tuturuuu_admin_email() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("member-access-token");
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{"id":"user-1","email":"member@example.com"}"#,
    );
    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PATCH",
                "/api/v1/inquiries/inquiry-1",
                r#"{"is_read":true}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(
        response.body["error"],
        "Unauthorized. Only Tuturuuu accounts can update inquiries."
    );
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn support_inquiry_patch_updates_row_with_service_role() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ops@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"[{"id":"inquiry-1","is_read":true,"is_resolved":false}]"#,
        ),
    ]);
    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PATCH",
                "/api/v1/inquiries/inquiry-1",
                r#"{"is_read":true,"is_resolved":false,"ignored":"value"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["data"]["id"], "inquiry-1");
    assert_eq!(response.body["data"]["is_read"], true);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Patch);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/support_inquiries?id=eq.inquiry-1"
    );
    assert_eq!(
        recorded_header(&calls[1], "authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[1], "prefer"),
        Some("return=representation")
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[1].body.as_deref().unwrap()).unwrap(),
        json!({
            "is_read": true,
            "is_resolved": false,
        })
    );
}

#[tokio::test]
async fn contact_api_routes_reject_unsupported_methods() {
    let config = BackendConfig::new("test", "backend");
    let outbound = RecordingOutboundClient::default();
    let profile_response = handle_backend_request(
        &config,
        request("POST", CURRENT_USER_PROFILE_PATH),
        &outbound,
    )
    .await;
    assert_eq!(profile_response.status, 405);
    assert_eq!(profile_response.allow, Some("GET, PATCH"));

    let full_name_response = handle_backend_request(
        &config,
        request("GET", CURRENT_USER_FULL_NAME_PATH),
        &outbound,
    )
    .await;
    assert_eq!(full_name_response.status, 405);
    assert_eq!(full_name_response.allow, Some("PATCH"));

    let inquiry_response =
        handle_backend_request(&config, request("GET", SUPPORT_INQUIRIES_PATH), &outbound).await;
    assert_eq!(inquiry_response.status, 405);
    assert_eq!(inquiry_response.allow, Some("POST"));

    let inquiry_detail_response = handle_backend_request(
        &config,
        request("GET", "/api/v1/inquiries/inquiry-1"),
        &outbound,
    )
    .await;
    assert_eq!(inquiry_detail_response.status, 405);
    assert_eq!(inquiry_detail_response.allow, Some("PATCH"));
}

#[test]
fn legacy_auth_cors_options_routes_are_migrated() {
    for path in AUTH_CORS_PREFLIGHT_PATHS {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("OPTIONS", path),
        );

        assert_eq!(response.status, 204, "{path}");
        assert!(response.body_empty, "{path}");
        assert_eq!(response.content_type, None, "{path}");
        assert_eq!(
            header_value(&response, "access-control-allow-origin"),
            Some("*"),
            "{path}"
        );
        assert_eq!(
            header_value(&response, "access-control-allow-methods"),
            Some(MOBILE_AUTH_CORS_ALLOW_METHODS),
            "{path}"
        );
        assert_eq!(
            header_value(&response, "access-control-allow-headers"),
            Some(MOBILE_AUTH_CORS_ALLOW_HEADERS),
            "{path}"
        );
        assert_eq!(
            header_value(&response, "access-control-max-age"),
            Some(MOBILE_AUTH_CORS_MAX_AGE),
            "{path}"
        );
    }
}

#[test]
fn legacy_auth_cors_preflight_routes_do_not_claim_auth_methods() {
    for (method, path) in [
        ("POST", "/api/v1/auth/password-login"),
        ("POST", "/api/v1/auth/mobile/password-login"),
        ("POST", "/api/v1/auth/otp/send"),
        ("POST", "/api/v1/auth/otp/verify"),
        ("GET", "/api/v1/mobile/version-check"),
    ] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 404, "{method} {path}");
        assert_eq!(response.body["error"], "not found", "{method} {path}");
    }
}

#[test]
fn legacy_bare_auth_options_routes_are_migrated() {
    for path in [
        "/api/v1/auth/qr-login/challenges",
        "/api/v1/auth/qr-login/challenges/challenge-123",
        "/api/v1/auth/qr-login/challenges/challenge-123/approve",
        "/api/v1/auth/mfa/mobile/challenges",
        "/api/v1/auth/mfa/mobile/challenges/challenge-123",
        "/api/v1/auth/mfa/mobile/challenges/challenge-123/approve",
        "/api/v1/auth/mfa/mobile/approvals",
    ] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("OPTIONS", path),
        );

        assert_eq!(response.status, 204, "{path}");
        assert!(response.body_empty, "{path}");
        assert_eq!(response.content_type, None, "{path}");
        assert!(response.headers.is_empty(), "{path}");
    }
}

#[test]
fn legacy_bare_auth_preflight_routes_do_not_claim_auth_methods() {
    for (method, path) in [
        ("POST", "/api/v1/auth/qr-login/challenges"),
        ("GET", "/api/v1/auth/qr-login/challenges/challenge-123"),
        (
            "POST",
            "/api/v1/auth/qr-login/challenges/challenge-123/approve",
        ),
        ("POST", "/api/v1/auth/mfa/mobile/challenges"),
        ("GET", "/api/v1/auth/mfa/mobile/challenges/challenge-123"),
        (
            "POST",
            "/api/v1/auth/mfa/mobile/challenges/challenge-123/approve",
        ),
        ("GET", "/api/v1/auth/mfa/mobile/approvals"),
    ] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 404, "{method} {path}");
        assert_eq!(response.body["error"], "not found", "{method} {path}");
    }
}

#[test]
fn legacy_webgl_package_upload_options_route_is_bare_without_origin() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request(
            "OPTIONS",
            "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
        ),
    );

    assert_eq!(response.status, 204);
    assert!(response.body_empty);
    assert_eq!(response.content_type, None);
    assert!(response.headers.is_empty());
}

#[test]
fn legacy_webgl_package_upload_options_allows_static_cms_origins() {
    for origin in ["https://cms.tuturuuu.com", "http://localhost:7811"] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_origin(
                "OPTIONS",
                "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
                origin,
            ),
        );

        assert_eq!(response.status, 204, "{origin}");
        assert!(response.body_empty, "{origin}");
        assert_eq!(
            header_value(&response, "access-control-allow-origin"),
            Some(origin),
            "{origin}"
        );
        assert_eq!(
            header_value(&response, "access-control-allow-credentials"),
            Some("true"),
            "{origin}"
        );
        assert_eq!(
            header_value(&response, "access-control-allow-methods"),
            Some(WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_METHODS),
            "{origin}"
        );
        assert_eq!(
            header_value(&response, "access-control-allow-headers"),
            Some(WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_HEADERS),
            "{origin}"
        );
        assert_eq!(header_value(&response, "vary"), Some("Origin"), "{origin}");
    }
}

#[test]
fn legacy_webgl_package_upload_options_allows_configured_cms_origins() {
    let mut config = BackendConfig::new("test", "backend");
    config.cms_app_url = "https://cms-preview.example.com/editor".to_owned();
    config.next_public_cms_app_url = "https://cms-public.example.com/app".to_owned();

    for origin in [
        "https://cms-preview.example.com",
        "https://cms-public.example.com",
    ] {
        let response = route_request(
            &config,
            request_with_origin(
                "OPTIONS",
                "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
                origin,
            ),
        );

        assert_eq!(response.status, 204, "{origin}");
        assert_eq!(
            header_value(&response, "access-control-allow-origin"),
            Some(origin),
            "{origin}"
        );
        assert_eq!(header_value(&response, "vary"), Some("Origin"), "{origin}");
    }
}

#[test]
fn legacy_webgl_package_upload_options_rejects_untrusted_origins() {
    let mut config = BackendConfig::new("test", "backend");
    config.cms_app_url = "not a url".to_owned();
    config.next_public_cms_app_url = "https://cms-public.example.com/app".to_owned();

    for origin in [
        "https://cms-public.example.net",
        "https://cms.tuturuuu.com.evil.example",
        "not a url",
    ] {
        let response = route_request(
            &config,
            request_with_origin(
                "OPTIONS",
                "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
                origin,
            ),
        );

        assert_eq!(response.status, 204, "{origin}");
        assert!(response.body_empty, "{origin}");
        assert!(response.headers.is_empty(), "{origin}");
    }
}

#[test]
fn legacy_webgl_package_upload_preflight_does_not_claim_put() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request(
            "PUT",
            "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
        ),
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.body["error"], "not found");
}

#[test]
fn legacy_webgl_package_upload_preflight_requires_exact_path_shape() {
    for path in [
        "/api/v1/workspaces/external-projects/webgl-packages/upload",
        "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload/extra",
        "/api/v1/workspaces/ws-123/external-projects/webgl-package/upload",
    ] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_origin("OPTIONS", path, "https://cms.tuturuuu.com"),
        );

        assert_eq!(response.status, 404, "{path}");
        assert_eq!(response.body["error"], "not found", "{path}");
    }
}

#[test]
fn legacy_group_check_email_route_is_disabled() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request(
            "POST",
            "/api/v1/workspaces/acme/user-groups/group-1/group-checks/post-1/email",
        ),
    );

    assert_eq!(response.status, 410);
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(response.body["message"], DISABLED_GROUP_CHECK_EMAIL_MESSAGE);
}

#[test]
fn legacy_group_check_email_route_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request(
            "GET",
            "/api/v1/workspaces/acme/user-groups/group-1/group-checks/post-1/email",
        ),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("POST"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[test]
fn legacy_browser_recovery_get_returns_no_store_html() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", BROWSER_STATE_RECOVERY_PATH),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.content_type, Some("text/html; charset=utf-8"));
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert!(
        response
            .headers
            .iter()
            .any(|(name, value)| *name == "cdn-cache-control" && value == "no-store")
    );
    assert!(
        response
            .body_text
            .as_deref()
            .unwrap()
            .contains(r#"<form method="post" action="/~recover-browser-state">"#)
    );
}

#[test]
fn legacy_browser_recovery_post_redirects_and_clears_matching_auth_cookies() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        browser_recovery_request(
            Some("https://tuturuuu.localhost"),
            None,
            Some("sb-project-ref-auth-token=abc; theme=dark; sb-project-ref-auth-token.0=def"),
        ),
    );

    assert_eq!(response.status, 307);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert!(response.body_empty);
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "location" && value == "https://tuturuuu.localhost/login?browserStateReset=1"
    }));
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "clear-site-data" && value == BROWSER_STATE_RECOVERY_CLEAR_SITE_DATA
    }));

    let set_cookie_headers: Vec<_> = response
        .headers
        .iter()
        .filter(|(name, _value)| *name == "set-cookie")
        .map(|(_name, value)| value.as_str())
        .collect();

    assert_eq!(set_cookie_headers.len(), 2);
    assert!(
        set_cookie_headers
            .iter()
            .any(|value| value.starts_with("sb-project-ref-auth-token=;"))
    );
    assert!(
        set_cookie_headers
            .iter()
            .any(|value| value.starts_with("sb-project-ref-auth-token.0=;"))
    );
    assert!(
        set_cookie_headers
            .iter()
            .all(|value| value.contains("Max-Age=0") && value.contains("Path=/"))
    );
}

#[test]
fn legacy_browser_recovery_post_accepts_same_origin_referer() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        browser_recovery_request(None, Some("https://tuturuuu.localhost/settings"), None),
    );

    assert_eq!(response.status, 307);
    assert!(
        response
            .headers
            .iter()
            .any(|(name, _value)| *name == "clear-site-data")
    );
}

#[test]
fn legacy_browser_recovery_post_rejects_cross_origin_requests() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        browser_recovery_request(Some("https://evil.example"), None, None),
    );

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body["error"],
        "Browser state reset requires same-origin confirmation"
    );
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
}

#[test]
fn legacy_browser_recovery_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("PUT", BROWSER_STATE_RECOVERY_PATH),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, POST"));
}

#[test]
fn legacy_language_cookie_post_requires_locale() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request_with_body("POST", "/api/v1/infrastructure/languages", "{}"),
    );

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Locale is required");
    assert!(
        !response
            .headers
            .iter()
            .any(|(name, _value)| *name == "set-cookie")
    );
}

#[test]
fn legacy_language_cookie_post_rejects_unsupported_locale() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request_with_body(
            "POST",
            "/api/v1/infrastructure/languages",
            r#"{"locale":"fr"}"#,
        ),
    );

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Locale is not supported");
}

#[test]
fn legacy_language_cookie_post_sets_supported_locale() {
    for locale in ["en", "vi"] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_body(
                "POST",
                "/api/v1/infrastructure/languages",
                if locale == "en" {
                    r#"{"locale":"en"}"#
                } else {
                    r#"{"locale":"vi"}"#
                },
            ),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.body["message"], "Success");
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "set-cookie" && value == &format!("{LOCALE_COOKIE_NAME}={locale}; Path=/")
        }));
    }
}

#[test]
fn legacy_language_cookie_delete_clears_cookie() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("DELETE", "/api/v1/infrastructure/languages"),
    );

    assert_eq!(response.status, 200);
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "set-cookie" && value == &format!("{LOCALE_COOKIE_NAME}={COOKIE_DELETE_VALUE}")
    }));
}

#[test]
fn legacy_language_cookie_route_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/api/v1/infrastructure/languages"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("POST, DELETE"));
}

#[test]
fn legacy_sidebar_cookie_post_requires_collapsed_value() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request_with_body("POST", "/api/v1/infrastructure/sidebar", "{}"),
    );

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Collapse is required");
}

#[test]
fn legacy_sidebar_cookie_post_sets_raw_json_value() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request_with_body(
            "POST",
            "/api/v1/infrastructure/sidebar",
            r#"{"collapsed":false}"#,
        ),
    );

    assert_eq!(response.status, 200);
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "set-cookie" && value == &format!("{SIDEBAR_COLLAPSED_COOKIE_NAME}=false; Path=/")
    }));
}

#[test]
fn legacy_sidebar_cookie_delete_clears_cookie() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("DELETE", "/api/v1/infrastructure/sidebar"),
    );

    assert_eq!(response.status, 200);
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "set-cookie"
            && value == &format!("{SIDEBAR_COLLAPSED_COOKIE_NAME}={COOKIE_DELETE_VALUE}")
    }));
}

#[test]
fn legacy_sidebar_sizes_cookie_post_requires_both_sizes() {
    for body in [r#"{"sidebar":25}"#, r#"{"main":75}"#, "{}"] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_body("POST", "/api/v1/infrastructure/sidebar/sizes", body),
        );

        assert_eq!(response.status, 500);
        assert_eq!(response.body["message"], "Sizes is required");
    }
}

#[test]
fn legacy_sidebar_sizes_cookie_post_sets_both_cookies() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request_with_body(
            "POST",
            "/api/v1/infrastructure/sidebar/sizes",
            r#"{"sidebar":28,"main":"72"}"#,
        ),
    );

    assert_eq!(response.status, 200);
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "set-cookie" && value == &format!("{SIDEBAR_SIZE_COOKIE_NAME}=28; Path=/")
    }));
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "set-cookie" && value == &format!("{MAIN_CONTENT_SIZE_COOKIE_NAME}=72; Path=/")
    }));
}

#[test]
fn legacy_sidebar_sizes_cookie_delete_only_clears_sidebar_size_cookie() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("DELETE", "/api/v1/infrastructure/sidebar/sizes"),
    );

    assert_eq!(response.status, 200);
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "set-cookie"
            && value == &format!("{SIDEBAR_SIZE_COOKIE_NAME}={COOKIE_DELETE_VALUE}")
    }));
    assert!(
        !response
            .headers
            .iter()
            .any(|(_name, value)| value.starts_with(MAIN_CONTENT_SIZE_COOKIE_NAME))
    );
}

#[test]
fn legacy_workspace_slides_collection_routes_return_not_implemented() {
    for method in ["GET", "POST"] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(method, "/api/v1/workspaces/acme/slides"),
        );

        assert_eq!(response.status, 501);
        assert_eq!(response.body["message"], "Not implemented");
    }
}

#[test]
fn legacy_workspace_slides_collection_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("PUT", "/api/v1/workspaces/acme/slides"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, POST"));
}

#[test]
fn legacy_workspace_slide_item_routes_return_not_implemented() {
    for method in ["PUT", "DELETE"] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(method, "/api/v1/workspaces/acme/slides/slide-123"),
        );

        assert_eq!(response.status, 501);
        assert_eq!(response.body["message"], "Not implemented");
    }
}

#[test]
fn legacy_workspace_slide_item_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/api/v1/workspaces/acme/slides/slide-123"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("PUT, DELETE"));
}

#[test]
fn legacy_grouped_score_names_migration_is_disabled_in_dev() {
    let response = route_request(
        &BackendConfig::new("development", "backend"),
        request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH),
    );

    assert_eq!(response.status, 410);
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(response.body["error"], "MIGRATION_DISABLED");
    assert_eq!(
        response.body["message"],
        GROUPED_SCORE_NAMES_MIGRATION_DISABLED_MESSAGE
    );
}

#[test]
fn legacy_grouped_score_names_migration_requires_dev_mode() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH),
    );

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Forbidden");
    assert_eq!(
        response.body["message"],
        "Infrastructure migration routes are only accessible in development mode"
    );
    assert_eq!(
        response.body["hint"],
        "These routes are intended for internal data migration and should not be used in production."
    );
}

#[test]
fn legacy_grouped_score_names_migration_allows_local_e2e_bypass() {
    let mut config = BackendConfig::new("production", "backend");
    config.local_e2e_migration_access = true;

    let response = route_request(&config, request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH));

    assert_eq!(response.status, 410);
    assert_eq!(response.body["error"], "MIGRATION_DISABLED");
}

#[test]
fn legacy_grouped_score_names_migration_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("development", "backend"),
        request("GET", GROUPED_SCORE_NAMES_MIGRATION_PATH),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("PUT"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[test]
fn obsolete_infrastructure_migration_routes_are_disabled_in_dev() {
    for (method, path) in [
        ("PUT", "/api/v1/infrastructure/migrate/score-names"),
        ("PUT", "/api/v1/infrastructure/migrate/classes"),
        ("PUT", "/api/v1/infrastructure/migrate/lessons"),
        ("PUT", "/api/v1/infrastructure/migrate/payment-methods"),
        ("GET", "/api/v1/infrastructure/migrate/class-scores"),
        ("PATCH", "/api/v1/infrastructure/migrate/workspace-users"),
        (
            "POST",
            "/api/v1/infrastructure/migrate/ensure-platform-users",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 410, "{method} {path}");
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
        assert_eq!(
            response.body["message"],
            OBSOLETE_INFRASTRUCTURE_MIGRATION_DISABLED_MESSAGE
        );
    }
}

#[test]
fn obsolete_infrastructure_migration_routes_require_dev_mode() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request("PUT", "/api/v1/infrastructure/migrate/score-names"),
    );

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Forbidden");
    assert_eq!(
        response.body["message"],
        "Infrastructure migration routes are only accessible in development mode"
    );
}

#[test]
fn obsolete_infrastructure_migration_routes_preserve_legacy_allowed_methods() {
    for (method, path, allow) in [
        ("GET", "/api/v1/infrastructure/migrate/score-names", "PUT"),
        (
            "POST",
            "/api/v1/infrastructure/migrate/class-scores",
            "GET, PUT",
        ),
        (
            "DELETE",
            "/api/v1/infrastructure/migrate/workspace-users",
            "GET, PUT, PATCH",
        ),
        (
            "GET",
            "/api/v1/infrastructure/migrate/ensure-platform-users",
            "POST",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 405, "{method} {path}");
        assert_eq!(response.allow, Some(allow));
        assert_eq!(response.body["error"], "method not allowed");
    }
}

#[test]
fn obsolete_workspace_migration_routes_are_disabled_in_dev() {
    for (method, path) in [
        ("PUT", "/api/workspaces/acme/products/categories/migrate"),
        ("PUT", "/api/workspaces/acme/products/units/migrate"),
        (
            "PUT",
            "/api/workspaces/acme/transactions/categories/migrate",
        ),
        ("PUT", "/api/workspaces/acme/users/indicators/migrate"),
        (
            "PUT",
            "/api/workspaces/acme/users/indicators/groups/migrate",
        ),
        ("PUT", "/api/workspaces/acme/wallets/migrate"),
        ("PUT", "/api/workspaces/acme/wallets/transactions/migrate"),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 410, "{method} {path}");
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
        assert_eq!(
            response.body["message"],
            OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE
        );
    }
}

#[test]
fn obsolete_workspace_migration_routes_require_dev_mode() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request("PUT", "/api/workspaces/acme/products/categories/migrate"),
    );

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Forbidden");
    assert_eq!(
        response.body["message"],
        "Infrastructure migration routes are only accessible in development mode"
    );
}

#[test]
fn obsolete_workspace_migration_routes_reject_unsupported_methods() {
    for (method, path, allow) in [
        (
            "GET",
            "/api/workspaces/acme/products/categories/migrate",
            "PUT",
        ),
        ("POST", "/api/workspaces/acme/wallets/migrate", "PUT"),
        (
            "DELETE",
            "/api/workspaces/acme/users/indicators/groups/migrate",
            "PUT",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 405, "{method} {path}");
        assert_eq!(response.allow, Some(allow));
        assert_eq!(response.body["error"], "method not allowed");
    }
}

#[test]
fn retired_workspace_data_migration_routes_return_disabled_response() {
    for (method, path, message) in [
        (
            "GET",
            "/api/v1/workspaces/acme/encryption/migrate",
            RETIRED_WORKSPACE_ENCRYPTION_MIGRATION_DISABLED_MESSAGE,
        ),
        (
            "POST",
            "/api/v1/workspaces/acme/encryption/migrate",
            RETIRED_WORKSPACE_ENCRYPTION_MIGRATION_DISABLED_MESSAGE,
        ),
        (
            "POST",
            "/api/v1/workspaces/acme/storage/migrate",
            RETIRED_WORKSPACE_STORAGE_MIGRATION_DISABLED_MESSAGE,
        ),
        (
            "GET",
            "/api/v2/workspaces/acme/migrate/wallet-types",
            RETIRED_WORKSPACE_EXPORT_MIGRATION_DISABLED_MESSAGE,
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 410, "{method} {path}");
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
        assert_eq!(response.body["message"], message);
    }
}

#[test]
fn retired_workspace_data_migration_routes_reject_unsupported_methods() {
    for (method, path, allow) in [
        (
            "PUT",
            "/api/v1/workspaces/acme/encryption/migrate",
            "GET, POST",
        ),
        ("GET", "/api/v1/workspaces/acme/storage/migrate", "POST"),
        (
            "POST",
            "/api/v2/workspaces/acme/migrate/wallet-types",
            "GET",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 405, "{method} {path}");
        assert_eq!(response.allow, Some(allow));
        assert_eq!(response.body["error"], "method not allowed");
    }
}

#[test]
fn legacy_well_known_routes_return_cacheable_empty_404() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/.well-known/appspecific/com.chrome.devtools.json"),
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.cache_control, Some(WELL_KNOWN_CACHE_CONTROL));
    assert_eq!(response.content_type, None);
    assert!(response.body_empty);
}

#[test]
fn legacy_well_known_head_routes_return_cacheable_empty_404() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("HEAD", "/.well-known/security.txt"),
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.cache_control, Some(WELL_KNOWN_CACHE_CONTROL));
    assert_eq!(response.content_type, None);
    assert!(response.body_empty);
}

#[test]
fn legacy_well_known_routes_reject_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", "/.well-known/security.txt"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, HEAD"));
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert!(!response.body_empty);
}

#[test]
fn legacy_serwist_worker_route_decommissions_old_registration() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", SERWIST_SERVICE_WORKER_PATH),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.content_type, Some("application/javascript"));
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "cdn-cache-control" && value == NO_STORE_CDN_CACHE_CONTROL
    }));
    assert!(
        response
            .headers
            .iter()
            .any(|(name, value)| { *name == "service-worker-allowed" && value == "/" })
    );
    let body = response.body_text.as_deref().unwrap();
    assert!(body.contains("self.skipWaiting()"));
    assert!(body.contains("self.registration.unregister()"));
}

#[test]
fn legacy_serwist_route_serves_deterministic_source_map_metadata() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", SERWIST_SOURCE_MAP_PATH),
    );

    assert_eq!(response.status, 200);
    assert_eq!(
        response.content_type,
        Some("application/json; charset=UTF-8")
    );
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body_text.as_deref(),
        Some(SERWIST_DECOMMISSION_SOURCE_MAP)
    );
}

#[test]
fn legacy_serwist_route_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", SERWIST_SERVICE_WORKER_PATH),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[test]
fn legacy_serwist_route_returns_empty_404_for_unknown_artifacts() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/serwist/unknown.js"),
    );

    assert_eq!(response.status, 404);
    assert!(response.body_empty);
    assert_eq!(response.content_type, None);
}

#[test]
fn json_responses_advertise_security_headers() {
    let expected = [
        (
            "content-security-policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        ),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
    ];

    assert_eq!(json_security_headers(), expected.as_slice());
}

#[test]
fn readyz_requires_internal_token() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/readyz"),
    );

    assert_eq!(response.status, 503);
    assert_eq!(response.body["ok"], false);
}

#[test]
fn migration_status_is_runtime_neutral() {
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/status"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ok"], true);
    assert_eq!(response.body["backend"]["runtime"], "rust");
    assert_eq!(
        response.body["routeOwnership"]["manifest"],
        MIGRATION_MANIFEST_PATH
    );
}

#[test]
fn migration_status_reports_contact_data_layer_readiness() {
    let response = route_request(
        &backend_config_with_contact_data(),
        authorized_request("GET", "/api/migration/status"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["contactData"]["configured"], true);
    assert_eq!(response.body["contactData"]["missing"], json!([]));
    assert_eq!(
        response.body["contactData"]["supabaseOrigin"],
        "https://project-ref.supabase.co"
    );
    assert!(
        !response
            .body
            .to_string()
            .contains("test-service-role-secret")
    );
}

#[test]
fn migration_manifest_endpoint_returns_checked_inventory() {
    let manifest = parse_route_manifest().unwrap();
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/manifest"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body["summary"]["total"].as_u64(),
        Some(manifest.summary.total as u64)
    );
    assert_eq!(
        response.body["summary"]["total"].as_u64(),
        Some(response.body["routes"].as_array().unwrap().len() as u64)
    );
    assert_eq!(
        response.body["summary"]["methodCounts"]["GET"].as_u64(),
        manifest
            .summary
            .method_counts
            .get("GET")
            .map(|count| *count as u64)
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["routePath"] == "/api/health"
                && route["methods"].as_array().unwrap().len() == 1
                && route["methods"][0] == "GET")
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["routePath"] == "/serwist/:path"
                && route["methods"].as_array().unwrap().len() == 1
                && route["methods"][0] == "GET"
                && route["status"] == "migrated")
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["routePath"] == "/~recover-browser-state"
                && route["methods"].as_array().unwrap().len() == 2
                && route["methods"][0] == "GET"
                && route["methods"][1] == "POST"
                && route["status"] == "migrated")
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["routePath"]
                == "/api/v1/infrastructure/migrate/grouped-score-names"
                && route["methods"].as_array().unwrap().len() == 1
                && route["methods"][0] == "PUT"
                && route["status"] == "migrated")
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(
                |route| route["routePath"] == "/api/workspaces/:wsId/categories"
                    && route["status"] == "accepted-removal"
            )
    );
    assert_eq!(
        response.body["generatedBy"],
        "scripts/tanstack-migration-manifest.js"
    );
}

#[test]
fn migration_cutover_gates_block_while_legacy_routes_remain() {
    let manifest = parse_route_manifest().unwrap();
    let counts = migration_route_counts(&manifest.routes);
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/cutover-gates"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ok"], false);
    assert_eq!(
        response.body["manifest"],
        "apps/tanstack-web/migration/route-manifest.json"
    );
    assert_eq!(
        response.body["summary"]["total"].as_u64(),
        Some(manifest.summary.total as u64)
    );
    assert_eq!(
        response.body["counts"]["acceptedRemoval"].as_u64(),
        Some(counts.accepted_removal as u64)
    );
    assert_eq!(
        response.body["counts"]["legacyNext"].as_u64(),
        Some(counts.legacy_next as u64)
    );
    assert_eq!(
        response.body["counts"]["migrated"].as_u64(),
        Some(counts.migrated as u64)
    );
    assert!(
        response.body["gates"]
            .as_array()
            .unwrap()
            .iter()
            .any(|gate| gate["id"] == "backend-owned-routes-mapped" && gate["ok"] == true)
    );
}

#[test]
fn migration_progress_groups_remaining_route_ownership() {
    let manifest = parse_route_manifest().unwrap();
    let progress = route_manifest_progress(&manifest.routes);
    let rust_backend_progress = progress
        .by_owner
        .iter()
        .find(|bucket| bucket.key == "rust-backend")
        .unwrap();
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/progress"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ok"], false);
    assert_eq!(
        response.body["manifest"],
        "apps/tanstack-web/migration/route-manifest.json"
    );
    assert_eq!(
        response.body["progress"]["totals"]["acceptedRemoval"].as_u64(),
        Some(progress.totals.accepted_removal as u64)
    );
    assert_eq!(
        response.body["progress"]["totals"]["remaining"].as_u64(),
        Some(progress.totals.remaining as u64)
    );
    assert_eq!(
        response.body["progress"]["totals"]["migrated"].as_u64(),
        Some(progress.totals.migrated as u64)
    );
    assert_eq!(
        response.body["progress"]["byOwner"][0]["key"],
        "rust-backend"
    );
    assert_eq!(
        response.body["progress"]["byOwner"][0]["remaining"].as_u64(),
        Some(rust_backend_progress.remaining as u64)
    );
    assert_eq!(response.body["progress"]["byKind"][0]["key"], "api");
    assert!(
        response.body["progress"]["topLegacyRoutes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["targetOwner"] == "rust-backend" && route["methods"].is_array())
    );
}

#[test]
fn migration_inventory_endpoints_require_internal_authorization() {
    let mut config = backend_config_with_internal_token();

    for path in [
        "/api/migration/status",
        "/api/migration/manifest",
        "/api/migration/progress",
        "/api/migration/cutover-gates",
    ] {
        let response = route_request(&config, request("GET", path));

        assert_eq!(response.status, 401);
        assert_eq!(response.body["error"], "unauthorized");
    }

    config.internal_token.clear();
    let response = route_request(&config, request("GET", "/api/migration/status"));

    assert_eq!(response.status, 503);
    assert_eq!(
        response.body["error"],
        "backend internal token is not configured"
    );
}

#[test]
fn protected_jobs_require_authorization() {
    let config = backend_config_with_internal_token();

    let response = route_request(&config, request("POST", "/internal/jobs/noop"));

    assert_eq!(response.status, 401);
}

#[test]
fn protected_jobs_reject_unknown_jobs() {
    let config = backend_config_with_internal_token();

    let response = route_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer secret"),
            body_text: None,
            cookie: None,
            method: "POST",
            origin: None,
            path: "/internal/jobs/unknown",
            referer: None,
            request_id: Some("request-123"),
            url: Some("https://tuturuuu.localhost/internal/jobs/unknown"),
        },
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.body["requestId"], "request-123");
}

#[test]
fn noop_job_accepts_authorized_requests() {
    let mut config = BackendConfig::new("test", "backend");
    config.internal_token = "secret".to_owned();

    let response = route_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer secret"),
            body_text: None,
            cookie: None,
            method: "POST",
            origin: None,
            path: "/internal/jobs/noop",
            referer: None,
            request_id: Some("request-123"),
            url: Some("https://tuturuuu.localhost/internal/jobs/noop"),
        },
    );

    assert_eq!(response.status, 202);
    assert_eq!(response.body["accepted"], true);
    assert_eq!(response.body["job"], "noop");
    assert_eq!(response.body["requestId"], "request-123");
}

#[test]
fn unsupported_methods_report_allow_header() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", "/healthz"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
}
