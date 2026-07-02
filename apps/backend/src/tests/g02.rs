use super::*;

#[tokio::test]
async fn hive_access_accepts_browser_supabase_cookie_and_missing_rows() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, "[]"),
        outbound_response(200, r#"[{"enabled":true,"allow_role_management":false}]"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("GET", "/api/v1/users/me/hive-access")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "hasAccess": false,
            "isAdmin": false,
            "isMember": false,
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        decoded_query_value(&calls[1].url, "user_id").as_deref(),
        Some("eq.browser-user-1")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "user_id").as_deref(),
        Some("eq.browser-user-1")
    );
}

#[tokio::test]
async fn hive_access_maps_table_failures_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_response(500, r#"{"message":"failed"}"#);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/users/me/hive-access", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Failed to resolve Hive access");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn hive_access_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/users/me/hive-access"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_ai_models_requires_hive_session_before_private_lookup() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("GET", "/api/v1/hive/ai/models"), &outbound).await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_ai_models_rejects_wrong_app_session_target_without_fallback() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "calendar",
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
            ..request_with_bearer("GET", "/api/v1/hive/ai/models", token)
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["error"], "Unauthorized");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn hive_ai_models_requires_member_or_admin_access_before_model_lookup() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"enabled":false}]"#),
        outbound_response(200, r#"[{"enabled":true,"allow_role_management":false}]"#),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/hive/ai/models", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Hive access required");
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn hive_ai_models_reads_private_models_with_default_filters() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"enabled":true}]"#),
        outbound_response(200, r#"[{"enabled":false,"allow_role_management":false}]"#),
        outbound_response(
            200,
            r#"[
                    {
                        "context_window":1048576,
                        "description":"Fast model",
                        "id":"google/gemini-2.5-flash",
                        "is_enabled":true,
                        "name":"",
                        "provider":null,
                        "tags":["fast","hive"],
                        "type":"language"
                    }
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/hive/ai/models", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "models": [
                {
                    "context": 1048576,
                    "description": "Fast model",
                    "disabled": false,
                    "label": "gemini-2.5-flash",
                    "provider": "google",
                    "tags": ["fast", "hive"],
                    "value": "google/gemini-2.5-flash",
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(
        calls[2]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/ai_gateway_models?")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "select").as_deref(),
        Some("context_window,description,id,is_enabled,name,provider,tags,type")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "order").as_deref(),
        Some("provider.asc,name.asc")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "type").as_deref(),
        Some("eq.language")
    );
    assert_eq!(
        decoded_query_value(&calls[2].url, "is_enabled").as_deref(),
        Some("eq.true")
    );
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
async fn hive_ai_models_accepts_browser_session_and_all_disabled_query() {
    let config = backend_config_with_contact_data();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"{"id":"browser-user-1","email":"member@example.com"}"#,
        ),
        outbound_response(200, r#"[{"enabled":false}]"#),
        outbound_response(200, r#"[{"enabled":true,"allow_role_management":true}]"#),
        outbound_response(
            200,
            r#"[
                    {
                        "context_window":null,
                        "description":null,
                        "id":"custom-model",
                        "is_enabled":false,
                        "name":"Custom Model",
                        "provider":"",
                        "tags":null,
                        "type":"image"
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
            url: Some("https://tuturuuu.localhost/api/v1/hive/ai/models?enabled=false&type=all"),
            ..request("GET", "/api/v1/hive/ai/models")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "models": [
                {
                    "disabled": true,
                    "label": "Custom Model",
                    "provider": "custom-model",
                    "value": "custom-model",
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(decoded_query_value(&calls[3].url, "type"), None);
    assert_eq!(decoded_query_value(&calls[3].url, "is_enabled"), None);
}

#[tokio::test]
async fn hive_ai_models_maps_private_lookup_failures_to_legacy_error() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "hive",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"enabled":true}]"#),
        outbound_response(200, r#"[{"enabled":false,"allow_role_management":false}]"#),
        outbound_response(500, r#"{"message":"failed"}"#),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", "/api/v1/hive/ai/models", token),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["error"], "Failed to list AI models");
    assert_eq!(outbound.calls().len(), 3);
}

#[tokio::test]
async fn hive_ai_models_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/hive/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_models_get_reads_private_models_with_default_language_filter() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {
                    "id":"openai/gpt-5-mini",
                    "provider":"openai",
                    "type":"language",
                    "is_enabled":true
                }
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!([
            {
                "id": "openai/gpt-5-mini",
                "provider": "openai",
                "type": "language",
                "is_enabled": true
            }
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(
        calls[0]
            .url
            .starts_with("https://project-ref.supabase.co/rest/v1/ai_gateway_models?")
    );
    let select = decoded_query_value(&calls[0].url, "select").unwrap();
    assert!(select.contains("cache_read_price_per_token"));
    assert!(select.contains("web_search_price"));
    assert_eq!(
        decoded_query_value(&calls[0].url, "order").as_deref(),
        Some("provider.asc,name.asc")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "type").as_deref(),
        Some("eq.language")
    );
    assert_eq!(decoded_query_value(&calls[0].url, "provider"), None);
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
    assert_eq!(recorded_header(&calls[0], "Range"), None);
    assert_eq!(recorded_header(&calls[0], "Prefer"), None);
}

#[tokio::test]
async fn ai_models_get_preserves_filters_search_ids_and_pagination() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response_with_headers(
        200,
        r#"[
                {
                    "id":"google/gemini-3.1-flash-lite",
                    "provider":"google",
                    "name":"Gemini Flash Lite"
                }
            ]"#,
        vec![("content-range".to_owned(), "25-49/123".to_owned())],
    )]);
    let ids = std::iter::once("model-0".to_owned())
        .chain((0..105).map(|index| format!("model-{index}")))
        .collect::<Vec<_>>()
        .join(",");

    let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some(leaked_test_str(format!(
                    "https://tuturuuu.localhost/api/v1/infrastructure/ai/models?format=paginated&page=2.9&limit=25.8&provider=google&enabled=false&type=all&q=ge,mini%25(pro)&tag=thinking&ids={ids}"
                ))),
                ..request("GET", "/api/v1/infrastructure/ai/models")
            },
            &outbound,
        )
        .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "data": [
                {
                    "id": "google/gemini-3.1-flash-lite",
                    "provider": "google",
                    "name": "Gemini Flash Lite"
                }
            ],
            "pagination": {
                "page": 2,
                "limit": 25,
                "total": 123,
            },
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        decoded_query_value(&calls[0].url, "provider").as_deref(),
        Some("eq.google")
    );
    assert_eq!(decoded_query_value(&calls[0].url, "type"), None);
    assert_eq!(
        decoded_query_value(&calls[0].url, "is_enabled").as_deref(),
        Some("eq.false")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "tags").as_deref(),
        Some("cs.{thinking}")
    );
    assert_eq!(
        decoded_query_value(&calls[0].url, "or").as_deref(),
        Some(
            "(id.ilike.%geminipro%,name.ilike.%geminipro%,provider.ilike.%geminipro%,description.ilike.%geminipro%)"
        )
    );
    let id_filter = decoded_query_value(&calls[0].url, "id").unwrap();
    assert!(id_filter.starts_with("in.("));
    assert!(id_filter.ends_with(')'));
    let filtered_ids = id_filter
        .trim_start_matches("in.(")
        .trim_end_matches(')')
        .split(',')
        .collect::<Vec<_>>();
    assert_eq!(filtered_ids.len(), 100);
    assert_eq!(filtered_ids[0], "model-0");
    assert_eq!(filtered_ids[1], "model-1");
    assert!(!filtered_ids.contains(&"model-100"));
    assert_eq!(recorded_header(&calls[0], "Range-Unit"), Some("items"));
    assert_eq!(recorded_header(&calls[0], "Range"), Some("25-49"));
    assert_eq!(recorded_header(&calls[0], "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn ai_models_get_rejects_unsupported_methods_without_outbound_call() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_models_get_fails_closed_when_contact_data_is_not_configured() {
    let config = backend_config_with_internal_token();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching AI Models");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn ai_models_get_fails_closed_when_supabase_rejects_request() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(500, r#"{"error":"failed"}"#);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/infrastructure/ai/models"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Error fetching AI Models");
    assert_eq!(outbound.calls().len(), 1);
}
