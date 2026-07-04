use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const CATEGORY_BREAKDOWN_PATH_PREFIX: &str = "/api/workspaces/";
const CATEGORY_BREAKDOWN_PATH_SUFFIX: &str = "/transactions/category-breakdown";
const GET_CATEGORY_BREAKDOWN_RPC: &str = "get_category_breakdown";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const CATEGORY_BREAKDOWN_ERROR_MESSAGE: &str = "Failed to fetch category breakdown";
const DEFAULT_TRANSACTION_TYPE: &str = "expense";
const DEFAULT_TIMEZONE: &str = "UTC";

#[derive(Debug, Default, Eq, PartialEq)]
struct CategoryBreakdownQuery {
    wallet_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    transaction_type: Option<String>,
    timezone: Option<String>,
}

#[derive(Serialize)]
struct CategoryBreakdownRpcRequest<'a> {
    _ws_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    _start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _end_date: Option<&'a str>,
    include_confidential: bool,
    _transaction_type: &'a str,
    _interval: &'a str,
    _anchor_to_latest: bool,
    _timezone: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    _wallet_ids: Option<Vec<&'a str>>,
}

pub(crate) async fn handle_workspaces_transactions_category_breakdown_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = category_breakdown_ws_id(request.path)?;

    Some(match request.method {
        "GET" => category_breakdown_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn category_breakdown_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = category_breakdown_query_from_url(request.url);

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

    match fetch_category_breakdown(&config.contact_data, outbound, &authorization, &query).await {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => error_response(),
    }
}

async fn fetch_category_breakdown(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &CategoryBreakdownQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(GET_CATEGORY_BREAKDOWN_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );

    let start_date = query
        .start_date
        .as_deref()
        .filter(|value| !value.is_empty());
    let end_date = query.end_date.as_deref().filter(|value| !value.is_empty());
    let transaction_type = query
        .transaction_type
        .as_deref()
        .unwrap_or(DEFAULT_TRANSACTION_TYPE);
    let timezone = query.timezone.as_deref().unwrap_or(DEFAULT_TIMEZONE);
    let wallet_ids = query.wallet_id.as_deref().map(|wallet_id| vec![wallet_id]);

    let body = serde_json::to_string(&CategoryBreakdownRpcRequest {
        _ws_id: &authorization.ws_id,
        _start_date: start_date,
        _end_date: end_date,
        include_confidential: true,
        _transaction_type: transaction_type,
        _interval: "daily",
        _anchor_to_latest: false,
        _timezone: timezone,
        _wallet_ids: wallet_ids,
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

    // Legacy returns `data ?? []`; a null RPC body becomes an empty array.
    response
        .json::<Value>()
        .map(|value| if value.is_null() { json!([]) } else { value })
        .map_err(|_| ())
}

fn category_breakdown_query_from_url(request_url: Option<&str>) -> CategoryBreakdownQuery {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return CategoryBreakdownQuery::default();
    };

    let mut query = CategoryBreakdownQuery::default();

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "walletId" if query.wallet_id.is_none() => {
                query.wallet_id = Some(value.into_owned());
            }
            "startDate" if query.start_date.is_none() => {
                query.start_date = Some(value.into_owned());
            }
            "endDate" if query.end_date.is_none() => {
                query.end_date = Some(value.into_owned());
            }
            "type" if query.transaction_type.is_none() => {
                query.transaction_type = Some(value.into_owned());
            }
            "timezone" if query.timezone.is_none() => {
                query.timezone = Some(value.into_owned());
            }
            _ => {}
        }
    }

    query
}

fn category_breakdown_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(CATEGORY_BREAKDOWN_PATH_PREFIX)?
        .strip_suffix(CATEGORY_BREAKDOWN_PATH_SUFFIX)?;

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
        json!({ "message": CATEGORY_BREAKDOWN_ERROR_MESSAGE }),
    ))
}
