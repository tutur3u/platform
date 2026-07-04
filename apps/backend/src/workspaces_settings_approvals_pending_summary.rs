use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const PENDING_SUMMARY_PATH_PREFIX: &str = "/api/v1/workspaces/";
const PENDING_SUMMARY_PATH_SUFFIX: &str = "/settings/approvals/pending-summary";

const MANAGE_WORKSPACE_SETTINGS_PERMISSION: &str = "manage_workspace_settings";
const ADMIN_PERMISSION: &str = "admin";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str =
    "Insufficient permissions to view workspace settings";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const FETCH_COUNTS_FAILED_MESSAGE: &str = "Failed to fetch pending approval counts";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

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
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct DefaultPermissionRow {
    permission: Option<String>,
}

/// Mirrors the embedded role-membership permission rows:
/// `workspace_roles!inner(workspace_role_permissions(permission))`.
#[derive(Deserialize)]
struct RoleMemberRow {
    workspace_roles: Option<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    workspace_role_permissions: Option<Vec<PermissionRow>>,
}

/// Outcome of resolving the caller's effective workspace permissions, mirroring
/// the legacy `getPermissions(...)` helper. `None` from the resolver maps to the
/// legacy `null` return (HTTP 404).
struct PermissionsContext {
    is_creator: bool,
    is_admin: bool,
    permissions: Vec<String>,
}

impl PermissionsContext {
    /// Mirrors `withoutPermission(permission)` from the legacy permissions result.
    fn without_permission(&self, permission: &str) -> bool {
        !(self.is_creator
            || self.is_admin
            || self.permissions.iter().any(|value| value == permission))
    }
}

pub(crate) async fn handle_workspaces_settings_approvals_pending_summary_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = pending_summary_ws_id(request.path)?;

    Some(match request.method {
        "GET" => pending_summary_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn pending_summary_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth: resolve the Supabase session user. Missing/invalid token -> 401.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Resolve workspace slug aliases (personal/internal/handle) to a concrete id.
    // The legacy `normalizeWorkspaceId` swallows lookup failures by returning the
    // raw identifier; the subsequent permission/membership queries then fail to
    // match and produce the appropriate 404/403.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // Mirror `getPermissions(...)`: a `null` result -> 404 Not found.
    let permissions =
        match resolve_permissions(contact_data, outbound, &resolved_ws_id, &user_id).await {
            Ok(Some(permissions)) => permissions,
            Ok(None) => return message_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // Mirror `withoutPermission('manage_workspace_settings')` -> 403.
    if permissions.without_permission(MANAGE_WORKSPACE_SETTINGS_PERMISSION) {
        return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
    }

    // Mirror `verifyWorkspaceMembershipType` (defaults to requiredType MEMBER):
    // lookup failure -> 500, missing/mismatched membership -> 403.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(MembershipCheck::Member) => {}
        Ok(MembershipCheck::Other) => return message_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Fetch both pending counts. The legacy route uses the service-role admin
    // client (RLS bypassed) against the `private` schema.
    let pending_reports = match pending_reports_count(contact_data, outbound, &resolved_ws_id).await
    {
        Ok(count) => count,
        Err(()) => return message_response(500, FETCH_COUNTS_FAILED_MESSAGE),
    };

    let pending_posts = match pending_posts_count(contact_data, outbound, &resolved_ws_id).await {
        Ok(count) => count,
        Err(()) => return message_response(500, FETCH_COUNTS_FAILED_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "pending": {
                "reports": pending_reports,
                "posts": pending_posts,
            }
        }),
    ))
}

// --- Membership verification (final gate, requiredType MEMBER) ---

enum MembershipCheck {
    Member,
    Other,
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<MembershipCheck, ()> {
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let membership_type = response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type);

    Ok(match membership_type.as_deref() {
        Some("MEMBER") => MembershipCheck::Member,
        // Missing membership or mismatched type both map to a non-MEMBER result,
        // which the caller renders as 403 (legacy `membership_missing` /
        // `membership_type_mismatch` both lead to "Workspace access denied").
        _ => MembershipCheck::Other,
    })
}

// --- Permission resolution (mirrors getPermissions) ---

async fn resolve_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<PermissionsContext>, ()> {
    // Membership check with requiredType ANY: a missing membership -> null (404).
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user_id).await?
    else {
        return Ok(None);
    };

    // The workspace must exist (legacy: `if (!workspaceData) return null`).
    let Some(creator_id) = workspace_creator_id(contact_data, outbound, ws_id).await? else {
        return Ok(None);
    };

    let is_creator = membership_type == "MEMBER" && creator_id == user_id;

    // Role-membership permissions are only queried for MEMBER membership type.
    let role_permissions = if membership_type == "MEMBER" {
        role_member_permissions(contact_data, outbound, ws_id, user_id).await?
    } else {
        Vec::new()
    };

    let default_permissions =
        default_permissions(contact_data, outbound, ws_id, &membership_type).await?;

    let has_permissions =
        !role_permissions.is_empty() || !default_permissions.is_empty() || is_creator;

    // Legacy: `if (!isCreator && !hasPermissions) return null` -> 404.
    if !is_creator && !has_permissions {
        return Ok(None);
    }

    // A creator is granted every permission, so `manage_workspace_settings` is
    // always present; we model that via `is_creator` short-circuiting
    // `without_permission`. For non-creators we de-duplicate the granted set.
    let mut permissions: Vec<String> = Vec::new();
    for permission in role_permissions.into_iter().chain(default_permissions) {
        if !permissions.contains(&permission) {
            permissions.push(permission);
        }
    }

    let is_admin = permissions.iter().any(|value| value == ADMIN_PERMISSION);

    Ok(Some(PermissionsContext {
        is_creator,
        is_admin,
        permissions,
    }))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<String>, ()> {
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn role_member_permissions(
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RoleMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.workspace_roles)
        .filter_map(|role| role.workspace_role_permissions)
        .flatten()
        .filter_map(|permission| permission.permission)
        .collect())
}

async fn default_permissions(
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<DefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// --- Pending approval counts (private schema, service-role, count=exact) ---

async fn pending_reports_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<usize, ()> {
    let Some(url) = contact_data.rest_url(
        "external_user_monthly_reports_workspace_view",
        &[
            ("select", "id".to_owned()),
            ("user_ws_id", format!("eq.{ws_id}")),
            ("report_approval_status", "eq.PENDING".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_schema_count(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(total_count_from_content_range(&response).unwrap_or(0))
}

async fn pending_posts_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<usize, ()> {
    let Some(url) = contact_data.rest_url(
        "user_group_post_checks",
        &[
            (
                "select",
                "post_id,user_group_posts!inner(workspace_user_groups!inner(ws_id))".to_owned(),
            ),
            (
                "user_group_posts.workspace_user_groups.ws_id",
                format!("eq.{ws_id}"),
            ),
            ("approval_status", "eq.PENDING".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_schema_count(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(total_count_from_content_range(&response).unwrap_or(0))
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

// --- Workspace id normalization (mirrors workspace_habits_access) ---

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// --- REST request helpers ---

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

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

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

/// Service-role read against the `private` schema with `count=exact` so the
/// total row count is reported in the `Content-Range` response header. `Range:
/// 0-0` keeps the response body minimal, mirroring `head: true`.
async fn send_private_schema_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", "0-0"),
        )
        .await
        .map_err(|_| ())
}

// --- Path + slug helpers ---

fn pending_summary_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(PENDING_SUMMARY_PATH_PREFIX)?
        .strip_suffix(PENDING_SUMMARY_PATH_SUFFIX)?;

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

// --- Responses ---

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
