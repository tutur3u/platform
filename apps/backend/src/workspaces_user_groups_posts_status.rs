use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions to view user group posts";
const STATUS_SUMMARY_ERROR_MESSAGE: &str = "Error fetching group post status summary";

const VIEW_USER_GROUPS_POSTS_PERMISSION: &str = "view_user_groups_posts";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const POST_STATUS_SUMMARY_RPC: &str = "get_user_group_post_status_summary";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/status";
const USER_GROUPS_SEGMENT: &str = "user-groups";
const POSTS_SEGMENT: &str = "posts";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct PostStatusSummaryRequest<'a> {
    p_group_id: &'a str,
    p_post_id: &'a str,
    p_ws_id: &'a str,
}

// Mirror of GroupPostStatusSummaryRow: every `*_count` column the legacy route
// reads. PostgREST returns `bigint` columns as JSON numbers, captured as i64 and
// floored at zero (matching `Number(... ?? 0)`).
#[derive(Default, Deserialize)]
struct GroupPostStatusSummaryRow {
    #[serde(default)]
    total_count: Option<i64>,
    #[serde(default)]
    missing_check_count: Option<i64>,
    #[serde(default)]
    approved_awaiting_delivery_count: Option<i64>,
    #[serde(default)]
    sent_stage_count: Option<i64>,
    #[serde(default)]
    completed_count: Option<i64>,
    #[serde(default)]
    incomplete_count: Option<i64>,
    #[serde(default)]
    undeliverable_count: Option<i64>,
    #[serde(default)]
    queued_count: Option<i64>,
    #[serde(default)]
    processing_count: Option<i64>,
    #[serde(default)]
    sent_count: Option<i64>,
    #[serde(default)]
    failed_count: Option<i64>,
    #[serde(default)]
    blocked_count: Option<i64>,
    #[serde(default)]
    cancelled_count: Option<i64>,
    #[serde(default)]
    queue_skipped_count: Option<i64>,
}

struct PostStatusPath<'a> {
    raw_ws_id: &'a str,
    group_id: &'a str,
    post_id: &'a str,
}

pub(crate) async fn handle_workspaces_user_groups_posts_status_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let parsed = parse_post_status_path(request.path)?;

    Some(match request.method {
        "GET" => post_status_response(config, request, &parsed, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn post_status_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    parsed: &PostStatusPath<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // getPermissions() returning null -> 404 { error: 'Not found' }. The legacy
    // helper resolves the workspace id (handling slugs such as
    // "personal"/"internal"), confirms the caller is a workspace member, and
    // confirms the caller holds at least one permission; failures collapse to
    // null and 404 here.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return not_found_response();
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return not_found_response();
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        parsed.raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return not_found_response(),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return not_found_response(),
        Err(()) => return not_found_response(),
    }

    // withoutPermission('view_user_groups_posts') -> 403. has_workspace_permission
    // mirrors getPermissions' containsPermission (creator/admin/role/default).
    match has_workspace_permission(
        &config.contact_data,
        outbound,
        &user_id,
        &resolved_ws_id,
        VIEW_USER_GROUPS_POSTS_PERMISSION,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE),
        // A failed permission lookup means we cannot confirm the caller has the
        // permission, so deny access rather than leak the summary.
        Err(()) => return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE),
    }

    let summary = match fetch_post_status_summary(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        parsed.group_id,
        parsed.post_id,
    )
    .await
    {
        Ok(summary) => summary,
        Err(()) => return message_response(500, STATUS_SUMMARY_ERROR_MESSAGE),
    };

    post_status_summary_response(&summary)
}

fn post_status_summary_response(summary: &GroupPostStatusSummaryRow) -> BackendResponse {
    let sent_stage = count(summary.sent_stage_count);

    let queue = json!({
        "blocked": count(summary.blocked_count),
        "cancelled": count(summary.cancelled_count),
        "failed": count(summary.failed_count),
        "processing": count(summary.processing_count),
        "queued": count(summary.queued_count),
        "sent": count(summary.sent_count),
        "skipped": count(summary.queue_skipped_count),
    });

    no_store_response(json_response(
        200,
        json!({
            "approved_awaiting_delivery": count(summary.approved_awaiting_delivery_count),
            "can_remove_approval": sent_stage == 0,
            "checked": count(summary.completed_count),
            "count": count(summary.total_count),
            "failed": count(summary.incomplete_count),
            "missing_check": count(summary.missing_check_count),
            "queue": queue,
            "sent": sent_stage,
            "tentative": count(summary.missing_check_count),
            "undeliverable": count(summary.undeliverable_count),
        }),
    ))
}

async fn fetch_post_status_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
    post_id: &str,
) -> Result<GroupPostStatusSummaryRow, ()> {
    let rpc_url = contact_data.rpc_url(POST_STATUS_SUMMARY_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&PostStatusSummaryRequest {
        p_group_id: group_id,
        p_post_id: post_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");

    // The legacy route reads through `sbAdmin.schema('private')`, so the RPC is
    // resolved against the `private` schema via the PostgREST profile headers.
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // A set-returning RPC returns a JSON array; the legacy route reads `data[0]`
    // and defaults missing fields to zero.
    Ok(response
        .json::<Vec<GroupPostStatusSummaryRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .unwrap_or_default())
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    ws_id: &str,
    permission: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
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
        .is_some())
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

/// Match `/api/v1/workspaces/{wsId}/user-groups/{groupId}/posts/{postId}/status`
/// and extract the three dynamic segments. Returns None for any other path so
/// the dispatcher can fall through.
fn parse_post_status_path(path: &str) -> Option<PostStatusPath<'_>> {
    let inner = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    let mut segments = inner.split('/');
    let raw_ws_id = segments.next()?;
    let user_groups = segments.next()?;
    let group_id = segments.next()?;
    let posts = segments.next()?;
    let post_id = segments.next()?;

    if segments.next().is_some() {
        return None;
    }

    if user_groups != USER_GROUPS_SEGMENT || posts != POSTS_SEGMENT {
        return None;
    }

    if raw_ws_id.is_empty() || group_id.is_empty() || post_id.is_empty() {
        return None;
    }

    Some(PostStatusPath {
        raw_ws_id,
        group_id,
        post_id,
    })
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

/// Mirror of `Number(summary?.field ?? 0)`: nulls and negatives floor to zero.
fn count(value: Option<i64>) -> i64 {
    value.unwrap_or(0).max(0)
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
