use serde::{Deserialize, Serialize};
use serde_json::{Number, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const SPENDING_TRENDS_PATH_PREFIX: &str = "/api/workspaces/";
const SPENDING_TRENDS_PATH_SUFFIX: &str = "/transactions/spending-trends";
const GET_SPENDING_TRENDS_RPC: &str = "get_spending_trends";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const SPENDING_TRENDS_ERROR_MESSAGE: &str = "Failed to fetch spending trends";
const DEFAULT_DAYS: i64 = 30;
const MIN_DAYS: i64 = 1;
const MAX_DAYS: i64 = 366;
const DEFAULT_TIMEZONE: &str = "UTC";

struct SpendingTrendsQuery {
    days: i64,
    timezone: String,
}

#[derive(Serialize)]
struct SpendingTrendsRpcRequest<'a> {
    _ws_id: &'a str,
    _days: i64,
    _timezone: &'a str,
}

#[derive(Deserialize)]
struct SpendingTrendPoint {
    date: Option<Value>,
    amount: Option<Value>,
}

pub(crate) async fn handle_workspaces_transactions_spending_trends_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = spending_trends_ws_id(request.path)?;

    Some(match request.method {
        "GET" => spending_trends_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn spending_trends_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = spending_trends_query_from_url(request.url);

    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response();
        }
        // Legacy route responds 403 with the "Unauthorized" message when the
        // caller lacks `view_transactions`, so mirror that exactly.
        Err(FinanceAuthorizationError::Forbidden) => return forbidden_response(),
        Err(FinanceAuthorizationError::Internal) => return error_response(),
    };

    match fetch_spending_trends(&config.contact_data, outbound, &authorization, &query).await {
        Ok(points) => no_store_response(json_response(200, Value::Array(points))),
        Err(()) => error_response(),
    }
}

async fn fetch_spending_trends(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &SpendingTrendsQuery,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url(GET_SPENDING_TRENDS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );
    let body = serde_json::to_string(&SpendingTrendsRpcRequest {
        _ws_id: &authorization.ws_id,
        _days: query.days,
        _timezone: &query.timezone,
    })
    .map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &request_authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let points = response.json::<Vec<SpendingTrendPoint>>().map_err(|_| ())?;

    Ok(points
        .into_iter()
        .map(|point| {
            json!({
                "date": point.date.unwrap_or(Value::Null),
                "amount": amount_value_or_zero(point.amount),
            })
        })
        .collect())
}

fn spending_trends_query_from_url(request_url: Option<&str>) -> SpendingTrendsQuery {
    let mut days: Option<i64> = None;
    let mut timezone: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "days" if days.is_none() => {
                    // Mirror Number.parseInt semantics: NaN falls back to the
                    // default, then the result is clamped into [1, 366].
                    days = Some(value.trim().parse::<i64>().unwrap_or(DEFAULT_DAYS));
                }
                "timezone" if timezone.is_none() => {
                    timezone = Some(value.into_owned());
                }
                _ => {}
            }
        }
    }

    let days = days.unwrap_or(DEFAULT_DAYS).clamp(MIN_DAYS, MAX_DAYS);

    SpendingTrendsQuery {
        days,
        timezone: timezone.unwrap_or_else(|| DEFAULT_TIMEZONE.to_owned()),
    }
}

fn amount_value_or_zero(value: Option<Value>) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number),
        Some(Value::String(value)) => value
            .trim()
            .parse::<f64>()
            .ok()
            .and_then(Number::from_f64)
            .map(Value::Number)
            .unwrap_or_else(|| json!(0)),
        _ => json!(0),
    }
}

fn spending_trends_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(SPENDING_TRENDS_PATH_PREFIX)?
        .strip_suffix(SPENDING_TRENDS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "message": "Unauthorized" })))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": SPENDING_TRENDS_ERROR_MESSAGE }),
    ))
}
