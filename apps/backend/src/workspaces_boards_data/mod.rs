//! Port of GET /api/v1/workspaces/:wsId/boards-data
//!
//! Legacy source:
//!   apps/web/src/app/api/v1/workspaces/[wsId]/boards-data/route.ts
//!
//! Behavior summary (faithful to the legacy route):
//!   * Authenticated GET. App-session auth is allowed (legacy `allowAppSessionAuth`
//!     targets the `tasks` app), so caller bearer/cookie tokens are accepted even
//!     when an app session token is present.
//!   * Verify workspace membership. A membership *lookup failure* -> 500 with
//!     `{ error: "Failed to verify workspace membership" }`.
//!   * If the caller is a MEMBER, compute permissions (mirroring `getPermissions`).
//!     - No permissions at all (or workspace not found) -> 404 "Workspace not found".
//!     - Permissions present but missing `manage_projects` -> 403.
//!   * If the caller is NOT a member, fall back to task-board guest shares. If they
//!     have zero guest boards -> 403 "You don't have access to this workspace".
//!   * Fetch boards (`workspace_boards.*`) filtered by ws_id, ordered by
//!     name asc, created_at desc, with optional `q` ilike on name, paginated via
//!     `page`/`pageSize` (default 1 / 10) using PostgREST Range + count=exact.
//!     Guests are additionally restricted to their shared board ids.
//!   * Fetch task_lists (deleted=false) for those boards and tasks (deleted_at null)
//!     for those lists, then group lists under boards and tasks under lists.
//!   * Decorate each board with `access_type` ("member"|"guest") and
//!     `guest_permission` (null for members; per-board share permission, default
//!     "view", for guests).
//!   * Respond `{ data, count, access_type, guest_highest_permission }`.
//!
//! NOTE: All Supabase reads go through the service-role REST client (mirroring the
//! legacy `createAdminClient()` / `sbAdmin` usage). Workspace access is enforced
//! explicitly above via membership + permission + guest-share checks rather than
//! relying on RLS. This matches the legacy route, which performs all reads with the
//! admin client after its own access checks.
//!
//! IMPORTANT (integrator note): This module is fully self-contained. Several small
//! helpers (workspace-id normalization, membership verification, guest-share email
//! resolution, REST request helpers, UUID/handle predicates) are intentionally
//! COPIED as file-local fns from `workspaces_boards_with_lists.rs` / the habits
//! reference rather than shared, per the one-file constraint. No existing file was
//! modified.

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

// Query parameters parsed from the request URL.
struct ParsedQuery {
    q: Option<String>,
    page: i64,
    page_size: i64,
}

// ---------- Submodules ----------

mod db;
mod guest_shares;
mod handler;
mod helpers;
mod http;
mod permissions;
mod query;
mod response;
mod workspace_id;

use db::*;
use guest_shares::*;
use handler::*;
use helpers::*;
use http::*;
use permissions::*;
use query::*;
use response::*;
use workspace_id::*;

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
