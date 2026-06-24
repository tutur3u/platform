//! Handler for `GET /api/v1/admin/external-project-bindings/:workspaceId`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/admin/external-project-bindings/[workspaceId]/route.ts`.
//!
//! Only the **GET** method is migrated here. The legacy route also defines a
//! `PATCH` mutation (calls the `set_workspace_external_project_binding` RPC).
//! That method is intentionally NOT migrated: this handler returns `None` for
//! every non-GET method so the Cloudflare worker falls through to the still
//! active Next.js route for `PATCH` (and any future methods).
//!
//! The legacy GET:
//! 1. Calls `requireRootExternalProjectsAdmin(request)` — authenticates the
//!    Supabase user, resolves their permissions at the ROOT workspace, and
//!    requires `manage_external_projects` OR `manage_workspace_roles`. On
//!    failure it returns `{ error: "Unauthorized" }` (401) or
//!    `{ error: "Forbidden" }` (403).
//! 2. Calls `resolveWorkspaceExternalProjectBinding(workspaceId, admin)` (the
//!    RAW `workspaceId` path segment — there is NO handle/UUID normalization in
//!    this route) and returns the binding object as JSON. A thrown error becomes
//!    `{ error: "Failed to resolve workspace external project binding" }` (500).
//!
//! `resolveWorkspaceExternalProjectBinding` (service role / admin client) does a
//! dual-read:
//! - Prefer the first-class `workspace_external_project_bindings` table
//!   (`canonical_project_id`, `is_enabled`). If that query errors OR returns no
//!   row, fall back to the legacy `workspace_secrets` pattern
//!   (`EXTERNAL_PROJECT_ENABLED` / `EXTERNAL_PROJECT_CANONICAL_ID`). The binding
//!   table being absent (migration not applied) is swallowed; only a
//!   `workspace_secrets` read error surfaces as the 500.
//! - Then, when a `canonicalId` exists, reads the matching
//!   `canonical_external_projects` row (`*`).
//!
//! Response shape (mirrors `WorkspaceExternalProjectBinding`):
//! ```jsonc
//! {
//!   "adapter": canonicalProject?.adapter ?? null,
//!   "canonical_id": canonicalId,                 // string | null
//!   "canonical_project": enabled && canonicalProject?.is_active
//!       ? canonicalProject : null,
//!   "enabled": enabled && Boolean(canonicalId)
//!       && Boolean(canonicalProject?.is_active),
//!   "workspace_id": workspaceId,
//! }
//! ```
//!
//! NOTE on copied helpers: `effective_workspace_permissions` and its supporting
//! Supabase readers (`workspace_membership_type`, `workspace_creator_id`,
//! `role_permissions`, `default_permissions`) are a file-local copy of the
//! permission-resolution logic that exists as private fns in the sibling
//! `admin_external_project_bindings.rs` / `cms_workspaces.rs` modules. They are
//! private and therefore not importable, so per the one-file constraint they are
//! reimplemented here.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_EXTERNAL_PROJECT_BINDINGS_PATH_PREFIX: &str =
    "/api/v1/admin/external-project-bindings/";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const ADMIN_PERMISSION: &str = "admin";

const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

// `requireRootExternalProjectsAdmin` grants access when the caller holds either
// of these permissions at the ROOT workspace.
const ROOT_ADMIN_PERMISSIONS: [&str; 2] = ["manage_external_projects", "manage_workspace_roles"];

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const RESOLVE_FAILED_MESSAGE: &str = "Failed to resolve workspace external project binding";

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_admin_external_project_bindings_workspaceid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let workspace_id = workspace_id_segment(request.path)?;

    Some(match request.method {
        "GET" => binding_response(config, request, workspace_id, outbound).await,
        // PATCH (and any other method) is not migrated; returning None lets the
        // worker fall through to the still-active Next.js route.
        _ => return None,
    })
}

/// Extract the single `:workspaceId` segment from the request path. Returns
/// `None` when the path is not this dynamic route (e.g. the collection route
/// `/api/v1/admin/external-project-bindings` with no trailing segment, or a
/// deeper nested path).
fn workspace_id_segment(path: &str) -> Option<&str> {
    let segment = path.strip_prefix(ADMIN_EXTERNAL_PROJECT_BINDINGS_PATH_PREFIX)?;

    (!segment.is_empty() && !segment.contains('/')).then_some(segment)
}

async fn binding_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    workspace_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, RESOLVE_FAILED_MESSAGE);
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
            // getPermissions failures leave `permissions` null in the legacy
            // path, which is treated as "no admin permission" (403). Internal
            // Supabase failures here mirror that conservative denial.
            Err(()) => return error_response(403, FORBIDDEN_MESSAGE),
        };

    if !permissions_contain_any(&root_permissions, &ROOT_ADMIN_PERMISSIONS) {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    // --- resolveWorkspaceExternalProjectBinding -----------------------------

    match resolve_binding(contact_data, outbound, workspace_id).await {
        Ok(binding) => no_store_response(json_response(200, binding)),
        Err(()) => error_response(500, RESOLVE_FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Binding resolution (mirrors resolveWorkspaceExternalProjectBinding)
// ---------------------------------------------------------------------------

async fn resolve_binding(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<Value, ()> {
    let (canonical_id, enabled) = read_binding_state(contact_data, outbound, workspace_id).await?;

    // canonicalProject is only fetched when a canonical id exists.
    let canonical_project: Option<Value> = if let Some(ref id) = canonical_id {
        read_canonical_project(contact_data, outbound, id).await?
    } else {
        None
    };

    let canonical_is_active = canonical_project
        .as_ref()
        .and_then(|project| project.get("is_active"))
        .and_then(Value::as_bool)
        == Some(true);

    // adapter: canonicalProject?.adapter ?? null
    let adapter = canonical_project
        .as_ref()
        .and_then(|project| project.get("adapter"))
        .cloned()
        .unwrap_or(Value::Null);

    // canonical_project: enabled && canonicalProject?.is_active ? canonicalProject : null
    let canonical_project_field = if enabled && canonical_is_active {
        canonical_project.clone().unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    // enabled: enabled && Boolean(canonicalId) && Boolean(canonicalProject?.is_active)
    let binding_enabled = enabled && canonical_id.is_some() && canonical_is_active;

    Ok(json!({
        "adapter": adapter,
        "canonical_id": canonical_id,
        "canonical_project": canonical_project_field,
        "enabled": binding_enabled,
        "workspace_id": workspace_id,
    }))
}

/// Dual-read of the binding state. Prefers the first-class
/// `workspace_external_project_bindings` table; falls back to the legacy
/// `workspace_secrets` pattern when the binding query is unsuccessful or returns
/// no row. Returns `(canonicalId, enabled)`.
async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<(Option<String>, bool), ()> {
    // First-class binding table.
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("limit", "1".to_owned()),
        ],
    ) {
        // The legacy code swallows binding-table errors (e.g. table missing
        // before migration) and falls through to secrets. We mirror that: only
        // a successful response with a row short-circuits.
        if let Ok(response) = service_role_get(contact_data, outbound, &url).await
            && is_success(response.status)
            && let Ok(rows) = response.json::<Vec<BindingRow>>()
            && let Some(binding) = rows.into_iter().next()
        {
            return Ok((
                binding.canonical_project_id,
                binding.is_enabled == Some(true),
            ));
        }
    }

    // Legacy secrets fallback. A read error here surfaces as the 500.
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
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
    let secrets = response.json::<Vec<WorkspaceSecretRow>>().map_err(|_| ())?;

    let canonical_id = secrets
        .iter()
        .find(|secret| secret.name.as_deref() == Some(CANONICAL_ID_SECRET))
        .and_then(|secret| secret.value.clone());
    let enabled = secrets.iter().any(|secret| {
        secret.name.as_deref() == Some(ENABLED_SECRET) && secret.value.as_deref() == Some("true")
    });

    Ok((canonical_id, enabled))
}

async fn read_canonical_project(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    // The legacy `.maybeSingle()` here does not throw on error (it is not
    // destructured for an error), so a failed read yields a null project rather
    // than a 500. Mirror that by treating non-success as "no project".
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
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
