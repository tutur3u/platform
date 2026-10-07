mod access;
mod cache;
mod storage;

use access::{
    canonical_project_row, effective_permissions, normalize_workspace_id, permission_set_allows,
    read_binding_state,
};
use storage::{RawObject, list_raw_objects, storage_limit};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Route shape:
//   GET /api/v1/workspaces/:wsId/external-projects/storage-analytics
// Legacy source:
//   apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/storage-analytics/route.ts
//
// The legacy route requires `requireWorkspaceExternalProjectAccess({ mode:
// 'manage' })` (binding must be enabled + active; user must hold
// `manage_external_projects` on the workspace OR a root admin permission), then
// computes a storage overview for the workspace, lists the storage objects
// under the `external-projects/<adapter>` prefix (scanning up to 1000 + 1
// objects to compute a `truncated` flag), and returns aggregate metrics.
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/storage-analytics";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const FAILED_MESSAGE: &str = "Failed to load external project storage analytics";

const ADMIN_PERMISSION: &str = "admin";

// External-project binding secret fallback names (external-projects/constants.ts).
const EXTERNAL_PROJECT_ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const EXTERNAL_PROJECT_CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

// Default adapter slug when the binding has no resolvable adapter (legacy uses
// `access.binding.adapter ?? 'shared'`).
const DEFAULT_ADAPTER: &str = "shared";

// Storage limit RPC + fallback (workspace-storage-provider.ts).
const STORAGE_LIMIT_RPC: &str = "get_workspace_storage_limit";
const STORAGE_LIMIT_FALLBACK_BYTES: i64 = 104857600;

// Supabase storage list API constants.
const STORAGE_BUCKET: &str = "workspaces";
const STORAGE_LIST_PAGE_SIZE: u32 = 1000;
const EMPTY_FOLDER_PLACEHOLDER_NAME: &str = ".emptyFolderPlaceholder";

// Reserved mobile-deployment drive prefix (mobile-deployment/storage-policy.ts).
const RESERVED_MOBILE_DEPLOYMENT_PREFIX: &str = ".mobile-deployments";

// Scan limit (EXTERNAL_PROJECT_STORAGE_ANALYTICS_OBJECT_LIMIT).
const OBJECT_LIMIT: usize = 1000;

// ---------------------------------------------------------------------------
// Response shape (mirrors the legacy JSON exactly):
// {
//   "data": {
//     "totalSize", "fileCount", "storageLimit", "usagePercentage",
//     "scannedObjectLimit", "truncated", "largestFile", "smallestFile"
//   }
// }
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct AnalyticsEnvelope {
    data: AnalyticsData,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyticsData {
    total_size: i64,
    file_count: i64,
    storage_limit: i64,
    usage_percentage: f64,
    scanned_object_limit: usize,
    truncated: bool,
    largest_file: Option<StorageFileRecord>,
    smallest_file: Option<StorageFileRecord>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageFileRecord {
    name: String,
    size: i64,
    // Legacy `updateFileHighlights` always sets `createdAt: object.updatedAt ?? ''`.
    created_at: String,
}

// ---------------------------------------------------------------------------
// Deserialization rows.
// ---------------------------------------------------------------------------

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
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct RolePermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct CanonicalProjectRow {
    adapter: Option<String>,
    is_active: Option<bool>,
}

#[derive(Deserialize)]
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<RolePermissionRow>,
}

#[derive(Deserialize)]
struct StorageListEntry {
    name: Option<String>,
    // Non-null for files, null for "folders" in the Storage list API.
    id: Option<String>,
    updated_at: Option<String>,
    metadata: Option<StorageEntryMetadata>,
}

#[derive(Deserialize)]
struct StorageEntryMetadata {
    size: Option<i64>,
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_external_projects_storage_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = analytics_ws_id(request.path)?;

    if !matches!(request.method, "GET" | "HEAD") {
        return None;
    }
    let mut response = analytics_response(config, request, raw_ws_id, outbound).await?;
    if request.method == "HEAD" {
        response.body_empty = true;
        response.body = serde_json::Value::Null;
        response.body_text = None;
    }
    Some(response)
}

fn analytics_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn analytics_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return Some(error_response(500, FAILED_MESSAGE));
    }

    // Auth: Supabase user session (cookie or bearer). App-session /
    // app-coordination token flows from the legacy route are not supported here
    // (see notes).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Some(error_response(401, UNAUTHORIZED_MESSAGE));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Some(error_response(401, UNAUTHORIZED_MESSAGE));
    };

    // normalizeWorkspaceId (handle/personal/internal resolution).
    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // Legacy `normalizeWorkspaceId` failure surfaces as a 401 from the
            // surrounding access check (Unauthorized).
            Err(()) => return Some(error_response(401, UNAUTHORIZED_MESSAGE)),
        };

    // Resolve external-project binding (dual-read: bindings table then secrets).
    let (canonical_id, enabled) =
        match read_binding_state(contact_data, outbound, &normalized_ws_id).await {
            Ok(state) => state,
            Err(()) => return Some(error_response(500, FAILED_MESSAGE)),
        };
    let canonical_project = match canonical_id.as_deref() {
        Some(id) => match canonical_project_row(contact_data, outbound, id).await {
            Ok(project) => project,
            Err(()) => return Some(error_response(500, FAILED_MESSAGE)),
        },
        None => None,
    };
    let canonical_active = canonical_project.as_ref().and_then(|p| p.is_active) == Some(true);
    let binding_enabled = enabled && canonical_id.is_some() && canonical_active;
    let adapter = if binding_enabled {
        canonical_project
            .as_ref()
            .and_then(|p| p.adapter.clone())
            .filter(|adapter| !adapter.is_empty())
            .unwrap_or_else(|| DEFAULT_ADAPTER.to_owned())
    } else {
        DEFAULT_ADAPTER.to_owned()
    };

    // Mirror legacy access ordering for the session path: the binding must be
    // enabled with an active canonical project (404) before the permission
    // denial (403) surfaces.
    if !binding_enabled {
        return Some(error_response(404, UNAVAILABLE_MESSAGE));
    }

    // Permission: manage mode allowed when the workspace grants
    // `manage_external_projects`, OR the root workspace grants
    // `manage_external_projects` / `manage_workspace_roles`.
    let workspace_permissions = match effective_permissions(
        contact_data,
        outbound,
        &normalized_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(permissions) => permissions,
        Err(()) => return Some(error_response(500, FAILED_MESSAGE)),
    };
    let workspace_allowed =
        permission_set_allows(&workspace_permissions, &["manage_external_projects"]);
    let allowed = if workspace_allowed {
        true
    } else {
        let root_permissions = match effective_permissions(
            contact_data,
            outbound,
            ROOT_WORKSPACE_ID,
            &user_id,
            &access_token,
        )
        .await
        {
            Ok(permissions) => permissions,
            Err(()) => return Some(error_response(500, FAILED_MESSAGE)),
        };
        permission_set_allows(
            &root_permissions,
            &["manage_external_projects", "manage_workspace_roles"],
        )
    };

    if !allowed {
        return Some(error_response(403, FORBIDDEN_MESSAGE));
    }

    // R2 signing remains in the live Next handler. Never return Supabase cache
    // totals for a fully configured R2 workspace.
    match cache::is_r2_active(contact_data, outbound, &normalized_ws_id).await {
        Ok(true) => return None,
        Ok(false) => {}
        Err(()) => return Some(error_response(500, FAILED_MESSAGE)),
    }
    // Quota is always fresh, even when the analytics snapshot is cached.
    let storage_limit = storage_limit(contact_data, outbound, &normalized_ws_id).await;
    match cache::cached_analytics(
        contact_data,
        outbound,
        &normalized_ws_id,
        &adapter,
        storage_limit,
    )
    .await
    {
        Ok(Some(data)) => {
            return Some(no_store_response(json_response(
                200,
                json!({ "data": data }),
            )));
        }
        Ok(None) => {}
        Err(()) => return Some(error_response(500, FAILED_MESSAGE)),
    }

    // listWorkspaceStorageRawObjectsForProvider scoped to
    // external-projects/<adapter>, scanning up to OBJECT_LIMIT + 1 objects.
    let prefix = format!("external-projects/{adapter}");
    let raw_objects = match list_raw_objects(
        contact_data,
        outbound,
        &normalized_ws_id,
        &prefix,
        OBJECT_LIMIT + 1,
    )
    .await
    {
        Ok(objects) => objects,
        Err(()) => return Some(error_response(500, FAILED_MESSAGE)),
    };

    let truncated = raw_objects.len() > OBJECT_LIMIT;
    let objects: &[RawObject] = if truncated {
        &raw_objects[..OBJECT_LIMIT]
    } else {
        &raw_objects[..]
    };

    let mut total_size: i64 = 0;
    let mut file_count: i64 = 0;
    let mut largest_file: Option<StorageFileRecord> = None;
    let mut smallest_file: Option<StorageFileRecord> = None;

    for object in objects {
        // isCountableObject: skip folder placeholders.
        if object.is_folder_placeholder {
            continue;
        }

        total_size += object.size;
        file_count += 1;

        let record = StorageFileRecord {
            name: file_name(&object.path),
            size: object.size,
            created_at: object.updated_at.clone().unwrap_or_default(),
        };

        // largestFile: strictly greater replaces.
        if largest_file
            .as_ref()
            .map(|current| object.size > current.size)
            .unwrap_or(true)
        {
            largest_file = Some(record.clone());
        }
        // smallestFile: strictly less replaces.
        if smallest_file
            .as_ref()
            .map(|current| object.size < current.size)
            .unwrap_or(true)
        {
            smallest_file = Some(record);
        }
    }

    let usage_percentage = compute_usage_percentage(total_size, storage_limit);

    Some(no_store_response(json_response(
        200,
        AnalyticsEnvelope {
            data: AnalyticsData {
                total_size,
                file_count,
                storage_limit,
                usage_percentage,
                scanned_object_limit: OBJECT_LIMIT,
                truncated,
                largest_file,
                smallest_file,
            },
        },
    )))
}

/// Mirrors getFileName: posix.basename(path) || path.
fn file_name(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    let base = trimmed.rsplit('/').next().unwrap_or(trimmed);
    if base.is_empty() {
        path.to_owned()
    } else {
        base.to_owned()
    }
}

/// Mirrors calculateUsagePercentage:
///   storageLimit > 0
///     ? Math.min(100, Math.round(((totalSize/storageLimit*100) + EPSILON)*100)/100)
///     : 0
fn compute_usage_percentage(total_size: i64, storage_limit: i64) -> f64 {
    if storage_limit <= 0 {
        return 0.0;
    }
    let raw = (total_size as f64 / storage_limit as f64) * 100.0;
    let epsilon = f64::EPSILON;
    let rounded = ((raw + epsilon) * 100.0).round() / 100.0;
    rounded.min(100.0)
}

// ---------------------------------------------------------------------------
// Storage object listing (listWorkspaceStorageRawObjectsForProvider, Supabase).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HTTP helpers.
// ---------------------------------------------------------------------------

async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
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

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}
