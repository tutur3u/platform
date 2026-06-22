use serde::Serialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

pub(crate) const INFRASTRUCTURE_TIMEZONES_PATH: &str = "/api/v1/infrastructure/timezones";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const INFRASTRUCTURE_TIMEZONES_DETAIL_PATH_PREFIX: &str = "/api/v1/infrastructure/timezones/";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const TIMEZONE_DELETE_ERROR: &str = "Error deleting timezone";
const TIMEZONE_UPDATE_ERROR: &str = "Error updating timezone";
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
    match (request.method, request.path) {
        ("GET", INFRASTRUCTURE_TIMEZONES_PATH) => {
            Some(timezones_response(config, request, outbound).await)
        }
        ("PUT", path) => {
            let timezone_id = path.strip_prefix(INFRASTRUCTURE_TIMEZONES_DETAIL_PATH_PREFIX)?;
            Some(timezone_update_response(config, request, outbound, timezone_id).await)
        }
        ("DELETE", path) => {
            let timezone_id = path.strip_prefix(INFRASTRUCTURE_TIMEZONES_DETAIL_PATH_PREFIX)?;
            Some(timezone_delete_response(config, request, outbound, timezone_id).await)
        }
        _ => None,
    }
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

async fn timezone_update_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    timezone_id: &str,
) -> BackendResponse {
    if let Err(error) = authorize_timezones_operator(config, request, outbound).await {
        return timezones_auth_error_response(error);
    }

    let Ok(body) = timezone_update_body(request.body_text) else {
        return timezone_update_error_response();
    };

    match update_timezone(config, outbound, timezone_id, &body).await {
        Ok(()) => no_store_response(json_response(200, json!({ "message": "success" }))),
        Err(()) => timezone_update_error_response(),
    }
}

async fn timezone_delete_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    timezone_id: &str,
) -> BackendResponse {
    if let Err(error) = authorize_timezones_operator(config, request, outbound).await {
        return timezones_auth_error_response(error);
    }

    match delete_timezone(config, outbound, timezone_id).await {
        Ok(()) => no_store_response(json_response(200, json!({ "message": "success" }))),
        Err(()) => timezone_delete_error_response(),
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

async fn update_timezone(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    timezone_id: &str,
    body: &Value,
) -> Result<(), ()> {
    let Some(url) = config
        .contact_data
        .rest_url(TIMEZONES_TABLE, &[("id", format!("eq.{timezone_id}"))])
    else {
        return Err(());
    };
    let body = serde_json::to_string(body).map_err(|_| ())?;
    let response = send_private_timezone_request(
        config,
        outbound,
        OutboundMethod::Patch,
        &url,
        Some(&body),
        Some("return=minimal"),
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(())
}

async fn delete_timezone(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    timezone_id: &str,
) -> Result<(), ()> {
    let Some(url) = config
        .contact_data
        .rest_url(TIMEZONES_TABLE, &[("id", format!("eq.{timezone_id}"))])
    else {
        return Err(());
    };
    let response = send_private_timezone_request(
        config,
        outbound,
        OutboundMethod::Delete,
        &url,
        None,
        Some("return=minimal"),
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(())
}

async fn send_private_timezone_request(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
    prefer: Option<&'static str>,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let Some(service_role_key) = config.contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Content-Profile", PRIVATE_SCHEMA);

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

fn timezone_update_body(body_text: Option<&str>) -> Result<Value, ()> {
    let body = body_text
        .and_then(|body_text| serde_json::from_str::<Value>(body_text).ok())
        .ok_or(())?;
    let body = body.as_object().ok_or(())?;

    Ok(json!({
        "value": normalized_string(body, "value"),
        "abbr": normalized_string(body, "abbr"),
        "offset": normalized_offset(body),
        "isdst": normalized_bool(body, "isdst"),
        "text": normalized_string(body, "text"),
        "utc": normalized_utc(body.get("utc")),
    }))
}

fn normalized_string(body: &Map<String, Value>, key: &str) -> String {
    body.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn normalized_bool(body: &Map<String, Value>, key: &str) -> bool {
    body.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn normalized_offset(body: &Map<String, Value>) -> Value {
    body.get("offset")
        .filter(|value| value.is_number())
        .cloned()
        .unwrap_or_else(|| json!(0))
}

fn normalized_utc(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .collect(),
        _ => Vec::new(),
    }
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

fn timezone_update_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": TIMEZONE_UPDATE_ERROR }),
    ))
}

fn timezone_delete_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": TIMEZONE_DELETE_ERROR }),
    ))
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
