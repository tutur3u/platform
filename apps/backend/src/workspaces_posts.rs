use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const FORBIDDEN_MESSAGE: &str = "Unauthorized";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const POST_EMAIL_MAX_AGE_DAYS: i64 = 60;
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const GET_POST_REVIEW_ROWS_RPC: &str = "get_workspace_post_review_rows";
const GET_POST_REVIEW_SUMMARY_RPC: &str = "get_workspace_post_review_summary";
const WORKSPACES_POSTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_POSTS_PATH_SUFFIX: &str = "/posts";

const POST_APPROVAL_STATUSES: [&str; 4] = ["PENDING", "APPROVED", "REJECTED", "SKIPPED"];
const POST_REVIEW_STAGES: [&str; 10] = [
    "missing_check",
    "pending_approval",
    "approved_awaiting_delivery",
    "undeliverable",
    "queued",
    "processing",
    "sent",
    "delivery_failed",
    "skipped",
    "rejected",
];
const POST_EMAIL_QUEUE_STATUSES: [&str; 7] = [
    "queued",
    "processing",
    "sent",
    "failed",
    "blocked",
    "cancelled",
    "skipped",
];

#[derive(Default)]
struct PostsQuery {
    page: i64,
    page_size: i64,
    included_groups: Vec<String>,
    excluded_groups: Vec<String>,
    start: Option<String>,
    end: Option<String>,
    user_id: Option<String>,
    stage: Option<String>,
    approval_status: Option<String>,
    queue_status: Option<String>,
}

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
struct PostEmailRow {
    row_key: Option<String>,
    notes: Option<String>,
    user_id: Option<String>,
    user_display_name: Option<String>,
    user_full_name: Option<String>,
    user_phone: Option<String>,
    user_avatar_url: Option<String>,
    email_id: Option<String>,
    is_completed: Option<bool>,
    has_check: Option<bool>,
    ws_id: Option<String>,
    email: Option<String>,
    recipient: Option<String>,
    post_id: Option<String>,
    post_title: Option<String>,
    post_content: Option<String>,
    post_created_at: Option<String>,
    group_id: Option<String>,
    group_name: Option<String>,
    subject: Option<String>,
    queue_status: Option<String>,
    queue_attempt_count: Option<i64>,
    queue_last_error: Option<String>,
    queue_sent_at: Option<String>,
    delivery_issue_reason: Option<String>,
    approval_status: Option<String>,
    approval_rejection_reason: Option<String>,
    can_remove_approval: Option<bool>,
    check_created_at: Option<String>,
    review_stage: Option<String>,
    total_count: Option<i64>,
}

#[derive(Deserialize)]
struct PostEmailSummaryRow {
    total_count: Option<i64>,
    missing_check_count: Option<i64>,
    pending_approval_stage_count: Option<i64>,
    approved_awaiting_delivery_count: Option<i64>,
    undeliverable_count: Option<i64>,
    queued_stage_count: Option<i64>,
    processing_stage_count: Option<i64>,
    sent_stage_count: Option<i64>,
    delivery_failed_count: Option<i64>,
    skipped_stage_count: Option<i64>,
    rejected_stage_count: Option<i64>,
    pending_approval_count: Option<i64>,
    approved_count: Option<i64>,
    rejected_count: Option<i64>,
    skipped_approval_count: Option<i64>,
    queued_count: Option<i64>,
    processing_count: Option<i64>,
    sent_count: Option<i64>,
    failed_count: Option<i64>,
    blocked_count: Option<i64>,
    cancelled_count: Option<i64>,
    queue_skipped_count: Option<i64>,
}

#[derive(Serialize)]
struct PostReviewRowsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_cutoff: &'a str,
    p_limit: i64,
    p_offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_included_group_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_excluded_group_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_stage: Option<[&'a str; 1]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_end_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_approval_status: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_user_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_queue_status: Option<&'a str>,
}

#[derive(Serialize)]
struct PostReviewSummaryRpcRequest<'a> {
    p_ws_id: &'a str,
    p_cutoff: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_included_group_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_excluded_group_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_end_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_user_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_approval_status: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_queue_status: Option<&'a str>,
}

pub(crate) async fn handle_workspaces_posts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspaces_posts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspaces_posts_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspaces_posts_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror getPermissions({ wsId }): requires an authenticated workspace member.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        // getPermissions returns null on lookup failure -> Unauthorized (401).
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) | Err(()) => return message_response(401, FORBIDDEN_MESSAGE),
    }

    let query = parse_posts_query(request.url);
    let cutoff = post_email_max_age_cutoff();

    let rows = match fetch_review_rows(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &cutoff,
        &query,
    )
    .await
    {
        Ok(rows) => rows,
        Err(message) => return error_response(&message),
    };

    let summary = match fetch_review_summary(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &cutoff,
        &query,
    )
    .await
    {
        Ok(summary) => summary,
        Err(message) => return error_response(&message),
    };

    let count = rows.first().and_then(|row| row.total_count).unwrap_or(0);
    let data: Vec<Value> = rows.iter().map(map_post_email_row).collect();

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "count": count,
            "summary": map_summary_row(summary.as_ref()),
        }),
    ))
}

fn parse_posts_query(request_url: Option<&str>) -> PostsQuery {
    let mut query = PostsQuery {
        page: 1,
        page_size: 10,
        ..PostsQuery::default()
    };

    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    let mut page_seen = false;
    let mut page_size_seen = false;
    let mut start_seen = false;
    let mut end_seen = false;
    let mut user_id_seen = false;
    let mut stage_seen = false;
    let mut approval_seen = false;
    let mut queue_seen = false;

    for (key, value) in url.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "page" if !page_seen => {
                page_seen = true;
                if let Ok(parsed) = value.parse::<i64>() {
                    query.page = parsed;
                }
            }
            "pageSize" if !page_size_seen => {
                page_size_seen = true;
                if let Ok(parsed) = value.parse::<i64>() {
                    query.page_size = parsed;
                }
            }
            "includedGroups" => {
                if !value.is_empty() {
                    query.included_groups.push(value);
                }
            }
            "excludedGroups" => {
                if !value.is_empty() {
                    query.excluded_groups.push(value);
                }
            }
            "start" if !start_seen => {
                start_seen = true;
                query.start = non_empty(value);
            }
            "end" if !end_seen => {
                end_seen = true;
                query.end = non_empty(value);
            }
            "userId" if !user_id_seen => {
                user_id_seen = true;
                query.user_id = non_empty(value);
            }
            "stage" if !stage_seen => {
                stage_seen = true;
                query.stage = value_in(&value, &POST_REVIEW_STAGES);
            }
            "approvalStatus" if !approval_seen => {
                approval_seen = true;
                query.approval_status = value_in(&value, &POST_APPROVAL_STATUSES);
            }
            "queueStatus" if !queue_seen => {
                queue_seen = true;
                query.queue_status = value_in(&value, &POST_EMAIL_QUEUE_STATUSES);
            }
            _ => {}
        }
    }

    query
}

fn safe_page(page: i64) -> i64 {
    if page > 0 { page } else { 1 }
}

fn safe_size(page_size: i64) -> i64 {
    if page_size > 0 { page_size } else { 10 }
}

async fn fetch_review_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    cutoff: &str,
    query: &PostsQuery,
) -> Result<Vec<PostEmailRow>, String> {
    let size = safe_size(query.page_size);
    let offset = (safe_page(query.page) - 1) * size;
    let body = PostReviewRowsRpcRequest {
        p_ws_id: ws_id,
        p_cutoff: cutoff,
        p_limit: size,
        p_offset: offset,
        p_included_group_ids: (!query.included_groups.is_empty())
            .then_some(query.included_groups.as_slice()),
        p_excluded_group_ids: (!query.excluded_groups.is_empty())
            .then_some(query.excluded_groups.as_slice()),
        p_stage: query.stage.as_deref().map(|stage| [stage]),
        p_start_date: query.start.as_deref(),
        p_end_date: query.end.as_deref(),
        p_approval_status: query.approval_status.as_deref(),
        p_user_id: query.user_id.as_deref(),
        p_queue_status: query.queue_status.as_deref(),
    };

    let response =
        send_private_rpc(contact_data, outbound, GET_POST_REVIEW_ROWS_RPC, &body).await?;
    response.json::<Vec<PostEmailRow>>().map_err(unknown_error)
}

async fn fetch_review_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    cutoff: &str,
    query: &PostsQuery,
) -> Result<Option<PostEmailSummaryRow>, String> {
    let body = PostReviewSummaryRpcRequest {
        p_ws_id: ws_id,
        p_cutoff: cutoff,
        p_included_group_ids: (!query.included_groups.is_empty())
            .then_some(query.included_groups.as_slice()),
        p_excluded_group_ids: (!query.excluded_groups.is_empty())
            .then_some(query.excluded_groups.as_slice()),
        p_start_date: query.start.as_deref(),
        p_end_date: query.end.as_deref(),
        p_user_id: query.user_id.as_deref(),
        p_approval_status: query.approval_status.as_deref(),
        p_queue_status: query.queue_status.as_deref(),
    };

    let response =
        send_private_rpc(contact_data, outbound, GET_POST_REVIEW_SUMMARY_RPC, &body).await?;
    Ok(response
        .json::<Vec<PostEmailSummaryRow>>()
        .map_err(unknown_error)?
        .into_iter()
        .next())
}

async fn send_private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &impl Serialize,
) -> Result<OutboundResponse, String> {
    let rpc_url = contact_data
        .rpc_url(function)
        .ok_or_else(|| unknown_message())?;
    let service_role_key = contact_data
        .service_role_key()
        .ok_or_else(|| unknown_message())?;
    let authorization = format!("Bearer {service_role_key}");
    let serialized = serde_json::to_string(body).map_err(unknown_error)?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&serialized),
        )
        .await
        .map_err(|_| unknown_message())?;

    if !(200..300).contains(&response.status) {
        // Surface the PostgREST error message like supabase's error.message.
        let message = response
            .json::<Value>()
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .unwrap_or_else(unknown_message);
        return Err(message);
    }

    Ok(response)
}

fn map_post_email_row(row: &PostEmailRow) -> Value {
    json!({
        "id": row.row_key,
        "notes": row.notes,
        "user_id": row.user_id,
        "user_display_name": row.user_display_name,
        "user_full_name": row.user_full_name,
        "user_phone": row.user_phone,
        "user_avatar_url": row.user_avatar_url,
        "email_id": row.email_id,
        "is_completed": row.is_completed,
        "has_check": row.has_check,
        "ws_id": row.ws_id,
        "email": row.email,
        "recipient": row.recipient,
        "post_id": row.post_id,
        "post_title": row.post_title,
        "post_content": row.post_content,
        "post_created_at": row.post_created_at,
        "group_id": row.group_id,
        "group_name": row.group_name,
        "subject": row.subject,
        "queue_status": normalize_queue_status(
            row.approval_status.as_deref(),
            row.email_id.as_deref(),
            row.queue_status.as_deref(),
        ),
        "queue_attempt_count": row.queue_attempt_count,
        "queue_last_error": row.queue_last_error,
        "queue_sent_at": row.queue_sent_at,
        "delivery_issue_reason": row.delivery_issue_reason,
        "approval_status": row.approval_status,
        "approval_rejection_reason": row.approval_rejection_reason,
        "can_remove_approval": row.can_remove_approval,
        "created_at": row.check_created_at,
        "stage": row.review_stage,
    })
}

fn normalize_queue_status(
    approval_status: Option<&str>,
    email_id: Option<&str>,
    queue_status: Option<&str>,
) -> Option<&'static str> {
    // Mirror normalizePostEmailQueueStatus().
    if queue_status == Some("queued") && approval_status != Some("APPROVED") && email_id.is_none() {
        return None;
    }

    if let Some(status) = queue_status {
        return queue_status_literal(status);
    }

    if email_id.is_some() {
        return Some("sent");
    }

    None
}

fn queue_status_literal(value: &str) -> Option<&'static str> {
    POST_EMAIL_QUEUE_STATUSES
        .into_iter()
        .find(|candidate| *candidate == value)
}

fn map_summary_row(row: Option<&PostEmailSummaryRow>) -> Value {
    let get = |selector: fn(&PostEmailSummaryRow) -> Option<i64>| -> i64 {
        row.and_then(selector).unwrap_or(0)
    };

    json!({
        "total": get(|row| row.total_count),
        "stages": {
            "missing_check": get(|row| row.missing_check_count),
            "pending_approval": get(|row| row.pending_approval_stage_count),
            "approved_awaiting_delivery": get(|row| row.approved_awaiting_delivery_count),
            "undeliverable": get(|row| row.undeliverable_count),
            "queued": get(|row| row.queued_stage_count),
            "processing": get(|row| row.processing_stage_count),
            "sent": get(|row| row.sent_stage_count),
            "delivery_failed": get(|row| row.delivery_failed_count),
            "skipped": get(|row| row.skipped_stage_count),
            "rejected": get(|row| row.rejected_stage_count),
        },
        "approvals": {
            "pending": get(|row| row.pending_approval_count),
            "approved": get(|row| row.approved_count),
            "rejected": get(|row| row.rejected_count),
            "skipped": get(|row| row.skipped_approval_count),
        },
        "queue": {
            "queued": get(|row| row.queued_count),
            "processing": get(|row| row.processing_count),
            "sent": get(|row| row.sent_count),
            "failed": get(|row| row.failed_count),
            "blocked": get(|row| row.blocked_count),
            "cancelled": get(|row| row.cancelled_count),
            "skipped": get(|row| row.queue_skipped_count),
        },
    })
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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

fn workspaces_posts_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_POSTS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_POSTS_PATH_SUFFIX)?;

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

fn post_email_max_age_cutoff() -> String {
    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let cutoff_millis = now_millis - POST_EMAIL_MAX_AGE_DAYS * 86_400_000;
    unix_millis_to_iso_timestamp(cutoff_millis)
}

fn unix_millis_to_iso_timestamp(unix_millis: i64) -> String {
    let seconds = unix_millis.div_euclid(1_000);
    let millis = unix_millis.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    (year + if month <= 2 { 1 } else { 0 }, month, day)
}

fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn value_in(value: &str, allowed: &[&str]) -> Option<String> {
    allowed
        .iter()
        .any(|candidate| *candidate == value)
        .then(|| value.to_owned())
}

fn unknown_message() -> String {
    "Unknown error".to_owned()
}

fn unknown_error<E>(_error: E) -> String {
    unknown_message()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(message: &str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "error": message })))
}
