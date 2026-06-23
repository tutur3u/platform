//! Handler for `GET /api/v1/storage/analytics`.
//!
//! Ported from `apps/web/src/app/api/v1/storage/analytics/route.ts`.
//!
//! Auth model: external SDK **workspace API key** (`Authorization: Bearer ttr_...`),
//! via `withApiAuth(..., { permissions: ['manage_drive'] })`. This is NOT Supabase
//! user auth. The legacy `validateApiKey` (`packages/auth/src/api-keys.ts`) flow:
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
//! On success it returns `getWorkspaceStorageOverview(wsId)` reduced to:
//!   { data: { totalSize, fileCount, storageLimit, usagePercentage, largestFile,
//!     smallestFile } }
//! with `usagePercentage = min(100, round((totalSize/storageLimit)*100 * 100)/100)`
//! when `storageLimit > 0`, else `0`. Status 200.
//!
//! Error shapes (`createErrorResponse(error, message, status, code)`):
//!   - 401 `MISSING_API_KEY` / `INVALID_API_KEY`
//!   - 403 `INSUFFICIENT_PERMISSIONS`
//!   - The legacy `WorkspaceStorageError` path maps storage failures to its own
//!     status with code `STORAGE_PROVIDER_ERROR`; any other failure → 500
//!     `UNEXPECTED_ERROR`. Here a failure computing the overview (storage list
//!     failure) is surfaced as 500 `UNEXPECTED_ERROR`, matching the catch-all.
//!
//! Storage overview fidelity: `getWorkspaceStorageOverview` honors the workspace
//! storage provider (Supabase vs Cloudflare R2). The Supabase path walks the
//! Storage list API and is reproduced faithfully here (identical to
//! `workspaces_storage_rollout_state`'s supabase overview). The R2 path lists the
//! bucket via S3 ListObjectsV2 (SigV4), which this module does NOT implement; for
//! R2-configured workspaces the totals would differ. See the structured `notes`.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, constant_time_eq, contact,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const STORAGE_ANALYTICS_PATH: &str = "/api/v1/storage/analytics";

const API_KEY_PREFIX: &str = "ttr_";
const KEY_PREFIX_LEN: usize = 12;

const MANAGE_DRIVE_PERMISSION: &str = "manage_drive";
const ADMIN_PERMISSION: &str = "admin";

const STORAGE_BUCKET: &str = "workspaces";
const STORAGE_LIST_PAGE_SIZE: u32 = 1000;
const STORAGE_LIMIT_FALLBACK_BYTES: i64 = 104857600;
const EMPTY_FOLDER_PLACEHOLDER_NAME: &str = ".emptyFolderPlaceholder";
const STORAGE_LIMIT_RPC: &str = "get_workspace_storage_limit";

// ---------------------------------------------------------------------------
// Response shape (mirrors the legacy `NextResponse.json({ data: {...} })`).
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
    largest_file: Option<StorageFileRecord>,
    smallest_file: Option<StorageFileRecord>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageFileRecord {
    name: String,
    size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
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

pub(crate) async fn handle_storage_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != STORAGE_ANALYTICS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => storage_analytics_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn storage_analytics_response(
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
        // by the middleware as a 401 `INVALID_API_KEY`. Mirror that so transient
        // backend failures do not leak as 5xx during authentication.
        Ok(None) | Err(()) => {
            return error_response(
                401,
                "Unauthorized",
                "Invalid or expired API key",
                Some("INVALID_API_KEY"),
            );
        }
    };

    // 3. Permission gate: hasAnyPermission(['manage_drive']) (admin is a wildcard).
    let permissions = match resolve_permissions(
        contact_data,
        outbound,
        &context.ws_id,
        context.role_id.as_deref(),
    )
    .await
    {
        Ok(permissions) => permissions,
        // The legacy permission fetch ignores errors (defaults to empty), which
        // collapses to INSUFFICIENT_PERMISSIONS. Preserve that fail-closed shape.
        Err(()) => Vec::new(),
    };
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

    // 4. Compute the storage overview (getWorkspaceStorageOverview, Supabase path).
    let storage_limit = storage_limit(contact_data, outbound, &context.ws_id).await;
    let overview = match supabase_overview(contact_data, outbound, &context.ws_id).await {
        Ok(overview) => overview,
        Err(()) => {
            return error_response(
                500,
                "Internal Server Error",
                "An unexpected error occurred",
                Some("UNEXPECTED_ERROR"),
            );
        }
    };

    let usage_percentage = usage_percentage(overview.total_size, storage_limit);

    no_store_response(json_response(
        200,
        AnalyticsEnvelope {
            data: AnalyticsData {
                total_size: overview.total_size,
                file_count: overview.file_count,
                storage_limit,
                usage_percentage,
                largest_file: overview.largest_file,
                smallest_file: overview.smallest_file,
            },
        },
    ))
}

/// `usagePercentage`: 0 when `storageLimit <= 0`, else
/// `min(100, round((totalSize / storageLimit) * 100 * 100) / 100)`.
fn usage_percentage(total_size: i64, storage_limit: i64) -> f64 {
    if storage_limit <= 0 {
        return 0.0;
    }
    let raw = (total_size as f64 / storage_limit as f64) * 100.0;
    // Round to 2 decimal places (matching JS `Math.round(raw * 100) / 100`), clamp.
    let rounded = (raw * 100.0).round() / 100.0;
    rounded.min(100.0)
}

// ---------------------------------------------------------------------------
// API key validation + permission resolution (validateApiKey).
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
        if let Some(expires_at) = row.expires_at.as_deref() {
            if let Some(expires_ms) = iso8601_to_millis(expires_at) {
                if expires_ms < now_millis() {
                    return Ok(None);
                }
            }
        }

        let Some(ws_id) = row.ws_id.filter(|id| !id.trim().is_empty()) else {
            // A matching key with no ws_id is unusable; treat as invalid.
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
/// default permissions (`member_type = MEMBER`, enabled). Mirrors the permission
/// assembly in `validateApiKey`.
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
// Storage limit RPC (get_workspace_storage_limit, service role).
// ---------------------------------------------------------------------------

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
//
// NOTE: this faithfully reproduces the Supabase provider path. The legacy
// `getWorkspaceStorageOverview` instead uses the R2 (S3 ListObjectsV2) path when
// the workspace selected the R2 provider; that listing is not implemented here.
// It also skips reserved mobile-deployment vault paths. The reserved-path filter
// (`isReservedMobileDeploymentDrivePath`) is NOT applied here (parity with the
// rollout-state port); see structured notes.
// ---------------------------------------------------------------------------

struct StorageOverview {
    total_size: i64,
    file_count: i64,
    largest_file: Option<StorageFileRecord>,
    smallest_file: Option<StorageFileRecord>,
}

async fn supabase_overview(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
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
        total_size,
        file_count,
        largest_file,
        smallest_file,
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
// Time helpers (mirrors workspaces_3).
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

    let millis =
        ((days_since_epoch * 86400 + hour * 3600 + minute * 60 + second) * 1000).max(i64::MIN);
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
// Hex
// ---------------------------------------------------------------------------

fn hex_decode(input: &str) -> Option<Vec<u8>> {
    if input.len() % 2 != 0 {
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
// scrypt (RFC 7914) — pure Rust over the available `hmac`/`sha2` crates.
//
// Implements scrypt(password, salt, N, r, p, dk_len) exactly as Node's
// crypto.scrypt does with default parameters. Used only to verify already-issued
// API key hashes; no new external dependency is required. Mirrors workspaces_3.
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
// PBKDF2-HMAC-SHA256
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
