//! Handler for `GET /api/v1/workspaces/:wsId/finance/wallets/income/count`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/finance/wallets/income/count/route.ts`.
//!
//! The legacy route exposes two code paths that both call the
//! `get_wallet_income_count` Postgres RPC:
//!   1. an `API_KEY` header path that validates a workspace API key, then calls
//!      the RPC with the caller (so Row Level Security applies); and
//!   2. a session path that calls the RPC with the authenticated user session.
//!
//! The `get_wallet_income_count` RPC is `SECURITY DEFINER` but defaults
//! `p_user_id` to `auth.uid()` and performs all of its permission checks
//! against the *calling* user's identity. To preserve the legacy "respect RLS"
//! semantics we therefore call the RPC with the user's Supabase access token as
//! the `Authorization` bearer (and the service-role key only as the `apikey`),
//! so `auth.uid()` resolves to the real user inside the function.
//!
//! NOTE: `BackendRequest` does not surface the raw `API_KEY` header, so the
//! legacy API-key path cannot be reproduced here. This handler implements the
//! session path (the common case); an unauthenticated request is rejected with
//! `401 Unauthorized`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const INCOME_COUNT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const INCOME_COUNT_PATH_SUFFIX: &str = "/finance/wallets/income/count";
const GET_WALLET_INCOME_COUNT_RPC: &str = "get_wallet_income_count";
const INCOME_COUNT_ERROR_MESSAGE: &str = "Error calculating income count";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_workspaces_finance_wallets_income_count_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = income_count_ws_id(request.path)?;

    Some(match request.method {
        "GET" => income_count_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn income_count_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return error_response();
    }

    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return unauthorized_response();
    };

    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return unauthorized_response();
    };

    match fetch_income_count(&config.contact_data, outbound, ws_id, &access_token).await {
        Ok(count) => no_store_response(json_response(200, count)),
        Err(()) => error_response(),
    }
}

async fn fetch_income_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<i64, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_WALLET_INCOME_COUNT_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let body = json!({ "p_ws_id": ws_id }).to_string();

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

    // The RPC returns a `bigint`. PostgREST serializes a scalar RPC result as a
    // bare JSON number (or `null`). Match the legacy `count ?? 0` fallback.
    let value = response.json::<Value>().map_err(|_| ())?;

    Ok(value.as_i64().unwrap_or(0))
}

fn income_count_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(INCOME_COUNT_PATH_PREFIX)?
        .strip_suffix(INCOME_COUNT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({ "message": UNAUTHORIZED_MESSAGE }),
    ))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": INCOME_COUNT_ERROR_MESSAGE }),
    ))
}
