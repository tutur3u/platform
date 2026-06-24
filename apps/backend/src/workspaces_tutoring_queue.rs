use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_TUTORING_QUEUE_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_TUTORING_QUEUE_PATH_SUFFIX: &str = "/tutoring/queue";
const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const PRIVATE_SCHEMA: &str = "private";
const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const INVALID_QUERY_MESSAGE: &str = "Invalid query";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load queue";
const DEFAULT_PAGE: u32 = 1;
const DEFAULT_PAGE_SIZE: u32 = 20;
const MAX_PAGE_SIZE: u32 = 100;
const MAX_SEARCH_LEN: usize = 200;

// ---------------------------------------------------------------------------
// Query parameters (mirror of TutoringQueueQuerySchema in shared.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct TutoringQueueQuery {
    group_id: Option<String>,
    student_user_id: Option<String>,
    reason_type: Option<String>,
    search: String,
    page: u32,
    page_size: u32,
}

#[derive(Debug)]
enum QueryParseError {
    InvalidUuid(&'static str),
    InvalidReasonType,
    SearchTooLong(&'static str),
    InvalidPage,
    InvalidPageSize,
}

// ---------------------------------------------------------------------------
// Supabase row shapes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AttendanceGroupEmbed {
    name: Option<String>,
}

#[derive(Deserialize)]
struct IdentityEmbed {
    full_name: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct AttendanceRow {
    group_id: Option<String>,
    user_id: Option<String>,
    group: Option<AttendanceGroupEmbed>,
    user: Option<IdentityEmbed>,
}

#[derive(Deserialize)]
struct CompletedSessionRow {
    group_id: Option<String>,
    student_user_id: Option<String>,
}

#[derive(Deserialize)]
struct FeedbackGroupEmbed {
    name: Option<String>,
}

#[derive(Deserialize)]
struct FeedbackRow {
    id: Option<String>,
    content: Option<String>,
    user_id: Option<String>,
    group_id: Option<String>,
    user: Option<IdentityEmbed>,
    group: Option<FeedbackGroupEmbed>,
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct QueueItem {
    group_id: String,
    student_user_id: String,
    group_name: String,
    student_name: String,
    reason_type: String,
    absence_deficit: u32,
    feedback_content: String,
    source_feedback_id: Option<String>,
}

#[derive(Serialize)]
struct QueueSummary {
    absent: u32,
    weak: u32,
}

#[derive(Serialize)]
struct QueueResponse {
    data: Vec<QueueItem>,
    count: usize,
    page: u32,
    #[serde(rename = "pageSize")]
    page_size: u32,
    summary: QueueSummary,
    #[serde(rename = "totalPages")]
    total_pages: u32,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_tutoring_queue_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_tutoring_queue_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tutoring_queue_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tutoring_queue_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth + workspace normalization + permission (view_user_groups) check.
    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_USER_GROUPS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        // Legacy returns 404 "Not found" when permissions cannot be resolved
        // (missing session / not a member / unknown workspace) and 403
        // "Insufficient permissions" when the member lacks view_user_groups.
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound)
        | Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(404, NOT_FOUND_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FAILED_TO_LOAD_MESSAGE);
        }
    };
    let ws_id = authorization.ws_id;

    let query = match parse_query(request.url) {
        Ok(query) => query,
        Err(error) => return invalid_query_response(error),
    };

    let attendance_rows = match load_attendance_rows(contact_data, outbound, &ws_id, &query).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    let completed_rows = match load_completed_rows(contact_data, outbound, &ws_id, &query).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    let feedback_rows = match load_feedback_rows(contact_data, outbound, &ws_id, &query).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    let response = build_queue_response(&query, attendance_rows, completed_rows, feedback_rows);

    no_store_response(json_response(200, response))
}

// ---------------------------------------------------------------------------
// Supabase reads (service-role, mirroring the legacy admin client)
// ---------------------------------------------------------------------------

async fn load_attendance_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &TutoringQueueQuery,
) -> Result<Vec<AttendanceRow>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        (
            "select",
            "group_id,user_id,status,\
             group:workspace_user_groups!user_group_attendance_group_id_fkey!inner(id,ws_id,name),\
             user:workspace_users!user_group_attendance_user_id_fkey!inner(id,full_name,display_name,email,archived)"
                .to_owned(),
        ),
        ("group.ws_id", format!("eq.{ws_id}")),
        ("user.archived", "eq.false".to_owned()),
        ("status", "in.(ABSENT,Absent,absent)".to_owned()),
        ("order", "group_id.asc,user_id.asc".to_owned()),
    ];
    if let Some(group_id) = &query.group_id {
        params.push(("group_id", format!("eq.{group_id}")));
    }
    if let Some(student_user_id) = &query.student_user_id {
        params.push(("user_id", format!("eq.{student_user_id}")));
    }

    let Some(url) = contact_data.rest_url("user_group_attendance", &params) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<AttendanceRow>>().map_err(|_| ())
}

async fn load_completed_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &TutoringQueueQuery,
) -> Result<Vec<CompletedSessionRow>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "group_id,student_user_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("reason_type", "eq.ABSENT_RECOVERY".to_owned()),
        ("attendance_status", "eq.DONE".to_owned()),
    ];
    if let Some(group_id) = &query.group_id {
        params.push(("group_id", format!("eq.{group_id}")));
    }
    if let Some(student_user_id) = &query.student_user_id {
        params.push(("student_user_id", format!("eq.{student_user_id}")));
    }

    let Some(url) = contact_data.rest_url("workspace_tutoring_sessions", &params) else {
        return Err(());
    };
    // workspace_tutoring_sessions lives in the `private` schema.
    let response =
        send_service_role_request(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<CompletedSessionRow>>().map_err(|_| ())
}

async fn load_feedback_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &TutoringQueueQuery,
) -> Result<Vec<FeedbackRow>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        (
            "select",
            "id,content,user_id,group_id,created_at,\
             user:workspace_users!user_feedbacks_user_id_fkey!inner(id,ws_id,full_name,display_name,email,archived),\
             group:workspace_user_groups!user_feedbacks_group_id_fkey(id,name)"
                .to_owned(),
        ),
        ("require_attention", "eq.true".to_owned()),
        ("user.ws_id", format!("eq.{ws_id}")),
        ("user.archived", "eq.false".to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(group_id) = &query.group_id {
        params.push(("group_id", format!("eq.{group_id}")));
    }
    if let Some(student_user_id) = &query.student_user_id {
        params.push(("user_id", format!("eq.{student_user_id}")));
    }

    let Some(url) = contact_data.rest_url("user_feedbacks", &params) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<FeedbackRow>>().map_err(|_| ())
}

async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(schema) = schema {
        request = request
            .with_header("Accept-Profile", schema)
            .with_header("Content-Profile", schema);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Queue assembly (mirror of the legacy in-memory aggregation)
// ---------------------------------------------------------------------------

fn build_queue_response(
    query: &TutoringQueueQuery,
    attendance_rows: Vec<AttendanceRow>,
    completed_rows: Vec<CompletedSessionRow>,
    feedback_rows: Vec<FeedbackRow>,
) -> QueueResponse {
    let mut absence_count: BTreeMap<String, u32> = BTreeMap::new();
    let mut group_name: BTreeMap<String, String> = BTreeMap::new();
    let mut student_name: BTreeMap<String, String> = BTreeMap::new();

    for row in &attendance_rows {
        let (Some(group_id), Some(user_id)) = (&row.group_id, &row.user_id) else {
            continue;
        };
        let key = format!("{group_id}:{user_id}");
        *absence_count.entry(key).or_insert(0) += 1;

        if let Some(name) = row.group.as_ref().and_then(|group| group.name.as_ref()) {
            group_name.insert(group_id.clone(), name.clone());
        }
        if let Some(identity) = &row.user {
            student_name.insert(user_id.clone(), name_of(identity));
        }
    }

    let mut completed_count: BTreeMap<String, u32> = BTreeMap::new();
    for row in &completed_rows {
        let (Some(group_id), Some(student_user_id)) = (&row.group_id, &row.student_user_id) else {
            // group_id/student_user_id missing -> key is "undefined"-ish; legacy
            // builds the key verbatim. Skip rows without both ids to avoid
            // polluting the map (they cannot match real attendance keys).
            continue;
        };
        let key = format!("{group_id}:{student_user_id}");
        *completed_count.entry(key).or_insert(0) += 1;
    }

    // Key universe: every attendance key plus every present feedback key.
    let mut key_set: BTreeSet<String> = BTreeSet::new();
    for key in absence_count.keys() {
        key_set.insert(key.clone());
    }
    for row in &feedback_rows {
        if is_present_id(row.group_id.as_deref()) && is_present_id(row.user_id.as_deref()) {
            let group_id = row.group_id.as_deref().unwrap_or_default();
            let user_id = row.user_id.as_deref().unwrap_or_default();
            key_set.insert(format!("{group_id}:{user_id}"));
        }
    }

    // Latest feedback per key (rows already ordered created_at desc).
    let mut latest_feedback: BTreeMap<String, (Option<String>, String)> = BTreeMap::new();
    for row in &feedback_rows {
        if !is_present_id(row.group_id.as_deref()) || !is_present_id(row.user_id.as_deref()) {
            continue;
        }
        let group_id = row.group_id.as_deref().unwrap_or_default();
        let user_id = row.user_id.as_deref().unwrap_or_default();
        let key = format!("{group_id}:{user_id}");
        latest_feedback
            .entry(key)
            .or_insert_with(|| (row.id.clone(), row.content.clone().unwrap_or_default()));

        if let Some(name) = row.group.as_ref().and_then(|group| group.name.as_ref()) {
            group_name.insert(group_id.to_owned(), name.clone());
        }
        if let Some(identity) = &row.user {
            student_name.insert(user_id.to_owned(), name_of(identity));
        }
    }

    let mut full_queue: Vec<QueueItem> = Vec::new();
    for key in &key_set {
        let Some((group_id, student_id)) = key.split_once(':') else {
            continue;
        };
        if !is_present_id(Some(group_id)) || !is_present_id(Some(student_id)) {
            continue;
        }

        let deficit = absence_count
            .get(key)
            .copied()
            .unwrap_or(0)
            .saturating_sub(completed_count.get(key).copied().unwrap_or(0));
        let feedback = latest_feedback.get(key);
        let has_absent = deficit > 0;
        let has_weak = feedback.is_some();

        if !has_absent && !has_weak {
            continue;
        }

        let reason_type = if has_absent {
            if has_weak { "BOTH" } else { "ABSENT_RECOVERY" }
        } else {
            "WEAK_SUPPORT"
        };

        full_queue.push(QueueItem {
            group_id: group_id.to_owned(),
            student_user_id: student_id.to_owned(),
            group_name: group_name
                .get(group_id)
                .cloned()
                .unwrap_or_else(|| "Unknown group".to_owned()),
            student_name: student_name
                .get(student_id)
                .cloned()
                .unwrap_or_else(|| student_id.to_owned()),
            reason_type: reason_type.to_owned(),
            absence_deficit: deficit,
            feedback_content: feedback
                .map(|(_, content)| content.clone())
                .unwrap_or_default(),
            source_feedback_id: feedback.and_then(|(id, _)| id.clone()),
        });
    }

    // Sort by group name, then student name, then "group:student" composite.
    full_queue.sort_by(|a, b| {
        a.group_name
            .cmp(&b.group_name)
            .then_with(|| a.student_name.cmp(&b.student_name))
            .then_with(|| {
                let left = format!("{}:{}", a.group_id, a.student_user_id);
                let right = format!("{}:{}", b.group_id, b.student_user_id);
                left.cmp(&right)
            })
    });

    let search_term = query.search.trim().to_lowercase();
    let filtered_queue: Vec<QueueItem> = full_queue
        .into_iter()
        .filter(|item| {
            if let Some(reason_type) = &query.reason_type
                && &item.reason_type != reason_type
            {
                return false;
            }
            if let Some(group_id) = &query.group_id
                && &item.group_id != group_id
            {
                return false;
            }
            if let Some(student_user_id) = &query.student_user_id
                && &item.student_user_id != student_user_id
            {
                return false;
            }
            if search_term.is_empty() {
                return true;
            }
            let haystack = format!(
                "{} {} {} {}",
                item.student_name, item.group_name, item.reason_type, item.feedback_content
            )
            .to_lowercase();
            haystack.contains(&search_term)
        })
        .collect();

    let summary = summarize_queue(&filtered_queue);

    let total_count = filtered_queue.len();
    let page = query.page;
    let page_size = query.page_size;
    let total_pages = ((total_count as u32).div_ceil(page_size)).max(1);
    let start = ((page - 1) * page_size) as usize;
    let paged_queue: Vec<QueueItem> = filtered_queue
        .into_iter()
        .skip(start)
        .take(page_size as usize)
        .collect();

    QueueResponse {
        data: paged_queue,
        count: total_count,
        page,
        page_size,
        summary,
        total_pages,
    }
}

fn summarize_queue(queue: &[QueueItem]) -> QueueSummary {
    let mut summary = QueueSummary { absent: 0, weak: 0 };
    for item in queue {
        if item.reason_type == "ABSENT_RECOVERY" || item.reason_type == "BOTH" {
            summary.absent += 1;
        }
        if item.reason_type == "WEAK_SUPPORT" || item.reason_type == "BOTH" {
            summary.weak += 1;
        }
    }
    summary
}

fn name_of(identity: &IdentityEmbed) -> String {
    let candidate = [
        identity.full_name.as_deref(),
        identity.display_name.as_deref(),
        identity.email.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(str::trim)
    .find(|value| !value.is_empty());

    candidate.unwrap_or("Unknown").to_owned()
}

fn is_present_id(value: Option<&str>) -> bool {
    matches!(value, Some(value) if !value.is_empty() && value != "null" && value != "undefined")
}

// ---------------------------------------------------------------------------
// Query parsing (mirror of TutoringQueueQuerySchema.safeParse)
// ---------------------------------------------------------------------------

fn parse_query(request_url: Option<&str>) -> Result<TutoringQueueQuery, QueryParseError> {
    let mut query = TutoringQueueQuery {
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
        ..TutoringQueueQuery::default()
    };

    let Some(parsed) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        // No URL / unparseable -> behave like an empty query (defaults).
        return Ok(query);
    };

    let mut q: Option<String> = None;
    let mut query_alias: Option<String> = None;
    let mut search_alias: Option<String> = None;

    for (key, value) in parsed.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "groupId" => {
                let value = value.trim();
                if value.is_empty() {
                    continue;
                }
                if !is_uuid(value) {
                    return Err(QueryParseError::InvalidUuid("groupId"));
                }
                query.group_id = Some(value.to_owned());
            }
            "studentUserId" => {
                let value = value.trim();
                if value.is_empty() {
                    continue;
                }
                if !is_uuid(value) {
                    return Err(QueryParseError::InvalidUuid("studentUserId"));
                }
                query.student_user_id = Some(value.to_owned());
            }
            "reasonType" => {
                if value.is_empty() {
                    continue;
                }
                if !matches!(value.as_str(), "ABSENT_RECOVERY" | "WEAK_SUPPORT" | "BOTH") {
                    return Err(QueryParseError::InvalidReasonType);
                }
                query.reason_type = Some(value);
            }
            "q" => {
                if value.len() > MAX_SEARCH_LEN {
                    return Err(QueryParseError::SearchTooLong("q"));
                }
                q = Some(value);
            }
            "query" => {
                if value.len() > MAX_SEARCH_LEN {
                    return Err(QueryParseError::SearchTooLong("query"));
                }
                query_alias = Some(value);
            }
            "search" => {
                if value.len() > MAX_SEARCH_LEN {
                    return Err(QueryParseError::SearchTooLong("search"));
                }
                search_alias = Some(value);
            }
            "page" => {
                query.page = parse_int_min(&value, 1).ok_or(QueryParseError::InvalidPage)?;
            }
            "pageSize" => {
                let parsed_page_size =
                    parse_int_min(&value, 1).ok_or(QueryParseError::InvalidPageSize)?;
                if parsed_page_size > MAX_PAGE_SIZE {
                    return Err(QueryParseError::InvalidPageSize);
                }
                query.page_size = parsed_page_size;
            }
            _ => {}
        }
    }

    // q ?? query ?? search
    query.search = q.or(query_alias).or(search_alias).unwrap_or_default();

    Ok(query)
}

fn parse_int_min(value: &str, min: u32) -> Option<u32> {
    let trimmed = value.trim();
    // z.coerce.number().int() coerces via Number(); reject non-integer values.
    let parsed = trimmed.parse::<i64>().ok()?;
    if parsed < min as i64 {
        return None;
    }
    u32::try_from(parsed).ok()
}

fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(index, byte)| match index {
        8 | 13 | 18 | 23 => *byte == b'-',
        _ => byte.is_ascii_hexdigit(),
    })
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

fn workspaces_tutoring_queue_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_TUTORING_QUEUE_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_TUTORING_QUEUE_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn invalid_query_response(error: QueryParseError) -> BackendResponse {
    let issue = match error {
        QueryParseError::InvalidUuid(field) => {
            json!({ "path": [field], "message": "Invalid uuid" })
        }
        QueryParseError::InvalidReasonType => {
            json!({ "path": ["reasonType"], "message": "Invalid enum value" })
        }
        QueryParseError::SearchTooLong(field) => {
            json!({ "path": [field], "message": "String must contain at most 200 character(s)" })
        }
        QueryParseError::InvalidPage => {
            json!({ "path": ["page"], "message": "Invalid input" })
        }
        QueryParseError::InvalidPageSize => {
            json!({ "path": ["pageSize"], "message": "Invalid input" })
        }
    };

    no_store_response(json_response(
        400,
        json!({ "message": INVALID_QUERY_MESSAGE, "issues": [issue] }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}
