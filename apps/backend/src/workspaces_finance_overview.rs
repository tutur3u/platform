use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const FINANCE_OVERVIEW_ERROR_MESSAGE: &str = "Failed to fetch finance overview metrics";
const FINANCE_OVERVIEW_INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const FINANCE_OVERVIEW_PATH_PREFIX: &str = "/api/workspaces/";
const FINANCE_OVERVIEW_PATH_SUFFIX: &str = "/finance/overview";
const GET_FINANCE_OVERVIEW_METRICS_RPC: &str = "get_finance_overview_metrics";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_FINANCE_STATS_PERMISSION: &str = "view_finance_stats";

// Mirrors `MAX_COLOR_LENGTH` used by the legacy `querySchema` `.max(...)` on the
// `startDate` / `endDate` strings.
const MAX_DATE_STRING_LENGTH: usize = 50;

// Mirrors `MAX_FINANCE_DAILY_DATE_RANGE_DAYS` / `MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS`
// from `apps/web/.../finance/date-range.ts`.
const MAX_FINANCE_DAILY_DATE_RANGE_DAYS: i64 = 366;
const MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS: i64 = 3660;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FinanceOverviewView {
    Date,
    Month,
    Year,
}

impl FinanceOverviewView {
    fn as_rpc_str(self) -> &'static str {
        match self {
            FinanceOverviewView::Date => "date",
            FinanceOverviewView::Month => "month",
            FinanceOverviewView::Year => "year",
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
struct FinanceOverviewQuery {
    view: FinanceOverviewView,
    start_date: Option<String>,
    end_date: Option<String>,
    include_confidential: bool,
}

#[derive(Serialize)]
struct FinanceOverviewMetricsRpcRequest<'a> {
    _actor_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    _end_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _start_date: Option<&'a str>,
    _view: &'a str,
    _ws_id: &'a str,
    include_confidential: bool,
}

#[derive(Default, Deserialize)]
struct FinanceOverviewMetricsRpcRow {
    wallet_count: Option<Value>,
    category_count: Option<Value>,
    transaction_count: Option<Value>,
    invoice_count: Option<Value>,
    total_income: Option<Value>,
    total_expense: Option<Value>,
    net_total: Option<Value>,
    recent_transaction_count: Option<Value>,
    recent_income_count: Option<Value>,
    recent_expense_count: Option<Value>,
    recent_total_income: Option<Value>,
    recent_total_expense: Option<Value>,
    recent_net_total: Option<Value>,
    latest_transaction_at: Option<String>,
}

enum DateRangeValidation {
    Ok,
    Invalid(String),
}

pub(crate) async fn handle_workspaces_finance_overview_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = finance_overview_ws_id(request.path)?;

    Some(match request.method {
        "GET" => finance_overview_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn finance_overview_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match finance_overview_query_from_url(request.url) {
        Some(query) => query,
        None => return invalid_query_response(),
    };

    let max_days = match query.view {
        FinanceOverviewView::Date => MAX_FINANCE_DAILY_DATE_RANGE_DAYS,
        FinanceOverviewView::Month | FinanceOverviewView::Year => {
            MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS
        }
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
            return unauthorized_response();
        }
        Err(FinanceAuthorizationError::Forbidden) => return insufficient_permissions_response(),
        Err(FinanceAuthorizationError::Internal) => return finance_overview_error_response(),
    };

    match fetch_finance_overview_metrics(&config.contact_data, outbound, &authorization, &query)
        .await
    {
        Ok(row) => no_store_response(json_response(200, metrics_response_body(&row))),
        Err(()) => finance_overview_error_response(),
    }
}

async fn fetch_finance_overview_metrics(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &FinanceOverviewQuery,
) -> Result<FinanceOverviewMetricsRpcRow, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_FINANCE_OVERVIEW_METRICS_RPC)
        .ok_or(())?;
    // The legacy route invokes this RPC with the service-role admin client
    // (`sbAdmin`), passing the resolved actor id explicitly.
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&FinanceOverviewMetricsRpcRequest {
        _actor_id: &authorization.user_id,
        _end_date: query.end_date.as_deref().filter(|value| !value.is_empty()),
        _start_date: query
            .start_date
            .as_deref()
            .filter(|value| !value.is_empty()),
        _view: query.view.as_rpc_str(),
        _ws_id: &authorization.ws_id,
        include_confidential: query.include_confidential,
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

    // PostgREST returns set-returning functions as a JSON array; the legacy code
    // reads `data?.[0] ?? {}`.
    let rows = response
        .json::<Vec<FinanceOverviewMetricsRpcRow>>()
        .map_err(|_| ())?;

    Ok(rows.into_iter().next().unwrap_or_default())
}

fn metrics_response_body(row: &FinanceOverviewMetricsRpcRow) -> Value {
    json!({
        "categoryCount": to_number(row.category_count.as_ref()),
        "invoiceCount": to_number(row.invoice_count.as_ref()),
        "latestTransactionAt": row.latest_transaction_at.clone(),
        "netTotal": to_number(row.net_total.as_ref()),
        "recentExpenseCount": to_number(row.recent_expense_count.as_ref()),
        "recentIncomeCount": to_number(row.recent_income_count.as_ref()),
        "recentNetTotal": to_number(row.recent_net_total.as_ref()),
        "recentTotalExpense": to_number(row.recent_total_expense.as_ref()),
        "recentTotalIncome": to_number(row.recent_total_income.as_ref()),
        "recentTransactionCount": to_number(row.recent_transaction_count.as_ref()),
        "totalExpense": to_number(row.total_expense.as_ref()),
        "totalIncome": to_number(row.total_income.as_ref()),
        "transactionCount": to_number(row.transaction_count.as_ref()),
        "walletCount": to_number(row.wallet_count.as_ref()),
    })
}

// Mirrors the legacy `toNumber(value) = Number(value ?? 0)` coercion: numeric
// strings and numbers become numbers, null/undefined/non-numeric become 0.
fn to_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number.clone()),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return json!(0);
            }
            trimmed
                .parse::<f64>()
                .ok()
                .and_then(serde_json::Number::from_f64)
                .map(Value::Number)
                .unwrap_or_else(|| json!(0))
        }
        _ => json!(0),
    }
}

fn finance_overview_query_from_url(request_url: Option<&str>) -> Option<FinanceOverviewQuery> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;

    let mut view: Option<FinanceOverviewView> = None;
    let mut start_date: Option<String> = None;
    let mut end_date: Option<String> = None;
    let mut include_confidential: Option<bool> = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "view" if view.is_none() => {
                view = Some(match value.as_ref() {
                    "date" => FinanceOverviewView::Date,
                    "month" => FinanceOverviewView::Month,
                    "year" => FinanceOverviewView::Year,
                    _ => return None,
                });
            }
            "startDate" if start_date.is_none() => {
                if value.len() > MAX_DATE_STRING_LENGTH {
                    return None;
                }
                start_date = Some(value.into_owned());
            }
            "endDate" if end_date.is_none() => {
                if value.len() > MAX_DATE_STRING_LENGTH {
                    return None;
                }
                end_date = Some(value.into_owned());
            }
            "includeConfidential" if include_confidential.is_none() => {
                include_confidential = match value.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => return None,
                };
            }
            _ => {}
        }
    }

    Some(FinanceOverviewQuery {
        view: view.unwrap_or(FinanceOverviewView::Date),
        start_date,
        end_date,
        // Legacy default is `'true'` -> `true`.
        include_confidential: include_confidential.unwrap_or(true),
    })
}

// Approximation of `validateFinanceDateRange` from `finance/date-range.ts`.
//
// Legacy semantics:
//   - A blank/absent value parses to `null` (treated as "not provided").
//   - A present-but-unparseable value parses to `undefined` -> "Invalid date range".
//   - If there is no start date, the range is always valid.
//   - Otherwise the (start..=end-or-now) span, inclusive, must not exceed maxDays,
//     and start must be <= end.
//
// This Rust port parses `YYYY-MM-DD` (optionally with a time component) into a
// day index. We cannot fully reproduce JS `Date` parsing of arbitrary strings
// without `chrono`; unparseable values are reported as "Invalid date range",
// matching the legacy `undefined` branch.
fn validate_finance_date_range(
    start_date: Option<&str>,
    end_date: Option<&str>,
    max_days: i64,
) -> DateRangeValidation {
    let parsed_start = parse_finance_date(start_date);
    let parsed_end = parse_finance_date(end_date);

    if matches!(parsed_start, ParsedDate::Invalid) || matches!(parsed_end, ParsedDate::Invalid) {
        return DateRangeValidation::Invalid("Invalid date range".to_owned());
    }

    let ParsedDate::Some(start_day) = parsed_start else {
        // No (or empty) start date -> always valid, matching legacy `if (!parsedStartDate)`.
        return DateRangeValidation::Ok;
    };

    // `effectiveEndDate = parsedEndDate ?? now`. We only have a reliable "now"
    // day count when no end date is supplied; legacy uses the current date, which
    // can only make a single supplied start date pass (it is in the past). We
    // therefore only enforce ordering / span when an end date is also supplied.
    let effective_end_day = match parsed_end {
        ParsedDate::Some(end_day) => end_day,
        ParsedDate::None => return DateRangeValidation::Ok,
        ParsedDate::Invalid => unreachable!(),
    };

    if start_day > effective_end_day {
        return DateRangeValidation::Invalid(
            "Start date must be before or equal to end date".to_owned(),
        );
    }

    let range_days = (effective_end_day - start_day) + 1;
    if range_days > max_days {
        return DateRangeValidation::Invalid(format!("Date range cannot exceed {max_days} days"));
    }

    DateRangeValidation::Ok
}

enum ParsedDate {
    Some(i64),
    None,
    Invalid,
}

// Parses an ISO-style date into a day index (days since 1970-01-01). Accepts
// `YYYY-MM-DD` with an optional `T...`/space time suffix. Blank -> `None`.
fn parse_finance_date(value: Option<&str>) -> ParsedDate {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return ParsedDate::None;
    };

    let date_part = trimmed
        .split_once(|c| c == 'T' || c == ' ')
        .map_or(trimmed, |(date, _)| date);

    let mut segments = date_part.split('-');
    let (Some(year), Some(month), Some(day), None) = (
        segments.next(),
        segments.next(),
        segments.next(),
        segments.next(),
    ) else {
        return ParsedDate::Invalid;
    };

    let (Ok(year), Ok(month), Ok(day)) = (
        year.parse::<i64>(),
        month.parse::<u32>(),
        day.parse::<u32>(),
    ) else {
        return ParsedDate::Invalid;
    };

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return ParsedDate::Invalid;
    }

    ParsedDate::Some(days_from_civil(year, month, day))
}

// Howard Hinnant's days_from_civil algorithm: days since 1970-01-01.
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let month = i64::from(month);
    let day = i64::from(day);
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn finance_overview_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(FINANCE_OVERVIEW_PATH_PREFIX)?
        .strip_suffix(FINANCE_OVERVIEW_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn invalid_query_response() -> BackendResponse {
    message_response(400, FINANCE_OVERVIEW_INVALID_QUERY_MESSAGE)
}

fn unauthorized_response() -> BackendResponse {
    message_response(401, "Unauthorized")
}

fn insufficient_permissions_response() -> BackendResponse {
    message_response(403, "Insufficient permissions")
}

fn finance_overview_error_response() -> BackendResponse {
    message_response(500, FINANCE_OVERVIEW_ERROR_MESSAGE)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
