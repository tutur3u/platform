use crate::outbound::OutboundResponse;

pub(crate) const COURSE_MODULES_PATH_PREFIX: &str = "/api/v1/workspaces/";

const COURSE_MODULES_PATH_SUFFIX: &str = "/course-modules";
const DEFAULT_PAGE_SIZE: i64 = 20;
const LINKED_MODULES_MIDDLE: &str = "/quiz-sets/";
const LINKED_MODULES_SUFFIX: &str = "/linked-modules";
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum EducationReadRoute<'a> {
    CourseModules { ws_id: &'a str },
    QuizSetLinkedModules { set_id: &'a str, ws_id: &'a str },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct EducationReadQuery {
    pub(crate) page: i64,
    pub(crate) page_size: i64,
    pub(crate) q: Option<String>,
}

pub(crate) fn education_read_query_from_url(request_url: Option<&str>) -> EducationReadQuery {
    let mut query = EducationReadQuery {
        page: 1,
        page_size: DEFAULT_PAGE_SIZE,
        q: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "page" => query.page = page_value(&value),
            "pageSize" => query.page_size = page_size_value(&value),
            "q" if query.q.is_none() => {
                let value = value.trim();
                if !value.is_empty() {
                    query.q = Some(value.to_owned());
                }
            }
            _ => {}
        }
    }

    query
}

pub(crate) fn education_read_range(query: &EducationReadQuery) -> String {
    let from = (query.page - 1) * query.page_size;
    format!("{from}-{}", from + query.page_size - 1)
}

pub(crate) fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

pub(crate) fn education_read_route(path: &str) -> Option<EducationReadRoute<'_>> {
    let tail = path.strip_prefix(COURSE_MODULES_PATH_PREFIX)?;
    let (ws_id, rest) = tail.split_once('/')?;
    if ws_id.is_empty() {
        return None;
    }
    if rest == COURSE_MODULES_PATH_SUFFIX.trim_start_matches('/') {
        return Some(EducationReadRoute::CourseModules { ws_id });
    }
    let rest = rest.strip_prefix(LINKED_MODULES_MIDDLE.trim_start_matches('/'))?;
    let (set_id, suffix) = rest.split_once('/')?;

    (suffix == LINKED_MODULES_SUFFIX.trim_start_matches('/') && !set_id.is_empty())
        .then_some(EducationReadRoute::QuizSetLinkedModules { set_id, ws_id })
}

fn page_value(value: &str) -> i64 {
    let value = parse_js_parse_int_prefix(value).unwrap_or(1);

    if value == 0 { 1 } else { value.max(1) }
}

fn page_size_value(value: &str) -> i64 {
    let value = parse_js_parse_int_prefix(value).unwrap_or(DEFAULT_PAGE_SIZE);
    let value = if value == 0 { DEFAULT_PAGE_SIZE } else { value };

    value.clamp(1, MAX_PAGE_SIZE)
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
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
