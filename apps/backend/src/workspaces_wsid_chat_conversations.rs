//! Handler for `GET /api/v1/workspaces/:wsId/chat/conversations`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/chat/conversations/route.ts`.
//! Auth mirrors `resolveChatRouteContext({ permission: 'view_chat' })`.
//!
//! ## Behavior gaps
//!
//! The legacy GET handler merges four conversation sources; only (1) is ported:
//!
//! 1. Native conversations via `chat_list_conversations` RPC — **ported**.
//! 2. `listRootAiAgentDiscoveryConversations` — not ported (root-workspace
//!    discovery metadata unavailable in this worker).
//! 3. `listAiAgentExternalThreadConversations` — not ported (external-thread
//!    mirror metadata unavailable).
//! 4. `listAiChatConversations` — not ported (requires separate Supabase client
//!    and AI-chat-specific storage).
//!
//! The `isMissingArchivedChatListRpc` fallback (PGRST202 / 42883) is
//! replicated so that workspaces on older schemas still receive conversations.

use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const VIEW_CHAT_PERMISSION: &str = "view_chat";
const PRIVATE_SCHEMA: &str = "private";
const CHAT_LIST_CONVERSATIONS_RPC: &str = "chat_list_conversations";
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/chat/conversations";
const DEFAULT_LIMIT: i64 = 40;
const MAX_LIMIT: i64 = 100;
const MIN_LIMIT: i64 = 1;
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const FAILED_MESSAGE: &str = "Failed to load chat conversations";

// ---------------------------------------------------------------------------
// RPC body shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct ConversationsParams<'a> {
    p_actor_user_id: &'a str,
    p_archived: &'a str,
    p_limit: Option<i64>,
    p_offset: i64,
    p_ws_id: &'a str,
}

/// Reduced params for older schemas that lack the `p_archived` argument.
#[derive(Serialize)]
struct ConversationsFallbackParams<'a> {
    p_actor_user_id: &'a str,
    p_ws_id: &'a str,
}

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

fn conversations_ws_id(path: &str) -> Option<&str> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let ws_id = rest.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Query-param helpers
// ---------------------------------------------------------------------------

struct Pagination {
    is_paginated: bool,
    limit: i64,
    offset: i64,
}

fn parse_integer(raw: &str) -> Option<i64> {
    let t = raw.trim();
    if t.is_empty() {
        return Some(0);
    }
    if let Ok(v) = t.parse::<i64>() {
        return Some(v);
    }
    t.parse::<f64>()
        .ok()
        .filter(|v| v.is_finite())
        .map(|v| v.trunc() as i64)
}

fn read_pagination(request_url: Option<&str>) -> Pagination {
    let pairs: Vec<(String, String)> = request_url
        .and_then(|u| url::Url::parse(u).ok())
        .map(|url| {
            url.query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect()
        })
        .unwrap_or_default();

    let limit_raw = pairs
        .iter()
        .find(|(k, _)| k == "limit")
        .map(|(_, v)| v.as_str());
    let offset_raw = pairs
        .iter()
        .find(|(k, _)| k == "offset")
        .map(|(_, v)| v.as_str());
    let is_paginated = limit_raw.is_some() || offset_raw.is_some();
    let limit = limit_raw
        .and_then(parse_integer)
        .unwrap_or(DEFAULT_LIMIT)
        .clamp(MIN_LIMIT, MAX_LIMIT);
    let offset = offset_raw.and_then(parse_integer).unwrap_or(0).max(0);

    Pagination {
        is_paginated,
        limit,
        offset,
    }
}

fn read_archived(request_url: Option<&str>) -> &'static str {
    let raw = request_url
        .and_then(|u| url::Url::parse(u).ok())
        .and_then(|url| {
            url.query_pairs()
                .find_map(|(k, v)| (k == "archived").then(|| v.into_owned()))
        });
    match raw.as_deref() {
        Some("archived") => "archived",
        Some("all") => "all",
        _ => "active",
    }
}

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

struct RpcError {
    code: Option<String>,
    message: Option<String>,
}

/// Returns `true` when the error indicates that the schema does not yet have
/// the `p_archived` overload of `chat_list_conversations`.
fn is_missing_archived_rpc(code: Option<&str>, message: Option<&str>) -> bool {
    let code = code.unwrap_or("");
    let msg = message.unwrap_or("");
    code == "PGRST202"
        || code == "42883"
        || (msg.contains("chat_list_conversations")
            && (msg.contains("p_archived") || msg.contains("schema cache")))
}

async fn rpc_post(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    body: &str,
) -> Result<Vec<Value>, RpcError> {
    let rpc_url = contact_data
        .rpc_url(CHAT_LIST_CONVERSATIONS_RPC)
        .ok_or(RpcError {
            code: None,
            message: None,
        })?;
    let svc_key = contact_data.service_role_key().ok_or(RpcError {
        code: None,
        message: None,
    })?;
    let auth_header = format!("Bearer {svc_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", svc_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(body),
        )
        .await
        .map_err(|_| RpcError {
            code: None,
            message: None,
        })?;

    if (200..300).contains(&response.status) {
        return Ok(response.json::<Vec<Value>>().unwrap_or_default());
    }

    let envelope = response.json::<Value>().ok();
    Err(RpcError {
        code: envelope
            .as_ref()
            .and_then(|v| v.get("code"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        message: envelope
            .as_ref()
            .and_then(|v| v.get("message"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

async fn list_native_conversations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    archived: &str,
    rpc_limit: Option<i64>,
) -> Result<Vec<Value>, RpcError> {
    let body = serde_json::to_string(&ConversationsParams {
        p_actor_user_id: actor_user_id,
        p_archived: archived,
        p_limit: rpc_limit,
        p_offset: 0,
        p_ws_id: ws_id,
    })
    .map_err(|_| RpcError {
        code: None,
        message: None,
    })?;

    match rpc_post(contact_data, outbound, &body).await {
        Ok(v) => Ok(v),
        Err(e) if is_missing_archived_rpc(e.code.as_deref(), e.message.as_deref()) => {
            // Legacy fallback: older schema without p_archived support.
            if archived == "archived" {
                return Ok(vec![]);
            }
            let fallback_body = serde_json::to_string(&ConversationsFallbackParams {
                p_actor_user_id: actor_user_id,
                p_ws_id: ws_id,
            })
            .map_err(|_| RpcError {
                code: None,
                message: None,
            })?;
            rpc_post(contact_data, outbound, &fallback_body).await
        }
        Err(e) => Err(e),
    }
}

// ---------------------------------------------------------------------------
// Error-response helpers (mirror chatRpcErrorResponse)
// ---------------------------------------------------------------------------

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

fn chat_rpc_error_response(error: RpcError) -> BackendResponse {
    let status = chat_rpc_error_status(error.code.as_deref(), error.message.as_deref());
    let message = if status >= 500 {
        FAILED_MESSAGE.to_owned()
    } else {
        error
            .message
            .clone()
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| FAILED_MESSAGE.to_owned())
    };
    no_store_response(json_response(
        status,
        json!({ "code": error.code, "message": message }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_chat_conversations_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = conversations_ws_id(request.path)?;
    Some(match request.method {
        "GET" => conversations_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn conversations_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
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
            return message_response(500, FAILED_MESSAGE);
        }
    };

    let archived = read_archived(request.url);
    let pagination = read_pagination(request.url);

    // Mirror the legacy in-memory pagination: fetch from RPC offset 0 with an
    // inflated limit (caller_offset + caller_limit + 1) so we can detect
    // whether a next page exists, then slice the result in memory.
    let rpc_limit = pagination
        .is_paginated
        .then(|| pagination.offset + pagination.limit + 1);

    let conversations = match list_native_conversations(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        archived,
        rpc_limit,
    )
    .await
    {
        Ok(v) => v,
        Err(e) => return chat_rpc_error_response(e),
    };

    let (page_conversations, next_offset): (Vec<Value>, Option<i64>) = if pagination.is_paginated {
        let end = (pagination.offset + pagination.limit) as usize;
        let has_more = conversations.len() > end;
        let sliced = conversations
            .into_iter()
            .skip(pagination.offset as usize)
            .take(pagination.limit as usize)
            .collect();
        (
            sliced,
            has_more.then_some(pagination.offset + pagination.limit),
        )
    } else {
        (conversations, None)
    };

    no_store_response(json_response(
        200,
        json!({
            "conversations": page_conversations,
            "nextOffset": next_offset,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_valid() {
        assert_eq!(
            conversations_ws_id("/api/v1/workspaces/ws-123/chat/conversations"),
            Some("ws-123")
        );
    }

    #[test]
    fn path_guard_rejects_trailing_slash_and_extra_segment() {
        assert!(conversations_ws_id("/api/v1/workspaces/ws-123/chat/conversations/").is_none());
        assert!(
            conversations_ws_id("/api/v1/workspaces/ws-123/chat/conversations/extra").is_none()
        );
        assert!(conversations_ws_id("/api/v1/workspaces//chat/conversations").is_none());
    }

    #[test]
    fn archived_parsing() {
        assert_eq!(read_archived(None), "active");
        assert_eq!(
            read_archived(Some("https://x.test/p?archived=archived")),
            "archived"
        );
        assert_eq!(read_archived(Some("https://x.test/p?archived=all")), "all");
        assert_eq!(
            read_archived(Some("https://x.test/p?archived=foo")),
            "active"
        );
    }

    #[test]
    fn pagination_defaults_and_clamping() {
        let p = read_pagination(Some("https://x.test/p"));
        assert!(!p.is_paginated);
        assert_eq!(p.limit, DEFAULT_LIMIT);
        assert_eq!(p.offset, 0);

        assert_eq!(
            read_pagination(Some("https://x.test/p?limit=999")).limit,
            MAX_LIMIT
        );
        assert_eq!(
            read_pagination(Some("https://x.test/p?limit=0")).limit,
            MIN_LIMIT
        );
        assert_eq!(
            read_pagination(Some("https://x.test/p?limit=10&offset=20")).offset,
            20
        );
        assert_eq!(
            read_pagination(Some("https://x.test/p?offset=-5")).offset,
            0
        );
    }

    #[test]
    fn missing_archived_rpc_detection() {
        assert!(is_missing_archived_rpc(Some("PGRST202"), None));
        assert!(is_missing_archived_rpc(Some("42883"), None));
        assert!(is_missing_archived_rpc(
            None,
            Some("function chat_list_conversations(p_archived) does not exist")
        ));
        assert!(is_missing_archived_rpc(
            None,
            Some("chat_list_conversations: schema cache")
        ));
        assert!(!is_missing_archived_rpc(
            Some("42501"),
            Some("permission denied")
        ));
    }

    #[test]
    fn parse_integer_variants() {
        assert_eq!(parse_integer("40.7"), Some(40));
        assert_eq!(parse_integer(""), Some(0));
        assert_eq!(parse_integer("abc"), None);
    }
}
