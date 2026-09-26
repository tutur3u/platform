const DEFAULT_PAGE: u32 = 1;
const DEFAULT_PAGE_SIZE: u32 = 20;
const MAX_PAGE_SIZE: u32 = 100;
const MAX_SEARCH_LEN: usize = 200;

// ---------------------------------------------------------------------------
// Query parameters (mirror of TutoringQueueQuerySchema in shared.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub(super) struct TutoringQueueQuery {
    pub(super) group_id: Option<String>,
    pub(super) student_user_id: Option<String>,
    pub(super) reason_type: Option<String>,
    pub(super) search: String,
    pub(super) page: u32,
    pub(super) page_size: u32,
}

#[derive(Debug)]
pub(super) enum QueryParseError {
    InvalidUuid(&'static str),
    InvalidReasonType,
    SearchTooLong(&'static str),
    InvalidPage,
    InvalidPageSize,
}

// ---------------------------------------------------------------------------
// Query parsing (mirror of TutoringQueueQuerySchema.safeParse)
// ---------------------------------------------------------------------------

pub(super) fn parse_query(
    request_url: Option<&str>,
) -> Result<TutoringQueueQuery, QueryParseError> {
    let mut query = TutoringQueueQuery {
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
        ..TutoringQueueQuery::default()
    };

    let Some(parsed) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        // No URL / unparseable -> behave like an empty query (defaults).
        return Ok(query);
    };

    let mut q: Option<String> = None;
    let mut query_alias: Option<String> = None;
    let mut search_alias: Option<String> = None;

    for (key, value) in parsed.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "groupId" => {
                let value = value.trim();
                if value.is_empty() {
                    continue;
                }
                if !is_uuid(value) {
                    return Err(QueryParseError::InvalidUuid("groupId"));
                }
                query.group_id = Some(value.to_owned());
            }
            "studentUserId" => {
                let value = value.trim();
                if value.is_empty() {
                    continue;
                }
                if !is_uuid(value) {
                    return Err(QueryParseError::InvalidUuid("studentUserId"));
                }
                query.student_user_id = Some(value.to_owned());
            }
            "reasonType" => {
                if value.is_empty() {
                    continue;
                }
                if !matches!(value.as_str(), "ABSENT_RECOVERY" | "WEAK_SUPPORT" | "BOTH") {
                    return Err(QueryParseError::InvalidReasonType);
                }
                query.reason_type = Some(value);
            }
            "q" => {
                if value.len() > MAX_SEARCH_LEN {
                    return Err(QueryParseError::SearchTooLong("q"));
                }
                q = Some(value);
            }
            "query" => {
                if value.len() > MAX_SEARCH_LEN {
                    return Err(QueryParseError::SearchTooLong("query"));
                }
                query_alias = Some(value);
            }
            "search" => {
                if value.len() > MAX_SEARCH_LEN {
                    return Err(QueryParseError::SearchTooLong("search"));
                }
                search_alias = Some(value);
            }
            "page" => {
                query.page = parse_int_min(&value, 1).ok_or(QueryParseError::InvalidPage)?;
            }
            "pageSize" => {
                let parsed_page_size =
                    parse_int_min(&value, 1).ok_or(QueryParseError::InvalidPageSize)?;
                if parsed_page_size > MAX_PAGE_SIZE {
                    return Err(QueryParseError::InvalidPageSize);
                }
                query.page_size = parsed_page_size;
            }
            _ => {}
        }
    }

    // q ?? query ?? search
    query.search = q.or(query_alias).or(search_alias).unwrap_or_default();

    Ok(query)
}

fn parse_int_min(value: &str, min: u32) -> Option<u32> {
    let trimmed = value.trim();
    // z.coerce.number().int() coerces via Number(); reject non-integer values.
    let parsed = trimmed.parse::<i64>().ok()?;
    if parsed < min as i64 {
        return None;
    }
    u32::try_from(parsed).ok()
}

fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(index, byte)| match index {
        8 | 13 | 18 | 23 => *byte == b'-',
        _ => byte.is_ascii_hexdigit(),
    })
}
