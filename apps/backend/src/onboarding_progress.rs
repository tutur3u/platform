use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    parse_json_body, supabase_auth,
};

pub(crate) const ONBOARDING_PROGRESS_PATH: &str = "/api/v1/user/onboarding-progress";
const ONBOARDING_PROGRESS_TABLE: &str = "onboarding_progress";
const ALLOWED_ONBOARDING_PROGRESS_FIELDS: [&str; 15] = [
    "completed_steps",
    "current_step",
    "workspace_name",
    "workspace_description",
    "workspace_avatar_url",
    "profile_completed",
    "tour_completed",
    "completed_at",
    "use_case",
    "flow_type",
    "invited_emails",
    "theme_preference",
    "language_preference",
    "notifications_enabled",
    "team_workspace_id",
];
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_BODY_MESSAGE: &str = "Invalid request body";
const NO_VALID_FIELDS_MESSAGE: &str = "No valid fields to update";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch onboarding progress";
const UPDATE_FAILED_MESSAGE: &str = "Failed to update onboarding progress";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OnboardingProgressUpdatesError {
    InvalidBody,
    NoValidFields,
}

pub(crate) async fn handle_onboarding_progress_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ONBOARDING_PROGRESS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => onboarding_progress_get_response(&config.contact_data, request, outbound).await,
        "PATCH" => {
            onboarding_progress_patch_response(&config.contact_data, request, outbound).await
        }
        method => method_not_allowed(method, "GET, PATCH"),
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!((method, path), ("PATCH", ONBOARDING_PROGRESS_PATH))
}

async fn onboarding_progress_get_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user_id) = authenticated_user_id(contact_data, request, outbound).await else {
        return unauthorized_response();
    };

    let progress = match fetch_onboarding_progress(contact_data, &user_id, outbound).await {
        Ok(progress) => progress,
        Err(()) => return fetch_failed_response(),
    };

    no_store_response(json_response(200, progress.unwrap_or(Value::Null)))
}

async fn onboarding_progress_patch_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user_id) = authenticated_user_id(contact_data, request, outbound).await else {
        return unauthorized_response();
    };
    let updates = match onboarding_progress_updates(request.body_text) {
        Ok(updates) => updates,
        Err(error) => return onboarding_progress_updates_error_response(error),
    };

    let progress = match upsert_onboarding_progress(contact_data, &user_id, updates, outbound).await
    {
        Ok(progress) => progress,
        Err(()) => return update_failed_response(),
    };

    no_store_response(json_response(200, progress))
}

async fn authenticated_user_id(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await?;

    user.id.filter(|id| !id.trim().is_empty())
}

async fn fetch_onboarding_progress(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        ONBOARDING_PROGRESS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_onboarding_progress_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        None,
        None,
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    first_row_or_value(&response)
}

async fn upsert_onboarding_progress(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    mut updates: Map<String, Value>,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    updates.insert("user_id".to_owned(), Value::String(user_id.to_owned()));
    let body_text = Value::Object(updates).to_string();
    let Some(url) = contact_data.rest_url(
        ONBOARDING_PROGRESS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("on_conflict", "user_id".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_onboarding_progress_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        Some(&body_text),
        Some("resolution=merge-duplicates,return=representation"),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    first_row_or_value(&response)?.ok_or(())
}

async fn send_onboarding_progress_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
    prefer: Option<&'static str>,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
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

    outbound.send(request).await.map_err(|_| ())
}

fn onboarding_progress_updates(
    body_text: Option<&str>,
) -> Result<Map<String, Value>, OnboardingProgressUpdatesError> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(OnboardingProgressUpdatesError::InvalidBody);
    };
    let Some(body) = body.as_object() else {
        return Err(OnboardingProgressUpdatesError::InvalidBody);
    };
    let mut updates = Map::new();

    for field in ALLOWED_ONBOARDING_PROGRESS_FIELDS {
        if let Some(value) = body.get(field) {
            updates.insert(field.to_owned(), value.clone());
        }
    }

    if updates.is_empty() {
        return Err(OnboardingProgressUpdatesError::NoValidFields);
    }

    Ok(updates)
}

fn onboarding_progress_updates_error_response(
    error: OnboardingProgressUpdatesError,
) -> BackendResponse {
    match error {
        OnboardingProgressUpdatesError::InvalidBody => invalid_body_response(),
        OnboardingProgressUpdatesError::NoValidFields => no_valid_fields_response(),
    }
}

fn first_row_or_value(response: &OutboundResponse) -> Result<Option<Value>, ()> {
    let value = response.json::<Value>().map_err(|_| ())?;

    match value {
        Value::Array(rows) => Ok(rows.into_iter().next()),
        Value::Null => Ok(None),
        value => Ok(Some(value)),
    }
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "message": UNAUTHORIZED_MESSAGE,
        }),
    ))
}

fn invalid_body_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": INVALID_BODY_MESSAGE,
        }),
    ))
}

fn no_valid_fields_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": NO_VALID_FIELDS_MESSAGE,
        }),
    ))
}

fn fetch_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": FETCH_FAILED_MESSAGE,
        }),
    ))
}

fn update_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": UPDATE_FAILED_MESSAGE,
        }),
    ))
}
