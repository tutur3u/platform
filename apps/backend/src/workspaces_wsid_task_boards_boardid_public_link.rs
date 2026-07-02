//! Handler for `GET /api/v1/workspaces/:wsId/task-boards/:boardId/public-link`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/public-link/route.ts`.
//!
//! Auth model (GET only — POST and DELETE are left to the still-live Next.js route):
//!
//! 1. Extract the caller's access token (cookie or Authorization bearer).
//! 2. Resolve the Supabase user id.
//! 3. Normalize the workspace id (handles "personal", "internal", slug → UUID).
//! 4. Verify the caller is a workspace member (`workspace_members`).
//! 5. Verify the caller has the `manage_projects` permission (creator shortcut,
//!    role-based permissions, or default MEMBER permissions).
//! 6. Confirm the board exists in the workspace (`workspace_boards`).
//! 7. Fetch the first enabled public link for the board from
//!    `task_board_public_links` with the service-role client (bypasses RLS).
//!
//! Response shape on success:
//!
//! ```json
//! { "publicLink": null }
//! ```
//!
//! or, when an active link exists:
//!
//! ```json
//! {
//!   "publicLink": {
//!     "id": "...",
//!     "board_id": "...",
//!     "code": "...",
//!     "enabled": true,
//!     "disabled_at": null,
//!     "created_at": "...",
//!     "updated_at": "..."
//!   }
//! }
//! ```
//!
//! Status codes mirror the legacy route:
//!
//! - `400` — workspace id or board id is invalid
//! - `401` — missing or invalid session
//! - `403` — not a workspace member, or lacks `manage_projects`
//! - `404` — board not found (or not in the workspace)
//! - `500` — upstream / configuration error

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const MANAGE_PROJECTS_PERMISSION: &str = "manage_projects";
const ADMIN_PERMISSION: &str = "admin";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const PUBLIC_LINK_SELECT: &str = "id,board_id,code,enabled,disabled_at,created_at,updated_at";

const ERROR_MEMBERSHIP_LOOKUP_FAILED: &str = "Failed to verify workspace access";
const ERROR_ACCESS_DENIED: &str = "Workspace access denied";
const ERROR_NO_PERMISSION: &str = "You don't have permission to perform this operation";
const ERROR_BOARD_LOAD_FAILED: &str = "Failed to load task board";
const ERROR_BOARD_NOT_FOUND: &str = "Board not found";
const ERROR_INVALID_IDS: &str = "Invalid workspace or board ID";
const ERROR_INTERNAL: &str = "Internal server error";
const ERROR_LOAD_LINK: &str = "Failed to load public board link";

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
struct RolePermissionRow {
    permission: Option<String>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
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

#[derive(Deserialize)]
struct PublicLinkRow {
    id: Option<String>,
    board_id: Option<String>,
    code: Option<String>,
    enabled: Option<bool>,
    disabled_at: Option<Value>,
    created_at: Option<Value>,
    updated_at: Option<Value>,
}

// -----------------------------------------------------------------------------
// Response shape
// -----------------------------------------------------------------------------

#[derive(Serialize)]
struct SerializedPublicLink {
    id: Option<String>,
    board_id: Option<String>,
    code: Option<String>,
    enabled: Option<bool>,
    disabled_at: Option<Value>,
    created_at: Option<Value>,
    updated_at: Option<Value>,
}

// -----------------------------------------------------------------------------
// Internal helper
// -----------------------------------------------------------------------------

struct ResolvedRole {
    permissions: Vec<(String, bool)>,
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_task_boards_boardid_public_link_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, board_id) = public_link_path_params(request.path)?;

    Some(match request.method {
        "GET" => public_link_get_response(config, request, raw_ws_id, board_id, outbound).await,
        _ => return None,
    })
}

async fn public_link_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Validate ids — mirror the zod paramsSchema: wsId non-empty, boardId UUID.
    if raw_ws_id.trim().is_empty() || !is_uuid_literal(board_id) {
        return error_response(400, ERROR_INVALID_IDS);
    }

    // Auth: resolve the caller's user id from the access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    // normalizeWorkspaceId(rawWsId)
    let ws_id = match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(ws_id) => ws_id,
        Err(()) => return error_response(500, ERROR_MEMBERSHIP_LOOKUP_FAILED),
    };

    // verifyWorkspaceMembershipType
    match workspace_membership_type(contact_data, outbound, &ws_id, &user_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return error_response(403, ERROR_ACCESS_DENIED),
        Err(()) => return error_response(500, ERROR_MEMBERSHIP_LOOKUP_FAILED),
    }

    // getPermissions(...).containsPermission('manage_projects')
    match caller_can_manage_projects(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, ERROR_NO_PERMISSION),
        Err(()) => return error_response(500, ERROR_INTERNAL),
    }

    // Board existence check.
    match load_board(contact_data, outbound, board_id, &ws_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return error_response(404, ERROR_BOARD_NOT_FOUND),
        Err(()) => return error_response(500, ERROR_BOARD_LOAD_FAILED),
    }

    // Fetch the active public link (enabled = true, one row at most).
    match fetch_active_public_link(contact_data, outbound, board_id).await {
        Ok(maybe_link) => {
            let public_link_value: Value = match maybe_link {
                None => Value::Null,
                Some(row) => serde_json::to_value(SerializedPublicLink {
                    id: row.id,
                    board_id: row.board_id,
                    code: row.code,
                    enabled: row.enabled,
                    disabled_at: row.disabled_at,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                })
                .unwrap_or(Value::Null),
            };
            no_store_response(json_response(
                200,
                json!({ "publicLink": public_link_value }),
            ))
        }
        Err(()) => error_response(500, ERROR_LOAD_LINK),
    }
}

// -----------------------------------------------------------------------------
// REST queries
// -----------------------------------------------------------------------------

async fn fetch_active_public_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
) -> Result<Option<PublicLinkRow>, ()> {
    let url = contact_data
        .rest_url(
            "task_board_public_links",
            &[
                ("select", PUBLIC_LINK_SELECT.to_owned()),
                ("board_id", format!("eq.{board_id}")),
                ("enabled", "eq.true".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<PublicLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn load_board(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_boards",
            &[
                ("select", "id,ws_id".to_owned()),
                ("id", format!("eq.{board_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

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
// Auth / membership helpers (mirrors workspaces_task_boards_boardid_viewable_members.rs)
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
        if is_workspace_handle(&handle)
            && let Some(workspace_id) =
                workspace_id_by_handle(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;

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
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

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

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

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
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "creator_id".to_owned()),
                ("id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

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

    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;

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
        map.entry(user_id)
            .or_default()
            .push(ResolvedRole { permissions });
    }

    Ok(map)
}

async fn default_member_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_default_permissions",
            &[
                ("select", "permission,enabled".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("member_type", "eq.MEMBER".to_owned()),
                ("enabled", "eq.true".to_owned()),
            ],
        )
        .ok_or(())?;

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

/// Matches `/api/v1/workspaces/:wsId/task-boards/:boardId/public-link` and
/// returns `(wsId, boardId)`.
fn public_link_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 7
        && segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(3).map(|s| !s.is_empty()).unwrap_or(false)
        && segments.get(4) == Some(&"task-boards")
        && segments.get(5).map(|s| !s.is_empty()).unwrap_or(false)
        && segments.get(6) == Some(&"public-link")
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{is_uuid_literal, is_workspace_handle, public_link_path_params};

    #[test]
    fn path_params_matched() {
        let path = "/api/v1/workspaces/ws-abc/task-boards/550e8400-e29b-41d4-a716-446655440000/public-link";
        let result = public_link_path_params(path);
        assert!(result.is_some());
        let (ws_id, board_id) = result.unwrap();
        assert_eq!(ws_id, "ws-abc");
        assert_eq!(board_id, "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn path_params_wrong_suffix_returns_none() {
        let path =
            "/api/v1/workspaces/ws-abc/task-boards/550e8400-e29b-41d4-a716-446655440000/other";
        assert!(public_link_path_params(path).is_none());
    }

    #[test]
    fn path_params_extra_segment_returns_none() {
        let path = "/api/v1/workspaces/ws-abc/task-boards/550e8400-e29b-41d4-a716-446655440000/public-link/extra";
        assert!(public_link_path_params(path).is_none());
    }

    #[test]
    fn path_params_too_short_returns_none() {
        let path = "/api/v1/workspaces/ws-abc/task-boards/public-link";
        assert!(public_link_path_params(path).is_none());
    }

    #[test]
    fn path_params_empty_ws_id_returns_none() {
        let path =
            "/api/v1/workspaces//task-boards/550e8400-e29b-41d4-a716-446655440000/public-link";
        assert!(public_link_path_params(path).is_none());
    }

    #[test]
    fn uuid_literal_valid() {
        assert!(is_uuid_literal("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn uuid_literal_invalid() {
        assert!(!is_uuid_literal("not-a-uuid"));
        assert!(!is_uuid_literal("550e8400e29b41d4a716446655440000"));
        assert!(!is_uuid_literal(""));
    }

    #[test]
    fn workspace_handle_valid() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("ws1"));
    }

    #[test]
    fn workspace_handle_invalid() {
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-starts-with-dash"));
        assert!(!is_workspace_handle("ends-with-dash-"));
        assert!(!is_workspace_handle("UPPERCASE"));
    }
}
