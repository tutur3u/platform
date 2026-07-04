use super::*;

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

pub(super) enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(super) async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
    accept_profile: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(profile) = accept_profile {
        request = request
            .with_header("Accept-Profile", profile)
            .with_header("Content-Profile", profile);
    }

    outbound.send(request).await.map_err(|_| ())
}

pub(super) async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(
        contact_data,
        outbound,
        method,
        url,
        &DataAuth::ServiceRole,
        None,
    )
    .await
}

pub(super) async fn send_private_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(
        contact_data,
        outbound,
        method,
        url,
        &DataAuth::ServiceRole,
        Some(PRIVATE_SCHEMA),
    )
    .await
}
