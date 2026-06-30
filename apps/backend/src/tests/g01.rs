use super::*;

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
