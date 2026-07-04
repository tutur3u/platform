//! Handler for `GET /api/:wsId/calendar/auto-schedule`.
//!
//! Ports the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/[wsId]/calendar/auto-schedule/route.ts`.
//!
//! The POST method (which uses an internal-trigger secret key and executes the
//! full AI scheduling algorithm with `@tuturuuu/ai/scheduling`) is NOT migrated
//! here — this handler returns `None` for every non-GET method so the worker
//! falls through to the still-live Next.js route for POST.
//!
//! # Legacy GET flow
//!
//! 1. `getPermissions({ wsId })` resolves the caller's workspace permissions
//!    (including `internal`/`personal` slug and handle normalization).
//!    A `null` result -> `404 { "error": "Not found" }`.
//! 2. `withoutPermission('manage_calendar')` ->
//!    `403 { "error": "You do not have permission to manage calendar" }`.
//! 3. Optional `startDate` / `endDate` query params narrow the event fetch.
//! 4. `createCalendarOptimizer(wsId, dateRange).analyzeHealth()` fetches
//!    `workspace_calendar_events` via the RLS-active session client, runs an
//!    O(n²) conflict-detection pass, computes the average gap in minutes
//!    between consecutive events, and computes a health score.
//! 5. Success: `200 { "success": true, "health": { ... }, "algorithm": "pure_algorithmic" }`.
//! 6. Unhandled exception -> `500 { "error": "Failed to check calendar health" }`.
//!
//! # Behavior gaps vs. legacy
//!
//! - **Session client** — `analyzeHealth` in the legacy fetches events through
//!   the RLS-active session client (`createClient()`). This handler uses the
//!   service-role key after verifying the caller's permission via
//!   `authorize_workspace_permission`; the result is equivalent because the
//!   `ws_id` filter already scopes the data to the verified workspace.
//! - **Timestamp precision** — gap averages are derived from a built-in
//!   ISO 8601 parser with seconds precision. Sub-second differences in stored
//!   timestamps are truncated; the practical difference is negligible.
//! - **Cache-Control** — the legacy route sets no explicit cache header; this
//!   handler emits `no-store` (the backend read convention) to prevent any
//!   intermediary caching of authenticated data.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    path_segments,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MANAGE_CALENDAR_PERMISSION: &str = "manage_calendar";

// ---------------------------------------------------------------------------
// Calendar event row returned from Supabase REST
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CalendarEventRow {
    start_at: Option<String>,
    end_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_wsid_calendar_auto_schedule_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = auto_schedule_ws_id(request.path)?;

    Some(match request.method {
        "GET" => auto_schedule_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn auto_schedule_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_CALENDAR_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return error_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(404, "Not found");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return error_response(403, "You do not have permission to manage calendar");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, "Failed to check calendar health");
        }
    };

    let ws_id = &authorization.ws_id;

    // Extract optional date-range query params.
    let start_date = query_param(request.url, "startDate");
    let end_date = query_param(request.url, "endDate");
    let date_range: Option<(&str, &str)> = match (&start_date, &end_date) {
        (Some(s), Some(e)) => Some((s.as_str(), e.as_str())),
        _ => None,
    };

    let events =
        match fetch_calendar_events(&config.contact_data, outbound, ws_id, date_range).await {
            Ok(rows) => rows,
            Err(()) => return error_response(500, "Failed to check calendar health"),
        };

    let health = analyze_health(&events);

    no_store_response(json_response(
        200,
        json!({
            "success": true,
            "health": {
                "healthScore": health.health_score,
                "conflicts": health.conflicts,
                "averageGapMinutes": health.average_gap_minutes,
                "message": health.message,
            },
            "algorithm": "pure_algorithmic",
        }),
    ))
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async fn fetch_calendar_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    date_range: Option<(&str, &str)>,
) -> Result<Vec<CalendarEventRow>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "start_at,end_at".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "start_at.asc".to_owned()),
    ];

    if let Some((start_date, end_date)) = date_range {
        let start_dt = format!("{start_date}T00:00:00.000Z");
        let end_dt = format!("{end_date}T23:59:59.999Z");
        params.push(("start_at", format!("gte.{start_dt}")));
        params.push(("start_at", format!("lte.{end_dt}")));
    }

    let url = contact_data
        .rest_url("workspace_calendar_events", &params)
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<CalendarEventRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Health analysis — pure algorithmic, mirrors tools.ts `analyzeHealth`
// ---------------------------------------------------------------------------

struct HealthResult {
    health_score: i64,
    conflicts: usize,
    average_gap_minutes: i64,
    message: String,
}

fn analyze_health(events: &[CalendarEventRow]) -> HealthResult {
    if events.is_empty() {
        return HealthResult {
            health_score: 100,
            conflicts: 0,
            average_gap_minutes: 0,
            message: "Calendar is empty - perfect health score!".to_owned(),
        };
    }

    let conflicts = count_conflicts(events);
    let avg_gap = average_gap_minutes(events);
    let health_score = calculate_health_score(conflicts, avg_gap);

    HealthResult {
        health_score,
        conflicts,
        average_gap_minutes: avg_gap.round() as i64,
        message: format!("Calendar health score: {health_score}/100. Found {conflicts} conflicts."),
    }
}

/// O(n²) interval overlap count — mirrors `detectConflicts` in `tools.ts`.
fn count_conflicts(events: &[CalendarEventRow]) -> usize {
    let mut count = 0_usize;
    for i in 0..events.len() {
        for j in (i + 1)..events.len() {
            if events_overlap(&events[i], &events[j]) {
                count += 1;
            }
        }
    }
    count
}

/// Returns `true` when two events overlap (`start1 < end2 && start2 < end1`).
///
/// Uses lexicographic string comparison on ISO 8601 UTC timestamps, which is
/// correct when all values are UTC (the `toISOString()` output from JavaScript).
fn events_overlap(a: &CalendarEventRow, b: &CalendarEventRow) -> bool {
    let (Some(a_start), Some(a_end)) = (a.start_at.as_deref(), a.end_at.as_deref()) else {
        return false;
    };
    let (Some(b_start), Some(b_end)) = (b.start_at.as_deref(), b.end_at.as_deref()) else {
        return false;
    };
    a_start < b_end && b_start < a_end
}

/// Average gap in minutes between consecutive events sorted by `start_at`.
///
/// Mirrors `calculateGapMetrics` in `tools.ts` — only positive gaps are
/// included; overlapping pairs contribute zero to the average.
fn average_gap_minutes(events: &[CalendarEventRow]) -> f64 {
    let mut gaps: Vec<f64> = Vec::new();

    for i in 1..events.len() {
        let prev = &events[i - 1];
        let curr = &events[i];

        let (Some(prev_end), Some(curr_start)) = (prev.end_at.as_deref(), curr.start_at.as_deref())
        else {
            continue;
        };

        if let (Some(end_secs), Some(start_secs)) =
            (parse_iso_to_secs(prev_end), parse_iso_to_secs(curr_start))
        {
            let gap_minutes = (start_secs - end_secs) as f64 / 60.0;
            if gap_minutes > 0.0 {
                gaps.push(gap_minutes);
            }
        }
    }

    if gaps.is_empty() {
        0.0
    } else {
        gaps.iter().sum::<f64>() / gaps.len() as f64
    }
}

/// Calendar health score — mirrors `calculateHealthScore` in `tools.ts`.
///
/// Starts at 100 and subtracts:
///
/// - 15 points per conflict pair.
/// - 0.5 points per minute of average gap exceeding 60 minutes.
///
/// Clamped to `[0, 100]`.
fn calculate_health_score(conflict_count: usize, average_gap_min: f64) -> i64 {
    let mut score = 100.0_f64;
    score -= conflict_count as f64 * 15.0;
    if average_gap_min > 60.0 {
        score -= (average_gap_min - 60.0) * 0.5;
    }
    score.clamp(0.0, 100.0).round() as i64
}

// ---------------------------------------------------------------------------
// ISO 8601 timestamp parser (seconds since Unix epoch, UTC assumed)
// ---------------------------------------------------------------------------

/// Converts an ISO 8601 UTC timestamp string to seconds since the Unix epoch.
///
/// Accepted formats:
///
/// - `2024-01-15T10:30:00Z`
/// - `2024-01-15T10:30:00.000Z`
/// - `2024-01-15T10:30:00+00:00`
/// - `2024-01-15T10:30:00-05:00` (treated as UTC; offset is stripped)
///
/// Returns `None` on any parse failure.
fn parse_iso_to_secs(s: &str) -> Option<i64> {
    let s = s.trim();
    // Strip trailing 'Z'.
    let s = s.strip_suffix('Z').unwrap_or(s);
    // Strip a positive timezone offset (e.g. `+00:00`).
    let s = s.rfind('+').map_or(s, |pos| &s[..pos]);
    // Strip a negative timezone offset after the date part (position >= 10).
    // Avoid stripping the year/month/day dashes which all fall before index 10.
    let s = s
        .get(10..)
        .and_then(|tail| tail.rfind('-'))
        .map_or(s, |rel| &s[..10 + rel]);

    let (date_part, time_part) = s.split_once('T')?;

    let mut date_iter = date_part.splitn(3, '-');
    let year: i64 = date_iter.next()?.parse().ok()?;
    let month: i64 = date_iter.next()?.parse().ok()?;
    let day: i64 = date_iter.next()?.parse().ok()?;

    // Strip sub-second precision if present.
    let time_part = time_part.split('.').next().unwrap_or(time_part);
    let mut time_iter = time_part.splitn(3, ':');
    let hour: i64 = time_iter.next()?.parse().ok()?;
    let min: i64 = time_iter.next()?.parse().ok()?;
    let sec: i64 = time_iter.next()?.parse().ok()?;

    let days = days_from_civil(year, month, day)?;
    Some(days * 86400 + hour * 3600 + min * 60 + sec)
}

/// Civil date (year, month 1-12, day 1-31) to days since 1970-01-01 (UTC).
///
/// Uses the algorithm from Howard Hinnant's date library
/// (`<https://howardhinnant.github.io/date_algorithms.html>`).
fn days_from_civil(y: i64, m: i64, d: i64) -> Option<i64> {
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    Some(era * 146097 + doe - 719468)
}

// ---------------------------------------------------------------------------
// Query-param helper
// ---------------------------------------------------------------------------

fn query_param(url: Option<&str>, key: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        if k == key && !v.is_empty() {
            return Some(v.to_owned());
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

fn auto_schedule_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);
    match segments.as_slice() {
        ["api", ws_id, "calendar", "auto-schedule"] if !ws_id.is_empty() => Some(ws_id),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const WS_ID: &str = "11111111-1111-4111-8111-111111111111";

    fn leaked(s: String) -> &'static str {
        Box::leak(s.into_boxed_str())
    }

    // -- Path extraction --

    #[test]
    fn path_matches_uuid_ws_id() {
        assert_eq!(
            auto_schedule_ws_id(&format!("/api/{WS_ID}/calendar/auto-schedule")),
            Some(WS_ID)
        );
    }

    #[test]
    fn path_matches_slug_ws_id() {
        assert_eq!(
            auto_schedule_ws_id("/api/my-ws/calendar/auto-schedule"),
            Some("my-ws")
        );
    }

    #[test]
    fn path_rejects_extra_trailing_segment() {
        assert_eq!(
            auto_schedule_ws_id(leaked(format!("/api/{WS_ID}/calendar/auto-schedule/extra"))),
            None
        );
    }

    #[test]
    fn path_rejects_wrong_resource() {
        assert_eq!(
            auto_schedule_ws_id(leaked(format!("/api/{WS_ID}/calendar/settings"))),
            None
        );
    }

    #[test]
    fn path_rejects_empty_ws_segment() {
        assert_eq!(auto_schedule_ws_id("/api//calendar/auto-schedule"), None);
    }

    #[test]
    fn path_rejects_v1_infix() {
        // Legacy path is /api/:wsId/... (no v1 segment).
        assert_eq!(
            auto_schedule_ws_id(leaked(format!("/api/v1/{WS_ID}/calendar/auto-schedule"))),
            None
        );
    }

    #[test]
    fn path_rejects_short_path() {
        assert_eq!(auto_schedule_ws_id("/api"), None);
        assert_eq!(auto_schedule_ws_id("/api/ws"), None);
    }

    // -- ISO timestamp parser --

    #[test]
    fn parses_utc_z_timestamp() {
        // 2024-01-01T00:00:00Z = 1_704_067_200 seconds since epoch.
        assert_eq!(
            parse_iso_to_secs("2024-01-01T00:00:00Z"),
            Some(1_704_067_200)
        );
    }

    #[test]
    fn parses_millis_suffix() {
        assert_eq!(
            parse_iso_to_secs("2024-01-01T00:00:00.000Z"),
            Some(1_704_067_200)
        );
    }

    #[test]
    fn parses_nonzero_time_component() {
        // 2024-01-01T01:30:00Z = 1_704_067_200 + 5_400 = 1_704_072_600
        assert_eq!(
            parse_iso_to_secs("2024-01-01T01:30:00Z"),
            Some(1_704_072_600)
        );
    }

    #[test]
    fn parses_positive_offset_by_stripping_it() {
        // Offset is stripped; result is the same as the UTC clock reading.
        assert_eq!(
            parse_iso_to_secs("2024-01-01T00:00:00+00:00"),
            Some(1_704_067_200)
        );
    }

    #[test]
    fn returns_none_on_garbage_input() {
        assert_eq!(parse_iso_to_secs("not-a-date"), None);
        assert_eq!(parse_iso_to_secs(""), None);
    }

    // -- Conflict detection --

    fn event(start: &str, end: &str) -> CalendarEventRow {
        CalendarEventRow {
            start_at: Some(start.to_owned()),
            end_at: Some(end.to_owned()),
        }
    }

    #[test]
    fn no_conflicts_on_empty_list() {
        assert_eq!(count_conflicts(&[]), 0);
    }

    #[test]
    fn no_conflicts_for_adjacent_events() {
        // Events that share exactly one boundary point do NOT overlap.
        let evts = [
            event("2024-01-01T09:00:00Z", "2024-01-01T10:00:00Z"),
            event("2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"),
        ];
        assert_eq!(count_conflicts(&evts), 0);
    }

    #[test]
    fn detects_one_overlapping_pair() {
        let evts = [
            event("2024-01-01T09:00:00Z", "2024-01-01T10:30:00Z"),
            event("2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"),
        ];
        assert_eq!(count_conflicts(&evts), 1);
    }

    #[test]
    fn counts_all_overlapping_pairs() {
        // Three mutually overlapping events -> 3 pairs.
        let evts = [
            event("2024-01-01T09:00:00Z", "2024-01-01T11:00:00Z"),
            event("2024-01-01T09:30:00Z", "2024-01-01T10:30:00Z"),
            event("2024-01-01T10:00:00Z", "2024-01-01T12:00:00Z"),
        ];
        assert_eq!(count_conflicts(&evts), 3);
    }

    // -- Health score --

    #[test]
    fn perfect_score_for_no_conflicts_and_small_gap() {
        assert_eq!(calculate_health_score(0, 30.0), 100);
    }

    #[test]
    fn conflict_penalty_is_15_per_pair() {
        assert_eq!(calculate_health_score(2, 0.0), 70);
    }

    #[test]
    fn gap_penalty_applies_above_60_minutes() {
        // Average gap of 120 min -> (120-60)*0.5 = 30 penalty -> score 70.
        assert_eq!(calculate_health_score(0, 120.0), 70);
    }

    #[test]
    fn score_clamps_to_zero_minimum() {
        assert_eq!(calculate_health_score(10, 200.0), 0);
    }

    #[test]
    fn score_clamps_to_100_maximum() {
        // Negative conflicts not possible in practice, but clamp holds.
        assert_eq!(calculate_health_score(0, 0.0), 100);
    }

    // -- Average gap --

    #[test]
    fn gap_of_60_minutes_between_two_events() {
        let evts = [
            event("2024-01-01T09:00:00Z", "2024-01-01T10:00:00Z"),
            event("2024-01-01T11:00:00Z", "2024-01-01T12:00:00Z"),
        ];
        let gap = average_gap_minutes(&evts);
        assert!((gap - 60.0).abs() < 0.01, "expected 60 min gap, got {gap}");
    }

    #[test]
    fn zero_average_gap_for_single_event() {
        let evts = [event("2024-01-01T09:00:00Z", "2024-01-01T10:00:00Z")];
        assert_eq!(average_gap_minutes(&evts), 0.0);
    }

    #[test]
    fn overlapping_events_contribute_no_gap() {
        // Events overlap, so gap is negative -> excluded -> average is 0.
        let evts = [
            event("2024-01-01T09:00:00Z", "2024-01-01T10:30:00Z"),
            event("2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"),
        ];
        assert_eq!(average_gap_minutes(&evts), 0.0);
    }

    // -- Analyze health (integration) --

    #[test]
    fn empty_calendar_returns_perfect_health() {
        let h = analyze_health(&[]);
        assert_eq!(h.health_score, 100);
        assert_eq!(h.conflicts, 0);
        assert_eq!(h.average_gap_minutes, 0);
        assert!(h.message.contains("empty"));
    }

    #[test]
    fn conflict_is_reflected_in_health_score() {
        let evts = [
            event("2024-01-01T09:00:00Z", "2024-01-01T10:30:00Z"),
            event("2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"),
        ];
        let h = analyze_health(&evts);
        assert_eq!(h.conflicts, 1);
        assert_eq!(h.health_score, 85); // 100 - 15
        assert!(h.message.contains("1 conflicts"));
    }

    // -- Query param extraction --

    #[test]
    fn extracts_start_date_param() {
        assert_eq!(
            query_param(
                Some("/api/ws/calendar/auto-schedule?startDate=2024-01-01&endDate=2024-01-31"),
                "startDate"
            ),
            Some("2024-01-01".to_owned())
        );
    }

    #[test]
    fn extracts_end_date_param() {
        assert_eq!(
            query_param(
                Some("/api/ws/calendar/auto-schedule?startDate=2024-01-01&endDate=2024-01-31"),
                "endDate"
            ),
            Some("2024-01-31".to_owned())
        );
    }

    #[test]
    fn returns_none_for_absent_param() {
        assert_eq!(
            query_param(Some("/api/ws/calendar/auto-schedule"), "startDate"),
            None
        );
    }

    #[test]
    fn returns_none_when_url_is_none() {
        assert_eq!(query_param(None, "startDate"), None);
    }

    // -- Error response shape --

    #[test]
    fn error_response_uses_error_key() {
        let r = error_response(403, "You do not have permission to manage calendar");
        assert_eq!(r.status, 403);
        assert_eq!(
            r.body,
            json!({ "error": "You do not have permission to manage calendar" })
        );

        let r = error_response(404, "Not found");
        assert_eq!(r.status, 404);
        assert_eq!(r.body, json!({ "error": "Not found" }));
    }
}
