use super::*;

/// Mirrors zod `SearchParamsSchema.safeParse(Object.fromEntries(searchParams))`:
/// `limit` coerces to an int in `[1, 100]` (default 50) and `offset` coerces to
/// an int `>= 0` (default 0). Returns `None` when validation fails (-> 400).
/// `Object.fromEntries` keeps the LAST value for duplicate keys.
pub(super) fn parse_query(request_url: Option<&str>) -> Option<ParsedQuery> {
    let mut limit_raw: Option<String> = None;
    let mut offset_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "limit" => limit_raw = Some(value.into_owned()),
                "offset" => offset_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let limit = match coerce_int(limit_raw.as_deref(), DEFAULT_LIMIT)? {
        value if (MIN_LIMIT..=MAX_LIMIT).contains(&value) => value,
        _ => return None,
    };
    let offset = match coerce_int(offset_raw.as_deref(), DEFAULT_OFFSET)? {
        value if value >= MIN_OFFSET => value,
        _ => return None,
    };

    Some(ParsedQuery { limit, offset })
}

/// Mirrors zod `z.coerce.number().int()`: an absent value yields the default,
/// otherwise the value is coerced like JS `Number(value)` and must be a finite
/// integer. Returns `None` (validation failure) for `NaN` or non-integer input.
fn coerce_int(value: Option<&str>, default_value: i64) -> Option<i64> {
    let Some(value) = value else {
        return Some(default_value);
    };

    // `Number("")` is 0 in JS; trimmed-only whitespace also coerces to 0.
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some(0);
    }

    let parsed = trimmed.parse::<f64>().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return None;
    }

    Some(parsed as i64)
}

pub(super) fn workspaces_inventory_sales_ws_id(path: &str) -> Option<&str> {
    let path = path.split('?').next().unwrap_or(path);
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_SALES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_SALES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

pub(super) fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

pub(super) fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

pub(super) fn is_workspace_uuid_literal(value: &str) -> bool {
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

/// Parses an ISO-8601/RFC3339 timestamp into epoch milliseconds, mirroring
/// JS `new Date(value).getTime()`. Returns 0 for anything unparseable
/// (`Number.isNaN(getTime())`). Dependency-free; supports the
/// `YYYY-MM-DD[ T]HH:MM:SS[.fraction][Z|+HH:MM|+HHMM]` shapes Postgres
/// `timestamptz` columns emit through PostgREST.
pub(super) fn parse_timestamp_millis(value: &str) -> i64 {
    parse_iso8601_millis(value).unwrap_or(0)
}

fn parse_iso8601_millis(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();
    // ASCII-only guard keeps the byte-index slicing below panic-free.
    if value.len() < 19 || !value.is_ascii() {
        return None;
    }

    // Date portion: YYYY-MM-DD
    let year = parse_uint(&value[0..4])?;
    if bytes[4] != b'-' {
        return None;
    }
    let month = parse_uint(&value[5..7])?;
    if bytes[7] != b'-' {
        return None;
    }
    let day = parse_uint(&value[8..10])?;

    // Separator (space or 'T').
    if bytes[10] != b'T' && bytes[10] != b't' && bytes[10] != b' ' {
        return None;
    }

    // Time portion: HH:MM:SS
    let hour = parse_uint(&value[11..13])?;
    if bytes[13] != b':' {
        return None;
    }
    let minute = parse_uint(&value[14..16])?;
    if bytes[16] != b':' {
        return None;
    }
    let second = parse_uint(&value[17..19])?;

    // Optional fractional seconds + timezone offset.
    let mut rest = &value[19..];
    let mut millis_fraction: i64 = 0;
    if let Some(stripped) = rest.strip_prefix('.') {
        let digits: String = stripped
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if !digits.is_empty() {
            // Use the first three fractional digits as milliseconds.
            let mut frac = String::new();
            for index in 0..3 {
                frac.push(digits.as_bytes().get(index).copied().unwrap_or(b'0') as char);
            }
            millis_fraction = parse_uint(&frac)? as i64;
        }
        rest = &stripped[digits.len()..];
    }

    // Timezone offset in minutes (default 0 / UTC when absent or 'Z').
    let offset_minutes = parse_offset_minutes(rest)?;

    let days = days_from_civil(year as i64, month as i64, day as i64)?;
    let mut total_seconds =
        days * 86_400 + (hour as i64) * 3_600 + (minute as i64) * 60 + (second as i64);
    total_seconds -= offset_minutes * 60;

    Some(total_seconds * 1_000 + millis_fraction)
}

fn parse_uint(value: &str) -> Option<u64> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse::<u64>().ok()
}

fn parse_offset_minutes(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("z") {
        return Some(0);
    }

    let (sign, rest) = match value.as_bytes()[0] {
        b'+' => (1i64, &value[1..]),
        b'-' => (-1i64, &value[1..]),
        _ => return None,
    };

    let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    let (hours, minutes) = match digits.len() {
        // +HH:MM / +HHMM
        4 => (parse_uint(&digits[0..2])?, parse_uint(&digits[2..4])?),
        // +HH
        2 => (parse_uint(&digits[0..2])?, 0),
        _ => return None,
    };

    Some(sign * ((hours as i64) * 60 + minutes as i64))
}

/// Days since the Unix epoch for a civil (proleptic Gregorian) date. Based on
/// Howard Hinnant's `days_from_civil` algorithm.
fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(era * 146_097 + day_of_era - 719_468)
}
