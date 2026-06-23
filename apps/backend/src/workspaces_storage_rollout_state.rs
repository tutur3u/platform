use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants mirroring the legacy route + storage helpers.
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/storage/rollout-state";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// Permissions that grant secrets management for this route.
const MANAGE_WORKSPACE_SECRETS: &str = "manage_workspace_secrets";
const MANAGE_WORKSPACE_ROLES: &str = "manage_workspace_roles";
const ADMIN_PERMISSION: &str = "admin";

// Provider identifiers (workspace-storage-config.ts).
const PROVIDER_SUPABASE: &str = "supabase";
const PROVIDER_R2: &str = "r2";

// Drive storage secret names (workspace-storage-config.ts).
const DRIVE_STORAGE_PROVIDER_SECRET: &str = "DRIVE_STORAGE_PROVIDER";
const DRIVE_R2_BUCKET_SECRET: &str = "DRIVE_R2_BUCKET";
const DRIVE_R2_ENDPOINT_SECRET: &str = "DRIVE_R2_ENDPOINT";
const DRIVE_R2_ACCESS_KEY_ID_SECRET: &str = "DRIVE_R2_ACCESS_KEY_ID";
const DRIVE_R2_SECRET_ACCESS_KEY_SECRET: &str = "DRIVE_R2_SECRET_ACCESS_KEY";
const DRIVE_AUTO_EXTRACT_ZIP_SECRET: &str = "DRIVE_AUTO_EXTRACT_ZIP";
const DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET: &str = "DRIVE_AUTO_EXTRACT_PROXY_URL";
const DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET: &str = "DRIVE_AUTO_EXTRACT_PROXY_TOKEN";
// external-projects/constants.ts
const EXTERNAL_PROJECT_ENABLED_SECRET: &str = "ENABLE_EXTERNAL_PROJECTS";

const R2_INCOMPLETE_MESSAGE: &str = "Cloudflare R2 secrets are incomplete.";

const STORAGE_BUCKET: &str = "workspaces";
const STORAGE_LIST_PAGE_SIZE: u32 = 1000;
const STORAGE_LIMIT_FALLBACK_BYTES: i64 = 104857600;
const EMPTY_FOLDER_PLACEHOLDER_NAME: &str = ".emptyFolderPlaceholder";
const STORAGE_LIMIT_RPC: &str = "get_workspace_storage_limit";

// ---------------------------------------------------------------------------
// Response shape (mirrors WorkspaceStorageRolloutState in
// workspace-storage-migration.ts, serialized camelCase).
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct RolloutStateEnvelope {
    data: RolloutState,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RolloutState {
    active_provider: String,
    active_provider_misconfigured: bool,
    backends: Backends,
    auto_extract: AutoExtractState,
}

#[derive(Serialize)]
struct Backends {
    supabase: BackendState,
    r2: BackendState,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendState {
    provider: String,
    available: bool,
    selected: bool,
    misconfigured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    overview: Option<StorageOverview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageOverview {
    provider: String,
    total_size: i64,
    file_count: i64,
    largest_file: Option<StorageFileRecord>,
    smallest_file: Option<StorageFileRecord>,
    storage_limit: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageFileRecord {
    name: String,
    size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoExtractState {
    enabled: bool,
    configured: bool,
    proxy_url_configured: bool,
    proxy_token_configured: bool,
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
struct WorkspaceSecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct StorageListEntry {
    name: Option<String>,
    // `id` is non-null for files and null for "folders" in the Storage list API.
    id: Option<String>,
    created_at: Option<String>,
    metadata: Option<StorageEntryMetadata>,
}

#[derive(Deserialize)]
struct StorageEntryMetadata {
    size: Option<i64>,
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_storage_rollout_state_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = rollout_state_ws_id(request.path)?;

    Some(match request.method {
        "GET" => rollout_state_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

fn rollout_state_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn rollout_state_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // normalizeWorkspaceId (handle/personal/internal resolution).
    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // Permission gate: workspace.manage_workspace_secrets OR
    // root.manage_workspace_roles OR root.manage_workspace_secrets.
    let workspace_access =
        match workspace_permissions(contact_data, outbound, &normalized_ws_id, &user_id).await {
            Ok(access) => access,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };
    let root_access =
        match workspace_permissions(contact_data, outbound, ROOT_WORKSPACE_ID, &user_id).await {
            Ok(access) => access,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    let can_manage = workspace_access.contains(MANAGE_WORKSPACE_SECRETS)
        || root_access.contains(MANAGE_WORKSPACE_ROLES)
        || root_access.contains(MANAGE_WORKSPACE_SECRETS);
    if !can_manage {
        return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
    }

    // Build the rollout state payload.
    match build_rollout_state(contact_data, outbound, &normalized_ws_id).await {
        Ok(state) => no_store_response(json_response(200, RolloutStateEnvelope { data: state })),
        Err(()) => message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Rollout state assembly (getWorkspaceStorageRolloutState).
// ---------------------------------------------------------------------------

struct R2Config {
    complete: bool,
}

async fn build_rollout_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<RolloutState, ()> {
    let secrets = read_drive_secrets(contact_data, outbound, ws_id).await?;

    // resolveWorkspaceStorageProvider: parse DRIVE_STORAGE_PROVIDER, then
    // resolve to supabase when R2 secrets are incomplete (misconfigured=true).
    let requested_provider = parse_provider(secret_value(&secrets, DRIVE_STORAGE_PROVIDER_SECRET));
    let r2_config = resolve_r2_config(&secrets);

    let (active_provider, active_provider_misconfigured) = if requested_provider == PROVIDER_R2 {
        if r2_config.complete {
            (PROVIDER_R2.to_owned(), false)
        } else {
            (PROVIDER_SUPABASE.to_owned(), true)
        }
    } else {
        (PROVIDER_SUPABASE.to_owned(), false)
    };

    let storage_limit = storage_limit(contact_data, outbound, ws_id).await;

    // Supabase backend is always available; overview computed via Storage API.
    let supabase_selected = active_provider == PROVIDER_SUPABASE;
    let supabase_overview = supabase_overview(contact_data, outbound, ws_id, storage_limit).await?;
    let supabase_state = BackendState {
        provider: PROVIDER_SUPABASE.to_owned(),
        available: true,
        selected: supabase_selected,
        misconfigured: false,
        overview: Some(supabase_overview),
        message: None,
    };

    // R2 backend: available only when secrets are complete. Legacy computes an
    // R2 overview via S3 ListObjectsV2; see notes for the fidelity gap.
    let r2_selected = active_provider == PROVIDER_R2;
    let r2_state = if r2_config.complete {
        BackendState {
            provider: PROVIDER_R2.to_owned(),
            available: true,
            selected: r2_selected,
            misconfigured: false,
            // Overview omitted: requires S3 SigV4 listing of the R2 bucket.
            overview: None,
            message: None,
        }
    } else {
        BackendState {
            provider: PROVIDER_R2.to_owned(),
            available: false,
            selected: r2_selected,
            misconfigured: true,
            overview: None,
            message: Some(R2_INCOMPLETE_MESSAGE.to_owned()),
        }
    };
    let auto_extract = auto_extract_state(&secrets);

    Ok(RolloutState {
        active_provider,
        active_provider_misconfigured,
        backends: Backends {
            supabase: supabase_state,
            r2: r2_state,
        },
        auto_extract,
    })
}

fn parse_provider(value: Option<&str>) -> String {
    match value.map(|raw| raw.trim().to_lowercase()) {
        Some(provider) if provider == PROVIDER_R2 => PROVIDER_R2.to_owned(),
        _ => PROVIDER_SUPABASE.to_owned(),
    }
}

fn resolve_r2_config(secrets: &[WorkspaceSecretRow]) -> R2Config {
    let bucket = trimmed_secret(secrets, DRIVE_R2_BUCKET_SECRET);
    let endpoint = trimmed_secret(secrets, DRIVE_R2_ENDPOINT_SECRET);
    let access_key_id = trimmed_secret(secrets, DRIVE_R2_ACCESS_KEY_ID_SECRET);
    let secret_access_key = trimmed_secret(secrets, DRIVE_R2_SECRET_ACCESS_KEY_SECRET);

    let complete = bucket.is_some()
        && endpoint.is_some()
        && access_key_id.is_some()
        && secret_access_key.is_some();

    R2Config { complete }
}

fn auto_extract_state(secrets: &[WorkspaceSecretRow]) -> AutoExtractState {
    let enabled = is_truthy(secret_value(secrets, DRIVE_AUTO_EXTRACT_ZIP_SECRET))
        || is_truthy(secret_value(secrets, EXTERNAL_PROJECT_ENABLED_SECRET));

    let workspace_proxy_url = trimmed_secret(secrets, DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET);
    let workspace_proxy_token = trimmed_secret(secrets, DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET);

    // NOTE: legacy also falls back to process.env.DRIVE_AUTO_EXTRACT_PROXY_URL /
    // DRIVE_AUTO_EXTRACT_PROXY_TOKEN; the backend has no equivalent env access
    // wired through here, so only workspace secrets are considered. With only
    // workspace secrets in scope, the proxy-token branch in the legacy code
    // collapses to the workspace token in both cases.
    let proxy_url_configured = workspace_proxy_url.is_some();
    let proxy_token_configured = workspace_proxy_token.is_some();
    let configured = enabled && proxy_url_configured && proxy_token_configured;

    AutoExtractState {
        enabled,
        configured,
        proxy_url_configured,
        proxy_token_configured,
    }
}

fn is_truthy(value: Option<&str>) -> bool {
    match value {
        Some(raw) => {
            let normalized = raw.trim().to_lowercase();
            normalized == "true" || normalized == "1" || normalized == "yes"
        }
        None => false,
    }
}

fn secret_value<'a>(secrets: &'a [WorkspaceSecretRow], name: &str) -> Option<&'a str> {
    // createSecretsMap keeps the first occurrence per name.
    secrets
        .iter()
        .find(|secret| secret.name.as_deref() == Some(name))
        .and_then(|secret| secret.value.as_deref())
}

fn trimmed_secret(secrets: &[WorkspaceSecretRow], name: &str) -> Option<String> {
    secret_value(secrets, name)
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

async fn read_drive_secrets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<WorkspaceSecretRow>, ()> {
    // getSecrets({ forceAdmin: true }) -> service-role read of workspace_secrets.
    let names = format!(
        "in.({DRIVE_STORAGE_PROVIDER_SECRET},{DRIVE_R2_BUCKET_SECRET},{DRIVE_R2_ENDPOINT_SECRET},{DRIVE_R2_ACCESS_KEY_ID_SECRET},{DRIVE_R2_SECRET_ACCESS_KEY_SECRET},{DRIVE_AUTO_EXTRACT_ZIP_SECRET},{DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET},{DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET},{EXTERNAL_PROJECT_ENABLED_SECRET})"
    );
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", names),
            ("order", "created_at.asc".to_owned()),
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
// Supabase storage overview (getWorkspaceStorageMetrics via Storage list API).
// ---------------------------------------------------------------------------

async fn supabase_overview(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    storage_limit: i64,
) -> Result<StorageOverview, ()> {
    let mut total_size: i64 = 0;
    let mut file_count: i64 = 0;
    let mut largest_file: Option<StorageFileRecord> = None;
    let mut smallest_file: Option<StorageFileRecord> = None;

    // walkWorkspaceStorage: depth-first walk starting at the workspace root.
    let mut pending: Vec<String> = vec![ws_id.to_owned()];

    while let Some(current_path) = pending.pop() {
        let mut offset: u32 = 0;
        loop {
            let entries = storage_list(contact_data, outbound, &current_path, offset).await?;
            let page_len = entries.len();

            for entry in entries {
                let Some(name) = entry.name.filter(|name| !name.is_empty()) else {
                    continue;
                };
                if name == EMPTY_FOLDER_PLACEHOLDER_NAME {
                    continue;
                }
                let entry_path = if current_path.is_empty() {
                    name.clone()
                } else {
                    format!("{current_path}/{name}")
                };

                if entry.id.is_some() {
                    let size = entry.metadata.and_then(|meta| meta.size).unwrap_or(0);
                    let record = StorageFileRecord {
                        name,
                        size,
                        created_at: entry.created_at,
                    };

                    file_count += 1;
                    total_size += size;

                    if largest_file
                        .as_ref()
                        .map(|current| size > current.size)
                        .unwrap_or(true)
                    {
                        largest_file = Some(record.clone());
                    }
                    if smallest_file
                        .as_ref()
                        .map(|current| size < current.size)
                        .unwrap_or(true)
                    {
                        smallest_file = Some(record);
                    }
                } else {
                    pending.push(entry_path);
                }
            }

            if (page_len as u32) < STORAGE_LIST_PAGE_SIZE {
                break;
            }
            offset += page_len as u32;
        }
    }

    Ok(StorageOverview {
        provider: PROVIDER_SUPABASE.to_owned(),
        total_size,
        file_count,
        largest_file,
        smallest_file,
        storage_limit,
    })
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
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
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
    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
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
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Permission resolution (getPermissions / containsPermission).
// ---------------------------------------------------------------------------

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
        let all = permissions.iter().any(|value| value == ADMIN_PERMISSION);
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

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
        .json::<Vec<WorkspaceMembershipRow>>()
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
        .json::<Vec<RolePermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
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

// ---------------------------------------------------------------------------
// Shared identifier helpers (mirrors workspace_habits_access).
// ---------------------------------------------------------------------------

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
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

fn is_workspace_handle(value: &str) -> bool {
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
// Outbound helpers.
// ---------------------------------------------------------------------------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
