use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const TASK_BOARD_STATUS_TEMPLATES_PATH: &str = "/api/v1/task-board-status-templates";
const TASK_BOARD_STATUS_TEMPLATES_TABLE: &str = "task_board_status_templates";

pub(crate) async fn handle_task_board_status_templates_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != TASK_BOARD_STATUS_TEMPLATES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => {
            task_board_status_templates_response(&config.contact_data, request, outbound).await
        }
        method => method_not_allowed(method, "GET"),
    })
}

async fn task_board_status_templates_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    if supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .is_none()
    {
        return unauthorized_response();
    }

    let templates = match fetch_task_board_status_templates(contact_data, outbound).await {
        Ok(templates) => templates,
        Err(()) => return failed_to_fetch_templates_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "templates": templates,
        }),
    ))
}

async fn fetch_task_board_status_templates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        TASK_BOARD_STATUS_TEMPLATES_TABLE,
        &[
            ("select", "*".to_owned()),
            ("order", "is_default.desc,name.asc".to_owned()),
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

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn failed_to_fetch_templates_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to fetch status templates",
        }),
    ))
}
