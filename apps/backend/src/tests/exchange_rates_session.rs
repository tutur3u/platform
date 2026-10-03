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
        outbound_response(200, "[]"),
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
    assert_eq!(calls.len(), 4);
    assert!(calls[0].url.ends_with("/auth/v1/user"));
    assert_suspension_query(&calls[1], "jwt-user");
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert!(
        [&calls[0], &calls[2], &calls[3]]
            .iter()
            .all(|call| recorded_header(call, "Authorization") == Some("Bearer caller-jwt"))
    );
}

// PostgREST performs expiry filtering; asserting the actual predicate keeps
// an expired suspension from becoming an active denial if the query regresses.
fn assert_suspension_query(call: &RecordedOutboundRequest, user_id: &str) {
    assert!(call.url.contains("/rest/v1/user_suspensions?"));
    assert!(call.url.contains(&format!("user_id=eq.{user_id}")));
    assert!(call.url.contains("lifted_at=is.null"));
    assert!(call.url.contains("expires_at.is.null"));
    assert!(call.url.contains("expires_at.gt.now"));
}

fn verified_request(app_session: bool) -> BackendRequest<'static> {
    let token = if app_session {
        app_session_token(&app_session_claims(
            "finance",
            vec![APP_SESSION_SCOPE],
            4_102_444_800,
        ))
    } else {
        "caller-jwt".to_owned()
    };
    request_with_bearer("GET", PATH, token)
}

fn policy_responses(app_session: bool, policy: OutboundResponse) -> Vec<OutboundResponse> {
    let mut responses = Vec::new();
    if !app_session {
        responses.push(outbound_response(200, r#"{"id":"jwt-user"}"#));
    }
    responses.push(policy);
    responses
}

#[tokio::test]
async fn exchange_rates_blocks_active_suspensions_for_both_verified_auth_modes() {
    for app_session in [false, true] {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(policy_responses(
            app_session,
            outbound_response(
                200,
                r#"[{"id":"synthetic-suspension","reason":"Account suspended","expires_at":null}]"#,
            ),
        ));
        let response =
            handle_backend_request(&config, verified_request(app_session), &outbound).await;
        assert_eq!(response.status, 403);
        assert_eq!(response.body["error"], "Forbidden");
        let calls = outbound.calls();
        assert_eq!(calls.len(), if app_session { 1 } else { 2 });
        let policy = calls.last().unwrap();
        assert_suspension_query(
            policy,
            if app_session {
                "app-session-user-1"
            } else {
                "jwt-user"
            },
        );
        assert_eq!(
            recorded_header(policy, "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert!(
            !calls
                .iter()
                .any(|call| call.url.contains("currency_exchange_rates"))
        );
    }
}

#[tokio::test]
async fn exchange_rates_allows_expired_suspensions_and_preserves_policy_error_fail_open() {
    for app_session in [false, true] {
        // An expired/lifted suspension is absent from the filtered query.
        for (status, body) in [
            (200, "[]"),
            (503, "policy unavailable"),
            (200, "invalid json"),
        ] {
            let config = backend_config_with_contact_data();
            let mut responses = policy_responses(app_session, outbound_response(status, body));
            responses.push(outbound_response(200, r#"[{"date":"2026-10-03"}]"#));
            responses.push(outbound_response(200, "[]"));
            let outbound = RecordingOutboundClient::with_responses(responses);
            let response =
                handle_backend_request(&config, verified_request(app_session), &outbound).await;
            assert_eq!(response.status, 200);
            let calls = outbound.calls();
            let policy_index = if app_session { 0 } else { 1 };
            assert_suspension_query(
                &calls[policy_index],
                if app_session {
                    "app-session-user-1"
                } else {
                    "jwt-user"
                },
            );
            assert!(calls[policy_index + 1..].iter().all(|call| {
                call.url.contains("/rest/v1/currency_exchange_rates?")
                    && recorded_header(call, "Authorization")
                        == Some(if app_session {
                            "Bearer test-service-role-secret"
                        } else {
                            "Bearer caller-jwt"
                        })
            }));
        }
    }
}
