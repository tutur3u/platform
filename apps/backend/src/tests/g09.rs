use super::*;

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
