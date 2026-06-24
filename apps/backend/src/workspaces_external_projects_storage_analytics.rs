use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
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

    Some(match request.method {
        "GET" => analytics_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
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
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, FAILED_MESSAGE);
    }

    // Auth: Supabase user session (cookie or bearer). App-session /
    // app-coordination token flows from the legacy route are not supported here
    // (see notes).
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

    // normalizeWorkspaceId (handle/personal/internal resolution).
    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // Legacy `normalizeWorkspaceId` failure surfaces as a 401 from the
            // surrounding access check (Unauthorized).
            Err(()) => return error_response(401, UNAUTHORIZED_MESSAGE),
        };

    // Resolve external-project binding (dual-read: bindings table then secrets).
    let (canonical_id, enabled) =
        match read_binding_state(contact_data, outbound, &normalized_ws_id).await {
            Ok(state) => state,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };
    let canonical_project = match canonical_id.as_deref() {
        Some(id) => match canonical_project_row(contact_data, outbound, id).await {
            Ok(project) => project,
            Err(()) => return error_response(500, FAILED_MESSAGE),
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
        return error_response(404, UNAVAILABLE_MESSAGE);
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
        Err(()) => return error_response(500, FAILED_MESSAGE),
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
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };
        permission_set_allows(
            &root_permissions,
            &["manage_external_projects", "manage_workspace_roles"],
        )
    };

    if !allowed {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    // getWorkspaceStorageOverview -> storage limit (used for usagePercentage).
    let storage_limit = storage_limit(contact_data, outbound, &normalized_ws_id).await;

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
        Err(()) => return error_response(500, FAILED_MESSAGE),
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

    no_store_response(json_response(
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
    ))
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

struct RawObject {
    /// Path relative to the workspace root (legacy `object.path`).
    path: String,
    size: i64,
    updated_at: Option<String>,
    is_folder_placeholder: bool,
}

/// Mirrors the Supabase path of `listWorkspaceStorageRawObjectsForProvider`:
/// recursively walk `<wsId>/<prefix>` via the Storage list API, collecting raw
/// objects up to `limit`, skipping reserved mobile-deployment vault files.
///
/// NOTE: When the active provider is a fully-configured R2 backend, the legacy
/// code lists the R2 bucket through S3 ListObjectsV2 (SigV4-signed). That
/// signing path is not implemented in the Workers backend, so this always reads
/// the Supabase `workspaces` bucket. For Supabase-backed workspaces (the
/// default) this is an exact match. See notes / integrator verification.
async fn list_raw_objects(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    relative_prefix: &str,
    limit: usize,
) -> Result<Vec<RawObject>, ()> {
    let mut objects: Vec<RawObject> = Vec::new();

    // Depth-first walk; the storage prefix is `<wsId>/<relative_prefix>`. The
    // legacy `buildWorkspaceStoragePrefix` joins with `/` and strips a trailing
    // slash before listing.
    let root = if relative_prefix.is_empty() {
        ws_id.to_owned()
    } else {
        format!("{ws_id}/{relative_prefix}")
    };

    let workspace_prefix = format!("{ws_id}/");

    // Stack ordering: process entries in list order, so use a queue-like stack
    // pushing children to preserve a stable (best-effort) traversal. Exact
    // ordering does not affect aggregate totals; it only affects which subset is
    // retained when truncated, which the legacy code also leaves implementation
    // defined within the page scan.
    let mut pending: Vec<String> = vec![root];

    while let Some(current_path) = pending.pop() {
        let mut offset: u32 = 0;
        loop {
            if objects.len() >= limit {
                return Ok(objects);
            }

            let entries = storage_list(contact_data, outbound, &current_path, offset).await?;
            let page_len = entries.len();

            let mut child_folders: Vec<String> = Vec::new();

            for entry in entries {
                let Some(name) = entry.name.filter(|name| !name.is_empty()) else {
                    continue;
                };
                let entry_path = if current_path.is_empty() {
                    name.clone()
                } else {
                    format!("{current_path}/{name}")
                };

                if entry.id.is_some() {
                    // File entry.
                    let relative_path = entry_path
                        .strip_prefix(&workspace_prefix)
                        .unwrap_or(&entry_path)
                        .to_owned();

                    // filterReservedWorkspaceStorageObjects: drop reserved
                    // mobile-deployment vault files (relative to the workspace).
                    if is_reserved_mobile_deployment_drive_path(&relative_path) {
                        continue;
                    }

                    let size = entry.metadata.and_then(|meta| meta.size).unwrap_or(0);
                    objects.push(RawObject {
                        path: relative_path,
                        size,
                        updated_at: entry.updated_at,
                        is_folder_placeholder: entry_path.ends_with(EMPTY_FOLDER_PLACEHOLDER_NAME),
                    });

                    if objects.len() >= limit {
                        return Ok(objects);
                    }
                } else {
                    // Folder entry: recurse.
                    child_folders.push(entry_path);
                }
            }

            // Push children so they are processed after the rest of this folder's
            // pages, mirroring the recursive descent.
            for folder in child_folders.into_iter().rev() {
                pending.push(folder);
            }

            if (page_len as u32) < STORAGE_LIST_PAGE_SIZE {
                break;
            }
            offset += page_len as u32;
        }
    }

    Ok(objects)
}

/// Mirrors isReservedMobileDeploymentDrivePath: a relative path is reserved when
/// it is exactly the reserved prefix or sits beneath it.
fn is_reserved_mobile_deployment_drive_path(relative_path: &str) -> bool {
    let normalized = relative_path.trim_start_matches('/');
    normalized == RESERVED_MOBILE_DEPLOYMENT_PREFIX
        || normalized.starts_with(&format!("{RESERVED_MOBILE_DEPLOYMENT_PREFIX}/"))
}

async fn storage_list(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    prefix: &str,
    offset: u32,
) -> Result<Vec<StorageListEntry>, ()> {
    let Some(url) = storage_list_url(contact_data) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({
        "prefix": prefix,
        "limit": STORAGE_LIST_PAGE_SIZE,
        "offset": offset,
        "sortBy": { "column": "name", "order": "asc" },
    })
    .to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<StorageListEntry>>().map_err(|_| ())
}

/// Derive the Supabase Storage list endpoint from the REST base URL. The
/// `ContactDataConfig` exposes no raw origin accessor, so we reuse `rest_url`
/// and rewrite the `/rest/v1/...` segment to `/storage/v1/object/list/...`.
fn storage_list_url(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest_url = contact_data.rest_url("__origin__", &[])?;
    let origin = rest_url.split("/rest/v1/").next()?;
    if origin.is_empty() {
        return None;
    }
    Some(format!("{origin}/storage/v1/object/list/{STORAGE_BUCKET}"))
}

async fn storage_limit(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> i64 {
    let Some(url) = contact_data.rpc_url(STORAGE_LIMIT_RPC) else {
        return STORAGE_LIMIT_FALLBACK_BYTES;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return STORAGE_LIMIT_FALLBACK_BYTES;
    };
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "p_ws_id": ws_id }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await;

    match response {
        Ok(response) if is_success(response.status) => {
            serde_json::from_str::<i64>(response.body_text.trim())
                .unwrap_or(STORAGE_LIMIT_FALLBACK_BYTES)
        }
        _ => STORAGE_LIMIT_FALLBACK_BYTES,
    }
}

// ---------------------------------------------------------------------------
// External-project binding resolution (mirrors
// resolveWorkspaceExternalProjectBinding dual-read).
// ---------------------------------------------------------------------------

async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    // Prefer the first-class bindings table.
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) {
        if let Ok(response) = service_role_get(contact_data, outbound, &url).await {
            if is_success(response.status) {
                if let Ok(Some(row)) = decode_first_row::<BindingRow>(&response) {
                    return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
                }
            }
        }
        // Any binding-table failure falls through to the secrets dual-read.
    }

    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
    let canonical_id = rows
        .iter()
        .find(|row| row.name.as_deref() == Some(EXTERNAL_PROJECT_CANONICAL_ID_SECRET))
        .and_then(|row| row.value.clone());
    let enabled = rows.iter().any(|row| {
        row.name.as_deref() == Some(EXTERNAL_PROJECT_ENABLED_SECRET)
            && row.value.as_deref() == Some("true")
    });

    Ok((canonical_id, enabled))
}

async fn canonical_project_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<Option<CanonicalProjectRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "adapter,is_active".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<CanonicalProjectRow>(&response)
}

// ---------------------------------------------------------------------------
// Permission resolution (mirrors getPermissions composition used by access.ts).
// ---------------------------------------------------------------------------

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

fn permission_set_allows(permissions: &EffectivePermissions, wanted: &[&str]) -> bool {
    permissions.has_all_permissions
        || wanted
            .iter()
            .any(|wanted| permissions.permissions.iter().any(|value| value == wanted))
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<EffectivePermissions, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user_id, access_token).await?
    else {
        // No membership -> getPermissions returns null (no permissions).
        return Ok(EffectivePermissions {
            has_all_permissions: false,
            permissions: Vec::new(),
        });
    };

    let creator_id = workspace_creator_id(contact_data, outbound, ws_id).await?;
    let is_creator = membership_type == "MEMBER" && creator_id.as_deref() == Some(user_id);

    let role_permissions = if membership_type == "MEMBER" {
        role_permissions(contact_data, outbound, ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        default_permissions(contact_data, outbound, ws_id, &membership_type).await?;

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(EffectivePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    })
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<String>, ()> {
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceCreatorRow>(&response)?.and_then(|row| row.creator_id))
}

async fn role_permissions(
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }
    Ok(response
        .json::<Vec<RolePermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

// ---------------------------------------------------------------------------
// Workspace identifier normalization (normalizeWorkspaceId).
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_workspace_handle_candidate(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<WorkspaceIdRow>(&response)?
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
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

fn is_workspace_handle_candidate(value: &str) -> bool {
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
