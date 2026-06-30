//! Handler for `GET /api/v1/workspaces/:wsId/chat/conversations/:conversationId/messages`.
//!
//! Ports the legacy Next.js GET handler at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/chat/conversations/[conversationId]/messages/route.ts`.
//!
//! Auth: `withSessionAuth({ allowAppSessionAuth: true, rateLimitKind: 'read' })` + `view_chat`
//! permission, mirrored via `finance_auth::authorize_finance_permission`.
//!
//! Query params:
//!
//! - `limit` — integer, default `60`, clamped `1..=100`
//! - `before` — optional ISO-8601 timestamp; if present, only messages created before this
//!   timestamp are returned
//!
//! Three conversation-ID dispatch paths, each returning `{ "messages": [...] }`:
//!
//! 1. **AI-chat** (`"ai-chat-"` / `"legacy-ai-"` prefix) — verifies caller owns the chat via
//!    `ai_chats` (service-role, explicit `creator_id` guard), then queries `ai_chat_messages`.
//!    Messages are shaped into `ChatMessage`-compatible JSON. Known gaps vs. legacy:
//!    - `attachments` is always `[]` (no `listAiChatAttachmentsByMessage` call).
//!    - `sender` is always `null` (no user-profile look-up).
//!    - `content` is not sanitized through `sanitizeAiChatMessageContent`.
//!      Returns `404` when the chat does not exist or is not owned by the caller.
//!
//! 2. **External AI-agent thread** (`"ai-agent-thread-"` prefix) — calls private RPC
//!    `ai_agent_external_list_messages` and forwards the JSON array unchanged.
//!    Returns `404` when the RPC returns null.
//!
//! 3. **Default (private chat RPC)** — calls private RPC `chat_list_messages` and forwards the
//!    JSON array unchanged (null becomes `[]`).
//!
//! POST and all other methods return `None` so the worker falls through to the still-live
//! Next.js route.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const VIEW_CHAT_PERMISSION: &str = "view_chat";
const PRIVATE_SCHEMA: &str = "private";

const AI_CHAT_CONVERSATION_PREFIX: &str = "ai-chat-";
const AI_CHAT_COMPAT_CONVERSATION_PREFIX: &str = "legacy-ai-";
const AI_AGENT_EXTERNAL_CONVERSATION_PREFIX: &str = "ai-agent-thread-";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const CONVERSATIONS_SEGMENT: &str = "/chat/conversations/";
const MESSAGES_SUFFIX: &str = "/messages";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const CHAT_NOT_FOUND_MESSAGE: &str = "Chat not found";
const EXTERNAL_THREAD_NOT_FOUND_MESSAGE: &str = "External thread not found";
const FAILED_MESSAGE: &str = "Failed to load chat messages";

const DEFAULT_LIMIT: i64 = 60;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 100;

struct MessagesRoute<'a> {
    ws_id: &'a str,
    conversation_id: &'a str,
}

pub(crate) async fn handle_workspaces_wsid_chat_conversations_conversationid_messages_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let route = parse_messages_route(request.path)?;

    Some(match request.method {
        "GET" => messages_response(config, request, &route, outbound).await,
        _ => return None,
    })
}

async fn messages_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    route: &MessagesRoute<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        route.ws_id,
        VIEW_CHAT_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response(FAILED_MESSAGE);
        }
    };

    let query = request.url.and_then(|u| u.split_once('?').map(|(_, q)| q));
    let limit = parse_limit(query);
    let before = parse_before(query);

    let ws_id = &authorization.ws_id;
    let user_id = &authorization.user_id;
    let conversation_id = route.conversation_id;

    if is_ai_chat_conversation_id(conversation_id) {
        return ai_chat_messages_response(
            &config.contact_data,
            outbound,
            ws_id,
            user_id,
            conversation_id,
            limit,
            before,
        )
        .await;
    }

    if is_ai_agent_external_conversation_id(conversation_id) {
        return ai_agent_external_messages_response(
            &config.contact_data,
            outbound,
            ws_id,
            user_id,
            conversation_id,
            limit,
            before,
        )
        .await;
    }

    default_chat_messages_response(
        &config.contact_data,
        outbound,
        ws_id,
        user_id,
        conversation_id,
        limit,
        before,
    )
    .await
}

// ---------------------------------------------------------------------------
// AI-chat path
// ---------------------------------------------------------------------------

async fn ai_chat_messages_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    _ws_id: &str,
    user_id: &str,
    conversation_id: &str,
    limit: i64,
    before: Option<&str>,
) -> BackendResponse {
    let Some(chat_id) = get_ai_chat_id(conversation_id) else {
        return message_response(404, CHAT_NOT_FOUND_MESSAGE);
    };

    // Verify caller owns the ai_chat (mirrors the RLS check the legacy code performs
    // by using the caller's Supabase client).
    match verify_ai_chat_access(contact_data, outbound, &chat_id, user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, CHAT_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(FAILED_MESSAGE),
    }

    let messages = match list_ai_chat_messages(
        contact_data,
        outbound,
        &chat_id,
        conversation_id,
        limit,
        before,
    )
    .await
    {
        Ok(messages) => messages,
        Err(()) => return error_response(FAILED_MESSAGE),
    };

    no_store_response(json_response(200, json!({ "messages": messages })))
}

async fn verify_ai_chat_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    chat_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "ai_chats",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{chat_id}")),
            ("creator_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(false);
    }
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

async fn list_ai_chat_messages(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    chat_id: &str,
    conversation_id: &str,
    limit: i64,
    before: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let clamped = limit.clamp(MIN_LIMIT, MAX_LIMIT);
    let mut filters: Vec<(&str, String)> = vec![
        (
            "select",
            "id,chat_id,content,created_at,creator_id,metadata,model,role,type".to_owned(),
        ),
        ("chat_id", format!("eq.{chat_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", clamped.to_string()),
    ];
    if let Some(before_ts) = before {
        filters.push(("created_at", format!("lt.{before_ts}")));
    }

    let Some(url) = contact_data.rest_url("ai_chat_messages", &filters) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    // Reverse so the result is oldest-first (mirrors the legacy `.reverse()` call).
    let mut reversed = rows;
    reversed.reverse();

    Ok(reversed
        .into_iter()
        .map(|row| map_ai_chat_message_row(row, conversation_id))
        .collect())
}

/// Maps a raw `ai_chat_messages` DB row to a `ChatMessage`-shaped JSON value.
///
/// Gaps vs. legacy `toAiChatMessage`:
///
/// - `attachments` is always `[]`
/// - `sender` is always `null`
/// - `senderId` is always `null`
/// - `content` is not passed through `sanitizeAiChatMessageContent`
fn map_ai_chat_message_row(row: Value, conversation_id: &str) -> Value {
    let id = row
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let content = row
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let created_at = row
        .get("created_at")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let role = row
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let chat_id = row
        .get("chat_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let ai_message_type = row.get("type").cloned().unwrap_or(Value::Null);
    let model = row.get("model").cloned().unwrap_or(Value::Null);
    let metadata_raw = row.get("metadata").cloned().unwrap_or(Value::Null);
    let kind = map_role_to_kind(&role);

    json!({
        "attachments": [],
        "content": content,
        "conversationId": conversation_id,
        "createdAt": created_at,
        "deletedAt": null,
        "editedAt": null,
        "id": id,
        "kind": kind,
        "metadata": {
            "aiChatId": chat_id,
            "aiMessageType": ai_message_type,
            "metadata": metadata_raw,
            "model": model,
            "source": "ai-chat",
        },
        "reactions": [],
        "replyToMessageId": null,
        "sender": null,
        "senderId": null,
        "updatedAt": null,
    })
}

fn map_role_to_kind(role: &str) -> &'static str {
    match role.to_lowercase().as_str() {
        "user" => "user",
        "system" => "system",
        _ => "assistant",
    }
}

// ---------------------------------------------------------------------------
// External AI-agent thread path
// ---------------------------------------------------------------------------

async fn ai_agent_external_messages_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    conversation_id: &str,
    limit: i64,
    before: Option<&str>,
) -> BackendResponse {
    let result = call_private_chat_rpc(
        contact_data,
        outbound,
        "ai_agent_external_list_messages",
        json!({
            "p_actor_user_id": user_id,
            "p_before": before,
            "p_conversation_id": conversation_id,
            "p_limit": limit,
            "p_ws_id": ws_id,
        }),
    )
    .await;

    match result {
        Ok(Value::Null) => message_response(404, EXTERNAL_THREAD_NOT_FOUND_MESSAGE),
        Ok(messages) => no_store_response(json_response(200, json!({ "messages": messages }))),
        Err(()) => error_response(FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Default private chat RPC path
// ---------------------------------------------------------------------------

async fn default_chat_messages_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    conversation_id: &str,
    limit: i64,
    before: Option<&str>,
) -> BackendResponse {
    let result = call_private_chat_rpc(
        contact_data,
        outbound,
        "chat_list_messages",
        json!({
            "p_actor_user_id": user_id,
            "p_before": before,
            "p_conversation_id": conversation_id,
            "p_limit": limit,
            "p_ws_id": ws_id,
        }),
    )
    .await;

    match result {
        Ok(Value::Null) => no_store_response(json_response(200, json!({ "messages": [] }))),
        Ok(messages) => no_store_response(json_response(200, json!({ "messages": messages }))),
        Err(()) => error_response(FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Shared RPC helper
// ---------------------------------------------------------------------------

async fn call_private_chat_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    fn_name: &str,
    args: Value,
) -> Result<Value, ()> {
    let Some(rpc_url) = contact_data.rpc_url(fn_name) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let body = args.to_string();

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

    response.json::<Value>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Service-role GET helper
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(message: &str) -> BackendResponse {
    message_response(500, message)
}

// ---------------------------------------------------------------------------
// Conversation-ID helpers
// ---------------------------------------------------------------------------

fn is_ai_chat_conversation_id(conversation_id: &str) -> bool {
    conversation_id.starts_with(AI_CHAT_CONVERSATION_PREFIX)
        || conversation_id.starts_with(AI_CHAT_COMPAT_CONVERSATION_PREFIX)
}

fn get_ai_chat_id(conversation_id: &str) -> Option<String> {
    if let Some(id) = conversation_id.strip_prefix(AI_CHAT_CONVERSATION_PREFIX) {
        return Some(id.to_owned());
    }
    if let Some(id) = conversation_id.strip_prefix(AI_CHAT_COMPAT_CONVERSATION_PREFIX) {
        return Some(id.to_owned());
    }
    None
}

fn is_ai_agent_external_conversation_id(conversation_id: &str) -> bool {
    conversation_id.starts_with(AI_AGENT_EXTERNAL_CONVERSATION_PREFIX)
}

// ---------------------------------------------------------------------------
// Query-param parsing
// ---------------------------------------------------------------------------

fn parse_limit(query: Option<&str>) -> i64 {
    query
        .and_then(|q| {
            q.split('&').find_map(|pair| {
                let (key, value) = pair.split_once('=')?;
                if key == "limit" {
                    value.parse::<i64>().ok()
                } else {
                    None
                }
            })
        })
        .unwrap_or(DEFAULT_LIMIT)
}

fn parse_before(query: Option<&str>) -> Option<&str> {
    query.and_then(|q| {
        q.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            if key == "before" && !value.is_empty() {
                Some(value)
            } else {
                None
            }
        })
    })
}

// ---------------------------------------------------------------------------
// Route parsing
// ---------------------------------------------------------------------------

fn parse_messages_route(path: &str) -> Option<MessagesRoute<'_>> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(CONVERSATIONS_SEGMENT)?;
    let conversation_id = after_ws.strip_suffix(MESSAGES_SUFFIX)?;

    if ws_id.is_empty()
        || ws_id.contains('/')
        || conversation_id.is_empty()
        || conversation_id.contains('/')
    {
        return None;
    }

    Some(MessagesRoute {
        ws_id,
        conversation_id,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_route_happy_path() {
        let route =
            parse_messages_route("/api/v1/workspaces/ws-123/chat/conversations/conv-456/messages")
                .expect("should parse");
        assert_eq!(route.ws_id, "ws-123");
        assert_eq!(route.conversation_id, "conv-456");
    }

    #[test]
    fn parse_route_rejects_extra_segments() {
        assert!(
            parse_messages_route("/api/v1/workspaces/ws/extra/chat/conversations/conv/messages")
                .is_none()
        );
    }

    #[test]
    fn parse_route_rejects_missing_suffix() {
        assert!(
            parse_messages_route("/api/v1/workspaces/ws-123/chat/conversations/conv-456").is_none()
        );
    }

    #[test]
    fn parse_route_rejects_empty_segments() {
        assert!(
            parse_messages_route("/api/v1/workspaces//chat/conversations/conv/messages").is_none()
        );
        assert!(
            parse_messages_route("/api/v1/workspaces/ws/chat/conversations//messages").is_none()
        );
    }

    #[test]
    fn conversation_id_detection() {
        assert!(is_ai_chat_conversation_id("ai-chat-abc123"));
        assert!(is_ai_chat_conversation_id("legacy-ai-abc123"));
        assert!(!is_ai_chat_conversation_id("ai-agent-thread-abc123"));
        assert!(!is_ai_chat_conversation_id("some-uuid"));

        assert!(is_ai_agent_external_conversation_id("ai-agent-thread-abc"));
        assert!(!is_ai_agent_external_conversation_id("ai-chat-abc"));
    }

    #[test]
    fn get_ai_chat_id_strips_prefix() {
        assert_eq!(get_ai_chat_id("ai-chat-abc123"), Some("abc123".to_owned()));
        assert_eq!(
            get_ai_chat_id("legacy-ai-abc123"),
            Some("abc123".to_owned())
        );
        assert_eq!(get_ai_chat_id("plain-uuid"), None);
    }

    #[test]
    fn parse_limit_defaults() {
        assert_eq!(parse_limit(None), DEFAULT_LIMIT);
        assert_eq!(parse_limit(Some("")), DEFAULT_LIMIT);
        assert_eq!(parse_limit(Some("other=5")), DEFAULT_LIMIT);
    }

    #[test]
    fn parse_limit_reads_value() {
        assert_eq!(parse_limit(Some("limit=30")), 30);
        assert_eq!(parse_limit(Some("before=2024-01-01&limit=20")), 20);
    }

    #[test]
    fn parse_before_reads_value() {
        assert_eq!(
            parse_before(Some("before=2024-01-01T00%3A00%3A00Z")),
            Some("2024-01-01T00%3A00%3A00Z")
        );
        assert_eq!(parse_before(Some("limit=30")), None);
        assert_eq!(parse_before(None), None);
    }

    #[test]
    fn map_role_to_kind_cases() {
        assert_eq!(map_role_to_kind("USER"), "user");
        assert_eq!(map_role_to_kind("SYSTEM"), "system");
        assert_eq!(map_role_to_kind("ASSISTANT"), "assistant");
        assert_eq!(map_role_to_kind("unknown"), "assistant");
    }

    #[test]
    fn map_ai_chat_message_row_shape() {
        let row = json!({
            "id": "msg-1",
            "chat_id": "chat-1",
            "content": "hello",
            "created_at": "2024-01-01T00:00:00Z",
            "creator_id": "user-1",
            "metadata": null,
            "model": "gemini",
            "role": "USER",
            "type": "text",
        });
        let mapped = map_ai_chat_message_row(row, "ai-chat-chat-1");
        assert_eq!(mapped["id"], "msg-1");
        assert_eq!(mapped["kind"], "user");
        assert_eq!(mapped["conversationId"], "ai-chat-chat-1");
        assert_eq!(mapped["sender"], Value::Null);
        assert_eq!(mapped["attachments"], json!([]));
        assert_eq!(mapped["metadata"]["source"], "ai-chat");
    }
}
