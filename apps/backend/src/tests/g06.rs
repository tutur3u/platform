use super::*;

#[tokio::test]
async fn holidays_bulk_imports_with_replace_existing_and_user_token_rls() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(204, ""),
        outbound_response(
            201,
            r#"[
                    {"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026},
                    {"id":"holiday-2","date":"2027-01-01","name":"New Year","year":2027}
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "theme=dark; sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{
                        "holidays":[
                            {"date":"2026-01-01","name":"New Year","ignored":true},
                            {"date":"2027-01-01","name":"New Year"},
                            {"date":"2026-04-30","name":"Reunification Day"}
                        ],
                        "replaceExisting":true
                    }"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 201);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Holidays imported successfully");
    assert_eq!(response.body["imported"], 2);
    assert_eq!(response.body["yearsAffected"], json!([2026, 2027]));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/workspace_members?select=type&ws_id=eq.00000000-0000-0000-0000-000000000000&user_id=eq.user-1&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[1], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer admin-access-token")
    );

    assert_eq!(calls[2].method, OutboundMethod::Delete);
    assert_eq!(
        decoded_query_value(&calls[2].url, "year").as_deref(),
        Some("in.(2026,2027)")
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );

    assert_eq!(calls[3].method, OutboundMethod::Post);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?on_conflict=date&select=*"
    );
    assert_eq!(recorded_header(&calls[3], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[3], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[3], "Prefer"),
        Some("resolution=merge-duplicates,return=representation")
    );
    assert_eq!(
        recorded_header(&calls[3], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            calls[3].body.as_ref().expect("bulk upsert request body")
        )
        .expect("bulk upsert request json"),
        json!([
            {"date": "2026-01-01", "name": "New Year"},
            {"date": "2027-01-01", "name": "New Year"},
            {"date": "2026-04-30", "name": "Reunification Day"}
        ])
    );
}

#[tokio::test]
async fn holidays_bulk_maps_delete_errors_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(500, r#"{"message":"db unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{"holidays":[{"date":"2026-01-01","name":"New Year"}],"replaceExisting":true}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error deleting existing holidays");
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn holidays_bulk_maps_insert_errors_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(500, r#"{"message":"db unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{"holidays":[{"date":"2026-01-01","name":"New Year"}]}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error inserting holidays");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert_eq!(
        recorded_header(&calls[2], "Prefer"),
        Some("resolution=ignore-duplicates,return=representation")
    );
}

#[tokio::test]
async fn holidays_item_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/internal/holidays/holiday-1"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("PUT, DELETE"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_put_requires_authenticated_root_workspace_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_body(
            "PUT",
            "/api/v1/internal/holidays/holiday-1",
            r#"{"date":"2026-01-02"}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_put_validates_payload_after_membership_check() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"date":"2026/01/02","name":""}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid input");
    assert!(response.body["errors"]["fieldErrors"]["date"].is_array());
    assert!(response.body["errors"]["fieldErrors"]["name"].is_array());
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_put_rejects_empty_update_body() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body("PUT", "/api/v1/internal/holidays/holiday-1", r#"{}"#)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "No updates provided");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_put_returns_not_found_when_holiday_is_missing() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(
            406,
            r#"{
                    "code":"PGRST116",
                    "details":"The result contains 0 rows",
                    "hint":null,
                    "message":"JSON object requested, multiple (or no) rows returned"
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
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"name":"Updated"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.body["message"], "Holiday not found");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&id=eq.holiday-1&limit=1"
    );
}

#[tokio::test]
async fn holidays_put_rejects_duplicate_dates() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(200, r#"{"id":"holiday-1"}"#),
        outbound_response(200, r#"{"id":"holiday-existing"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"date":"2026-01-02"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 409);
    assert_eq!(
        response.body["message"],
        "A holiday already exists for this date"
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&date=eq.2026-01-02&id=neq.holiday-1&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[3], "Authorization"),
        Some("Bearer admin-access-token")
    );
}

#[tokio::test]
async fn holidays_put_updates_holiday_with_user_token_rls() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(200, r#"{"id":"holiday-1"}"#),
        outbound_response(
            406,
            r#"{
                    "code":"PGRST116",
                    "details":"The result contains 0 rows",
                    "hint":null,
                    "message":"JSON object requested, multiple (or no) rows returned"
                }"#,
        ),
        outbound_response(
            200,
            r#"{"id":"holiday-1","date":"2026-01-02","name":"Updated","year":2026}"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "theme=dark; sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "PUT",
                "/api/v1/internal/holidays/holiday-1",
                r#"{"date":"2026-01-02","name":"Updated","ignored":true}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["id"], "holiday-1");
    assert_eq!(response.body["name"], "Updated");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 5);
    assert_eq!(calls[4].method, OutboundMethod::Patch);
    assert_eq!(
        calls[4].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=*&id=eq.holiday-1"
    );
    assert_eq!(
        recorded_header(&calls[4], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
    assert_eq!(
        recorded_header(&calls[4], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[4], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[4], "Prefer"),
        Some("return=representation")
    );
    assert_eq!(
        recorded_header(&calls[4], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            calls[4].body.as_ref().expect("update request body")
        )
        .expect("update request json"),
        json!({
            "date": "2026-01-02",
            "name": "Updated",
        })
    );
}

#[tokio::test]
async fn holidays_delete_deletes_holiday_with_user_token_rls() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(204, ""),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("DELETE", "/api/v1/internal/holidays/holiday-1")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Holiday deleted");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Delete);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?id=eq.holiday-1"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn holidays_delete_maps_supabase_errors_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(500, r#"{"message":"db unavailable"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("DELETE", "/api/v1/internal/holidays/holiday-1")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error deleting holiday");
}

#[tokio::test]
async fn changelog_slug_get_reads_published_entry_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"{
                "id":"entry-1",
                "title":"Platform release",
                "slug":"platform-release",
                "content":{"type":"doc"},
                "summary":"A shipped platform update",
                "category":"feature",
                "version":"2026.6",
                "cover_image_url":null,
                "is_published":true,
                "published_at":"2026-06-01T00:00:00Z",
                "created_at":"2026-05-31T00:00:00Z",
                "updated_at":"2026-06-01T00:00:00Z"
            }"#,
    );

    let response = handle_backend_request(
        &config,
        request(
            "GET",
            "/api/v1/infrastructure/changelog/slug/platform-release",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["slug"], "platform-release");
    assert_eq!(response.body["is_published"], true);
    assert_eq!(response.body["published_at"], "2026-06-01T00:00:00Z");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/changelog_entries?select=*&slug=eq.platform-release&is_published=eq.true&published_at=not.is.null"
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
async fn changelog_slug_get_maps_postgrest_single_error_to_not_found() {
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
        request("GET", "/api/v1/infrastructure/changelog/slug/missing"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Changelog entry not found");
    assert_eq!(outbound.calls().len(), 1);
}
