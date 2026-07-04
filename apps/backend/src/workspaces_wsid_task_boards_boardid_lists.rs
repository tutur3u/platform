//! Handler for `GET /api/v1/workspaces/:wsId/task-boards/:boardId/lists`.
//!
//! Ports the legacy Next.js route at:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/lists/route.ts`
//!
//! # Auth model
//!
//! The legacy route uses `withSessionAuth` with `allowAppSessionAuth` for the
//! `tasks`, `calendar`, and CLI (`platform`) app targets, plus regular Supabase
//! session tokens. This handler reproduces that by first trying an app-session
//! identity (targets: `tasks`, `calendar`, `platform`) and then falling back to
//! a regular Bearer / cookie Supabase session.
//!
//! Board access is granted when:
//!
//! - The authenticated user is a workspace member (any membership type), OR
//! - The user has an explicit `task_board_shares` record for the board with at
//!   least `view` permission.
//!
//! All Supabase data reads use the service-role key (mirroring the legacy
//! `sbAdmin = createAdminClient({ noCookie: true })` client), so RLS is bypassed
//! after the explicit access gate.
//!
//! # Response shape
//!
//! ```text
//! 200 { "lists": [{ id, board_id, name, status, color, position, archived,
//!                   task_count }, ...] }
//! ```
//!
//! Task counts come from the private-schema RPC
//! `get_task_board_list_task_counts(p_board_id)`. If the RPC call fails the
//! handler returns `500`; if there are no lists the RPC is skipped.
//!
//! # Behavior gaps
//!
//! - `withSessionAuth` cross-cutting controls (IP blocks, rate limiting,
//!   suspension, step-up challenges) are not reproduced.
//! - The legacy board-access helper also resolves per-list guest shares and
//!   some edge-cases around archived/deleted boards. Those code paths are not
//!   reproduced here; only the common member + top-level board-guest paths
//!   are implemented.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const TASK_BOARDS_LISTS_APP_SESSION_TARGETS: [&str; 3] = ["tasks", "calendar", "platform"];

const PRIVATE_SCHEMA: &str = "private";
const GET_TASK_LIST_COUNTS_RPC: &str = "get_task_board_list_task_counts";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const ERR_UNAUTHORIZED: &str = "Unauthorized";
const ERR_INVALID_IDS: &str = "Invalid workspace or board ID";
const ERR_ACCESS_DENIED: &str = "Workspace access denied";
const ERR_INTERNAL: &str = "Internal server error";
const ERR_LOAD_LISTS: &str = "Failed to load task lists";
const ERR_LOAD_COUNTS: &str = "Failed to load task list counts";

// ---------------------------------------------------------------------------
// Supabase row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct BoardGuestShareRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct TaskListRow {
    id: String,
    board_id: Option<String>,
    name: Option<String>,
    status: Option<String>,
    color: Option<String>,
    position: Option<f64>,
    archived: Option<bool>,
}

#[derive(Deserialize)]
struct TaskListCountRow {
    list_id: Option<String>,
    task_count: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct SerializedList {
    id: String,
    board_id: Option<String>,
    name: Option<String>,
    status: Option<String>,
    color: Option<String>,
    position: Option<f64>,
    archived: Option<bool>,
    task_count: i64,
}

#[derive(Serialize)]
struct TaskListCountRpcRequest<'a> {
    p_board_id: &'a str,
}

struct AuthenticatedUser {
    user_id: String,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_task_boards_boardid_lists_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, board_id) = lists_path_params(request.path)?;

    Some(match request.method {
        "GET" => lists_get_response(config, request, raw_ws_id, board_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn lists_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if raw_ws_id.trim().is_empty() || !is_uuid_literal(board_id) {
        return error_response(400, ERR_INVALID_IDS);
    }

    if !contact_data.configured() {
        return error_response(500, ERR_INTERNAL);
    }

    // Authenticate the caller (app session or regular supabase session).
    let Some(auth_user) = authenticate(config, request, outbound).await else {
        return error_response(401, ERR_UNAUTHORIZED);
    };

    // Normalize the workspace id (handle 'personal', handle slugs, etc.).
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &auth_user.user_id).await {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, ERR_INTERNAL),
        };

    // Verify the caller has access to the board: workspace member OR board guest.
    let is_ws_member =
        workspace_membership_type(contact_data, outbound, &ws_id, &auth_user.user_id)
            .await
            .unwrap_or(None)
            .is_some();

    if !is_ws_member {
        let is_board_guest =
            has_board_guest_access(contact_data, outbound, board_id, &auth_user.user_id)
                .await
                .unwrap_or(false);
        if !is_board_guest {
            return error_response(403, ERR_ACCESS_DENIED);
        }
    }

    // Fetch lists.
    let lists = match fetch_task_lists(contact_data, outbound, board_id).await {
        Ok(lists) => lists,
        Err(()) => return error_response(500, ERR_LOAD_LISTS),
    };

    if lists.is_empty() {
        return no_store_response(json_response(200, json!({ "lists": [] })));
    }

    // Fetch task counts from the private-schema RPC.
    let counts = match fetch_task_counts(contact_data, outbound, board_id).await {
        Ok(counts) => counts,
        Err(()) => return error_response(500, ERR_LOAD_COUNTS),
    };

    let serialized: Vec<SerializedList> = lists
        .into_iter()
        .map(|list| {
            let task_count = counts.get(&list.id).copied().unwrap_or(0);
            SerializedList {
                id: list.id,
                board_id: list.board_id,
                name: list.name,
                status: list.status,
                color: list.color,
                position: list.position,
                archived: list.archived,
                task_count,
            }
        })
        .collect();

    no_store_response(json_response(200, json!({ "lists": serialized })))
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async fn authenticate(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    // App session path: CLI / tasks / calendar tokens.
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) = contact::resolve_app_session_identity(
            config,
            request,
            &TASK_BOARDS_LISTS_APP_SESSION_TARGETS,
        ) {
            let id = identity.id;
            if !id.trim().is_empty() {
                return Some(AuthenticatedUser { user_id: id });
            }
        }
        return None;
    }

    // Regular Supabase session path.
    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let user_id = user.id.filter(|id| !id.trim().is_empty())?;
    Some(AuthenticatedUser { user_id })
}

// ---------------------------------------------------------------------------
// Workspace helpers (local copies; see viewable_members for the canonical pattern)
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
) -> Result<String, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_workspace_handle(&handle)
            && let Some(workspace_id) =
                workspace_id_by_handle(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

/// Returns `Ok(true)` when the user has an active `task_board_shares` record
/// for the board (any permission level satisfies the legacy `view` default).
async fn has_board_guest_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            ("select", "permission".to_owned()),
            ("board_id", format!("eq.{board_id}")),
            ("shared_with_user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(false);
    }
    let rows = response.json::<Vec<BoardGuestShareRow>>().map_err(|_| ())?;
    Ok(!rows.is_empty() && rows[0].permission.is_some())
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async fn fetch_task_lists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
) -> Result<Vec<TaskListRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_lists",
        &[
            (
                "select",
                "id,board_id,name,status,color,position,archived".to_owned(),
            ),
            ("board_id", format!("eq.{board_id}")),
            ("deleted", "eq.false".to_owned()),
            ("order", "position.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<TaskListRow>>().map_err(|_| ())
}

/// Calls the `private.get_task_board_list_task_counts` RPC and returns a map
/// of `list_id -> task_count`.
async fn fetch_task_counts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_id: &str,
) -> Result<std::collections::HashMap<String, i64>, ()> {
    let Some(rpc_url) = contact_data.rpc_url(GET_TASK_LIST_COUNTS_RPC) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&TaskListCountRpcRequest {
        p_board_id: board_id,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<TaskListCountRow>>().map_err(|_| ())?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        let Some(list_id) = row.list_id else { continue };
        let count = match &row.task_count {
            Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(0),
            Some(serde_json::Value::String(s)) => s.parse::<i64>().unwrap_or(0),
            _ => 0,
        };
        map.insert(list_id, count);
    }
    Ok(map)
}

// ---------------------------------------------------------------------------
// Outbound helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/:wsId/task-boards/:boardId/lists` and returns
/// `(wsId, boardId)`. Returns `None` for any other path.
fn lists_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    if segments.len() == 7
        && segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(4) == Some(&"task-boards")
        && segments.get(6) == Some(&"lists")
    {
        let ws_id = segments.get(3).copied()?;
        let board_id = segments.get(5).copied()?;
        if ws_id.is_empty() || board_id.is_empty() {
            return None;
        }
        Some((ws_id, board_id))
    } else {
        None
    }
}

fn is_uuid_literal(value: &str) -> bool {
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
    fn lists_path_params_matches_exact_route() {
        let ws = "11111111-1111-4111-8111-111111111111";
        let board = "22222222-2222-4222-8222-222222222222";
        let path = format!("/api/v1/workspaces/{ws}/task-boards/{board}/lists");
        assert_eq!(lists_path_params(&path), Some((ws, board)));
    }

    #[test]
    fn lists_path_params_rejects_extra_segments() {
        let path = "/api/v1/workspaces/ws1/task-boards/b1/lists/extra";
        assert_eq!(lists_path_params(path), None);
    }

    #[test]
    fn lists_path_params_rejects_wrong_suffix() {
        let path = "/api/v1/workspaces/ws1/task-boards/b1/members";
        assert_eq!(lists_path_params(path), None);
    }

    #[test]
    fn lists_path_params_rejects_short_path() {
        let path = "/api/v1/workspaces/ws1/task-boards/b1";
        assert_eq!(lists_path_params(path), None);
    }

    #[test]
    fn lists_path_params_rejects_unrelated_path() {
        let path = "/api/v1/shared/task-boards/some-code";
        assert_eq!(lists_path_params(path), None);
    }

    #[test]
    fn is_uuid_literal_accepts_valid_uuid() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
    }

    #[test]
    fn is_uuid_literal_rejects_non_uuid() {
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
        assert!(!is_uuid_literal(""));
    }

    #[test]
    fn is_workspace_handle_accepts_valid_handles() {
        assert!(is_workspace_handle("myworkspace"));
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("my_workspace"));
        assert!(is_workspace_handle("abc123"));
    }

    #[test]
    fn is_workspace_handle_rejects_invalid_handles() {
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-leading-dash"));
        assert!(!is_workspace_handle("trailing-dash-"));
        assert!(!is_workspace_handle("UPPERCASE"));
    }
}
