use super::path::is_reserved_mobile_deployment_drive_path;
use super::*;
use crate::{
    APPLICATION_JSON, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};
use serde_json::{Value, json};

// ---------------------------------------------------------------------------
// Supabase Storage list (storage.from('workspaces').list(...)).
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
pub(super) async fn storage_list_single_page(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    prefix: &str,
    limit: i64,
    offset: i64,
    sort_by: &str,
    sort_order: &str,
    search: Option<&str>,
) -> Result<Vec<StorageListEntry>, ()> {
    let Some(url) = storage_list_url(contact_data) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");

    let mut body = json!({
        "prefix": prefix,
        "limit": limit,
        "offset": offset,
        "sortBy": { "column": sort_by, "order": sort_order },
    });
    if let Some(search) = search {
        body["search"] = Value::String(search.to_owned());
    }
    let body = body.to_string();

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

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .map(|raw| StorageListEntry { raw })
        .collect())
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
// countWorkspaceStorageObjects (storage-analytics.ts).
//
// Recursive depth-first walk of `[wsId]/[path]`, paging in
// STORAGE_ANALYTICS_PAGE_SIZE (1000), counting FILE entries (those with an `id`)
// that are not under the reserved mobile-deployment prefix and that match the
// search filter. Folders (no `id`) are pushed onto the pending stack.
// ---------------------------------------------------------------------------

pub(super) async fn count_workspace_storage_objects(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    relative_path: &str,
    search: Option<&str>,
) -> Result<i64, ()> {
    // buildWorkspaceStoragePath(wsId, path): normalizeRelativePath strips leading
    // and trailing slashes only (it does NOT reject traversal); the caller already
    // passed a sanitized path so the two normalizations agree here.
    let workspace_path = if relative_path.is_empty() {
        ws_id.to_owned()
    } else {
        format!("{ws_id}/{relative_path}")
    };

    // matchesSearch uses the trimmed, lowercased search term.
    let normalized_search = search
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    let ws_prefix = format!("{ws_id}/");
    let mut file_count: i64 = 0;
    let mut pending: Vec<String> = vec![workspace_path];

    while let Some(current_path) = pending.pop() {
        let mut offset: i64 = 0;
        loop {
            let entries = storage_list_single_page(
                contact_data,
                outbound,
                &current_path,
                STORAGE_LIST_PAGE_SIZE,
                offset,
                "name",
                "asc",
                None,
            )
            .await?;
            let page_len = entries.len();

            for entry in &entries {
                let Some(name) = entry.name().filter(|name| !name.is_empty()) else {
                    continue;
                };
                if name == EMPTY_FOLDER_PLACEHOLDER_NAME {
                    continue;
                }

                let entry_path = if current_path.is_empty() {
                    name.to_owned()
                } else {
                    format!("{current_path}/{name}")
                };

                if entry.is_file() {
                    // relativePath = fullPath.startsWith(`${wsId}/`)
                    //   ? fullPath.slice(wsId.length + 1) : fullPath
                    let relative_path = entry_path
                        .strip_prefix(&ws_prefix)
                        .map(str::to_owned)
                        .unwrap_or_else(|| entry_path.clone());

                    if is_reserved_mobile_deployment_drive_path(ws_id, &relative_path) {
                        continue;
                    }

                    if matches_search(name, normalized_search.as_deref()) {
                        file_count += 1;
                    }
                } else {
                    pending.push(entry_path);
                }
            }

            if (page_len as i64) < STORAGE_LIST_PAGE_SIZE {
                break;
            }
            offset += page_len as i64;
        }
    }

    Ok(file_count)
}

/// matchesSearch(entryName, search): true when no search term, else a
/// case-insensitive substring match.
fn matches_search(entry_name: &str, normalized_search: Option<&str>) -> bool {
    match normalized_search {
        None => true,
        Some(term) => entry_name.to_lowercase().contains(term),
    }
}
