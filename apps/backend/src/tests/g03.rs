use super::*;

#[tokio::test]
async fn aurora_ml_metrics_get_reads_public_rows_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"metric-1","model":"lstm","rmse":0.42,"weighted_score":0.91}
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/ml-metrics"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!([
            {"id":"metric-1","model":"lstm","rmse":0.42,"weighted_score":0.91}
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_metrics?select=*"
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
async fn aurora_statistical_metrics_get_reads_public_rows_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(
        200,
        r#"[
                {"id":"metric-2","model":"arima","no_scaling":true,"weighted_score":0.88}
            ]"#,
    );

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/statistical-metrics"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!([
            {"id":"metric-2","model":"arima","no_scaling":true,"weighted_score":0.88}
        ])
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_metrics?select=*"
    );
}

#[tokio::test]
async fn aurora_forecast_get_reads_public_rows_from_supabase() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(
            200,
            r#"[
                    {
                        "id":"stat-1",
                        "date":"2026-01-02T08:30:00Z",
                        "auto_arima":1.25,
                        "auto_arima_lo_90":1.0,
                        "auto_arima_hi_90":1.5
                    }
                ]"#,
        ),
        outbound_response(
            200,
            r#"[
                    {
                        "id":"ml-1",
                        "date":"2026-01-03",
                        "xgboost":3.15,
                        "catboost":2.71
                    }
                ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &config,
        request("GET", "/api/v1/aurora/forecast"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body,
        json!({
            "statistical_forecast": [
                {
                    "id": "stat-1",
                    "date": "2026-01-02",
                    "auto_arima": 1.25,
                    "auto_arima_lo_90": 1.0,
                    "auto_arima_hi_90": 1.5
                }
            ],
            "ml_forecast": [
                {
                    "id": "ml-1",
                    "date": "2026-01-03",
                    "xgboost": 3.15,
                    "catboost": 2.71
                }
            ],
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(
        calls[0].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_forecast?select=*&order=date.asc"
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_forecast?select=*&order=date.asc"
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
    }
}

#[tokio::test]
async fn aurora_ml_metrics_post_ingests_external_metrics() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"{
                    "lstm": {
                        "RMSE": 0.42,
                        "Directional_Accuracy": 0.75,
                        "Turning_Point_Accuracy": 0.5,
                        "Weighted_Score": 0.91
                    }
                }"#,
        ),
        outbound_response(201, ""),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Success");
    assert_eq!(response.body["data"]["lstm"]["Weighted_Score"], 0.91);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(calls[1].url, "https://aurora.example.test/ml_metrics");
    assert_eq!(calls[2].method, OutboundMethod::Post);
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_metrics"
    );
    assert_eq!(
        recorded_header(&calls[2], "Content-Type"),
        Some(APPLICATION_JSON)
    );
    assert_eq!(recorded_header(&calls[2], "Prefer"), Some("return=minimal"));
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        recorded_header(&calls[2], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[2].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "model": "lstm",
                "rmse": 0.42,
                "directional_accuracy": 0.75,
                "turning_point_accuracy": 0.5,
                "weighted_score": 0.91
            }
        ])
    );
}

#[tokio::test]
async fn aurora_statistical_metrics_post_ingests_scaling_buckets() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"{
                    "no_scaling": [
                        {
                            "Model": "AutoARIMA",
                            "RMSE": 1.2,
                            "Weighted_Score": 0.8
                        }
                    ],
                    "with_scaling": [
                        {
                            "Model": "AutoETS",
                            "RMSE": 0.9,
                            "Directional_Accuracy": 0.7,
                            "Turning_Point_Accuracy": 0.6,
                            "Weighted_Score": 0.95
                        }
                    ]
                }"#,
        ),
        outbound_response(201, ""),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/statistical-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert_eq!(
        calls[1].url,
        "https://aurora.example.test/statistical_metrics"
    );
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_metrics"
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[2].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "model": "AutoARIMA",
                "rmse": 1.2,
                "weighted_score": 0.8,
                "no_scaling": true
            },
            {
                "ws_id": "aurora-workspace",
                "model": "AutoETS",
                "rmse": 0.9,
                "directional_accuracy": 0.7,
                "turning_point_accuracy": 0.6,
                "weighted_score": 0.95,
                "no_scaling": false
            }
        ])
    );
}

#[tokio::test]
async fn aurora_forecast_post_ingests_statistical_and_ml_forecasts() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(
            200,
            r#"{
                    "statistical_forecast": [
                        {
                            "AutoARIMA": 1.1,
                            "AutoARIMA-lo-90": 0.9,
                            "AutoARIMA-hi-90": 1.3,
                            "AutoETS": 1.0,
                            "AutoETS-lo-90": 0.8,
                            "AutoETS-hi-90": 1.2,
                            "AutoTheta": 1.4,
                            "AutoTheta-lo-90": 1.1,
                            "AutoTheta-hi-90": 1.7,
                            "CES": 1.5,
                            "CES-lo-90": 1.2,
                            "CES-hi-90": 1.8,
                            "date": "2026-01-02"
                        }
                    ],
                    "ml_forecast": [
                        {
                            "elasticnet": 2.1,
                            "lightgbm": 2.2,
                            "xgboost": 2.3,
                            "catboost": 2.4,
                            "date": "2026-01-03"
                        }
                    ]
                }"#,
        ),
        outbound_response(201, ""),
        outbound_response(201, ""),
    ]);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/forecast",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body["message"], "Success");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 4);
    assert_eq!(calls[1].url, "https://aurora.example.test/forecast");
    assert_eq!(
        calls[2].url,
        "https://project-ref.supabase.co/rest/v1/aurora_statistical_forecast"
    );
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/rest/v1/aurora_ml_forecast"
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[2].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "auto_arima": 1.1,
                "auto_arima_lo_90": 0.9,
                "auto_arima_hi_90": 1.3,
                "auto_ets": 1.0,
                "auto_ets_lo_90": 0.8,
                "auto_ets_hi_90": 1.2,
                "auto_theta": 1.4,
                "auto_theta_lo_90": 1.1,
                "auto_theta_hi_90": 1.7,
                "ces": 1.5,
                "ces_lo_90": 1.2,
                "ces_hi_90": 1.8,
                "date": "2026-01-02"
            }
        ])
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[3].body.as_deref().unwrap()).unwrap(),
        json!([
            {
                "ws_id": "aurora-workspace",
                "elasticnet": 2.1,
                "lightgbm": 2.2,
                "xgboost": 2.3,
                "catboost": 2.4,
                "date": "2026-01-03"
            }
        ])
    );
}

#[tokio::test]
async fn aurora_ingest_post_preserves_legacy_config_and_auth_errors() {
    let mut missing_url = backend_config_with_aurora_health();
    missing_url.aurora_external_url.clear();
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &missing_url,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body["message"], "Aurora API URL not configured");
    assert_eq!(outbound.calls().len(), 0);

    let mut missing_workspace = backend_config_with_aurora_health();
    missing_workspace.aurora_external_workspace_id.clear();
    let response = handle_backend_request(
        &missing_workspace,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body["message"],
        "Aurora workspace ID not configured"
    );
    assert_eq!(outbound.calls().len(), 0);

    let config = backend_config_with_aurora_health();
    let response = handle_backend_request(
        &config,
        request("POST", "/api/v1/aurora/ml-metrics"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body["message"], "Not authenticated");
    assert_eq!(outbound.calls().len(), 0);

    let outbound =
        RecordingOutboundClient::with_response(200, r#"{"id":"user-1","email":"ada@example.com"}"#);
    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/ml-metrics",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.body["message"], "Unauthorized email domain");
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn aurora_health_post_requires_authenticated_supabase_user() {
    let config = backend_config_with_aurora_health();
    let outbound = RecordingOutboundClient::default();

    let response =
        handle_backend_request(&config, request("POST", "/api/v1/aurora/health"), &outbound).await;

    assert_eq!(response.status, 401);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Not authenticated");
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn aurora_health_post_rejects_non_tuturuuu_email_domain() {
    let config = backend_config_with_aurora_health();
    let outbound =
        RecordingOutboundClient::with_response(200, r#"{"id":"user-1","email":"ada@example.com"}"#);

    let response = handle_backend_request(
        &config,
        request_with_bearer(
            "POST",
            "/api/v1/aurora/health",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Unauthorized email domain");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn aurora_health_post_maps_upstream_failure_to_legacy_error() {
    let config = backend_config_with_aurora_health();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(503, r#"{"ok":false}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("POST", "/api/v1/aurora/health")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body["message"], "Error fetching health");

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(calls[1].url, "https://aurora.example.test/health");
    assert_eq!(calls[1].headers, Vec::<(String, String)>::new());
}

#[tokio::test]
async fn aurora_health_post_returns_legacy_success_when_upstream_is_ok() {
    let config = backend_config_with_aurora_health();
    let cookie_value = supabase_auth_cookie_value("browser-access-token");
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"ada@tuturuuu.com"}"#),
        outbound_response(200, r#"{"ok":true}"#),
    ]);

    let response = handle_backend_request(
        &config,
        BackendRequest {
            cookie: Some(leaked_test_str(format!(
                "sb-project-ref-auth-token={cookie_value}"
            ))),
            ..request("POST", "/api/v1/aurora/health")
        },
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(response.body, json!({ "message": "Success" }));

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert_eq!(calls[1].method, OutboundMethod::Get);
    assert_eq!(calls[1].url, "https://aurora.example.test/health");
}
