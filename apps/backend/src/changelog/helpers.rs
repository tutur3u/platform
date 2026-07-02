use super::*;

pub(super) fn current_utc_timestamp_iso_millis() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = i64::try_from(duration.as_secs()).unwrap_or(i64::MAX);
    let milliseconds = duration.subsec_millis();
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_unix_epoch_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{milliseconds:03}Z")
}

pub(super) fn civil_from_unix_epoch_days(days: i64) -> (i64, i64, i64) {
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

pub(super) fn changelog_list_query_from_url(request_url: Option<&str>) -> ChangelogListQuery {
    let mut query = ChangelogListQuery {
        category: None,
        page: Some(1),
        page_size: Some(20),
        published: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "category" if query.category.is_none() && !value.is_empty() => {
                query.category = Some(value.into_owned());
            }
            "page" => query.page = parse_js_parse_int_prefix(&value),
            "pageSize" => query.page_size = parse_js_parse_int_prefix(&value),
            "published" if value == "true" => query.published = Some(true),
            "published" if value == "false" => query.published = Some(false),
            _ => {}
        }
    }

    query
}

pub(super) fn changelog_range(query: &ChangelogListQuery) -> String {
    let (Some(page), Some(page_size)) = (query.page, query.page_size) else {
        return "NaN-NaN".to_owned();
    };
    let page = i128::from(page);
    let page_size = i128::from(page_size);
    let start = (page - 1) * page_size;
    let end = start + page_size - 1;

    format!("{start}-{end}")
}

pub(super) fn changelog_total_pages(total: usize, page_size: Option<i64>) -> Option<i64> {
    let page_size = page_size?;

    if page_size == 0 {
        return None;
    }

    let total = i128::try_from(total).ok()?;
    let page_size = i128::from(page_size);
    let total_pages = if page_size > 0 {
        (total + page_size - 1) / page_size
    } else {
        total / page_size
    };

    i64::try_from(total_pages).ok()
}

pub(super) fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

pub(super) fn public_changelog_filters() -> Vec<(&'static str, String)> {
    vec![
        ("is_published", "eq.true".to_owned()),
        ("published_at", "not.is.null".to_owned()),
    ]
}

pub(super) fn changelog_list_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": CHANGELOG_LIST_ERROR_MESSAGE,
        }),
    ))
}

pub(super) fn changelog_error_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": CHANGELOG_ENTRY_NOT_FOUND_MESSAGE,
        }),
    ))
}

pub(super) fn changelog_message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": message,
        }),
    ))
}
