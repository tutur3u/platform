use super::*;

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
async fn current_user_full_name_requires_app_session_auth() {
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
    assert_eq!(response.body["message"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn current_user_full_name_validates_body_after_auth() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();
    let response = handle_backend_request(
        &config,
        BackendRequest {
            body_text: Some(r#"{"full_name":"   "}"#),
            ..request_with_bearer(
                "PATCH",
                CURRENT_USER_FULL_NAME_PATH,
                valid_app_session_token(),
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid full name");
    assert_eq!(response.body["errors"][0]["path"], json!(["full_name"]));
    assert_eq!(outbound.calls().len(), 0);
}
