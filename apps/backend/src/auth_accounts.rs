use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, constant_time_eq,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

type HmacSha256 = Hmac<sha2::Sha256>;

const AUTH_ACCOUNTS_PATH: &str = "/api/v1/auth/accounts";
const PRIVATE_SCHEMA: &str = "private";

// Device cookie names (mirrors apps/web multi-account/types.ts). The hardened
// `__Host-` cookie is used on genuine public HTTPS hosts; the legacy cookie is
// used on localhost-style hosts that cannot persist Secure/`__Host-` cookies.
const WEB_ACCOUNT_DEVICE_COOKIE_NAME: &str = "__Host-tuturuuu_web_account_device";
const LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME: &str = "tuturuuu_web_account_device";

const COOKIE_VERSION: &str = "v1";
const DIAGNOSTIC_PREFIX: &str = "AUTH-ACC-LIST";
const ACCOUNT_CORS_METHODS: &str = "GET, POST, PATCH, DELETE, OPTIONS";
const ACCOUNT_CORS_HEADERS: &str = "Content-Type";

#[derive(Serialize)]
struct WebAccountMetadata {
    #[serde(rename = "addedAt")]
    added_at: Option<i64>,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "lastActiveAt")]
    last_active_at: Option<i64>,
    #[serde(rename = "lastRoute")]
    last_route: Option<String>,
    #[serde(rename = "lastWorkspaceId")]
    last_workspace_id: Option<String>,
}

#[derive(Serialize)]
struct WebAccountSummary {
    email: Option<String>,
    id: String,
    metadata: WebAccountMetadata,
}

#[derive(Serialize)]
struct WebAccountsResponse {
    accounts: Vec<WebAccountSummary>,
    #[serde(rename = "activeAccountId")]
    active_account_id: Option<String>,
}

#[derive(Deserialize)]
struct DeviceRow {
    active_user_id: Option<String>,
    revoked_at: Option<String>,
    secret_hash: Option<String>,
}

#[derive(Deserialize)]
struct AccountRow {
    avatar_url: Option<String>,
    created_at: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
    last_active_at: Option<String>,
    last_route: Option<String>,
    last_workspace_id: Option<String>,
    user_id: Option<String>,
}

struct DeviceCredential {
    device_id: String,
    secret: String,
}

struct ResolvedDevice {
    device_id: String,
    active_user_id: Option<String>,
}

pub(crate) async fn handle_auth_accounts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AUTH_ACCOUNTS_PATH {
        return None;
    }

    Some(with_account_cors(
        request,
        match request.method {
            "GET" => list_web_accounts_response(config, request, outbound).await,
            "OPTIONS" => crate::empty_response(204),
            method => no_store_response(method_not_allowed(method, "GET")),
        },
    ))
}

async fn list_web_accounts_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(secret) = multi_account_secret(config) else {
        // No secret configured to verify device cookie signatures. Without it
        // we cannot trust any device cookie, so behave like the legacy route's
        // "no device" branch: an empty account list.
        return empty_accounts_response();
    };

    let device = match resolve_device(config, request, outbound, &secret).await {
        Ok(device) => device,
        Err(()) => return error_response(),
    };

    match list_accounts_for_device(config, outbound, device).await {
        Ok(response) => no_store_response(json_response(200, response)),
        Err(()) => error_response(),
    }
}

async fn resolve_device(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    secret: &str,
) -> Result<Option<ResolvedDevice>, ()> {
    let Some(credential) = device_credential_from_request(request, secret) else {
        // No valid/signed device cookie present. Matches `create: false`
        // returning null without touching the database.
        return Ok(None);
    };

    let Some(url) = config.contact_data.rest_url(
        "web_account_devices",
        &[
            (
                "select",
                "id,secret_hash,active_user_id,revoked_at".to_owned(),
            ),
            ("id", format!("eq.{}", credential.device_id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_rest_request(config, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let row = response
        .json::<Vec<DeviceRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();

    let Some(row) = row else {
        return Ok(None);
    };

    let revoked = row
        .revoked_at
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let expected_hash = hash_device_secret(secret, &credential.secret);
    let stored_hash = row.secret_hash.unwrap_or_default();

    if revoked || !constant_time_eq(stored_hash.as_bytes(), expected_hash.as_bytes()) {
        return Ok(None);
    }

    // Best-effort last_seen_at touch to mirror the legacy route. Ignore any
    // failure; it must not affect the account listing.
    touch_device_last_seen(config, outbound, &credential.device_id).await;

    Ok(Some(ResolvedDevice {
        device_id: credential.device_id,
        active_user_id: row.active_user_id,
    }))
}

async fn touch_device_last_seen(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    device_id: &str,
) {
    let Some(url) = config
        .contact_data
        .rest_url("web_account_devices", &[("id", format!("eq.{device_id}"))])
    else {
        return;
    };
    let Some(service_role_key) = config.contact_data.service_role_key() else {
        return;
    };
    let now = current_iso8601();
    let body = json!({ "last_seen_at": now }).to_string();
    let authorization = format!("Bearer {service_role_key}");

    let _ = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Patch, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "return=minimal")
                .with_body(&body),
        )
        .await;
}

async fn list_accounts_for_device(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    device: Option<ResolvedDevice>,
) -> Result<WebAccountsResponse, ()> {
    let Some(device) = device else {
        return Ok(WebAccountsResponse {
            accounts: Vec::new(),
            active_account_id: None,
        });
    };

    let rows = get_account_rows(config, outbound, &device.device_id).await?;
    let accounts: Vec<WebAccountSummary> = rows.into_iter().map(row_to_account_summary).collect();
    let active_account_exists = device
        .active_user_id
        .as_deref()
        .is_some_and(|active| accounts.iter().any(|account| account.id == active));

    Ok(WebAccountsResponse {
        active_account_id: if active_account_exists {
            device.active_user_id
        } else {
            None
        },
        accounts,
    })
}

async fn get_account_rows(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    device_id: &str,
) -> Result<Vec<AccountRow>, ()> {
    let Some(url) = config.contact_data.rest_url(
        "web_account_sessions",
        &[
            (
                "select",
                "user_id,email,display_name,avatar_url,last_workspace_id,last_route,created_at,last_active_at".to_owned(),
            ),
            ("device_id", format!("eq.{device_id}")),
            ("order", "last_active_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_rest_request(config, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<AccountRow>>().map_err(|_| ())
}

fn row_to_account_summary(row: AccountRow) -> WebAccountSummary {
    WebAccountSummary {
        email: row.email,
        id: row.user_id.unwrap_or_default(),
        metadata: WebAccountMetadata {
            added_at: to_timestamp(row.created_at.as_deref()),
            avatar_url: row.avatar_url,
            display_name: row.display_name,
            last_active_at: to_timestamp(row.last_active_at.as_deref()),
            last_route: row.last_route,
            last_workspace_id: row.last_workspace_id,
        },
    }
}

async fn send_private_rest_request(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = config.contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Device cookie parsing + signature verification
// ---------------------------------------------------------------------------

fn device_credential_from_request(
    request: BackendRequest<'_>,
    secret: &str,
) -> Option<DeviceCredential> {
    let cookie_header = request.cookie?;
    let shared_host = request_uses_shared_account_cookie(request);
    let cookie_names = if shared_host {
        [
            LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
            WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        ]
    } else {
        [
            WEB_ACCOUNT_DEVICE_COOKIE_NAME,
            LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        ]
    };

    for name in cookie_names {
        let mut values = cookie_values(cookie_header, name);

        if shared_host && name == LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME {
            // During migration the browser can send both host-only and
            // parent-domain cookies with the same name. Cookie headers do not
            // include domain metadata, so prefer the newest/header-last value.
            values.reverse();
        }

        for raw in values {
            if let Some(credential) = parse_device_cookie_value(&raw, secret) {
                return Some(credential);
            }
        }
    }

    None
}

fn cookie_values(cookie_header: &str, name: &str) -> Vec<String> {
    cookie_header
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
        .filter(|(cookie_name, _)| cookie_name.trim() == name)
        .map(|(_, value)| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect()
}

fn request_uses_shared_account_cookie(request: BackendRequest<'_>) -> bool {
    request
        .origin
        .or(request.url)
        .and_then(origin_hostname)
        .as_deref()
        .is_some_and(is_tuturuuu_shared_hostname)
}

fn origin_hostname(value: &str) -> Option<String> {
    let after_scheme = value.split_once("://").map(|(_, rest)| rest)?;
    let host_with_port = after_scheme.split('/').next()?.trim();
    let hostname = host_with_port
        .split(':')
        .next()?
        .trim()
        .to_ascii_lowercase();

    (!hostname.is_empty()).then_some(hostname)
}

fn is_tuturuuu_shared_hostname(hostname: &str) -> bool {
    hostname == "tuturuuu.com"
        || hostname.ends_with(".tuturuuu.com")
        || hostname == "tuturuuu.localhost"
        || hostname.ends_with(".tuturuuu.localhost")
}

fn with_account_cors(
    request: BackendRequest<'_>,
    mut response: BackendResponse,
) -> BackendResponse {
    let Some(origin) = request.origin.filter(|origin| {
        origin_hostname(origin)
            .as_deref()
            .is_some_and(is_tuturuuu_shared_hostname)
    }) else {
        return response;
    };

    response
        .headers
        .push(("Access-Control-Allow-Origin", origin.to_owned()));
    response
        .headers
        .push(("Access-Control-Allow-Credentials", "true".to_owned()));
    response.headers.push((
        "Access-Control-Allow-Methods",
        ACCOUNT_CORS_METHODS.to_owned(),
    ));
    response.headers.push((
        "Access-Control-Allow-Headers",
        ACCOUNT_CORS_HEADERS.to_owned(),
    ));
    response
        .headers
        .push(("Access-Control-Max-Age", "86400".to_owned()));
    response.headers.push(("Vary", "Origin".to_owned()));

    response
}

fn parse_device_cookie_value(value: &str, secret: &str) -> Option<DeviceCredential> {
    let parts: Vec<&str> = value.split('.').collect();
    // Exactly: version.deviceId.secret.signature (no extra segments).
    if parts.len() != 4 {
        return None;
    }
    let version = parts[0];
    let device_id = parts[1];
    let device_secret = parts[2];
    let signature = parts[3];

    if version != COOKIE_VERSION
        || device_id.is_empty()
        || device_secret.is_empty()
        || signature.is_empty()
    {
        return None;
    }

    let payload = format!("{version}.{device_id}.{device_secret}");
    let expected_signature = sign_device_cookie_payload(secret, &payload)?;

    if !constant_time_eq(signature.as_bytes(), expected_signature.as_bytes()) {
        return None;
    }

    Some(DeviceCredential {
        device_id: device_id.to_owned(),
        secret: device_secret.to_owned(),
    })
}

// Mirrors apps/web multi-account/crypto.ts:
//   deriveKey(purpose) = HMAC-SHA256(secret, "tuturuuu:web-multi-account:{purpose}:v1")
fn derive_key(secret: &str, purpose: &str) -> Option<Vec<u8>> {
    let mut hmac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    hmac.update(format!("tuturuuu:web-multi-account:{purpose}:v1").as_bytes());
    Some(hmac.finalize().into_bytes().to_vec())
}

//   signDeviceCookiePayload(payload) =
//     base64url(HMAC-SHA256(deriveKey("device-cookie-signing"), payload))
fn sign_device_cookie_payload(secret: &str, payload: &str) -> Option<String> {
    let key = derive_key(secret, "device-cookie-signing")?;
    let mut hmac = HmacSha256::new_from_slice(&key).ok()?;
    hmac.update(payload.as_bytes());
    Some(URL_SAFE_NO_PAD.encode(hmac.finalize().into_bytes()))
}

//   hashDeviceSecret(secret) =
//     base64url(HMAC-SHA256(deriveKey("device-secret-hash"), secret))
fn hash_device_secret(secret: &str, device_secret: &str) -> String {
    let Some(key) = derive_key(secret, "device-secret-hash") else {
        return String::new();
    };
    let Ok(mut hmac) = HmacSha256::new_from_slice(&key) else {
        return String::new();
    };
    hmac.update(device_secret.as_bytes());
    URL_SAFE_NO_PAD.encode(hmac.finalize().into_bytes())
}

// Mirrors resolveMultiAccountSecret: WEB_MULTI_ACCOUNT_SESSION_SECRET first,
// then the Supabase service role key. The backend config does not currently
// surface WEB_MULTI_ACCOUNT_SESSION_SECRET, so we fall back to the service role
// key exposed via contact_data. See module notes / integrator follow-up.
fn multi_account_secret(config: &BackendConfig) -> Option<String> {
    config
        .contact_data
        .service_role_key()
        .map(|key| key.to_owned())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn to_timestamp(value: Option<&str>) -> Option<i64> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    iso8601_to_millis(value)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn empty_accounts_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        WebAccountsResponse {
            accounts: Vec::new(),
            active_account_id: None,
        },
    ))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "accounts": [],
            "activeAccountId": serde_json::Value::Null,
            "diagnosticCode": diagnostic_code(),
            "error": "Failed to load accounts",
        }),
    ))
}

fn diagnostic_code() -> String {
    let suffix = pseudo_random_hex_upper();
    format!("{DIAGNOSTIC_PREFIX}-{suffix}")
}

fn pseudo_random_hex_upper() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    // 3 bytes -> 6 uppercase hex chars, matching randomBytes(3).toString('hex').
    let bytes = [
        (nanos & 0xff) as u8,
        ((nanos >> 8) & 0xff) as u8,
        ((nanos >> 16) & 0xff) as u8,
    ];
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<String>()
}

fn current_iso8601() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    millis_to_iso8601(now as i64)
}

// Parse an ISO-8601 / RFC-3339 timestamp into epoch milliseconds. Supports the
// common shapes Postgres/PostgREST returns: "YYYY-MM-DDTHH:MM:SS[.fff][Z|+HH:MM]"
// and "YYYY-MM-DD HH:MM:SS[.fff][+00]". Returns None on parse failure.
fn iso8601_to_millis(value: &str) -> Option<i64> {
    let normalized = value.replace(' ', "T");
    let bytes = normalized.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i64 = normalized.get(0..4)?.parse().ok()?;
    let month: i64 = normalized.get(5..7)?.parse().ok()?;
    let day: i64 = normalized.get(8..10)?.parse().ok()?;
    let hour: i64 = normalized.get(11..13)?.parse().ok()?;
    let minute: i64 = normalized.get(14..16)?.parse().ok()?;
    let second: i64 = normalized.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let tail = &normalized[19..];
    let mut millis_fraction: i64 = 0;
    if let Some(stripped) = tail.strip_prefix('.') {
        let frac_digits: String = stripped
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        let mut frac = frac_digits;
        frac.truncate(3);
        while frac.len() < 3 {
            frac.push('0');
        }
        millis_fraction = frac.parse().unwrap_or(0);
    }

    let tz_offset_seconds = parse_tz_offset(tail);

    let days = days_from_civil(year, month, day);
    let epoch_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - tz_offset_seconds;

    Some(epoch_seconds * 1_000 + millis_fraction)
}

// Parse the timezone designator portion (everything after the seconds field),
// e.g. "Z", "+07:00", "-0500", ".123Z", "+00". Returns the offset in seconds to
// SUBTRACT from local-clock seconds to reach UTC.
fn parse_tz_offset(tail: &str) -> i64 {
    // Skip a leading fractional-seconds component if present.
    let tail = if let Some(stripped) = tail.strip_prefix('.') {
        let digits = stripped.chars().take_while(|c| c.is_ascii_digit()).count();
        &stripped[digits..]
    } else {
        tail
    };

    let tail = tail.trim();
    if tail.is_empty() || tail.eq_ignore_ascii_case("Z") {
        return 0;
    }

    let (sign, rest) = if let Some(rest) = tail.strip_prefix('+') {
        (1, rest)
    } else if let Some(rest) = tail.strip_prefix('-') {
        (-1, rest)
    } else {
        return 0;
    };

    let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    let (hours, minutes): (i64, i64) = match digits.len() {
        2 => (digits.parse().unwrap_or(0), 0),
        4 => (
            digits[0..2].parse().unwrap_or(0),
            digits[2..4].parse().unwrap_or(0),
        ),
        _ => (0, 0),
    };

    sign * (hours * 3_600 + minutes * 60)
}

fn millis_to_iso8601(millis: i64) -> String {
    let total_seconds = millis.div_euclid(1_000);
    let millis_part = millis.rem_euclid(1_000);
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis_part:03}Z")
}

// Howard Hinnant's days_from_civil / civil_from_days algorithms.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

#[cfg(test)]
mod tests;
