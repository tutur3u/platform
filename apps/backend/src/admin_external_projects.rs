//! Handler for `GET /api/v1/admin/external-projects`.
//!
//! Legacy source: `apps/web/src/app/api/v1/admin/external-projects/route.ts`.
//!
//! Only the **GET** method is migrated here. The legacy route also defines a
//! `POST` (create canonical external project) that is NOT yet migrated, so this
//! handler returns `None` for every non-GET method, letting the Cloudflare
//! worker fall through to the still-active Next.js route for those mutations.
//!
//! The legacy GET:
//! 1. Calls `requireRootExternalProjectsAdmin(request)` — authenticates the
//!    Supabase user, resolves their permissions in the ROOT workspace, and
//!    requires `manage_external_projects` OR `manage_workspace_roles`. On
//!    failure it returns `{ error: "Unauthorized" }` (401) or
//!    `{ error: "Forbidden" }` (403).
//! 2. Calls `listCanonicalExternalProjects(admin)` (service role) which selects
//!    `*` from `canonical_external_projects` ordered by `display_name asc`, and
//!    returns the resulting array as JSON (200). Any thrown error becomes
//!    `{ error: "Failed to list canonical external projects" }` (500).
//!
//! NOTE on copied helpers: the permission-resolution logic
//! (`effective_workspace_permissions` and its Supabase readers) and the
//! `list_canonical_external_projects` reader are file-local copies of private
//! fns that already exist in sibling modules (notably
//! `admin_external_project_bindings.rs`). They are private and therefore not
//! importable, so per the one-file constraint they are reimplemented here.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_EXTERNAL_PROJECTS_PATH: &str = "/api/v1/admin/external-projects";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const ADMIN_PERMISSION: &str = "admin";

// Root-level admin permissions that grant access to the canonical project list.
const ROOT_ADMIN_PERMISSIONS: [&str; 2] = ["manage_external_projects", "manage_workspace_roles"];

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to list canonical external projects";

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MembershipRow {
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
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<PermissionRow>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_admin_external_projects_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ADMIN_EXTERNAL_PROJECTS_PATH {
        return None;
    }

    // Only the GET method is migrated. Every other method (e.g. the still-active
    // Next.js POST) must fall through to the legacy route, so return None rather
    // than a 405.
    Some(match request.method {
        "GET" => canonical_projects_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn canonical_projects_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, LOAD_FAILED_MESSAGE);
    }

    // --- requireRootExternalProjectsAdmin -----------------------------------

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let root_permissions =
        match effective_workspace_permissions(contact_data, outbound, ROOT_WORKSPACE_ID, &user_id)
            .await
        {
            Ok(permissions) => permissions,
            // getPermissions failures in the legacy path leave `permissions` null,
            // which is treated as "no admin permission" (403). Internal Supabase
            // failures here mirror that conservative denial.
            Err(()) => return error_response(403, FORBIDDEN_MESSAGE),
        };

    if !permissions_contain_any(&root_permissions, &ROOT_ADMIN_PERMISSIONS) {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    // --- listCanonicalExternalProjects --------------------------------------

    match list_canonical_external_projects(contact_data, outbound).await {
        Ok(projects) => no_store_response(json_response(200, Value::Array(projects))),
        Err(()) => error_response(500, LOAD_FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Supabase reads (service role)
// ---------------------------------------------------------------------------

async fn list_canonical_external_projects(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "*".to_owned()),
            ("order", "display_name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Permissions (mirrors getPermissions composition used by access.ts)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct WorkspaceAccess {
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    fn none() -> Self {
        Self {
            all: false,
            permissions: Vec::new(),
        }
    }

    fn all() -> Self {
        Self {
            all: true,
            permissions: Vec::new(),
        }
    }

    fn from_permissions(permissions: Vec<String>) -> Self {
        let all = permissions
            .iter()
            .any(|permission| permission == ADMIN_PERMISSION);
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

fn permissions_contain_any(access: &WorkspaceAccess, candidates: &[&str]) -> bool {
    candidates
        .iter()
        .any(|candidate| access.contains(candidate))
}

/// Resolve the effective permission ids a user has in a workspace, mirroring
/// `getPermissions`. Returns "no access" when the user is not a member or the
/// workspace is missing. A creator (MEMBER whose id is the workspace creator)
/// gets every permission; an `admin` permission grants all checks.
async fn effective_workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<WorkspaceAccess, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, workspace_id, user_id).await?
    else {
        return Ok(WorkspaceAccess::none());
    };

    let Some(creator_id) = workspace_creator_id(contact_data, outbound, workspace_id).await? else {
        // Workspace not found -> getPermissions returns null.
        return Ok(WorkspaceAccess::none());
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;
    if is_creator {
        return Ok(WorkspaceAccess::all());
    }

    let mut permissions = Vec::new();
    if membership_type == "MEMBER" {
        permissions.extend(role_permissions(contact_data, outbound, workspace_id, user_id).await?);
    }
    permissions
        .extend(default_permissions(contact_data, outbound, workspace_id, &membership_type).await?);

    Ok(WorkspaceAccess::from_permissions(permissions))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
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
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{workspace_id}")),
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

async fn role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
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
            ("workspace_roles.ws_id", format!("eq.{workspace_id}")),
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
    Ok(response
        .json::<Vec<RoleMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .flat_map(|member| member.workspace_roles)
        .flat_map(|role| role.workspace_role_permissions)
        .filter_map(|permission| permission.permission)
        .collect())
}

async fn default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    member_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
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
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
