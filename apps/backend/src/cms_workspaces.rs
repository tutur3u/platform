use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const CMS_WORKSPACES_PATH: &str = "/api/v1/cms/workspaces";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PRIVATE_SCHEMA: &str = "private";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const LOAD_FAILED_MESSAGE: &str = "Failed to load CMS workspaces";

const EXTERNAL_PROJECT_ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const EXTERNAL_PROJECT_CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

// Root-level admin permissions that grant CMS access to every workspace.
const ROOT_ADMIN_PERMISSIONS: [&str; 2] = ["manage_external_projects", "manage_workspace_roles"];
// Per-workspace permissions that grant CMS access to a single workspace.
const WORKSPACE_CMS_PERMISSIONS: [&str; 2] =
    ["manage_external_projects", "publish_external_projects"];

/// Authenticated caller. Only the user id is needed downstream: the legacy
/// route reads all data with the admin (service-role) client
/// (`getWorkspaces({ useAdmin: true })`, `getPermissions({ user })`, and the
/// external-project admin client), so every Supabase read here uses the service
/// role regardless of how the caller authenticated.
#[derive(Clone, Debug, Eq, PartialEq)]
struct AuthenticatedUser {
    id: String,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: Option<String>,
    name: Option<String>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    personal: Option<bool>,
    created_at: Option<String>,
    #[serde(default)]
    workspace_members: Vec<WorkspaceMemberRow>,
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    user_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
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

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct CanonicalProjectRow {
    is_active: Option<bool>,
}

#[derive(Deserialize)]
struct SubscriptionRow {
    ws_id: Option<String>,
    created_at: Option<String>,
    status: Option<String>,
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct ProductTierRow {
    id: Option<String>,
    tier: Option<String>,
}

/// Resolved per-workspace external-project binding (mirrors
/// `resolveWorkspaceExternalProjectBinding`): the binding is "usable" only when a
/// canonical project id is configured, the binding is enabled, and the canonical
/// project is active.
struct ResolvedBinding {
    enabled: bool,
    has_canonical_project: bool,
}

pub(crate) async fn handle_cms_workspaces_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != CMS_WORKSPACES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => cms_workspaces_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn cms_workspaces_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match resolve_authenticated_user(config, request, outbound).await {
        Some(user) => user,
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    match accessible_workspaces(&config.contact_data, outbound, &user).await {
        Ok(workspaces) => no_store_response(json_response(200, Value::Array(workspaces))),
        Err(()) => error_response(),
    }
}

async fn accessible_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<Vec<Value>, ()> {
    // getWorkspaces({ useAdmin: true, user }) — service-role read of every
    // workspace the user belongs to. A `null` return (auth failure) maps to `[]`
    // in the legacy route; here auth is already resolved so a missing list means
    // an empty result.
    let Some(workspaces) = fetch_user_workspaces(contact_data, outbound, &user.id).await? else {
        return Ok(Vec::new());
    };

    if workspaces.is_empty() {
        return Ok(Vec::new());
    }

    let workspace_ids: Vec<String> = workspaces
        .iter()
        .filter_map(|workspace| workspace.id.clone())
        .collect();
    let tier_map = workspace_tier_map(contact_data, outbound, &workspace_ids).await?;

    // Root-level admin short-circuits every per-workspace permission check.
    let root_permissions =
        workspace_permissions(contact_data, outbound, ROOT_WORKSPACE_ID, &user.id).await?;
    let is_root_admin = permissions_contain_any(&root_permissions, &ROOT_ADMIN_PERMISSIONS);

    let mut accessible = Vec::new();

    for workspace in workspaces {
        let Some(workspace_id) = workspace.id.clone() else {
            continue;
        };

        if workspace_id == ROOT_WORKSPACE_ID {
            if is_root_admin {
                accessible.push(workspace_to_json(&workspace, &tier_map));
            }
            continue;
        }

        let binding = resolve_workspace_binding(contact_data, outbound, &workspace_id).await?;
        if !binding.enabled || !binding.has_canonical_project {
            continue;
        }

        let has_workspace_permission = if is_root_admin {
            true
        } else {
            let permissions =
                workspace_permissions(contact_data, outbound, &workspace_id, &user.id).await?;
            permissions_contain_any(&permissions, &WORKSPACE_CMS_PERMISSIONS)
        };

        if has_workspace_permission {
            accessible.push(workspace_to_json(&workspace, &tier_map));
        }
    }

    Ok(accessible)
}

fn workspace_to_json(
    workspace: &WorkspaceRow,
    tier_map: &std::collections::HashMap<String, Option<String>>,
) -> Value {
    let tier = workspace
        .id
        .as_ref()
        .and_then(|id| tier_map.get(id))
        .cloned()
        .flatten();

    let members: Vec<Value> = workspace
        .workspace_members
        .iter()
        .map(|member| json!({ "user_id": member.user_id }))
        .collect();

    json!({
        "id": workspace.id,
        "name": workspace.name,
        "avatar_url": workspace.avatar_url,
        "logo_url": workspace.logo_url,
        "personal": workspace.personal,
        "created_at": workspace.created_at,
        "workspace_members": members,
        "tier": tier,
    })
}

async fn fetch_user_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<Vec<WorkspaceRow>>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,name,avatar_url,logo_url,personal,created_at,workspace_members!inner(user_id)"
                    .to_owned(),
            ),
            ("workspace_members.user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;

    if !is_success(response.status) {
        return Ok(None);
    }

    response
        .json::<Vec<WorkspaceRow>>()
        .map(Some)
        .map_err(|_| ())
}

async fn workspace_tier_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_ids: &[String],
) -> Result<std::collections::HashMap<String, Option<String>>, ()> {
    let mut tiers = std::collections::HashMap::new();
    if workspace_ids.is_empty() {
        return Ok(tiers);
    }
    for workspace_id in workspace_ids {
        tiers.entry(workspace_id.clone()).or_insert(None);
    }

    let in_list = format!("({})", workspace_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_subscriptions",
        &[
            ("select", "ws_id,created_at,status,product_id".to_owned()),
            ("ws_id", format!("in.{in_list}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        // Subscription tier failures are non-fatal in the legacy helper: every
        // workspace falls back to a null tier.
        return Ok(tiers);
    }
    let subscriptions = response.json::<Vec<SubscriptionRow>>().map_err(|_| ())?;

    let product_ids: Vec<String> = subscriptions
        .iter()
        .filter_map(|subscription| subscription.product_id.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();

    let product_tiers = product_tiers_by_id(contact_data, outbound, &product_ids).await?;

    // For each workspace, pick the latest-created active subscription and resolve
    // its product tier (extractTierFromSubscriptions).
    let mut best: std::collections::HashMap<String, (String, Option<String>)> =
        std::collections::HashMap::new();
    for subscription in subscriptions {
        if subscription.status.as_deref() != Some("active") {
            continue;
        }
        let Some(ws_id) = subscription.ws_id else {
            continue;
        };
        let created_at = subscription.created_at.unwrap_or_default();
        let tier = subscription
            .product_id
            .as_ref()
            .and_then(|product_id| product_tiers.get(product_id))
            .cloned()
            .flatten();

        match best.get(&ws_id) {
            Some((existing_created_at, _)) if *existing_created_at >= created_at => {}
            _ => {
                best.insert(ws_id, (created_at, tier));
            }
        }
    }

    for (ws_id, (_, tier)) in best {
        tiers.insert(ws_id, tier);
    }

    Ok(tiers)
}

async fn product_tiers_by_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_ids: &[String],
) -> Result<std::collections::HashMap<String, Option<String>>, ()> {
    let mut map = std::collections::HashMap::new();
    if product_ids.is_empty() {
        return Ok(map);
    }

    let in_list = format!("({})", product_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_subscription_products",
        &[
            ("select", "id,tier".to_owned()),
            ("id", format!("in.{in_list}")),
        ],
    ) else {
        return Err(());
    };
    // workspace_subscription_products lives in the `private` schema.
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Ok(map);
    }

    for product in response.json::<Vec<ProductTierRow>>().map_err(|_| ())? {
        if let Some(id) = product.id {
            map.insert(id, product.tier);
        }
    }

    Ok(map)
}

/// Resolve the per-workspace external-project binding using the dual-read
/// rollout: prefer `workspace_external_project_bindings`, fall back to
/// `workspace_secrets`. When the binding table is missing (migration not yet
/// applied) the query errors and we silently fall back to secrets.
async fn resolve_workspace_binding(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<ResolvedBinding, ()> {
    let (canonical_id, enabled) = read_binding_state(contact_data, outbound, workspace_id).await?;

    let has_active_canonical = match canonical_id {
        Some(ref id) if !id.is_empty() => {
            canonical_project_is_active(contact_data, outbound, id).await?
        }
        _ => false,
    };

    Ok(ResolvedBinding {
        // binding.enabled === enabled && Boolean(canonicalId) && canonicalProject.is_active
        enabled: enabled && has_active_canonical,
        // binding.canonical_project is non-null only when enabled && is_active
        has_canonical_project: enabled && has_active_canonical,
    })
}

async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<(Option<String>, bool), ()> {
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("limit", "1".to_owned()),
        ],
    ) {
        if let Ok(response) = service_role_get(contact_data, outbound, &url, false).await {
            if is_success(response.status) {
                if let Ok(rows) = response.json::<Vec<BindingRow>>() {
                    if let Some(binding) = rows.into_iter().next() {
                        return Ok((
                            binding.canonical_project_id,
                            binding.is_enabled == Some(true),
                        ));
                    }
                }
            }
        }
    }

    // Fall back to legacy workspace_secrets pattern.
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            (
                "name",
                format!(
                    "in.({EXTERNAL_PROJECT_ENABLED_SECRET},{EXTERNAL_PROJECT_CANONICAL_ID_SECRET})"
                ),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let secrets = response.json::<Vec<WorkspaceSecretRow>>().map_err(|_| ())?;

    let canonical_id = secrets
        .iter()
        .find(|secret| secret.name.as_deref() == Some(EXTERNAL_PROJECT_CANONICAL_ID_SECRET))
        .and_then(|secret| secret.value.clone());
    let enabled = secrets.iter().any(|secret| {
        secret.name.as_deref() == Some(EXTERNAL_PROJECT_ENABLED_SECRET)
            && secret.value.as_deref() == Some("true")
    });

    Ok((canonical_id, enabled))
}

async fn canonical_project_is_active(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "is_active".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CanonicalProjectRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.is_active)
        == Some(true))
}

/// Resolve the effective permission ids a user has in a workspace, mirroring
/// `getPermissions`. Returns an empty list when the user has no access (the
/// legacy helper returns `null`, which downstream treats as "no permissions").
/// A creator gets every permission; an `admin` permission grants all checks.
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

    let creator_id = workspace_creator_id(contact_data, outbound, workspace_id).await?;
    let Some(creator_id) = creator_id else {
        // Workspace not found -> getPermissions returns null.
        return Ok(WorkspaceAccess::none());
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;

    if is_creator {
        // rolePermissions(...) returns every permission id; containsPermission is
        // always true for a creator.
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

fn permissions_contain_any(access: &WorkspaceAccess, candidates: &[&str]) -> bool {
    candidates
        .iter()
        .any(|candidate| access.contains(candidate))
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "error": LOAD_FAILED_MESSAGE })))
}
