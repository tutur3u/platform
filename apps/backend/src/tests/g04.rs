use super::*;

#[tokio::test]
async fn aurora_health_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("GET", "/api/v1/aurora/health"), &outbound).await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("POST"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_metrics_get_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/v1/aurora/forecast",
        "/api/v1/aurora/ml-metrics",
        "/api/v1/aurora/statistical-metrics",
    ] {
        let response = handle_backend_request(&config, request("DELETE", path), &outbound).await;

        assert_eq!(response.status, 405, "{path}");
        assert_eq!(response.allow, Some("GET, POST"), "{path}");
        assert_eq!(response.body["error"], "method not allowed", "{path}");
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_forecast_get_fails_closed_with_legacy_message() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[]"#),
        outbound_response(500, r#"{"error":"failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/forecast"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching forecast data");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn aurora_metrics_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    for path in [
        "/api/v1/aurora/ml-metrics",
        "/api/v1/aurora/statistical-metrics",
    ] {
        let response = handle_backend_request(&config, request("GET", path), &outbound).await;

        assert_eq!(response.status, 500, "{path}");
        assert_eq!(response.body["error"], "Internal Server Error", "{path}");
    }
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_forecast_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/forecast"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching forecast data");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_domains_aggregates_sorted_unique_domains() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"[
                    {"url":"https://Example.com/docs"},
                    {"url":"not a url"},
                    {"url":"https://beta.example/path"}
                ]"#,
        ),
        outbound_response(
            200,
            r#"[
                    {"url":"https://alpha.example"},
                    {"url":"https://example.com/queued"},
                    {"url":null}
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/personal/crawlers/domains"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["cached"], false);
    assert_eq!(
        response.body["domains"],
        json!(["alpha.example", "beta.example", "example.com"])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/crawled_urls?select=url"
    );
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/crawled_url_next_urls?select=url&skipped=eq.false"
    );

    for call in calls {
        assert_eq!(recorded_header(&call, "Accept"), Some(APPLICATION_JSON));
        assert_eq!(
            recorded_header(&call, "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(
            recorded_header(&call, "apikey"),
            Some("test-service-role-secret")
        );
        assert_eq!(recorded_header(&call, "Range-Unit"), Some("items"));
        assert_eq!(recorded_header(&call, "Range"), Some("0-999"));
    }
}

#[tokio::test]
async fn crawler_uncrawled_filters_existing_urls_and_groups_results() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response_with_headers(
            200,
            r#"[{"url":"https://example.com/new"}]"#,
            vec![("content-range".to_owned(), "0-0/3".to_owned())],
        ),
        outbound_response(
            200,
            r#"[
                    {
                        "created_at":"2026-01-02T00:00:00Z",
                        "origin_id":"origin-1",
                        "origin_url":"https://seed.example",
                        "skipped":false,
                        "url":"https://example.com/already"
                    },
                    {
                        "created_at":"2026-01-03T00:00:00Z",
                        "origin_id":"origin-1",
                        "origin_url":"https://seed.example",
                        "skipped":false,
                        "url":"https://example.com/new"
                    }
                ]"#,
        ),
        outbound_response(200, r#"[{"url":"https://example.com/already/"}]"#),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/personal/crawlers/uncrawled?page=2&pageSize=2&domain=example.com&search=new",
                ),
                ..request("GET", "/api/personal/crawlers/uncrawled")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body["pagination"],
        json!({
            "page": 2,
            "pageSize": 2,
            "totalPages": 2,
            "totalItems": 3,
        })
    );
    assert_eq!(
        response.body["uncrawledUrls"],
        json!([
            {
                "created_at": "2026-01-03T00:00:00Z",
                "origin_id": "origin-1",
                "origin_url": "https://seed.example",
                "skipped": false,
                "url": "https://example.com/new",
            }
        ])
    );
    assert_eq!(
        response.body["groupedUrls"],
        json!({
            "origin-1": [
                {
                    "created_at": "2026-01-03T00:00:00Z",
                    "origin_id": "origin-1",
                    "origin_url": "https://seed.example",
                    "skipped": false,
                    "url": "https://example.com/new",
                }
            ]
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[0].url.contains("/rest/v1/crawled_url_next_urls?"));
    assert!(calls[0].url.contains("select=url"));
    assert!(calls[0].url.contains("skipped=eq.false"));
    assert!(calls[0].url.contains("url=ilike.%25example.com%25"));
    assert!(calls[0].url.contains("url=ilike.%25new%25"));
    assert_eq!(recorded_header(&calls[0], "Range"), Some("0-0"));
    assert_eq!(recorded_header(&calls[0], "Prefer"), Some("count=exact"));

    assert!(calls[1].url.contains("/rest/v1/crawled_url_next_urls?"));
    assert!(calls[1].url.contains("origin_url%3Aurl"));
    assert_eq!(recorded_header(&calls[1], "Range"), Some("2-3"));
    assert_eq!(recorded_header(&calls[1], "Prefer"), None);

    assert!(calls[2].url.contains("/rest/v1/crawled_urls?select=url"));
    assert!(calls[2].url.contains("url=in."));
    assert_eq!(recorded_header(&calls[2], "Range"), None);
}

#[tokio::test]
async fn crawler_status_requires_non_empty_url_query() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    for request_url in [
        None,
        Some("https://tuturuuu.localhost/api/v1/workspaces/ws-ignored/crawlers/status"),
        Some("https://tuturuuu.localhost/api/v1/workspaces/ws-ignored/crawlers/status?url="),
    ] {
        let response = handle_backend_request(
            &config,
            BackendRequest {
                url: request_url,
                ..request("GET", "/api/v1/workspaces/ws-ignored/crawlers/status")
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 400);
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert_eq!(
            response.body,
            json!({ "message": "Missing required parameter: url" })
        );
    }

    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_status_returns_null_payload_when_crawled_url_is_missing() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, "[]");

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/workspace-a/crawlers/status?url=https%3A%2F%2Fexample.com%2Fmissing",
                ),
                ..request("GET", "/api/v1/workspaces/workspace-a/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "crawledUrl": null,
            "relatedUrls": [],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        decoded_query_value(&calls[0].url, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "url").as_deref(),
        Some("eq.https://example.com/missing")
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
}

#[tokio::test]
async fn crawler_status_returns_raw_crawled_url_and_related_urls() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r##"[
                    {
                        "id": "crawl-1",
                        "url": "https://example.com/docs?x=1&y=2",
                        "markdown": "# Raw",
                        "html": "<main>Raw</main>",
                        "metadata": {"depth": 2}
                    }
                ]"##,
        ),
        outbound_response(
            200,
            r#"[
                    {
                        "id": "next-2",
                        "origin_id": "crawl-1",
                        "url": "https://example.com/b",
                        "created_at": "2026-01-03T00:00:00Z"
                    },
                    {
                        "id": "next-1",
                        "origin_id": "crawl-1",
                        "url": "https://example.com/a",
                        "created_at": "2026-01-02T00:00:00Z"
                    }
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ignored-workspace/crawlers/status?url=https%3A%2F%2Fexample.com%2Fdocs%3Fx%3D1%26y%3D2",
                ),
                ..request("GET", "/api/v1/workspaces/ignored-workspace/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "crawledUrl": {
                "id": "crawl-1",
                "url": "https://example.com/docs?x=1&y=2",
                "markdown": "# Raw",
                "html": "<main>Raw</main>",
                "metadata": {"depth": 2},
            },
            "relatedUrls": [
                {
                    "id": "next-2",
                    "origin_id": "crawl-1",
                    "url": "https://example.com/b",
                    "created_at": "2026-01-03T00:00:00Z",
                },
                {
                    "id": "next-1",
                    "origin_id": "crawl-1",
                    "url": "https://example.com/a",
                    "created_at": "2026-01-02T00:00:00Z",
                },
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/crawled_urls?")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "url").as_deref(),
        Some("eq.https://example.com/docs?x=1&y=2")
    );
    assert!(
        calls[1]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/crawled_url_next_urls?")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "select").as_deref(),
        Some("*")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "origin_id").as_deref(),
        Some("eq.crawl-1")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "order").as_deref(),
        Some("created_at.desc")
    );
}

#[tokio::test]
async fn crawler_status_maps_crawled_url_query_failure_to_legacy_message() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(500, r#"{"error":"failed"}"#);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ws-a/crawlers/status?url=https%3A%2F%2Fexample.com",
                ),
                ..request("GET", "/api/v1/workspaces/ws-a/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error fetching crawled URL" })
    );
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn crawler_status_maps_related_url_query_failure_to_legacy_message() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"id":"crawl-1","url":"https://example.com"}]"#),
        outbound_response(500, r#"{"error":"failed"}"#),
    ]);

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(
                    "https://tuturuuu.localhost/api/v1/workspaces/ws-a/crawlers/status?url=https%3A%2F%2Fexample.com",
                ),
                ..request("GET", "/api/v1/workspaces/ws-a/crawlers/status")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error fetching related URLs" })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn crawler_list_requires_tuturuuu_session_before_admin_read() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/personal/crawlers/list"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn crawler_list_rejects_non_tuturuuu_session_before_admin_read() {
    let config = backend_config_with_contact_data();
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
            ..request("GET", "/api/personal/crawlers/list")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 1);
}
