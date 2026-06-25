use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_CHAT_CHANNELS_MESSAGES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_CHAT_CHANNELS_MESSAGES_CHANNELS_SEGMENT: &str = "/chat/channels/";
const WORKSPACES_CHAT_CHANNELS_MESSAGES_PATH_SUFFIX: &str = "/messages";

const CHAT_PERMISSION: &str = "view_chat";
const PRIVATE_SCHEMA: &str = "private";
const LIST_MESSAGES_RPC: &str = "chat_list_messages";

const DEFAULT_LIMIT: i64 = 100;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const LOAD_MESSAGES_FAILED_MESSAGE: &str = "Failed to load messages";

/// Subset of the `ChatMessage` RPC row needed to build the legacy response.
/// `toLegacyMessage` only reads id, conversationId, senderId, content,
/// createdAt, updatedAt, deletedAt; every other field is ignored.
#[derive(Deserialize)]
struct ChatMessageRow {
    #[serde(default)]
    id: Option<String>,
    #[serde(default, rename = "conversationId")]
    conversation_id: Option<String>,
    #[serde(default, rename = "senderId")]
    sender_id: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default, rename = "createdAt")]
    created_at: Option<String>,
    #[serde(default, rename = "updatedAt")]
    updated_at: Option<Value>,
    #[serde(default, rename = "deletedAt")]
    deleted_at: Option<Value>,
}

pub(crate) async fn handle_workspaces_chat_channels_channelid_messages_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, channel_id) = workspaces_chat_channels_messages_segments(request.path)?;

    // Only GET is migrated. Return None for every other method so the worker
    // falls through to the still-active Next.js route (e.g. POST mutations).
    Some(match request.method {
        "GET" => {
            workspaces_chat_channels_messages_response(
                config, request, raw_ws_id, channel_id, outbound,
            )
            .await
        }
        _ => return None,
    })
}

async fn workspaces_chat_channels_messages_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    channel_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy route is wrapped with withSessionAuth (allowAppSessionAuth: true),
    // which requires a session before the handler runs. Mirror that by ensuring
    // a Supabase access token is present first.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // resolveChatRouteContext: normalize the workspace, load permissions, and
    // require `view_chat`. A missing permission context maps to 401
    // (Unauthorized); lacking the permission maps to 403.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        CHAT_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, LOAD_MESSAGES_FAILED_MESSAGE);
        }
    };

    // The RPC needs the actor's user id. authorize_workspace_permission already
    // validated the session against the same token resolution, so this lookup
    // succeeds for any caller that passed authorization.
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match list_chat_messages(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &user_id,
        channel_id,
    )
    .await
    {
        Ok(messages) => no_store_response(json_response(200, json!({ "messages": messages }))),
        Err(()) => message_response(500, LOAD_MESSAGES_FAILED_MESSAGE),
    }
}

async fn list_chat_messages(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    conversation_id: &str,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url(LIST_MESSAGES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&json!({
        "p_actor_user_id": actor_user_id,
        "p_before": Value::Null,
        "p_conversation_id": conversation_id,
        "p_limit": DEFAULT_LIMIT,
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
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

    // The RPC may legitimately return null; coalesce to an empty list like the
    // legacy `messages ?? []` fallback, then map each row to the legacy shape.
    let rows: Vec<ChatMessageRow> = match response.json::<Value>() {
        Ok(Value::Null) => Vec::new(),
        Ok(value @ Value::Array(_)) => serde_json::from_value(value).map_err(|_| ())?,
        Ok(_) => return Err(()),
        Err(_) => return Err(()),
    };

    Ok(rows.into_iter().map(to_legacy_message).collect())
}

/// Mirror of `toLegacyMessage` in apps/web private-rpc.ts.
fn to_legacy_message(message: ChatMessageRow) -> Value {
    json!({
        "id": message.id,
        // toLegacyMessage: `channel_id: message.conversationId`.
        "channel_id": message.conversation_id,
        // toLegacyMessage: `user_id: message.senderId ?? ''`.
        "user_id": message.sender_id.unwrap_or_default(),
        "content": message.content,
        "created_at": message.created_at,
        // updatedAt/deletedAt are nullable in the source and passed through as-is.
        "updated_at": message.updated_at.unwrap_or(Value::Null),
        "deleted_at": message.deleted_at.unwrap_or(Value::Null),
    })
}

/// Match `/api/v1/workspaces/{wsId}/chat/channels/{channelId}/messages` and
/// return `(wsId, channelId)`. Both dynamic segments must be non-empty and
/// contain no further slashes.
fn workspaces_chat_channels_messages_segments(path: &str) -> Option<(&str, &str)> {
    let remainder = path.strip_prefix(WORKSPACES_CHAT_CHANNELS_MESSAGES_PATH_PREFIX)?;
    let channels_index = remainder.find(WORKSPACES_CHAT_CHANNELS_MESSAGES_CHANNELS_SEGMENT)?;

    let ws_id = &remainder[..channels_index];
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    let after_channels =
        &remainder[channels_index + WORKSPACES_CHAT_CHANNELS_MESSAGES_CHANNELS_SEGMENT.len()..];
    let channel_id = after_channels.strip_suffix(WORKSPACES_CHAT_CHANNELS_MESSAGES_PATH_SUFFIX)?;
    if channel_id.is_empty() || channel_id.contains('/') {
        return None;
    }

    Some((ws_id, channel_id))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
