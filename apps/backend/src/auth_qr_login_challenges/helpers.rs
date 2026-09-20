use super::*;

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

pub(super) fn token_hash_from_action_link(action_link: &str) -> Option<String> {
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
        json!({ "error": QR_LOGIN_INVALID_CHALLENGE_ERROR }),
    ))
}

pub(super) fn generic_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": QR_LOGIN_GENERIC_ERROR }),
    ))
}

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

/// Parse an ISO-8601 / RFC-3339 timestamp (the format Postgres/Supabase emits)
/// into Unix epoch milliseconds. Supports an optional fractional-seconds
/// component and a trailing `Z` or numeric offset. Returns `None` on any
/// parse failure so callers can treat unparseable timestamps as expired.
pub(super) fn parse_iso8601_millis(value: &str) -> Option<i128> {
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
