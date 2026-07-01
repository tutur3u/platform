use super::auth::{extract_api_key, resolve_permissions, validate_api_key};
use super::path::{
    filter_reserved_mobile_deployment_drive_entries, is_reserved_mobile_deployment_drive_path,
    sanitize_path,
};
use super::query::parse_list_query;
use super::storage::{count_workspace_storage_objects, storage_list_single_page};
use super::*;
use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, method_not_allowed,
    no_store_response, outbound::OutboundHttpClient,
};
use serde_json::{Value, json};

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_storage_list_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != STORAGE_LIST_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => storage_list_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn storage_list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Extract the API key from the Authorization header.
    let Some(api_key) = extract_api_key(request.authorization) else {
        return error_response(
            401,
            "Unauthorized",
            "Missing or invalid Authorization header. Expected: \"Authorization: Bearer <api_key>\"",
            Some("MISSING_API_KEY"),
        );
    };

    // 2. Validate the API key and resolve the workspace context (ws_id + role_id).
    let context = match validate_api_key(contact_data, outbound, &api_key).await {
        Ok(Some(context)) => context,
        // The legacy `validateApiKey` swallows errors and returns null, surfaced
        // by the middleware as a 401 `INVALID_API_KEY`.
        Ok(None) | Err(()) => {
            return error_response(
                401,
                "Unauthorized",
                "Invalid or expired API key",
                Some("INVALID_API_KEY"),
            );
        }
    };

    // 3. Permission gate: hasAnyPermission(['manage_drive']) (admin is wildcard).
    let permissions: Vec<String> = resolve_permissions(
        contact_data,
        outbound,
        &context.ws_id,
        context.role_id.as_deref(),
    )
    .await
    .unwrap_or_default();
    let has_access = permissions
        .iter()
        .any(|value| value == ADMIN_PERMISSION || value == MANAGE_DRIVE_PERMISSION);
    if !has_access {
        return error_response(
            403,
            "Forbidden",
            "Insufficient permissions. Required: manage_drive",
            Some("INSUFFICIENT_PERMISSIONS"),
        );
    }

    let ws_id = context.ws_id;

    // 4. validateQueryParams(request, listQuerySchema).
    let parsed = match parse_list_query(request.url) {
        Ok(parsed) => parsed,
        Err(()) => {
            return error_response(
                400,
                "Bad Request",
                "Invalid query parameters",
                Some("INVALID_QUERY_PARAMS"),
            );
        }
    };

    // 5. sanitizePath(path) -> null => 400 INVALID_PATH.
    let Some(trimmed_path) = sanitize_path(&parsed.path) else {
        return error_response(400, "Bad Request", "Invalid path", Some("INVALID_PATH"));
    };

    // 6. isReservedMobileDeploymentDrivePath(wsId, trimmedPath) => 403.
    if is_reserved_mobile_deployment_drive_path(&ws_id, &trimmed_path) {
        return error_response(
            403,
            "Forbidden",
            "Mobile deployment vault files are managed by the mobile deployment API.",
            Some("STORAGE_RESERVED_PATH"),
        );
    }

    // 7. storage.from('workspaces').list([wsId]/[trimmedPath], { ... }).
    let storage_path = if trimmed_path.is_empty() {
        ws_id.clone()
    } else {
        format!("{ws_id}/{trimmed_path}")
    };

    // search: search || undefined (the legacy passes the raw value through; the
    // Supabase client treats an empty string as no search). We forward the raw
    // value when present and non-empty.
    let search = parsed.search.as_deref().filter(|value| !value.is_empty());

    let entries = match storage_list_single_page(
        contact_data,
        outbound,
        &storage_path,
        parsed.limit,
        parsed.offset,
        &parsed.sort_by,
        &parsed.sort_order,
        search,
    )
    .await
    {
        Ok(entries) => entries,
        Err(()) => {
            return error_response(
                500,
                "Internal Server Error",
                "Failed to list files",
                Some("STORAGE_LIST_ERROR"),
            );
        }
    };

    // 8. Filter out `.emptyFolderPlaceholder`, then
    //    filterReservedMobileDeploymentDriveEntries(wsId, trimmedPath, ...).
    let filtered = filter_reserved_mobile_deployment_drive_entries(
        &ws_id,
        &trimmed_path,
        entries
            .into_iter()
            .filter(|entry| entry.name() != Some(EMPTY_FOLDER_PLACEHOLDER_NAME))
            .collect(),
    );

    // 9. countWorkspaceStorageObjects(supabase, wsId, { path, search }); on error
    //    fall back to filteredFiles.length.
    let total = match count_workspace_storage_objects(
        contact_data,
        outbound,
        &ws_id,
        &trimmed_path,
        parsed.search.as_deref(),
    )
    .await
    {
        Ok(total) => total,
        Err(()) => filtered.len() as i64,
    };

    let data: Vec<Value> = filtered.into_iter().map(|entry| entry.raw).collect();

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "pagination": {
                "limit": parsed.limit,
                "offset": parsed.offset,
                "total": total,
            },
        }),
    ))
}
