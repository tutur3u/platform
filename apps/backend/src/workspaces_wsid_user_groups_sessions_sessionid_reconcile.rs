//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/sessions/:sessionId/reconcile`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/sessions/[sessionId]/reconcile/route.ts`.
//!
//! The legacy route also exposes a `POST` handler; only `GET` is ported here.
//! Every non-GET method returns `None` so the worker falls through to the
//! still-live Next.js route.
//!
//! The legacy GET flow:
//!
//!   1. Normalize the workspace id and check the `update_user_groups` permission.
//!      - No workspace / missing session → `404 { "message": "Not found" }`
//!      - Missing permission → `403 { "message": "Insufficient permissions …" }`
//!   2. Call `previewDetachedUserGroupSessionReconciliation`:
//!      a. Fetch the session from the private schema by `ws_id` and `sessionId`.
//!      If absent or not `scheduled` → `404 "No matching recurring schedule found"`.
//!      b. Fetch all `workspace_user_group_session_series` for the session's group.
//!      c. Cascade through exact → snap → weekly matching. Multiple candidates in
//!      any tier → `409 "Multiple matching recurring schedules found"`.
//!      d. Check whether the target slot is already occupied by an aligned series
//!      instance → `409 "A recurring session already exists for this date"`.
//!      e. Build the reconciliation preview and return `200 { "data": …, "message": "success" }`.
//!
//! BEHAVIOR GAPS vs legacy:
//!
//!   - Timezone conversion is approximated via a fixed-offset table (correct for
//!     `Asia/Ho_Chi_Minh` / `Asia/Bangkok` outside DST transitions). Timezones not
//!     in the table fall back to UTC, which may mis-classify dates by up to one day.
//!     This runtime has no full IANA timezone database.
//!   - Tags and files in the `session` field are fetched via service-role REST
//!     queries against the private schema. If those secondary fetches fail, empty
//!     arrays are returned rather than surfacing a 500, providing graceful
//!     degradation for secondary data.

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
const PATH_INFIX: &str = "/user-groups/sessions/";
const PATH_SUFFIX: &str = "/reconcile";
const UPDATE_PERMISSION: &str = "update_user_groups";
const PRIVATE_SCHEMA: &str = "private";
const SESSIONS_TABLE: &str = "workspace_user_group_sessions";
const SERIES_TABLE: &str = "workspace_user_group_session_series";
const GROUPS_TABLE: &str = "workspace_user_groups";
const TAG_LINKS_TABLE: &str = "workspace_user_group_session_tag_links";
const TAGS_TABLE: &str = "workspace_user_group_session_tags";
const FILES_TABLE: &str = "workspace_user_group_session_files";
const SECONDS_PER_DAY: i64 = 86_400;

// ── DB row types ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SessionRow {
    id: String,
    group_id: String,
    starts_at: String,
    ends_at: String,
    start_timezone: String,
    end_timezone: String,
    status: String,
    series_id: Option<String>,
    recurrence_instance_date: Option<String>,
    source: Option<Value>,
    description: Option<Value>,
    description_json: Option<Value>,
    title: Option<Value>,
}

#[derive(Deserialize)]
struct SeriesRow {
    id: String,
    group_id: String,
    days_of_week: Vec<i64>,
    start_date: String,
    start_time: String,
    start_timezone: String,
    end_time: String,
    end_timezone: String,
    interval_weeks: i64,
    until_date: Option<String>,
    description: Option<Value>,
    description_json: Option<Value>,
    title: Option<Value>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct OccupyingRow {
    id: String,
    series_id: Option<String>,
    recurrence_instance_date: Option<String>,
    starts_at: String,
    ends_at: String,
    start_timezone: String,
    end_timezone: String,
}

#[derive(Deserialize)]
struct GroupRow {
    name: Option<String>,
}

#[derive(Deserialize)]
struct TagLinkRow {
    tag_id: String,
}

#[derive(Deserialize)]
struct TagRow {
    id: String,
    name: Option<String>,
    color: Option<String>,
}

#[derive(Deserialize)]
struct FileRow {
    id: String,
    name: Option<String>,
    storage_path: String,
}

// ── Match result ──────────────────────────────────────────────────────────────

struct MatchResult {
    series_idx: usize,
    date: String,
    mode: &'static str,
}

enum ReconcileErr {
    Ambiguous,
}

// ── Public handler ────────────────────────────────────────────────────────────

pub(crate) async fn handle_workspaces_wsid_user_groups_sessions_sessionid_reconcile_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, session_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => reconcile_get(config, request, raw_ws_id, session_id, outbound).await,
        _ => return None,
    })
}

// ── GET handler ───────────────────────────────────────────────────────────────

async fn reconcile_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    session_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        UPDATE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(a) => a,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return msg(404, "Not found"),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return msg(
                403,
                "Insufficient permissions to update user group sessions",
            );
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return msg(500, "Failed to preview user group session recurrence");
        }
    };

    let ws_id = &authorization.ws_id;

    let session = match fetch_session(contact_data, outbound, ws_id, session_id).await {
        Ok(Some(s)) if s.status == "scheduled" => s,
        Ok(_) => return msg(404, "No matching recurring schedule found"),
        Err(()) => return msg(500, "Failed to preview user group session recurrence"),
    };

    let series_rows =
        match fetch_series_for_group(contact_data, outbound, ws_id, &session.group_id).await {
            Ok(rows) => rows,
            Err(()) => return msg(500, "Failed to preview user group session recurrence"),
        };

    let mr = match find_match(&session, &series_rows) {
        Ok(Some(m)) => m,
        Ok(None) => return msg(404, "No matching recurring schedule found"),
        Err(ReconcileErr::Ambiguous) => {
            return msg(409, "Multiple matching recurring schedules found");
        }
    };

    let series = &series_rows[mr.series_idx];

    // Check if the slot is already occupied by an aligned instance
    match check_occupying(contact_data, outbound, ws_id, &session.id, series, &mr.date).await {
        Ok(false) => {}
        Ok(true) => {
            return msg(409, "A recurring session already exists for this date");
        }
        Err(()) => return msg(500, "Failed to preview user group session recurrence"),
    }

    // Fetch secondary data with graceful fallback
    let group_name = fetch_group_name(contact_data, outbound, ws_id, &session.group_id)
        .await
        .ok()
        .flatten();
    let (tags, files) = fetch_relations(contact_data, outbound, ws_id, &session.id).await;

    // Build occurrence timestamps
    let start_off = tz_offset_secs(&series.start_timezone);
    let end_off = tz_offset_secs(&series.end_timezone);
    let start_norm = normalize_time(&series.start_time);
    let end_norm = normalize_time(&series.end_time);
    let end_date = if end_norm <= start_norm {
        add_days(&mr.date, 1)
    } else {
        mr.date.clone()
    };
    let occ_starts_at = local_dt_to_iso(&mr.date, &start_norm, start_off).unwrap_or_default();
    let occ_ends_at = local_dt_to_iso(&end_date, &end_norm, end_off).unwrap_or_default();

    let occ_title: Value = match &group_name {
        Some(n) => json!(n),
        None => series.title.clone().unwrap_or(Value::Null),
    };

    let occurrence = json!({
        "date": mr.date,
        "description": series.description,
        "descriptionJson": series.description_json,
        "endTimezone": series.end_timezone,
        "endsAt": occ_ends_at,
        "groupId": series.group_id,
        "groupName": group_name,
        "seriesId": series.id,
        "startTimezone": series.start_timezone,
        "startsAt": occ_starts_at,
        "title": occ_title,
    });

    let session_json = json!({
        "description": session.description,
        "descriptionJson": session.description_json,
        "endTimezone": session.end_timezone,
        "endsAt": session.ends_at,
        "files": files,
        "groupId": session.group_id,
        "groupName": group_name,
        "id": session.id,
        "recurrenceInstanceDate": session.recurrence_instance_date,
        "seriesId": session.series_id,
        "source": session.source,
        "startTimezone": session.start_timezone,
        "startsAt": session.starts_at,
        "status": session.status,
        "tags": tags,
        "title": session.title,
    });

    let data = json!({
        "date": mr.date,
        "mode": mr.mode,
        "occurrence": occurrence,
        "seriesId": series.id,
        "session": session_json,
    });

    no_store_response(json_response(
        200,
        json!({ "data": data, "message": "success" }),
    ))
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async fn private_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let url = contact_data.rest_url(table, params).ok_or(())?;
    let key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");

    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

async fn public_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let url = contact_data.rest_url(table, params).ok_or(())?;
    let key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");

    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

async fn fetch_session(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_id: &str,
) -> Result<Option<SessionRow>, ()> {
    let rows = private_get(
        contact_data,
        outbound,
        SESSIONS_TABLE,
        &[
            ("select", "id,group_id,starts_at,ends_at,start_timezone,end_timezone,status,series_id,recurrence_instance_date,source,description,description_json,title".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{session_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;

    Ok(rows
        .into_iter()
        .next()
        .and_then(|v| serde_json::from_value::<SessionRow>(v).ok()))
}

async fn fetch_series_for_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Vec<SeriesRow>, ()> {
    let rows = private_get(
        contact_data,
        outbound,
        SERIES_TABLE,
        &[
            ("select", "id,group_id,days_of_week,start_date,start_time,start_timezone,end_time,end_timezone,interval_weeks,until_date,description,description_json,title".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("group_id", format!("eq.{group_id}")),
        ],
    )
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|v| serde_json::from_value::<SeriesRow>(v).ok())
        .collect())
}

async fn fetch_occupying_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    series_id: &str,
    date: &str,
) -> Result<Option<OccupyingRow>, ()> {
    let rows = private_get(
        contact_data,
        outbound,
        SESSIONS_TABLE,
        &[
            ("select", "id,series_id,recurrence_instance_date,starts_at,ends_at,start_timezone,end_timezone".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("series_id", format!("eq.{series_id}")),
            ("recurrence_instance_date", format!("eq.{date}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;

    Ok(rows
        .into_iter()
        .next()
        .and_then(|v| serde_json::from_value::<OccupyingRow>(v).ok()))
}

async fn check_occupying(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_id: &str,
    series: &SeriesRow,
    date: &str,
) -> Result<bool, ()> {
    let occupying = fetch_occupying_row(contact_data, outbound, ws_id, &series.id, date).await?;
    let Some(occ) = occupying else {
        return Ok(false);
    };
    if occ.id == session_id {
        return Ok(false);
    }
    // isAlignedSeriesInstance: same series_id, has recurrence_instance_date, local slot matches
    let aligned = occ.series_id.as_deref() == Some(series.id.as_str())
        && occ.recurrence_instance_date.is_some()
        && local_slot_key_for_occupying(&occ, series)
            == local_slot_key_for_series_date(series, date);
    Ok(aligned)
}

async fn fetch_group_name(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Option<String>, ()> {
    let rows = public_get(
        contact_data,
        outbound,
        GROUPS_TABLE,
        &[
            ("select", "name".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{group_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;

    Ok(rows
        .into_iter()
        .next()
        .and_then(|v| serde_json::from_value::<GroupRow>(v).ok())
        .and_then(|g| g.name))
}

async fn fetch_relations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_id: &str,
) -> (Vec<Value>, Vec<Value>) {
    let tags = fetch_tags(contact_data, outbound, ws_id, session_id)
        .await
        .unwrap_or_default();
    let files = fetch_files(contact_data, outbound, ws_id, session_id)
        .await
        .unwrap_or_default();
    (tags, files)
}

async fn fetch_tags(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_id: &str,
) -> Result<Vec<Value>, ()> {
    let link_rows = private_get(
        contact_data,
        outbound,
        TAG_LINKS_TABLE,
        &[
            ("select", "tag_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("session_id", format!("eq.{session_id}")),
        ],
    )
    .await?;

    let tag_ids: Vec<String> = link_rows
        .into_iter()
        .filter_map(|v| serde_json::from_value::<TagLinkRow>(v).ok())
        .map(|l| l.tag_id)
        .collect();

    if tag_ids.is_empty() {
        return Ok(vec![]);
    }

    let id_filter = format!("in.({})", tag_ids.join(","));
    let tag_rows = private_get(
        contact_data,
        outbound,
        TAGS_TABLE,
        &[
            ("select", "id,name,color".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", id_filter),
        ],
    )
    .await?;

    Ok(tag_rows
        .into_iter()
        .filter_map(|v| serde_json::from_value::<TagRow>(v).ok())
        .map(|t| json!({ "color": t.color, "id": t.id, "name": t.name }))
        .collect())
}

async fn fetch_files(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_id: &str,
) -> Result<Vec<Value>, ()> {
    let rows = private_get(
        contact_data,
        outbound,
        FILES_TABLE,
        &[
            ("select", "id,name,storage_path".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("session_id", format!("eq.{session_id}")),
        ],
    )
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|v| serde_json::from_value::<FileRow>(v).ok())
        .map(|f| json!({ "id": f.id, "name": f.name, "storagePath": f.storage_path }))
        .collect())
}

// ── Matching algorithm ────────────────────────────────────────────────────────

fn find_match(
    session: &SessionRow,
    series_rows: &[SeriesRow],
) -> Result<Option<MatchResult>, ReconcileErr> {
    // --- Exact tier ---
    let exact: Vec<MatchResult> = series_rows
        .iter()
        .enumerate()
        .filter_map(|(i, s)| {
            let date = timestamp_to_local_date(&session.starts_at, &s.start_timezone)?;
            if !is_expected_series_date(s, &date) {
                return None;
            }
            let occ_starts = build_series_timestamp(&date, &s.start_time, &s.start_timezone)?;
            let end_date = if normalize_time(&s.end_time) <= normalize_time(&s.start_time) {
                add_days(&date, 1)
            } else {
                date.clone()
            };
            let occ_ends = build_series_timestamp(&end_date, &s.end_time, &s.end_timezone)?;
            if !is_candidate_for_occurrence(session, s, &date, &occ_starts, &occ_ends) {
                return None;
            }
            Some(MatchResult {
                series_idx: i,
                date,
                mode: "exact",
            })
        })
        .collect();

    if exact.len() > 1 {
        return Err(ReconcileErr::Ambiguous);
    }
    if exact.len() == 1 {
        return Ok(exact.into_iter().next());
    }

    // --- Snap tier ---
    let snap: Vec<MatchResult> = series_rows
        .iter()
        .enumerate()
        .filter_map(|(i, s)| {
            let date = timestamp_to_local_date(&session.starts_at, &s.start_timezone)?;
            if !is_expected_series_date(s, &date) {
                return None;
            }
            if !is_snap_candidate(session, s, &date) {
                return None;
            }
            Some(MatchResult {
                series_idx: i,
                date,
                mode: "snap",
            })
        })
        .collect();

    if snap.len() > 1 {
        return Err(ReconcileErr::Ambiguous);
    }
    if snap.len() == 1 {
        return Ok(snap.into_iter().next());
    }

    // --- Weekly tier ---
    let weekly: Vec<MatchResult> = series_rows
        .iter()
        .enumerate()
        .filter_map(|(i, s)| {
            let date = timestamp_to_local_date(&session.starts_at, &s.start_timezone)?;
            if !is_weekly_candidate(session, s, &date) {
                return None;
            }
            Some(MatchResult {
                series_idx: i,
                date,
                mode: "weekly",
            })
        })
        .collect();

    if weekly.len() > 1 {
        return Err(ReconcileErr::Ambiguous);
    }
    Ok(weekly.into_iter().next())
}

// ── Pure predicate helpers ────────────────────────────────────────────────────

fn is_series_date_in_active_interval(series: &SeriesRow, date: &str) -> bool {
    if date < series.start_date.as_str() {
        return false;
    }
    if let Some(until) = &series.until_date
        && date > until.as_str()
    {
        return false;
    }
    let days = days_between_dates(&series.start_date, date);
    if days < 0 {
        return false;
    }
    let weeks = days / 7;
    weeks % series.interval_weeks.max(1) == 0
}

fn is_expected_series_date(series: &SeriesRow, date: &str) -> bool {
    if !is_series_date_in_active_interval(series, date) {
        return false;
    }
    let wd = weekday_of_date(date);
    series.days_of_week.contains(&wd)
}

fn is_candidate_for_occurrence(
    session: &SessionRow,
    series: &SeriesRow,
    date: &str,
    occ_starts_at: &str,
    occ_ends_at: &str,
) -> bool {
    if session.group_id != series.group_id {
        return false;
    }
    if session.start_timezone != series.start_timezone {
        return false;
    }
    if session.end_timezone != series.end_timezone {
        return false;
    }
    if let Some(sid) = &session.series_id
        && sid != &series.id
    {
        return false;
    }
    if session.series_id.as_deref() == Some(series.id.as_str())
        && session.recurrence_instance_date.as_deref() == Some(date)
    {
        return false;
    }
    // exact slot: start+end timestamps match
    let exact_slot = session.starts_at == occ_starts_at && session.ends_at == occ_ends_at;
    exact_slot
        || local_slot_key_for_session(session, series)
            == local_slot_key_for_series_date(series, date)
}

fn is_snap_candidate(session: &SessionRow, series: &SeriesRow, date: &str) -> bool {
    if session.group_id != series.group_id {
        return false;
    }
    if session.start_timezone != series.start_timezone {
        return false;
    }
    if session.end_timezone != series.end_timezone {
        return false;
    }
    if let Some(sid) = &session.series_id
        && sid != &series.id
    {
        return false;
    }
    if session.series_id.as_deref() == Some(series.id.as_str())
        && session.recurrence_instance_date.as_deref() == Some(date)
    {
        return false;
    }
    timestamp_to_local_date(&session.starts_at, &series.start_timezone).as_deref() == Some(date)
}

fn is_weekly_candidate(session: &SessionRow, series: &SeriesRow, date: &str) -> bool {
    if !is_series_date_in_active_interval(series, date) {
        return false;
    }
    // date's weekday must NOT already be in the series (that would be exact match)
    let wd = weekday_of_date(date);
    if series.days_of_week.contains(&wd) {
        return false;
    }
    if session.group_id != series.group_id {
        return false;
    }
    if session.start_timezone != series.start_timezone {
        return false;
    }
    if session.end_timezone != series.end_timezone {
        return false;
    }
    if let Some(sid) = &session.series_id
        && sid != &series.id
    {
        return false;
    }
    if session.series_id.as_deref() == Some(series.id.as_str())
        && session.recurrence_instance_date.as_deref() == Some(date)
    {
        return false;
    }
    local_slot_key_for_session(session, series) == local_slot_key_for_series_date(series, date)
}

// ── Slot-key helpers ──────────────────────────────────────────────────────────

fn local_slot_key_for_series_date(series: &SeriesRow, date: &str) -> String {
    let start_norm = normalize_time(&series.start_time);
    let end_norm = normalize_time(&series.end_time);
    let end_date = if end_norm <= start_norm {
        add_days(date, 1)
    } else {
        date.to_owned()
    };
    format!(
        "{}:{}:{} {}:{}:{} {}",
        series.group_id,
        series.start_timezone,
        date,
        start_norm,
        series.end_timezone,
        end_date,
        end_norm
    )
}

fn local_slot_key_for_session(session: &SessionRow, series: &SeriesRow) -> String {
    let start_off = tz_offset_secs(&series.start_timezone);
    let end_off = tz_offset_secs(&series.end_timezone);
    let (start_date, start_time) = epoch_to_local_date_time(
        parse_rfc3339_epoch_seconds(&session.starts_at).unwrap_or(0),
        start_off,
    );
    let (end_date, end_time) = epoch_to_local_date_time(
        parse_rfc3339_epoch_seconds(&session.ends_at).unwrap_or(0),
        end_off,
    );
    format!(
        "{}:{}:{} {}:{}:{} {}",
        session.group_id,
        series.start_timezone,
        start_date,
        start_time,
        series.end_timezone,
        end_date,
        end_time
    )
}

fn local_slot_key_for_occupying(row: &OccupyingRow, series: &SeriesRow) -> String {
    let start_off = tz_offset_secs(&series.start_timezone);
    let end_off = tz_offset_secs(&series.end_timezone);
    let (start_date, start_time) = epoch_to_local_date_time(
        parse_rfc3339_epoch_seconds(&row.starts_at).unwrap_or(0),
        start_off,
    );
    let (end_date, end_time) = epoch_to_local_date_time(
        parse_rfc3339_epoch_seconds(&row.ends_at).unwrap_or(0),
        end_off,
    );
    format!(
        "{}:{}:{} {}:{}:{} {}",
        series.group_id,
        series.start_timezone,
        start_date,
        start_time,
        series.end_timezone,
        end_date,
        end_time
    )
}

// ── Date / time utilities ─────────────────────────────────────────────────────

fn tz_offset_secs(tz: &str) -> i64 {
    match tz {
        "Asia/Ho_Chi_Minh" | "Asia/Bangkok" | "Asia/Jakarta" | "Indochina Time" => 7 * 3600,
        "Asia/Singapore" | "Asia/Kuala_Lumpur" | "Asia/Taipei" | "Asia/Makassar" => 8 * 3600,
        "Asia/Tokyo" | "Asia/Seoul" | "Japan" | "Korea" => 9 * 3600,
        "Asia/Kolkata" | "Asia/Calcutta" => 5 * 3600 + 1800,
        "Asia/Shanghai" | "Asia/Hong_Kong" | "Asia/Chongqing" => 8 * 3600,
        "Europe/Paris" | "Europe/Berlin" | "Europe/Amsterdam" => 3600,
        "Europe/London" | "UTC" | "Etc/UTC" => 0,
        "America/New_York" | "US/Eastern" => -5 * 3600,
        "America/Chicago" | "US/Central" => -6 * 3600,
        "America/Los_Angeles" | "US/Pacific" => -8 * 3600,
        _ => 0,
    }
}

fn normalize_time(t: &str) -> String {
    if t.len() == 5 {
        format!("{t}:00")
    } else {
        t.to_owned()
    }
}

fn timestamp_to_local_date(ts: &str, tz: &str) -> Option<String> {
    let epoch = parse_rfc3339_epoch_seconds(ts)?;
    Some(epoch_to_local_date(epoch, tz_offset_secs(tz)))
}

fn epoch_to_local_date(epoch: i64, offset: i64) -> String {
    let local = epoch + offset;
    let day_index = local.div_euclid(SECONDS_PER_DAY);
    let (y, m, d) = civil_from_days(day_index);
    format!("{y:04}-{m:02}-{d:02}")
}

fn epoch_to_local_date_time(epoch: i64, offset: i64) -> (String, String) {
    let local = epoch + offset;
    let day_index = local.div_euclid(SECONDS_PER_DAY);
    let secs_in_day = local.rem_euclid(SECONDS_PER_DAY);
    let (y, m, d) = civil_from_days(day_index);
    let h = secs_in_day / 3600;
    let mi = (secs_in_day % 3600) / 60;
    let s = secs_in_day % 60;
    (
        format!("{y:04}-{m:02}-{d:02}"),
        format!("{h:02}:{mi:02}:{s:02}"),
    )
}

/// Convert a local `YYYY-MM-DD` date + `HH:mm` or `HH:mm:ss` time string in a
/// timezone (identified by fixed offset) to a UTC ISO-8601 string (`…Z`).
fn local_dt_to_iso(date: &str, time: &str, offset_secs: i64) -> Option<String> {
    let y: i64 = date.get(0..4)?.parse().ok()?;
    let mo: i64 = date.get(5..7)?.parse().ok()?;
    let d: i64 = date.get(8..10)?.parse().ok()?;
    let t = normalize_time(time);
    let h: i64 = t.get(0..2)?.parse().ok()?;
    let mi: i64 = t.get(3..5)?.parse().ok()?;
    let s: i64 = t.get(6..8)?.parse().ok()?;
    let days = days_from_civil(y, mo, d);
    let local_epoch = days * SECONDS_PER_DAY + h * 3600 + mi * 60 + s;
    let utc = local_epoch - offset_secs;
    let day_idx = utc.div_euclid(SECONDS_PER_DAY);
    let secs_in = utc.rem_euclid(SECONDS_PER_DAY);
    let (uy, um, ud) = civil_from_days(day_idx);
    let uh = secs_in / 3600;
    let umi = (secs_in % 3600) / 60;
    let us = secs_in % 60;
    Some(format!("{uy:04}-{um:02}-{ud:02}T{uh:02}:{umi:02}:{us:02}Z"))
}

fn build_series_timestamp(date: &str, time: &str, tz: &str) -> Option<String> {
    local_dt_to_iso(date, time, tz_offset_secs(tz))
}

fn add_days(date: &str, days: i64) -> String {
    let y: i64 = date.get(0..4).and_then(|s| s.parse().ok()).unwrap_or(1970);
    let m: i64 = date.get(5..7).and_then(|s| s.parse().ok()).unwrap_or(1);
    let d: i64 = date.get(8..10).and_then(|s| s.parse().ok()).unwrap_or(1);
    let new_days = days_from_civil(y, m, d) + days;
    let (ny, nm, nd) = civil_from_days(new_days);
    format!("{ny:04}-{nm:02}-{nd:02}")
}

fn days_between_dates(from: &str, to: &str) -> i64 {
    let parse = |s: &str| -> i64 {
        let y: i64 = s.get(0..4).and_then(|x| x.parse().ok()).unwrap_or(0);
        let m: i64 = s.get(5..7).and_then(|x| x.parse().ok()).unwrap_or(1);
        let d: i64 = s.get(8..10).and_then(|x| x.parse().ok()).unwrap_or(1);
        days_from_civil(y, m, d)
    };
    parse(to) - parse(from)
}

fn weekday_of_date(date: &str) -> i64 {
    let y: i64 = date.get(0..4).and_then(|s| s.parse().ok()).unwrap_or(1970);
    let m: i64 = date.get(5..7).and_then(|s| s.parse().ok()).unwrap_or(1);
    let d: i64 = date.get(8..10).and_then(|s| s.parse().ok()).unwrap_or(1);
    // days_from_civil(1970, 1, 1) = 0, which was a Thursday (4). Adjust mod 7.
    (days_from_civil(y, m, d) + 4).rem_euclid(7)
}

// ── Calendar arithmetic (Howard Hinnant) ─────────────────────────────────────

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

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn parse_rfc3339_epoch_seconds(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.len() < 19 {
        return None;
    }
    let bytes = value.as_bytes();
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
        let end = rest[1..]
            .find(|c: char| !c.is_ascii_digit())
            .map(|i| i + 1)
            .unwrap_or(rest.len());
        rest = &rest[end..];
    }
    let offset_seconds: i64 = if rest.is_empty() || rest.eq_ignore_ascii_case("z") {
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
    Some(
        days_from_civil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + minute * 60 + second
            - offset_seconds,
    )
}

// ── Path / response helpers ───────────────────────────────────────────────────

fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_INFIX)?;
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    let session_id = after_ws.strip_suffix(PATH_SUFFIX)?;
    if session_id.is_empty() || session_id.contains('/') {
        return None;
    }
    Some((ws_id, session_id))
}

fn msg(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "aaaaaaaa-0000-0000-0000-000000000001";
    const SID: &str = "bbbbbbbb-0000-0000-0000-000000000002";

    #[test]
    fn parse_path_valid() {
        let p = format!("/api/v1/workspaces/{WS}/user-groups/sessions/{SID}/reconcile");
        assert_eq!(parse_path(&p), Some((WS, SID)));
    }

    #[test]
    fn parse_path_personal() {
        let p = format!("/api/v1/workspaces/personal/user-groups/sessions/{SID}/reconcile");
        assert_eq!(parse_path(&p), Some(("personal", SID)));
    }

    #[test]
    fn parse_path_rejects_empty_ws() {
        let p = format!("/api/v1/workspaces//user-groups/sessions/{SID}/reconcile");
        assert!(parse_path(&p).is_none());
    }

    #[test]
    fn parse_path_rejects_empty_session() {
        let p = format!("/api/v1/workspaces/{WS}/user-groups/sessions//reconcile");
        assert!(parse_path(&p).is_none());
    }

    #[test]
    fn parse_path_rejects_missing_suffix() {
        let p = format!("/api/v1/workspaces/{WS}/user-groups/sessions/{SID}");
        assert!(parse_path(&p).is_none());
    }

    #[test]
    fn parse_path_rejects_extra_segment() {
        let p = format!("/api/v1/workspaces/{WS}/user-groups/sessions/{SID}/reconcile/extra");
        assert!(parse_path(&p).is_none());
    }

    #[test]
    fn weekday_epoch_zero_is_thursday() {
        // 1970-01-01 was a Thursday (4)
        assert_eq!(weekday_of_date("1970-01-01"), 4);
    }

    #[test]
    fn weekday_known_sunday() {
        // 2024-01-07 was a Sunday (0)
        assert_eq!(weekday_of_date("2024-01-07"), 0);
    }

    #[test]
    fn days_between_same_date_is_zero() {
        assert_eq!(days_between_dates("2024-03-15", "2024-03-15"), 0);
    }

    #[test]
    fn days_between_one_week() {
        assert_eq!(days_between_dates("2024-03-01", "2024-03-08"), 7);
    }

    #[test]
    fn add_days_crosses_month() {
        assert_eq!(add_days("2024-01-30", 3), "2024-02-02");
    }

    #[test]
    fn epoch_to_local_date_utc_zero() {
        assert_eq!(epoch_to_local_date(0, 0), "1970-01-01");
    }

    #[test]
    fn epoch_to_local_date_hcm_offset() {
        // epoch 0 in UTC+7 = 1970-01-01T07:00:00 -> date 1970-01-01
        assert_eq!(epoch_to_local_date(0, 7 * 3600), "1970-01-01");
        // 20h UTC -> 03h next day in UTC+7
        assert_eq!(epoch_to_local_date(20 * 3600, 7 * 3600), "1970-01-02");
    }

    #[test]
    fn normalize_time_pads_seconds() {
        assert_eq!(normalize_time("08:30"), "08:30:00");
        assert_eq!(normalize_time("08:30:00"), "08:30:00");
    }

    #[test]
    fn local_dt_to_iso_utc() {
        // 1970-01-01 07:00:00 UTC+0 -> 1970-01-01T07:00:00Z
        assert_eq!(
            local_dt_to_iso("1970-01-01", "07:00:00", 0),
            Some("1970-01-01T07:00:00Z".to_owned())
        );
    }

    #[test]
    fn local_dt_to_iso_hcm() {
        // 1970-01-01 07:00:00 UTC+7 -> 1970-01-01T00:00:00Z
        assert_eq!(
            local_dt_to_iso("1970-01-01", "07:00:00", 7 * 3600),
            Some("1970-01-01T00:00:00Z".to_owned())
        );
    }

    #[test]
    fn parse_rfc3339_epoch_z() {
        assert_eq!(parse_rfc3339_epoch_seconds("1970-01-01T00:00:00Z"), Some(0));
    }

    #[test]
    fn parse_rfc3339_positive_offset() {
        assert_eq!(
            parse_rfc3339_epoch_seconds("1970-01-01T07:00:00+07:00"),
            Some(0)
        );
    }

    #[test]
    fn msg_response_shape() {
        let r = msg(403, "bad");
        assert_eq!(r.status, 403);
        assert_eq!(r.body, json!({ "message": "bad" }));
    }
}
