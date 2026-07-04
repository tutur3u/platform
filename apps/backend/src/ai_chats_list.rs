use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const AI_CHATS_LIST_PATH: &str = "/api/v1/ai/chats";
const AI_CHATS_TABLE: &str = "ai_chats";
const AI_CHATS_SELECT: &str = "id, title, created_at, pinned, is_public, model";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load chats";

// The legacy route opts into app-session auth via `allowAppSessionAuth: true`.
// The route audience rule for `/api/v1/ai/chats` resolves to the `rewise`
// target app, so app-session callers must present a `rewise`-scoped token.
const AI_CHATS_APP_SESSION_TARGETS: [&str; 1] = ["rewise"];

pub(crate) async fn handle_ai_chats_list_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AI_CHATS_LIST_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => ai_chats_list_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn ai_chats_list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user_id = match authenticated_user_id(config, request, outbound).await {
        Ok(user_id) => user_id,
        Err(()) => return unauthorized_response(),
    };

    match fetch_ai_chats(&config.contact_data, outbound, &user_id).await {
        Ok(rows) => no_store_response(json_response(200, Value::Array(rows))),
        Err(()) => failed_to_load_response(),
    }
}

async fn authenticated_user_id(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<String, ()> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &AI_CHATS_APP_SESSION_TARGETS)?;
        let id = identity.id.trim().to_owned();

        return if id.is_empty() { Err(()) } else { Ok(id) };
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(());
    };

    supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
        .await
        .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
        .ok_or(())
}

async fn fetch_ai_chats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    // Mirror the legacy explicit `creator_id = user.id` filter. The legacy
    // route relies on RLS via the caller's client; the equivalent here is the
    // same explicit filter executed with the service-role key.
    let Some(url) = contact_data.rest_url(
        AI_CHATS_TABLE,
        &[
            ("select", normalized_select()),
            ("creator_id", format!("eq.{user_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

fn normalized_select() -> String {
    // PostgREST `select` does not allow spaces between columns; collapse the
    // human-readable Supabase select string into a comma-separated list.
    AI_CHATS_SELECT
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>()
        .join(",")
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn failed_to_load_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": FAILED_TO_LOAD_MESSAGE,
        }),
    ))
}
