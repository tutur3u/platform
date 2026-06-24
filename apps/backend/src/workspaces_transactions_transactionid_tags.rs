use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const TRANSACTION_NOT_FOUND_MESSAGE: &str = "Transaction not found";
const FETCH_TAGS_ERROR_MESSAGE: &str = "Error fetching transaction tags";

#[derive(Deserialize)]
struct WalletTransactionRow {
    #[allow(dead_code)]
    id: Option<String>,
    wallet_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceWalletRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct TransactionTagRow {
    tag_id: Option<Value>,
}

#[derive(Serialize)]
struct TransactionTag {
    tag_id: Value,
}

pub(crate) async fn handle_workspaces_transactions_transactionid_tags_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, transaction_id) = transaction_tags_path(request.path)?;

    Some(match request.method {
        "GET" => transaction_tags_response(config, request, ws_id, transaction_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn transaction_tags_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    transaction_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
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
        // `getFinanceRouteContext` returns 401 "Unauthorized" both when the
        // caller is unauthenticated and when `getPermissions` can't resolve the
        // workspace (NotFound), so both map to 401 here.
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        // Legacy responds 403 "Insufficient permissions" when the caller lacks
        // `view_transactions`.
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, FETCH_TAGS_ERROR_MESSAGE);
        }
    };

    // Look up the transaction (public schema) to obtain its wallet_id. The
    // legacy route treats any error or a missing row as a 404.
    let wallet_id =
        match fetch_transaction_wallet_id(&config.contact_data, outbound, transaction_id).await {
            Ok(Some(wallet_id)) => wallet_id,
            Ok(None) => return message_response(404, TRANSACTION_NOT_FOUND_MESSAGE),
            Err(()) => return message_response(404, TRANSACTION_NOT_FOUND_MESSAGE),
        };

    // Verify the wallet belongs to the normalized workspace (private schema).
    // Any error or a missing row is also a 404 in the legacy route.
    match wallet_belongs_to_workspace(
        &config.contact_data,
        outbound,
        &wallet_id,
        &authorization.ws_id,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) | Err(()) => return message_response(404, TRANSACTION_NOT_FOUND_MESSAGE),
    }

    // Fetch the transaction tags. A REST error here is a 500.
    match fetch_transaction_tags(&config.contact_data, outbound, transaction_id).await {
        Ok(tags) => no_store_response(json_response(200, tags)),
        Err(()) => message_response(500, FETCH_TAGS_ERROR_MESSAGE),
    }
}

async fn fetch_transaction_wallet_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    transaction_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "wallet_transactions",
        &[
            ("select", "id,wallet_id".to_owned()),
            ("id", format!("eq.{transaction_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WalletTransactionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.wallet_id))
}

async fn wallet_belongs_to_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_wallets",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{wallet_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_service_role_rest_request(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceWalletRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .is_some())
}

async fn fetch_transaction_tags(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    transaction_id: &str,
) -> Result<Vec<TransactionTag>, ()> {
    let Some(url) = contact_data.rest_url(
        "wallet_transaction_tags",
        &[
            ("select", "tag_id".to_owned()),
            ("transaction_id", format!("eq.{transaction_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TransactionTagRow>>()
        .map_err(|_| ())?
        .into_iter()
        .map(|row| TransactionTag {
            tag_id: row.tag_id.unwrap_or(Value::Null),
        })
        .collect())
}

// Local copy of the service-role REST GET helper used across finance handlers
// (e.g. `workspace_habits_access::send_service_role_rest_request`). Inlined to
// keep this module self-contained and avoid editing shared files. Supports an
// optional PostgREST schema profile for `private` schema reads.
async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(schema) = schema {
        outbound_request = outbound_request.with_header("Accept-Profile", schema);
    }

    outbound.send(outbound_request).await.map_err(|_| ())
}

fn transaction_tags_path(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && segments[3] == "transactions"
        && segments[5] == "tags"
        && !segments[2].is_empty()
        && !segments[4].is_empty()
    {
        Some((segments[2], segments[4]))
    } else {
        None
    }
}

// Local copy of `lib.rs::path_segments` to keep this module self-contained.
fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
