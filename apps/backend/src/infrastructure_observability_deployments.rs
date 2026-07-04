//! Port of `GET /api/v1/infrastructure/observability/deployments`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/observability/deployments/route.ts`.
//!
//! The legacy route delegates to `handleObservabilityRequest` (shared helper in
//! `apps/web/src/app/api/v1/infrastructure/observability/_shared.ts`), which:
//!
//! 1. Authorizes an "infrastructure viewer" (`view_infrastructure` permission in
//!    the ROOT workspace via `authorizeInfrastructureViewer`).
//! 2. Calls `readObservabilityDeployments(filters)` from
//!    `apps/web/src/lib/infrastructure/observability.ts`.
//! 3. Returns `NextResponse.json(result)` (no explicit cache headers).
//!
//! `readObservabilityDeployments` aggregates:
//!
//! - `readBlueGreenMonitoringSnapshot` — reads JSON telemetry files under
//!   `tmp/docker-web` on the deployment host (`deployments: []` when absent).
//! - `loadRecentRequests` — queries a local PostgreSQL log-drain database
//!   (empty when unavailable).
//!
//! A Cloudflare Worker has no local filesystem or log-drain SQL client, so
//! both sources yield empty results and `paginate([], {page, pageSize})` is
//! always returned. This handler reproduces that exact empty paginated shape,
//! applying the same `clampPage` / `clampPageSize` logic as the legacy code.
//!
//! BEHAVIOR GAPS:
//!
//! - When deployed natively (with a filesystem), the legacy route returns real
//!   deployment data. This handler always returns the empty shape.
//! - The `handleObservabilityRequest` wrapper calls `withRequestLogDrain` for
//!   server-side structured logging; this handler does not replicate that.
//! - Auth uses the same workspace-permission path as
//!   `infrastructure_monitoring_blue_green.rs`; the legacy `app-session` path
//!   is also supported here for parity with sibling handlers.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const INFRASTRUCTURE_OBSERVABILITY_DEPLOYMENTS_PATH: &str =
    "/api/v1/infrastructure/observability/deployments";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to load observability deployments";

// Mirrors the legacy observability constants from `observability.ts`.
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 50;
const MAX_PAGE_SIZE: i64 = 200;

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

pub(crate) async fn handle_infrastructure_observability_deployments_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != INFRASTRUCTURE_OBSERVABILITY_DEPLOYMENTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => observability_deployments_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn observability_deployments_response(
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

    let params = QueryParams::from_url(request.url);
    let page = params.page();
    let page_size = params.page_size();

    // Both sources (blue-green snapshot + log-drain SQL) are filesystem/local-DB
    // derived and unavailable in the Worker, so the result is always the
    // all-empty paginated shape that `paginate([], {page, pageSize})` produces.
    no_store_response(json_response(200, empty_deployments_page(page, page_size)))
}

/// The empty `ObservabilityPaginatedResult<ObservabilityDeployment>` returned
/// when no monitoring data is available. Mirrors `paginate([], {page, pageSize})`:
///
/// - `offset = (page - 1) * pageSize`
/// - `hasNextPage = offset + pageSize < items.length` => always `false` (length 0)
/// - `total = items.length` => 0
fn empty_deployments_page(page: i64, page_size: i64) -> Value {
    json!({
        "hasNextPage": false,
        "items": [],
        "page": page,
        "pageSize": page_size,
        "total": 0,
    })
}

struct QueryParams {
    page: Option<String>,
    page_size: Option<String>,
}

impl QueryParams {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut params = Self {
            page: None,
            page_size: None,
        };
        let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok())
        else {
            return params;
        };

        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" if params.page.is_none() => {
                    params.page = Some(value.into_owned());
                }
                "pageSize" if params.page_size.is_none() => {
                    params.page_size = Some(value.into_owned());
                }
                _ => {}
            }
        }

        params
    }

    /// Mirrors `clampPage(searchParams.get('page'))`:
    /// `Number.parseInt(value, 10)` > 0 ? parsed : 1.
    fn page(&self) -> i64 {
        self.page
            .as_deref()
            .and_then(parse_positive_int)
            .unwrap_or(DEFAULT_PAGE)
    }

    /// Mirrors `clampPageSize(searchParams.get('pageSize'))`:
    /// `Number.parseInt(value, 10)` > 0 ? min(parsed, 200) : 50.
    fn page_size(&self) -> i64 {
        let parsed = self
            .page_size
            .as_deref()
            .and_then(parse_positive_int)
            .unwrap_or(DEFAULT_PAGE_SIZE);

        parsed.min(MAX_PAGE_SIZE)
    }
}

/// Mirrors `Number.parseInt(value, 10)` followed by the `> 0` guard from
/// `clampPage` / `clampPageSize`. Consumes a leading integer prefix and ignores
/// trailing non-digit characters, matching JS `parseInt` semantics.
fn parse_positive_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0;

    if matches!(bytes.first(), Some(b'+' | b'-')) {
        index += 1;
    }

    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index == digits_start {
        return None;
    }

    let parsed = trimmed[..index].parse::<i64>().ok()?;
    (parsed > 0).then_some(parsed)
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
/// `infrastructure_monitoring_blue_green.rs`).
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
            INFRASTRUCTURE_OBSERVABILITY_DEPLOYMENTS_PATH,
            "/api/v1/infrastructure/observability/deployments"
        );
    }

    #[test]
    fn path_guard_does_not_match_prefix() {
        assert_ne!(
            INFRASTRUCTURE_OBSERVABILITY_DEPLOYMENTS_PATH,
            "/api/v1/infrastructure/observability"
        );
    }

    #[test]
    fn path_guard_does_not_match_with_trailing_slash() {
        assert_ne!(
            INFRASTRUCTURE_OBSERVABILITY_DEPLOYMENTS_PATH,
            "/api/v1/infrastructure/observability/deployments/"
        );
    }

    #[test]
    fn parse_positive_int_basic() {
        assert_eq!(parse_positive_int("1"), Some(1));
        assert_eq!(parse_positive_int("50"), Some(50));
        assert_eq!(parse_positive_int("200"), Some(200));
        assert_eq!(parse_positive_int("0"), None);
        assert_eq!(parse_positive_int("-1"), None);
        assert_eq!(parse_positive_int("abc"), None);
        assert_eq!(parse_positive_int(""), None);
    }

    #[test]
    fn parse_positive_int_leading_junk_ignored() {
        // JS parseInt("10abc") === 10; trailing junk is consumed as far as digits go
        assert_eq!(parse_positive_int("10abc"), Some(10));
    }

    #[test]
    fn query_params_defaults() {
        let params = QueryParams::from_url(None);
        assert_eq!(params.page(), DEFAULT_PAGE);
        assert_eq!(params.page_size(), DEFAULT_PAGE_SIZE);
    }

    #[test]
    fn query_params_page_clamped() {
        let params = QueryParams::from_url(Some(
            "https://example.com/api/v1/infrastructure/observability/deployments?page=3",
        ));
        assert_eq!(params.page(), 3);
    }

    #[test]
    fn query_params_page_invalid_becomes_default() {
        let params = QueryParams::from_url(Some(
            "https://example.com/api/v1/infrastructure/observability/deployments?page=abc",
        ));
        assert_eq!(params.page(), DEFAULT_PAGE);
    }

    #[test]
    fn query_params_page_size_clamped_at_max() {
        let params = QueryParams::from_url(Some(
            "https://example.com/api/v1/infrastructure/observability/deployments?pageSize=999",
        ));
        assert_eq!(params.page_size(), MAX_PAGE_SIZE);
    }

    #[test]
    fn query_params_page_size_valid() {
        let params = QueryParams::from_url(Some(
            "https://example.com/api/v1/infrastructure/observability/deployments?pageSize=100",
        ));
        assert_eq!(params.page_size(), 100);
    }

    #[test]
    fn empty_deployments_page_shape() {
        let result = empty_deployments_page(1, 50);
        assert_eq!(result["hasNextPage"], false);
        assert_eq!(result["total"], 0);
        assert_eq!(result["page"], 1);
        assert_eq!(result["pageSize"], 50);
        assert!(result["items"].as_array().unwrap().is_empty());
    }

    #[test]
    fn empty_deployments_page_preserves_page_and_size() {
        let result = empty_deployments_page(3, 25);
        assert_eq!(result["page"], 3);
        assert_eq!(result["pageSize"], 25);
        assert_eq!(result["hasNextPage"], false);
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
    fn workspace_access_from_permissions_specific() {
        let access = WorkspaceAccess::from_permissions(vec!["view_infrastructure".to_owned()]);
        assert!(access.contains("view_infrastructure"));
        assert!(!access.contains("manage_workspace_roles"));
    }
}
