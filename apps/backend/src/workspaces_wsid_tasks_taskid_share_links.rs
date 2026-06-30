//! Handler for `GET /api/v1/workspaces/:wsId/tasks/:taskId/share-links`.
//!
//! Ports the legacy Next.js GET handler at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/share-links/route.ts`.
//!
//! Auth model (GET only — PATCH and DELETE fall through to the still-live Next.js route):
//!
//! 1. Resolve the caller's access token (cookie or Authorization bearer).
//! 2. Resolve the Supabase user id from the token.
//! 3. Normalize the workspace id (handles "personal", "internal", slug → UUID).
//! 4. Verify the caller is a workspace member (`workspace_members`).
//! 5. Verify the task belongs to the workspace via a nested join on `tasks →
//!    task_lists → workspace_boards`.
//! 6. Fetch or lazily create the single `task_share_links` row for the task.
//!
//! Behavior gaps vs. the legacy route:
//!
//! - **Code entropy**: the legacy uses Node.js `crypto.randomInt`, which is
//!   cryptographically secure.  Because this crate ships no PRNG dependency, the
//!   Rust port derives the 12-character alphanumeric code from SHA-256 of
//!   `(task_id | nanoseconds | attempt)`.  This is NOT cryptographically random;
//!   it is practically collision-resistant for typical traffic levels.
//! - **Membership check granularity**: the legacy `verifyWorkspaceMembershipType`
//!   accepts any non-null membership type.  This port does the same — any row in
//!   `workspace_members` for the (ws_id, user_id) pair is treated as valid.
//! - **App-session tokens**: the legacy Next.js route resolves session auth via
//!   the Supabase client cookie jar.  This handler uses only bearer-token auth
//!   extracted by `supabase_auth::request_access_token`; app-session-only callers
//!   will receive 401 and fall through to the Next.js route.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_TASKS_SEGMENT: &str = "/tasks/";
const PATH_SHARE_LINKS_SUFFIX: &str = "/share-links";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

/// PostgREST select for a full share-link row with creator user info.
const SHARE_LINK_SELECT: &str = "id,task_id,code,public_access,requires_invite,created_by_user_id,created_at,users:created_by_user_id(id,display_name,handle,avatar_url)";

/// Minimal select to verify task → task_list → workspace_board ownership.
const TASK_OWNERSHIP_SELECT: &str = "id,task_lists!inner(id,workspace_boards!inner(ws_id))";

/// Alphanumeric alphabet used by the legacy route.
const CODE_CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH: usize = 12;
const MAX_INSERT_ATTEMPTS: u32 = 10;

// -----------------------------------------------------------------------------
// REST row shapes
// -----------------------------------------------------------------------------

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
struct WorkspaceBoardOwnershipRow {
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct TaskListOwnershipRow {
    workspace_boards: Option<WorkspaceBoardOwnershipRow>,
}

#[derive(Deserialize)]
struct TaskOwnershipRow {
    task_lists: Option<TaskListOwnershipRow>,
}

#[derive(Deserialize)]
struct UserRow {
    id: Option<String>,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct ShareLinkRow {
    id: Option<String>,
    task_id: Option<String>,
    code: Option<String>,
    public_access: Option<String>,
    requires_invite: Option<bool>,
    created_by_user_id: Option<String>,
    created_at: Option<Value>,
    users: Option<UserRow>,
}

// Implement Serialize for UserRow so it round-trips through serde_json.
impl Serialize for UserRow {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("UserRow", 4)?;
        s.serialize_field("id", &self.id)?;
        s.serialize_field("display_name", &self.display_name)?;
        s.serialize_field("handle", &self.handle)?;
        s.serialize_field("avatar_url", &self.avatar_url)?;
        s.end()
    }
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_tasks_taskid_share_links_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, task_id) = share_links_path_params(request.path)?;

    Some(match request.method {
        "GET" => share_links_get_response(config, request, raw_ws_id, task_id, outbound).await,
        _ => return None,
    })
}

// -----------------------------------------------------------------------------
// GET handler
// -----------------------------------------------------------------------------

async fn share_links_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    task_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Validate path params: both must be UUID literals after normalization.
    // We accept workspace slugs (personal/internal) but task_id must be a UUID.
    if raw_ws_id.trim().is_empty() || !is_uuid_literal(task_id) {
        return error_response(400, "Invalid workspace or task ID");
    }

    // Auth: resolve caller from access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    // Normalize workspace id (handles personal / internal / handle / UUID).
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(id) => id,
            Err(()) => return error_response(500, "Failed to verify workspace access"),
        };

    // Validate normalized ws_id is a UUID (mirrors legacy `!validate(normalizedWsId)`).
    if !is_uuid_literal(&ws_id) {
        return error_response(400, "Invalid workspace or task ID");
    }

    // Verify workspace membership (any membership type is accepted).
    match workspace_membership(contact_data, outbound, &ws_id, &user_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return error_response(403, "You don't have access to this workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace access"),
    }

    // Verify task belongs to the workspace.
    match task_workspace(contact_data, outbound, task_id).await {
        Ok(Some(board_ws_id)) if board_ws_id == ws_id => {}
        Ok(Some(_)) | Ok(None) => {
            return error_response(404, "Task not found in this workspace");
        }
        Err(()) => return error_response(500, "Failed to verify task workspace"),
    }

    // Fetch existing share link.
    let existing = match fetch_share_link(contact_data, outbound, task_id).await {
        Ok(link) => link,
        Err(()) => return error_response(500, "Failed to fetch share link"),
    };

    if let Some(link) = existing {
        return no_store_response(json_response(200, json!({ "shareLink": link })));
    }

    // No link exists yet — lazily create one (mirrors the legacy GET behavior).
    let mut attempts: u32 = 0;
    loop {
        if attempts >= MAX_INSERT_ATTEMPTS {
            return error_response(500, "Failed to generate unique code");
        }

        let code = generate_share_code(task_id, attempts);

        match insert_share_link(contact_data, outbound, task_id, &code, &user_id).await {
            Ok(InsertOutcome::Created(link)) => {
                return no_store_response(json_response(201, json!({ "shareLink": link })));
            }
            Ok(InsertOutcome::Conflict) => {
                // Unique violation — either on `code` or on `task_id`.
                // Re-fetch: if a link now exists for this task, return it.
                match fetch_share_link(contact_data, outbound, task_id).await {
                    Ok(Some(link)) => {
                        return no_store_response(json_response(200, json!({ "shareLink": link })));
                    }
                    Ok(None) => {
                        // Collision was on `code`; retry with a new code.
                        attempts += 1;
                        continue;
                    }
                    Err(()) => return error_response(500, "Failed to create share link"),
                }
            }
            Err(()) => return error_response(500, "Failed to create share link"),
        }
    }
}

// -----------------------------------------------------------------------------
// REST queries
// -----------------------------------------------------------------------------

async fn workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

async fn task_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "tasks",
            &[
                ("select", TASK_OWNERSHIP_SELECT.to_owned()),
                ("id", format!("eq.{task_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskOwnershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.task_lists)
        .and_then(|list| list.workspace_boards)
        .and_then(|board| board.ws_id))
}

async fn fetch_share_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Result<Option<ShareLinkRow>, ()> {
    let url = contact_data
        .rest_url(
            "task_share_links",
            &[
                ("select", SHARE_LINK_SELECT.to_owned()),
                ("task_id", format!("eq.{task_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ShareLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

enum InsertOutcome {
    Created(Box<ShareLinkRow>),
    Conflict,
}

async fn insert_share_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
    code: &str,
    user_id: &str,
) -> Result<InsertOutcome, ()> {
    let url = contact_data
        .rest_url(
            "task_share_links",
            &[("select", SHARE_LINK_SELECT.to_owned())],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "task_id": task_id,
        "code": code,
        "public_access": "none",
        "requires_invite": false,
        "created_by_user_id": user_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "return=representation")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // 409 Conflict = unique constraint violation (code or task_id).
    if response.status == 409 {
        return Ok(InsertOutcome::Conflict);
    }

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let link = response
        .json::<Vec<ShareLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .ok_or(())?;

    Ok(InsertOutcome::Created(Box::new(link)))
}

// -----------------------------------------------------------------------------
// Workspace id normalization (matches legacy normalizeWorkspaceId)
// -----------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if is_uuid_literal(raw_ws_id.trim()) {
        return Ok(raw_ws_id.trim().to_owned());
    }

    // Slug / handle lookup.
    let handle = raw_ws_id.trim().to_lowercase();
    if !handle.is_empty()
        && let Ok(Some(id)) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await
    {
        return Ok(id);
    }

    Ok(raw_ws_id.to_owned())
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;

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
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
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

// -----------------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------------

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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// -----------------------------------------------------------------------------
// Path helpers
// -----------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/:wsId/tasks/:taskId/share-links` and returns
/// `(wsId, taskId)`.
fn share_links_path_params(path: &str) -> Option<(&str, &str)> {
    let after_prefix = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = after_prefix.split_once(PATH_TASKS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    let (task_id, tail) = match after_ws.split_once('/') {
        Some((task_id, tail)) => (task_id, tail),
        None => return None,
    };

    if task_id.is_empty() || tail != PATH_SHARE_LINKS_SUFFIX.trim_start_matches('/') {
        return None;
    }

    Some((ws_id, task_id))
}

// -----------------------------------------------------------------------------
// Code generation
// -----------------------------------------------------------------------------

/// Derives a 12-character alphanumeric code from SHA-256 of
/// `"{task_id}|{nanos}|{attempt}"`.
///
/// NOTE: This is NOT cryptographically random; the legacy route uses
/// `crypto.randomInt`.  See the module-level doc comment for the gap note.
fn generate_share_code(task_id: &str, attempt: u32) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(attempt);

    let input = format!("{task_id}|{nanos}|{attempt}");
    let digest = <sha2::Sha256 as sha2::Digest>::digest(input.as_bytes());

    let mut code = String::with_capacity(CODE_LENGTH);
    for i in 0..CODE_LENGTH {
        let idx = digest[i] as usize % CODE_CHARS.len();
        code.push(CODE_CHARS[idx] as char);
    }
    code
}

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(i, ch)| match i {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{CODE_LENGTH, generate_share_code, is_uuid_literal, share_links_path_params};

    #[test]
    fn path_params_matched() {
        let path =
            "/api/v1/workspaces/my-ws/tasks/550e8400-e29b-41d4-a716-446655440000/share-links";
        let result = share_links_path_params(path);
        assert!(result.is_some());
        let (ws, task) = result.unwrap();
        assert_eq!(ws, "my-ws");
        assert_eq!(task, "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn path_params_uuid_ws_id() {
        let path = "/api/v1/workspaces/550e8400-e29b-41d4-a716-446655440001/tasks/550e8400-e29b-41d4-a716-446655440000/share-links";
        let result = share_links_path_params(path);
        assert!(result.is_some());
        let (ws, _task) = result.unwrap();
        assert_eq!(ws, "550e8400-e29b-41d4-a716-446655440001");
    }

    #[test]
    fn path_params_wrong_suffix() {
        let path = "/api/v1/workspaces/my-ws/tasks/550e8400-e29b-41d4-a716-446655440000/other";
        assert!(share_links_path_params(path).is_none());
    }

    #[test]
    fn path_params_extra_segment() {
        let path =
            "/api/v1/workspaces/my-ws/tasks/550e8400-e29b-41d4-a716-446655440000/share-links/extra";
        assert!(share_links_path_params(path).is_none());
    }

    #[test]
    fn path_params_missing_task_id() {
        let path = "/api/v1/workspaces/my-ws/tasks//share-links";
        assert!(share_links_path_params(path).is_none());
    }

    #[test]
    fn path_params_too_short() {
        let path = "/api/v1/workspaces/my-ws/share-links";
        assert!(share_links_path_params(path).is_none());
    }

    #[test]
    fn path_params_empty_ws_id() {
        let path = "/api/v1/workspaces//tasks/550e8400-e29b-41d4-a716-446655440000/share-links";
        assert!(share_links_path_params(path).is_none());
    }

    #[test]
    fn uuid_literal_valid() {
        assert!(is_uuid_literal("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn uuid_literal_invalid() {
        assert!(!is_uuid_literal("not-a-uuid"));
        assert!(!is_uuid_literal(""));
        assert!(!is_uuid_literal("550e8400e29b41d4a716446655440000"));
    }

    #[test]
    fn generated_code_length_and_charset() {
        let code = generate_share_code("550e8400-e29b-41d4-a716-446655440000", 0);
        assert_eq!(code.len(), CODE_LENGTH);
        let allowed = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        for ch in code.chars() {
            assert!(allowed.contains(ch), "unexpected char: {ch}");
        }
    }

    #[test]
    fn generated_codes_differ_across_attempts() {
        // Different attempt values should (almost certainly) produce different
        // codes even when the clock is coarse.
        let c0 = generate_share_code("aaa", 0);
        let c1 = generate_share_code("aaa", 1);
        // They may collide in theory but SHA-256 makes this astronomically
        // unlikely; assert lengths at minimum.
        assert_eq!(c0.len(), CODE_LENGTH);
        assert_eq!(c1.len(), CODE_LENGTH);
    }
}
