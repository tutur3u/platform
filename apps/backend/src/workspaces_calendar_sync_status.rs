use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/calendar/sync-status";

const INVALID_WORKSPACE_ID_MESSAGE: &str = "Invalid workspace ID";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NO_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const LOAD_FAILED_MESSAGE: &str = "Failed to load sync status";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

// Mirrors apps/web/src/lib/calendar/sync-health.ts constants.
const TOKEN_EXPIRY_WARNING_SECONDS: i64 = 5 * 60;
const RUNNING_WINDOW_SECONDS: i64 = 5 * 60;

#[derive(Deserialize)]
struct AccountRow {
    id: Option<Value>,
    provider: Option<String>,
    account_email: Option<Value>,
    account_name: Option<Value>,
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct ConnectionRow {
    id: Option<Value>,
    auth_token_id: Option<Value>,
    calendar_id: Option<Value>,
    calendar_name: Option<Value>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct DashboardRow {
    status: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    error_message: Option<Value>,
    error_type: Option<String>,
    cooldown_remaining_seconds: Option<i64>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Serialize)]
struct SyncHealthSummary {
    state: &'static str,
    reason: String,
    #[serde(rename = "lastSuccessAt")]
    last_success_at: Option<String>,
    #[serde(rename = "lastFailureAt")]
    last_failure_at: Option<String>,
    #[serde(rename = "currentlyRunning")]
    currently_running: bool,
    #[serde(rename = "retryAfterSeconds")]
    retry_after_seconds: Option<i64>,
}

pub(crate) async fn handle_workspaces_calendar_sync_status_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = sync_status_ws_id(request.path)?;

    Some(match request.method {
        "GET" => sync_status_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn sync_status_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy uses uuid.validate(wsId) and returns 400 for non-UUIDs.
    if !is_workspace_uuid_literal(ws_id) {
        return message_response(400, INVALID_WORKSPACE_ID_MESSAGE);
    }

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

    match verify_workspace_member(&config.contact_data, outbound, ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_ACCESS_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let accounts = match fetch_accounts(&config.contact_data, outbound, ws_id, &access_token).await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, LOAD_FAILED_MESSAGE),
    };
    let connections =
        match fetch_connections(&config.contact_data, outbound, ws_id, &access_token).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, LOAD_FAILED_MESSAGE),
        };
    let recent_runs =
        match fetch_dashboard(&config.contact_data, outbound, ws_id, &access_token).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, LOAD_FAILED_MESSAGE),
        };

    let now_seconds = now_epoch_seconds();
    let health = classify_calendar_sync_health(&accounts, &recent_runs, now_seconds);

    let google_count = accounts
        .iter()
        .filter(|a| a.provider.as_deref() == Some("google"))
        .count();
    let microsoft_count = accounts
        .iter()
        .filter(|a| a.provider.as_deref() == Some("microsoft"))
        .count();
    let enabled_count = connections
        .iter()
        .filter(|c| c.is_enabled == Some(true))
        .count();

    let accounts_json: Vec<Value> = accounts
        .iter()
        .map(|a| {
            json!({
                "id": a.id,
                "provider": a.provider,
                "account_email": a.account_email,
                "account_name": a.account_name,
                "expires_at": a.expires_at,
            })
        })
        .collect();
    let connections_json: Vec<Value> = connections
        .iter()
        .map(|c| {
            json!({
                "id": c.id,
                "auth_token_id": c.auth_token_id,
                "calendar_id": c.calendar_id,
                "calendar_name": c.calendar_name,
                "is_enabled": c.is_enabled,
            })
        })
        .collect();
    let recent_runs_json: Vec<Value> = recent_runs
        .iter()
        .map(|r| {
            json!({
                "status": r.status,
                "start_time": r.start_time,
                "end_time": r.end_time,
                "error_message": r.error_message,
                "error_type": r.error_type,
                "cooldown_remaining_seconds": r.cooldown_remaining_seconds,
            })
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "health": health,
            "accountsSummary": {
                "total": accounts.len(),
                "google": google_count,
                "microsoft": microsoft_count,
            },
            "connectionsSummary": {
                "total": connections.len(),
                "enabled": enabled_count,
            },
            "accounts": accounts_json,
            "connections": connections_json,
            "recentRuns": recent_runs_json,
            "cron": {
                "inbound": "*/10 * * * *",
                "scheduler": "0 * * * *",
                "health": "*/30 * * * *",
            },
        }),
    ))
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

async fn fetch_accounts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Vec<AccountRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "calendar_auth_tokens",
        &[
            (
                "select",
                "id,provider,account_email,account_name,expires_at".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("is_active", "eq.true".to_owned()),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<AccountRow>>().map_err(|_| ())
}

async fn fetch_connections(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Vec<ConnectionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "calendar_connections",
        &[
            (
                "select",
                "id,auth_token_id,calendar_id,calendar_name,is_enabled".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<ConnectionRow>>().map_err(|_| ())
}

async fn fetch_dashboard(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Vec<DashboardRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "calendar_sync_dashboard",
        &[
            (
                "select",
                "status,start_time,end_time,error_message,error_type,cooldown_remaining_seconds"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "start_time.desc".to_owned()),
            ("limit", "10".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<DashboardRow>>().map_err(|_| ())
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

// Mirrors classifyCalendarSyncHealth in apps/web/src/lib/calendar/sync-health.ts.
// Operates in epoch seconds; the original works in milliseconds but the only
// comparisons are against 5-minute windows and relative ordering, so seconds
// precision preserves behavior.
fn classify_calendar_sync_health(
    accounts: &[AccountRow],
    recent_runs: &[DashboardRow],
    now_seconds: i64,
) -> SyncHealthSummary {
    let last_success = recent_runs
        .iter()
        .find(|r| r.status.as_deref() == Some("success"));
    let last_failure = recent_runs
        .iter()
        .find(|r| r.status.as_deref() == Some("failed"));
    let current_run = recent_runs
        .iter()
        .find(|r| is_running_record(r, now_seconds));
    let retry_after_seconds = recent_runs
        .iter()
        .find_map(|r| r.cooldown_remaining_seconds);

    let last_success_at = last_success.and_then(|r| r.end_time.clone());
    let last_failure_at =
        last_failure.and_then(|r| r.end_time.clone().or_else(|| r.start_time.clone()));

    if accounts.is_empty() {
        return SyncHealthSummary {
            state: "disconnected",
            reason: "no_accounts".to_owned(),
            last_success_at,
            last_failure_at,
            currently_running: false,
            retry_after_seconds,
        };
    }

    if current_run.is_some() {
        return SyncHealthSummary {
            state: "syncing",
            reason: "running".to_owned(),
            last_success_at,
            last_failure_at,
            currently_running: true,
            retry_after_seconds,
        };
    }

    if accounts
        .iter()
        .any(|a| is_expiring_soon(a.expires_at.as_deref(), now_seconds))
    {
        return SyncHealthSummary {
            state: "degraded",
            reason: "token_expiring".to_owned(),
            last_success_at,
            last_failure_at,
            currently_running: false,
            retry_after_seconds,
        };
    }

    let last_success_ms = last_success
        .and_then(|r| r.end_time.as_deref())
        .and_then(parse_rfc3339_epoch_seconds)
        .unwrap_or(0);
    let last_failure_ms = last_failure
        .and_then(|r| {
            r.end_time
                .as_deref()
                .and_then(parse_rfc3339_epoch_seconds)
                .or_else(|| {
                    r.start_time
                        .as_deref()
                        .and_then(parse_rfc3339_epoch_seconds)
                })
        })
        .unwrap_or(0);

    if last_failure_ms != 0 && last_failure_ms >= last_success_ms {
        let reason = last_failure
            .and_then(|r| r.error_type.clone())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "last_run_failed".to_owned());
        return SyncHealthSummary {
            state: "degraded",
            reason,
            last_success_at,
            last_failure_at,
            currently_running: false,
            retry_after_seconds,
        };
    }

    SyncHealthSummary {
        state: "healthy",
        reason: "ok".to_owned(),
        last_success_at,
        last_failure_at,
        currently_running: false,
        retry_after_seconds,
    }
}

fn is_running_record(record: &DashboardRow, now_seconds: i64) -> bool {
    if record.status.as_deref() != Some("running") {
        return false;
    }
    let Some(start_time) = record.start_time.as_deref() else {
        return false;
    };
    let Some(started_at) = parse_rfc3339_epoch_seconds(start_time) else {
        return false;
    };
    now_seconds - started_at <= RUNNING_WINDOW_SECONDS
}

fn is_expiring_soon(expires_at: Option<&str>, now_seconds: i64) -> bool {
    let Some(expires_at) = expires_at else {
        return false;
    };
    let Some(expiry) = parse_rfc3339_epoch_seconds(expires_at) else {
        return false;
    };
    expiry - now_seconds <= TOKEN_EXPIRY_WARNING_SECONDS
}

fn now_epoch_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn sync_status_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// Self-contained RFC3339 -> epoch-seconds parser (no chrono dependency
// available in this crate). Mirrors the parser in
// workspaces_user_groups_sessions_group_summaries.rs.
fn parse_rfc3339_epoch_seconds(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if value.len() < 19 {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    if bytes.get(4) != Some(&b'-') {
        return None;
    }
    let month: i64 = value.get(5..7)?.parse().ok()?;
    if bytes.get(7) != Some(&b'-') {
        return None;
    }
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let sep = bytes.get(10)?;
    if *sep != b'T' && *sep != b't' && *sep != b' ' {
        return None;
    }
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    if bytes.get(13) != Some(&b':') {
        return None;
    }
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    if bytes.get(16) != Some(&b':') {
        return None;
    }
    let second: i64 = value.get(17..19)?.parse().ok()?;

    let mut rest = &value[19..];
    if rest.starts_with('.') {
        let frac_end = rest[1..]
            .find(|c: char| !c.is_ascii_digit())
            .map(|index| index + 1)
            .unwrap_or(rest.len());
        rest = &rest[frac_end..];
    }

    let offset_seconds = if rest.is_empty() {
        0
    } else if rest == "Z" || rest == "z" {
        0
    } else {
        let sign = match rest.as_bytes().first() {
            Some(b'+') => 1,
            Some(b'-') => -1,
            _ => return None,
        };
        let body = &rest[1..];
        let (oh, om) = if let Some((h, m)) = body.split_once(':') {
            (h, m)
        } else if body.len() == 4 {
            (&body[0..2], &body[2..4])
        } else if body.len() == 2 {
            (body, "0")
        } else {
            return None;
        };
        let oh: i64 = oh.parse().ok()?;
        let om: i64 = om.parse().ok()?;
        sign * (oh * 3600 + om * 60)
    };

    let days = days_from_civil(year, month, day);
    let utc = days * 86_400 + hour * 3600 + minute * 60 + second - offset_seconds;
    Some(utc)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}
