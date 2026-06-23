use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_WS_MESSAGE: &str = "Invalid workspace identifier";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Internal error verifying workspace access";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const PATCHES_LOAD_FAILED_MESSAGE: &str = "Failed to load Mind AI patches";

const LIST_PATCHES_RPC: &str = "mind_list_ai_patches";
const PATCH_LIMIT: i64 = 20;

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MID: &str = "/mind/boards/";
const PATH_SUFFIX: &str = "/patches";

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
struct PatchTableRow {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    thread_id: Option<String>,
    #[serde(default)]
    board_id: Option<String>,
    #[serde(default)]
    created_by: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    patch: Option<Value>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    applied_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
}

pub(crate) async fn handle_workspaces_mind_boards_patches_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, board_id) = match_patches_path(request.path)?;

    Some(match request.method {
        "GET" => patches_response(config, request, raw_ws_id, board_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn patches_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy route allows both Supabase tokens and app session tokens.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(ws_id)) => ws_id,
        // normalizeWorkspaceId throwing maps to a 422 in the legacy route.
        Ok(None) => return error_response(422, INVALID_WS_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match list_mind_ai_patches(&config.contact_data, outbound, &resolved_ws_id, board_id).await {
        Ok(patches) => no_store_response(json_response(200, json!({ "patches": patches }))),
        Err(()) => error_response(500, PATCHES_LOAD_FAILED_MESSAGE),
    }
}

async fn list_mind_ai_patches(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    board_id: &str,
) -> Result<Vec<Value>, ()> {
    // Primary path: private RPC that returns a camelCase jsonb array directly.
    if let Ok(patches) = list_patches_via_rpc(contact_data, outbound, ws_id, board_id).await {
        return Ok(patches);
    }

    // Fallback: direct table read (mirrors listMindAiPatchesFromTable).
    list_patches_via_table(contact_data, outbound, ws_id, board_id).await
}

async fn list_patches_via_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    board_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data.rpc_url(LIST_PATCHES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_board_id": board_id,
        "p_limit": PATCH_LIMIT,
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
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

    // The RPC returns `jsonb` (a single array value), so the body is the array.
    match response.json::<Value>().map_err(|_| ())? {
        Value::Array(items) => Ok(items),
        Value::Null => Ok(Vec::new()),
        _ => Err(()),
    }
}

async fn list_patches_via_table(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    board_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "mind_ai_patches",
        &[
            (
                "select",
                "id,thread_id,board_id,created_by,summary,patch,status,applied_at,created_at"
                    .to_owned(),
            ),
            ("board_id", format!("eq.{board_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", PATCH_LIMIT.to_string()),
        ],
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
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<PatchTableRow>>().map_err(|_| ())?;

    Ok(rows.into_iter().map(map_patch_row).collect())
}

fn map_patch_row(row: PatchTableRow) -> Value {
    json!({
        "id": row.id,
        "threadId": row.thread_id,
        "boardId": row.board_id,
        "createdBy": row.created_by,
        "summary": row.summary,
        "patch": row.patch.unwrap_or(Value::Null),
        "status": row.status,
        "appliedAt": row.applied_at,
        "createdAt": row.created_at,
    })
}

/// Resolves the workspace alias to a concrete UUID.
///
/// Returns `Ok(Some(id))` on success, `Ok(None)` when the identifier is
/// structurally invalid (legacy `normalizeWorkspaceId` would throw -> 422),
/// and `Err(())` for transient lookup failures (-> 500).
async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let trimmed = raw_ws_id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token)
            .await
            .map(Some);
    }

    if is_workspace_uuid_literal(trimmed) {
        return Ok(Some(trimmed.to_owned()));
    }

    let handle = trimmed.to_lowercase();
    if is_workspace_handle(&handle) {
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(Some(workspace_id));
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(Some(workspace_id));
        }
        // Handle did not resolve to a workspace -> denied later as a non-member.
        return Ok(Some(handle));
    }

    Ok(None)
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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

async fn workspace_id_by_handle_service_role(
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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

/// Matches `/api/v1/workspaces/<wsId>/mind/boards/<boardId>/patches` and
/// returns the `(wsId, boardId)` segments. Returns `None` for any other path.
fn match_patches_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let rest = rest.strip_suffix(PATH_SUFFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_MID)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if after_ws.is_empty() || after_ws.contains('/') {
        return None;
    }

    Some((ws_id, after_ws))
}

fn is_workspace_uuid_literal(value: &str) -> bool {
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
