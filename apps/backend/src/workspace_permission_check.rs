use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_PERMISSION: &str = "admin";
const APP_SESSION_BEARER_PREFIX: &str = "ttr_app_";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const MISSING_PERMISSION_MESSAGE: &str = "Missing permission";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_PERMISSIONS_CACHE_CONTROL: &str = "private, max-age=30, stale-while-revalidate=30";
const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";
const WORKSPACE_PERMISSION_CHECK_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_PERMISSION_CHECK_PATH_SUFFIX: &str = "/settings/permissions/check";
const WORKSPACE_SETTINGS_PERMISSIONS_PATH_SUFFIX: &str = "/settings/permissions";

#[derive(Clone, Debug, Default)]
struct SupabaseAuthCookieGroup {
    base: Option<String>,
    chunks: BTreeMap<usize, String>,
    duplicate: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct EffectiveWorkspacePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

struct AuthenticatedWorkspaceUser {
    access_token: Option<String>,
    id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct WorkspacePermissionAuthorization {
    pub(crate) ws_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum WorkspacePermissionAuthorizationError {
    Forbidden,
    Internal,
    NotFound,
    Unauthorized,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseCookieSession {
    access_token: Option<String>,
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
struct WorkspaceRow {
    creator_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePermissionCheckResponse {
    has_permission: bool,
}

#[derive(Serialize)]
struct WorkspaceSettingsPermissionsResponse {
    manage_subscription: bool,
    manage_workspace_settings: bool,
    manage_workspace_members: bool,
    manage_workspace_roles: bool,
}

pub(crate) async fn handle_workspace_permission_check_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(ws_id) = workspace_settings_permissions_ws_id(request.path) {
        return Some(match request.method {
            "GET" => {
                workspace_settings_permissions_response(config, request, ws_id, outbound).await
            }
            method => no_store_response(method_not_allowed(method, "GET")),
        });
    }

    let ws_id = workspace_permission_check_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_permission_check_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

pub(crate) async fn authorize_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    permission: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<WorkspacePermissionAuthorization, WorkspacePermissionAuthorizationError> {
    if !contact_data.configured() {
        return Err(WorkspacePermissionAuthorizationError::Internal);
    }

    let Some(access_token) = request_access_token_ignoring_app_sessions(request) else {
        return Err(WorkspacePermissionAuthorizationError::Unauthorized);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(WorkspacePermissionAuthorizationError::Unauthorized);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(WorkspacePermissionAuthorizationError::Unauthorized);
    };
    let auth = DataAuth::AccessToken(&access_token);
    let Some(resolved_ws_id) =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &auth)
            .await
            .map_err(|_| WorkspacePermissionAuthorizationError::Internal)?
    else {
        return Err(WorkspacePermissionAuthorizationError::NotFound);
    };

    let Some(permissions) = effective_workspace_permissions_for_user(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &auth,
    )
    .await
    .map_err(|_| WorkspacePermissionAuthorizationError::Internal)?
    else {
        return Err(WorkspacePermissionAuthorizationError::NotFound);
    };

    if permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|value| value == permission)
    {
        Ok(WorkspacePermissionAuthorization {
            ws_id: resolved_ws_id,
        })
    } else {
        Err(WorkspacePermissionAuthorizationError::Forbidden)
    }
}

pub(crate) async fn authorize_workspace_permission_allowing_app_sessions(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    permission: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<WorkspacePermissionAuthorization, WorkspacePermissionAuthorizationError> {
    let permissions =
        effective_workspace_permissions_allowing_app_sessions(config, request, raw_ws_id, outbound)
            .await
            .map_err(|_| WorkspacePermissionAuthorizationError::Internal)?
            .ok_or(WorkspacePermissionAuthorizationError::NotFound)?;

    if permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|value| value == permission)
    {
        Ok(WorkspacePermissionAuthorization {
            ws_id: permissions.ws_id,
        })
    } else {
        Err(WorkspacePermissionAuthorizationError::Forbidden)
    }
}

async fn workspace_permission_check_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(permission) = permission_query_value(request.url) else {
        return no_store_response(json_response(
            400,
            json!({ "message": MISSING_PERMISSION_MESSAGE }),
        ));
    };

    match effective_workspace_permissions_allowing_app_sessions(config, request, ws_id, outbound)
        .await
    {
        Ok(Some(permissions)) => permission_check_response(
            permissions.has_all_permissions
                || permissions
                    .permissions
                    .iter()
                    .any(|value| value == &permission),
        ),
        Ok(None) => workspace_access_denied_response(),
        Err(()) => internal_server_error_response(),
    }
}

async fn workspace_settings_permissions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match effective_workspace_permissions_allowing_app_sessions(config, request, ws_id, outbound)
        .await
    {
        Ok(Some(permissions)) => workspace_settings_permissions_success_response(
            permissions.has_all_permissions,
            &permissions.permissions,
        ),
        Ok(None) => workspace_access_denied_response(),
        Err(()) => internal_server_error_response(),
    }
}

async fn effective_workspace_permissions_allowing_app_sessions(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<EffectiveWorkspacePermissionsWithWorkspace>, ()> {
    let Some(user) = authenticated_workspace_user(config, request, outbound).await else {
        return Ok(None);
    };
    let auth = user
        .access_token
        .as_deref()
        .map(DataAuth::AccessToken)
        .unwrap_or(DataAuth::ServiceRole);
    let Some(resolved_ws_id) =
        normalize_workspace_id(&config.contact_data, outbound, ws_id, &user.id, &auth).await?
    else {
        return Ok(None);
    };
    let Some(permissions) = effective_workspace_permissions_for_user(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user.id,
        &auth,
    )
    .await?
    else {
        return Ok(None);
    };

    Ok(Some(EffectiveWorkspacePermissionsWithWorkspace {
        has_all_permissions: permissions.has_all_permissions,
        permissions: permissions.permissions,
        ws_id: resolved_ws_id,
    }))
}

struct EffectiveWorkspacePermissionsWithWorkspace {
    has_all_permissions: bool,
    permissions: Vec<String>,
    ws_id: String,
}

async fn authenticated_workspace_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedWorkspaceUser> {
    if contact::request_has_app_session_token(request)
        && let Ok(identity) = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        && !identity.id.trim().is_empty()
    {
        return Some(AuthenticatedWorkspaceUser {
            access_token: None,
            id: identity.id,
        });
    }

    let access_token = request_access_token_ignoring_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = user.id.filter(|id| !id.trim().is_empty())?;

    Some(AuthenticatedWorkspaceUser {
        access_token: Some(access_token),
        id,
    })
}

async fn effective_workspace_permissions_for_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    resolved_ws_id: &str,
    user_id: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<EffectiveWorkspacePermissions>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, resolved_ws_id, user_id, auth).await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, resolved_ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, resolved_ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, resolved_ws_id, &membership_type)
            .await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user_id);

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(Some(EffectiveWorkspacePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, auth).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, auth).await?
        {
            return Ok(Some(workspace_id));
        }

        let service_role_auth = DataAuth::ServiceRole;
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &service_role_auth).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceRow>(&response)
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
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
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn request_access_token_ignoring_app_sessions(request: BackendRequest<'_>) -> Option<String> {
    bearer_access_token(request.authorization).or_else(|| {
        request
            .cookie
            .and_then(supabase_access_token_from_cookie_header)
    })
}

fn bearer_access_token(authorization: Option<&str>) -> Option<String> {
    let authorization = authorization?.trim();
    let token = authorization
        .strip_prefix("Bearer ")
        .or_else(|| authorization.strip_prefix("bearer "))?
        .trim();

    if token.is_empty() || token.starts_with(APP_SESSION_BEARER_PREFIX) {
        return None;
    }

    Some(token.to_owned())
}

fn supabase_access_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    let groups = supabase_auth_cookie_groups(cookie_header);

    groups
        .values()
        .filter_map(supabase_auth_cookie_value)
        .find_map(|value| access_token_from_supabase_cookie_value(&value))
}

fn supabase_auth_cookie_groups(cookie_header: &str) -> BTreeMap<String, SupabaseAuthCookieGroup> {
    let mut groups = BTreeMap::<String, SupabaseAuthCookieGroup>::new();

    for (name, value) in cookie_header
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
    {
        let Some((storage_key, chunk_index)) = supabase_auth_cookie_name_parts(name.trim()) else {
            continue;
        };
        let group = groups.entry(storage_key).or_default();

        match chunk_index {
            Some(index) => {
                if group
                    .chunks
                    .insert(index, value.trim().to_owned())
                    .is_some()
                {
                    group.duplicate = true;
                }
            }
            None => {
                if group.base.is_some() {
                    group.duplicate = true;
                }
                group.base = Some(value.trim().to_owned());
            }
        }
    }

    groups
}

fn supabase_auth_cookie_name_parts(name: &str) -> Option<(String, Option<usize>)> {
    if !name.starts_with("sb-") {
        return None;
    }

    if name.ends_with("-auth-token") {
        return Some((name.to_owned(), None));
    }

    let (storage_key, suffix) = name.rsplit_once('.')?;

    if !storage_key.ends_with("-auth-token") {
        return None;
    }

    suffix
        .parse::<usize>()
        .ok()
        .map(|index| (storage_key.to_owned(), Some(index)))
}

fn supabase_auth_cookie_value(group: &SupabaseAuthCookieGroup) -> Option<String> {
    if group.duplicate {
        return None;
    }

    match (&group.base, group.chunks.is_empty()) {
        (Some(base), true) => return Some(base.clone()),
        (Some(_), false) | (None, true) => return None,
        (None, false) => {}
    }

    let mut value = String::new();
    for index in 0..group.chunks.len() {
        value.push_str(group.chunks.get(&index)?);
    }

    Some(value)
}

fn access_token_from_supabase_cookie_value(cookie_value: &str) -> Option<String> {
    let session =
        if let Some(base64_body) = cookie_value.strip_prefix(SUPABASE_AUTH_COOKIE_BASE64_PREFIX) {
            let mut padded = base64_body.to_owned();
            while padded.len() % 4 != 0 {
                padded.push('=');
            }
            let decoded = URL_SAFE.decode(padded.as_bytes()).ok()?;
            serde_json::from_slice::<SupabaseCookieSession>(&decoded).ok()?
        } else if cookie_value.starts_with('{') {
            serde_json::from_str::<SupabaseCookieSession>(cookie_value).ok()?
        } else {
            return None;
        };

    session
        .access_token
        .filter(|token| !token.trim().is_empty())
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

fn permission_query_value(request_url: Option<&str>) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(key, value)| {
            (key == "permission" && !value.is_empty()).then(|| value.into_owned())
        })
}

fn workspace_settings_permissions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_PERMISSION_CHECK_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_SETTINGS_PERMISSIONS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn workspace_permission_check_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_PERMISSION_CHECK_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_PERMISSION_CHECK_PATH_SUFFIX)?;

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
        || is_workspace_handle_identifier(&normalized)
}

pub(crate) fn is_workspace_handle_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized != PERSONAL_WORKSPACE_SLUG
        && normalized != ROOT_WORKSPACE_ID
        && normalized != INTERNAL_WORKSPACE_SLUG
        && !is_workspace_uuid_literal(&normalized)
        && is_workspace_handle(&normalized)
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

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn permission_check_response(has_permission: bool) -> BackendResponse {
    no_store_response(json_response(
        200,
        WorkspacePermissionCheckResponse { has_permission },
    ))
}

fn workspace_settings_permissions_success_response(
    has_all_permissions: bool,
    permissions: &[String],
) -> BackendResponse {
    let mut response = json_response(
        200,
        WorkspaceSettingsPermissionsResponse {
            manage_subscription: has_all_permissions
                || permissions
                    .iter()
                    .any(|value| value == "manage_subscription"),
            manage_workspace_settings: has_all_permissions
                || permissions
                    .iter()
                    .any(|value| value == "manage_workspace_settings"),
            manage_workspace_members: has_all_permissions
                || permissions
                    .iter()
                    .any(|value| value == "manage_workspace_members"),
            manage_workspace_roles: has_all_permissions
                || permissions
                    .iter()
                    .any(|value| value == "manage_workspace_roles"),
        },
    );
    response.cache_control = Some(WORKSPACE_PERMISSIONS_CACHE_CONTROL);
    response
}

fn workspace_access_denied_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": "Workspace access denied" }),
    ))
}

fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Internal server error" }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundRequest, OutboundResponse,
    };
    use crate::{BackendRequest, handle_backend_request};
    use std::{cell::RefCell, collections::VecDeque};

    const WORKSPACE_ID: &str = "11111111-1111-4111-8111-111111111111";
    const APP_SESSION_SECRET: &str = "test-app-session-secret";

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        body: Option<String>,
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    #[derive(Default)]
    struct RecordingOutboundClient {
        calls: RefCell<Vec<RecordedOutboundRequest>>,
        responses: RefCell<VecDeque<OutboundResponse>>,
    }

    impl RecordingOutboundClient {
        fn with_responses(responses: Vec<OutboundResponse>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(responses.into()),
            }
        }

        fn calls(&self) -> Vec<RecordedOutboundRequest> {
            self.calls.borrow().clone()
        }
    }

    impl OutboundHttpClient for RecordingOutboundClient {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            self.calls.borrow_mut().push(RecordedOutboundRequest {
                body: request.body.map(str::to_owned),
                headers: recorded_headers(&request.headers),
                method: request.method,
                url: request.url.to_owned(),
            });

            let response = self.responses.borrow_mut().pop_front();

            Box::pin(async move {
                response.ok_or_else(|| OutboundError::Transport("missing test response".to_owned()))
            })
        }
    }

    fn recorded_headers(headers: &[OutboundHeader<'_>]) -> Vec<(String, String)> {
        headers
            .iter()
            .map(|header| (header.name.to_owned(), header.value.to_owned()))
            .collect()
    }

    fn recorded_header<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    fn outbound_response(status: u16, body_text: &'static str) -> OutboundResponse {
        OutboundResponse {
            body_text: body_text.to_owned(),
            headers: Vec::new(),
            status,
        }
    }

    fn backend_config_with_contact_data() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend");
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co/",
            "test-service-role-secret",
        );
        config
    }

    fn backend_config_with_app_sessions() -> BackendConfig {
        let mut config = backend_config_with_contact_data();
        config
            .app_coordination_secrets
            .push(APP_SESSION_SECRET.to_owned());
        config
    }

    fn app_session_token(target_app: &str) -> String {
        let header = contact::encode_app_session_part(r#"{"alg":"HS256","typ":"JWT"}"#);
        let claims = contact::AppCoordinationClaims {
            aud: contact::app_coordination_token_audience().to_owned(),
            email: Some("member@example.com".to_owned()),
            exp: 4_000_000_000,
            iat: 1,
            iss: contact::app_coordination_token_issuer().to_owned(),
            jti: "workspace-settings-test".to_owned(),
            origin_app: "platform".to_owned(),
            scopes: vec![contact::APP_SESSION_SCOPE.to_owned()],
            sub: "app-session-user-1".to_owned(),
            target_app: target_app.to_owned(),
            typ: "app_coordination".to_owned(),
        };
        let payload = contact::encode_app_session_part(
            serde_json::to_string(&claims).expect("serialize app-session claims"),
        );
        let unsigned = format!("{header}.{payload}");
        let signature = contact::sign_app_coordination_content(&unsigned, APP_SESSION_SECRET)
            .expect("sign app-session token");

        format!(
            "{}{}.{}",
            contact::app_coordination_token_prefix(),
            unsigned,
            signature
        )
    }

    fn request(
        method: &'static str,
        workspace_id: &'static str,
        query: &'static str,
    ) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            if_none_match: None,
            method,
            origin: None,
            path: leaked_test_str(format!(
                "/api/v1/workspaces/{workspace_id}/settings/permissions/check"
            )),
            referer: None,
            request_id: None,
            url: Some(leaked_test_str(format!(
                "https://tuturuuu.localhost/api/v1/workspaces/{workspace_id}/settings/permissions/check{query}"
            ))),
        }
    }

    fn settings_permissions_request(method: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            if_none_match: None,
            method,
            origin: None,
            path: leaked_test_str(format!(
                "/api/v1/workspaces/{WORKSPACE_ID}/settings/permissions"
            )),
            referer: None,
            request_id: None,
            url: Some(leaked_test_str(format!(
                "https://tuturuuu.localhost/api/v1/workspaces/{WORKSPACE_ID}/settings/permissions"
            ))),
        }
    }

    fn authorized_request(permission: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer user-access-token"),
            ..request(
                "GET",
                WORKSPACE_ID,
                leaked_test_str(format!("?permission={permission}")),
            )
        }
    }

    fn authorized_settings_permissions_request() -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer user-access-token"),
            ..settings_permissions_request("GET")
        }
    }

    fn app_session_settings_permissions_request(target_app: &str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some(leaked_test_str(format!(
                "Bearer {}",
                app_session_token(target_app)
            ))),
            ..settings_permissions_request("GET")
        }
    }

    fn request_with_cookie_and_app_session_bearer() -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer ttr_app_header-token"),
            cookie: Some(leaked_test_str(format!(
                "tuturuuu_app_session=ttr_app_cookie-token; sb-project-ref-auth-token={}",
                supabase_auth_cookie_value("browser-access-token")
            ))),
            ..request(
                "GET",
                WORKSPACE_ID,
                "?permission=manage_subscription&userId=ignored-user",
            )
        }
    }

    fn supabase_auth_cookie_value(access_token: &str) -> String {
        format!(
            "base64-{}",
            contact::encode_app_session_part(format!(r#"{{"access_token":"{access_token}"}}"#))
        )
    }

    fn leaked_test_str(value: String) -> &'static str {
        Box::leak(value.into_boxed_str())
    }

    fn assert_permission_response(response: &BackendResponse, has_permission: bool) {
        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "hasPermission": has_permission,
            })
        );
    }

    fn successful_member_responses(role_permissions_body: &'static str) -> Vec<OutboundResponse> {
        vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(200, role_permissions_body),
            outbound_response(200, r#"[]"#),
        ]
    }

    #[tokio::test]
    async fn workspace_settings_permissions_returns_legacy_permission_flags() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(
                200,
                r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_subscription"},{"permission":"manage_workspace_members"},{"permission":"manage_workspace_roles"}]}}]"#,
            ),
            outbound_response(200, r#"[{"permission":"manage_workspace_settings"}]"#),
        ]);

        let response = handle_backend_request(
            &config,
            authorized_settings_permissions_request(),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "manage_subscription": true,
                "manage_workspace_settings": true,
                "manage_workspace_members": true,
                "manage_workspace_roles": true,
            })
        );
        assert_eq!(
            response.cache_control,
            Some(WORKSPACE_PERMISSIONS_CACHE_CONTROL)
        );

        let calls = outbound.calls();
        assert_eq!(calls.len(), 5);
        assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
        assert!(
            calls[1]
                .url
                .starts_with("https://project-ref.supabase.co/rest/v1/workspace_members?")
        );
        assert!(
            calls[3]
                .url
                .starts_with("https://project-ref.supabase.co/rest/v1/workspace_role_members?")
        );
        assert!(
            calls[4].url.starts_with(
                "https://project-ref.supabase.co/rest/v1/workspace_default_permissions?"
            )
        );
    }

    #[tokio::test]
    async fn workspace_settings_permissions_returns_read_only_flags_for_members_without_roles() {
        let config = backend_config_with_contact_data();
        let outbound =
            RecordingOutboundClient::with_responses(successful_member_responses(r#"[]"#));

        let response = handle_backend_request(
            &config,
            authorized_settings_permissions_request(),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "manage_subscription": false,
                "manage_workspace_settings": false,
                "manage_workspace_members": false,
                "manage_workspace_roles": false,
            })
        );
    }

    #[tokio::test]
    async fn workspace_permission_check_returns_false_for_members_without_roles() {
        let config = backend_config_with_contact_data();
        let outbound =
            RecordingOutboundClient::with_responses(successful_member_responses(r#"[]"#));

        let response = handle_backend_request(
            &config,
            authorized_request("manage_workspace_roles"),
            &outbound,
        )
        .await;

        assert_permission_response(&response, false);
    }

    #[tokio::test]
    async fn workspace_settings_permissions_accepts_inventory_app_sessions() {
        let config = backend_config_with_app_sessions();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"app-session-user-1"}]"#),
            outbound_response(200, r#"[]"#),
            outbound_response(200, r#"[]"#),
        ]);

        let response = handle_backend_request(
            &config,
            app_session_settings_permissions_request("inventory"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "manage_subscription": true,
                "manage_workspace_settings": true,
                "manage_workspace_members": true,
                "manage_workspace_roles": true,
            })
        );
        assert_eq!(outbound.calls().len(), 4);
        assert!(
            outbound.calls()[0]
                .url
                .contains("user_id=eq.app-session-user-1")
        );
        assert_eq!(
            recorded_header(&outbound.calls()[0], "Authorization"),
            Some("Bearer test-service-role-secret")
        );
    }

    #[tokio::test]
    async fn workspace_settings_permissions_rejects_unknown_app_audiences() {
        let config = backend_config_with_app_sessions();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(
            &config,
            app_session_settings_permissions_request("storefront"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 403);
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn workspace_settings_permissions_denies_missing_supabase_session() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response =
            handle_backend_request(&config, settings_permissions_request("GET"), &outbound).await;

        assert_eq!(response.status, 403);
        assert_eq!(
            response.body,
            json!({ "message": "Workspace access denied" })
        );
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn workspace_settings_permissions_rejects_unsupported_methods() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response =
            handle_backend_request(&config, settings_permissions_request("POST"), &outbound).await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn workspace_permission_check_requires_permission_query_param() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(
            &config,
            request("GET", WORKSPACE_ID, "?userId=ignored-user"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 400);
        assert_eq!(response.body, json!({ "message": "Missing permission" }));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn workspace_permission_check_denies_missing_supabase_session() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(
            &config,
            request("GET", WORKSPACE_ID, "?permission=admin"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 403);
        assert_eq!(
            response.body,
            json!({ "message": "Workspace access denied" })
        );
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn workspace_permission_check_uses_role_permissions_for_members() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
            r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_subscription"}]}}]"#,
        ));

        let response = handle_backend_request(
            &config,
            authorized_request("manage_subscription"),
            &outbound,
        )
        .await;

        assert_permission_response(&response, true);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 5);
        assert_eq!(calls[0].method, OutboundMethod::Get);
        assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer user-access-token")
        );
        assert!(
            calls[1]
                .url
                .starts_with("https://project-ref.supabase.co/rest/v1/workspace_members?")
        );
        assert!(calls[1].url.contains("select=type"));
        assert!(calls[1].url.contains(&format!("ws_id=eq.{WORKSPACE_ID}")));
        assert!(
            calls[2]
                .url
                .starts_with("https://project-ref.supabase.co/rest/v1/workspaces?")
        );
        assert!(
            calls[3]
                .url
                .starts_with("https://project-ref.supabase.co/rest/v1/workspace_role_members?")
        );
        assert!(
            calls[4].url.starts_with(
                "https://project-ref.supabase.co/rest/v1/workspace_default_permissions?"
            )
        );
    }

    #[tokio::test]
    async fn workspace_permission_check_uses_guest_default_permissions() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"GUEST"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(200, r#"[{"permission":"manage_subscription"}]"#),
        ]);

        let response = handle_backend_request(
            &config,
            authorized_request("manage_subscription"),
            &outbound,
        )
        .await;

        assert_permission_response(&response, true);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 4);
        assert!(
            calls
                .iter()
                .all(|call| !call.url.contains("workspace_role_members"))
        );
        assert!(calls[3].url.contains("member_type=eq.GUEST"));
    }

    #[tokio::test]
    async fn workspace_permission_check_denies_members_without_permission_context() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[]"#),
        ]);

        let response = handle_backend_request(
            &config,
            authorized_request("manage_subscription"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 403);
        assert_eq!(
            response.body,
            json!({ "message": "Workspace access denied" })
        );
        assert_eq!(outbound.calls().len(), 2);
    }

    #[tokio::test]
    async fn workspace_permission_check_preserves_creator_shortcut_for_known_permissions() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"user-1"}]"#),
            outbound_response(200, r#"[]"#),
            outbound_response(200, r#"[]"#),
        ]);

        let response = handle_backend_request(
            &config,
            authorized_request("manage_subscription"),
            &outbound,
        )
        .await;

        assert_permission_response(&response, true);
    }

    #[tokio::test]
    async fn workspace_permission_check_preserves_creator_shortcut_for_unknown_permissions() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"user-1"}]"#),
            outbound_response(200, r#"[]"#),
            outbound_response(200, r#"[]"#),
        ]);

        let response =
            handle_backend_request(&config, authorized_request("unknown_permission"), &outbound)
                .await;

        assert_permission_response(&response, true);
        assert_eq!(outbound.calls().len(), 5);
    }

    #[tokio::test]
    async fn workspace_permission_check_returns_false_for_unknown_member_permissions() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
            r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_subscription"}]}}]"#,
        ));

        let response =
            handle_backend_request(&config, authorized_request("unknown_permission"), &outbound)
                .await;

        assert_permission_response(&response, false);
        assert_eq!(outbound.calls().len(), 5);
    }

    #[tokio::test]
    async fn workspace_permission_check_resolves_personal_workspace_slug() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, format!(r#"[{{"id":"{WORKSPACE_ID}"}}]"#).leak()),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(
                200,
                r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_subscription"}]}}]"#,
            ),
            outbound_response(200, r#"[]"#),
        ]);

        let response = handle_backend_request(
            &config,
            BackendRequest {
                authorization: Some("Bearer user-access-token"),
                ..request("GET", "personal", "?permission=manage_subscription")
            },
            &outbound,
        )
        .await;

        assert_permission_response(&response, true);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 6);
        assert!(calls[1].url.contains("personal=eq.true"));
        assert!(calls[1].url.contains("workspace_members.user_id=eq.user-1"));
        assert!(calls[1].url.contains("workspace_members.type=eq.MEMBER"));
        assert!(calls[2].url.contains(&format!("ws_id=eq.{WORKSPACE_ID}")));
    }

    #[tokio::test]
    async fn workspace_permission_check_ignores_app_session_tokens_and_user_id_query() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
            r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_subscription"}]}}]"#,
        ));

        let response = handle_backend_request(
            &config,
            request_with_cookie_and_app_session_bearer(),
            &outbound,
        )
        .await;

        assert_permission_response(&response, true);

        let calls = outbound.calls();
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer browser-access-token")
        );
        assert!(calls.iter().all(|call| !call.url.contains("ignored-user")));
    }

    #[tokio::test]
    async fn workspace_permission_check_rejects_unsupported_methods() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(
            &config,
            request("POST", WORKSPACE_ID, "?permission=admin"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(outbound.calls().len(), 0);
    }
}
