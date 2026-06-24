use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_WORKSPACE_MESSAGE: &str = "Invalid workspace identifier";
const ACCESS_VERIFY_FAILED_MESSAGE: &str = "Internal error verifying workspace access";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const BOARD_NOT_FOUND_MESSAGE: &str = "Mind board not found";
const LOAD_SNAPSHOT_FAILED_MESSAGE: &str = "Failed to load Mind graph snapshot";

const MIND_GRAPH_SNAPSHOT_RPC: &str = "mind_get_board_graph_snapshot";

const MIND_PATH_PREFIX: &str = "/api/v1/workspaces/";
const MIND_PATH_SEGMENT: &str = "/mind/boards/";
const MIND_PATH_SUFFIX: &str = "/graph";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_mind_boards_boardid_graph_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, board_id) = mind_graph_path_parts(request.path)?;

    // Only the GET method is migrated here. The legacy route also defines PUT,
    // which is NOT migrated yet, so return None for every other method to let
    // the Cloudflare worker fall through to the still-active Next.js route.
    Some(match request.method {
        "GET" => mind_graph_get_response(config, request, raw_ws_id, board_id, outbound).await?,
        _ => return None,
    })
}

async fn mind_graph_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let contact_data = &config.contact_data;

    // App-session-authenticated requests (CLI/calendar/tasks apps) cannot be
    // resolved with a Supabase access token here. The legacy route opts into
    // `allowAppSessionAuth`, so fall through to the Next.js route which still
    // handles the app-session path inside withSessionAuth.
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

    // Legacy `requireMindAccess` returns 422 ("Invalid workspace identifier")
    // when `normalizeWorkspaceId` throws. We collapse any normalization failure
    // (including REST lookup failures) into that 422 to keep the response shape
    // aligned with the Next.js route.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return Some(error_response(422, INVALID_WORKSPACE_MESSAGE)),
        };

    // Legacy `verifyWorkspaceMembershipType({ requiredType: 'MEMBER' })`:
    //  - lookup failure -> 500 "Internal error verifying workspace access"
    //  - non-member     -> 403 "Workspace access denied"
    // This route has NO guest/board-share fallback, so non-members get 403
    // rather than falling through to Next.js.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return Some(error_response(403, ACCESS_DENIED_MESSAGE)),
        Err(()) => return Some(error_response(500, ACCESS_VERIFY_FAILED_MESSAGE)),
    }

    match fetch_mind_graph_snapshot(contact_data, outbound, &resolved_ws_id, board_id).await {
        // RPC returned a JSON null -> legacy returns 404 "Mind board not found".
        Ok(value) if value.is_null() => Some(error_response(404, BOARD_NOT_FOUND_MESSAGE)),
        // Otherwise forward the RPC payload verbatim so the response shape
        // matches getMindBoardGraphSnapshot exactly.
        Ok(value) => Some(no_store_response(json_response(200, value))),
        Err(()) => Some(error_response(500, LOAD_SNAPSHOT_FAILED_MESSAGE)),
    }
}

/// Calls the `private.mind_get_board_graph_snapshot(p_ws_id, p_board_id)` RPC
/// with the service role, mirroring the legacy `callMindRpc` (which targets the
/// `private` schema via `.schema('private').rpc(...)`). Returns the RPC payload
/// verbatim, including a JSON `null` when the board does not exist.
async fn fetch_mind_graph_snapshot(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    board_id: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rpc_url(MIND_GRAPH_SNAPSHOT_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_ws_id": ws_id,
        "p_board_id": board_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token, false).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token, true).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
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

/// Matches `/api/v1/workspaces/<wsId>/mind/boards/<boardId>/graph` and extracts
/// the two dynamic segments. Returns None (so the worker falls through) for any
/// other path shape, including extra trailing sub-resource segments.
fn mind_graph_path_parts(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(MIND_PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(MIND_PATH_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    let board_id = after_ws.strip_suffix(MIND_PATH_SUFFIX)?;
    if board_id.is_empty() || board_id.contains('/') {
        return None;
    }

    Some((ws_id, board_id))
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
