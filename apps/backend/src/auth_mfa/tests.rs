use super::*;
use crate::outbound::{OutboundError, OutboundFuture, OutboundResponse};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use std::{cell::RefCell, collections::VecDeque};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct RecordedOutboundRequest {
    pub(super) body: Option<String>,
    pub(super) headers: Vec<(String, String)>,
    pub(super) method: OutboundMethod,
    pub(super) url: String,
}

enum RecordingOutboundResult {
    Error(OutboundError),
    Response(OutboundResponse),
}

pub(super) struct RecordingOutboundClient {
    calls: RefCell<Vec<RecordedOutboundRequest>>,
    responses: RefCell<VecDeque<RecordingOutboundResult>>,
}

impl RecordingOutboundClient {
    pub(super) fn with_response(status: u16, body_text: impl Into<String>) -> Self {
        Self::with_results(vec![RecordingOutboundResult::Response(outbound_response(
            status, body_text,
        ))])
    }

    pub(super) fn with_error(error: OutboundError) -> Self {
        Self::with_results(vec![RecordingOutboundResult::Error(error)])
    }

    pub(super) fn with_responses(responses: Vec<OutboundResponse>) -> Self {
        Self::with_results(
            responses
                .into_iter()
                .map(RecordingOutboundResult::Response)
                .collect(),
        )
    }

    fn with_results(responses: Vec<RecordingOutboundResult>) -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            responses: RefCell::new(VecDeque::from(responses)),
        }
    }

    pub(super) fn calls(&self) -> Vec<RecordedOutboundRequest> {
        self.calls.borrow().clone()
    }
}

impl OutboundHttpClient for RecordingOutboundClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        self.calls.borrow_mut().push(RecordedOutboundRequest {
            body: request.body.map(str::to_owned),
            headers: request
                .headers
                .iter()
                .map(|header| (header.name.to_owned(), header.value.to_owned()))
                .collect(),
            method: request.method,
            url: request.url.to_owned(),
        });
        let result = self.responses.borrow_mut().pop_front().unwrap_or_else(|| {
            RecordingOutboundResult::Response(OutboundResponse {
                body_text: r#"{"id":"user-123"}"#.to_owned(),
                headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
                status: 200,
            })
        });

        Box::pin(async move {
            match result {
                RecordingOutboundResult::Error(error) => Err(error),
                RecordingOutboundResult::Response(response) => Ok(response),
            }
        })
    }
}

pub(super) fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
        status,
    }
}

pub(super) fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.contact_data = contact::ContactDataConfig::new(
        "https://project-ref.supabase.co/",
        "test-service-role-secret",
    );
    config
}

pub(super) fn request(method: &'static str) -> BackendRequest<'static> {
    request_for(method, AUTH_MFA_ASSURANCE_LEVEL_PATH, None)
}

pub(super) fn request_for(
    method: &'static str,
    path: &'static str,
    body_text: Option<&'static str>,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text,
        cookie: None,
        if_none_match: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: None,
    }
}

pub(super) fn request_with_bearer_token(access_token: &str) -> BackendRequest<'_> {
    request_with_bearer_token_for("GET", AUTH_MFA_ASSURANCE_LEVEL_PATH, access_token, None)
}

pub(super) fn request_with_bearer_token_for<'a>(
    method: &'static str,
    path: &'static str,
    access_token: &'a str,
    body_text: Option<&'a str>,
) -> BackendRequest<'a> {
    BackendRequest {
        authorization: Some(access_token),
        body_text,
        cookie: None,
        if_none_match: None,
        method,
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: None,
    }
}

pub(super) fn jwt_with_payload(payload: Value) -> String {
    let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"none","typ":"JWT"}"#);
    let payload = URL_SAFE_NO_PAD.encode(payload.to_string());

    format!("{header}.{payload}.signature")
}

pub(super) fn bearer_jwt(payload: Value) -> String {
    format!("Bearer {}", jwt_with_payload(payload))
}

pub(super) fn verified_factor_user() -> Value {
    json!({
        "id": "user-123",
        "factors": [
            {
                "factor_type": "totp",
                "id": "factor-1",
                "status": "verified",
            },
        ],
    })
}

pub(super) fn multi_factor_user() -> Value {
    json!({
        "id": "user-123",
        "factors": [
            {
                "created_at": "2026-06-01T00:00:00Z",
                "factor_type": "totp",
                "friendly_name": "Authenticator",
                "id": "totp-verified",
                "status": "verified",
                "updated_at": "2026-06-01T00:00:00Z",
            },
            {
                "created_at": "2026-06-02T00:00:00Z",
                "factor_type": "totp",
                "id": "totp-unverified",
                "status": "unverified",
                "updated_at": "2026-06-02T00:00:00Z",
            },
            {
                "created_at": "2026-06-03T00:00:00Z",
                "factor_type": "phone",
                "id": "phone-verified",
                "status": "verified",
                "updated_at": "2026-06-03T00:00:00Z",
            },
            {
                "created_at": "2026-06-04T00:00:00Z",
                "factor_type": "webauthn",
                "id": "webauthn-verified",
                "status": "verified",
                "updated_at": "2026-06-04T00:00:00Z",
            },
        ],
    })
}

pub(super) fn recorded_header<'a>(
    request: &'a RecordedOutboundRequest,
    name: &str,
) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
}

pub(super) fn assert_no_store_json(response: &BackendResponse) {
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );
    assert!(
        response
            .headers
            .iter()
            .any(|(name, value)| *name == "cdn-cache-control" && value == "no-store")
    );
}

#[tokio::test]
async fn auth_mfa_requires_authenticated_supabase_session() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response = crate::handle_backend_request(&config, request("GET"), &outbound).await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 0);
}

#[tokio::test]
async fn auth_mfa_derives_aal_json_from_jwt_and_verified_user_factors() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({
        "aal": "aal1",
        "amr": [
            {
                "method": "password",
                "timestamp": 1710000000,
            },
        ],
        "sub": "user-123",
    }));
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response =
        crate::handle_backend_request(&config, request_with_bearer_token(&access_token), &outbound)
            .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "currentLevel": "aal1",
            "nextLevel": "aal2",
            "currentAuthenticationMethods": [
                {
                    "method": "password",
                    "timestamp": 1710000000,
                },
            ],
        })
    );
    assert_no_store_json(&response);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some(access_token.as_str())
    );
    assert_eq!(
        recorded_header(&calls[0], "apikey"),
        Some("test-service-role-secret")
    );
}

#[tokio::test]
async fn auth_mfa_keeps_next_level_equal_to_current_level_without_verified_factors() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({
        "aal": "aal1",
        "amr": ["password"],
    }));
    let user_without_verified_factors = json!({
        "id": "user-123",
        "factors": [
            {
                "factor_type": "totp",
                "id": "factor-1",
                "status": "unverified",
            },
        ],
    });
    let outbound =
        RecordingOutboundClient::with_response(200, user_without_verified_factors.to_string());

    let response =
        crate::handle_backend_request(&config, request_with_bearer_token(&access_token), &outbound)
            .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "currentLevel": "aal1",
            "nextLevel": "aal1",
            "currentAuthenticationMethods": ["password"],
        })
    );
    assert_no_store_json(&response);
}

#[tokio::test]
async fn auth_mfa_rejects_failed_supabase_user_revalidation() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_response(401, r#"{"message":"JWT expired"}"#);

    let response =
        crate::handle_backend_request(&config, request_with_bearer_token(&access_token), &outbound)
            .await;

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn auth_mfa_returns_500_when_supabase_user_transport_fails() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound =
        RecordingOutboundClient::with_error(OutboundError::Transport("network down".to_owned()));

    let response =
        crate::handle_backend_request(&config, request_with_bearer_token(&access_token), &outbound)
            .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body, json!({ "error": "Internal server error" }));
    assert_no_store_json(&response);
}

#[tokio::test]
async fn auth_mfa_returns_500_when_supabase_user_json_parse_fails() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_response(200, "not-json");

    let response =
        crate::handle_backend_request(&config, request_with_bearer_token(&access_token), &outbound)
            .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body, json!({ "error": "Internal server error" }));
    assert_no_store_json(&response);
}

#[tokio::test]
async fn auth_mfa_returns_500_when_jwt_payload_parse_fails() {
    let config = backend_config_with_contact_data();
    let outbound = RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token("Bearer not-a-valid-jwt"),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 500);
    assert_eq!(response.body, json!({ "error": "Internal server error" }));
    assert_no_store_json(&response);
    assert_eq!(outbound.calls().len(), 1);
}

#[tokio::test]
async fn auth_mfa_lists_totp_factors_from_revalidated_supabase_user() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_response(200, multi_factor_user().to_string());

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token_for("GET", AUTH_MFA_TOTP_FACTORS_PATH, &access_token, None),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "all": multi_factor_user().get("factors").unwrap(),
            "phone": [
                {
                    "created_at": "2026-06-03T00:00:00Z",
                    "factor_type": "phone",
                    "id": "phone-verified",
                    "status": "verified",
                    "updated_at": "2026-06-03T00:00:00Z",
                },
            ],
            "totp": [
                {
                    "created_at": "2026-06-01T00:00:00Z",
                    "factor_type": "totp",
                    "friendly_name": "Authenticator",
                    "id": "totp-verified",
                    "status": "verified",
                    "updated_at": "2026-06-01T00:00:00Z",
                },
            ],
            "webauthn": [
                {
                    "created_at": "2026-06-04T00:00:00Z",
                    "factor_type": "webauthn",
                    "id": "webauthn-verified",
                    "status": "verified",
                    "updated_at": "2026-06-04T00:00:00Z",
                },
            ],
        })
    );
    assert_no_store_json(&response);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some(access_token.as_str())
    );
}

#[tokio::test]
async fn auth_mfa_enrolls_totp_factor_with_supabase_auth() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal1" }));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, verified_factor_user().to_string()),
        outbound_response(
            200,
            json!({
                "id": "factor-123",
                "type": "totp",
                "friendly_name": "Authenticator",
                "totp": {
                    "qr_code": "<svg></svg>",
                    "secret": "SECRET",
                    "uri": "otpauth://totp/Tuturuuu",
                },
            })
            .to_string(),
        ),
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

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "id": "factor-123",
            "type": "totp",
            "friendly_name": "Authenticator",
            "totp": {
                "qr_code": "data:image/svg+xml;utf-8,<svg></svg>",
                "secret": "SECRET",
                "uri": "otpauth://totp/Tuturuuu",
            },
        })
    );
    assert_no_store_json(&response);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Post);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/auth/v1/factors"
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some(access_token.as_str())
    );
    assert_eq!(
        recorded_header(&calls[1], "apikey"),
        Some("test-service-role-secret")
    );
    assert_eq!(
        recorded_header(&calls[1], "Content-Type"),
        Some(JSON_UTF8_CONTENT_TYPE)
    );
    assert_eq!(
        recorded_header(&calls[1], "X-Supabase-Api-Version"),
        Some(SUPABASE_AUTH_API_VERSION)
    );
    assert_eq!(
        serde_json::from_str::<Value>(calls[1].body.as_deref().unwrap()).unwrap(),
        json!({
            "factor_type": "totp",
            "friendly_name": "Authenticator",
        })
    );
}

#[tokio::test]
async fn auth_mfa_unenrolls_totp_factor_with_legacy_success_wrapper() {
    let config = backend_config_with_contact_data();
    let access_token = bearer_jwt(json!({ "aal": "aal2" }));
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, verified_factor_user().to_string()),
        outbound_response(200, r#"{"id":"factor-123"}"#),
    ]);

    let response = crate::handle_backend_request(
        &config,
        request_with_bearer_token_for(
            "DELETE",
            "/api/auth/mfa/totp/factors/factor-123",
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
            "message": "Factor unenrolled successfully",
            "data": {
                "id": "factor-123",
            },
        })
    );
    assert_no_store_json(&response);

    let calls = outbound.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[1].method, OutboundMethod::Delete);
    assert_eq!(
        calls[1].url,
        "https://project-ref.supabase.co/auth/v1/factors/factor-123"
    );
    assert_eq!(calls[1].body, None);
    assert_eq!(
        recorded_header(&calls[1], "Content-Type"),
        Some(JSON_UTF8_CONTENT_TYPE)
    );
}
