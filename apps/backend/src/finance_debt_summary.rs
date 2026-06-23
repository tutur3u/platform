use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const DEBT_SUMMARY_ERROR_MESSAGE: &str = "Error fetching debt/loan summary";
const DEBT_SUMMARY_PATH_PREFIX: &str = "/api/v1/workspaces/";
const DEBT_SUMMARY_PATH_SUFFIX: &str = "/finance/debts/summary";
const GET_DEBT_LOAN_SUMMARY_RPC: &str = "get_debt_loan_summary";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";

#[derive(Serialize)]
struct DebtSummaryRpcRequest<'a> {
    _actor_id: &'a str,
    _ws_id: &'a str,
}

pub(crate) async fn handle_finance_debt_summary_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = debt_summary_ws_id(request.path)?;

    Some(match request.method {
        "GET" => debt_summary_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn debt_summary_response(
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
        Err(FinanceAuthorizationError::Internal) => return debt_summary_error_response(),
    };

    match fetch_debt_summary(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
    )
    .await
    {
        Ok(summary) => no_store_response(json_response(200, summary)),
        Err(()) => debt_summary_error_response(),
    }
}

async fn fetch_debt_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_id: &str,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(GET_DEBT_LOAN_SUMMARY_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&DebtSummaryRpcRequest {
        _actor_id: actor_id,
        _ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(rows.into_iter().next().unwrap_or_else(default_debt_summary))
}

fn default_debt_summary() -> Value {
    json!({
        "total_debts": 0,
        "total_loans": 0,
        "active_debt_count": 0,
        "active_loan_count": 0,
        "total_debt_remaining": 0,
        "total_loan_remaining": 0,
        "net_position": 0,
    })
}

fn debt_summary_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(DEBT_SUMMARY_PATH_PREFIX)?
        .strip_suffix(DEBT_SUMMARY_PATH_SUFFIX)?;

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

fn debt_summary_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": DEBT_SUMMARY_ERROR_MESSAGE }),
    ))
}
