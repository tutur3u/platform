use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const FORECAST_PATH: &str = "/api/v1/aurora/forecast";
const ML_FORECAST_TABLE: &str = "aurora_ml_forecast";
const ML_METRICS_PATH: &str = "/api/v1/aurora/ml-metrics";
const ML_METRICS_TABLE: &str = "aurora_ml_metrics";
const STATISTICAL_FORECAST_TABLE: &str = "aurora_statistical_forecast";
const STATISTICAL_METRICS_PATH: &str = "/api/v1/aurora/statistical-metrics";
const STATISTICAL_METRICS_TABLE: &str = "aurora_statistical_metrics";
const FORECAST_ERROR_MESSAGE: &str = "Error fetching forecast data";

#[derive(Clone, Copy)]
enum AuroraRoute {
    Forecast,
    Metrics { table: &'static str },
}

pub(crate) async fn handle_aurora_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = match request.path {
        FORECAST_PATH => AuroraRoute::Forecast,
        ML_METRICS_PATH => AuroraRoute::Metrics {
            table: ML_METRICS_TABLE,
        },
        STATISTICAL_METRICS_PATH => AuroraRoute::Metrics {
            table: STATISTICAL_METRICS_TABLE,
        },
        _ => return None,
    };

    Some(match request.method {
        "GET" => match route {
            AuroraRoute::Forecast => forecast_response(&config.contact_data, outbound).await,
            AuroraRoute::Metrics { table } => {
                metrics_response(&config.contact_data, table, outbound).await
            }
        },
        method => method_not_allowed(method, "GET"),
    })
}

async fn metrics_response(
    contact_data: &contact::ContactDataConfig,
    table: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Ok(body) =
        supabase_json_response(contact_data, outbound, table, &[("select", "*".to_owned())]).await
    else {
        return aurora_error_response();
    };

    no_store_response(json_response(200, body))
}

async fn forecast_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Ok(statistical_forecast) =
        forecast_rows(contact_data, outbound, STATISTICAL_FORECAST_TABLE)
            .await
            .map(normalize_forecast_dates)
    else {
        return forecast_error_response();
    };
    let Ok(ml_forecast) = forecast_rows(contact_data, outbound, ML_FORECAST_TABLE)
        .await
        .map(normalize_forecast_dates)
    else {
        return forecast_error_response();
    };

    no_store_response(json_response(
        200,
        json!({
            "statistical_forecast": statistical_forecast,
            "ml_forecast": ml_forecast,
        }),
    ))
}

async fn forecast_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
) -> Result<Vec<Value>, ()> {
    let body = supabase_json_response(
        contact_data,
        outbound,
        table,
        &[("select", "*".to_owned()), ("order", "date.asc".to_owned())],
    )
    .await?;

    match body {
        Value::Array(rows) => Ok(rows),
        _ => Err(()),
    }
}

async fn supabase_json_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Value, ()> {
    if !contact_data.configured() {
        return Err(());
    }

    let Some(url) = contact_data.rest_url(table, params) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
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

    let response = response.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn normalize_forecast_dates(rows: Vec<Value>) -> Vec<Value> {
    rows.into_iter().map(normalize_forecast_date).collect()
}

fn normalize_forecast_date(mut row: Value) -> Value {
    if let Value::Object(fields) = &mut row
        && let Some(Value::String(date)) = fields.get_mut("date")
        && let Some(normalized) = legacy_date_string(date)
    {
        *date = normalized;
    }

    row
}

fn legacy_date_string(raw: &str) -> Option<String> {
    let date = raw.get(0..10)?;
    let bytes = date.as_bytes();

    (bytes.len() == 10
        && bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[2].is_ascii_digit()
        && bytes[3].is_ascii_digit()
        && bytes[4] == b'-'
        && bytes[5].is_ascii_digit()
        && bytes[6].is_ascii_digit()
        && bytes[7] == b'-'
        && bytes[8].is_ascii_digit()
        && bytes[9].is_ascii_digit())
    .then(|| date.to_owned())
}

fn aurora_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Internal Server Error",
        }),
    ))
}

fn forecast_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": FORECAST_ERROR_MESSAGE,
        }),
    ))
}
