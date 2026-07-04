use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const TRANSACTIONS_PATH_PREFIX: &str = "/api/workspaces/";
const TRANSACTIONS_PATH_SUFFIX: &str = "/transactions";
const GET_WALLET_TRANSACTIONS_RPC: &str = "get_wallet_transactions_with_permissions";
const DEFAULT_ITEMS_PER_PAGE: i64 = 25;
const DEFAULT_PAGE: i64 = 1;
const FETCH_TRANSACTIONS_ERROR_MESSAGE: &str = "Error fetching transactions";
const FETCH_TRANSACTION_TAGS_ERROR_MESSAGE: &str = "Error fetching transaction tags";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

// Legacy route grants access when the caller holds ANY of these permissions
// (`hasAnyFinancePermission([...])`).
const VIEW_PERMISSIONS: [&str; 3] = ["view_transactions", "view_expenses", "view_incomes"];

// Body for `get_wallet_transactions_with_permissions`. Mirrors the legacy GET
// call: it only passes ws id, user id, limit, offset, and (conditionally)
// include count. `p_transaction_ids` is `undefined` in the legacy route, so we
// omit it; the `||  undefined` pattern on include count is mirrored by only
// serializing `p_include_count` when it is `true`.
#[derive(Serialize)]
struct WalletTransactionsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
    p_limit: i64,
    p_offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_include_count: Option<bool>,
}

// Row decoded from the embedded PostgREST tag query. Mirrors
// `enrichTransactionsWithTags`'s `wallet_transaction_tags` select.
#[derive(Deserialize)]
struct WalletTransactionTagRow {
    transaction_id: Option<String>,
    #[serde(default)]
    transaction_tags: Value,
}

pub(crate) async fn handle_workspaces_transactions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = transactions_ws_id(request.path)?;

    // Only the GET method is migrated. Every other method must fall through to
    // the still-active Next.js route (e.g. POST creating a transaction), so we
    // return None for them instead of a 405.
    Some(match request.method {
        "GET" => transactions_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn transactions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Parse pagination + count flags up front (matches the legacy `searchParams`
    // reads).
    let query = transactions_query_from_url(request.url);

    let authorization =
        match authorize_any_view_permission(config, request, raw_ws_id, outbound).await {
            Ok(authorization) => authorization,
            Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
                return message_response(401, UNAUTHORIZED_MESSAGE);
            }
            Err(FinanceAuthorizationError::Forbidden) => {
                return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
            }
            Err(FinanceAuthorizationError::Internal) => {
                return message_response(500, FETCH_TRANSACTIONS_ERROR_MESSAGE);
            }
        };

    let offset = (query.page - 1) * query.items_per_page;

    let rows = match fetch_wallet_transactions(
        &config.contact_data,
        outbound,
        &authorization,
        query.items_per_page,
        offset,
        query.include_count,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_TRANSACTIONS_ERROR_MESSAGE),
    };

    // The legacy route sorts the returned page by `taken_at` descending. This
    // only sorts the current page of results, preserving existing behavior.
    let mut sorted = rows;
    sort_by_taken_at_desc(&mut sorted);

    let transaction_ids: Vec<String> = sorted
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let tags_by_id = match enrich_transactions_with_tags(
        &config.contact_data,
        outbound,
        &transaction_ids,
        &authorization.ws_id,
    )
    .await
    {
        Ok(tags) => tags,
        Err(()) => return message_response(500, FETCH_TRANSACTION_TAGS_ERROR_MESSAGE),
    };

    let normalized: Vec<Value> = sorted
        .iter()
        .map(|row| normalize_transaction_list_row(row, &tags_by_id))
        .collect();

    if !query.include_count {
        return no_store_response(json_response(200, Value::Array(normalized)));
    }

    // total_count comes from the first row of the sorted (page) data, matching
    // `sortedData[0]?.total_count ?? 0`.
    let total = sorted
        .first()
        .and_then(|row| row.get("total_count"))
        .and_then(value_to_i64)
        .unwrap_or(0);
    let total = total.max(0);

    let page_count = if total <= 0 {
        1
    } else {
        // Math.max(1, Math.ceil(total / itemsPerPage))
        ((total + query.items_per_page - 1) / query.items_per_page).max(1)
    };

    no_store_response(json_response(
        200,
        json!({
            "count": total,
            "data": normalized,
            "pagination": {
                "hasNextPage": offset + query.items_per_page < total,
                "hasPreviousPage": offset > 0,
                "limit": query.items_per_page,
                "offset": offset,
                "page": query.page,
                "pageCount": page_count,
                "pageSize": query.items_per_page,
                "total": total,
            },
        }),
    ))
}

// Mirrors `hasAnyFinancePermission(permissions, ['view_transactions',
// 'view_expenses', 'view_incomes'])`. `authorize_finance_permission` checks a
// single permission, so we try each in turn: the first that grants access wins.
// `Forbidden` means "this permission is missing" -> try the next. Any other
// error (Unauthorized/NotFound/Internal) short-circuits immediately, matching
// the shared auth/normalization failure semantics. If all three are missing the
// result is `Forbidden`.
async fn authorize_any_view_permission(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<FinanceAuthorization, FinanceAuthorizationError> {
    let mut last_forbidden = FinanceAuthorizationError::Forbidden;

    for permission in VIEW_PERMISSIONS {
        match authorize_finance_permission(config, request, raw_ws_id, permission, outbound).await {
            Ok(authorization) => return Ok(authorization),
            Err(FinanceAuthorizationError::Forbidden) => {
                last_forbidden = FinanceAuthorizationError::Forbidden;
            }
            Err(other) => return Err(other),
        }
    }

    Err(last_forbidden)
}

async fn fetch_wallet_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    items_per_page: i64,
    offset: i64,
    include_count: bool,
) -> Result<Vec<Value>, ()> {
    let body = serde_json::to_string(&WalletTransactionsRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_user_id: &authorization.user_id,
        p_limit: items_per_page,
        p_offset: offset,
        // Legacy passes `includeCount || undefined`, so only send `true`.
        p_include_count: include_count.then_some(true),
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

    // `data ?? []` -> null payload is an empty list.
    match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => Ok(rows),
        Value::Null => Ok(Vec::new()),
        _ => Err(()),
    }
}

// Mirrors `enrichTransactionsWithTags`: queries `wallet_transaction_tags` with
// an embedded inner join on `transaction_tags`, filtered by the workspace, and
// groups the related tags by transaction id. Uses the service role (the legacy
// route runs this through `sbAdmin`).
async fn enrich_transactions_with_tags(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    transaction_ids: &[String],
    ws_id: &str,
) -> Result<Vec<(String, Vec<Value>)>, ()> {
    // De-duplicate ids, preserving first-seen order (`[...new Set(...)]`).
    let mut unique: Vec<String> = Vec::new();
    for id in transaction_ids {
        if !unique.iter().any(|existing| existing == id) {
            unique.push(id.clone());
        }
    }

    if unique.is_empty() {
        return Ok(Vec::new());
    }

    // PostgREST `in.(...)` filter list.
    let in_filter = format!("in.({})", unique.join(","));
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

    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        // The legacy route surfaces this as a 500 (`Error fetching transaction
        // tags`).
        return Err(());
    }

    let rows = response
        .json::<Vec<WalletTransactionTagRow>>()
        .map_err(|_| ())?;

    let mut grouped: Vec<(String, Vec<Value>)> = Vec::new();
    for row in rows {
        let Some(transaction_id) = row.transaction_id else {
            continue;
        };
        let related = normalize_related_tags(&row.transaction_tags);
        if related.is_empty() {
            continue;
        }

        if let Some(entry) = grouped.iter_mut().find(|(id, _)| id == &transaction_id) {
            entry.1.extend(related);
        } else {
            grouped.push((transaction_id, related));
        }
    }

    Ok(grouped)
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

// Mirrors `normalizeTransactionListRow`: spreads the raw row, derives
// `category`/`category_color`/`category_icon`, builds `user` from `creator_*`
// fields when present, derives `wallet`, and attaches the enriched `tags`.
fn normalize_transaction_list_row(row: &Value, tags_by_id: &[(String, Vec<Value>)]) -> Value {
    let mut object: Map<String, Value> = match row {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    };

    // tags: spread happens before the explicit field assignments in the legacy
    // route, but `enrichTransactionsWithTags` adds `tags` to the object, so the
    // final object always carries the enriched tags array.
    let tags = row
        .get("id")
        .and_then(Value::as_str)
        .and_then(|id| tags_by_id.iter().find(|(tag_id, _)| tag_id == id))
        .map(|(_, tags)| Value::Array(tags.clone()))
        .unwrap_or_else(|| Value::Array(Vec::new()));
    object.insert("tags".to_owned(), tags);

    // category: transaction.category ?? transaction.category_name ?? null
    let category = first_non_null(&[object.get("category"), object.get("category_name")]);
    object.insert("category".to_owned(), category);

    // category_color / category_icon: ?? null
    let category_color = object
        .get("category_color")
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(Value::Null);
    object.insert("category_color".to_owned(), category_color);
    let category_icon = object
        .get("category_icon")
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(Value::Null);
    object.insert("category_icon".to_owned(), category_icon);

    // user: transaction.user ?? (hasCreator ? { avatar_url, email, full_name } : undefined)
    let existing_user = object.get("user").filter(|value| !value.is_null()).cloned();
    match existing_user {
        Some(user) => {
            object.insert("user".to_owned(), user);
        }
        None => {
            let full_name = object.get("creator_full_name").cloned();
            let email = object.get("creator_email").cloned();
            let avatar_url = object.get("creator_avatar_url").cloned();
            let has_creator = is_truthy(full_name.as_ref())
                || is_truthy(email.as_ref())
                || is_truthy(avatar_url.as_ref());

            if has_creator {
                object.insert(
                    "user".to_owned(),
                    json!({
                        "avatar_url": avatar_url.unwrap_or(Value::Null),
                        "email": email.unwrap_or(Value::Null),
                        "full_name": full_name.unwrap_or(Value::Null),
                    }),
                );
            } else {
                // `user: undefined` is dropped by JSON.stringify, so omit the key.
                object.remove("user");
            }
        }
    }

    // wallet: transaction.wallet ?? transaction.wallet_name ?? null
    let wallet = first_non_null(&[object.get("wallet"), object.get("wallet_name")]);
    object.insert("wallet".to_owned(), wallet);

    Value::Object(object)
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

async fn send_service_role_get(
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

// Stable descending sort by parseable `taken_at` (`new Date(...).getTime()`),
// mirroring the legacy `dateB - dateA` comparator. Unparseable/missing values
// sort as 0 like `NaN`-free fallthrough would not, but the legacy data always
// carries ISO timestamps; we keep this defensive.
fn sort_by_taken_at_desc(rows: &mut [Value]) {
    rows.sort_by(|a, b| {
        let date_a = taken_at_millis(a);
        let date_b = taken_at_millis(b);
        date_b.cmp(&date_a)
    });
}

fn taken_at_millis(row: &Value) -> i64 {
    row.get("taken_at")
        .and_then(Value::as_str)
        .and_then(parse_iso_millis)
        .unwrap_or(0)
}

// Best-effort parse of an ISO-8601 timestamp to epoch milliseconds for sorting
// purposes only. We avoid pulling in a date crate; the comparison only needs to
// be monotonic with the timestamp, so we compare on a numeric key derived from
// the timestamp's significant digits.
fn parse_iso_millis(value: &str) -> Option<i64> {
    // Collapse the timestamp's leading date/time digits (YYYYMMDDHHMMSS...) into
    // a single comparable integer. This preserves chronological ordering for the
    // ISO timestamps the RPC returns.
    let digits: String = value
        .chars()
        .take_while(|c| !matches!(c, '+' | 'Z'))
        .filter(char::is_ascii_digit)
        .take(17)
        .collect();
    if digits.is_empty() {
        return None;
    }
    // Right-pad so shorter timestamps still order correctly.
    let padded = format!("{digits:0<17}");
    padded.parse::<i64>().ok()
}

fn first_non_null(candidates: &[Option<&Value>]) -> Value {
    for candidate in candidates {
        if let Some(value) = candidate
            && !value.is_null()
        {
            return (*value).clone();
        }
    }
    Value::Null
}

// JS truthiness for the `hasCreator` check: non-empty strings are truthy, null
// and empty strings are falsy.
fn is_truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(value)) => !value.is_empty(),
        Some(Value::Null) | None => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(number)) => number.as_f64().is_some_and(|n| n != 0.0),
        Some(_) => true,
    }
}

fn value_to_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|n| n as i64)),
        Value::String(text) => text.trim().parse::<i64>().ok(),
        _ => None,
    }
}

// Parsed query parameters for the base transactions list endpoint.
struct TransactionsQuery {
    page: i64,
    items_per_page: i64,
    include_count: bool,
}

fn transactions_query_from_url(request_url: Option<&str>) -> TransactionsQuery {
    let mut page_param: Option<String> = None;
    let mut items_per_page_param: Option<String> = None;
    let mut include_count = false;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" if page_param.is_none() => page_param = Some(value.into_owned()),
                "itemsPerPage" if items_per_page_param.is_none() => {
                    items_per_page_param = Some(value.into_owned());
                }
                // `includeCount === 'true'`
                "includeCount" if !include_count => include_count = value.as_ref() == "true",
                _ => {}
            }
        }
    }

    // page = Math.max(1, parseInt(pageParam || '1', 10))
    let page = page_param
        .as_deref()
        .and_then(parse_js_parse_int_base10)
        .unwrap_or(DEFAULT_PAGE)
        .max(1);
    // itemsPerPage = Math.max(1, parseInt(itemsPerPageParam || '25', 10))
    let items_per_page = items_per_page_param
        .as_deref()
        .and_then(parse_js_parse_int_base10)
        .unwrap_or(DEFAULT_ITEMS_PER_PAGE)
        .max(1);

    TransactionsQuery {
        page,
        items_per_page,
        include_count,
    }
}

// Mirrors `Number.parseInt(value, 10)`: skips leading whitespace, accepts an
// optional sign, then consumes the leading run of base-10 digits. Returns None
// when no digits are present (matching `NaN`, which falls back via `|| '1'` /
// `|| '25'` semantics handled by the caller's default).
fn parse_js_parse_int_base10(value: &str) -> Option<i64> {
    let value = value.trim_start();
    let bytes = value.as_bytes();
    let mut index = 0;
    let negative = match bytes.first() {
        Some(b'-') => {
            index = 1;
            true
        }
        Some(b'+') => {
            index = 1;
            false
        }
        _ => false,
    };
    let digit_start = index;

    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index == digit_start {
        return None;
    }

    let parsed = value[digit_start..index].parse::<i64>().ok()?;
    if negative {
        parsed.checked_neg()
    } else {
        Some(parsed)
    }
}

fn transactions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TRANSACTIONS_PATH_PREFIX)?
        .strip_suffix(TRANSACTIONS_PATH_SUFFIX)?;

    // Exact base route only: reject nested sub-paths like
    // `/transactions/infinite` or `/transactions/<id>`.
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
