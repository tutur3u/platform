//! Handler for `GET /api/v1/workspaces/:wsId/tulearn/parent-links`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tulearn/parent-links/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route uses `withSessionAuth` with `allowAppSessionAuth: true` and
//! checks the `manage_users` workspace permission. This handler uses
//! `authorize_workspace_permission`, which does NOT accept app-session tokens
//! (it calls `request_access_token_ignoring_app_sessions` internally). Callers
//! presenting only an app-session token receive a `401` instead of the
//! permission-gated `404` they might receive from the legacy route.
//!
//! ## Status-code mapping
//!
//! | Condition                             | Legacy  | This handler |
//! |---------------------------------------|---------|--------------|
//! | No / invalid session                  | 401     | 401          |
//! | Authenticated but lacks `manage_users`| 404     | 404          |
//! | Workspace not found                   | 404     | 404          |
//! | Config / upstream error               | 500     | 500          |
//! | Tulearn not enabled for workspace     | 404     | 404          |
//! | Success                               | 200     | 200          |
//!
//! ## Response shape (success)
//!
//! ```json
//! { "links": [ /* tulearn_parent_student_links rows with embeds */ ] }
//! ```
//!
//! The `links` array may be empty. Rows are ordered by `created_at` descending,
//! matching the legacy `.order('created_at', { ascending: false })`.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/tulearn/parent-links";

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

const MANAGE_USERS_PERMISSION: &str = "manage_users";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";

// ---------------------------------------------------------------------------
// Supabase select for tulearn_parent_student_links (mirrors the legacy query)
// ---------------------------------------------------------------------------

const PARENT_LINKS_SELECT: &str = concat!(
    "id,ws_id,parent_user_id,student_platform_user_id,",
    "student_workspace_user_id,status,created_at,accepted_at,revoked_at,",
    "student:workspace_users!student_workspace_user_id(id,full_name,display_name,email),",
    "parent:users!parent_user_id(id,display_name,avatar_url)"
);

// ---------------------------------------------------------------------------
// Deserialization helpers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

// The full parent-link row is returned as raw JSON values so that the Rust
// handler does not need to enumerate every nested embed field; serde_json
// deserialises each row as an opaque Value and the handler re-serialises
// the array unchanged.
use serde_json::Value;

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct ParentLinksResponse {
    links: Vec<Value>,
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_tulearn_parent_links_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = parent_links_ws_id(request.path)?;

    Some(match request.method {
        "GET" => parent_links_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

async fn parent_links_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Authenticate and check manage_users permission.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_USERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(404, "Not found");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to load parent links");
        }
    };

    let ws_id = &authorization.ws_id;
    let contact_data = &config.contact_data;

    // Check that Tulearn (education) is enabled for the workspace.
    match education_enabled(contact_data, outbound, ws_id).await {
        Ok(true) => {}
        Ok(false) => {
            return message_response(404, "Tulearn is not enabled for this workspace");
        }
        Err(()) => {
            return message_response(500, "Failed to load parent links");
        }
    }

    // Fetch the parent-student links.
    match fetch_parent_links(contact_data, outbound, ws_id).await {
        Ok(links) => no_store_response(json_response(200, ParentLinksResponse { links })),
        Err(()) => message_response(500, "Failed to load parent links"),
    }
}

// ---------------------------------------------------------------------------
// Tulearn education-enabled check (mirrors hasEducationEnabled)
// ---------------------------------------------------------------------------

async fn education_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_secrets",
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
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

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async fn fetch_parent_links(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "tulearn_parent_student_links",
            &[
                ("select", PARENT_LINKS_SELECT.to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.desc".to_owned()),
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

    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

fn parent_links_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Response builders
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

    #[test]
    fn path_extraction_happy() {
        let ws_id = "550e8400-e29b-41d4-a716-446655440000";
        let path = format!("/api/v1/workspaces/{ws_id}/tulearn/parent-links");
        assert_eq!(parent_links_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn path_extraction_slug() {
        let path = "/api/v1/workspaces/my-workspace/tulearn/parent-links";
        assert_eq!(parent_links_ws_id(path), Some("my-workspace"));
    }

    #[test]
    fn path_extraction_rejects_wrong_suffix() {
        let path = "/api/v1/workspaces/abc/tulearn/parent-links/extra";
        assert!(parent_links_ws_id(path).is_none());
    }

    #[test]
    fn path_extraction_rejects_wrong_prefix() {
        let path = "/api/v2/workspaces/abc/tulearn/parent-links";
        assert!(parent_links_ws_id(path).is_none());
    }

    #[test]
    fn path_extraction_rejects_nested_ws_id() {
        // Nested slashes would indicate a different sub-route.
        let path = "/api/v1/workspaces/a/b/tulearn/parent-links";
        assert!(parent_links_ws_id(path).is_none());
    }

    #[test]
    fn path_extraction_rejects_empty_ws_id() {
        let path = "/api/v1/workspaces//tulearn/parent-links";
        assert!(parent_links_ws_id(path).is_none());
    }

    #[test]
    fn select_constant_contains_required_fields() {
        assert!(PARENT_LINKS_SELECT.contains("id"));
        assert!(PARENT_LINKS_SELECT.contains("ws_id"));
        assert!(PARENT_LINKS_SELECT.contains("parent_user_id"));
        assert!(PARENT_LINKS_SELECT.contains("student_platform_user_id"));
        assert!(PARENT_LINKS_SELECT.contains("student_workspace_user_id"));
        assert!(PARENT_LINKS_SELECT.contains("status"));
        assert!(PARENT_LINKS_SELECT.contains("created_at"));
        assert!(PARENT_LINKS_SELECT.contains("accepted_at"));
        assert!(PARENT_LINKS_SELECT.contains("revoked_at"));
        assert!(PARENT_LINKS_SELECT.contains("student:workspace_users!student_workspace_user_id"));
        assert!(PARENT_LINKS_SELECT.contains("parent:users!parent_user_id"));
    }
}
