//! Handler for `GET /api/v1/workspaces/:wsId/finance/invoices/analytics`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/finance/invoices/analytics/route.ts`.
//!
//! Auth + permissions: the legacy route resolves the finance route auth context
//! and requires the `view_invoices` workspace permission. This handler reuses
//! `finance_auth::authorize_finance_permission` for authentication,
//! workspace-id normalization, and the permission check, matching the legacy
//! status codes:
//!   * missing/invalid session or unresolved workspace -> `401 Unauthorized`
//!   * authenticated caller lacking `view_invoices`     -> `403 Unauthorized`
//!   * invalid query parameters                         -> `400` with
//!     `{ "message": "Invalid query parameters" }`
//!   * upstream RPC failure (date-range branch)         -> `500` with
//!     `{ "message": "Error fetching invoice analytics" }`
//!
//! Data: the legacy route calls Postgres RPCs via the admin (service-role)
//! client. This handler issues the same RPC POSTs through the outbound client
//! using the service-role key. There are two response branches:
//!   1. when both `start` and `end` are present (date range), it returns
//!      `{ walletData, creatorData, hasDateRange: true, startDate, endDate }`.
//!   2. otherwise it returns
//!      `{ dailyWalletData, weeklyWalletData, monthlyWalletData,
//!         dailyCreatorData, weeklyCreatorData, monthlyCreatorData,
//!         hasDateRange: false }`.
//!
//! NOTE (error semantics, matching legacy exactly):
//!   * In the date-range branch, the two `getInvoiceTotalsByDateRange` calls
//!     THROW on RPC error, so any failure there bubbles up to the catch block
//!     and yields a 500. This handler mirrors that (Err -> 500).
//!   * In the no-date-range branch, every `get*InvoiceTotals*` helper SWALLOWS
//!     its RPC error and returns `[]`. This handler mirrors that: each RPC is
//!     independent and a failure for one period yields `[]` for that period
//!     (never a 500), so the response always has status 200 once authorized.
//!
//! The by-creator daily/weekly/monthly periods reuse
//! `get_invoice_totals_by_date_range` with date windows the legacy code derives
//! from `dayjs()` (UTC "today"); we reproduce that arithmetic with file-local
//! civil-date helpers (no external date crate, mirroring sibling handlers).

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const ANALYTICS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const ANALYTICS_PATH_SUFFIX: &str = "/finance/invoices/analytics";
const VIEW_INVOICES_PERMISSION: &str = "view_invoices";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const ANALYTICS_ERROR_MESSAGE: &str = "Error fetching invoice analytics";

const GET_INVOICE_TOTALS_BY_DATE_RANGE_RPC: &str = "get_invoice_totals_by_date_range";
const GET_DAILY_INVOICE_TOTALS_RPC: &str = "get_daily_invoice_totals";
const GET_WEEKLY_INVOICE_TOTALS_RPC: &str = "get_weekly_invoice_totals";
const GET_MONTHLY_INVOICE_TOTALS_RPC: &str = "get_monthly_invoice_totals";

const MS_PER_DAY: i64 = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Query parsing (mirrors analytics-query.ts zod schema)
// ---------------------------------------------------------------------------

enum Granularity {
    Daily,
    Weekly,
    Monthly,
}

struct AnalyticsQuery {
    wallet_ids: Vec<String>,
    user_ids: Vec<String>,
    start: Option<String>,
    end: Option<String>,
    granularity: Option<Granularity>,
    week_starts_on: i64,
}

// ---------------------------------------------------------------------------
// RPC request/response bodies
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct DateRangeRpcRequest<'a> {
    _ws_id: &'a str,
    start_date: &'a str,
    end_date: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    wallet_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_ids: Option<&'a [String]>,
    group_by_creator: bool,
    week_start_day: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    interval_type: Option<&'a str>,
}

#[derive(Serialize)]
struct DailyRpcRequest<'a> {
    _ws_id: &'a str,
    past_days: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    wallet_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_ids: Option<&'a [String]>,
}

#[derive(Serialize)]
struct WeeklyRpcRequest<'a> {
    _ws_id: &'a str,
    past_weeks: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    wallet_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_ids: Option<&'a [String]>,
    week_start_day: i64,
}

#[derive(Serialize)]
struct MonthlyRpcRequest<'a> {
    _ws_id: &'a str,
    past_months: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    wallet_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_ids: Option<&'a [String]>,
}

#[derive(Deserialize)]
struct DateRangeRow {
    #[serde(default)]
    period: Option<Value>,
    #[serde(default)]
    group_id: Option<Value>,
    #[serde(default)]
    group_name: Option<String>,
    #[serde(default)]
    group_avatar_url: Option<Value>,
    #[serde(default)]
    total_amount: Option<Value>,
    #[serde(default)]
    invoice_count: Option<Value>,
}

#[derive(Deserialize)]
struct WalletRow {
    #[serde(default)]
    period: Option<Value>,
    #[serde(default)]
    wallet_id: Option<Value>,
    #[serde(default)]
    wallet_name: Option<String>,
    #[serde(default)]
    total_amount: Option<Value>,
    #[serde(default)]
    invoice_count: Option<Value>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_finance_invoices_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = analytics_ws_id(request.path)?;

    Some(match request.method {
        "GET" => analytics_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn analytics_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Authorize first (legacy resolves access + checks `view_invoices` before
    // parsing query params).
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_INVOICES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, ANALYTICS_ERROR_MESSAGE);
        }
    };

    // Parse + validate query params (legacy zod `safeParse`).
    let query = match analytics_query_from_url(request.url) {
        Some(query) => query,
        None => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    let wallet_ids = optional_slice(&query.wallet_ids);
    let user_ids = optional_slice(&query.user_ids);
    let week_starts_on = query.week_starts_on;

    let interval_type = query
        .granularity
        .as_ref()
        .map(|granularity| match granularity {
            Granularity::Daily => "day",
            Granularity::Weekly => "week",
            Granularity::Monthly => "month",
        });

    let has_date_range = query.start.is_some() && query.end.is_some();

    if has_date_range {
        let start = query.start.as_deref().unwrap_or_default();
        let end = query.end.as_deref().unwrap_or_default();

        // Both calls THROW on RPC error in the legacy code -> 500.
        let wallet_data = match fetch_date_range(
            &config.contact_data,
            outbound,
            &authorization,
            start,
            end,
            false,
            week_starts_on,
            interval_type,
            wallet_ids,
            user_ids,
        )
        .await
        {
            Ok(data) => data,
            Err(()) => return message_response(500, ANALYTICS_ERROR_MESSAGE),
        };
        let creator_data = match fetch_date_range(
            &config.contact_data,
            outbound,
            &authorization,
            start,
            end,
            true,
            week_starts_on,
            interval_type,
            wallet_ids,
            user_ids,
        )
        .await
        {
            Ok(data) => data,
            Err(()) => return message_response(500, ANALYTICS_ERROR_MESSAGE),
        };

        return no_store_response(json_response(
            200,
            json!({
                "walletData": wallet_data,
                "creatorData": creator_data,
                "hasDateRange": true,
                "startDate": query.start,
                "endDate": query.end,
            }),
        ));
    }

    // No date range: fetch all periods for both wallet and creator grouping.
    // Each helper SWALLOWS its error and returns [] in the legacy code.
    let today = today_civil();

    let daily_wallet_data = fetch_daily(
        &config.contact_data,
        outbound,
        &authorization,
        wallet_ids,
        user_ids,
    )
    .await
    .unwrap_or_default();

    let weekly_wallet_data = fetch_weekly(
        &config.contact_data,
        outbound,
        &authorization,
        wallet_ids,
        user_ids,
        week_starts_on,
    )
    .await
    .unwrap_or_default();

    let monthly_wallet_data = fetch_monthly(
        &config.contact_data,
        outbound,
        &authorization,
        wallet_ids,
        user_ids,
    )
    .await
    .unwrap_or_default();

    // Daily by creator: CURRENT_DATE - 13 days .. CURRENT_DATE.
    let daily_start = today.subtract_days(13);
    let daily_creator_data = fetch_date_range(
        &config.contact_data,
        outbound,
        &authorization,
        &daily_start.format(),
        &today.format(),
        true,
        week_starts_on,
        None,
        wallet_ids,
        user_ids,
    )
    .await
    .unwrap_or_default();

    // Weekly by creator: start-of-current-week (per weekStartsOn) - 11 weeks .. today.
    let weekly_start = today.start_of_week(week_starts_on).subtract_days(11 * 7);
    let weekly_creator_data = fetch_date_range(
        &config.contact_data,
        outbound,
        &authorization,
        &weekly_start.format(),
        &today.format(),
        true,
        week_starts_on,
        None,
        wallet_ids,
        user_ids,
    )
    .await
    .unwrap_or_default();

    // Monthly by creator: start-of-month - 11 months .. today.
    let monthly_start = today.start_of_month().subtract_months(11);
    let monthly_creator_data = fetch_date_range(
        &config.contact_data,
        outbound,
        &authorization,
        &monthly_start.format(),
        &today.format(),
        true,
        week_starts_on,
        None,
        wallet_ids,
        user_ids,
    )
    .await
    .unwrap_or_default();

    no_store_response(json_response(
        200,
        json!({
            "dailyWalletData": daily_wallet_data,
            "weeklyWalletData": weekly_wallet_data,
            "monthlyWalletData": monthly_wallet_data,
            "dailyCreatorData": daily_creator_data,
            "weeklyCreatorData": weekly_creator_data,
            "monthlyCreatorData": monthly_creator_data,
            "hasDateRange": false,
        }),
    ))
}

// ---------------------------------------------------------------------------
// RPC fetch helpers
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn fetch_date_range(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    start_date: &str,
    end_date: &str,
    group_by_creator: bool,
    week_starts_on: i64,
    interval_type: Option<&str>,
    wallet_ids: Option<&[String]>,
    user_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let body = serde_json::to_string(&DateRangeRpcRequest {
        _ws_id: &authorization.ws_id,
        start_date,
        end_date,
        wallet_ids,
        user_ids,
        group_by_creator,
        week_start_day: week_starts_on,
        interval_type,
    })
    .map_err(|_| ())?;

    let rows = post_rpc::<DateRangeRow>(
        contact_data,
        outbound,
        GET_INVOICE_TOTALS_BY_DATE_RANGE_RPC,
        &body,
    )
    .await?;

    Ok(rows.into_iter().map(map_totals_by_group).collect())
}

async fn fetch_daily(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    wallet_ids: Option<&[String]>,
    user_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let body = serde_json::to_string(&DailyRpcRequest {
        _ws_id: &authorization.ws_id,
        past_days: 14,
        wallet_ids,
        user_ids,
    })
    .map_err(|_| ())?;

    let rows =
        post_rpc::<WalletRow>(contact_data, outbound, GET_DAILY_INVOICE_TOTALS_RPC, &body).await?;

    Ok(rows.into_iter().map(map_totals_by_wallet).collect())
}

async fn fetch_weekly(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    wallet_ids: Option<&[String]>,
    user_ids: Option<&[String]>,
    week_starts_on: i64,
) -> Result<Vec<Value>, ()> {
    let body = serde_json::to_string(&WeeklyRpcRequest {
        _ws_id: &authorization.ws_id,
        past_weeks: 12,
        wallet_ids,
        user_ids,
        week_start_day: week_starts_on,
    })
    .map_err(|_| ())?;

    let rows =
        post_rpc::<WalletRow>(contact_data, outbound, GET_WEEKLY_INVOICE_TOTALS_RPC, &body).await?;

    Ok(rows.into_iter().map(map_totals_by_wallet).collect())
}

async fn fetch_monthly(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    wallet_ids: Option<&[String]>,
    user_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let body = serde_json::to_string(&MonthlyRpcRequest {
        _ws_id: &authorization.ws_id,
        past_months: 12,
        wallet_ids,
        user_ids,
    })
    .map_err(|_| ())?;

    let rows = post_rpc::<WalletRow>(
        contact_data,
        outbound,
        GET_MONTHLY_INVOICE_TOTALS_RPC,
        &body,
    )
    .await?;

    Ok(rows.into_iter().map(map_totals_by_wallet).collect())
}

async fn post_rpc<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
) -> Result<Vec<T>, ()> {
    // Legacy reads with the admin (service-role) client.
    let rpc_url = contact_data.rpc_url(function).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // RPC may serialize a NULL result as `null`; treat that as empty (legacy
    // `data ?? []`).
    Ok(response
        .json::<Option<Vec<T>>>()
        .map_err(|_| ())?
        .unwrap_or_default())
}

// ---------------------------------------------------------------------------
// Row mapping (mirrors mapTotalsByGroup / mapTotalsByWallet)
// ---------------------------------------------------------------------------

fn map_totals_by_group(row: DateRangeRow) -> Value {
    json!({
        "period": row.period.unwrap_or(Value::Null),
        "group_id": row.group_id.unwrap_or(Value::Null),
        "group_name": group_name_or_unknown(row.group_name),
        "group_avatar_url": row.group_avatar_url.unwrap_or(Value::Null),
        "total_amount": number_or_zero(row.total_amount),
        "invoice_count": number_or_zero(row.invoice_count),
    })
}

fn map_totals_by_wallet(row: WalletRow) -> Value {
    json!({
        "period": row.period.unwrap_or(Value::Null),
        "group_id": row.wallet_id.unwrap_or(Value::Null),
        "group_name": group_name_or_unknown(row.wallet_name),
        "group_avatar_url": Value::Null,
        "total_amount": number_or_zero(row.total_amount),
        "invoice_count": number_or_zero(row.invoice_count),
    })
}

fn group_name_or_unknown(name: Option<String>) -> Value {
    // Legacy: `item.group_name || 'Unknown'` (also catches empty string).
    match name {
        Some(name) if !name.is_empty() => Value::String(name),
        _ => Value::String("Unknown".to_owned()),
    }
}

fn number_or_zero(value: Option<Value>) -> Value {
    // Legacy: `Number(item.total_amount) || 0`. Coerce string/number to f64;
    // NaN / non-numeric / falsy -> 0.
    match value {
        Some(Value::Number(number)) => {
            let as_f64 = number.as_f64().unwrap_or(0.0);
            if as_f64 == 0.0 {
                json!(0)
            } else {
                Value::Number(number)
            }
        }
        Some(Value::String(text)) => text
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|parsed| parsed.is_finite() && *parsed != 0.0)
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or_else(|| json!(0)),
        _ => json!(0),
    }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

fn optional_slice(values: &[String]) -> Option<&[String]> {
    // Legacy: `ids.length > 0 ? ids : undefined`.
    (!values.is_empty()).then_some(values)
}

fn analytics_query_from_url(request_url: Option<&str>) -> Option<AnalyticsQuery> {
    let mut wallet_ids: Vec<String> = Vec::new();
    let mut user_ids: Vec<String> = Vec::new();
    let mut start: Option<String> = None;
    let mut end: Option<String> = None;
    let mut granularity_raw: Option<String> = None;
    let mut week_starts_on_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                // Legacy `getAll('walletIds')` then `z.string().min(1)`: empty
                // strings are rejected by the schema.
                "walletIds" => {
                    if value.is_empty() {
                        return None;
                    }
                    wallet_ids.push(value.into_owned());
                }
                "userIds" => {
                    if value.is_empty() {
                        return None;
                    }
                    user_ids.push(value.into_owned());
                }
                "start" if start.is_none() => start = Some(value.into_owned()),
                "end" if end.is_none() => end = Some(value.into_owned()),
                "granularity" if granularity_raw.is_none() => {
                    granularity_raw = Some(value.into_owned());
                }
                "weekStartsOn" if week_starts_on_raw.is_none() => {
                    week_starts_on_raw = Some(value.into_owned());
                }
                _ => {}
            }
        }
    }

    // start/end: optional ISO datetime (with offset) or YYYY-MM-DD.
    if let Some(value) = start.as_deref()
        && !is_valid_analytics_date(value)
    {
        return None;
    }
    if let Some(value) = end.as_deref()
        && !is_valid_analytics_date(value)
    {
        return None;
    }

    // granularity: enum('daily','weekly','monthly') optional.
    let granularity = match granularity_raw.as_deref() {
        None => None,
        Some("daily") => Some(Granularity::Daily),
        Some("weekly") => Some(Granularity::Weekly),
        Some("monthly") => Some(Granularity::Monthly),
        Some(_) => return None,
    };

    // weekStartsOn: optional. Legacy coerces with `Number(raw)`; null -> default
    // 1. Must be an integer in [0, 6].
    let week_starts_on = match week_starts_on_raw.as_deref() {
        None => 1,
        Some(raw) => {
            let parsed = parse_js_number(raw)?;
            if parsed.fract() != 0.0 || !(0.0..=6.0).contains(&parsed) {
                return None;
            }
            parsed as i64
        }
    };

    Some(AnalyticsQuery {
        wallet_ids,
        user_ids,
        start,
        end,
        granularity,
        week_starts_on,
    })
}

/// Mirrors JS `Number(raw)` enough for the `weekStartsOn` query value:
/// trims whitespace, treats empty as `0` (JS `Number('') === 0`), rejects
/// non-numeric (`NaN`).
fn parse_js_number(raw: &str) -> Option<f64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Some(0.0);
    }
    let parsed = trimmed.parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

/// Legacy `dateSchema = union(iso.datetime({offset:true}), regex /^\d{4}-\d{2}-\d{2}$/)`.
/// Accept either a bare `YYYY-MM-DD` or an ISO-8601 datetime carrying an offset
/// (`Z` or `±HH:MM`).
fn is_valid_analytics_date(value: &str) -> bool {
    if is_plain_date(value) {
        return true;
    }
    is_iso_datetime_with_offset(value)
}

fn is_plain_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    bytes.iter().enumerate().all(|(index, byte)| match index {
        4 | 7 => *byte == b'-',
        _ => byte.is_ascii_digit(),
    })
}

fn is_iso_datetime_with_offset(value: &str) -> bool {
    // Require a date portion, a `T` separator, a time portion, and a trailing
    // offset (`Z` or `±HH:MM`). This is a structural check matching the shapes
    // the finance UI emits; it intentionally does not validate calendar bounds
    // beyond the date portion.
    if !value.is_ascii() {
        return false;
    }
    let Some((date_part, rest)) = value.split_once('T') else {
        return false;
    };
    if !is_plain_date(date_part) {
        return false;
    }
    // Offset suffix.
    let (time_part, has_offset) = if let Some(stripped) = rest.strip_suffix('Z') {
        (stripped, true)
    } else if let Some(index) = rest.rfind(['+', '-']) {
        // `±HH:MM` (5 chars) at the end.
        let offset = &rest[index..];
        let valid_offset = offset.len() == 6
            && (offset.starts_with('+') || offset.starts_with('-'))
            && offset.as_bytes()[3] == b':'
            && offset[1..3].bytes().all(|b| b.is_ascii_digit())
            && offset[4..6].bytes().all(|b| b.is_ascii_digit());
        if !valid_offset {
            return false;
        }
        (&rest[..index], true)
    } else {
        (rest, false)
    };
    if !has_offset {
        return false;
    }
    is_valid_iso_time(time_part)
}

fn is_valid_iso_time(time: &str) -> bool {
    // HH:MM[:SS[.fff]]
    let bytes = time.as_bytes();
    if bytes.len() < 5 || bytes[2] != b':' {
        return false;
    }
    if !time[0..2].bytes().all(|b| b.is_ascii_digit())
        || !time[3..5].bytes().all(|b| b.is_ascii_digit())
    {
        return false;
    }
    if bytes.len() == 5 {
        return true;
    }
    if bytes.len() < 8 || bytes[5] != b':' || !time[6..8].bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    if bytes.len() == 8 {
        return true;
    }
    bytes[8] == b'.' && bytes.len() > 9 && time[9..].bytes().all(|b| b.is_ascii_digit())
}

// ---------------------------------------------------------------------------
// Civil-date arithmetic (replaces dayjs(); UTC "today")
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct CivilDate {
    year: i64,
    month: i64,
    day: i64,
}

impl CivilDate {
    fn format(self) -> String {
        // YYYY-MM-DD (matches dayjs().format('YYYY-MM-DD')).
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    fn to_days(self) -> i64 {
        days_from_civil(self.year, self.month, self.day)
    }

    fn from_days(days: i64) -> CivilDate {
        civil_from_days(days)
    }

    fn subtract_days(self, days: i64) -> CivilDate {
        CivilDate::from_days(self.to_days() - days)
    }

    fn start_of_month(self) -> CivilDate {
        CivilDate {
            year: self.year,
            month: self.month,
            day: 1,
        }
    }

    /// dayjs `subtract(n, 'month').startOf is NOT applied here`; the legacy
    /// monthly-by-creator does `endDate.startOf('month').subtract(11,'month')`,
    /// so we operate on the already-month-started date and just shift months.
    fn subtract_months(self, months: i64) -> CivilDate {
        // self is assumed to be the first of a month here.
        let total = (self.year * 12 + (self.month - 1)) - months;
        let year = total.div_euclid(12);
        let month = total.rem_euclid(12) + 1;
        CivilDate {
            year,
            month,
            day: 1,
        }
    }

    /// Mirrors getStartOfWeek: dow = day-of-week (0=Sun..6=Sat);
    /// daysToSubtract = (dow - weekStartsOn + 7) % 7.
    fn start_of_week(self, week_starts_on: i64) -> CivilDate {
        let dow = day_of_week(self.to_days());
        let days_to_subtract = (dow - week_starts_on).rem_euclid(7);
        self.subtract_days(days_to_subtract)
    }
}

fn today_civil() -> CivilDate {
    let days = now_unix_millis().div_euclid(MS_PER_DAY);
    CivilDate::from_days(days)
}

fn now_unix_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// 0 = Sunday .. 6 = Saturday for a given days-since-epoch value.
/// 1970-01-01 (epoch day 0) was a Thursday (=4).
fn day_of_week(days: i64) -> i64 {
    (days + 4).rem_euclid(7)
}

/// Howard Hinnant's days_from_civil.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of days_from_civil (Howard Hinnant's civil_from_days).
fn civil_from_days(days: i64) -> CivilDate {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    CivilDate {
        year: if month <= 2 { year + 1 } else { year },
        month,
        day,
    }
}

// ---------------------------------------------------------------------------
// Path + response helpers
// ---------------------------------------------------------------------------

fn analytics_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(ANALYTICS_PATH_PREFIX)?
        .strip_suffix(ANALYTICS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
