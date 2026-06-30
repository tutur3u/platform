use super::*;

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
