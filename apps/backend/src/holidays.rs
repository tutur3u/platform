use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HOLIDAYS_PATH: &str = "/api/v1/internal/holidays";
const HOLIDAYS_TABLE: &str = "vietnamese_holidays";
const HOLIDAYS_ERROR_MESSAGE: &str = "Error fetching holidays";

pub(crate) async fn handle_holidays_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != HOLIDAYS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => holidays_response(&config.contact_data, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn holidays_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return holidays_error_response();
    }

    let mut params = vec![("select", "*".to_owned()), ("order", "date.asc".to_owned())];

    if let Some(year) = holiday_year_filter(request) {
        params.push(("year", format!("eq.{year}")));
    }

    let Some(url) = contact_data.rest_url(HOLIDAYS_TABLE, &params) else {
        return holidays_error_response();
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return holidays_error_response();
    };

    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await;

    let Ok(response) = response else {
        return holidays_error_response();
    };

    if !(200..300).contains(&response.status) {
        return holidays_error_response();
    }

    let Ok(body) = response.json::<serde_json::Value>() else {
        return holidays_error_response();
    };

    no_store_response(json_response(200, body))
}

fn holiday_year_filter(request: BackendRequest<'_>) -> Option<i64> {
    let url = url::Url::parse(request.url?).ok()?;
    let raw_year = url
        .query_pairs()
        .find_map(|(key, value)| (key == "year").then(|| value.into_owned()))?;
    let year = parse_js_parse_int_prefix(&raw_year)?;

    (year != 0).then_some(year)
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|year| sign * year)
}

fn holidays_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": HOLIDAYS_ERROR_MESSAGE,
        }),
    ))
}
