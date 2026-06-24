use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ERROR_FETCHING_PROMPT_MESSAGE: &str = "Error fetching prompt";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_AI_PROMPTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_AI_PROMPTS_PATH_INFIX: &str = "/ai/prompts/";

pub(crate) async fn handle_workspaces_ai_prompts_promptid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let prompt_id = workspace_ai_prompt_id(request.path)?;

    Some(match request.method {
        "GET" => prompt_response(config, request, prompt_id, outbound).await,
        // PUT and DELETE are not migrated yet; returning None lets the
        // Cloudflare worker fall through to the still-active Next.js route.
        _ => return None,
    })
}

async fn prompt_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    prompt_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route uses an RLS-scoped Supabase client (the caller's auth).
    // We require a valid access token and query with that token so the same
    // row visibility (RLS) applies.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_prompt(&config.contact_data, outbound, prompt_id, &access_token).await {
        Ok(Some(prompt)) => no_store_response(json_response(200, prompt)),
        // The legacy route uses `.single()`, which errors (HTTP 500) when there
        // is not exactly one matching row, so a missing/invisible row is a 500.
        Ok(None) | Err(()) => message_response(500, ERROR_FETCHING_PROMPT_MESSAGE),
    }
}

async fn fetch_prompt(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    prompt_id: &str,
    access_token: &str,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_ai_prompts",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{prompt_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
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

/// Matches `/api/v1/workspaces/{wsId}/ai/prompts/{promptId}` and extracts the
/// `promptId` segment. The `wsId` segment is not used by the GET handler (the
/// legacy route filters only by prompt id under RLS), but the full shape must
/// match so unrelated routes are not intercepted.
fn workspace_ai_prompt_id(path: &str) -> Option<&str> {
    let rest = path.strip_prefix(WORKSPACE_AI_PROMPTS_PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(WORKSPACE_AI_PROMPTS_PATH_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    let prompt_id = after_ws;
    (!prompt_id.is_empty() && !prompt_id.contains('/')).then_some(prompt_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
