use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const DEFAULT_GRAY_COLOR: &str = "GRAY";
const UNCATEGORIZED_NAME: &str = "Uncategorized";

const ANALYTICS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const ANALYTICS_PATH_SUFFIX: &str = "/time-tracking/analytics";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct SessionCategory {
    name: Option<String>,
    color: Option<String>,
}

#[derive(Deserialize)]
struct SessionRow {
    start_time: Option<String>,
    duration_seconds: Option<i64>,
    category: Option<SessionCategory>,
}

#[derive(Serialize)]
struct CategoryBreakdownEntry {
    name: String,
    color: String,
    time: i64,
    sessions: i64,
}

#[derive(Serialize)]
struct DailyBreakdownEntry {
    date: String,
    time: i64,
    sessions: i64,
}

#[derive(Serialize)]
struct Overview {
    #[serde(rename = "totalSessions")]
    total_sessions: i64,
    #[serde(rename = "totalTime")]
    total_time: i64,
    #[serde(rename = "avgSessionLength")]
    avg_session_length: i64,
    period: String,
    #[serde(rename = "startDate")]
    start_date: String,
    #[serde(rename = "endDate")]
    end_date: String,
}

#[derive(Serialize)]
struct Analytics {
    overview: Overview,
    #[serde(rename = "categoryBreakdown")]
    category_breakdown: Vec<CategoryBreakdownEntry>,
    #[serde(rename = "dailyBreakdown")]
    daily_breakdown: Vec<DailyBreakdownEntry>,
}

#[derive(Serialize)]
struct AnalyticsResponse {
    analytics: Analytics,
}

pub(crate) async fn handle_workspaces_time_tracking_analytics_route(
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
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let period = analytics_period_from_url(request.url);
    let now_millis = now_millis();
    let start_millis = period_start_millis(&period, now_millis);
    let start_date_iso = iso8601_from_millis(start_millis);
    let end_date_iso = iso8601_from_millis(now_millis);

    let sessions = match fetch_sessions(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &start_date_iso,
    )
    .await
    {
        Ok(sessions) => sessions,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let analytics = build_analytics(sessions, &period, &start_date_iso, &end_date_iso);

    no_store_response(json_response(200, AnalyticsResponse { analytics }))
}

fn build_analytics(
    sessions: Vec<SessionRow>,
    period: &str,
    start_date_iso: &str,
    end_date_iso: &str,
) -> Analytics {
    let total_sessions = sessions.len() as i64;
    let mut total_time: i64 = 0;

    // Ordered category breakdown, preserving first-seen insertion order to
    // mirror the JS object key ordering over start_time-ascending sessions.
    let mut category_order: Vec<String> = Vec::new();
    let mut category_map: std::collections::HashMap<String, CategoryBreakdownEntry> =
        std::collections::HashMap::new();

    let mut daily_order: Vec<String> = Vec::new();
    let mut daily_map: std::collections::HashMap<String, DailyBreakdownEntry> =
        std::collections::HashMap::new();

    for session in sessions {
        let duration = session.duration_seconds.unwrap_or(0);
        total_time += duration;

        let category_name = session
            .category
            .as_ref()
            .and_then(|category| category.name.clone())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| UNCATEGORIZED_NAME.to_owned());
        let category_color = session
            .category
            .as_ref()
            .and_then(|category| category.color.clone())
            .filter(|color| !color.is_empty())
            .unwrap_or_else(|| DEFAULT_GRAY_COLOR.to_owned());

        match category_map.get_mut(&category_name) {
            Some(entry) => {
                entry.time += duration;
                entry.sessions += 1;
            }
            None => {
                category_order.push(category_name.clone());
                category_map.insert(
                    category_name.clone(),
                    CategoryBreakdownEntry {
                        name: category_name,
                        color: category_color,
                        time: duration,
                        sessions: 1,
                    },
                );
            }
        }

        // Daily breakdown keyed by the YYYY-MM-DD portion of start_time's ISO
        // form. Sessions without a parseable start_time are skipped (mirrors
        // the legacy `if (!date) return acc`).
        if let Some(date) = session.start_time.as_deref().and_then(date_part_from_iso) {
            match daily_map.get_mut(&date) {
                Some(entry) => {
                    entry.time += duration;
                    entry.sessions += 1;
                }
                None => {
                    daily_order.push(date.clone());
                    daily_map.insert(
                        date.clone(),
                        DailyBreakdownEntry {
                            date,
                            time: duration,
                            sessions: 1,
                        },
                    );
                }
            }
        }
    }

    let avg_session_length = if total_sessions > 0 {
        // JS Math.round: round half away from zero (durations are non-negative).
        ((total_time as f64) / (total_sessions as f64)).round() as i64
    } else {
        0
    };

    let category_breakdown = category_order
        .into_iter()
        .filter_map(|key| category_map.remove(&key))
        .collect();
    let daily_breakdown = daily_order
        .into_iter()
        .filter_map(|key| daily_map.remove(&key))
        .collect();

    Analytics {
        overview: Overview {
            total_sessions,
            total_time,
            avg_session_length,
            period: period.to_owned(),
            start_date: start_date_iso.to_owned(),
            end_date: end_date_iso.to_owned(),
        },
        category_breakdown,
        daily_breakdown,
    }
}

async fn fetch_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    start_date_iso: &str,
) -> Result<Vec<SessionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "time_tracking_sessions",
        &[
            (
                "select",
                "start_time,duration_seconds,category:time_tracking_categories(name,color)"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("pending_approval", "eq.false".to_owned()),
            ("start_time", format!("gte.{start_date_iso}")),
            ("duration_seconds", "not.is.null".to_owned()),
            ("order", "start_time.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<SessionRow>>().map_err(|_| ())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
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

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

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

fn analytics_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(ANALYTICS_PATH_PREFIX)?
        .strip_suffix(ANALYTICS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn analytics_period_from_url(request_url: Option<&str>) -> String {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return "week".to_owned();
    };

    for (key, value) in url.query_pairs() {
        if key == "period" && !value.is_empty() {
            return value.into_owned();
        }
    }

    "week".to_owned()
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Date helpers (UTC). The legacy route uses JS `Date` semantics:
//   - "month": first day of the current month at 00:00:00 UTC
//   - everything else (incl. "week"): now - 7 days
// `Date.prototype.toISOString()` emits `YYYY-MM-DDTHH:MM:SS.sssZ`, matched by
// `iso8601_from_millis` below.
// ---------------------------------------------------------------------------

fn now_millis() -> i128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i128)
        .unwrap_or(0)
}

fn period_start_millis(period: &str, now_millis: i128) -> i128 {
    match period {
        "month" => {
            let days = now_millis.div_euclid(86_400_000);
            let (year, month, _day) = civil_from_days(days);
            days_from_civil(year, month, 1) * 86_400_000
        }
        // "week" and any unrecognized period fall back to now - 7 days.
        _ => now_millis - 7 * 24 * 60 * 60 * 1_000,
    }
}

/// Extract the `YYYY-MM-DD` date portion from an ISO-8601 timestamp the same
/// way the legacy code does (`new Date(start_time).toISOString().split('T')[0]`).
fn date_part_from_iso(value: &str) -> Option<String> {
    let millis = parse_iso8601_millis(value)?;
    let iso = iso8601_from_millis(millis);
    iso.split('T').next().map(|date| date.to_owned())
}

fn parse_iso8601_millis(value: &str) -> Option<i128> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i128 = value.get(0..4)?.parse().ok()?;
    let month: i128 = value.get(5..7)?.parse().ok()?;
    let day: i128 = value.get(8..10)?.parse().ok()?;
    let hour: i128 = value.get(11..13)?.parse().ok()?;
    let minute: i128 = value.get(14..16)?.parse().ok()?;
    let second: i128 = value.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut rest = &value[19..];
    let mut millis_fraction: i128 = 0;

    if let Some(stripped) = rest.strip_prefix('.') {
        let frac_end = stripped
            .find(|character: char| !character.is_ascii_digit())
            .unwrap_or(stripped.len());
        let frac = &stripped[..frac_end];
        rest = &stripped[frac_end..];

        let mut frac_millis = String::new();
        for index in 0..3 {
            frac_millis.push(frac.as_bytes().get(index).map_or('0', |&b| b as char));
        }
        millis_fraction = frac_millis.parse().unwrap_or(0);
    }

    let offset_seconds: i128 = parse_offset_seconds(rest);

    let days = days_from_civil(year, month, day);
    let epoch_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_seconds;

    Some(epoch_seconds * 1_000 + millis_fraction)
}

fn parse_offset_seconds(tz: &str) -> i128 {
    let tz = tz.trim();
    if tz.is_empty() || tz == "Z" || tz == "z" {
        return 0;
    }

    let (sign, body) = match tz.as_bytes().first() {
        Some(b'+') => (1i128, &tz[1..]),
        Some(b'-') => (-1i128, &tz[1..]),
        _ => return 0,
    };

    let body = body.replace(':', "");
    let hours: i128 = body.get(0..2).and_then(|h| h.parse().ok()).unwrap_or(0);
    let minutes: i128 = body.get(2..4).and_then(|m| m.parse().ok()).unwrap_or(0);

    sign * (hours * 3_600 + minutes * 60)
}

/// Days from the civil 1970-01-01 epoch (Howard Hinnant's algorithm).
fn days_from_civil(year: i128, month: i128, day: i128) -> i128 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn iso8601_from_millis(millis: i128) -> String {
    let total_seconds = millis.div_euclid(1_000);
    let frac_millis = millis.rem_euclid(1_000);
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{frac_millis:03}Z")
}

/// Inverse of `days_from_civil` (Howard Hinnant's algorithm).
fn civil_from_days(days: i128) -> (i128, i128, i128) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}
