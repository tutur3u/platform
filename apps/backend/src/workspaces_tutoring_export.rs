//! Handler for `GET /api/v1/workspaces/:wsId/tutoring/export`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tutoring/export/route.ts`.
//!
//! The legacy route:
//! - authenticates the caller, normalizes the workspace id, and requires the
//!   `view_user_groups` permission (404 when there is no workspace access, 403
//!   when the permission is missing),
//! - validates the query string with a Zod schema (400 on failure),
//! - reads `private.workspace_tutoring_sessions` page-by-page (1000 rows per
//!   page) via the service-role client, applying optional filters,
//! - resolves group + user relations from `public.workspace_user_groups` and
//!   `public.workspace_users`,
//! - returns either a `detailed` or `payroll` shaped payload.
//!
//! NOTE: `authorize_workspace_permission` from `workspace_permission_check`
//! already performs auth + workspace normalization + the membership/permission
//! lookup, exactly mirroring `getPermissions(...) + withoutPermission(...)` from
//! the legacy route, so it is reused here instead of reimplementing it.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const TUTORING_EXPORT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const TUTORING_EXPORT_PATH_SUFFIX: &str = "/tutoring/export";
const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const PRIVATE_SCHEMA: &str = "private";
const TUTORING_SESSIONS_TABLE: &str = "workspace_tutoring_sessions";
const WORKSPACE_USER_GROUPS_TABLE: &str = "workspace_user_groups";
const WORKSPACE_USERS_TABLE: &str = "workspace_users";
const EXPORT_PAGE_SIZE: i64 = 1000;

const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const INVALID_QUERY_MESSAGE: &str = "Invalid query";
const EXPORT_FAILED_MESSAGE: &str = "Export failed";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

const SESSION_SELECT: &str = "id,group_id,student_user_id,teacher_user_id,session_date,start_time,duration_minutes,reason_type,content,attendance_status";

#[derive(Deserialize)]
struct TutoringSessionRow {
    id: Option<Value>,
    group_id: Option<String>,
    student_user_id: Option<String>,
    teacher_user_id: Option<String>,
    session_date: Option<String>,
    start_time: Option<String>,
    #[serde(default)]
    duration_minutes: i64,
    reason_type: Option<String>,
    content: Option<String>,
    attendance_status: Option<String>,
}

#[derive(Deserialize)]
struct GroupRow {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct UserRow {
    id: Option<String>,
    full_name: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
}

/// Parsed and validated query string, mirroring the legacy Zod `QuerySchema`.
#[derive(Default)]
struct ExportQuery {
    attendance_status: Option<String>,
    from_date: Option<String>,
    group_id: Option<String>,
    to_date: Option<String>,
    mode: ExportMode,
    reason_type: Option<String>,
    student_user_id: Option<String>,
    teacher_id: Option<String>,
}

#[derive(Default)]
enum ExportMode {
    #[default]
    Detailed,
    Payroll,
}

pub(crate) async fn handle_workspaces_tutoring_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = tutoring_export_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tutoring_export_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tutoring_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror the legacy authentication boundary: a missing Supabase session is
    // an unauthorized request. `authorize_workspace_permission` also rejects
    // missing tokens, but we surface the canonical 401 first.
    if supabase_auth::request_access_token(request).is_none() {
        return message_response(401, UNAUTHORIZED_MESSAGE, "error");
    }

    // Auth + workspace normalization + `view_user_groups` permission check.
    // Legacy semantics:
    // - no workspace access (getPermissions === null) -> 404 "Not found"
    // - permission missing                            -> 403 "Insufficient permissions"
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        VIEW_USER_GROUPS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE, "error");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(404, NOT_FOUND_MESSAGE, "error");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE, "message");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, INTERNAL_ERROR_MESSAGE, "message");
        }
    };

    // Validate the query string (mirrors the Zod `QuerySchema.safeParse`).
    let query = match parse_export_query(request.url) {
        Ok(query) => query,
        Err(issues) => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE, "issues": issues }),
            ));
        }
    };

    let ws_id = authorization.ws_id;

    // Page through the tutoring sessions table via the service-role client.
    let rows = match fetch_all_sessions(&config.contact_data, outbound, &ws_id, &query).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, EXPORT_FAILED_MESSAGE, "message"),
    };

    // Resolve group + user relations.
    let group_ids = unique_non_empty(rows.iter().filter_map(|row| row.group_id.clone()));
    let user_ids = unique_non_empty(rows.iter().flat_map(|row| {
        [row.student_user_id.clone(), row.teacher_user_id.clone()]
            .into_iter()
            .flatten()
    }));

    let groups = match fetch_groups(&config.contact_data, outbound, &group_ids).await {
        Ok(groups) => groups,
        Err(()) => return message_response(500, EXPORT_FAILED_MESSAGE, "message"),
    };
    let users = match fetch_users(&config.contact_data, outbound, &user_ids).await {
        Ok(users) => users,
        Err(()) => return message_response(500, EXPORT_FAILED_MESSAGE, "message"),
    };

    match query.mode {
        ExportMode::Payroll => {
            no_store_response(json_response(200, payroll_payload(&rows, &users)))
        }
        ExportMode::Detailed => {
            no_store_response(json_response(200, detailed_payload(&rows, &groups, &users)))
        }
    }
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

async fn fetch_all_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ExportQuery,
) -> Result<Vec<TutoringSessionRow>, ()> {
    let mut all_rows: Vec<TutoringSessionRow> = Vec::new();
    let mut from: i64 = 0;

    loop {
        let to = from + EXPORT_PAGE_SIZE - 1;

        let mut params: Vec<(&str, String)> = vec![
            ("select", SESSION_SELECT.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "session_date.asc,start_time.asc".to_owned()),
            // PostgREST offset/limit equivalent of supabase-js `.range(from, to)`.
            ("offset", from.to_string()),
            ("limit", (to - from + 1).to_string()),
        ];

        if let Some(value) = &query.from_date {
            params.push(("session_date", format!("gte.{value}")));
        }
        if let Some(value) = &query.to_date {
            params.push(("session_date", format!("lte.{value}")));
        }
        if let Some(value) = &query.teacher_id {
            params.push(("teacher_user_id", format!("eq.{value}")));
        }
        if let Some(value) = &query.group_id {
            params.push(("group_id", format!("eq.{value}")));
        }
        if let Some(value) = &query.student_user_id {
            params.push(("student_user_id", format!("eq.{value}")));
        }
        if let Some(value) = &query.reason_type {
            params.push(("reason_type", format!("eq.{value}")));
        }
        if let Some(value) = &query.attendance_status {
            params.push(("attendance_status", format!("eq.{value}")));
        }

        let url = contact_data
            .rest_url(TUTORING_SESSIONS_TABLE, &params)
            .ok_or(())?;
        let service_role_key = contact_data.service_role_key().ok_or(())?;
        let authorization = format!("Bearer {service_role_key}");

        let response = outbound
            .send(
                OutboundRequest::new(OutboundMethod::Get, &url)
                    .with_header("Accept", APPLICATION_JSON)
                    .with_header("Authorization", &authorization)
                    .with_header("apikey", service_role_key)
                    // `sbAdmin.schema('private')` from the legacy route.
                    .with_header("Accept-Profile", PRIVATE_SCHEMA),
            )
            .await
            .map_err(|_| ())?;

        if !is_success(response.status) {
            return Err(());
        }

        let page_rows = response.json::<Vec<TutoringSessionRow>>().map_err(|_| ())?;
        let page_len = page_rows.len() as i64;
        all_rows.extend(page_rows);

        if page_len < EXPORT_PAGE_SIZE {
            break;
        }

        from += EXPORT_PAGE_SIZE;
    }

    Ok(all_rows)
}

async fn fetch_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_ids: &[String],
) -> Result<Vec<GroupRow>, ()> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("({})", group_ids.join(","));
    let url = contact_data
        .rest_url(
            WORKSPACE_USER_GROUPS_TABLE,
            &[
                ("select", "id,name".to_owned()),
                ("id", format!("in.{in_list}")),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<GroupRow>>().map_err(|_| ())
}

async fn fetch_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_ids: &[String],
) -> Result<Vec<UserRow>, ()> {
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("({})", user_ids.join(","));
    let url = contact_data
        .rest_url(
            WORKSPACE_USERS_TABLE,
            &[
                ("select", "id,full_name,display_name,email".to_owned()),
                ("id", format!("in.{in_list}")),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<UserRow>>().map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    accept_profile: Option<&str>,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(profile) = accept_profile {
        request = request.with_header("Accept-Profile", profile);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Payload shaping
// ---------------------------------------------------------------------------

fn detailed_payload(rows: &[TutoringSessionRow], groups: &[GroupRow], users: &[UserRow]) -> Value {
    let data: Vec<Value> = rows
        .iter()
        .map(|row| {
            let group_name = row
                .group_id
                .as_deref()
                .and_then(|id| find_group(groups, id))
                .and_then(|group| group.name.as_deref())
                .unwrap_or("N/A");
            let student_name = name_of(
                row.student_user_id
                    .as_deref()
                    .and_then(|id| find_user(users, id)),
            );
            let teacher_name = name_of(
                row.teacher_user_id
                    .as_deref()
                    .and_then(|id| find_user(users, id)),
            );

            json!({
                "id": row.id.clone().unwrap_or(Value::Null),
                "date": row.session_date.clone(),
                "time": time_hhmm(row.start_time.as_deref()),
                "duration_minutes": row.duration_minutes,
                "reason_type": row.reason_type.clone(),
                "attendance_status": row.attendance_status.clone(),
                "content": row.content.clone(),
                "group_name": group_name,
                "student_name": student_name,
                "teacher_name": teacher_name,
            })
        })
        .collect();

    json!({ "mode": "detailed", "data": data })
}

fn payroll_payload(rows: &[TutoringSessionRow], users: &[UserRow]) -> Value {
    // Preserve insertion order keyed by teacher id (or "unassigned"), then sort
    // by teacher_name with locale-style comparison (approximated by a simple
    // case-insensitive then byte comparison).
    struct TeacherAggregate {
        teacher_name: String,
        completed_sessions: i64,
        total_minutes: i64,
    }

    let mut order: Vec<String> = Vec::new();
    let mut aggregates: std::collections::HashMap<String, TeacherAggregate> =
        std::collections::HashMap::new();

    for row in rows {
        if row.attendance_status.as_deref() != Some("DONE") {
            continue;
        }
        let teacher = row
            .teacher_user_id
            .as_deref()
            .and_then(|id| find_user(users, id));
        let teacher_name = name_of(teacher);
        let key = teacher
            .and_then(|user| user.id.clone())
            .unwrap_or_else(|| "unassigned".to_owned());

        let entry = aggregates.entry(key.clone()).or_insert_with(|| {
            order.push(key.clone());
            TeacherAggregate {
                teacher_name: teacher_name.clone(),
                completed_sessions: 0,
                total_minutes: 0,
            }
        });
        entry.completed_sessions += 1;
        entry.total_minutes += row.duration_minutes;
    }

    let mut data: Vec<&TeacherAggregate> =
        order.iter().filter_map(|key| aggregates.get(key)).collect();
    data.sort_by(|a, b| compare_names(&a.teacher_name, &b.teacher_name));

    let data: Vec<Value> = data
        .into_iter()
        .map(|aggregate| {
            json!({
                "teacher_name": aggregate.teacher_name,
                "completed_sessions": aggregate.completed_sessions,
                "total_minutes": aggregate.total_minutes,
            })
        })
        .collect();

    json!({ "mode": "payroll", "data": data })
}

/// Mirrors the legacy `nameOf` helper: full_name -> display_name -> email -> "N/A".
fn name_of(user: Option<&UserRow>) -> String {
    let Some(user) = user else {
        return "N/A".to_owned();
    };

    for value in [&user.full_name, &user.display_name, &user.email]
        .into_iter()
        .flatten()
    {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return trimmed.to_owned();
        }
    }

    "N/A".to_owned()
}

/// Mirrors `String(start_time).slice(0, 5)` from the legacy detailed payload.
fn time_hhmm(start_time: Option<&str>) -> Value {
    match start_time {
        Some(value) => Value::String(value.chars().take(5).collect()),
        None => Value::String("null".chars().take(5).collect()),
    }
}

fn find_group<'a>(groups: &'a [GroupRow], id: &str) -> Option<&'a GroupRow> {
    groups.iter().find(|group| group.id.as_deref() == Some(id))
}

fn find_user<'a>(users: &'a [UserRow], id: &str) -> Option<&'a UserRow> {
    users.iter().find(|user| user.id.as_deref() == Some(id))
}

fn compare_names(a: &str, b: &str) -> std::cmp::Ordering {
    let lower = a.to_lowercase().cmp(&b.to_lowercase());
    if lower == std::cmp::Ordering::Equal {
        a.cmp(b)
    } else {
        lower
    }
}

fn unique_non_empty<I: IntoIterator<Item = String>>(values: I) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    for value in values {
        if value.is_empty() {
            continue;
        }
        if !seen.iter().any(|existing| existing == &value) {
            seen.push(value);
        }
    }
    seen
}

// ---------------------------------------------------------------------------
// Query parsing / validation (mirrors the Zod QuerySchema)
// ---------------------------------------------------------------------------

fn parse_export_query(request_url: Option<&str>) -> Result<ExportQuery, Vec<Value>> {
    let mut query = ExportQuery::default();
    let mut issues: Vec<Value> = Vec::new();

    let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) else {
        // No URL means no params -> all optional, mode defaults to detailed.
        return Ok(query);
    };

    // First-occurrence wins, mirroring `Object.fromEntries(searchParams)`.
    let mut seen_mode = false;
    for (key, value) in url.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "attendanceStatus" if query.attendance_status.is_none() => {
                if is_one_of(&value, &["PENDING", "DONE", "NO_SHOW", "CANCELLED"]) {
                    query.attendance_status = Some(value);
                } else {
                    issues.push(invalid_enum_issue("attendanceStatus"));
                }
            }
            "fromDate" if query.from_date.is_none() => {
                if is_iso_date(&value) {
                    query.from_date = Some(value);
                } else {
                    issues.push(invalid_date_issue("fromDate"));
                }
            }
            "toDate" if query.to_date.is_none() => {
                if is_iso_date(&value) {
                    query.to_date = Some(value);
                } else {
                    issues.push(invalid_date_issue("toDate"));
                }
            }
            "groupId" if query.group_id.is_none() => {
                if is_uuid(&value) {
                    query.group_id = Some(value);
                } else {
                    issues.push(invalid_uuid_issue("groupId"));
                }
            }
            "studentUserId" if query.student_user_id.is_none() => {
                if is_uuid(&value) {
                    query.student_user_id = Some(value);
                } else {
                    issues.push(invalid_uuid_issue("studentUserId"));
                }
            }
            "teacherId" if query.teacher_id.is_none() => {
                if is_uuid(&value) {
                    query.teacher_id = Some(value);
                } else {
                    issues.push(invalid_uuid_issue("teacherId"));
                }
            }
            "reasonType" if query.reason_type.is_none() => {
                if is_one_of(&value, &["ABSENT_RECOVERY", "WEAK_SUPPORT", "CUSTOM"]) {
                    query.reason_type = Some(value);
                } else {
                    issues.push(invalid_enum_issue("reasonType"));
                }
            }
            "mode" if !seen_mode => {
                seen_mode = true;
                match value.as_str() {
                    "detailed" => query.mode = ExportMode::Detailed,
                    "payroll" => query.mode = ExportMode::Payroll,
                    _ => issues.push(invalid_enum_issue("mode")),
                }
            }
            _ => {}
        }
    }

    if issues.is_empty() {
        Ok(query)
    } else {
        Err(issues)
    }
}

fn is_one_of(value: &str, options: &[&str]) -> bool {
    options.contains(&value)
}

/// Zod `.date()` accepts strict `YYYY-MM-DD`.
fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    for (index, byte) in bytes.iter().enumerate() {
        match index {
            4 | 7 => {
                if *byte != b'-' {
                    return false;
                }
            }
            _ => {
                if !byte.is_ascii_digit() {
                    return false;
                }
            }
        }
    }

    let month: u32 = value[5..7].parse().unwrap_or(0);
    let day: u32 = value[8..10].parse().unwrap_or(0);
    (1..=12).contains(&month) && (1..=31).contains(&day)
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

fn invalid_enum_issue(path: &str) -> Value {
    json!({
        "code": "invalid_enum_value",
        "path": [path],
        "message": "Invalid enum value",
    })
}

fn invalid_date_issue(path: &str) -> Value {
    json!({
        "code": "invalid_string",
        "validation": "date",
        "path": [path],
        "message": "Invalid date",
    })
}

fn invalid_uuid_issue(path: &str) -> Value {
    json!({
        "code": "invalid_string",
        "validation": "uuid",
        "path": [path],
        "message": "Invalid uuid",
    })
}

// ---------------------------------------------------------------------------
// Path matching / responses
// ---------------------------------------------------------------------------

fn tutoring_export_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TUTORING_EXPORT_PATH_PREFIX)?
        .strip_suffix(TUTORING_EXPORT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str, key: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ key: message })))
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}
