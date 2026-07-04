use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const CHAT_SEARCH_DIRECTORY_RPC: &str = "chat_search_directory";
const DEFAULT_LIMIT: i64 = 25;
const FAILED_MESSAGE: &str = "Failed to search chat directory";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const PRIVATE_SCHEMA: &str = "private";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const VIEW_CHAT_PERMISSION: &str = "view_chat";
const WORKSPACES_CHAT_DIRECTORY_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_CHAT_DIRECTORY_PATH_SUFFIX: &str = "/chat/directory";

#[derive(Serialize)]
struct ChatSearchDirectoryRpcRequest<'a> {
    p_actor_user_id: &'a str,
    p_limit: i64,
    p_query: &'a str,
    p_ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_chat_directory_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspaces_chat_directory_ws_id(request.path)?;

    Some(match request.method {
        "GET" => chat_directory_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn chat_directory_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror resolveChatRouteContext({ permission: 'view_chat' }): authenticate,
    // normalize the workspace id, and require the `view_chat` permission before
    // the RPC runs its own assertion.
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
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

    let query = parse_query(request.url);
    let limit = parse_limit(request.url);

    match call_chat_search_directory(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        &query,
        limit,
    )
    .await
    {
        Ok(users) => no_store_response(json_response(200, json!({ "users": users }))),
        Err(error) => chat_rpc_error_response(error),
    }
}

struct RpcError {
    code: Option<String>,
    message: Option<String>,
}

async fn call_chat_search_directory(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    query: &str,
    limit: i64,
) -> Result<Value, RpcError> {
    let Some(rpc_url) = contact_data.rpc_url(CHAT_SEARCH_DIRECTORY_RPC) else {
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
    let body = match serde_json::to_string(&ChatSearchDirectoryRpcRequest {
        p_actor_user_id: actor_user_id,
        p_limit: limit,
        p_query: query,
        p_ws_id: ws_id,
    }) {
        Ok(body) => body,
        Err(_) => {
            return Err(RpcError {
                code: None,
                message: None,
            });
        }
    };

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
        // The RPC returns jsonb directly (a JSON array, or null). Mirror the
        // legacy `users ?? []` fallback when the payload is missing/null.
        let value = response.json::<Value>().unwrap_or(Value::Null);
        return Ok(if value.is_null() {
            Value::Array(Vec::new())
        } else {
            value
        });
    }

    // Surface the PostgREST error envelope ({ code, message, ... }) like the
    // supabase client's thrown error object.
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

// Mirror getChatRpcErrorStatus from apps/web/src/lib/chat/private-rpc.ts.
fn chat_rpc_error_status(code: Option<&str>, message: Option<&str>) -> u16 {
    let message = message.unwrap_or("");
    let lower = message.to_lowercase();

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

fn parse_query(request_url: Option<&str>) -> String {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return String::new();
    };

    url.query_pairs()
        .find(|(key, _)| key == "q")
        .map(|(_, value)| value.into_owned())
        .unwrap_or_default()
}

// Mirror Number(searchParams.get('limit') ?? 25) with the Number.isFinite
// fallback. The RPC clamps to [1, 50] internally; the param is `integer`, so a
// non-integer numeric string is truncated to match a realistic caller.
fn parse_limit(request_url: Option<&str>) -> i64 {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return DEFAULT_LIMIT;
    };

    match url.query_pairs().find(|(key, _)| key == "limit") {
        Some((_, value)) => value
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|parsed| parsed.is_finite())
            .map_or(DEFAULT_LIMIT, |parsed| parsed as i64),
        None => DEFAULT_LIMIT,
    }
}

fn workspaces_chat_directory_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_CHAT_DIRECTORY_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_CHAT_DIRECTORY_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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
