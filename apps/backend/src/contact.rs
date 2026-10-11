use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fmt;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    parse_json_body, supabase_auth, url_origin,
};

mod current_user_session_targets;
mod datetime;
mod profile;
mod profile_banner;
mod session;
mod support;
mod validation;
use profile::*;
pub(crate) use profile::{current_user_profile_patch_response, current_user_profile_response};
pub(crate) use support::support_inquiry_post_response;
use support::*;

use current_user_session_targets::CURRENT_USER_APP_SESSION_TARGETS;

use datetime::unix_seconds_to_iso8601;
use validation::{validate_email, validate_enum, validate_string_length};

#[cfg(feature = "native")]
pub(crate) use session::app_coordination_secrets_from_env;
#[cfg(feature = "worker")]
pub(crate) use session::{APP_COORDINATION_SECRET_KEYS, LOCAL_DEVELOPMENT_APP_COORDINATION_SECRET};
#[cfg(test)]
pub(crate) use session::{
    APP_SESSION_COOKIE_NAME, APP_SESSION_SCOPE, AppCoordinationClaims,
    app_coordination_token_audience, app_coordination_token_issuer, app_coordination_token_prefix,
    encode_app_session_part, sign_app_coordination_content, verify_app_session_token,
};

pub(crate) const CURRENT_USER_PROFILE_PATH: &str = "/api/v1/users/me/profile";
pub(crate) const CURRENT_USER_FULL_NAME_PATH: &str = "/api/v1/users/me/full-name";
pub(crate) const SUPPORT_INQUIRIES_PATH: &str = "/api/v1/inquiries";
enum SupportInquiryRoute<'a> {
    Detail { id: &'a str },
    MediaUrls,
}
const SUPPORT_INQUIRY_PATH_PREFIX: &str = "/api/v1/inquiries/";
pub(crate) const SUPABASE_URL_KEYS: [&str; 4] = [
    "SUPABASE_SERVER_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "DOCKER_INTERNAL_SUPABASE_URL",
];
pub(crate) const SUPABASE_SERVICE_ROLE_KEY_KEYS: [&str; 3] = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
];
const CONTACT_DATA_SUPABASE_URL_SETTING: &str = "SUPABASE_URL";
const CONTACT_DATA_SERVICE_ROLE_KEY_SETTING: &str = "SUPABASE_SERVICE_ROLE_KEY";

const SUPPORT_INQUIRY_TYPES: [&str; 4] = ["bug", "feature-request", "support", "job-application"];
const SUPPORT_INQUIRY_PRODUCTS: [&str; 12] = [
    "web",
    "nova",
    "rewise",
    "calendar",
    "finance",
    "tudo",
    "tumeet",
    "shortener",
    "qr",
    "drive",
    "mail",
    "other",
];
const MAX_DISPLAY_NAME_LENGTH: usize = 100;
const MAX_FULL_NAME_LENGTH: usize = 100;
const MAX_BIO_LENGTH: usize = 1000;
const MAX_SUPPORT_INQUIRY_LENGTH: usize = 512;
const MAX_SUPPORT_INQUIRY_SUBJECT_LENGTH: usize = 128;
const CLI_APP_SESSION_TARGETS: [&str; 1] = ["platform"];
const CLI_APP_ACCESS_SCOPE: &str = "cli:access";
pub(crate) const CONTACT_DATA_LAYER_NOT_READY_MESSAGE: &str =
    "Rust contact data persistence is not configured yet";
const CONTACT_DATA_REQUEST_FAILED_MESSAGE: &str = "Rust contact data request failed";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AppSessionIdentity {
    pub(crate) email: Option<String>,
    pub(crate) id: String,
}

#[derive(Clone, Eq, PartialEq)]
pub(crate) struct RedactedSecret(String);

impl RedactedSecret {
    fn new(value: impl Into<String>) -> Self {
        Self(value.into().trim().to_owned())
    }

    fn is_configured(&self) -> bool {
        !self.0.is_empty()
    }
}

impl fmt::Debug for RedactedSecret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.is_configured() {
            formatter.write_str("RedactedSecret(<configured>)")
        } else {
            formatter.write_str("RedactedSecret(<empty>)")
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ContactDataConfig {
    supabase_url: String,
    service_role_key: RedactedSecret,
    public_storage_origin: Option<RedactedSecret>,
}

impl ContactDataConfig {
    pub(crate) fn disabled() -> Self {
        Self::new("", "")
    }

    pub(crate) fn new(
        supabase_url: impl Into<String>,
        service_role_key: impl Into<String>,
    ) -> Self {
        Self {
            supabase_url: supabase_url.into().trim().trim_end_matches('/').to_owned(),
            service_role_key: RedactedSecret::new(service_role_key),
            public_storage_origin: None,
        }
    }

    pub(crate) fn with_public_storage_origin(mut self, value: impl Into<String>) -> Self {
        let value = value.into();
        self.public_storage_origin = (!value.is_empty()).then(|| RedactedSecret::new(value));
        self
    }

    pub(crate) fn configured(&self) -> bool {
        url_origin(&self.supabase_url).is_some() && self.service_role_key.is_configured()
    }

    pub(crate) fn status(&self) -> ContactDataLayerStatus {
        let mut missing = Vec::new();
        let supabase_origin = url_origin(&self.supabase_url);

        if supabase_origin.is_none() {
            missing.push(CONTACT_DATA_SUPABASE_URL_SETTING);
        }

        if !self.service_role_key.is_configured() {
            missing.push(CONTACT_DATA_SERVICE_ROLE_KEY_SETTING);
        }

        ContactDataLayerStatus {
            configured: self.configured(),
            missing,
            supabase_origin,
        }
    }

    pub(crate) fn service_role_key(&self) -> Option<&str> {
        self.service_role_key
            .is_configured()
            .then_some(&self.service_role_key.0)
    }

    pub(crate) fn rest_url(&self, table: &str, params: &[(&str, String)]) -> Option<String> {
        url_origin(&self.supabase_url)?;

        let mut query = url::form_urlencoded::Serializer::new(String::new());
        for (key, value) in params {
            query.append_pair(key, value);
        }

        Some(format!(
            "{}/rest/v1/{table}?{}",
            self.supabase_url,
            query.finish()
        ))
    }

    pub(crate) fn auth_url(&self, path: &str) -> Option<String> {
        url_origin(&self.supabase_url)?;

        Some(format!(
            "{}/auth/v1/{}",
            self.supabase_url,
            path.trim_start_matches('/')
        ))
    }

    pub(crate) fn rpc_url(&self, function: &str) -> Option<String> {
        url_origin(&self.supabase_url)?;

        Some(format!(
            "{}/rest/v1/rpc/{}",
            self.supabase_url,
            function.trim_start_matches('/')
        ))
    }
}

#[cfg(feature = "native")]
pub(crate) fn contact_data_config_from_env() -> ContactDataConfig {
    ContactDataConfig::new(
        first_env_value(&SUPABASE_URL_KEYS),
        first_env_value(&SUPABASE_SERVICE_ROLE_KEY_KEYS),
    )
    .with_public_storage_origin(std::env::var("SUPABASE_PUBLIC_STORAGE_ORIGIN").unwrap_or_default())
}

#[cfg(feature = "native")]
fn first_env_value(keys: &[&str]) -> String {
    keys.iter()
        .filter_map(|key| std::env::var(key).ok())
        .map(|value| value.trim().to_owned())
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContactDataLayerStatus {
    configured: bool,
    missing: Vec<&'static str>,
    supabase_origin: Option<String>,
}

pub(crate) fn current_user_app_session_targets() -> &'static [&'static str] {
    &CURRENT_USER_APP_SESSION_TARGETS
}

pub(crate) fn request_has_app_session_token(request: BackendRequest<'_>) -> bool {
    session::has_app_session_token(request)
}

pub(crate) fn resolve_app_session_identity(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    expected_targets: &[&str],
) -> Result<AppSessionIdentity, ()> {
    session::resolve_app_session(config, request, expected_targets)
        .map(|actor| AppSessionIdentity {
            email: actor.claims.email,
            id: actor.claims.sub,
        })
        .map_err(|_| ())
}

pub(crate) fn resolve_cli_app_session_identity(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> Result<AppSessionIdentity, ()> {
    let actor =
        session::resolve_app_session(config, request, &CLI_APP_SESSION_TARGETS).map_err(|_| ())?;

    if !actor
        .claims
        .scopes
        .iter()
        .any(|scope| scope == CLI_APP_ACCESS_SCOPE)
    {
        return Err(());
    }

    Ok(AppSessionIdentity {
        email: actor.claims.email,
        id: actor.claims.sub,
    })
}

pub(crate) async fn handle_contact_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    match (request.method, request.path) {
        ("GET", CURRENT_USER_PROFILE_PATH) => {
            Some(current_user_profile_data_response(config, request, outbound).await)
        }
        ("HEAD", CURRENT_USER_PROFILE_PATH) => {
            let mut response = current_user_profile_data_response(config, request, outbound).await;
            response.body_empty = true;
            response.body_text = None;
            Some(response)
        }
        ("PATCH", CURRENT_USER_PROFILE_PATH) => {
            Some(current_user_profile_patch_data_response(config, request, outbound).await)
        }
        (method, CURRENT_USER_PROFILE_PATH) => Some(method_not_allowed(method, "GET, HEAD, PATCH")),
        ("PATCH", CURRENT_USER_FULL_NAME_PATH) => {
            Some(current_user_full_name_patch_response(config, request, outbound).await)
        }
        (method, CURRENT_USER_FULL_NAME_PATH) => Some(method_not_allowed(method, "PATCH")),
        ("POST", SUPPORT_INQUIRIES_PATH) => {
            Some(support_inquiry_data_post_response(config, request, outbound).await)
        }
        ("GET" | "HEAD", SUPPORT_INQUIRIES_PATH) => None,
        (method, SUPPORT_INQUIRIES_PATH) => Some(method_not_allowed(method, "POST")),
        ("PATCH", path) => match support_inquiry_route(path)? {
            SupportInquiryRoute::Detail { id } => {
                Some(support_inquiry_data_patch_response(config, request, id, outbound).await)
            }
            SupportInquiryRoute::MediaUrls => None,
        },
        (method, path) => match support_inquiry_route(path)? {
            SupportInquiryRoute::Detail { .. } => Some(method_not_allowed(method, "PATCH")),
            SupportInquiryRoute::MediaUrls => None,
        },
    }
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, path),
        ("PATCH", CURRENT_USER_PROFILE_PATH)
            | ("PATCH", CURRENT_USER_FULL_NAME_PATH)
            | ("POST", SUPPORT_INQUIRIES_PATH)
    ) || matches!(
        (method, support_inquiry_route(path)),
        ("PATCH", Some(SupportInquiryRoute::Detail { .. }))
    )
}

fn contact_data_layer_not_ready_response(request: BackendRequest<'_>) -> BackendResponse {
    no_store_response(json_response(
        503,
        json!({
            "code": "CONTACT_DATA_LAYER_NOT_READY",
            "message": CONTACT_DATA_LAYER_NOT_READY_MESSAGE,
            "requestId": request.request_id.unwrap_or("unknown"),
        }),
    ))
}

async fn send_contact_data_request(
    contact_data: &ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
    prefer: Option<&'static str>,
) -> Result<OutboundResponse, BackendResponse> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(contact_data_layer_request_failed_response());
    };

    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if body.is_some() {
        request = request.with_header("Content-Type", APPLICATION_JSON);
    }

    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    if let Some(body) = body {
        request = request.with_body(body);
    }

    outbound
        .send(request)
        .await
        .map_err(|_| contact_data_layer_request_failed_response())
}

fn contact_data_layer_request_failed_response() -> BackendResponse {
    no_store_response(json_response(
        502,
        json!({
            "message": CONTACT_DATA_REQUEST_FAILED_MESSAGE,
        }),
    ))
}

fn support_inquiry_route(path: &str) -> Option<SupportInquiryRoute<'_>> {
    let id = path.strip_prefix(SUPPORT_INQUIRY_PATH_PREFIX)?;

    if let Some(id) = id.strip_suffix("/media-urls")
        && valid_support_inquiry_id_segment(id)
    {
        return Some(SupportInquiryRoute::MediaUrls);
    }

    if !valid_support_inquiry_id_segment(id) {
        return None;
    }

    Some(SupportInquiryRoute::Detail { id })
}

fn valid_support_inquiry_id_segment(id: &str) -> bool {
    !id.is_empty() && !id.contains('/')
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, serde_json::Error> {
    let rows = serde_json::from_str::<Vec<T>>(&response.body_text)?;

    Ok(rows.into_iter().next())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn is_same_origin_api_request(request: BackendRequest<'_>) -> bool {
    let Some(request_origin) = request.url.and_then(url_origin) else {
        return false;
    };

    if let Some(origin) = request.origin {
        return url_origin(origin).as_deref() == Some(request_origin.as_str());
    }

    request
        .referer
        .and_then(url_origin)
        .as_deref()
        .is_some_and(|referer_origin| referer_origin == request_origin)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn full_name_validation_trims_required_string() {
        assert_eq!(
            full_name_from_body(Some(r#"{"full_name":" Ada Lovelace ","ignored":true}"#)).unwrap(),
            "Ada Lovelace"
        );

        let response = full_name_from_body(Some(r#"{"full_name":"   "}"#)).unwrap_err();
        assert_eq!(response.status, 400);
        assert_eq!(response.body["message"], "Invalid full name");
        assert_eq!(response.body["errors"][0]["path"], json!(["full_name"]));

        let response = full_name_from_body(Some(r#"{"display_name":"Ada"}"#)).unwrap_err();
        assert_eq!(response.status, 400);
        assert_eq!(response.body["message"], "Invalid full name");
        assert_eq!(response.body["errors"][0]["path"], json!(["full_name"]));
    }

    #[test]
    fn full_name_validation_uses_legacy_utf16_limit() {
        let valid = "a".repeat(MAX_FULL_NAME_LENGTH);
        let valid_body = format!(r#"{{"full_name":"{valid}"}}"#);
        assert_eq!(full_name_from_body(Some(&valid_body)).unwrap(), valid);

        let emoji_name = "😀".repeat((MAX_FULL_NAME_LENGTH / 2) + 1);
        let emoji_body = format!(r#"{{"full_name":"{emoji_name}"}}"#);
        let response = full_name_from_body(Some(&emoji_body)).unwrap_err();

        assert_eq!(response.status, 400);
        assert_eq!(response.body["message"], "Invalid full name");
        assert_eq!(response.body["errors"][0]["path"], json!(["full_name"]));
    }
}
