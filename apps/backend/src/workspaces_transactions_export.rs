use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

const TRANSACTIONS_EXPORT_PATH_PREFIX: &str = "/api/workspaces/";
const TRANSACTIONS_EXPORT_PATH_SUFFIX: &str = "/transactions/export";

const GET_WALLET_TRANSACTIONS_RPC: &str = "get_wallet_transactions_with_permissions";
const GET_ENRICHMENT_RPC: &str = "get_transaction_list_enrichment";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";

const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const EXPORT_FINANCE_DATA_PERMISSION: &str = "export_finance_data";

const DEFAULT_PAGE_SIZE: u32 = 1000;
const MAX_PAGE_SIZE: u32 = 1000;
const EXPORT_LOOKUP_CHUNK_SIZE: usize = 100;

const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const ROWS_ERROR_MESSAGE: &str = "Error fetching transaction export rows";
const ENRICHMENT_ERROR_MESSAGE: &str = "Error fetching transaction export enrichment";
const INVOICE_ERROR_MESSAGE: &str = "Error fetching transaction export invoice customers";

#[derive(Debug, Default)]
struct TransactionExportQuery {
    page: u32,
    page_size: u32,
    wallet_ids: Vec<String>,
    category_ids: Vec<String>,
    user_ids: Vec<String>,
    tag_ids: Vec<String>,
    transaction_type: Option<String>,
    q: Option<String>,
    start: Option<String>,
    end: Option<String>,
}

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
    p_limit: u32,
    p_offset: u32,
    p_include_count: bool,
}

#[derive(Serialize)]
struct EnrichmentRpcRequest<'a> {
    p_transaction_ids: &'a [String],
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Debug, Default, Deserialize)]
struct ExportTransactionRow {
    #[serde(default)]
    id: String,
    #[serde(default)]
    amount: Option<f64>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    category_name: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    creator_email: Option<String>,
    #[serde(default)]
    creator_full_name: Option<String>,
    #[serde(default)]
    invoice_id: Option<String>,
    #[serde(default)]
    report_opt_in: Option<bool>,
    #[serde(default)]
    taken_at: Option<String>,
    #[serde(default)]
    total_count: Option<Value>,
    #[serde(default)]
    wallet_name: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ExportEnrichmentRow {
    #[serde(default)]
    tags: Value,
    #[serde(default)]
    transaction_id: String,
}

#[derive(Debug, Default, Deserialize)]
struct ExportInvoiceRow {
    #[serde(default)]
    id: String,
    #[serde(default)]
    transaction_id: Option<String>,
    #[serde(default)]
    customer_id: Option<String>,
}

#[derive(Debug, Default, Deserialize, Clone)]
struct ExportCustomerProfileRow {
    #[serde(default)]
    id: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    full_name: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

pub(crate) async fn handle_workspaces_transactions_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = transactions_export_ws_id(request.path)?;

    Some(match request.method {
        "GET" => transactions_export_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn transactions_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = transactions_export_query_from_url(request.url);

    // Authorize and resolve workspace/user using the shared finance helper.
    // The legacy route requires BOTH `view_transactions` and
    // `export_finance_data`; this checks the first and gives us the resolved
    // authorization context (normalized ws_id, user id, access token).
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
            return unauthorized_response();
        }
        Err(FinanceAuthorizationError::Forbidden) => return insufficient_permissions_response(),
        Err(FinanceAuthorizationError::Internal) => return error_response(ROWS_ERROR_MESSAGE),
    };

    // Second required permission: export_finance_data.
    match has_workspace_permission(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        EXPORT_FINANCE_DATA_PERMISSION,
        &authorization.user_id,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return insufficient_permissions_response(),
        Err(()) => return error_response(ROWS_ERROR_MESSAGE),
    }

    // 1. Fetch the transaction rows via the permissions-aware RPC.
    let transactions =
        match fetch_transactions(&config.contact_data, outbound, &authorization, &query).await {
            Ok(transactions) => transactions,
            Err(()) => return error_response(ROWS_ERROR_MESSAGE),
        };

    let transaction_ids: Vec<String> = transactions
        .iter()
        .map(|transaction| transaction.id.clone())
        .collect();

    let invoice_ids: Vec<String> = dedupe(
        transactions
            .iter()
            .filter_map(|transaction| non_empty(transaction.invoice_id.as_deref())),
    );

    // 2. Enrichment (tags) for the returned transactions.
    let tag_names_by_transaction = if transaction_ids.is_empty() {
        HashMap::new()
    } else {
        match fetch_enrichment(
            &config.contact_data,
            outbound,
            &authorization,
            &transaction_ids,
        )
        .await
        {
            Ok(map) => map,
            Err(()) => return error_response(ENRICHMENT_ERROR_MESSAGE),
        }
    };

    // 3. Invoice -> customer lookups (service role, chunked).
    let invoices = match fetch_invoice_customers(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &invoice_ids,
    )
    .await
    {
        Ok(invoices) => invoices,
        Err(()) => return error_response(INVOICE_ERROR_MESSAGE),
    };

    let mut invoices_by_id: HashMap<String, InvoiceWithCustomer> = HashMap::new();
    let mut invoices_by_transaction: HashMap<String, InvoiceWithCustomer> = HashMap::new();
    for invoice in invoices {
        if let Some(transaction_id) = non_empty(invoice.transaction_id.as_deref()) {
            invoices_by_transaction.insert(transaction_id, invoice.clone());
        }
        invoices_by_id.insert(invoice.id.clone(), invoice);
    }

    let count = transactions
        .first()
        .map(|transaction| total_count_value(transaction.total_count.as_ref()))
        .unwrap_or_else(|| json!(0));

    let data: Vec<Value> = transactions
        .iter()
        .map(|transaction| {
            let invoice = transaction
                .invoice_id
                .as_deref()
                .filter(|id| !id.is_empty())
                .and_then(|id| invoices_by_id.get(id))
                .or_else(|| invoices_by_transaction.get(&transaction.id));
            let customer = invoice.and_then(|invoice| invoice.customer.as_ref());

            let tag_names = tag_names_by_transaction
                .get(&transaction.id)
                .cloned()
                .unwrap_or_default();
            let tags = if tag_names.is_empty() {
                Value::Null
            } else {
                Value::String(tag_names.join(", "))
            };

            let invoice_for_name = customer
                .and_then(|customer| {
                    non_empty(customer.display_name.as_deref())
                        .or_else(|| non_empty(customer.full_name.as_deref()))
                })
                .map_or(Value::Null, Value::String);
            let invoice_for_email = customer
                .and_then(|customer| customer.email.clone())
                .map_or(Value::Null, Value::String);

            json!({
                "amount": option_number(transaction.amount),
                "description": option_string(transaction.description.as_deref()),
                "category": option_string(transaction.category_name.as_deref()),
                "transaction_type": transaction_type(transaction.amount),
                "wallet": option_string(transaction.wallet_name.as_deref()),
                "tags": tags,
                "taken_at": option_string(transaction.taken_at.as_deref()),
                "created_at": option_string(transaction.created_at.as_deref()),
                "report_opt_in": transaction
                    .report_opt_in
                    .map_or(Value::Null, Value::Bool),
                "creator_name": option_string(transaction.creator_full_name.as_deref()),
                "creator_email": option_string(transaction.creator_email.as_deref()),
                "invoice_for_name": invoice_for_name,
                "invoice_for_email": invoice_for_email,
            })
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "count": count,
        }),
    ))
}

#[derive(Clone)]
struct InvoiceWithCustomer {
    id: String,
    transaction_id: Option<String>,
    customer: Option<ExportCustomerProfileRow>,
}

async fn fetch_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &TransactionExportQuery,
) -> Result<Vec<ExportTransactionRow>, ()> {
    let offset = query.page.saturating_sub(1).saturating_mul(query.page_size);
    let transaction_type = match query.transaction_type.as_deref() {
        Some(value @ ("income" | "expense")) => Some(value),
        _ => None,
    };

    let body = serde_json::to_string(&WalletTransactionsRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_user_id: &authorization.user_id,
        p_wallet_ids: non_empty_slice(&query.wallet_ids),
        p_category_ids: non_empty_slice(&query.category_ids),
        p_creator_ids: non_empty_slice(&query.user_ids),
        p_tag_ids: non_empty_slice(&query.tag_ids),
        p_transaction_type: transaction_type,
        p_search_query: query.q.as_deref(),
        p_start_date: query.start.as_deref(),
        p_end_date: query.end.as_deref(),
        p_order_by: "taken_at",
        p_order_direction: "DESC",
        p_limit: query.page_size,
        p_offset: offset,
        p_include_count: true,
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

    Ok(response
        .json::<Vec<ExportTransactionRow>>()
        .unwrap_or_default())
}

async fn fetch_enrichment(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    transaction_ids: &[String],
) -> Result<HashMap<String, Vec<String>>, ()> {
    let body = serde_json::to_string(&EnrichmentRpcRequest {
        p_transaction_ids: transaction_ids,
        p_user_id: &authorization.user_id,
        p_ws_id: &authorization.ws_id,
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

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<ExportEnrichmentRow>>()
        .unwrap_or_default();
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let names = tag_names(&row.tags);
        if names.is_empty() {
            continue;
        }
        map.entry(row.transaction_id).or_default().extend(names);
    }

    Ok(map)
}

async fn fetch_invoice_customers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    invoice_ids: &[String],
) -> Result<Vec<InvoiceWithCustomer>, ()> {
    if invoice_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut invoices: Vec<ExportInvoiceRow> = Vec::new();
    for chunk in invoice_ids.chunks(EXPORT_LOOKUP_CHUNK_SIZE) {
        let Some(url) = contact_data.rest_url(
            "finance_invoices",
            &[
                ("select", "id,transaction_id,customer_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", format!("in.({})", in_filter(chunk))),
            ],
        ) else {
            return Err(());
        };
        let response = send_service_role_get(contact_data, outbound, &url).await?;
        if !is_success_status(response.status) {
            return Err(());
        }
        invoices.extend(response.json::<Vec<ExportInvoiceRow>>().unwrap_or_default());
    }

    let customer_ids: Vec<String> = dedupe(
        invoices
            .iter()
            .filter_map(|invoice| non_empty(invoice.customer_id.as_deref())),
    );

    let mut customers_by_id: HashMap<String, ExportCustomerProfileRow> = HashMap::new();
    for chunk in customer_ids.chunks(EXPORT_LOOKUP_CHUNK_SIZE) {
        let Some(url) = contact_data.rest_url(
            "workspace_users",
            &[
                ("select", "id,display_name,full_name,email".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", format!("in.({})", in_filter(chunk))),
            ],
        ) else {
            return Err(());
        };
        let response = send_service_role_get(contact_data, outbound, &url).await?;
        if !is_success_status(response.status) {
            return Err(());
        }
        for customer in response
            .json::<Vec<ExportCustomerProfileRow>>()
            .unwrap_or_default()
        {
            customers_by_id.insert(customer.id.clone(), customer);
        }
    }

    Ok(invoices
        .into_iter()
        .map(|invoice| {
            let customer = invoice
                .customer_id
                .as_deref()
                .filter(|id| !id.is_empty())
                .and_then(|id| customers_by_id.get(id).cloned());
            InvoiceWithCustomer {
                id: invoice.id,
                transaction_id: invoice.transaction_id,
                customer,
            }
        })
        .collect())
}

// File-local copy of the private `has_workspace_permission` helper from
// `finance_auth.rs` (cannot be edited / re-exported per single-file constraint).
async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;

    let response = send_rpc(
        contact_data,
        outbound,
        HAS_WORKSPACE_PERMISSION_RPC,
        &body,
        None,
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
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
    let authorization = access_token.map_or_else(
        || format!("Bearer {service_role_key}"),
        |token| format!("Bearer {token}"),
    );

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

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
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

fn transactions_export_query_from_url(request_url: Option<&str>) -> TransactionExportQuery {
    let mut query = TransactionExportQuery {
        page: 1,
        page_size: DEFAULT_PAGE_SIZE,
        ..Default::default()
    };

    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;

    for (key, value) in url.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "page" if page_raw.is_none() => page_raw = Some(value),
            "pageSize" if page_size_raw.is_none() => page_size_raw = Some(value),
            "walletIds" => push_string_array(&mut query.wallet_ids, &value),
            "categoryIds" => push_string_array(&mut query.category_ids, &value),
            "userIds" => push_string_array(&mut query.user_ids, &value),
            "tagIds" => push_string_array(&mut query.tag_ids, &value),
            "transactionType" if query.transaction_type.is_none() => {
                query.transaction_type = trimmed_non_empty(&value);
            }
            "q" if query.q.is_none() => query.q = trimmed_non_empty(&value),
            "start" if query.start.is_none() => query.start = trimmed_non_empty(&value),
            "end" if query.end.is_none() => query.end = trimmed_non_empty(&value),
            _ => {}
        }
    }

    query.page = positive_integer(page_raw.as_deref(), 1);
    query.page_size =
        positive_integer(page_size_raw.as_deref(), DEFAULT_PAGE_SIZE).min(MAX_PAGE_SIZE);

    query
}

fn transactions_export_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TRANSACTIONS_EXPORT_PATH_PREFIX)?
        .strip_suffix(TRANSACTIONS_EXPORT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn push_string_array(target: &mut Vec<String>, raw: &str) {
    for part in raw.split(',') {
        let trimmed = part.trim();
        if !trimmed.is_empty() {
            target.push(trimmed.to_owned());
        }
    }
}

fn trimmed_non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn positive_integer(value: Option<&str>, fallback: u32) -> u32 {
    value
        .and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|parsed| *parsed > 0)
        .and_then(|parsed| u32::try_from(parsed).ok())
        .unwrap_or(fallback)
}

fn non_empty_slice(values: &[String]) -> Option<&[String]> {
    (!values.is_empty()).then_some(values)
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn dedupe(values: impl Iterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            out.push(value);
        }
    }
    out
}

fn in_filter(values: &[String]) -> String {
    // PostgREST in.(...) list. Quote each id to be safe with reserved chars.
    values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(",")
}

fn tag_names(tags: &Value) -> Vec<String> {
    let Value::Array(items) = tags else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            item.get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty())
                .map(str::to_owned)
        })
        .collect()
}

fn transaction_type(amount: Option<f64>) -> Value {
    match amount {
        None => Value::Null,
        Some(amount) if amount < 0.0 => Value::String("expense".to_owned()),
        Some(_) => Value::String("income".to_owned()),
    }
}

fn option_string(value: Option<&str>) -> Value {
    value.map_or(Value::Null, |value| Value::String(value.to_owned()))
}

fn option_number(value: Option<f64>) -> Value {
    value
        .and_then(serde_json::Number::from_f64)
        .map_or(Value::Null, Value::Number)
}

fn total_count_value(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number.clone()),
        Some(Value::String(text)) => text
            .trim()
            .parse::<i64>()
            .ok()
            .map(|parsed| json!(parsed))
            .unwrap_or_else(|| json!(0)),
        _ => json!(0),
    }
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn insufficient_permissions_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": INSUFFICIENT_PERMISSIONS_MESSAGE }),
    ))
}

fn error_response(message: &str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}
