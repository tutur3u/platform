use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_FOCUS_PATH: &str = "/api/v1/mira/focus";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const DEFAULT_LIMIT: i64 = 10;
const MAX_LIMIT: i64 = 50;

#[derive(Serialize)]
struct MiraFocusResponse {
    active_session: Value,
    recent_sessions: Vec<Value>,
    stats: MiraFocusStats,
}

#[derive(Serialize)]
struct MiraFocusStats {
    total_sessions: i64,
    completed_sessions: i64,
    total_minutes: i64,
    total_xp_earned: i64,
    completion_rate: i64,
}

#[derive(Deserialize)]
struct MiraFocusStatsRow {
    actual_duration: Option<i64>,
    xp_earned: Option<i64>,
    completed: Option<bool>,
}

pub(crate) async fn handle_mira_focus_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MIRA_FOCUS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => mira_focus_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn mira_focus_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
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

    let limit = mira_focus_limit_from_url(request.url);

    // Active session (no ended_at), most recent first, single row.
    let active_session =
        fetch_active_session(&config.contact_data, outbound, &user_id, &access_token)
            .await
            .unwrap_or(Value::Null);

    // Recent completed sessions (ended_at is not null), most recent first.
    let recent_sessions = fetch_recent_sessions(
        &config.contact_data,
        outbound,
        &user_id,
        &access_token,
        limit,
    )
    .await
    .unwrap_or_default();

    // Stats over all ended sessions.
    let stats = fetch_stats(&config.contact_data, outbound, &user_id, &access_token)
        .await
        .unwrap_or(MiraFocusStats {
            total_sessions: 0,
            completed_sessions: 0,
            total_minutes: 0,
            total_xp_earned: 0,
            completion_rate: 0,
        });

    no_store_response(json_response(
        200,
        MiraFocusResponse {
            active_session,
            recent_sessions,
            stats,
        },
    ))
}

async fn fetch_active_session(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_focus_sessions",
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("ended_at", "is.null".to_owned()),
            ("order", "started_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .unwrap_or(Value::Null))
}

async fn fetch_recent_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
    limit: i64,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_focus_sessions",
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("ended_at", "not.is.null".to_owned()),
            ("order", "started_at.desc".to_owned()),
            ("limit", limit.to_string()),
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

async fn fetch_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<MiraFocusStats, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_focus_sessions",
        &[
            ("select", "actual_duration,xp_earned,completed".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("ended_at", "not.is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<MiraFocusStatsRow>>().map_err(|_| ())?;

    let total_sessions = rows.len() as i64;
    let completed_sessions = rows
        .iter()
        .filter(|row| row.completed.unwrap_or(false))
        .count() as i64;
    let total_minutes = rows
        .iter()
        .map(|row| row.actual_duration.unwrap_or(0))
        .sum();
    let total_xp_earned = rows.iter().map(|row| row.xp_earned.unwrap_or(0)).sum();
    let completion_rate = if total_sessions > 0 {
        // Mirror JS Math.round(completed / total * 100).
        ((completed_sessions as f64 / total_sessions as f64) * 100.0).round() as i64
    } else {
        0
    };

    Ok(MiraFocusStats {
        total_sessions,
        completed_sessions,
        total_minutes,
        total_xp_earned,
        completion_rate,
    })
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

fn mira_focus_limit_from_url(request_url: Option<&str>) -> i64 {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return DEFAULT_LIMIT;
    };

    let raw = url
        .query_pairs()
        .find(|(key, _)| key == "limit")
        .and_then(|(_, value)| parse_js_parse_int_prefix(&value))
        .unwrap_or(DEFAULT_LIMIT);

    raw.min(MAX_LIMIT)
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
