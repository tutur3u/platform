use super::*;

#[test]
fn native_outbound_client_installs_tls_provider_before_construction() {
    let _client = outbound::NativeOutboundHttpClient::default();
}

#[test]
fn outbound_errors_are_display_safe() {
    let error = OutboundError::Transport("upstream unavailable".to_owned());

    assert_eq!(error.to_string(), "upstream unavailable");
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
