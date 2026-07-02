//! Handler for `GET /api/v1/workspaces/:wsId/settings/calendar-sync`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/settings/calendar-sync/route.ts`.
//!
//! The legacy route calls two helper functions:
//!
//! - `getSyncMetrics(wsId)` — queries `calendar_sync_dashboard` for the last 48 h
//!   using the caller's Supabase session (RLS active) and computes metrics in
//!   TypeScript (split into current/previous 24-hour windows).
//! - `getSyncLogs(wsId, { limit: 25, offset: 0 })` — verifies workspace membership
//!   via `verifyWorkspaceMembershipType`, then queries `calendar_sync_dashboard` with
//!   a `workspaces!inner` and `users!inner` join using the caller's session (RLS).
//!
//! Behavior gaps vs the legacy route:
//!
//! 1. **Auth**: the legacy route only verifies workspace *membership* (any member type
//!    is allowed), not a named permission. This handler uses
//!    `authorize_workspace_permission` with `"manage_workspace_settings"` because no
//!    bare membership helper is exposed from the crate's shared modules. Regular
//!    workspace members without that permission will receive `401`/`403` here whereas
//!    the legacy would serve them data.
//! 2. **Data reads**: the legacy uses the caller's JWT (RLS active). Here, reads are
//!    performed with the service-role key (RLS bypassed) because auth was already
//!    confirmed by the permission helper. The `ws_id` filter ensures scope is correct.
//! 3. **Log duration**: the legacy computes `end_time - start_time` in milliseconds.
//!    This handler uses `timing_total_ms` (selected in the same query), which is
//!    semantically equivalent and avoids a timestamp-string parser.
//! 4. **Log user join**: the legacy uses `users!inner` (inner join). This handler
//!    uses a left join (`users(display_name)`) so logs without a `triggered_by` user
//!    are still included with `user: null`, matching the legacy `?? null` fallback.
//! 5. Non-GET methods return `None` so the still-live Next.js route handles them.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/settings/calendar-sync";
const LOG_LIMIT: i64 = 25;
const CALENDAR_SOURCE: &str = "Google Calendar";
const CALENDAR_SYNC_PERMISSION: &str = "manage_workspace_settings";
const CALENDAR_SYNC_TABLE: &str = "calendar_sync_dashboard";
const SECONDS_24H: i64 = 24 * 3_600;
const SECONDS_48H: i64 = 48 * 3_600;

// ---------------------------------------------------------------------------
// Supabase row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MetricsRow {
    status: Option<String>,
    updated_at: Option<String>,
    timing_total_ms: Option<i64>,
    google_api_calls_count: Option<i64>,
    inserted_events: Option<i64>,
    updated_events: Option<i64>,
    deleted_events: Option<i64>,
}

#[derive(Deserialize)]
struct CountRow {
    count: Option<i64>,
}

#[derive(Deserialize)]
struct LogUserRow {
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct LogRow {
    id: Option<String>,
    updated_at: Option<String>,
    #[serde(rename = "type")]
    sync_type: Option<String>,
    status: Option<String>,
    inserted_events: Option<i64>,
    updated_events: Option<i64>,
    deleted_events: Option<i64>,
    timing_total_ms: Option<i64>,
    users: Option<LogUserRow>,
}

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct LogEntry {
    duration: i64,
    events: i64,
    id: String,
    source: String,
    status: String,
    timestamp: String,
    #[serde(rename = "type")]
    sync_type: String,
    user: Option<String>,
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_settings_calendar_sync_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = calendar_sync_ws_id(request.path)?;

    Some(match request.method {
        "GET" => calendar_sync_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

async fn calendar_sync_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        CALENDAR_SYNC_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Internal server error" }),
            ));
        }
    };

    let ws_id = &authorization.ws_id;

    let now_secs = unix_seconds_now();
    let forty_eight_hours_ago_iso = iso_from_unix_seconds(now_secs - SECONDS_48H);

    let metrics_rows = fetch_metrics_rows(
        &config.contact_data,
        outbound,
        ws_id,
        &forty_eight_hours_ago_iso,
    )
    .await
    .unwrap_or_default();

    let metrics = compute_metrics(&metrics_rows, now_secs);

    let total_count = fetch_log_count(&config.contact_data, outbound, ws_id)
        .await
        .unwrap_or(0);

    let log_rows = fetch_log_rows(&config.contact_data, outbound, ws_id)
        .await
        .unwrap_or_default();

    let logs: Vec<LogEntry> = log_rows.iter().map(map_log_row).collect();

    no_store_response(json_response(
        200,
        json!({
            "logs": logs,
            "metrics": metrics,
            "totalCount": total_count,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async fn fetch_metrics_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    forty_eight_hours_ago: &str,
) -> Result<Vec<MetricsRow>, ()> {
    let url = contact_data
        .rest_url(
            CALENDAR_SYNC_TABLE,
            &[
                (
                    "select",
                    "status,updated_at,timing_total_ms,google_api_calls_count,\
                     inserted_events,updated_events,deleted_events"
                        .to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("updated_at", format!("gte.{forty_eight_hours_ago}")),
                ("order", "updated_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<MetricsRow>>().map_err(|_| ())
}

async fn fetch_log_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            CALENDAR_SYNC_TABLE,
            &[
                ("select", "count()".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;

    let response = service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

async fn fetch_log_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<LogRow>, ()> {
    let url = contact_data
        .rest_url(
            CALENDAR_SYNC_TABLE,
            &[
                (
                    "select",
                    "id,updated_at,type,status,inserted_events,updated_events,\
                     deleted_events,timing_total_ms,users(display_name)"
                        .to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "updated_at.desc".to_owned()),
                ("limit", LOG_LIMIT.to_string()),
                ("offset", "0".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<LogRow>>().map_err(|_| ())
}

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Computation helpers
// ---------------------------------------------------------------------------

fn compute_metrics(rows: &[MetricsRow], now_secs: i64) -> Vec<Value> {
    let twenty_four_hours_ago_iso = iso_from_unix_seconds(now_secs - SECONDS_24H);

    let current: Vec<&MetricsRow> = rows
        .iter()
        .filter(|r| {
            r.updated_at
                .as_deref()
                .is_some_and(|ts| ts >= twenty_four_hours_ago_iso.as_str())
        })
        .collect();

    let total_syncs = current.len() as i64;
    let successful = current
        .iter()
        .filter(|r| r.status.as_deref() == Some("completed"))
        .count() as f64;
    let failed = current
        .iter()
        .filter(|r| r.status.as_deref() == Some("failed"))
        .count() as i64;
    let success_rate = if total_syncs > 0 {
        (successful / total_syncs as f64) * 100.0
    } else {
        0.0
    };

    let total_api_calls: i64 = current
        .iter()
        .map(|r| r.google_api_calls_count.unwrap_or(0))
        .sum();

    let total_events_synced: i64 = current
        .iter()
        .map(|r| {
            r.inserted_events.unwrap_or(0)
                + r.updated_events.unwrap_or(0)
                + r.deleted_events.unwrap_or(0)
        })
        .sum();

    let valid_durations: Vec<i64> = current
        .iter()
        .filter_map(|r| r.timing_total_ms.filter(|&d| d > 0))
        .collect();
    let avg_duration_ms = if valid_durations.is_empty() {
        0.0_f64
    } else {
        valid_durations.iter().sum::<i64>() as f64 / valid_durations.len() as f64
    };

    vec![
        json!({ "label": "Total syncs (24h)", "value": total_syncs }),
        json!({ "label": "Success rate", "value": format!("{success_rate:.1}%") }),
        json!({ "label": "Average duration", "value": format!("{avg_duration_ms:.0}ms") }),
        json!({ "label": "API calls (24h)", "value": total_api_calls }),
        json!({ "label": "Events synced (24h)", "value": total_events_synced }),
        json!({ "label": "Failed syncs (24h)", "value": failed }),
    ]
}

fn map_log_row(row: &LogRow) -> LogEntry {
    let duration = row.timing_total_ms.unwrap_or(0);
    let events = row.inserted_events.unwrap_or(0)
        + row.updated_events.unwrap_or(0)
        + row.deleted_events.unwrap_or(0);
    let user = row
        .users
        .as_ref()
        .and_then(|u| u.display_name.clone())
        .filter(|n| !n.is_empty());

    LogEntry {
        duration,
        events,
        id: row.id.clone().unwrap_or_default(),
        source: CALENDAR_SOURCE.to_owned(),
        status: row.status.clone().unwrap_or_default(),
        timestamp: row.updated_at.clone().unwrap_or_default(),
        sync_type: row.sync_type.clone().unwrap_or_default(),
        user,
    }
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

fn calendar_sync_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Time helpers (no chrono; algorithm from Howard Hinnant's civil_from_days)
// ---------------------------------------------------------------------------

fn unix_seconds_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Convert a UTC unix timestamp (seconds) to an ISO-8601 string, e.g.
/// `2026-01-15T10:30:00.000Z`, matching JavaScript `new Date().toISOString()`.
fn iso_from_unix_seconds(total_seconds: i64) -> String {
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month as u32, day)
}

// ---------------------------------------------------------------------------
// Tests (pure / sync helpers only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calendar_sync_ws_id_extracts_uuid() {
        let ws_id = "11111111-1111-4111-8111-111111111111";
        let path = format!("/api/v1/workspaces/{ws_id}/settings/calendar-sync");
        assert_eq!(calendar_sync_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn calendar_sync_ws_id_rejects_wrong_prefix() {
        assert!(
            calendar_sync_ws_id(
                "/api/v2/workspaces/11111111-1111-4111-8111-111111111111/settings/calendar-sync"
            )
            .is_none()
        );
    }

    #[test]
    fn calendar_sync_ws_id_rejects_wrong_suffix() {
        assert!(
            calendar_sync_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/settings/calendar-sync/extra"
            )
            .is_none()
        );
    }

    #[test]
    fn calendar_sync_ws_id_rejects_empty_ws_id() {
        assert!(calendar_sync_ws_id("/api/v1/workspaces//settings/calendar-sync").is_none());
    }

    #[test]
    fn calendar_sync_ws_id_rejects_path_traversal() {
        assert!(calendar_sync_ws_id("/api/v1/workspaces/a/b/settings/calendar-sync").is_none());
    }

    #[test]
    fn iso_from_unix_seconds_formats_epoch() {
        assert_eq!(iso_from_unix_seconds(0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn iso_from_unix_seconds_formats_known_timestamp() {
        // 2024-01-15T10:30:00Z = 1705314600
        assert_eq!(
            iso_from_unix_seconds(1_705_314_600),
            "2024-01-15T10:30:00.000Z"
        );
    }

    #[test]
    fn compute_metrics_returns_zeros_for_empty_input() {
        let now_secs = 1_705_314_600_i64;
        let metrics = compute_metrics(&[], now_secs);
        assert_eq!(metrics.len(), 6);
        assert_eq!(metrics[0]["label"], "Total syncs (24h)");
        assert_eq!(metrics[0]["value"], 0);
        assert_eq!(metrics[1]["value"], "0.0%");
        assert_eq!(metrics[2]["value"], "0ms");
    }

    #[test]
    fn compute_metrics_counts_24h_window_only() {
        let now_secs = 1_705_314_600_i64; // fixed reference
        let in_window = iso_from_unix_seconds(now_secs - 3_600); // 1 h ago
        let out_of_window = iso_from_unix_seconds(now_secs - SECONDS_48H - 100); // >48 h ago

        let rows = vec![
            MetricsRow {
                status: Some("completed".to_owned()),
                updated_at: Some(in_window.clone()),
                timing_total_ms: Some(500),
                google_api_calls_count: Some(3),
                inserted_events: Some(1),
                updated_events: Some(2),
                deleted_events: Some(0),
            },
            MetricsRow {
                status: Some("failed".to_owned()),
                updated_at: Some(out_of_window),
                timing_total_ms: None,
                google_api_calls_count: Some(99),
                inserted_events: None,
                updated_events: None,
                deleted_events: None,
            },
        ];

        let metrics = compute_metrics(&rows, now_secs);
        assert_eq!(metrics[0]["value"], 1); // only the in-window row
        assert_eq!(metrics[1]["value"], "100.0%");
        assert_eq!(metrics[2]["value"], "500ms");
        assert_eq!(metrics[3]["value"], 3);
        assert_eq!(metrics[4]["value"], 3);
        assert_eq!(metrics[5]["value"], 0);
    }

    #[test]
    fn map_log_row_fills_defaults_for_none_fields() {
        let row = LogRow {
            id: None,
            updated_at: None,
            sync_type: None,
            status: None,
            inserted_events: None,
            updated_events: None,
            deleted_events: None,
            timing_total_ms: None,
            users: None,
        };
        let entry = map_log_row(&row);
        assert_eq!(entry.duration, 0);
        assert_eq!(entry.events, 0);
        assert_eq!(entry.source, CALENDAR_SOURCE);
        assert!(entry.user.is_none());
    }

    #[test]
    fn map_log_row_propagates_user_display_name() {
        let row = LogRow {
            id: Some("abc".to_owned()),
            updated_at: Some("2024-01-15T10:00:00Z".to_owned()),
            sync_type: Some("full".to_owned()),
            status: Some("completed".to_owned()),
            inserted_events: Some(5),
            updated_events: Some(3),
            deleted_events: Some(1),
            timing_total_ms: Some(1_200),
            users: Some(LogUserRow {
                display_name: Some("Alice".to_owned()),
            }),
        };
        let entry = map_log_row(&row);
        assert_eq!(entry.duration, 1_200);
        assert_eq!(entry.events, 9);
        assert_eq!(entry.user, Some("Alice".to_owned()));
    }
}
