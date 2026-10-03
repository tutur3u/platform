use super::*;

const PATH: &str = "/api/v1/exchange-rates";
fn rates() -> RecordingOutboundClient {
    RecordingOutboundClient::with_responses(vec![
        outbound_response(200, "[]"),
        outbound_response(200, r#"[{"date":"2026-10-03"}]"#),
        outbound_response(
            200,
            r#"[{"base_currency":"USD","target_currency":"VND","rate":25000,"date":"2026-10-03"}]"#,
        ),
    ])
}
#[tokio::test]
async fn exchange_rates_accepts_verified_finance_cookie_and_bearer_without_supabase_login() {
    for cookie in [false, true] {
        let config = backend_config_with_contact_data();
        let token = app_session_token(&app_session_claims(
            "finance",
            vec![APP_SESSION_SCOPE],
            4_102_444_800,
        ));
        let header = format!("{APP_SESSION_COOKIE_NAME}={token}");
        let request = if cookie {
            BackendRequest {
                cookie: Some(&header),
                ..request("GET", PATH)
            }
        } else {
            request_with_bearer("GET", PATH, token)
        };
        let outbound = rates();
        let response = handle_backend_request(&config, request, &outbound).await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["date"], "2026-10-03");
        assert_eq!(response.body["data"][0]["target_currency"], "VND");
        let calls = outbound.calls();
        assert_eq!(calls.len(), 3);
        assert!(calls[0].url.contains("/rest/v1/user_suspensions?"));
        assert!(
            calls[1..]
                .iter()
                .all(|call| call.url.contains("/rest/v1/currency_exchange_rates?"))
        );
        assert!(
            calls
                .iter()
                .all(|call| recorded_header(call, "Authorization")
                    == Some("Bearer test-service-role-secret"))
        );
    }
}
#[tokio::test]
async fn exchange_rates_rejects_invalid_target_scope_expiry_and_signature_before_database_access() {
    for token in [
        app_session_token(&app_session_claims(
            "unknown-app",
            vec![APP_SESSION_SCOPE],
            4_102_444_800,
        )),
        app_session_token(&app_session_claims("finance", vec![], 4_102_444_800)),
        app_session_token(&app_session_claims("finance", vec![APP_SESSION_SCOPE], 1)),
        {
            let mut token = app_session_token(&app_session_claims(
                "finance",
                vec![APP_SESSION_SCOPE],
                4_102_444_800,
            ));
            let start = token.rfind('.').unwrap() + 1;
            let replacement = if token.as_bytes()[start] == b'A' {
                "B"
            } else {
                "A"
            };
            token.replace_range(start..start + 1, replacement);
            token
        },
        "ttr_app_invalid".to_owned(),
    ] {
        let config = backend_config_with_contact_data();
        let outbound = rates();
        let response =
            handle_backend_request(&config, request_with_bearer("GET", PATH, token), &outbound)
                .await;
        assert_eq!(response.status, 401);
        assert!(outbound.calls().is_empty());
    }
}
#[tokio::test]
async fn exchange_rates_rejects_anonymous_and_preserves_caller_jwt_for_supabase_sessions() {
    let config = backend_config_with_contact_data();
    let anonymous = rates();
    assert_eq!(
        handle_backend_request(&config, request("GET", PATH), &anonymous)
            .await
            .status,
        401
    );
    assert!(anonymous.calls().is_empty());
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"jwt-user"}"#),
        outbound_response(200, r#"[{"date":"2026-10-03"}]"#),
        outbound_response(200, "[]"),
    ]);
    let response = handle_backend_request(
        &config,
        request_with_bearer("GET", PATH, "caller-jwt".to_owned()),
        &outbound,
    )
    .await;
    assert_eq!(response.status, 200);
    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[0].url.ends_with("/auth/v1/user"));
    assert!(
        calls
            .iter()
            .all(|call| recorded_header(call, "Authorization") == Some("Bearer caller-jwt"))
    );
}

#[tokio::test]
async fn exchange_rates_blocks_suspended_app_sessions_before_currency_reads() {
    let config = backend_config_with_contact_data();
    let token = app_session_token(&app_session_claims(
        "finance",
        vec![APP_SESSION_SCOPE],
        4_102_444_800,
    ));
    let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
        200,
        r#"[{"id":"synthetic-suspension","reason":"Account suspended"}]"#,
    )]);
    let response =
        handle_backend_request(&config, request_with_bearer("GET", PATH, token), &outbound).await;
    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Forbidden");
    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert!(calls[0].url.contains("/rest/v1/user_suspensions?"));
    assert!(calls[0].url.contains("lifted_at=is.null"));
    assert!(calls[0].url.contains("expires_at"));
}
