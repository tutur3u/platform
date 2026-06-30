use super::*;

#[tokio::test]
async fn crawler_list_reads_raw_rows_with_filters_and_count() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("internal-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"operator@tuturuuu.com"}"#),
        outbound_response_with_headers(
            200,
            r#"[
                    {
                        "id":"crawl-1",
                        "url":"https://example.com/docs",
                        "markdown":"hello",
                        "html":"<main>hello</main>",
                        "created_at":"2026-01-02T00:00:00Z"
                    }
                ]"#,
            vec![("content-range".to_owned(), "50-99/123".to_owned())],
        ),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                cookie: Some(leaked_test_str(format!(
                    "sb-project-ref-auth-token={cookie_value}"
                ))),
                url: Some(
                    "https://tuturuuu.localhost/api/personal/crawlers/list?page=2&pageSize=50&domain=example.com/docs&search=hello",
                ),
                ..request("GET", "/api/personal/crawlers/list")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["count"], 123);
    assert_eq!(
        response.body["data"],
        json!([
            {
                "id": "crawl-1",
                "url": "https://example.com/docs",
                "markdown": "hello",
                "html": "<main>hello</main>",
                "created_at": "2026-01-02T00:00:00Z",
            }
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer internal-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert!(
        calls[1]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/crawled_urls?")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "order").as_deref(),
        Some("created_at.desc")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "url").as_deref(),
        Some("ilike.%example.com%")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "or").as_deref(),
        Some("(url.ilike.%hello%,markdown.ilike.%hello%,html.ilike.%hello%)")
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
    assert_eq!(recorded_header(&calls[1], "Range"), Some("50-99"));
    assert_eq!(recorded_header(&calls[1], "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn crawler_routes_reject_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/personal/crawlers/domains",
        "/api/personal/crawlers/list",
        "/api/personal/crawlers/uncrawled",
        "/api/v1/workspaces/ws-a/crawlers/status",
    ] {
        let response = handle_backend_request(&config, request("POST", path), &outbound).await;

        assert_eq!(response.status, 405, "{path}");
        assert_eq!(response.allow, Some("GET"), "{path}");
        assert_eq!(response.body["error"], "method not allowed", "{path}");
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_routes_fail_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/personal/crawlers/domains",
        "/api/personal/crawlers/list",
        "/api/personal/crawlers/uncrawled",
        "/api/v1/workspaces/ws-a/crawlers/status",
    ] {
        let request = if path.ends_with("/status") {
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ws-a/crawlers/status?url=https%3A%2F%2Fexample.com",
                ),
                ..request("GET", path)
            }
        } else {
            request("GET", path)
        };
        let response = handle_backend_request(&config, request, &outbound).await;

        assert_eq!(response.status, 500, "{path}");
        if path.ends_with("/status") {
            assert_eq!(
                response.body["message"], "Error fetching crawled URL",
                "{path}"
            );
        } else {
            assert_eq!(response.body["error"], "Internal Server Error", "{path}");
        }
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_get_lists_public_holidays_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026},
                {"id":"holiday-2","date":"2026-04-30","name":"Reunification Day","year":2026}
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/internal/holidays"),
            ..request("GET", "/api/v1/internal/holidays")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!([
            {"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026},
            {"id":"holiday-2","date":"2026-04-30","name":"Reunification Day","year":2026}
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=*&order=date.asc"
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
}

#[tokio::test]
async fn holidays_get_preserves_legacy_year_filter_parsing() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[]"#),
    ]);

    let filtered = handle_backend_request(
        &config,
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/internal/holidays?year=2026abc"),
            ..request("GET", "/api/v1/internal/holidays")
        },
        &outbound,
    )
    .await;
    let ignored_zero = handle_backend_request(
        &config,
        BackendRequest {
            url: Some("https://tuturuuu.localhost/api/v1/internal/holidays?year=0"),
            ..request("GET", "/api/v1/internal/holidays")
        },
        &outbound,
    )
    .await;

    assert_eq!(filtered.status, 200);
    assert_eq!(ignored_zero.status, 200);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert!(calls[0].url.contains("year=eq.2026"));
    assert!(!calls[1].url.contains("year=eq."));
}

#[tokio::test]
async fn holidays_get_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("PATCH", "/api/v1/internal/holidays"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, POST"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/internal/holidays"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching holidays");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_post_requires_authenticated_root_workspace_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_body(
            "POST",
            "/api/v1/internal/holidays",
            r#"{"date":"2026-01-01","name":"New Year"}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_post_validates_payload_after_membership_check() {
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
                "POST",
                "/api/v1/internal/holidays",
                r#"{"date":"2026/01/01","name":""}"#,
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
async fn holidays_post_rejects_root_workspace_guests() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("guest-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-guest"}"#),
        outbound_response(200, r#"{"type":"GUEST"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays",
                r#"{"date":"2026-01-01","name":"New Year"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn holidays_post_rejects_duplicate_dates() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("admin-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1"}"#),
        outbound_response(200, r#"{"type":"MEMBER"}"#),
        outbound_response(200, r#"{"id":"holiday-existing"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request_with_body(
                "POST",
                "/api/v1/internal/holidays",
                r#"{"date":"2026-01-01","name":"New Year"}"#,
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
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&date=eq.2026-01-01&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
}

#[tokio::test]
async fn holidays_post_creates_holiday_with_user_token_rls() {
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
        outbound_response(
            201,
            r#"{"id":"holiday-1","date":"2026-01-01","name":"New Year","year":2026}"#,
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
                "/api/v1/internal/holidays",
                r#"{"date":"2026-01-01","name":"New Year"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 201);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["id"], "holiday-1");
    assert_eq!(response.body["date"], "2026-01-01");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
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
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(calls[2].method, OutboundMethod::Get);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=id&date=eq.2026-01-01&limit=1"
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer admin-access-token")
    );
    assert_eq!(calls[3].method, OutboundMethod::Post);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/vietnamese_holidays?select=*"
    );
    assert_eq!(
        recorded_header(&calls[3], "Accept"),
        Some("application/vnd.pgrst.object+json")
    );
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
        Some("return=representation")
    );
    assert_eq!(
        recorded_header(&calls[3], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            calls[3].body.as_ref().expect("insert request body")
        )
        .expect("insert request json"),
        json!({
            "date": "2026-01-01",
            "name": "New Year",
        })
    );
}

#[tokio::test]
async fn holidays_bulk_requires_authenticated_root_workspace_member() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request_with_body(
            "POST",
            "/api/v1/internal/holidays/bulk",
            r#"{"holidays":[{"date":"2026-01-01","name":"New Year"}]}"#,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Admin access required");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn holidays_bulk_validates_payload_after_membership_check() {
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
                "POST",
                "/api/v1/internal/holidays/bulk",
                r#"{"holidays":[{"date":"2026/01/01","name":""}],"replaceExisting":"yes"}"#,
            )
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["message"], "Invalid input");
    assert!(response.body["errors"]["fieldErrors"]["holidays"].is_array());
    assert!(response.body["errors"]["fieldErrors"]["replaceExisting"].is_array());
    assert_eq!(outbound.calls().len(), 2);
}
