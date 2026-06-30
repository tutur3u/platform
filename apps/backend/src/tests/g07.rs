use super::*;

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
