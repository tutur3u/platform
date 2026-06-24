use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const PERIODS_PATH_PREFIX: &str = "/api/workspaces/";
const PERIODS_PATH_SUFFIX: &str = "/transactions/periods";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const TRANSACTIONS_BY_PERIOD_RPC: &str = "get_transactions_by_period";
const LIST_ENRICHMENT_RPC: &str = "get_transaction_list_enrichment";
const DEFAULT_VIEW_MODE: &str = "weekly";
const DEFAULT_LIMIT: i64 = 10;
const DEFAULT_TIMEZONE: &str = "UTC";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_ERROR_MESSAGE: &str = "Failed to fetch transaction periods";

// ---------------------------------------------------------------------------
// Raw shapes returned by the `get_transactions_by_period` RPC.
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
struct RawTransaction {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    amount: Option<f64>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    category_id: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    category_icon: Option<String>,
    #[serde(default)]
    category_color: Option<String>,
    #[serde(default)]
    wallet_id: Option<String>,
    #[serde(default)]
    wallet: Option<String>,
    #[serde(default)]
    ws_id: Option<String>,
    #[serde(default)]
    taken_at: Option<String>,
    #[serde(default)]
    is_amount_confidential: Option<bool>,
    #[serde(default)]
    is_description_confidential: Option<bool>,
    #[serde(default)]
    is_category_confidential: Option<bool>,
    #[serde(default)]
    report_opt_in: Option<bool>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    creator_id: Option<String>,
    #[serde(default)]
    platform_creator_id: Option<String>,
}

#[derive(Deserialize, Default)]
struct RawPeriodResult {
    #[serde(default)]
    period_start: Option<String>,
    #[serde(default)]
    period_end: Option<String>,
    #[serde(default)]
    total_income: Option<f64>,
    #[serde(default)]
    total_expense: Option<f64>,
    #[serde(default)]
    net_total: Option<f64>,
    #[serde(default)]
    transaction_count: Option<f64>,
    #[serde(default)]
    has_redacted_amounts: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    transactions: Vec<RawTransaction>,
    #[serde(default)]
    has_more: Option<bool>,
}

fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    let opt = Option::<T>::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

// ---------------------------------------------------------------------------
// Raw shapes for enrichment + user-info lookups.
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
struct RawEnrichmentRow {
    #[serde(default)]
    transaction_id: Option<String>,
    #[serde(default)]
    tags: Value,
}

#[derive(Deserialize)]
struct PlatformUserRow {
    id: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct PlatformUserDetailRow {
    user_id: String,
    #[serde(default)]
    full_name: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceUserRow {
    id: String,
    #[serde(default)]
    full_name: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    avatar_url: Option<String>,
}

#[derive(Default, Clone)]
struct UserInfo {
    full_name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

enum RestAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

// ---------------------------------------------------------------------------
// Parsed query parameters.
// ---------------------------------------------------------------------------

struct PeriodsQuery {
    view_mode: String,
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
    timezone: String,
}

pub(crate) async fn handle_workspaces_transactions_periods_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = periods_ws_id(request.path)?;

    Some(match request.method {
        "GET" => periods_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn periods_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = parse_query(request.url);

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
        Err(FinanceAuthorizationError::Forbidden) => return message_response(403, "Unauthorized"),
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, INTERNAL_ERROR_MESSAGE);
        }
    };

    let raw_results =
        match fetch_periods(&config.contact_data, outbound, &authorization, &query).await {
            Ok(results) => results,
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    let has_more = raw_results
        .first()
        .and_then(|period| period.has_more)
        .unwrap_or(false);

    // Collect transaction ids for tag enrichment.
    let mut all_transaction_ids: Vec<String> = Vec::new();
    for period in &raw_results {
        for tx in &period.transactions {
            if let Some(id) = tx.id.as_ref().filter(|id| !id.is_empty()) {
                all_transaction_ids.push(id.clone());
            }
        }
    }

    // Enrichment is best-effort: recoverable errors fall back to empty tags.
    let tags_by_transaction = fetch_enrichment_tags(
        &config.contact_data,
        outbound,
        &authorization,
        &all_transaction_ids,
    )
    .await
    .unwrap_or_default();

    // Collect creator ids for user-info lookups.
    let mut creator_ids: BTreeSet<String> = BTreeSet::new();
    for period in &raw_results {
        for tx in &period.transactions {
            if let Some(id) = tx.creator_id.as_ref().filter(|id| !id.is_empty()) {
                creator_ids.insert(id.clone());
            }
            if let Some(id) = tx.platform_creator_id.as_ref().filter(|id| !id.is_empty()) {
                creator_ids.insert(id.clone());
            }
        }
    }

    let user_info_map = if creator_ids.is_empty() {
        BTreeMap::new()
    } else {
        let creator_ids_vec: Vec<String> = creator_ids.into_iter().collect();
        build_user_info_map(
            &config.contact_data,
            outbound,
            &authorization,
            &creator_ids_vec,
        )
        .await
    };

    let periods: Vec<Value> = raw_results
        .iter()
        .map(|period| transform_period(period, &tags_by_transaction, &user_info_map))
        .collect();

    // Legacy: nextCursor = last period's periodStart when hasMore, else null.
    // periodStart is "" when the RPC omits it, which serializes to a string.
    let next_cursor: Value = if has_more {
        periods
            .last()
            .and_then(|period| period.get("periodStart").cloned())
            .filter(|value| value.as_str().is_some_and(|s| !s.is_empty()))
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    no_store_response(json_response(
        200,
        json!({
            "data": periods,
            "nextCursor": next_cursor,
            "hasMore": has_more,
        }),
    ))
}

fn transform_period(
    period: &RawPeriodResult,
    tags_by_transaction: &BTreeMap<String, Value>,
    user_info_map: &BTreeMap<String, UserInfo>,
) -> Value {
    let transactions: Vec<Value> = period
        .transactions
        .iter()
        .map(|tx| {
            let creator_id = tx
                .creator_id
                .as_ref()
                .filter(|id| !id.is_empty())
                .or_else(|| tx.platform_creator_id.as_ref().filter(|id| !id.is_empty()));

            let user_value = creator_id
                .and_then(|id| user_info_map.get(id))
                .map(|info| {
                    json!({
                        "full_name": opt_str(&info.full_name),
                        "email": opt_str(&info.email),
                        "avatar_url": opt_str(&info.avatar_url),
                    })
                })
                .unwrap_or(Value::Null);

            let tags = tx
                .id
                .as_ref()
                .and_then(|id| tags_by_transaction.get(id))
                .cloned()
                .unwrap_or_else(|| json!([]));

            json!({
                "id": opt_str(&tx.id),
                "amount": tx.amount.unwrap_or(0.0),
                "description": opt_undefined(&tx.description),
                "category_id": opt_undefined(&tx.category_id),
                "category": opt_undefined(&tx.category),
                "category_icon": opt_str(&tx.category_icon),
                "category_color": opt_str(&tx.category_color),
                "wallet_id": opt_undefined(&tx.wallet_id),
                "wallet": opt_undefined(&tx.wallet),
                "ws_id": opt_str(&tx.ws_id),
                "taken_at": opt_str(&tx.taken_at),
                "is_amount_confidential": tx.is_amount_confidential.unwrap_or(false),
                "is_description_confidential": tx.is_description_confidential.unwrap_or(false),
                "is_category_confidential": tx.is_category_confidential.unwrap_or(false),
                "report_opt_in": tx.report_opt_in.unwrap_or(false),
                "created_at": opt_str(&tx.created_at),
                "user": user_value,
                "tags": tags,
            })
        })
        .collect();

    json!({
        "periodStart": opt_str(&period.period_start),
        "periodEnd": opt_str(&period.period_end),
        "periodLabel": "",
        "totalIncome": period.total_income.unwrap_or(0.0),
        "totalExpense": period.total_expense.unwrap_or(0.0),
        "netTotal": period.net_total.unwrap_or(0.0),
        "transactionCount": period.transaction_count.unwrap_or(0.0),
        "hasRedactedAmounts": period.has_redacted_amounts.unwrap_or(false),
        "transactions": transactions,
    })
}

/// Mirror the legacy `value || undefined`: emit `null` (JSON has no undefined)
/// when the source is missing OR an empty string.
fn opt_undefined(value: &Option<String>) -> Value {
    match value {
        Some(text) if !text.is_empty() => Value::String(text.clone()),
        _ => Value::Null,
    }
}

/// Mirror the legacy `value` passthrough where `null` is preserved.
fn opt_str(value: &Option<String>) -> Value {
    match value {
        Some(text) => Value::String(text.clone()),
        None => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// RPC: get_transactions_by_period
// ---------------------------------------------------------------------------

async fn fetch_periods(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &PeriodsQuery,
) -> Result<Vec<RawPeriodResult>, ()> {
    let final_wallet_ids: Option<Vec<String>> = if !query.wallet_ids.is_empty() {
        Some(query.wallet_ids.clone())
    } else {
        query.wallet_id.clone().map(|id| vec![id])
    };

    let transaction_type = match query.transaction_type.as_deref() {
        Some("income") => Some("income"),
        Some("expense") => Some("expense"),
        _ => None,
    };

    let mut body = serde_json::Map::new();
    body.insert("p_ws_id".to_owned(), json!(authorization.ws_id));
    body.insert("p_interval".to_owned(), json!(query.view_mode));
    body.insert("p_user_id".to_owned(), json!(authorization.user_id));
    insert_opt(
        &mut body,
        "p_wallet_ids",
        final_wallet_ids.map(|v| json!(v)),
    );
    insert_opt(
        &mut body,
        "p_category_ids",
        non_empty_vec(&query.category_ids),
    );
    insert_opt(&mut body, "p_creator_ids", non_empty_vec(&query.user_ids));
    insert_opt(&mut body, "p_tag_ids", non_empty_vec(&query.tag_ids));
    insert_opt(
        &mut body,
        "p_transaction_type",
        transaction_type.map(|t| json!(t)),
    );
    insert_opt(&mut body, "p_search_query", non_empty_str(&query.q));
    insert_opt(&mut body, "p_start_date", non_empty_str(&query.start_date));
    insert_opt(&mut body, "p_end_date", non_empty_str(&query.end_date));
    insert_opt(
        &mut body,
        "p_cursor_period_start",
        non_empty_str(&query.cursor),
    );
    body.insert("p_limit".to_owned(), json!(query.limit));
    body.insert("p_timezone".to_owned(), json!(query.timezone));

    let body_string = serde_json::to_string(&Value::Object(body)).map_err(|_| ())?;

    let response = send_rpc(
        contact_data,
        outbound,
        TRANSACTIONS_BY_PERIOD_RPC,
        &body_string,
    )
    .await?;
    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<RawPeriodResult>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// RPC: get_transaction_list_enrichment (best-effort, tags only)
// ---------------------------------------------------------------------------

async fn fetch_enrichment_tags(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    transaction_ids: &[String],
) -> Result<BTreeMap<String, Value>, ()> {
    let mut unique: Vec<String> = Vec::new();
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    for id in transaction_ids {
        if !id.is_empty() && seen.insert(id.as_str()) {
            unique.push(id.clone());
        }
    }

    if unique.is_empty() {
        return Ok(BTreeMap::new());
    }

    let body = serde_json::to_string(&json!({
        "p_ws_id": authorization.ws_id,
        "p_transaction_ids": unique,
        "p_user_id": authorization.user_id,
    }))
    .map_err(|_| ())?;

    let response = send_rpc(contact_data, outbound, LIST_ENRICHMENT_RPC, &body).await?;
    if !is_success(response.status) {
        // Treat any non-success enrichment failure as recoverable: continue
        // without tags (legacy swallows recoverable RPC errors).
        return Ok(BTreeMap::new());
    }

    let rows = match response.json::<Vec<RawEnrichmentRow>>() {
        Ok(rows) => rows,
        Err(_) => return Ok(BTreeMap::new()),
    };

    let mut map = BTreeMap::new();
    for row in rows {
        if let Some(transaction_id) = row.transaction_id.filter(|id| !id.is_empty()) {
            map.insert(transaction_id, normalize_tags(row.tags));
        }
    }

    Ok(map)
}

fn normalize_tags(tags: Value) -> Value {
    let Value::Array(items) = tags else {
        return json!([]);
    };

    let normalized: Vec<Value> = items
        .into_iter()
        .filter_map(|tag| {
            let obj = tag.as_object()?;
            let id = obj.get("id")?.as_str()?;
            let name = obj.get("name")?.as_str()?;
            let color = obj
                .get("color")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            Some(json!({ "id": id, "name": name, "color": color }))
        })
        .collect();

    Value::Array(normalized)
}

// ---------------------------------------------------------------------------
// User-info lookups across users / user_private_details / workspace_users.
// ---------------------------------------------------------------------------

async fn build_user_info_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    creator_ids: &[String],
) -> BTreeMap<String, UserInfo> {
    let mut map: BTreeMap<String, UserInfo> = BTreeMap::new();

    let auth = authorization
        .access_token
        .as_deref()
        .map_or(RestAuth::ServiceRole, RestAuth::AccessToken);

    let in_filter = format!("in.({})", creator_ids.join(","));

    // Platform users.
    if let Ok(rows) = fetch_rows::<PlatformUserRow>(
        contact_data,
        outbound,
        "users",
        &[
            ("select", "id,display_name,avatar_url".to_owned()),
            ("id", in_filter.clone()),
        ],
        &auth,
    )
    .await
    {
        for row in rows {
            let entry = map.entry(row.id).or_default();
            entry.full_name = non_empty(row.display_name);
            entry.avatar_url = non_empty(row.avatar_url);
        }
    }

    // Platform user private details.
    if let Ok(rows) = fetch_rows::<PlatformUserDetailRow>(
        contact_data,
        outbound,
        "user_private_details",
        &[
            ("select", "user_id,full_name,email".to_owned()),
            ("user_id", in_filter.clone()),
        ],
        &auth,
    )
    .await
    {
        for row in rows {
            let entry = map.entry(row.user_id).or_default();
            entry.full_name = entry.full_name.take().or_else(|| non_empty(row.full_name));
            entry.email = non_empty(row.email);
        }
    }

    // Workspace users.
    if let Ok(rows) = fetch_rows::<WorkspaceUserRow>(
        contact_data,
        outbound,
        "workspace_users",
        &[
            ("select", "id,full_name,email,avatar_url".to_owned()),
            ("id", in_filter),
        ],
        &auth,
    )
    .await
    {
        for row in rows {
            let entry = map.entry(row.id).or_default();
            entry.full_name = entry.full_name.take().or_else(|| non_empty(row.full_name));
            entry.email = entry.email.take().or_else(|| non_empty(row.email));
            entry.avatar_url = entry
                .avatar_url
                .take()
                .or_else(|| non_empty(row.avatar_url));
        }
    }

    map
}

async fn fetch_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
    auth: &RestAuth<'_>,
) -> Result<Vec<T>, ()> {
    let url = contact_data.rest_url(table, params).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        RestAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        RestAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<T>>().map_err(|_| ())
}

async fn send_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let rpc_url = contact_data.rpc_url(function).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Query parsing.
// ---------------------------------------------------------------------------

fn parse_query(request_url: Option<&str>) -> PeriodsQuery {
    let mut view_mode = DEFAULT_VIEW_MODE.to_owned();
    let mut cursor: Option<String> = None;
    let mut limit = DEFAULT_LIMIT;
    let mut q: Option<String> = None;
    let mut user_ids: Vec<String> = Vec::new();
    let mut category_ids: Vec<String> = Vec::new();
    let mut wallet_ids: Vec<String> = Vec::new();
    let mut tag_ids: Vec<String> = Vec::new();
    let mut wallet_id: Option<String> = None;
    let mut transaction_type: Option<String> = None;
    let mut start_date: Option<String> = None;
    let mut end_date: Option<String> = None;
    let mut timezone = DEFAULT_TIMEZONE.to_owned();

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
        for (key, value) in url.query_pairs() {
            let value = value.into_owned();
            match key.as_ref() {
                "viewMode" if !value.is_empty() => {
                    view_mode = value;
                }
                "cursor" => cursor = Some(value),
                "limit" => {
                    if let Ok(parsed) = value.parse::<i64>() {
                        limit = parsed;
                    }
                }
                "q" => q = Some(value),
                "userIds" => user_ids.push(value),
                "categoryIds" => category_ids.push(value),
                "walletIds" => wallet_ids.push(value),
                "tagIds" => tag_ids.push(value),
                "walletId" => wallet_id = Some(value),
                "transactionType" => transaction_type = Some(value),
                "start" => start_date = Some(value),
                "end" => end_date = Some(value),
                "timezone" if !value.is_empty() => {
                    timezone = value;
                }
                _ => {}
            }
        }
    }

    PeriodsQuery {
        view_mode,
        cursor,
        limit,
        q,
        user_ids,
        category_ids,
        wallet_ids,
        tag_ids,
        wallet_id,
        transaction_type,
        start_date,
        end_date,
        timezone,
    }
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

fn periods_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(PERIODS_PATH_PREFIX)?
        .strip_suffix(PERIODS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn insert_opt(map: &mut serde_json::Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        map.insert(key.to_owned(), value);
    }
}

fn non_empty_vec(values: &[String]) -> Option<Value> {
    if values.is_empty() {
        None
    } else {
        Some(json!(values))
    }
}

fn non_empty_str(value: &Option<String>) -> Option<Value> {
    value
        .as_ref()
        .filter(|text| !text.is_empty())
        .map(|text| json!(text))
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.is_empty())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
