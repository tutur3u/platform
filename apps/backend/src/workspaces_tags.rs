use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const TAGS_ERROR_MESSAGE: &str = "Error fetching tags";
const TAGS_PATH_PREFIX: &str = "/api/workspaces/";
const TAGS_PATH_SUFFIX: &str = "/tags";
const GET_TRANSACTION_TAG_STATS_RPC: &str = "get_transaction_tag_stats";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const PRIVATE_SCHEMA: &str = "private";

#[derive(Serialize)]
struct TransactionTagStatsRpcRequest<'a> {
    _actor_id: &'a str,
    _ws_id: &'a str,
}

/// One row returned by the `private.get_transaction_tag_stats` RPC. Numeric
/// counters/totals are deserialized leniently (the RPC may emit them as JSON
/// numbers; the legacy route coerces every one through `Number(x ?? 0)`).
#[derive(Deserialize)]
struct TransactionTagStatsRpcRow {
    tag_id: Option<String>,
    tag_name: Option<String>,
    tag_color: Option<String>,
    #[serde(default)]
    tag_description: Option<String>,
    ws_id: Option<String>,
    #[serde(default)]
    total_amount: Option<Value>,
    #[serde(default)]
    transaction_count: Option<Value>,
    #[serde(default)]
    income_count: Option<Value>,
    #[serde(default)]
    expense_count: Option<Value>,
    #[serde(default)]
    total_income: Option<Value>,
    #[serde(default)]
    total_expense: Option<Value>,
    #[serde(default)]
    net_total: Option<Value>,
    #[serde(default)]
    recent_transaction_count: Option<Value>,
    #[serde(default)]
    recent_income_count: Option<Value>,
    #[serde(default)]
    recent_expense_count: Option<Value>,
    #[serde(default)]
    recent_total_income: Option<Value>,
    #[serde(default)]
    recent_total_expense: Option<Value>,
    #[serde(default)]
    last_transaction_at: Option<String>,
}

pub(crate) async fn handle_workspaces_tags_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = tags_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tags_response(config, request, ws_id, outbound).await,
        // Only GET is migrated. Every other method (POST, etc.) must fall
        // through to the still-active Next.js route, so return None here rather
        // than a 405 that would reject a still-valid mutation.
        _ => return None,
    })
}

async fn tags_response(
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
        Err(FinanceAuthorizationError::Internal) => return tags_error_response(),
    };

    match fetch_tags(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
    )
    .await
    {
        Ok(tags) => no_store_response(json_response(200, tags)),
        Err(()) => tags_error_response(),
    }
}

async fn fetch_tags(
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

    // The RPC returns a JSON array of tag-stat rows. The legacy route maps over
    // `data ?? []`, so treat a null body as an empty array. Any non-array,
    // non-null shape is unexpected for a set-returning RPC and surfaces as an
    // error to mirror the legacy `error` branch.
    let rows: Vec<TransactionTagStatsRpcRow> = match response.json::<Value>() {
        Ok(Value::Null) => Vec::new(),
        Ok(value @ Value::Array(_)) => serde_json::from_value(value).map_err(|_| ())?,
        Ok(_) => return Err(()),
        Err(_) => return Err(()),
    };

    Ok(Value::Array(rows.into_iter().map(normalize_tag).collect()))
}

/// Mirrors the legacy normalization: rename the RPC columns and coerce every
/// numeric counter/total through `Number(x ?? 0)`.
fn normalize_tag(row: TransactionTagStatsRpcRow) -> Value {
    json!({
        "id": row.tag_id,
        "name": row.tag_name,
        "color": row.tag_color,
        "description": row.tag_description,
        "ws_id": row.ws_id,
        "amount": coerce_number(row.total_amount),
        "transaction_count": coerce_number(row.transaction_count),
        "income_count": coerce_number(row.income_count),
        "expense_count": coerce_number(row.expense_count),
        "total_income": coerce_number(row.total_income),
        "total_expense": coerce_number(row.total_expense),
        "net_total": coerce_number(row.net_total),
        "recent_transaction_count": coerce_number(row.recent_transaction_count),
        "recent_income_count": coerce_number(row.recent_income_count),
        "recent_expense_count": coerce_number(row.recent_expense_count),
        "recent_total_income": coerce_number(row.recent_total_income),
        "recent_total_expense": coerce_number(row.recent_total_expense),
        "last_transaction_at": row.last_transaction_at,
    })
}

/// Replicates JS `Number(value ?? 0)` for values that arrive as JSON numbers,
/// numeric strings (Postgres `numeric` is often serialized as a string), null,
/// or absent. Falls back to `0` for anything non-numeric, matching how the
/// legacy route would coerce (`Number('') === 0`, and the only inputs here are
/// numeric DB columns).
fn coerce_number(value: Option<Value>) -> Value {
    match value {
        None | Some(Value::Null) => json!(0),
        Some(Value::Number(number)) => Value::Number(number),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return json!(0);
            }
            match trimmed.parse::<f64>() {
                Ok(parsed) => {
                    serde_json::Number::from_f64(parsed).map_or_else(|| json!(0), Value::Number)
                }
                Err(_) => json!(0),
            }
        }
        Some(_) => json!(0),
    }
}

fn tags_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TAGS_PATH_PREFIX)?
        .strip_suffix(TAGS_PATH_SUFFIX)?;

    // Reject nested paths like `/tags/stats` or `/tags/{tagId}` so this handler
    // only claims the exact `/api/workspaces/{wsId}/tags` collection route.
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

fn tags_error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": TAGS_ERROR_MESSAGE })))
}
