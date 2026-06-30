use super::*;

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
