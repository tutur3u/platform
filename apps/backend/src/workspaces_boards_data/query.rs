use super::*;

// ---------- Query parsing ----------

pub(super) fn parse_query(request_url: Option<&str>) -> ParsedQuery {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());

    let q = url
        .as_ref()
        .and_then(|url| {
            url.query_pairs()
                .find_map(|(name, value)| (name == "q").then(|| value.into_owned()))
        })
        .filter(|value| !value.is_empty());

    let page = parse_int_default(query_value(url.as_ref(), "page"), DEFAULT_PAGE);
    let page_size = parse_int_default(query_value(url.as_ref(), "pageSize"), DEFAULT_PAGE_SIZE);

    ParsedQuery { q, page, page_size }
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

/// Mirrors `parseInt(value, 10)`: parse leading integer, default when absent or
/// unparseable (NaN). Legacy zod defaults page/pageSize to "1"/"10".
fn parse_int_default(value: Option<String>, default: i64) -> i64 {
    match value {
        Some(raw) => parse_leading_int(&raw).unwrap_or(default),
        None => default,
    }
}

fn parse_leading_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut end = 0;
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    if index < bytes.len() && (bytes[index] == b'-' || bytes[index] == b'+') {
        index += 1;
    }
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
        end = index;
    }
    if end == 0 {
        return None;
    }
    trimmed[..end].parse::<i64>().ok()
}
