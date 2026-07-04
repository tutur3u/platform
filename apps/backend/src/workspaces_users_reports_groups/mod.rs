//! Handler for `/api/v1/workspaces/:wsId/users/reports/groups`.
//!
//! Mirrors the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/reports/groups/route.ts`.
//!
//! The legacy `GET` handler:
//! 1. Resolves the `wsId` alias (`personal`/`internal`/handle) and authenticates
//!    the caller through `getPermissions({ wsId, request })`. When that returns
//!    `null` (no session / no membership / no effective permissions) the route
//!    responds `404 { "error": "Not found" }`.
//! 2. Requires the `view_user_groups_reports` permission, otherwise
//!    `403 { "message": "Unauthorized" }`.
//! 3. Validates the `q` (<= 500 chars) and `selectedGroupId` (<= 100 chars)
//!    query parameters, returning `400 { "message": "Invalid query parameters",
//!    "issues": [...] }` on failure.
//! 4. Scopes the visible groups: members with `manage_users` see everything,
//!    otherwise only groups the caller is a member of (via
//!    `getUserGroupMemberships`). When the restricted set is empty it short
//!    circuits to an empty payload.
//! 5. Fetches the `workspace_user_groups_with_guest` rows (ordered by name,
//!    limit 20, optional `ilike` search, optional `id in (...)` filter), the
//!    selected group, its TEACHER-role managers, and the
//!    `get_group_report_status_summary` RPC result (filtered to accessible
//!    groups when scoped).
//!
//! On success it returns
//! `{ groups, selectedGroup, selectedGroupManagers, groupStatusSummary }`.
//!
//! Self-containment note: this module copies the workspace-id normalization and
//! effective-permission resolution patterns from
//! `workspace_permission_check.rs` and the manager-mapping pattern from
//! `workspaces_user_groups_managers.rs` as file-local helpers, because those
//! source helpers are private to their modules and this task forbids editing
//! other files. The `pub(crate) authorize_workspace_permission` helper is not
//! reused because this route also needs the *full* effective permission set to
//! evaluate `manage_users` and to map the no-permission case to a `404` (rather
//! than `403`).

pub(crate) use base64::Engine;
pub(crate) use base64::engine::general_purpose::URL_SAFE;
pub(crate) use serde::Deserialize;
pub(crate) use serde_json::{Value, json};
pub(crate) use std::collections::BTreeMap;

pub(crate) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const ADMIN_PERMISSION: &str = "admin";
pub(crate) const APP_SESSION_BEARER_PREFIX: &str = "ttr_app_";
pub(crate) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(crate) const MANAGE_USERS_PERMISSION: &str = "manage_users";
pub(crate) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(crate) const REPORTS_GROUPS_PATH_SUFFIX: &str = "/users/reports/groups";
pub(crate) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
pub(crate) const VIEW_USER_GROUPS_REPORTS_PERMISSION: &str = "view_user_groups_reports";
pub(crate) const WORKSPACES_PATH_PREFIX: &str = "/api/v1/workspaces/";

// Mirrors `MAX_SEARCH_LENGTH` (q) and `MAX_SHORT_TEXT_LENGTH` (selectedGroupId).
pub(crate) const MAX_SEARCH_LENGTH: usize = 500;
pub(crate) const MAX_SHORT_TEXT_LENGTH: usize = 100;

pub(crate) const GROUP_REPORT_STATUS_SUMMARY_RPC: &str = "get_group_report_status_summary";
pub(crate) const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";

mod db;
mod handler;
mod helpers;
mod params;
mod permissions;
mod responses;
mod types;
mod workspace_id;

use db::*;
use handler::*;
use helpers::*;
use params::*;
use permissions::*;
use responses::*;
use types::*;
use workspace_id::*;

pub(crate) async fn handle_workspaces_users_reports_groups_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = reports_groups_ws_id(request.path)?;

    Some(match request.method {
        "GET" => reports_groups_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

fn reports_groups_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_PATH_PREFIX)?
        .strip_suffix(REPORTS_GROUPS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
