//! Handler for
//! `/api/v1/workspaces/:wsId/user-groups/sessions/group-summaries`.
//!
//! Mirrors the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/sessions/group-summaries/route.ts`.
//!
//! The legacy `GET` handler requires `getPermissions({ wsId, request })` to
//! return non-null AND the `view_user_groups` permission. Missing/invalid
//! workspace access maps to `404 { "message": "Not found" }`, missing
//! permission maps to `403 { "message": "Insufficient permissions to view user
//! group sessions" }`.
//!
//! Query params (`?from=&groupIds=&timezone=`):
//!   * `from`: RFC3339 datetime (required, must be valid `z.string().datetime()`).
//!   * `groupIds`: comma-separated UUIDs, de-duplicated, max 100.
//!   * `timezone`: IANA timezone name (default `Asia/Ho_Chi_Minh`), 1..=128 chars.
//! Invalid query -> `400 { "message": "Invalid request query", "errors": [...] }`.
//! Empty `groupIds` -> `200 { "data": [] }`.
//!
//! On success it returns `200 { "data": [ {groupId, managerCount, nonManagerCount,
//! upcomingCount, exceptionCount, patterns: [...] }, ... ] }` ordered by the
//! requested (and existing) group ids.
//!
//! IMPORTANT FIDELITY NOTE: the legacy summary uses `dayjs(...).tz(timezone)` to
//! bucket session occurrences by local wall-clock `HH:mm` and day-of-week, and
//! to compute the 28-day range start (`startOf('day')` in `timezone`). Cloudflare
//! Workers / this crate have no IANA timezone database, so this port resolves a
//! FIXED UTC offset for the requested timezone (exact for the default
//! `Asia/Ho_Chi_Minh` = +07:00, and `UTC`). Unknown timezones fall back to UTC
//! (offset 0). DST-observing zones are therefore approximated. The DB-level
//! range filter (`starts_at >= rangeStart`, `starts_at < rangeEnd`) is applied
//! using the same computed offset, so it stays internally consistent.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const DEFAULT_TIMEZONE: &str = "Asia/Ho_Chi_Minh";
const MAX_GROUP_SUMMARY_IDS: usize = 100;
const SCHEDULE_SUMMARY_DAYS: i64 = 28;
const DEFAULT_PATTERN_LIMIT: usize = 3;
const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const SECONDS_PER_DAY: i64 = 86_400;
const PRIVATE_SCHEMA: &str = "private";

#[derive(Deserialize)]
struct GroupIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    group_id: Option<String>,
    role: Option<String>,
}

#[derive(Deserialize)]
struct SessionRow {
    group_id: Option<String>,
    starts_at: Option<String>,
    ends_at: Option<String>,
}

/// Matches `/api/v1/workspaces/:wsId/user-groups/sessions/group-summaries`.
/// Returns the raw `:wsId` segment when the path shape matches.
fn group_summaries_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && segments[5] == "sessions"
        && segments[6] == "group-summaries"
    {
        Some(segments[3])
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

pub(crate) async fn handle_workspaces_user_groups_sessions_group_summaries_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = group_summaries_ws_id(request.path)?;

    Some(match request.method {
        "GET" => group_summaries_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn group_summaries_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate + authorize `view_user_groups`. This also normalizes the
    // workspace id (resolving `personal`/`internal`/handle aliases).
    let resolved_ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_USER_GROUPS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => return not_found_response(),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return insufficient_permissions_response();
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => return list_error_response(),
    };

    // Parse + validate query params, mirroring the Zod schema.
    let parsed = match parse_query(request.url) {
        Ok(parsed) => parsed,
        Err(errors) => return invalid_query_response(errors),
    };

    if parsed.group_ids.is_empty() {
        return no_store_response(json_response(200, json!({ "data": [] })));
    }

    match list_group_summaries(contact_data, outbound, &resolved_ws_id, &parsed).await {
        Ok(data) => no_store_response(json_response(200, json!({ "data": data }))),
        Err(()) => list_error_response(),
    }
}

struct ParsedQuery {
    from: String,
    group_ids: Vec<String>,
    timezone: String,
}

/// Mirrors the Zod `QuerySchema`. Returns a list of error issue objects (shape
/// compatible with the legacy `{ message, errors }` payload) when invalid.
fn parse_query(request_url: Option<&str>) -> Result<ParsedQuery, Vec<Value>> {
    let mut from: Option<String> = None;
    let mut group_ids_raw: Option<String> = None;
    let mut timezone: Option<String> = None;

    if let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "from" => from = Some(value.into_owned()),
                "groupIds" => group_ids_raw = Some(value.into_owned()),
                "timezone" => timezone = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let mut errors: Vec<Value> = Vec::new();

    // from: required RFC3339 datetime.
    let from_value = match from {
        Some(value) if is_rfc3339_datetime(&value) => value,
        _ => {
            errors.push(json!({
                "path": ["from"],
                "message": "Invalid datetime",
            }));
            String::new()
        }
    };

    // groupIds: split, trim, drop empties, de-dup; each must be a UUID; max 100.
    let group_ids = read_group_ids(group_ids_raw.as_deref());
    if group_ids.len() > MAX_GROUP_SUMMARY_IDS {
        errors.push(json!({
            "path": ["groupIds"],
            "message": format!("Array must contain at most {MAX_GROUP_SUMMARY_IDS} element(s)"),
        }));
    }
    for (index, id) in group_ids.iter().enumerate() {
        if !is_uuid(id) {
            errors.push(json!({
                "path": ["groupIds", index],
                "message": "Invalid uuid",
            }));
        }
    }

    // timezone: trimmed, 1..=128 chars; default when absent.
    let timezone_value = match timezone {
        Some(value) => {
            let trimmed = value.trim().to_owned();
            if trimmed.is_empty() || trimmed.len() > 128 {
                errors.push(json!({
                    "path": ["timezone"],
                    "message": "Invalid timezone",
                }));
                trimmed
            } else {
                trimmed
            }
        }
        None => DEFAULT_TIMEZONE.to_owned(),
    };

    if errors.is_empty() {
        Ok(ParsedQuery {
            from: from_value,
            group_ids,
            timezone: timezone_value,
        })
    } else {
        Err(errors)
    }
}

fn read_group_ids(value: Option<&str>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };

    let mut seen = Vec::new();
    for raw in value.split(',') {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !seen.iter().any(|existing: &String| existing == trimmed) {
            seen.push(trimmed.to_owned());
        }
    }
    seen
}

async fn list_group_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ParsedQuery,
) -> Result<Vec<Value>, ()> {
    // Validate the requested groups belong to the workspace.
    let valid_group_ids =
        fetch_valid_group_ids(contact_data, outbound, ws_id, &query.group_ids).await?;
    if valid_group_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Preserve request order, restricted to existing groups.
    let ordered_group_ids: Vec<String> = query
        .group_ids
        .iter()
        .filter(|id| valid_group_ids.iter().any(|valid| valid == *id))
        .cloned()
        .collect();

    // Resolve the fixed offset for the timezone and the 28-day range.
    let offset_seconds = timezone_offset_seconds(&query.timezone);
    let Some(from_epoch) = parse_rfc3339_epoch_seconds(&query.from) else {
        return Err(());
    };
    let range_start_epoch = start_of_local_day(from_epoch, offset_seconds);
    let range_end_epoch = range_start_epoch + SCHEDULE_SUMMARY_DAYS * SECONDS_PER_DAY;
    let range_start_iso = format_utc_iso(range_start_epoch);
    let range_end_iso = format_utc_iso(range_end_epoch);

    let memberships = fetch_memberships(contact_data, outbound, ws_id, &ordered_group_ids).await?;
    let sessions = fetch_sessions(
        contact_data,
        outbound,
        ws_id,
        &ordered_group_ids,
        &range_start_iso,
        &range_end_iso,
    )
    .await?;

    // Count managers (role == TEACHER) vs non-managers per group.
    let mut counts: Vec<(String, i64, i64)> = ordered_group_ids
        .iter()
        .map(|id| (id.clone(), 0i64, 0i64))
        .collect();
    for row in memberships {
        let Some(group_id) = row.group_id else {
            continue;
        };
        if !valid_group_ids.iter().any(|valid| valid == &group_id) {
            continue;
        }
        if let Some(entry) = counts.iter_mut().find(|(id, _, _)| id == &group_id) {
            if row.role.as_deref() == Some("TEACHER") {
                entry.1 += 1;
            } else {
                entry.2 += 1;
            }
        }
    }

    // Bucket sessions per group.
    let mut sessions_by_group: Vec<(String, Vec<(i64, i64)>)> = ordered_group_ids
        .iter()
        .map(|id| (id.clone(), Vec::new()))
        .collect();
    for row in sessions {
        let (Some(group_id), Some(starts_at), Some(ends_at)) =
            (row.group_id, row.starts_at, row.ends_at)
        else {
            continue;
        };
        let (Some(start_epoch), Some(end_epoch)) = (
            parse_rfc3339_epoch_seconds(&starts_at),
            parse_rfc3339_epoch_seconds(&ends_at),
        ) else {
            continue;
        };
        if let Some(entry) = sessions_by_group.iter_mut().find(|(id, _)| id == &group_id) {
            entry.1.push((start_epoch, end_epoch));
        }
    }

    Ok(ordered_group_ids
        .iter()
        .map(|group_id| {
            let occurrences = sessions_by_group
                .iter()
                .find(|(id, _)| id == group_id)
                .map(|(_, list)| list.as_slice())
                .unwrap_or(&[]);
            let schedule = summarize_next_four_week_schedule(
                range_start_epoch,
                range_end_epoch,
                offset_seconds,
                occurrences,
            );
            let (manager_count, non_manager_count) = counts
                .iter()
                .find(|(id, _, _)| id == group_id)
                .map(|(_, manager, non_manager)| (*manager, *non_manager))
                .unwrap_or((0, 0));

            json!({
                "exceptionCount": schedule.exception_count,
                "groupId": group_id,
                "managerCount": manager_count,
                "nonManagerCount": non_manager_count,
                "patterns": schedule.patterns,
                "upcomingCount": schedule.upcoming_count,
            })
        })
        .collect())
}

async fn fetch_valid_group_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_ids: &[String],
) -> Result<Vec<String>, ()> {
    let in_filter = format!("in.({})", group_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", in_filter),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<GroupIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.id)
        .filter(|id| !id.is_empty())
        .collect())
}

async fn fetch_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_ids: &[String],
) -> Result<Vec<MembershipRow>, ()> {
    let in_filter = format!("in.({})", group_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            (
                "select",
                "group_id,role,user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,ws_id)"
                    .to_owned(),
            ),
            ("group_id", in_filter),
            ("user.ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<MembershipRow>>().map_err(|_| ())
}

async fn fetch_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_ids: &[String],
    range_start_iso: &str,
    range_end_iso: &str,
) -> Result<Vec<SessionRow>, ()> {
    let in_filter = format!("in.({})", group_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_group_sessions",
        &[
            ("select", "group_id,starts_at,ends_at".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "eq.scheduled".to_owned()),
            ("group_id", in_filter),
            ("starts_at", format!("gte.{range_start_iso}")),
            ("starts_at", format!("lt.{range_end_iso}")),
            ("order", "starts_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<SessionRow>>().map_err(|_| ())
}

// ----- Schedule summarization (mirror of session-schedule-summary.ts) -----

struct PatternSummary {
    days_of_week: Vec<i64>,
    end_time: String,
    exception_count: i64,
    expected_count: i64,
    occurrence_count: i64,
    start_time: String,
}

struct ScheduleSummary {
    exception_count: i64,
    patterns: Vec<Value>,
    upcoming_count: i64,
}

struct Bucket {
    start_time: String,
    end_time: String,
    dates: Vec<i64>,
    days_of_week: Vec<i64>,
}

/// occurrences are `(start_epoch_seconds, end_epoch_seconds)`.
fn summarize_next_four_week_schedule(
    range_start_epoch: i64,
    range_end_epoch: i64,
    offset_seconds: i64,
    occurrences: &[(i64, i64)],
) -> ScheduleSummary {
    let mut buckets: Vec<Bucket> = Vec::new();
    let mut upcoming_count: i64 = 0;

    for (start_epoch, end_epoch) in occurrences.iter().copied() {
        // Range guard: startsAt in [rangeStart, rangeEnd).
        if start_epoch < range_start_epoch || start_epoch >= range_end_epoch {
            continue;
        }

        let start_time = local_hh_mm(start_epoch, offset_seconds);
        let end_time = local_hh_mm(end_epoch, offset_seconds);
        let day_of_week = local_day_of_week(start_epoch, offset_seconds);
        let date_key = local_day_index(start_epoch, offset_seconds);

        let key_index = buckets
            .iter()
            .position(|bucket| bucket.start_time == start_time && bucket.end_time == end_time);
        let bucket = match key_index {
            Some(index) => &mut buckets[index],
            None => {
                buckets.push(Bucket {
                    start_time: start_time.clone(),
                    end_time: end_time.clone(),
                    dates: Vec::new(),
                    days_of_week: Vec::new(),
                });
                buckets.last_mut().expect("just pushed")
            }
        };

        if !bucket.dates.contains(&date_key) {
            bucket.dates.push(date_key);
        }
        if !bucket.days_of_week.contains(&day_of_week) {
            bucket.days_of_week.push(day_of_week);
        }
        upcoming_count += 1;
    }

    let mut candidates: Vec<PatternSummary> = buckets
        .into_iter()
        .map(|mut bucket| {
            bucket.days_of_week.sort_unstable();
            let occurrence_count = bucket.dates.len() as i64;
            let expected_count = count_expected_occurrences(
                &bucket.days_of_week,
                range_start_epoch,
                range_end_epoch,
                offset_seconds,
            );
            PatternSummary {
                days_of_week: bucket.days_of_week,
                end_time: bucket.end_time,
                exception_count: (expected_count - occurrence_count).max(0),
                expected_count,
                occurrence_count,
                start_time: bucket.start_time,
            }
        })
        .filter(|pattern| pattern.occurrence_count >= 2)
        .collect();

    candidates.sort_by(|a, b| {
        b.occurrence_count
            .cmp(&a.occurrence_count)
            .then_with(|| a.start_time.cmp(&b.start_time))
            .then_with(|| a.end_time.cmp(&b.end_time))
    });

    let patterns: Vec<PatternSummary> =
        candidates.into_iter().take(DEFAULT_PATTERN_LIMIT).collect();
    let patterned_count: i64 = patterns
        .iter()
        .map(|pattern| pattern.occurrence_count)
        .sum();
    let pattern_exception_count: i64 = patterns.iter().map(|pattern| pattern.exception_count).sum();

    let pattern_values: Vec<Value> = patterns
        .iter()
        .map(|pattern| {
            json!({
                "daysOfWeek": pattern.days_of_week,
                "endTime": pattern.end_time,
                "exceptionCount": pattern.exception_count,
                "expectedCount": pattern.expected_count,
                "occurrenceCount": pattern.occurrence_count,
                "startTime": pattern.start_time,
            })
        })
        .collect();

    ScheduleSummary {
        exception_count: pattern_exception_count + (upcoming_count - patterned_count),
        patterns: pattern_values,
        upcoming_count,
    }
}

fn count_expected_occurrences(
    days_of_week: &[i64],
    range_start_epoch: i64,
    range_end_epoch: i64,
    offset_seconds: i64,
) -> i64 {
    let start_day = local_day_index(range_start_epoch, offset_seconds);
    let end_day = local_day_index(range_end_epoch, offset_seconds);
    let mut count = 0;
    let mut cursor = start_day;
    while cursor < end_day {
        let dow = day_index_to_day_of_week(cursor);
        if days_of_week.contains(&dow) {
            count += 1;
        }
        cursor += 1;
    }
    count
}

// ----- Date / timezone helpers (fixed-offset; see module fidelity note) -----

/// Resolves a fixed UTC offset (in seconds) for the timezone name. Exact for
/// `Asia/Ho_Chi_Minh` (+07:00) and `UTC`/`Etc/UTC`. Unknown zones default to 0.
fn timezone_offset_seconds(timezone: &str) -> i64 {
    match timezone {
        "Asia/Ho_Chi_Minh" | "Asia/Bangkok" | "Asia/Saigon" | "Asia/Jakarta"
        | "Asia/Phnom_Penh" | "Asia/Vientiane" => 7 * 3600,
        "UTC" | "Etc/UTC" | "Etc/Greenwich" | "GMT" => 0,
        other => parse_fixed_offset(other).unwrap_or(0),
    }
}

/// Parses fixed-offset zone strings like `UTC+7`, `+07:00`, `Etc/GMT-7`.
fn parse_fixed_offset(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    let candidate = trimmed
        .strip_prefix("UTC")
        .or_else(|| trimmed.strip_prefix("GMT"))
        .or_else(|| trimmed.strip_prefix("Etc/GMT"))
        .unwrap_or(trimmed);
    let candidate = candidate.trim();
    if candidate.is_empty() {
        return None;
    }

    let (sign, rest) = match candidate.as_bytes()[0] {
        b'+' => (1i64, &candidate[1..]),
        b'-' => (-1i64, &candidate[1..]),
        _ => return None,
    };
    // `Etc/GMT` has inverted sign semantics vs. ISO, but we keep ISO semantics
    // for plain `+/-HH:MM`. Etc/GMT handling is best-effort only.
    let (hours_str, minutes_str) = match rest.split_once(':') {
        Some((h, m)) => (h, m),
        None => (rest, "0"),
    };
    let hours: i64 = hours_str.trim().parse().ok()?;
    let minutes: i64 = minutes_str.trim().parse().ok()?;
    Some(sign * (hours * 3600 + minutes * 60))
}

/// Local day index (days since unix epoch) for the given epoch + offset.
fn local_day_index(epoch_seconds: i64, offset_seconds: i64) -> i64 {
    let local = epoch_seconds + offset_seconds;
    local.div_euclid(SECONDS_PER_DAY)
}

/// Start-of-local-day epoch (UTC seconds) for the given epoch + offset.
fn start_of_local_day(epoch_seconds: i64, offset_seconds: i64) -> i64 {
    local_day_index(epoch_seconds, offset_seconds) * SECONDS_PER_DAY - offset_seconds
}

/// Local `HH:mm` string for the given epoch + offset.
fn local_hh_mm(epoch_seconds: i64, offset_seconds: i64) -> String {
    let local = epoch_seconds + offset_seconds;
    let seconds_of_day = local.rem_euclid(SECONDS_PER_DAY);
    let hours = seconds_of_day / 3600;
    let minutes = (seconds_of_day % 3600) / 60;
    format!("{hours:02}:{minutes:02}")
}

/// Local day-of-week (0 = Sunday .. 6 = Saturday), matching dayjs `.day()`.
fn local_day_of_week(epoch_seconds: i64, offset_seconds: i64) -> i64 {
    day_index_to_day_of_week(local_day_index(epoch_seconds, offset_seconds))
}

/// Unix epoch day 0 (1970-01-01) was a Thursday -> day-of-week 4.
fn day_index_to_day_of_week(day_index: i64) -> i64 {
    (day_index + 4).rem_euclid(7)
}

/// Formats a UTC epoch-second as an RFC3339 `...Z` ISO string with millis
/// (matching dayjs `.toISOString()` output shape used by the legacy filter).
fn format_utc_iso(epoch_seconds: i64) -> String {
    let days = epoch_seconds.div_euclid(SECONDS_PER_DAY);
    let secs_of_day = epoch_seconds.rem_euclid(SECONDS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

/// Converts days-since-epoch to a civil `(year, month, day)` date (proleptic
/// Gregorian). Algorithm from Howard Hinnant's `civil_from_days`.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d)
}

/// Parses an RFC3339 datetime into UTC epoch seconds. Supports `Z` and
/// `±HH:MM` / `±HHMM` offsets and fractional seconds (truncated).
fn parse_rfc3339_epoch_seconds(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if value.len() < 19 {
        return None;
    }
    // Expect YYYY-MM-DD<sep>HH:MM:SS
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

    // Remainder: optional fractional seconds, then timezone designator.
    let mut rest = &value[19..];
    if rest.starts_with('.') {
        let frac_end = rest[1..]
            .find(|c: char| !c.is_ascii_digit())
            .map(|index| index + 1)
            .unwrap_or(rest.len());
        rest = &rest[frac_end..];
    }

    let offset_seconds = if rest.is_empty() {
        // No designator -> treat as UTC (lenient).
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
    let utc = days * SECONDS_PER_DAY + hour * 3600 + minute * 60 + second - offset_seconds;
    Some(utc)
}

/// Converts a civil `(year, month, day)` to days-since-epoch. Inverse of
/// `civil_from_days` (Howard Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Mirrors Zod `z.string().datetime()` (RFC3339 without offset by default, but
/// the legacy schema accepts the default which permits `Z`; here we accept any
/// value our parser can interpret as a valid UTC instant).
fn is_rfc3339_datetime(value: &str) -> bool {
    parse_rfc3339_epoch_seconds(value).is_some()
}

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

// ----- Outbound helpers -----

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

// ----- Response builders -----

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "message": "Not found" })))
}

fn insufficient_permissions_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": "Insufficient permissions to view user group sessions" }),
    ))
}

fn invalid_query_response(errors: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "message": "Invalid request query", "errors": errors }),
    ))
}

fn list_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Failed to list user group schedule summaries" }),
    ))
}
