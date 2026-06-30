//! Handler for `GET /api/v1/workspaces/:wsId/task-projects/:projectId/updates`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/route.ts`
//! (GET only). The legacy `POST` create path is intentionally left to the still-live
//! Next.js route, so this handler returns `None` for every non-`GET` method.
//!
//! Auth model (legacy `GET`):
//!   1. build an RLS-respecting Supabase client (`createClient`);
//!   2. normalize the workspace id (`normalizeWorkspaceId`);
//!   3. resolve the authenticated session user
//!      (`resolveAuthenticatedSessionUser`) -> 401 on failure;
//!   4. `verifyWorkspaceMembershipType` with default `requiredType = 'MEMBER'`
//!      (500 on lookup failure, 403 if not a member);
//!   5. verify the project belongs to the workspace with the admin client -> 404;
//!   6. fetch `task_project_updates` with embedded `creator`, `reactions`,
//!      `comments`, and `attachments` using the admin (service-role) client;
//!   7. group reactions by emoji, count non-deleted comments, count attachments;
//!   8. return `{ updates: [...], hasMore: bool }`.
//!
//! The `userReacted` field in each reaction group requires the caller's user id,
//! so this port uses the inline membership-auth pattern (which surfaces `user_id`)
//! rather than `workspace_permission_check::authorize_workspace_permission` (which
//! surfaces only `ws_id`).
//!
//! Status codes preserved:
//!   * no authenticated session user             -> `401 { "error": "Unauthorized" }`
//!   * membership lookup transport/query failure  -> `500 { "error": "Failed to verify workspace access" }`
//!   * not a `MEMBER` of the workspace            -> `403 { "error": "Forbidden" }`
//!   * project row not found                      -> `404 { "error": "Project not found" }`
//!   * `task_projects` or updates read failure    -> `500 { "error": "Internal server error" }`
//!   * success                                    -> `200 { "updates": [...], "hasMore": bool }`
//!
//! BEHAVIOR GAPS:
//!   * Workspace-id normalization is copied from the `workspaces_wsid_task_projects`
//!     handler and handles `personal`, `internal`, UUID literals, and handle-based
//!     lookup. Unauthenticated requests to the `personal` slug return `401` here vs.
//!     the legacy `500` from the `try/catch` wrapper.
//!   * The legacy `verifyWorkspaceMembershipType` with `requiredType = 'MEMBER'` may
//!     accept workspace owners; this port checks `type = 'MEMBER'` literally, matching
//!     the established crate convention in sibling handlers.
//!   * The legacy route sets no explicit cache headers; this port responds `no-store`
//!     to match the crate's read convention.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_INFIX: &str = "/task-projects/";
const PATH_SUFFIX: &str = "/updates";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const UPDATES_SELECT: &str = "*,creator:users!task_project_updates_creator_id_fkey(id,display_name,avatar_url),reactions:task_project_update_reactions(id,emoji,user_id,created_at,user:users(id,display_name,avatar_url)),comments:task_project_update_comments(id,content,created_at,updated_at,user_id,parent_id,deleted_at,user:users(id,display_name,avatar_url)),attachments:task_project_update_attachments(id,file_name,file_path,file_size,mime_type,created_at,uploaded_by,uploader:users!task_project_update_attachments_uploaded_by_fkey(id,display_name,avatar_url))";

const DEFAULT_LIMIT: u64 = 50;

#[derive(Clone, Copy)]
enum MembershipError {
    LookupFailed,
    Forbidden,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_task_projects_projectid_updates_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, project_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => updates_response(config, request, raw_ws_id, project_id, outbound).await,
        _ => return None,
    })
}

/// Extract `(wsId, projectId)` from the route path, returning `None` when the
/// path does not match this handler's mount point verbatim.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, rest2) = rest.split_once(PATH_INFIX)?;
    let project_id = rest2.strip_suffix(PATH_SUFFIX)?;
    if ws_id.is_empty() || ws_id.contains('/') || project_id.is_empty() || project_id.contains('/')
    {
        return None;
    }
    Some((ws_id, project_id))
}

async fn updates_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    project_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    // Step 3: resolve the authenticated session user (401 on failure).
    let access_token = match supabase_auth::request_access_token(request) {
        Some(token) => token,
        None => return error_response(401, "Unauthorized"),
    };
    let user_id =
        match supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id)
            .filter(|id| !id.trim().is_empty())
        {
            Some(id) => id,
            None => return error_response(401, "Unauthorized"),
        };

    // Step 2: normalize the workspace id.
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(id)) => id,
            Ok(None) | Err(()) => return error_response(500, "Internal server error"),
        };

    // Step 4: verify workspace membership (MEMBER type required).
    match authorize_membership(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(()) => {}
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace access");
        }
        Err(MembershipError::Forbidden) => return error_response(403, "Forbidden"),
    }

    // Step 5: verify the project belongs to this workspace.
    match verify_project(contact_data, outbound, &ws_id, project_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, "Project not found"),
        Err(()) => return error_response(500, "Internal server error"),
    }

    // Parse query parameters (limit and offset).
    let (limit, offset) = parse_pagination(request.url);

    // Steps 6-8: fetch updates and transform.
    match fetch_and_transform_updates(contact_data, outbound, project_id, &user_id, limit, offset)
        .await
    {
        Ok((mapped, has_more)) => no_store_response(json_response(
            200,
            json!({ "updates": mapped, "hasMore": has_more }),
        )),
        Err(()) => error_response(500, "Internal server error"),
    }
}

// ---------------------------------------------------------------------------
// Membership authorization (RLS via caller token)
// ---------------------------------------------------------------------------

async fn authorize_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<(), MembershipError> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(MembershipError::LookupFailed)?;
    let response = caller_get(contact_data, outbound, &url, access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }
    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::Forbidden)?;
    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok(())
    } else {
        Err(MembershipError::Forbidden)
    }
}

// ---------------------------------------------------------------------------
// Workspace id normalization (mirrors `normalizeWorkspaceId`)
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
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
            return Ok(Some(resolved));
        }
        if let Some(id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(Some(id));
        }
        if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
            return Ok(Some(id));
        }
    }

    Ok(Some(resolved))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
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
    let response = match access_token {
        Some(token) => caller_get(contact_data, outbound, &url, token).await?,
        None => service_get(contact_data, outbound, &url).await?,
    };
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Project verification and data fetch (service-role / admin client)
// ---------------------------------------------------------------------------

/// Verify that `project_id` exists in `ws_id`; mirrors the legacy
/// `sbAdmin.from('task_projects').select('id').eq('id', projectId).eq('ws_id', wsId).maybeSingle()`.
async fn verify_project(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    project_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "task_projects",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{project_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = service_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

/// Fetch updates with embedded relations and transform them.
async fn fetch_and_transform_updates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    project_id: &str,
    user_id: &str,
    limit: u64,
    offset: u64,
) -> Result<(Vec<Value>, bool), ()> {
    let url = contact_data
        .rest_url(
            "task_project_updates",
            &[
                ("select", UPDATES_SELECT.to_owned()),
                ("project_id", format!("eq.{project_id}")),
                ("deleted_at", "is.null".to_owned()),
                ("order", "created_at.desc".to_owned()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .ok_or(())?;
    let response = service_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let row_count = rows.len() as u64;
    let has_more = row_count == limit;
    let mapped: Vec<Value> = rows
        .into_iter()
        .map(|update| transform_update(update, user_id))
        .collect();
    Ok((mapped, has_more))
}

/// Mirror the JS response shaping:
///
/// ```text
/// {
///   ...update,
///   reactionGroups: grouped_reactions,
///   commentsCount:  non_deleted_comment_count,
///   attachmentsCount: attachment_count,
/// }
/// ```
fn transform_update(mut update: Value, current_user_id: &str) -> Value {
    let reaction_groups = update
        .get("reactions")
        .and_then(Value::as_array)
        .map(|reactions| build_reaction_groups(reactions, current_user_id))
        .unwrap_or_default();

    let comments_count = update
        .get("comments")
        .and_then(Value::as_array)
        .map(|comments| {
            comments
                .iter()
                .filter(|c| matches!(c.get("deleted_at"), None | Some(Value::Null)))
                .count()
        })
        .unwrap_or(0);

    let attachments_count = update
        .get("attachments")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);

    if let Value::Object(ref mut map) = update {
        map.insert("reactionGroups".to_owned(), Value::Array(reaction_groups));
        map.insert("commentsCount".to_owned(), json!(comments_count));
        map.insert("attachmentsCount".to_owned(), json!(attachments_count));
    }

    update
}

/// Group reaction rows by emoji, preserving insertion order (mirrors JS
/// `Object.values(reactionGroups)` whose insertion order matches the iteration
/// order of the `reactions` array).
fn build_reaction_groups(reactions: &[Value], current_user_id: &str) -> Vec<Value> {
    // Each entry: (emoji, count, users, user_reacted).
    let mut groups: Vec<(String, u64, Vec<Value>, bool)> = Vec::new();

    for reaction in reactions {
        let emoji = reaction
            .get("emoji")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let user_id = reaction
            .get("user_id")
            .and_then(Value::as_str)
            .unwrap_or("");
        let user = reaction.get("user").cloned().unwrap_or(Value::Null);
        let user_reacted = user_id == current_user_id;

        if let Some(group) = groups.iter_mut().find(|(e, ..)| e == &emoji) {
            group.1 += 1;
            group.2.push(user);
            group.3 |= user_reacted;
        } else {
            groups.push((emoji, 1, vec![user], user_reacted));
        }
    }

    groups
        .into_iter()
        .map(|(emoji, count, users, user_reacted)| {
            json!({
                "emoji": emoji,
                "count": count,
                "users": users,
                "userReacted": user_reacted,
            })
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Query-parameter parsing
// ---------------------------------------------------------------------------

fn parse_pagination(request_url: Option<&str>) -> (u64, u64) {
    let Some(url_str) = request_url else {
        return (DEFAULT_LIMIT, 0);
    };
    let Ok(parsed) = url::Url::parse(url_str) else {
        return (DEFAULT_LIMIT, 0);
    };

    let mut limit = DEFAULT_LIMIT;
    let mut offset: u64 = 0;

    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "limit" => {
                if let Ok(v) = value.parse::<u64>() {
                    limit = v;
                }
            }
            "offset" => {
                if let Ok(v) = value.parse::<u64>() {
                    offset = v;
                }
            }
            _ => {}
        }
    }

    (limit, offset)
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/// Read with the caller's access token (RLS active), using the service-role
/// key as the PostgREST `apikey`, mirroring the legacy RLS Supabase client.
async fn caller_get(
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

/// Read with the service-role key (RLS bypassed), mirroring `createAdminClient`.
async fn service_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Pure helpers (workspace id normalization)
// ---------------------------------------------------------------------------

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
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
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
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_and_project_ids() {
        assert_eq!(
            parse_path("/api/v1/workspaces/abc/task-projects/proj-1/updates"),
            Some(("abc", "proj-1"))
        );
        assert_eq!(
            parse_path(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/task-projects/22222222-2222-4222-8222-222222222222/updates"
            ),
            Some((
                "11111111-1111-4111-8111-111111111111",
                "22222222-2222-4222-8222-222222222222"
            ))
        );
        assert_eq!(
            parse_path("/api/v1/workspaces/personal/task-projects/p123/updates"),
            Some(("personal", "p123"))
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_malformed_paths() {
        // Missing /updates suffix.
        assert_eq!(parse_path("/api/v1/workspaces/abc/task-projects/p"), None);
        // Extra trailing segment after /updates.
        assert_eq!(
            parse_path("/api/v1/workspaces/abc/task-projects/p/updates/extra"),
            None
        );
        // Empty wsId.
        assert_eq!(
            parse_path("/api/v1/workspaces//task-projects/p/updates"),
            None
        );
        // Empty projectId.
        assert_eq!(
            parse_path("/api/v1/workspaces/abc/task-projects//updates"),
            None
        );
        // Slash inside wsId.
        assert_eq!(
            parse_path("/api/v1/workspaces/a/b/task-projects/p/updates"),
            None
        );
        // No v1 prefix.
        assert_eq!(
            parse_path("/api/workspaces/abc/task-projects/p/updates"),
            None
        );
        assert_eq!(parse_path("/totally/unrelated"), None);
    }

    #[test]
    fn build_reaction_groups_groups_by_emoji() {
        let reactions = vec![
            json!({ "emoji": "👍", "user_id": "u1", "user": { "id": "u1" } }),
            json!({ "emoji": "👍", "user_id": "u2", "user": { "id": "u2" } }),
            json!({ "emoji": "❤️", "user_id": "u1", "user": { "id": "u1" } }),
        ];
        let groups = build_reaction_groups(&reactions, "u1");
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0]["emoji"], json!("👍"));
        assert_eq!(groups[0]["count"], json!(2));
        assert_eq!(groups[0]["userReacted"], json!(true));
        assert_eq!(groups[1]["emoji"], json!("❤️"));
        assert_eq!(groups[1]["count"], json!(1));
        assert_eq!(groups[1]["userReacted"], json!(true));
    }

    #[test]
    fn build_reaction_groups_marks_user_reacted_false() {
        let reactions = vec![json!({ "emoji": "👍", "user_id": "u2", "user": { "id": "u2" } })];
        let groups = build_reaction_groups(&reactions, "u1");
        assert_eq!(groups[0]["userReacted"], json!(false));
    }

    #[test]
    fn build_reaction_groups_empty_input() {
        assert!(build_reaction_groups(&[], "u1").is_empty());
    }

    #[test]
    fn transform_update_adds_derived_fields() {
        let update = json!({
            "id": "upd-1",
            "content": "hello",
            "reactions": [
                { "emoji": "👍", "user_id": "u1", "user": { "id": "u1" } }
            ],
            "comments": [
                { "id": "c1", "deleted_at": null },
                { "id": "c2", "deleted_at": "2026-01-01T00:00:00Z" }
            ],
            "attachments": [
                { "id": "a1" },
                { "id": "a2" }
            ]
        });
        let mapped = transform_update(update, "u1");
        // Original fields preserved.
        assert_eq!(mapped["id"], json!("upd-1"));
        assert_eq!(mapped["content"], json!("hello"));
        // Derived fields added.
        assert_eq!(mapped["commentsCount"], json!(1));
        assert_eq!(mapped["attachmentsCount"], json!(2));
        let groups = mapped["reactionGroups"].as_array().unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["emoji"], json!("👍"));
    }

    #[test]
    fn parse_pagination_defaults() {
        let (limit, offset) = parse_pagination(None);
        assert_eq!(limit, 50);
        assert_eq!(offset, 0);
    }

    #[test]
    fn parse_pagination_from_url() {
        let url =
            "https://x.example.com/api/v1/workspaces/w/task-projects/p/updates?limit=10&offset=20";
        let (limit, offset) = parse_pagination(Some(url));
        assert_eq!(limit, 10);
        assert_eq!(offset, 20);
    }

    #[test]
    fn error_response_shapes_error_body_with_no_store() {
        let resp = error_response(404, "Project not found");
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body, json!({ "error": "Project not found" }));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_alias() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("my-ws"), "my-ws");
    }

    #[test]
    fn is_workspace_uuid_literal_validates_uuid_shape() {
        assert!(is_workspace_uuid_literal(
            "11111111-1111-4111-8111-111111111111"
        ));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal(""));
    }
}
