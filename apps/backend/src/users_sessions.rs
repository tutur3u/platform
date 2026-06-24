use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const USERS_SESSIONS_PATH: &str = "/api/v1/users/sessions";
const GET_USER_SESSIONS_RPC: &str = "get_user_sessions";
const GET_USER_SESSION_STATS_RPC: &str = "get_user_session_stats";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_SESSIONS_FAILED_MESSAGE: &str = "Failed to fetch sessions";
const FETCH_SESSION_STATS_FAILED_MESSAGE: &str = "Failed to fetch session statistics";

#[derive(Serialize)]
struct UserIdRpcRequest<'a> {
    user_id: &'a str,
}

pub(crate) async fn handle_users_sessions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != USERS_SESSIONS_PATH {
        return None;
    }

    // Only the GET method is migrated. Every other method (e.g. DELETE) must
    // fall through to the still-active Next.js route, so return None for them.
    Some(match request.method {
        "GET" => users_sessions_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn users_sessions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The session RPCs rely on auth.uid()/auth.jwt() in the database, so they
    // must be invoked with the caller's Supabase access token (not service
    // role). App-session tokens are excluded by request_access_token.
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

    let sessions = match call_session_rpc(
        &config.contact_data,
        outbound,
        GET_USER_SESSIONS_RPC,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_SESSIONS_FAILED_MESSAGE),
    };

    let stats_rows = match call_session_rpc(
        &config.contact_data,
        outbound,
        GET_USER_SESSION_STATS_RPC,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_SESSION_STATS_FAILED_MESSAGE),
    };

    let stats = stats_rows
        .into_iter()
        .next()
        .unwrap_or_else(default_session_stats);

    no_store_response(json_response(
        200,
        json!({
            "sessions": Value::Array(sessions),
            "stats": stats,
        }),
    ))
}

async fn call_session_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url(function).ok_or(())?;
    let body = serde_json::to_string(&UserIdRpcRequest { user_id }).map_err(|_| ())?;
    let response =
        send_caller_rpc_request(contact_data, outbound, &rpc_url, access_token, &body).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_caller_rpc_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

fn default_session_stats() -> Value {
    json!({
        "total_sessions": 0,
        "active_sessions": 0,
        "current_session_age": Value::Null,
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
