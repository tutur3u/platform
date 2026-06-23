use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments, supabase_auth,
};

const FETCH_ERROR_MESSAGE: &str = "Error fetching transaction categories";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_workspaces_categories_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let category_id = workspaces_category_id(request.path)?;

    Some(match request.method {
        "GET" => category_response(config, request, category_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn category_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    category_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route relies on the caller's Supabase session (RLS) via
    // `createClient()`. Mirror that by querying with the caller's access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_transaction_category(&config.contact_data, outbound, category_id, &access_token)
        .await
    {
        Ok(row) => no_store_response(json_response(200, row)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_transaction_category(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    category_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "transaction_categories",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{category_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `.single()` in the legacy route errors (HTTP 500 mapping) when the row is
    // absent or not unique, so treat an empty result set as an error too.
    response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .ok_or(())
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

fn workspaces_category_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    // /api/workspaces/:wsId/categories/:categoryId
    (segments.len() == 5
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && !segments[2].is_empty()
        && segments[3] == "categories"
        && !segments[4].is_empty())
    .then_some(segments[4])
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
