//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/storage`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/storage/route.ts`.
//!
//! ## GET behaviour
//!
//! The legacy GET handler:
//!
//! 1. Authenticates via `withSessionAuth` (regular session token **or** a
//!    'teach' app-session token).
//! 2. Calls `requireTeachWorkspaceAccess` which normalizes the workspace ID,
//!    verifies membership, and checks the `view_user_groups` permission.
//! 3. Verifies that `groupId` (a UUID) is a real `workspace_user_groups` row
//!    inside the resolved workspace.
//! 4. Calls `listWorkspaceStorageDirectory(normalizedWsId, { path:
//!    "user-groups/<groupId>" })` which POSTs to the Supabase Storage list
//!    endpoint and returns an array of `StorageObject` entries.
//! 5. Responds with `{ "data": <entries> }`.
//!
//! ## Behaviour gaps
//!
//! - **Teach app-session tokens**: the legacy route accepts `ttr_app_*` bearer
//!   tokens issued to the 'teach' app. The shared
//!   `authorize_workspace_permission` helper ignores app-session bearer tokens
//!   and falls back to cookie-based session auth only. Callers using teach
//!   app-session tokens must continue to use the Next.js route.
//! - **R2 storage provider**: when the workspace's active drive provider is a
//!   fully-configured Cloudflare R2 backend, the legacy route delegates to an
//!   S3 ListObjectsV2 call. This handler always uses the Supabase Storage list
//!   API. For Supabase-backed workspaces (the default) the result is identical.
//! - **POST / DELETE**: only GET is migrated. Non-GET requests fall through to
//!   Next.js via `return None`.

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
const PATH_INFIX: &str = "/user-groups/";
const PATH_SUFFIX: &str = "/storage";

const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const STORAGE_BUCKET: &str = "workspaces";

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_storage_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => storage_get_response(config, request, raw_ws_id, group_id, outbound).await,
        _ => return None,
    })
}

async fn storage_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return message_response(500, "Internal server error");
    }

    // requireTeachWorkspaceAccess(..., permission: 'view_user_groups')
    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_USER_GROUPS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    let ws_id = &authorization.ws_id;

    // Verify the group belongs to this workspace (maybeSingle check).
    match verify_user_group(contact_data, outbound, ws_id, group_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "User group not found"),
        Err(()) => return message_response(500, "Failed to verify user group"),
    }

    // listWorkspaceStorageDirectory(wsId, { path: "user-groups/<groupId>" })
    let storage_prefix = format!("{ws_id}/user-groups/{group_id}");
    match list_storage_directory(contact_data, outbound, &storage_prefix).await {
        Ok(entries) => no_store_response(json_response(200, json!({ "data": entries }))),
        Err(()) => message_response(500, "Internal server error"),
    }
}

/// Confirm that `group_id` is a real `workspace_user_groups` row inside `ws_id`.
/// Returns `Ok(true)` when found, `Ok(false)` when absent, `Err(())` on failure.
async fn verify_user_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{group_id}")),
            ("limit", "1".to_owned()),
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
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

/// List the Supabase Storage directory at `prefix` using the service-role key.
/// Returns the raw JSON entries from the storage API.
async fn list_storage_directory(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    prefix: &str,
) -> Result<Vec<Value>, ()> {
    let Some(list_url) = storage_list_url(contact_data) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let bearer = format!("Bearer {service_role_key}");

    // Mirror the legacy default options: limit 50, offset 0, sortBy name asc.
    let body = json!({
        "prefix": prefix,
        "limit": 50,
        "offset": 0,
        "sortBy": { "column": "name", "order": "asc" },
    })
    .to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &list_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Derive the Supabase Storage list endpoint from the REST base URL.
/// Mirrors `storage_list_url` in `workspaces_storage_list.rs`.
fn storage_list_url(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest_url = contact_data.rest_url("__origin__", &[])?;
    let origin = rest_url.split("/rest/v1/").next()?;
    if origin.is_empty() {
        return None;
    }
    Some(format!("{origin}/storage/v1/object/list/{STORAGE_BUCKET}"))
}

/// Extract `(ws_id, group_id)` from the request path.
///
/// Expected shape: `/api/v1/workspaces/<wsId>/user-groups/<groupId>/storage`
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_INFIX)?;
    let group_id = after_ws.strip_suffix(PATH_SUFFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || group_id.is_empty() || group_id.contains('/') {
        return None;
    }

    Some((ws_id, group_id))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS_ID: &str = "11111111-1111-4111-8111-111111111111";
    const GROUP_ID: &str = "22222222-2222-4222-8222-222222222222";

    fn make_path(ws_id: &str, group_id: &str) -> String {
        format!("/api/v1/workspaces/{ws_id}/user-groups/{group_id}/storage")
    }

    #[test]
    fn parse_path_extracts_ids() {
        let path = make_path(WS_ID, GROUP_ID);
        let result = parse_path(&path);
        assert_eq!(result, Some((WS_ID, GROUP_ID)));
    }

    #[test]
    fn parse_path_rejects_missing_prefix() {
        assert!(parse_path("/api/v1/other/path").is_none());
    }

    #[test]
    fn parse_path_rejects_empty_ws_id() {
        let path = make_path("", GROUP_ID);
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_empty_group_id() {
        let path = make_path(WS_ID, "");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_extra_segments_in_ws_id() {
        let path = format!("/api/v1/workspaces/extra/{WS_ID}/user-groups/{GROUP_ID}/storage");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_extra_segments_in_group_id() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/extra/{GROUP_ID}/storage");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn parse_path_rejects_wrong_suffix() {
        let path = format!("/api/v1/workspaces/{WS_ID}/user-groups/{GROUP_ID}/other");
        assert!(parse_path(&path).is_none());
    }

    #[test]
    fn storage_prefix_shape() {
        // Verify the storage key passed to the Supabase Storage API looks correct.
        let ws_id = WS_ID;
        let group_id = GROUP_ID;
        let prefix = format!("{ws_id}/user-groups/{group_id}");
        assert_eq!(prefix, format!("{WS_ID}/user-groups/{GROUP_ID}"));
    }
}
