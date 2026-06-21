use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

use crate::{
    BackendRequest, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundResponse},
};

use super::{
    CRAWLED_URL_NEXT_URLS_TABLE, CRAWLED_URLS_TABLE, CrawlerUrlRow, internal_error_response,
    send_supabase_get,
};

#[derive(Clone, Deserialize, Serialize)]
struct UncrawledUrlRow {
    created_at: String,
    origin_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    origin_url: Option<String>,
    skipped: bool,
    url: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CrawlerQuery {
    domain: Option<String>,
    page: usize,
    page_size: usize,
    search: Option<String>,
}

pub(super) async fn crawler_uncrawled_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return internal_error_response();
    }

    let query = crawler_query_from_url(request.url, 20);
    let total_items = match fetch_uncrawled_count(contact_data, outbound, &query).await {
        Ok(total_items) => total_items,
        Err(()) => return internal_error_response(),
    };
    let next_urls = match fetch_uncrawled_next_urls(contact_data, outbound, &query).await {
        Ok(next_urls) => next_urls,
        Err(()) => return internal_error_response(),
    };

    if next_urls.is_empty() {
        return no_store_response(json_response(
            200,
            json!({
                "uncrawledUrls": [],
                "groupedUrls": {},
                "pagination": uncrawled_pagination(&query, total_items),
            }),
        ));
    }

    let urls_to_check = next_urls
        .iter()
        .map(|row| row.url.clone())
        .collect::<Vec<_>>();
    let existing_urls =
        match fetch_existing_crawled_urls(contact_data, outbound, &urls_to_check).await {
            Ok(existing_urls) => existing_urls,
            Err(()) => return internal_error_response(),
        };
    let existing_url_set = existing_urls
        .into_iter()
        .map(|url| normalized_crawled_url(&url))
        .collect::<BTreeSet<_>>();
    let uncrawled_urls = next_urls
        .into_iter()
        .filter(|row| !existing_url_set.contains(&normalized_crawled_url(&row.url)))
        .collect::<Vec<_>>();
    let mut grouped_urls: BTreeMap<String, Vec<UncrawledUrlRow>> = BTreeMap::new();

    for row in &uncrawled_urls {
        grouped_urls
            .entry(row.origin_id.clone())
            .or_default()
            .push(row.clone());
    }

    no_store_response(json_response(
        200,
        json!({
            "uncrawledUrls": uncrawled_urls,
            "groupedUrls": grouped_urls,
            "pagination": uncrawled_pagination(&query, total_items),
        }),
    ))
}

async fn fetch_uncrawled_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &CrawlerQuery,
) -> Result<usize, ()> {
    let params = uncrawled_params("url", query);
    let response = send_supabase_get(
        contact_data,
        outbound,
        CRAWLED_URL_NEXT_URLS_TABLE,
        &params,
        Some("0-0"),
        Some("count=exact"),
    )
    .await?;

    Ok(
        total_count_from_content_range(&response).unwrap_or_else(|| {
            response
                .json::<Vec<CrawlerUrlRow>>()
                .map(|rows| rows.len())
                .unwrap_or(0)
        }),
    )
}

async fn fetch_uncrawled_next_urls(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &CrawlerQuery,
) -> Result<Vec<UncrawledUrlRow>, ()> {
    let params = uncrawled_params("*,...crawled_urls!inner(origin_url:url)", query);
    let start = (query.page - 1) * query.page_size;
    let range = format!("{start}-{}", start + query.page_size - 1);
    let response = send_supabase_get(
        contact_data,
        outbound,
        CRAWLED_URL_NEXT_URLS_TABLE,
        &params,
        Some(&range),
        None,
    )
    .await?;

    response.json::<Vec<UncrawledUrlRow>>().map_err(|_| ())
}

async fn fetch_existing_crawled_urls(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    urls: &[String],
) -> Result<Vec<String>, ()> {
    let params = [
        ("select", "url".to_owned()),
        ("url", postgrest_in_filter(urls)),
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
    let rows = response.json::<Vec<CrawlerUrlRow>>().map_err(|_| ())?;

    Ok(rows.into_iter().filter_map(|row| row.url).collect())
}

fn uncrawled_params(select: &str, query: &CrawlerQuery) -> Vec<(&'static str, String)> {
    let mut params = vec![
        ("select", select.to_owned()),
        ("skipped", "eq.false".to_owned()),
    ];

    if let Some(domain) = &query.domain {
        params.push(("url", format!("ilike.%{domain}%")));
    }

    if let Some(search) = &query.search {
        params.push(("url", format!("ilike.%{search}%")));
    }

    params
}

fn crawler_query_from_url(request_url: Option<&str>, default_page_size: usize) -> CrawlerQuery {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return CrawlerQuery {
            domain: None,
            page: 1,
            page_size: default_page_size,
            search: None,
        };
    };
    let mut domain = None;
    let mut page = 1;
    let mut page_size = default_page_size;
    let mut search = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "domain" if domain.is_none() && !value.is_empty() && value != "all" => {
                domain = Some(value.into_owned());
            }
            "page" => page = positive_usize(&value, 1),
            "pageSize" => page_size = positive_usize(&value, default_page_size),
            "search" if search.is_none() && !value.is_empty() => {
                search = Some(value.into_owned());
            }
            _ => {}
        }
    }

    CrawlerQuery {
        domain,
        page,
        page_size,
        search,
    }
}

fn positive_usize(value: &str, fallback: usize) -> usize {
    value
        .parse::<usize>()
        .ok()
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn uncrawled_pagination(query: &CrawlerQuery, total_items: usize) -> serde_json::Value {
    json!({
        "page": query.page,
        "pageSize": query.page_size,
        "totalPages": total_items.div_ceil(query.page_size),
        "totalItems": total_items,
    })
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    response
        .header("content-range")?
        .rsplit_once('/')?
        .1
        .parse::<usize>()
        .ok()
}

fn postgrest_in_filter(values: &[String]) -> String {
    let values = values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");

    format!("in.({values})")
}

fn normalized_crawled_url(raw_url: &str) -> String {
    let trimmed = raw_url.trim();

    if trimmed.ends_with('/') {
        trimmed.to_owned()
    } else {
        format!("{trimmed}/")
    }
}
