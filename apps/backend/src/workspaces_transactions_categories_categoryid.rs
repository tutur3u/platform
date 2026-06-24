use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments,
};

const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const FETCH_ERROR_MESSAGE: &str = "Error fetching transaction category";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";

pub(crate) async fn handle_workspaces_transactions_categories_categoryid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, category_id) = transaction_category_detail_segments(request.path)?;

    // Only the GET method is migrated. Returning None for every other method
    // lets the Cloudflare worker fall through to the still-active Next.js route
    // (which still owns PUT/DELETE) instead of returning 405.
    Some(match request.method {
        "GET" => {
            transaction_category_detail_response(config, request, ws_id, category_id, outbound)
                .await
        }
        _ => return None,
    })
}

async fn transaction_category_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    category_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy flow: `getFinanceRouteContext` resolves the session user, normalizes
    // the workspace id, and loads permissions. A missing user or unresolvable
    // workspace yields 401 ("Unauthorized"); lacking `view_transactions` yields
    // 403 ("Insufficient permissions").
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
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    // Legacy route reads via `sbAdmin` (service role), filtering by both `id` and
    // the normalized `ws_id`, then `.single()`.
    match fetch_transaction_category(
        &config.contact_data,
        outbound,
        category_id,
        &authorization.ws_id,
    )
    .await
    {
        Ok(row) => no_store_response(json_response(200, row)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_transaction_category(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    category_id: &str,
    ws_id: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "transaction_categories",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{category_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `.single()` in the legacy route errors (mapped to HTTP 500) when the row is
    // absent or not unique, so treat an empty result set as an error too.
    response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .ok_or(())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn transaction_category_detail_segments(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // /api/workspaces/:wsId/transactions/categories/:categoryId
    (segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && !segments[2].is_empty()
        && segments[3] == "transactions"
        && segments[4] == "categories"
        && !segments[5].is_empty())
    .then(|| (segments[2], segments[5]))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
