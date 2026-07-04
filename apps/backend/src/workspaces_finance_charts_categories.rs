use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const CATEGORIES_CHART_ERROR_MESSAGE: &str =
    "Internal server error while fetching category breakdown";
const CATEGORIES_CHART_INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const CATEGORIES_CHART_PATH_PREFIX: &str = "/api/workspaces/";
const CATEGORIES_CHART_PATH_SUFFIX: &str = "/finance/charts/categories";
const GET_CATEGORY_BREAKDOWN_RPC: &str = "get_category_breakdown";
// The legacy route targets the `private` schema RPC via `.schema('private')`;
// for PostgREST that maps onto the `Accept-Profile`/`Content-Profile` headers.
const PRIVATE_SCHEMA: &str = "private";
const VIEW_FINANCE_STATS_PERMISSION: &str = "view_finance_stats";

// Mirrors `MAX_COLOR_LENGTH` from `@tuturuuu/utils/constants` used by the legacy
// zod schema to bound `startDate`/`endDate` query string length.
const MAX_COLOR_LENGTH: usize = 50;
// Mirrors `MAX_SHORT_TEXT_LENGTH` from `@tuturuuu/utils/constants`, used to bound
// the `timezone` query string.
const MAX_SHORT_TEXT_LENGTH: usize = 100;
// Mirrors `MAX_FINANCE_DAILY_DATE_RANGE_DAYS` / `MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS`.
const MAX_FINANCE_DAILY_DATE_RANGE_DAYS: i64 = 366;
const MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS: i64 = 3660;
const MS_PER_DAY: i64 = 24 * 60 * 60 * 1000;

const DEFAULT_TRANSACTION_TYPE: &str = "expense";
const DEFAULT_INTERVAL: &str = "monthly";
const DEFAULT_TIMEZONE: &str = "UTC";

/// Outcome of validating the optional finance date range, mirroring the legacy
/// `validateFinanceDateRange` helper.
enum DateRangeValidation {
    Ok,
    Invalid(String),
}

#[derive(Debug, Eq, PartialEq)]
struct CategoriesChartQuery {
    start_date: Option<String>,
    end_date: Option<String>,
    include_confidential: bool,
    transaction_type: String,
    interval: String,
    anchor_to_latest: bool,
    timezone: String,
}

#[derive(Serialize)]
struct CategoriesChartRpcRequest<'a> {
    _actor_id: &'a str,
    _ws_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    _start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _end_date: Option<&'a str>,
    include_confidential: bool,
    _transaction_type: &'a str,
    _interval: &'a str,
    _anchor_to_latest: bool,
    _timezone: &'a str,
}

pub(crate) async fn handle_workspaces_finance_charts_categories_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = categories_chart_ws_id(request.path)?;

    Some(match request.method {
        "GET" => categories_chart_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn categories_chart_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Parse + validate query params (legacy zod `safeParse`).
    let query = match categories_chart_query_from_url(request.url) {
        Some(query) => query,
        None => return message_response(400, CATEGORIES_CHART_INVALID_QUERY_MESSAGE),
    };

    // Validate date range (legacy `validateFinanceDateRange`). The maximum range
    // depends on the requested interval.
    let max_days = if query.interval == "daily" {
        MAX_FINANCE_DAILY_DATE_RANGE_DAYS
    } else {
        MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS
    };
    if let DateRangeValidation::Invalid(message) = validate_finance_date_range(
        query.start_date.as_deref(),
        query.end_date.as_deref(),
        max_days,
    ) {
        return message_response(400, &message);
    }

    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_FINANCE_STATS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, "Unauthorized");
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, "Forbidden");
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, CATEGORIES_CHART_ERROR_MESSAGE);
        }
    };

    match fetch_categories_chart(&config.contact_data, outbound, &authorization, &query).await {
        Ok(data) => no_store_response(json_response(200, json!({ "data": data }))),
        Err(()) => message_response(500, CATEGORIES_CHART_ERROR_MESSAGE),
    }
}

async fn fetch_categories_chart(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &CategoriesChartQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(GET_CATEGORY_BREAKDOWN_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );

    // Legacy passes `startDate || undefined` / `endDate || undefined`; empty
    // strings are treated as omitted (None), matching the `|| undefined` JS.
    let body = serde_json::to_string(&CategoriesChartRpcRequest {
        _actor_id: &authorization.user_id,
        _ws_id: &authorization.ws_id,
        _start_date: query
            .start_date
            .as_deref()
            .filter(|value| !value.is_empty()),
        _end_date: query.end_date.as_deref().filter(|value| !value.is_empty()),
        include_confidential: query.include_confidential,
        _transaction_type: &query.transaction_type,
        _interval: &query.interval,
        _anchor_to_latest: query.anchor_to_latest,
        _timezone: &query.timezone,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &request_authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Legacy returns `data || []`; a null RPC body becomes an empty array.
    response
        .json::<Value>()
        .map(|value| if value.is_null() { json!([]) } else { value })
        .map_err(|_| ())
}

fn categories_chart_query_from_url(request_url: Option<&str>) -> Option<CategoriesChartQuery> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    let mut start_date: Option<String> = None;
    let mut end_date: Option<String> = None;
    let mut include_confidential: Option<bool> = None;
    let mut transaction_type: Option<String> = None;
    let mut interval: Option<String> = None;
    let mut anchor_to_latest: Option<bool> = None;
    let mut timezone: Option<String> = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "startDate" if start_date.is_none() => start_date = Some(value.into_owned()),
            "endDate" if end_date.is_none() => end_date = Some(value.into_owned()),
            "includeConfidential" if include_confidential.is_none() => {
                include_confidential = match value.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    // Legacy zod `enum(['true','false'])` rejects other values.
                    _ => return None,
                };
            }
            "transactionType" if transaction_type.is_none() => {
                transaction_type = match value.as_ref() {
                    // Legacy zod `enum(['expense','income','all'])`.
                    "expense" | "income" | "all" => Some(value.into_owned()),
                    _ => return None,
                };
            }
            "interval" if interval.is_none() => {
                interval = match value.as_ref() {
                    // Legacy zod `enum(['daily','weekly','monthly','yearly'])`.
                    "daily" | "weekly" | "monthly" | "yearly" => Some(value.into_owned()),
                    _ => return None,
                };
            }
            "anchorToLatest" if anchor_to_latest.is_none() => {
                anchor_to_latest = match value.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    // Legacy zod `enum(['true','false'])` rejects other values.
                    _ => return None,
                };
            }
            "timezone" if timezone.is_none() => timezone = Some(value.into_owned()),
            _ => {}
        }
    }

    // Legacy: `z.string().max(MAX_COLOR_LENGTH)` for start/end dates.
    if start_date
        .as_deref()
        .is_some_and(|value| value.len() > MAX_COLOR_LENGTH)
        || end_date
            .as_deref()
            .is_some_and(|value| value.len() > MAX_COLOR_LENGTH)
    {
        return None;
    }

    // Legacy: `z.string().max(MAX_SHORT_TEXT_LENGTH)` for timezone.
    if timezone
        .as_deref()
        .is_some_and(|value| value.len() > MAX_SHORT_TEXT_LENGTH)
    {
        return None;
    }

    Some(CategoriesChartQuery {
        start_date,
        end_date,
        // Legacy zod `.default('true')`.
        include_confidential: include_confidential.unwrap_or(true),
        // Legacy zod `.default('expense')`.
        transaction_type: transaction_type.unwrap_or_else(|| DEFAULT_TRANSACTION_TYPE.to_owned()),
        // Legacy zod `.default('monthly')`.
        interval: interval.unwrap_or_else(|| DEFAULT_INTERVAL.to_owned()),
        // Legacy zod `.default('false')`.
        anchor_to_latest: anchor_to_latest.unwrap_or(false),
        // Legacy zod `.default('UTC')`.
        timezone: timezone.unwrap_or_else(|| DEFAULT_TIMEZONE.to_owned()),
    })
}

/// Port of `validateFinanceDateRange` from
/// `apps/web/.../finance/date-range.ts`.
///
/// JS `new Date(value)`: empty/whitespace -> null (treated as "no bound");
/// an unparseable value -> Invalid Date (undefined) -> rejected. We accept the
/// ISO-8601 shapes the finance UI emits (`YYYY-MM-DD` and ISO datetimes).
fn validate_finance_date_range(
    start_date: Option<&str>,
    end_date: Option<&str>,
    max_days: i64,
) -> DateRangeValidation {
    let parsed_start = parse_finance_date(start_date);
    let parsed_end = parse_finance_date(end_date);

    // Either present-but-unparseable -> Invalid date range.
    if matches!(parsed_start, ParsedDate::Invalid) || matches!(parsed_end, ParsedDate::Invalid) {
        return DateRangeValidation::Invalid("Invalid date range".to_owned());
    }

    // No start date -> nothing to bound.
    let ParsedDate::Some(start_ms) = parsed_start else {
        return DateRangeValidation::Ok;
    };

    // effectiveEndDate = parsedEndDate ?? now
    let effective_end_ms = match parsed_end {
        ParsedDate::Some(end_ms) => end_ms,
        _ => now_unix_millis(),
    };

    if start_ms > effective_end_ms {
        return DateRangeValidation::Invalid(
            "Start date must be before or equal to end date".to_owned(),
        );
    }

    let range_days = (effective_end_ms - start_ms).div_euclid(MS_PER_DAY) + 1;
    if range_days > max_days {
        // Legacy message: `Date range cannot exceed ${maxDays} days`.
        return DateRangeValidation::Invalid(format!("Date range cannot exceed {max_days} days"));
    }

    DateRangeValidation::Ok
}

enum ParsedDate {
    /// Absent or empty/whitespace value (`null` in legacy).
    None,
    /// Present but unparseable (`Invalid Date`/`undefined` in legacy).
    Invalid,
    /// Parsed to epoch milliseconds.
    Some(i64),
}

fn parse_finance_date(value: Option<&str>) -> ParsedDate {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return ParsedDate::None;
    };

    match parse_iso_to_millis(trimmed) {
        Some(millis) => ParsedDate::Some(millis),
        None => ParsedDate::Invalid,
    }
}

/// Parse a subset of ISO-8601 into epoch milliseconds (UTC). Accepts
/// `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS[.fff]]`, with an optional trailing `Z`,
/// `±HH:MM`/`±HHMM` offset, and a space separator instead of `T`.
fn parse_iso_to_millis(input: &str) -> Option<i64> {
    // Guard against multibyte input so byte-index slicing below stays on
    // char boundaries (and cannot panic).
    if !input.is_ascii() {
        return None;
    }
    let bytes = input.as_bytes();
    if bytes.len() < 10 {
        return None;
    }

    let year = parse_uint(&input[0..4])? as i64;
    if bytes[4] != b'-' {
        return None;
    }
    let month = parse_uint(&input[5..7])? as i64;
    if bytes[7] != b'-' {
        return None;
    }
    let day = parse_uint(&input[8..10])? as i64;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut millis = days_from_civil(year, month, day)?.checked_mul(MS_PER_DAY)?;

    if input.len() > 10 {
        let rest = &input[10..];
        let separator = rest.as_bytes()[0];
        if separator != b'T' && separator != b't' && separator != b' ' {
            return None;
        }
        let (time_part, offset_ms) = split_offset(&rest[1..])?;
        millis = millis.checked_add(parse_time_millis(time_part)?)?;
        millis = millis.checked_sub(offset_ms)?;
    }

    Some(millis)
}

/// Split a time string into the clock portion and its UTC offset (in ms).
/// A trailing `Z` or `±HH:MM`/`±HHMM` is interpreted; otherwise offset is 0.
fn split_offset(time: &str) -> Option<(&str, i64)> {
    if let Some(stripped) = time.strip_suffix('Z').or_else(|| time.strip_suffix('z')) {
        return Some((stripped, 0));
    }

    // Find a sign after the hours/minutes/seconds portion.
    if let Some(index) = time.rfind(['+', '-']) {
        // Ensure the sign is part of an offset (preceded by a digit).
        if index > 0 && time.as_bytes()[index - 1].is_ascii_digit() {
            let sign = if time.as_bytes()[index] == b'+' {
                1
            } else {
                -1
            };
            let raw = &time[index + 1..];
            let normalized: String = raw.chars().filter(|character| *character != ':').collect();
            if normalized.len() != 4 {
                return None;
            }
            let hours = parse_uint(&normalized[0..2])? as i64;
            let minutes = parse_uint(&normalized[2..4])? as i64;
            let offset_ms = sign * (hours * 60 + minutes) * 60 * 1000;
            return Some((&time[..index], offset_ms));
        }
    }

    Some((time, 0))
}

fn parse_time_millis(time: &str) -> Option<i64> {
    if time.len() < 5 {
        return None;
    }
    let bytes = time.as_bytes();
    let hours = parse_uint(&time[0..2])? as i64;
    if bytes[2] != b':' {
        return None;
    }
    let minutes = parse_uint(&time[3..5])? as i64;
    if !(0..=23).contains(&hours) || !(0..=59).contains(&minutes) {
        return None;
    }

    let mut millis = (hours * 60 + minutes) * 60 * 1000;

    if time.len() > 5 {
        if bytes[5] != b':' {
            return None;
        }
        let seconds = parse_uint(&time[6..8])? as i64;
        if !(0..=59).contains(&seconds) {
            return None;
        }
        millis += seconds * 1000;

        if time.len() > 8 {
            if bytes[8] != b'.' {
                return None;
            }
            let frac = &time[9..];
            if frac.is_empty() || !frac.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            let mut padded = frac.to_owned();
            padded.truncate(3);
            while padded.len() < 3 {
                padded.push('0');
            }
            millis += parse_uint(&padded)? as i64;
        }
    }

    Some(millis)
}

fn parse_uint(value: &str) -> Option<u64> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse::<u64>().ok()
}

/// Days from 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's
/// `days_from_civil`).
fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146097 + doe - 719468)
}

fn now_unix_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn categories_chart_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(CATEGORIES_CHART_PATH_PREFIX)?
        .strip_suffix(CATEGORIES_CHART_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
