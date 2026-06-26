//! Handler for `GET /api/v1/storage/list`.
//!
//! Ported from `apps/web/src/app/api/v1/storage/list/route.ts`.
//!
//! Auth model: external SDK **workspace API key** (`Authorization: Bearer ttr_...`),
//! via `withApiAuth(..., { permissions: ['manage_drive'] })`. This is NOT Supabase
//! user auth. The API-key validation flow mirrors `storage_analytics.rs`
//! (`validateApiKey` in `packages/auth/src/api-keys.ts`):
//!   1. The key must start with `ttr_`.
//!   2. The first 12 characters form the `key_prefix`, used to fetch candidate
//!      rows from `workspace_api_keys` where `expires_at IS NULL OR
//!      expires_at > now()`.
//!   3. Each candidate's stored `key_hash` (format `salt:hex`) is verified with
//!      scrypt (Node defaults: N=16384, r=8, p=1, dkLen=64), constant-time compare.
//!   4. The matching row yields `ws_id` and `role_id`. Permissions are the union
//!      of role permissions (when `role_id` is set, enabled) and workspace default
//!      permissions (`member_type = MEMBER`, enabled). The `admin` permission is a
//!      wildcard. The route requires `hasAnyPermission(['manage_drive'])`.
//!
//! Request flow (legacy GET handler):
//!   1. `validateQueryParams(request, listQuerySchema)` — on failure returns
//!      `createErrorResponse('Bad Request','Invalid query parameters',400,
//!      'INVALID_QUERY_PARAMS')`.
//!   2. `sanitizePath(path)` — `null` => 400 `INVALID_PATH`.
//!   3. `isReservedMobileDeploymentDrivePath(wsId, trimmedPath)` => 403
//!      `STORAGE_RESERVED_PATH`.
//!   4. Supabase Storage `.list([wsId]/[path], { limit, offset, sortBy, search })`
//!      — storage error => 500 `STORAGE_LIST_ERROR`.
//!   5. Filter out `.emptyFolderPlaceholder`, then
//!      `filterReservedMobileDeploymentDriveEntries(wsId, trimmedPath, ...)`.
//!   6. `countWorkspaceStorageObjects(supabase, wsId, { path, search })` — a
//!      RECURSIVE walk of `[wsId]/[path]` counting files (entries with `id`) that
//!      are not under the reserved mobile-deployment prefix and match `search`.
//!      On error: fall back to `filteredFiles.length`.
//!   7. Respond `{ data: filteredFiles, pagination: { limit, offset, total } }`,
//!      status 200.
//!
//! Error shapes (`createErrorResponse(error, message, status, code)`):
//!   - 401 `MISSING_API_KEY` / `INVALID_API_KEY`
//!   - 403 `INSUFFICIENT_PERMISSIONS` / `STORAGE_RESERVED_PATH`
//!   - 400 `INVALID_QUERY_PARAMS` / `INVALID_PATH`
//!   - 500 `STORAGE_LIST_ERROR` / `UNEXPECTED_ERROR`
//!
//! Storage fidelity: the legacy route uses the Supabase Storage `.list()` API
//! directly (it does NOT branch to an R2 provider, unlike
//! `getWorkspaceStorageOverview`). This module reproduces that Supabase path
//! exactly. The recursive count mirrors `countWorkspaceStorageObjects`.
//!
//! No new shared helpers are added: all API-key validation, scrypt, sanitizePath,
//! and reserved-path helpers are copied file-local (the originals are private fns
//! in `storage_analytics.rs` / `workspaces_storage_list.rs`).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, constant_time_eq, contact,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const STORAGE_LIST_PATH: &str = "/api/v1/storage/list";

const API_KEY_PREFIX: &str = "ttr_";
const KEY_PREFIX_LEN: usize = 12;

const MANAGE_DRIVE_PERMISSION: &str = "manage_drive";
const ADMIN_PERMISSION: &str = "admin";

const STORAGE_BUCKET: &str = "workspaces";
const STORAGE_LIST_PAGE_SIZE: i64 = 1000;
const EMPTY_FOLDER_PLACEHOLDER_NAME: &str = ".emptyFolderPlaceholder";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// mobile-deployment/constants.ts: MOBILE_DEPLOYMENT_DRIVE_PREFIX.
const MOBILE_DEPLOYMENT_DRIVE_PREFIX: &str = ".tuturuuu/mobile-deployment-vault";
// filterReservedMobileDeploymentDriveEntries drops the `.tuturuuu` root entry.
const RESERVED_FOLDER_ENTRY_NAME: &str = ".tuturuuu";

// Zod listQuerySchema bounds (constants.ts).
const MAX_MEDIUM_TEXT_LENGTH: usize = 1000; // path
const MAX_SEARCH_LENGTH: usize = 500; // search
const MAX_SHORT_TEXT_LENGTH: i64 = 100; // limit max
const DEFAULT_LIMIT: i64 = 50;
const DEFAULT_OFFSET: i64 = 0;

// ---------------------------------------------------------------------------
// Parsed query params (zod listQuerySchema).
// ---------------------------------------------------------------------------

struct ListQuery {
    path: String,
    search: Option<String>,
    limit: i64,
    offset: i64,
    sort_by: String,
    sort_order: String,
}

// ---------------------------------------------------------------------------
// Deserialization rows.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ApiKeyRow {
    ws_id: Option<String>,
    role_id: Option<String>,
    key_hash: Option<String>,
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

/// Supabase Storage list entry. We keep the raw JSON value so we can
/// re-serialize each entry verbatim (matching the legacy `StorageObject[]`
/// response shape) while still inspecting `name`/`id` for filtering.
struct StorageListEntry {
    raw: Value,
}

impl StorageListEntry {
    fn name(&self) -> Option<&str> {
        self.raw.get("name").and_then(Value::as_str)
    }

    fn is_file(&self) -> bool {
        // `id` is non-null for files and null for "folders" in the list API.
        matches!(self.raw.get("id"), Some(value) if !value.is_null())
    }
}

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

// ---------------------------------------------------------------------------
// Query parsing (zod listQuerySchema). On any validation failure return Err(())
// so the caller emits the single createErrorResponse(... INVALID_QUERY_PARAMS).
// ---------------------------------------------------------------------------

fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut path: Option<String> = None;
    let mut search: Option<String> = None;
    let mut limit: Option<String> = None;
    let mut offset: Option<String> = None;
    let mut sort_by: Option<String> = None;
    let mut sort_order: Option<String> = None;

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "path" => path = Some(value.into_owned()),
                "search" => search = Some(value.into_owned()),
                "limit" => limit = Some(value.into_owned()),
                "offset" => offset = Some(value.into_owned()),
                "sortBy" => sort_by = Some(value.into_owned()),
                "sortOrder" => sort_order = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    // path: string().max(MAX_MEDIUM_TEXT_LENGTH).optional().default('')
    let path_value = path.unwrap_or_default();
    if path_value.chars().count() > MAX_MEDIUM_TEXT_LENGTH {
        return Err(());
    }

    // search: string().max(MAX_SEARCH_LENGTH).optional()
    if let Some(ref search_value) = search
        && search_value.chars().count() > MAX_SEARCH_LENGTH
    {
        return Err(());
    }

    // limit: coerce.number().int().min(1).max(MAX_SHORT_TEXT_LENGTH).default(50)
    let limit_value = match limit {
        Some(raw) => coerce_int(&raw).ok_or(())?,
        None => DEFAULT_LIMIT,
    };
    if !(1..=MAX_SHORT_TEXT_LENGTH).contains(&limit_value) {
        return Err(());
    }

    // offset: coerce.number().int().min(0).default(0)
    let offset_value = match offset {
        Some(raw) => coerce_int(&raw).ok_or(())?,
        None => DEFAULT_OFFSET,
    };
    if offset_value < 0 {
        return Err(());
    }

    // sortBy: enum(['name','created_at','updated_at','size']).default('name')
    let sort_by_value = sort_by.unwrap_or_else(|| "name".to_owned());
    if !matches!(
        sort_by_value.as_str(),
        "name" | "created_at" | "updated_at" | "size"
    ) {
        return Err(());
    }

    // sortOrder: enum(['asc','desc']).default('asc')
    let sort_order_value = sort_order.unwrap_or_else(|| "asc".to_owned());
    if !matches!(sort_order_value.as_str(), "asc" | "desc") {
        return Err(());
    }

    Ok(ListQuery {
        path: path_value,
        search,
        limit: limit_value,
        offset: offset_value,
        sort_by: sort_by_value,
        sort_order: sort_order_value,
    })
}

/// Mirror of zod's `z.coerce.number().int()`: coerce the string to a number,
/// then require it to be a non-fractional finite integer.
fn coerce_int(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        // z.coerce.number()('') === Number('') === 0
        return Some(0);
    }
    let parsed = trimmed.parse::<f64>().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return None;
    }
    Some(parsed as i64)
}

// ---------------------------------------------------------------------------
// Supabase Storage list (storage.from('workspaces').list(...)).
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn storage_list_single_page(
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

async fn count_workspace_storage_objects(
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

// ---------------------------------------------------------------------------
// Reserved mobile-deployment drive filtering (mobile-deployment/storage-policy.ts).
// ---------------------------------------------------------------------------

/// Mirror of `isReservedMobileDeploymentDrivePath`.
fn is_reserved_mobile_deployment_drive_path(ws_id: &str, path: &str) -> bool {
    if resolve_workspace_id(ws_id) != ROOT_WORKSPACE_ID {
        return false;
    }

    let Some(normalized) = sanitize_path(path) else {
        return false;
    };

    normalized == MOBILE_DEPLOYMENT_DRIVE_PREFIX
        || normalized.starts_with(&format!("{MOBILE_DEPLOYMENT_DRIVE_PREFIX}/"))
        || (!normalized.is_empty()
            && MOBILE_DEPLOYMENT_DRIVE_PREFIX.starts_with(&format!("{normalized}/")))
}

/// Mirror of `filterReservedMobileDeploymentDriveEntries`: only at the root of a
/// ROOT workspace (empty path), drop the reserved `.tuturuuu` entry. When the
/// path is non-empty (normalizeRelativePath truthy) the entries pass unchanged.
fn filter_reserved_mobile_deployment_drive_entries(
    ws_id: &str,
    path: &str,
    entries: Vec<StorageListEntry>,
) -> Vec<StorageListEntry> {
    // normalizeRelativePath(path) === sanitizePath(path) for the already-sanitized
    // value passed in by the caller; a None result leaves entries unchanged.
    let Some(normalized) = sanitize_path(path) else {
        return entries;
    };

    if resolve_workspace_id(ws_id) != ROOT_WORKSPACE_ID || !normalized.is_empty() {
        return entries;
    }

    entries
        .into_iter()
        .filter(|entry| entry.name() != Some(RESERVED_FOLDER_ENTRY_NAME))
        .collect()
}

// ---------------------------------------------------------------------------
// sanitizePath (storage-path.ts).
// ---------------------------------------------------------------------------

/// Mirror of `sanitizePath`. Returns `None` for invalid paths, otherwise the
/// normalized path (possibly empty).
fn sanitize_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return Some(String::new());
    }

    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim().trim_matches('/');

    let segments: Vec<&str> = trimmed
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    for segment in &segments {
        if *segment == ".." || *segment == "." || segment.is_empty() {
            return None;
        }
        if segment.contains("..") {
            return None;
        }
    }

    Some(segments.join("/"))
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

// ---------------------------------------------------------------------------
// API key validation + permission resolution (validateApiKey).
// Copied file-local from `storage_analytics.rs` (private fns there).
// ---------------------------------------------------------------------------

struct ApiKeyContext {
    ws_id: String,
    role_id: Option<String>,
}

fn extract_api_key(authorization: Option<&str>) -> Option<String> {
    let header = authorization?.trim();

    if header.len() >= 7 && header[..7].eq_ignore_ascii_case("bearer ") {
        let token = header[7..].trim();
        return (!token.is_empty()).then(|| token.to_owned());
    }

    if header.starts_with(API_KEY_PREFIX) {
        return Some(header.to_owned());
    }

    None
}

/// Mirrors `validateApiKey`. Returns the workspace context of the matching key,
/// or `None` when the key is invalid/expired. `Err(())` only for backend/config
/// failures (the caller maps both `None` and `Err` to 401, like the legacy null).
async fn validate_api_key(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    api_key: &str,
) -> Result<Option<ApiKeyContext>, ()> {
    if !api_key.starts_with(API_KEY_PREFIX) {
        return Ok(None);
    }
    if api_key.len() < KEY_PREFIX_LEN {
        return Ok(None);
    }
    let key_prefix = &api_key[..KEY_PREFIX_LEN];

    let Some(url) = contact_data.rest_url(
        "workspace_api_keys",
        &[
            ("select", "id,ws_id,key_hash,role_id,expires_at".to_owned()),
            ("key_prefix", format!("eq.{key_prefix}")),
            ("or", "(expires_at.is.null,expires_at.gt.now())".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<ApiKeyRow> = response.json().map_err(|_| ())?;

    for row in rows {
        let Some(key_hash) = row.key_hash.as_deref().filter(|h| !h.is_empty()) else {
            continue;
        };

        if !verify_api_key_hash(api_key, key_hash) {
            continue;
        }

        // Defensive expiry recheck (the REST filter already excludes expired rows,
        // but the legacy code rechecks against `now()` in JS).
        if let Some(expires_at) = row.expires_at.as_deref()
            && let Some(expires_ms) = iso8601_to_millis(expires_at)
            && expires_ms < now_millis()
        {
            return Ok(None);
        }

        let Some(ws_id) = row.ws_id.filter(|id| !id.trim().is_empty()) else {
            return Ok(None);
        };

        return Ok(Some(ApiKeyContext {
            ws_id,
            role_id: row.role_id.filter(|id| !id.trim().is_empty()),
        }));
    }

    Ok(None)
}

/// Union of role permissions (when `role_id` is set, enabled) and workspace
/// default permissions (`member_type = MEMBER`, enabled).
async fn resolve_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: Option<&str>,
) -> Result<Vec<String>, ()> {
    let mut permissions: Vec<String> = Vec::new();

    if let Some(role_id) = role_id {
        permissions.extend(role_permissions(contact_data, outbound, ws_id, role_id).await?);
    }

    for permission in default_permissions(contact_data, outbound, ws_id).await? {
        if !permissions.contains(&permission) {
            permissions.push(permission);
        }
    }

    Ok(permissions)
}

async fn role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("role_id", format!("eq.{role_id}")),
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

async fn default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", "eq.MEMBER".to_owned()),
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

/// Verifies a raw key against a stored `salt:hex` hash using scrypt with Node's
/// default parameters (N=16384, r=8, p=1, dkLen=64), constant-time comparison.
fn verify_api_key_hash(key: &str, stored_hash: &str) -> bool {
    #[cfg(test)]
    if let Some(expected) = stored_hash.strip_prefix("test-plain:") {
        return constant_time_eq(key.as_bytes(), expected.as_bytes());
    }

    let mut parts = stored_hash.splitn(2, ':');
    let (Some(salt), Some(expected_hex)) = (parts.next(), parts.next()) else {
        return false;
    };
    if salt.is_empty() || expected_hex.is_empty() {
        return false;
    }

    let Some(expected) = hex_decode(expected_hex) else {
        return false;
    };

    // Node passes the salt as the utf-8 hex string itself (not decoded bytes).
    let Some(derived) = scrypt(key.as_bytes(), salt.as_bytes(), 16384, 8, 1, expected.len()) else {
        return false;
    };

    constant_time_eq(&derived, &expected)
}

// ---------------------------------------------------------------------------
// Outbound helpers.
// ---------------------------------------------------------------------------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
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

fn error_response(status: u16, error: &str, message: &str, code: Option<&str>) -> BackendResponse {
    let body = match code {
        Some(code) => json!({ "error": error, "message": message, "code": code }),
        None => json!({ "error": error, "message": message }),
    };
    no_store_response(json_response(status, body))
}

// ---------------------------------------------------------------------------
// Time helpers (copied file-local from storage_analytics.rs).
// ---------------------------------------------------------------------------

fn now_millis() -> i64 {
    #[cfg(feature = "native")]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
    #[cfg(not(feature = "native"))]
    {
        // The REST `expires_at.gt.now()` filter already excludes expired rows;
        // without a wall clock here we skip the defensive recheck (return 0 so
        // the comparison `expires_ms < 0` is never true).
        0
    }
}

/// Minimal ISO-8601 (`YYYY-MM-DDTHH:MM:SS[.fff][Z|+hh:mm]`) to epoch millis.
/// Returns `None` on parse failure (defensive recheck simply skips).
fn iso8601_to_millis(value: &str) -> Option<i64> {
    let bytes = value.trim().as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let year = parse_uint(&bytes[0..4])? as i64;
    if bytes[4] != b'-' {
        return None;
    }
    let month = parse_uint(&bytes[5..7])? as i64;
    if bytes[7] != b'-' {
        return None;
    }
    let day = parse_uint(&bytes[8..10])? as i64;
    if bytes[10] != b'T' && bytes[10] != b' ' {
        return None;
    }
    let hour = parse_uint(&bytes[11..13])? as i64;
    if bytes[13] != b':' {
        return None;
    }
    let minute = parse_uint(&bytes[14..16])? as i64;
    if bytes[16] != b':' {
        return None;
    }
    let second = parse_uint(&bytes[17..19])? as i64;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    // Days since Unix epoch (1970-01-01), proleptic Gregorian.
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    let jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    let days_since_epoch = jdn - 2440588;

    let millis = (days_since_epoch * 86400 + hour * 3600 + minute * 60 + second) * 1000;
    Some(millis)
}

fn parse_uint(bytes: &[u8]) -> Option<u64> {
    if bytes.is_empty() {
        return None;
    }
    let mut acc: u64 = 0;
    for &b in bytes {
        if !b.is_ascii_digit() {
            return None;
        }
        acc = acc.checked_mul(10)?.checked_add((b - b'0') as u64)?;
    }
    Some(acc)
}

// ---------------------------------------------------------------------------
// Hex (copied file-local from storage_analytics.rs).
// ---------------------------------------------------------------------------

fn hex_decode(input: &str) -> Option<Vec<u8>> {
    if !input.len().is_multiple_of(2) {
        return None;
    }
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i < bytes.len() {
        let hi = hex_val(bytes[i])?;
        let lo = hex_val(bytes[i + 1])?;
        out.push((hi << 4) | lo);
        i += 2;
    }
    Some(out)
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// scrypt (RFC 7914) — copied file-local from storage_analytics.rs.
//
// Implements scrypt(password, salt, N, r, p, dk_len) exactly as Node's
// crypto.scrypt does with default parameters. Used only to verify already-issued
// API key hashes; no new external dependency is required.
// ---------------------------------------------------------------------------

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn scrypt(password: &[u8], salt: &[u8], n: u32, r: u32, p: u32, dk_len: usize) -> Option<Vec<u8>> {
    // Parameter sanity (RFC 7914): N must be a power of two > 1.
    if n < 2 || (n & (n - 1)) != 0 {
        return None;
    }
    if r == 0 || p == 0 || dk_len == 0 {
        return None;
    }

    let block_len = 128usize.checked_mul(r as usize)?;
    let b_len = block_len.checked_mul(p as usize)?;

    // B = PBKDF2-HMAC-SHA256(password, salt, 1, p * 128 * r)
    let mut b = pbkdf2_hmac_sha256(password, salt, 1, b_len);

    // Scratch buffers reused across blocks.
    let words_per_block = block_len / 4; // 32 * r
    let mut v = vec![0u32; words_per_block * (n as usize)];
    let mut xy = vec![0u32; words_per_block * 2];

    for i in 0..(p as usize) {
        let off = i * block_len;
        let mut block_words = bytes_to_words_le(&b[off..off + block_len]);
        romix(&mut block_words, r as usize, n as usize, &mut v, &mut xy);
        words_to_bytes_le(&block_words, &mut b[off..off + block_len]);
    }

    // DK = PBKDF2-HMAC-SHA256(password, B, 1, dk_len)
    Some(pbkdf2_hmac_sha256(password, &b, 1, dk_len))
}

fn romix(block: &mut [u32], r: usize, n: usize, v: &mut [u32], xy: &mut [u32]) {
    let block_words = 32 * r;
    // X starts as the input block.
    xy[..block_words].copy_from_slice(&block[..block_words]);

    for i in 0..n {
        let v_off = i * block_words;
        v[v_off..v_off + block_words].copy_from_slice(&xy[..block_words]);
        block_mix(xy, r);
    }

    for _ in 0..n {
        // j = Integerify(X) mod N — last 64-byte (16-word) sub-block, low word.
        let j = (xy[(2 * r - 1) * 16] as usize) & (n - 1);
        let v_off = j * block_words;
        for k in 0..block_words {
            xy[k] ^= v[v_off + k];
        }
        block_mix(xy, r);
    }

    block[..block_words].copy_from_slice(&xy[..block_words]);
}

/// BlockMix using Salsa20/8. Operates in-place on `xy`, where the first
/// `32*r` words are the input/output X and the second `32*r` words are scratch Y.
fn block_mix(xy: &mut [u32], r: usize) {
    let block_words = 32 * r;
    let mut x = [0u32; 16];
    // X = B[2r-1]
    x.copy_from_slice(&xy[(2 * r - 1) * 16..(2 * r - 1) * 16 + 16]);

    for i in 0..(2 * r) {
        let bi = &xy[i * 16..i * 16 + 16];
        for k in 0..16 {
            x[k] ^= bi[k];
        }
        salsa20_8(&mut x);
        // Y[i] = X
        let y_off = block_words + i * 16;
        xy[y_off..y_off + 16].copy_from_slice(&x);
    }

    // B' = (Y[0], Y[2], ..., Y[2r-2], Y[1], Y[3], ..., Y[2r-1])
    for i in 0..r {
        let src = block_words + (i * 2) * 16;
        let dst = i * 16;
        let (front, back) = xy.split_at_mut(block_words);
        front[dst..dst + 16].copy_from_slice(&back[src - block_words..src - block_words + 16]);
    }
    for i in 0..r {
        let src = block_words + (i * 2 + 1) * 16;
        let dst = (r + i) * 16;
        let (front, back) = xy.split_at_mut(block_words);
        front[dst..dst + 16].copy_from_slice(&back[src - block_words..src - block_words + 16]);
    }
}

fn salsa20_8(b: &mut [u32; 16]) {
    let mut x = *b;
    for _ in 0..4 {
        // column rounds
        x[4] ^= x[0].wrapping_add(x[12]).rotate_left(7);
        x[8] ^= x[4].wrapping_add(x[0]).rotate_left(9);
        x[12] ^= x[8].wrapping_add(x[4]).rotate_left(13);
        x[0] ^= x[12].wrapping_add(x[8]).rotate_left(18);

        x[9] ^= x[5].wrapping_add(x[1]).rotate_left(7);
        x[13] ^= x[9].wrapping_add(x[5]).rotate_left(9);
        x[1] ^= x[13].wrapping_add(x[9]).rotate_left(13);
        x[5] ^= x[1].wrapping_add(x[13]).rotate_left(18);

        x[14] ^= x[10].wrapping_add(x[6]).rotate_left(7);
        x[2] ^= x[14].wrapping_add(x[10]).rotate_left(9);
        x[6] ^= x[2].wrapping_add(x[14]).rotate_left(13);
        x[10] ^= x[6].wrapping_add(x[2]).rotate_left(18);

        x[3] ^= x[15].wrapping_add(x[11]).rotate_left(7);
        x[7] ^= x[3].wrapping_add(x[15]).rotate_left(9);
        x[11] ^= x[7].wrapping_add(x[3]).rotate_left(13);
        x[15] ^= x[11].wrapping_add(x[7]).rotate_left(18);

        // row rounds
        x[1] ^= x[0].wrapping_add(x[3]).rotate_left(7);
        x[2] ^= x[1].wrapping_add(x[0]).rotate_left(9);
        x[3] ^= x[2].wrapping_add(x[1]).rotate_left(13);
        x[0] ^= x[3].wrapping_add(x[2]).rotate_left(18);

        x[6] ^= x[5].wrapping_add(x[4]).rotate_left(7);
        x[7] ^= x[6].wrapping_add(x[5]).rotate_left(9);
        x[4] ^= x[7].wrapping_add(x[6]).rotate_left(13);
        x[5] ^= x[4].wrapping_add(x[7]).rotate_left(18);

        x[11] ^= x[10].wrapping_add(x[9]).rotate_left(7);
        x[8] ^= x[11].wrapping_add(x[10]).rotate_left(9);
        x[9] ^= x[8].wrapping_add(x[11]).rotate_left(13);
        x[10] ^= x[9].wrapping_add(x[8]).rotate_left(18);

        x[12] ^= x[15].wrapping_add(x[14]).rotate_left(7);
        x[13] ^= x[12].wrapping_add(x[15]).rotate_left(9);
        x[14] ^= x[13].wrapping_add(x[12]).rotate_left(13);
        x[15] ^= x[14].wrapping_add(x[13]).rotate_left(18);
    }
    for i in 0..16 {
        b[i] = b[i].wrapping_add(x[i]);
    }
}

fn bytes_to_words_le(bytes: &[u8]) -> Vec<u32> {
    bytes
        .chunks_exact(4)
        .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn words_to_bytes_le(words: &[u32], out: &mut [u8]) {
    for (i, w) in words.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&w.to_le_bytes());
    }
}

// ---------------------------------------------------------------------------
// PBKDF2-HMAC-SHA256 (copied file-local from storage_analytics.rs).
// ---------------------------------------------------------------------------

fn pbkdf2_hmac_sha256(password: &[u8], salt: &[u8], iterations: u32, dk_len: usize) -> Vec<u8> {
    const HASH_LEN: usize = 32;
    let blocks = dk_len.div_ceil(HASH_LEN);
    let mut out = Vec::with_capacity(blocks * HASH_LEN);

    for block_index in 1..=blocks as u32 {
        let mut u = hmac_sha256(password, &[salt, &block_index.to_be_bytes()].concat());
        let mut t = u;
        for _ in 1..iterations {
            u = hmac_sha256(password, &u);
            for k in 0..HASH_LEN {
                t[k] ^= u[k];
            }
        }
        out.extend_from_slice(&t);
    }

    out.truncate(dk_len);
    out
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut mac =
        <HmacSha256 as KeyInit>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    let bytes = mac.finalize().into_bytes();
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    out
}
