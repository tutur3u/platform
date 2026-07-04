//! Handler for `GET /api/v1/workspaces/:wsId/tasks/:taskId/description`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/description/route.ts`
//! (which delegates to `handleTaskDescriptionRouteGET` in
//! `packages/apis/src/tu-do/tasks/taskId/description/route.ts`).
//!
//! ## Auth model
//!
//! The legacy route uses `withSessionAuth` with `allowAppSessionAuth` for
//! CLI/calendar/tasks app-session tokens. This handler only handles standard
//! bearer-token (Supabase session) requests; app-session requests are passed
//! through to the still-active Next.js route via `return None`.
//!
//! ## Response shape (200 OK)
//!
//! ```json
//! { "description": "<string or null>", "description_yjs_state": [<int>, ...] | null }
//! ```
//!
//! ## Behavior gaps
//!
//! - App-session requests (CLI/calendar/tasks) are not handled here and fall
//!   through to Next.js, which accepts them via `withSessionAuth`.
//! - The PATCH method (and all non-GET methods) return `None` so Next.js still
//!   handles them.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const TASKS_SEGMENT: &str = "/tasks/";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const TASK_NOT_FOUND_MESSAGE: &str = "Task not found";
const LOAD_TASK_FAILED_MESSAGE: &str = "Failed to load task";

/// Select sufficient columns to verify workspace ownership and read description
/// fields in a single round-trip.
const DESCRIPTION_SELECT: &str =
    "id,description,description_yjs_state,task_lists!inner(workspace_boards!inner(ws_id))";

// ── data structs ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct WorkspaceBoardWsRow {
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct TaskListWsRow {
    workspace_boards: Option<WorkspaceBoardWsRow>,
}

#[derive(Deserialize)]
struct TaskDescriptionRow {
    #[allow(dead_code)]
    id: Option<String>,
    description: Option<String>,
    description_yjs_state: Option<Value>,
    task_lists: Option<TaskListWsRow>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

// ── public handler ────────────────────────────────────────────────────────────

pub(crate) async fn handle_workspaces_wsid_tasks_taskid_description_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, task_id) = description_path_parts(request.path)?;

    // Only GET is migrated. PATCH and all other methods fall through to Next.js.
    Some(match request.method {
        "GET" => description_get_response(config, request, raw_ws_id, task_id, outbound).await?,
        _ => return None,
    })
}

// ── GET implementation ────────────────────────────────────────────────────────

async fn description_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let contact_data = &config.contact_data;

    // App-session requests (CLI / calendar / tasks apps) are handled by the
    // still-active Next.js route; fall through here.
    if contact::request_has_app_session_token(request) {
        return None;
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Some(error_response(401, UNAUTHORIZED_MESSAGE));
    };

    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Some(error_response(401, UNAUTHORIZED_MESSAGE));
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return Some(error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE)),
        };

    // Member fast-path. Non-members (guest board-share) fall through to Next.js.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return None,
        Err(()) => return Some(error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE)),
    }

    let task = match fetch_task_description(contact_data, outbound, task_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return Some(error_response(404, TASK_NOT_FOUND_MESSAGE)),
        Err(()) => return Some(error_response(500, LOAD_TASK_FAILED_MESSAGE)),
    };

    // Verify the task belongs to the resolved workspace.
    let task_ws_id = task
        .task_lists
        .as_ref()
        .and_then(|list| list.workspace_boards.as_ref())
        .and_then(|board| board.ws_id.as_deref());

    if task_ws_id != Some(resolved_ws_id.as_str()) {
        return Some(error_response(404, TASK_NOT_FOUND_MESSAGE));
    }

    Some(no_store_response(json_response(
        200,
        json!({
            "description": task.description,
            "description_yjs_state": task.description_yjs_state,
        }),
    )))
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async fn fetch_task_description(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Option<TaskDescriptionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            ("select", DESCRIPTION_SELECT.to_owned()),
            ("id", format!("eq.{task_id}")),
            ("deleted_at", "is.null".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskDescriptionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
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
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_workspace_lookup_identifier(&handle) {
            if let Some(ws_id) =
                workspace_id_by_handle(contact_data, outbound, &handle, access_token, false).await?
            {
                return Ok(ws_id);
            }
            if let Some(ws_id) =
                workspace_id_by_handle(contact_data, outbound, &handle, access_token, true).await?
            {
                return Ok(ws_id);
            }
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
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

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

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
    access_token: &str,
    service_role: bool,
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

    let response = if service_role {
        send_service_role_get(contact_data, outbound, &url).await?
    } else {
        send_caller_get(contact_data, outbound, &url, access_token).await?
    };

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

async fn send_caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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

// ── path helpers ──────────────────────────────────────────────────────────────

/// Extract `(raw_ws_id, task_id)` from a path matching
/// `/api/v1/workspaces/:wsId/tasks/:taskId/description`.
///
/// Returns `None` for any other path shape, so the handler correctly returns
/// `None` and the request falls through to Next.js or another handler.
fn description_path_parts(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(TASKS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    // after_ws must be exactly "<taskId>/description"
    let (task_id, suffix) = after_ws.split_once('/')?;
    if task_id.is_empty() || suffix != "description" {
        return None;
    }

    Some((ws_id, task_id))
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, ch)| match index {
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

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── description_path_parts ────────────────────────────────────────────────

    #[test]
    fn path_matches_valid_route() {
        let (ws, task) =
            description_path_parts("/api/v1/workspaces/some-ws/tasks/some-task/description")
                .unwrap();
        assert_eq!(ws, "some-ws");
        assert_eq!(task, "some-task");
    }

    #[test]
    fn path_matches_uuid_ids() {
        let ws_id = "11111111-1111-1111-1111-111111111111";
        let task_id = "22222222-2222-2222-2222-222222222222";
        let path = format!("/api/v1/workspaces/{ws_id}/tasks/{task_id}/description");
        let (ws, task) = description_path_parts(&path).unwrap();
        assert_eq!(ws, ws_id);
        assert_eq!(task, task_id);
    }

    #[test]
    fn path_rejects_missing_description_suffix() {
        // Plain task path — no /description
        assert!(description_path_parts("/api/v1/workspaces/ws/tasks/task").is_none());
    }

    #[test]
    fn path_rejects_wrong_suffix() {
        assert!(description_path_parts("/api/v1/workspaces/ws/tasks/task/other").is_none());
    }

    #[test]
    fn path_rejects_extra_trailing_segment() {
        assert!(
            description_path_parts("/api/v1/workspaces/ws/tasks/task/description/extra").is_none()
        );
    }

    #[test]
    fn path_rejects_wrong_prefix() {
        assert!(description_path_parts("/api/v2/workspaces/ws/tasks/task/description").is_none());
    }

    #[test]
    fn path_rejects_empty_ws_id() {
        assert!(description_path_parts("/api/v1/workspaces//tasks/task/description").is_none());
    }

    #[test]
    fn path_rejects_empty_task_id() {
        assert!(description_path_parts("/api/v1/workspaces/ws/tasks//description").is_none());
    }

    // ── workspace id helpers ──────────────────────────────────────────────────

    #[test]
    fn resolve_internal_maps_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    }

    #[test]
    fn resolve_uuid_literal_is_identity() {
        let uuid = "11111111-1111-1111-1111-111111111111";
        assert_eq!(resolve_workspace_id(uuid), uuid);
    }

    #[test]
    fn uuid_literal_detection() {
        assert!(is_workspace_uuid_literal(
            "11111111-1111-1111-1111-111111111111"
        ));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal("short"));
    }

    #[test]
    fn workspace_handle_detection() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("ws123"));
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-leading-dash"));
        assert!(!is_workspace_handle("trailing-dash-"));
    }
}
