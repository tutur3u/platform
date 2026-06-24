// (file-local helper; mirrors normalize_email in sibling handler modules)
#[allow(dead_code)]
fn normalize_email(email: Option<&str>) -> Option<String> {
    let email = email?.trim().to_lowercase();
    (!email.is_empty()).then_some(email)
}

// Port of GET /api/v1/workspaces/:wsId/boards-data
//
// Legacy source:
//   apps/web/src/app/api/v1/workspaces/[wsId]/boards-data/route.ts
//
// Behavior summary (faithful to the legacy route):
//   * Authenticated GET. App-session auth is allowed (legacy `allowAppSessionAuth`
//     targets the `tasks` app), so caller bearer/cookie tokens are accepted even
//     when an app session token is present.
//   * Verify workspace membership. A membership *lookup failure* -> 500 with
//     `{ error: "Failed to verify workspace membership" }`.
//   * If the caller is a MEMBER, compute permissions (mirroring `getPermissions`).
//     - No permissions at all (or workspace not found) -> 404 "Workspace not found".
//     - Permissions present but missing `manage_projects` -> 403.
//   * If the caller is NOT a member, fall back to task-board guest shares. If they
//     have zero guest boards -> 403 "You don't have access to this workspace".
//   * Fetch boards (`workspace_boards.*`) filtered by ws_id, ordered by
//     name asc, created_at desc, with optional `q` ilike on name, paginated via
//     `page`/`pageSize` (default 1 / 10) using PostgREST Range + count=exact.
//     Guests are additionally restricted to their shared board ids.
//   * Fetch task_lists (deleted=false) for those boards and tasks (deleted_at null)
//     for those lists, then group lists under boards and tasks under lists.
//   * Decorate each board with `access_type` ("member"|"guest") and
//     `guest_permission` (null for members; per-board share permission, default
//     "view", for guests).
//   * Respond `{ data, count, access_type, guest_highest_permission }`.
//
// NOTE: All Supabase reads go through the service-role REST client (mirroring the
// legacy `createAdminClient()` / `sbAdmin` usage). Workspace access is enforced
// explicitly above via membership + permission + guest-share checks rather than
// relying on RLS. This matches the legacy route, which performs all reads with the
// admin client after its own access checks.
//
// IMPORTANT (integrator note): This module is fully self-contained. Several small
// helpers (workspace-id normalization, membership verification, guest-share email
// resolution, REST request helpers, UUID/handle predicates) are intentionally
// COPIED as file-local fns from `workspaces_boards_with_lists.rs` / the habits
// reference rather than shared, per the one-file constraint. No existing file was
// modified.

use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/boards-data";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_NOT_FOUND_MESSAGE: &str = "Workspace not found";
const NO_PERMISSION_MESSAGE: &str = "You don't have permission to view task boards";
const NO_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const MANAGE_PROJECTS_PERMISSION: &str = "manage_projects";
const ADMIN_PERMISSION: &str = "admin";

const ACCESS_TYPE_MEMBER: &str = "member";
const ACCESS_TYPE_GUEST: &str = "guest";

// Legacy zod defaults: page="1", pageSize="10".
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;

// ---------- Inbound (PostgREST) row shapes ----------

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
struct UserPrivateEmailRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct DefaultPermissionRow {
    permission: Option<String>,
}

// Role-member -> roles -> role-permissions(permission)
#[derive(Deserialize)]
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Option<RoleJoin>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum RoleJoin {
    One(RoleNode),
    Many(Vec<RoleNode>),
}

#[derive(Deserialize)]
struct RoleNode {
    #[serde(default)]
    workspace_role_permissions: Vec<RolePermissionRow>,
}

#[derive(Deserialize)]
struct RolePermissionRow {
    permission: Option<String>,
}

// Guest share row (board_id + permission).
#[derive(Deserialize)]
struct TaskBoardShareRow {
    #[serde(default)]
    board_id: Option<String>,
    #[serde(default)]
    permission: Option<String>,
}

// Task list row.
#[derive(Deserialize)]
struct TaskListRow {
    id: String,
    #[serde(default)]
    name: Option<Value>,
    #[serde(default)]
    status: Option<Value>,
    #[serde(default)]
    color: Option<Value>,
    #[serde(default)]
    position: Option<Value>,
    #[serde(default)]
    archived: Option<Value>,
    #[serde(default)]
    board_id: Option<String>,
}

// Task row.
#[derive(Deserialize)]
struct TaskRow {
    id: String,
    #[serde(default)]
    list_id: Option<String>,
    #[serde(flatten)]
    rest: Map<String, Value>,
}

// A resolved guest share (normalized).
struct GuestShare {
    board_id: String,
    permission: String,
}

// ---------- Entry point ----------

pub(crate) async fn handle_workspaces_boards_data_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = boards_data_ws_id(request.path)?;

    Some(match request.method {
        "GET" => boards_data_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn boards_data_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // ----- Auth -----
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(auth_user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = auth_user
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let user_email = auth_user.email.clone();

    // ----- Query params (q, page, pageSize) -----
    let query = parse_query(request.url);

    // ----- Normalize workspace id (personal/internal/handle) -----
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // ----- Membership check (lookup failure -> 500) -----
    let membership = match verify_workspace_member(contact_data, outbound, &ws_id, &user_id).await {
        Ok(membership) => membership,
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    // ----- Member permission gate -----
    if membership {
        match load_manage_projects_permission(contact_data, outbound, &ws_id, &user_id).await {
            // getPermissions returned null -> "Workspace not found" (404).
            Ok(None) => return error_response(404, WORKSPACE_NOT_FOUND_MESSAGE),
            // Has permissions object but lacks manage_projects -> 403.
            Ok(Some(false)) => return error_response(403, NO_PERMISSION_MESSAGE),
            Ok(Some(true)) => {}
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    }

    // ----- Guest share resolution (non-members only) -----
    let guest_shares: Vec<GuestShare> = if membership {
        Vec::new()
    } else {
        match load_guest_shares(
            contact_data,
            outbound,
            &ws_id,
            &user_id,
            user_email.as_deref(),
        )
        .await
        {
            Ok(shares) => shares,
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    };

    // Highest permission + de-duplicated board ids across all shares.
    let guest_board_ids: Vec<String> = {
        let mut set: BTreeSet<String> = BTreeSet::new();
        let mut ordered: Vec<String> = Vec::new();
        for share in &guest_shares {
            if set.insert(share.board_id.clone()) {
                ordered.push(share.board_id.clone());
            }
        }
        ordered
    };
    let guest_highest_permission = highest_permission(&guest_shares);
    // Per-board: highest permission for that board (default "view").
    let mut guest_board_permission: BTreeMap<String, String> = BTreeMap::new();
    for share in &guest_shares {
        let entry = guest_board_permission
            .entry(share.board_id.clone())
            .or_insert_with(|| share.permission.clone());
        if permission_rank(&share.permission) > permission_rank(entry) {
            *entry = share.permission.clone();
        }
    }

    if !membership && guest_board_ids.is_empty() {
        return error_response(403, NO_ACCESS_MESSAGE);
    }

    // ----- Fetch boards (paginated, with count) -----
    let restrict_board_ids: Option<&[String]> = if membership {
        None
    } else {
        Some(&guest_board_ids)
    };

    let (boards, count) = match fetch_boards(
        contact_data,
        outbound,
        &ws_id,
        query.q.as_deref(),
        query.page,
        query.page_size,
        restrict_board_ids,
    )
    .await
    {
        Ok(result) => result,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let access_type = if membership {
        ACCESS_TYPE_MEMBER
    } else {
        ACCESS_TYPE_GUEST
    };

    // Empty boards -> { data: [], count: 0 } (legacy returns count: 0 here).
    if boards.is_empty() {
        return no_store_response(json_response(200, json!({ "data": [], "count": 0 })));
    }

    // ----- Fetch task_lists + tasks -----
    let board_ids: Vec<String> = boards.iter().filter_map(board_id).collect();

    let task_lists = match fetch_task_lists(contact_data, outbound, &board_ids).await {
        Ok(lists) => lists,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let list_ids: Vec<String> = task_lists.iter().map(|list| list.id.clone()).collect();
    let tasks = match fetch_tasks(contact_data, outbound, &list_ids).await {
        Ok(tasks) => tasks,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    // ----- Group data by board -----
    let data: Vec<Value> = boards
        .into_iter()
        .map(|mut board| {
            let this_board_id = board
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_default();

            // access_type
            board.insert(
                "access_type".to_owned(),
                Value::String(access_type.to_owned()),
            );

            // guest_permission
            let guest_permission = if membership {
                Value::Null
            } else {
                Value::String(
                    guest_board_permission
                        .get(&this_board_id)
                        .cloned()
                        .unwrap_or_else(|| "view".to_owned()),
                )
            };
            board.insert("guest_permission".to_owned(), guest_permission);

            // task_lists (with nested tasks)
            let lists_for_board: Vec<Value> = task_lists
                .iter()
                .filter(|list| list.board_id.as_deref() == Some(this_board_id.as_str()))
                .map(|list| {
                    let tasks_for_list: Vec<Value> = tasks
                        .iter()
                        .filter(|task| task.list_id.as_deref() == Some(list.id.as_str()))
                        .map(task_to_value)
                        .collect();
                    task_list_to_value(list, tasks_for_list)
                })
                .collect();
            board.insert("task_lists".to_owned(), Value::Array(lists_for_board));

            Value::Object(board)
        })
        .collect();

    let guest_highest = if membership {
        Value::Null
    } else {
        match guest_highest_permission {
            Some(permission) => Value::String(permission),
            None => Value::Null,
        }
    };

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "count": count,
            "access_type": access_type,
            "guest_highest_permission": guest_highest,
        }),
    ))
}

// ---------- Boards fetch ----------

#[allow(clippy::too_many_arguments)]
async fn fetch_boards(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    q: Option<&str>,
    page: i64,
    page_size: i64,
    restrict_board_ids: Option<&[String]>,
) -> Result<(Vec<Map<String, Value>>, Option<i64>), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        // Legacy orders by name asc, then created_at desc.
        ("order", "name.asc,created_at.desc".to_owned()),
    ];

    if let Some(query) = q {
        if !query.is_empty() {
            // PostgREST ilike wildcard is `*`; legacy uses `%${q}%`.
            params.push(("name", format!("ilike.*{}*", escape_like_value(query))));
        }
    }

    if let Some(ids) = restrict_board_ids {
        let joined = ids.join(",");
        params.push(("id", format!("in.({joined})")));
    }

    let Some(url) = contact_data.rest_url("workspace_boards", &params) else {
        return Err(());
    };

    // Pagination range (range(start, end).limit(pageSize)); legacy: start = (page-1)*size.
    let start = (page - 1).max(0) * page_size;
    let end = start + page_size - 1;
    let range = format!("{start}-{end}");

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    let count = total_count_from_content_range(&response);
    let boards = response.json::<Vec<Map<String, Value>>>().map_err(|_| ())?;

    Ok((boards, count))
}

async fn fetch_task_lists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_ids: &[String],
) -> Result<Vec<TaskListRow>, ()> {
    if board_ids.is_empty() {
        return Ok(Vec::new());
    }

    let joined = board_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "task_lists",
        &[
            (
                "select",
                "id,name,status,color,position,archived,board_id".to_owned(),
            ),
            ("board_id", format!("in.({joined})")),
            ("deleted", "eq.false".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<TaskListRow>>().map_err(|_| ())
}

async fn fetch_tasks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    list_ids: &[String],
) -> Result<Vec<TaskRow>, ()> {
    if list_ids.is_empty() {
        return Ok(Vec::new());
    }

    let joined = list_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            (
                "select",
                "id,name,description,closed_at,priority,start_date,end_date,created_at,list_id"
                    .to_owned(),
            ),
            ("list_id", format!("in.({joined})")),
            ("deleted_at", "is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<TaskRow>>().map_err(|_| ())
}

// ---------- Member permissions (mirrors getPermissions -> manage_projects) ----------

/// Returns:
///   Ok(None)        => getPermissions would return null (no perms / ws not found) -> 404.
///   Ok(Some(true))  => has `manage_projects`.
///   Ok(Some(false)) => has a permission set but lacks `manage_projects`.
///   Err(())         => unexpected query failure -> 500.
async fn load_manage_projects_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<bool>, ()> {
    // Workspace creator lookup. Legacy treats missing workspace as null -> 404.
    let creator_id = match fetch_workspace_creator(contact_data, outbound, ws_id).await? {
        Some(creator_id) => creator_id,
        None => return Ok(None),
    };
    let is_creator = creator_id == user_id;

    // Role-membership permissions (MEMBER path).
    let role_permissions = fetch_role_permissions(contact_data, outbound, ws_id, user_id).await?;

    // Default workspace permissions for MEMBER member_type.
    let default_permissions =
        fetch_default_permissions(contact_data, outbound, ws_id, "MEMBER").await?;

    let has_permissions =
        is_creator || !role_permissions.is_empty() || !default_permissions.is_empty();

    if !has_permissions {
        // getPermissions returns null.
        return Ok(None);
    }

    // Build the effective permission set (creator => all permissions, so always
    // contains manage_projects).
    if is_creator {
        return Ok(Some(true));
    }

    let mut permissions: BTreeSet<String> = BTreeSet::new();
    permissions.extend(role_permissions);
    permissions.extend(default_permissions);

    let is_admin = permissions.contains(ADMIN_PERMISSION);
    let contains = is_admin || permissions.contains(MANAGE_PROJECTS_PERMISSION);

    Ok(Some(contains))
}

async fn fetch_workspace_creator(
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

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn fetch_role_permissions(
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

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<RoleMemberRow>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        let Some(join) = row.workspace_roles else {
            continue;
        };
        let nodes = match join {
            RoleJoin::One(node) => vec![node],
            RoleJoin::Many(nodes) => nodes,
        };
        for node in nodes {
            for perm in node.workspace_role_permissions {
                if let Some(permission) = perm.permission {
                    permissions.push(permission);
                }
            }
        }
    }
    Ok(permissions)
}

async fn fetch_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    member_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{member_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<DefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// ---------- Guest shares ----------

async fn load_guest_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    auth_email: Option<&str>,
) -> Result<Vec<GuestShare>, ()> {
    let recipient_email = match normalize_email(auth_email) {
        Some(email) => Some(email),
        None => get_user_private_email(contact_data, outbound, user_id).await?,
    };

    let mut shares: Vec<GuestShare> = Vec::new();

    for share in query_guest_shares(
        contact_data,
        outbound,
        ws_id,
        ("shared_with_user_id", user_id),
    )
    .await?
    {
        shares.push(share);
    }

    if let Some(email) = recipient_email.as_deref() {
        for share in
            query_guest_shares(contact_data, outbound, ws_id, ("shared_with_email", email)).await?
        {
            shares.push(share);
        }
    }

    Ok(shares)
}

async fn query_guest_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    matcher: (&str, &str),
) -> Result<Vec<GuestShare>, ()> {
    let (filter_key, filter_value) = matcher;
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            (
                "select",
                "board_id,permission,workspace_boards!inner(id,ws_id,deleted_at)".to_owned(),
            ),
            ("workspace_boards.ws_id", format!("eq.{ws_id}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
            (filter_key, format!("eq.{filter_value}")),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskBoardShareRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| {
            let board_id = row.board_id.filter(|id| !id.is_empty())?;
            // Legacy requires a non-null permission for the share to be valid.
            let permission = row.permission.filter(|value| !value.is_empty())?;
            Some(GuestShare {
                board_id,
                permission,
            })
        })
        .collect())
}

async fn get_user_private_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "email".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<UserPrivateEmailRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.email)
        .as_deref()
        .and_then(|email| normalize_email(Some(email))))
}

fn highest_permission(shares: &[GuestShare]) -> Option<String> {
    if shares.iter().any(|share| share.permission == "edit") {
        Some("edit".to_owned())
    } else if shares.iter().any(|share| share.permission == "view") {
        Some("view".to_owned())
    } else {
        None
    }
}

fn permission_rank(permission: &str) -> u8 {
    match permission {
        "edit" => 2,
        "view" => 1,
        _ => 0,
    }
}

// ---------- Value shaping ----------

fn task_list_to_value(list: &TaskListRow, tasks: Vec<Value>) -> Value {
    let mut map = Map::new();
    map.insert("id".to_owned(), Value::String(list.id.clone()));
    map.insert("name".to_owned(), clone_opt(&list.name));
    map.insert("status".to_owned(), clone_opt(&list.status));
    map.insert("color".to_owned(), clone_opt(&list.color));
    map.insert("position".to_owned(), clone_opt(&list.position));
    map.insert("archived".to_owned(), clone_opt(&list.archived));
    map.insert(
        "board_id".to_owned(),
        list.board_id
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    map.insert("tasks".to_owned(), Value::Array(tasks));
    Value::Object(map)
}

fn task_to_value(task: &TaskRow) -> Value {
    let mut map = Map::new();
    map.insert("id".to_owned(), Value::String(task.id.clone()));
    map.insert(
        "list_id".to_owned(),
        task.list_id
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    for (key, value) in &task.rest {
        map.insert(key.clone(), value.clone());
    }
    Value::Object(map)
}

fn clone_opt(value: &Option<Value>) -> Value {
    value.clone().unwrap_or(Value::Null)
}

fn board_id(board: &Map<String, Value>) -> Option<String> {
    board.get("id").and_then(Value::as_str).map(str::to_owned)
}

// ---------- Query parsing ----------

struct ParsedQuery {
    q: Option<String>,
    page: i64,
    page_size: i64,
}

fn parse_query(request_url: Option<&str>) -> ParsedQuery {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());

    let q = url
        .as_ref()
        .and_then(|url| {
            url.query_pairs()
                .find_map(|(name, value)| (name == "q").then(|| value.into_owned()))
        })
        .filter(|value| !value.is_empty());

    let page = parse_int_default(query_value(url.as_ref(), "page"), DEFAULT_PAGE);
    let page_size = parse_int_default(query_value(url.as_ref(), "pageSize"), DEFAULT_PAGE_SIZE);

    ParsedQuery { q, page, page_size }
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

/// Mirrors `parseInt(value, 10)`: parse leading integer, default when absent or
/// unparseable (NaN). Legacy zod defaults page/pageSize to "1"/"10".
fn parse_int_default(value: Option<String>, default: i64) -> i64 {
    match value {
        Some(raw) => parse_leading_int(&raw).unwrap_or(default),
        None => default,
    }
}

fn parse_leading_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut end = 0;
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    if index < bytes.len() && (bytes[index] == b'-' || bytes[index] == b'+') {
        index += 1;
    }
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
        end = index;
    }
    if end == 0 {
        return None;
    }
    trimmed[..end].parse::<i64>().ok()
}

/// PostgREST treats `,`, `.`, `(`, `)`, `:`, `*` specially in some operator
/// positions. For an ilike pattern value we keep the user text but neutralize the
/// `*` wildcard injection by leaving user `%`/`_` intact (legacy used `%q%`), and
/// only guard the structural `*` we add. Here we simply pass the raw query through;
/// the `form_urlencoded` serializer in `rest_url` handles encoding.
fn escape_like_value(value: &str) -> String {
    value.to_owned()
}

// ---------- Workspace id normalization + membership (copied helpers) ----------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved);
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

    Ok(resolved)
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

// ---------- Outbound helpers ----------

async fn caller_get(
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

async fn service_role_get(
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

// ---------- Pure helpers ----------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<i64>().ok()
}

fn boards_data_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
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
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_uuid_literal(value: &str) -> bool {
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
