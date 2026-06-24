use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const DEBT_DETAIL_ERROR_MESSAGE: &str = "Error fetching debt/loan";
const DEBT_DETAIL_NOT_FOUND_MESSAGE: &str = "Debt/loan not found";
const DEBT_DETAIL_PATH_PREFIX: &str = "/api/v1/workspaces/";
const DEBT_DETAIL_PATH_INFIX: &str = "/finance/debts/";
const GET_DEBT_LOAN_WITH_BALANCE_RPC: &str = "get_debt_loan_with_balance";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";
// `summary` is owned by the sibling `/finance/debts/summary` route handler.
const RESERVED_DEBT_SEGMENT_SUMMARY: &str = "summary";

#[derive(Serialize)]
struct DebtLoanWithBalanceRpcRequest<'a> {
    _actor_id: &'a str,
    _debt_id: &'a str,
    _ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_finance_debts_debtid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, debt_id) = debt_detail_segments(request.path)?;

    // Only the GET method is migrated. Returning None for every other method
    // lets the Cloudflare worker fall through to the still-active Next.js route
    // (which still owns PUT/DELETE) instead of returning 405.
    Some(match request.method {
        "GET" => debt_detail_response(config, request, ws_id, debt_id, outbound).await,
        _ => return None,
    })
}

async fn debt_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    debt_id: &str,
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
        Err(FinanceAuthorizationError::Internal) => return debt_detail_error_response(),
    };

    match fetch_debt_detail(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        debt_id,
    )
    .await
    {
        Ok(Some(debt)) => no_store_response(json_response(200, debt)),
        Ok(None) => not_found_response(),
        Err(()) => debt_detail_error_response(),
    }
}

async fn fetch_debt_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_id: &str,
    debt_id: &str,
) -> Result<Option<Value>, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_DEBT_LOAN_WITH_BALANCE_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&DebtLoanWithBalanceRpcRequest {
        _actor_id: actor_id,
        _debt_id: debt_id,
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

    Ok(rows.into_iter().next())
}

fn debt_detail_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(DEBT_DETAIL_PATH_PREFIX)?;
    let infix_start = rest.find(DEBT_DETAIL_PATH_INFIX)?;
    let ws_id = &rest[..infix_start];
    let debt_id = &rest[infix_start + DEBT_DETAIL_PATH_INFIX.len()..];

    // ws_id must be a single, non-empty segment.
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    // debt_id must be a single, non-empty trailing segment. Reject nested
    // routes (e.g. `/transactions`) and the reserved `summary` sibling.
    if debt_id.is_empty() || debt_id.contains('/') || debt_id == RESERVED_DEBT_SEGMENT_SUMMARY {
        return None;
    }

    Some((ws_id, debt_id))
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

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({ "message": DEBT_DETAIL_NOT_FOUND_MESSAGE }),
    ))
}

fn debt_detail_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": DEBT_DETAIL_ERROR_MESSAGE }),
    ))
}
