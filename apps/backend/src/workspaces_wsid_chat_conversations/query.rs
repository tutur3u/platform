const DEFAULT_LIMIT: i64 = 40;
pub(super) const MAX_COMBINED_CONVERSATION_OFFSET: i64 = 1000;
const MAX_LIMIT: i64 = 100;
const MIN_LIMIT: i64 = 1;

pub(super) struct Pagination {
    pub(super) is_paginated: bool,
    pub(super) limit: i64,
    pub(super) offset: i64,
}

impl Pagination {
    pub(super) fn exceeds_native_offset_limit(&self) -> bool {
        self.is_paginated && self.offset > MAX_COMBINED_CONVERSATION_OFFSET
    }
}

fn parse_integer(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Some(0);
    }
    if let Ok(value) = trimmed.parse::<i64>() {
        return Some(value);
    }
    trimmed
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .map(|value| value.trunc() as i64)
}

pub(super) fn read_pagination(request_url: Option<&str>) -> Pagination {
    let pairs: Vec<(String, String)> = request_url
        .and_then(|url| url::Url::parse(url).ok())
        .map(|url| {
            url.query_pairs()
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect()
        })
        .unwrap_or_default();

    let limit_raw = pairs
        .iter()
        .find(|(key, _)| key == "limit")
        .map(|(_, value)| value.as_str());
    let offset_raw = pairs
        .iter()
        .find(|(key, _)| key == "offset")
        .map(|(_, value)| value.as_str());
    let is_paginated = limit_raw.is_some() || offset_raw.is_some();
    let limit = limit_raw
        .and_then(parse_integer)
        .unwrap_or(DEFAULT_LIMIT)
        .clamp(MIN_LIMIT, MAX_LIMIT);
    let offset = offset_raw.and_then(parse_integer).unwrap_or(0).max(0);

    Pagination {
        is_paginated,
        limit,
        offset,
    }
}

pub(super) fn read_archived(request_url: Option<&str>) -> &'static str {
    let raw = request_url
        .and_then(|url| url::Url::parse(url).ok())
        .and_then(|url| {
            url.query_pairs()
                .find_map(|(key, value)| (key == "archived").then(|| value.into_owned()))
        });
    match raw.as_deref() {
        Some("archived") => "archived",
        Some("all") => "all",
        _ => "active",
    }
}

pub(super) fn read_external_scope(request_url: Option<&str>) -> bool {
    request_url
        .and_then(|url| url::Url::parse(url).ok())
        .and_then(|url| {
            url.query_pairs()
                .find_map(|(key, value)| (key == "scope").then(|| value == "external"))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archived_parsing() {
        assert_eq!(read_archived(None), "active");
        assert_eq!(
            read_archived(Some("https://x.test/p?archived=archived")),
            "archived"
        );
        assert_eq!(read_archived(Some("https://x.test/p?archived=all")), "all");
        assert_eq!(
            read_archived(Some("https://x.test/p?archived=foo")),
            "active"
        );
    }

    #[test]
    fn external_scope_uses_the_first_value() {
        assert!(read_external_scope(Some(
            "https://x.test/p?scope=external&limit=40"
        )));
        assert!(!read_external_scope(Some("https://x.test/p?scope=native")));
        assert!(!read_external_scope(Some(
            "https://x.test/p?scope=native&scope=external"
        )));
        assert!(read_external_scope(Some(
            "https://x.test/p?scope=external&scope=native"
        )));
        assert!(!read_external_scope(None));
    }

    #[test]
    fn pagination_defaults_and_clamping() {
        let pagination = read_pagination(Some("https://x.test/p"));
        assert!(!pagination.is_paginated);
        assert_eq!(pagination.limit, DEFAULT_LIMIT);
        assert_eq!(pagination.offset, 0);
        assert_eq!(
            read_pagination(Some("https://x.test/p?limit=999")).limit,
            MAX_LIMIT
        );
        assert_eq!(
            read_pagination(Some("https://x.test/p?limit=0")).limit,
            MIN_LIMIT
        );
        assert_eq!(
            read_pagination(Some("https://x.test/p?limit=10&offset=20")).offset,
            20
        );
        assert_eq!(
            read_pagination(Some("https://x.test/p?offset=-5")).offset,
            0
        );
        assert!(
            !read_pagination(Some("https://x.test/p?offset=1000")).exceeds_native_offset_limit()
        );
        assert!(
            read_pagination(Some("https://x.test/p?offset=1001")).exceeds_native_offset_limit()
        );
        assert!(
            read_pagination(Some(&format!("https://x.test/p?offset={}", i64::MAX)))
                .exceeds_native_offset_limit()
        );
    }

    #[test]
    fn parse_integer_variants() {
        assert_eq!(parse_integer("40.7"), Some(40));
        assert_eq!(parse_integer(""), Some(0));
        assert_eq!(parse_integer("abc"), None);
        assert_eq!(parse_integer(&i64::MAX.to_string()), Some(i64::MAX));
    }
}
