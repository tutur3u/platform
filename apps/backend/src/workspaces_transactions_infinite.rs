use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const TRANSACTIONS_INFINITE_PATH_PREFIX: &str = "/api/workspaces/";
const TRANSACTIONS_INFINITE_PATH_SUFFIX: &str = "/transactions/infinite";
const GET_WALLET_TRANSACTIONS_RPC: &str = "get_wallet_transactions_with_permissions";
const GET_ENRICHMENT_RPC: &str = "get_transaction_list_enrichment";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const DEFAULT_LIMIT: i64 = 20;
const FETCH_TRANSACTIONS_ERROR_MESSAGE: &str = "Failed to fetch transactions";

// Parsed query parameters for the infinite-scroll endpoint. Mirrors the legacy
// route's `searchParams` reads exactly (`getAll` for the repeated id filters and
// `get` for the scalar filters).
struct TransactionsInfiniteQuery {
    cursor: Option<String>,
    limit: i64,
    q: Option<String>,
    user_ids: Vec<String>,
    category_ids: Vec<String>,
    wallet_ids: Vec<String>,
    tag_ids: Vec<String>,
    wallet_id: Option<String>,
    transaction_type: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
}

// Body for `get_wallet_transactions_with_permissions`. `None` fields are skipped
// so the RPC receives `undefined`/missing args (matching the legacy
// `... || undefined` pattern), letting Postgres apply its defaults.
#[derive(Serialize)]
struct WalletTransactionsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_wallet_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_category_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_creator_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_tag_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_transaction_type: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_search_query: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_end_date: Option<&'a str>,
    p_order_by: &'a str,
    p_order_direction: &'a str,
    p_limit: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_cursor_taken_at: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_cursor_created_at: Option<&'a str>,
    p_include_count: bool,
}

#[derive(Serialize)]
struct EnrichmentRpcRequest<'a> {
    p_ws_id: &'a str,
    p_transaction_ids: &'a [String],
    p_user_id: &'a str,
}

#[derive(Deserialize)]
struct EnrichmentRow {
    transaction_id: Option<String>,
    #[serde(default)]
    wallet_currency: Option<String>,
    #[serde(default)]
    wallet_icon: Option<String>,
    #[serde(default)]
    wallet_image_src: Option<String>,
    #[serde(default)]
    tags: Option<Value>,
    #[serde(default)]
    transfer: Option<Value>,
}

pub(crate) async fn handle_workspaces_transactions_infinite_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = transactions_infinite_ws_id(request.path)?;

    Some(match request.method {
        "GET" => transactions_infinite_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn transactions_infinite_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = transactions_infinite_query_from_url(request.url);

    // Validate the cursor before doing any work so we can return the legacy 400
    // responses verbatim.
    let (cursor_taken_at, cursor_created_at) = match parse_cursor(query.cursor.as_deref()) {
        Ok(parsed) => parsed,
        Err(message) => return message_response(400, message),
    };

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
            return message_response(401, "Unauthorized");
        }
        // Legacy route returns 403 with the "Unauthorized" message when the
        // caller lacks `view_transactions`.
        Err(FinanceAuthorizationError::Forbidden) => return message_response(403, "Unauthorized"),
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, FETCH_TRANSACTIONS_ERROR_MESSAGE);
        }
    };

    // Combine wallet filters: explicit `walletIds` win, else fall back to the
    // single `walletId`, else leave unset.
    let final_wallet_ids: Option<Vec<String>> = if !query.wallet_ids.is_empty() {
        Some(query.wallet_ids.clone())
    } else {
        query.wallet_id.clone().map(|id| vec![id])
    };

    let rows = match fetch_wallet_transactions(
        &config.contact_data,
        outbound,
        &authorization,
        &query,
        final_wallet_ids.as_deref(),
        cursor_taken_at.as_deref(),
        cursor_created_at.as_deref(),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_TRANSACTIONS_ERROR_MESSAGE),
    };

    // Fetch one extra to detect more pages.
    let has_more = (rows.len() as i64) > query.limit;
    let raw_transactions: Vec<Value> = if has_more {
        rows.into_iter().take(query.limit as usize).collect()
    } else {
        rows
    };

    let transaction_ids: Vec<String> = raw_transactions
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let enrichment = match load_enrichment(
        &config.contact_data,
        outbound,
        &authorization,
        &transaction_ids,
    )
    .await
    {
        Ok(enrichment) => enrichment,
        Err(()) => return message_response(500, FETCH_TRANSACTIONS_ERROR_MESSAGE),
    };

    let transactions: Vec<Value> = raw_transactions
        .iter()
        .map(|row| enrich_transaction(row, &enrichment))
        .collect();

    // Generate next cursor from the last item's taken_at/created_at.
    let next_cursor = if has_more {
        transactions.last().and_then(|last| {
            let taken_at = value_to_cursor_part(last.get("taken_at"));
            let created_at = value_to_cursor_part(last.get("created_at"));
            Some(format!("{taken_at}_{created_at}"))
        })
    } else {
        None
    };

    no_store_response(json_response(
        200,
        json!({
            "data": transactions,
            "nextCursor": next_cursor,
            "hasMore": has_more,
        }),
    ))
}

async fn fetch_wallet_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &TransactionsInfiniteQuery,
    final_wallet_ids: Option<&[String]>,
    cursor_taken_at: Option<&str>,
    cursor_created_at: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let transaction_type = match query.transaction_type.as_deref() {
        Some(value @ ("income" | "expense")) => Some(value),
        _ => None,
    };

    let body = serde_json::to_string(&WalletTransactionsRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_user_id: &authorization.user_id,
        p_wallet_ids: final_wallet_ids,
        p_category_ids: option_slice(&query.category_ids),
        p_creator_ids: option_slice(&query.user_ids),
        p_tag_ids: option_slice(&query.tag_ids),
        p_transaction_type: transaction_type,
        p_search_query: query.q.as_deref(),
        p_start_date: query.start_date.as_deref(),
        p_end_date: query.end_date.as_deref(),
        p_order_by: "taken_at",
        p_order_direction: "DESC",
        p_limit: query.limit + 1,
        p_cursor_taken_at: cursor_taken_at,
        p_cursor_created_at: cursor_created_at,
        p_include_count: false,
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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => Ok(rows),
        Value::Null => Ok(Vec::new()),
        _ => Err(()),
    }
}

// Mirrors `loadTransactionListEnrichment`: returns an empty map when there are
// no transaction ids, and (matching the legacy recoverable-error handling)
// continues without enrichment when the RPC reports a recoverable failure
// rather than surfacing a 500.
async fn load_enrichment(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    transaction_ids: &[String],
) -> Result<Vec<EnrichmentRow>, ()> {
    // De-duplicate non-empty ids, preserving first-seen order.
    let mut unique: Vec<String> = Vec::new();
    for id in transaction_ids {
        if !id.is_empty() && !unique.iter().any(|existing| existing == id) {
            unique.push(id.clone());
        }
    }

    if unique.is_empty() {
        return Ok(Vec::new());
    }

    let body = serde_json::to_string(&EnrichmentRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_transaction_ids: &unique,
        p_user_id: &authorization.user_id,
    })
    .map_err(|_| ())?;

    let response = send_rpc(
        contact_data,
        outbound,
        GET_ENRICHMENT_RPC,
        &body,
        authorization.access_token.as_deref(),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        // Recoverable enrichment failure: continue without enrichment, matching
        // the legacy fallback that returns an empty map instead of throwing.
        return Ok(Vec::new());
    }

    // A non-array payload (or a decode error) is treated as "no enrichment",
    // matching the legacy fallback that returns an empty map.
    Ok(response.json::<Vec<EnrichmentRow>>().unwrap_or_default())
}

async fn send_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
    access_token: Option<&str>,
) -> Result<crate::outbound::OutboundResponse, ()> {
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

// Builds the enriched transaction object, mirroring the legacy spread + rename
// mapping exactly.
fn enrich_transaction(row: &Value, enrichment: &[EnrichmentRow]) -> Value {
    let mut object: Map<String, Value> = match row {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    };

    let id = row.get("id").and_then(Value::as_str);
    let matched = id.and_then(|id| {
        enrichment
            .iter()
            .find(|entry| entry.transaction_id.as_deref() == Some(id))
    });

    // wallet: t.wallet_name
    let wallet_name = object.get("wallet_name").cloned().unwrap_or(Value::Null);
    object.insert("wallet".to_owned(), wallet_name);

    // wallet_currency / wallet_icon / wallet_image_src from enrichment (|| undefined)
    object.insert(
        "wallet_currency".to_owned(),
        matched
            .and_then(|entry| entry.wallet_currency.clone())
            .map_or(Value::Null, Value::String),
    );
    object.insert(
        "wallet_icon".to_owned(),
        matched
            .and_then(|entry| entry.wallet_icon.clone())
            .map_or(Value::Null, Value::String),
    );
    object.insert(
        "wallet_image_src".to_owned(),
        matched
            .and_then(|entry| entry.wallet_image_src.clone())
            .map_or(Value::Null, Value::String),
    );

    // category: t.category_name (category_icon / category_color already on the row)
    let category_name = object.get("category_name").cloned().unwrap_or(Value::Null);
    object.insert("category".to_owned(), category_name);
    let category_icon = object.get("category_icon").cloned().unwrap_or(Value::Null);
    object.insert("category_icon".to_owned(), category_icon);
    let category_color = object.get("category_color").cloned().unwrap_or(Value::Null);
    object.insert("category_color".to_owned(), category_color);

    // user: { full_name, email, avatar_url } from creator_* fields
    let user = json!({
        "full_name": object.get("creator_full_name").cloned().unwrap_or(Value::Null),
        "email": object.get("creator_email").cloned().unwrap_or(Value::Null),
        "avatar_url": object.get("creator_avatar_url").cloned().unwrap_or(Value::Null),
    });
    object.insert("user".to_owned(), user);

    // tags: enrichment tags or []
    let tags = matched
        .and_then(|entry| entry.tags.clone())
        .filter(Value::is_array)
        .unwrap_or_else(|| Value::Array(Vec::new()));
    object.insert("tags".to_owned(), tags);

    // transfer: enrichment transfer (undefined => omit, matching JSON.stringify)
    let transfer = matched
        .and_then(|entry| entry.transfer.clone())
        .filter(|value| !value.is_null());
    if let Some(transfer) = transfer {
        object.insert("transfer".to_owned(), transfer);
    } else {
        // `transfer: undefined` is dropped by JSON.stringify, so omit the key.
        object.remove("transfer");
    }

    Value::Object(object)
}

// Validates the cursor exactly like the legacy route: returns Err(message) for
// the two distinct 400 responses, Ok((None, None)) when no cursor is present,
// and Ok((Some, Some)) for a valid cursor.
fn parse_cursor(cursor: Option<&str>) -> Result<(Option<String>, Option<String>), &'static str> {
    let Some(cursor) = cursor else {
        return Ok((None, None));
    };

    let parts: Vec<&str> = cursor.trim().split('_').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Err("Invalid cursor format");
    }

    let taken_at = parts[0];
    let created_at = parts[1];

    if !is_parseable_date(taken_at) || !is_parseable_date(created_at) {
        return Err("Invalid cursor date format");
    }

    Ok((Some(taken_at.to_owned()), Some(created_at.to_owned())))
}

// Approximates JS `Number.isNaN(new Date(value).getTime())` being false. The
// cursor values are server-generated ISO timestamps, so we accept any string
// that contains a date-like prefix (digits and date separators) and reject
// clearly non-date strings. We deliberately keep this permissive to avoid
// rejecting valid timestamps the legacy `Date` parser would have accepted.
fn is_parseable_date(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }

    // Must start with a digit (year) and contain at least one date separator,
    // mirroring the ISO timestamps emitted by the cursor generator.
    let starts_with_digit = trimmed.chars().next().is_some_and(|c| c.is_ascii_digit());
    let has_separator = trimmed.contains('-') || trimmed.contains(':') || trimmed.contains('T');

    starts_with_digit && has_separator
}

// Mirrors JS template-literal coercion for cursor parts: numbers/strings use
// their natural string form; null/undefined become the empty string segment.
fn value_to_cursor_part(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn option_slice(values: &[String]) -> Option<&[String]> {
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

fn transactions_infinite_query_from_url(request_url: Option<&str>) -> TransactionsInfiniteQuery {
    let mut cursor: Option<String> = None;
    let mut limit: Option<i64> = None;
    let mut q: Option<String> = None;
    let mut user_ids: Vec<String> = Vec::new();
    let mut category_ids: Vec<String> = Vec::new();
    let mut wallet_ids: Vec<String> = Vec::new();
    let mut tag_ids: Vec<String> = Vec::new();
    let mut wallet_id: Option<String> = None;
    let mut transaction_type: Option<String> = None;
    let mut start_date: Option<String> = None;
    let mut end_date: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "cursor" if cursor.is_none() => cursor = Some(value.into_owned()),
                // Mirror Number.parseInt('20', 10) fallback semantics.
                "limit" if limit.is_none() => {
                    limit = Some(value.trim().parse::<i64>().unwrap_or(DEFAULT_LIMIT));
                }
                "q" if q.is_none() => q = Some(value.into_owned()),
                "userIds" => user_ids.push(value.into_owned()),
                "categoryIds" => category_ids.push(value.into_owned()),
                "walletIds" => wallet_ids.push(value.into_owned()),
                "tagIds" => tag_ids.push(value.into_owned()),
                "walletId" if wallet_id.is_none() => wallet_id = Some(value.into_owned()),
                "transactionType" if transaction_type.is_none() => {
                    transaction_type = Some(value.into_owned());
                }
                "start" if start_date.is_none() => start_date = Some(value.into_owned()),
                "end" if end_date.is_none() => end_date = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    TransactionsInfiniteQuery {
        cursor,
        limit: limit.unwrap_or(DEFAULT_LIMIT),
        // The legacy route treats empty `q` as falsy (`q || undefined`); empty
        // string here becomes None at the RPC layer via the `q.as_deref()` read,
        // so normalize empties to None to match `... || undefined`.
        q: q.filter(|value| !value.is_empty()),
        user_ids,
        category_ids,
        wallet_ids,
        tag_ids,
        wallet_id,
        transaction_type,
        // Empty `start`/`end` are falsy in the legacy route (`startDate || undefined`).
        start_date: start_date.filter(|value| !value.is_empty()),
        end_date: end_date.filter(|value| !value.is_empty()),
    }
}

fn transactions_infinite_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TRANSACTIONS_INFINITE_PATH_PREFIX)?
        .strip_suffix(TRANSACTIONS_INFINITE_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
