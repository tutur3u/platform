use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fmt;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    parse_json_body, supabase_auth, url_origin,
};

mod datetime;
mod session;
mod validation;

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
const CURRENT_USER_APP_SESSION_TARGETS: [&str; 18] = [
    "calendar",
    "chat",
    "cms",
    "contacts",
    "drive",
    "finance",
    "hive",
    "inventory",
    "learn",
    "mail",
    "mind",
    "mira",
    "nova",
    "rewise",
    "tasks",
    "teach",
    "track",
    "platform",
];
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
const MAX_SUPPORT_INQUIRY_LENGTH: usize = 5000;
const MAX_SUPPORT_INQUIRY_SUBJECT_LENGTH: usize = 255;
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
        }
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

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct CurrentUserProfileResponse {
    avatar_url: Option<String>,
    created_at: String,
    default_workspace_id: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
    full_name: Option<String>,
    id: String,
    new_email: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseUserRow {
    avatar_url: Option<String>,
    created_at: Option<String>,
    display_name: Option<String>,
    id: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseUserPrivateDetailsRow {
    default_workspace_id: Option<String>,
    email: Option<String>,
    full_name: Option<String>,
    new_email: Option<String>,
}

#[derive(Deserialize)]
struct SupportInquiryRequest {
    email: String,
    message: String,
    name: String,
    product: String,
    subject: String,
    #[serde(rename = "type")]
    inquiry_type: String,
}

#[derive(Deserialize)]
struct SupportInquiryInsertRow {
    id: String,
}

#[derive(Serialize)]
struct SupportInquiryInsert<'a> {
    creator_id: &'a str,
    email: &'a str,
    message: &'a str,
    name: &'a str,
    product: &'a str,
    subject: &'a str,
    #[serde(rename = "type")]
    inquiry_type: &'a str,
}

#[derive(Serialize)]
struct CurrentUserFullNameUpsert<'a> {
    user_id: &'a str,
    full_name: &'a str,
}

enum SupportInquiryRoute<'a> {
    Detail { id: &'a str },
    MediaUrls,
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
        ("PATCH", CURRENT_USER_PROFILE_PATH) => {
            Some(current_user_profile_patch_data_response(config, request, outbound).await)
        }
        (method, CURRENT_USER_PROFILE_PATH) => Some(method_not_allowed(method, "GET, PATCH")),
        ("PATCH", CURRENT_USER_FULL_NAME_PATH) => {
            Some(current_user_full_name_patch_response(config, request, outbound).await)
        }
        (method, CURRENT_USER_FULL_NAME_PATH) => Some(method_not_allowed(method, "PATCH")),
        ("POST", SUPPORT_INQUIRIES_PATH) => {
            Some(support_inquiry_data_post_response(config, request, outbound).await)
        }
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

async fn current_user_full_name_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Profile updates require same-origin confirmation",
            }),
        ));
    };

    let full_name = match full_name_from_body(request.body_text) {
        Ok(full_name) => full_name,
        Err(response) => return no_store_response(*response),
    };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(full_name_url) = config.contact_data.rest_url(
        "user_private_details",
        &[("on_conflict", "user_id".to_owned())],
    ) else {
        return contact_data_layer_not_ready_response(request);
    };
    let upsert = CurrentUserFullNameUpsert {
        user_id: &actor.claims.sub,
        full_name: &full_name,
    };
    let body = match serde_json::to_string(&upsert) {
        Ok(body) => body,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Internal server error" }),
            ));
        }
    };

    match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Post,
        &full_name_url,
        Some(&body),
        Some("resolution=merge-duplicates,return=minimal"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => no_store_response(json_response(
            200,
            json!({ "message": "Full name updated successfully" }),
        )),
        Ok(_) | Err(_) => no_store_response(json_response(
            500,
            json!({ "message": "Error updating full name" }),
        )),
    }
}

pub(crate) fn current_user_profile_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    no_store_response(json_response(
        200,
        CurrentUserProfileResponse {
            avatar_url: None,
            created_at: unix_seconds_to_iso8601(actor.claims.iat),
            default_workspace_id: None,
            display_name: None,
            email: actor.claims.email,
            full_name: None,
            id: actor.claims.sub,
            new_email: None,
        },
    ))
}

async fn current_user_profile_data_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(user_url) = config.contact_data.rest_url(
        "users",
        &[
            ("select", "id,display_name,avatar_url,created_at".to_owned()),
            ("id", format!("eq.{}", actor.claims.sub)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return contact_data_layer_not_ready_response(request);
    };
    let Some(private_details_url) = config.contact_data.rest_url(
        "user_private_details",
        &[
            (
                "select",
                "full_name,new_email,email,default_workspace_id".to_owned(),
            ),
            ("user_id", format!("eq.{}", actor.claims.sub)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return contact_data_layer_not_ready_response(request);
    };

    let user_response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Get,
        &user_url,
        None,
        None,
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(_) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error fetching user profile" }),
            ));
        }
    };
    let private_details_response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Get,
        &private_details_url,
        None,
        None,
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(_) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error fetching user profile" }),
            ));
        }
    };

    let user_row = match decode_first_row::<SupabaseUserRow>(&user_response) {
        Ok(row) => row,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error fetching user profile" }),
            ));
        }
    };
    let private_details_row =
        match decode_first_row::<SupabaseUserPrivateDetailsRow>(&private_details_response) {
            Ok(row) => row,
            Err(_) => {
                return no_store_response(json_response(
                    500,
                    json!({ "message": "Error fetching user profile" }),
                ));
            }
        };

    no_store_response(json_response(
        200,
        CurrentUserProfileResponse {
            avatar_url: user_row.as_ref().and_then(|row| row.avatar_url.clone()),
            created_at: user_row
                .as_ref()
                .and_then(|row| row.created_at.clone())
                .unwrap_or_else(|| unix_seconds_to_iso8601(actor.claims.iat)),
            default_workspace_id: private_details_row
                .as_ref()
                .and_then(|row| row.default_workspace_id.clone()),
            display_name: user_row.as_ref().and_then(|row| row.display_name.clone()),
            email: private_details_row
                .as_ref()
                .and_then(|row| row.email.clone())
                .or(actor.claims.email),
            full_name: private_details_row
                .as_ref()
                .and_then(|row| row.full_name.clone()),
            id: user_row.and_then(|row| row.id).unwrap_or(actor.claims.sub),
            new_email: private_details_row.and_then(|row| row.new_email),
        },
    ))
}

pub(crate) fn current_user_profile_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Profile updates require same-origin confirmation",
            }),
        ));
    }

    contact_data_layer_not_ready_response(request)
}

async fn current_user_profile_patch_data_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Profile updates require same-origin confirmation",
            }),
        ));
    }

    let updates = match profile_patch_updates(request.body_text) {
        Ok(updates) => updates,
        Err(response) => return no_store_response(*response),
    };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(profile_url) = config
        .contact_data
        .rest_url("users", &[("id", format!("eq.{}", actor.claims.sub))])
    else {
        return contact_data_layer_not_ready_response(request);
    };
    let body = match serde_json::to_string(&updates) {
        Ok(body) => body,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Internal server error" }),
            ));
        }
    };

    match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Patch,
        &profile_url,
        Some(&body),
        Some("return=minimal"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => no_store_response(json_response(
            200,
            json!({ "message": "Profile updated successfully" }),
        )),
        Ok(_) | Err(_) => no_store_response(json_response(
            500,
            json!({ "message": "Internal server error" }),
        )),
    }
}

pub(crate) fn support_inquiry_post_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Support inquiry creation requires same-origin confirmation",
            }),
        ));
    }

    let Some(body) = parse_json_body(request.body_text) else {
        return no_store_response(invalid_contact_request_body_response(vec![
            "body must be valid JSON".to_owned(),
        ]));
    };

    let payload = match serde_json::from_value::<SupportInquiryRequest>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return no_store_response(invalid_contact_request_body_response(vec![
                "body must include name, email, type, product, subject, and message".to_owned(),
            ]));
        }
    };

    let validation_errors = validate_support_inquiry_payload(&payload);
    if !validation_errors.is_empty() {
        return no_store_response(invalid_contact_request_body_response(validation_errors));
    }

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    contact_data_layer_not_ready_response(request)
}

async fn support_inquiry_data_post_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Support inquiry creation requires same-origin confirmation",
            }),
        ));
    }

    let Some(body) = parse_json_body(request.body_text) else {
        return no_store_response(invalid_contact_request_body_response(vec![
            "body must be valid JSON".to_owned(),
        ]));
    };

    let payload = match serde_json::from_value::<SupportInquiryRequest>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return no_store_response(invalid_contact_request_body_response(vec![
                "body must include name, email, type, product, subject, and message".to_owned(),
            ]));
        }
    };

    let validation_errors = validate_support_inquiry_payload(&payload);
    if !validation_errors.is_empty() {
        return no_store_response(invalid_contact_request_body_response(validation_errors));
    }

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(inquiries_url) = config
        .contact_data
        .rest_url("support_inquiries", &[("select", "id".to_owned())])
    else {
        return contact_data_layer_not_ready_response(request);
    };
    let insert = SupportInquiryInsert {
        creator_id: &actor.claims.sub,
        email: &payload.email,
        message: &payload.message,
        name: &payload.name,
        product: &payload.product,
        subject: &payload.subject,
        inquiry_type: &payload.inquiry_type,
    };
    let body = match serde_json::to_string(&insert) {
        Ok(body) => body,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Internal server error" }),
            ));
        }
    };

    let response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Post,
        &inquiries_url,
        Some(&body),
        Some("return=representation"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(_) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Failed to create inquiry" }),
            ));
        }
    };

    let inserted = match decode_first_row::<SupportInquiryInsertRow>(&response) {
        Ok(Some(row)) => row,
        Ok(None) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Failed to create inquiry" }),
            ));
        }
    };

    no_store_response(json_response(
        201,
        json!({
            "success": true,
            "inquiryId": inserted.id,
        }),
    ))
}

async fn support_inquiry_data_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let updates = match support_inquiry_patch_updates(request.body_text) {
        Ok(updates) => updates,
        Err(response) => return no_store_response(*response),
    };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return support_inquiry_admin_unauthorized_response();
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return support_inquiry_admin_unauthorized_response();
    };

    if !supabase_auth::is_valid_tuturuuu_email(user.email.as_deref()) {
        return support_inquiry_admin_unauthorized_response();
    }

    let Some(inquiry_url) = config
        .contact_data
        .rest_url("support_inquiries", &[("id", format!("eq.{id}"))])
    else {
        return contact_data_layer_not_ready_response(request);
    };
    let body = match serde_json::to_string(&updates) {
        Ok(body) => body,
        Err(_) => return support_inquiry_internal_server_error_response(),
    };

    let response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Patch,
        &inquiry_url,
        Some(&body),
        Some("return=representation"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(_) | Err(_) => return support_inquiry_update_failed_response(),
    };

    let data = match decode_first_row::<serde_json::Value>(&response) {
        Ok(Some(row)) => row,
        Ok(None) | Err(_) => return support_inquiry_update_failed_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": data,
        }),
    ))
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

fn profile_patch_updates(
    body_text: Option<&str>,
) -> Result<serde_json::Value, Box<BackendResponse>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(Box::new(invalid_profile_request_body_response(vec![
            "body must be valid JSON".to_owned(),
        ])));
    };
    let Some(body) = body.as_object() else {
        return Err(Box::new(invalid_profile_request_body_response(vec![
            "body must be a JSON object".to_owned(),
        ])));
    };
    let mut updates = serde_json::Map::new();
    let mut errors = Vec::new();

    if let Some(value) = body.get("display_name") {
        match value.as_str() {
            Some(display_name) => {
                validate_string_length(
                    &mut errors,
                    "display_name",
                    display_name,
                    1,
                    MAX_DISPLAY_NAME_LENGTH,
                );
                updates.insert("display_name".to_owned(), json!(display_name));
            }
            None => errors.push("display_name must be a string".to_owned()),
        }
    }

    if let Some(value) = body.get("bio") {
        if value.is_null() {
            updates.insert("bio".to_owned(), serde_json::Value::Null);
        } else if let Some(bio) = value.as_str() {
            validate_string_length(&mut errors, "bio", bio, 0, MAX_BIO_LENGTH);
            updates.insert("bio".to_owned(), json!(bio));
        } else {
            errors.push("bio must be a string or null".to_owned());
        }
    }

    if let Some(value) = body.get("avatar_url") {
        if value.is_null() {
            updates.insert("avatar_url".to_owned(), serde_json::Value::Null);
        } else if let Some(avatar_url) = value.as_str() {
            if url::Url::parse(avatar_url).is_err() {
                errors.push("avatar_url must be a valid URL".to_owned());
            }
            updates.insert("avatar_url".to_owned(), json!(avatar_url));
        } else {
            errors.push("avatar_url must be a URL string or null".to_owned());
        }
    }

    if !errors.is_empty() {
        return Err(Box::new(invalid_profile_request_body_response(errors)));
    }

    if updates.is_empty() {
        return Err(Box::new(json_response(
            400,
            json!({ "message": "No valid fields to update" }),
        )));
    }

    Ok(serde_json::Value::Object(updates))
}

fn full_name_from_body(body_text: Option<&str>) -> Result<String, Box<BackendResponse>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&[], "body must be valid JSON"),
        ])));
    };
    let Some(body) = body.as_object() else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&[], "body must be a JSON object"),
        ])));
    };
    let Some(value) = body.get("full_name") else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&["full_name"], "full_name is required"),
        ])));
    };
    let Some(full_name) = value.as_str() else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&["full_name"], "full_name must be a string"),
        ])));
    };

    let trimmed = full_name.trim();
    let length = trimmed.encode_utf16().count();
    if length < 1 {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(
                &["full_name"],
                "full_name must contain at least 1 characters",
            ),
        ])));
    }
    if length > MAX_FULL_NAME_LENGTH {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(
                &["full_name"],
                format!("full_name must contain at most {MAX_FULL_NAME_LENGTH} characters"),
            ),
        ])));
    }

    Ok(trimmed.to_owned())
}

fn validation_issue(path: &[&str], message: impl Into<String>) -> serde_json::Value {
    json!({
        "message": message.into(),
        "path": path,
    })
}

fn invalid_full_name_response(errors: Vec<serde_json::Value>) -> BackendResponse {
    json_response(
        400,
        json!({
            "errors": errors,
            "message": "Invalid full name",
        }),
    )
}

fn invalid_profile_request_body_response(errors: Vec<String>) -> BackendResponse {
    json_response(
        400,
        json!({
            "errors": errors,
            "message": "Invalid request data",
        }),
    )
}

fn invalid_contact_request_body_response(errors: Vec<String>) -> BackendResponse {
    json_response(
        400,
        json!({
            "errors": errors,
            "message": "Invalid request body",
        }),
    )
}

fn support_inquiry_patch_updates(
    body_text: Option<&str>,
) -> Result<serde_json::Value, Box<BackendResponse>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(Box::new(support_inquiry_internal_server_error_response()));
    };
    let Some(body) = body.as_object() else {
        return Err(Box::new(invalid_support_inquiry_update_response(vec![
            json!({
                "path": [],
                "message": "Expected object",
            }),
        ])));
    };
    let mut updates = serde_json::Map::new();
    let mut errors = Vec::new();

    for field in ["is_read", "is_resolved"] {
        match body.get(field) {
            Some(value) if value.is_boolean() => {
                updates.insert(field.to_owned(), value.clone());
            }
            Some(_) => errors.push(json!({
                "path": [field],
                "message": "Expected boolean",
            })),
            None => {}
        }
    }

    if !errors.is_empty() {
        return Err(Box::new(invalid_support_inquiry_update_response(errors)));
    }

    Ok(serde_json::Value::Object(updates))
}

fn invalid_support_inquiry_update_response(details: Vec<serde_json::Value>) -> BackendResponse {
    json_response(
        400,
        json!({
            "details": details,
            "error": "Invalid request body",
        }),
    )
}

fn support_inquiry_admin_unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized. Only Tuturuuu accounts can update inquiries.",
        }),
    ))
}

fn support_inquiry_update_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to update inquiry",
        }),
    ))
}

fn support_inquiry_internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Internal server error",
        }),
    ))
}

fn validate_support_inquiry_payload(payload: &SupportInquiryRequest) -> Vec<String> {
    let mut errors = Vec::new();

    validate_string_length(
        &mut errors,
        "name",
        &payload.name,
        2,
        MAX_DISPLAY_NAME_LENGTH,
    );
    validate_email(&mut errors, &payload.email);
    validate_enum(
        &mut errors,
        "type",
        &payload.inquiry_type,
        &SUPPORT_INQUIRY_TYPES,
    );
    validate_enum(
        &mut errors,
        "product",
        &payload.product,
        &SUPPORT_INQUIRY_PRODUCTS,
    );
    validate_string_length(
        &mut errors,
        "subject",
        &payload.subject,
        5,
        MAX_SUPPORT_INQUIRY_SUBJECT_LENGTH,
    );
    validate_string_length(
        &mut errors,
        "message",
        &payload.message,
        10,
        MAX_SUPPORT_INQUIRY_LENGTH,
    );

    errors
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
