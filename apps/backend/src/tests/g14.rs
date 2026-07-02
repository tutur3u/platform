use super::*;

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
