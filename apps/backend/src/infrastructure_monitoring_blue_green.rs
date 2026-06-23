//! Port of `GET /api/v1/infrastructure/monitoring/blue-green`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/monitoring/blue-green/route.ts`.
//!
//! The legacy route authorizes an "infrastructure viewer" (the ROOT workspace
//! `view_infrastructure` permission) and then returns a blue/green monitoring
//! snapshot produced by `readBlueGreenMonitoringSnapshot`.
//!
//! IMPORTANT RUNTIME NOTE: the snapshot is assembled *entirely* from the local
//! filesystem (the blue/green watcher writes JSON files under `tmp/docker-web`
//! on the deployment host). A Cloudflare Worker has no such filesystem, so
//! `resolveMonitoringDir` finds nothing, every `readJsonFile`/`readTextFile`
//! returns `null`, and the snapshot collapses to its all-defaults shape. This
//! handler reproduces that exact all-defaults snapshot. See `notes` in the
//! structured result: when this route eventually needs real telemetry it must
//! be backed by a durable store (KV/R2/D1) rather than a host filesystem.
//!
//! Auth and permission resolution mirror `cms_workspaces.rs` (which itself
//! mirrors `getPermissions`). The permission helpers in that module are private
//! to it, so the equivalent logic is re-implemented locally rather than shared.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const INFRASTRUCTURE_MONITORING_BLUE_GREEN_PATH: &str =
    "/api/v1/infrastructure/monitoring/blue-green";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to load blue-green monitoring snapshot";

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

pub(crate) async fn handle_infrastructure_monitoring_blue_green_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != INFRASTRUCTURE_MONITORING_BLUE_GREEN_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => blue_green_monitoring_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn blue_green_monitoring_response(
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
            // getPermissions failing to load is treated as "no permissions"
            // (forbidden) by the legacy `withoutPermission(...)` short-circuit when
            // permissions resolve to null; surface as a 500 only on a transport
            // error so the caller can distinguish "denied" from "broken".
            Err(()) => return error_response(),
        };

    if !access.contains(VIEW_INFRASTRUCTURE_PERMISSION) {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // The blue/green monitoring snapshot is filesystem-derived on the host and
    // there is no filesystem in the Worker runtime, so the snapshot is always
    // the all-defaults shape (`resolveMonitoringDir().exists === false`).
    no_store_response(json_response(200, empty_blue_green_snapshot()))
}

/// All-defaults `BlueGreenMonitoringSnapshot` produced when no monitoring files
/// exist on disk. Mirrors `readBlueGreenMonitoringSnapshot()` evaluated with
/// every file read returning `null` and `monitoringDir.exists === false`.
fn empty_blue_green_snapshot() -> Value {
    json!({
        "analytics": {
            "current": {
                "daily": Value::Null,
                "monthly": Value::Null,
                "weekly": Value::Null,
                "yearly": Value::Null,
            },
            "recentRequests": [],
            "totalPersistedLogs": 0,
            "trends": {
                "daily": [],
                "monthly": [],
                "weekly": [],
                "yearly": [],
            },
        },
        "control": {
            "deploymentRevertRequest": Value::Null,
            "deploymentPin": Value::Null,
            "dockerRecoverySettings": empty_docker_recovery_settings(),
            "instantRolloutRequest": Value::Null,
        },
        "buildCache": {
            "current": {},
            "history": [],
            "total": 0,
        },
        "dockerResources": {
            "allContainers": [],
            "containers": [],
            "message": Value::Null,
            "serviceHealth": [],
            "state": "idle",
            "totalCpuPercent": 0,
            "totalMemoryBytes": 0,
            "totalRxBytes": 0,
            "totalTxBytes": 0,
        },
        "deployments": [],
        "recoveryCache": {
            "deployments": [],
            "limit": 5,
            "total": 0,
        },
        "overview": {
            "averageBuildDurationMs": Value::Null,
            "currentAverageRequestsPerMinute": Value::Null,
            "currentPeakRequestsPerMinute": Value::Null,
            "currentRequestCount": Value::Null,
            "failedDeployments": 0,
            "successfulDeployments": 0,
            "totalDeployments": 0,
            "totalPersistedLogs": 0,
            "totalRequestsServed": 0,
        },
        "runtime": {
            "activatedAt": Value::Null,
            "activeColor": Value::Null,
            "averageRequestsPerMinute": Value::Null,
            "dailyAverageRequests": Value::Null,
            "dailyPeakRequests": Value::Null,
            "dailyRequestCount": Value::Null,
            "deploymentStamp": Value::Null,
            "lifetimeMs": Value::Null,
            "liveColors": [],
            "peakRequestsPerMinute": Value::Null,
            "requestCount": Value::Null,
            "serviceContainers": {},
            "standbyColor": Value::Null,
            "state": "idle",
            "targets": {
                "hive": empty_target_runtime(),
                "web": empty_target_runtime(),
            },
        },
        "source": {
            "historyAvailable": false,
            "monitoringDirAvailable": false,
            "statusAvailable": false,
        },
        "watcher": {
            "args": [],
            "events": [],
            // normalizeWatcherHealth(null, null, false, false, now) -> "missing"
            "health": "missing",
            "intervalMs": Value::Null,
            "lastCheckAt": Value::Null,
            "lastDeployAt": Value::Null,
            "lastDeployStatus": Value::Null,
            "logs": [],
            "lastResult": Value::Null,
            "latestCommit": Value::Null,
            "lock": Value::Null,
            "nextCheckAt": Value::Null,
            // normalizeWatcherStatus("missing") -> "offline"
            "status": "offline",
            "target": Value::Null,
            "updatedAt": Value::Null,
        },
    })
}

/// `normalizeBlueGreenTargetRuntime(undefined)` output.
fn empty_target_runtime() -> Value {
    json!({
        "activeColor": Value::Null,
        "commitHash": Value::Null,
        "commitShortHash": Value::Null,
        "deploymentStamp": Value::Null,
        "health": "unknown",
        "lastPromotedAt": Value::Null,
        "standbyColor": Value::Null,
    })
}

/// `normalizeBlueGreenDockerRecoverySettings(null)` output.
///
/// INTEGRATOR-VERIFY: confirm these defaults against
/// `blue-green-monitoring-controls.ts::normalizeBlueGreenDockerRecoverySettings`.
/// They were not read line-by-line during this port; the controls module
/// supplies the canonical default object when its argument is `null`.
fn empty_docker_recovery_settings() -> Value {
    json!({
        "autoRecover": false,
        "maxRestartAttempts": 3,
        "restartBackoffMs": 5000,
    })
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
/// `getPermissions` (and the equivalent logic in `cms_workspaces.rs`). Returns
/// an empty access set when the user has no access. A creator gets every
/// permission; an `admin` permission grants all checks.
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
