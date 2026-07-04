use serde::Serialize;
use serde_json::{Number, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const BALANCE_CHART_ERROR_MESSAGE: &str = "Internal server error while fetching balance";
const BALANCE_CHART_INVALID_QUERY_MESSAGE: &str = "Invalid query parameters. \"date\" is required.";
const BALANCE_CHART_PATH_PREFIX: &str = "/api/workspaces/";
const BALANCE_CHART_PATH_SUFFIX: &str = "/finance/charts/balance";
const GET_WALLET_BALANCE_AT_DATE_RPC: &str = "get_wallet_balance_at_date";
const MAX_COLOR_LENGTH: usize = 50;
const VIEW_FINANCE_STATS_PERMISSION: &str = "view_finance_stats";

#[derive(Debug, Eq, PartialEq)]
struct BalanceChartQuery {
    date: String,
    include_confidential: bool,
}

#[derive(Serialize)]
struct BalanceChartRpcRequest<'a> {
    _target_date: &'a str,
    _ws_id: &'a str,
    include_confidential: bool,
}

pub(crate) async fn handle_finance_chart_balance_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = balance_chart_ws_id(request.path)?;

    Some(match request.method {
        "GET" => balance_chart_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn balance_chart_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match balance_chart_query_from_url(request.url) {
        Some(query) => query,
        None => return invalid_query_response(),
    };
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_FINANCE_STATS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response();
        }
        Err(FinanceAuthorizationError::Forbidden) => return forbidden_response(),
        Err(FinanceAuthorizationError::Internal) => return balance_chart_error_response(),
    };

    match fetch_balance_chart(&config.contact_data, outbound, &authorization, &query).await {
        Ok(balance) => no_store_response(json_response(
            200,
            json!({
                "balance": balance,
                "date": query.date,
            }),
        )),
        Err(()) => balance_chart_error_response(),
    }
}

async fn fetch_balance_chart(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &BalanceChartQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_WALLET_BALANCE_AT_DATE_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );
    let body = serde_json::to_string(&BalanceChartRpcRequest {
        _target_date: &query.date,
        _ws_id: &authorization.ws_id,
        include_confidential: query.include_confidential,
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

    response
        .json::<Value>()
        .map(balance_value_or_zero)
        .map_err(|_| ())
}

fn balance_chart_query_from_url(request_url: Option<&str>) -> Option<BalanceChartQuery> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    let mut date = None;
    let mut include_confidential = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "date" if date.is_none() => date = Some(value.into_owned()),
            "includeConfidential" if include_confidential.is_none() => {
                include_confidential = match value.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => return None,
                };
            }
            _ => {}
        }
    }

    let date = date?;
    if date.len() > MAX_COLOR_LENGTH {
        return None;
    }

    Some(BalanceChartQuery {
        date,
        include_confidential: include_confidential.unwrap_or(true),
    })
}

fn balance_chart_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(BALANCE_CHART_PATH_PREFIX)?
        .strip_suffix(BALANCE_CHART_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn balance_value_or_zero(value: Value) -> Value {
    match value {
        Value::Number(_) => value,
        Value::String(value) => value
            .trim()
            .parse::<f64>()
            .ok()
            .and_then(Number::from_f64)
            .map(Value::Number)
            .unwrap_or_else(|| json!(0)),
        _ => json!(0),
    }
}

fn invalid_query_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "message": BALANCE_CHART_INVALID_QUERY_MESSAGE }),
    ))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "message": "Forbidden" })))
}

fn balance_chart_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": BALANCE_CHART_ERROR_MESSAGE }),
    ))
}
