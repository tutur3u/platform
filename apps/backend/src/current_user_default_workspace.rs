use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    parse_json_body, supabase_auth,
};

pub(crate) const CURRENT_USER_DEFAULT_WORKSPACE_PATH: &str = "/api/v1/users/me/default-workspace";
const DEFAULT_WORKSPACE_GET_CACHE_CONTROL: &str = "private, max-age=300, stale-while-revalidate=60";
const INVALID_REQUEST_DATA_MESSAGE: &str = "Invalid request data";
const UNAUTHORIZED_ERROR: &str = "Unauthorized";
const MEMBERSHIP_ERROR: &str = "Workspace not found or access denied";
const UPDATE_ERROR: &str = "Error updating default workspace";

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
struct WorkspaceResponse {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    personal: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
struct PrivateDetailsRow {
    default_workspace_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
struct MembershipRow {
    ws_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum PatchDefaultWorkspace {
    Clear,
    Set(String),
}

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

pub(crate) async fn handle_current_user_default_workspace_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != CURRENT_USER_DEFAULT_WORKSPACE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => default_workspace_get_response(config, request, outbound).await,
        "PATCH" => default_workspace_patch_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET, PATCH")),
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, path),
        ("PATCH", CURRENT_USER_DEFAULT_WORKSPACE_PATH)
    )
}

async fn default_workspace_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match current_user_for_get(config, request, outbound).await {
        Ok(user) => user,
        Err(response) => return response,
    };

    private_cached_response(json_response(
        200,
        default_workspace_for_user(&config.contact_data, &user, outbound).await,
    ))
}

async fn default_workspace_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let (user_id, access_token) =
        match authenticated_supabase_session_user(&config.contact_data, request, outbound).await {
            Ok(user) => user,
            Err(response) => return response,
        };
    let patch = match patch_default_workspace(request.body_text) {
        Ok(patch) => patch,
        Err(errors) => return invalid_request_data_response(errors),
    };

    match patch {
        PatchDefaultWorkspace::Clear => {
            update_default_workspace(
                &config.contact_data,
                outbound,
                &user_id,
                &access_token,
                None,
            )
            .await
        }
        PatchDefaultWorkspace::Set(workspace_id) => {
            if !has_workspace_membership(
                &config.contact_data,
                outbound,
                &user_id,
                &access_token,
                &workspace_id,
            )
            .await
            {
                return patch_error_response(MEMBERSHIP_ERROR.to_owned());
            }

            update_default_workspace(
                &config.contact_data,
                outbound,
                &user_id,
                &access_token,
                Some(&workspace_id),
            )
            .await
        }
    }
}

async fn current_user_for_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<CurrentUser, BackendResponse> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .map_err(|_| unauthorized_response())?;

        return Ok(CurrentUser {
            data_auth: DataAuth::ServiceRole,
            id: identity.id,
        });
    }

    let (id, access_token) =
        authenticated_supabase_session_user(&config.contact_data, request, outbound).await?;
    Ok(CurrentUser {
        data_auth: DataAuth::AccessToken(access_token),
        id,
    })
}

async fn authenticated_supabase_session_user(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(String, String), BackendResponse> {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(unauthorized_response());
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(unauthorized_response());
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(unauthorized_response());
    };

    Ok((user_id, access_token))
}

async fn default_workspace_for_user(
    contact_data: &contact::ContactDataConfig,
    user: &CurrentUser,
    outbound: &impl OutboundHttpClient,
) -> Option<WorkspaceResponse> {
    let default_workspace_id = fetch_default_workspace_id(contact_data, user, outbound).await?;

    if let Some(workspace_id) = default_workspace_id.filter(|id| !id.trim().is_empty()) {
        if let Some(workspace) =
            fetch_workspace_by_id(contact_data, user, outbound, &workspace_id).await
        {
            return Some(workspace);
        }
    }

    fetch_personal_workspace(contact_data, user, outbound).await
}

async fn fetch_default_workspace_id(
    contact_data: &contact::ContactDataConfig,
    user: &CurrentUser,
    outbound: &impl OutboundHttpClient,
) -> Option<Option<String>> {
    let url = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "default_workspace_id".to_owned()),
            ("user_id", format!("eq.{}", user.id)),
            ("limit", "1".to_owned()),
        ],
    )?;
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &user.data_auth,
        None,
        None,
    )
    .await
    .ok()?;

    if !is_success_status(response.status) {
        return None;
    }

    decode_first_row::<PrivateDetailsRow>(&response)
        .ok()?
        .map(|row| row.default_workspace_id)
}

async fn fetch_workspace_by_id(
    contact_data: &contact::ContactDataConfig,
    user: &CurrentUser,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Option<WorkspaceResponse> {
    let url = workspace_url(
        contact_data,
        &[
            ("id", format!("eq.{workspace_id}")),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("limit", "1".to_owned()),
        ],
    )?;
    fetch_first_workspace(contact_data, outbound, &url, &user.data_auth).await
}

async fn fetch_personal_workspace(
    contact_data: &contact::ContactDataConfig,
    user: &CurrentUser,
    outbound: &impl OutboundHttpClient,
) -> Option<WorkspaceResponse> {
    let url = workspace_url(
        contact_data,
        &[
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("personal", "eq.true".to_owned()),
            ("limit", "1".to_owned()),
        ],
    )?;
    fetch_first_workspace(contact_data, outbound, &url, &user.data_auth).await
}

async fn fetch_first_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth,
) -> Option<WorkspaceResponse> {
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        url,
        auth,
        None,
        None,
    )
    .await
    .ok()?;

    if !is_success_status(response.status) {
        return None;
    }

    decode_first_row::<WorkspaceResponse>(&response)
        .ok()
        .flatten()
}

fn workspace_url(
    contact_data: &contact::ContactDataConfig,
    filters: &[(&str, String)],
) -> Option<String> {
    let mut params = vec![(
        "select",
        "id,name,personal,workspace_members!inner(user_id)".to_owned(),
    )];
    params.extend_from_slice(filters);
    contact_data.rest_url("workspaces", &params)
}

async fn has_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
    workspace_id: &str,
) -> bool {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "ws_id".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let auth = DataAuth::AccessToken(access_token.to_owned());
    let Ok(response) = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &auth,
        None,
        None,
    )
    .await
    else {
        return false;
    };

    is_success_status(response.status)
        && decode_first_row::<MembershipRow>(&response)
            .ok()
            .flatten()
            .and_then(|row| row.ws_id)
            .is_some()
}

async fn update_default_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
    workspace_id: Option<&str>,
) -> BackendResponse {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[("user_id", format!("eq.{user_id}"))],
    ) else {
        return patch_error_response(UPDATE_ERROR.to_owned());
    };
    let body = json!({ "default_workspace_id": workspace_id }).to_string();
    let auth = DataAuth::AccessToken(access_token.to_owned());
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        &auth,
        Some(&body),
        Some("return=minimal"),
    )
    .await;

    match response {
        Ok(response) if is_success_status(response.status) => {
            no_store_response(json_response(200, json!({ "success": true })))
        }
        Ok(response) => patch_error_response(error_message(&response, UPDATE_ERROR)),
        Err(()) => patch_error_response(UPDATE_ERROR.to_owned()),
    }
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth,
    body: Option<&str>,
    prefer: Option<&'static str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };
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

fn patch_default_workspace(body_text: Option<&str>) -> Result<PatchDefaultWorkspace, Vec<Value>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(vec![validation_issue(&[], "body must be valid JSON")]);
    };
    let Some(body) = body.as_object() else {
        return Err(vec![validation_issue(&[], "body must be a JSON object")]);
    };
    let Some(workspace_id) = body.get("workspaceId") else {
        return Err(vec![validation_issue(
            &["workspaceId"],
            "workspaceId is required",
        )]);
    };

    if workspace_id.is_null() {
        return Ok(PatchDefaultWorkspace::Clear);
    }
    match workspace_id.as_str() {
        Some(value) if is_uuid(value) => Ok(PatchDefaultWorkspace::Set(value.to_owned())),
        _ => Err(vec![validation_issue(
            &["workspaceId"],
            "workspaceId must be a UUID or null",
        )]),
    }
}

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, value)| match index {
            8 | 13 | 18 | 23 => value == '-',
            _ => value.is_ascii_hexdigit(),
        })
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn error_message(response: &OutboundResponse, fallback: &str) -> String {
    serde_json::from_str::<Value>(&response.body_text)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| fallback.to_owned())
}

fn validation_issue(path: &[&str], message: impl Into<String>) -> Value {
    json!({
        "message": message.into(),
        "path": path,
    })
}

fn invalid_request_data_response(errors: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "error": INVALID_REQUEST_DATA_MESSAGE,
            "errors": errors,
        }),
    ))
}

fn patch_error_response(error: String) -> BackendResponse {
    no_store_response(json_response(400, json!({ "error": error })))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": UNAUTHORIZED_ERROR })))
}

fn private_cached_response(mut response: BackendResponse) -> BackendResponse {
    response.cache_control = Some(DEFAULT_WORKSPACE_GET_CACHE_CONTROL);
    response
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}
