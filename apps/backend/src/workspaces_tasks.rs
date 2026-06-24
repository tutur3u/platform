//! Handler for `GET /api/v1/workspaces/:wsId/tasks`.
//!
//! This is a partial port of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tasks/route.ts`
//! (which delegates to `packages/apis/src/tu-do/tasks/route.ts`).
//!
//! Only the `GET` method is migrated. Every other HTTP method returns `None`
//! so the Cloudflare worker falls through to the still-active Next.js route
//! for un-migrated mutations (POST, etc.).
//!
//! IMPORTANT (see module-level notes in the migration report): the legacy GET
//! handler has many advanced branches (private-schema source-filter RPCs,
//! guest board access, personal-workspace external-task overlays). To keep this
//! port correct-by-construction, those advanced branches are intentionally NOT
//! reimplemented here yet; when the request carries query parameters that would
//! trigger them, this handler returns `None` so the request falls through to
//! the legacy Next.js implementation. The common, dominant path (a workspace
//! member listing tasks for a board/list with relationship summaries and
//! scheduling overlays) is served natively.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACES_TASKS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_TASKS_PATH_SUFFIX: &str = "/tasks";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const DEFAULT_LIMIT: i64 = 100;
const MAX_LIMIT: i64 = 200;

// Embedded PostgREST select that mirrors the legacy `fullSelect`.
const FULL_SELECT: &str = "id,display_number,name,description,priority,completed,completed_at,sort_key,start_date,end_date,estimation_points,created_at,list_id,closed_at,task_lists!inner(id,name,status,color,deleted,board_id,workspace_boards!inner(id,name,ticket_prefix,ws_id,workspaces(name))),assignees:task_assignees(user_id,user:users(id,display_name,avatar_url)),labels:task_labels(label:workspace_task_labels(id,name,color,created_at)),projects:task_project_tasks(project:task_projects(id,name,status))";

// ---------------------------------------------------------------------------
// Row deserialization types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspacePersonalRow {
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct SchedulingSettingsRow {
    task_id: Option<String>,
    total_duration: Option<Value>,
    is_splittable: Option<Value>,
    min_split_duration_minutes: Option<Value>,
    max_split_duration_minutes: Option<Value>,
    calendar_hours: Option<Value>,
    auto_schedule: Option<Value>,
}

#[derive(Deserialize)]
struct RelationshipEdgeRow {
    source_task_id: Option<String>,
    target_task_id: Option<String>,
    #[serde(rename = "type")]
    edge_type: Option<String>,
    id: Option<String>,
}

#[derive(Deserialize)]
struct CounterpartTaskRow {
    id: Option<String>,
    name: Option<String>,
    display_number: Option<Value>,
    completed_at: Option<String>,
    closed_at: Option<String>,
    deleted_at: Option<String>,
    list: Option<CounterpartListRow>,
}

#[derive(Deserialize)]
struct CounterpartListRow {
    board: Option<CounterpartBoardRow>,
}

#[derive(Deserialize)]
struct CounterpartBoardRow {
    name: Option<String>,
    ticket_prefix: Option<String>,
    ws_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_tasks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_tasks_ws_id(request.path)?;

    // Only GET is migrated. For any other method, return None so the worker
    // falls through to the still-active Next.js route (POST etc.).
    match request.method {
        "GET" => {}
        _ => return None,
    }

    // If the request uses any of the advanced branches that are not yet ported,
    // bail to the legacy route by returning None.
    let url = request.url.and_then(|url| url::Url::parse(url).ok());
    if requires_legacy_fallback(url.as_ref()) {
        return None;
    }

    tasks_response(config, request, raw_ws_id, url.as_ref(), outbound).await
}

/// Returns `true` when the request exercises a legacy-only code path that is not
/// reimplemented in this native handler, so it should fall through to Next.js.
fn requires_legacy_fallback(url: Option<&url::Url>) -> bool {
    // Source-scope other than the default `all_visible`, source filters, the
    // RPC-only filters, list counts, time-tracking projections, and the
    // personal-external overlay all require legacy behavior. We conservatively
    // fall back whenever any of these are present.
    let triggers = [
        "sourceScope",
        "sourceWorkspaceIds",
        "sourceBoardIds",
        "includeListCounts",
        "labelIds",
        "assigneeIds",
        "projectIds",
        "priorities",
        "includeUnassigned",
        "sortBy",
        "forTimeTracking",
        "listStatuses",
        "externalIncludeDocuments",
        "externalIncludeDoneClosed",
        // The `assignedToMe` projection uses a `!inner` assignment embed that
        // differs from FULL_SELECT; defer to the legacy route for it.
        "assignedToMe",
    ];

    let Some(url) = url else {
        // Without a parseable URL we cannot inspect query parameters; fall back
        // to the legacy route which has the full implementation.
        return true;
    };

    for (name, value) in url.query_pairs() {
        if value.is_empty() {
            continue;
        }
        // `assignedToMe` only changes behavior when it equals "true"; any other
        // value is treated as the default (false) by the legacy route, so it
        // must not force a fallback.
        if name == "assignedToMe" {
            if value == "true" {
                return true;
            }
            continue;
        }
        if triggers.contains(&name.as_ref()) {
            return true;
        }
    }

    false
}

async fn tasks_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    url: Option<&url::Url>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Some(error_response(401, "Unauthorized"));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Some(error_response(401, "Unauthorized"));
    };

    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return Some(error_response(500, "Failed to verify workspace membership")),
        };

    let board_id = query_value(url, "boardId");
    let list_id = query_value(url, "listId");

    // Membership verification (mirrors verifyWorkspaceMembershipType).
    match verify_workspace_member(contact_data, outbound, &normalized_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => {
            if board_id.is_none() && list_id.is_none() {
                // Non-member with no board/list scope: denied (same as legacy).
                return Some(error_response(403, "Workspace access denied"));
            }
            // Non-member WITH board/list scope: the legacy route resolves guest
            // board access. That path is not ported natively, so defer to the
            // Next.js implementation by returning None.
            return None;
        }
        Err(()) => return Some(error_response(500, "Failed to verify workspace membership")),
    }

    // Validate workspace + detect personal workspace.
    let is_personal_workspace =
        match workspace_is_personal(contact_data, outbound, &normalized_ws_id).await {
            Ok(value) => value,
            Err(()) => return Some(error_response(500, "Failed to validate workspace")),
        };

    // The personal-workspace external-task overlay (placements + default
    // external tasks) only kicks in for a personal workspace scoped to a
    // board/list. That overlay is not ported natively, so defer to the legacy
    // route to avoid returning an incomplete task set.
    if is_personal_workspace && (board_id.is_some() || list_id.is_some()) {
        return None;
    }

    // Parse pagination + simple filters.
    let limit = parse_limit(query_value(url, "limit").as_deref());
    let offset = parse_offset(query_value(url, "offset").as_deref());
    let search_query = query_value(url, "q")
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty());
    let include_count = query_value(url, "includeCount").as_deref() == Some("true");
    let include_relationship_summary =
        query_value(url, "includeRelationshipSummary").as_deref() != Some("false");
    let include_deleted_param = query_value(url, "includeDeleted");
    let include_deleted_mode = match include_deleted_param.as_deref() {
        Some("only") => IncludeDeleted::Only,
        Some("all") => IncludeDeleted::All,
        _ => IncludeDeleted::None,
    };
    let completed_mode = query_value(url, "completed");
    let closed_mode = query_value(url, "closed");
    let has_due_date = query_value(url, "hasDueDate").as_deref() == Some("true");
    let include_archived_boards =
        query_value(url, "includeArchivedBoards").as_deref() == Some("true");
    let due_date_from = query_value(url, "dueDateFrom")
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty());
    let due_date_to = query_value(url, "dueDateTo")
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty());
    let estimation_min = parse_estimation_bound(query_value(url, "estimationMin").as_deref());
    let estimation_max = parse_estimation_bound(query_value(url, "estimationMax").as_deref());

    // Build the tasks query parameters.
    let mut params: Vec<(&str, String)> = vec![
        ("select", FULL_SELECT.to_owned()),
        (
            "task_lists.workspace_boards.ws_id",
            format!("eq.{normalized_ws_id}"),
        ),
        (
            "task_lists.workspace_boards.deleted_at",
            "is.null".to_owned(),
        ),
    ];

    match include_deleted_mode {
        IncludeDeleted::None => {
            params.push(("deleted_at", "is.null".to_owned()));
            params.push(("task_lists.deleted", "eq.false".to_owned()));
        }
        IncludeDeleted::Only => {
            params.push(("deleted_at", "not.is.null".to_owned()));
        }
        IncludeDeleted::All => {}
    }

    if !include_archived_boards {
        params.push((
            "task_lists.workspace_boards.archived_at",
            "is.null".to_owned(),
        ));
    }

    match completed_mode.as_deref() {
        Some("exclude") => params.push(("completed_at", "is.null".to_owned())),
        Some("only") => params.push(("completed_at", "not.is.null".to_owned())),
        _ => {}
    }

    match closed_mode.as_deref() {
        Some("exclude") => params.push(("closed_at", "is.null".to_owned())),
        Some("only") => params.push(("closed_at", "not.is.null".to_owned())),
        _ => {}
    }

    if has_due_date {
        params.push(("end_date", "not.is.null".to_owned()));
    }
    if let Some(from) = &due_date_from {
        params.push(("end_date", format!("gte.{from}")));
    }
    if let Some(to) = &due_date_to {
        params.push(("end_date", format!("lte.{to}")));
    }
    if let Some(min) = estimation_min {
        params.push(("estimation_points", format!("gte.{min}")));
    }
    if let Some(max) = estimation_max {
        params.push(("estimation_points", format!("lte.{max}")));
    }

    // NOTE: `assignedToMe=true` is filtered out earlier via the legacy-fallback
    // gate (it needs a `!inner` assignment embed not present in FULL_SELECT).

    if let Some(list) = &list_id {
        params.push(("list_id", format!("eq.{list}")));
    } else if let Some(board) = &board_id {
        params.push(("task_lists.board_id", format!("eq.{board}")));
    }

    if let Some(search) = &search_query {
        params.push(("name", format!("ilike.%{}%", sanitize_ilike_term(search))));
    }

    // Ordering + pagination.
    params.push(("order", "sort_key.asc.nullslast,created_at.desc".to_owned()));
    if limit > 0 {
        params.push(("limit", limit.to_string()));
        params.push(("offset", offset.to_string()));
    } else {
        // limit === 0 in legacy means an empty page.
        params.push(("limit", "0".to_owned()));
        params.push(("offset", offset.to_string()));
    }

    let Some(rest_url) = contact_data.rest_url("tasks", &params) else {
        return Some(error_response(500, "Internal server error"));
    };

    let response =
        match send_service_role_get(contact_data, outbound, &rest_url, include_count).await {
            Ok(response) => response,
            Err(()) => return Some(error_response(500, "Internal server error")),
        };

    if !(200..300).contains(&response.status) {
        return Some(error_response(500, "Internal server error"));
    }

    let count = if include_count {
        parse_content_range_count(&response)
    } else {
        None
    };

    let raw_tasks: Vec<Value> = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return Some(error_response(500, "Internal server error")),
    };

    let task_count = count.unwrap_or(raw_tasks.len() as i64);

    // Normalize each task to the legacy shape.
    let mut tasks: Vec<Value> = raw_tasks.iter().map(normalize_task).collect();

    // Collect task ids for overlays.
    let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|task| task.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    // Scheduling-settings overlay (per-user).
    match load_scheduling_settings(contact_data, outbound, &task_ids, &user_id).await {
        Ok(settings) => apply_scheduling_settings(&mut tasks, &settings),
        Err(()) => {
            return Some(error_response(
                500,
                "Failed to load task scheduling settings",
            ));
        }
    }

    // Relationship summary overlay.
    if include_relationship_summary {
        match build_relationship_summary(contact_data, outbound, &normalized_ws_id, &task_ids).await
        {
            Ok(summaries) => apply_relationship_summary(&mut tasks, &summaries),
            Err(()) => return Some(error_response(500, "Failed to load task relationships")),
        }
    }

    // board_id/board_name/ticket_prefix are already surfaced by normalize_task.

    let mut body = serde_json::Map::new();
    body.insert("tasks".to_owned(), Value::Array(tasks));
    if include_count {
        body.insert("count".to_owned(), json!(task_count));
    }

    Some(no_store_response(json_response(200, Value::Object(body))))
}

// ---------------------------------------------------------------------------
// Workspace resolution + membership (ported from the habits-access reference)
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
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
            return Ok(resolved);
        }
        if let Some(ws_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(ws_id);
        }
        if let Some(ws_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(ws_id);
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
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
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

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
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

async fn workspace_is_personal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "personal".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<WorkspacePersonalRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.personal)
        .unwrap_or(false))
}

// ---------------------------------------------------------------------------
// Scheduling settings overlay
// ---------------------------------------------------------------------------

async fn load_scheduling_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_ids: &[String],
    user_id: &str,
) -> Result<Vec<SchedulingSettingsRow>, ()> {
    let unique: Vec<&str> = dedup_str(task_ids);
    if unique.is_empty() {
        return Ok(Vec::new());
    }
    let Some(url) = contact_data.rest_url(
        "task_user_scheduling_settings",
        &[
            (
                "select",
                "task_id,total_duration,is_splittable,min_split_duration_minutes,max_split_duration_minutes,calendar_hours,auto_schedule".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("task_id", format!("in.({})", unique.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response
        .json::<Vec<SchedulingSettingsRow>>()
        .map_err(|_| ())
}

fn apply_scheduling_settings(tasks: &mut [Value], settings: &[SchedulingSettingsRow]) {
    if settings.is_empty() {
        return;
    }
    for task in tasks.iter_mut() {
        let Some(task_id) = task.get("id").and_then(Value::as_str) else {
            continue;
        };
        let Some(row) = settings
            .iter()
            .find(|row| row.task_id.as_deref() == Some(task_id))
        else {
            continue;
        };
        let Some(map) = task.as_object_mut() else {
            continue;
        };
        map.insert(
            "total_duration".to_owned(),
            row.total_duration.clone().unwrap_or(Value::Null),
        );
        map.insert(
            "is_splittable".to_owned(),
            row.is_splittable.clone().unwrap_or(Value::Null),
        );
        map.insert(
            "min_split_duration_minutes".to_owned(),
            row.min_split_duration_minutes
                .clone()
                .unwrap_or(Value::Null),
        );
        map.insert(
            "max_split_duration_minutes".to_owned(),
            row.max_split_duration_minutes
                .clone()
                .unwrap_or(Value::Null),
        );
        map.insert(
            "calendar_hours".to_owned(),
            row.calendar_hours.clone().unwrap_or(Value::Null),
        );
        map.insert(
            "auto_schedule".to_owned(),
            row.auto_schedule.clone().unwrap_or(Value::Null),
        );
    }
}

// ---------------------------------------------------------------------------
// Relationship summary overlay
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Serialize)]
struct RelationshipSummary {
    parent_task_id: Option<String>,
    parent_task: Option<Value>,
    child_count: i64,
    completed_child_count: i64,
    blocked_by_count: i64,
    blocking_count: i64,
    related_count: i64,
}

async fn load_relationship_edges(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    column: &str,
    task_ids: &[String],
) -> Result<Vec<RelationshipEdgeRow>, ()> {
    let mut edges = Vec::new();
    for chunk in task_ids.chunks(200) {
        let in_list = chunk
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(",");
        let Some(url) = contact_data.rest_url(
            "task_relationships",
            &[
                ("select", "id,source_task_id,target_task_id,type".to_owned()),
                (column, format!("in.({in_list})")),
            ],
        ) else {
            return Err(());
        };
        let response = send_service_role_get(contact_data, outbound, &url, false).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        edges.extend(
            response
                .json::<Vec<RelationshipEdgeRow>>()
                .map_err(|_| ())?,
        );
    }
    Ok(edges)
}

async fn build_relationship_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    task_ids: &[String],
) -> Result<std::collections::HashMap<String, RelationshipSummary>, ()> {
    use std::collections::{HashMap, HashSet};

    let mut summaries: HashMap<String, RelationshipSummary> = task_ids
        .iter()
        .map(|id| (id.clone(), RelationshipSummary::default()))
        .collect();

    if task_ids.is_empty() {
        return Ok(summaries);
    }

    let mut edges =
        load_relationship_edges(contact_data, outbound, "source_task_id", task_ids).await?;
    edges
        .extend(load_relationship_edges(contact_data, outbound, "target_task_id", task_ids).await?);

    let counterpart_ids: Vec<String> = {
        let mut set = HashSet::new();
        for edge in &edges {
            if let Some(id) = &edge.source_task_id {
                set.insert(id.clone());
            }
            if let Some(id) = &edge.target_task_id {
                set.insert(id.clone());
            }
        }
        set.into_iter().collect()
    };

    let mut valid_counterparts: HashSet<String> = HashSet::new();
    let mut counterpart_summary: HashMap<String, Value> = HashMap::new();
    let mut completed_counterparts: HashSet<String> = HashSet::new();

    for chunk in counterpart_ids.chunks(200) {
        let in_list = chunk
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(",");
        let Some(url) = contact_data.rest_url(
            "tasks",
            &[
                (
                    "select",
                    "id,name,display_number,completed_at,closed_at,deleted_at,list:task_lists(board:workspace_boards(name,ticket_prefix,ws_id))".to_owned(),
                ),
                ("id", format!("in.({in_list})")),
            ],
        ) else {
            return Err(());
        };
        let response = send_service_role_get(contact_data, outbound, &url, false).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        let rows = response.json::<Vec<CounterpartTaskRow>>().map_err(|_| ())?;
        for row in rows {
            let Some(id) = row.id.clone() else {
                continue;
            };
            let board = row.list.as_ref().and_then(|l| l.board.as_ref());
            let ws_match = board.and_then(|b| b.ws_id.as_deref()) == Some(workspace_id);
            if row.deleted_at.is_none() && ws_match {
                valid_counterparts.insert(id.clone());
                counterpart_summary.insert(
                    id.clone(),
                    json!({
                        "id": id,
                        "name": row.name.clone().unwrap_or_default(),
                        "display_number": row.display_number.clone().unwrap_or(Value::Null),
                        "ticket_prefix": board.and_then(|b| b.ticket_prefix.clone()),
                    }),
                );
                if row.completed_at.is_some() || row.closed_at.is_some() {
                    completed_counterparts.insert(id.clone());
                }
            }
            // `name` is consumed above via clone; keep board name available if needed later.
            let _ = board.and_then(|b| b.name.as_deref());
        }
    }

    let mut processed: HashSet<String> = HashSet::new();
    for edge in &edges {
        let (Some(source), Some(target), Some(edge_type)) = (
            edge.source_task_id.clone(),
            edge.target_task_id.clone(),
            edge.edge_type.clone(),
        ) else {
            continue;
        };
        let key = edge
            .id
            .clone()
            .unwrap_or_else(|| format!("{source}:{target}:{edge_type}"));
        if !processed.insert(key) {
            continue;
        }

        let source_counterpart_valid = valid_counterparts.contains(&target);
        let target_counterpart_valid = valid_counterparts.contains(&source);

        match edge_type.as_str() {
            "parent_child" => {
                if source_counterpart_valid {
                    if let Some(s) = summaries.get_mut(&source) {
                        s.child_count += 1;
                        if completed_counterparts.contains(&target) {
                            s.completed_child_count += 1;
                        }
                    }
                }
                if target_counterpart_valid {
                    if let Some(t) = summaries.get_mut(&target) {
                        if t.parent_task_id.is_none() {
                            t.parent_task_id = Some(source.clone());
                            t.parent_task = counterpart_summary.get(&source).cloned();
                        }
                    }
                }
            }
            "blocks" => {
                if source_counterpart_valid {
                    if let Some(s) = summaries.get_mut(&source) {
                        s.blocking_count += 1;
                    }
                }
                if target_counterpart_valid {
                    if let Some(t) = summaries.get_mut(&target) {
                        t.blocked_by_count += 1;
                    }
                }
            }
            "related" => {
                if source_counterpart_valid {
                    if let Some(s) = summaries.get_mut(&source) {
                        s.related_count += 1;
                    }
                }
                if target_counterpart_valid {
                    if let Some(t) = summaries.get_mut(&target) {
                        t.related_count += 1;
                    }
                }
            }
            _ => {}
        }
    }

    Ok(summaries)
}

fn apply_relationship_summary(
    tasks: &mut [Value],
    summaries: &std::collections::HashMap<String, RelationshipSummary>,
) {
    for task in tasks.iter_mut() {
        let Some(task_id) = task.get("id").and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        let summary = summaries.get(&task_id);
        let Some(map) = task.as_object_mut() else {
            continue;
        };
        map.insert(
            "relationship_summary".to_owned(),
            json!({
                "parent_task_id": summary.and_then(|s| s.parent_task_id.clone()),
                "parent_task": summary.and_then(|s| s.parent_task.clone()),
                "child_count": summary.map(|s| s.child_count).unwrap_or(0),
                "completed_child_count": summary.map(|s| s.completed_child_count).unwrap_or(0),
                "blocked_by_count": summary.map(|s| s.blocked_by_count).unwrap_or(0),
                "blocking_count": summary.map(|s| s.blocking_count).unwrap_or(0),
                "related_count": summary.map(|s| s.related_count).unwrap_or(0),
            }),
        );
    }
}

// ---------------------------------------------------------------------------
// Task normalization (mirrors get-tasks-helpers normalizeTask)
// ---------------------------------------------------------------------------

fn normalize_task(task: &Value) -> Value {
    let mut out = task.clone();
    let Some(map) = out.as_object_mut() else {
        return out;
    };

    // Assignees.
    let mut assignees = Vec::new();
    let mut assignee_ids = Vec::new();
    if let Some(arr) = task.get("assignees").and_then(Value::as_array) {
        for entry in arr {
            let user = entry.get("user");
            let resolved = user
                .and_then(|u| u.get("id"))
                .and_then(Value::as_str)
                .or_else(|| entry.get("user_id").and_then(Value::as_str));
            let Some(resolved) = resolved else {
                continue;
            };
            if !assignee_ids.iter().any(|id: &String| id == resolved) {
                assignee_ids.push(resolved.to_owned());
            }
            assignees.push(json!({
                "id": resolved,
                "user_id": resolved,
                "display_name": user.and_then(|u| u.get("display_name")).cloned().unwrap_or(Value::Null),
                "avatar_url": user.and_then(|u| u.get("avatar_url")).cloned().unwrap_or(Value::Null),
            }));
        }
    }

    // Labels.
    let mut labels = Vec::new();
    let mut label_ids = Vec::new();
    if let Some(arr) = task.get("labels").and_then(Value::as_array) {
        for entry in arr {
            let label = entry.get("label");
            let Some(id) = label.and_then(|l| l.get("id")).and_then(Value::as_str) else {
                continue;
            };
            if !label_ids.iter().any(|x: &String| x == id) {
                label_ids.push(id.to_owned());
            }
            labels.push(json!({
                "id": id,
                "name": label.and_then(|l| l.get("name")).cloned().unwrap_or(Value::Null),
                "color": label.and_then(|l| l.get("color")).cloned().unwrap_or(Value::Null),
                "created_at": label.and_then(|l| l.get("created_at")).cloned().unwrap_or(Value::Null),
            }));
        }
    }

    // Projects.
    let mut projects = Vec::new();
    let mut project_ids = Vec::new();
    if let Some(arr) = task.get("projects").and_then(Value::as_array) {
        for entry in arr {
            let project = entry.get("project");
            let Some(id) = project.and_then(|p| p.get("id")).and_then(Value::as_str) else {
                continue;
            };
            if !project_ids.iter().any(|x: &String| x == id) {
                project_ids.push(id.to_owned());
            }
            projects.push(json!({
                "id": id,
                "name": project.and_then(|p| p.get("name")).cloned().unwrap_or(Value::Null),
                "status": project.and_then(|p| p.get("status")).cloned().unwrap_or(Value::Null),
            }));
        }
    }

    // task_lists-derived fields.
    let task_lists = task.get("task_lists");
    let list_deleted = task_lists
        .and_then(|l| l.get("deleted"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let board_id = task_lists
        .and_then(|l| l.get("board_id"))
        .cloned()
        .unwrap_or(Value::Null);
    let boards = task_lists.and_then(|l| l.get("workspace_boards"));
    let board_name = boards
        .and_then(|b| b.get("name"))
        .cloned()
        .unwrap_or(Value::Null);
    let ticket_prefix = boards
        .and_then(|b| b.get("ticket_prefix"))
        .cloned()
        .unwrap_or(Value::Null);

    map.insert("assignees".to_owned(), Value::Array(assignees));
    map.insert("labels".to_owned(), Value::Array(labels));
    map.insert("projects".to_owned(), Value::Array(projects));
    map.insert(
        "assignee_ids".to_owned(),
        Value::Array(assignee_ids.into_iter().map(Value::String).collect()),
    );
    map.insert(
        "label_ids".to_owned(),
        Value::Array(label_ids.into_iter().map(Value::String).collect()),
    );
    map.insert(
        "project_ids".to_owned(),
        Value::Array(project_ids.into_iter().map(Value::String).collect()),
    );
    map.insert("list_deleted".to_owned(), Value::Bool(list_deleted));
    map.insert("board_id".to_owned(), board_id);
    map.insert("board_name".to_owned(), board_name);
    map.insert("ticket_prefix".to_owned(), ticket_prefix);

    out
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    exact_count: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if exact_count {
        request = request.with_header("Prefer", "count=exact");
    }
    outbound.send(request).await.map_err(|_| ())
}

async fn send_caller_get(
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

fn parse_content_range_count(response: &OutboundResponse) -> Option<i64> {
    // PostgREST returns the total count in the `content-range` header as
    // `start-end/total` when Prefer: count=exact is set.
    response
        .header("content-range")
        .and_then(|value| value.rsplit('/').next())
        .and_then(|total| total.trim().parse::<i64>().ok())
}

// ---------------------------------------------------------------------------
// Query parsing helpers
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum IncludeDeleted {
    None,
    Only,
    All,
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

fn parse_limit(value: Option<&str>) -> i64 {
    match value {
        Some("0") => 0,
        Some(raw) => match raw.trim().parse::<i64>() {
            Ok(parsed) if parsed > 0 => parsed.min(MAX_LIMIT),
            _ => DEFAULT_LIMIT,
        },
        None => DEFAULT_LIMIT,
    }
}

fn parse_offset(value: Option<&str>) -> i64 {
    match value.and_then(|raw| raw.trim().parse::<i64>().ok()) {
        Some(parsed) if parsed >= 0 => parsed,
        _ => 0,
    }
}

fn parse_estimation_bound(value: Option<&str>) -> Option<i64> {
    let raw = value?;
    if raw.is_empty() {
        return None;
    }
    match raw.trim().parse::<i64>() {
        Ok(parsed) if parsed >= 0 => Some(parsed),
        _ => None,
    }
}

fn sanitize_ilike_term(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|character| !matches!(character, ',' | '(' | ')'))
        .collect()
}

fn dedup_str(values: &[String]) -> Vec<&str> {
    let mut seen = std::collections::HashSet::new();
    values
        .iter()
        .filter(|value| !value.is_empty())
        .filter_map(|value| seen.insert(value.as_str()).then_some(value.as_str()))
        .collect()
}

// ---------------------------------------------------------------------------
// Path + workspace-id helpers
// ---------------------------------------------------------------------------

fn workspaces_tasks_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_TASKS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_TASKS_PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

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
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
