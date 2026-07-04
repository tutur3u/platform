use super::tests::{
    RecordingOutboundClient, assert_no_store_json, backend_config_with_contact_data, bearer_jwt,
    multi_factor_user, outbound_response, request, request_for, request_with_bearer_token_for,
    verified_factor_user,
};
use super::*;

#[tokio::test]
async fn auth_mfa_gets_verified_totp_factor_by_id() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_response(200, multi_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token_for(
            "GET",
            "/api/auth/mfa/totp/factors/totp-verified",
            &access_token,
            None,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "created_at": "2026-06-01T00:00:00Z",
            "factor_type": "totp",
            "friendly_name": "Authenticator",
            "id": "totp-verified",
            "status": "verified",
            "updated_at": "2026-06-01T00:00:00Z",
        })
    );
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn auth_mfa_returns_404_for_missing_or_unverified_totp_factor() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_response(200, multi_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token_for(
            "GET",
            "/api/auth/mfa/totp/factors/totp-unverified",
            &access_token,
            None,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 404);
    assert_eq!(response.body, json!({ "error": "Factor not found" }));
    assert_no_store_json(&response);
}

#[tokio::test]
async fn auth_mfa_factors_require_authenticated_supabase_session() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_for("GET", AUTH_MFA_TOTP_FACTORS_PATH, None),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn auth_mfa_maps_supabase_auth_api_errors_to_400() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, verified_factor_user().to_string()),
        outbound_response(422, r#"{"msg":"factor already exists"}"#),
    ]);

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token_for(
            "POST",
            AUTH_MFA_TOTP_FACTORS_PATH,
            &access_token,
            Some(r#"{"friendlyName":"Authenticator"}"#),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body, json!({ "error": "factor already exists" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn auth_mfa_returns_500_when_supabase_factor_json_parse_fails() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, verified_factor_user().to_string()),
        outbound_response(200, "not-json"),
    ]);

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token_for(
            "POST",
            AUTH_MFA_TOTP_FACTORS_PATH,
            &access_token,
            Some(r#"{"friendlyName":"Authenticator"}"#),
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body, json!({ "error": "Internal server error" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn auth_mfa_rejects_missing_factor_id_before_unenroll() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal2" }));
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token_for(
            "DELETE",
            AUTH_MFA_TOTP_FACTOR_PATH_PREFIX,
            &access_token,
            None,
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body, json!({ "error": "Missing factorId" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn auth_mfa_rejects_unsupported_methods_with_allow_get() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response = crate::handle_backend_request(&config, request("POST"), &outbound).await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body, json!({ "error": "method not allowed" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn auth_mfa_rejects_unsupported_factor_collection_methods() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_for("PATCH", AUTH_MFA_TOTP_FACTORS_PATH, None),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, POST"));
    assert_eq!(response.body, json!({ "error": "method not allowed" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn auth_mfa_rejects_unsupported_factor_member_methods() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_for("POST", "/api/auth/mfa/totp/factors/factor-123", None),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, DELETE"));
    assert_eq!(response.body, json!({ "error": "method not allowed" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 0);
}
