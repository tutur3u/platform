//! Handler for `GET /api/v1/storage/download/*path`.
//!
//! Ported from `apps/web/src/app/api/v1/storage/download/[...path]/route.ts`.
//!
//! Auth model: external SDK **workspace API key** (`Authorization: Bearer ttr_...`)
//! via `withApiAuth(..., { permissions: ['manage_drive'] })`. This is NOT Supabase
//! user auth, and the workspace id (`wsId`) is derived from the API key context
//! (`workspace_api_keys.ws_id`), NOT from the request URL. The dynamic `*path`
//! catch-all segments are the file path *within* the workspace bucket; the storage
//! object key is `<wsId>/<sanitizedPath>`.
//!
//! The API-key validation + permission resolution mirrors `storage_analytics.rs`
//! (same `withApiAuth(['manage_drive'])` model): extract `ttr_` key, fetch
//! candidate `workspace_api_keys` rows by `key_prefix`, scrypt-verify `key_hash`,
//! recheck expiry, then require `hasAnyPermission(['manage_drive'])` (the `admin`
//! permission is a wildcard) from the union of role + default permissions.
//!
//! Legacy success path: downloads `workspaces/<wsId>/<path>` from Supabase Storage
//! (optionally with an image transform) and streams the **binary file** back with
//! `Content-Type` from the object metadata and
//! `Content-Disposition: attachment; filename="<basename>"`.
//!
//! IMPORTANT FRAMEWORK LIMITATION (see structured `notes`): the backend
//! `BackendResponse`/`OutboundResponse` only carry UTF-8 text bodies and a
//! `&'static str` content type. Genuine binary file streaming and a dynamic
//! per-object MIME type cannot be represented here. This port faithfully
//! reproduces every auth/validation/error path (exact JSON shapes + status codes)
//! and, on success, fetches the object via the service-role Storage download
//! endpoint and returns its body as text with a static
//! `application/octet-stream` content type plus the dynamic `Content-Disposition`
//! header. For non-text (image/PDF/etc.) files the returned bytes are NOT
//! byte-faithful through the text channel — the integrator must verify whether
//! this route should remain in the Next.js app or gain a binary response path in
//! the framework before relying on the success branch.
//!
//! Error shapes (`createErrorResponse(error, message, status, code)`):
//!   - 400 `MISSING_PATH`        — empty path segments
//!   - 400 `INVALID_TRANSFORM`   — bad image transform query params (zod failure)
//!   - 400 `INVALID_PATH`        — `sanitizePath` returns null/empty
//!   - 403 `STORAGE_RESERVED_PATH` — reserved mobile-deployment vault path
//!   - 404 `FILE_NOT_FOUND`      — storage download "not found"
//!   - 500 `STORAGE_DOWNLOAD_ERROR` — other storage download failure
//!   - 500 `UNEXPECTED_ERROR`    — catch-all
//!   - 401 `MISSING_API_KEY` / `INVALID_API_KEY` (from withApiAuth)
//!   - 403 `INSUFFICIENT_PERMISSIONS` (from withApiAuth)

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, constant_time_eq, contact,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    text_response,
};

const STORAGE_DOWNLOAD_PATH_PREFIX: &str = "/api/v1/storage/download/";

const API_KEY_PREFIX: &str = "ttr_";
const KEY_PREFIX_LEN: usize = 12;

const MANAGE_DRIVE_PERMISSION: &str = "manage_drive";
const ADMIN_PERMISSION: &str = "admin";

const STORAGE_BUCKET: &str = "workspaces";
const OCTET_STREAM: &str = "application/octet-stream";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const MOBILE_DEPLOYMENT_DRIVE_PREFIX: &str = ".tuturuuu/mobile-deployment-vault";

// ---------------------------------------------------------------------------
// Deserialization rows (mirror storage_analytics).
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

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_storage_download_path_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_path = storage_download_subpath(request.path)?;

    Some(match request.method {
        "GET" => storage_download_response(config, request, raw_path, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn storage_download_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_path: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Extract the API key from the Authorization header (withApiAuth).
    let Some(api_key) = extract_api_key(request.authorization) else {
        return error_response(
            401,
            "Unauthorized",
            "Missing or invalid Authorization header. Expected: \"Authorization: Bearer <api_key>\"",
            Some("MISSING_API_KEY"),
        );
    };

    // 2. Validate the API key, resolving the workspace context (ws_id + role_id).
    let context = match validate_api_key(contact_data, outbound, &api_key).await {
        Ok(Some(context)) => context,
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
    let permissions = resolve_permissions(
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

    // --- Handler body (the legacy try/catch) ---

    // The catch-all `path` must be non-empty (legacy: `!path || path.length === 0`).
    // `storage_download_subpath` already guarantees at least one non-empty segment,
    // but mirror the explicit guard for the case where every segment is empty.
    if path_join(raw_path).is_empty() {
        return error_response(
            400,
            "Bad Request",
            "Missing file path",
            Some("MISSING_PATH"),
        );
    }

    // Parse + validate the image transform query params (zod). A parse failure maps
    // to 400 INVALID_TRANSFORM (the legacy catch for `z.ZodError`).
    let transform = match parse_transform(request.url) {
        TransformResult::None => None,
        TransformResult::Valid(transform) => Some(transform),
        TransformResult::Invalid => {
            return error_response(
                400,
                "Bad Request",
                "Invalid image transform options",
                Some("INVALID_TRANSFORM"),
            );
        }
    };

    // sanitizePath(path.join('/')). `null` or empty (falsy) => 400 INVALID_PATH.
    let Some(file_path) = sanitize_path(&path_join(raw_path)) else {
        return error_response(
            400,
            "Bad Request",
            "Invalid file path",
            Some("INVALID_PATH"),
        );
    };
    if file_path.is_empty() {
        return error_response(
            400,
            "Bad Request",
            "Invalid file path",
            Some("INVALID_PATH"),
        );
    }

    // rejectReservedStoragePath(wsId, filePath).
    if is_reserved_mobile_deployment_drive_path(&context.ws_id, &file_path) {
        return error_response(
            403,
            "Forbidden",
            "Mobile deployment vault files are managed by the mobile deployment API.",
            Some("STORAGE_RESERVED_PATH"),
        );
    }

    // storagePath = posix.join(wsId, filePath); fileName = posix.basename(filePath).
    let storage_path = format!("{}/{}", context.ws_id, file_path);
    let file_name = file_path.rsplit('/').next().unwrap_or("").to_owned();

    // Download from Supabase Storage (service role).
    match download_object(contact_data, outbound, &storage_path, transform.as_ref()).await {
        DownloadOutcome::Ok(body) => {
            // Legacy: NextResponse(blob) with Content-Type from metadata and
            // Content-Disposition attachment. See the module-level note: a dynamic
            // per-object MIME type and binary fidelity are not representable here;
            // we use a static `application/octet-stream` content type.
            let mut response = no_store_response(text_response(200, body, OCTET_STREAM));
            response.headers.push((
                "Content-Disposition",
                format!("attachment; filename=\"{file_name}\""),
            ));
            response
        }
        DownloadOutcome::NotFound => {
            error_response(404, "Not Found", "File not found", Some("FILE_NOT_FOUND"))
        }
        DownloadOutcome::Error => error_response(
            500,
            "Internal Server Error",
            "Failed to download file",
            Some("STORAGE_DOWNLOAD_ERROR"),
        ),
        DownloadOutcome::Unexpected => error_response(
            500,
            "Internal Server Error",
            "An unexpected error occurred",
            Some("UNEXPECTED_ERROR"),
        ),
    }
}

// ---------------------------------------------------------------------------
// Path matching.
// ---------------------------------------------------------------------------

/// Match `/api/v1/storage/download/<...path>` and return the raw remaining path
/// (everything after the prefix). Returns `None` when this route does not match,
/// or when there is no trailing path at all (the catch-all requires >= 1 segment).
fn storage_download_subpath(path: &str) -> Option<&str> {
    let rest = path.strip_prefix(STORAGE_DOWNLOAD_PATH_PREFIX)?;
    // The catch-all requires at least one segment; an entirely empty/slash-only
    // remainder still matches the route (so we can return 400 MISSING_PATH rather
    // than fall through to a 404), but a remainder that has no non-empty segment
    // is handled inside the response via the MISSING_PATH guard.
    Some(rest)
}

/// Join the catch-all segments the way `path.join('/')` would after Next.js splits
/// the matched `*path` on `/` and drops empty segments.
fn path_join(raw_path: &str) -> String {
    raw_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

// ---------------------------------------------------------------------------
// Transform query parsing (mirror of `transformQuerySchema`).
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Transform {
    width: Option<i64>,
    height: Option<i64>,
    resize: Option<String>,
    quality: Option<i64>,
    format: Option<String>,
}

enum TransformResult {
    /// No transform params present at all (`hasTransform === false`).
    None,
    /// Present and valid.
    Valid(Transform),
    /// Present but failed schema validation (zod error -> 400).
    Invalid,
}

/// Mirror the legacy logic:
///   transformInput = { width, height, resize, quality, format } (raw strings)
///   hasTransform = any value !== undefined
///   transform = hasTransform ? transformQuerySchema.parse(transformInput) : undefined
fn parse_transform(url: Option<&str>) -> TransformResult {
    let query = url.and_then(query_string);

    let width = query_param(query, "width");
    let height = query_param(query, "height");
    let resize = query_param(query, "resize");
    let quality = query_param(query, "quality");
    let format = query_param(query, "format");

    let has_transform = width.is_some()
        || height.is_some()
        || resize.is_some()
        || quality.is_some()
        || format.is_some();

    if !has_transform {
        return TransformResult::None;
    }

    // width: int, 1..=2500.
    let width = match parse_bounded_int(width.as_deref(), 1, 2500) {
        Ok(value) => value,
        Err(()) => return TransformResult::Invalid,
    };
    // height: int, 1..=2500.
    let height = match parse_bounded_int(height.as_deref(), 1, 2500) {
        Ok(value) => value,
        Err(()) => return TransformResult::Invalid,
    };
    // resize: enum cover|contain|fill.
    let resize = match resize.as_deref() {
        None => None,
        Some(value) if matches!(value, "cover" | "contain" | "fill") => Some(value.to_owned()),
        Some(_) => return TransformResult::Invalid,
    };
    // quality: int, 20..=100.
    let quality = match parse_bounded_int(quality.as_deref(), 20, 100) {
        Ok(value) => value,
        Err(()) => return TransformResult::Invalid,
    };
    // format: literal 'origin'.
    let format = match format.as_deref() {
        None => None,
        Some("origin") => Some("origin".to_owned()),
        Some(_) => return TransformResult::Invalid,
    };

    // refine: must include width or height.
    if width.is_none() && height.is_none() {
        return TransformResult::Invalid;
    }

    TransformResult::Valid(Transform {
        width,
        height,
        resize,
        quality,
        format,
    })
}

/// Parse an optional `z.coerce.number().int().min(min).max(max).finite()` field.
/// `None` input => `Ok(None)`. Invalid / out of range => `Err(())`.
fn parse_bounded_int(value: Option<&str>, min: i64, max: i64) -> Result<Option<i64>, ()> {
    let Some(value) = value else {
        return Ok(None);
    };
    // `z.coerce.number()` accepts numeric strings; `.int()` requires an integer.
    let parsed: f64 = value.trim().parse().map_err(|_| ())?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return Err(());
    }
    let parsed = parsed as i64;
    if parsed < min || parsed > max {
        return Err(());
    }
    Ok(Some(parsed))
}

fn query_string(url: &str) -> Option<&str> {
    url.split_once('?').map(|(_, query)| query)
}

/// Read the first occurrence of a query parameter, URL-decoded.
fn query_param(query: Option<&str>, key: &str) -> Option<String> {
    let query = query?;
    for pair in query.split('&') {
        let (raw_key, raw_value) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        if url_decode(raw_key) == key {
            return Some(url_decode(raw_value));
        }
    }
    None
}

fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                    out.push((hi << 4) | lo);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            other => {
                out.push(other);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---------------------------------------------------------------------------
// Storage download (service role).
// ---------------------------------------------------------------------------

enum DownloadOutcome {
    Ok(String),
    NotFound,
    Error,
    Unexpected,
}

/// Download `workspaces/<storage_path>` from Supabase Storage via the service-role
/// object endpoint. Mirrors `supabase.storage.from('workspaces').download(...)`.
///
/// Without a transform: `GET <origin>/storage/v1/object/authenticated/<bucket>/<path>`.
/// With a transform: `GET <origin>/storage/v1/render/image/authenticated/<bucket>/<path>?<transform>`
/// (the Supabase JS client routes transform downloads through the render endpoint).
async fn download_object(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_path: &str,
    transform: Option<&Transform>,
) -> DownloadOutcome {
    let Some(origin) = storage_origin(contact_data) else {
        return DownloadOutcome::Unexpected;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return DownloadOutcome::Unexpected;
    };
    let authorization = format!("Bearer {service_role_key}");

    let url = match transform {
        Some(transform) => {
            let query = transform_query(transform);
            let suffix = if query.is_empty() {
                String::new()
            } else {
                format!("?{query}")
            };
            format!("{origin}/render/image/authenticated/{STORAGE_BUCKET}/{storage_path}{suffix}")
        }
        None => format!("{origin}/object/authenticated/{STORAGE_BUCKET}/{storage_path}"),
    };

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return DownloadOutcome::Unexpected,
    };

    classify_download(response)
}

fn classify_download(response: OutboundResponse) -> DownloadOutcome {
    if (200..300).contains(&response.status) {
        return DownloadOutcome::Ok(response.body_text);
    }

    // Legacy: if `error.message.includes('not found')` => 404, else 500
    // STORAGE_DOWNLOAD_ERROR. The Storage API returns 404 with a body whose
    // `message`/`error` mentions "not found".
    if response.status == 404 || response.body_text.to_lowercase().contains("not found") {
        DownloadOutcome::NotFound
    } else {
        DownloadOutcome::Error
    }
}

/// Build the Supabase render-image transform query string from the validated
/// transform (omitting unset fields), mirroring the JS client's `transform`
/// serialization (`width`, `height`, `resize`, `quality`, `format`).
fn transform_query(transform: &Transform) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(width) = transform.width {
        parts.push(format!("width={width}"));
    }
    if let Some(height) = transform.height {
        parts.push(format!("height={height}"));
    }
    if let Some(resize) = transform.resize.as_deref() {
        parts.push(format!("resize={resize}"));
    }
    if let Some(quality) = transform.quality {
        parts.push(format!("quality={quality}"));
    }
    if let Some(format) = transform.format.as_deref() {
        parts.push(format!("format={format}"));
    }
    parts.join("&")
}

/// Derive the Supabase Storage base (`<origin>/storage/v1`) from the REST base URL.
/// `ContactDataConfig` exposes no raw origin accessor, so we reuse `rest_url` and
/// rewrite the `/rest/v1/...` segment to `/storage/v1`. Mirrors
/// `storage_analytics::storage_list_url` / `recordings_play::storage_origin`.
fn storage_origin(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest_url = contact_data.rest_url("__origin__", &[])?;
    let origin = rest_url.split("/rest/v1/").next()?;
    if origin.is_empty() {
        return None;
    }
    Some(format!("{origin}/storage/v1"))
}

// ---------------------------------------------------------------------------
// sanitizePath / reserved path (mirror of `@tuturuuu/utils/storage-path` +
// `isReservedMobileDeploymentDrivePath`, copied from workspaces_storage_object).
// ---------------------------------------------------------------------------

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

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

// ---------------------------------------------------------------------------
// API key validation + permission resolution (validateApiKey).
// Mirror of storage_analytics.rs.
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

/// Mirror of `createErrorResponse(error, message, status, code)`. Normalized here
/// to `(status, error, message, code)` argument order at the call sites.
fn error_response(status: u16, error: &str, message: &str, code: Option<&str>) -> BackendResponse {
    let body = match code {
        Some(code) => json!({ "error": error, "message": message, "code": code }),
        None => json!({ "error": error, "message": message }),
    };
    no_store_response(json_response(status, body))
}

// ---------------------------------------------------------------------------
// Time helpers (mirror storage_analytics / workspaces_3).
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
        0
    }
}

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
// Hex
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
// scrypt (RFC 7914) — pure Rust, mirror of storage_analytics.rs.
// ---------------------------------------------------------------------------

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn scrypt(password: &[u8], salt: &[u8], n: u32, r: u32, p: u32, dk_len: usize) -> Option<Vec<u8>> {
    if n < 2 || (n & (n - 1)) != 0 {
        return None;
    }
    if r == 0 || p == 0 || dk_len == 0 {
        return None;
    }

    let block_len = 128usize.checked_mul(r as usize)?;
    let b_len = block_len.checked_mul(p as usize)?;

    let mut b = pbkdf2_hmac_sha256(password, salt, 1, b_len);

    let words_per_block = block_len / 4;
    let mut v = vec![0u32; words_per_block * (n as usize)];
    let mut xy = vec![0u32; words_per_block * 2];

    for i in 0..(p as usize) {
        let off = i * block_len;
        let mut block_words = bytes_to_words_le(&b[off..off + block_len]);
        romix(&mut block_words, r as usize, n as usize, &mut v, &mut xy);
        words_to_bytes_le(&block_words, &mut b[off..off + block_len]);
    }

    Some(pbkdf2_hmac_sha256(password, &b, 1, dk_len))
}

fn romix(block: &mut [u32], r: usize, n: usize, v: &mut [u32], xy: &mut [u32]) {
    let block_words = 32 * r;
    xy[..block_words].copy_from_slice(&block[..block_words]);

    for i in 0..n {
        let v_off = i * block_words;
        v[v_off..v_off + block_words].copy_from_slice(&xy[..block_words]);
        block_mix(xy, r);
    }

    for _ in 0..n {
        let j = (xy[(2 * r - 1) * 16] as usize) & (n - 1);
        let v_off = j * block_words;
        for k in 0..block_words {
            xy[k] ^= v[v_off + k];
        }
        block_mix(xy, r);
    }

    block[..block_words].copy_from_slice(&xy[..block_words]);
}

fn block_mix(xy: &mut [u32], r: usize) {
    let block_words = 32 * r;
    let mut x = [0u32; 16];
    x.copy_from_slice(&xy[(2 * r - 1) * 16..(2 * r - 1) * 16 + 16]);

    for i in 0..(2 * r) {
        let bi = &xy[i * 16..i * 16 + 16];
        for k in 0..16 {
            x[k] ^= bi[k];
        }
        salsa20_8(&mut x);
        let y_off = block_words + i * 16;
        xy[y_off..y_off + 16].copy_from_slice(&x);
    }

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
