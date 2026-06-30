//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/module-groups`.
//!
//! Mirrors the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/route.ts`.
//!
//! Legacy `GET` flow:
//!   1. Validate route params with zod: `groupId` must be a UUID and `wsId`
//!      must be non-empty. Invalid -> `400 { "message": "Invalid route params" }`.
//!      The legacy also includes an `errors` array (zod issue objects); this port
//!      omits it to avoid re-implementing the zod schema object format.
//!   2. Validate workspace access via `getPermissions({ wsId, user })`:
//!        - normalize `wsId` (personal/internal/handle aliases),
//!        - require a `workspace_members` row for the caller,
//!        - require the `manage_users` permission.
//!          This port reuses `workspace_permission_check::authorize_workspace_permission`
//!          which performs the same normalize + membership + effective-permission
//!          computation.
//!          NOTE: the legacy route distinguishes `500` (membership lookup failed)
//!          from `403` (no membership / insufficient permission). The shared helper
//!          maps missing-membership to `NotFound`; this port maps that to `403`.
//!   3. Validate the group belongs to the workspace
//!      (`workspace_user_groups` where `id = groupId AND ws_id = wsId`).
//!      Missing -> `404 { "message": "Group not found" }`, REST error -> `500`.
//!   4. Fetch all columns from `workspace_course_module_groups` where
//!      `group_id = groupId`, ordered by `sort_key` ascending. Returns the raw
//!      row array on `200`, REST error ->
//!      `500 { "message": "Error fetching workspace course module groups" }`.
//!
//! Steps 3-4 use the Supabase service-role key, matching the legacy `sbAdmin`
//! (admin) client.
//!
//! Behavior gaps vs legacy:
//!   - The `errors` field is omitted from `400` responses (see step 1).
//!   - The legacy POST handler is intentionally NOT ported here; this handler
//!     returns `None` for non-GET methods so the worker falls through to the
//!     still-live Next.js route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MANAGE_USERS_PERMISSION: &str = "manage_users";

#[derive(Deserialize)]
struct IdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

/// Matches `/api/v1/workspaces/:wsId/user-groups/:groupId/module-groups`.
///
/// Returns `(raw_ws_id, group_id)` when the path shape matches, `None` otherwise.
fn module_groups_segments(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && !segments[5].is_empty()
        && segments[6] == "module-groups"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_module_groups_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id) = module_groups_segments(request.path)?;

    Some(match request.method {
        "GET" => module_groups_response(config, request, raw_ws_id, group_id, outbound).await,
        _ => return None,
    })
}

async fn module_groups_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Step 1: validate route params. `groupId` must be a UUID; `wsId` non-empty
    // (guaranteed by the path matcher, but re-checked for robustness).
    if raw_ws_id.trim().is_empty() || !is_uuid_literal(group_id) {
        return invalid_route_params_response();
    }

    // Step 2: validate workspace access + `manage_users` permission.
    let resolved_ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_USERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            // Helper returns NotFound when the caller has no workspace membership.
            // Legacy returns `403 "You don't have access to this workspace"`.
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            // Member but missing `manage_users` permission.
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    // Step 3: validate the group belongs to the workspace (service role).
    match service_role_single_id(
        contact_data,
        outbound,
        "workspace_user_groups",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{group_id}")),
            ("ws_id", format!("eq.{resolved_ws_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Group not found"),
        Err(()) => return message_response(500, "Failed to validate group"),
    }

    // Step 4: fetch module groups ordered by sort_key ascending.
    match fetch_module_groups(contact_data, outbound, group_id).await {
        Ok(rows) => no_store_response(json_response(200, Value::Array(rows))),
        Err(()) => message_response(500, "Error fetching workspace course module groups"),
    }
}

/// Returns `Ok(true)` when at least one row matches, `Ok(false)` when none,
/// and `Err(())` on REST/transport/decode failure.
async fn service_role_single_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    query: &[(&str, String)],
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(table, query) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response.json::<Vec<IdRow>>().map_err(|_| ())?.is_empty())
}

/// Fetches all columns of `workspace_course_module_groups` scoped to `group_id`,
/// ordered by `sort_key` ascending (matching the legacy `.order('sort_key', { ascending: true })`).
async fn fetch_module_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_course_module_groups",
        &[
            ("select", "*".to_owned()),
            ("group_id", format!("eq.{group_id}")),
            ("order", "sort_key.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_service_role_get(
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

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn invalid_route_params_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "message": "Invalid route params" }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::{is_uuid_literal, module_groups_segments, path_segments};

    #[test]
    fn path_segments_strips_leading_and_trailing_slashes() {
        assert_eq!(
            path_segments("/api/v1/workspaces/ws1/user-groups/g1/module-groups/"),
            vec![
                "api",
                "v1",
                "workspaces",
                "ws1",
                "user-groups",
                "g1",
                "module-groups"
            ]
        );
    }

    #[test]
    fn module_groups_segments_matches_valid_path() {
        let ws_id = "00000000-0000-0000-0000-000000000001";
        let group_id = "00000000-0000-0000-0000-000000000002";
        let path = format!("/api/v1/workspaces/{ws_id}/user-groups/{group_id}/module-groups");
        let result = module_groups_segments(&path);
        assert_eq!(result, Some((ws_id, group_id)));
    }

    #[test]
    fn module_groups_segments_rejects_short_path() {
        assert!(module_groups_segments("/api/v1/workspaces/ws1/user-groups/g1").is_none());
    }

    #[test]
    fn module_groups_segments_rejects_wrong_static_segments() {
        // Wrong segment: "groups" instead of "user-groups"
        let path = "/api/v1/workspaces/ws1/groups/g1/module-groups";
        assert!(module_groups_segments(path).is_none());
    }

    #[test]
    fn module_groups_segments_rejects_extra_segments() {
        // Eight segments -> should not match the 7-segment route
        let path = "/api/v1/workspaces/ws1/user-groups/g1/module-groups/extra";
        assert!(module_groups_segments(path).is_none());
    }

    #[test]
    fn is_uuid_literal_accepts_valid_uuid() {
        assert!(is_uuid_literal("00000000-0000-0000-0000-000000000000"));
        assert!(is_uuid_literal("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn is_uuid_literal_rejects_invalid_formats() {
        assert!(!is_uuid_literal("not-a-uuid"));
        assert!(!is_uuid_literal("00000000000000000000000000000000")); // no dashes
        assert!(!is_uuid_literal("")); // empty
        assert!(!is_uuid_literal("00000000-0000-0000-0000-00000000000Z")); // non-hex char
    }
}
