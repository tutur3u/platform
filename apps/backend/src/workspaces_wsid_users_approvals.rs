//! Handler for `GET /api/v1/workspaces/:wsId/users/approvals`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/approvals/route.ts`.
//!
//! GET only — PUT and all other methods return `None` so the dispatch chain
//! falls through to the still-live Next.js route.
//!
//! ## Auth model
//!
//! Mirrors `getPermissions(...)` from the legacy route via
//! `workspace_permission_check::authorize_workspace_permission`:
//!
//! - Missing/invalid bearer token        → `401`
//! - Workspace not found or non-member   → `404`
//! - `kind=reports` missing `approve_reports` permission → `403`
//! - `kind=posts`   missing `approve_posts`   permission → `403`
//!
//! ## Behavior gaps
//!
//! - The `posts` path fetches `post_email_queue` in a single un-paginated
//!   request. For workspaces with very large result sets (over ~1 000 items)
//!   queue counts may be under-reported, but `limit` is capped at 100 so the
//!   practical impact is minimal.
//! - `creatorId` is not forwarded for `kind=posts`; the legacy route also
//!   ignores it for posts.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users/approvals";
const PRIVATE_SCHEMA: &str = "private";
const APPROVE_REPORTS_PERMISSION: &str = "approve_reports";
const APPROVE_POSTS_PERMISSION: &str = "approve_posts";

const POST_EMAIL_QUEUE_STATUSES: &[&str] = &[
    "queued",
    "processing",
    "sent",
    "failed",
    "blocked",
    "cancelled",
    "skipped",
];

// ---------------------------------------------------------------------------
// Public handler entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_users_approvals_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;
    Some(match request.method {
        "GET" => get_approvals(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_approvals(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Parse and validate query params — `kind` is required.
    let Some(query) = parse_query(request.url) else {
        return message_response(400, "Invalid query parameters");
    };

    // Choose permission based on kind, then authorize.
    let permission = match query.kind {
        ApprovalKind::Reports => APPROVE_REPORTS_PERMISSION,
        ApprovalKind::Posts => APPROVE_POSTS_PERMISSION,
    };

    let ws_id = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        permission,
        outbound,
    )
    .await
    {
        Ok(auth) => auth.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(404, "Not found");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Internal server error");
        }
    };

    let result = match query.kind {
        ApprovalKind::Reports => {
            fetch_reports(&config.contact_data, outbound, &ws_id, &query).await
        }
        ApprovalKind::Posts => fetch_posts(&config.contact_data, outbound, &ws_id, &query).await,
    };

    match result {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(()) => message_response(500, "Internal server error"),
    }
}

// ---------------------------------------------------------------------------
// Reports fetch
// ---------------------------------------------------------------------------

async fn fetch_reports(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ApprovalsQuery,
) -> Result<Value, ()> {
    let mut base: Vec<(&str, String)> = vec![("user_ws_id", format!("eq.{ws_id}"))];
    if let Some(ref gid) = query.group_id {
        base.push(("group_id", format!("eq.{gid}")));
    }
    if let Some(ref uid) = query.user_id {
        base.push(("user_id", format!("eq.{uid}")));
    }
    if let Some(ref cid) = query.creator_id {
        base.push(("creator_id", format!("eq.{cid}")));
    }
    if query.status != "all" {
        base.push((
            "report_approval_status",
            format!("eq.{}", query.status.to_uppercase()),
        ));
    }

    // Count.
    let mut count_params = base.clone();
    count_params.push(("select", "id".to_owned()));
    let count_url = contact_data
        .rest_url(
            "external_user_monthly_reports_workspace_view",
            &count_params,
        )
        .ok_or(())?;
    let count_resp = private_count_request(contact_data, outbound, &count_url).await?;
    let total_count = total_count_from_content_range(&count_resp).unwrap_or(0);

    // Data.
    let range = page_range(query.page, query.limit);
    let mut data_params = base;
    data_params.push((
        "select",
        concat!(
            "id,title,content,feedback,score,scores,created_at,updated_by,",
            "user_id,group_id,creator_id,report_approval_status,rejection_reason,",
            "approved_at,rejected_at,modifier_display_name,modifier_full_name,",
            "modifier_email,creator_full_name,user_full_name,group_name,updated_at"
        )
        .to_owned(),
    ));
    data_params.push(("order", "updated_at.desc".to_owned()));
    let data_url = contact_data
        .rest_url("external_user_monthly_reports_workspace_view", &data_params)
        .ok_or(())?;
    let data_resp = private_data_request(contact_data, outbound, &data_url, &range).await?;
    if !(200..300).contains(&data_resp.status) {
        return Err(());
    }

    let rows = data_resp.json::<Vec<Value>>().map_err(|_| ())?;
    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let modifier_name = first_nonempty_str(
                &row,
                &[
                    "modifier_display_name",
                    "modifier_full_name",
                    "modifier_email",
                    "creator_full_name",
                ],
            );
            json!({
                "id": row["id"],
                "title": row["title"],
                "content": row["content"],
                "feedback": row["feedback"],
                "score": row["score"],
                "scores": row["scores"],
                "created_at": row["created_at"],
                "updated_by": row["updated_by"],
                "user_id": row["user_id"],
                "group_id": row["group_id"],
                "creator_id": row["creator_id"],
                "report_approval_status": row["report_approval_status"],
                "rejection_reason": row["rejection_reason"],
                "approved_at": row["approved_at"],
                "rejected_at": row["rejected_at"],
                "group_name": row["group_name"],
                "user_name": row["user_full_name"],
                "modifier_name": modifier_name,
                "creator_name": row["creator_full_name"],
            })
        })
        .collect();

    Ok(json!({
        "items": items,
        "totalCount": total_count,
        "totalPages": ceil_div(total_count, query.limit as usize),
    }))
}

// ---------------------------------------------------------------------------
// Posts fetch
// ---------------------------------------------------------------------------

async fn fetch_posts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ApprovalsQuery,
) -> Result<Value, ()> {
    // Count.
    let mut count_params: Vec<(&str, String)> =
        vec![
        (
            "select",
            "post_id,user_id,user_group_posts!inner(group_id,workspace_user_groups!inner(ws_id))"
                .to_owned(),
        ),
        ("user_group_posts.workspace_user_groups.ws_id", format!("eq.{ws_id}")),
    ];
    if let Some(ref gid) = query.group_id {
        count_params.push(("user_group_posts.group_id", format!("eq.{gid}")));
    }
    if let Some(ref uid) = query.user_id {
        count_params.push(("user_id", format!("eq.{uid}")));
    }
    if query.status != "all" {
        count_params.push((
            "approval_status",
            format!("eq.{}", query.status.to_uppercase()),
        ));
    }
    let count_url = contact_data
        .rest_url("user_group_post_checks", &count_params)
        .ok_or(())?;
    let count_resp = private_count_request(contact_data, outbound, &count_url).await?;
    let total_count = total_count_from_content_range(&count_resp).unwrap_or(0);

    // Data.
    let range = page_range(query.page, query.limit);
    let mut data_params: Vec<(&str, String)> = vec![
        (
            "select",
            concat!(
                "post_id,user_id,notes,is_completed,approval_status,rejection_reason,",
                "approved_at,rejected_at,approved_by,",
                "post:user_group_posts!inner(id,title,content,notes,created_at,updated_by,group_id,",
                "modifier:workspace_users!updated_by(display_name,full_name,email),",
                "workspace_user_groups!inner(name,ws_id)),",
                "user:workspace_users!user_id!inner(full_name,display_name,email)"
            )
            .to_owned(),
        ),
        ("post.workspace_user_groups.ws_id", format!("eq.{ws_id}")),
        ("order", "approved_at.desc,created_at.desc".to_owned()),
    ];
    if let Some(ref gid) = query.group_id {
        data_params.push(("post.group_id", format!("eq.{gid}")));
    }
    if let Some(ref uid) = query.user_id {
        data_params.push(("user_id", format!("eq.{uid}")));
    }
    if query.status != "all" {
        data_params.push((
            "approval_status",
            format!("eq.{}", query.status.to_uppercase()),
        ));
    }
    let data_url = contact_data
        .rest_url("user_group_post_checks", &data_params)
        .ok_or(())?;
    let data_resp = private_data_request(contact_data, outbound, &data_url, &range).await?;
    if !(200..300).contains(&data_resp.status) {
        return Err(());
    }

    let rows = data_resp.json::<Vec<Value>>().map_err(|_| ())?;

    let post_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r["post_id"].as_str().map(ToOwned::to_owned))
        .collect();

    // Fetch post_email_queue for the returned post IDs.
    let queue_by_recipient: std::collections::HashMap<String, String> = if post_ids.is_empty() {
        std::collections::HashMap::new()
    } else {
        let filter = format!("in.({})", post_ids.join(","));
        let url = contact_data
            .rest_url(
                "post_email_queue",
                &[
                    ("select", "post_id,user_id,status".to_owned()),
                    ("post_id", filter),
                    ("order", "post_id.asc,user_id.asc".to_owned()),
                ],
            )
            .ok_or(())?;
        let resp = service_role_get(contact_data, outbound, &url).await?;
        if !(200..300).contains(&resp.status) {
            return Err(());
        }
        let queue_rows = resp.json::<Vec<Value>>().map_err(|_| ())?;
        queue_rows
            .into_iter()
            .filter_map(|r| {
                let pid = r["post_id"].as_str()?.to_owned();
                let uid = r["user_id"].as_str()?.to_owned();
                let status = r["status"].as_str()?.to_owned();
                Some((format!("{pid}:{uid}"), status))
            })
            // keep only the first row per key (matching getPostEmailQueueRows order)
            .fold(
                std::collections::HashMap::new(),
                |mut map, (key, status)| {
                    map.entry(key).or_insert(status);
                    map
                },
            )
    };

    // Fetch sent_emails to determine can_remove_approval.
    let sent_ids: std::collections::HashSet<String> = if post_ids.is_empty() {
        std::collections::HashSet::new()
    } else {
        let filter = format!("in.({})", post_ids.join(","));
        let url = contact_data
            .rest_url(
                "sent_emails",
                &[
                    ("select", "post_id,receiver_id".to_owned()),
                    ("post_id", filter),
                ],
            )
            .ok_or(())?;
        let resp = service_role_get(contact_data, outbound, &url).await?;
        if !(200..300).contains(&resp.status) {
            return Err(());
        }
        resp.json::<Vec<Value>>()
            .map_err(|_| ())?
            .into_iter()
            .filter_map(|r| {
                Some(format!(
                    "{}:{}",
                    r["post_id"].as_str()?,
                    r["receiver_id"].as_str()?
                ))
            })
            .collect()
    };

    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let post_id = row["post_id"].as_str().unwrap_or("");
            let user_id = row["user_id"].as_str().unwrap_or("");
            let item_id = format!("{post_id}:{user_id}");

            let approval_status = row["approval_status"].as_str();
            let queue_status = queue_by_recipient.get(&item_id).map(String::as_str);
            let can_remove_approval = approval_status == Some("APPROVED")
                && !sent_ids.contains(&item_id)
                && queue_status != Some("sent");

            let modifier_name = first_nonempty_str(
                &row["post"]["modifier"],
                &["display_name", "full_name", "email"],
            );
            let user_name =
                first_nonempty_str(&row["user"], &["full_name", "display_name", "email"]);
            let notes = if row["notes"].is_null() {
                row["post"]["notes"].clone()
            } else {
                row["notes"].clone()
            };

            json!({
                "id": item_id,
                "title": row["post"]["title"],
                "content": row["post"]["content"],
                "notes": notes,
                "created_at": row["post"]["created_at"],
                "updated_by": row["post"]["updated_by"],
                "post_approval_status": row["approval_status"],
                "rejection_reason": row["rejection_reason"],
                "approved_at": row["approved_at"],
                "rejected_at": row["rejected_at"],
                "group_id": row["post"]["group_id"],
                "group_name": row["post"]["workspace_user_groups"]["name"],
                "user_id": user_id,
                "user_name": user_name,
                "post_id": post_id,
                "is_completed": row["is_completed"],
                "modifier_name": modifier_name,
                "can_remove_approval": can_remove_approval,
                "queue_counts": summarize_queue_status(queue_status),
            })
        })
        .collect();

    Ok(json!({
        "items": items,
        "totalCount": total_count,
        "totalPages": ceil_div(total_count, query.limit as usize),
    }))
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn private_count_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {key}"))
                .with_header("apikey", key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", "0-0"),
        )
        .await
        .map_err(|_| ())
}

async fn private_data_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: &str,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {key}"))
                .with_header("apikey", key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Range-Unit", "items")
                .with_header("Range", range),
        )
        .await
        .map_err(|_| ())
}

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {key}"))
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<usize>().ok()
}

/// Returns the first non-null, non-empty string field value in `obj`.
fn first_nonempty_str(obj: &Value, fields: &[&str]) -> Value {
    for field in fields {
        if let Some(s) = obj[field].as_str()
            && !s.is_empty()
        {
            return Value::String(s.to_owned());
        }
    }
    Value::Null
}

/// Mirrors `summarizePostEmailQueue([row?])`: returns a map with a count of 1
/// for the given `status` and 0 for all others. `None` yields all zeros.
fn summarize_queue_status(status: Option<&str>) -> Value {
    let mut map = serde_json::Map::new();
    for &s in POST_EMAIL_QUEUE_STATUSES {
        let count = u64::from(status == Some(s));
        map.insert(s.to_owned(), Value::Number(count.into()));
    }
    Value::Object(map)
}

/// Converts (page, limit) → PostgREST `Range` header value (inclusive).
fn page_range(page: i64, limit: i64) -> String {
    let from = (page - 1).max(0) * limit;
    let to = from + limit - 1;
    format!("{from}-{to}")
}

fn ceil_div(total: usize, limit: usize) -> usize {
    if limit == 0 {
        return 0;
    }
    total.div_ceil(limit)
}

// ---------------------------------------------------------------------------
// Query parameter parsing
// ---------------------------------------------------------------------------

enum ApprovalKind {
    Reports,
    Posts,
}

struct ApprovalsQuery {
    kind: ApprovalKind,
    status: String,
    page: i64,
    limit: i64,
    group_id: Option<String>,
    user_id: Option<String>,
    creator_id: Option<String>,
}

/// Parses and validates the GET query parameters. Returns `None` when `kind`
/// is absent or not in `['reports', 'posts']` (mirrors Zod `safeParse` failure).
fn parse_query(url: Option<&str>) -> Option<ApprovalsQuery> {
    let mut kind: Option<ApprovalKind> = None;
    let mut status = "all".to_owned();
    let mut page: i64 = 1;
    let mut limit: i64 = 10;
    let mut group_id: Option<String> = None;
    let mut user_id: Option<String> = None;
    let mut creator_id: Option<String> = None;

    if let Some(raw) = url
        && let Ok(parsed) = url::Url::parse(raw)
    {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "kind" if kind.is_none() => {
                    kind = match value.as_ref() {
                        "reports" => Some(ApprovalKind::Reports),
                        "posts" => Some(ApprovalKind::Posts),
                        _ => return None,
                    };
                }
                "status" => {
                    if matches!(value.as_ref(), "all" | "pending" | "approved" | "rejected") {
                        status = value.into_owned();
                    }
                }
                "page" => {
                    if let Ok(v) = value.parse::<i64>()
                        && v >= 1
                    {
                        page = v;
                    }
                }
                "limit" => {
                    if let Ok(v) = value.parse::<i64>()
                        && (1..=100).contains(&v)
                    {
                        limit = v;
                    }
                }
                "groupId" => {
                    let s = value.into_owned();
                    if !s.is_empty() {
                        group_id = Some(s);
                    }
                }
                "userId" => {
                    let s = value.into_owned();
                    if !s.is_empty() {
                        user_id = Some(s);
                    }
                }
                "creatorId" => {
                    let s = value.into_owned();
                    if !s.is_empty() {
                        creator_id = Some(s);
                    }
                }
                _ => {}
            }
        }
    }

    Some(ApprovalsQuery {
        kind: kind?,
        status,
        page,
        limit,
        group_id,
        user_id,
        creator_id,
    })
}

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

/// Extracts `:wsId` from `/api/v1/workspaces/:wsId/users/approvals`.
/// Returns `None` when the path does not match or the segment contains `/`.
fn extract_ws_id(path: &str) -> Option<&str> {
    let inner = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!inner.is_empty() && !inner.contains('/')).then_some(inner)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- path guard ---

    #[test]
    fn extract_ws_id_happy_path() {
        assert_eq!(
            extract_ws_id(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/users/approvals"
            ),
            Some("00000000-0000-0000-0000-000000000001")
        );
    }

    #[test]
    fn extract_ws_id_rejects_extra_segments() {
        assert!(extract_ws_id("/api/v1/workspaces/abc/extra/users/approvals").is_none());
    }

    #[test]
    fn extract_ws_id_rejects_wrong_prefix() {
        assert!(extract_ws_id("/api/v2/workspaces/abc/users/approvals").is_none());
    }

    #[test]
    fn extract_ws_id_rejects_wrong_suffix() {
        assert!(extract_ws_id("/api/v1/workspaces/abc/users/pending").is_none());
    }

    // --- query parsing ---

    #[test]
    fn parse_query_requires_kind() {
        assert!(parse_query(Some("http://host/path")).is_none());
    }

    #[test]
    fn parse_query_rejects_invalid_kind() {
        assert!(parse_query(Some("http://host/path?kind=unknown")).is_none());
    }

    #[test]
    fn parse_query_reports_defaults() {
        let q = parse_query(Some("http://host/path?kind=reports")).unwrap();
        assert!(matches!(q.kind, ApprovalKind::Reports));
        assert_eq!(q.status, "all");
        assert_eq!(q.page, 1);
        assert_eq!(q.limit, 10);
        assert!(q.group_id.is_none());
        assert!(q.user_id.is_none());
        assert!(q.creator_id.is_none());
    }

    #[test]
    fn parse_query_posts_with_filters() {
        let q = parse_query(Some(
            "http://host/path?kind=posts&status=pending&page=3&limit=25&groupId=g1&userId=u1",
        ))
        .unwrap();
        assert!(matches!(q.kind, ApprovalKind::Posts));
        assert_eq!(q.status, "pending");
        assert_eq!(q.page, 3);
        assert_eq!(q.limit, 25);
        assert_eq!(q.group_id.as_deref(), Some("g1"));
        assert_eq!(q.user_id.as_deref(), Some("u1"));
    }

    #[test]
    fn parse_query_clamps_limit_over_100() {
        // Out-of-range limit keeps the default.
        let q = parse_query(Some("http://host/path?kind=reports&limit=999")).unwrap();
        assert_eq!(q.limit, 10);
    }

    #[test]
    fn parse_query_ignores_invalid_status() {
        let q = parse_query(Some("http://host/path?kind=reports&status=bogus")).unwrap();
        assert_eq!(q.status, "all");
    }

    // --- page_range ---

    #[test]
    fn page_range_first_page_default_limit() {
        assert_eq!(page_range(1, 10), "0-9");
    }

    #[test]
    fn page_range_second_page() {
        assert_eq!(page_range(2, 10), "10-19");
    }

    // --- ceil_div ---

    #[test]
    fn ceil_div_exact() {
        assert_eq!(ceil_div(20, 10), 2);
    }

    #[test]
    fn ceil_div_remainder() {
        assert_eq!(ceil_div(21, 10), 3);
    }

    #[test]
    fn ceil_div_zero_total() {
        assert_eq!(ceil_div(0, 10), 0);
    }

    // --- summarize_queue_status ---

    #[test]
    fn summarize_none_all_zeros() {
        let counts = summarize_queue_status(None);
        for s in POST_EMAIL_QUEUE_STATUSES {
            assert_eq!(counts[s], json!(0), "status {s} should be 0");
        }
    }

    #[test]
    fn summarize_sent_marks_one() {
        let counts = summarize_queue_status(Some("sent"));
        assert_eq!(counts["sent"], json!(1));
        assert_eq!(counts["queued"], json!(0));
    }

    #[test]
    fn summarize_queued_marks_one() {
        let counts = summarize_queue_status(Some("queued"));
        assert_eq!(counts["queued"], json!(1));
        assert_eq!(counts["sent"], json!(0));
    }

    // --- first_nonempty_str ---

    #[test]
    fn first_nonempty_str_picks_first_present() {
        let obj = json!({ "a": null, "b": "hello", "c": "world" });
        assert_eq!(first_nonempty_str(&obj, &["a", "b", "c"]), json!("hello"));
    }

    #[test]
    fn first_nonempty_str_returns_null_when_all_absent() {
        let obj = json!({});
        assert_eq!(first_nonempty_str(&obj, &["x", "y"]), Value::Null);
    }
}
