//! Handler for
//! `/api/v1/workspaces/:wsId/infrastructure/realtime/analytics/summary`.
//!
//! Ports
//! `apps/web/src/app/api/v1/workspaces/[wsId]/infrastructure/realtime/analytics/summary/route.ts`.
//!
//! Notes for the integrator:
//! - The legacy route does NOT read or validate the dynamic `:wsId` path segment
//!   at all. It validates query params (`workspaceId`, `channelId`, `startDate`,
//!   `endDate`) instead, and filters the aggregation rows by those. We mirror
//!   that exactly: `:wsId` is matched only to anchor the path shape and is
//!   otherwise unused.
//! - The legacy route has NO explicit auth gate. It uses `createClient()` (a
//!   user-session, RLS-scoped Supabase client). To mirror RLS we perform the
//!   reads with the caller's access token (Bearer access_token + apikey =
//!   service_role_key, exactly like `workspace_habits_access::send_caller_rest_request`).
//!   When no caller access token is present, an RLS-scoped read would return
//!   zero rows, so we short-circuit to the legacy "empty summary" payload (the
//!   legacy code never returns 401 here; an anon session simply sees no rows).
//! - `realtime_log_aggregations`, `workspaces`, and `users` are read under the
//!   caller's RLS. This is intentionally RLS-scoped (NOT service-role), matching
//!   the legacy `createClient()` semantics. Verify RLS policies on
//!   `realtime_log_aggregations` permit the caller to read the rows the legacy
//!   route exposed.

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/infrastructure/realtime/analytics/summary";
const MAX_NAME_LENGTH: usize = 255;

#[derive(Deserialize)]
struct AggregationRow {
    ws_id: Option<String>,
    user_id: Option<String>,
    channel_id: Option<String>,
    time_bucket: Option<String>,
    kind: Option<String>,
    #[serde(default)]
    total_count: f64,
    #[serde(default)]
    error_count: f64,
}

#[derive(Deserialize)]
struct NamedRow {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct UserRow {
    id: Option<String>,
    display_name: Option<String>,
}

/// Validated query parameters (mirrors `QueryParamsSchema`).
struct QueryParams {
    workspace_id: Option<String>,
    channel_id: Option<String>,
    start_date: String,
    end_date: String,
}

pub(crate) async fn handle_workspaces_infrastructure_realtime_analytics_summary_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if !is_realtime_analytics_summary_path(request.path) {
        return None;
    }

    Some(match request.method {
        "GET" => summary_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn summary_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let params = match parse_query_params(request.url) {
        Ok(params) => params,
        Err(errors) => {
            return no_store_response(json_response(
                400,
                json!({
                    "message": "Invalid query parameters",
                    "errors": errors,
                }),
            ));
        }
    };

    // Legacy uses an RLS-scoped session client. Without a caller token an RLS
    // read returns no rows, so emit the empty summary instead of querying.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return no_store_response(json_response(200, empty_summary_payload()));
    };

    let raw_data =
        match fetch_aggregations(&config.contact_data, outbound, &params, &access_token).await {
            Ok(rows) => rows,
            Err(()) => {
                return no_store_response(json_response(
                    500,
                    json!({ "message": "Error fetching realtime analytics summary" }),
                ));
            }
        };

    if raw_data.is_empty() {
        return no_store_response(json_response(200, empty_summary_payload()));
    }

    build_summary(
        &config.contact_data,
        outbound,
        &access_token,
        &params,
        &raw_data,
    )
    .await
}

async fn build_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    params: &QueryParams,
    raw_data: &[AggregationRow],
) -> BackendResponse {
    // Unique sets.
    let mut unique_users: std::collections::BTreeSet<&str> = std::collections::BTreeSet::new();
    let mut unique_channels: std::collections::BTreeSet<&str> = std::collections::BTreeSet::new();
    let mut unique_workspaces: std::collections::BTreeSet<&str> = std::collections::BTreeSet::new();

    let mut total_requests = 0.0_f64;
    let mut total_errors = 0.0_f64;

    // requestsByKind / errorByKind preserve first-seen insertion order like a
    // JS object literal; use an ordered Vec of keys + a map.
    let mut kind_order: Vec<String> = Vec::new();
    let mut requests_by_kind: BTreeMap<String, f64> = BTreeMap::new();
    let mut error_by_kind: BTreeMap<String, (f64, f64)> = BTreeMap::new();

    // Hourly buckets, preserving insertion order.
    let mut hour_order: Vec<String> = Vec::new();
    let mut hourly_data: BTreeMap<String, f64> = BTreeMap::new();

    // Top-consumer maps (insertion-ordered for stable equal-value sorting).
    let mut ws_order: Vec<String> = Vec::new();
    let mut workspace_map: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    let mut ch_order: Vec<String> = Vec::new();
    let mut channel_map: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    let mut user_order: Vec<String> = Vec::new();
    let mut user_map: BTreeMap<String, (f64, f64)> = BTreeMap::new();

    for row in raw_data {
        let total = row.total_count;
        let errors = row.error_count;
        total_requests += total;
        total_errors += errors;

        if let Some(user_id) = row.user_id.as_deref().filter(|v| !v.is_empty()) {
            unique_users.insert(user_id);
        }
        if let Some(channel_id) = row.channel_id.as_deref().filter(|v| !v.is_empty()) {
            unique_channels.insert(channel_id);
        }
        if let Some(ws_id) = row.ws_id.as_deref() {
            unique_workspaces.insert(ws_id);
        }

        let kind = row.kind.clone().unwrap_or_default();
        if !requests_by_kind.contains_key(&kind) {
            kind_order.push(kind.clone());
        }
        *requests_by_kind.entry(kind.clone()).or_insert(0.0) += total;

        let kind_err = error_by_kind.entry(kind.clone()).or_insert((0.0, 0.0));
        kind_err.0 += errors;
        kind_err.1 += total;

        // Peak hour: derived from the time_bucket's UTC hour.
        if let Some(hour_key) = hour_key_from_time_bucket(row.time_bucket.as_deref()) {
            if !hourly_data.contains_key(&hour_key) {
                hour_order.push(hour_key.clone());
            }
            *hourly_data.entry(hour_key).or_insert(0.0) += total;
        }

        // Workspaces.
        if let Some(ws_id) = row.ws_id.as_deref() {
            if !workspace_map.contains_key(ws_id) {
                ws_order.push(ws_id.to_owned());
            }
            let entry = workspace_map.entry(ws_id.to_owned()).or_insert((0.0, 0.0));
            entry.0 += total;
            entry.1 += errors;
        }

        // Channels.
        if let Some(channel_id) = row.channel_id.as_deref().filter(|v| !v.is_empty()) {
            if !channel_map.contains_key(channel_id) {
                ch_order.push(channel_id.to_owned());
            }
            let entry = channel_map
                .entry(channel_id.to_owned())
                .or_insert((0.0, 0.0));
            entry.0 += total;
            entry.1 += errors;
        }

        // Users.
        if let Some(user_id) = row.user_id.as_deref().filter(|v| !v.is_empty()) {
            if !user_map.contains_key(user_id) {
                user_order.push(user_id.to_owned());
            }
            let entry = user_map.entry(user_id.to_owned()).or_insert((0.0, 0.0));
            entry.0 += total;
            entry.1 += errors;
        }
    }

    let error_rate = if total_requests > 0.0 {
        (total_errors / total_requests) * 100.0
    } else {
        0.0
    };

    // Peak hour (first max wins; iterate in insertion order).
    let mut peak_hour: Option<String> = None;
    let mut peak_hour_count = 0.0_f64;
    for hour in &hour_order {
        let count = *hourly_data.get(hour).unwrap_or(&0.0);
        if count > peak_hour_count {
            peak_hour = Some(hour.clone());
            peak_hour_count = count;
        }
    }

    // avgRequestsPerHour.
    let hours_diff = {
        let start_ms = parse_iso_to_epoch_ms(&params.start_date).unwrap_or(0.0);
        let end_ms = parse_iso_to_epoch_ms(&params.end_date).unwrap_or(0.0);
        let diff = (end_ms - start_ms) / (1000.0 * 60.0 * 60.0);
        diff.max(1.0)
    };
    let avg_requests_per_hour = total_requests / hours_diff;

    // requestsByKind preserving insertion order via serde_json::Map.
    let mut requests_by_kind_json = serde_json::Map::new();
    for kind in &kind_order {
        requests_by_kind_json.insert(
            kind.clone(),
            json!(number_value(*requests_by_kind.get(kind).unwrap_or(&0.0))),
        );
    }

    let summary = json!({
        "totalRequests": number_value(total_requests),
        "totalErrors": number_value(total_errors),
        "errorRate": round2(error_rate),
        "uniqueUsers": unique_users.len(),
        "uniqueChannels": unique_channels.len(),
        "uniqueWorkspaces": unique_workspaces.len(),
        "peakHour": peak_hour,
        "peakHourCount": number_value(peak_hour_count),
        "avgRequestsPerHour": round2(avg_requests_per_hour),
        "requestsByKind": Value::Object(requests_by_kind_json),
    });

    // Resolve workspace names (RLS-scoped) — best effort, like legacy.
    let workspace_ids: Vec<String> = ws_order.clone();
    let workspace_name_map =
        fetch_workspace_names(contact_data, outbound, access_token, &workspace_ids)
            .await
            .unwrap_or_default();

    // Resolve user names (RLS-scoped) — best effort, like legacy.
    let user_ids: Vec<String> = user_order.clone();
    let user_name_map = fetch_user_names(contact_data, outbound, access_token, &user_ids)
        .await
        .unwrap_or_default();

    let top_workspaces = top_consumers(&ws_order, &workspace_map, |id| {
        workspace_name_map
            .get(id)
            .cloned()
            .unwrap_or_else(|| "Unknown Workspace".to_owned())
    });

    let top_channels = top_consumers(&ch_order, &channel_map, |id| id.to_owned());

    let top_users = top_consumers(&user_order, &user_map, |id| {
        user_name_map
            .get(id)
            .cloned()
            .unwrap_or_else(|| "Unknown User".to_owned())
    });

    // Error breakdown by kind (insertion order, then stable sort desc by errors,
    // filter errors > 0).
    let mut error_breakdown: Vec<Value> = Vec::new();
    let mut breakdown_rows: Vec<(String, f64, f64)> = Vec::new();
    for kind in &kind_order {
        if let Some((errors, total)) = error_by_kind.get(kind) {
            breakdown_rows.push((kind.clone(), *errors, *total));
        }
    }
    breakdown_rows.retain(|(_, errors, _)| *errors > 0.0);
    breakdown_rows.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    for (kind, errors, total) in breakdown_rows {
        error_breakdown.push(json!({
            "kind": kind,
            "errors": number_value(errors),
            "total": number_value(total),
            "errorRate": rate_pct(errors, total),
        }));
    }

    no_store_response(json_response(
        200,
        json!({
            "summary": summary,
            "topWorkspaces": top_workspaces,
            "topChannels": top_channels,
            "topUsers": top_users,
            "errorBreakdown": error_breakdown,
        }),
    ))
}

/// Builds the top-10 consumer array, stable-sorted desc by requests.
fn top_consumers(
    order: &[String],
    map: &BTreeMap<String, (f64, f64)>,
    name_for: impl Fn(&str) -> String,
) -> Vec<Value> {
    let mut rows: Vec<(String, f64, f64)> = Vec::new();
    for id in order {
        if let Some((requests, errors)) = map.get(id) {
            rows.push((id.clone(), *requests, *errors));
        }
    }
    // Stable sort desc by requests (Rust's sort_by is stable, matching JS
    // Array.prototype.sort stability for equal keys).
    rows.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    rows.into_iter()
        .take(10)
        .map(|(id, requests, errors)| {
            json!({
                "id": id,
                "name": name_for(&id),
                "requests": number_value(requests),
                "errors": number_value(errors),
                "errorRate": rate_pct(errors, requests),
            })
        })
        .collect()
}

async fn fetch_aggregations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    params: &QueryParams,
    access_token: &str,
) -> Result<Vec<AggregationRow>, ()> {
    let mut query: Vec<(&str, String)> = vec![
        (
            "select",
            "ws_id,user_id,channel_id,time_bucket,kind,total_count,error_count".to_owned(),
        ),
        ("time_bucket", format!("gte.{}", params.start_date)),
        ("time_bucket", format!("lte.{}", params.end_date)),
    ];
    if let Some(workspace_id) = &params.workspace_id {
        query.push(("ws_id", format!("eq.{workspace_id}")));
    }
    if let Some(channel_id) = &params.channel_id {
        query.push(("channel_id", format!("eq.{channel_id}")));
    }

    let Some(url) = contact_data.rest_url("realtime_log_aggregations", &query) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<AggregationRow>>().map_err(|_| ())
}

async fn fetch_workspace_names(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    ids: &[String],
) -> Result<BTreeMap<String, String>, ()> {
    if ids.is_empty() {
        return Ok(BTreeMap::new());
    }
    let in_filter = format!("in.({})", ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[("select", "id,name".to_owned()), ("id", in_filter)],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        // Legacy ignores the error (no `.error` handling) and uses [].
        return Ok(BTreeMap::new());
    }
    let rows = response.json::<Vec<NamedRow>>().map_err(|_| ())?;
    let mut map = BTreeMap::new();
    for row in rows {
        if let (Some(id), Some(name)) = (row.id, row.name) {
            map.insert(id, name);
        }
    }
    Ok(map)
}

async fn fetch_user_names(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    ids: &[String],
) -> Result<BTreeMap<String, String>, ()> {
    if ids.is_empty() {
        return Ok(BTreeMap::new());
    }
    let in_filter = format!("in.({})", ids.join(","));
    let Some(url) = contact_data.rest_url(
        "users",
        &[("select", "id,display_name".to_owned()), ("id", in_filter)],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Ok(BTreeMap::new());
    }
    let rows = response.json::<Vec<UserRow>>().map_err(|_| ())?;
    let mut map = BTreeMap::new();
    for row in rows {
        if let Some(id) = row.id {
            let name = row
                .display_name
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| "Unknown User".to_owned());
            map.insert(id, name);
        }
    }
    Ok(map)
}

/// Mirrors `workspace_habits_access::send_caller_rest_request`: an RLS-scoped
/// PostgREST GET with the caller's access token as the Bearer plus the service
/// role key as the apikey (copied here to keep this module self-contained).
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

/// Validates query params, mirroring the Zod `QueryParamsSchema`. On failure,
/// returns the legacy `errors` array of `{ field, message }`.
fn parse_query_params(request_url: Option<&str>) -> Result<QueryParams, Vec<Value>> {
    let pairs = collect_query_pairs(request_url);

    let get = |key: &str| -> Option<String> {
        pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
            .filter(|v| !v.is_empty())
    };

    let mut errors: Vec<Value> = Vec::new();

    // workspaceId: optional uuid (z.guid()).
    let workspace_id = get("workspaceId");
    if let Some(ref ws) = workspace_id
        && !is_uuid(ws)
    {
        errors.push(json!({ "field": "workspaceId", "message": "Invalid UUID" }));
    }

    // channelId: optional, max 255.
    let channel_id = get("channelId");
    if let Some(ref ch) = channel_id
        && ch.chars().count() > MAX_NAME_LENGTH
    {
        errors.push(json!({
            "field": "channelId",
            "message": format!("String must contain at most {MAX_NAME_LENGTH} character(s)"),
        }));
    }

    // startDate: required ISO datetime.
    let start_date = get("startDate");
    match &start_date {
        Some(value) if is_iso_datetime(value) => {}
        Some(_) => errors.push(json!({ "field": "startDate", "message": "Invalid datetime" })),
        None => errors.push(json!({ "field": "startDate", "message": "Invalid input" })),
    }

    // endDate: required ISO datetime.
    let end_date = get("endDate");
    match &end_date {
        Some(value) if is_iso_datetime(value) => {}
        Some(_) => errors.push(json!({ "field": "endDate", "message": "Invalid datetime" })),
        None => errors.push(json!({ "field": "endDate", "message": "Invalid input" })),
    }

    if !errors.is_empty() {
        return Err(errors);
    }

    Ok(QueryParams {
        workspace_id,
        channel_id,
        // Safe: validated present above.
        start_date: start_date.unwrap_or_default(),
        end_date: end_date.unwrap_or_default(),
    })
}

fn collect_query_pairs(request_url: Option<&str>) -> Vec<(String, String)> {
    request_url
        .and_then(|raw| url::Url::parse(raw).ok())
        .map(|url| {
            url.query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect()
        })
        .unwrap_or_default()
}

fn empty_summary_payload() -> Value {
    json!({
        "summary": {
            "totalRequests": 0,
            "totalErrors": 0,
            "errorRate": 0,
            "uniqueUsers": 0,
            "uniqueChannels": 0,
            "uniqueWorkspaces": 0,
            "peakHour": Value::Null,
            "peakHourCount": 0,
            "avgRequestsPerHour": 0,
            "requestsByKind": {},
        },
        "topWorkspaces": [],
        "topChannels": [],
        "topUsers": [],
        "errorBreakdown": [],
    })
}

fn is_realtime_analytics_summary_path(path: &str) -> bool {
    let Some(rest) = path.strip_prefix(PATH_PREFIX) else {
        return false;
    };
    let Some(ws_id) = rest.strip_suffix(PATH_SUFFIX) else {
        return false;
    };
    // wsId is a single dynamic segment: non-empty and contains no '/'.
    !ws_id.is_empty() && !ws_id.contains('/')
}

/// `Math.round(value * 100) / 100`, emitting an integer JSON when the result is
/// whole (matching JS `JSON.stringify` of an integral float).
fn round2(value: f64) -> Value {
    number_value((value * 100.0).round() / 100.0)
}

/// `Math.round((errors / total) * 10000) / 100` with the `total > 0` guard.
fn rate_pct(errors: f64, total: f64) -> Value {
    let rate = if total > 0.0 {
        ((errors / total) * 10000.0).round() / 100.0
    } else {
        0.0
    };
    number_value(rate)
}

/// Emits an integer JSON number when `value` is integral (so e.g. `5.0`
/// serializes as `5`), otherwise a float — matching JS number serialization.
fn number_value(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 9.007_199_254_740_992e15 {
        json!(value as i64)
    } else {
        json!(value)
    }
}

/// Derives the `HH:00` (UTC) hour key from an ISO timestamp, mirroring
/// `new Date(time_bucket).getHours()` (Workers run in UTC, so `getHours()`
/// equals the UTC hour there).
fn hour_key_from_time_bucket(time_bucket: Option<&str>) -> Option<String> {
    let value = time_bucket?;
    let hour = utc_hour_from_iso(value)?;
    Some(format!("{hour:02}:00"))
}

/// Extracts the UTC hour (0-23) from an ISO8601 timestamp like
/// `2024-01-01T13:45:00Z` or `2024-01-01T13:45:00+00:00`.
fn utc_hour_from_iso(value: &str) -> Option<u32> {
    // Find the 'T' separator, then read the two hour digits after it.
    let t_index = value.find(['T', 't'])?;
    let after_t = &value[t_index + 1..];
    let hour_str: String = after_t.chars().take(2).collect();
    let hour: u32 = hour_str.parse().ok()?;
    if hour < 24 { Some(hour) } else { None }
}

/// Converts an ISO datetime to epoch milliseconds (best-effort, UTC). Used only
/// for the `hoursDiff` span; matches the legacy `new Date(x).getTime()`.
fn parse_iso_to_epoch_ms(value: &str) -> Option<f64> {
    let bytes = value.as_bytes();
    if value.len() < 19 {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    // T at index 10.
    if !(bytes.get(10) == Some(&b'T') || bytes.get(10) == Some(&b't')) {
        return None;
    }
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    // Days since Unix epoch (1970-01-01) using a civil-from-date algorithm.
    let days = days_from_civil(year, month, day);
    let total_secs = days * 86_400 + hour * 3600 + minute * 60 + second;
    Some((total_secs as f64) * 1000.0)
}

/// Howard Hinnant's `days_from_civil`: number of days since 1970-01-01.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

/// Loose UUID check (matches `z.guid()` shape: 8-4-4-4-12 hex).
fn is_uuid(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

/// Loose ISO datetime check (mirrors `z.iso.datetime()`: requires a `T`
/// separator and at least `YYYY-MM-DDTHH:MM:SS`). Optional fractional seconds
/// and an optional `Z`/offset are accepted by Zod's default datetime.
fn is_iso_datetime(value: &str) -> bool {
    parse_iso_to_epoch_ms(value).is_some()
}
