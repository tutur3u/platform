use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const AUTH_MFA_ASSURANCE_LEVEL_PATH: &str = "/api/auth/mfa/totp/assurance-level";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const SUPABASE_AUTH_USER_PATH: &str = "user";
const VERIFIED_FACTOR_STATUS: &str = "verified";
const AAL2: &str = "aal2";

pub(crate) async fn handle_auth_mfa_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AUTH_MFA_ASSURANCE_LEVEL_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => auth_mfa_assurance_level_response(&config.contact_data, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn auth_mfa_assurance_level_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    let user = match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(user)) => user,
        Ok(None) => return unauthorized_response(),
        Err(()) => return internal_server_error_response(),
    };

    let Ok(assurance_level) = authenticator_assurance_level(&access_token, &user) else {
        return internal_server_error_response();
    };

    no_store_response(json_response(200, assurance_level))
}

async fn fetch_supabase_auth_user_value(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<Value>, ()> {
    let user_url = contact_data.auth_url(SUPABASE_AUTH_USER_PATH).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &user_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    response.json::<Value>().map(Some).map_err(|_| ())
}

fn authenticator_assurance_level(access_token: &str, user: &Value) -> Result<Value, ()> {
    let payload = jwt_payload(access_token)?;
    let current_level = payload.get("aal").cloned().unwrap_or(Value::Null);
    let next_level = if user_has_verified_factor(user) {
        json!(AAL2)
    } else {
        current_level.clone()
    };
    let current_authentication_methods = payload
        .get("amr")
        .filter(|methods| !methods.is_null())
        .cloned()
        .unwrap_or_else(|| json!([]));

    Ok(json!({
        "currentLevel": current_level,
        "nextLevel": next_level,
        "currentAuthenticationMethods": current_authentication_methods,
    }))
}

fn jwt_payload(access_token: &str) -> Result<Value, ()> {
    let mut segments = access_token.split('.');
    let _header = segments.next().ok_or(())?;
    let payload = segments.next().ok_or(())?;
    let _signature = segments.next().ok_or(())?;

    if segments.next().is_some() || payload.trim().is_empty() {
        return Err(());
    }

    let mut padded_payload = payload.to_owned();
    while padded_payload.len() % 4 != 0 {
        padded_payload.push('=');
    }
    let decoded = URL_SAFE.decode(padded_payload.as_bytes()).map_err(|_| ())?;

    serde_json::from_slice::<Value>(&decoded).map_err(|_| ())
}

fn user_has_verified_factor(user: &Value) -> bool {
    user.get("factors")
        .and_then(Value::as_array)
        .is_some_and(|factors| {
            factors.iter().any(|factor| {
                factor
                    .get("status")
                    .and_then(Value::as_str)
                    .is_some_and(|status| status == VERIFIED_FACTOR_STATUS)
            })
        })
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": UNAUTHORIZED_MESSAGE,
        }),
    ))
}

fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": INTERNAL_SERVER_ERROR_MESSAGE,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outbound::{OutboundError, OutboundFuture, OutboundResponse};
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use std::{cell::RefCell, collections::VecDeque};

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        body: Option<String>,
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    enum RecordingOutboundResult {
        Error(OutboundError),
        Response(OutboundResponse),
    }

    struct RecordingOutboundClient {
        calls: RefCell<Vec<RecordedOutboundRequest>>,
        responses: RefCell<VecDeque<RecordingOutboundResult>>,
    }

    impl RecordingOutboundClient {
        fn with_response(status: u16, body_text: impl Into<String>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from([RecordingOutboundResult::Response(
                    OutboundResponse {
                        body_text: body_text.into(),
                        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
                        status,
                    },
                )])),
            }
        }

        fn with_error(error: OutboundError) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from([RecordingOutboundResult::Error(error)])),
            }
        }

        fn calls(&self) -> Vec<RecordedOutboundRequest> {
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

    fn backend_config_with_contact_data() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend");
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co/",
            "test-service-role-secret",
        );
        config
    }

    fn request(method: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            method,
            origin: None,
            path: AUTH_MFA_ASSURANCE_LEVEL_PATH,
            referer: None,
            request_id: None,
            url: Some("https://tuturuuu.localhost/api/auth/mfa/totp/assurance-level"),
        }
    }

    fn request_with_bearer_token(access_token: &str) -> BackendRequest<'_> {
        BackendRequest {
            authorization: Some(access_token),
            ..request("GET")
        }
    }

    fn jwt_with_payload(payload: Value) -> String {
        let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"none","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(payload.to_string());

        format!("{header}.{payload}.signature")
    }

    fn bearer_jwt(payload: Value) -> String {
        format!("Bearer {}", jwt_with_payload(payload))
    }

    fn verified_factor_user() -> Value {
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

    fn recorded_header<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    fn assert_no_store_json(response: &BackendResponse) {
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
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

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
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

        let response = crate::handle_backend_request(
            &config,
            request_with_bearer_token(&access_token),
            &outbound,
        )
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

        let response = crate::handle_backend_request(
            &config,
            request_with_bearer_token(&access_token),
            &outbound,
        )
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

        let response = crate::handle_backend_request(
            &config,
            request_with_bearer_token(&access_token),
            &outbound,
        )
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
        let outbound = RecordingOutboundClient::with_error(OutboundError::Transport(
            "network down".to_owned(),
        ));

        let response = crate::handle_backend_request(
            &config,
            request_with_bearer_token(&access_token),
            &outbound,
        )
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

        let response = crate::handle_backend_request(
            &config,
            request_with_bearer_token(&access_token),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "error": "Internal server error" }));
        assert_no_store_json(&response);
    }

    #[tokio::test]
    async fn auth_mfa_returns_500_when_jwt_payload_parse_fails() {
        let config = backend_config_with_contact_data();
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

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
    async fn auth_mfa_rejects_unsupported_methods_with_allow_get() {
        let config = backend_config_with_contact_data();
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

        let response = crate::handle_backend_request(&config, request("POST"), &outbound).await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(response.body, json!({ "error": "method not allowed" }));
        assert_no_store_json(&response);
        assert_eq!(outbound.calls().len(), 0);
    }
}
