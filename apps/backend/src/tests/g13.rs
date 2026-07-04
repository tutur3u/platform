use super::*;

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
