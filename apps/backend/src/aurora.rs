use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const FORECAST_PATH: &str = "/api/v1/aurora/forecast";
const HEALTH_PATH: &str = "/api/v1/aurora/health";
const ML_FORECAST_TABLE: &str = "aurora_ml_forecast";
const ML_METRICS_PATH: &str = "/api/v1/aurora/ml-metrics";
const ML_METRICS_TABLE: &str = "aurora_ml_metrics";
const STATISTICAL_FORECAST_TABLE: &str = "aurora_statistical_forecast";
const STATISTICAL_METRICS_PATH: &str = "/api/v1/aurora/statistical-metrics";
const STATISTICAL_METRICS_TABLE: &str = "aurora_statistical_metrics";
const FORECAST_ERROR_MESSAGE: &str = "Error fetching forecast data";
const HEALTH_ERROR_MESSAGE: &str = "Error fetching health";
const MISSING_EXTERNAL_URL_MESSAGE: &str = "Aurora API URL not configured";
const MISSING_EXTERNAL_WORKSPACE_MESSAGE: &str = "Aurora workspace ID not configured";
const NOT_AUTHENTICATED_MESSAGE: &str = "Not authenticated";
const UNAUTHORIZED_EMAIL_DOMAIN_MESSAGE: &str = "Unauthorized email domain";

#[derive(Clone, Copy)]
enum AuroraRoute {
    Forecast,
    Health,
    MlMetrics,
    StatisticalMetrics,
}

pub(crate) async fn handle_aurora_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = match request.path {
        FORECAST_PATH => AuroraRoute::Forecast,
        HEALTH_PATH => AuroraRoute::Health,
        ML_METRICS_PATH => AuroraRoute::MlMetrics,
        STATISTICAL_METRICS_PATH => AuroraRoute::StatisticalMetrics,
        _ => return None,
    };

    Some(match (request.method, route) {
        ("GET", AuroraRoute::Forecast) => forecast_response(&config.contact_data, outbound).await,
        ("POST", AuroraRoute::Forecast) => {
            aurora_forecast_ingest_response(config, request, outbound).await
        }
        ("GET", AuroraRoute::MlMetrics) => {
            metrics_response(&config.contact_data, ML_METRICS_TABLE, outbound).await
        }
        ("POST", AuroraRoute::MlMetrics) => {
            aurora_metric_ingest_response(config, request, outbound, AuroraMetricIngestTarget::Ml)
                .await
        }
        ("GET", AuroraRoute::StatisticalMetrics) => {
            metrics_response(&config.contact_data, STATISTICAL_METRICS_TABLE, outbound).await
        }
        ("POST", AuroraRoute::StatisticalMetrics) => {
            aurora_metric_ingest_response(
                config,
                request,
                outbound,
                AuroraMetricIngestTarget::Statistical,
            )
            .await
        }
        ("POST", AuroraRoute::Health) => aurora_health_response(config, request, outbound).await,
        (method, AuroraRoute::Health) => method_not_allowed(method, "POST"),
        (
            method,
            AuroraRoute::Forecast | AuroraRoute::MlMetrics | AuroraRoute::StatisticalMetrics,
        ) => method_not_allowed(method, "GET, POST"),
    })
}

async fn aurora_health_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user) =
        authenticated_aurora_health_user(&config.contact_data, request, outbound).await
    else {
        return aurora_message_response(401, NOT_AUTHENTICATED_MESSAGE);
    };

    if !is_legacy_tuturuuu_email(user.email.as_deref()) {
        return aurora_message_response(403, UNAUTHORIZED_EMAIL_DOMAIN_MESSAGE);
    }

    let Some(url) = aurora_health_url(&config.aurora_external_url) else {
        return aurora_health_error_response();
    };
    let Ok(response) = outbound
        .send(OutboundRequest::new(OutboundMethod::Get, &url))
        .await
    else {
        return aurora_health_error_response();
    };

    if !(200..300).contains(&response.status) {
        return aurora_health_error_response();
    }

    no_store_response(json_response(
        200,
        json!({
            "message": "Success",
        }),
    ))
}

#[derive(Clone, Copy)]
enum AuroraMetricIngestTarget {
    Ml,
    Statistical,
}

enum AuroraIngestAuthError {
    ForbiddenDomain,
    MissingSession,
}

impl AuroraMetricIngestTarget {
    fn external_path(self) -> &'static str {
        match self {
            Self::Ml => "ml_metrics",
            Self::Statistical => "statistical_metrics",
        }
    }

    fn insert_error_message(self) -> &'static str {
        match self {
            Self::Ml => "Error creating ML metrics",
            Self::Statistical => "Error creating statistical metrics",
        }
    }

    fn table(self) -> &'static str {
        match self {
            Self::Ml => ML_METRICS_TABLE,
            Self::Statistical => STATISTICAL_METRICS_TABLE,
        }
    }
}

async fn aurora_forecast_ingest_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if let Some(response) = aurora_ingest_preflight_error(config) {
        return response;
    }

    let access_token =
        match authenticated_aurora_ingest_access_token(config, request, outbound).await {
            Ok(access_token) => access_token,
            Err(AuroraIngestAuthError::MissingSession) => {
                return aurora_message_response(401, NOT_AUTHENTICATED_MESSAGE);
            }
            Err(AuroraIngestAuthError::ForbiddenDomain) => {
                return aurora_message_response(403, UNAUTHORIZED_EMAIL_DOMAIN_MESSAGE);
            }
        };

    let external_data =
        match fetch_aurora_external_json(&config.aurora_external_url, "forecast", outbound).await {
            Ok(data) => data,
            Err(message) => return aurora_message_response(500, message),
        };

    let statistical_rows = match aurora_statistical_forecast_rows(
        &external_data,
        &config.aurora_external_workspace_id,
    ) {
        Ok(rows) => rows,
        Err(message) => return aurora_message_response(500, message),
    };

    if supabase_insert_json(
        &config.contact_data,
        outbound,
        STATISTICAL_FORECAST_TABLE,
        &Value::Array(statistical_rows),
        &access_token,
    )
    .await
    .is_err()
    {
        return aurora_message_response(500, "Error saving statistical forecast");
    }

    let ml_rows =
        match aurora_ml_forecast_rows(&external_data, &config.aurora_external_workspace_id) {
            Ok(rows) => rows,
            Err(message) => return aurora_message_response(500, message),
        };

    if supabase_insert_json(
        &config.contact_data,
        outbound,
        ML_FORECAST_TABLE,
        &Value::Array(ml_rows),
        &access_token,
    )
    .await
    .is_err()
    {
        return aurora_message_response(500, "Error saving ML forecast");
    }

    aurora_success_with_data_response(external_data)
}

async fn aurora_metric_ingest_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    target: AuroraMetricIngestTarget,
) -> BackendResponse {
    if let Some(response) = aurora_ingest_preflight_error(config) {
        return response;
    }

    let access_token =
        match authenticated_aurora_ingest_access_token(config, request, outbound).await {
            Ok(access_token) => access_token,
            Err(AuroraIngestAuthError::MissingSession) => {
                return aurora_message_response(401, NOT_AUTHENTICATED_MESSAGE);
            }
            Err(AuroraIngestAuthError::ForbiddenDomain) => {
                return aurora_message_response(403, UNAUTHORIZED_EMAIL_DOMAIN_MESSAGE);
            }
        };

    let external_data = match fetch_aurora_external_json(
        &config.aurora_external_url,
        target.external_path(),
        outbound,
    )
    .await
    {
        Ok(data) => data,
        Err(_) => return aurora_message_response(500, "Error fetching forecast"),
    };

    let rows = match target {
        AuroraMetricIngestTarget::Ml => {
            aurora_ml_metric_rows(&external_data, &config.aurora_external_workspace_id)
        }
        AuroraMetricIngestTarget::Statistical => {
            aurora_statistical_metric_rows(&external_data, &config.aurora_external_workspace_id)
        }
    };

    let rows = match rows {
        Ok(rows) => rows,
        Err(message) => return aurora_message_response(500, message),
    };

    if supabase_insert_json(
        &config.contact_data,
        outbound,
        target.table(),
        &Value::Array(rows),
        &access_token,
    )
    .await
    .is_err()
    {
        return aurora_message_response(500, target.insert_error_message());
    }

    aurora_success_with_data_response(external_data)
}

fn aurora_ingest_preflight_error(config: &BackendConfig) -> Option<BackendResponse> {
    if config.aurora_external_url.trim().is_empty() {
        return Some(aurora_message_response(500, MISSING_EXTERNAL_URL_MESSAGE));
    }

    if config.aurora_external_workspace_id.trim().is_empty() {
        return Some(aurora_message_response(
            500,
            MISSING_EXTERNAL_WORKSPACE_MESSAGE,
        ));
    }

    None
}

async fn authenticated_aurora_ingest_access_token(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<String, AuroraIngestAuthError> {
    let access_token = supabase_auth::request_access_token(request)
        .ok_or(AuroraIngestAuthError::MissingSession)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .ok_or(AuroraIngestAuthError::MissingSession)?;

    if is_legacy_tuturuuu_email(user.email.as_deref()) {
        Ok(access_token)
    } else {
        Err(AuroraIngestAuthError::ForbiddenDomain)
    }
}

async fn fetch_aurora_external_json(
    aurora_external_url: &str,
    path: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, &'static str> {
    let url =
        aurora_external_route_url(aurora_external_url, path).ok_or("Unknown error occurred")?;
    let response = outbound
        .send(OutboundRequest::new(OutboundMethod::Get, &url))
        .await
        .map_err(|_| "Unknown error occurred")?;

    if !(200..300).contains(&response.status) {
        return Err("Error fetching forecast from external API");
    }

    response
        .json::<Value>()
        .map_err(|_| "Unknown error occurred")
}

fn aurora_external_route_url(aurora_external_url: &str, path: &str) -> Option<String> {
    let base_url = aurora_external_url.trim().trim_end_matches('/');

    (!base_url.is_empty()).then(|| format!("{base_url}/{path}"))
}

fn aurora_ml_metric_rows(data: &Value, workspace_id: &str) -> Result<Vec<Value>, &'static str> {
    let metrics = data.as_object().ok_or("Unknown error occurred")?;

    Ok(metrics
        .iter()
        .map(|(model, metric)| {
            let mut row = Map::new();
            row.insert("ws_id".to_owned(), json!(workspace_id));
            row.insert("model".to_owned(), json!(model));
            copy_field(metric, &mut row, "RMSE", "rmse");
            copy_field(
                metric,
                &mut row,
                "Directional_Accuracy",
                "directional_accuracy",
            );
            copy_field(
                metric,
                &mut row,
                "Turning_Point_Accuracy",
                "turning_point_accuracy",
            );
            copy_field(metric, &mut row, "Weighted_Score", "weighted_score");
            Value::Object(row)
        })
        .collect())
}

fn aurora_statistical_metric_rows(
    data: &Value,
    workspace_id: &str,
) -> Result<Vec<Value>, &'static str> {
    let no_scaling = data
        .get("no_scaling")
        .and_then(Value::as_array)
        .ok_or("Unknown error occurred")?;
    let with_scaling = data
        .get("with_scaling")
        .and_then(Value::as_array)
        .ok_or("Unknown error occurred")?;

    let mut rows = Vec::with_capacity(no_scaling.len() + with_scaling.len());
    rows.extend(
        no_scaling
            .iter()
            .map(|metric| aurora_statistical_metric_row(metric, workspace_id, true)),
    );
    rows.extend(
        with_scaling
            .iter()
            .map(|metric| aurora_statistical_metric_row(metric, workspace_id, false)),
    );

    Ok(rows)
}

fn aurora_statistical_metric_row(metric: &Value, workspace_id: &str, no_scaling: bool) -> Value {
    let mut row = Map::new();
    row.insert("ws_id".to_owned(), json!(workspace_id));
    copy_field(metric, &mut row, "Model", "model");
    copy_field(metric, &mut row, "RMSE", "rmse");
    copy_field(
        metric,
        &mut row,
        "Directional_Accuracy",
        "directional_accuracy",
    );
    copy_field(
        metric,
        &mut row,
        "Turning_Point_Accuracy",
        "turning_point_accuracy",
    );
    copy_field(metric, &mut row, "Weighted_Score", "weighted_score");
    row.insert("no_scaling".to_owned(), json!(no_scaling));
    Value::Object(row)
}

fn aurora_statistical_forecast_rows(
    data: &Value,
    workspace_id: &str,
) -> Result<Vec<Value>, &'static str> {
    let forecasts = data
        .get("statistical_forecast")
        .and_then(Value::as_array)
        .ok_or("Unknown error occurred")?;

    Ok(forecasts
        .iter()
        .map(|forecast| {
            let mut row = Map::new();
            row.insert("ws_id".to_owned(), json!(workspace_id));
            copy_field(forecast, &mut row, "AutoARIMA", "auto_arima");
            copy_field(forecast, &mut row, "AutoARIMA-lo-90", "auto_arima_lo_90");
            copy_field(forecast, &mut row, "AutoARIMA-hi-90", "auto_arima_hi_90");
            copy_field(forecast, &mut row, "AutoETS", "auto_ets");
            copy_field(forecast, &mut row, "AutoETS-lo-90", "auto_ets_lo_90");
            copy_field(forecast, &mut row, "AutoETS-hi-90", "auto_ets_hi_90");
            copy_field(forecast, &mut row, "AutoTheta", "auto_theta");
            copy_field(forecast, &mut row, "AutoTheta-lo-90", "auto_theta_lo_90");
            copy_field(forecast, &mut row, "AutoTheta-hi-90", "auto_theta_hi_90");
            copy_field(forecast, &mut row, "CES", "ces");
            copy_field(forecast, &mut row, "CES-lo-90", "ces_lo_90");
            copy_field(forecast, &mut row, "CES-hi-90", "ces_hi_90");
            copy_field(forecast, &mut row, "date", "date");
            Value::Object(row)
        })
        .collect())
}

fn aurora_ml_forecast_rows(data: &Value, workspace_id: &str) -> Result<Vec<Value>, &'static str> {
    let forecasts = data
        .get("ml_forecast")
        .and_then(Value::as_array)
        .ok_or("Unknown error occurred")?;

    Ok(forecasts
        .iter()
        .map(|forecast| {
            let mut row = Map::new();
            row.insert("ws_id".to_owned(), json!(workspace_id));
            copy_field(forecast, &mut row, "elasticnet", "elasticnet");
            copy_field(forecast, &mut row, "lightgbm", "lightgbm");
            copy_field(forecast, &mut row, "xgboost", "xgboost");
            copy_field(forecast, &mut row, "catboost", "catboost");
            copy_field(forecast, &mut row, "date", "date");
            Value::Object(row)
        })
        .collect())
}

fn copy_field(source: &Value, row: &mut Map<String, Value>, from: &str, to: &str) {
    if let Some(value) = source.get(from)
        && !value.is_null()
    {
        row.insert(to.to_owned(), value.clone());
    }
}

async fn supabase_insert_json(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    body: &Value,
    access_token: &str,
) -> Result<(), ()> {
    if !contact_data.configured() {
        return Err(());
    }

    let Some(mut url) = contact_data.rest_url(table, &[]) else {
        return Err(());
    };
    if url.ends_with('?') {
        url.pop();
    }
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {access_token}");
    let body = serde_json::to_string(body).map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "return=minimal")
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    (200..300)
        .contains(&response.status)
        .then_some(())
        .ok_or(())
}

async fn authenticated_aurora_health_user(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<supabase_auth::SupabaseAuthUser> {
    let access_token = supabase_auth::request_access_token(request)?;

    supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
}

fn is_legacy_tuturuuu_email(email: Option<&str>) -> bool {
    email.is_some_and(|email| email.ends_with("@tuturuuu.com"))
}

fn aurora_health_url(aurora_external_url: &str) -> Option<String> {
    let base_url = aurora_external_url.trim().trim_end_matches('/');

    (!base_url.is_empty()).then(|| format!("{base_url}/health"))
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

fn aurora_message_response(status: u16, message: &'static str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": message,
        }),
    ))
}

fn aurora_success_with_data_response(data: Value) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "message": "Success",
            "data": data,
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

fn aurora_health_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": HEALTH_ERROR_MESSAGE,
        }),
    ))
}
