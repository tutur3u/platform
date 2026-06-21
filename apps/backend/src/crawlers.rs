use serde::Deserialize;
use serde_json::json;
use std::collections::BTreeSet;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

mod uncrawled;

const SUPABASE_MAX_ROWS: usize = 1000;
const CRAWLED_URLS_TABLE: &str = "crawled_urls";
const CRAWLED_URL_NEXT_URLS_TABLE: &str = "crawled_url_next_urls";

#[derive(Deserialize)]
struct CrawlerUrlRow {
    url: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CrawlerRoute {
    Domains,
    Uncrawled,
}

pub(crate) async fn handle_crawler_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = crawler_route(request.path)?;

    Some(match (request.method, route) {
        ("GET", CrawlerRoute::Domains) => {
            crawler_domains_response(&config.contact_data, outbound).await
        }
        ("GET", CrawlerRoute::Uncrawled) => {
            uncrawled::crawler_uncrawled_response(&config.contact_data, request, outbound).await
        }
        (method, _) => method_not_allowed(method, "GET"),
    })
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
    let range = format!("{offset}-{}", offset + SUPABASE_MAX_ROWS - 1);
    let response =
        send_supabase_get(contact_data, outbound, table, params, Some(&range), None).await?;

    response.json::<Vec<CrawlerUrlRow>>().map_err(|_| ())
}

async fn send_supabase_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
    range: Option<&str>,
    prefer: Option<&'static str>,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(table, params) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };

    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
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

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response)
}

fn hostname_from_url(raw_url: &str) -> Option<String> {
    url::Url::parse(raw_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
}

fn crawler_route(path: &str) -> Option<CrawlerRoute> {
    let mut segments = path.trim_start_matches('/').split('/');

    if !matches!(segments.next(), Some("api"))
        || segments.next().is_none_or(|segment| segment.is_empty())
        || !matches!(segments.next(), Some("crawlers"))
    {
        return None;
    }

    let route = match segments.next() {
        Some("domains") => CrawlerRoute::Domains,
        Some("uncrawled") => CrawlerRoute::Uncrawled,
        _ => return None,
    };

    segments.next().is_none().then_some(route)
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
