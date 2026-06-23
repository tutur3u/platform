use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const BUDGET_STATUS_ERROR_MESSAGE: &str = "Error fetching budget status";
const BUDGET_STATUS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const BUDGET_STATUS_PATH_SUFFIX: &str = "/finance/budgets/status";
const GET_BUDGET_STATUS_RPC: &str = "get_budget_status";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";

#[derive(Serialize)]
struct BudgetStatusRpcRequest<'a> {
    _ws_id: &'a str,
}

pub(crate) async fn handle_finance_budget_status_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = budget_status_ws_id(request.path)?;

    Some(match request.method {
        "GET" => budget_status_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn budget_status_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        MANAGE_FINANCE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response();
        }
        Err(FinanceAuthorizationError::Forbidden) => return insufficient_permissions_response(),
        Err(FinanceAuthorizationError::Internal) => return budget_status_error_response(),
    };

    match fetch_budget_status(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => budget_status_error_response(),
    }
}

async fn fetch_budget_status(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(GET_BUDGET_STATUS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&BudgetStatusRpcRequest { _ws_id: ws_id }).map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
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

fn budget_status_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(BUDGET_STATUS_PATH_PREFIX)?
        .strip_suffix(BUDGET_STATUS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn insufficient_permissions_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": "Insufficient permissions" }),
    ))
}

fn budget_status_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": BUDGET_STATUS_ERROR_MESSAGE }),
    ))
}
