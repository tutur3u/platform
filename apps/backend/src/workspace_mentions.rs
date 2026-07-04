use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MEMBERSHIP_LOOKUP_FAILED_ERROR: &str = "Failed to verify workspace access";
const UNAUTHORIZED_ERROR: &str = "Unauthorized";
const FORBIDDEN_ERROR: &str = "Forbidden";
const WORKSPACE_MENTIONS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_MENTIONS_PATH_SUFFIX: &str = "/Mention";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceUserEmailRow {
    email: Option<String>,
}

#[derive(Serialize)]
struct WorkspaceMentionEmailsResponse {
    email: Vec<Option<String>>,
}

pub(crate) async fn handle_workspace_mentions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspace_mentions_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_mentions_response(&config.contact_data, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_mentions_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_ERROR);
    };
    let Some(user) = supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_ERROR);
    };

    match verify_workspace_member(contact_data, outbound, ws_id, &user, &access_token).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, FORBIDDEN_ERROR),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_ERROR),
    }

    match workspace_user_emails(contact_data, outbound, ws_id, &access_token).await {
        Ok(email) => {
            no_store_response(json_response(200, WorkspaceMentionEmailsResponse { email }))
        }
        Err(message) => error_response(400, &message),
    }
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
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

    let rows = response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?;
    Ok(rows.first().and_then(|row| row.membership_type.as_deref()) == Some("MEMBER"))
}

async fn workspace_user_emails(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Vec<Option<String>>, String> {
    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            ("select", "email".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err("Failed to fetch workspace users".to_owned());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token)
        .await
        .map_err(|_| "Failed to fetch workspace users".to_owned())?;

    if !(200..300).contains(&response.status) {
        return Err(supabase_error_message(&response));
    }

    Ok(response
        .json::<Vec<WorkspaceUserEmailRow>>()
        .map_err(|_| "Failed to fetch workspace users".to_owned())?
        .into_iter()
        .map(|row| row.email)
        .collect())
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

fn supabase_error_message(response: &OutboundResponse) -> String {
    response
        .json::<serde_json::Value>()
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .or_else(|| value.get("error"))
                .and_then(|message| message.as_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| response.body_text.clone())
}

fn workspace_mentions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_MENTIONS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_MENTIONS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}
