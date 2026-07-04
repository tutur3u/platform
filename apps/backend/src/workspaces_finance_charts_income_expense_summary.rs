use serde::{Deserialize, Serialize};
use serde_json::{Number, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const INCOME_EXPENSE_SUMMARY_PATH_PREFIX: &str = "/api/workspaces/";
const INCOME_EXPENSE_SUMMARY_PATH_SUFFIX: &str = "/finance/charts/income-expense-summary";
const GET_INCOME_EXPENSE_SUMMARY_RPC: &str = "get_income_expense_chart_summary";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_FINANCE_STATS_PERMISSION: &str = "view_finance_stats";

// Mirrors MAX_COLOR_LENGTH from @tuturuuu/utils/constants, used by the legacy
// query schema as the max accepted length for the date strings.
const MAX_COLOR_LENGTH: usize = 50;
const MAX_FINANCE_DAILY_DATE_RANGE_DAYS: i64 = 366;
const MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS: i64 = 3660;
const MS_PER_DAY: i64 = 24 * 60 * 60 * 1000;

const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const INTERNAL_ERROR_MESSAGE: &str =
    "Internal server error while fetching income expense chart summary";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Interval {
    Daily,
    Monthly,
}

impl Interval {
    fn as_str(self) -> &'static str {
        match self {
            Interval::Daily => "daily",
            Interval::Monthly => "monthly",
        }
    }

    fn max_days(self) -> i64 {
        match self {
            Interval::Daily => MAX_FINANCE_DAILY_DATE_RANGE_DAYS,
            Interval::Monthly => MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS,
        }
    }
}

#[derive(Debug)]
struct IncomeExpenseSummaryQuery {
    start_date: Option<String>,
    end_date: Option<String>,
    include_confidential: bool,
    interval: Interval,
}

#[derive(Serialize)]
struct IncomeExpenseSummaryRpcRequest<'a> {
    _actor_id: &'a str,
    _ws_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    _start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _end_date: Option<&'a str>,
    include_confidential: bool,
    _interval: &'a str,
}

#[derive(Deserialize, Default)]
struct IncomeExpenseSummaryRpcResponse {
    #[serde(default)]
    average_expense: Option<Value>,
    #[serde(default)]
    average_income: Option<Value>,
    #[serde(default)]
    closing_balance: Option<Value>,
    #[serde(default)]
    data: Option<Vec<IncomeExpenseSummaryPoint>>,
    #[serde(default)]
    net_total: Option<Value>,
    #[serde(default)]
    opening_balance: Option<Value>,
    #[serde(default)]
    total_expense: Option<Value>,
    #[serde(default)]
    total_income: Option<Value>,
}

#[derive(Deserialize)]
struct IncomeExpenseSummaryPoint {
    #[serde(default)]
    period: Option<Value>,
    #[serde(default)]
    total_expense: Option<Value>,
    #[serde(default)]
    total_income: Option<Value>,
}

pub(crate) async fn handle_workspaces_finance_charts_income_expense_summary_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = income_expense_summary_ws_id(request.path)?;

    Some(match request.method {
        "GET" => income_expense_summary_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn income_expense_summary_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match income_expense_summary_query_from_url(request.url) {
        Some(query) => query,
        None => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    // Validate the date range BEFORE doing any authorization or RPC work,
    // matching the legacy ordering. The max-days bound depends on the interval.
    if let Err(message) = validate_finance_date_range(
        query.start_date.as_deref(),
        query.end_date.as_deref(),
        query.interval.max_days(),
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
        Err(FinanceAuthorizationError::Forbidden) => return message_response(403, "Forbidden"),
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, INTERNAL_ERROR_MESSAGE);
        }
    };

    match fetch_income_expense_summary(&config.contact_data, outbound, &authorization, &query).await
    {
        Ok(summary) => no_store_response(json_response(200, summary)),
        Err(()) => message_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

async fn fetch_income_expense_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &IncomeExpenseSummaryQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_INCOME_EXPENSE_SUMMARY_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    // Legacy uses the service-role admin client (sbAdmin) and passes the actor
    // id explicitly via _actor_id, so use service-role auth here.
    let request_authorization = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&IncomeExpenseSummaryRpcRequest {
        _actor_id: &authorization.user_id,
        _ws_id: &authorization.ws_id,
        _start_date: query
            .start_date
            .as_deref()
            .filter(|value| !value.is_empty()),
        _end_date: query.end_date.as_deref().filter(|value| !value.is_empty()),
        include_confidential: query.include_confidential,
        _interval: query.interval.as_str(),
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &request_authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // The RPC returns a single JSON object (or null). Mirror the legacy
    // `rpcResponseSchema.parse(data ?? {})` by coercing every numeric field with
    // a default of 0 and defaulting `data` to an empty array.
    let parsed = response
        .json::<Option<IncomeExpenseSummaryRpcResponse>>()
        .map_err(|_| ())?
        .unwrap_or_default();

    let data = parsed
        .data
        .unwrap_or_default()
        .into_iter()
        .map(|point| {
            json!({
                "period": coerce_string_or_empty(point.period),
                "total_expense": coerce_number_or_zero(point.total_expense),
                "total_income": coerce_number_or_zero(point.total_income),
            })
        })
        .collect::<Vec<Value>>();

    Ok(json!({
        "average_expense": coerce_number_or_zero(parsed.average_expense),
        "average_income": coerce_number_or_zero(parsed.average_income),
        "closing_balance": coerce_number_or_zero(parsed.closing_balance),
        "data": data,
        "net_total": coerce_number_or_zero(parsed.net_total),
        "opening_balance": coerce_number_or_zero(parsed.opening_balance),
        "total_expense": coerce_number_or_zero(parsed.total_expense),
        "total_income": coerce_number_or_zero(parsed.total_income),
    }))
}

// Mirrors `z.coerce.number().default(0)`: numbers pass through, numeric strings
// are coerced, everything else (incl. null/absent) becomes 0.
fn coerce_number_or_zero(value: Option<Value>) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number),
        Some(Value::String(text)) => text
            .trim()
            .parse::<f64>()
            .ok()
            .and_then(Number::from_f64)
            .map(Value::Number)
            .unwrap_or_else(|| json!(0)),
        _ => json!(0),
    }
}

// Mirrors `period: z.string()`. The RPC is expected to return a string period;
// pass strings through and fall back to an empty string for any other shape.
fn coerce_string_or_empty(value: Option<Value>) -> Value {
    match value {
        Some(Value::String(text)) => Value::String(text),
        _ => json!(""),
    }
}

fn income_expense_summary_query_from_url(
    request_url: Option<&str>,
) -> Option<IncomeExpenseSummaryQuery> {
    // Every parameter is optional in the legacy schema, with defaults applied
    // below. Default to all-empty when there is no URL.
    let mut start_date = None;
    let mut end_date = None;
    let mut include_confidential: Option<bool> = None;
    let mut interval: Option<Interval> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "startDate" if start_date.is_none() => {
                    let value = value.into_owned();
                    if value.len() > MAX_COLOR_LENGTH {
                        return None;
                    }
                    start_date = Some(value);
                }
                "endDate" if end_date.is_none() => {
                    let value = value.into_owned();
                    if value.len() > MAX_COLOR_LENGTH {
                        return None;
                    }
                    end_date = Some(value);
                }
                "includeConfidential" if include_confidential.is_none() => {
                    include_confidential = match value.as_ref() {
                        "true" => Some(true),
                        "false" => Some(false),
                        // The legacy enum only accepts 'true' | 'false'.
                        _ => return None,
                    };
                }
                "interval" if interval.is_none() => {
                    interval = match value.as_ref() {
                        "daily" => Some(Interval::Daily),
                        "monthly" => Some(Interval::Monthly),
                        // The legacy enum only accepts 'daily' | 'monthly'.
                        _ => return None,
                    };
                }
                _ => {}
            }
        }
    }

    Some(IncomeExpenseSummaryQuery {
        start_date,
        end_date,
        include_confidential: include_confidential.unwrap_or(true),
        interval: interval.unwrap_or(Interval::Daily),
    })
}

// Mirrors validateFinanceDateRange from the legacy finance/date-range.ts.
// Returns Err(message) on validation failure.
fn validate_finance_date_range(
    start_date: Option<&str>,
    end_date: Option<&str>,
    max_days: i64,
) -> Result<(), String> {
    let parsed_start = parse_finance_date(start_date);
    let parsed_end = parse_finance_date(end_date);

    // `Some(None)` here represents a present-but-unparseable date.
    if matches!(parsed_start, Some(None)) || matches!(parsed_end, Some(None)) {
        return Err("Invalid date range".to_owned());
    }

    let Some(Some(start_ms)) = parsed_start else {
        // No (usable) start date: range is unbounded and considered valid.
        return Ok(());
    };

    let effective_end_ms = match parsed_end {
        Some(Some(end_ms)) => end_ms,
        // No end date: bound by "now". We cannot compute the day count without
        // a wall clock here, so treat an open-ended-but-valid start as ok, the
        // same way the legacy code only fails on start > end or > maxDays.
        _ => return Ok(()),
    };

    if start_ms > effective_end_ms {
        return Err("Start date must be before or equal to end date".to_owned());
    }

    let range_days = (effective_end_ms - start_ms) / MS_PER_DAY + 1;
    if range_days > max_days {
        return Err(format!("Date range cannot exceed {max_days} days"));
    }

    Ok(())
}

/// Returns:
/// - `None` when the input is absent/blank (legacy `null` parse path).
/// - `Some(None)` when present but unparseable (legacy `undefined`).
/// - `Some(Some(ms))` when parsed to an epoch-millisecond value.
fn parse_finance_date(value: Option<&str>) -> Option<Option<i64>> {
    let trimmed = value.map(str::trim).filter(|value| !value.is_empty())?;
    Some(parse_date_to_millis(trimmed))
}

/// Best-effort parse mirroring JS `new Date(string)` for the date forms the
/// finance UI emits: `YYYY-MM-DD` and ISO-8601 datetimes. Returns epoch millis.
fn parse_date_to_millis(value: &str) -> Option<i64> {
    let date_part = value.split(['T', ' ']).next().unwrap_or(value);
    let mut segments = date_part.split('-');
    let year: i64 = segments.next()?.parse().ok()?;
    let month: i64 = segments.next()?.parse().ok()?;
    let day: i64 = segments.next()?.parse().ok()?;
    if segments.next().is_some() {
        return None;
    }
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    Some(days_from_civil(year, month, day) * MS_PER_DAY)
}

/// Days since the Unix epoch (1970-01-01) for a proleptic Gregorian date.
/// Howard Hinnant's `days_from_civil` algorithm.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn income_expense_summary_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(INCOME_EXPENSE_SUMMARY_PATH_PREFIX)?
        .strip_suffix(INCOME_EXPENSE_SUMMARY_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
