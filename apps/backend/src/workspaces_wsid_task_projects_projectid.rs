//! Handler for `GET /api/v1/workspaces/:wsId/task-projects/:projectId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/route.ts`
//! (GET only). The legacy `PUT`, `PATCH`, and `DELETE` mutation handlers are
//! intentionally left to the still-live Next.js route, so this handler returns
//! `None` for every non-`GET` method (the worker then falls through to Next.js).
//!
//! Auth model (legacy `GET`):
//!   1. build an RLS-respecting Supabase client (`createClient`);
//!   2. normalize the workspace id (`normalizeWorkspaceId`);
//!   3. resolve the authenticated session user
//!      (`resolveAuthenticatedSessionUser`) -> 401 on failure;
//!   4. `verifyWorkspaceMembershipType` with the default `requiredType = 'MEMBER'`
//!      (500 on lookup failure, 403 if not a member);
//!   5. `getPermissions(...).containsPermission('manage_projects')` -> 403 if the
//!      caller lacks the `manage_projects` permission;
//!   6. read the single `task_projects` row with the **admin (service-role)**
//!      client (`createAdminClient`), embedding `creator` and `lead` users.
//!
//! This port reuses `workspace_permission_check::authorize_workspace_permission`
//! which combines steps 2-5 (resolve caller token -> auth user, normalize the
//! workspace id, build effective workspace permissions, and require
//! `manage_projects`). It then reads `task_projects` with the service-role key to
//! mirror the admin client, returning the bare project object on success.
//!
//! Status codes preserved:
//!   * no authenticated session user                     -> `401 { "error": "Unauthorized" }`
//!   * caller is not a member / no permission context    -> `403 { "error": "Forbidden" }`
//!   * caller lacks `manage_projects`                     -> `403 { "error": "You don't have permission to perform this operation" }`
//!   * project row not found                              -> `404 { "error": "Project not found" }`
//!   * config / membership-lookup / read failure          -> `500 { "error": "Internal server error" }`
//!   * success                                            -> `200 <project object>`
//!
//! BEHAVIOR GAPS:
//!   * The legacy route distinguishes `membership_lookup_failed` (500) from a
//!     missing membership (403). The shared helper maps a membership-lookup
//!     transport/query failure to `Internal` (500) and a missing membership to
//!     `NotFound` (403), which matches the legacy status codes; the legacy
//!     500 body text `"Membership lookup failed"` is reported as the generic
//!     `"Internal server error"` here.
//!   * On a `task_projects` read failure the legacy route surfaces the PostgREST
//!     error message (`projectError.message || 'Internal server error'`). The
//!     upstream error body is not reproduced verbatim; this port always returns
//!     `"Internal server error"`.
//!   * The legacy route sets no explicit cache headers; this port responds
//!     `no-store` to match the crate's read convention (the legacy
//!     `NextResponse.json` is likewise uncached).

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorization, WorkspacePermissionAuthorizationError,
        authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_INFIX: &str = "/task-projects/";
const MANAGE_PROJECTS_PERMISSION: &str = "manage_projects";

const PROJECT_SELECT: &str = "*,creator:users!task_projects_creator_id_fkey(id,display_name,avatar_url),lead:users!task_projects_lead_id_fkey(id,display_name,avatar_url)";

pub(crate) async fn handle_workspaces_wsid_task_projects_projectid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, project_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => project_response(config, request, raw_ws_id, project_id, outbound).await,
        _ => return None,
    })
}

/// Extract `(wsId, projectId)` from the route path, returning `None` (so other
/// handlers/Next.js still run) when the path does not match verbatim.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, project_id) = rest.split_once(PATH_INFIX)?;
    if ws_id.is_empty()
        || ws_id.contains('/')
        || project_id.is_empty()
        || project_id.contains('/')
    {
        return None;
    }
    Some((ws_id, project_id))
}

async fn project_response(
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

    // Steps 2-5: normalize the workspace id, resolve the session user, verify
    // membership, and require the `manage_projects` permission.
    let WorkspacePermissionAuthorization { ws_id } = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_PROJECTS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return error_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(403, "Forbidden");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return error_response(
                403,
                "You don't have permission to perform this operation",
            );
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, "Internal server error");
        }
    };

    // Step 6: read the single `task_projects` row with the service-role key,
    // mirroring `createAdminClient` (RLS bypassed, scoped by `id` + `ws_id`).
    match fetch_project(contact_data, outbound, &ws_id, project_id).await {
        Ok(Some(project)) => no_store_response(json_response(200, project)),
        Ok(None) => error_response(404, "Project not found"),
        Err(()) => error_response(500, "Internal server error"),
    }
}

async fn fetch_project(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    project_id: &str,
) -> Result<Option<Value>, ()> {
    let url = contact_data
        .rest_url(
            "task_projects",
            &[
                ("select", PROJECT_SELECT.to_owned()),
                ("id", format!("eq.{project_id}")),
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

    // `.maybeSingle()` -> first row or `null`.
    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id_and_project_id() {
        assert_eq!(
            parse_path("/api/v1/workspaces/abc/task-projects/proj-1"),
            Some(("abc", "proj-1"))
        );
        assert_eq!(
            parse_path("/api/v1/workspaces/personal/task-projects/11111111-1111-4111-8111-111111111111"),
            Some(("personal", "11111111-1111-4111-8111-111111111111"))
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_malformed_paths() {
        // Missing projectId segment (the collection route).
        assert_eq!(parse_path("/api/v1/workspaces/abc/task-projects"), None);
        // Empty wsId or projectId.
        assert_eq!(parse_path("/api/v1/workspaces//task-projects/p"), None);
        assert_eq!(parse_path("/api/v1/workspaces/abc/task-projects/"), None);
        // Extra trailing segment must not match.
        assert_eq!(
            parse_path("/api/v1/workspaces/abc/task-projects/p/extra"),
            None
        );
        // Extra segment in the wsId position.
        assert_eq!(
            parse_path("/api/v1/workspaces/abc/def/task-projects/p"),
            None
        );
        // No `v1` segment must not match.
        assert_eq!(parse_path("/api/workspaces/abc/task-projects/p"), None);
        assert_eq!(parse_path("/totally/unrelated"), None);
    }

    #[test]
    fn error_response_shapes_error_body_with_no_store() {
        let response = error_response(404, "Project not found");
        assert_eq!(response.status, 404);
        assert_eq!(response.body, json!({ "error": "Project not found" }));
    }
}
