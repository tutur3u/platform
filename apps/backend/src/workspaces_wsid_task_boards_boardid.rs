//! Handler for `GET /api/v1/workspaces/:wsId/task-boards/:boardId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/route.ts`
//! (legacy methods GET, PUT, DELETE — only GET is migrated here; PUT and DELETE
//! return `None` so the live Next.js route continues to handle them).
//!
//! # Auth
//!
//! The legacy route uses `withSessionAuth` (session cookie / Bearer token) and
//! then `requireBoardAccess` → `resolveTaskBoardAccess`, which implements a
//! two-layer gate:
//!
//! - **Workspace-member path** — the caller is a workspace member AND has the
//!   `manage_projects` permission → `access_type: "member"`.
//! - **Guest-share path** — the caller has a `task_board_shares` row matching
//!   their `user_id` or `email` for this board → `access_type: "guest"`.
//!
//! If neither condition is satisfied, the legacy route returns `403 Workspace
//! access denied`.
//!
//! # Data
//!
//! The board is loaded from `workspace_boards` with an embedded
//! `task_lists(...)` relation. The legacy route uses a rollout fallback that
//! drops optional columns one-by-one when the DB returns a `42703`/`PGRST204`
//! error. This handler tries the full column set and falls back once to the
//! base columns only (without per-column retry). If neither attempt succeeds
//! the handler returns `500`.
//!
//! # Behavior gaps vs. legacy
//!
//! - App-session tokens (`ttr_app_*`) are NOT accepted. The legacy route
//!   enables `allowAppSessionAuth` for the CLI, calendar, and tasks apps; this
//!   port only handles standard Supabase session JWTs.
//! - The rollout column-fallback drops ALL optional columns on any error rather
//!   than dropping them one at a time, matching the spirit but not the exact
//!   step-by-step behaviour of the TypeScript fallback loop.
//! - `normalizeWorkspaceId` for the `personal` slug resolves via a
//!   `workspaces` query (same as sibling handlers); the TypeScript version uses
//!   the Supabase client's own RLS context which can differ in edge cases.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const MANAGE_PROJECTS_PERMISSION: &str = "manage_projects";
const ADMIN_PERMISSION: &str = "admin";

// Full column set for workspace_boards (optional columns may not exist in
// older DB schemas during a rollout; the fallback omits them).
const BOARD_FULL_SELECT: &str = concat!(
    "id,ws_id,name,icon,ticket_prefix,created_at,archived_at,deleted_at,",
    "default_list_id,estimation_type,extended_estimation,allow_zero_estimates,",
    "count_unestimated_issues,",
    "task_lists(id,board_id,name,status,color,position,archived,deleted,created_at,creator_id)"
);

// Base column set without optional columns.
const BOARD_BASE_SELECT: &str = concat!(
    "id,ws_id,name,icon,ticket_prefix,created_at,archived_at,deleted_at,",
    "task_lists(id,board_id,name,status,color,position,archived,deleted,created_at,creator_id)"
);

// ---------------------------------------------------------------------------
// Supabase row shapes
// ---------------------------------------------------------------------------

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
struct RolePermissionRow {
    permission: Option<String>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct RoleRow {
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
struct TaskListRow {
    id: Option<String>,
    board_id: Option<String>,
    name: Option<String>,
    status: Option<String>,
    color: Option<String>,
    position: Option<f64>,
    archived: Option<bool>,
    deleted: Option<bool>,
    created_at: Option<String>,
    creator_id: Option<String>,
}

/// The full board row shape. Optional columns are `Option<Value>` so they
/// survive both the full and the base select (missing fields deserialize as
/// `None`).
#[derive(Deserialize)]
struct BoardDetailRow {
    id: String,
    ws_id: Option<String>,
    name: Option<String>,
    icon: Option<String>,
    ticket_prefix: Option<String>,
    created_at: Option<String>,
    archived_at: Option<String>,
    deleted_at: Option<String>,
    // Optional columns (may be absent in older DB schemas)
    default_list_id: Option<Value>,
    estimation_type: Option<Value>,
    extended_estimation: Option<Value>,
    allow_zero_estimates: Option<Value>,
    count_unestimated_issues: Option<Value>,
    #[serde(default)]
    task_lists: Vec<TaskListRow>,
}

#[derive(Deserialize)]
struct GuestShareRow {
    permission: Option<String>,
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct TaskListOut {
    id: Option<String>,
    board_id: Option<String>,
    name: Option<String>,
    status: Option<String>,
    color: Option<String>,
    position: Option<f64>,
    archived: Option<bool>,
    deleted: Option<bool>,
    created_at: Option<String>,
    creator_id: Option<String>,
}

#[derive(Serialize)]
struct BoardDetailOut {
    id: String,
    ws_id: Option<String>,
    name: Option<String>,
    icon: Option<String>,
    ticket_prefix: Option<String>,
    created_at: Option<String>,
    archived_at: Option<String>,
    deleted_at: Option<String>,
    default_list_id: Value,
    estimation_type: Value,
    extended_estimation: Value,
    allow_zero_estimates: Value,
    count_unestimated_issues: Value,
    task_lists: Vec<TaskListOut>,
    access_type: &'static str,
    guest_permission: Option<String>,
    has_guest_access: bool,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_task_boards_boardid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, board_id) = board_path_params(request.path)?;

    Some(match request.method {
        "GET" => get_board_response(config, request, raw_ws_id, board_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_board_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Validate params (mirrors the zod paramsSchema).
    if raw_ws_id.trim().is_empty() || !is_uuid_literal(board_id) {
        return message_response(400, "Invalid workspace or board ID");
    }

    if !contact_data.configured() {
        return message_response(500, "Internal server error");
    }

    // Auth: extract the caller's access token and resolve their user.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, "Unauthorized");
    };
    let Some(auth_user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return message_response(401, "Unauthorized");
    };
    let Some(user_id) = auth_user.id.filter(|id| !id.trim().is_empty()) else {
        return message_response(401, "Unauthorized");
    };
    let user_email = auth_user
        .email
        .as_deref()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty());

    // Normalize workspace ID (mirrors normalizeWorkspaceId).
    let ws_id = match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(ws_id) => ws_id,
        Err(()) => {
            return message_response(500, "Failed to verify workspace membership");
        }
    };

    // Resolve access: member (with manage_projects) OR guest share.
    let access = match resolve_board_access(
        contact_data,
        outbound,
        &ws_id,
        board_id,
        &user_id,
        user_email.as_deref(),
    )
    .await
    {
        Ok(access) => access,
        Err(AccessError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(AccessError::Forbidden) => {
            return message_response(403, "Workspace access denied");
        }
        Err(AccessError::Internal(msg)) => {
            return message_response(500, msg);
        }
    };

    // Load the board + task_lists (with rollout fallback).
    let board_row = match load_board_with_fallback(contact_data, outbound, board_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return message_response(404, "Board not found"),
        Err(()) => return message_response(500, "Failed to load task board"),
    };

    // has_guest_access: true if the caller is a guest OR any share exists.
    let has_guest_access = if access.is_guest() {
        true
    } else {
        board_has_guest_shares(contact_data, outbound, board_id)
            .await
            .unwrap_or(false)
    };

    // Sort task_lists by position then created_at (mirrors the TypeScript sort).
    let mut task_lists_out: Vec<TaskListOut> = board_row
        .task_lists
        .into_iter()
        .map(|list| TaskListOut {
            id: list.id,
            board_id: list.board_id,
            name: list.name,
            status: list.status,
            color: list.color,
            position: list.position,
            archived: list.archived,
            deleted: list.deleted,
            created_at: list.created_at,
            creator_id: list.creator_id,
        })
        .collect();
    task_lists_out.sort_by(|a, b| {
        let pos_a = a.position.unwrap_or(0.0);
        let pos_b = b.position.unwrap_or(0.0);
        match pos_a.partial_cmp(&pos_b) {
            Some(std::cmp::Ordering::Equal) | None => {
                let ca = a.created_at.as_deref().unwrap_or("");
                let cb = b.created_at.as_deref().unwrap_or("");
                ca.cmp(cb)
            }
            Some(ord) => ord,
        }
    });

    let out = BoardDetailOut {
        id: board_row.id,
        ws_id: board_row.ws_id,
        name: board_row.name,
        icon: board_row.icon,
        ticket_prefix: board_row.ticket_prefix,
        created_at: board_row.created_at,
        archived_at: board_row.archived_at,
        deleted_at: board_row.deleted_at,
        default_list_id: board_row.default_list_id.unwrap_or(Value::Null),
        estimation_type: board_row.estimation_type.unwrap_or(Value::Null),
        extended_estimation: board_row.extended_estimation.unwrap_or(Value::Bool(false)),
        allow_zero_estimates: board_row.allow_zero_estimates.unwrap_or(Value::Bool(true)),
        count_unestimated_issues: board_row
            .count_unestimated_issues
            .unwrap_or(Value::Bool(false)),
        task_lists: task_lists_out,
        access_type: access.mode_str(),
        guest_permission: access.guest_permission(),
        has_guest_access,
    };

    no_store_response(json_response(200, json!({ "board": out })))
}

// ---------------------------------------------------------------------------
// Access resolution
// ---------------------------------------------------------------------------

#[allow(dead_code)]
enum AccessError {
    Unauthorized,
    Forbidden,
    Internal(&'static str),
}

enum BoardAccess {
    Member,
    Guest { permission: String },
}

impl BoardAccess {
    fn is_guest(&self) -> bool {
        matches!(self, BoardAccess::Guest { .. })
    }

    fn mode_str(&self) -> &'static str {
        match self {
            BoardAccess::Member => "member",
            BoardAccess::Guest { .. } => "guest",
        }
    }

    fn guest_permission(&self) -> Option<String> {
        match self {
            BoardAccess::Member => None,
            BoardAccess::Guest { permission } => Some(permission.clone()),
        }
    }
}

/// Mirrors `resolveTaskBoardAccess` with a `requiredPermission = 'view'` gate.
async fn resolve_board_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    board_id: &str,
    user_id: &str,
    user_email: Option<&str>,
) -> Result<BoardAccess, AccessError> {
    // Check workspace membership.
    let is_member = match workspace_membership_type(contact_data, outbound, ws_id, user_id).await {
        Ok(Some(_)) => true,
        Ok(None) => false,
        Err(()) => {
            return Err(AccessError::Internal(
                "Failed to verify workspace membership",
            ));
        }
    };

    if is_member {
        // Check manage_projects permission.
        match caller_can_manage_projects(contact_data, outbound, ws_id, user_id).await {
            Ok(true) => return Ok(BoardAccess::Member),
            Ok(false) => {}
            Err(()) => return Err(AccessError::Internal("Internal server error")),
        }
    }

    // Guest-share path: look for a task_board_share for this board + user.
    match best_guest_permission(contact_data, outbound, board_id, ws_id, user_id, user_email).await
    {
        Ok(Some(permission)) => Ok(BoardAccess::Guest { permission }),
        Ok(None) => Err(AccessError::Forbidden),
        Err(()) => Err(AccessError::Internal(
            "Failed to verify workspace membership",
        )),
    }
}

/// Returns the strongest guest share permission for this (board, user).
async fn best_guest_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
    ws_id: &str,
    user_id: &str,
    user_email: Option<&str>,
) -> Result<Option<String>, ()> {
    fn permission_rank(p: &str) -> u8 {
        match p {
            "edit" => 2,
            "view" => 1,
            _ => 0,
        }
    }

    let mut best: Option<String> = None;
    let mut update_best = |perm: String| {
        let rank = permission_rank(&perm);
        let current_rank = best.as_deref().map(permission_rank).unwrap_or(0);
        if rank > current_rank {
            best = Some(perm);
        }
    };

    // Query shares by user_id.
    let shares_by_user = load_guest_shares(
        contact_data,
        outbound,
        board_id,
        ws_id,
        "shared_with_user_id",
        user_id,
    )
    .await?;
    for share in shares_by_user {
        if let Some(perm) = share.permission {
            update_best(perm);
        }
    }

    // Query shares by email (if we have it).
    if let Some(email) = user_email {
        let shares_by_email = load_guest_shares(
            contact_data,
            outbound,
            board_id,
            ws_id,
            "shared_with_email",
            email,
        )
        .await?;
        for share in shares_by_email {
            if let Some(perm) = share.permission {
                update_best(perm);
            }
        }
    }

    // `view` is the required permission; any share at least `view` qualifies.
    Ok(best.filter(|p| permission_rank(p) >= permission_rank("view")))
}

async fn load_guest_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
    ws_id: &str,
    filter_col: &str,
    filter_val: &str,
) -> Result<Vec<GuestShareRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            (
                "select",
                "permission,workspace_boards!inner(ws_id,deleted_at)".to_owned(),
            ),
            ("board_id", format!("eq.{board_id}")),
            ("workspace_boards.ws_id", format!("eq.{ws_id}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
            (filter_col, format!("eq.{filter_val}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<GuestShareRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Board loading with rollout fallback
// ---------------------------------------------------------------------------

async fn load_board_with_fallback(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
) -> Result<Option<BoardDetailRow>, ()> {
    // Attempt 1: full column set (including optional columns).
    if let Ok(row) = load_board(contact_data, outbound, board_id, BOARD_FULL_SELECT).await {
        return Ok(row);
    }

    // Attempt 2: base columns only (rollout fallback for schemas missing
    // optional columns).
    load_board(contact_data, outbound, board_id, BOARD_BASE_SELECT).await
}

async fn load_board(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
    select: &str,
) -> Result<Option<BoardDetailRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_boards",
        &[
            ("select", select.to_owned()),
            ("id", format!("eq.{board_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<BoardDetailRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

// ---------------------------------------------------------------------------
// has_guest_access check
// ---------------------------------------------------------------------------

/// Returns true when at least one `task_board_shares` row exists for the board.
async fn board_has_guest_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            ("select", "id".to_owned()),
            ("board_id", format!("eq.{board_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    #[derive(Deserialize)]
    struct IdRow {
        #[allow(dead_code)]
        id: Option<String>,
    }
    let rows = response.json::<Vec<IdRow>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

// ---------------------------------------------------------------------------
// Auth / workspace helpers (file-local, mirroring viewable_members handler)
// ---------------------------------------------------------------------------

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
            && let Some(ws_id) = workspace_id_by_handle(contact_data, outbound, &handle).await?
        {
            return Ok(ws_id);
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
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

    let mut permissions = std::collections::HashSet::<String>::new();

    // Role-membership permissions for this caller.
    let caller_ids = [user_id.to_owned()];
    let role_map = role_memberships(contact_data, outbound, ws_id, &caller_ids).await?;
    if let Some(roles) = role_map.get(user_id) {
        for (name, enabled) in roles {
            if *enabled {
                permissions.insert(name.clone());
            }
        }
    }

    // Default MEMBER permissions.
    for permission in default_member_permissions(contact_data, outbound, ws_id).await? {
        permissions.insert(permission);
    }

    Ok(permissions.contains(ADMIN_PERMISSION) || permissions.contains(MANAGE_PROJECTS_PERMISSION))
}

async fn role_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_ids: &[String],
) -> Result<std::collections::HashMap<String, Vec<(String, bool)>>, ()> {
    if user_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let in_list = format!("in.({})", user_ids.join(","));
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<RoleMembershipRow>>().map_err(|_| ())?;

    let mut map: std::collections::HashMap<String, Vec<(String, bool)>> =
        std::collections::HashMap::new();
    for row in rows {
        let (Some(user_id), Some(role)) = (row.user_id, row.workspace_roles) else {
            continue;
        };
        let perms: Vec<(String, bool)> = role
            .workspace_role_permissions
            .into_iter()
            .filter_map(|p| Some((p.permission?, p.enabled.unwrap_or(false))))
            .collect();
        map.entry(user_id).or_default().extend(perms);
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
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

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn send_service_role_get(
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Path + value helpers
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/:wsId/task-boards/:boardId` exactly (6 segments)
/// and returns `(wsId, boardId)`.
fn board_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    // Use `.get()` so a short path never panics.
    if segments.len() == 6
        && segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(3).is_some_and(|s| !s.is_empty())
        && segments.get(4) == Some(&"task-boards")
        && segments.get(5).is_some_and(|s| !s.is_empty())
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(i, ch)| match i {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let len = value.len();
    if len == 0 || len > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, ch)| {
        let is_edge = i == 0 || i + 1 == len;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!is_edge && matches!(ch, '_' | '-'))
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_six_segment_path() {
        let ws_id = "550e8400-e29b-41d4-a716-446655440000";
        let board_id = "660e8400-e29b-41d4-a716-446655440001";
        let path = format!("/api/v1/workspaces/{ws_id}/task-boards/{board_id}");
        assert_eq!(board_path_params(&path), Some((ws_id, board_id)));
    }

    #[test]
    fn path_guard_rejects_extra_segments() {
        let path = "/api/v1/workspaces/ws1/task-boards/b1/extra";
        assert!(board_path_params(path).is_none());
    }

    #[test]
    fn path_guard_rejects_wrong_static_segments() {
        let path = "/api/v1/workspaces/ws1/boards/b1";
        assert!(board_path_params(path).is_none());
    }

    #[test]
    fn path_guard_rejects_too_few_segments() {
        let path = "/api/v1/workspaces/ws1/task-boards";
        assert!(board_path_params(path).is_none());
    }

    #[test]
    fn is_uuid_literal_accepts_valid_uuid() {
        assert!(is_uuid_literal("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn is_uuid_literal_rejects_non_uuid() {
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
        assert!(!is_uuid_literal(""));
    }

    #[test]
    fn is_workspace_handle_accepts_valid_handles() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("workspace2"));
        assert!(is_workspace_handle("my_handle"));
    }

    #[test]
    fn is_workspace_handle_rejects_edge_hyphens() {
        assert!(!is_workspace_handle("-workspace"));
        assert!(!is_workspace_handle("workspace-"));
        assert!(!is_workspace_handle(""));
    }

    #[test]
    fn board_access_member_returns_correct_mode_str() {
        let access = BoardAccess::Member;
        assert_eq!(access.mode_str(), "member");
        assert!(access.guest_permission().is_none());
        assert!(!access.is_guest());
    }

    #[test]
    fn board_access_guest_returns_correct_fields() {
        let access = BoardAccess::Guest {
            permission: "view".to_owned(),
        };
        assert_eq!(access.mode_str(), "guest");
        assert_eq!(access.guest_permission(), Some("view".to_owned()));
        assert!(access.is_guest());
    }
}
