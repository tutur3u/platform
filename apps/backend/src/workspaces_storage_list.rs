use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Route shape: GET /api/v1/workspaces/:wsId/storage/list
// Legacy: apps/web/src/app/api/v1/workspaces/[wsId]/storage/list/route.ts
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/storage/list";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INVALID_PATH_MESSAGE: &str = "Invalid path";
const INVALID_QUERY_PARAMS_MESSAGE: &str = "Invalid query params";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// App-session targets accepted by resolveWorkspaceStorageRouteAuth for this
// route (FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS).
const STORAGE_LIST_APP_SESSION_TARGETS: [&str; 2] = ["drive", "finance"];

// Permission gate from the legacy route: `!permissions.withoutPermission('manage_drive')`.
const MANAGE_DRIVE_PERMISSION: &str = "manage_drive";
const ADMIN_PERMISSION: &str = "admin";

const GET_WALLET_TRANSACTIONS_RPC: &str = "get_wallet_transactions_with_permissions";

const STORAGE_BUCKET: &str = "workspaces";
const STORAGE_LIST_PAGE_SIZE: u32 = 1000;
const EMPTY_FOLDER_PLACEHOLDER_NAME: &str = ".emptyFolderPlaceholder";

// Reserved mobile-deployment drive prefix (mobile-deployment/storage-policy.ts /
// constants.ts). Mirrors MOBILE_DEPLOYMENT_DRIVE_PREFIX.
const MOBILE_DEPLOYMENT_DRIVE_PREFIX: &str = ".tuturuuu/mobile-deployment-vault";
const RESERVED_FOLDER_ENTRY_NAME: &str = ".tuturuuu";

// Zod query-schema bounds (constants.ts).
const MAX_MEDIUM_TEXT_LENGTH: usize = 1000; // path
const MAX_SEARCH_LENGTH: usize = 500; // search
const MAX_SHORT_TEXT_LENGTH: i64 = 100; // limit max
const DEFAULT_LIMIT: i64 = 50;
const DEFAULT_OFFSET: i64 = 0;

// ---------------------------------------------------------------------------
// Authenticated user (mirrors workspaces_storage_object.rs).
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

// ---------------------------------------------------------------------------
// Parsed query params.
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
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<RolePermissionRow>,
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
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_storage_list_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = list_ws_id(request.path)?;

    Some(match request.method {
        "GET" => list_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

fn list_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    // resolveWorkspaceStorageRouteAuth -> resolveSessionAuthContext.
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // normalizeWorkspaceId(wsId, supabase).
    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user).await {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // getPermissions(...). null -> 401 Unauthorized (route-auth behavior).
    let access =
        match workspace_permissions(contact_data, outbound, &normalized_ws_id, &user.id).await {
            Ok(access) => access,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };
    let Some(access) = access else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Parse query params (zod listQuerySchema).
    let parsed = match parse_list_query(request.url) {
        Ok(parsed) => parsed,
        Err(errors) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_PARAMS_MESSAGE, "errors": errors }),
            ));
        }
    };

    // sanitizePath(path).
    let Some(sanitized_path) = sanitize_path(&parsed.path) else {
        return message_response(400, INVALID_PATH_MESSAGE);
    };

    // isReservedMobileDeploymentDrivePath -> 403 Forbidden.
    if !sanitized_path.is_empty()
        && is_reserved_mobile_deployment_drive_path(&normalized_ws_id, &sanitized_path)
    {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // canListStorage:
    //   !permissions.withoutPermission('manage_drive')  (== containsPermission)
    //   || canAccessFinanceTransactionStoragePath({ access: 'read', ... })
    let can_list = if access.contains(MANAGE_DRIVE_PERMISSION) {
        true
    } else {
        match can_access_finance_transaction_storage_path(
            contact_data,
            outbound,
            &normalized_ws_id,
            &sanitized_path,
            &user,
        )
        .await
        {
            Ok(can) => can,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    };

    if !can_list {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // listWorkspaceStorageDirectory(normalizedWsId, { path, search, limit, offset, sortBy, sortOrder }).
    //
    // NOTE: When the workspace's active drive provider is a fully-configured R2
    // backend, the legacy code lists via S3 ListObjectsV2 (SigV4-signed). That
    // signing path is not implemented in the Workers backend, so we always use
    // the Supabase Storage list API (the default provider). For Supabase-backed
    // workspaces (the default) this is an exact match; R2-backed workspaces will
    // list the Supabase bucket instead. See notes / integrator verification.
    let result = match list_supabase_directory(
        contact_data,
        outbound,
        &normalized_ws_id,
        &sanitized_path,
        &parsed,
    )
    .await
    {
        Ok(result) => result,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": result.data,
            "pagination": {
                "limit": parsed.limit,
                "offset": parsed.offset,
                "total": result.total,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// Auth (resolveSessionAuthContext, app-session + supabase token).
// Mirrors workspaces_storage_object.rs::authenticated_user.
// ---------------------------------------------------------------------------

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) = contact::resolve_app_session_identity(
            config,
            request,
            &STORAGE_LIST_APP_SESSION_TARGETS,
        ) && let Some(id) = non_empty(identity.id)
        {
            return Some(AuthenticatedUser {
                access_token: None,
                id,
            });
        }

        if let Ok(identity) = contact::resolve_cli_app_session_identity(config, request)
            && let Some(id) = non_empty(identity.id)
        {
            return Some(AuthenticatedUser {
                access_token: None,
                id,
            });
        }
    }

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty(user.id?)?;

    Some(AuthenticatedUser {
        access_token: Some(access_token),
        id,
    })
}

// ---------------------------------------------------------------------------
// Query parsing (zod listQuerySchema).
// ---------------------------------------------------------------------------

fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, Vec<Value>> {
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

    let mut errors: Vec<Value> = Vec::new();

    // path: string().max(MAX_MEDIUM_TEXT_LENGTH).optional().default('')
    let path_value = path.unwrap_or_default();
    if path_value.chars().count() > MAX_MEDIUM_TEXT_LENGTH {
        errors.push(too_big_issue("path", MAX_MEDIUM_TEXT_LENGTH));
    }

    // search: string().max(MAX_SEARCH_LENGTH).optional()
    if let Some(ref search_value) = search
        && search_value.chars().count() > MAX_SEARCH_LENGTH
    {
        errors.push(too_big_issue("search", MAX_SEARCH_LENGTH));
    }

    // limit: coerce.number().int().min(1).max(MAX_SHORT_TEXT_LENGTH).default(50)
    let limit_value = match limit {
        Some(raw) => match coerce_int(&raw) {
            Some(value) => value,
            None => {
                errors.push(invalid_type_issue("limit"));
                DEFAULT_LIMIT
            }
        },
        None => DEFAULT_LIMIT,
    };
    if limit_value < 1 {
        errors.push(too_small_issue("limit", 1));
    } else if limit_value > MAX_SHORT_TEXT_LENGTH {
        errors.push(too_big_number_issue("limit", MAX_SHORT_TEXT_LENGTH));
    }

    // offset: coerce.number().int().min(0).default(0)
    let offset_value = match offset {
        Some(raw) => match coerce_int(&raw) {
            Some(value) => value,
            None => {
                errors.push(invalid_type_issue("offset"));
                DEFAULT_OFFSET
            }
        },
        None => DEFAULT_OFFSET,
    };
    if offset_value < 0 {
        errors.push(too_small_issue("offset", 0));
    }

    // sortBy: enum(['name','created_at','updated_at','size']).default('name')
    let sort_by_value = sort_by.unwrap_or_else(|| "name".to_owned());
    if !matches!(
        sort_by_value.as_str(),
        "name" | "created_at" | "updated_at" | "size"
    ) {
        errors.push(invalid_enum_issue(
            "sortBy",
            &["name", "created_at", "updated_at", "size"],
        ));
    }

    // sortOrder: enum(['asc','desc']).default('asc')
    let sort_order_value = sort_order.unwrap_or_else(|| "asc".to_owned());
    if !matches!(sort_order_value.as_str(), "asc" | "desc") {
        errors.push(invalid_enum_issue("sortOrder", &["asc", "desc"]));
    }

    if !errors.is_empty() {
        return Err(errors);
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
/// then require it to be a non-fractional integer.
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

fn too_big_issue(path: &str, maximum: usize) -> Value {
    json!({
        "code": "too_big",
        "maximum": maximum,
        "type": "string",
        "inclusive": true,
        "path": [path],
        "message": format!("String must contain at most {maximum} character(s)"),
    })
}

fn too_big_number_issue(path: &str, maximum: i64) -> Value {
    json!({
        "code": "too_big",
        "maximum": maximum,
        "type": "number",
        "inclusive": true,
        "path": [path],
        "message": format!("Number must be less than or equal to {maximum}"),
    })
}

fn too_small_issue(path: &str, minimum: i64) -> Value {
    json!({
        "code": "too_small",
        "minimum": minimum,
        "type": "number",
        "inclusive": true,
        "path": [path],
        "message": format!("Number must be greater than or equal to {minimum}"),
    })
}

fn invalid_type_issue(path: &str) -> Value {
    json!({
        "code": "invalid_type",
        "expected": "number",
        "received": "nan",
        "path": [path],
        "message": "Expected number, received nan",
    })
}

fn invalid_enum_issue(path: &str, options: &[&str]) -> Value {
    json!({
        "code": "invalid_enum_value",
        "options": options,
        "path": [path],
        "message": format!("Invalid enum value. Expected {}", options
            .iter()
            .map(|option| format!("'{option}'"))
            .collect::<Vec<_>>()
            .join(" | ")),
    })
}

// ---------------------------------------------------------------------------
// Finance transaction storage access (canAccessFinanceTransactionStoragePath, read).
// Mirrors workspaces_storage_object.rs.
// ---------------------------------------------------------------------------

async fn can_access_finance_transaction_storage_path(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    sanitized_path: &str,
    user: &AuthenticatedUser,
) -> Result<bool, ()> {
    let Some(transaction_id) = finance_transaction_id_from_storage_path(sanitized_path) else {
        return Ok(false);
    };

    let rpc_url = contact_data
        .rpc_url(GET_WALLET_TRANSACTIONS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({
        "p_ws_id": ws_id,
        "p_user_id": user.id,
        "p_transaction_ids": [transaction_id],
        "p_limit": 1,
    })
    .to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // Legacy: `return !error && (data?.length ?? 0) > 0;`
    if !is_success(response.status) {
        return Ok(false);
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

fn finance_transaction_id_from_storage_path(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.first() == Some(&"finance")
        && segments.get(1) == Some(&"transactions")
        && segments.get(2).is_some_and(|id| !id.is_empty())
    {
        segments.get(2).copied()
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Supabase Storage list (listWorkspaceStorageDirectory, supabase provider).
// ---------------------------------------------------------------------------

struct ListResult {
    data: Vec<Value>,
    total: i64,
}

async fn list_supabase_directory(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    relative_path: &str,
    query: &ListQuery,
) -> Result<ListResult, ()> {
    // buildWorkspaceStorageKey(wsId, relativePath).
    let storage_path = if relative_path.is_empty() {
        ws_id.to_owned()
    } else {
        format!("{ws_id}/{relative_path}")
    };

    // search: options.search?.trim() || undefined
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let entries = storage_list_single_page(
        contact_data,
        outbound,
        &storage_path,
        query.limit,
        query.offset,
        &query.sort_by,
        &query.sort_order,
        search,
    )
    .await?;

    // Filter out `.emptyFolderPlaceholder` entries, then
    // filterReservedMobileDeploymentDriveEntries.
    let data = filter_reserved_mobile_deployment_drive_entries(
        ws_id,
        relative_path,
        entries
            .into_iter()
            .filter(|entry| entry.name() != Some(EMPTY_FOLDER_PLACEHOLDER_NAME))
            .collect(),
    );

    // total = relativePath ? countSupabaseDirectoryEntries(...) : filtered.length
    let total = if relative_path.is_empty() {
        data.len() as i64
    } else {
        count_supabase_directory_entries(contact_data, outbound, &storage_path, search).await?
    };

    Ok(ListResult {
        data: data.into_iter().map(|entry| entry.raw).collect(),
        total,
    })
}

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

/// countSupabaseDirectoryEntries: page through the directory in pages of
/// SUPABASE_STORAGE_LIST_PAGE_SIZE counting non-placeholder entries.
async fn count_supabase_directory_entries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_path: &str,
    search: Option<&str>,
) -> Result<i64, ()> {
    let mut offset: i64 = 0;
    let mut total: i64 = 0;

    loop {
        let entries = storage_list_single_page(
            contact_data,
            outbound,
            storage_path,
            STORAGE_LIST_PAGE_SIZE as i64,
            offset,
            "name",
            "asc",
            search,
        )
        .await?;

        let page_len = entries.len();
        total += entries
            .iter()
            .filter(|entry| entry.name() != Some(EMPTY_FOLDER_PLACEHOLDER_NAME))
            .count() as i64;

        if (page_len as u32) < STORAGE_LIST_PAGE_SIZE {
            return Ok(total);
        }

        offset += page_len as i64;
    }
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
// Reserved mobile-deployment drive filtering (mobile-deployment/storage-policy.ts).
// ---------------------------------------------------------------------------

/// Mirror of `isReservedMobileDeploymentDrivePath`. `sanitized_path` is already
/// the result of sanitizePath in the caller; re-sanitizing it never returns None.
fn is_reserved_mobile_deployment_drive_path(ws_id: &str, sanitized_path: &str) -> bool {
    if resolve_workspace_id(ws_id) != ROOT_WORKSPACE_ID {
        return false;
    }

    let Some(normalized) = sanitize_path(sanitized_path) else {
        return false;
    };

    normalized == MOBILE_DEPLOYMENT_DRIVE_PREFIX
        || normalized.starts_with(&format!("{MOBILE_DEPLOYMENT_DRIVE_PREFIX}/"))
        || (!normalized.is_empty()
            && MOBILE_DEPLOYMENT_DRIVE_PREFIX.starts_with(&format!("{normalized}/")))
}

/// Mirror of `filterReservedMobileDeploymentDriveEntries`: only at the root of a
/// ROOT workspace (empty path), drop the reserved `.tuturuuu` entry.
fn filter_reserved_mobile_deployment_drive_entries(
    ws_id: &str,
    path: &str,
    entries: Vec<StorageListEntry>,
) -> Vec<StorageListEntry> {
    let Some(normalized) = sanitize_path(path) else {
        // normalizeRelativePath(path) === null -> entries returned unchanged.
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

// ---------------------------------------------------------------------------
// Workspace identifier normalization (normalizeWorkspaceId).
// Mirrors workspaces_storage_object.rs.
// ---------------------------------------------------------------------------

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user)
            .await
            .map(|id| id.unwrap_or(resolved_ws_id));
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
        {
            return Ok(workspace_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_get(contact_data, outbound, &url, &auth).await?;

    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
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
    let response = send_rest_get(contact_data, outbound, &url, auth).await?;

    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Permission resolution (getPermissions / containsPermission).
// Returns Ok(None) when getPermissions returns null.
// Mirrors workspaces_storage_analytics.rs::workspace_permissions.
// ---------------------------------------------------------------------------

struct WorkspaceAccess {
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

async fn workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<WorkspaceAccess>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, workspace_id, user_id).await?
    else {
        return Ok(None);
    };

    let Some(creator_id) = workspace_creator_id(contact_data, outbound, workspace_id).await? else {
        return Ok(None);
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;
    if is_creator {
        return Ok(Some(WorkspaceAccess {
            all: true,
            permissions: Vec::new(),
        }));
    }

    let mut permissions = Vec::new();
    if membership_type == "MEMBER" {
        permissions.extend(role_permissions(contact_data, outbound, workspace_id, user_id).await?);
    }
    permissions
        .extend(default_permissions(contact_data, outbound, workspace_id, &membership_type).await?);

    if permissions.is_empty() {
        return Ok(None);
    }

    let all = permissions.iter().any(|value| value == ADMIN_PERMISSION);
    Ok(Some(WorkspaceAccess { all, permissions }))
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
    let response = send_rest_get(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?.and_then(|row| row.membership_type))
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
    let response = send_rest_get(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(decode_first_row::<WorkspaceCreatorRow>(&response)?.and_then(|row| row.creator_id))
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
    let response = send_rest_get(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;
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
    let response = send_rest_get(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;
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

// ---------------------------------------------------------------------------
// Shared identifier helpers.
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

async fn send_rest_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

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

fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
