use serde_json::{Value, json};

use crate::{
    BackendRequest, BackendResponse, contact, json_response, no_store_response,
    outbound::OutboundHttpClient,
};

use super::{CRAWLED_URL_NEXT_URLS_TABLE, CRAWLED_URLS_TABLE, send_supabase_get};

pub(super) async fn crawler_status_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(url) = crawler_status_url_from_request(request.url) else {
        return crawler_message_response(400, "Missing required parameter: url");
    };

    let Some(crawled_url) = (match fetch_crawled_url_status(contact_data, outbound, &url).await {
        Ok(crawled_url) => crawled_url,
        Err(()) => return crawler_message_response(500, "Error fetching crawled URL"),
    }) else {
        return no_store_response(json_response(
            200,
            json!({
                "crawledUrl": null,
                "relatedUrls": [],
            }),
        ));
    };

    let Some(origin_id) = crawled_url_id(&crawled_url) else {
        return crawler_message_response(500, "Error fetching related URLs");
    };
    let related_urls = match fetch_related_crawled_urls(contact_data, outbound, &origin_id).await {
        Ok(related_urls) => related_urls,
        Err(()) => return crawler_message_response(500, "Error fetching related URLs"),
    };

    no_store_response(json_response(
        200,
        json!({
            "crawledUrl": crawled_url,
            "relatedUrls": related_urls,
        }),
    ))
}

async fn fetch_crawled_url_status(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<Option<Value>, ()> {
    let params = [
        ("select", "*".to_owned()),
        ("url", format!("eq.{url}")),
        ("limit", "1".to_owned()),
    ];
    let response = send_supabase_get(
        contact_data,
        outbound,
        CRAWLED_URLS_TABLE,
        &params,
        None,
        None,
    )
    .await?;
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(rows.into_iter().next())
}

async fn fetch_related_crawled_urls(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    origin_id: &str,
) -> Result<Vec<Value>, ()> {
    let params = [
        ("select", "*".to_owned()),
        ("origin_id", format!("eq.{origin_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    let response = send_supabase_get(
        contact_data,
        outbound,
        CRAWLED_URL_NEXT_URLS_TABLE,
        &params,
        None,
        None,
    )
    .await?;

    response.json::<Vec<Value>>().map_err(|_| ())
}

fn crawler_status_url_from_request(request_url: Option<&str>) -> Option<String> {
    let parsed_url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;

    for (key, value) in parsed_url.query_pairs() {
        if key == "url" {
            return (!value.is_empty()).then(|| value.into_owned());
        }
    }

    None
}

fn crawled_url_id(crawled_url: &Value) -> Option<String> {
    match crawled_url.get("id")? {
        Value::String(id) => Some(id.clone()),
        Value::Number(id) => Some(id.to_string()),
        Value::Bool(id) => Some(id.to_string()),
        _ => None,
    }
}

fn crawler_message_response(status: u16, message: &'static str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": message,
        }),
    ))
}
