use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_FOCUS_HISTORY_PATH: &str = "/api/v1/mira/focus/history";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FAILED_HISTORY_MESSAGE: &str = "Failed to get focus history";

const DEFAULT_LIMIT: i64 = 20;
const MAX_LIMIT: i64 = 100;
const DAY_MILLIS: i64 = 24 * 60 * 60 * 1000;

#[derive(Serialize)]
struct MiraFocusHistoryResponse {
    sessions: Vec<Value>,
    pagination: MiraFocusHistoryPagination,
    daily_data: Vec<Value>,
    week_stats: MiraFocusHistoryStats,
    month_stats: MiraFocusHistoryStats,
}

#[derive(Serialize)]
struct MiraFocusHistoryPagination {
    total: i64,
    limit: i64,
    offset: i64,
    has_more: bool,
}

#[derive(Serialize)]
struct MiraFocusHistoryStats {
    total_minutes: i64,
    total_sessions: i64,
    avg_daily_minutes: i64,
}

pub(crate) async fn handle_mira_focus_history_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MIRA_FOCUS_HISTORY_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => mira_focus_history_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn mira_focus_history_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let (limit, offset, completed_only) = parse_query_params(request.url);

    // Sessions page + exact count.
    let (sessions, count) = match fetch_sessions(
        &config.contact_data,
        outbound,
        &user_id,
        &access_token,
        limit,
        offset,
        completed_only,
    )
    .await
    {
        Ok(result) => result,
        Err(()) => return error_response(500, FAILED_HISTORY_MESSAGE),
    };

    // Daily aggregates for the past 30 days. Legacy ignores fetch errors and
    // falls back to an empty list, so we mirror that here.
    let thirty_days_ago_date = utc_date_string_days_ago(30);
    let daily_data = fetch_daily_data(
        &config.contact_data,
        outbound,
        &user_id,
        &access_token,
        &thirty_days_ago_date,
    )
    .await
    .unwrap_or_default();

    let (week_stats, month_stats) = compute_stats(&daily_data);

    let has_more = count > offset + limit;

    no_store_response(json_response(
        200,
        MiraFocusHistoryResponse {
            sessions,
            pagination: MiraFocusHistoryPagination {
                total: count,
                limit,
                offset,
                has_more,
            },
            daily_data,
            week_stats,
            month_stats,
        },
    ))
}

async fn fetch_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
    limit: i64,
    offset: i64,
    completed_only: bool,
) -> Result<(Vec<Value>, i64), ()> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("user_id", format!("eq.{user_id}")),
        ("ended_at", "not.is.null".to_owned()),
        ("order", "started_at.desc".to_owned()),
        ("limit", limit.to_string()),
        ("offset", offset.to_string()),
    ];
    if completed_only {
        params.push(("completed", "eq.true".to_owned()));
    }

    let Some(url) = contact_data.rest_url("mira_focus_sessions", &params) else {
        return Err(());
    };

    let response = send_caller_count_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let sessions = response.json::<Vec<Value>>().map_err(|_| ())?;
    let count = parse_content_range_total(response.header("Content-Range")).unwrap_or(0);

    Ok((sessions, count))
}

async fn fetch_daily_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
    since_date: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_daily_stats",
        &[
            (
                "select",
                "date,focus_minutes,focus_sessions_completed".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("date", format!("gte.{since_date}")),
            ("order", "date.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Mirror the legacy week/month rollups. Month uses the full 30-day window from
/// the query; week filters to rows whose date is within the last 7 days. Rows
/// are surfaced verbatim in `daily_data`, so the numeric fields are read out of
/// the raw JSON values here.
fn compute_stats(daily_data: &[Value]) -> (MiraFocusHistoryStats, MiraFocusHistoryStats) {
    let week_ago_millis = unix_millis_now() - 7 * DAY_MILLIS;

    let mut week_minutes: i64 = 0;
    let mut week_sessions: i64 = 0;
    let mut month_minutes: i64 = 0;
    let mut month_sessions: i64 = 0;

    for row in daily_data {
        let minutes = row
            .get("focus_minutes")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let sessions = row
            .get("focus_sessions_completed")
            .and_then(Value::as_i64)
            .unwrap_or(0);

        month_minutes += minutes;
        month_sessions += sessions;

        // `new Date("YYYY-MM-DD")` parses to UTC midnight in JS.
        let in_week = row
            .get("date")
            .and_then(Value::as_str)
            .and_then(date_string_to_utc_millis)
            .map(|millis| millis >= week_ago_millis)
            .unwrap_or(false);

        if in_week {
            week_minutes += minutes;
            week_sessions += sessions;
        }
    }

    let week_stats = MiraFocusHistoryStats {
        total_minutes: week_minutes,
        total_sessions: week_sessions,
        // Math.round(total / 7).
        avg_daily_minutes: js_round_div(week_minutes, 7),
    };
    let month_stats = MiraFocusHistoryStats {
        total_minutes: month_minutes,
        total_sessions: month_sessions,
        // Math.round(total / 30).
        avg_daily_minutes: js_round_div(month_minutes, 30),
    };

    (week_stats, month_stats)
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

/// Same as `send_caller_rest_request` but requests an exact row count via the
/// PostgREST `Prefer: count=exact` header so the total lands in `Content-Range`.
async fn send_caller_count_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())
}

fn parse_query_params(request_url: Option<&str>) -> (i64, i64, bool) {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return (DEFAULT_LIMIT, 0, false);
    };

    let mut limit = DEFAULT_LIMIT;
    let mut offset = 0i64;
    let mut completed_only = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "limit" => {
                limit = parse_js_parse_int_prefix(&value).unwrap_or(DEFAULT_LIMIT);
            }
            "offset" => {
                offset = parse_js_parse_int_prefix(&value).unwrap_or(0);
            }
            "completed_only" => {
                completed_only = value == "true";
            }
            _ => {}
        }
    }

    // Math.min(parseInt(limit), 100).
    (limit.min(MAX_LIMIT), offset, completed_only)
}

/// Mirror JavaScript `parseInt(value, 10)` prefix parsing: skip leading
/// whitespace, allow an optional sign, then take the leading decimal digits.
fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let (sign, rest) = match trimmed.strip_prefix('-') {
        Some(rest) => (-1i64, rest),
        None => (1i64, trimmed.strip_prefix('+').unwrap_or(trimmed)),
    };

    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|magnitude| sign * magnitude)
}

/// PostgREST returns the exact total as the part after the slash in
/// `Content-Range` (e.g. `0-19/57` or `*/0`). Returns the trailing total.
fn parse_content_range_total(header: Option<&str>) -> Option<i64> {
    let total = header?.rsplit('/').next()?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

/// Mirror `Math.round(total / divisor)` for non-negative integer inputs.
fn js_round_div(total: i64, divisor: i64) -> i64 {
    if divisor == 0 {
        return 0;
    }
    ((total as f64) / (divisor as f64)).round() as i64
}

fn unix_millis_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Produce the `YYYY-MM-DD` UTC date string for (now - `days`), mirroring
/// `new Date(); setDate(getDate()-days); toISOString().split('T')[0]`.
fn utc_date_string_days_ago(days: i64) -> String {
    let millis = unix_millis_now() - days * DAY_MILLIS;
    let days_since_epoch = millis.div_euclid(DAY_MILLIS);
    let (year, month, day) = civil_from_days(days_since_epoch);
    format!("{year:04}-{month:02}-{day:02}")
}

/// Parse a `YYYY-MM-DD` date string to UTC-midnight epoch millis, matching
/// JavaScript `new Date("YYYY-MM-DD").getTime()`.
fn date_string_to_utc_millis(value: &str) -> Option<i64> {
    let date_part = value.split(['T', ' ']).next().unwrap_or(value);
    let mut parts = date_part.split('-');
    let year: i64 = parts.next()?.parse().ok()?;
    let month: i64 = parts.next()?.parse().ok()?;
    let day: i64 = parts.next()?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    Some(days_from_civil(year, month, day) * DAY_MILLIS)
}

/// Days from civil date to/from epoch using Howard Hinnant's algorithms.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month, day)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
