use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_CHAT_SEARCH_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_CHAT_SEARCH_PATH_SUFFIX: &str = "/chat/search";

const CHAT_PERMISSION: &str = "view_chat";
const PRIVATE_SCHEMA: &str = "private";
const SEARCH_RPC: &str = "chat_search_messages";

const DEFAULT_LIMIT: i64 = 50;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const SEARCH_FAILED_MESSAGE: &str = "Failed to search chat messages";

pub(crate) async fn handle_workspaces_chat_search_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_chat_search_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspaces_chat_search_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspaces_chat_search_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
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
            return message_response(500, SEARCH_FAILED_MESSAGE);
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

    let query = search_query(request.url);
    let limit = search_limit(request.url);

    match search_chat_messages(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &user_id,
        &query,
        limit,
    )
    .await
    {
        Ok(messages) => no_store_response(json_response(200, json!({ "messages": messages }))),
        Err(()) => message_response(500, SEARCH_FAILED_MESSAGE),
    }
}

async fn search_chat_messages(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    query: &str,
    limit: i64,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(SEARCH_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&json!({
        "p_actor_user_id": actor_user_id,
        "p_limit": limit,
        "p_query": query,
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

    // The RPC may legitimately return null; coalesce to an empty array like the
    // legacy `messages ?? []` fallback.
    match response.json::<Value>() {
        Ok(Value::Null) => Ok(Value::Array(Vec::new())),
        Ok(value @ Value::Array(_)) => Ok(value),
        Ok(_) => Err(()),
        Err(_) => Err(()),
    }
}

fn search_query(request_url: Option<&str>) -> String {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return String::new();
    };

    url.query_pairs()
        .find_map(|(key, value)| (key == "q").then(|| value.into_owned()))
        .unwrap_or_default()
}

fn search_limit(request_url: Option<&str>) -> i64 {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return DEFAULT_LIMIT;
    };

    // Mirror `Number(...)` + `Number.isFinite(limit) ? limit : 50`. A missing
    // param defaults to 50; a non-numeric param (NaN) also falls back to 50.
    match url
        .query_pairs()
        .find_map(|(key, value)| (key == "limit").then(|| value.into_owned()))
    {
        None => DEFAULT_LIMIT,
        Some(raw) => parse_limit(&raw).unwrap_or(DEFAULT_LIMIT),
    }
}

fn parse_limit(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        // `Number('')` is 0, which is finite, so an empty string yields 0.
        return Some(0);
    }

    // `Number(...)` accepts integers and floats; the RPC expects an integer
    // limit, so truncate toward zero like a JS integer coercion would for the
    // common integer inputs while still tolerating float-formatted values.
    if let Ok(value) = trimmed.parse::<i64>() {
        return Some(value);
    }

    trimmed
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .map(|value| value.trunc() as i64)
}

fn workspaces_chat_search_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_CHAT_SEARCH_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_CHAT_SEARCH_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
