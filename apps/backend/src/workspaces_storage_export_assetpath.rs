//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/storage/export/[token]/[...assetPath]/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/storage/export/:token/*assetPath
//!
//! The route verifies a stateless, HMAC-signed Drive export token, resolves the
//! requested asset path relative to the token's folder, rejects reserved mobile
//! deployment vault paths, and finally issues a 307 redirect to a short-lived
//! signed storage read URL (Supabase Storage or Cloudflare R2 depending on the
//! provider embedded in the token).
//!
//! There is no Supabase user auth here: possession of a valid signed token is
//! the only credential. The signing secret and TTL come from the runtime
//! environment (`DRIVE_EXPORT_SIGNING_SECRET`, `DRIVE_EXPORT_LINK_TTL_SECONDS`),
//! mirroring `apps/web/src/lib/workspace-storage-export-links.ts`.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, empty_response,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

type HmacSha256 = Hmac<Sha256>;

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const EXPORT_SEGMENT: &str = "/storage/export/";

const EXPORT_LINK_VERSION: i64 = 1;
const EXPORT_SIGNING_SECRET_ENV: &str = "DRIVE_EXPORT_SIGNING_SECRET";
const EXPORT_LINK_TTL_ENV: &str = "DRIVE_EXPORT_LINK_TTL_SECONDS";
const DEV_SIGNING_SECRET: &str = "dev-drive-export-links-secret";

const STORAGE_BUCKET: &str = "workspaces";
const SIGNED_URL_TTL_SECONDS: u64 = 900;

const PROVIDER_SUPABASE: &str = "supabase";
const PROVIDER_R2: &str = "r2";

const DRIVE_R2_BUCKET_SECRET: &str = "DRIVE_R2_BUCKET";
const DRIVE_R2_ENDPOINT_SECRET: &str = "DRIVE_R2_ENDPOINT";
const DRIVE_R2_ACCESS_KEY_ID_SECRET: &str = "DRIVE_R2_ACCESS_KEY_ID";
const DRIVE_R2_SECRET_ACCESS_KEY_SECRET: &str = "DRIVE_R2_SECRET_ACCESS_KEY";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const MOBILE_DEPLOYMENT_DRIVE_PREFIX: &str = ".tuturuuu/mobile-deployment-vault";

#[derive(Deserialize)]
struct ExportTokenPayload {
    v: i64,
    #[serde(rename = "wsId")]
    ws_id: String,
    provider: String,
    #[serde(rename = "folderPath")]
    folder_path: String,
    iat: i64,
    nonce: String,
}

/// Mirrors `WorkspaceStorageError`: a (status, message) pair surfaced to clients.
struct StorageError {
    status: u16,
    message: String,
}

impl StorageError {
    fn new(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

struct VerifiedToken {
    ws_id: String,
    provider: String,
    folder_path: String,
}

struct R2Config {
    bucket: String,
    endpoint: String,
    access_key_id: String,
    secret_access_key: String,
}

enum ResolvedStorageProvider {
    Supabase,
    R2(R2Config),
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseSignResponse {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

/// Dynamic route: `/api/v1/workspaces/:wsId/storage/export/:token/*assetPath`.
pub(crate) async fn handle_workspaces_storage_export_assetpath_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = parse_export_route(request.path)?;

    Some(match request.method {
        "GET" => export_response(config, request, &route, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn export_response(
    config: &BackendConfig,
    _request: BackendRequest<'_>,
    route: &ExportRoute,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let verified = match verify_workspace_storage_export_token(&route.token) {
        Ok(verified) => verified,
        Err(error) => return message_response(error.status, &error.message),
    };

    // `verified.wsId !== wsId` -> 401 "Invalid export token."
    if verified.ws_id != route.ws_id {
        return message_response(401, "Invalid export token.");
    }

    let path = match resolve_export_asset_path(&verified.folder_path, &route.asset_segments) {
        Ok(path) => path,
        Err(error) => return message_response(error.status, &error.message),
    };

    if is_reserved_mobile_deployment_drive_path(&route.ws_id, &path) {
        return message_response(403, "Forbidden");
    }

    match create_workspace_storage_signed_read_url(
        &config.contact_data,
        outbound,
        &route.ws_id,
        &path,
        &verified.provider,
    )
    .await
    {
        Ok(signed_url) => redirect_response(&signed_url),
        Err(error) => message_response(error.status, &error.message),
    }
}

/// 307 redirect with `Cache-Control: no-store, max-age=0` (via no_store_response),
/// matching `NextResponse.redirect(signedUrl, { status: 307 })`.
fn redirect_response(signed_url: &str) -> BackendResponse {
    let mut response = no_store_response(empty_response(307));
    response.headers.push(("location", signed_url.to_owned()));
    response
}

// ---------------------------------------------------------------------------
// Token verification (mirror verifyWorkspaceStorageExportToken)
// ---------------------------------------------------------------------------

fn verify_workspace_storage_export_token(token: &str) -> Result<VerifiedToken, StorageError> {
    let secret = export_signing_secret()?;

    let mut parts = token.splitn(2, '.');
    let encoded_payload = parts.next().unwrap_or("");
    let signature = parts.next().unwrap_or("");

    if encoded_payload.is_empty() || signature.is_empty() {
        return Err(StorageError::new(401, "Invalid export token."));
    }

    let expected_signature = sign_payload(encoded_payload, &secret);
    // timingSafeEqual: length check then constant-time comparison.
    if signature.len() != expected_signature.len()
        || !constant_time_eq(signature.as_bytes(), expected_signature.as_bytes())
    {
        return Err(StorageError::new(401, "Invalid export token."));
    }

    let Some(decoded) = URL_SAFE_NO_PAD
        .decode(encoded_payload)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
    else {
        return Err(StorageError::new(401, "Invalid export token."));
    };

    let Ok(parsed) = serde_json::from_str::<ExportTokenPayload>(&decoded) else {
        return Err(StorageError::new(401, "Invalid export token."));
    };

    // Structural validation mirroring the legacy typeof / enum checks.
    if parsed.v != EXPORT_LINK_VERSION
        || (parsed.provider != PROVIDER_SUPABASE && parsed.provider != PROVIDER_R2)
        || parsed.nonce.is_empty()
    {
        // Note: `iat` and `nonce` presence is enforced by deserialization; an
        // empty nonce is rejected here to match the `typeof === 'string'`
        // semantics for a meaningful value.
        return Err(StorageError::new(401, "Invalid export token."));
    }

    if let Some(ttl) = export_link_ttl_seconds()
        && ttl > 0
    {
        let now = unix_seconds();
        if now.saturating_sub(parsed.iat) > ttl {
            return Err(StorageError::new(401, "Export link expired."));
        }
    }

    let Some(sanitized_folder_path) = sanitize_path(&parsed.folder_path) else {
        return Err(StorageError::new(401, "Invalid export folder path."));
    };
    if sanitized_folder_path.is_empty() {
        return Err(StorageError::new(401, "Invalid export folder path."));
    }

    Ok(VerifiedToken {
        ws_id: parsed.ws_id,
        provider: parsed.provider,
        folder_path: sanitized_folder_path,
    })
}

/// Mirror getExportSigningSecret: trimmed env value, dev fallback, else 500.
fn export_signing_secret() -> Result<String, StorageError> {
    if let Some(secret) = trimmed_env(EXPORT_SIGNING_SECRET_ENV) {
        return Ok(secret);
    }

    if is_dev_mode() {
        return Ok(DEV_SIGNING_SECRET.to_owned());
    }

    Err(StorageError::new(
        500,
        "Drive export links are unavailable because the signing secret is missing.",
    ))
}

/// HMAC-SHA256 over the encoded payload, base64url (unpadded) encoded.
fn sign_payload(encoded_payload: &str, secret: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts keys of any size");
    mac.update(encoded_payload.as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

fn export_link_ttl_seconds() -> Option<i64> {
    // Mirror `Number(process.env.DRIVE_EXPORT_LINK_TTL_SECONDS || 0)`: only a
    // positive parsed value enables expiry.
    trimmed_env(EXPORT_LINK_TTL_ENV).and_then(|value| value.parse::<i64>().ok())
}

// ---------------------------------------------------------------------------
// Asset path resolution (mirror resolveWorkspaceStorageExportAssetPath)
// ---------------------------------------------------------------------------

fn resolve_export_asset_path(
    folder_path: &str,
    asset_segments: &[String],
) -> Result<String, StorageError> {
    let relative_path = asset_segments.join("/");

    if relative_path.is_empty() {
        return Err(StorageError::new(400, "Missing export asset path."));
    }

    let joined = posix_join(folder_path, &relative_path);
    let Some(sanitized) = sanitize_path(&joined) else {
        return Err(StorageError::new(400, "Invalid export asset path."));
    };
    if sanitized.is_empty() {
        return Err(StorageError::new(400, "Invalid export asset path."));
    }

    if sanitized != folder_path && !sanitized.starts_with(&format!("{folder_path}/")) {
        return Err(StorageError::new(403, "Invalid export asset path."));
    }

    Ok(sanitized)
}

// ---------------------------------------------------------------------------
// Reserved mobile deployment path check (mirror isReservedMobileDeploymentDrivePath)
// ---------------------------------------------------------------------------

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

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

// ---------------------------------------------------------------------------
// Signed read URL (mirror createWorkspaceStorageSignedReadUrl with a forced
// provider, expiresIn: 900, and NO requireExists check).
// ---------------------------------------------------------------------------

async fn create_workspace_storage_signed_read_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    path: &str,
    requested_provider: &str,
) -> Result<String, StorageError> {
    let relative_path =
        sanitize_path(path).ok_or_else(|| StorageError::new(400, "Invalid path"))?;
    let full_path = build_workspace_storage_key(ws_id, &relative_path);

    // `options.provider` is set, so resolveWorkspaceStorageBackendConfig(wsId,
    // provider) runs and a provider mismatch is a hard 400.
    let resolved =
        resolve_workspace_storage_backend_config(contact_data, outbound, ws_id, requested_provider)
            .await;

    match (requested_provider, resolved) {
        (PROVIDER_R2, ResolvedStorageProvider::R2(config)) => {
            r2_presign_get_url(&config, &full_path)
                .ok_or_else(|| StorageError::new(500, "Failed to generate signed URL"))
        }
        (PROVIDER_R2, ResolvedStorageProvider::Supabase) => Err(StorageError::new(
            400,
            "Cloudflare R2 is not fully configured for this workspace.",
        )),
        (PROVIDER_SUPABASE, ResolvedStorageProvider::Supabase) => {
            supabase_create_signed_url(contact_data, outbound, &full_path).await
        }
        // Supabase is always resolvable, so this arm is unreachable in practice;
        // mirror the legacy "Supabase storage is unavailable" 400 defensively.
        (PROVIDER_SUPABASE, ResolvedStorageProvider::R2(_)) => Err(StorageError::new(
            400,
            "Supabase storage is unavailable for this workspace.",
        )),
        _ => Err(StorageError::new(400, "Invalid export token.")),
    }
}

/// Mirror resolveWorkspaceStorageBackendConfig(wsId, provider): for a requested
/// `supabase` provider, always Supabase. For `r2`, return R2 only when every
/// required secret is present, otherwise fall back to Supabase (so the caller
/// surfaces the provider-mismatch 400).
async fn resolve_workspace_storage_backend_config(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    requested_provider: &str,
) -> ResolvedStorageProvider {
    if requested_provider != PROVIDER_R2 {
        return ResolvedStorageProvider::Supabase;
    }

    let secrets = match fetch_workspace_secrets(contact_data, outbound, ws_id).await {
        Ok(secrets) => secrets,
        Err(()) => return ResolvedStorageProvider::Supabase,
    };

    let bucket = secret_value(&secrets, DRIVE_R2_BUCKET_SECRET);
    let endpoint = secret_value(&secrets, DRIVE_R2_ENDPOINT_SECRET);
    let access_key_id = secret_value(&secrets, DRIVE_R2_ACCESS_KEY_ID_SECRET);
    let secret_access_key = secret_value(&secrets, DRIVE_R2_SECRET_ACCESS_KEY_SECRET);

    match (bucket, endpoint, access_key_id, secret_access_key) {
        (Some(bucket), Some(endpoint), Some(access_key_id), Some(secret_access_key)) => {
            ResolvedStorageProvider::R2(R2Config {
                bucket,
                endpoint,
                access_key_id,
                secret_access_key,
            })
        }
        _ => ResolvedStorageProvider::Supabase,
    }
}

fn secret_value(secrets: &[(String, String)], name: &str) -> Option<String> {
    secrets
        .iter()
        .find(|(secret_name, _)| secret_name == name)
        .map(|(_, value)| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

async fn fetch_workspace_secrets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<(String, String)>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // The storage provider is forced by the token, so only the R2 connection
    // secrets matter here (no DRIVE_STORAGE_PROVIDER lookup needed).
    let rows = response.json::<Vec<WorkspaceSecretRow>>().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| match (row.name, row.value) {
            (Some(name), Some(value)) => Some((name, value)),
            _ => None,
        })
        .collect())
}

async fn supabase_create_signed_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    full_path: &str,
) -> Result<String, StorageError> {
    let Some(storage_url) = storage_object_url(contact_data, "sign") else {
        return Err(StorageError::new(500, "Failed to generate signed URL"));
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(StorageError::new(500, "Failed to generate signed URL"));
    };
    let url = format!(
        "{storage_url}/{STORAGE_BUCKET}/{}",
        encode_storage_path(full_path)
    );
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "expiresIn": SIGNED_URL_TTL_SECONDS }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| StorageError::new(500, "Failed to generate signed URL"))?;

    if !(200..300).contains(&response.status) {
        return Err(StorageError::new(500, "Failed to generate signed URL"));
    }

    let signed = response
        .json::<SupabaseSignResponse>()
        .map_err(|_| StorageError::new(500, "Failed to generate signed URL"))?;
    let signed_path = signed
        .signed_url
        .filter(|value| !value.is_empty())
        .ok_or_else(|| StorageError::new(500, "Failed to generate signed URL"))?;

    // supabase-js returns a relative `signedURL`; prepend `${origin}/storage/v1`.
    let base = storage_base_url(contact_data)
        .ok_or_else(|| StorageError::new(500, "Failed to generate signed URL"))?;
    let normalized = if signed_path.starts_with('/') {
        signed_path
    } else {
        format!("/{signed_path}")
    };
    Ok(format!("{base}{normalized}"))
}

// ---------------------------------------------------------------------------
// Cloudflare R2 (S3-compatible) AWS SigV4 GET presigning (query-string auth)
// ---------------------------------------------------------------------------

fn r2_presign_get_url(config: &R2Config, full_path: &str) -> Option<String> {
    let (amz_date, date_stamp) = sigv4_timestamps();
    let host = host_from_endpoint(&config.endpoint)?;
    let canonical_uri = format!("/{}/{}", config.bucket, encode_storage_path(full_path));
    let credential_scope = format!("{date_stamp}/auto/s3/aws4_request");
    let credential = format!("{}/{credential_scope}", config.access_key_id);

    let mut query: Vec<(String, String)> = vec![
        ("X-Amz-Algorithm".to_owned(), "AWS4-HMAC-SHA256".to_owned()),
        ("X-Amz-Credential".to_owned(), credential),
        ("X-Amz-Date".to_owned(), amz_date.clone()),
        (
            "X-Amz-Expires".to_owned(),
            SIGNED_URL_TTL_SECONDS.to_string(),
        ),
        ("X-Amz-SignedHeaders".to_owned(), "host".to_owned()),
    ];

    let canonical_querystring = canonical_query_string(&query);
    let canonical_headers = format!("host:{host}\n");
    let signed_headers = "host";
    let canonical_request = format!(
        "GET\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\nUNSIGNED-PAYLOAD"
    );

    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{}",
        hex_sha256(canonical_request.as_bytes())
    );

    let signing_key = sigv4_signing_key(&config.secret_access_key, &date_stamp, "auto", "s3")?;
    let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes())?;

    query.push(("X-Amz-Signature".to_owned(), signature));

    Some(format!(
        "https://{host}{canonical_uri}?{}",
        canonical_query_string(&query)
    ))
}

fn sigv4_signing_key(
    secret_access_key: &str,
    date_stamp: &str,
    region: &str,
    service: &str,
) -> Option<Vec<u8>> {
    let k_date = raw_hmac_sha256(
        format!("AWS4{secret_access_key}").as_bytes(),
        date_stamp.as_bytes(),
    )?;
    let k_region = raw_hmac_sha256(&k_date, region.as_bytes())?;
    let k_service = raw_hmac_sha256(&k_region, service.as_bytes())?;
    raw_hmac_sha256(&k_service, b"aws4_request")
}

fn sigv4_timestamps() -> (String, String) {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_unix_epoch_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    let amz_date = format!("{year:04}{month:02}{day:02}T{hour:02}{minute:02}{second:02}Z");
    let date_stamp = format!("{year:04}{month:02}{day:02}");
    (amz_date, date_stamp)
}

fn civil_from_unix_epoch_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };

    (year, month, day)
}

fn canonical_query_string(query: &[(String, String)]) -> String {
    let mut sorted: Vec<(String, String)> = query
        .iter()
        .map(|(key, value)| (uri_encode(key, true), uri_encode(value, true)))
        .collect();
    sorted.sort_by(|left, right| left.0.cmp(&right.0));
    sorted
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&")
}

fn host_from_endpoint(endpoint: &str) -> Option<String> {
    let trimmed = endpoint.trim();
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);
    let host = without_scheme
        .split('/')
        .next()
        .unwrap_or(without_scheme)
        .trim_end_matches('/');
    (!host.is_empty()).then(|| host.to_owned())
}

// ---------------------------------------------------------------------------
// Hashing / encoding helpers
// ---------------------------------------------------------------------------

fn hex_sha256(input: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    to_hex(&hasher.finalize())
}

fn raw_hmac_sha256(key: &[u8], message: &[u8]) -> Option<Vec<u8>> {
    let mut hmac = HmacSha256::new_from_slice(key).ok()?;
    hmac.update(message);
    Some(hmac.finalize().into_bytes().to_vec())
}

fn hex_hmac_sha256(key: &[u8], message: &[u8]) -> Option<String> {
    raw_hmac_sha256(key, message).map(|bytes| to_hex(&bytes))
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

/// AWS-style URI encoding. `encode_slash = true` also escapes `/`.
fn uri_encode(input: &str, encode_slash: bool) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        let keep = byte.is_ascii_alphanumeric()
            || matches!(byte, b'-' | b'_' | b'.' | b'~')
            || (!encode_slash && byte == b'/');
        if keep {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// Percent-encode each path segment but keep `/` separators literal.
fn encode_storage_path(path: &str) -> String {
    path.split('/')
        .map(|segment| uri_encode(segment, true))
        .collect::<Vec<_>>()
        .join("/")
}

// ---------------------------------------------------------------------------
// Path / URL helpers
// ---------------------------------------------------------------------------

fn storage_base_url(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest = contact_data.rest_url("__origin__", &[])?;
    let origin = rest.split("/rest/v1/").next()?;
    Some(format!("{origin}/storage/v1"))
}

fn storage_object_url(contact_data: &contact::ContactDataConfig, action: &str) -> Option<String> {
    storage_base_url(contact_data).map(|base| format!("{base}/object/{action}"))
}

/// Mirror buildWorkspaceStorageKey: `wsId` or `wsId/relativePath`.
fn build_workspace_storage_key(ws_id: &str, relative_path: &str) -> String {
    if relative_path.is_empty() {
        ws_id.to_owned()
    } else {
        format!("{ws_id}/{relative_path}")
    }
}

/// Mirror posix.join for two pre-trimmed components, then normalize `.`/`..`.
/// Inputs are already individually sanitized, so this is mostly concatenation;
/// the result is re-sanitized by the caller.
fn posix_join(left: &str, right: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();
    for component in [left, right] {
        for segment in component.split('/').filter(|segment| !segment.is_empty()) {
            match segment {
                "." => {}
                ".." => {
                    segments.pop();
                }
                other => segments.push(other),
            }
        }
    }
    segments.join("/")
}

/// Mirror sanitizePath from @tuturuuu/utils/storage-path. Returns None on
/// traversal segments; Some("") for empty input.
fn sanitize_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return Some(String::new());
    }

    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim().trim_matches('/');

    let mut segments = Vec::new();
    for segment in trimmed.split('/').filter(|segment| !segment.is_empty()) {
        if segment == ".." || segment == "." || segment.contains("..") {
            return None;
        }
        segments.push(segment);
    }

    Some(segments.join("/"))
}

/// Minimal percent-decoder for a single URL path segment. Matches the
/// decodeURIComponent round-trip applied by Next.js `[...assetPath]`.
fn percent_decode(segment: &str) -> String {
    let bytes = segment.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = hex_digit(bytes[index + 1]);
            let low = hex_digit(bytes[index + 2]);
            if let (Some(high), Some(low)) = (high, low) {
                out.push((high << 4) | low);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn trimmed_env(key: &str) -> Option<String> {
    let value = std::env::var(key).ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Mirror @tuturuuu/utils/constants DEV_MODE (NODE_ENV === 'development').
fn is_dev_mode() -> bool {
    std::env::var("NODE_ENV")
        .map(|value| value.trim().eq_ignore_ascii_case("development"))
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

struct ExportRoute {
    ws_id: String,
    token: String,
    asset_segments: Vec<String>,
}

/// Matches `/api/v1/workspaces/:wsId/storage/export/:token/*assetPath`.
/// Returns `None` for any other path shape so the dispatcher falls through.
fn parse_export_route(path: &str) -> Option<ExportRoute> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(EXPORT_SEGMENT)?;
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    // after_ws = `{token}/{...assetPath}` (at least one asset segment required).
    let (token, asset_rest) = after_ws.split_once('/')?;
    if token.is_empty() || asset_rest.is_empty() {
        return None;
    }

    let asset_segments: Vec<String> = asset_rest
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(percent_decode)
        .collect();
    if asset_segments.is_empty() {
        return None;
    }

    Some(ExportRoute {
        // wsId and token are single, already-decoded path segments; the legacy
        // route receives them URL-decoded.
        ws_id: percent_decode(ws_id),
        token: percent_decode(token),
        asset_segments,
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
