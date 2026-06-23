use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const DEFAULT_DAYS_AHEAD: i64 = 30;
const GET_UPCOMING_RECURRING_TRANSACTIONS_RPC: &str = "get_upcoming_recurring_transactions";
const RECURRING_UPCOMING_ERROR_MESSAGE: &str = "Failed to fetch upcoming recurring transactions";
const RECURRING_UPCOMING_PATH_PREFIX: &str = "/api/v1/workspaces/";
const RECURRING_UPCOMING_PATH_SUFFIX: &str = "/finance/recurring-transactions/upcoming";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";

#[derive(Serialize)]
struct UpcomingRecurringTransactionsRpcRequest<'a> {
    _ws_id: &'a str,
    days_ahead: i64,
}

pub(crate) async fn handle_finance_recurring_transactions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = recurring_upcoming_ws_id(request.path)?;

    Some(match request.method {
        "GET" => recurring_upcoming_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn recurring_upcoming_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let days_ahead = days_ahead_from_url(request.url);
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
            return unauthorized_response(401);
        }
        Err(FinanceAuthorizationError::Forbidden) => return unauthorized_response(403),
        Err(FinanceAuthorizationError::Internal) => return recurring_upcoming_error_response(),
    };

    match fetch_upcoming_recurring_transactions(
        &config.contact_data,
        outbound,
        &authorization,
        days_ahead,
    )
    .await
    {
        Ok(rows) => no_store_response(json_response(200, json!({ "upcomingTransactions": rows }))),
        Err(()) => recurring_upcoming_error_response(),
    }
}

async fn fetch_upcoming_recurring_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    days_ahead: i64,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_UPCOMING_RECURRING_TRANSACTIONS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );
    let body = serde_json::to_string(&UpcomingRecurringTransactionsRpcRequest {
        _ws_id: &authorization.ws_id,
        days_ahead,
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

    response.json::<Value>().map_err(|_| ())
}

fn days_ahead_from_url(request_url: Option<&str>) -> i64 {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return DEFAULT_DAYS_AHEAD;
    };
    let Some(value) = url
        .query_pairs()
        .find(|(key, _)| key == "daysAhead")
        .map(|(_, value)| value.into_owned())
    else {
        return DEFAULT_DAYS_AHEAD;
    };

    parse_js_parse_int_base10(&value).unwrap_or(DEFAULT_DAYS_AHEAD)
}

fn parse_js_parse_int_base10(value: &str) -> Option<i64> {
    let value = value.trim_start();
    let mut index = 0;
    let bytes = value.as_bytes();
    let negative = match bytes.first() {
        Some(b'-') => {
            index = 1;
            true
        }
        Some(b'+') => {
            index = 1;
            false
        }
        _ => false,
    };
    let digit_start = index;

    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index == digit_start {
        return None;
    }

    let parsed = value[digit_start..index].parse::<i64>().ok()?;

    if negative {
        parsed.checked_neg()
    } else {
        Some(parsed)
    }
}

fn recurring_upcoming_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(RECURRING_UPCOMING_PATH_PREFIX)?
        .strip_suffix(RECURRING_UPCOMING_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response(status: u16) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": "Unauthorized" })))
}

fn recurring_upcoming_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": RECURRING_UPCOMING_ERROR_MESSAGE }),
    ))
}
