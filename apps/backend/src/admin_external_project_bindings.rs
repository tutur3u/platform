//! Handler for `GET /api/v1/admin/external-project-bindings`.
//!
//! Legacy source: `apps/web/src/app/api/v1/admin/external-project-bindings/route.ts`.
//!
//! The legacy route:
//! 1. Calls `requireRootExternalProjectsAdmin(request)` — authenticates the
//!    Supabase user, then resolves their permissions in the ROOT workspace and
//!    requires `manage_external_projects` OR `manage_workspace_roles`. On failure
//!    it returns `{ error: "Unauthorized" }` (401) or `{ error: "Forbidden" }`
//!    (403).
//! 2. Calls `listExternalProjectWorkspaceBindingSummaries(admin)` (service role)
//!    and returns the resulting array as JSON. Any thrown error becomes
//!    `{ error: "Failed to load external project workspace bindings" }` (500).
//!
//! `listExternalProjectWorkspaceBindingSummaries` reads (all with the service
//! role / admin client):
//! - `workspaces` (id, name, personal, avatar_url, logo_url) ordered by
//!   `personal asc, name asc`.
//! - `canonical_external_projects` (`*`) ordered by `display_name asc`.
//! - `workspace_secrets` (ws_id, name, value) filtered to
//!   `EXTERNAL_PROJECT_ENABLED` / `EXTERNAL_PROJECT_CANONICAL_ID` for the listed
//!   workspace ids (chunked by 100 in the legacy helper; here we issue a single
//!   `in.(...)` query, which is equivalent for the result set).
//! - `workspace_external_project_binding_audits` (`*`) ordered by
//!   `changed_at desc`, limited to 500 — the latest audit per destination ws_id
//!   is attached to the summary.
//!
//! NOTE on copied helpers: `effective_workspace_permissions` and its supporting
//! Supabase readers are a file-local copy of the permission-resolution logic
//! that exists as private fns in `cms_workspaces.rs` /
//! `workspace_external_projects_summary.rs`. They are NOT importable (private),
//! so per the one-file constraint they are reimplemented here.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_EXTERNAL_PROJECT_BINDINGS_PATH: &str = "/api/v1/admin/external-project-bindings";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const ADMIN_PERMISSION: &str = "admin";

const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

// Root-level admin permissions that grant access to the binding summaries.
const ROOT_ADMIN_PERMISSIONS: [&str; 2] = ["manage_external_projects", "manage_workspace_roles"];

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to load external project workspace bindings";

const BINDING_AUDIT_LIMIT: &str = "500";

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceRow {
    id: Option<String>,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    ws_id: Option<String>,
    name: Option<String>,
    value: Option<String>,
}

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

/// Audit row. The legacy helper attaches the latest audit per destination
/// workspace and surfaces these specific fields onto the summary.
#[derive(Deserialize)]
struct BindingAuditRow {
    id: Option<String>,
    destination_ws_id: Option<String>,
    actor_user_id: Option<String>,
    changed_at: Option<String>,
    next_canonical_id: Option<String>,
    previous_canonical_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_admin_external_project_bindings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ADMIN_EXTERNAL_PROJECT_BINDINGS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => bindings_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn bindings_response(
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

    // --- listExternalProjectWorkspaceBindingSummaries -----------------------

    match list_binding_summaries(contact_data, outbound).await {
        Ok(summaries) => no_store_response(json_response(200, Value::Array(summaries))),
        Err(()) => error_response(500, LOAD_FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Summary builder (mirrors listExternalProjectWorkspaceBindingSummaries)
// ---------------------------------------------------------------------------

async fn list_binding_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let workspaces = list_workspaces(contact_data, outbound).await?;
    let canonical_projects = list_canonical_external_projects(contact_data, outbound).await?;

    let workspace_ids: Vec<String> = workspaces
        .iter()
        .filter_map(|workspace| workspace.id.clone())
        .collect();

    let secrets = list_workspace_secrets(contact_data, outbound, &workspace_ids).await?;
    let audits = list_binding_audits(contact_data, outbound).await?;

    // projectById
    let project_by_id: std::collections::HashMap<String, Value> = canonical_projects
        .into_iter()
        .filter_map(|project| {
            project
                .get("id")
                .and_then(Value::as_str)
                .map(|id| (id.to_owned(), project.clone()))
        })
        .collect();

    // secretsByWorkspace (skip null values, mirroring the legacy `continue`).
    let mut secrets_by_workspace: std::collections::HashMap<String, Vec<(String, String)>> =
        std::collections::HashMap::new();
    for secret in secrets {
        let (Some(ws_id), Some(name), Some(value)) = (secret.ws_id, secret.name, secret.value)
        else {
            continue;
        };
        secrets_by_workspace
            .entry(ws_id)
            .or_default()
            .push((name, value));
    }

    // latestAuditByWorkspace: first audit seen per destination (audits are
    // ordered changed_at desc, so the first is the latest).
    let mut latest_audit_by_workspace: std::collections::HashMap<String, &BindingAuditRow> =
        std::collections::HashMap::new();
    for audit in &audits {
        if let Some(destination) = audit.destination_ws_id.as_deref() {
            latest_audit_by_workspace
                .entry(destination.to_owned())
                .or_insert(audit);
        }
    }

    let summaries = workspaces
        .iter()
        .map(|workspace| {
            let workspace_id = workspace.id.clone().unwrap_or_default();
            let workspace_secrets = secrets_by_workspace.get(&workspace_id);

            let enabled = workspace_secrets
                .map(|rows| {
                    rows.iter()
                        .any(|(name, value)| name == ENABLED_SECRET && value == "true")
                })
                .unwrap_or(false);

            let canonical_id: Option<String> = workspace_secrets.and_then(|rows| {
                rows.iter()
                    .find(|(name, _)| name == CANONICAL_ID_SECRET)
                    .map(|(_, value)| value.clone())
            });

            // canonicalProject = canonicalId && enabled ? projectById.get(canonicalId) : null
            let canonical_project: Option<&Value> = match (&canonical_id, enabled) {
                (Some(id), true) => project_by_id.get(id),
                _ => None,
            };
            let canonical_is_active = canonical_project
                .and_then(|project| project.get("is_active"))
                .and_then(Value::as_bool)
                == Some(true);

            // binding.canonical_project: enabled && canonicalProject?.is_active
            let binding_canonical_project = if enabled && canonical_is_active {
                canonical_project.cloned().unwrap_or(Value::Null)
            } else {
                Value::Null
            };
            // binding.adapter: canonicalProject?.adapter ?? null
            let binding_adapter = canonical_project
                .and_then(|project| project.get("adapter"))
                .cloned()
                .unwrap_or(Value::Null);
            // binding.enabled: enabled && Boolean(canonicalId) && Boolean(canonicalProject?.is_active)
            let binding_enabled = enabled && canonical_id.is_some() && canonical_is_active;

            let latest_audit = latest_audit_by_workspace.get(&workspace_id);

            json!({
                "avatar_url": workspace.avatar_url,
                "binding": {
                    "adapter": binding_adapter,
                    "canonical_id": canonical_id,
                    "canonical_project": binding_canonical_project,
                    "enabled": binding_enabled,
                    "workspace_id": workspace_id,
                },
                "created_by_me": false,
                "id": workspace_id,
                "last_actor_user_id": latest_audit
                    .and_then(|audit| audit.actor_user_id.clone()),
                "last_audit_id": latest_audit.and_then(|audit| audit.id.clone()),
                "last_changed_at": latest_audit.and_then(|audit| audit.changed_at.clone()),
                "last_next_canonical_id": latest_audit
                    .and_then(|audit| audit.next_canonical_id.clone()),
                "last_previous_canonical_id": latest_audit
                    .and_then(|audit| audit.previous_canonical_id.clone()),
                "logo_url": workspace.logo_url,
                "name": workspace.name,
                "personal": workspace.personal,
            })
        })
        .collect();

    Ok(summaries)
}

// ---------------------------------------------------------------------------
// Supabase reads (service role)
// ---------------------------------------------------------------------------

async fn list_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id,name,personal,avatar_url,logo_url".to_owned()),
            ("order", "personal.asc,name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<WorkspaceRow>>().map_err(|_| ())
}

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

async fn list_workspace_secrets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_ids: &[String],
) -> Result<Vec<WorkspaceSecretRow>, ()> {
    if workspace_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("({})", workspace_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "ws_id,name,value".to_owned()),
            ("ws_id", format!("in.{in_list}")),
            (
                "name",
                format!("in.({ENABLED_SECRET},{CANONICAL_ID_SECRET})"),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<WorkspaceSecretRow>>().map_err(|_| ())
}

async fn list_binding_audits(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<BindingAuditRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_binding_audits",
        &[
            ("select", "*".to_owned()),
            ("order", "changed_at.desc".to_owned()),
            ("limit", BINDING_AUDIT_LIMIT.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<BindingAuditRow>>().map_err(|_| ())
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
