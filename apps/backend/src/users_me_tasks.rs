//! Port of the legacy `GET /api/v1/users/me/tasks` route
//! (`apps/web/src/app/api/v1/users/me/tasks/route.ts`).
//!
//! The legacy route is a `withSessionAuth` GET that also allows the `tasks`
//! app-session (`allowAppSessionAuth: { targetApp: 'tasks' }`). It performs a
//! single consolidated `get_user_tasks_with_relations` RPC plus a
//! `user_board_list_overrides` read, then reshapes the rows to the
//! `TaskWithRelations` shape, applies personal overrides, splits hidden tasks,
//! categorizes into overdue/today/upcoming/completed buckets, and paginates the
//! completed bucket. The JSON response shape and status codes are matched
//! exactly.
//!
//! Static path: dispatched by exact `("GET", "/api/v1/users/me/tasks")`
//! equality.

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const USERS_ME_TASKS_PATH: &str = "/api/v1/users/me/tasks";
const TASKS_APP_SESSION_TARGET: &str = "tasks";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_TASKS_FAILED_MESSAGE: &str = "Failed to fetch tasks";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const TASKS_RELATIONS_RPC: &str = "get_user_tasks_with_relations";

// --- workspace-id normalization constants (mirrors @tuturuuu/utils
//     normalizeWorkspaceId / resolveWorkspaceId) ----------------------------
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

/// Authorization used for the supabase reads. When the caller authenticated via
/// a supabase session we use their access token (RLS-scoped, mirroring the
/// legacy session client). When the caller authenticated via the `tasks`
/// app-session there is no access token, so we fall back to the service-role
/// key (the RPC is parameterized by `p_user_id`, so it remains user-scoped).
enum DataAuth {
    AccessToken(String),
    ServiceRole,
}

pub(crate) async fn handle_users_me_tasks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != USERS_ME_TASKS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => tasks_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tasks_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Resolve the authenticated user (supabase session OR `tasks` app-session).
    let (user_id, data_auth) = match resolve_authenticated_user(config, request, outbound).await {
        Some(resolved) => resolved,
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    // --- Parse query params --------------------------------------------------
    let url = request.url.and_then(|raw| url::Url::parse(raw).ok());
    let ws_id = single_query_value(url.as_ref(), "wsId");
    let is_personal = single_query_value(url.as_ref(), "isPersonal").as_deref() == Some("true");

    // normalizedWsId = (!isPersonal && wsId) ? await normalizeWorkspaceId(wsId) : undefined
    let normalized_ws_id = if !is_personal {
        match ws_id.as_deref().filter(|value| !value.is_empty()) {
            Some(raw_ws_id) => match normalize_workspace_id(
                &config.contact_data,
                outbound,
                raw_ws_id,
                &user_id,
                &data_auth,
            )
            .await
            {
                Ok(resolved) => Some(resolved),
                // The legacy `normalizeWorkspaceId` throws on lookup failure,
                // which the outer try/catch maps to a 500 internal error.
                Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
            },
            None => None,
        }
    } else {
        None
    };

    let filter_ws_ids = all_query_values(url.as_ref(), "filterWsId");
    let filter_board_ids = all_query_values(url.as_ref(), "filterBoardId");
    let filter_label_ids = all_query_values(url.as_ref(), "filterLabelId");
    let filter_project_ids = all_query_values(url.as_ref(), "filterProjectId");
    let self_managed_only =
        single_query_value(url.as_ref(), "selfManagedOnly").as_deref() == Some("true");

    let completed_page = single_query_value(url.as_ref(), "completedPage")
        .and_then(|value| parse_int(&value))
        .unwrap_or(0);
    let completed_limit = single_query_value(url.as_ref(), "completedLimit")
        .and_then(|value| parse_int(&value))
        .unwrap_or(20);

    // --- RPC + overrides reads (legacy runs these in parallel) ---------------
    let rpc_tasks = match fetch_tasks_with_relations(
        &config.contact_data,
        outbound,
        &data_auth,
        &user_id,
        normalized_ws_id.as_deref(),
        &filter_ws_ids,
        &filter_board_ids,
        &filter_label_ids,
        &filter_project_ids,
        self_managed_only,
    )
    .await
    {
        Ok(rows) => rows,
        // Legacy: `rpcResult.error` -> 500 "Failed to fetch tasks".
        Err(()) => return message_response(500, FETCH_TASKS_FAILED_MESSAGE),
    };

    // Legacy: empty RPC result short-circuits to a minimal payload (note: this
    // branch intentionally omits `completed`, `totalCompletedTasks`,
    // `hasMoreCompleted`, and `completedPage`).
    if rpc_tasks.is_empty() {
        return message_response_value(
            200,
            json!({
                "overdue": [],
                "today": [],
                "upcoming": [],
                "totalActiveTasks": 0,
            }),
        );
    }

    // Legacy reads `user_board_list_overrides` regardless; a failure yields an
    // empty list (`?? []`).
    let board_list_overrides =
        fetch_board_list_overrides(&config.contact_data, outbound, &data_auth, &user_id)
            .await
            .unwrap_or_default();

    // --- Map RPC rows -> TaskWithRelations-shaped values ---------------------
    let all_tasks: Vec<Value> = rpc_tasks
        .iter()
        .map(|row| map_rpc_row(row, &user_id))
        .collect();

    // --- Split active vs personally-hidden -----------------------------------
    let mut tasks: Vec<Value> = Vec::new();
    let mut personally_hidden: Vec<Value> = Vec::new();
    for task in all_tasks {
        if is_personally_hidden(&task, &board_list_overrides) {
            personally_hidden.push(task);
        } else {
            tasks.push(task);
        }
    }

    // --- Time boundaries (server-local == UTC on this runtime) ---------------
    let now_millis = current_millis();
    let now_iso = millis_to_iso8601(now_millis);
    let (today_start_millis, today_end_millis) = day_bounds(now_millis, 0);
    let (_next_week_start, next_week_end_millis) = day_bounds(now_millis, 7);

    let active_status = |task: &Value| -> bool {
        matches!(list_status(task), Some("not_started") | Some("active"))
    };

    // overdue: end_date && end_date < now && status in {not_started, active}
    let mut overdue: Vec<Value> = tasks
        .iter()
        .filter(|task| {
            end_date_millis(task)
                .map(|end| end < now_millis)
                .unwrap_or(false)
                && active_status(task)
        })
        .cloned()
        .collect();
    sort_by_end_date_asc(&mut overdue);

    // today: end_date >= todayStart && end_date <= todayEnd && end_date >= now
    let mut today_tasks: Vec<Value> = tasks
        .iter()
        .filter(|task| {
            end_date_millis(task)
                .map(|end| {
                    end >= today_start_millis && end <= today_end_millis && end >= now_millis
                })
                .unwrap_or(false)
                && active_status(task)
        })
        .cloned()
        .collect();
    sort_by_end_date_asc(&mut today_tasks);

    // upcomingWithDate: end_date > todayEnd && end_date <= nextWeekEnd
    let mut upcoming_with_date: Vec<Value> = tasks
        .iter()
        .filter(|task| {
            end_date_millis(task)
                .map(|end| end > today_end_millis && end <= next_week_end_millis)
                .unwrap_or(false)
                && active_status(task)
        })
        .cloned()
        .collect();
    sort_by_end_date_asc(&mut upcoming_with_date);

    // noDueDate: !end_date && status in {not_started, active}
    let mut no_due_date: Vec<Value> = tasks
        .iter()
        .filter(|task| end_date_str(task).is_none() && active_status(task))
        .cloned()
        .collect();
    sort_no_due_date(&mut no_due_date);

    let mut upcoming = upcoming_with_date;
    upcoming.extend(no_due_date);

    let total_active_tasks = overdue.len() + today_tasks.len() + upcoming.len();

    // --- Completed bucket: list-level review/done + personally hidden --------
    let mut completed: Vec<Value> = tasks
        .iter()
        .filter(|task| matches!(list_status(task), Some("review") | Some("done")))
        .cloned()
        .collect();
    completed.extend(personally_hidden);
    sort_by_created_at_desc(&mut completed);

    let total_completed = completed.len();
    let completed_start = completed_page.max(0) as usize * completed_limit.max(0) as usize;
    let paginated_completed: Vec<Value> = completed
        .iter()
        .skip(completed_start)
        .take(completed_limit.max(0) as usize)
        .cloned()
        .collect();
    let has_more_completed = (completed_start + completed_limit.max(0) as usize) < total_completed;

    let _ = now_iso; // legacy `now` is only used for comparisons above.

    message_response_value(
        200,
        json!({
            "overdue": overdue,
            "today": today_tasks,
            "upcoming": upcoming,
            "completed": paginated_completed,
            "totalActiveTasks": total_active_tasks,
            "totalCompletedTasks": total_completed,
            "hasMoreCompleted": has_more_completed,
            "completedPage": completed_page,
        }),
    )
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async fn resolve_authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<(String, DataAuth)> {
    // Legacy `allowAppSessionAuth: { targetApp: 'tasks' }`.
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &[TASKS_APP_SESSION_TARGET])
                .ok()?;
        let user_id = if identity.id.trim().is_empty() {
            return None;
        } else {
            identity.id
        };
        return Some((user_id, DataAuth::ServiceRole));
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user_id =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))?;

    Some((user_id, DataAuth::AccessToken(access_token)))
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn fetch_tasks_with_relations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    data_auth: &DataAuth,
    user_id: &str,
    normalized_ws_id: Option<&str>,
    filter_ws_ids: &[String],
    filter_board_ids: &[String],
    filter_label_ids: &[String],
    filter_project_ids: &[String],
    self_managed_only: bool,
) -> Result<Vec<Value>, ()> {
    let url = contact_data.rpc_url(TASKS_RELATIONS_RPC).ok_or(())?;

    // Build the RPC argument object. Keys whose legacy value is `undefined`
    // (omitted by supabase-js) are not included so the SQL defaults apply.
    let mut args = Map::new();
    args.insert("p_user_id".to_owned(), json!(user_id));
    if let Some(ws_id) = normalized_ws_id {
        args.insert("p_ws_id".to_owned(), json!(ws_id));
    }
    args.insert("p_include_deleted".to_owned(), json!(false));
    args.insert(
        "p_list_statuses".to_owned(),
        json!(["not_started", "active", "review", "done"]),
    );
    args.insert("p_exclude_personally_completed".to_owned(), json!(false));
    args.insert("p_exclude_personally_unassigned".to_owned(), json!(false));
    if !filter_ws_ids.is_empty() {
        args.insert("p_filter_ws_ids".to_owned(), json!(filter_ws_ids));
    }
    if !filter_board_ids.is_empty() {
        args.insert("p_filter_board_ids".to_owned(), json!(filter_board_ids));
    }
    if !filter_label_ids.is_empty() {
        args.insert("p_filter_label_ids".to_owned(), json!(filter_label_ids));
    }
    if !filter_project_ids.is_empty() {
        args.insert("p_filter_project_ids".to_owned(), json!(filter_project_ids));
    }
    args.insert(
        "p_filter_self_managed_only".to_owned(),
        json!(self_managed_only),
    );

    let body = Value::Object(args).to_string();
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        data_auth,
        Some(&body),
    )
    .await?;

    if !is_success(response.status) {
        return Err(());
    }

    // A set-returning RPC returns a JSON array of rows.
    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn fetch_board_list_overrides(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    data_auth: &DataAuth,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "user_board_list_overrides",
            &[
                ("select", "*".to_owned()),
                ("user_id", format!("eq.{user_id}")),
            ],
        )
        .ok_or(())?;
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        data_auth,
        None,
    )
    .await?;

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    data_auth: &DataAuth,
    body: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match data_auth {
        DataAuth::AccessToken(token) => format!("Bearer {token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(body) = body {
        request = request
            .with_header("Content-Type", APPLICATION_JSON)
            .with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Row mapping (mirrors RpcTaskRow -> TaskWithRelations + resolveEffectiveValues)
// ---------------------------------------------------------------------------

fn map_rpc_row(row: &Value, user_id: &str) -> Value {
    // override is non-null when row.override_self_managed != null.
    let override_self_managed = row.get("override_self_managed");
    let has_override = override_self_managed
        .map(|value| !value.is_null())
        .unwrap_or(false);

    let override_value = if has_override {
        Some(json!({
            "task_id": clone_field(row, "task_id"),
            "user_id": user_id,
            "self_managed": clone_field(row, "override_self_managed"),
            "completed_at": clone_field(row, "override_completed_at"),
            "priority_override": clone_field(row, "override_priority_override"),
            "due_date_override": clone_field(row, "override_due_date_override"),
            "estimation_override": clone_field(row, "override_estimation_override"),
            "personally_unassigned": bool_or_false(row, "override_personally_unassigned"),
            "notes": clone_field(row, "override_notes"),
            "personal_board_id": clone_field(row, "override_personal_board_id"),
            "personal_list_id": clone_field(row, "override_personal_list_id"),
            "personal_sort_key": clone_field(row, "override_personal_sort_key"),
            "personal_added_at": clone_field(row, "override_personal_added_at"),
            "personal_placed_at": clone_field(row, "override_personal_placed_at"),
            "created_at": "",
            "updated_at": "",
        }))
    } else {
        None
    };

    // scheduling object (empty {} when all three sched_* are null).
    let mut base = Map::new();
    base.insert("id".to_owned(), clone_field(row, "task_id"));
    base.insert("name".to_owned(), string_or_empty(row, "task_name"));
    base.insert(
        "description".to_owned(),
        clone_field(row, "task_description"),
    );
    base.insert("creator_id".to_owned(), clone_field(row, "task_creator_id"));
    base.insert("list_id".to_owned(), clone_field(row, "task_list_id"));
    base.insert("start_date".to_owned(), clone_field(row, "task_start_date"));
    base.insert("end_date".to_owned(), clone_field(row, "task_end_date"));
    base.insert("priority".to_owned(), clone_field(row, "task_priority"));
    base.insert(
        "completed_at".to_owned(),
        clone_field(row, "task_completed_at"),
    );
    base.insert("closed_at".to_owned(), clone_field(row, "task_closed_at"));
    base.insert("deleted_at".to_owned(), clone_field(row, "task_deleted_at"));
    base.insert(
        "estimation_points".to_owned(),
        clone_field(row, "task_estimation_points"),
    );
    base.insert("created_at".to_owned(), clone_field(row, "task_created_at"));

    let sched_keys = [
        "sched_total_duration",
        "sched_is_splittable",
        "sched_auto_schedule",
    ];
    let has_scheduling = sched_keys
        .iter()
        .any(|key| row.get(*key).map(|v| !v.is_null()).unwrap_or(false));
    if has_scheduling {
        base.insert(
            "total_duration".to_owned(),
            null_default(row, "sched_total_duration"),
        );
        base.insert(
            "is_splittable".to_owned(),
            null_default(row, "sched_is_splittable"),
        );
        base.insert(
            "min_split_duration_minutes".to_owned(),
            null_default(row, "sched_min_split_duration_minutes"),
        );
        base.insert(
            "max_split_duration_minutes".to_owned(),
            null_default(row, "sched_max_split_duration_minutes"),
        );
        base.insert(
            "calendar_hours".to_owned(),
            null_default(row, "sched_calendar_hours"),
        );
        base.insert(
            "auto_schedule".to_owned(),
            null_default(row, "sched_auto_schedule"),
        );
    }

    base.insert("list".to_owned(), clone_field(row, "list_data"));
    base.insert(
        "assignees".to_owned(),
        array_or_empty(row, "assignees_data"),
    );
    base.insert("labels".to_owned(), array_or_empty(row, "labels_data"));
    base.insert("projects".to_owned(), array_or_empty(row, "projects_data"));
    base.insert(
        "overrides".to_owned(),
        override_value.clone().unwrap_or(Value::Null),
    );

    // resolveEffectiveValues: only applies when override.self_managed is true.
    if let Some(ref override_obj) = override_value {
        let self_managed = override_obj
            .get("self_managed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if self_managed {
            apply_effective_value(&mut base, override_obj, "priority_override", "priority");
            apply_effective_value(&mut base, override_obj, "due_date_override", "end_date");
            apply_effective_value(
                &mut base,
                override_obj,
                "estimation_override",
                "estimation_points",
            );
        }
    }

    Value::Object(base)
}

/// `field !== null ? override[field] : task[target]` (note: legacy checks
/// strict `!== null`, so an explicit `null` override leaves the base value).
fn apply_effective_value(
    base: &mut Map<String, Value>,
    override_obj: &Value,
    override_field: &str,
    target_field: &str,
) {
    if let Some(value) = override_obj.get(override_field) {
        if !value.is_null() {
            base.insert(target_field.to_owned(), value.clone());
        }
    }
}

// ---------------------------------------------------------------------------
// isPersonallyHidden (mirrors @tuturuuu/utils/task-overrides)
// ---------------------------------------------------------------------------

fn is_personally_hidden(task: &Value, board_list_overrides: &[Value]) -> bool {
    let overrides = task.get("overrides");

    // Personal completion: overrides?.completed_at (truthy).
    if overrides
        .and_then(|o| o.get("completed_at"))
        .map(is_truthy)
        .unwrap_or(false)
    {
        return true;
    }

    // Personal unassignment: overrides?.personally_unassigned (truthy).
    if overrides
        .and_then(|o| o.get("personally_unassigned"))
        .map(is_truthy)
        .unwrap_or(false)
    {
        return true;
    }

    let list = task.get("list");

    // Board-level override.
    if let Some(board_id) = list
        .and_then(|l| l.get("board"))
        .and_then(|b| b.get("id"))
        .and_then(Value::as_str)
    {
        if let Some(over) = board_list_overrides.iter().find(|o| {
            scope_type(o) == Some("board")
                && o.get("board_id").and_then(Value::as_str) == Some(board_id)
        }) {
            if matches!(personal_status(over), Some("done") | Some("closed")) {
                return true;
            }
        }
    }

    // List-level override.
    if let Some(list_id) = list.and_then(|l| l.get("id")).and_then(Value::as_str) {
        if let Some(over) = board_list_overrides.iter().find(|o| {
            scope_type(o) == Some("list")
                && o.get("list_id").and_then(Value::as_str) == Some(list_id)
        }) {
            if matches!(personal_status(over), Some("done") | Some("closed")) {
                return true;
            }
        }
    }

    false
}

fn scope_type(value: &Value) -> Option<&str> {
    value.get("scope_type").and_then(Value::as_str)
}

fn personal_status(value: &Value) -> Option<&str> {
    value.get("personal_status").and_then(Value::as_str)
}

// ---------------------------------------------------------------------------
// Field accessors / sorting
// ---------------------------------------------------------------------------

fn list_status(task: &Value) -> Option<&str> {
    task.get("list")
        .and_then(|list| list.get("status"))
        .and_then(Value::as_str)
}

fn end_date_str(task: &Value) -> Option<&str> {
    task.get("end_date")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

fn end_date_millis(task: &Value) -> Option<i64> {
    end_date_str(task).and_then(iso8601_to_millis)
}

fn created_at_str(task: &Value) -> &str {
    task.get("created_at").and_then(Value::as_str).unwrap_or("")
}

fn priority_str(task: &Value) -> &str {
    task.get("priority").and_then(Value::as_str).unwrap_or("")
}

/// Sort by end_date ascending. Legacy compares the raw ISO strings; we compare
/// by parsed milliseconds for robustness against mixed timezone offsets.
fn sort_by_end_date_asc(tasks: &mut [Value]) {
    tasks.sort_by(|a, b| {
        let a_key = end_date_millis(a).unwrap_or(i64::MAX);
        let b_key = end_date_millis(b).unwrap_or(i64::MAX);
        a_key.cmp(&b_key)
    });
}

/// noDueDate sort: priority desc, then created_at desc.
fn sort_no_due_date(tasks: &mut [Value]) {
    tasks.sort_by(|a, b| {
        let a_priority = priority_rank(priority_str(a));
        let b_priority = priority_rank(priority_str(b));
        if a_priority != b_priority {
            return b_priority.cmp(&a_priority);
        }
        // (a.created_at ?? '') > (b.created_at ?? '') ? -1 : 1  => created_at desc
        created_at_str(b).cmp(created_at_str(a))
    });
}

/// completedTasks sort: created_at desc (bDate > aDate ? 1 : -1).
fn sort_by_created_at_desc(tasks: &mut [Value]) {
    tasks.sort_by(|a, b| created_at_str(b).cmp(created_at_str(a)));
}

fn priority_rank(priority: &str) -> i32 {
    match priority {
        "critical" => 4,
        "high" => 3,
        "normal" => 2,
        "low" => 1,
        // Empty/unknown priorities fall back to 'normal' (legacy
        // `priorityOrder[a.priority || 'normal']`).
        "" => 2,
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

fn clone_field(row: &Value, key: &str) -> Value {
    row.get(key).cloned().unwrap_or(Value::Null)
}

/// `?? null` mapping for scheduling fields.
fn null_default(row: &Value, key: &str) -> Value {
    match row.get(key) {
        Some(value) if !value.is_null() => value.clone(),
        _ => Value::Null,
    }
}

fn string_or_empty(row: &Value, key: &str) -> Value {
    match row.get(key).and_then(Value::as_str) {
        Some(value) => Value::String(value.to_owned()),
        None => Value::String(String::new()),
    }
}

fn bool_or_false(row: &Value, key: &str) -> Value {
    Value::Bool(row.get(key).and_then(Value::as_bool).unwrap_or(false))
}

fn array_or_empty(row: &Value, key: &str) -> Value {
    match row.get(key) {
        Some(Value::Array(items)) => Value::Array(items.clone()),
        _ => Value::Array(Vec::new()),
    }
}

/// JS truthiness for the fields we test (string non-empty, bool true).
fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Bool(boolean) => *boolean,
        Value::String(text) => !text.is_empty(),
        Value::Number(number) => number.as_f64().map(|n| n != 0.0).unwrap_or(false),
        Value::Null => false,
        _ => true,
    }
}

fn single_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

fn all_query_values(url: Option<&url::Url>, key: &str) -> Vec<String> {
    match url {
        Some(url) => url
            .query_pairs()
            .filter_map(|(name, value)| (name == key).then(|| value.into_owned()))
            .collect(),
        None => Vec::new(),
    }
}

/// Mirrors `parseInt(value || '0', 10)` semantics enough for these params:
/// parses a leading integer, defaulting handled by the caller.
fn parse_int(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut chars = trimmed.char_indices();
    let mut end = 0;
    let (first_idx, first) = chars.next()?;
    if first != '-' && first != '+' && !first.is_ascii_digit() {
        return None;
    }
    end = first_idx + first.len_utf8();
    for (idx, ch) in chars {
        if ch.is_ascii_digit() {
            end = idx + ch.len_utf8();
        } else {
            break;
        }
    }
    trimmed[..end].parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// Time helpers (server-local == UTC on the Worker/native runtime)
// ---------------------------------------------------------------------------

fn current_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Returns (dayStartMillis, dayEndMillis) for the UTC day `offset_days` from the
/// day containing `base_millis`. dayStart = 00:00:00.000, dayEnd = 23:59:59.999.
fn day_bounds(base_millis: i64, offset_days: i64) -> (i64, i64) {
    let day_index = base_millis.div_euclid(86_400_000) + offset_days;
    let start = day_index * 86_400_000;
    let end = start + 86_400_000 - 1;
    (start, end)
}

// --- ISO 8601 parsing/formatting (copied file-local from auth_accounts.rs) ---

fn iso8601_to_millis(value: &str) -> Option<i64> {
    let normalized = value.replace(' ', "T");
    let bytes = normalized.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i64 = normalized.get(0..4)?.parse().ok()?;
    let month: i64 = normalized.get(5..7)?.parse().ok()?;
    let day: i64 = normalized.get(8..10)?.parse().ok()?;
    let hour: i64 = normalized.get(11..13)?.parse().ok()?;
    let minute: i64 = normalized.get(14..16)?.parse().ok()?;
    let second: i64 = normalized.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let tail = &normalized[19..];
    let mut millis_fraction: i64 = 0;
    if let Some(stripped) = tail.strip_prefix('.') {
        let frac_digits: String = stripped
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        let mut frac = frac_digits;
        frac.truncate(3);
        while frac.len() < 3 {
            frac.push('0');
        }
        millis_fraction = frac.parse().unwrap_or(0);
    }

    let tz_offset_seconds = parse_tz_offset(tail);

    let days = days_from_civil(year, month, day);
    let epoch_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - tz_offset_seconds;

    Some(epoch_seconds * 1_000 + millis_fraction)
}

fn parse_tz_offset(tail: &str) -> i64 {
    let tail = if let Some(stripped) = tail.strip_prefix('.') {
        let digits = stripped.chars().take_while(|c| c.is_ascii_digit()).count();
        &stripped[digits..]
    } else {
        tail
    };

    let tail = tail.trim();
    if tail.is_empty() || tail.eq_ignore_ascii_case("Z") {
        return 0;
    }

    let (sign, rest) = if let Some(rest) = tail.strip_prefix('+') {
        (1, rest)
    } else if let Some(rest) = tail.strip_prefix('-') {
        (-1, rest)
    } else {
        return 0;
    };

    let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    let (hours, minutes): (i64, i64) = match digits.len() {
        2 => (digits.parse().unwrap_or(0), 0),
        4 => (
            digits[0..2].parse().unwrap_or(0),
            digits[2..4].parse().unwrap_or(0),
        ),
        _ => (0, 0),
    };

    sign * (hours * 3_600 + minutes * 60)
}

fn millis_to_iso8601(millis: i64) -> String {
    let total_seconds = millis.div_euclid(1_000);
    let millis_part = millis.rem_euclid(1_000);
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis_part:03}Z")
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
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
// normalizeWorkspaceId (port of @tuturuuu/utils normalizeWorkspaceId)
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    data_auth: &DataAuth,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, data_auth).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, data_auth).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    data_auth: &DataAuth,
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        data_auth,
        None,
    )
    .await?;

    if !is_success(response.status) {
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
    data_auth: &DataAuth,
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        data_auth,
        None,
    )
    .await?;

    if !is_success(response.status) {
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
        None,
    )
    .await?;

    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

#[derive(serde::Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
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

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn message_response_value(status: u16, payload: Value) -> BackendResponse {
    no_store_response(json_response(status, payload))
}
