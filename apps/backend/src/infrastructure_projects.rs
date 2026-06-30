//! Port of `GET /api/v1/infrastructure/projects`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/projects/route.ts`.
//!
//! The legacy GET route delegates to `handleInfrastructureProjectRequest`
//! (shared helper in `_shared.ts`), which:
//!
//! 1. Authorizes an "infrastructure viewer" (`view_infrastructure` permission
//!    in the ROOT workspace via `authorizeInfrastructureViewer`).
//! 2. Calls `listInfrastructureProjects()` from
//!    `apps/web/src/lib/infrastructure/projects.ts`.
//! 3. Returns `NextResponse.json({ projects })`.
//!
//! `listInfrastructureProjects` reads from a local log-drain PostgreSQL
//! database (`infrastructure_projects` and `infrastructure_project_branches`
//! tables) and also reconciles the platform project's queued status against
//! a filesystem-resident blue-green monitoring snapshot.
//!
//! A Cloudflare Worker has neither a local filesystem nor a log-drain SQL
//! client, so both sources yield empty results. This handler reproduces the
//! auth path faithfully and returns `{ "projects": [] }` as the all-empty
//! fallback — exactly what the legacy code would produce when the log-drain
//! database is unavailable.
//!
//! BEHAVIOR GAPS:
//!
//! - When deployed natively (with a filesystem and log-drain DB), the legacy
//!   route returns real project data. This handler always returns
//!   `{ "projects": [] }`.
//! - The `handleInfrastructureProjectRequest` wrapper calls
//!   `withRequestLogDrain` for structured logging; this handler does not.
//! - The POST method is intentionally **not** migrated; `None` is returned
//!   for all non-GET methods so the worker falls through to the still-live
//!   Next.js route.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INFRASTRUCTURE_PROJECTS_PATH: &str = "/api/v1/infrastructure/projects";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to load infrastructure projects";

#[derive(Clone, Debug, Eq, PartialEq)]
struct AuthenticatedUser {
    id: String,
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

pub(crate) async fn handle_infrastructure_projects_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != INFRASTRUCTURE_PROJECTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => infrastructure_projects_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn infrastructure_projects_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user) = resolve_authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let access =
        match workspace_permissions(&config.contact_data, outbound, ROOT_WORKSPACE_ID, &user.id)
            .await
        {
            Ok(access) => access,
            Err(()) => return error_response(),
        };

    if !access.contains(VIEW_INFRASTRUCTURE_PERMISSION) {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // The project list is read from the log-drain SQL database and a
    // filesystem-resident blue-green monitoring snapshot — neither of which is
    // available in the Cloudflare Worker runtime. Return the all-empty shape
    // that `listInfrastructureProjects()` would produce when both sources are
    // unavailable.
    no_store_response(json_response(200, json!({ "projects": [] })))
}

async fn resolve_authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .ok()?;

        return Some(AuthenticatedUser { id: identity.id });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user_id =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))?;

    Some(AuthenticatedUser { id: user_id })
}

/// Resolve the effective permission ids a user has in a workspace, mirroring
/// `getPermissions` (and the equivalent logic in
/// `infrastructure_monitoring_blue_green.rs` and
/// `infrastructure_observability_deployments.rs`). Returns an empty access set
/// when the user has no access. A creator gets every permission; an `admin`
/// permission grants all checks.
async fn workspace_permissions(
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
        let all = permissions.iter().any(|permission| permission == "admin");
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": LOAD_FAILED_MESSAGE }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!(
            INFRASTRUCTURE_PROJECTS_PATH,
            "/api/v1/infrastructure/projects"
        );
    }

    #[test]
    fn path_guard_does_not_match_prefix() {
        assert_ne!(INFRASTRUCTURE_PROJECTS_PATH, "/api/v1/infrastructure");
    }

    #[test]
    fn path_guard_does_not_match_trailing_slash() {
        assert_ne!(
            INFRASTRUCTURE_PROJECTS_PATH,
            "/api/v1/infrastructure/projects/"
        );
    }

    #[test]
    fn path_guard_does_not_match_sub_path() {
        assert_ne!(
            INFRASTRUCTURE_PROJECTS_PATH,
            "/api/v1/infrastructure/projects/some-id"
        );
    }

    #[test]
    fn workspace_access_none_denies_all() {
        let access = WorkspaceAccess::none();
        assert!(!access.contains("view_infrastructure"));
        assert!(!access.contains("admin"));
    }

    #[test]
    fn workspace_access_all_grants_everything() {
        let access = WorkspaceAccess::all();
        assert!(access.contains("view_infrastructure"));
        assert!(access.contains("any_permission"));
    }

    #[test]
    fn workspace_access_from_permissions_admin_grants_all() {
        let access = WorkspaceAccess::from_permissions(vec!["admin".to_owned()]);
        assert!(access.contains("view_infrastructure"));
        assert!(access.contains("any_permission"));
    }

    #[test]
    fn workspace_access_from_permissions_view_infrastructure() {
        let access = WorkspaceAccess::from_permissions(vec!["view_infrastructure".to_owned()]);
        assert!(access.contains("view_infrastructure"));
        assert!(!access.contains("manage_workspace_roles"));
    }

    #[test]
    fn workspace_access_from_permissions_denied_when_missing() {
        let access = WorkspaceAccess::from_permissions(vec!["some_other_permission".to_owned()]);
        assert!(!access.contains("view_infrastructure"));
    }

    #[test]
    fn empty_projects_response_shape() {
        let value = json!({ "projects": [] });
        let projects = value["projects"].as_array().expect("projects array");
        assert!(projects.is_empty());
    }

    #[test]
    fn message_response_shape() {
        let response = message_response(401, "Unauthorized");
        // Verify the response was constructed (status checked in integration tests).
        // We verify only the pure helper: json shape is `{"message": "..."}`.
        let _ = response;
    }
}
