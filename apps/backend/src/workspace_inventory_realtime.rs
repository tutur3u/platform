use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const INVENTORY_REALTIME_SECRET: &str = "ENABLE_INVENTORY_REALTIME_BROADCAST";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_INVENTORY_REALTIME_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_INVENTORY_REALTIME_PATH_SUFFIX: &str = "/inventory/realtime";

const INVENTORY_DASHBOARD_PERMISSIONS: [&str; 2] = ["view_inventory_dashboard", "view_inventory"];

#[derive(Serialize)]
struct WorkspaceInventoryRealtimeResponse {
    enabled: bool,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceDefaultPermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(crate) async fn handle_workspace_inventory_realtime_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_inventory_realtime_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_inventory_realtime_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_inventory_realtime_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) => return error_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // Mirror authorizeInventoryWorkspace: membership must resolve and be MEMBER.
    let membership_type =
        match workspace_membership_type(&config.contact_data, outbound, &resolved_ws_id, &user)
            .await
        {
            Ok(membership_type) => membership_type,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };
    match membership_type.as_deref() {
        Some("MEMBER") => {}
        _ => return message_response(403, FORBIDDEN_MESSAGE),
    }

    // Mirror canViewInventoryDashboard against the resolved permission set.
    let can_view = match can_view_inventory_dashboard(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user,
        membership_type.as_deref(),
    )
    .await
    {
        Ok(can_view) => can_view,
        Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
    };
    if !can_view {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    let enabled = inventory_realtime_enabled(&config.contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false);

    no_store_response(json_response(
        200,
        WorkspaceInventoryRealtimeResponse { enabled },
    ))
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| AuthenticatedUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(AuthenticatedUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

async fn can_view_inventory_dashboard(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
    membership_type: Option<&str>,
) -> Result<bool, ()> {
    let membership_type = membership_type.unwrap_or("MEMBER");
    let Some(creator) = workspace_creator(contact_data, outbound, ws_id).await? else {
        // Workspace not found -> getPermissions returns null -> Not found.
        return Err(());
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, membership_type).await?;
    let is_creator = membership_type == "MEMBER" && creator.as_deref() == Some(&user.id);

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(is_creator
        || permissions.iter().any(|value| value == "admin")
        || permissions
            .iter()
            .any(|permission| INVENTORY_DASHBOARD_PERMISSIONS.contains(&permission.as_str())))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
        {
            return Ok(Some(workspace_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{}", user.id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceMembershipRow>(&response)
        .map(|row| row.map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_creator(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<Option<String>>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceCreatorRow>(&response).map(|row| row.map(|row| row.creator_id))
}

async fn workspace_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        collect_role_permissions(&row, &mut permissions);
    }

    Ok(permissions)
}

async fn workspace_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{membership_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<WorkspaceDefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn inventory_realtime_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{INVENTORY_REALTIME_SECRET}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(decode_first_row::<WorkspaceSecretRow>(&response)?
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

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

fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique_permissions(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

fn workspace_inventory_realtime_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_INVENTORY_REALTIME_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_INVENTORY_REALTIME_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
