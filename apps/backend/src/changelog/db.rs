use super::*;

pub(super) async fn changelog_existing_entry(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{id}"))],
    ) else {
        return Err(());
    };
    let response = send_changelog_authenticated_request(
        contact_data,
        outbound,
        ChangelogAuthenticatedRequest {
            method: OutboundMethod::Get,
            url: &url,
            accept: POSTGREST_SINGLE_JSON,
            access_token,
            prefer: None,
            body: None,
        },
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return if is_postgrest_single_not_found(&response) {
            Ok(None)
        } else {
            Err(())
        };
    }

    response.json::<Value>().map(Some).map_err(|_| ())
}

pub(super) async fn send_changelog_authenticated_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    params: ChangelogAuthenticatedRequest<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {}", params.access_token);
    let mut request = OutboundRequest::new(params.method, params.url)
        .with_header("Accept", params.accept)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(prefer) = params.prefer {
        request = request.with_header("Prefer", prefer);
    }

    if let Some(body) = params.body {
        request = request
            .with_header("Content-Type", APPLICATION_JSON)
            .with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

pub(super) async fn send_changelog_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    accept: &str,
    range: Option<&str>,
    prefer: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", accept)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(range) = range {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }

    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    outbound.send(request).await.map_err(|_| ())
}

pub(super) fn is_postgrest_single_not_found(response: &OutboundResponse) -> bool {
    is_postgrest_error_code(response, POSTGREST_SINGULAR_RESPONSE_ERROR_CODE)
}

pub(super) fn is_postgrest_error_code(response: &OutboundResponse, code: &str) -> bool {
    response
        .json::<PostgrestError>()
        .ok()
        .and_then(|error| error.code)
        .as_deref()
        == Some(code)
}

pub(super) fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}
