use super::*;

pub(super) fn is_mobile_mfa_approval_row(row: &ChallengeRow) -> bool {
    as_object(row.request_metadata.as_ref())
        .get("kind")
        .and_then(Value::as_str)
        == Some(MFA_MOBILE_APPROVAL_KIND)
}

/// `approvalValidUntil`: returns the `mobileMfaValidUntil` string only when the
/// stored `approverSessionId` matches and the timestamp is still in the future.
pub(super) fn approval_valid_until(
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

pub(super) fn challenge_status(value: Option<&str>) -> String {
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

pub(super) fn is_expired(expires_at: Option<&str>) -> bool {
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
pub(super) fn as_object(value: Option<&Value>) -> serde_json::Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => serde_json::Map::new(),
    }
}

// ---------------------------------------------------------------------------
// Response builders.
// ---------------------------------------------------------------------------

pub(super) fn status_response(
    expires_at: Option<&str>,
    status: &str,
    success: bool,
) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "expiresAt": expires_at,
            "status": status,
            "success": success,
        }),
    ))
}

pub(super) fn invalid_request_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "error": INVALID_REQUEST_MESSAGE }),
    ))
}

pub(super) fn invalid_challenge_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "error": INVALID_CHALLENGE_ERROR }),
    ))
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// Mirrors `getAuthCookieName` from `@tuturuuu/supabase/auth-cookie-policy`
/// for the approval cookie. `None` means the configured prefix is one the
/// TypeScript policy rejects, so no cookie is issued (fail closed).
pub(super) fn approval_cookie_name(prefix: &str) -> Option<String> {
    let namespace = prefix
        .strip_prefix("__Host-")
        .or_else(|| prefix.strip_prefix("__Secure-"));
    let valid_charset = prefix.len() <= 64
        && prefix
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_');
    let unprefixed = namespace.unwrap_or(prefix).to_ascii_lowercase();
    let ambiguous = ["sb-", "tuturuuu_", "ttr_"]
        .iter()
        .any(|reserved| unprefixed.starts_with(reserved));
    let delimited = prefix.is_empty() || prefix.ends_with('-') || prefix.ends_with('_');
    let named = namespace.is_none_or(|rest| rest.bytes().any(|byte| byte.is_ascii_alphanumeric()));

    (valid_charset && delimited && named && (prefix.is_empty() || !ambiguous))
        .then(|| format!("{prefix}{MFA_MOBILE_APPROVAL_COOKIE_NAME}"))
}

/// Appends the mobile-MFA approval `Set-Cookie` header with the same attributes
/// the legacy `NextResponse.cookies.set` used: httpOnly, maxAge, Path=/,
/// SameSite=Lax, and Secure when the deployment environment is production or
/// the configured name carries a `__Host-`/`__Secure-` browser prefix.
pub(super) fn set_approval_cookie(
    response: &mut BackendResponse,
    challenge_id: &str,
    secret: &str,
    config: &BackendConfig,
) {
    let Some(cookie_name) = approval_cookie_name(config.auth_cookie_name_prefix.trim()) else {
        return;
    };
    // `buildMfaMobileApprovalCookieValue` => `${challengeId}.${secret}`.
    let cookie_value = format!("{challenge_id}.{secret}");
    let mut cookie = format!(
        "{cookie_name}={cookie_value}; Path=/; HttpOnly; Max-Age={MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax"
    );

    if config.environment.trim().eq_ignore_ascii_case("production")
        || cookie_name.starts_with("__Host-")
        || cookie_name.starts_with("__Secure-")
    {
        cookie.push_str("; Secure");
    }

    response.headers.push(("set-cookie", cookie));
}

// ---------------------------------------------------------------------------
// Query / secret extraction.
// ---------------------------------------------------------------------------

pub(super) fn secret_from_url(request_url: Option<&str>) -> Option<String> {
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
pub(super) fn current_session_id(access_token: &str) -> Option<String> {
    let payload = jwt_payload(access_token)?;
    payload
        .get("session_id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(super) fn jwt_payload(access_token: &str) -> Option<Value> {
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

pub(super) fn sha256_hex(value: &str) -> String {
    let digest = <sha2::Sha256 as sha2::Digest>::digest(value.as_bytes());
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        let _ = std::fmt::Write::write_fmt(&mut encoded, format_args!("{byte:02x}"));
    }
    encoded
}

pub(super) fn now_millis() -> i128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i128)
        .unwrap_or(0)
}

pub(super) fn now_iso8601() -> String {
    iso8601_from_millis(now_millis())
}

/// Parse an ISO-8601 / RFC-3339 timestamp into Unix epoch milliseconds. Returns
/// `None` on any parse failure so callers can treat unparseable timestamps as
/// expired.
pub(super) fn parse_iso8601_millis(value: &str) -> Option<i128> {
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

pub(super) fn parse_offset_seconds(tz: &str) -> i128 {
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
pub(super) fn days_from_civil(year: i128, month: i128, day: i128) -> i128 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

pub(super) fn iso8601_from_millis(millis: i128) -> String {
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
pub(super) fn civil_from_days(days: i128) -> (i128, i128, i128) {
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
mod tests {
    use super::*;

    fn approval_cookie(environment: &str, prefix: &str) -> Option<String> {
        let mut config = BackendConfig::new(environment, "backend");
        config.auth_cookie_name_prefix = prefix.to_owned();
        let mut response = message_response(200, "ok");
        set_approval_cookie(&mut response, "challenge", "secret", &config);
        response
            .headers
            .into_iter()
            .find_map(|(name, value)| (name == "set-cookie").then_some(value))
    }

    #[test]
    fn keeps_the_production_cookie_bytes_without_a_prefix() {
        assert_eq!(
            approval_cookie("production", "").as_deref(),
            Some(
                "ttr_mfa_mobile_approval=challenge.secret; Path=/; HttpOnly; Max-Age=43200; SameSite=Lax; Secure"
            )
        );
    }

    #[test]
    fn uses_the_configured_namespace_like_get_auth_cookie_name() {
        let cookie = approval_cookie("development", "staging-").unwrap();
        assert!(cookie.starts_with("staging-ttr_mfa_mobile_approval=challenge.secret;"));
        assert!(!cookie.contains("Secure"));
    }

    #[test]
    fn marks_browser_prefixed_names_secure_in_every_environment() {
        let cookie = approval_cookie("development", "__Host-staging-").unwrap();
        assert!(cookie.starts_with("__Host-staging-ttr_mfa_mobile_approval=challenge.secret;"));
        assert!(cookie.ends_with("; Secure"));
        assert!(!cookie.contains("Domain"));
    }

    #[test]
    fn issues_no_cookie_for_prefixes_the_typescript_policy_rejects() {
        let too_long = format!("{}-", "a".repeat(64));
        for prefix in [
            "staging",
            "sb-staging-",
            "ttr_",
            "TUTURUUU_x-",
            "__Host-",
            "__Secure--",
            "stage; Domain=example.com-",
            too_long.as_str(),
        ] {
            assert_eq!(approval_cookie("production", prefix), None, "{prefix}");
        }
    }
}
