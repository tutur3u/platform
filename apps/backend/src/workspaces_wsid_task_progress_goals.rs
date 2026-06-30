//! Handler for `GET /api/v1/workspaces/:wsId/task-progress/goals`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-progress/goals/route.ts`
//! (and its shared `_utils.ts`/`_schemas.ts` helpers). Only the `GET` method is
//! migrated; `POST` (goal creation) falls through to the still-live Next.js
//! route by returning `None`.
//!
//! Auth model (legacy `resolveTaskProgressRouteAuth`): authenticate the Supabase
//! session user, normalize the workspace id (`personal` slug / handle / UUID /
//! `internal`), then require **workspace membership of type `MEMBER`** — there is
//! no specific workspace permission gate. This port reproduces that
//! membership-only check directly (token -> user -> `workspace_members` lookup),
//! mirroring the sibling `workspaces_wsid_task_progress_stats` handler.
//!
//! Legacy status codes preserved (mirror of `taskProgressErrorResponse`):
//!   * no authenticated user                  -> `401 { "error": "Unauthorized" }`
//!   * member lookup transport/query failure   -> `500 { "error": "Failed to verify workspace membership" }`
//!   * not a `MEMBER` of the workspace         -> `403 { "error": "Workspace access denied" }`
//!   * task-progress schema missing            -> `200 { ok:false, code:"schema_unavailable", schemaAvailable:false, message:..., goals:[] }`
//!   * any other read failure                  -> `500 { "error": "Failed to list task progress goals" }`
//!   * success                                 -> `200 { ok:true, schemaAvailable:true, goals:[...] }`
//!
//! The legacy GET reads `task_progress_goals` (with the embedded
//! `metric:task_progress_metrics(*)`) via the admin (service-role) client and
//! then hydrates each goal with computed `progress`/`remaining`/`percent` derived
//! from the matching `task_progress_entries` (`withEffectiveProgressValues` +
//! `entryMatchesGoal`). This port reproduces that hydration faithfully. Goal rows
//! are preserved verbatim (including the embedded `metric`) and only the three
//! computed numeric fields are added.

use std::cmp::Ordering;
use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Map, Number, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-progress/goals";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task progress is not available until the latest database migration is applied.";
const GOALS_FAILURE_MESSAGE: &str = "Failed to list task progress goals";

const GOAL_SELECT: &str = "id,ws_id,owner_id,metric_id,name,description,goal_type,target_value,period_start,period_end,recurrence,task_id,project_id,board_id,tags,status,starred,visibility,created_at,updated_at,archived_at,metric:task_progress_metrics(*)";
const ENTRY_SELECT: &str = "id,ws_id,metric_id,task_id,project_id,board_id,list_id,entry_date,value,mode,note,tags,source_type,source_id,created_by,created_at,updated_at,deleted_at";

#[derive(Clone, Copy)]
enum MembershipError {
    Unauthorized,
    LookupFailed,
    AccessDenied,
}

enum FetchError {
    SchemaUnavailable,
    Other,
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

pub(crate) async fn handle_workspaces_wsid_task_progress_goals_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = goals_ws_id(request.path)?;

    Some(match request.method {
        "GET" => goals_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn goals_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn goals_response(
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

    // Read goals (service role; legacy uses the admin client).
    let goals = match fetch_rows::<Value>(
        contact_data,
        outbound,
        &goals_url(contact_data, &ws_id, request.url),
    )
    .await
    {
        Ok(rows) => rows,
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, GOALS_FAILURE_MESSAGE),
    };

    // Mirror of `hydrateGoalsWithProgress`: bail out early without fetching
    // entries when there are no goals.
    if goals.is_empty() {
        return success_response(Vec::new());
    }

    let entries = match fetch_rows::<EntryRow>(
        contact_data,
        outbound,
        &entries_url(contact_data, &ws_id, &goals),
    )
    .await
    {
        Ok(rows) => rows,
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, GOALS_FAILURE_MESSAGE),
    };

    success_response(hydrate_goals(goals, &entries))
}

// ---------------------------------------------------------------------------
// Membership authorization (mirror of `resolveTaskProgressRouteAuth`)
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

fn goals_url(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    request_url: Option<&str>,
) -> String {
    let mut params: Vec<(&str, String)> = vec![
        ("select", GOAL_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("archived_at", "is.null".to_owned()),
    ];
    if let Some(status) = query_param(request_url, "status") {
        params.push(("status", format!("eq.{status}")));
    }
    if let Some(metric_id) = query_param(request_url, "metric_id") {
        params.push(("metric_id", format!("eq.{metric_id}")));
    }
    params.push(("order", "starred.desc,period_start.desc".to_owned()));

    contact_data
        .rest_url("task_progress_goals", &params)
        .unwrap_or_default()
}

fn entries_url(contact_data: &contact::ContactDataConfig, ws_id: &str, goals: &[Value]) -> String {
    // Mirror of `hydrateGoalsWithProgress`: scope entries to the goals' metrics
    // and to the [min(period_start), max(period_end)] window.
    let mut metric_ids: Vec<String> = Vec::new();
    for goal in goals {
        if let Some(metric_id) = goal.get("metric_id").and_then(Value::as_str)
            && !metric_ids.iter().any(|existing| existing == metric_id)
        {
            metric_ids.push(metric_id.to_owned());
        }
    }

    let min_start = goals
        .iter()
        .filter_map(|goal| goal.get("period_start").and_then(Value::as_str))
        .filter(|value| !value.is_empty())
        .min();
    let max_end = goals
        .iter()
        .filter_map(|goal| goal.get("period_end").and_then(Value::as_str))
        .filter(|value| !value.is_empty())
        .max();

    let mut params: Vec<(&str, String)> = vec![
        ("select", ENTRY_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("deleted_at", "is.null".to_owned()),
        ("metric_id", format!("in.({})", metric_ids.join(","))),
    ];
    if let Some(min_start) = min_start {
        params.push(("entry_date", format!("gte.{min_start}")));
    }
    if let Some(max_end) = max_end {
        params.push(("entry_date", format!("lte.{max_end}")));
    }

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
// Goal hydration (mirror of `hydrateGoalsWithProgress`)
// ---------------------------------------------------------------------------

fn hydrate_goals(goals: Vec<Value>, entries: &[EntryRow]) -> Vec<Value> {
    let effective = effective_values(entries);

    goals
        .into_iter()
        .map(|goal| {
            let progress: f64 = entries
                .iter()
                .enumerate()
                .filter(|(_, entry)| entry_matches_goal(entry, &goal))
                .map(|(index, _)| effective[index])
                .sum();
            let target = js_number(goal.get("target_value").unwrap_or(&Value::Null));
            let remaining = (target - progress).max(0.0);
            let percent = if target > 0.0 {
                ((progress / target) * 100.0).min(100.0)
            } else {
                0.0
            };

            let mut object = match goal {
                Value::Object(object) => object,
                other => {
                    // Goals are always objects; preserve any unexpected shape.
                    let mut wrapper = Map::new();
                    wrapper.insert("value".to_owned(), other);
                    wrapper
                }
            };
            object.insert("progress".to_owned(), number_value(progress));
            object.insert("remaining".to_owned(), number_value(remaining));
            object.insert("percent".to_owned(), number_value(percent));
            Value::Object(object)
        })
        .collect()
}

fn entry_matches_goal(entry: &EntryRow, goal: &Value) -> bool {
    if let Some(metric_id) = goal_str(goal, "metric_id")
        && entry.metric_id.as_deref() != Some(metric_id)
    {
        return false;
    }
    if let Some(task_id) = goal_str(goal, "task_id")
        && entry.task_id.as_deref() != Some(task_id)
    {
        return false;
    }
    if let Some(project_id) = goal_str(goal, "project_id")
        && entry.project_id.as_deref() != Some(project_id)
    {
        return false;
    }
    if let Some(board_id) = goal_str(goal, "board_id")
        && entry.board_id.as_deref() != Some(board_id)
    {
        return false;
    }
    // `entry.entry_date < goal.period_start`: a missing entry_date never filters
    // (JS `undefined < x` is false).
    if let Some(period_start) = goal_str(goal, "period_start")
        && let Some(entry_date) = entry.entry_date.as_deref()
        && entry_date < period_start
    {
        return false;
    }
    if let Some(period_end) = goal_str(goal, "period_end")
        && let Some(entry_date) = entry.entry_date.as_deref()
        && entry_date > period_end
    {
        return false;
    }

    if let Some(Value::Array(goal_tags)) = goal.get("tags")
        && !goal_tags.is_empty()
    {
        let empty: Vec<Value> = Vec::new();
        let entry_tags = match &entry.tags {
            Value::Array(tags) => tags,
            _ => &empty,
        };
        return goal_tags
            .iter()
            .all(|tag| entry_tags.iter().any(|candidate| candidate == tag));
    }

    true
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
        let raw = js_number(&entry.value);
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

/// Goal string field accessor: returns `Some` only for a non-empty string,
/// matching the JS truthiness guards (`if (goal.field && ...)`).
fn goal_str<'a>(goal: &'a Value, key: &str) -> Option<&'a str> {
    goal.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

/// Mirror of JS `Number(value ?? 0)` with a finite fallback of `0`.
fn js_number(value: &Value) -> f64 {
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

/// Serialize a numeric value the way `JSON.stringify` would: integer-valued
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

fn success_response(goals: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "goals": goals,
        }),
    ))
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
            "goals": [],
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
            goals_ws_id("/api/v1/workspaces/abc/task-progress/goals"),
            Some("abc")
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_short_paths() {
        assert_eq!(goals_ws_id("/api/v1/workspaces//task-progress/goals"), None);
        assert_eq!(
            goals_ws_id("/api/v1/workspaces/abc/def/task-progress/goals"),
            None
        );
        assert_eq!(goals_ws_id("/api/v1/workspaces/abc/task-progress"), None);
        assert_eq!(goals_ws_id("/api/workspaces/abc/task-progress/goals"), None);
        assert_eq!(goals_ws_id("/totally/unrelated"), None);
    }

    #[test]
    fn js_number_matches_number_semantics() {
        assert_eq!(js_number(&Value::Null), 0.0);
        assert_eq!(js_number(&json!(5)), 5.0);
        assert_eq!(js_number(&json!("12.5")), 12.5);
        assert_eq!(js_number(&json!("  ")), 0.0);
        assert_eq!(js_number(&json!("abc")), 0.0);
    }

    #[test]
    fn number_value_omits_trailing_zero_for_integers() {
        assert_eq!(number_value(5.0), json!(5));
        assert_eq!(number_value(5.5), json!(5.5));
        assert_eq!(number_value(0.0), json!(0));
    }

    #[test]
    fn effective_values_compute_total_mode_deltas() {
        let entries = vec![
            entry("a", "2026-01-01", "t1", "total", json!(10), json!([])),
            entry("b", "2026-01-02", "t2", "total", json!(15), json!([])),
            entry("c", "2026-01-03", "t3", "delta", json!(3), json!([])),
        ];
        assert_eq!(effective_values(&entries), vec![10.0, 5.0, 3.0]);
    }

    #[test]
    fn entry_matches_goal_filters_by_metric_and_tags() {
        let goal = json!({
            "metric_id": "metric-1",
            "tags": ["focus"],
        });
        let mut matching = entry(
            "a",
            "2026-01-01",
            "t1",
            "delta",
            json!(1),
            json!(["focus", "deep"]),
        );
        assert!(entry_matches_goal(&matching, &goal));

        matching.tags = json!(["deep"]);
        assert!(!entry_matches_goal(&matching, &goal));

        matching.tags = json!(["focus"]);
        matching.metric_id = Some("metric-2".to_owned());
        assert!(!entry_matches_goal(&matching, &goal));
    }

    #[test]
    fn entry_matches_goal_filters_by_period_window() {
        let goal = json!({
            "metric_id": "metric-1",
            "period_start": "2026-01-02",
            "period_end": "2026-01-04",
        });
        let before = entry("a", "2026-01-01", "t1", "delta", json!(1), json!([]));
        let inside = entry("b", "2026-01-03", "t2", "delta", json!(1), json!([]));
        let after = entry("c", "2026-01-05", "t3", "delta", json!(1), json!([]));
        assert!(!entry_matches_goal(&before, &goal));
        assert!(entry_matches_goal(&inside, &goal));
        assert!(!entry_matches_goal(&after, &goal));
    }

    #[test]
    fn hydrate_goals_computes_progress_remaining_percent() {
        let goals = vec![json!({
            "id": "goal-1",
            "metric_id": "metric-1",
            "target_value": 10,
            "metric": { "id": "metric-1", "name": "Focus" },
        })];
        let entries = vec![
            entry("a", "2026-01-01", "t1", "delta", json!(2), json!([])),
            entry("b", "2026-01-02", "t2", "delta", json!(3), json!([])),
        ];
        let hydrated = hydrate_goals(goals, &entries);
        assert_eq!(hydrated.len(), 1);
        let goal = &hydrated[0];
        assert_eq!(goal["progress"], json!(5));
        assert_eq!(goal["remaining"], json!(5));
        assert_eq!(goal["percent"], json!(50));
        // Original fields (including the embedded metric) are preserved verbatim.
        assert_eq!(goal["id"], json!("goal-1"));
        assert_eq!(goal["metric"]["name"], json!("Focus"));
    }

    #[test]
    fn hydrate_goals_caps_percent_and_remaining() {
        let goals = vec![json!({
            "id": "goal-1",
            "metric_id": "metric-1",
            "target_value": 4,
        })];
        let entries = vec![entry(
            "a",
            "2026-01-01",
            "t1",
            "delta",
            json!(10),
            json!([]),
        )];
        let hydrated = hydrate_goals(goals, &entries);
        assert_eq!(hydrated[0]["progress"], json!(10));
        assert_eq!(hydrated[0]["remaining"], json!(0));
        assert_eq!(hydrated[0]["percent"], json!(100));
    }

    #[test]
    fn hydrate_goals_zero_target_yields_zero_percent() {
        let goals = vec![json!({
            "id": "goal-1",
            "metric_id": "metric-1",
            "target_value": 0,
        })];
        let entries = vec![entry("a", "2026-01-01", "t1", "delta", json!(3), json!([]))];
        let hydrated = hydrate_goals(goals, &entries);
        assert_eq!(hydrated[0]["percent"], json!(0));
        assert_eq!(hydrated[0]["remaining"], json!(0));
    }

    #[test]
    fn schema_unavailable_detects_postgrest_codes() {
        assert!(is_schema_unavailable(&json!({ "code": "PGRST205" })));
        assert!(is_schema_unavailable(&json!({ "code": "42P01" })));
        assert!(is_schema_unavailable(&json!({
            "message": "Could not find the table for task_progress_goals in the schema cache"
        })));
        assert!(!is_schema_unavailable(
            &json!({ "code": "23505", "message": "duplicate key" })
        ));
    }

    #[test]
    fn query_param_reads_first_non_empty_value() {
        let url = Some(
            "https://x.localhost/api/v1/workspaces/w/task-progress/goals?status=active&metric_id=m1",
        );
        assert_eq!(query_param(url, "status"), Some("active".to_owned()));
        assert_eq!(query_param(url, "metric_id"), Some("m1".to_owned()));
        assert_eq!(query_param(url, "missing"), None);
    }

    #[test]
    fn is_uuid_literal_validates_shape() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
    }
}
