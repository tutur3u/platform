use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

type HmacSha256 = Hmac<Sha256>;

const CHAT_GET_ATTACHMENT_RPC: &str = "chat_get_attachment";
const EXTERNAL_CHAT_GET_ATTACHMENT_RPC: &str = "ai_agent_external_get_attachment";
const EXTERNAL_CHAT_CONVERSATION_PREFIX: &str = "ai-agent-thread-";
const PRIVATE_SCHEMA: &str = "private";
const STORAGE_BUCKET: &str = "workspaces";
const VIEW_CHAT_PERMISSION: &str = "view_chat";

const DRIVE_STORAGE_PROVIDER_SECRET: &str = "DRIVE_STORAGE_PROVIDER";
const DRIVE_R2_BUCKET_SECRET: &str = "DRIVE_R2_BUCKET";
const DRIVE_R2_ENDPOINT_SECRET: &str = "DRIVE_R2_ENDPOINT";
const DRIVE_R2_ACCESS_KEY_ID_SECRET: &str = "DRIVE_R2_ACCESS_KEY_ID";
const DRIVE_R2_SECRET_ACCESS_KEY_SECRET: &str = "DRIVE_R2_SECRET_ACCESS_KEY";

const PROVIDER_R2: &str = "r2";

const FAILED_MESSAGE: &str = "Failed to sign chat attachment";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

const SUPABASE_SIGNED_URL_TTL_SECONDS: u64 = 31_536_000;
const R2_SIGNED_URL_TTL_SECONDS: u64 = 900;

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const CONVERSATIONS_SEGMENT: &str = "/chat/conversations/";
const ATTACHMENTS_SEGMENT: &str = "/attachments/";

struct AttachmentRoute<'a> {
    ws_id: &'a str,
    conversation_id: &'a str,
    attachment_id: &'a str,
}

#[derive(Serialize)]
struct ChatGetAttachmentRpcRequest<'a> {
    p_actor_user_id: &'a str,
    p_attachment_id: &'a str,
    p_conversation_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Deserialize)]
struct ChatAttachment {
    #[serde(rename = "storagePath")]
    storage_path: Option<String>,
    #[serde(rename = "storageWsId")]
    storage_ws_id: Option<String>,
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

#[derive(Deserialize)]
struct SupabaseStorageListEntry {
    id: Option<String>,
    name: Option<String>,
}

struct RpcError {
    code: Option<String>,
    message: Option<String>,
}

/// Mirrors the WorkspaceStorageError thrown by createWorkspaceStorageSignedReadUrl.
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

pub(crate) async fn handle_workspaces_chat_conversations_attachments_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = parse_attachment_route(request.path)?;

    Some(match request.method {
        "GET" => attachment_response(config, request, &route, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn attachment_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    route: &AttachmentRoute<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror resolveChatRouteContext({ permission: 'view_chat' }): authenticate,
    // normalize the workspace id, and require `view_chat` before the RPC runs.
    let authorization = match authorize_finance_permission(
        config,
        request,
        route.ws_id,
        VIEW_CHAT_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response(500, None, FAILED_MESSAGE);
        }
    };

    let attachment = match call_chat_get_attachment(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        route.conversation_id,
        route.attachment_id,
    )
    .await
    {
        Ok(attachment) => attachment,
        Err(error) => return chat_rpc_error_response(error),
    };

    let Some(storage_path) = attachment.storage_path else {
        // The RPC always returns storagePath for a valid attachment; treat a
        // missing path as an internal failure rather than panicking.
        return error_response(500, None, FAILED_MESSAGE);
    };
    let storage_ws_id = attachment
        .storage_ws_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| authorization.ws_id.clone());

    match create_workspace_storage_signed_read_url(
        &config.contact_data,
        outbound,
        &storage_ws_id,
        &storage_path,
    )
    .await
    {
        Ok(signed_url) => no_store_response(json_response(200, json!({ "signedUrl": signed_url }))),
        Err(error) => no_store_response(json_response(
            error.status,
            json!({ "message": error.message }),
        )),
    }
}

async fn call_chat_get_attachment(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    conversation_id: &str,
    attachment_id: &str,
) -> Result<ChatAttachment, RpcError> {
    let rpc_name = if conversation_id.starts_with(EXTERNAL_CHAT_CONVERSATION_PREFIX) {
        EXTERNAL_CHAT_GET_ATTACHMENT_RPC
    } else {
        CHAT_GET_ATTACHMENT_RPC
    };
    let Some(rpc_url) = contact_data.rpc_url(rpc_name) else {
        return Err(RpcError {
            code: None,
            message: None,
        });
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(RpcError {
            code: None,
            message: None,
        });
    };
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&ChatGetAttachmentRpcRequest {
        p_actor_user_id: actor_user_id,
        p_attachment_id: attachment_id,
        p_conversation_id: conversation_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| RpcError {
        code: None,
        message: None,
    })?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| RpcError {
            code: None,
            message: None,
        })?;

    if (200..300).contains(&response.status) {
        return response.json::<ChatAttachment>().map_err(|_| RpcError {
            code: None,
            message: None,
        });
    }

    let envelope = response.json::<Value>().ok();
    Err(RpcError {
        code: envelope
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        message: envelope
            .as_ref()
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

async fn create_workspace_storage_signed_read_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    path: &str,
) -> Result<String, StorageError> {
    let relative_path =
        sanitize_path(path).ok_or_else(|| StorageError::new(400, "Invalid path"))?;
    let full_path = build_workspace_storage_key(ws_id, &relative_path);

    let provider = resolve_workspace_storage_provider(contact_data, outbound, ws_id).await;

    match provider {
        ResolvedStorageProvider::R2(config) => {
            // requireExists: true -> HeadObject must succeed.
            if !r2_object_exists(outbound, &config, &full_path).await {
                return Err(StorageError::new(404, "Storage object not found"));
            }
            r2_presign_get_url(&config, &full_path)
                .ok_or_else(|| StorageError::new(500, "Failed to generate signed URL"))
        }
        ResolvedStorageProvider::Supabase => {
            // requireExists: true -> object must be present in its directory.
            if !supabase_object_exists(contact_data, outbound, &full_path).await? {
                return Err(StorageError::new(404, "Storage object not found"));
            }
            supabase_create_signed_url(contact_data, outbound, &full_path).await
        }
    }
}

async fn resolve_workspace_storage_provider(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> ResolvedStorageProvider {
    // Mirror getSecrets({ wsId, forceAdmin: true }) + resolveWorkspaceStorageConfig:
    // fall back to Supabase on any error or incomplete R2 configuration.
    let secrets = match fetch_workspace_secrets(contact_data, outbound, ws_id).await {
        Ok(secrets) => secrets,
        Err(()) => return ResolvedStorageProvider::Supabase,
    };

    let provider = secrets
        .iter()
        .find(|(name, _)| name == DRIVE_STORAGE_PROVIDER_SECRET)
        .map(|(_, value)| value.trim().to_lowercase())
        .unwrap_or_default();

    if provider != PROVIDER_R2 {
        return ResolvedStorageProvider::Supabase;
    }

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
        // Incomplete R2 configuration falls back to Supabase, matching the
        // resolveWorkspaceStorageConfigForProvider warning path.
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

    let rows = response.json::<Vec<WorkspaceSecretRow>>().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| match (row.name, row.value) {
            (Some(name), Some(value)) => Some((name, value)),
            _ => None,
        })
        .collect())
}

async fn supabase_object_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    full_path: &str,
) -> Result<bool, StorageError> {
    // Mirror findSupabaseStorageObject: list the parent directory filtered by the
    // object name and look for an entry with an id (a real file, not a folder).
    let (folder_path, object_name) = split_dirname_basename(full_path);
    let Some(storage_url) = storage_object_url(contact_data, "list") else {
        return Err(StorageError::new(500, "Failed to generate signed URL"));
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(StorageError::new(500, "Failed to generate signed URL"));
    };
    let url = format!("{storage_url}/{STORAGE_BUCKET}");
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({
        "prefix": folder_path,
        "limit": 1000,
        "offset": 0,
        "search": object_name,
        "sortBy": { "column": "name", "order": "asc" },
    })
    .to_string();

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
        .map_err(|_| StorageError::new(500, "Failed to inspect destination object"))?;

    if !(200..300).contains(&response.status) {
        return Err(StorageError::new(
            500,
            "Failed to inspect destination object",
        ));
    }

    let entries = response
        .json::<Vec<SupabaseStorageListEntry>>()
        .map_err(|_| StorageError::new(500, "Failed to inspect destination object"))?;

    Ok(entries.iter().any(|entry| {
        entry.id.as_deref().is_some_and(|id| !id.is_empty())
            && entry.name.as_deref() == Some(object_name.as_str())
    }))
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
    let body = json!({ "expiresIn": SUPABASE_SIGNED_URL_TTL_SECONDS }).to_string();

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

    // supabase-js returns a relative `signedURL` and prepends `${url}/storage/v1`.
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
// Cloudflare R2 (S3-compatible) AWS SigV4 GET presigning + HeadObject existence
// ---------------------------------------------------------------------------

async fn r2_object_exists(
    outbound: &impl OutboundHttpClient,
    config: &R2Config,
    full_path: &str,
) -> bool {
    let Some((url, headers)) = r2_signed_head_request(config, full_path) else {
        return false;
    };

    let mut request = OutboundRequest::new(OutboundMethod::Get, &url);
    for (name, value) in &headers {
        request = request.with_header(name, value);
    }

    match outbound.send(request).await {
        // HEAD is signed/sent as GET here (the outbound client has no HEAD); a
        // 2xx means the object exists.
        Ok(response) => (200..300).contains(&response.status),
        Err(_) => false,
    }
}

/// Build a SigV4-presigned GET URL for the object (query-string auth).
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
            R2_SIGNED_URL_TTL_SECONDS.to_string(),
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

/// Build a SigV4 (header auth) signed HeadObject request for existence checks.
fn r2_signed_head_request(
    config: &R2Config,
    full_path: &str,
) -> Option<(String, Vec<(String, String)>)> {
    let (amz_date, date_stamp) = sigv4_timestamps();
    let host = host_from_endpoint(&config.endpoint)?;
    let canonical_uri = format!("/{}/{}", config.bucket, encode_storage_path(full_path));
    let payload_hash = hex_sha256(b"");
    let credential_scope = format!("{date_stamp}/auto/s3/aws4_request");

    let canonical_headers =
        format!("host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n");
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request =
        format!("GET\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}");

    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{}",
        hex_sha256(canonical_request.as_bytes())
    );

    let signing_key = sigv4_signing_key(&config.secret_access_key, &date_stamp, "auto", "s3")?;
    let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes())?;

    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}",
        config.access_key_id
    );

    let url = format!("https://{host}{canonical_uri}");
    let headers = vec![
        ("Authorization".to_owned(), authorization),
        ("x-amz-content-sha256".to_owned(), payload_hash),
        ("x-amz-date".to_owned(), amz_date),
    ];

    Some((url, headers))
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

/// AWS-style URI encoding. `encode_slash = true` also escapes `/` (used for
/// query components); path components keep `/` literal.
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
    // contact_data exposes auth_url("") => `{supabase_url}/auth/v1/`; derive the
    // storage base by reusing the same origin. rest_url is the canonical origin
    // helper, so strip its known suffix.
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

/// posix.dirname/basename equivalents over `/`-joined storage keys.
fn split_dirname_basename(full_path: &str) -> (String, String) {
    match full_path.rsplit_once('/') {
        Some((dir, base)) => (dir.to_owned(), base.to_owned()),
        None => (String::new(), full_path.to_owned()),
    }
}

/// Mirror sanitizePath from @tuturuuu/utils/storage-path. Returns None when the
/// path contains traversal segments (the legacy code throws "Invalid path").
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

fn parse_attachment_route(path: &str) -> Option<AttachmentRoute<'_>> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(CONVERSATIONS_SEGMENT)?;
    let (conversation_id, after_conversation) = after_ws.split_once(ATTACHMENTS_SEGMENT)?;
    let attachment_id = after_conversation;

    if ws_id.is_empty()
        || ws_id.contains('/')
        || conversation_id.is_empty()
        || conversation_id.contains('/')
        || attachment_id.is_empty()
        || attachment_id.contains('/')
    {
        return None;
    }

    Some(AttachmentRoute {
        ws_id,
        conversation_id,
        attachment_id,
    })
}

// ---------------------------------------------------------------------------
// Error responses (mirror chatRpcErrorResponse / getChatRpcErrorStatus)
// ---------------------------------------------------------------------------

fn chat_rpc_error_response(error: RpcError) -> BackendResponse {
    let status = chat_rpc_error_status(error.code.as_deref(), error.message.as_deref());
    let message = if status >= 500 {
        FAILED_MESSAGE.to_owned()
    } else {
        error
            .message
            .clone()
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| FAILED_MESSAGE.to_owned())
    };

    error_response(status, error.code.as_deref(), &message)
}

fn chat_rpc_error_status(code: Option<&str>, message: Option<&str>) -> u16 {
    let lower = message.unwrap_or("").to_lowercase();

    if code == Some("42501")
        || lower.contains("forbidden")
        || lower.contains("permission")
        || lower.contains("required")
    {
        return 403;
    }

    if lower.contains("not_found") || lower.contains("not found") {
        return 404;
    }

    if code == Some("22023")
        || lower.contains("invalid")
        || lower.contains("empty")
        || lower.contains("too_large")
        || lower.contains("requires")
        || lower.contains("target")
    {
        return 400;
    }

    500
}

fn error_response(status: u16, code: Option<&str>, message: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "code": code,
            "message": message,
        }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
