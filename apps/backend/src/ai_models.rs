use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const AI_MODELS_PATH: &str = "/api/v1/infrastructure/ai/models";
const AI_MODELS_TABLE: &str = "ai_gateway_models";
const AI_MODELS_ERROR_MESSAGE: &str = "Error fetching AI Models";
const PRIVATE_SCHEMA: &str = "private";
const PUBLIC_MODEL_COLUMNS: &str = concat!(
    "cache_read_price_per_token,",
    "cache_write_price_per_token,",
    "context_window,",
    "description,",
    "id,",
    "image_gen_price,",
    "input_price_per_token,",
    "input_tiers,",
    "is_enabled,",
    "max_tokens,",
    "name,",
    "output_price_per_token,",
    "output_tiers,",
    "pricing_raw,",
    "provider,",
    "released_at,",
    "search_price,",
    "synced_at,",
    "tags,",
    "type,",
    "web_search_price",
);

struct AiModelsQuery {
    enabled: Option<bool>,
    ids: Vec<String>,
    limit: usize,
    page: usize,
    provider: Option<String>,
    search: Option<String>,
    should_paginate: bool,
    tag: Option<String>,
    type_filter: Option<String>,
}

pub(crate) async fn handle_ai_models_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AI_MODELS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => ai_models_response(&config.contact_data, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn ai_models_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return ai_models_error_response();
    }

    let query = ai_models_query(request.url);
    let params = ai_models_params(&query);
    let Some(url) = contact_data.rest_url(AI_MODELS_TABLE, &params) else {
        return ai_models_error_response();
    };
    let Ok(response) = send_ai_models_get(contact_data, outbound, &url, &query).await else {
        return ai_models_error_response();
    };

    let Ok(body) = response.json::<Value>() else {
        return ai_models_error_response();
    };

    if query.should_paginate {
        return no_store_response(json_response(
            200,
            json!({
                "data": body,
                "pagination": {
                    "page": query.page,
                    "limit": query.limit,
                    "total": total_count_from_content_range(&response).unwrap_or(0),
                },
            }),
        ));
    }

    no_store_response(json_response(200, body))
}

async fn send_ai_models_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    query: &AiModelsQuery,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Content-Profile", PRIVATE_SCHEMA)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    let range_header = if query.should_paginate {
        let start = (query.page - 1) * query.limit;
        let end = start + query.limit - 1;
        Some(format!("{start}-{end}"))
    } else {
        None
    };

    if let Some(range) = range_header.as_deref() {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range)
            .with_header("Prefer", "count=exact");
    }

    let response = outbound.send(request).await.map_err(|_| ())?;
    if (200..300).contains(&response.status) {
        Ok(response)
    } else {
        Err(())
    }
}

fn ai_models_query(request_url: Option<&str>) -> AiModelsQuery {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());
    let page_param = query_value(url.as_ref(), "page");
    let limit_param = query_value(url.as_ref(), "limit");
    let page = parse_positive_int(page_param.as_deref(), 1);
    let limit = parse_positive_int(limit_param.as_deref(), 100).min(100);
    let format = query_value(url.as_ref(), "format");
    let type_param = query_value(url.as_ref(), "type").unwrap_or_else(|| "language".to_owned());
    let provider = optional_query_value(url.as_ref(), "provider");
    let tag = optional_query_value(url.as_ref(), "tag");
    let enabled = match query_value(url.as_ref(), "enabled").as_deref() {
        Some("true") => Some(true),
        Some("false") => Some(false),
        _ => None,
    };
    let search = optional_query_value(url.as_ref(), "search")
        .or_else(|| optional_query_value(url.as_ref(), "q"))
        .and_then(|value| {
            let sanitized = sanitize_ilike_term(&value);
            (!sanitized.is_empty()).then_some(sanitized)
        });

    AiModelsQuery {
        enabled,
        ids: parse_ids(query_value(url.as_ref(), "ids").as_deref()),
        limit,
        page,
        provider,
        search,
        should_paginate: format.as_deref() == Some("paginated")
            || page_param.is_some()
            || limit_param.is_some(),
        tag,
        type_filter: (type_param != "all").then_some(type_param),
    }
}

fn ai_models_params(query: &AiModelsQuery) -> Vec<(&'static str, String)> {
    let mut params = vec![
        ("select", PUBLIC_MODEL_COLUMNS.to_owned()),
        ("order", "provider.asc,name.asc".to_owned()),
    ];

    if let Some(type_filter) = &query.type_filter {
        params.push(("type", format!("eq.{type_filter}")));
    }

    if let Some(provider) = &query.provider {
        params.push(("provider", format!("eq.{provider}")));
    }

    if let Some(tag) = &query.tag {
        params.push(("tags", format!("cs.{{{tag}}}")));
    }

    if !query.ids.is_empty() {
        params.push(("id", format!("in.({})", query.ids.join(","))));
    }

    if let Some(search) = &query.search {
        let pattern = format!("%{search}%");
        params.push((
            "or",
            format!(
                "(id.ilike.{pattern},name.ilike.{pattern},provider.ilike.{pattern},description.ilike.{pattern})"
            ),
        ));
    }

    if let Some(enabled) = query.enabled {
        params.push(("is_enabled", format!("eq.{enabled}")));
    }

    params
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

fn optional_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    query_value(url, key).filter(|value| !value.is_empty())
}

fn parse_positive_int(value: Option<&str>, fallback: usize) -> usize {
    let parsed = match value {
        Some(value) if value.trim().is_empty() => 0.0,
        Some(value) => value.parse::<f64>().unwrap_or(fallback as f64),
        None => fallback as f64,
    };

    if !parsed.is_finite() {
        return fallback;
    }

    parsed.floor().max(1.0) as usize
}

fn sanitize_ilike_term(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|character| !matches!(character, ',' | '%' | '(' | ')'))
        .collect()
}

fn parse_ids(value: Option<&str>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    let mut ids = Vec::new();

    for id in value.split(',').map(str::trim).filter(|id| !id.is_empty()) {
        if ids.iter().any(|existing| existing == id) {
            continue;
        }

        ids.push(id.to_owned());

        if ids.len() >= 100 {
            break;
        }
    }

    ids
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn ai_models_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": AI_MODELS_ERROR_MESSAGE,
        }),
    ))
}
