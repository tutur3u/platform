use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const QR_LOGIN_GENERIC_ERROR: &str = "Unable to process QR login right now.";
const QR_LOGIN_INVALID_CHALLENGE_ERROR: &str = "Invalid or expired QR login request.";
const INVALID_REQUEST_MESSAGE: &str = "Invalid request";
const SECRET_MIN_LENGTH: usize = 16;
const SECRET_MAX_LENGTH: usize = 10_000;

#[derive(Deserialize)]
struct QrLoginChallengeRow {
    approver_email: Option<String>,
    approver_user_id: Option<String>,
    expires_at: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize)]
struct QrLoginConsumedRow {
    approver_email: Option<String>,
    approver_user_id: Option<String>,
}

#[derive(Deserialize)]
struct GenerateLinkResponse {
    #[serde(default)]
    action_link: Option<String>,
    #[serde(default)]
    hashed_token: Option<String>,
    #[serde(default)]
    properties: Option<GenerateLinkProperties>,
}

#[derive(Deserialize)]
struct GenerateLinkProperties {
    #[serde(default)]
    action_link: Option<String>,
    #[serde(default)]
    hashed_token: Option<String>,
}

#[derive(Deserialize)]
struct AdminUserResponse {
    email: Option<String>,
}

#[derive(Deserialize)]
struct VerifyOtpSession {
    access_token: Option<String>,
    #[serde(default)]
    expires_at: Option<i64>,
    #[serde(default)]
    expires_in: Option<i64>,
    refresh_token: Option<String>,
    #[serde(default)]
    token_type: Option<String>,
}

#[derive(Serialize)]
struct SessionPayload {
    access_token: String,
    expires_at: Option<i64>,
    expires_in: i64,
    refresh_token: String,
    token_type: String,
}

pub(crate) async fn handle_auth_qr_login_challenges_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let challenge_id = qr_login_challenge_id(request.path)?;

    Some(match request.method {
        "GET" => poll_response(config, request, challenge_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

/// Matches the 6-segment poll path `/api/v1/auth/qr-login/challenges/:challengeId`
/// and extracts the dynamic `challengeId` segment. The 7-segment
/// `.../:challengeId/approve` path is owned by a separate module, so it is
/// deliberately rejected here (returns `None`).
fn qr_login_challenge_id(path: &str) -> Option<&str> {
    let trimmed = path.trim_matches('/');
    let mut segments = trimmed.split('/').filter(|segment| !segment.is_empty());

    if segments.next()? != "api"
        || segments.next()? != "v1"
        || segments.next()? != "auth"
        || segments.next()? != "qr-login"
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
    let Some(secret) = secret_from_url(request.url) else {
        return invalid_request_response();
    };

    let contact_data = &config.contact_data;
    let secret_hash = sha256_hex(&secret);

    let row =
        match fetch_challenge_by_secret(contact_data, outbound, challenge_id, &secret_hash).await {
            Ok(Some(row)) => row,
            Ok(None) => return invalid_challenge_response(404),
            Err(()) => return generic_error_response(),
        };

    let status = challenge_status(row.status.as_deref());

    if status == "pending" && is_expired(row.expires_at.as_deref()) {
        // Best-effort transition; legacy ignores update failures here.
        let _ = mark_expired(contact_data, outbound, challenge_id).await;
        return status_response(row.expires_at.as_deref(), "expired", false);
    }

    if status == "pending" {
        return status_response(row.expires_at.as_deref(), "pending", true);
    }

    if status != "approved" {
        return status_response(row.expires_at.as_deref(), &status, status == "consumed");
    }

    // Approved: consume the challenge and issue a session.
    let consumed = match consume_approved_challenge(contact_data, outbound, challenge_id).await {
        Ok(Some(consumed)) => consumed,
        Ok(None) | Err(()) => return generic_error_response(),
    };

    let Some(approver_user_id) = consumed.approver_user_id.filter(|id| !id.trim().is_empty())
    else {
        return generic_error_response();
    };

    match issue_session_for_user(
        contact_data,
        outbound,
        &approver_user_id,
        consumed.approver_email.as_deref(),
    )
    .await
    {
        Ok(session) => no_store_response(json_response(
            200,
            json!({
                "session": session,
                "status": "approved",
                "success": true,
            }),
        )),
        Err(()) => generic_error_response(),
    }
}

async fn fetch_challenge_by_secret(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
    secret_hash: &str,
) -> Result<Option<QrLoginChallengeRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{challenge_id}")),
            ("secret_hash", format!("eq.{secret_hash}")),
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
        .json::<Vec<QrLoginChallengeRow>>()
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

async fn consume_approved_challenge(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
) -> Result<Option<QrLoginConsumedRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("id", format!("eq.{challenge_id}")),
            ("status", "eq.approved".to_owned()),
            ("consumed_at", "is.null".to_owned()),
            ("select", "*".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let consumed_at = now_iso8601();
    let body = json!({
        "consumed_at": consumed_at,
        "status": "consumed",
    })
    .to_string();

    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        Some(&body),
        Some("return=representation"),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<QrLoginConsumedRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn issue_session_for_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    email: Option<&str>,
) -> Result<SessionPayload, ()> {
    let user_email = match email.filter(|value| !value.trim().is_empty()) {
        Some(email) => email.to_owned(),
        None => fetch_user_email(contact_data, outbound, user_id).await?,
    };

    let token_hash = generate_magic_link_token(contact_data, outbound, &user_email).await?;
    verify_magic_link_otp(contact_data, outbound, &token_hash).await
}

async fn fetch_user_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<String, ()> {
    let url = contact_data
        .auth_url(&format!("admin/users/{user_id}"))
        .ok_or(())?;

    let response =
        send_admin_auth_request(contact_data, outbound, OutboundMethod::Get, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<AdminUserResponse>()
        .map_err(|_| ())?
        .email
        .filter(|email| !email.trim().is_empty())
        .ok_or(())
}

async fn generate_magic_link_token(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    email: &str,
) -> Result<String, ()> {
    let url = contact_data.auth_url("admin/generate_link").ok_or(())?;
    let body = json!({
        "type": "magiclink",
        "email": email,
        "data": {
            "auth_client": "qr_login",
            "origin": "TUTURUUU_WEB_QR",
        },
    })
    .to_string();

    let response = send_admin_auth_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        Some(&body),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let parsed = response.json::<GenerateLinkResponse>().map_err(|_| ())?;

    // GoTrue may surface fields at the top level or nested under `properties`.
    if let Some(token) = parsed
        .hashed_token
        .or_else(|| {
            parsed
                .properties
                .as_ref()
                .and_then(|p| p.hashed_token.clone())
        })
        .filter(|token| !token.trim().is_empty())
    {
        return Ok(token);
    }

    let action_link = parsed
        .action_link
        .or_else(|| parsed.properties.and_then(|p| p.action_link))
        .filter(|link| !link.trim().is_empty())
        .ok_or(())?;

    token_hash_from_action_link(&action_link).ok_or(())
}

async fn verify_magic_link_otp(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    token_hash: &str,
) -> Result<SessionPayload, ()> {
    let url = contact_data.auth_url("verify").ok_or(())?;
    let body = json!({
        "type": "magiclink",
        "token_hash": token_hash,
    })
    .to_string();

    let response = send_admin_auth_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        Some(&body),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let session = response.json::<VerifyOtpSession>().map_err(|_| ())?;
    let access_token = session
        .access_token
        .filter(|token| !token.trim().is_empty())
        .ok_or(())?;
    let refresh_token = session
        .refresh_token
        .filter(|token| !token.trim().is_empty())
        .ok_or(())?;

    Ok(SessionPayload {
        access_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in.unwrap_or(0),
        refresh_token,
        token_type: session.token_type.unwrap_or_else(|| "bearer".to_owned()),
    })
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

async fn send_admin_auth_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
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
    if let Some(body) = body {
        request = request.with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

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

fn token_hash_from_action_link(action_link: &str) -> Option<String> {
    let url = url::Url::parse(action_link).ok()?;
    let mut token = None;
    let mut token_hash = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "token" if token.is_none() => token = Some(value.into_owned()),
            "token_hash" if token_hash.is_none() => token_hash = Some(value.into_owned()),
            _ => {}
        }
    }

    token
        .or(token_hash)
        .filter(|value| !value.trim().is_empty())
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
        json!({ "error": QR_LOGIN_INVALID_CHALLENGE_ERROR }),
    ))
}

fn generic_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": QR_LOGIN_GENERIC_ERROR }),
    ))
}

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

/// Parse an ISO-8601 / RFC-3339 timestamp (the format Postgres/Supabase emits)
/// into Unix epoch milliseconds. Supports an optional fractional-seconds
/// component and a trailing `Z` or numeric offset. Returns `None` on any
/// parse failure so callers can treat unparseable timestamps as expired.
fn parse_iso8601_millis(value: &str) -> Option<i128> {
    let value = value.trim();
    // Expect at least: YYYY-MM-DDTHH:MM:SS
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

        // Normalize to milliseconds (3 digits).
        let mut frac_millis = String::new();
        for index in 0..3 {
            frac_millis.push(frac.as_bytes().get(index).map_or('0', |&b| b as char));
        }
        millis_fraction = frac_millis.parse().unwrap_or(0);
    }

    // Timezone offset (ignore the timezone designator: Supabase emits UTC for
    // `timestamptz` columns; legacy relied on `Date` parsing which also treats
    // the wall-clock as the stored instant).
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
