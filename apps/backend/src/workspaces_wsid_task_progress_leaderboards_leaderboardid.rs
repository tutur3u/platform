//! Handler for `GET /api/v1/workspaces/:wsId/task-progress/leaderboards/:leaderboardId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/[leaderboardId]/route.ts`.
//! Only the `GET` method is migrated; `PATCH` and `DELETE` fall through to the
//! still-live Next.js route by returning `None`.
//!
//! Auth model (legacy `resolveTaskProgressRouteAuth`): authenticate the Supabase
//! session user, normalize the workspace id, then require **workspace membership
//! of type `MEMBER`**. There is no specific workspace permission gate.
//!
//! Legacy status codes:
//!
//! - no authenticated user                 → `401 { "error": "Unauthorized" }`
//! - member lookup transport failure       → `500 { "error": "Failed to verify workspace membership" }`
//! - not a MEMBER                          → `403 { "error": "Workspace access denied" }`
//! - leaderboard not found                 → `404 { "error": "Leaderboard not found" }`
//! - task-progress schema missing          → `200 { ok:false, code:"schema_unavailable", ... }`
//! - other read failure                    → `500 { "error": "Failed to load task leaderboard" }`
//! - success                               → `200 { ok:true, schemaAvailable:true, leaderboard:{...} }`
//!
//! Hydration reproduces `hydrateLeaderboards` from `_leaderboards.ts`:
//! members, teams, entries (effective-value deltas), rankings (sorted by value
//! desc then display_name asc), and teamTotals (sorted by value desc).

use std::cmp::Ordering;
use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MID: &str = "/task-progress/leaderboards/";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task progress is not available until the latest database migration is applied.";
const FAILURE_MESSAGE: &str = "Failed to load task leaderboard";

const LEADERBOARD_SELECT: &str = "id,ws_id,metric_id,name,description,period_start,period_end,join_code,\
     status,starred,visibility,created_by,created_at,updated_at,archived_at,\
     metric:task_progress_metrics(*)";
const MEMBER_SELECT: &str = "id,leaderboard_id,team_id,user_id,display_name,status";
const TEAM_SELECT: &str = "id,leaderboard_id,name,color";
const ENTRY_SELECT: &str =
    "id,metric_id,task_id,project_id,board_id,list_id,created_by,created_at,value,mode,entry_date";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Deserialization structs
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_task_progress_leaderboards_leaderboardid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, leaderboard_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => get_leaderboard(config, request, raw_ws_id, leaderboard_id, outbound).await,
        _ => return None,
    })
}

fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, rest) = rest.split_once(PATH_MID)?;
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    let leaderboard_id = rest;
    if leaderboard_id.is_empty() || leaderboard_id.contains('/') {
        return None;
    }
    Some((ws_id, leaderboard_id))
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_leaderboard(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    leaderboard_id: &str,
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

    // Fetch the leaderboard row (maybeSingle → limit=1).
    let leaderboard_url = match contact_data.rest_url(
        "task_leaderboards",
        &[
            ("select", LEADERBOARD_SELECT.to_owned()),
            ("id", format!("eq.{leaderboard_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("archived_at", "is.null".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) {
        Some(url) => url,
        None => return error_response(500, FAILURE_MESSAGE),
    };

    let leaderboard = match fetch_rows::<Value>(contact_data, outbound, &leaderboard_url).await {
        Ok(mut rows) if !rows.is_empty() => rows.remove(0),
        Ok(_) => return error_response(404, "Leaderboard not found"),
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, FAILURE_MESSAGE),
    };

    // Hydrate: members, teams, entries → rankings + teamTotals.
    let leaderboard_id_val = leaderboard
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or(leaderboard_id)
        .to_owned();
    let metric_id = leaderboard
        .get("metric_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let period_start = leaderboard
        .get("period_start")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let period_end = leaderboard
        .get("period_end")
        .and_then(Value::as_str)
        .unwrap_or("9999-12-31")
        .to_owned();

    let members_url = match contact_data.rest_url(
        "task_leaderboard_members",
        &[
            ("select", MEMBER_SELECT.to_owned()),
            ("leaderboard_id", format!("eq.{leaderboard_id_val}")),
            ("status", "eq.active".to_owned()),
        ],
    ) {
        Some(url) => url,
        None => return error_response(500, FAILURE_MESSAGE),
    };

    let teams_url = match contact_data.rest_url(
        "task_leaderboard_teams",
        &[
            ("select", TEAM_SELECT.to_owned()),
            ("leaderboard_id", format!("eq.{leaderboard_id_val}")),
        ],
    ) {
        Some(url) => url,
        None => return error_response(500, FAILURE_MESSAGE),
    };

    let entries_url = match contact_data.rest_url(
        "task_progress_entries",
        &[
            ("select", ENTRY_SELECT.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("metric_id", format!("eq.{metric_id}")),
            ("deleted_at", "is.null".to_owned()),
            ("entry_date", format!("gte.{period_start}")),
            ("entry_date", format!("lte.{period_end}")),
        ],
    ) {
        Some(url) => url,
        None => return error_response(500, FAILURE_MESSAGE),
    };

    let members = match fetch_rows::<Value>(contact_data, outbound, &members_url).await {
        Ok(rows) => rows,
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, FAILURE_MESSAGE),
    };

    let teams = match fetch_rows::<Value>(contact_data, outbound, &teams_url).await {
        Ok(rows) => rows,
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, FAILURE_MESSAGE),
    };

    let entries = match fetch_rows::<EntryRow>(contact_data, outbound, &entries_url).await {
        Ok(rows) => rows,
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, FAILURE_MESSAGE),
    };

    let hydrated = hydrate_leaderboard(leaderboard, members, teams, &entries);

    no_store_response(json_response(
        200,
        json!({ "ok": true, "schemaAvailable": true, "leaderboard": hydrated }),
    ))
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
        if is_direct_lookup_identifier(&handle) {
            if let Some(id) =
                workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
            {
                return Ok(id);
            }
            if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
                return Ok(id);
            }
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
// Leaderboard hydration (mirror of `hydrateLeaderboards`)
// ---------------------------------------------------------------------------

fn hydrate_leaderboard(
    mut leaderboard: Value,
    members: Vec<Value>,
    teams: Vec<Value>,
    entries: &[EntryRow],
) -> Value {
    // Build per-user totals from effective entry values.
    let effective = effective_values(entries);
    let mut totals_by_user: HashMap<String, f64> = HashMap::new();
    for (index, entry) in entries.iter().enumerate() {
        if let Some(uid) = &entry.created_by
            && !uid.is_empty()
        {
            *totals_by_user.entry(uid.clone()).or_insert(0.0) += effective[index];
        }
    }

    // Rankings: members annotated with value + resolved team, sorted, then ranked.
    let mut rankings: Vec<Value> = members
        .iter()
        .map(|member| {
            let user_id = member.get("user_id").and_then(Value::as_str).unwrap_or("");
            let value = totals_by_user.get(user_id).copied().unwrap_or(0.0);
            let team_id = member.get("team_id").and_then(Value::as_str);
            let team = team_id.and_then(|tid| {
                teams
                    .iter()
                    .find(|t| t.get("id").and_then(Value::as_str) == Some(tid))
                    .cloned()
            });
            let mut obj = match member.clone() {
                Value::Object(m) => m,
                other => {
                    let mut w = serde_json::Map::new();
                    w.insert("value".to_owned(), other);
                    w
                }
            };
            obj.insert("value".to_owned(), json!(value));
            if let Some(t) = team {
                obj.insert("team".to_owned(), t);
            } else {
                obj.insert("team".to_owned(), Value::Null);
            }
            Value::Object(obj)
        })
        .collect();

    rankings.sort_by(|a, b| {
        let av = js_number(a.get("value").unwrap_or(&Value::Null));
        let bv = js_number(b.get("value").unwrap_or(&Value::Null));
        let by_value = bv.partial_cmp(&av).unwrap_or(Ordering::Equal);
        if by_value != Ordering::Equal {
            return by_value;
        }
        let an = a
            .get("display_name")
            .or_else(|| a.get("user_id"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let bn = b
            .get("display_name")
            .or_else(|| b.get("user_id"))
            .and_then(Value::as_str)
            .unwrap_or("");
        an.cmp(bn)
    });

    for (index, member) in rankings.iter_mut().enumerate() {
        if let Value::Object(obj) = member {
            obj.insert("rank".to_owned(), json!(index + 1));
        }
    }

    // Team totals: sum of member values per team, sorted by value desc.
    let mut team_totals: Vec<Value> = teams
        .iter()
        .map(|team| {
            let team_id = team.get("id").and_then(Value::as_str);
            let total: f64 = rankings
                .iter()
                .filter(|m| m.get("team_id").and_then(Value::as_str) == team_id)
                .map(|m| js_number(m.get("value").unwrap_or(&Value::Null)))
                .sum();
            let mut obj = match team.clone() {
                Value::Object(m) => m,
                other => {
                    let mut w = serde_json::Map::new();
                    w.insert("value".to_owned(), other);
                    w
                }
            };
            obj.insert("value".to_owned(), json!(total));
            Value::Object(obj)
        })
        .collect();

    team_totals.sort_by(|a, b| {
        let av = js_number(a.get("value").unwrap_or(&Value::Null));
        let bv = js_number(b.get("value").unwrap_or(&Value::Null));
        bv.partial_cmp(&av).unwrap_or(Ordering::Equal)
    });

    // Merge hydrated fields into the leaderboard object.
    if let Value::Object(obj) = &mut leaderboard {
        obj.insert("members".to_owned(), json!(members));
        obj.insert("teams".to_owned(), json!(teams));
        obj.insert("rankings".to_owned(), json!(rankings));
        obj.insert("teamTotals".to_owned(), json!(team_totals));
    }

    leaderboard
}

/// Mirror of `withEffectiveProgressValues`: `total`-mode entries contribute the
/// delta over the previous running total within the scope key.
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

fn js_number(value: &Value) -> f64 {
    match value {
        Value::Null => 0.0,
        Value::Number(n) => n.as_f64().filter(|v| v.is_finite()).unwrap_or(0.0),
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                0.0
            } else {
                t.parse::<f64>()
                    .ok()
                    .filter(|v| v.is_finite())
                    .unwrap_or(0.0)
            }
        }
        _ => 0.0,
    }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn fetch_rows<T: for<'de> serde::Deserialize<'de>>(
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
    let key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, key, key).await
}

async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, access_token, key).await
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
// Schema-unavailable detection
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
// Misc helpers
// ---------------------------------------------------------------------------

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, c)| {
        let is_edge = i == 0 || i + 1 == length;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!is_edge && matches!(c, '_' | '-'))
    })
}

fn is_direct_lookup_identifier(value: &str) -> bool {
    let n = value.trim().to_lowercase();
    n == PERSONAL_WORKSPACE_SLUG
        || n == ROOT_WORKSPACE_ID
        || n == INTERNAL_WORKSPACE_SLUG
        || is_uuid_literal(&n)
        || is_workspace_handle(&n)
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
        }),
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_entry(
        id: &'static str,
        entry_date: &'static str,
        created_at: &'static str,
        created_by: &'static str,
        metric_id: &'static str,
        mode: &'static str,
        value: Value,
    ) -> EntryRow {
        EntryRow {
            id: Some(id.to_owned()),
            entry_date: Some(entry_date.to_owned()),
            created_at: Some(created_at.to_owned()),
            created_by: Some(created_by.to_owned()),
            metric_id: Some(metric_id.to_owned()),
            task_id: None,
            project_id: None,
            board_id: None,
            list_id: None,
            mode: Some(mode.to_owned()),
            value,
        }
    }

    #[test]
    fn path_guard_extracts_ws_and_leaderboard_ids() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-1/task-progress/leaderboards/lb-1"),
            Some(("ws-1", "lb-1"))
        );
    }

    #[test]
    fn path_guard_rejects_short_and_foreign_paths() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces//task-progress/leaderboards/lb-1"),
            None
        );
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-1/task-progress/leaderboards/"),
            None
        );
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-1/extra/task-progress/leaderboards/lb-1"),
            None
        );
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-1/task-progress/leaderboards/lb-1/sub"),
            None
        );
        assert_eq!(extract_path_params("/totally/unrelated"), None);
    }

    #[test]
    fn effective_values_total_mode_computes_deltas() {
        let entries = vec![
            make_entry("a", "2026-01-01", "t1", "u1", "m1", "total", json!(10)),
            make_entry("b", "2026-01-02", "t2", "u1", "m1", "total", json!(15)),
            make_entry("c", "2026-01-03", "t3", "u1", "m1", "delta", json!(3)),
        ];
        assert_eq!(effective_values(&entries), vec![10.0, 5.0, 3.0]);
    }

    #[test]
    fn js_number_handles_nulls_strings_and_numbers() {
        assert_eq!(js_number(&Value::Null), 0.0);
        assert_eq!(js_number(&json!(7)), 7.0);
        assert_eq!(js_number(&json!("3.5")), 3.5);
        assert_eq!(js_number(&json!("  ")), 0.0);
        assert_eq!(js_number(&json!("abc")), 0.0);
    }

    #[test]
    fn is_uuid_literal_accepts_valid_and_rejects_invalid() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
    }

    #[test]
    fn schema_unavailable_detects_postgrest_codes() {
        assert!(is_schema_unavailable(&json!({ "code": "PGRST205" })));
        assert!(is_schema_unavailable(&json!({ "code": "42P01" })));
        assert!(is_schema_unavailable(&json!({
            "message": "Could not find the table for task_leaderboards in the schema cache"
        })));
        assert!(!is_schema_unavailable(
            &json!({ "code": "23505", "message": "duplicate key" })
        ));
    }

    #[test]
    fn hydrate_leaderboard_computes_rankings_and_team_totals() {
        let leaderboard = json!({
            "id": "lb-1",
            "metric_id": "m1",
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
        });
        let members = vec![
            json!({ "id": "mem-1", "user_id": "u1", "display_name": "Alice", "team_id": "t1", "status": "active" }),
            json!({ "id": "mem-2", "user_id": "u2", "display_name": "Bob", "team_id": "t1", "status": "active" }),
        ];
        let teams =
            vec![json!({ "id": "t1", "name": "Red", "leaderboard_id": "lb-1", "color": "red" })];
        let entries = vec![
            make_entry("a", "2026-01-05", "t1", "u1", "m1", "delta", json!(10)),
            make_entry("b", "2026-01-06", "t2", "u2", "m1", "delta", json!(5)),
        ];
        let result = hydrate_leaderboard(leaderboard, members, teams, &entries);
        let rankings = result.get("rankings").unwrap().as_array().unwrap();
        assert_eq!(rankings[0]["user_id"], json!("u1"));
        assert_eq!(rankings[0]["rank"], json!(1));
        assert_eq!(rankings[1]["rank"], json!(2));
        let team_totals = result.get("teamTotals").unwrap().as_array().unwrap();
        assert_eq!(team_totals[0]["value"], json!(15.0));
    }
}
