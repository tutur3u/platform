use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    json_response_with_cache_control,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const USERS_TASK_SETTINGS_PATH: &str = "/api/v1/users/task-settings";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch user task settings";
// Mirrors the legacy GET Cache-Control header exactly.
const TASK_SETTINGS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=30";

#[derive(Serialize)]
struct TaskSettingsResponse {
    task_auto_assign_to_self: bool,
    fade_completed_tasks: bool,
}

#[derive(Deserialize)]
struct TaskSettingsRow {
    task_auto_assign_to_self: Option<bool>,
    fade_completed_tasks: Option<bool>,
}

pub(crate) async fn handle_users_task_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != USERS_TASK_SETTINGS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => task_settings_response(config, request, outbound).await,
        // Only GET is migrated. Return None for every other method so the
        // Cloudflare worker falls through to the still-active Next.js route
        // (e.g. PATCH), instead of 405-ing a still-valid mutation.
        _ => return None,
    })
}

async fn task_settings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_task_settings(&config.contact_data, outbound, &user_id, &access_token).await {
        Ok(row) => {
            let task_auto_assign_to_self = row
                .as_ref()
                .and_then(|row| row.task_auto_assign_to_self)
                .unwrap_or(false);
            let fade_completed_tasks = row
                .as_ref()
                .and_then(|row| row.fade_completed_tasks)
                .unwrap_or(false);

            json_response_with_cache_control(
                200,
                TaskSettingsResponse {
                    task_auto_assign_to_self,
                    fade_completed_tasks,
                },
                TASK_SETTINGS_CACHE_CONTROL,
            )
        }
        Err(()) => error_response(500, FETCH_FAILED_MESSAGE),
    }
}

async fn fetch_task_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<TaskSettingsRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            (
                "select",
                "task_auto_assign_to_self,fade_completed_tasks".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskSettingsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

// Copied from workspace_habits_access.rs (file-local) to keep this module
// self-contained without editing the shared module.
async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    crate::json_response(status, json!({ "error": message }))
}
