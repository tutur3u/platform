use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const TAG_STATS_ERROR_MESSAGE: &str = "Error fetching tag stats";
const TAG_STATS_PATH_PREFIX: &str = "/api/workspaces/";
const TAG_STATS_PATH_SUFFIX: &str = "/tags/stats";
const GET_TRANSACTION_TAG_STATS_RPC: &str = "get_transaction_tag_stats";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";

#[derive(Serialize)]
struct TransactionTagStatsRpcRequest<'a> {
    _actor_id: &'a str,
    _ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_tags_stats_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = tag_stats_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tag_stats_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tag_stats_response(
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
        Err(FinanceAuthorizationError::Internal) => return tag_stats_error_response(),
    };

    match fetch_tag_stats(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
    )
    .await
    {
        Ok(stats) => no_store_response(json_response(200, stats)),
        Err(()) => tag_stats_error_response(),
    }
}

async fn fetch_tag_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_id: &str,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_TRANSACTION_TAG_STATS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&TransactionTagStatsRpcRequest {
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

    // The RPC returns a JSON array of tag-stat rows. The legacy route responds
    // with `data ?? []`, so fall back to an empty array when the body is null.
    match response.json::<Value>() {
        Ok(Value::Null) => Ok(json!([])),
        Ok(value @ Value::Array(_)) => Ok(value),
        // Any other shape is unexpected for a set-returning RPC; surface as an
        // error to mirror the legacy `error` branch rather than leaking it.
        Ok(_) => Err(()),
        Err(_) => Err(()),
    }
}

fn tag_stats_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TAG_STATS_PATH_PREFIX)?
        .strip_suffix(TAG_STATS_PATH_SUFFIX)?;

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

fn tag_stats_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": TAG_STATS_ERROR_MESSAGE }),
    ))
}
