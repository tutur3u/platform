use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const ML_METRICS_PATH: &str = "/api/v1/aurora/ml-metrics";
const ML_METRICS_TABLE: &str = "aurora_ml_metrics";
const STATISTICAL_METRICS_PATH: &str = "/api/v1/aurora/statistical-metrics";
const STATISTICAL_METRICS_TABLE: &str = "aurora_statistical_metrics";

pub(crate) async fn handle_aurora_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let table = match request.path {
        ML_METRICS_PATH => ML_METRICS_TABLE,
        STATISTICAL_METRICS_PATH => STATISTICAL_METRICS_TABLE,
        _ => return None,
    };

    Some(match request.method {
        "GET" => metrics_response(&config.contact_data, table, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn metrics_response(
    contact_data: &contact::ContactDataConfig,
    table: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return aurora_error_response();
    }

    let Some(url) = contact_data.rest_url(table, &[("select", "*".to_owned())]) else {
        return aurora_error_response();
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return aurora_error_response();
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
        return aurora_error_response();
    };

    if !(200..300).contains(&response.status) {
        return aurora_error_response();
    }

    let Ok(body) = response.json::<serde_json::Value>() else {
        return aurora_error_response();
    };

    no_store_response(json_response(200, body))
}

fn aurora_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Internal Server Error",
        }),
    ))
}
