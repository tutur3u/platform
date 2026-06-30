//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/members/:userId/feedbacks`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/feedbacks/route.ts`.
//!
//! The legacy route also exposes `POST`, `PUT`, and `DELETE` handlers; only
//! `GET` is ported here. Every non-GET method returns `None` so the worker
//! falls through to the still-live Next.js route.
//!
//! The legacy GET flow:
//!
//!   1. Call `getPermissions({ wsId, request })`; if null, respond with
//!      `404 { "error": "Not found" }`.
//!   2. If `withoutPermission('view_user_groups')`, respond with
//!      `403 { "message": "Insufficient permissions to view user groups" }`.
//!   3. Parse `offset` (default 0) and `limit` (default 10) from the query
//!      string.
//!   4. Read rows from `user_feedbacks` (service-role client), filtered by
//!      `user_id = userId` and `group_id = groupId`, ordered by `created_at`
//!      descending, with a range of `offset` to `offset + limit - 1`, with
//!      exact count.
//!   5. Normalize each row via `normalizeWorkspaceFeedback` — `user` and
//!      `group` are always `null` in this code path; only `creator` (from the
//!      `workspace_users` join) is populated.
//!   6. Respond `200 { "data": feedbacks[], "count": count, "hasMore": bool }`.
//!
//! Auth is delegated to
//! `workspace_permission_check::authorize_workspace_permission`, which
//! performs workspace-id normalization, membership lookup, and the
//! `view_user_groups` permission check in one call.
//!
//! BEHAVIOR GAPS vs legacy:
//!
//!   - The shared auth helper collapses several legacy auth failure modes.
//!     This handler maps both `Unauthorized` and `NotFound` to
//!     `404 { "error": "Not found" }` and `Forbidden` to the `403` message.
//!   - The total count is parsed from the PostgREST `Content-Range` response
//!     header (present when `Prefer: count=exact` is sent). If the header is
//!     absent or unparseable, count defaults to 0.
//!   - `user_name` is always `"Unknown User"` and `group_name` is always
//!     `"Unknown Group"` because the legacy route passes `user: null` and
//!     `group: null` to `normalizeWorkspaceFeedback` for this endpoint.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_USER_GROUPS_INFIX: &str = "/user-groups/";
const PATH_MEMBERS_INFIX: &str = "/members/";
const PATH_FEEDBACKS_SUFFIX: &str = "/feedbacks";

const VIEW_PERMISSION: &str = "view_user_groups";
const FEEDBACKS_TABLE: &str = "user_feedbacks";

/// PostgREST select columns including the creator join.
const SELECT_COLS: &str = "id,content,require_attention,created_at,creator_id,\
    creator:workspace_users!user_feedbacks_creator_id_fkey(full_name,display_name)";

const DEFAULT_OFFSET: i64 = 0;
const DEFAULT_LIMIT: i64 = 10;

const NOT_FOUND_ERROR: &str = "Not found";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view user groups";
const FETCH_ERROR_MESSAGE: &str = "Error fetching feedbacks";

/// Creator sub-row returned by the `workspace_users` foreign-key join.
#[derive(Deserialize)]
struct CreatorRow {
    full_name: Option<String>,
    display_name: Option<String>,
}

/// Raw row returned from `user_feedbacks`.
#[derive(Deserialize)]
struct FeedbackRow {
    id: Option<Value>,
    content: Option<Value>,
    require_attention: Option<Value>,
    created_at: Option<Value>,
    creator_id: Option<Value>,
    creator: Option<CreatorRow>,
}

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_members_userid_feedbacks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id, user_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => {
            feedbacks_get_response(config, request, raw_ws_id, group_id, user_id, outbound).await
        }
        _ => return None,
    })
}

async fn feedbacks_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return error_response(404, NOT_FOUND_ERROR);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    let (offset, limit) = parse_pagination(request.url);

    match fetch_feedbacks(
        contact_data,
        outbound,
        &authorization.ws_id,
        group_id,
        user_id,
        offset,
        limit,
    )
    .await
    {
        Ok((rows, count)) => {
            let has_more = count > offset + limit;
            let feedbacks: Vec<Value> = rows
                .into_iter()
                .map(|row| normalize_feedback(row, user_id, group_id))
                .collect();
            no_store_response(json_response(
                200,
                json!({
                    "data": feedbacks,
                    "count": count,
                    "hasMore": has_more,
                }),
            ))
        }
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_feedbacks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    _ws_id: &str,
    group_id: &str,
    user_id: &str,
    offset: i64,
    limit: i64,
) -> Result<(Vec<FeedbackRow>, i64), ()> {
    // The legacy route does not filter by ws_id — it relies on group_id and
    // user_id uniqueness plus the upstream auth check.
    let Some(url) = contact_data.rest_url(
        FEEDBACKS_TABLE,
        &[
            ("select", SELECT_COLS.to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("group_id", format!("eq.{group_id}")),
            ("order", "created_at.desc".to_owned()),
            ("offset", offset.to_string()),
            ("limit", limit.to_string()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = parse_content_range_count(response.header("Content-Range")).unwrap_or(0);
    let rows = response.json::<Vec<FeedbackRow>>().map_err(|_| ())?;

    Ok((rows, count))
}

/// Parse the total row count from a PostgREST `Content-Range` header value.
///
/// Expected formats:
///
/// - `"0-9/42"` — rows 0 through 9 of 42 total
/// - `"*/0"` or `"*/*"` — no rows / unknown total (treated as 0)
fn parse_content_range_count(header: Option<&str>) -> Option<i64> {
    let header = header?;
    let total = header.split('/').nth(1)?;
    if total == "*" {
        return Some(0);
    }
    total.parse().ok()
}

/// Normalize a raw `user_feedbacks` row into the legacy
/// `normalizeWorkspaceFeedback` output shape.
///
/// In this context the legacy caller passes `user: null` and `group: null`,
/// so `user_name` is always `"Unknown User"` and `group_name` is always
/// `"Unknown Group"`. `creator_name` follows the legacy
/// `getWorkspaceUserDisplayName` logic: `full_name` → `display_name` →
/// `"Unknown User"`.
fn normalize_feedback(row: FeedbackRow, user_id: &str, group_id: &str) -> Value {
    let creator_name: String = match &row.creator {
        Some(c) => c
            .full_name
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| c.display_name.as_deref().filter(|s| !s.trim().is_empty()))
            .map(str::to_owned)
            .unwrap_or_else(|| "Unknown User".to_owned()),
        None => "Unknown User".to_owned(),
    };

    let creator = row.creator.map(|c| {
        json!({
            "id": null,
            "full_name": c.full_name,
            "display_name": c.display_name,
            "email": null,
        })
    });

    json!({
        "id": row.id.unwrap_or(Value::Null),
        "user_id": user_id,
        "group_id": group_id,
        "creator_id": row.creator_id.unwrap_or(Value::Null),
        "content": row.content.unwrap_or(Value::Null),
        "require_attention": row.require_attention.unwrap_or(Value::Null),
        "created_at": row.created_at.unwrap_or(Value::Null),
        "user": null,
        "creator": creator,
        "group": null,
        "user_name": "Unknown User",
        "creator_name": creator_name,
        "group_name": "Unknown Group",
    })
}

/// Parse `offset` and `limit` from the request URL query string.
///
/// Defaults: `offset = 0`, `limit = 10` (matching the legacy route).
fn parse_pagination(request_url: Option<&str>) -> (i64, i64) {
    let Some(url_str) = request_url else {
        return (DEFAULT_OFFSET, DEFAULT_LIMIT);
    };
    let Ok(parsed) = url::Url::parse(url_str) else {
        return (DEFAULT_OFFSET, DEFAULT_LIMIT);
    };

    let mut offset = DEFAULT_OFFSET;
    let mut limit = DEFAULT_LIMIT;

    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "offset" => {
                if let Ok(v) = value.parse::<i64>() {
                    offset = v;
                }
            }
            "limit" => {
                if let Ok(v) = value.parse::<i64>() {
                    limit = v;
                }
            }
            _ => {}
        }
    }

    (offset, limit)
}

/// Extract `(ws_id, group_id, user_id)` from the route path.
///
/// Expected path shape:
/// `/api/v1/workspaces/:wsId/user-groups/:groupId/members/:userId/feedbacks`
///
/// All three dynamic segments must be non-empty and must not contain `/`.
fn parse_path(path: &str) -> Option<(&str, &str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_USER_GROUPS_INFIX)?;
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    let (group_id, after_group) = after_ws.split_once(PATH_MEMBERS_INFIX)?;
    if group_id.is_empty() || group_id.contains('/') {
        return None;
    }
    let user_id = after_group.strip_suffix(PATH_FEEDBACKS_SUFFIX)?;
    if user_id.is_empty() || user_id.contains('/') {
        return None;
    }
    Some((ws_id, group_id, user_id))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS_ID: &str = "aaaaaaaa-0000-0000-0000-000000000001";
    const GROUP_ID: &str = "bbbbbbbb-0000-0000-0000-000000000002";
    const USER_ID: &str = "cccccccc-0000-0000-0000-000000000003";

    // ----- parse_path -----

    #[test]
    fn parse_path_valid() {
        let path = format!(
            "/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members/{USER_ID}/feedbacks"
        );
        assert_eq!(parse_path(&path), Some((WS_ID, GROUP_ID, USER_ID)));
    }

    #[test]
    fn parse_path_accepts_personal_slug() {
        let path = format!(
            "/api/v1/workspaces/personal/user-groups/{GROUP_ID}/members/{USER_ID}/feedbacks"
        );
        assert_eq!(parse_path(&path), Some(("personal", GROUP_ID, USER_ID)));
    }

    #[test]
    fn parse_path_rejects_empty_ws_id() {
        let path =
            format!("/api/v1/workspaces//user-groups/{GROUP_ID}/members/{USER_ID}/feedbacks");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_empty_group_id() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups//members/{USER_ID}/feedbacks");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_empty_user_id() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members//feedbacks");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_wrong_suffix() {
        let path =
            format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members/{USER_ID}/other");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_missing_feedbacks() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members/{USER_ID}");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_wrong_prefix() {
        let path =
            format!("/api/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members/{USER_ID}/feedbacks");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_extra_trailing_segment() {
        let path = format!(
            "/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members/{USER_ID}/feedbacks/extra"
        );
        assert!(parse_path(&path).is_none());
    }

    // ----- parse_content_range_count -----

    #[test]
    fn content_range_parses_total() {
        assert_eq!(parse_content_range_count(Some("0-9/42")), Some(42));
    }

    #[test]
    fn content_range_parses_zero_total() {
        assert_eq!(parse_content_range_count(Some("*/0")), Some(0));
    }

    #[test]
    fn content_range_parses_star_star() {
        assert_eq!(parse_content_range_count(Some("*/*")), Some(0));
    }

    #[test]
    fn content_range_returns_none_on_missing() {
        assert_eq!(parse_content_range_count(None), None);
    }

    // ----- parse_pagination -----

    #[test]
    fn pagination_defaults_when_no_url() {
        assert_eq!(parse_pagination(None), (0, 10));
    }

    #[test]
    fn pagination_parses_offset_and_limit() {
        assert_eq!(
            parse_pagination(Some("https://example.com/api?offset=20&limit=5")),
            (20, 5)
        );
    }

    #[test]
    fn pagination_uses_defaults_for_missing_params() {
        assert_eq!(parse_pagination(Some("https://example.com/api")), (0, 10));
    }

    #[test]
    fn pagination_ignores_invalid_values() {
        assert_eq!(
            parse_pagination(Some("https://example.com/api?offset=abc&limit=xyz")),
            (0, 10)
        );
    }

    // ----- normalize_feedback -----

    #[test]
    fn normalize_feedback_with_creator_full_name() {
        let row = FeedbackRow {
            id: Some(json!("fb-1")),
            content: Some(json!("Great work")),
            require_attention: Some(json!(false)),
            created_at: Some(json!("2024-01-01T00:00:00Z")),
            creator_id: Some(json!("creator-1")),
            creator: Some(CreatorRow {
                full_name: Some("Alice".to_owned()),
                display_name: None,
            }),
        };
        let value = normalize_feedback(row, USER_ID, GROUP_ID);
        assert_eq!(value["user_id"], USER_ID);
        assert_eq!(value["group_id"], GROUP_ID);
        assert_eq!(value["user_name"], "Unknown User");
        assert_eq!(value["creator_name"], "Alice");
        assert_eq!(value["group_name"], "Unknown Group");
        assert_eq!(value["user"], Value::Null);
        assert_eq!(value["group"], Value::Null);
    }

    #[test]
    fn normalize_feedback_falls_back_to_display_name() {
        let row = FeedbackRow {
            id: Some(json!("fb-2")),
            content: Some(json!("Nice")),
            require_attention: Some(json!(false)),
            created_at: Some(json!("2024-01-01T00:00:00Z")),
            creator_id: Some(json!("creator-2")),
            creator: Some(CreatorRow {
                full_name: None,
                display_name: Some("Bob".to_owned()),
            }),
        };
        let value = normalize_feedback(row, USER_ID, GROUP_ID);
        assert_eq!(value["creator_name"], "Bob");
    }

    #[test]
    fn normalize_feedback_without_creator() {
        let row = FeedbackRow {
            id: Some(json!("fb-3")),
            content: Some(json!("Test")),
            require_attention: Some(json!(true)),
            created_at: Some(json!("2024-01-01T00:00:00Z")),
            creator_id: None,
            creator: None,
        };
        let value = normalize_feedback(row, USER_ID, GROUP_ID);
        assert_eq!(value["creator_name"], "Unknown User");
        assert_eq!(value["creator"], Value::Null);
    }

    // ----- response helpers -----

    #[test]
    fn message_response_shape() {
        let resp = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "message": FORBIDDEN_MESSAGE }));
    }

    #[test]
    fn error_response_shape() {
        let resp = error_response(404, NOT_FOUND_ERROR);
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body, json!({ "error": NOT_FOUND_ERROR }));
    }
}
