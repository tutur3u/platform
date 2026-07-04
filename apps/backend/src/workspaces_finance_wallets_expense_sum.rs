use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const EXPENSE_SUM_PATH_PREFIX: &str = "/api/v1/workspaces/";
const EXPENSE_SUM_PATH_SUFFIX: &str = "/finance/wallets/expense/sum";
const GET_WALLET_EXPENSE_SUM_RPC: &str = "get_wallet_expense_sum";
const EXPENSE_SUM_ERROR_MESSAGE: &str = "Error calculating expense sum";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

#[derive(Serialize)]
struct WalletExpenseSumRpcRequest<'a> {
    p_ws_id: &'a str,
}

/// Handles `GET /api/v1/workspaces/:wsId/finance/wallets/expense/sum`.
///
/// Returns `None` when the request path does not match this route, so the
/// caller can keep dispatching. Otherwise returns `Some(response)`.
pub(crate) async fn handle_workspaces_finance_wallets_expense_sum_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = expense_sum_ws_id(request.path)?;

    Some(match request.method {
        "GET" => expense_sum_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn expense_sum_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // NOTE: the legacy route also supports an `API_KEY` header that selects the
    // workspace-API-key client (`validateWorkspaceApiKey`). `BackendRequest`
    // does not expose arbitrary request headers, so this port implements only
    // the authenticated session path, mirroring `createClient()` + RLS in the
    // legacy `getDataFromSession`. The RPC is invoked with the caller's access
    // token so RLS is enforced exactly like the legacy session client.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_wallet_expense_sum(&config.contact_data, outbound, ws_id, &access_token).await {
        // Legacy returns `sum ?? 0`: a JSON `null` from the RPC becomes `0`.
        Ok(value) if value.is_null() => no_store_response(json_response(200, json!(0))),
        Ok(value) => no_store_response(json_response(200, value)),
        Err(()) => message_response(500, EXPENSE_SUM_ERROR_MESSAGE),
    }
}

async fn fetch_wallet_expense_sum(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(GET_WALLET_EXPENSE_SUM_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let body =
        serde_json::to_string(&WalletExpenseSumRpcRequest { p_ws_id: ws_id }).map_err(|_| ())?;
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

fn expense_sum_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(EXPENSE_SUM_PATH_PREFIX)?
        .strip_suffix(EXPENSE_SUM_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
