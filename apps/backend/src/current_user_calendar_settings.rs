use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    parse_json_body, supabase_auth,
};

pub(crate) const CURRENT_USER_CALENDAR_SETTINGS_PATH: &str = "/api/v1/users/calendar-settings";
const CALENDAR_SETTINGS_APP_SESSION_TARGETS: [&str; 1] = ["calendar"];
const CALENDAR_SETTINGS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=30";
const FETCH_ERROR_MESSAGE: &str = "Failed to fetch user calendar settings";
const INVALID_REQUEST_DATA_MESSAGE: &str = "Invalid request data";
const MAX_SHORT_TEXT_LENGTH: usize = 100;
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const UPDATE_ERROR_MESSAGE: &str = "Failed to update user calendar settings";
const USER_PRIVATE_DETAILS_TABLE: &str = "user_private_details";
const UNAUTHORIZED_ERROR: &str = "Unauthorized";

#[derive(Clone, Debug, Eq, PartialEq)]
enum DataAuth {
    AccessToken(String),
    ServiceRole,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CurrentUser {
    data_auth: DataAuth,
    id: String,
}

#[derive(Deserialize, Serialize)]
struct CalendarSettingsResponse {
    timezone: String,
    first_day_of_week: String,
    time_format: String,
}

#[derive(Default)]
struct CalendarSettingsPatch {
    first_day_of_week: Option<String>,
    time_format: Option<String>,
    timezone: Option<String>,
}

pub(crate) async fn handle_current_user_calendar_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != CURRENT_USER_CALENDAR_SETTINGS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => calendar_settings_get_response(config, request, outbound).await,
        "PATCH" => calendar_settings_patch_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET, PATCH")),
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, path),
        ("PATCH", CURRENT_USER_CALENDAR_SETTINGS_PATH)
    )
}

async fn calendar_settings_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match current_user(config, request, outbound).await {
        Ok(user) => user,
        Err(response) => return response,
    };

    match fetch_calendar_settings(&config.contact_data, outbound, &user).await {
        Ok(settings) => private_cached_response(json_response(200, settings)),
        Err(()) => no_store_response(json_response(500, json!({ "error": FETCH_ERROR_MESSAGE }))),
    }
}

async fn calendar_settings_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match current_user(config, request, outbound).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let patch = match calendar_settings_patch(request.body_text) {
        Ok(patch) => patch,
        Err(errors) => {
            return no_store_response(json_response(
                400,
                json!({
                    "error": INVALID_REQUEST_DATA_MESSAGE,
                    "details": errors,
                }),
            ));
        }
    };

    match update_calendar_settings(&config.contact_data, outbound, &user, patch).await {
        Ok(settings) => no_store_response(json_response(200, settings)),
        Err(()) => no_store_response(json_response(500, json!({ "error": UPDATE_ERROR_MESSAGE }))),
    }
}

async fn current_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<CurrentUser, BackendResponse> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            &CALENDAR_SETTINGS_APP_SESSION_TARGETS,
        )
        .map_err(|_| unauthorized_response())?;

        return Ok(CurrentUser {
            data_auth: DataAuth::ServiceRole,
            id: identity.id,
        });
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(unauthorized_response());
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return Err(unauthorized_response());
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(unauthorized_response());
    };

    Ok(CurrentUser {
        data_auth: DataAuth::AccessToken(access_token),
        id: user_id,
    })
}

async fn fetch_calendar_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &CurrentUser,
) -> Result<CalendarSettingsResponse, ()> {
    let url = calendar_settings_url(contact_data, &user.id).ok_or(())?;
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &user.data_auth,
        None,
    )
    .await?;

    calendar_settings_from_response(&response)
}

async fn update_calendar_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &CurrentUser,
    patch: CalendarSettingsPatch,
) -> Result<CalendarSettingsResponse, ()> {
    let url = calendar_settings_url(contact_data, &user.id).ok_or(())?;
    let body = calendar_settings_patch_body(patch).to_string();
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        &user.data_auth,
        Some(&body),
    )
    .await?;

    calendar_settings_from_response(&response)
}

fn calendar_settings_url(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
) -> Option<String> {
    contact_data.rest_url(
        USER_PRIVATE_DETAILS_TABLE,
        &[
            (
                "select",
                "timezone,first_day_of_week,time_format".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth,
    body: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };
    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", POSTGREST_SINGLE_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if body.is_some() {
        request = request
            .with_header("Content-Type", APPLICATION_JSON)
            .with_header("Prefer", "return=representation");
    }
    if let Some(body) = body {
        request = request.with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn calendar_settings_from_response(
    response: &OutboundResponse,
) -> Result<CalendarSettingsResponse, ()> {
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let row = response.json::<Value>().map_err(|_| ())?;

    Ok(CalendarSettingsResponse {
        timezone: string_setting_or_auto(&row, "timezone"),
        first_day_of_week: string_setting_or_auto(&row, "first_day_of_week"),
        time_format: string_setting_or_auto(&row, "time_format"),
    })
}

fn string_setting_or_auto(row: &Value, key: &str) -> String {
    row.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("auto")
        .to_owned()
}

fn calendar_settings_patch(body_text: Option<&str>) -> Result<CalendarSettingsPatch, Vec<Value>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(vec![validation_issue(&[], "body must be valid JSON")]);
    };
    let Some(body) = body.as_object() else {
        return Err(vec![validation_issue(&[], "body must be a JSON object")]);
    };

    let mut patch = CalendarSettingsPatch::default();
    let mut errors = Vec::new();

    if let Some(value) = body.get("timezone") {
        match value.as_str() {
            Some(value) if value.len() <= MAX_SHORT_TEXT_LENGTH => {
                patch.timezone = Some(value.to_owned());
            }
            Some(_) => errors.push(validation_issue(
                &["timezone"],
                format!("String must contain at most {MAX_SHORT_TEXT_LENGTH} character(s)"),
            )),
            None => errors.push(validation_issue(&["timezone"], "Expected string")),
        }
    }

    if let Some(value) = body.get("first_day_of_week") {
        match value.as_str() {
            Some(value) if matches!(value, "auto" | "sunday" | "monday" | "saturday") => {
                patch.first_day_of_week = Some(value.to_owned());
            }
            Some(_) => errors.push(validation_issue(
                &["first_day_of_week"],
                "Invalid enum value. Expected 'auto' | 'sunday' | 'monday' | 'saturday'",
            )),
            None => errors.push(validation_issue(&["first_day_of_week"], "Expected string")),
        }
    }

    if let Some(value) = body.get("time_format") {
        match value.as_str() {
            Some(value) if matches!(value, "auto" | "12h" | "24h") => {
                patch.time_format = Some(value.to_owned());
            }
            Some(_) => errors.push(validation_issue(
                &["time_format"],
                "Invalid enum value. Expected 'auto' | '12h' | '24h'",
            )),
            None => errors.push(validation_issue(&["time_format"], "Expected string")),
        }
    }

    if errors.is_empty() {
        Ok(patch)
    } else {
        Err(errors)
    }
}

fn calendar_settings_patch_body(patch: CalendarSettingsPatch) -> Value {
    let mut body = serde_json::Map::new();

    if let Some(timezone) = patch.timezone {
        body.insert("timezone".to_owned(), json!(timezone));
    }
    if let Some(first_day_of_week) = patch.first_day_of_week {
        body.insert("first_day_of_week".to_owned(), json!(first_day_of_week));
    }
    if let Some(time_format) = patch.time_format {
        body.insert("time_format".to_owned(), json!(time_format));
    }

    Value::Object(body)
}

fn validation_issue(path: &[&str], message: impl Into<String>) -> Value {
    json!({
        "message": message.into(),
        "path": path,
    })
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": UNAUTHORIZED_ERROR })))
}

fn private_cached_response(mut response: BackendResponse) -> BackendResponse {
    response.cache_control = Some(CALENDAR_SETTINGS_CACHE_CONTROL);
    response
}
