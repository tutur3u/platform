use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Mirrors the legacy route at:
// apps/web/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/viewable-members/route.ts
//
// All Supabase reads go through the service-role REST client (config.contact_data)
// exactly like workspace_habits_access.rs. The legacy route uses an admin client
// (sbAdmin) for the board lookup and member listing, so service-role is the correct
// equivalent here; RLS is intentionally bypassed after the explicit membership +
// manage_projects permission gate.

const MANAGE_PROJECTS_PERMISSION: &str = "manage_projects";
const ADMIN_PERMISSION: &str = "admin";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const ERROR_MEMBERSHIP_LOOKUP_FAILED: &str = "Failed to verify workspace access";
const ERROR_ACCESS_DENIED: &str = "Workspace access denied";
const ERROR_NO_PERMISSION: &str = "You don't have permission to perform this operation";
const ERROR_BOARD_LOAD_FAILED: &str = "Failed to load task board";
const ERROR_BOARD_NOT_FOUND: &str = "Board not found";
const ERROR_INVALID_IDS: &str = "Invalid workspace or board ID";
const ERROR_INTERNAL: &str = "Internal server error";

// -----------------------------------------------------------------------------
// REST row shapes
// -----------------------------------------------------------------------------

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
struct BoardRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MemberRow {
    id: Option<String>,
    handle: Option<String>,
    email: Option<String>,
    display_name: Option<String>,
    avatar_url: Option<String>,
    pending: Option<bool>,
    #[serde(rename = "type")]
    member_type: Option<String>,
}

#[derive(Deserialize)]
struct RolePermissionRow {
    permission: Option<String>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct RoleRow {
    id: Option<String>,
    name: Option<String>,
    #[serde(default)]
    workspace_role_permissions: Vec<RolePermissionRow>,
}

#[derive(Deserialize)]
struct RoleMembershipRow {
    user_id: Option<String>,
    workspace_roles: Option<RoleRow>,
}

#[derive(Deserialize)]
struct DefaultPermissionRow {
    permission: Option<String>,
    enabled: Option<bool>,
}

// -----------------------------------------------------------------------------
// Response shapes
// -----------------------------------------------------------------------------

#[derive(Serialize)]
struct SerializedRole {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Serialize)]
struct SerializedMember {
    id: String,
    user_id: String,
    display_name: Option<String>,
    email: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    is_creator: bool,
    workspace_member_type: Option<String>,
    roles: Vec<SerializedRole>,
}

#[derive(Serialize)]
struct ViewableMembersResponse {
    members: Vec<SerializedMember>,
}

struct ResolvedRole {
    id: Option<String>,
    name: Option<String>,
    permissions: Vec<(String, bool)>,
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_task_boards_boardid_viewable_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, board_id) = viewable_members_path_params(request.path)?;

    Some(match request.method {
        "GET" => viewable_members_response(config, request, raw_ws_id, board_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn viewable_members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Mirror the legacy zod paramsSchema: wsId non-empty, boardId must be a uuid.
    if raw_ws_id.trim().is_empty() || !is_uuid_literal(board_id) {
        return message_response(400, ERROR_INVALID_IDS);
    }

    // Auth: resolve the caller's user id from the access token (cookie/bearer).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, "Unauthorized");
    };

    // normalizeWorkspaceId(rawWsId)
    let ws_id = match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, ERROR_MEMBERSHIP_LOOKUP_FAILED),
    };

    // verifyWorkspaceMembershipType
    match workspace_membership_type(contact_data, outbound, &ws_id, &user_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return message_response(403, ERROR_ACCESS_DENIED),
        Err(()) => return message_response(500, ERROR_MEMBERSHIP_LOOKUP_FAILED),
    }

    // getPermissions(...).containsPermission('manage_projects')
    match caller_can_manage_projects(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, ERROR_NO_PERMISSION),
        Err(()) => return message_response(500, ERROR_INTERNAL),
    }

    // Board lookup: workspace_boards by id + ws_id.
    match load_board(contact_data, outbound, board_id, &ws_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return message_response(404, ERROR_BOARD_NOT_FOUND),
        Err(()) => return message_response(500, ERROR_BOARD_LOAD_FAILED),
    }

    // Build the joined-member list with permissions and serialize.
    match build_viewable_members(contact_data, outbound, &ws_id).await {
        Ok(members) => no_store_response(json_response(200, ViewableMembersResponse { members })),
        Err(()) => message_response(500, ERROR_INTERNAL),
    }
}

// -----------------------------------------------------------------------------
// Member + permission assembly (status = 'joined' branch of getWorkspaceMembers)
// -----------------------------------------------------------------------------

async fn build_viewable_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<SerializedMember>, ()> {
    // Hidden-name / hidden-email workspace secrets.
    let (hide_name, hide_email) = hidden_member_secrets(contact_data, outbound, ws_id).await?;

    // Joined members (status = 'joined' => pending = false).
    let members = joined_members(contact_data, outbound, ws_id).await?;

    // creator_id of the workspace.
    let creator_id = workspace_creator_id(contact_data, outbound, ws_id).await?;

    // Role memberships for non-pending members.
    let user_ids: Vec<String> = members
        .iter()
        .filter(|m| m.pending != Some(true))
        .filter_map(|m| m.id.clone())
        .collect();
    let role_map = role_memberships(contact_data, outbound, ws_id, &user_ids).await?;

    // Default (MEMBER) workspace permissions (enabled only).
    let default_permissions = default_member_permissions(contact_data, outbound, ws_id).await?;

    let mut serialized = Vec::new();
    for member in members {
        let Some(member_id) = member.id.clone().filter(|id| !id.is_empty()) else {
            continue;
        };

        let is_creator = creator_id.as_deref() == Some(member_id.as_str());
        let roles = role_map.get(&member_id).map(Vec::as_slice).unwrap_or(&[]);

        if !member_has_manage_projects(is_creator, roles, &default_permissions) {
            continue;
        }

        serialized.push(SerializedMember {
            id: member_id.clone(),
            user_id: member_id,
            display_name: if hide_name {
                None
            } else {
                member.display_name.clone()
            },
            email: if hide_email {
                None
            } else {
                member.email.clone()
            },
            handle: member.handle.clone(),
            avatar_url: member.avatar_url.clone(),
            is_creator,
            workspace_member_type: member.member_type.clone(),
            roles: roles
                .iter()
                .map(|role| SerializedRole {
                    id: role.id.clone(),
                    name: role.name.clone(),
                })
                .collect(),
        });
    }

    Ok(serialized)
}

fn member_has_manage_projects(
    is_creator: bool,
    roles: &[ResolvedRole],
    default_permissions: &[String],
) -> bool {
    if is_creator {
        return true;
    }

    let mut has = |permission: &str| {
        default_permissions.iter().any(|p| p == permission)
            || roles.iter().any(|role| {
                role.permissions
                    .iter()
                    .any(|(name, enabled)| *enabled && name == permission)
            })
    };

    has(ADMIN_PERMISSION) || has(MANAGE_PROJECTS_PERMISSION)
}

// -----------------------------------------------------------------------------
// REST queries
// -----------------------------------------------------------------------------

async fn hidden_member_secrets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(bool, bool), ()> {
    #[derive(Deserialize)]
    struct SecretNameRow {
        name: Option<String>,
    }

    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", "in.(HIDE_MEMBER_EMAIL,HIDE_MEMBER_NAME)".to_owned()),
            ("value", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<SecretNameRow>>().map_err(|_| ())?;
    let names: HashSet<String> = rows.into_iter().filter_map(|row| row.name).collect();
    Ok((
        names.contains("HIDE_MEMBER_NAME"),
        names.contains("HIDE_MEMBER_EMAIL"),
    ))
}

async fn joined_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<MemberRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members_and_invites",
        &[
            (
                "select",
                "id,handle,email,display_name,avatar_url,pending,created_at,type".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("pending", "eq.false".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<MemberRow>>().map_err(|_| ())
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

async fn role_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_ids: &[String],
) -> Result<HashMap<String, Vec<ResolvedRole>>, ()> {
    if user_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let unique: HashSet<&str> = user_ids.iter().map(String::as_str).collect();
    let in_list = format!(
        "in.({})",
        unique
            .iter()
            .map(|id| (*id).to_owned())
            .collect::<Vec<_>>()
            .join(",")
    );

    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "user_id,workspace_roles!inner(id,name,ws_id,workspace_role_permissions(permission,enabled))"
                    .to_owned(),
            ),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
            ("user_id", in_list),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<RoleMembershipRow>>().map_err(|_| ())?;

    let mut map: HashMap<String, Vec<ResolvedRole>> = HashMap::new();
    for row in rows {
        let (Some(user_id), Some(role)) = (row.user_id, row.workspace_roles) else {
            continue;
        };
        let permissions = role
            .workspace_role_permissions
            .into_iter()
            .filter_map(|p| Some((p.permission?, p.enabled.unwrap_or(false))))
            .collect();
        map.entry(user_id).or_default().push(ResolvedRole {
            id: role.id,
            name: role.name,
            permissions,
        });
    }
    Ok(map)
}

async fn default_member_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission,enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", "eq.MEMBER".to_owned()),
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
        .filter(|row| row.enabled.unwrap_or(false))
        .filter_map(|row| row.permission)
        .collect())
}

async fn load_board(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_boards",
        &[
            ("select", "id,ws_id".to_owned()),
            ("id", format!("eq.{board_id}")),
            ("ws_id", format!("eq.{ws_id}")),
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
        .json::<Vec<BoardRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// -----------------------------------------------------------------------------
// Auth / membership helpers (copied from the workspace_habits_access.rs pattern,
// kept file-local so no shared module is edited)
// -----------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
) -> Result<String, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_workspace_handle(&handle) {
            if let Some(workspace_id) =
                workspace_id_by_handle(contact_data, outbound, &handle).await?
            {
                return Ok(workspace_id);
            }
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
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

/// Returns Ok(Some(membership_type)) when the user is a member of the workspace,
/// Ok(None) when not a member, Err when the lookup failed.
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

/// Equivalent of getPermissions(...).containsPermission('manage_projects').
/// Returns Ok(true) when the caller is the workspace creator, has the `admin`
/// permission, or has the `manage_projects` permission (via role memberships or
/// default MEMBER permissions).
async fn caller_can_manage_projects(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    // Creator shortcut.
    if workspace_creator_id(contact_data, outbound, ws_id)
        .await?
        .as_deref()
        == Some(user_id)
    {
        return Ok(true);
    }

    let mut permissions: HashSet<String> = HashSet::new();

    // Role-membership permissions for this caller.
    let caller_ids = [user_id.to_owned()];
    let role_map = role_memberships(contact_data, outbound, ws_id, &caller_ids).await?;
    if let Some(roles) = role_map.get(user_id) {
        for role in roles {
            for (name, enabled) in &role.permissions {
                if *enabled {
                    permissions.insert(name.clone());
                }
            }
        }
    }

    // Default MEMBER permissions.
    for permission in default_member_permissions(contact_data, outbound, ws_id).await? {
        permissions.insert(permission);
    }

    Ok(permissions.contains(ADMIN_PERMISSION) || permissions.contains(MANAGE_PROJECTS_PERMISSION))
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

// -----------------------------------------------------------------------------
// Path + value helpers
// -----------------------------------------------------------------------------

/// Matches /api/v1/workspaces/:wsId/task-boards/:boardId/viewable-members and
/// returns (wsId, boardId).
fn viewable_members_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "task-boards"
        && !segments[5].is_empty()
        && segments[6] == "viewable-members"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
