//! Handler for `GET /api/v1/workspaces/:wsId/calendar-hours`.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/calendar-hours/route.ts`.
//!
//! Auth: session JWT or `ttr_app_*` CLI token (`allowAppSessionAuth: true`),
//! then verifies `workspace_members.type = 'MEMBER'`. App-session tokens that
//! are not valid Supabase JWTs receive `401` — the dedicated app-session lookup
//! path is not reproduced here.
//!
//! Behavior gaps vs legacy:
//!
//! - **Default-row insertion** — `ensureDefaultRows` writes missing rows on
//!   every GET; this handler is read-only and returns defaults in-band.
//! - **App-session auth** — only the JWT path is implemented.
//! - **Workspace handle lookup** — `personal`/`internal` are resolved;
//!   arbitrary handle strings are not looked up by the handle column.
//!
//! Cache: `private, max-age=30, stale-while-revalidate=30` (legacy `maxAge: 30, swr: 30`).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const CALENDAR_HOURS_CACHE_CONTROL: &str = "private, max-age=30, stale-while-revalidate=30";
const CALENDAR_HOURS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const CALENDAR_HOURS_PATH_SUFFIX: &str = "/calendar-hours";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";

#[derive(Deserialize)]
struct CalendarHourRow {
    #[serde(rename = "type")]
    hour_type: Option<String>,
    data: Option<Value>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_calendar_hours_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = calendar_hours_ws_id(request.path)?;

    Some(match request.method {
        "GET" => calendar_hours_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn calendar_hours_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, INTERNAL_ERROR_MESSAGE);
    }

    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let ws_id = match resolve_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(id) => id,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let rows = match fetch_calendar_hour_rows(&config.contact_data, outbound, &ws_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let mut response = json_response(200, build_hours_settings_response(&rows));
    response.cache_control = Some(CALENDAR_HOURS_CACHE_CONTROL);
    response
}

// ---------------------------------------------------------------------------
// Workspace-ID normalisation
// ---------------------------------------------------------------------------

async fn resolve_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let trimmed = raw_ws_id.trim();

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    Ok(trimmed.to_owned())
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;

    let response = send_caller_get_request(contact_data, outbound, &url, access_token).await?;

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

// ---------------------------------------------------------------------------
// Membership check
// ---------------------------------------------------------------------------

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get_request(contact_data, outbound, &url).await?;

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

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async fn fetch_calendar_hour_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<CalendarHourRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_calendar_hour_settings",
            &[
                ("select", "type,data".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<CalendarHourRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

fn default_week_time_ranges() -> Value {
    let day = json!({
        "enabled": true,
        "timeBlocks": [{ "startTime": "07:00", "endTime": "23:00" }]
    });
    json!({
        "monday":    day,
        "tuesday":   day,
        "wednesday": day,
        "thursday":  day,
        "friday":    day,
        "saturday":  day,
        "sunday":    day,
    })
}

fn hours_for_type(rows: &[CalendarHourRow], hour_type: &str) -> Value {
    rows.iter()
        .find(|r| r.hour_type.as_deref() == Some(hour_type))
        .and_then(|r| r.data.clone())
        .filter(Value::is_object)
        .unwrap_or_else(default_week_time_ranges)
}

fn build_hours_settings_response(rows: &[CalendarHourRow]) -> Value {
    json!({
        "personalHours": hours_for_type(rows, "PERSONAL"),
        "workHours":     hours_for_type(rows, "WORK"),
        "meetingHours":  hours_for_type(rows, "MEETING"),
    })
}

// ---------------------------------------------------------------------------
// Outbound HTTP helpers
// ---------------------------------------------------------------------------

async fn send_caller_get_request(
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

async fn send_service_role_get_request(
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

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

fn calendar_hours_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(CALENDAR_HOURS_PATH_PREFIX)?
        .strip_suffix(CALENDAR_HOURS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_uuid_path() {
        let ws = "550e8400-e29b-41d4-a716-446655440000";
        assert_eq!(
            calendar_hours_ws_id(&format!("/api/v1/workspaces/{ws}/calendar-hours")),
            Some(ws)
        );
    }

    #[test]
    fn rejects_extra_segments_and_empty_ws_id() {
        assert_eq!(
            calendar_hours_ws_id("/api/v1/workspaces/a/b/calendar-hours"),
            None
        );
        assert_eq!(
            calendar_hours_ws_id("/api/v1/workspaces//calendar-hours"),
            None
        );
        assert_eq!(calendar_hours_ws_id("/api/v1/workspaces/abc/other"), None);
        assert_eq!(
            calendar_hours_ws_id("/api/v1/workspaces/personal/calendar-hours"),
            Some("personal")
        );
    }

    #[test]
    fn default_has_all_seven_days() {
        let d = default_week_time_ranges();
        for day in &[
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ] {
            assert!(d.get(*day).is_some(), "missing {day}");
        }
    }

    #[test]
    fn hours_for_type_returns_default_on_null_data() {
        let rows = vec![CalendarHourRow {
            hour_type: Some("WORK".into()),
            data: None,
        }];
        assert_eq!(hours_for_type(&rows, "WORK"), default_week_time_ranges());
        assert_eq!(
            hours_for_type(&rows, "PERSONAL"),
            default_week_time_ranges()
        );
    }

    #[test]
    fn hours_for_type_keeps_object_data() {
        let obj = json!({ "monday": { "enabled": true, "timeBlocks": [] } });
        let rows = vec![CalendarHourRow {
            hour_type: Some("WORK".into()),
            data: Some(obj.clone()),
        }];
        assert_eq!(hours_for_type(&rows, "WORK"), obj);
    }

    #[test]
    fn empty_rows_gives_all_defaults() {
        let r = build_hours_settings_response(&[]);
        let d = default_week_time_ranges();
        assert_eq!(r["personalHours"], d);
        assert_eq!(r["workHours"], d);
        assert_eq!(r["meetingHours"], d);
    }

    #[test]
    fn row_data_used_when_present() {
        let custom = json!({ "monday": { "enabled": false, "timeBlocks": [] } });
        let rows = vec![CalendarHourRow {
            hour_type: Some("PERSONAL".into()),
            data: Some(custom.clone()),
        }];
        let r = build_hours_settings_response(&rows);
        assert_eq!(r["personalHours"], custom);
        assert_eq!(r["workHours"], default_week_time_ranges());
    }
}
