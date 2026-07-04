use serde::{Deserialize, Serialize};
use serde_json::{Number, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const BALANCE_TREND_PATH_PREFIX: &str = "/api/workspaces/";
const BALANCE_TREND_PATH_SUFFIX: &str = "/finance/charts/balance-trend";
const GET_BALANCE_TREND_RPC: &str = "get_balance_trend";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_FINANCE_STATS_PERMISSION: &str = "view_finance_stats";

// Mirrors MAX_COLOR_LENGTH from @tuturuuu/utils/constants, used by the legacy
// query schema as the max accepted length for the date strings.
const MAX_COLOR_LENGTH: usize = 50;
const MAX_FINANCE_DAILY_DATE_RANGE_DAYS: i64 = 366;
const MS_PER_DAY: i64 = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_POINTS: i64 = 60;
const MIN_MAX_POINTS: i64 = 1;
const MAX_MAX_POINTS: i64 = 366;

const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error while fetching balance trend data";

#[derive(Debug)]
struct BalanceTrendQuery {
    start_date: Option<String>,
    end_date: Option<String>,
    include_confidential: bool,
    max_points: i64,
}

#[derive(Serialize)]
struct BalanceTrendRpcRequest<'a> {
    _actor_id: &'a str,
    _ws_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    _start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _end_date: Option<&'a str>,
    include_confidential: bool,
    _max_points: i64,
}

#[derive(Deserialize)]
struct BalanceTrendPoint {
    #[serde(default)]
    date: Option<Value>,
    #[serde(default)]
    balance: Option<Value>,
}

pub(crate) async fn handle_workspaces_finance_charts_balance_trend_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = balance_trend_ws_id(request.path)?;

    Some(match request.method {
        "GET" => balance_trend_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn balance_trend_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match balance_trend_query_from_url(request.url) {
        Some(query) => query,
        None => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    // Validate the date range BEFORE doing any authorization or RPC work,
    // matching the legacy ordering.
    if let Err(message) =
        validate_finance_date_range(query.start_date.as_deref(), query.end_date.as_deref())
    {
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

    match fetch_balance_trend(&config.contact_data, outbound, &authorization, &query).await {
        Ok(points) => no_store_response(json_response(200, json!({ "data": points }))),
        Err(()) => message_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

async fn fetch_balance_trend(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &BalanceTrendQuery,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url(GET_BALANCE_TREND_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    // Legacy uses the service-role admin client (sbAdmin) and passes the actor
    // id explicitly via _actor_id, so use service-role auth here.
    let request_authorization = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&BalanceTrendRpcRequest {
        _actor_id: &authorization.user_id,
        _ws_id: &authorization.ws_id,
        _start_date: query
            .start_date
            .as_deref()
            .filter(|value| !value.is_empty()),
        _end_date: query.end_date.as_deref().filter(|value| !value.is_empty()),
        include_confidential: query.include_confidential,
        _max_points: query.max_points,
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

    let rows = response
        .json::<Option<Vec<BalanceTrendPoint>>>()
        .map_err(|_| ())?
        .unwrap_or_default();

    Ok(rows
        .into_iter()
        .map(|point| {
            json!({
                "date": point.date.unwrap_or(Value::Null),
                "balance": balance_number_or_zero(point.balance),
            })
        })
        .collect())
}

fn balance_number_or_zero(value: Option<Value>) -> Value {
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

fn balance_trend_query_from_url(request_url: Option<&str>) -> Option<BalanceTrendQuery> {
    // Default to all-empty query when there is no URL: every parameter is
    // optional in the legacy schema, with defaults applied below.
    let mut start_date = None;
    let mut end_date = None;
    let mut include_confidential: Option<bool> = None;
    let mut max_points: Option<i64> = None;

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
                "maxPoints" if max_points.is_none() => {
                    let parsed = value.trim().parse::<f64>().ok()?;
                    if !parsed.is_finite() || parsed.fract() != 0.0 {
                        return None;
                    }
                    let parsed = parsed as i64;
                    if !(MIN_MAX_POINTS..=MAX_MAX_POINTS).contains(&parsed) {
                        return None;
                    }
                    max_points = Some(parsed);
                }
                _ => {}
            }
        }
    }

    Some(BalanceTrendQuery {
        start_date,
        end_date,
        include_confidential: include_confidential.unwrap_or(true),
        max_points: max_points.unwrap_or(DEFAULT_MAX_POINTS),
    })
}

// Mirrors validateFinanceDateRange from the legacy finance/date-range.ts using
// the daily max-days bound (366). Returns Err(message) on validation failure.
fn validate_finance_date_range(
    start_date: Option<&str>,
    end_date: Option<&str>,
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
    if range_days > MAX_FINANCE_DAILY_DATE_RANGE_DAYS {
        return Err(format!(
            "Date range cannot exceed {MAX_FINANCE_DAILY_DATE_RANGE_DAYS} days"
        ));
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

fn balance_trend_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(BALANCE_TREND_PATH_PREFIX)?
        .strip_suffix(BALANCE_TREND_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
