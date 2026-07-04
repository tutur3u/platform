//! Mira Calendar API
//!
//! GET /api/v1/mira/calendar?wsId=<id> - Get the workspace's upcoming calendar
//! events (next 7 days, non-all-day, capped at 10) for Mira.
//!
//! Ported from apps/web/src/app/api/v1/mira/calendar/route.ts.
//!
//! IMPORTANT PORTING NOTE: the legacy route attempts to AES-256-GCM decrypt
//! events (via a per-workspace key derived from ENCRYPTION_MASTER_KEY) before
//! filtering out events whose `is_encrypted` flag is still set. The backend has
//! no AES/scrypt crates available, so this port does NOT decrypt. Events stored
//! with `is_encrypted = true` are therefore excluded from `events` and counted
//! in `stats.encrypted_count` (matching legacy behavior for workspaces WITHOUT
//! E2EE, where no event is encrypted). For E2EE-enabled workspaces this differs
//! from legacy: legacy would decrypt and surface those events, whereas this port
//! reports them as encrypted_count. See the integrator notes.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_CALENDAR_PATH: &str = "/api/v1/mira/calendar";
const SEVEN_DAYS_MILLIS: i64 = 7 * 24 * 60 * 60 * 1000;
const DAY_MILLIS: i64 = 24 * 60 * 60 * 1000;
const UPCOMING_LIMIT: usize = 10;

#[derive(Deserialize)]
struct CalendarEventRow {
    id: Option<String>,
    title: Option<String>,
    description: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    color: Option<String>,
    location: Option<String>,
    #[serde(default)]
    is_encrypted: bool,
}

#[derive(Serialize)]
struct MiraCalendarEvent {
    id: Option<String>,
    title: Option<String>,
    description: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    color: Option<String>,
    location: Option<String>,
}

#[derive(Serialize)]
struct MiraCalendarStats {
    total: usize,
    encrypted_count: usize,
}

#[derive(Serialize)]
struct MiraCalendarResponse {
    events: Vec<MiraCalendarEvent>,
    stats: MiraCalendarStats,
}

pub(crate) async fn handle_mira_calendar_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MIRA_CALENDAR_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => mira_calendar_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn mira_calendar_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(ws_id) = ws_id_from_url(request.url) else {
        return error_response(400, "Workspace ID is required");
    };

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };

    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    // Mirror verifyWorkspaceMembershipType (requiredType = MEMBER): forbidden
    // unless the caller is a MEMBER of the workspace.
    match verify_workspace_member(&config.contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "Forbidden"),
        // Legacy returns 403 on membership lookup error too (`membership.error || !membership`).
        Err(()) => return error_response(403, "Forbidden"),
    }

    let now_millis = unix_millis_now();
    let now_iso = millis_to_iso8601(now_millis);
    let until_iso = millis_to_iso8601(now_millis + SEVEN_DAYS_MILLIS);

    let rows =
        match fetch_upcoming_events(&config.contact_data, outbound, &ws_id, &now_iso, &until_iso)
            .await
        {
            Ok(rows) => rows,
            Err(()) => return error_response(500, "Failed to fetch events"),
        };

    // Count events that remain encrypted (we cannot decrypt here).
    let encrypted_count = rows.iter().filter(|row| row.is_encrypted).count();

    // Filter out encrypted events and all-day events, then take the first 10.
    let events: Vec<MiraCalendarEvent> = rows
        .into_iter()
        .filter(|row| !row.is_encrypted)
        .filter(|row| !is_all_day_event(row.start_at.as_deref(), row.end_at.as_deref()))
        .take(UPCOMING_LIMIT)
        .map(|row| MiraCalendarEvent {
            id: row.id,
            title: row.title,
            description: row.description,
            start_at: row.start_at,
            end_at: row.end_at,
            color: row.color,
            location: row.location,
        })
        .collect();

    no_store_response(json_response(
        200,
        MiraCalendarResponse {
            stats: MiraCalendarStats {
                total: events.len(),
                encrypted_count,
            },
            events,
        },
    ))
}

async fn fetch_upcoming_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    now_iso: &str,
    until_iso: &str,
) -> Result<Vec<CalendarEventRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_calendar_events",
        &[
            (
                "select",
                "id,title,description,start_at,end_at,color,location,is_encrypted".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("start_at", format!("gte.{now_iso}")),
            ("start_at", format!("lte.{until_iso}")),
            ("order", "start_at.asc".to_owned()),
            ("limit", "25".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<CalendarEventRow>>().map_err(|_| ())
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

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
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

/// Extract the `wsId` query parameter. Returns None when missing or blank,
/// matching the legacy `if (!wsId)` 400 guard.
fn ws_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = url::Url::parse(request_url?).ok()?;
    url.query_pairs()
        .find(|(key, _)| key == "wsId")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.is_empty())
}

/// Mirror of `isAllDayEvent`: duration > 0 and an exact multiple of 24 hours.
/// If either timestamp fails to parse, treat as not-all-day (kept visible),
/// matching dayjs producing a non-multiple/NaN diff that fails the check.
fn is_all_day_event(start_at: Option<&str>, end_at: Option<&str>) -> bool {
    let (Some(start), Some(end)) = (
        start_at.and_then(iso8601_to_millis),
        end_at.and_then(iso8601_to_millis),
    ) else {
        return false;
    };

    let duration = end - start;
    duration > 0 && duration % DAY_MILLIS == 0
}

fn unix_millis_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

// Parse an ISO-8601 / RFC-3339 timestamp into epoch milliseconds. Handles the
// common shapes PostgREST returns: "YYYY-MM-DDTHH:MM:SS[.fff][Z|+HH:MM]" and
// "YYYY-MM-DD HH:MM:SS[.fff][+00]". Returns None on parse failure.
fn iso8601_to_millis(value: &str) -> Option<i64> {
    let normalized = value.replace(' ', "T");
    if normalized.len() < 19 {
        return None;
    }

    let year: i64 = normalized.get(0..4)?.parse().ok()?;
    let month: i64 = normalized.get(5..7)?.parse().ok()?;
    let day: i64 = normalized.get(8..10)?.parse().ok()?;
    let hour: i64 = normalized.get(11..13)?.parse().ok()?;
    let minute: i64 = normalized.get(14..16)?.parse().ok()?;
    let second: i64 = normalized.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let tail = &normalized[19..];
    let mut millis_fraction: i64 = 0;
    let mut rest = tail;
    if let Some(stripped) = tail.strip_prefix('.') {
        let frac_digits: String = stripped
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        let consumed = frac_digits.len();
        let mut frac = frac_digits;
        frac.truncate(3);
        while frac.len() < 3 {
            frac.push('0');
        }
        millis_fraction = frac.parse().unwrap_or(0);
        rest = &stripped[consumed..];
    }

    // Timezone offset handling: "Z" or "+HH:MM" / "-HH:MM".
    let mut offset_minutes: i64 = 0;
    let trimmed = rest.trim();
    if !trimmed.is_empty() && trimmed != "Z" && trimmed != "z" {
        let sign = match trimmed.as_bytes().first() {
            Some(b'+') => 1,
            Some(b'-') => -1,
            _ => 0,
        };
        if sign != 0 {
            let body = &trimmed[1..];
            let digits: String = body.chars().filter(|c| c.is_ascii_digit()).collect();
            if digits.len() >= 4 {
                let off_hour: i64 = digits.get(0..2)?.parse().ok()?;
                let off_minute: i64 = digits.get(2..4)?.parse().ok()?;
                offset_minutes = sign * (off_hour * 60 + off_minute);
            } else if digits.len() >= 2 {
                let off_hour: i64 = digits.get(0..2)?.parse().ok()?;
                offset_minutes = sign * off_hour * 60;
            }
        }
    }

    let days = days_from_civil(year, month, day);
    let total_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second;
    let millis = total_seconds * 1_000 + millis_fraction - offset_minutes * 60 * 1_000;
    Some(millis)
}

fn millis_to_iso8601(millis: i64) -> String {
    let total_seconds = millis.div_euclid(1_000);
    let millis_part = millis.rem_euclid(1_000);
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis_part:03}Z")
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

fn civil_from_days(days: i64) -> (i64, i64, i64) {
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
