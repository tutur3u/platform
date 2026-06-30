//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/group-checks`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/route.ts`.
//!
//! GET behavior:
//!
//! - Requires a `postId` query parameter; absent -> 400 `{ message: "Post ID is required" }`.
//! - Resolves the workspace, confirms membership, and checks the
//!   `view_user_groups_posts` permission via
//!   `workspace_permission_check::authorize_workspace_permission`.
//!   A missing or invalid session, or an unresolved workspace, returns
//!   404 `{ error: "Not found" }` (matching the legacy `getPermissions` -> null
//!   path). A permission denial returns 403 `{ message: "Insufficient permissions
//!   to view user group posts" }`.
//! - Verifies the post exists in the given workspace and group via the `private`
//!   schema `user_group_posts` table. Not found -> 404 `{ message: "Post not
//!   found" }`. A Supabase error -> 500 `{ message: "Error resolving user group
//!   post workspace" }`.
//! - Reads `private.user_group_post_checks` filtered by `post_id` and returns
//!   the JSON array (or `[]` when empty). A read error returns 500
//!   `{ message: "Error fetching group checks" }`.
//!
//! POST is NOT migrated; `None` is returned for every non-GET method so the
//! dispatch chain falls through to the still-live Next.js route.
//!
//! Behavior gaps: none for the GET path.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/group-checks";
const USER_GROUPS_SEGMENT: &str = "user-groups";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_USER_GROUPS_POSTS_PERMISSION: &str = "view_user_groups_posts";

const NOT_FOUND_MSG: &str = "Not found";
const POST_NOT_FOUND_MSG: &str = "Post not found";
const INSUFFICIENT_PERMISSIONS_MSG: &str = "Insufficient permissions to view user group posts";
const POST_ID_REQUIRED_MSG: &str = "Post ID is required";
const ERROR_RESOLVING_POST_MSG: &str = "Error resolving user group post workspace";
const ERROR_FETCHING_CHECKS_MSG: &str = "Error fetching group checks";

struct GroupChecksPath<'a> {
    raw_ws_id: &'a str,
    group_id: &'a str,
}

#[derive(Deserialize)]
struct UserGroupPostRow {
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_group_checks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let parsed = parse_group_checks_path(request.path)?;

    Some(match request.method {
        "GET" => group_checks_get_response(config, request, &parsed, outbound).await,
        _ => return None,
    })
}

async fn group_checks_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    parsed: &GroupChecksPath<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Require `postId` query param; missing -> 400.
    let Some(post_id) = query_param(request.url, "postId") else {
        return message_response(400, POST_ID_REQUIRED_MSG);
    };

    // Auth: resolve workspace + check permission.
    // Mirrors the legacy `getPermissions` (null -> 404) and
    // `withoutPermission('view_user_groups_posts')` (true -> 403) flow.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        parsed.raw_ws_id,
        VIEW_USER_GROUPS_POSTS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MSG);
        }
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound
            | WorkspacePermissionAuthorizationError::Internal,
        ) => {
            return not_found_response();
        }
    };

    // Verify the post belongs to this workspace + group (private schema).
    let post_exists = match check_post_exists(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        parsed.group_id,
        &post_id,
    )
    .await
    {
        Ok(exists) => exists,
        Err(()) => return message_response(500, ERROR_RESOLVING_POST_MSG),
    };

    if !post_exists {
        return message_response(404, POST_NOT_FOUND_MSG);
    }

    // Fetch group checks from private schema.
    match fetch_group_checks(&config.contact_data, outbound, &post_id).await {
        Ok(checks) => no_store_response(json_response(200, checks)),
        Err(()) => message_response(500, ERROR_FETCHING_CHECKS_MSG),
    }
}

/// Checks whether a post with the given `post_id` exists in the `private`
/// schema `user_group_posts` table, scoped to the provided `ws_id` and
/// `group_id`. Returns `Ok(true)` when the record is found, `Ok(false)` when
/// absent, and `Err(())` on a network or Supabase error.
async fn check_post_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
    post_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "user_group_posts",
            &[
                (
                    "select",
                    "id,group_id,workspace_user_groups!inner(ws_id)".to_owned(),
                ),
                ("id", format!("eq.{post_id}")),
                ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
                ("group_id", format!("eq.{group_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<UserGroupPostRow>>().map_err(|_| ())?;

    // A row present with a non-null `id` confirms the post exists.
    Ok(rows.iter().any(|row| row.id.is_some()))
}

/// Reads all rows from `private.user_group_post_checks` for the given
/// `post_id` and returns them as a raw `serde_json::Value` (always an array).
async fn fetch_group_checks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    post_id: &str,
) -> Result<serde_json::Value, ()> {
    let url = contact_data
        .rest_url(
            "user_group_post_checks",
            &[
                (
                    "select",
                    concat!(
                        "post_id,user_id,is_completed,notes,created_at,",
                        "email_id,approval_status,approved_at,rejected_at,rejection_reason"
                    )
                    .to_owned(),
                ),
                ("post_id", format!("eq.{post_id}")),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Return the raw JSON value; PostgREST always returns an array for table
    // reads. The legacy route responds with `data || []`, which this mirrors.
    response.json::<serde_json::Value>().map_err(|_| ())
}

/// Matches `/api/v1/workspaces/{wsId}/user-groups/{groupId}/group-checks` and
/// extracts the two dynamic segments. Returns `None` for any other path so the
/// dispatcher can fall through.
fn parse_group_checks_path(path: &str) -> Option<GroupChecksPath<'_>> {
    // Strip the fixed prefix and suffix to isolate: `{wsId}/user-groups/{groupId}`
    let inner = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    let mut segments = inner.split('/');
    let raw_ws_id = segments.next()?;
    let user_groups = segments.next()?;
    let group_id = segments.next()?;

    // No trailing segments allowed.
    if segments.next().is_some() {
        return None;
    }

    if user_groups != USER_GROUPS_SEGMENT {
        return None;
    }

    if raw_ws_id.is_empty() || group_id.is_empty() {
        return None;
    }

    Some(GroupChecksPath {
        raw_ws_id,
        group_id,
    })
}

/// Extracts a single query parameter value from the request URL.
fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    url.query_pairs().find_map(|(name, value)| {
        if name == key {
            Some(value.into_owned())
        } else {
            None
        }
    })
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": NOT_FOUND_MSG })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_path_extracts_segments() {
        let p = parse_group_checks_path(
            "/api/v1/workspaces/abc-ws-id/user-groups/grp-123/group-checks",
        )
        .unwrap();
        assert_eq!(p.raw_ws_id, "abc-ws-id");
        assert_eq!(p.group_id, "grp-123");
    }

    #[test]
    fn parse_rejects_extra_trailing_segment() {
        assert!(
            parse_group_checks_path("/api/v1/workspaces/ws/user-groups/grp/extra/group-checks")
                .is_none()
        );
    }

    #[test]
    fn parse_rejects_wrong_literal_segment() {
        assert!(
            parse_group_checks_path("/api/v1/workspaces/ws/wrong-segment/grp/group-checks")
                .is_none()
        );
    }

    #[test]
    fn parse_rejects_empty_ws_id() {
        assert!(
            parse_group_checks_path("/api/v1/workspaces//user-groups/grp/group-checks").is_none()
        );
    }

    #[test]
    fn parse_rejects_empty_group_id() {
        assert!(
            parse_group_checks_path("/api/v1/workspaces/ws/user-groups//group-checks").is_none()
        );
    }

    #[test]
    fn parse_rejects_unrelated_path() {
        assert!(parse_group_checks_path("/api/v1/workspaces/ws/user-groups/grp/posts").is_none());
    }

    #[test]
    fn query_param_extracts_post_id() {
        let result = query_param(
            Some(
                "https://example.com/api/v1/workspaces/ws/user-groups/grp/group-checks\
                 ?postId=abc-123",
            ),
            "postId",
        );
        assert_eq!(result, Some("abc-123".to_owned()));
    }

    #[test]
    fn query_param_returns_none_when_key_absent() {
        assert!(query_param(Some("https://example.com/path?otherParam=x"), "postId").is_none());
    }

    #[test]
    fn query_param_returns_none_for_no_url() {
        assert!(query_param(None, "postId").is_none());
    }

    #[test]
    fn not_found_response_has_correct_shape() {
        let resp = not_found_response();
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body["error"], NOT_FOUND_MSG);
    }

    #[test]
    fn message_response_shapes_correctly() {
        let resp = message_response(400, POST_ID_REQUIRED_MSG);
        assert_eq!(resp.status, 400);
        assert_eq!(resp.body["message"], POST_ID_REQUIRED_MSG);
    }

    #[test]
    fn message_response_403_shapes_correctly() {
        let resp = message_response(403, INSUFFICIENT_PERMISSIONS_MSG);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body["message"], INSUFFICIENT_PERMISSIONS_MSG);
    }
}
