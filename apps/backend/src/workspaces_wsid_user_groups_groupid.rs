//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/route.ts`.
//! The legacy route also exposes `PUT` and `DELETE` handlers; only `GET` is
//! ported here. Every non-GET method returns `None` so the worker falls through
//! to the still-live Next.js route.
//!
//! The legacy GET flow:
//!
//!   1. Normalize the workspace id (`resolveUserGroupRouteWorkspaceId`, which is
//!      `normalizeWorkspaceId`).
//!   2. Call `getPermissions({ wsId, request })`; if null, respond with
//!      `404 { "error": "Not found" }`.
//!   3. If `withoutPermission('view_user_groups')`, respond with
//!      `403 { "message": "Insufficient permissions to view user groups" }`.
//!   4. Read one row from `workspace_user_groups` (service-role client), selecting
//!      `id, name, starting_date, ending_date`, filtered by both `ws_id` and `id`.
//!   5. If the read errors, respond `500 { "message": "Error fetching workspace user group" }`.
//!   6. If no row found, respond `404 { "message": "Workspace user group not found" }`.
//!   7. Fetch session dates for the group from `workspace_user_group_sessions`
//!      (private schema), selecting `starts_at` for `status = scheduled`, ordered
//!      by `starts_at`; convert each to `YYYY-MM-DD` in the default timezone
//!      (`Asia/Ho_Chi_Minh`, UTC+07:00), de-duplicating.
//!   8. Respond `200 { "data": { id, name, starting_date, ending_date, sessions } }`.
//!
//! Auth is delegated to
//! `workspace_permission_check::authorize_workspace_permission`, which performs
//! workspace-id normalization, membership lookup, and the `view_user_groups`
//! permission check in one call.
//!
//! BEHAVIOR GAPS vs legacy:
//!
//!   - The shared auth helper collapses several legacy auth failure modes. This
//!     handler maps both `Unauthorized` and `NotFound` to
//!     `404 { "error": "Not found" }` and `Forbidden` to the `403` message.
//!   - Session date conversion uses a fixed UTC+07:00 offset (correct for
//!     `Asia/Ho_Chi_Minh` outside DST transitions; this runtime has no full
//!     IANA timezone database). DST-observing zones would be approximated.
//!   - If the secondary sessions fetch fails (network/config error), an empty
//!     sessions list is returned rather than a 500, providing graceful degradation
//!     for the secondary data; the primary group row fetch still gates the 500.

use serde::Deserialize;
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
const PATH_INFIX: &str = "/user-groups/";

const USER_GROUPS_TABLE: &str = "workspace_user_groups";
const SESSIONS_TABLE: &str = "workspace_user_group_sessions";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_PERMISSION: &str = "view_user_groups";
const SECONDS_PER_DAY: i64 = 86_400;

/// Fixed UTC offset for Asia/Ho_Chi_Minh (UTC+07:00, no DST).
const HO_CHI_MINH_OFFSET_SECS: i64 = 7 * 3600;

const NOT_FOUND_ERROR: &str = "Not found";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view user groups";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace user group";
const GROUP_NOT_FOUND_MESSAGE: &str = "Workspace user group not found";

/// Row returned from `workspace_user_groups` for the single-group lookup.
#[derive(Deserialize)]
struct UserGroupRow {
    id: Option<Value>,
    name: Option<Value>,
    starting_date: Option<Value>,
    ending_date: Option<Value>,
}

/// Row returned from `workspace_user_group_sessions` (private schema).
#[derive(Deserialize)]
struct SessionStartRow {
    starts_at: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => user_group_get_response(config, request, raw_ws_id, group_id, outbound).await,
        _ => return None,
    })
}

async fn user_group_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return error_response(404, NOT_FOUND_ERROR);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    let ws_id = &authorization.ws_id;

    let group_row = match fetch_user_group(contact_data, outbound, ws_id, group_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return message_response(404, GROUP_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    let session_dates = fetch_session_dates(contact_data, outbound, ws_id, group_id)
        .await
        .unwrap_or_default();

    // Build a JSON object matching the legacy `{ ...data, sessions }` spread,
    // where `data` comes from the DB row and `sessions` is appended.
    let session_values: Vec<Value> = session_dates.iter().map(|d| json!(d)).collect();
    let mut obj = serde_json::Map::new();
    obj.insert("id".to_owned(), group_row.id.unwrap_or(Value::Null));
    obj.insert("name".to_owned(), group_row.name.unwrap_or(Value::Null));
    obj.insert(
        "starting_date".to_owned(),
        group_row.starting_date.unwrap_or(Value::Null),
    );
    obj.insert(
        "ending_date".to_owned(),
        group_row.ending_date.unwrap_or(Value::Null),
    );
    obj.insert("sessions".to_owned(), Value::Array(session_values));

    no_store_response(json_response(200, json!({ "data": Value::Object(obj) })))
}

/// Fetch a single row from `workspace_user_groups` by `ws_id` and `id`.
/// Returns `Ok(None)` when the row does not exist, `Err(())` on errors.
async fn fetch_user_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Option<UserGroupRow>, ()> {
    let Some(url) = contact_data.rest_url(
        USER_GROUPS_TABLE,
        &[
            ("select", "id,name,starting_date,ending_date".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{group_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization_header = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization_header)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let mut rows = response.json::<Vec<UserGroupRow>>().map_err(|_| ())?;
    Ok(rows.pop())
}

/// Fetch scheduled session `starts_at` timestamps for `group_id` from the
/// private schema, ordered ascending by `starts_at`.
async fn fetch_raw_session_starts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        SESSIONS_TABLE,
        &[
            ("select", "starts_at".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("group_id", format!("eq.{group_id}")),
            ("status", "eq.scheduled".to_owned()),
            ("order", "starts_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization_header = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization_header)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<SessionStartRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.starts_at)
        .collect())
}

/// Convert raw `starts_at` timestamps to unique `YYYY-MM-DD` date strings in
/// the Asia/Ho_Chi_Minh timezone (UTC+07:00), preserving order and dropping
/// duplicates — mirroring the legacy `listUserGroupSessionDates`.
async fn fetch_session_dates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Vec<String>, ()> {
    let raw = fetch_raw_session_starts(contact_data, outbound, ws_id, group_id).await?;

    let mut dates: Vec<String> = Vec::new();
    for starts_at in &raw {
        if let Some(epoch) = parse_rfc3339_epoch_seconds(starts_at) {
            let date = epoch_to_local_date(epoch, HO_CHI_MINH_OFFSET_SECS);
            if !dates.contains(&date) {
                dates.push(date);
            }
        }
    }

    Ok(dates)
}

/// Convert a UTC epoch-second to a `YYYY-MM-DD` string in the given UTC offset.
fn epoch_to_local_date(epoch_seconds: i64, offset_seconds: i64) -> String {
    let local = epoch_seconds + offset_seconds;
    let day_index = local.div_euclid(SECONDS_PER_DAY);
    let (year, month, day) = civil_from_days(day_index);
    format!("{year:04}-{month:02}-{day:02}")
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
/// `±HH:MM` / `±HHMM` offsets and optional fractional seconds (truncated).
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

    let offset_seconds: i64 = if rest.is_empty() || rest == "Z" || rest == "z" {
        0
    } else {
        let sign: i64 = match rest.as_bytes().first() {
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
    Some(days * SECONDS_PER_DAY + hour * 3600 + minute * 60 + second - offset_seconds)
}

/// Converts a civil `(year, month, day)` to days-since-epoch. Inverse of
/// `civil_from_days` (Howard Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// Extract `(ws_id, group_id)` from a path of the form
/// `/api/v1/workspaces/:wsId/user-groups/:groupId`. Both segments must be
/// non-empty and must not contain further `/` components.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    let group_id = after_ws;
    if group_id.is_empty() || group_id.contains('/') {
        return None;
    }

    Some((ws_id, group_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS_ID: &str = "aaaaaaaa-0000-0000-0000-000000000001";
    const GROUP_ID: &str = "bbbbbbbb-0000-0000-0000-000000000002";

    // ----- parse_path -----

    #[test]
    fn parse_path_valid() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}");
        assert_eq!(parse_path(&path), Some((WS_ID, GROUP_ID)));
    }

    #[test]
    fn parse_path_accepts_personal_slug() {
        let path = format!("/api/v1/workspaces/personal/user-groups/{GROUP_ID}");
        assert_eq!(parse_path(&path), Some(("personal", GROUP_ID)));
    }

    #[test]
    fn parse_path_rejects_empty_ws_id() {
        let path = format!("/api/v1/workspaces//user-groups/{GROUP_ID}");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_empty_group_id() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_trailing_segment() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/extra");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_wrong_prefix() {
        let path = format!("/api/workspaces/{WS_ID}/user-groups/{GROUP_ID}");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_list_route() {
        // The list route `/user-groups` (no trailing slash or group id) must not
        // be matched here.
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups");
        assert!(parse_path(&path).is_none());
    }

    // ----- parse_rfc3339_epoch_seconds -----

    #[test]
    fn parse_rfc3339_z_suffix() {
        // 1970-01-01T00:00:00Z -> epoch 0
        assert_eq!(parse_rfc3339_epoch_seconds("1970-01-01T00:00:00Z"), Some(0));
    }

    #[test]
    fn parse_rfc3339_positive_offset() {
        // 1970-01-01T07:00:00+07:00 -> UTC 1970-01-01T00:00:00 -> epoch 0
        assert_eq!(
            parse_rfc3339_epoch_seconds("1970-01-01T07:00:00+07:00"),
            Some(0)
        );
    }

    #[test]
    fn parse_rfc3339_fractional_seconds() {
        // 1970-01-01T00:00:01.500Z -> epoch 1 (fractional part truncated)
        assert_eq!(
            parse_rfc3339_epoch_seconds("1970-01-01T00:00:01.500Z"),
            Some(1)
        );
    }

    #[test]
    fn parse_rfc3339_rejects_short_string() {
        assert!(parse_rfc3339_epoch_seconds("1970-01-01").is_none());
    }

    // ----- epoch_to_local_date -----

    #[test]
    fn epoch_zero_in_ho_chi_minh_is_jan_1() {
        // UTC 1970-01-01T00:00:00Z -> HCM 1970-01-01T07:00:00 -> date 1970-01-01
        assert_eq!(
            epoch_to_local_date(0, HO_CHI_MINH_OFFSET_SECS),
            "1970-01-01"
        );
    }

    #[test]
    fn late_utc_hour_rolls_to_next_day_in_hcm() {
        // UTC 1970-01-01T20:00:00Z -> HCM 1970-01-02T03:00:00 -> 1970-01-02
        let epoch = 20_i64 * 3600;
        assert_eq!(
            epoch_to_local_date(epoch, HO_CHI_MINH_OFFSET_SECS),
            "1970-01-02"
        );
    }

    #[test]
    fn two_timestamps_same_day_produce_equal_dates() {
        // Both fall within HCM 1970-01-01
        let d1 = epoch_to_local_date(0, HO_CHI_MINH_OFFSET_SECS);
        let d2 = epoch_to_local_date(3600, HO_CHI_MINH_OFFSET_SECS);
        assert_eq!(d1, d2);
        assert_eq!(d1, "1970-01-01");
    }

    // ----- response helpers -----

    #[test]
    fn message_response_shape() {
        let resp = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "message": FORBIDDEN_MESSAGE }));
    }

    #[test]
    fn error_response_shape() {
        let resp = error_response(404, NOT_FOUND_ERROR);
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body, json!({ "error": NOT_FOUND_ERROR }));
    }
}
