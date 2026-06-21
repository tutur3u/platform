use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const AUTH_MFA_ASSURANCE_LEVEL_PATH: &str = "/api/auth/mfa/totp/assurance-level";
const AUTH_MFA_TOTP_FACTORS_PATH: &str = "/api/auth/mfa/totp/factors";
const AUTH_MFA_TOTP_FACTOR_PATH_PREFIX: &str = "/api/auth/mfa/totp/factors/";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const MISSING_FACTOR_ID_MESSAGE: &str = "Missing factorId";
const FACTOR_NOT_FOUND_MESSAGE: &str = "Factor not found";
const FACTOR_UNENROLLED_MESSAGE: &str = "Factor unenrolled successfully";
const SUPABASE_AUTH_API_VERSION: &str = "2024-01-01";
const SUPABASE_AUTH_USER_PATH: &str = "user";
const SUPABASE_AUTH_FACTORS_PATH: &str = "factors";
const JSON_UTF8_CONTENT_TYPE: &str = "application/json;charset=UTF-8";
const VERIFIED_FACTOR_STATUS: &str = "verified";
const FACTOR_TYPE_TOTP: &str = "totp";
const FACTOR_TYPE_PHONE: &str = "phone";
const FACTOR_TYPE_WEBAUTHN: &str = "webauthn";
const AAL2: &str = "aal2";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AuthMfaRoute<'a> {
    AssuranceLevel,
    TotpFactors,
    TotpFactor { factor_id: &'a str },
}

#[derive(Debug, Eq, PartialEq)]
enum SupabaseAuthRequestError {
    Api(String),
    Internal,
}

pub(crate) async fn handle_auth_mfa_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = auth_mfa_route(request.path)?;

    Some(match route {
        AuthMfaRoute::AssuranceLevel => match request.method {
            "GET" => {
                auth_mfa_assurance_level_response(&config.contact_data, request, outbound).await
            }
            method => no_store_response(method_not_allowed(method, "GET")),
        },
        AuthMfaRoute::TotpFactors => match request.method {
            "GET" => {
                auth_mfa_totp_factors_get_response(&config.contact_data, request, outbound).await
            }
            "POST" => {
                auth_mfa_totp_factors_post_response(&config.contact_data, request, outbound).await
            }
            method => no_store_response(method_not_allowed(method, "GET, POST")),
        },
        AuthMfaRoute::TotpFactor { factor_id } => match request.method {
            "GET" => {
                auth_mfa_totp_factor_get_response(
                    &config.contact_data,
                    request,
                    outbound,
                    factor_id,
                )
                .await
            }
            "DELETE" => {
                auth_mfa_totp_factor_delete_response(
                    &config.contact_data,
                    request,
                    outbound,
                    factor_id,
                )
                .await
            }
            method => no_store_response(method_not_allowed(method, "GET, DELETE")),
        },
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!((method, path), ("POST", AUTH_MFA_TOTP_FACTORS_PATH))
}

fn auth_mfa_route(path: &str) -> Option<AuthMfaRoute<'_>> {
    if path == AUTH_MFA_ASSURANCE_LEVEL_PATH {
        return Some(AuthMfaRoute::AssuranceLevel);
    }

    if path == AUTH_MFA_TOTP_FACTORS_PATH {
        return Some(AuthMfaRoute::TotpFactors);
    }

    let factor_id = path.strip_prefix(AUTH_MFA_TOTP_FACTOR_PATH_PREFIX)?;
    if factor_id.contains('/') {
        return None;
    }

    Some(AuthMfaRoute::TotpFactor { factor_id })
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

async fn auth_mfa_totp_factors_get_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_supabase_user_value(contact_data, request, outbound).await {
        AuthenticatedSupabaseUser::User(user) => user,
        AuthenticatedSupabaseUser::Unauthorized => return unauthorized_response(),
        AuthenticatedSupabaseUser::InternalError => return internal_server_error_response(),
    };

    let Ok(factors) = list_factors_from_user(&user) else {
        return internal_server_error_response();
    };

    no_store_response(json_response(200, factors))
}

async fn auth_mfa_totp_factors_post_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return unauthorized_response(),
        Err(()) => return internal_server_error_response(),
    }

    let Ok(body) = totp_enroll_request_body(request.body_text) else {
        return internal_server_error_response();
    };

    let mut data = match send_supabase_auth_request(
        contact_data,
        &access_token,
        outbound,
        OutboundMethod::Post,
        SUPABASE_AUTH_FACTORS_PATH,
        Some(&body),
    )
    .await
    {
        Ok(data) => data,
        Err(SupabaseAuthRequestError::Api(message)) => {
            return supabase_auth_api_error_response(message);
        }
        Err(SupabaseAuthRequestError::Internal) => return internal_server_error_response(),
    };

    normalize_totp_enroll_response(&mut data);

    no_store_response(json_response(200, data))
}

async fn auth_mfa_totp_factor_delete_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    factor_id: &str,
) -> BackendResponse {
    if let Some(response) = missing_factor_id_response(factor_id) {
        return response;
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return unauthorized_response(),
        Err(()) => return internal_server_error_response(),
    }

    let path = format!("{SUPABASE_AUTH_FACTORS_PATH}/{factor_id}");
    let data = match send_supabase_auth_request(
        contact_data,
        &access_token,
        outbound,
        OutboundMethod::Delete,
        &path,
        None,
    )
    .await
    {
        Ok(data) => data,
        Err(SupabaseAuthRequestError::Api(message)) => {
            return supabase_auth_api_error_response(message);
        }
        Err(SupabaseAuthRequestError::Internal) => return internal_server_error_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "message": FACTOR_UNENROLLED_MESSAGE,
            "data": data,
        }),
    ))
}

async fn auth_mfa_totp_factor_get_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    factor_id: &str,
) -> BackendResponse {
    if let Some(response) = missing_factor_id_response(factor_id) {
        return response;
    }

    let user = match authenticated_supabase_user_value(contact_data, request, outbound).await {
        AuthenticatedSupabaseUser::User(user) => user,
        AuthenticatedSupabaseUser::Unauthorized => return unauthorized_response(),
        AuthenticatedSupabaseUser::InternalError => return internal_server_error_response(),
    };

    let Ok(factors) = list_factors_from_user(&user) else {
        return internal_server_error_response();
    };
    let factor = factors
        .get(FACTOR_TYPE_TOTP)
        .and_then(Value::as_array)
        .and_then(|factors| {
            factors.iter().find(|factor| {
                factor
                    .get("id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| id == factor_id)
            })
        });

    if let Some(factor) = factor {
        no_store_response(json_response(200, factor.clone()))
    } else {
        no_store_response(json_response(
            404,
            json!({
                "error": FACTOR_NOT_FOUND_MESSAGE,
            }),
        ))
    }
}

enum AuthenticatedSupabaseUser {
    User(Value),
    Unauthorized,
    InternalError,
}

async fn authenticated_supabase_user_value(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> AuthenticatedSupabaseUser {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return AuthenticatedSupabaseUser::Unauthorized;
    };

    match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(user)) => AuthenticatedSupabaseUser::User(user),
        Ok(None) => AuthenticatedSupabaseUser::Unauthorized,
        Err(()) => AuthenticatedSupabaseUser::InternalError,
    }
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

fn list_factors_from_user(user: &Value) -> Result<Value, ()> {
    let mut all = Vec::new();
    let mut phone = Vec::new();
    let mut totp = Vec::new();
    let mut webauthn = Vec::new();
    let Some(factors) = user.get("factors") else {
        return Ok(json!({
            "all": all,
            "phone": phone,
            "totp": totp,
            "webauthn": webauthn,
        }));
    };

    if factors.is_null() {
        return Ok(json!({
            "all": all,
            "phone": phone,
            "totp": totp,
            "webauthn": webauthn,
        }));
    }

    let factors = factors.as_array().ok_or(())?;
    for factor in factors {
        all.push(factor.clone());

        if factor
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|status| status == VERIFIED_FACTOR_STATUS)
        {
            match factor.get("factor_type").and_then(Value::as_str) {
                Some(FACTOR_TYPE_TOTP) => totp.push(factor.clone()),
                Some(FACTOR_TYPE_PHONE) => phone.push(factor.clone()),
                Some(FACTOR_TYPE_WEBAUTHN) => webauthn.push(factor.clone()),
                _ => return Err(()),
            }
        }
    }

    Ok(json!({
        "all": all,
        "phone": phone,
        "totp": totp,
        "webauthn": webauthn,
    }))
}

fn totp_enroll_request_body(body_text: Option<&str>) -> Result<String, ()> {
    let body = serde_json::from_str::<Value>(body_text.unwrap_or_default()).map_err(|_| ())?;
    if body.is_null() {
        return Err(());
    }

    let mut enroll_body = Map::new();
    if let Some(friendly_name) = body.get("friendlyName") {
        enroll_body.insert("friendly_name".to_owned(), friendly_name.clone());
    }
    enroll_body.insert("factor_type".to_owned(), json!(FACTOR_TYPE_TOTP));

    Ok(Value::Object(enroll_body).to_string())
}

async fn send_supabase_auth_request(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    path: &str,
    body: Option<&str>,
) -> Result<Value, SupabaseAuthRequestError> {
    let url = contact_data
        .auth_url(path)
        .ok_or(SupabaseAuthRequestError::Internal)?;
    let service_role_key = contact_data
        .service_role_key()
        .ok_or(SupabaseAuthRequestError::Internal)?;
    let authorization = format!("Bearer {access_token}");
    let mut request = OutboundRequest::new(method, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("X-Supabase-Api-Version", SUPABASE_AUTH_API_VERSION);

    if method != OutboundMethod::Get {
        request = request.with_header("Content-Type", JSON_UTF8_CONTENT_TYPE);
    }

    if let Some(body) = body {
        request = request.with_body(body);
    }

    let response = outbound
        .send(request)
        .await
        .map_err(|_| SupabaseAuthRequestError::Internal)?;

    if !(200..300).contains(&response.status) {
        let error_body = response
            .json::<Value>()
            .map_err(|_| SupabaseAuthRequestError::Internal)?;

        return Err(SupabaseAuthRequestError::Api(supabase_auth_error_message(
            &error_body,
        )));
    }

    response
        .json::<Value>()
        .map_err(|_| SupabaseAuthRequestError::Internal)
}

fn supabase_auth_error_message(error_body: &Value) -> String {
    for key in ["msg", "message", "error_description", "error"] {
        if let Some(message) = error_body.get(key).and_then(Value::as_str) {
            return message.to_owned();
        }
    }

    serde_json::to_string(error_body).unwrap_or_else(|_| INTERNAL_SERVER_ERROR_MESSAGE.to_owned())
}

fn normalize_totp_enroll_response(data: &mut Value) {
    if data.get("type").and_then(Value::as_str) != Some(FACTOR_TYPE_TOTP) {
        return;
    }

    let Some(totp) = data.get_mut("totp").and_then(Value::as_object_mut) else {
        return;
    };
    let Some(qr_code) = totp
        .get("qr_code")
        .and_then(Value::as_str)
        .filter(|qr_code| !qr_code.is_empty())
        .map(str::to_owned)
    else {
        return;
    };

    totp.insert(
        "qr_code".to_owned(),
        json!(format!("data:image/svg+xml;utf-8,{qr_code}")),
    );
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": UNAUTHORIZED_MESSAGE,
        }),
    ))
}

fn missing_factor_id_response(factor_id: &str) -> Option<BackendResponse> {
    factor_id.trim().is_empty().then(|| {
        no_store_response(json_response(
            400,
            json!({
                "error": MISSING_FACTOR_ID_MESSAGE,
            }),
        ))
    })
}

fn supabase_auth_api_error_response(message: String) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "error": message,
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
            Self::with_results(vec![RecordingOutboundResult::Response(outbound_response(
                status, body_text,
            ))])
        }

        fn with_error(error: OutboundError) -> Self {
            Self::with_results(vec![RecordingOutboundResult::Error(error)])
        }

        fn with_responses(responses: Vec<OutboundResponse>) -> Self {
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

    fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
        OutboundResponse {
            body_text: body_text.into(),
            headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
            status,
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
        request_for(method, AUTH_MFA_ASSURANCE_LEVEL_PATH, None)
    }

    fn request_for(
        method: &'static str,
        path: &'static str,
        body_text: Option<&'static str>,
    ) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text,
            cookie: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: None,
        }
    }

    fn request_with_bearer_token(access_token: &str) -> BackendRequest<'_> {
        request_with_bearer_token_for("GET", AUTH_MFA_ASSURANCE_LEVEL_PATH, access_token, None)
    }

    fn request_with_bearer_token_for<'a>(
        method: &'static str,
        path: &'static str,
        access_token: &'a str,
        body_text: Option<&'a str>,
    ) -> BackendRequest<'a> {
        BackendRequest {
            authorization: Some(access_token),
            body_text,
            cookie: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: None,
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

    fn multi_factor_user() -> Value {
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
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

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
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

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
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

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
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

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
        let outbound =
            RecordingOutboundClient::with_response(200, verified_factor_user().to_string());

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
}
