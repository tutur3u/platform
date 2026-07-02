//! Handler for `GET /api/v1/workspaces/:wsId/task-boards/:boardId/shares`.
//!
//! Ports the GET handler of the legacy Next.js route at:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/shares/route.ts`
//!
//! Legacy methods: GET, POST, PATCH, DELETE. Only GET is migrated here; POST,
//! PATCH, and DELETE return `None` so the live Next.js route continues to
//! handle them.
//!
//! # Auth model
//!
//! The legacy route uses `withSessionAuth` (session cookie / Bearer token) and
//! then `requireBoardShareManager`, which:
//!
//! - normalizes the workspace ID (handles the `personal` slug),
//! - verifies the caller is a workspace member,
//! - checks the `manage_projects` workspace permission, and
//! - confirms the board (`workspace_boards`) belongs to the resolved workspace.
//!
//! This handler reproduces all of these checks via
//! `workspace_permission_check::authorize_workspace_permission` (for the
//! session + workspace-member + permission gate) and an explicit admin-client
//! board existence query.
//!
//! # Response shape
//!
//! ```text
//! 200 { "shares": [{ id, email, user_id, permission, created_at,
//!                    user: { id, display_name, handle, avatar_url } | null
//!                  }, ...] }
//! ```
//!
//! Shares are ordered newest-first (matching `.order('created_at', { ascending: false })`
//! in the legacy route).
//!
//! # Behavior gaps vs. legacy
//!
//! - App-session tokens (`ttr_app_*`) are NOT accepted; only standard Supabase
//!   session JWTs are handled. The legacy route uses `withSessionAuth` without
//!   `allowAppSessionAuth`, so this is not a regression.
//! - The `withSessionAuth` cross-cutting controls (IP blocks, rate limiting,
//!   suspension, step-up challenges) are not reproduced here.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANAGE_PROJECTS: &str = "manage_projects";

const BOARD_SHARE_SELECT: &str = concat!(
    "id,shared_with_user_id,shared_with_email,permission,created_at,",
    "users:shared_with_user_id(id,display_name,handle,avatar_url)"
);

// ---------------------------------------------------------------------------
// Supabase row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BoardExistsRow {
    #[allow(dead_code)]
    id: String,
}

#[derive(Deserialize)]
struct ShareUserRow {
    id: Option<String>,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct ShareRow {
    id: String,
    shared_with_user_id: Option<String>,
    shared_with_email: Option<String>,
    permission: Option<String>,
    created_at: Option<String>,
    users: Option<ShareUserRow>,
}

// ---------------------------------------------------------------------------
// Response payload types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct ShareUserOut {
    id: Option<String>,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Serialize)]
struct ShareOut {
    id: String,
    email: Option<String>,
    user_id: Option<String>,
    permission: Option<String>,
    created_at: Option<String>,
    user: Option<ShareUserOut>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_task_boards_boardid_shares_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, board_id) = shares_path_params(request.path)?;

    Some(match request.method {
        "GET" => get_shares_response(config, request, raw_ws_id, board_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_shares_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Validate params (mirrors zod paramsSchema: wsId non-empty, boardId guid).
    if raw_ws_id.trim().is_empty() || !is_uuid_literal(board_id) {
        return error_response(400, "Invalid workspace or board ID");
    }

    // Auth: session + workspace membership + manage_projects permission.
    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_PROJECTS,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return error_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return error_response(403, "You don't have permission to perform this operation");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(403, "Workspace access denied");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, "Failed to verify workspace access");
        }
    };

    let ws_id = &authorization.ws_id;

    // Verify the board exists in this workspace (mirrors the workspace_boards
    // query in requireBoardShareManager).
    match verify_board_exists(contact_data, outbound, ws_id, board_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, "Board not found"),
        Err(()) => return error_response(500, "Failed to load task board"),
    }

    // Fetch shares with embedded user join, newest first.
    match fetch_shares(contact_data, outbound, board_id).await {
        Ok(rows) => {
            let shares: Vec<ShareOut> = rows.into_iter().map(serialize_share).collect();
            no_store_response(json_response(200, json!({ "shares": shares })))
        }
        Err(()) => error_response(500, "Failed to load board shares"),
    }
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async fn verify_board_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    board_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_boards",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{board_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<BoardExistsRow>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

async fn fetch_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
) -> Result<Vec<ShareRow>, ()> {
    let url = contact_data
        .rest_url(
            "task_board_shares",
            &[
                ("select", BOARD_SHARE_SELECT.to_owned()),
                ("board_id", format!("eq.{board_id}")),
                ("order", "created_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<ShareRow>>().map_err(|_| ())
}

async fn service_role_get(
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

// ---------------------------------------------------------------------------
// Serialization (mirrors serializeShare in the legacy TypeScript route)
// ---------------------------------------------------------------------------

fn serialize_share(row: ShareRow) -> ShareOut {
    let user = row.users.map(|u| {
        let id = u.id.or_else(|| row.shared_with_user_id.clone());
        ShareUserOut {
            id,
            display_name: u.display_name,
            handle: u.handle,
            avatar_url: u.avatar_url,
        }
    });

    ShareOut {
        id: row.id,
        email: row.shared_with_email,
        user_id: row.shared_with_user_id,
        permission: row.permission,
        created_at: row.created_at,
        user,
    }
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/:wsId/task-boards/:boardId/shares` exactly
/// (7 segments) and returns `(wsId, boardId)`.
///
/// Uses `.get(i)` (returns `Option`) so a short path never panics.
fn shares_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    if segments.len() == 7
        && segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(3).is_some_and(|s| !s.is_empty())
        && segments.get(4) == Some(&"task-boards")
        && segments.get(5).is_some_and(|s| !s.is_empty())
        && segments.get(6) == Some(&"shares")
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(i, ch)| match i {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const WS_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
    const BOARD_ID: &str = "660e8400-e29b-41d4-a716-446655440001";

    #[test]
    fn path_guard_matches_exact_seven_segment_path() {
        let path = format!("/api/v1/workspaces/{WS_ID}/task-boards/{BOARD_ID}/shares");
        assert_eq!(shares_path_params(&path), Some((WS_ID, BOARD_ID)));
    }

    #[test]
    fn path_guard_rejects_extra_segments() {
        let path = format!("/api/v1/workspaces/{WS_ID}/task-boards/{BOARD_ID}/shares/extra");
        assert!(shares_path_params(&path).is_none());
    }

    #[test]
    fn path_guard_rejects_six_segment_board_path() {
        let path = format!("/api/v1/workspaces/{WS_ID}/task-boards/{BOARD_ID}");
        assert!(shares_path_params(&path).is_none());
    }

    #[test]
    fn path_guard_rejects_wrong_static_segments() {
        let path = format!("/api/v1/workspaces/{WS_ID}/boards/{BOARD_ID}/shares");
        assert!(shares_path_params(&path).is_none());
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        let path = format!("/api/v1/workspaces/{WS_ID}/task-boards/{BOARD_ID}/members");
        assert!(shares_path_params(&path).is_none());
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        let path = format!("/api/v1/workspaces//task-boards/{BOARD_ID}/shares");
        assert!(shares_path_params(&path).is_none());
    }

    #[test]
    fn is_uuid_literal_accepts_valid_uuid() {
        assert!(is_uuid_literal(BOARD_ID));
    }

    #[test]
    fn is_uuid_literal_rejects_short_string() {
        assert!(!is_uuid_literal("short"));
    }

    #[test]
    fn serialize_share_with_user() {
        let row = ShareRow {
            id: "share-1".to_owned(),
            shared_with_user_id: Some("user-1".to_owned()),
            shared_with_email: Some("user@example.com".to_owned()),
            permission: Some("view".to_owned()),
            created_at: Some("2025-01-01T00:00:00Z".to_owned()),
            users: Some(ShareUserRow {
                id: Some("user-1".to_owned()),
                display_name: Some("Alice".to_owned()),
                handle: Some("alice".to_owned()),
                avatar_url: None,
            }),
        };
        let out = serialize_share(row);
        assert_eq!(out.id, "share-1");
        assert_eq!(out.email.as_deref(), Some("user@example.com"));
        assert_eq!(out.user_id.as_deref(), Some("user-1"));
        let user = out.user.expect("user should be Some");
        assert_eq!(user.id.as_deref(), Some("user-1"));
        assert_eq!(user.display_name.as_deref(), Some("Alice"));
    }

    #[test]
    fn serialize_share_without_user() {
        let row = ShareRow {
            id: "share-2".to_owned(),
            shared_with_user_id: None,
            shared_with_email: Some("guest@example.com".to_owned()),
            permission: Some("edit".to_owned()),
            created_at: None,
            users: None,
        };
        let out = serialize_share(row);
        assert!(out.user.is_none());
    }

    #[test]
    fn serialize_share_user_id_fallback_to_shared_with_user_id() {
        // When users.id is None but shared_with_user_id is Some, the output
        // user.id should fall back to shared_with_user_id.
        let row = ShareRow {
            id: "share-3".to_owned(),
            shared_with_user_id: Some("fallback-id".to_owned()),
            shared_with_email: None,
            permission: Some("view".to_owned()),
            created_at: None,
            users: Some(ShareUserRow {
                id: None,
                display_name: None,
                handle: None,
                avatar_url: None,
            }),
        };
        let out = serialize_share(row);
        let user = out.user.expect("user should be Some");
        assert_eq!(user.id.as_deref(), Some("fallback-id"));
    }
}
