//! Handler for `GET /api/v1/workspaces/:wsId/task-progress/stats`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-progress/stats/route.ts`
//! (and its shared `_utils.ts`/`_schemas.ts` helpers).
//!
//! Auth model (legacy `resolveTaskProgressRouteAuth`): authenticate the Supabase
//! session user, normalize the workspace id (`personal` slug / handle / UUID),
//! then require **workspace membership of type `MEMBER`** — there is no specific
//! workspace permission gate. This port reproduces that membership-only check
//! directly (token -> user -> `workspace_members` lookup) rather than using
//! `authorize_workspace_permission`, which would over-restrict legitimate members
//! that lack a particular permission.
//!
//! Legacy status codes preserved:
//!   * no authenticated user                    -> `401 { "error": "Unauthorized" }`
//!   * member lookup transport/query failure     -> `500 { "error": "Failed to verify workspace membership" }`
//!   * not a `MEMBER` of the workspace           -> `403 { "error": "Workspace access denied" }`
//!   * task-progress schema missing              -> `200 { ok:false, schemaAvailable:false, ... }`
//!   * any other read failure                    -> `500 { "error": "Failed to load task progress stats" }`
//!   * success                                   -> `200 { ok:true, schemaAvailable:true, ... }`
//!
//! BEHAVIOR GAPS (documented, common authenticated path otherwise faithful):
//!   * The legacy GET calls `ensureDefaultTaskProgressMetrics`, which INSERTS four
//!     default metric rows when a workspace has none. This GET-only port does not
//!     perform that write side-effect. For workspaces that already have metrics
//!     (the common case) behavior is identical; for a brand-new workspace this
//!     port returns an empty `metrics` list and `selectedMetricId: null` instead
//!     of auto-creating defaults.
//!   * The entries query selects only the columns the stats computation needs
//!     (omitting the unused `metric:task_progress_metrics(*)` embed and unused
//!     scalar columns). The JSON response is byte-for-byte unaffected.

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap};

use serde::Deserialize;
use serde_json::{Number, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-progress/stats";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task progress is not available until the latest database migration is applied.";
const STATS_FAILURE_MESSAGE: &str = "Failed to load task progress stats";

const METRIC_SELECT: &str = "id,ws_id,name,unit_label,unit_kind,description,aggregation,is_default,created_by,created_at,updated_at,archived_at";
const ENTRY_SELECT: &str = "id,entry_date,created_at,created_by,metric_id,task_id,project_id,board_id,list_id,mode,value,tags";

#[derive(Clone, Copy)]
enum MembershipError {
    Unauthorized,
    LookupFailed,
    AccessDenied,
}

#[derive(Deserialize)]
struct IdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct EntryRow {
    id: Option<String>,
    entry_date: Option<String>,
    created_at: Option<String>,
    created_by: Option<String>,
    metric_id: Option<String>,
    task_id: Option<String>,
    project_id: Option<String>,
    board_id: Option<String>,
    list_id: Option<String>,
    mode: Option<String>,
    #[serde(default)]
    value: Value,
    #[serde(default)]
    tags: Value,
}

pub(crate) async fn handle_workspaces_wsid_task_progress_stats_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = stats_ws_id(request.path)?;

    Some(match request.method {
        "GET" => stats_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn stats_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn stats_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Failed to verify workspace membership");
    }

    let ws_id = match authorize_membership(contact_data, request, raw_ws_id, outbound).await {
        Ok(ws_id) => ws_id,
        Err(MembershipError::Unauthorized) => return error_response(401, "Unauthorized"),
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace membership");
        }
        Err(MembershipError::AccessDenied) => {
            return error_response(403, "Workspace access denied");
        }
    };

    // Fetch metrics (service role; legacy uses the admin client).
    let metrics =
        match fetch_rows::<Value>(contact_data, outbound, &metrics_url(contact_data, &ws_id)).await
        {
            Ok(rows) => rows,
            Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
            Err(_) => return error_response(500, STATS_FAILURE_MESSAGE),
        };

    let metric_id_param = query_param(request.url, "metric_id");
    let first_metric_id = metrics
        .first()
        .and_then(|metric| metric.get("id"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let selected_metric_id = metric_id_param.or(first_metric_id);

    let entries = match fetch_rows::<EntryRow>(
        contact_data,
        outbound,
        &entries_url(
            contact_data,
            &ws_id,
            request.url,
            selected_metric_id.as_deref(),
        ),
    )
    .await
    {
        Ok(rows) => rows,
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(_) => return error_response(500, STATS_FAILURE_MESSAGE),
    };

    no_store_response(json_response(
        200,
        build_stats(&entries, metrics, selected_metric_id),
    ))
}

// ---------------------------------------------------------------------------
// Membership authorization
// ---------------------------------------------------------------------------

async fn authorize_membership(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, MembershipError> {
    let access_token =
        supabase_auth::request_access_token(request).ok_or(MembershipError::Unauthorized)?;
    let user = supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .ok_or(MembershipError::Unauthorized)?;
    let user_id = user
        .id
        .filter(|id| !id.trim().is_empty())
        .ok_or(MembershipError::Unauthorized)?;

    let ws_id = normalize_ws_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;

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
        .ok_or(MembershipError::LookupFailed)?;
    let response = caller_get(contact_data, outbound, &url, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::AccessDenied)?;

    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok(ws_id)
    } else {
        Err(MembershipError::AccessDenied)
    }
}

async fn normalize_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_lookup_identifier(&handle) {
            return Ok(resolved);
        }
        if let Some(id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(id);
        }
        if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
            return Ok(id);
        }
    }

    Ok(resolved)
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<IdRow>>()
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
    access_token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = match access_token {
        Some(token) => caller_get(contact_data, outbound, &url, token).await?,
        None => service_get(contact_data, outbound, &url).await?,
    };
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

enum FetchError {
    SchemaUnavailable,
    Other,
}

fn metrics_url(contact_data: &contact::ContactDataConfig, ws_id: &str) -> String {
    contact_data
        .rest_url(
            "task_progress_metrics",
            &[
                ("select", METRIC_SELECT.to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("archived_at", "is.null".to_owned()),
                ("order", "is_default.desc,created_at.asc".to_owned()),
            ],
        )
        .unwrap_or_default()
}

fn entries_url(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    request_url: Option<&str>,
    selected_metric_id: Option<&str>,
) -> String {
    let mut params: Vec<(&str, String)> = vec![
        ("select", ENTRY_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("deleted_at", "is.null".to_owned()),
    ];
    if let Some(metric_id) = selected_metric_id {
        params.push(("metric_id", format!("eq.{metric_id}")));
    }
    for key in ["task_id", "project_id", "board_id", "list_id", "created_by"] {
        if let Some(value) = query_param(request_url, key) {
            params.push((key, format!("eq.{value}")));
        }
    }
    if let Some(from) = query_param(request_url, "from") {
        params.push(("entry_date", format!("gte.{from}")));
    }
    if let Some(to) = query_param(request_url, "to") {
        params.push(("entry_date", format!("lte.{to}")));
    }
    params.push(("order", "entry_date.desc,created_at.desc".to_owned()));
    params.push(("limit", "5000".to_owned()));

    contact_data
        .rest_url("task_progress_entries", &params)
        .unwrap_or_default()
}

async fn fetch_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<Vec<T>, FetchError> {
    if url.is_empty() {
        return Err(FetchError::Other);
    }
    let response = service_get(contact_data, outbound, url)
        .await
        .map_err(|_| FetchError::Other)?;
    if !is_success(response.status) {
        let body = response.json::<Value>().unwrap_or(Value::Null);
        return Err(if is_schema_unavailable(&body) {
            FetchError::SchemaUnavailable
        } else {
            FetchError::Other
        });
    }
    response.json::<Vec<T>>().map_err(|_| FetchError::Other)
}

async fn service_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, service_role_key, service_role_key).await
}

async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, access_token, service_role_key).await
}

async fn send_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    bearer_token: &str,
    apikey: &str,
) -> Result<OutboundResponse, ()> {
    let authorization = format!("Bearer {bearer_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", apikey),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

fn build_stats(
    entries: &[EntryRow],
    metrics: Vec<Value>,
    selected_metric_id: Option<String>,
) -> Value {
    let effective = effective_values(entries);

    let mut by_date: BTreeMap<String, f64> = BTreeMap::new();
    let mut by_tag: HashMap<String, f64> = HashMap::new();
    let mut tag_order: Vec<String> = Vec::new();
    let mut total = 0.0_f64;

    for (index, entry) in entries.iter().enumerate() {
        let Some(date) = entry
            .entry_date
            .as_deref()
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let value = effective[index];
        total += value;
        *by_date.entry(date.to_owned()).or_insert(0.0) += value;

        if let Value::Array(tags) = &entry.tags {
            for tag in tags {
                if let Some(tag) = tag.as_str() {
                    if !by_tag.contains_key(tag) {
                        tag_order.push(tag.to_owned());
                    }
                    *by_tag.entry(tag.to_owned()).or_insert(0.0) += value;
                }
            }
        }
    }

    let daily: Vec<Value> = by_date
        .iter()
        .map(|(date, value)| json!({ "date": date, "value": number_value(*value) }))
        .collect();
    let active_days = by_date.values().filter(|value| **value > 0.0).count();

    let mut tags: Vec<(String, f64)> = tag_order
        .iter()
        .map(|tag| (tag.clone(), by_tag.get(tag).copied().unwrap_or(0.0)))
        .collect();
    tags.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
    let tags: Vec<Value> = tags
        .into_iter()
        .map(|(tag, value)| json!({ "tag": tag, "value": number_value(value) }))
        .collect();

    json!({
        "ok": true,
        "schemaAvailable": true,
        "selectedMetricId": selected_metric_id,
        "metrics": metrics,
        "summary": {
            "total": number_value(total),
            "entriesCount": entries.len(),
            "activeDays": active_days,
            "currentStreak": current_streak(&by_date),
            "longestStreak": longest_streak(&by_date),
        },
        "daily": daily.clone(),
        "heatmap": daily,
        "tags": tags,
    })
}

/// Mirror of `withEffectiveProgressValues`: `total`-mode entries record the
/// running total, so the effective contribution is the delta over the previous
/// total within the `(created_by, metric, task, project, board, list)` scope.
fn effective_values(entries: &[EntryRow]) -> Vec<f64> {
    let mut order: Vec<usize> = (0..entries.len()).collect();
    order.sort_by(|&a, &b| compare_entries(&entries[a], &entries[b]));

    let mut effective = vec![0.0_f64; entries.len()];
    let mut previous_totals: HashMap<String, f64> = HashMap::new();

    for index in order {
        let entry = &entries[index];
        let raw = progress_value(&entry.value);
        if entry.mode.as_deref() != Some("total") {
            effective[index] = raw;
            continue;
        }
        let key = scope_key(entry);
        let previous = previous_totals.get(&key).copied().unwrap_or(0.0);
        previous_totals.insert(key, raw);
        effective[index] = raw - previous;
    }

    effective
}

fn compare_entries(a: &EntryRow, b: &EntryRow) -> Ordering {
    let by_date = opt(&a.entry_date).cmp(opt(&b.entry_date));
    if by_date != Ordering::Equal {
        return by_date;
    }
    let by_created = opt(&a.created_at).cmp(opt(&b.created_at));
    if by_created != Ordering::Equal {
        return by_created;
    }
    opt(&a.id).cmp(opt(&b.id))
}

fn scope_key(entry: &EntryRow) -> String {
    [
        opt(&entry.created_by),
        opt(&entry.metric_id),
        opt(&entry.task_id),
        opt(&entry.project_id),
        opt(&entry.board_id),
        opt(&entry.list_id),
    ]
    .join(":")
}

fn opt(value: &Option<String>) -> &str {
    value.as_deref().unwrap_or("")
}

/// Mirror of JS `Number(value ?? 0)` with a finite fallback of `0`.
fn progress_value(value: &Value) -> f64 {
    match value {
        Value::Null => 0.0,
        Value::Number(number) => number
            .as_f64()
            .filter(|value| value.is_finite())
            .unwrap_or(0.0),
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                0.0
            } else {
                trimmed
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .unwrap_or(0.0)
            }
        }
        _ => 0.0,
    }
}

/// Serialize a numeric total the way `JSON.stringify` would: integer-valued
/// numbers without a trailing `.0`, everything else as a float.
fn number_value(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 9_007_199_254_740_992.0 {
        Value::Number(Number::from(value as i64))
    } else {
        Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::from(0))
    }
}

fn current_streak(by_date: &BTreeMap<String, f64>) -> i64 {
    let mut streak = 0;
    let mut cursor = today_days();
    loop {
        let key = format_date(cursor);
        if by_date.get(&key).copied().unwrap_or(0.0) <= 0.0 {
            return streak;
        }
        streak += 1;
        cursor -= 1;
    }
}

fn longest_streak(by_date: &BTreeMap<String, f64>) -> i64 {
    let mut days: Vec<i64> = by_date
        .iter()
        .filter(|(_, value)| **value > 0.0)
        .filter_map(|(date, _)| parse_date_days(date))
        .collect();
    days.sort_unstable();

    let mut longest = 0;
    let mut current = 0;
    let mut previous: Option<i64> = None;
    for day in days {
        current = if previous == Some(day - 1) {
            current + 1
        } else {
            1
        };
        if current > longest {
            longest = current;
        }
        previous = Some(day);
    }
    longest
}

// ---------------------------------------------------------------------------
// Schema-unavailable detection (mirror of `isTaskProgressSchemaUnavailableError`)
// ---------------------------------------------------------------------------

fn is_schema_unavailable(body: &Value) -> bool {
    let code = body.get("code").and_then(Value::as_str).unwrap_or("");
    let message = body.get("message").and_then(Value::as_str).unwrap_or("");
    let details = body.get("details").and_then(Value::as_str).unwrap_or("");
    let text = format!("{message} {details}").to_lowercase();
    let mentions = text.contains("task_progress_") || text.contains("task_leaderboard");
    let looks_missing = text.contains("schema cache")
        || text.contains("could not find")
        || text.contains("does not exist")
        || text.contains("column")
        || text.contains("relation");

    code == "42P01"
        || code == "42703"
        || code == "PGRST204"
        || code == "PGRST205"
        || (mentions && looks_missing)
}

// ---------------------------------------------------------------------------
// Date helpers (UTC, civil-date arithmetic shared with other handlers)
// ---------------------------------------------------------------------------

fn today_days() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i128)
        .unwrap_or(0);
    millis.div_euclid(86_400_000) as i64
}

fn format_date(days: i64) -> String {
    let (year, month, day) = civil_from_days(days as i128);
    format!("{year:04}-{month:02}-{day:02}")
}

fn parse_date_days(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() < 10 {
        return None;
    }
    let year: i128 = value.get(0..4)?.parse().ok()?;
    let month: i128 = value.get(5..7)?.parse().ok()?;
    let day: i128 = value.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    Some(days_from_civil(year, month, day) as i64)
}

fn days_from_civil(year: i128, month: i128, day: i128) -> i128 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

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

// ---------------------------------------------------------------------------
// Misc helpers / responses
// ---------------------------------------------------------------------------

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
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

fn is_direct_lookup_identifier(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key && !value.is_empty()).then(|| value.into_owned()))
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn schema_unavailable_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": false,
            "code": "schema_unavailable",
            "schemaAvailable": false,
            "message": SCHEMA_UNAVAILABLE_MESSAGE,
            "metrics": [],
            "summary": {
                "total": 0,
                "entriesCount": 0,
                "activeDays": 0,
                "currentStreak": 0,
                "longestStreak": 0,
            },
            "daily": [],
            "heatmap": [],
            "tags": [],
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(
        id: &str,
        entry_date: &str,
        created_at: &str,
        mode: &str,
        value: Value,
        tags: Value,
    ) -> EntryRow {
        EntryRow {
            id: Some(id.to_owned()),
            entry_date: Some(entry_date.to_owned()),
            created_at: Some(created_at.to_owned()),
            created_by: Some("user-1".to_owned()),
            metric_id: Some("metric-1".to_owned()),
            task_id: None,
            project_id: None,
            board_id: None,
            list_id: None,
            mode: Some(mode.to_owned()),
            value,
            tags,
        }
    }

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            stats_ws_id("/api/v1/workspaces/abc/task-progress/stats"),
            Some("abc")
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_short_paths() {
        assert_eq!(stats_ws_id("/api/v1/workspaces//task-progress/stats"), None);
        assert_eq!(
            stats_ws_id("/api/v1/workspaces/abc/def/task-progress/stats"),
            None
        );
        assert_eq!(stats_ws_id("/api/v1/workspaces/abc/task-progress"), None);
        assert_eq!(stats_ws_id("/totally/unrelated"), None);
    }

    #[test]
    fn progress_value_matches_js_number_semantics() {
        assert_eq!(progress_value(&Value::Null), 0.0);
        assert_eq!(progress_value(&json!(5)), 5.0);
        assert_eq!(progress_value(&json!("12.5")), 12.5);
        assert_eq!(progress_value(&json!("  ")), 0.0);
        assert_eq!(progress_value(&json!("abc")), 0.0);
    }

    #[test]
    fn number_value_omits_trailing_zero_for_integers() {
        assert_eq!(number_value(5.0), json!(5));
        assert_eq!(number_value(5.5), json!(5.5));
        assert_eq!(number_value(0.0), json!(0));
    }

    #[test]
    fn scope_key_joins_dimension_columns() {
        let mut entry = entry("a", "2026-01-01", "t", "delta", json!(1), json!([]));
        entry.task_id = Some("task-9".to_owned());
        assert_eq!(scope_key(&entry), "user-1:metric-1:task-9:::");
    }

    #[test]
    fn effective_values_compute_total_mode_deltas() {
        // Two `total`-mode entries in the same scope: deltas are 10 then 5.
        let entries = vec![
            entry("a", "2026-01-01", "t1", "total", json!(10), json!([])),
            entry("b", "2026-01-02", "t2", "total", json!(15), json!([])),
            entry("c", "2026-01-03", "t3", "delta", json!(3), json!([])),
        ];
        assert_eq!(effective_values(&entries), vec![10.0, 5.0, 3.0]);
    }

    #[test]
    fn build_stats_aggregates_daily_tags_and_streaks() {
        let entries = vec![
            entry("a", "2026-01-01", "t1", "delta", json!(2), json!(["focus"])),
            entry(
                "b",
                "2026-01-01",
                "t2",
                "delta",
                json!(3),
                json!(["focus", "deep"]),
            ),
            entry("c", "2026-01-03", "t3", "delta", json!(0), json!([])),
        ];
        let stats = build_stats(&entries, vec![], Some("metric-1".to_owned()));

        assert_eq!(stats["summary"]["total"], json!(5));
        assert_eq!(stats["summary"]["entriesCount"], json!(3));
        // 2026-01-01 has value 5 (>0); 2026-01-03 has value 0 (not active).
        assert_eq!(stats["summary"]["activeDays"], json!(1));
        assert_eq!(
            stats["daily"],
            json!([
                { "date": "2026-01-01", "value": 5 },
                { "date": "2026-01-03", "value": 0 },
            ])
        );
        assert_eq!(
            stats["tags"],
            json!([
                { "tag": "focus", "value": 5 },
                { "tag": "deep", "value": 3 },
            ])
        );
        assert_eq!(stats["selectedMetricId"], json!("metric-1"));
        assert_eq!(stats["ok"], json!(true));
    }

    #[test]
    fn longest_streak_counts_consecutive_positive_days() {
        let mut by_date = BTreeMap::new();
        by_date.insert("2026-01-01".to_owned(), 1.0);
        by_date.insert("2026-01-02".to_owned(), 2.0);
        by_date.insert("2026-01-03".to_owned(), 0.0);
        by_date.insert("2026-01-05".to_owned(), 4.0);
        assert_eq!(longest_streak(&by_date), 2);
    }

    #[test]
    fn date_round_trip_is_stable() {
        let days = parse_date_days("2026-06-29").unwrap();
        assert_eq!(format_date(days), "2026-06-29");
        assert_eq!(parse_date_days("not-a-date"), None);
    }

    #[test]
    fn schema_unavailable_detects_postgrest_codes() {
        assert!(is_schema_unavailable(&json!({ "code": "PGRST205" })));
        assert!(is_schema_unavailable(&json!({ "code": "42P01" })));
        assert!(is_schema_unavailable(&json!({
            "message": "Could not find the table for task_progress_metrics in the schema cache"
        })));
        assert!(!is_schema_unavailable(
            &json!({ "code": "23505", "message": "duplicate key" })
        ));
    }

    #[test]
    fn query_param_reads_first_non_empty_value() {
        let url = Some(
            "https://x.localhost/api/v1/workspaces/w/task-progress/stats?metric_id=m1&from=2026-01-01",
        );
        assert_eq!(query_param(url, "metric_id"), Some("m1".to_owned()));
        assert_eq!(query_param(url, "from"), Some("2026-01-01".to_owned()));
        assert_eq!(query_param(url, "to"), None);
    }

    #[test]
    fn is_uuid_literal_validates_shape() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
    }
}
