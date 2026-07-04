//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/members`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/members/route.ts`.
//! The legacy route also exposes a `POST` handler; only `GET` is ported here.
//! Every non-GET method returns `None` so the worker falls through to the
//! still-live Next.js route.
//!
//! The legacy GET flow:
//!
//!   1. Parse `wsId` and `groupId` from the path.
//!   2. Call `getPermissions({ wsId, request })`; if null, respond
//!      `404 { "error": "Not found" }`.
//!   3. If `withoutPermission('view_user_groups')`, respond
//!      `403 { "message": "Insufficient permissions to view user groups" }`.
//!   4. Determine `canViewPersonalInfo` (`view_users_private_info` permission)
//!      and `canViewPublicInfo` (`view_users_public_info` permission).
//!   5. Parse `offset` (default `0`) and `limit` (default `10`) from the
//!      query string.
//!   6. Verify the group exists in the workspace via `workspace_user_groups`.
//!   7. Query `workspace_user_groups_users` with an inner-join embed of
//!      `workspace_users`, filtered by `group_id` and `workspace_users.ws_id`,
//!      paged by `offset`/`limit`.
//!   8. Flatten each row into `{ ...workspace_users_fields, role }`, then
//!      annotate with `isGuest` and `has_require_attention_feedback` flags.
//!   9. Respond `200 { "data": [...], "count": <page_size>,
//!      "next": <next_offset> }` (the `next` key is omitted when on the last
//!      page).
//!
//! Auth is delegated to
//! `workspace_permission_check::authorize_workspace_permission`, which performs
//! workspace-id normalization, membership lookup, and the `view_user_groups`
//! permission check.
//!
//! BEHAVIOR GAPS vs legacy:
//!
//!   - `canViewPersonalInfo` (`view_users_private_info`) and
//!     `canViewPublicInfo` (`view_users_public_info`) are not checked; this
//!     handler always returns the base fields only
//!     (`id, display_name, full_name, avatar_url, archived, archived_until,
//!     note, role`) and never includes `email`, `phone`, `birthday`, or
//!     `gender`.
//!   - `isGuest` enrichment (batch `workspace_user_groups_users` query for
//!     groups with `is_guest = true`) is not performed; the field is omitted
//!     from each member row.
//!   - `has_require_attention_feedback` enrichment is not performed; the field
//!     is omitted from each member row.
//!   - Auth failure codes are collapsed: both `Unauthorized` and `NotFound`
//!     from `authorize_workspace_permission` map to
//!     `404 { "error": "Not found" }`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PERMISSION: &str = "view_user_groups";
const DEFAULT_LIMIT: u64 = 10;
const DEFAULT_OFFSET: u64 = 0;
const MEMBERS_TABLE: &str = "workspace_user_groups_users";
const USER_GROUPS_TABLE: &str = "workspace_user_groups";

/// Base select fields from the embedded `workspace_users` relation.
///
/// The FK hint `workspace_user_roles_users_user_id_fkey` disambiguates the
/// join to match the legacy Supabase JS `.select(...)` call, and `!inner`
/// ensures rows without a matching workspace_users row are excluded.
const MEMBER_SELECT: &str = "workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,display_name,full_name,avatar_url,archived,archived_until,note),role";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_group_id) = extract_path_ids(request.path)?;

    Some(match request.method {
        "GET" => members_get(config, request, raw_ws_id, raw_group_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn members_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // ---- auth ----------------------------------------------------------------
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        PERMISSION,
        outbound,
    )
    .await
    {
        Ok(a) => a,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return error_response(404, "Not found");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions to view user groups");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Error fetching group members");
        }
    };

    let ws_id = &authorization.ws_id;

    // ---- parse query params --------------------------------------------------
    let (offset, limit) = parse_offset_limit(request.url);

    // ---- validate group exists in workspace ----------------------------------
    match validate_user_group(&config.contact_data, outbound, ws_id, raw_group_id).await {
        Ok(true) => {}
        Ok(false) => {
            return message_response(404, "Workspace user group not found");
        }
        Err(()) => {
            return message_response(500, "Error fetching group members");
        }
    }

    // ---- fetch members page --------------------------------------------------
    match fetch_members_page(
        &config.contact_data,
        outbound,
        ws_id,
        raw_group_id,
        offset,
        limit,
    )
    .await
    {
        Ok((members, row_count)) => {
            let next: Option<u64> = if row_count < limit {
                None
            } else {
                Some(offset + limit)
            };

            let mut body = json!({
                "data": members,
                "count": row_count,
            });

            if let Some(next_offset) = next
                && let Some(obj) = body.as_object_mut()
            {
                obj.insert("next".to_owned(), json!(next_offset));
            }

            no_store_response(json_response(200, body))
        }
        Err(()) => message_response(500, "Error fetching group members"),
    }
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Checks that a `workspace_user_groups` row exists for the given `id` and
/// `ws_id`. Returns `Ok(true)` when found, `Ok(false)` when not found, and
/// `Err(())` on network or configuration errors.
async fn validate_user_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            USER_GROUPS_TABLE,
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{group_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Value>().map_err(|_| ())?;
    Ok(rows.as_array().map(|a| !a.is_empty()).unwrap_or(false))
}

/// Fetches a page of group members from `workspace_user_groups_users`.
///
/// Returns `(flattened_members, page_row_count)` on success. Each entry in
/// `flattened_members` is a JSON object of the form
/// `{ id, display_name, full_name, avatar_url, archived, archived_until, note, role }`.
///
/// NOTE: `isGuest` and `has_require_attention_feedback` are NOT populated; see
/// the module-level doc comment.
async fn fetch_members_page(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
    offset: u64,
    limit: u64,
) -> Result<(Vec<Value>, u64), ()> {
    let url = contact_data
        .rest_url(
            MEMBERS_TABLE,
            &[
                ("select", MEMBER_SELECT.to_owned()),
                ("group_id", format!("eq.{group_id}")),
                ("workspace_users.ws_id", format!("eq.{ws_id}")),
                ("offset", offset.to_string()),
                ("limit", limit.to_string()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let row_count = rows.len() as u64;

    // Flatten each row: merge workspace_users fields with role at the top level.
    let members: Vec<Value> = rows.iter().map(flatten_member_row).collect();

    Ok((members, row_count))
}

/// Flattens a raw PostgREST row
/// `{ "workspace_users": { ... }, "role": "STUDENT" }`
/// into a merged object `{ id, display_name, ..., role }`.
///
/// Mirrors the legacy `{ ...row.workspace_users, role: row.role }` spread.
fn flatten_member_row(row: &Value) -> Value {
    let mut merged = serde_json::Map::new();

    // Copy all workspace_users fields first.
    if let Some(user_obj) = row.get("workspace_users") {
        let user = match user_obj {
            Value::Array(items) => items.first(),
            other => Some(other),
        };
        if let Some(Value::Object(user_map)) = user {
            for (key, val) in user_map {
                merged.insert(key.clone(), val.clone());
            }
        }
    }

    // Then overlay the role column from the parent row.
    merged.insert(
        "role".to_owned(),
        row.get("role").cloned().unwrap_or(Value::Null),
    );

    Value::Object(merged)
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, groupId)` from
/// `/api/v1/workspaces/:wsId/user-groups/:groupId/members`.
///
/// Returns `None` when the path does not match this exact route shape.
fn extract_path_ids(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // Expected: api / v1 / workspaces / :wsId / user-groups / :groupId / members
    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && !segments[5].is_empty()
        && segments[6] == "members"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// Query param parsing
// ---------------------------------------------------------------------------

/// Parses `offset` (default `0`) and `limit` (default `10`) from the request
/// URL. Non-numeric or negative values fall back to defaults, mirroring the
/// legacy `parseInt(..., 10)` with `?? '0'` / `?? '10'` fallbacks.
fn parse_offset_limit(url: Option<&str>) -> (u64, u64) {
    let mut offset = DEFAULT_OFFSET;
    let mut limit = DEFAULT_LIMIT;

    if let Some(parsed) = url.and_then(|raw| url::Url::parse(raw).ok()) {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "offset" => {
                    if let Ok(v) = value.parse::<u64>() {
                        offset = v;
                    }
                }
                "limit" => {
                    if let Ok(v) = value.parse::<u64>() {
                        limit = v;
                    }
                }
                _ => {}
            }
        }
    }

    (offset, limit)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const WS_ID: &str = "aaaaaaaa-0000-0000-0000-000000000001";
    const GROUP_ID: &str = "bbbbbbbb-0000-0000-0000-000000000002";

    // ----- extract_path_ids -----

    #[test]
    fn extract_path_ids_valid() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members");
        assert_eq!(extract_path_ids(&path), Some((WS_ID, GROUP_ID)));
    }

    #[test]
    fn extract_path_ids_accepts_personal_slug() {
        let path = format!("/api/v1/workspaces/personal/user-groups/{GROUP_ID}/members");
        assert_eq!(extract_path_ids(&path), Some(("personal", GROUP_ID)));
    }

    #[test]
    fn extract_path_ids_rejects_empty_ws_id() {
        let path = format!("/api/v1/workspaces//user-groups/{GROUP_ID}/members");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn extract_path_ids_rejects_empty_group_id() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups//members");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn extract_path_ids_rejects_wrong_suffix() {
        // The attendance route must not be matched here.
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/attendance");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn extract_path_ids_rejects_extra_segment() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members/extra");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn extract_path_ids_rejects_wrong_prefix() {
        let path = format!("/api/workspaces/{WS_ID}/user-groups/{GROUP_ID}/members");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn extract_path_ids_rejects_list_route() {
        // `/user-groups` without a groupId must not match.
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/members");
        assert!(extract_path_ids(&path).is_none());
    }

    // ----- parse_offset_limit -----

    #[test]
    fn parse_offset_limit_defaults_when_no_url() {
        assert_eq!(parse_offset_limit(None), (0, 10));
    }

    #[test]
    fn parse_offset_limit_parses_custom_values() {
        let url =
            "https://example.com/api/v1/workspaces/ws/user-groups/g/members?offset=20&limit=5";
        assert_eq!(parse_offset_limit(Some(url)), (20, 5));
    }

    #[test]
    fn parse_offset_limit_defaults_on_missing_params() {
        let url = "https://example.com/api/v1/workspaces/ws/user-groups/g/members";
        assert_eq!(parse_offset_limit(Some(url)), (0, 10));
    }

    #[test]
    fn parse_offset_limit_ignores_non_numeric() {
        let url =
            "https://example.com/api/v1/workspaces/ws/user-groups/g/members?offset=abc&limit=xyz";
        assert_eq!(parse_offset_limit(Some(url)), (0, 10));
    }

    // ----- flatten_member_row -----

    #[test]
    fn flatten_member_row_merges_fields() {
        let row = json!({
            "workspace_users": {
                "id": "user-1",
                "display_name": "Alice",
                "full_name": "Alice Smith",
                "avatar_url": null,
                "archived": null,
                "archived_until": null,
                "note": null
            },
            "role": "STUDENT"
        });
        let flat = flatten_member_row(&row);
        assert_eq!(flat["id"], json!("user-1"));
        assert_eq!(flat["display_name"], json!("Alice"));
        assert_eq!(flat["role"], json!("STUDENT"));
    }

    #[test]
    fn flatten_member_row_role_null_when_missing() {
        let row = json!({
            "workspace_users": { "id": "user-2" }
        });
        let flat = flatten_member_row(&row);
        assert_eq!(flat["role"], Value::Null);
    }

    // ----- response helpers -----

    #[test]
    fn message_response_shape() {
        let resp = message_response(403, "Insufficient permissions to view user groups");
        assert_eq!(resp.status, 403);
        assert_eq!(
            resp.body,
            json!({ "message": "Insufficient permissions to view user groups" })
        );
    }

    #[test]
    fn error_response_shape() {
        let resp = error_response(404, "Not found");
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body, json!({ "error": "Not found" }));
    }
}
