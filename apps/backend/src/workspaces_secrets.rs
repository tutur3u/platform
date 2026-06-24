//! Handler for `GET /api/workspaces/:wsId/secrets`.
//!
//! Legacy source: `apps/web/src/app/api/workspaces/[wsId]/secrets/route.ts`
//! (plus its `./access.ts` helper).
//!
//! Only the GET method is migrated here. The legacy route also defines POST,
//! which is intentionally NOT handled: this handler returns `None` for every
//! non-GET method so the Cloudflare worker falls through to the still-active
//! Next.js route for those mutations.
//!
//! Legacy behavior reproduced:
//! 1. `getWorkspaceSecretsAccess(wsId, request)`:
//!    - Authenticates the Supabase user; if none -> 401
//!      `{ message: "User not authenticated" }`.
//!    - `resolvedWsId = resolveWorkspaceId(wsId)` which only maps the literal
//!      `internal` slug to the ROOT workspace id; everything else (including
//!      `personal`) is passed through verbatim.
//!    - Resolves the caller's effective permissions in `resolvedWsId` and in
//!      the ROOT workspace (mirroring `getPermissions`):
//!        * `canManageWorkspaceSecrets` = workspace perms contain
//!          `manage_workspace_secrets`.
//!        * `canManageAsPlatformAdmin` = root perms contain
//!          `manage_workspace_roles` OR `manage_workspace_secrets`.
//!      If neither is granted -> 403 `{ message: "Permission denied" }`.
//! 2. Reads `workspace_secrets` (`select=*`) filtered by `ws_id=resolvedWsId`,
//!    ordered by `name asc`, and returns the raw row array as JSON. A read
//!    failure becomes 500 `{ message: "Error fetching workspace API configs" }`.
//!
//! NOTES on assumptions:
//! - The legacy code picks the RLS-bound client when only
//!   `canManageWorkspaceSecrets` and the admin (service-role) client when the
//!   caller is a platform admin. Because access has already been authorized
//!   against `resolvedWsId` before the read, and the read is itself filtered to
//!   `ws_id=resolvedWsId`, performing the read with the service role here yields
//!   the same result set the RLS client would have returned for an
//!   ADMIN/OWNER member (the only members RLS lets read this table). The
//!   permission gate above is the security boundary, mirroring the legacy
//!   intent.
//! - The permission-resolution helpers below are a file-local copy of the
//!   private logic in `admin_external_project_bindings.rs` (which itself copied
//!   it from `cms_workspaces.rs`). Those fns are private and cannot be imported,
//!   so per the single-file constraint they are reimplemented here.
//! - The response preserves the raw Supabase row JSON (`Value::Array`) so the
//!   column set (`id, ws_id, name, value, created_at`) matches the legacy
//!   `select('*')` output exactly.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ADMIN_PERMISSION: &str = "admin";

const MANAGE_WORKSPACE_SECRETS: &str = "manage_workspace_secrets";
const MANAGE_WORKSPACE_ROLES: &str = "manage_workspace_roles";

const NOT_AUTHENTICATED_MESSAGE: &str = "User not authenticated";
const PERMISSION_DENIED_MESSAGE: &str = "Permission denied";
const FETCH_FAILED_MESSAGE: &str = "Error fetching workspace API configs";

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

pub(crate) async fn handle_workspaces_secrets_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_secrets_ws_id(request.path)?;

    Some(match request.method {
        "GET" => secrets_response(config, request, raw_ws_id, outbound).await,
        // Only GET is migrated. Return None for every other method so the
        // worker falls through to the still-active Next.js route (POST, etc.).
        _ => return None,
    })
}

async fn secrets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return message_response(500, FETCH_FAILED_MESSAGE);
    }

    // --- getWorkspaceSecretsAccess: authenticate -----------------------------

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, NOT_AUTHENTICATED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, NOT_AUTHENTICATED_MESSAGE);
    };

    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    // --- getWorkspaceSecretsAccess: permissions ------------------------------
    //
    // Promise.all([getPermissions(resolvedWsId), getPermissions(ROOT)]).
    // A getPermissions failure yields null permissions -> treated as "no
    // permission" (which here surfaces as a 403 Permission denied, matching the
    // legacy fall-through to the denied branch).

    let workspace_permissions =
        match effective_workspace_permissions(contact_data, outbound, &resolved_ws_id, &user_id)
            .await
        {
            Ok(permissions) => permissions,
            Err(()) => WorkspaceAccess::none(),
        };
    let root_permissions =
        match effective_workspace_permissions(contact_data, outbound, ROOT_WORKSPACE_ID, &user_id)
            .await
        {
            Ok(permissions) => permissions,
            Err(()) => WorkspaceAccess::none(),
        };

    let can_manage_workspace_secrets = workspace_permissions.contains(MANAGE_WORKSPACE_SECRETS);
    let can_manage_as_platform_admin = root_permissions.contains(MANAGE_WORKSPACE_ROLES)
        || root_permissions.contains(MANAGE_WORKSPACE_SECRETS);

    if !can_manage_workspace_secrets && !can_manage_as_platform_admin {
        return message_response(403, PERMISSION_DENIED_MESSAGE);
    }

    // --- read workspace_secrets ---------------------------------------------

    match list_workspace_secrets(contact_data, outbound, &resolved_ws_id).await {
        Ok(rows) => no_store_response(json_response(200, Value::Array(rows))),
        Err(()) => message_response(500, FETCH_FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Supabase read (service role)
// ---------------------------------------------------------------------------

async fn list_workspace_secrets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "name.asc".to_owned()),
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

// ---------------------------------------------------------------------------
// Path + misc helpers
// ---------------------------------------------------------------------------

/// Match `/api/workspaces/:wsId/secrets` and extract the raw `wsId` segment.
fn workspaces_secrets_ws_id(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 4
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && !segments[2].is_empty()
        && segments[3] == "secrets"
    {
        Some(segments[2])
    } else {
        None
    }
}

/// Mirrors `resolveWorkspaceId`: only the literal `internal` slug maps to the
/// ROOT workspace id; every other identifier (including `personal`) is passed
/// through verbatim.
fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
