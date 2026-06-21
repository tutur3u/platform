use serde::Deserialize;
use serde_json::json;
use std::collections::BTreeSet;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const SUPABASE_MAX_ROWS: usize = 1000;
const CRAWLED_URLS_TABLE: &str = "crawled_urls";
const CRAWLED_URL_NEXT_URLS_TABLE: &str = "crawled_url_next_urls";

#[derive(Deserialize)]
struct CrawlerUrlRow {
    url: Option<String>,
}

pub(crate) async fn handle_crawler_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if !is_crawler_domains_path(request.path) {
        return None;
    }

    if request.method != "GET" {
        return Some(method_not_allowed(request.method, "GET"));
    }

    Some(crawler_domains_response(&config.contact_data, outbound).await)
}

async fn crawler_domains_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return internal_error_response();
    }

    let mut domains = BTreeSet::new();

    if collect_domains(
        &mut domains,
        contact_data,
        outbound,
        CRAWLED_URLS_TABLE,
        &[("select", "url".to_owned())],
    )
    .await
    .is_err()
    {
        return internal_error_response();
    }

    if collect_domains(
        &mut domains,
        contact_data,
        outbound,
        CRAWLED_URL_NEXT_URLS_TABLE,
        &[
            ("select", "url".to_owned()),
            ("skipped", "eq.false".to_owned()),
        ],
    )
    .await
    .is_err()
    {
        return internal_error_response();
    }

    no_store_response(json_response(
        200,
        json!({
            "domains": domains.into_iter().collect::<Vec<_>>(),
            "cached": false,
        }),
    ))
}

async fn collect_domains(
    domains: &mut BTreeSet<String>,
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<(), ()> {
    let mut offset = 0;

    loop {
        let rows = fetch_url_rows(contact_data, outbound, table, params, offset).await?;

        if rows.is_empty() {
            return Ok(());
        }

        for row in &rows {
            if let Some(hostname) = row.url.as_deref().and_then(hostname_from_url) {
                domains.insert(hostname);
            }
        }

        if rows.len() < SUPABASE_MAX_ROWS {
            return Ok(());
        }

        offset += SUPABASE_MAX_ROWS;
    }
}

async fn fetch_url_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
    offset: usize,
) -> Result<Vec<CrawlerUrlRow>, ()> {
    let Some(url) = contact_data.rest_url(table, params) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };

    let authorization = format!("Bearer {service_role_key}");
    let range = format!("{offset}-{}", offset + SUPABASE_MAX_ROWS - 1);
    let request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Range-Unit", "items")
        .with_header("Range", &range);

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<CrawlerUrlRow>>().map_err(|_| ())
}

fn hostname_from_url(raw_url: &str) -> Option<String> {
    url::Url::parse(raw_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
}

fn is_crawler_domains_path(path: &str) -> bool {
    let mut segments = path.trim_start_matches('/').split('/');

    matches!(segments.next(), Some("api"))
        && segments.next().is_some_and(|segment| !segment.is_empty())
        && matches!(segments.next(), Some("crawlers"))
        && matches!(segments.next(), Some("domains"))
        && segments.next().is_none()
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn internal_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Internal Server Error",
        }),
    ))
}
