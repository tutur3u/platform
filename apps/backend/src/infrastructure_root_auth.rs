use serde_json::Value;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const WORKSPACE_USER_LINKED_USERS_TABLE: &str = "workspace_user_linked_users";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RootWorkspaceReadAuthError {
    Unauthorized,
    Forbidden,
}

pub(crate) async fn authorize_root_workspace_read(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<String, RootWorkspaceReadAuthError> {
    let contact_data = &config.contact_data;
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(RootWorkspaceReadAuthError::Unauthorized);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(RootWorkspaceReadAuthError::Unauthorized);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(RootWorkspaceReadAuthError::Unauthorized);
    };

    if has_root_workspace_membership(contact_data, outbound, &access_token, &user_id)
        .await
        .unwrap_or(false)
    {
        Ok(access_token)
    } else {
        Err(RootWorkspaceReadAuthError::Forbidden)
    }
}

pub(crate) async fn send_caller_token_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
    accept: &str,
) -> Result<OutboundResponse, ()> {
    send_caller_token_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        url,
        access_token,
        accept,
    )
    .await
}

pub(crate) async fn send_caller_token_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    access_token: &str,
    accept: &str,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", accept)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn has_root_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_USER_LINKED_USERS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("platform_user_id", format!("eq.{user_id}")),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_caller_token_get(contact_data, outbound, &url, access_token, APPLICATION_JSON).await?;

    if !is_success_status(response.status) {
        return Ok(false);
    }

    response
        .json::<Vec<Value>>()
        .map(|rows| !rows.is_empty())
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}
