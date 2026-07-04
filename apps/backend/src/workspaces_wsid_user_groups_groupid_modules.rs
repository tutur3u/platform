//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/modules`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/modules/route.ts`.
//! The legacy route also exposes a `POST` handler; only `GET` is ported here.
//! Every non-GET method returns `None` so the worker falls through to the
//! still-live Next.js route.
//!
//! ## Legacy GET flow
//!
//!   1. Validates `wsId` and `groupId` as non-empty strings (UUID format).
//!   2. Normalises the workspace id and checks workspace membership.
//!   3. Calls `getPermissions` and requires `manage_users`.
//!   4. Validates the user group exists in `workspace_user_groups`
//!      (service-role client, filtered by `id` and `ws_id`).
//!   5. Fetches all rows from `workspace_course_modules` where
//!      `group_id = groupId`, ordered by `module_group_id asc`,
//!      `sort_key asc nulls last`, `created_at asc`.
//!   6. Responds `200` with the bare JSON array of module rows.
//!
//! ## Auth
//!
//! Delegated to `workspace_permission_check::authorize_workspace_permission`
//! with the `manage_users` permission string (matching the legacy
//! `containsPermission('manage_users')` check).
//!
//! ## Behavior gaps vs legacy
//!
//! - The legacy route uses a Supabase JS client with `maybeSingle()` for the
//!   group validation step; this port uses the REST API with `limit=1`.
//! - Supabase REST ordering with `nullsFirst: false` is approximated by sending
//!   `sort_key.asc.nullslast` in the `order` query parameter.
//! - The shared auth helper collapses some legacy auth failure modes:
//!   `Unauthorized` and `NotFound` both map to `404 { "error": "Not found" }`,
//!   `Forbidden` maps to `403 { "message": "Insufficient permissions" }`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PERMISSION: &str = "manage_users";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_modules_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_group_id) = extract_path_ids(request.path)?;

    Some(match request.method {
        "GET" => modules_get(config, request, raw_ws_id, raw_group_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn modules_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // ---- auth --------------------------------------------------------------
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
            return no_store_response(json_response(404, json!({ "error": "Not found" })));
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    let ws_id = &authorization.ws_id;

    // ---- validate user group exists in workspace ---------------------------
    match validate_user_group(&config.contact_data, outbound, ws_id, raw_group_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Group not found"),
        Err(()) => return message_response(500, "Failed to validate group"),
    }

    // ---- fetch course modules ----------------------------------------------
    fetch_modules(&config.contact_data, outbound, raw_group_id).await
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Checks that a `workspace_user_groups` row exists for the given `id` and
/// `ws_id`.  Returns `Ok(true)` when found, `Ok(false)` when not, and
/// `Err(())` on network or configuration errors.
async fn validate_user_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
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

/// Fetches all rows from `workspace_course_modules` where `group_id` matches,
/// ordered by `module_group_id asc`, `sort_key asc nullslast`, `created_at asc`.
/// Returns the raw JSON array or an error response on failure.
async fn fetch_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> BackendResponse {
    let url = match contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "*".to_owned()),
            ("group_id", format!("eq.{group_id}")),
            (
                "order",
                "module_group_id.asc,sort_key.asc.nullslast,created_at.asc".to_owned(),
            ),
        ],
    ) {
        Some(u) => u,
        None => return message_response(500, "Error fetching workspace course modules"),
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return message_response(500, "Error fetching workspace course modules"),
    };
    let bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return message_response(500, "Error fetching workspace course modules"),
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, "Error fetching workspace course modules");
    }

    let rows: Value = match response.json::<Value>() {
        Ok(v) => v,
        Err(_) => return message_response(500, "Error fetching workspace course modules"),
    };

    let arr = if rows.is_array() { rows } else { json!([]) };

    no_store_response(json_response(200, arr))
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, groupId)` from
/// `/api/v1/workspaces/:wsId/user-groups/:groupId/modules`.
///
/// Returns `None` when the path does not match this route shape.
fn extract_path_ids(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // Expected: api / v1 / workspaces / :wsId / user-groups / :groupId / modules
    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && !segments[5].is_empty()
        && segments[6] == "modules"
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
// Response helpers
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const WS_ID: &str = "aaaaaaaa-0000-0000-0000-000000000001";
    const GROUP_ID: &str = "bbbbbbbb-0000-0000-0000-000000000002";

    // -- path extraction -----------------------------------------------------

    #[test]
    fn test_extract_path_ids_valid() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/modules");
        let (ws, group) = extract_path_ids(&path).unwrap();
        assert_eq!(ws, WS_ID);
        assert_eq!(group, GROUP_ID);
    }

    #[test]
    fn test_extract_path_ids_personal_slug() {
        let path = format!("/api/v1/workspaces/personal/user-groups/{GROUP_ID}/modules");
        let (ws, group) = extract_path_ids(&path).unwrap();
        assert_eq!(ws, "personal");
        assert_eq!(group, GROUP_ID);
    }

    #[test]
    fn test_extract_path_ids_missing_modules_suffix() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn test_extract_path_ids_wrong_suffix() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/attendance");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn test_extract_path_ids_extra_segment() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/modules/extra");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn test_extract_path_ids_empty_ws() {
        let path = format!("/api/v1/workspaces//user-groups/{GROUP_ID}/modules");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn test_extract_path_ids_empty_group() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups//modules");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn test_extract_path_ids_wrong_prefix() {
        let path = format!("/api/workspaces/{WS_ID}/user-groups/{GROUP_ID}/modules");
        assert!(extract_path_ids(&path).is_none());
    }

    #[test]
    fn test_extract_path_ids_wrong_middle_segment() {
        let path = format!("/api/v1/workspaces/{WS_ID}/other-groups/{GROUP_ID}/modules");
        assert!(extract_path_ids(&path).is_none());
    }

    // -- message_response shape ----------------------------------------------

    #[test]
    fn test_message_response_shape() {
        let resp = message_response(403, "Insufficient permissions");
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "message": "Insufficient permissions" }));
    }

    #[test]
    fn test_message_response_500_shape() {
        let resp = message_response(500, "Error fetching workspace course modules");
        assert_eq!(resp.status, 500);
        assert_eq!(
            resp.body,
            json!({ "message": "Error fetching workspace course modules" })
        );
    }

    // -- path_segments -------------------------------------------------------

    #[test]
    fn test_path_segments_trims_leading_slash() {
        let segs = path_segments("/api/v1/workspaces");
        assert_eq!(segs, vec!["api", "v1", "workspaces"]);
    }

    #[test]
    fn test_path_segments_empty_path() {
        let segs = path_segments("/");
        assert!(segs.is_empty());
    }
}
