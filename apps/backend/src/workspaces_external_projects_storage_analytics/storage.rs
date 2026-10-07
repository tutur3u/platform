use super::*;

pub(super) struct RawObject {
    /// Path relative to the workspace root (legacy `object.path`).
    pub(super) path: String,
    pub(super) size: i64,
    pub(super) updated_at: Option<String>,
    pub(super) is_folder_placeholder: bool,
}

/// Mirrors the Supabase path of `listWorkspaceStorageRawObjectsForProvider`:
/// recursively walk `<wsId>/<prefix>` via the Storage list API, collecting raw
/// objects up to `limit`, skipping reserved mobile-deployment vault files.
///
/// The route falls through to Next for fully configured R2 workspaces before
/// calling this helper. Supabase scans remain the missing-cache-RPC fallback.
pub(super) async fn list_raw_objects(
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

pub(super) async fn storage_limit(
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
