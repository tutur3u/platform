use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

pub(crate) const INFRASTRUCTURE_TIMEZONES_PATH: &str = "/api/v1/infrastructure/timezones";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const TIMEZONES_LOAD_ERROR: &str = "Error fetching timezones";
const TIMEZONES_TABLE: &str = "timezones";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TimezonesAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

pub(crate) async fn handle_timezones_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != INFRASTRUCTURE_TIMEZONES_PATH || request.method != "GET" {
        return None;
    }

    Some(timezones_response(config, request, outbound).await)
}

async fn timezones_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if let Err(error) = authorize_timezones_operator(config, request, outbound).await {
        return timezones_auth_error_response(error);
    }

    match list_timezones(config, outbound).await {
        Ok(timezones) => no_store_response(json_response(200, timezones)),
        Err(()) => timezones_load_error_response(),
    }
}

async fn authorize_timezones_operator(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), TimezonesAuthError> {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return Err(TimezonesAuthError::Internal);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(TimezonesAuthError::Unauthorized);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(TimezonesAuthError::Unauthorized);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(TimezonesAuthError::Unauthorized);
    };

    match has_root_workspace_permission(
        contact_data,
        outbound,
        &user_id,
        MANAGE_WORKSPACE_ROLES_PERMISSION,
    )
    .await
    {
        Ok(true) => Ok(()),
        Ok(false) => Err(TimezonesAuthError::Forbidden),
        Err(()) => Err(TimezonesAuthError::Internal),
    }
}

async fn has_root_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    permission: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ROOT_WORKSPACE_ID,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

async fn list_timezones(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let Some(url) = config.contact_data.rest_url(
        TIMEZONES_TABLE,
        &[
            (
                "select",
                "id,value,abbr,offset,isdst,text,utc,created_at".to_owned(),
            ),
            ("order", "value.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = config.contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn timezones_auth_error_response(error: TimezonesAuthError) -> BackendResponse {
    match error {
        TimezonesAuthError::Unauthorized => {
            no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
        }
        TimezonesAuthError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": "Forbidden" })))
        }
        TimezonesAuthError::Internal => timezones_load_error_response(),
    }
}

fn timezones_load_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": TIMEZONES_LOAD_ERROR }),
    ))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}
