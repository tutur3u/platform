use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const DEBTS_ERROR_MESSAGE: &str = "Error fetching debt/loans";
const DEBTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const DEBTS_PATH_SUFFIX: &str = "/finance/debts";
const GET_DEBT_LOANS_WITH_BALANCE_RPC: &str = "get_debt_loans_with_balance";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";

/// Mirrors the RPC arguments for `private.get_debt_loans_with_balance`.
///
/// The legacy route passes `statusParam ?? undefined` / `typeParam ?? undefined`,
/// which means: when the query parameter is absent (`searchParams.get` returns
/// `null`), the key is omitted from the JSON body so PostgREST uses the SQL
/// `default null`. When the query parameter is present (even as an empty
/// string), the raw value is forwarded. We reproduce that by only populating the
/// optional fields when the query key exists, and skip-serializing the `None`
/// case so the keys disappear from the request body entirely.
#[derive(Serialize)]
struct DebtLoansRpcRequest<'a> {
    _actor_id: &'a str,
    _ws_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    _status: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _type: Option<&'a str>,
}

struct DebtLoansFilters {
    status: Option<String>,
    type_: Option<String>,
}

pub(crate) async fn handle_workspaces_finance_debts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = debts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => debts_response(config, request, ws_id, outbound).await,
        // The legacy route also defines POST (and may grow other mutations).
        // Those are NOT migrated yet, so fall through to the still-active
        // Next.js route instead of 405-ing a valid mutation.
        _ => return None,
    })
}

async fn debts_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let filters = debts_filters_from_url(request.url);

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
        Err(FinanceAuthorizationError::Internal) => return debts_error_response(),
    };

    match fetch_debt_loans(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        &filters,
    )
    .await
    {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => debts_error_response(),
    }
}

async fn fetch_debt_loans(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_id: &str,
    filters: &DebtLoansFilters,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_DEBT_LOANS_WITH_BALANCE_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&DebtLoansRpcRequest {
        _actor_id: actor_id,
        _ws_id: ws_id,
        _status: filters.status.as_deref(),
        _type: filters.type_.as_deref(),
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

    // The legacy route returns `data as DebtLoanWithBalance[]` verbatim, so we
    // forward the RPC's JSON array response unchanged.
    response.json::<Value>().map_err(|_| ())
}

fn debts_filters_from_url(request_url: Option<&str>) -> DebtLoansFilters {
    let mut status: Option<String> = None;
    let mut type_: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                // Mirror `searchParams.get('status')`: first occurrence wins and
                // an empty value is still a present (non-null) value.
                "status" if status.is_none() => status = Some(value.into_owned()),
                "type" if type_.is_none() => type_ = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    DebtLoansFilters { status, type_ }
}

fn debts_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(DEBTS_PATH_PREFIX)?
        .strip_suffix(DEBTS_PATH_SUFFIX)?;

    // Reject empty and any deeper segment (e.g. `/finance/debts/summary` or
    // `/finance/debts/<id>`) so this handler only claims the exact collection
    // path and returns None for siblings, letting their own handlers run.
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

fn debts_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": DEBTS_ERROR_MESSAGE }),
    ))
}
