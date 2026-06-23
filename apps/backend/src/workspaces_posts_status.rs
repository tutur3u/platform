use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_paginated_list::total_count_from_content_range,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const POST_CHECKS_QUERY_FAILED_MESSAGE: &str = "Failed to load post check status";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_POSTS_STATUS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_POSTS_STATUS_PATH_SUFFIX: &str = "/posts/status";

// Mirror of POST_EMAIL_MAX_AGE_DAYS in apps/web/src/lib/post-email-queue/constants.ts.
const POST_EMAIL_MAX_AGE_DAYS: i64 = 60;

// Mirror of POST_EMAIL_QUEUE_STATUSES in
// apps/web/src/lib/post-email-queue/statuses.ts. The summary response always
// includes every status key, defaulting to zero.
const POST_EMAIL_QUEUE_STATUSES: [&str; 7] = [
    "queued",
    "processing",
    "sent",
    "failed",
    "blocked",
    "cancelled",
    "skipped",
];

const POST_EMAIL_QUEUE_TABLE: &str = "post_email_queue";

// Page size for paging through joined post-check rows and queue rows, matching
// the legacy fetchAllPaginatedRows behaviour of fetching every matching row.
const SELECT_PAGE_SIZE: usize = 1_000;

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
struct UserGroupPostEmbed {
    id: Option<String>,
}

#[derive(Deserialize)]
struct PostCheckRow {
    user_group_posts: Option<UserGroupPostEmbed>,
}

#[derive(Deserialize)]
struct PostEmailQueueStatusRow {
    status: Option<String>,
}

#[derive(Serialize)]
struct PostStatusResponse {
    count: usize,
    queued: usize,
    processing: usize,
    sent: usize,
    failed: usize,
    blocked: usize,
    cancelled: usize,
    skipped: usize,
}

#[derive(Default)]
struct PostEmailQueueSummary {
    queued: usize,
    processing: usize,
    sent: usize,
    failed: usize,
    blocked: usize,
    cancelled: usize,
    skipped: usize,
}

pub(crate) async fn handle_workspaces_posts_status_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_posts_status_ws_id(request.path)?;

    Some(match request.method {
        "GET" => posts_status_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn posts_status_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
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

    // getPermissions() resolves the workspace id (handling slugs such as
    // "personal"/"internal") and rejects non-members with `null`, which the
    // legacy route maps to 401 Unauthorized.
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
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    }

    let query = PostStatusQuery::from_request_url(request.url);

    let cutoff = post_email_max_age_cutoff();

    let PostCheckQueryResult { count, post_ids } = match fetch_post_checks(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &cutoff,
        &query,
    )
    .await
    {
        Ok(result) => result,
        Err(message) => return error_response(500, &message),
    };

    let summary = match summarize_post_email_queue(&config.contact_data, outbound, &post_ids).await
    {
        Ok(summary) => summary,
        Err(message) => return error_response(500, &message),
    };

    no_store_response(json_response(
        200,
        PostStatusResponse {
            count,
            queued: summary.queued,
            processing: summary.processing,
            sent: summary.sent,
            failed: summary.failed,
            blocked: summary.blocked,
            cancelled: summary.cancelled,
            skipped: summary.skipped,
        },
    ))
}

struct PostStatusQuery {
    included_groups: Vec<String>,
    excluded_groups: Vec<String>,
    user_id: Option<String>,
}

impl PostStatusQuery {
    fn from_request_url(request_url: Option<&str>) -> Self {
        let mut included_groups = Vec::new();
        let mut excluded_groups = Vec::new();
        let mut user_id = None;

        if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
            for (key, value) in url.query_pairs() {
                match key.as_ref() {
                    "includedGroups" => included_groups.push(value.into_owned()),
                    "excludedGroups" => excluded_groups.push(value.into_owned()),
                    // searchParams.get('userId') keeps only the first value.
                    "userId" if user_id.is_none() => {
                        let value = value.into_owned();
                        if !value.is_empty() {
                            user_id = Some(value);
                        }
                    }
                    _ => {}
                }
            }
        }

        Self {
            included_groups,
            excluded_groups,
            user_id,
        }
    }
}

struct PostCheckQueryResult {
    count: usize,
    post_ids: Vec<String>,
}

/// Mirrors the legacy `user_group_post_checks` query (private schema). The
/// returned `count` matches the legacy PostgREST `count: 'exact'` (number of
/// matching joined rows, one per post check), read from the Content-Range
/// header. The distinct, non-null `user_group_posts.id` values drive the queue
/// summary, mirroring the legacy `postIds` Set.
async fn fetch_post_checks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    cutoff: &str,
    query: &PostStatusQuery,
) -> Result<PostCheckQueryResult, String> {
    let mut params: Vec<(&str, String)> = vec![
        (
            "select",
            "user_id,user_group_posts!inner(id,group_id,created_at),workspace_users!user_id!inner(ws_id)"
                .to_owned(),
        ),
        ("workspace_users.ws_id", format!("eq.{ws_id}")),
        ("workspace_users.email", "not.ilike.*@easy*".to_owned()),
        ("user_group_posts.created_at", format!("gte.{cutoff}")),
    ];

    if !query.included_groups.is_empty() {
        params.push((
            "user_group_posts.group_id",
            format!("in.({})", join_postgrest_in_list(&query.included_groups)),
        ));
    }
    if !query.excluded_groups.is_empty() {
        params.push((
            "user_group_posts.group_id",
            format!(
                "not.in.({})",
                join_postgrest_in_list(&query.excluded_groups)
            ),
        ));
    }
    if let Some(user_id) = &query.user_id {
        params.push(("user_id", format!("eq.{user_id}")));
    }

    let Some(url) = contact_data.rest_url("user_group_post_checks", &params) else {
        return Err(POST_CHECKS_QUERY_FAILED_MESSAGE.to_owned());
    };

    let mut post_ids = BTreeSet::new();
    let mut count: Option<usize> = None;
    let mut offset = 0usize;

    // Mirror fetchAllPaginatedRows: page through every matching row so the
    // distinct post-id set is complete, while reading the exact total count from
    // the first page's Content-Range header (count=exact).
    loop {
        let range = format!("{offset}-{}", offset + SELECT_PAGE_SIZE - 1);
        let response =
            send_service_role_private_request(contact_data, outbound, &url, Some(&range))
                .await
                .map_err(|_| POST_CHECKS_QUERY_FAILED_MESSAGE.to_owned())?;

        // PostgREST returns 206 Partial Content for ranged reads, which falls in
        // the 200..300 success range.
        if !(200..300).contains(&response.status) {
            return Err(postgrest_error_message(&response));
        }

        if count.is_none() {
            count = total_count_from_content_range(&response);
        }

        let rows = response
            .json::<Vec<PostCheckRow>>()
            .map_err(|_| POST_CHECKS_QUERY_FAILED_MESSAGE.to_owned())?;

        let page_len = rows.len();
        for row in rows {
            if let Some(id) = row
                .user_group_posts
                .and_then(|post| post.id)
                .filter(|id| !id.is_empty())
            {
                post_ids.insert(id);
            }
        }

        if page_len < SELECT_PAGE_SIZE {
            break;
        }
        offset += SELECT_PAGE_SIZE;
    }

    Ok(PostCheckQueryResult {
        count: count.unwrap_or(post_ids.len()),
        post_ids: post_ids.into_iter().collect(),
    })
}

async fn summarize_post_email_queue(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    post_ids: &[String],
) -> Result<PostEmailQueueSummary, String> {
    let mut summary = PostEmailQueueSummary::default();

    if post_ids.is_empty() {
        return Ok(summary);
    }

    let params: Vec<(&str, String)> = vec![
        ("select", "status".to_owned()),
        (
            "post_id",
            format!("in.({})", join_postgrest_in_list(post_ids)),
        ),
        ("order", "post_id.asc".to_owned()),
    ];

    let Some(url) = contact_data.rest_url(POST_EMAIL_QUEUE_TABLE, &params) else {
        return Err(POST_CHECKS_QUERY_FAILED_MESSAGE.to_owned());
    };

    let mut offset = 0usize;

    // Mirror getPostEmailQueueRows + fetchAllPaginatedRows: page through every
    // queue row for the matching posts and tally per-status counts.
    loop {
        let range = format!("{offset}-{}", offset + SELECT_PAGE_SIZE - 1);
        let response = send_service_role_public_paged_request(contact_data, outbound, &url, &range)
            .await
            .map_err(|_| POST_CHECKS_QUERY_FAILED_MESSAGE.to_owned())?;

        // PostgREST returns 206 Partial Content for ranged reads, which falls in
        // the 200..300 success range.
        if !(200..300).contains(&response.status) {
            return Err(postgrest_error_message(&response));
        }

        let rows = response
            .json::<Vec<PostEmailQueueStatusRow>>()
            .map_err(|_| POST_CHECKS_QUERY_FAILED_MESSAGE.to_owned())?;

        let page_len = rows.len();
        for row in rows {
            let Some(status) = row.status.as_deref() else {
                continue;
            };

            if !POST_EMAIL_QUEUE_STATUSES.contains(&status) {
                continue;
            }

            match status {
                "queued" => summary.queued += 1,
                "processing" => summary.processing += 1,
                "sent" => summary.sent += 1,
                "failed" => summary.failed += 1,
                "blocked" => summary.blocked += 1,
                "cancelled" => summary.cancelled += 1,
                "skipped" => summary.skipped += 1,
                _ => {}
            }
        }

        if page_len < SELECT_PAGE_SIZE {
            break;
        }
        offset += SELECT_PAGE_SIZE;
    }

    Ok(summary)
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
    let response = send_caller_public_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_public_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_service_role_public_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_public_request(contact_data, outbound, &url).await?;

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

async fn send_caller_public_request(
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

async fn send_service_role_public_request(
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

async fn send_service_role_private_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Content-Profile", PRIVATE_SCHEMA)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        // Mirror `count: 'exact'` so the Content-Range header carries the
        // total matching-row count.
        .with_header("Prefer", "count=exact");

    if let Some(range) = range {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }

    outbound.send(request).await.map_err(|_| ())
}

async fn send_service_role_public_paged_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", range),
        )
        .await
        .map_err(|_| ())
}

fn workspace_posts_status_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_POSTS_STATUS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_POSTS_STATUS_PATH_SUFFIX)?;

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

/// PostgREST `in.(...)` list builder. Values containing reserved characters are
/// wrapped in double quotes (with embedded quotes escaped) so UUIDs and plain
/// identifiers are passed through safely.
fn join_postgrest_in_list(values: &[String]) -> String {
    values
        .iter()
        .map(|value| {
            if value.is_empty()
                || value
                    .chars()
                    .any(|character| matches!(character, ',' | '(' | ')' | '"' | ' '))
            {
                format!("\"{}\"", value.replace('"', "\\\""))
            } else {
                value.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// Mirror of getPostEmailMaxAgeCutoff(): now minus POST_EMAIL_MAX_AGE_DAYS days,
/// formatted as an ISO-8601 UTC timestamp.
fn post_email_max_age_cutoff() -> String {
    let now_millis = unix_millis_now();
    let cutoff_millis = now_millis - POST_EMAIL_MAX_AGE_DAYS * 86_400 * 1_000;
    unix_millis_to_iso_timestamp(cutoff_millis)
}

fn unix_millis_now() -> i64 {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    duration.as_secs() as i64 * 1_000 + i64::from(duration.subsec_millis())
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// The legacy supabase failure branch responds with `{ error: error.message }`.
fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[derive(Deserialize)]
struct PostgrestErrorBody {
    message: Option<String>,
}

/// Best-effort extraction of the PostgREST `message` field, falling back to a
/// generic message so the response always carries a string `error`.
fn postgrest_error_message(response: &OutboundResponse) -> String {
    response
        .json::<PostgrestErrorBody>()
        .ok()
        .and_then(|body| body.message)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| POST_CHECKS_QUERY_FAILED_MESSAGE.to_owned())
}
