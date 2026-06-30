//! Handler for `GET /api/v1/workspaces/:wsId/user-groups`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/route.ts`. The legacy
//! route also exposes a `POST` handler (create a user group); only `GET` is
//! ported here, and every non-GET method returns `None` so the worker falls
//! through to the still-live Next.js route.
//!
//! The legacy GET flow is:
//!   1. normalize the workspace id (`resolveUserGroupRouteWorkspaceId`, which is
//!      `normalizeWorkspaceId`),
//!   2. call `getPermissions({ wsId, request })`; if it returns null (no auth
//!      principal, unresolvable workspace, no membership, or missing permission
//!      context) respond `404 { "error": "Not found" }`,
//!   3. if the caller is `withoutPermission('view_user_groups')` respond
//!      `403 { "message": "Insufficient permissions to view user groups" }`,
//!   4. read `workspace_user_groups` (`select('*')`) filtered to the normalized
//!      `ws_id` with the admin (service-role) client, and
//!   5. respond with the bare row array as JSON; on a read error respond
//!      `500 { "message": "Error fetching workspace user groups" }`.
//!
//! Auth is delegated to
//! `workspace_permission_check::authorize_workspace_permission`, which performs
//! the workspace-id normalization, membership lookup, and the `view_user_groups`
//! permission check in one call, returning the normalized `ws_id` used for the
//! read.
//!
//! BEHAVIOR GAPS vs legacy:
//!   * The shared auth helper collapses several legacy auth failure modes. The
//!     legacy route returns `404 { "error": "Not found" }` whenever
//!     `getPermissions` returns null (missing session, unresolvable workspace,
//!     non-member, or no permission context). This handler maps both
//!     `Unauthorized` and `NotFound` to that same `404 { "error": "Not found" }`
//!     response, and `Forbidden` to the `403` insufficient-permissions message.
//!   * `authorize_workspace_permission` returns `Internal` for backend-only
//!     conditions (Supabase contact data unconfigured, or an upstream transport
//!     failure during auth resolution). Legacy `getPermissions` would surface
//!     such upstream failures as a null result (`404`); this handler instead
//!     responds `500 { "message": "Error fetching workspace user groups" }` to
//!     distinguish real server faults, matching the other migrated
//!     workspace-permission handlers.
//!   * The legacy route reads with the admin (service-role) client after the
//!     permission check, so this handler reads `workspace_user_groups` with the
//!     service-role key scoped by the resolved `ws_id`, producing identical rows
//!     for an authorized caller.

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
const PATH_SUFFIX: &str = "/user-groups";
const USER_GROUPS_TABLE: &str = "workspace_user_groups";
const VIEW_PERMISSION: &str = "view_user_groups";

const NOT_FOUND_MESSAGE: &str = "Not found";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view user groups";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace user groups";

pub(crate) async fn handle_workspaces_wsid_user_groups_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = user_groups_ws_id(request.path)?;

    Some(match request.method {
        "GET" => user_groups_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn user_groups_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
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
            return error_response(404, NOT_FOUND_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    match fetch_user_groups(contact_data, outbound, &authorization.ws_id).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_user_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        USER_GROUPS_TABLE,
        &[("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

fn user_groups_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

    #[test]
    fn user_groups_ws_id_extracts_segment_for_exact_path() {
        assert_eq!(
            user_groups_ws_id("/api/v1/workspaces/abc-123/user-groups"),
            Some("abc-123")
        );
    }

    #[test]
    fn user_groups_ws_id_rejects_other_paths() {
        // Missing the `v1` segment.
        assert_eq!(user_groups_ws_id("/api/workspaces/abc/user-groups"), None);
        // Trailing segment (e.g. count / nested resources).
        assert_eq!(
            user_groups_ws_id("/api/v1/workspaces/abc/user-groups/count"),
            None
        );
        assert_eq!(
            user_groups_ws_id("/api/v1/workspaces/abc/user-groups/"),
            None
        );
        // Empty workspace id.
        assert_eq!(user_groups_ws_id("/api/v1/workspaces//user-groups"), None);
        // Different resource.
        assert_eq!(user_groups_ws_id("/api/v1/workspaces/abc/courses"), None);
    }

    #[test]
    fn user_groups_ws_id_accepts_personal_slug() {
        assert_eq!(
            user_groups_ws_id("/api/v1/workspaces/personal/user-groups"),
            Some("personal")
        );
    }

    #[test]
    fn message_response_uses_message_key() {
        let response = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(response.status, 403);
        assert_eq!(response.body, json!({ "message": FORBIDDEN_MESSAGE }));
    }

    #[test]
    fn error_response_uses_error_key() {
        let response = error_response(404, NOT_FOUND_MESSAGE);
        assert_eq!(response.status, 404);
        assert_eq!(response.body, json!({ "error": NOT_FOUND_MESSAGE }));
    }
}
