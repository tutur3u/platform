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

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::Deserialize;
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
const MANAGE_USERS_PERMISSION: &str = "manage_users";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const REPORTS_GROUPS_PATH_SUFFIX: &str = "/users/reports/groups";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_USER_GROUPS_REPORTS_PERMISSION: &str = "view_user_groups_reports";
const WORKSPACES_PATH_PREFIX: &str = "/api/v1/workspaces/";

// Mirrors `MAX_SEARCH_LENGTH` (q) and `MAX_SHORT_TEXT_LENGTH` (selectedGroupId).
const MAX_SEARCH_LENGTH: usize = 500;
const MAX_SHORT_TEXT_LENGTH: usize = 100;

const GROUP_REPORT_STATUS_SUMMARY_RPC: &str = "get_group_report_status_summary";
const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";

#[derive(Clone, Debug, Default)]
struct SupabaseAuthCookieGroup {
    base: Option<String>,
    chunks: BTreeMap<usize, String>,
    duplicate: bool,
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

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceUserLinkRow {
    platform_user_id: Option<String>,
    virtual_user_id: Option<String>,
}

#[derive(Deserialize)]
struct GroupMembershipRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct ReportGroupRow {
    id: Option<String>,
    name: Option<String>,
    ws_id: Option<String>,
}

struct EffectiveWorkspacePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

impl EffectiveWorkspacePermissions {
    fn contains(&self, permission: &str) -> bool {
        self.has_all_permissions || self.permissions.iter().any(|value| value == permission)
    }
}

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

async fn reports_groups_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return internal_server_error_response();
    }

    // `getPermissions` returns `null` for missing/invalid sessions -> 404.
    let Some(access_token) = request_access_token_ignoring_app_sessions(request) else {
        return not_found_response();
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return not_found_response();
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) => ws_id,
            // No resolvable workspace / lookup failure -> getPermissions null -> 404.
            Ok(None) | Err(()) => return not_found_response(),
        };

    let permissions = match effective_workspace_permissions(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        // No membership / no effective permissions -> getPermissions null -> 404.
        Ok(Some(permissions)) => permissions,
        Ok(None) => return not_found_response(),
        Err(()) => return internal_server_error_response(),
    };

    if !permissions.contains(VIEW_USER_GROUPS_REPORTS_PERMISSION) {
        return unauthorized_response();
    }

    // Validate `q` and `selectedGroupId` query parameters.
    let (q, selected_group_id) = match parse_search_params(request.url) {
        Ok(parsed) => parsed,
        Err(response) => return response,
    };

    let has_manage_users = permissions.contains(MANAGE_USERS_PERMISSION);
    let accessible_group_ids: Option<Vec<String>> = if has_manage_users {
        None
    } else {
        match user_group_memberships(contact_data, outbound, &resolved_ws_id, &user_id).await {
            Ok(ids) => Some(ids),
            Err(()) => return internal_server_error_response(),
        }
    };

    // Restricted caller with no accessible groups -> empty payload.
    if accessible_group_ids
        .as_ref()
        .is_some_and(|ids| ids.is_empty())
    {
        return no_store_response(json_response(
            200,
            json!({
                "groups": [],
                "selectedGroup": Value::Null,
                "selectedGroupManagers": [],
                "groupStatusSummary": [],
            }),
        ));
    }

    let groups = match fetch_report_groups(
        contact_data,
        outbound,
        &resolved_ws_id,
        q.as_deref(),
        accessible_group_ids.as_deref(),
    )
    .await
    {
        Ok(groups) => groups,
        Err(()) => return error_fetching_response(),
    };

    let mut selected_group = selected_group_id
        .as_deref()
        .and_then(|id| groups.iter().find(|group| group.id.as_deref() == Some(id)))
        .map(report_group_to_value);

    if let Some(selected_id) = selected_group_id.as_deref() {
        if selected_group.is_none() {
            match fetch_selected_report_group(
                contact_data,
                outbound,
                &resolved_ws_id,
                selected_id,
                accessible_group_ids.as_deref(),
            )
            .await
            {
                Ok(group) => selected_group = group.as_ref().map(report_group_to_value),
                Err(()) => return error_fetching_response(),
            }
        }
    }

    let selected_group_managers = match (selected_group_id.as_deref(), selected_group.is_some()) {
        (Some(selected_id), true) => {
            match fetch_group_managers(contact_data, outbound, selected_id, &resolved_ws_id).await {
                Ok(managers) => managers,
                Err(()) => return error_fetching_response(),
            }
        }
        _ => Vec::new(),
    };

    let group_status_summary = match fetch_group_status_summary(
        contact_data,
        outbound,
        &resolved_ws_id,
        accessible_group_ids.as_deref(),
    )
    .await
    {
        Ok(summary) => summary,
        Err(()) => return error_fetching_response(),
    };

    let groups_json: Vec<Value> = groups.iter().map(report_group_to_value).collect();

    no_store_response(json_response(
        200,
        json!({
            "groups": groups_json,
            "selectedGroup": selected_group.unwrap_or(Value::Null),
            "selectedGroupManagers": selected_group_managers,
            "groupStatusSummary": group_status_summary,
        }),
    ))
}

/// Parses the `q` and `selectedGroupId` query parameters, mirroring the legacy
/// zod schema (`q.max(500).optional()`, `selectedGroupId.max(100).optional()`).
/// Returns `Err(response)` with the legacy `400` payload when validation fails.
fn parse_search_params(
    request_url: Option<&str>,
) -> Result<(Option<String>, Option<String>), BackendResponse> {
    let mut q: Option<String> = None;
    let mut selected_group_id: Option<String> = None;

    if let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "q" => q = Some(value.into_owned()),
                "selectedGroupId" => selected_group_id = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let mut issues = Vec::new();

    if let Some(value) = q.as_deref() {
        if value.chars().count() > MAX_SEARCH_LENGTH {
            issues.push(too_big_issue("q", MAX_SEARCH_LENGTH));
        }
    }

    if let Some(value) = selected_group_id.as_deref() {
        if value.chars().count() > MAX_SHORT_TEXT_LENGTH {
            issues.push(too_big_issue("selectedGroupId", MAX_SHORT_TEXT_LENGTH));
        }
    }

    if !issues.is_empty() {
        return Err(no_store_response(json_response(
            400,
            json!({
                "message": "Invalid query parameters",
                "issues": issues,
            }),
        )));
    }

    // Legacy code branches on JS truthiness (`if (q)` / `if (selectedGroupId)`),
    // so empty strings behave like absent values downstream.
    Ok((
        q.filter(|value| !value.is_empty()),
        selected_group_id.filter(|value| !value.is_empty()),
    ))
}

fn too_big_issue(path: &str, maximum: usize) -> Value {
    json!({
        "code": "too_big",
        "maximum": maximum,
        "type": "string",
        "inclusive": true,
        "exact": false,
        "message": format!("String must contain at most {maximum} character(s)"),
        "path": [path],
    })
}

/// Mirrors `getUserGroupMemberships`: resolves the caller's workspace user link
/// (`virtual_user_id`, falling back to `platform_user_id`) and collects the
/// distinct `group_id`s the user belongs to. Returns an empty set when no link
/// exists.
///
/// Note: the legacy helper relies on `getCurrentWorkspaceUser`, which may
/// auto-repair a missing link via the `ensure_workspace_user_link` RPC
/// mutation. This handler intentionally performs a read-only lookup and skips
/// the repair path (see integrator notes).
async fn user_group_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "platform_user_id,virtual_user_id".to_owned()),
            ("platform_user_id", format!("eq.{platform_user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let Some(link) = decode_first_row::<WorkspaceUserLinkRow>(&response)? else {
        return Ok(Vec::new());
    };

    let user_id = link
        .virtual_user_id
        .filter(|id| !id.trim().is_empty())
        .or(link.platform_user_id)
        .filter(|id| !id.trim().is_empty());

    let Some(user_id) = user_id else {
        return Ok(Vec::new());
    };

    let Some(memberships_url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", "group_id".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let memberships_response = send_rest_request(
        contact_data,
        outbound,
        &memberships_url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(memberships_response.status) {
        return Err(());
    }

    let mut group_ids = Vec::new();
    for row in memberships_response
        .json::<Vec<GroupMembershipRow>>()
        .map_err(|_| ())?
    {
        if let Some(group_id) = row.group_id.filter(|id| !id.is_empty()) {
            if !group_ids.iter().any(|existing| existing == &group_id) {
                group_ids.push(group_id);
            }
        }
    }

    Ok(group_ids)
}

/// Queries `workspace_user_groups_with_guest` for the workspace (ordered by
/// name, limit 20), with an optional `ilike` search and an optional
/// `id=in.(...)` accessible-group filter.
async fn fetch_report_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    q: Option<&str>,
    accessible_group_ids: Option<&[String]>,
) -> Result<Vec<ReportGroupRow>, ()> {
    let mut params = vec![
        ("select", "id,name,ws_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc".to_owned()),
        ("limit", "20".to_owned()),
    ];

    if let Some(query) = q.filter(|value| !value.is_empty()) {
        let escaped = escape_like_wildcards(query);
        params.push(("name", format!("ilike.*{escaped}*")));
    }

    if let Some(ids) = accessible_group_ids {
        params.push(("id", format!("in.({})", join_id_list(ids))));
    }

    let Some(url) = contact_data.rest_url("workspace_user_groups_with_guest", &params) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<ReportGroupRow>>().map_err(|_| ())
}

/// Looks up a single group by id within the workspace, optionally restricted to
/// the accessible group set. Returns `Ok(None)` when no matching row exists.
async fn fetch_selected_report_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    selected_group_id: &str,
    accessible_group_ids: Option<&[String]>,
) -> Result<Option<ReportGroupRow>, ()> {
    let mut params = vec![
        ("select", "id,name,ws_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("id", format!("eq.{selected_group_id}")),
        ("limit", "1".to_owned()),
    ];

    if let Some(ids) = accessible_group_ids {
        params.push(("id", format!("in.({})", join_id_list(ids))));
    }

    let Some(url) = contact_data.rest_url("workspace_user_groups_with_guest", &params) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<ReportGroupRow>(&response)
}

/// Mirrors `fetchManagersForGroups` for a single group: TEACHER-role members of
/// the group, mapped to the `ManagerUser` shape
/// `{ id, full_name, avatar_url, display_name, email, hasLinkedPlatformUser }`.
async fn fetch_group_managers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
    _ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            (
                "select",
                "group_id,user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,full_name,avatar_url,display_name,email,workspace_user_linked_users(platform_user_id))"
                    .to_owned(),
            ),
            ("group_id", format!("eq.{group_id}")),
            ("role", "eq.TEACHER".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    let mut managers = Vec::new();
    for row in &rows {
        let user = row.get("user");
        let users: Vec<&Value> = match user {
            Some(Value::Array(items)) => items.iter().collect(),
            Some(value) if !value.is_null() => vec![value],
            _ => Vec::new(),
        };

        for user in users {
            if let Some(manager) = map_manager_user(user) {
                managers.push(manager);
            }
        }
    }

    Ok(managers)
}

/// Builds a `ManagerUser` JSON object from an embedded `workspace_users` row.
/// Returns `None` when the user has no `id` (matching the legacy guard).
fn map_manager_user(user: &Value) -> Option<Value> {
    let id = user.get("id").filter(|value| !value.is_null())?;
    if id.as_str().is_some_and(str::is_empty) {
        return None;
    }

    let platform_user_id = match user.get("workspace_user_linked_users") {
        Some(Value::Array(items)) => items
            .first()
            .and_then(|item| item.get("platform_user_id"))
            .filter(|value| !value.is_null()),
        Some(Value::Object(_)) => user
            .get("workspace_user_linked_users")
            .and_then(|value| value.get("platform_user_id"))
            .filter(|value| !value.is_null()),
        _ => None,
    };

    let has_linked_platform_user = platform_user_id
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty());

    Some(json!({
        "id": id.clone(),
        "full_name": nullable_field(user, "full_name"),
        "avatar_url": nullable_field(user, "avatar_url"),
        "display_name": nullable_field(user, "display_name"),
        "email": nullable_field(user, "email"),
        "hasLinkedPlatformUser": has_linked_platform_user,
    }))
}

fn nullable_field(value: &Value, key: &str) -> Value {
    value
        .get(key)
        .filter(|field| !field.is_null())
        .cloned()
        .unwrap_or(Value::Null)
}

/// Invokes the `get_group_report_status_summary(_ws_id)` RPC and, when scoped,
/// filters rows down to the accessible group ids.
async fn fetch_group_status_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    accessible_group_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data
        .rpc_url(GROUP_REPORT_STATUS_SUMMARY_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "_ws_id": ws_id }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(match accessible_group_ids {
        None => rows,
        Some(ids) => rows
            .into_iter()
            .filter(|row| {
                row.get("group_id")
                    .and_then(Value::as_str)
                    .is_some_and(|group_id| ids.iter().any(|id| id == group_id))
            })
            .collect(),
    })
}

fn report_group_to_value(group: &ReportGroupRow) -> Value {
    json!({
        "id": group.id.clone().map(Value::String).unwrap_or(Value::Null),
        "name": group.name.clone().map(Value::String).unwrap_or(Value::Null),
        "ws_id": group.ws_id.clone().map(Value::String).unwrap_or(Value::Null),
    })
}

// --- Effective permissions (mirrors workspace_permission_check.rs) -----------

async fn effective_workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    resolved_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<EffectiveWorkspacePermissions>, ()> {
    let Some(membership_type) = workspace_membership_type(
        contact_data,
        outbound,
        resolved_ws_id,
        user_id,
        access_token,
    )
    .await?
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

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(Some(EffectiveWorkspacePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
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
    let response = send_rest_request(
        contact_data,
        outbound,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

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
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// --- Workspace id normalization (mirrors workspace_permission_check.rs) ------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
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
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) = workspace_id_by_handle(
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
    user_id: &str,
    access_token: &str,
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
    let response = send_rest_request(
        contact_data,
        outbound,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

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
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// --- Shared low-level helpers -------------------------------------------------

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
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

fn request_access_token_ignoring_app_sessions(request: BackendRequest<'_>) -> Option<String> {
    bearer_access_token(request.authorization).or_else(|| {
        request
            .cookie
            .and_then(supabase_access_token_from_cookie_header)
    })
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

/// Escapes SQL LIKE wildcard characters (`\`, `%`, `_`), matching the legacy
/// `escapeLikeWildcards` helper.
fn escape_like_wildcards(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn join_id_list(ids: &[String]) -> String {
    ids.iter()
        .map(|id| format!("\"{}\"", id.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",")
}

fn reports_groups_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_PATH_PREFIX)?
        .strip_suffix(REPORTS_GROUPS_PATH_SUFFIX)?;

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

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": "Not found" })))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "message": "Unauthorized" })))
}

fn error_fetching_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Error fetching report groups" }),
    ))
}

fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Internal server error" }),
    ))
}
