use super::*;

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
