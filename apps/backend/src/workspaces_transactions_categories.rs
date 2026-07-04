use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const CREATE_INVOICES_PERMISSION: &str = "create_invoices";
const GET_CATEGORIES_WITH_AMOUNT_RPC: &str = "get_transaction_categories_with_amount_by_workspace";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const TRANSACTION_CATEGORIES_ERROR_MESSAGE: &str = "Error fetching transaction categories";
const TRANSACTION_CATEGORIES_PATH_PREFIX: &str = "/api/workspaces/";
const TRANSACTION_CATEGORIES_PATH_SUFFIX: &str = "/transactions/categories";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";

#[derive(Serialize)]
struct CategoriesWithAmountRpcRequest<'a> {
    p_ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_transactions_categories_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = transaction_categories_ws_id(request.path)?;

    Some(match request.method {
        "GET" => transaction_categories_response(config, request, ws_id, outbound).await,
        // Only GET is migrated here. Every other method (POST, etc.) must fall
        // through to the still-active Next.js route, so return None for them.
        _ => return None,
    })
}

async fn transaction_categories_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route allows access when the caller holds EITHER
    // `view_transactions` OR `create_invoices`, and only returns amounts (via
    // RPC) when `view_transactions` is present. `authorize_finance_permission`
    // enforces a single permission, so we attempt `view_transactions` first and
    // fall back to `create_invoices` to mirror the OR semantics without
    // reimplementing the (private) auth/normalization helpers.
    let (authorization, can_view_transactions) = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => (authorization, true),
        Err(FinanceAuthorizationError::Forbidden) => {
            // Authenticated but lacks `view_transactions`; check the alternate
            // permission. Re-running re-authenticates the same caller.
            match authorize_finance_permission(
                config,
                request,
                raw_ws_id,
                CREATE_INVOICES_PERMISSION,
                outbound,
            )
            .await
            {
                Ok(authorization) => (authorization, false),
                Err(FinanceAuthorizationError::Forbidden) => {
                    return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
                }
                Err(
                    FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound,
                ) => {
                    return message_response(401, UNAUTHORIZED_MESSAGE);
                }
                Err(FinanceAuthorizationError::Internal) => {
                    return error_response();
                }
            }
        }
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => return error_response(),
    };

    let result = if can_view_transactions {
        fetch_categories_with_amount(&config.contact_data, outbound, &authorization).await
    } else {
        fetch_categories_basic(&config.contact_data, outbound, &authorization).await
    };

    match result {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => error_response(),
    }
}

async fn fetch_categories_with_amount(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_CATEGORIES_WITH_AMOUNT_RPC)
        .ok_or(())?;
    // Mirror `.order('name', { ascending: true })` applied to the RPC result.
    let rpc_url = format!("{rpc_url}?order=name.asc");
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );
    let body = serde_json::to_string(&CategoriesWithAmountRpcRequest {
        p_ws_id: &authorization.ws_id,
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

async fn fetch_categories_basic(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
) -> Result<Value, ()> {
    let url = contact_data
        .rest_url(
            "transaction_categories",
            &[
                (
                    "select",
                    "id,name,description,is_expense,icon,color".to_owned(),
                ),
                ("ws_id", format!("eq.{}", authorization.ws_id)),
                ("order", "name.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    // The query mirrors `sbAdmin` (service-role) usage in the legacy route, so
    // the read goes out with the service-role key regardless of caller token.
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization_header = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization_header)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn transaction_categories_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TRANSACTION_CATEGORIES_PATH_PREFIX)?
        .strip_suffix(TRANSACTION_CATEGORIES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, TRANSACTION_CATEGORIES_ERROR_MESSAGE)
}
