//! Handler for `GET /api/v1/workspaces/:wsId/task-projects`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-projects/route.ts` (GET only;
//! the legacy `POST` create path is intentionally left to the still-live Next.js
//! route, so this handler returns `None` for every non-`GET` method).
//!
//! Auth model (legacy `GET`):
//!   1. build an RLS-respecting Supabase client (`createClient`);
//!   2. normalize the workspace id (`normalizeWorkspaceId`), resolving the
//!      `personal` slug, the `internal` alias, and workspace handles;
//!   3. resolve the authenticated session user
//!      (`resolveAuthenticatedSessionUser`) -> 401 on failure;
//!   4. `verifyWorkspaceMembershipType` with the default `requiredType = 'MEMBER'`
//!      (no specific workspace permission gate);
//!   5. read `task_projects` with the **admin (service-role)** client
//!      (`createAdminClient`).
//!
//! This port reproduces the membership-only check (caller token -> user ->
//! `workspace_members` lookup, all under the caller's access token so RLS is
//! active like the legacy RLS client), normalizes the workspace id with the same
//! resolution rules, then reads `task_projects` with the service-role key to
//! mirror the admin client.
//!
//! Legacy status codes preserved:
//!   * no authenticated session user             -> `401 { "error": "Unauthorized" }`
//!   * membership lookup transport/query failure  -> `500 { "error": "Failed to verify workspace membership" }`
//!   * not a `MEMBER` of the workspace            -> `403 { "error": "Forbidden" }`
//!   * invalid `id`/`ids` project filter value    -> `400 { "error": "Invalid project ID filter" }`
//!   * `task_projects` read failure               -> `500 { "error": "Failed to fetch projects" }`
//!   * any unexpected failure (config, etc.)      -> `500 { "error": "Internal server error" }`
//!   * success                                    -> `200 [ ...projects ]`
//!
//! Response shapes match the legacy route exactly:
//!   * `?compact=true` returns the raw `[{ id, name, status }]` rows ordered by
//!     `name` ascending;
//!   * otherwise returns each full project row (`select *` + embedded `creator`,
//!     `lead`, and `task_project_tasks`) ordered by `created_at` descending, with
//!     a `created_at` fallback (`?? now`) and the partitioned link fields
//!     (`linkedTasks`, `linkedDocuments`, `tasksCount`, `completedTasksCount`)
//!     produced by `partitionTaskProjectLinks`.
//!
//! BEHAVIOR GAPS:
//!   * Project-id filter validation uses a strict 8-4-4-4-12 hex UUID check; the
//!     legacy route uses Zod `z.guid()` which is marginally more permissive about
//!     accepted GUID shapes. Well-formed UUIDs behave identically.
//!   * The legacy route normalizes the workspace id before authenticating; this
//!     port authenticates first (needed to resolve the `personal` slug). The only
//!     observable difference is that an unauthenticated request to the `personal`
//!     slug returns `401` here versus a `500` from the legacy `try/catch`.
//!   * The legacy route sets no explicit cache headers; this port responds
//!     `no-store` to match the crate's read convention (the legacy
//!     `NextResponse.json` is likewise uncached).

use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-projects";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const COMPACT_SELECT: &str = "id,name,status";
const FULL_SELECT: &str = "*,creator:users!task_projects_creator_id_fkey(id,display_name,avatar_url),lead:users!task_projects_lead_id_fkey(id,display_name,avatar_url),task_project_tasks(task:tasks!inner(id,name,completed,completed_at,closed_at,deleted_at,priority,task_lists(name,status)))";

#[derive(Clone, Copy)]
enum MembershipError {
    LookupFailed,
    Forbidden,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_task_projects_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = task_projects_ws_id(request.path)?;

    Some(match request.method {
        "GET" => task_projects_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn task_projects_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn task_projects_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    // Parse query params; `compact` and the project-id filter mirror the legacy
    // `searchParams` handling. The invalid-id `400` is deferred until after the
    // auth + membership gates to match the legacy ordering.
    let query = parse_query(request.url);

    // Resolve the authenticated session user (RLS client) and the caller token.
    let access_token = match supabase_auth::request_access_token(request) {
        Some(token) => token,
        None => return error_response(401, "Unauthorized"),
    };
    let user_id =
        match supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id)
            .filter(|id| !id.trim().is_empty())
        {
            Some(id) => id,
            None => return error_response(401, "Unauthorized"),
        };

    // `normalizeWorkspaceId(rawWsId, supabase)`.
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) => ws_id,
            // A `None` here corresponds to the legacy `normalizeWorkspaceId` throwing
            // (e.g. personal workspace not found), which the route `catch` maps to 500.
            Ok(None) | Err(()) => return error_response(500, "Internal server error"),
        };

    // `verifyWorkspaceMembershipType({ wsId, userId, supabase })` (default MEMBER).
    match authorize_membership(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(()) => {}
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace membership");
        }
        Err(MembershipError::Forbidden) => return error_response(403, "Forbidden"),
    }

    // `createAdminClient()` + project-id filter validation (legacy 400).
    let requested_ids = match query.requested_ids {
        Ok(ids) => ids,
        Err(()) => return error_response(400, "Invalid project ID filter"),
    };

    if query.compact {
        match fetch_compact_projects(contact_data, outbound, &ws_id, &requested_ids).await {
            Ok(rows) => no_store_response(json_response(200, Value::Array(rows))),
            Err(()) => error_response(500, "Failed to fetch projects"),
        }
    } else {
        match fetch_full_projects(contact_data, outbound, &ws_id, &requested_ids).await {
            Ok(rows) => no_store_response(json_response(200, format_projects(rows))),
            Err(()) => error_response(500, "Failed to fetch projects"),
        }
    }
}

// ---------------------------------------------------------------------------
// Authentication / membership (RLS via caller token)
// ---------------------------------------------------------------------------

/// Reproduce `verifyWorkspaceMembershipType` with the default `requiredType =
/// 'MEMBER'` using the caller's access token (RLS active).
async fn authorize_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<(), MembershipError> {
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
    let response = caller_get(contact_data, outbound, &url, access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }

    // `membership_lookup_failed` -> 500; `membership_missing` /
    // `membership_type_mismatch` -> `!membership.ok` -> 403.
    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::Forbidden)?;

    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok(())
    } else {
        Err(MembershipError::Forbidden)
    }
}

// ---------------------------------------------------------------------------
// Workspace id normalization (mirrors `normalizeWorkspaceId`)
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved));
        }

        // Try the RLS (caller token) lookup first, then service-role fallback.
        if let Some(id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(Some(id));
        }
        if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
            return Ok(Some(id));
        }
    }

    Ok(Some(resolved))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
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
        // Legacy treats a personal-workspace lookup miss as a thrown error.
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
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

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Data reads (service role, mirroring `createAdminClient`)
// ---------------------------------------------------------------------------

async fn fetch_compact_projects(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    requested_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut params = vec![
        ("select", COMPACT_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("deleted", "eq.false".to_owned()),
        ("order", "name.asc".to_owned()),
    ];
    if let Some(filter) = id_in_filter(requested_ids) {
        params.push(("id", filter));
    }

    let url = contact_data.rest_url("task_projects", &params).ok_or(())?;
    let response = service_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn fetch_full_projects(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    requested_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut params = vec![
        ("select", FULL_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("deleted", "eq.false".to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(filter) = id_in_filter(requested_ids) {
        params.push(("id", filter));
    }

    let url = contact_data.rest_url("task_projects", &params).ok_or(())?;
    let response = service_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Forward the caller's access token (RLS active) with the service-role key as
/// the PostgREST `apikey`, mirroring the legacy RLS Supabase client.
async fn caller_get(
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

/// Read with the service-role key (RLS bypassed), mirroring `createAdminClient`.
async fn service_get(
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
// Query parsing
// ---------------------------------------------------------------------------

struct ParsedQuery {
    compact: bool,
    /// `Err(())` indicates an invalid project-id filter value (legacy 400).
    requested_ids: Result<Vec<String>, ()>,
}

fn parse_query(request_url: Option<&str>) -> ParsedQuery {
    let Some(parsed) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        return ParsedQuery {
            compact: false,
            requested_ids: Ok(Vec::new()),
        };
    };

    let mut compact = false;
    let mut compact_seen = false;
    let mut id_values: Vec<String> = Vec::new();
    let mut ids_value: Option<String> = None;

    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            // `searchParams.get('compact')` returns the first occurrence.
            "compact" => {
                if !compact_seen {
                    compact_seen = true;
                    compact = value.as_ref() == "true";
                }
            }
            // `searchParams.getAll('id')` collects every `id` param in order.
            "id" => id_values.push(value.into_owned()),
            // `searchParams.get('ids')` returns the first occurrence only.
            "ids" if ids_value.is_none() => {
                ids_value = Some(value.into_owned());
            }
            _ => {}
        }
    }

    // `[...getAll('id'), ...(get('ids') ?? '').split(',').map(trim).filter(Boolean)]`.
    let mut requested: Vec<String> = id_values;
    if let Some(ids) = ids_value {
        for part in ids.split(',') {
            let trimmed = part.trim();
            if !trimmed.is_empty() {
                requested.push(trimmed.to_owned());
            }
        }
    }

    let unique = dedupe_preserving_order(requested);

    let requested_ids = if unique.iter().any(|id| !is_guid(id)) {
        Err(())
    } else {
        Ok(unique)
    };

    ParsedQuery {
        compact,
        requested_ids,
    }
}

fn dedupe_preserving_order(values: Vec<String>) -> Vec<String> {
    let mut unique: Vec<String> = Vec::new();
    for value in values {
        if !unique.iter().any(|existing| existing == &value) {
            unique.push(value);
        }
    }
    unique
}

fn id_in_filter(requested_ids: &[String]) -> Option<String> {
    if requested_ids.is_empty() {
        return None;
    }
    Some(format!("in.({})", requested_ids.join(",")))
}

// ---------------------------------------------------------------------------
// Response shaping (mirrors `partitionTaskProjectLinks`)
// ---------------------------------------------------------------------------

fn format_projects(rows: Vec<Value>) -> Value {
    Value::Array(rows.into_iter().map(format_project).collect())
}

fn format_project(project: Value) -> Value {
    let mut map = match project {
        Value::Object(map) => map,
        other => return other,
    };

    let partition = partition_task_project_links(map.get("task_project_tasks"));

    // `created_at: project.created_at ?? new Date().toISOString()`.
    let needs_created_at = !matches!(map.get("created_at"), Some(value) if !value.is_null());
    if needs_created_at {
        map.insert(
            "created_at".to_owned(),
            Value::String(current_utc_timestamp_iso_millis()),
        );
    }

    map.insert(
        "linkedTasks".to_owned(),
        Value::Array(partition.linked_tasks),
    );
    map.insert(
        "linkedDocuments".to_owned(),
        Value::Array(partition.linked_documents),
    );
    map.insert("tasksCount".to_owned(), json!(partition.tasks_count));
    map.insert(
        "completedTasksCount".to_owned(),
        json!(partition.completed_tasks_count),
    );

    Value::Object(map)
}

struct LinkPartition {
    linked_tasks: Vec<Value>,
    linked_documents: Vec<Value>,
    tasks_count: usize,
    completed_tasks_count: usize,
}

fn partition_task_project_links(links: Option<&Value>) -> LinkPartition {
    let mut linked_tasks: Vec<Value> = Vec::new();
    let mut linked_documents: Vec<Value> = Vec::new();
    let mut completed_tasks_count = 0usize;

    if let Some(Value::Array(items)) = links {
        for link in items {
            let Some(task) = link.get("task") else {
                continue;
            };
            // Skip null tasks and soft-deleted tasks (`!task || task.deleted_at`).
            if task.is_null() || !field_is_nullish(task, "deleted_at") {
                continue;
            }

            let item = map_task_project_linked_item(task);
            let list_status = task
                .get("task_lists")
                .and_then(|lists| lists.get("status"))
                .and_then(Value::as_str);

            if list_status == Some("documents") {
                linked_documents.push(item);
            } else {
                let completed = !field_is_nullish(&item, "completed_at")
                    || !field_is_nullish(&item, "closed_at");
                if completed {
                    completed_tasks_count += 1;
                }
                linked_tasks.push(item);
            }
        }
    }

    LinkPartition {
        tasks_count: linked_tasks.len(),
        completed_tasks_count,
        linked_tasks,
        linked_documents,
    }
}

fn map_task_project_linked_item(task: &Value) -> Value {
    let name = task
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("Untitled task")
        .to_owned();
    let task_lists = task.get("task_lists");

    json!({
        "id": value_or_null(task, "id"),
        "name": name,
        "completed": value_or_null(task, "completed"),
        "completed_at": value_or_null(task, "completed_at"),
        "closed_at": value_or_null(task, "closed_at"),
        "priority": value_or_null(task, "priority"),
        "listName": task_lists
            .and_then(|lists| lists.get("name"))
            .cloned()
            .unwrap_or(Value::Null),
        "listStatus": task_lists
            .and_then(|lists| lists.get("status"))
            .cloned()
            .unwrap_or(Value::Null),
    })
}

/// Mirrors `value ?? null`: returns the field value or `null` if absent.
fn value_or_null(value: &Value, key: &str) -> Value {
    value.get(key).cloned().unwrap_or(Value::Null)
}

/// JS nullish check (`field == null`): `true` when the field is absent or null.
fn field_is_nullish(value: &Value, key: &str) -> bool {
    matches!(value.get(key), None | Some(Value::Null))
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
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

/// Approximates Zod `z.guid()`: a canonical 8-4-4-4-12 hex UUID.
fn is_guid(value: &str) -> bool {
    is_workspace_uuid_literal(value)
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn current_utc_timestamp_iso_millis() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = i64::try_from(duration.as_secs()).unwrap_or(i64::MAX);
    let milliseconds = duration.subsec_millis();
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_unix_epoch_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{milliseconds:03}Z")
}

fn civil_from_unix_epoch_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };

    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            task_projects_ws_id("/api/v1/workspaces/abc/task-projects"),
            Some("abc")
        );
        assert_eq!(
            task_projects_ws_id("/api/v1/workspaces/personal/task-projects"),
            Some("personal")
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_short_paths() {
        assert_eq!(
            task_projects_ws_id("/api/v1/workspaces//task-projects"),
            None
        );
        assert_eq!(
            task_projects_ws_id("/api/v1/workspaces/abc/def/task-projects"),
            None
        );
        assert_eq!(
            task_projects_ws_id("/api/v1/workspaces/abc/task-projects/x"),
            None
        );
        assert_eq!(task_projects_ws_id("/api/v1/workspaces/abc"), None);
        // No `v1` segment must not match.
        assert_eq!(
            task_projects_ws_id("/api/workspaces/abc/task-projects"),
            None
        );
        assert_eq!(task_projects_ws_id("/totally/unrelated"), None);
    }

    #[test]
    fn parse_query_reads_compact_flag() {
        let url = "https://x.localhost/api/v1/workspaces/w/task-projects?compact=true";
        assert!(parse_query(Some(url)).compact);

        let url = "https://x.localhost/api/v1/workspaces/w/task-projects?compact=false";
        assert!(!parse_query(Some(url)).compact);

        let url = "https://x.localhost/api/v1/workspaces/w/task-projects";
        assert!(!parse_query(Some(url)).compact);
    }

    #[test]
    fn parse_query_collects_and_dedupes_ids() {
        let id_a = "11111111-1111-4111-8111-111111111111";
        let id_b = "22222222-2222-4222-8222-222222222222";
        let url = format!(
            "https://x.localhost/api/v1/workspaces/w/task-projects?id={id_a}&ids={id_a},{id_b},,{id_b}"
        );
        let parsed = parse_query(Some(&url));
        assert_eq!(
            parsed.requested_ids,
            Ok(vec![id_a.to_owned(), id_b.to_owned()])
        );
    }

    #[test]
    fn parse_query_rejects_invalid_id_filter() {
        let url = "https://x.localhost/api/v1/workspaces/w/task-projects?id=not-a-guid";
        assert_eq!(parse_query(Some(url)).requested_ids, Err(()));
    }

    #[test]
    fn parse_query_no_ids_is_empty() {
        let url = "https://x.localhost/api/v1/workspaces/w/task-projects";
        assert_eq!(parse_query(Some(url)).requested_ids, Ok(Vec::new()));
    }

    #[test]
    fn id_in_filter_builds_postgrest_in_clause() {
        assert_eq!(id_in_filter(&[]), None);
        assert_eq!(
            id_in_filter(&["a".to_owned(), "b".to_owned()]),
            Some("in.(a,b)".to_owned())
        );
    }

    #[test]
    fn is_guid_validates_canonical_uuid() {
        assert!(is_guid("11111111-1111-4111-8111-111111111111"));
        assert!(is_guid("00000000-0000-0000-0000-000000000000"));
        assert!(!is_guid("not-a-guid"));
        assert!(!is_guid("1111111-1111-4111-8111-111111111111"));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_alias() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("my-handle"), "my-handle");
    }

    #[test]
    fn format_project_adds_partition_and_keeps_columns() {
        let project: Value = serde_json::from_str(
            r#"{
                "id": "p1",
                "name": "Project",
                "ws_id": "w1",
                "created_at": "2026-01-01T00:00:00Z",
                "creator": { "id": "u1" },
                "task_project_tasks": [
                    {
                        "task": {
                            "id": "t1",
                            "name": "  Do thing  ",
                            "completed": true,
                            "completed_at": "2026-01-02T00:00:00Z",
                            "closed_at": null,
                            "deleted_at": null,
                            "priority": 1,
                            "task_lists": { "name": "List", "status": "active" }
                        }
                    },
                    {
                        "task": {
                            "id": "t2",
                            "name": "Deleted",
                            "deleted_at": "2026-01-03T00:00:00Z",
                            "task_lists": { "name": "List", "status": "active" }
                        }
                    },
                    {
                        "task": {
                            "id": "d1",
                            "name": "Doc",
                            "completed_at": null,
                            "closed_at": null,
                            "deleted_at": null,
                            "task_lists": { "name": "Docs", "status": "documents" }
                        }
                    }
                ]
            }"#,
        )
        .unwrap();

        let formatted = format_project(project);

        // Original columns preserved.
        assert_eq!(formatted["id"], json!("p1"));
        assert_eq!(formatted["ws_id"], json!("w1"));
        assert_eq!(formatted["created_at"], json!("2026-01-01T00:00:00Z"));
        assert_eq!(formatted["creator"], json!({ "id": "u1" }));

        // Partition fields.
        assert_eq!(formatted["tasksCount"], json!(1));
        assert_eq!(formatted["completedTasksCount"], json!(1));

        let linked_tasks = formatted["linkedTasks"].as_array().unwrap();
        assert_eq!(linked_tasks.len(), 1);
        assert_eq!(linked_tasks[0]["id"], json!("t1"));
        assert_eq!(linked_tasks[0]["name"], json!("Do thing"));
        assert_eq!(linked_tasks[0]["listName"], json!("List"));
        assert_eq!(linked_tasks[0]["listStatus"], json!("active"));

        let linked_documents = formatted["linkedDocuments"].as_array().unwrap();
        assert_eq!(linked_documents.len(), 1);
        assert_eq!(linked_documents[0]["id"], json!("d1"));
        assert_eq!(linked_documents[0]["listStatus"], json!("documents"));
    }

    #[test]
    fn format_project_fills_missing_created_at() {
        let project: Value =
            serde_json::from_str(r#"{ "id": "p1", "name": "P", "created_at": null }"#).unwrap();
        let formatted = format_project(project);
        let created_at = formatted["created_at"].as_str().unwrap();
        assert!(created_at.ends_with('Z'));
        assert!(created_at.contains('T'));
    }

    #[test]
    fn partition_counts_completed_via_closed_at() {
        let links: Value = serde_json::from_str(
            r#"[
                { "task": { "id": "t1", "closed_at": "2026-01-01T00:00:00Z", "deleted_at": null, "task_lists": { "status": "active" } } },
                { "task": { "id": "t2", "completed_at": null, "closed_at": null, "deleted_at": null, "task_lists": { "status": "active" } } }
            ]"#,
        )
        .unwrap();
        let partition = partition_task_project_links(Some(&links));
        assert_eq!(partition.tasks_count, 2);
        assert_eq!(partition.completed_tasks_count, 1);
        assert!(partition.linked_documents.is_empty());
    }

    #[test]
    fn partition_handles_missing_links() {
        let partition = partition_task_project_links(None);
        assert_eq!(partition.tasks_count, 0);
        assert_eq!(partition.completed_tasks_count, 0);
        assert!(partition.linked_tasks.is_empty());
        assert!(partition.linked_documents.is_empty());
    }

    #[test]
    fn map_item_defaults_empty_name() {
        let task: Value = serde_json::from_str(r#"{ "id": "t1", "name": "   " }"#).unwrap();
        let item = map_task_project_linked_item(&task);
        assert_eq!(item["name"], json!("Untitled task"));
        assert_eq!(item["listName"], Value::Null);
        assert_eq!(item["listStatus"], Value::Null);
        assert_eq!(item["priority"], Value::Null);
    }

    #[test]
    fn is_success_matches_2xx_only() {
        assert!(is_success(200));
        assert!(is_success(299));
        assert!(!is_success(300));
        assert!(!is_success(404));
    }
}
