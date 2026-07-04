use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Mirrors `@tuturuuu/auth/mfa-mobile-approval` constants used by the legacy
// `pollMfaMobileApprovalChallenge` flow.
const MFA_MOBILE_APPROVAL_KIND: &str = "mfa_mobile_approval";
const MFA_MOBILE_APPROVAL_COOKIE_NAME: &str = "ttr_mfa_mobile_approval";
const MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS: i128 = 12 * 60 * 60;
const MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS: i128 = MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS;

const INVALID_REQUEST_MESSAGE: &str = "Invalid request";
const AUTHENTICATION_REQUIRED_MESSAGE: &str = "Authentication required";
const GENERIC_ERROR_MESSAGE: &str = "Unable to process mobile MFA approval right now.";
const INVALID_CHALLENGE_ERROR: &str = "Invalid or expired mobile MFA approval request.";

// `MfaMobileApprovalPollQuerySchema`: secret length is `min(16).max(MAX_LONG_TEXT_LENGTH)`.
// `MAX_LONG_TEXT_LENGTH` in `@tuturuuu/utils/constants` is 10_000.
const SECRET_MIN_LENGTH: usize = 16;
const SECRET_MAX_LENGTH: usize = 10_000;

#[derive(Deserialize)]
struct ChallengeRow {
    approval_metadata: Option<Value>,
    expires_at: Option<String>,
    id: Option<String>,
    request_metadata: Option<Value>,
    status: Option<String>,
}

#[derive(Deserialize)]
struct ConsumedRow {
    // Returned representation of the consumed update; presence (non-empty) is
    // the only signal the legacy code relies on.
    #[serde(default)]
    id: Option<String>,
}

pub(crate) async fn handle_auth_mfa_mobile_challenges_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let challenge_id = mfa_mobile_challenge_id(request.path)?;

    match request.method {
        "GET" => Some(poll_response(config, request, challenge_id, outbound).await),
        // The bare-auth OPTIONS preflight for this path is handled by
        // route_request (returns a bare 204); returning None lets that flow run.
        "OPTIONS" => None,
        method => Some(no_store_response(method_not_allowed(method, "GET"))),
    }
}

/// Matches the 7-segment poll path
/// `/api/v1/auth/mfa/mobile/challenges/:challengeId` and extracts the dynamic
/// `challengeId` segment. The 8-segment `.../:challengeId/approve` path is owned
/// by a separate module, so it is deliberately rejected here (returns `None`).
fn mfa_mobile_challenge_id(path: &str) -> Option<&str> {
    let trimmed = path.trim_matches('/');
    let mut segments = trimmed.split('/').filter(|segment| !segment.is_empty());

    if segments.next()? != "api"
        || segments.next()? != "v1"
        || segments.next()? != "auth"
        || segments.next()? != "mfa"
        || segments.next()? != "mobile"
        || segments.next()? != "challenges"
    {
        return None;
    }

    let challenge_id = segments.next()?;
    if challenge_id.is_empty() || segments.next().is_some() {
        return None;
    }

    Some(challenge_id)
}

async fn poll_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    challenge_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // `MfaMobileApprovalPollQuerySchema.safeParse` + `!challengeId` guard.
    let Some(secret) = secret_from_url(request.url) else {
        return invalid_request_response();
    };

    let contact_data = &config.contact_data;

    // `getAuthenticatedMfaContext`: requires a Supabase auth user; 401 otherwise.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, AUTHENTICATION_REQUIRED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, AUTHENTICATION_REQUIRED_MESSAGE);
    };

    // `getChallengeBySecret`: id + secret_hash + approver_user_id (admin/service-role).
    let secret_hash = sha256_hex(&secret);
    let row = match fetch_challenge_by_secret(
        contact_data,
        outbound,
        challenge_id,
        &secret_hash,
        &user_id,
    )
    .await
    {
        // A null row (no match) and a query failure both collapse to the
        // invalid-challenge result in the legacy code (`getChallengeBySecret`
        // returns null on error).
        Ok(Some(row)) => row,
        Ok(None) | Err(()) => return invalid_challenge_response(404),
    };

    // `!isMobileMfaApprovalRow(row)` => invalid challenge.
    if !is_mobile_mfa_approval_row(&row) {
        return invalid_challenge_response(404);
    }

    let status = challenge_status(row.status.as_deref());

    if status == "pending" && is_expired(row.expires_at.as_deref()) {
        // Best-effort transition; legacy ignores update failures here.
        let _ = mark_expired(contact_data, outbound, challenge_id).await;
        return status_response(row.expires_at.as_deref(), "expired", false);
    }

    if status == "pending" {
        return status_response(row.expires_at.as_deref(), "pending", true);
    }

    if status == "approved" {
        return consume_approved(config, &access_token, &row, &secret, challenge_id, outbound)
            .await;
    }

    if status == "consumed" {
        return consumed_response(&access_token, &row, &secret, config);
    }

    // Any other terminal status (rejected/expired).
    status_response(row.expires_at.as_deref(), &status, false)
}

async fn consume_approved(
    config: &BackendConfig,
    access_token: &str,
    row: &ChallengeRow,
    secret: &str,
    challenge_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // `getCurrentSupabaseSessionId`: the `session_id` JWT claim.
    let Some(approver_session_id) = current_session_id(access_token) else {
        return message_response(400, GENERIC_ERROR_MESSAGE);
    };

    let consumed_at = now_iso8601();
    let mobile_mfa_valid_until =
        iso8601_from_millis(now_millis() + MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS * 1_000);

    // Merge existing approval_metadata with the new approval fields.
    let mut approval_metadata = as_object(row.approval_metadata.as_ref());
    approval_metadata.insert(
        "approverSessionId".to_owned(),
        Value::String(approver_session_id),
    );
    approval_metadata.insert(
        "mobileMfaSessionTtlSeconds".to_owned(),
        json!(MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS),
    );
    approval_metadata.insert(
        "mobileMfaValidUntil".to_owned(),
        Value::String(mobile_mfa_valid_until.clone()),
    );

    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("id", format!("eq.{challenge_id}")),
            ("status", "eq.approved".to_owned()),
            ("consumed_at", "is.null".to_owned()),
            ("select", "*".to_owned()),
        ],
    ) else {
        return message_response(500, GENERIC_ERROR_MESSAGE);
    };

    let body = json!({
        "approval_metadata": Value::Object(approval_metadata),
        "consumed_at": consumed_at,
        "status": "consumed",
    })
    .to_string();

    let consumed = match send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        Some(&body),
        Some("return=representation"),
    )
    .await
    {
        Ok(response) if (200..300).contains(&response.status) => response
            .json::<Vec<ConsumedRow>>()
            .ok()
            .and_then(|rows| rows.into_iter().next()),
        // Error or non-2xx => generic 500 (legacy: `error || !data`).
        _ => return message_response(500, GENERIC_ERROR_MESSAGE),
    };

    // `!data` (no row updated) => generic 500.
    if consumed.and_then(|row| row.id).is_none() {
        return message_response(500, GENERIC_ERROR_MESSAGE);
    }

    let mut response = no_store_response(json_response(
        200,
        json!({
            "mobileMfaVerified": true,
            "status": "approved",
            "success": true,
            "validUntil": mobile_mfa_valid_until,
        }),
    ));
    set_approval_cookie(&mut response, challenge_id, secret, config);
    response
}

fn consumed_response(
    access_token: &str,
    row: &ChallengeRow,
    secret: &str,
    config: &BackendConfig,
) -> BackendResponse {
    let valid_until = current_session_id(access_token)
        .and_then(|session_id| approval_valid_until(row.approval_metadata.as_ref(), &session_id));

    let has_valid = valid_until.is_some();
    let valid_until_value = valid_until.clone().map_or(Value::Null, Value::String);

    let mut response = no_store_response(json_response(
        200,
        json!({
            "mobileMfaVerified": has_valid,
            "status": "consumed",
            "success": has_valid,
            "validUntil": valid_until_value,
        }),
    ));

    if has_valid {
        // The challenge id used for the cookie is the row id (matches legacy).
        let challenge_id = row.id.as_deref().unwrap_or("");
        set_approval_cookie(&mut response, challenge_id, secret, config);
    }

    response
}

async fn fetch_challenge_by_secret(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
    secret_hash: &str,
    user_id: &str,
) -> Result<Option<ChallengeRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{challenge_id}")),
            ("secret_hash", format!("eq.{secret_hash}")),
            ("approver_user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        None,
        None,
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ChallengeRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn mark_expired(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("id", format!("eq.{challenge_id}")),
            ("status", "eq.pending".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let body = json!({ "status": "expired" }).to_string();
    send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        Some(&body),
        Some("return=minimal"),
    )
    .await
    .map(|_| ())
}

async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
    prefer: Option<&'static str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if body.is_some() {
        request = request.with_header("Content-Type", APPLICATION_JSON);
    }
    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }
    if let Some(body) = body {
        request = request.with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Request metadata / status helpers (mirror the legacy pure functions).
// ---------------------------------------------------------------------------

fn is_mobile_mfa_approval_row(row: &ChallengeRow) -> bool {
    as_object(row.request_metadata.as_ref())
        .get("kind")
        .and_then(Value::as_str)
        == Some(MFA_MOBILE_APPROVAL_KIND)
}

/// `approvalValidUntil`: returns the `mobileMfaValidUntil` string only when the
/// stored `approverSessionId` matches and the timestamp is still in the future.
fn approval_valid_until(
    approval_metadata: Option<&Value>,
    approver_session_id: &str,
) -> Option<String> {
    let metadata = as_object(approval_metadata);

    if metadata.get("approverSessionId").and_then(Value::as_str) != Some(approver_session_id) {
        return None;
    }

    let valid_until = metadata
        .get("mobileMfaValidUntil")
        .and_then(Value::as_str)?;
    let timestamp = parse_iso8601_millis(valid_until)?;

    (timestamp > now_millis()).then(|| valid_until.to_owned())
}

fn challenge_status(value: Option<&str>) -> String {
    match value {
        Some("approved") => "approved",
        Some("consumed") => "consumed",
        Some("expired") => "expired",
        Some("pending") => "pending",
        Some("rejected") => "rejected",
        _ => "expired",
    }
    .to_owned()
}

fn is_expired(expires_at: Option<&str>) -> bool {
    let Some(expires_at) = expires_at else {
        return true;
    };

    match parse_iso8601_millis(expires_at) {
        Some(expires_millis) => expires_millis <= now_millis(),
        None => true,
    }
}

/// Returns the object form of a JSON value, or an empty object for any
/// non-object value, matching `asRecord()`.
fn as_object(value: Option<&Value>) -> serde_json::Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => serde_json::Map::new(),
    }
}

// ---------------------------------------------------------------------------
// Response builders.
// ---------------------------------------------------------------------------

fn status_response(expires_at: Option<&str>, status: &str, success: bool) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "expiresAt": expires_at,
            "status": status,
            "success": success,
        }),
    ))
}

fn invalid_request_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "error": INVALID_REQUEST_MESSAGE }),
    ))
}

fn invalid_challenge_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "error": INVALID_CHALLENGE_ERROR }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// Appends the mobile-MFA approval `Set-Cookie` header with the same attributes
/// the legacy `NextResponse.cookies.set` used: httpOnly, maxAge, Path=/,
/// SameSite=Lax, and Secure when the deployment environment is production.
fn set_approval_cookie(
    response: &mut BackendResponse,
    challenge_id: &str,
    secret: &str,
    config: &BackendConfig,
) {
    // `buildMfaMobileApprovalCookieValue` => `${challengeId}.${secret}`.
    let cookie_value = format!("{challenge_id}.{secret}");
    let mut cookie = format!(
        "{MFA_MOBILE_APPROVAL_COOKIE_NAME}={cookie_value}; Path=/; HttpOnly; Max-Age={MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax"
    );

    if config.environment.trim().eq_ignore_ascii_case("production") {
        cookie.push_str("; Secure");
    }

    response.headers.push(("set-cookie", cookie));
}

// ---------------------------------------------------------------------------
// Query / secret extraction.
// ---------------------------------------------------------------------------

fn secret_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    let secret = url
        .query_pairs()
        .find_map(|(key, value)| (key == "secret").then(|| value.into_owned()))?;

    if secret.len() < SECRET_MIN_LENGTH || secret.len() > SECRET_MAX_LENGTH {
        return None;
    }

    Some(secret)
}

// ---------------------------------------------------------------------------
// JWT claims.
// ---------------------------------------------------------------------------

/// Reads the `session_id` claim from the JWT access token, mirroring
/// `getCurrentSupabaseSessionId` (which reads it via `supabase.auth.getClaims`).
fn current_session_id(access_token: &str) -> Option<String> {
    let payload = jwt_payload(access_token)?;
    payload
        .get("session_id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn jwt_payload(access_token: &str) -> Option<Value> {
    let mut segments = access_token.split('.');
    let _header = segments.next()?;
    let payload = segments.next()?;
    let _signature = segments.next()?;

    if segments.next().is_some() || payload.trim().is_empty() {
        return None;
    }

    let mut padded_payload = payload.to_owned();
    while padded_payload.len() % 4 != 0 {
        padded_payload.push('=');
    }
    let decoded = URL_SAFE.decode(padded_payload.as_bytes()).ok()?;

    serde_json::from_slice::<Value>(&decoded).ok()
}

// ---------------------------------------------------------------------------
// Hashing / time helpers (mirror auth_qr_login_challenges.rs).
// ---------------------------------------------------------------------------

fn sha256_hex(value: &str) -> String {
    let digest = <sha2::Sha256 as sha2::Digest>::digest(value.as_bytes());
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        let _ = std::fmt::Write::write_fmt(&mut encoded, format_args!("{byte:02x}"));
    }
    encoded
}

fn now_millis() -> i128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i128)
        .unwrap_or(0)
}

fn now_iso8601() -> String {
    iso8601_from_millis(now_millis())
}

/// Parse an ISO-8601 / RFC-3339 timestamp into Unix epoch milliseconds. Returns
/// `None` on any parse failure so callers can treat unparseable timestamps as
/// expired.
fn parse_iso8601_millis(value: &str) -> Option<i128> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i128 = value.get(0..4)?.parse().ok()?;
    let month: i128 = value.get(5..7)?.parse().ok()?;
    let day: i128 = value.get(8..10)?.parse().ok()?;
    let hour: i128 = value.get(11..13)?.parse().ok()?;
    let minute: i128 = value.get(14..16)?.parse().ok()?;
    let second: i128 = value.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut rest = &value[19..];
    let mut millis_fraction: i128 = 0;

    if let Some(stripped) = rest.strip_prefix('.') {
        let frac_end = stripped
            .find(|character: char| !character.is_ascii_digit())
            .unwrap_or(stripped.len());
        let frac = &stripped[..frac_end];
        rest = &stripped[frac_end..];

        let mut frac_millis = String::new();
        for index in 0..3 {
            frac_millis.push(frac.as_bytes().get(index).map_or('0', |&b| b as char));
        }
        millis_fraction = frac_millis.parse().unwrap_or(0);
    }

    let offset_seconds: i128 = parse_offset_seconds(rest);

    let days = days_from_civil(year, month, day);
    let epoch_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_seconds;

    Some(epoch_seconds * 1_000 + millis_fraction)
}

fn parse_offset_seconds(tz: &str) -> i128 {
    let tz = tz.trim();
    if tz.is_empty() || tz == "Z" || tz == "z" {
        return 0;
    }

    let (sign, body) = match tz.as_bytes().first() {
        Some(b'+') => (1i128, &tz[1..]),
        Some(b'-') => (-1i128, &tz[1..]),
        _ => return 0,
    };

    let body = body.replace(':', "");
    let hours: i128 = body.get(0..2).and_then(|h| h.parse().ok()).unwrap_or(0);
    let minutes: i128 = body.get(2..4).and_then(|m| m.parse().ok()).unwrap_or(0);

    sign * (hours * 3_600 + minutes * 60)
}

/// Days from the civil 1970-01-01 epoch (Howard Hinnant's algorithm).
fn days_from_civil(year: i128, month: i128, day: i128) -> i128 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn iso8601_from_millis(millis: i128) -> String {
    let total_seconds = millis.div_euclid(1_000);
    let frac_millis = millis.rem_euclid(1_000);
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{frac_millis:03}Z")
}

/// Inverse of `days_from_civil` (Howard Hinnant's algorithm).
fn civil_from_days(days: i128) -> (i128, i128, i128) {
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
