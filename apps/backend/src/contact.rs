use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response,
    parse_json_body, url_origin,
};

mod session;

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
pub(crate) const SUPPORT_INQUIRIES_PATH: &str = "/api/v1/inquiries";
const CURRENT_USER_APP_SESSION_TARGETS: [&str; 17] = [
    "calendar",
    "chat",
    "cms",
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
const MAX_EMAIL_LENGTH: usize = 320;
const MAX_SUPPORT_INQUIRY_LENGTH: usize = 5000;
const MAX_SUPPORT_INQUIRY_SUBJECT_LENGTH: usize = 255;
pub(crate) const CONTACT_DATA_LAYER_NOT_READY_MESSAGE: &str =
    "Rust contact data persistence is not configured yet";

#[cfg(test)]
pub(crate) fn current_user_app_session_targets() -> &'static [&'static str] {
    &CURRENT_USER_APP_SESSION_TARGETS
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
struct SupportInquiryRequest {
    email: String,
    message: String,
    name: String,
    product: String,
    subject: String,
    #[serde(rename = "type")]
    inquiry_type: String,
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

    contact_data_layer_not_ready_response(request)
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, path),
        ("PATCH", CURRENT_USER_PROFILE_PATH) | ("POST", SUPPORT_INQUIRIES_PATH)
    )
}

fn contact_data_layer_not_ready_response(request: BackendRequest<'_>) -> BackendResponse {
    no_store_response(json_response(
        501,
        json!({
            "code": "CONTACT_DATA_LAYER_NOT_READY",
            "message": CONTACT_DATA_LAYER_NOT_READY_MESSAGE,
            "requestId": request.request_id.unwrap_or("unknown"),
        }),
    ))
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

fn validate_string_length(
    errors: &mut Vec<String>,
    field: &str,
    value: &str,
    min_length: usize,
    max_length: usize,
) {
    let length = value.chars().count();

    if length < min_length {
        errors.push(format!(
            "{field} must contain at least {min_length} characters"
        ));
    }

    if length > max_length {
        errors.push(format!(
            "{field} must contain at most {max_length} characters"
        ));
    }
}

fn validate_email(errors: &mut Vec<String>, value: &str) {
    if value.chars().count() > MAX_EMAIL_LENGTH {
        errors.push(format!(
            "email must contain at most {MAX_EMAIL_LENGTH} characters"
        ));
        return;
    }

    let Some((local, domain)) = value.split_once('@') else {
        errors.push("email must be a valid email address".to_owned());
        return;
    };

    if local.is_empty()
        || domain.is_empty()
        || !domain.contains('.')
        || value.chars().any(char::is_whitespace)
    {
        errors.push("email must be a valid email address".to_owned());
    }
}

fn validate_enum(errors: &mut Vec<String>, field: &str, value: &str, allowed: &[&str]) {
    if !allowed.contains(&value) {
        errors.push(format!("{field} is not supported"));
    }
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

fn unix_seconds_to_iso8601(seconds: u64) -> String {
    let days = seconds / 86_400;
    let seconds_of_day = seconds % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month_prime = month_prime as i32;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };

    (year as i32, month as u32, day as u32)
}
