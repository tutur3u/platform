use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_SOUL_PATH: &str = "/api/v1/mira/soul";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Failed to fetch soul data";
const DEFAULT_SOUL_NAME: &str = "Mira";

pub(crate) async fn handle_mira_soul_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MIRA_SOUL_PATH {
        return None;
    }

    // Only the GET method is migrated. Every other method (e.g. PATCH) must fall
    // through to the still-active Next.js route, so return None for them.
    Some(match request.method {
        "GET" => mira_soul_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn mira_soul_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
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

    // Legacy: supabase.from('mira_soul').select('*').eq('user_id', user.id)
    //   .maybeSingle() — RLS via the caller's access token.
    let soul = match fetch_soul(&config.contact_data, outbound, &user_id, &access_token).await {
        Ok(soul) => soul,
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    // Legacy: { soul: soul ?? { name: 'Mira' } }
    let soul_value = soul.unwrap_or_else(|| json!({ "name": DEFAULT_SOUL_NAME }));

    no_store_response(json_response(200, json!({ "soul": soul_value })))
}

async fn fetch_soul(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_soul",
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // maybeSingle() => first row or None when empty.
    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

// File-local copy of the caller-scoped REST helper (the reference modules keep
// their own private copy; nothing shared is edited).
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
