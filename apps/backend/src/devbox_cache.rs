use serde::Deserialize;
use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, method_not_allowed,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const DEVBOX_CACHE_PATH: &str = "/api/v1/devboxes/cache";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_devbox_cache_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    match (request.method, request.path) {
        ("GET", DEVBOX_CACHE_PATH) => Some(devbox_cache_response(config, request, outbound).await),
        (method, DEVBOX_CACHE_PATH) => Some(method_not_allowed(method, "GET")),
        _ => None,
    }
}

async fn devbox_cache_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user_id) = devbox_request_user_id(config, request, outbound).await else {
        return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
    };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    if !has_root_workspace_member(&config.contact_data, &user_id, outbound).await {
        return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
    }

    no_store_response(json_response(
        200,
        json!({
            "caches": [],
        }),
    ))
}

async fn devbox_request_user_id(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    if contact::request_has_app_session_token(request) {
        return contact::resolve_cli_app_session_identity(config, request)
            .ok()
            .map(|identity| identity.id);
    }

    let access_token = supabase_auth::request_access_token(request)?;
    if !config.contact_data.configured() {
        return None;
    }
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;

    user.id.filter(|id| !id.trim().is_empty())
}

async fn has_root_workspace_member(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return false;
    };
    let authorization = format!("Bearer {service_role_key}");
    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", POSTGREST_SINGLE_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response
        .json::<WorkspaceMemberRow>()
        .ok()
        .and_then(|row| row.membership_type)
        .is_some_and(|membership_type| membership_type == "MEMBER")
}

fn contact_data_layer_not_ready_response(request: BackendRequest<'_>) -> BackendResponse {
    no_store_response(json_response(
        503,
        json!({
            "code": "CONTACT_DATA_LAYER_NOT_READY",
            "message": contact::CONTACT_DATA_LAYER_NOT_READY_MESSAGE,
            "requestId": request.request_id.unwrap_or("unknown"),
        }),
    ))
}
