//! Handler for `GET /api/v1/workspaces/:wsId/roles/:roleId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/roles/[roleId]/route.ts` (GET only).
//!
//! The legacy GET handler:
//!   1. authorizes via `getPermissions({ wsId, request })`, requiring the
//!      `manage_workspace_roles` workspace permission. A `null` permission
//!      context (unauthenticated / unresolved workspace) AND a missing
//!      permission both return `403 { "message": "Workspace role access denied" }`.
//!   2. reads a SINGLE `workspace_roles` row with the admin (service-role)
//!      client (`createAdminClient()`, RLS bypassed), selecting
//!      `id, name, permissions:workspace_role_permissions(id:permission, enabled), created_at`,
//!      filtered by `.eq('id', roleId)` and `.eq('ws_id', resolvedWsId)`, using
//!      `.single()`.
//!   3. on a Supabase error (which `.single()` raises for zero OR multiple
//!      matching rows, as well as transport failures) responds with
//!      `500 { "message": "Error fetching workspace role" }`.
//!   4. on success responds with the bare role object (the legacy route returns
//!      `data` directly, not wrapped).
//!
//! Auth mapping (this handler reuses `authorize_workspace_permission`, which
//! distinguishes more error states than the legacy `getPermissions` boolean):
//!   * Unauthorized / NotFound / Forbidden -> `403 Workspace role access denied`
//!     (the legacy route collapses all of these to a 403).
//!   * Internal (config / upstream failure during auth) -> `500` (the legacy
//!     route would throw an unhandled error -> 500).
//!
//! PUT and DELETE are intentionally NOT migrated; every non-GET method returns
//! `None` so the worker falls through to the still-live Next.js route.
//!
//! Cache: the legacy route sets no cache headers on its `NextResponse.json`, so
//! this handler emits `no-store` (matching the sibling roles-list handler).

use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const ROLE_PATH_PREFIX: &str = "/api/v1/workspaces/";
const ROLE_PATH_INFIX: &str = "roles/";

const WORKSPACE_ROLES_TABLE: &str = "workspace_roles";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";

const ROLE_SELECT: &str =
    "id, name, permissions:workspace_role_permissions(id:permission, enabled), created_at";

/// PostgREST single-object representation, mirroring Supabase `.single()`.
const PGRST_SINGLE_OBJECT_ACCEPT: &str = "application/vnd.pgrst.object+json";

const ACCESS_DENIED_MESSAGE: &str = "Workspace role access denied";
const FETCH_FAILED_MESSAGE: &str = "Error fetching workspace role";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

pub(crate) async fn handle_workspaces_wsid_roles_roleid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, role_id) = role_path_ids(request.path)?;

    // Only GET is migrated. PUT / DELETE / any other method must fall through to
    // the still-active Next.js route by returning None (not a 405).
    Some(match request.method {
        "GET" => role_response(config, request, raw_ws_id, role_id, outbound).await,
        _ => return None,
    })
}

async fn role_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    role_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_ROLES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(error) => return auth_error_response(error),
    };

    match fetch_workspace_role(&config.contact_data, outbound, &ws_id, role_id).await {
        Ok(role) => no_store_response(json_response(200, role)),
        Err(()) => message_response(500, FETCH_FAILED_MESSAGE),
    }
}

/// Reads a single `workspace_roles` row with the service-role key, mirroring
/// `createAdminClient()` + `.single()` in the legacy route (RLS bypassed, scoped
/// by `id` + `ws_id`). The `pgrst.object+json` Accept header makes PostgREST
/// return a bare object and respond non-2xx when the result is not exactly one
/// row, matching Supabase `.single()` raising an error in those cases.
async fn fetch_workspace_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_ROLES_TABLE,
        &[
            ("select", ROLE_SELECT.to_owned()),
            ("id", format!("eq.{role_id}")),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", PGRST_SINGLE_OBJECT_ACCEPT)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        // Legacy collapses null permissions AND missing permission into a 403.
        WorkspacePermissionAuthorizationError::Unauthorized
        | WorkspacePermissionAuthorizationError::NotFound
        | WorkspacePermissionAuthorizationError::Forbidden => {
            message_response(403, ACCESS_DENIED_MESSAGE)
        }
        // Config / upstream failure during auth -> legacy throws -> 500.
        WorkspacePermissionAuthorizationError::Internal => {
            message_response(500, INTERNAL_ERROR_MESSAGE)
        }
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Extracts `(wsId, roleId)` from `/api/v1/workspaces/<wsId>/roles/<roleId>`.
///
/// Returns `None` for any non-matching path so unrelated routes keep working.
/// Never indexes path segments eagerly.
fn role_path_ids(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(ROLE_PATH_PREFIX)?;
    let (ws_id, after) = rest.split_once('/')?;
    let role_id = after.strip_prefix(ROLE_PATH_INFIX)?;

    if ws_id.is_empty() || role_id.is_empty() || role_id.contains('/') {
        return None;
    }

    Some((ws_id, role_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ids() {
        assert_eq!(
            role_path_ids("/api/v1/workspaces/ws-123/roles/role-9"),
            Some(("ws-123", "role-9"))
        );
        assert_eq!(
            role_path_ids("/api/v1/workspaces/personal/roles/abc"),
            Some(("personal", "abc"))
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Wrong prefix (no v1).
        assert_eq!(role_path_ids("/api/workspaces/ws-1/roles/r-1"), None);
        // Roles list (no role id) must not match.
        assert_eq!(role_path_ids("/api/v1/workspaces/ws-1/roles"), None);
        assert_eq!(role_path_ids("/api/v1/workspaces/ws-1/roles/"), None);
        // Nested segment after role id.
        assert_eq!(
            role_path_ids("/api/v1/workspaces/ws-1/roles/r-1/members"),
            None
        );
        // Empty ws id.
        assert_eq!(role_path_ids("/api/v1/workspaces//roles/r-1"), None);
        // Wrong infix segment.
        assert_eq!(role_path_ids("/api/v1/workspaces/ws-1/members/r-1"), None);
        // Unrelated route (must not panic / must return None).
        assert_eq!(role_path_ids("/api/v1/health"), None);
        // Empty path.
        assert_eq!(role_path_ids(""), None);
    }

    #[test]
    fn auth_error_maps_to_legacy_status_codes() {
        for error in [
            WorkspacePermissionAuthorizationError::Unauthorized,
            WorkspacePermissionAuthorizationError::NotFound,
            WorkspacePermissionAuthorizationError::Forbidden,
        ] {
            let response = auth_error_response(error);
            assert_eq!(response.status, 403);
            assert_eq!(response.body, json!({ "message": ACCESS_DENIED_MESSAGE }));
        }

        let response = auth_error_response(WorkspacePermissionAuthorizationError::Internal);
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": INTERNAL_ERROR_MESSAGE }));
    }

    #[test]
    fn message_response_is_no_store() {
        let response = message_response(500, FETCH_FAILED_MESSAGE);
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": FETCH_FAILED_MESSAGE }));
    }
}
