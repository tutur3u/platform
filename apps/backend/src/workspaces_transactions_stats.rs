use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const TRANSACTIONS_STATS_PATH_PREFIX: &str = "/api/workspaces/";
const TRANSACTIONS_STATS_PATH_SUFFIX: &str = "/transactions/stats";
const GET_TRANSACTION_STATS_RPC: &str = "get_transaction_stats";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";

// Mirrors the zod schema limits in the legacy Next.js route.
const MAX_SEARCH_LENGTH: usize = 500;
const MAX_LONG_TEXT_LENGTH: usize = 10000;
const MAX_COLOR_LENGTH: usize = 50;

const TRANSACTIONS_STATS_ERROR_MESSAGE: &str =
    "Internal server error while fetching transaction stats";
const TRANSACTIONS_STATS_INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";

#[derive(Debug, Default, Eq, PartialEq)]
struct TransactionStatsQuery {
    q: Option<String>,
    user_ids: Vec<String>,
    category_ids: Vec<String>,
    wallet_ids: Vec<String>,
    tag_ids: Vec<String>,
    transaction_type: Option<String>,
    wallet_id: Option<String>,
    start: Option<String>,
    end: Option<String>,
}

#[derive(Serialize)]
struct TransactionStatsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_wallet_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_category_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_creator_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_tag_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_transaction_type: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_search_query: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_end_date: Option<&'a str>,
}

#[derive(Debug, Default, Deserialize)]
struct TransactionStatsRow {
    total_transactions: Option<Value>,
    total_income: Option<Value>,
    total_expense: Option<Value>,
    net_total: Option<Value>,
    has_redacted_amounts: Option<Value>,
}

pub(crate) async fn handle_workspaces_transactions_stats_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = transactions_stats_ws_id(request.path)?;

    Some(match request.method {
        "GET" => transactions_stats_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn transactions_stats_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match transactions_stats_query_from_url(request.url) {
        Some(query) => query,
        None => return invalid_query_response(),
    };

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
        Err(FinanceAuthorizationError::Forbidden) => return forbidden_response(),
        Err(FinanceAuthorizationError::Internal) => return error_response(),
    };

    match fetch_transaction_stats(&config.contact_data, outbound, &authorization, &query).await {
        Ok(stats) => no_store_response(json_response(200, stats)),
        Err(()) => error_response(),
    }
}

async fn fetch_transaction_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &TransactionStatsQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(GET_TRANSACTION_STATS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );

    // Combine wallet filters: walletIds takes precedence, else fall back to walletId.
    let final_wallet_ids: Option<&[String]> = if !query.wallet_ids.is_empty() {
        Some(query.wallet_ids.as_slice())
    } else {
        query.wallet_id.as_ref().map(std::slice::from_ref)
    };

    let body = serde_json::to_string(&TransactionStatsRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_user_id: &authorization.user_id,
        p_wallet_ids: final_wallet_ids,
        p_category_ids: non_empty_slice(&query.category_ids),
        p_creator_ids: non_empty_slice(&query.user_ids),
        p_tag_ids: non_empty_slice(&query.tag_ids),
        p_transaction_type: query.transaction_type.as_deref(),
        p_search_query: query.q.as_deref(),
        p_start_date: query.start.as_deref(),
        p_end_date: query.end.as_deref(),
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

    let row = response
        .json::<Vec<TransactionStatsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .unwrap_or_default();

    Ok(json!({
        "totalTransactions": number_or_zero(row.total_transactions.as_ref()),
        "totalIncome": number_or_zero(row.total_income.as_ref()),
        "totalExpense": number_or_zero(row.total_expense.as_ref()),
        "netTotal": number_or_zero(row.net_total.as_ref()),
        "hasRedactedAmounts": bool_truthy(row.has_redacted_amounts.as_ref()),
    }))
}

fn transactions_stats_query_from_url(request_url: Option<&str>) -> Option<TransactionStatsQuery> {
    // No URL still yields an all-defaults query (every filter optional).
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return Some(TransactionStatsQuery::default());
    };

    let mut query = TransactionStatsQuery::default();

    for (key, value) in url.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "q" if query.q.is_none() => query.q = Some(value),
            "userIds" => query.user_ids.push(value),
            "categoryIds" => query.category_ids.push(value),
            "walletIds" => query.wallet_ids.push(value),
            "tagIds" => query.tag_ids.push(value),
            "transactionType" if query.transaction_type.is_none() => {
                query.transaction_type = Some(value);
            }
            "walletId" if query.wallet_id.is_none() => query.wallet_id = Some(value),
            "start" if query.start.is_none() => query.start = Some(value),
            "end" if query.end.is_none() => query.end = Some(value),
            _ => {}
        }
    }

    // Validate against the legacy zod schema constraints.
    if query
        .q
        .as_ref()
        .is_some_and(|value| value.len() > MAX_SEARCH_LENGTH)
    {
        return None;
    }
    if query
        .wallet_id
        .as_ref()
        .is_some_and(|value| value.len() > MAX_LONG_TEXT_LENGTH)
    {
        return None;
    }
    if query
        .start
        .as_ref()
        .is_some_and(|value| value.len() > MAX_COLOR_LENGTH)
    {
        return None;
    }
    if query
        .end
        .as_ref()
        .is_some_and(|value| value.len() > MAX_COLOR_LENGTH)
    {
        return None;
    }
    if let Some(transaction_type) = query.transaction_type.as_deref()
        && transaction_type != "income"
        && transaction_type != "expense"
    {
        return None;
    }

    Some(query)
}

fn transactions_stats_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TRANSACTIONS_STATS_PATH_PREFIX)?
        .strip_suffix(TRANSACTIONS_STATS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn non_empty_slice(values: &[String]) -> Option<&[String]> {
    (!values.is_empty()).then_some(values)
}

fn number_or_zero(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number.clone()),
        Some(Value::String(text)) => text
            .trim()
            .parse::<f64>()
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or_else(|| json!(0)),
        Some(Value::Bool(true)) => json!(1),
        _ => json!(0),
    }
}

fn bool_truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(boolean)) => *boolean,
        Some(Value::String(text)) => !text.is_empty() && text != "false",
        Some(Value::Number(number)) => number.as_f64().map(|value| value != 0.0).unwrap_or(false),
        _ => false,
    }
}

fn invalid_query_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "message": TRANSACTIONS_STATS_INVALID_QUERY_MESSAGE }),
    ))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "message": "Forbidden" })))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": TRANSACTIONS_STATS_ERROR_MESSAGE }),
    ))
}
