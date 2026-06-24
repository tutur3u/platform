//! Handler for `/api/v1/workspaces/:wsId/chat/channels`.
//!
//! Ports the **GET** method of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/chat/channels/route.ts`.
//!
//! Legacy GET behaviour:
//! 1. `withSessionAuth` (allowAppSessionAuth, rateLimitKind: 'read') -> 401 when
//!    unauthenticated.
//! 2. `resolveChatRouteContext({ permission: 'view_chat', wsId })` which
//!    normalizes the workspace id and checks the `view_chat` permission. The
//!    permission check is also enforced server-side inside the
//!    `private.chat_list_conversations` RPC via
//!    `chat_assert_workspace_permission(..., 'view_chat')`, which raises with
//!    errcode `42501` -> mapped to 403.
//! 3. `callPrivateChatRpc<ChatConversation[]>('chat_list_conversations',
//!    { p_actor_user_id, p_ws_id })`. The RPC is `security definer` and lives in
//!    the `private` schema (called via PostgREST with the `private` profile
//!    headers using the service-role key, mirroring `callPrivateChatRpc` which
//!    uses the admin client's `.schema('private')`).
//! 4. Success: `{ channels: (conversations ?? []).map(toLegacyChannel) }`.
//!    `toLegacyChannel` maps each conversation to:
//!    `{ id, ws_id: wsId, name: title ?? fallbackTitle, description, is_private:
//!    type !== 'channel', created_at: createdAt, created_by: createdBy,
//!    updated_at: updatedAt }`.
//!    The fallback title (used when `title` is null) is:
//!    - the first other member's `displayName` for a `direct` conversation,
//!    - `"Mira"` for an `ai` conversation,
//!    - otherwise `"Untitled chat"`.
//! 5. RPC error: `chatRpcErrorResponse(error, 'Failed to load channels')`
//!    returning `{ code, message }` with a status derived from the PostgREST
//!    error code/message (42501/forbidden/permission/required -> 403,
//!    not_found -> 404, 22023/invalid/empty/too_large/requires/target -> 400,
//!    otherwise 500 with the fallback message).
//!
//! The other HTTP methods on this route (POST) are NOT migrated yet, so this
//! handler returns `None` for every non-GET method, letting the Cloudflare
//! worker fall through to the still-active Next.js route.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PRIVATE_SCHEMA: &str = "private";
const CHAT_LIST_CONVERSATIONS_RPC: &str = "chat_list_conversations";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const LOAD_CHANNELS_FAILED_MESSAGE: &str = "Failed to load channels";

// Workspace-id normalization constants (mirrors `normalizeWorkspaceId`).
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(crate) async fn handle_workspaces_chat_channels_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = parse_channels_path(request.path)?;

    Some(match request.method {
        "GET" => channels_response(config, request, raw_ws_id, outbound).await,
        // All other methods (e.g. POST) are not migrated yet: return None so the
        // worker falls through to the still-active Next.js route.
        _ => return None,
    })
}

async fn channels_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy: `withSessionAuth` -> 401 when unauthenticated.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Legacy: `normalizeWorkspaceId(wsId, auth.supabase)` resolves slugs/handles
    // to a concrete workspace UUID before calling the RPC.
    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, LOAD_CHANNELS_FAILED_MESSAGE),
    };

    // Legacy: `callPrivateChatRpc('chat_list_conversations', { ... })`. The RPC
    // enforces `view_chat` and workspace access internally.
    match call_chat_list_conversations(&config.contact_data, outbound, &resolved_ws_id, &user_id)
        .await
    {
        Ok(conversations) => {
            let channels = to_legacy_channels(&conversations);
            no_store_response(json_response(200, json!({ "channels": channels })))
        }
        Err(rpc_error) => chat_rpc_error_response(rpc_error),
    }
}

/// Maps the conversations JSON array to the legacy channel shape. A `null` /
/// non-array RPC result yields an empty list (mirrors `conversations ?? []`).
fn to_legacy_channels(conversations: &Value) -> Vec<Value> {
    let Some(conversations) = conversations.as_array() else {
        return Vec::new();
    };

    conversations.iter().map(to_legacy_channel).collect()
}

/// Mirrors `toLegacyChannel(conversation)`.
fn to_legacy_channel(conversation: &Value) -> Value {
    let title = conversation.get("title").and_then(Value::as_str);
    let name = match title.filter(|title| !title.is_empty()) {
        Some(title) => title.to_owned(),
        // `title` is null -> legacy uses `getConversationFallbackTitle`.
        None => conversation_fallback_title(conversation),
    };

    let conversation_type = conversation
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();

    json!({
        "id": conversation.get("id").cloned().unwrap_or(Value::Null),
        "ws_id": conversation.get("wsId").cloned().unwrap_or(Value::Null),
        "name": name,
        "description": conversation.get("description").cloned().unwrap_or(Value::Null),
        "is_private": conversation_type != "channel",
        "created_at": conversation.get("createdAt").cloned().unwrap_or(Value::Null),
        "created_by": conversation.get("createdBy").cloned().unwrap_or(Value::Null),
        "updated_at": conversation.get("updatedAt").cloned().unwrap_or(Value::Null),
    })
}

/// Mirrors `getConversationFallbackTitle(conversation)`.
fn conversation_fallback_title(conversation: &Value) -> String {
    let conversation_type = conversation
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let created_by = conversation.get("createdBy").and_then(Value::as_str);

    // First member whose userId differs from createdBy.
    let first_other_member = conversation
        .get("members")
        .and_then(Value::as_array)
        .and_then(|members| {
            members
                .iter()
                .find(|member| member.get("userId").and_then(Value::as_str) != created_by)
        });

    if conversation_type == "direct" {
        if let Some(member) = first_other_member {
            if let Some(display_name) = member
                .get("user")
                .and_then(|user| user.get("displayName"))
                .and_then(Value::as_str)
            {
                return display_name.to_owned();
            }
        }
    }

    if conversation_type == "ai" {
        return "Mira".to_owned();
    }

    "Untitled chat".to_owned()
}

/// PostgREST error returned by an RPC call, mirroring the fields used by
/// `getChatRpcErrorStatus` / `chatRpcErrorResponse`.
struct RpcError {
    code: Option<String>,
    message: Option<String>,
}

/// Mirrors `callPrivateChatRpc<ChatConversation[]>('chat_list_conversations',
/// ...)` via PostgREST's `/rpc/<fn>` endpoint with the `private` schema profile
/// and the service-role key (the admin client bypasses RLS and the RPC is
/// `security definer`). Returns the conversations JSON (`Value::Null` when the
/// RPC returns null) on success, or an `RpcError` to be mapped to a status.
async fn call_chat_list_conversations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
) -> Result<Value, RpcError> {
    let Some(url) = contact_data.rpc_url(CHAT_LIST_CONVERSATIONS_RPC) else {
        return Err(RpcError {
            code: None,
            message: None,
        });
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(RpcError {
            code: None,
            message: None,
        });
    };
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({
        "p_actor_user_id": actor_user_id,
        "p_ws_id": ws_id,
    })
    .to_string();

    let response: OutboundResponse = outbound
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
        .map_err(|_| RpcError {
            code: None,
            message: None,
        })?;

    if (200..300).contains(&response.status) {
        // The RPC returns `jsonb` (an array of conversations, or null).
        return response.json::<Value>().map_err(|_| RpcError {
            code: None,
            message: None,
        });
    }

    // Non-2xx: parse the PostgREST error envelope `{ code, message, ... }`.
    let error_body = response.json::<Value>().unwrap_or(Value::Null);
    Err(RpcError {
        code: error_body
            .get("code")
            .and_then(Value::as_str)
            .map(str::to_owned),
        message: error_body
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

/// Mirrors `getChatRpcErrorStatus(error)`.
fn chat_rpc_error_status(error: &RpcError) -> u16 {
    let message = error.message.as_deref().unwrap_or("");
    let code = error.code.as_deref().unwrap_or("");

    if code == "42501" || contains_any(message, &["forbidden", "permission", "required"]) {
        return 403;
    }
    if contains_any(message, &["not_found", "not found"]) {
        return 404;
    }
    if code == "22023"
        || contains_any(
            message,
            &["invalid", "empty", "too_large", "requires", "target"],
        )
    {
        return 400;
    }

    500
}

/// Mirrors `chatRpcErrorResponse(error, 'Failed to load channels')`. Returns
/// `{ code, message }` where the message is the fallback for >= 500 statuses and
/// the original RPC message otherwise.
fn chat_rpc_error_response(error: RpcError) -> BackendResponse {
    let status = chat_rpc_error_status(&error);

    let message = if status >= 500 {
        LOAD_CHANNELS_FAILED_MESSAGE.to_owned()
    } else {
        match error.message.as_deref() {
            Some(message) if !message.is_empty() => message.to_owned(),
            _ => LOAD_CHANNELS_FAILED_MESSAGE.to_owned(),
        }
    };

    let code = match error.code {
        Some(code) => Value::String(code),
        None => Value::Null,
    };

    no_store_response(json_response(
        status,
        json!({ "code": code, "message": message }),
    ))
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    let lowered = haystack.to_lowercase();
    needles.iter().any(|needle| lowered.contains(needle))
}

// ---------------------------------------------------------------------------
// Workspace-id normalization (file-local copy of the logic in
// `workspace_habits_access.rs`, which mirrors `normalizeWorkspaceId`). Copied
// rather than shared because this module must not edit other modules and that
// logic lives behind private fns there.
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
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
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
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

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/:wsId/chat/channels` and returns `wsId` when the
/// shape matches.
fn parse_channels_path(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "chat"
        && segments[5] == "channels"
    {
        Some(segments[3])
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
