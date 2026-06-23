use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const CHAT_LIST_SHARED_CONTENT_RPC: &str = "chat_list_shared_content";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_CHAT_PERMISSION: &str = "view_chat";

const FAILED_MESSAGE: &str = "Failed to load shared content";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

// Mirrors isAiChatConversationId() in @/lib/chat/agent-discovery: AI-chat
// conversation ids carry these prefixes and take a separate discovery path that
// is not yet ported here.
const AI_CHAT_CONVERSATION_PREFIX: &str = "ai-chat-";
const AI_CHAT_COMPAT_CONVERSATION_PREFIX: &str = "legacy-ai-";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const CONVERSATIONS_SEGMENT: &str = "/chat/conversations/";
const SHARED_CONTENT_SEGMENT: &str = "/shared-content";

struct SharedContentRoute<'a> {
    ws_id: &'a str,
    conversation_id: &'a str,
}

#[derive(Serialize)]
struct ChatListSharedContentRpcRequest<'a> {
    p_actor_user_id: &'a str,
    p_conversation_id: &'a str,
    p_ws_id: &'a str,
}

struct RpcError {
    code: Option<String>,
    message: Option<String>,
}

pub(crate) async fn handle_workspaces_chat_conversations_shared_content_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = parse_shared_content_route(request.path)?;

    // AI-chat conversations follow a complex discovery path
    // (listAiChatSharedContent) that depends on multi-workspace storage listing
    // and user metadata not yet available here. Defer those to the legacy
    // Next.js route by returning None so dispatch falls through.
    if is_ai_chat_conversation_id(route.conversation_id) {
        return None;
    }

    Some(match request.method {
        "GET" => shared_content_response(config, request, &route, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn shared_content_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    route: &SharedContentRoute<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror resolveChatRouteContext({ permission: 'view_chat' }): authenticate,
    // normalize the workspace id, and require `view_chat` before the RPC runs.
    let authorization = match authorize_finance_permission(
        config,
        request,
        route.ws_id,
        VIEW_CHAT_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response(500, None, FAILED_MESSAGE);
        }
    };

    match call_chat_list_shared_content(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        route.conversation_id,
    )
    .await
    {
        Ok(shared_content) => no_store_response(json_response(
            200,
            json!({ "sharedContent": shared_content }),
        )),
        Err(error) => chat_rpc_error_response(error),
    }
}

async fn call_chat_list_shared_content(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    conversation_id: &str,
) -> Result<Value, RpcError> {
    let Some(rpc_url) = contact_data.rpc_url(CHAT_LIST_SHARED_CONTENT_RPC) else {
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
    let body = serde_json::to_string(&ChatListSharedContentRpcRequest {
        p_actor_user_id: actor_user_id,
        p_conversation_id: conversation_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| RpcError {
        code: None,
        message: None,
    })?;

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
        .map_err(|_| RpcError {
            code: None,
            message: None,
        })?;

    if (200..300).contains(&response.status) {
        // The RPC returns the sharedContent payload directly; a 2xx with no body
        // (e.g. SQL `void`/null) maps to JSON null, matching the JS RPC client.
        return Ok(response.json::<Value>().unwrap_or(Value::Null));
    }

    let envelope = response.json::<Value>().ok();
    Err(RpcError {
        code: envelope
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        message: envelope
            .as_ref()
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

fn is_ai_chat_conversation_id(conversation_id: &str) -> bool {
    conversation_id.starts_with(AI_CHAT_CONVERSATION_PREFIX)
        || conversation_id.starts_with(AI_CHAT_COMPAT_CONVERSATION_PREFIX)
}

fn parse_shared_content_route(path: &str) -> Option<SharedContentRoute<'_>> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(CONVERSATIONS_SEGMENT)?;
    let conversation_id = after_ws.strip_suffix(SHARED_CONTENT_SEGMENT)?;

    if ws_id.is_empty()
        || ws_id.contains('/')
        || conversation_id.is_empty()
        || conversation_id.contains('/')
    {
        return None;
    }

    Some(SharedContentRoute {
        ws_id,
        conversation_id,
    })
}

// ---------------------------------------------------------------------------
// Error responses (mirror chatRpcErrorResponse / getChatRpcErrorStatus)
// ---------------------------------------------------------------------------

fn chat_rpc_error_response(error: RpcError) -> BackendResponse {
    let status = chat_rpc_error_status(error.code.as_deref(), error.message.as_deref());
    let message = if status >= 500 {
        FAILED_MESSAGE.to_owned()
    } else {
        error
            .message
            .clone()
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| FAILED_MESSAGE.to_owned())
    };

    error_response(status, error.code.as_deref(), &message)
}

fn chat_rpc_error_status(code: Option<&str>, message: Option<&str>) -> u16 {
    let lower = message.unwrap_or("").to_lowercase();

    if code == Some("42501")
        || lower.contains("forbidden")
        || lower.contains("permission")
        || lower.contains("required")
    {
        return 403;
    }

    if lower.contains("not_found") || lower.contains("not found") {
        return 404;
    }

    if code == Some("22023")
        || lower.contains("invalid")
        || lower.contains("empty")
        || lower.contains("too_large")
        || lower.contains("requires")
        || lower.contains("target")
    {
        return 400;
    }

    500
}

fn error_response(status: u16, code: Option<&str>, message: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "code": code,
            "message": message,
        }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
