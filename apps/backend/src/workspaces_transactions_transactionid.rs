use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const GET_WALLET_TRANSACTIONS_RPC: &str = "get_wallet_transactions_with_permissions";
const PRIVATE_SCHEMA: &str = "private";

const INVALID_IDS_MESSAGE: &str = "Invalid transaction or workspace ID";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const TRANSACTION_NOT_FOUND_MESSAGE: &str = "Transaction not found";
const FETCH_TAGS_ERROR_MESSAGE: &str = "Error fetching transaction tags";

// Static sibling segments under `/transactions/`. In the Next.js App Router
// these static routes take precedence over the dynamic `[transactionId]`
// segment, so the dynamic transaction route never matches them. We exclude them
// here so this handler does not shadow those (separately dispatched) routes.
const STATIC_SIBLING_SEGMENTS: [&str; 8] = [
    "categories",
    "category-breakdown",
    "export",
    "import",
    "infinite",
    "periods",
    "spending-trends",
    "stats",
];

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

// Body for `get_wallet_transactions_with_permissions`. Mirrors the legacy GET
// call which passes only ws id, user id, and the single-element
// `p_transaction_ids` array.
#[derive(Serialize)]
struct WalletTransactionsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
    p_transaction_ids: [&'a str; 1],
}

// Row decoded from the embedded PostgREST tag query. Mirrors
// `enrichTransactionsWithTags`'s `wallet_transaction_tags` select.
#[derive(Deserialize)]
struct WalletTransactionTagRow {
    transaction_id: Option<String>,
    #[serde(default)]
    transaction_tags: Value,
}

pub(crate) async fn handle_workspaces_transactions_transactionid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, transaction_id) = transaction_path(request.path)?;

    // Only the GET method is migrated. PUT/DELETE remain on the still-active
    // Next.js route, so we return None for them (rather than a 405) to let the
    // worker fall through.
    Some(match request.method {
        "GET" => transaction_response(config, request, ws_id, transaction_id, outbound).await,
        _ => return None,
    })
}

async fn transaction_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    transaction_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // `TransactionRouteParamsSchema`: transactionId must be a GUID, wsId a
    // non-empty trimmed string. Invalid -> 400.
    if raw_ws_id.trim().is_empty() || !is_uuid_literal(transaction_id) {
        return message_response(400, INVALID_IDS_MESSAGE);
    }

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

    // verifyTransactionWorkspace: fetch the transaction (public schema) for its
    // wallet_id, then verify the wallet belongs to the normalized workspace
    // (private schema). Any error or a missing row is a 404.
    let wallet_id =
        match fetch_transaction_wallet_id(&config.contact_data, outbound, transaction_id).await {
            Ok(Some(wallet_id)) => wallet_id,
            Ok(None) | Err(()) => return message_response(404, TRANSACTION_NOT_FOUND_MESSAGE),
        };

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

    // Redaction RPC `get_wallet_transactions_with_permissions` run as the caller
    // (mirrors `supabase.rpc`). An error or empty result is a 404.
    let transaction_row = match fetch_transaction_with_permissions(
        &config.contact_data,
        outbound,
        &authorization,
        transaction_id,
    )
    .await
    {
        Ok(Some(row)) => row,
        Ok(None) | Err(()) => return message_response(404, TRANSACTION_NOT_FOUND_MESSAGE),
    };

    // enrichTransactionsWithTags for the single row. A tag-fetch error is a 500.
    let transaction_id_owned = transaction_row
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| transaction_id.to_owned());

    let tags = match enrich_transaction_tags(
        &config.contact_data,
        outbound,
        &transaction_id_owned,
        &authorization.ws_id,
    )
    .await
    {
        Ok(tags) => tags,
        Err(()) => return message_response(500, FETCH_TAGS_ERROR_MESSAGE),
    };

    // Legacy returns `enrichedTransactions?.[0] ?? transactionRow`; enrichment
    // always yields the row with a `tags` array attached, so we attach tags to
    // the row.
    let mut object: Map<String, Value> = match transaction_row {
        Value::Object(map) => map,
        other => {
            // Defensive: a non-object RPC row is returned as-is (matches
            // `?? transactionRow`).
            return no_store_response(json_response(200, other));
        }
    };
    object.insert("tags".to_owned(), Value::Array(tags));

    no_store_response(json_response(200, Value::Object(object)))
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
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

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
        send_service_role_get(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

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

async fn fetch_transaction_with_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    transaction_id: &str,
) -> Result<Option<Value>, ()> {
    let body = serde_json::to_string(&WalletTransactionsRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_user_id: &authorization.user_id,
        p_transaction_ids: [transaction_id],
    })
    .map_err(|_| ())?;

    let response = send_rpc(
        contact_data,
        outbound,
        GET_WALLET_TRANSACTIONS_RPC,
        &body,
        authorization.access_token.as_deref(),
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    // `data[0]`: empty/null payload -> None (404).
    match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => Ok(rows.into_iter().next()),
        Value::Null => Ok(None),
        _ => Err(()),
    }
}

// Mirrors `enrichTransactionsWithTags` for a single transaction id: queries
// `wallet_transaction_tags` with an embedded inner join on `transaction_tags`,
// filtered by the workspace, and collects the related tags. Uses the service
// role (the legacy route runs this through `sbAdmin`).
async fn enrich_transaction_tags(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    transaction_id: &str,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let in_filter = format!("in.({transaction_id})");
    let Some(url) = contact_data.rest_url(
        "wallet_transaction_tags",
        &[
            (
                "select",
                "transaction_id,transaction_tags!inner(id,name,color)".to_owned(),
            ),
            ("transaction_id", in_filter),
            ("transaction_tags.ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<WalletTransactionTagRow>>()
        .map_err(|_| ())?;

    let mut tags: Vec<Value> = Vec::new();
    for row in rows {
        // Only group rows for this transaction id (the query is already filtered
        // to it, but we keep the guard to match the per-id grouping semantics).
        if row.transaction_id.as_deref() != Some(transaction_id) {
            continue;
        }
        tags.extend(normalize_related_tags(&row.transaction_tags));
    }

    Ok(tags)
}

// Mirrors `normalizeRelatedTags`: accepts either a single embedded object or an
// array, keeps entries with string `id`/`name`, and emits `{ id, name, color }`
// with a null color fallback.
fn normalize_related_tags(raw: &Value) -> Vec<Value> {
    let entries: Vec<&Value> = match raw {
        Value::Array(items) => items.iter().collect(),
        Value::Null => Vec::new(),
        other => vec![other],
    };

    entries
        .into_iter()
        .filter_map(|tag| {
            let id = tag.get("id").and_then(Value::as_str)?;
            let name = tag.get("name").and_then(Value::as_str)?;
            let color = tag
                .get("color")
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or(Value::Null);
            Some(json!({ "id": id, "name": name, "color": color }))
        })
        .collect()
}

async fn send_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
    access_token: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let rpc_url = contact_data.rpc_url(function).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let request_authorization = access_token.map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &request_authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

// Local copy of the service-role REST GET helper used across finance handlers
// (e.g. `workspaces_transactions_transactionid_tags::send_service_role_rest_request`).
// Inlined to keep this module self-contained and avoid editing shared files.
// Supports an optional PostgREST schema profile for `private` schema reads.
async fn send_service_role_get(
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

// Matches `/api/workspaces/:wsId/transactions/:transactionId` (5 segments),
// excluding the static sibling routes that take Next.js routing precedence over
// the dynamic `[transactionId]` segment. Returns (wsId, transactionId).
fn transaction_path(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 5
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && segments[3] == "transactions"
        && !segments[2].is_empty()
        && !segments[4].is_empty()
        && !STATIC_SIBLING_SEGMENTS.contains(&segments[4])
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

// Mirrors `z.guid()`: a canonical 8-4-4-4-12 hex UUID literal.
fn is_uuid_literal(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
