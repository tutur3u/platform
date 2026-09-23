use crate::{
    APPLICATION_JSON, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};
use serde::Deserialize;

async fn fetch_page(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<OutboundResponse, ()> {
    let url = contact_data.rest_url(table, params).ok_or(())?;
    let key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(response)
}

pub(super) async fn fetch_service_role_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<T>, ()> {
    fetch_page(contact_data, outbound, table, params)
        .await?
        .json::<Vec<T>>()
        .map_err(|_| ())
}

/// Match the live context API: incomplete coverage must never become billable debt.
pub(super) async fn fetch_complete_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<T>, ()> {
    let mut rows = Vec::new();
    let mut expected = None;
    loop {
        let offset = rows.len();
        let mut page_params = params.to_vec();
        page_params.push(("offset", offset.to_string()));
        page_params.push(("limit", "500".to_owned()));
        let response = fetch_page(contact_data, outbound, table, &page_params).await?;
        let count = response
            .header("content-range")
            .and_then(|value| value.rsplit('/').next())
            .and_then(|value| value.parse::<usize>().ok())
            .ok_or(())?;
        if count > 50_000 || expected.is_some_and(|previous| previous != count) || offset > count {
            return Err(());
        }
        expected = Some(count);
        let page = response.json::<Vec<T>>().map_err(|_| ())?;
        if page.len() != 500.min(count - offset) {
            return Err(());
        }
        rows.extend(page);
        if rows.len() == count {
            return Ok(rows);
        }
    }
}
