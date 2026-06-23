use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const CREATE_INVOICES_PERMISSION: &str = "create_invoices";
const SUBSCRIPTION_CONTEXT_ERROR_MESSAGE: &str = "Error fetching subscription invoice context";
const SUBSCRIPTION_CONTEXT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const SUBSCRIPTION_CONTEXT_PATH_SUFFIX: &str = "/finance/invoices/subscription/context";

#[derive(Clone, Debug, Eq, PartialEq)]
struct SubscriptionContextQuery {
    group_ids: Vec<String>,
    month: Option<String>,
    user_id: Option<String>,
}

#[derive(Deserialize)]
struct ValidGroupRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct LatestInvoiceRow {
    finance_invoices: Option<LatestInvoice>,
    user_group_id: Option<String>,
}

#[derive(Deserialize)]
struct LatestInvoice {
    completed_at: Option<String>,
    created_at: Option<String>,
    valid_until: Option<String>,
}

#[derive(Serialize)]
struct SubscriptionContextResponse {
    attendance: Value,
    #[serde(rename = "latestInvoices")]
    latest_invoices: Vec<LatestInvoiceContext>,
}

#[derive(Serialize)]
struct LatestInvoiceContext {
    group_id: String,
    valid_until: Option<String>,
    created_at: String,
}

pub(crate) async fn handle_finance_subscription_context_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = subscription_context_ws_id(request.path)?;

    Some(match request.method {
        "GET" => subscription_context_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn subscription_context_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = subscription_context_query_from_url(request.url);
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        CREATE_INVOICES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response(401);
        }
        Err(FinanceAuthorizationError::Forbidden) => return unauthorized_response(403),
        Err(FinanceAuthorizationError::Internal) => return subscription_context_error_response(),
    };

    let (Some(user_id), Some(month)) = (query.user_id.as_deref(), query.month.as_deref()) else {
        return empty_subscription_context_response();
    };

    if query.group_ids.is_empty() {
        return empty_subscription_context_response();
    }

    let Some((start_date, next_month_date)) = month_date_range(month) else {
        return subscription_context_error_response();
    };

    match fetch_subscription_context(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        user_id,
        &query.group_ids,
        &start_date,
        &next_month_date,
    )
    .await
    {
        Ok(response) => no_store_response(json_response(200, response)),
        Err(()) => subscription_context_error_response(),
    }
}

async fn fetch_subscription_context(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    group_ids: &[String],
    start_date: &str,
    next_month_date: &str,
) -> Result<SubscriptionContextResponse, ()> {
    let valid_groups =
        fetch_valid_group_ids(contact_data, outbound, ws_id, user_id, group_ids).await?;

    if valid_groups.is_empty() {
        return Ok(empty_subscription_context());
    }

    let attendance = fetch_attendance_context(
        contact_data,
        outbound,
        user_id,
        &valid_groups,
        start_date,
        next_month_date,
    )
    .await?;
    let latest_invoice_rows =
        fetch_latest_invoice_rows(contact_data, outbound, user_id, &valid_groups).await?;

    Ok(SubscriptionContextResponse {
        attendance,
        latest_invoices: latest_invoice_context(latest_invoice_rows),
    })
}

async fn fetch_valid_group_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    group_ids: &[String],
) -> Result<Vec<String>, ()> {
    let rows = fetch_service_role_rows::<ValidGroupRow>(
        contact_data,
        outbound,
        "workspace_user_groups_users",
        &[
            (
                "select",
                "group_id,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(ws_id)"
                    .to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("role", "eq.STUDENT".to_owned()),
            ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
            ("group_id", postgrest_in_filter(group_ids)),
        ],
    )
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| row.group_id)
        .filter(|group_id| !group_id.is_empty())
        .collect())
}

async fn fetch_attendance_context(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    valid_group_ids: &[String],
    start_date: &str,
    next_month_date: &str,
) -> Result<Value, ()> {
    let rows = fetch_service_role_value(
        contact_data,
        outbound,
        "user_group_attendance",
        &[
            ("select", "date,status,group_id".to_owned()),
            ("group_id", postgrest_in_filter(valid_group_ids)),
            ("user_id", format!("eq.{user_id}")),
            ("date", format!("gte.{start_date}")),
            ("date", format!("lt.{next_month_date}")),
            ("order", "date.asc".to_owned()),
        ],
    )
    .await?;

    if rows.is_array() { Ok(rows) } else { Err(()) }
}

async fn fetch_latest_invoice_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    valid_group_ids: &[String],
) -> Result<Vec<LatestInvoiceRow>, ()> {
    fetch_service_role_rows(
        contact_data,
        outbound,
        "finance_invoice_user_groups",
        &[
            (
                "select",
                "user_group_id,finance_invoices!inner(valid_until,created_at,completed_at)"
                    .to_owned(),
            ),
            ("user_group_id", postgrest_in_filter(valid_group_ids)),
            ("finance_invoices.customer_id", format!("eq.{user_id}")),
            ("finance_invoices.completed_at", "not.is.null".to_owned()),
            ("finance_invoices.order", "created_at.desc".to_owned()),
        ],
    )
    .await
}

async fn fetch_service_role_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<T>, ()> {
    let value = fetch_service_role_value(contact_data, outbound, table, params).await?;
    serde_json::from_value::<Vec<T>>(value).map_err(|_| ())
}

async fn fetch_service_role_value(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Value, ()> {
    let url = contact_data.rest_url(table, params).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn subscription_context_query_from_url(request_url: Option<&str>) -> SubscriptionContextQuery {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return SubscriptionContextQuery {
            group_ids: Vec::new(),
            month: None,
            user_id: None,
        };
    };
    let mut group_ids = Vec::new();
    let mut month = None;
    let mut user_id = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "groupIds" => {
                let value = value.trim().to_owned();
                if !value.is_empty() {
                    group_ids.push(value);
                }
            }
            "month" => month = non_empty_trimmed(value.as_ref()),
            "userId" => user_id = non_empty_trimmed(value.as_ref()),
            _ => {}
        }
    }

    SubscriptionContextQuery {
        group_ids,
        month,
        user_id,
    }
}

fn non_empty_trimmed(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

fn month_date_range(month: &str) -> Option<(String, String)> {
    let (year, month) = month.trim().split_once('-')?;
    let year = year.parse::<i32>().ok()?;
    let month = month.parse::<u32>().ok()?;

    if !(1..=12).contains(&month) {
        return None;
    }

    let (next_year, next_month) = if month == 12 {
        (year.checked_add(1)?, 1)
    } else {
        (year, month + 1)
    };

    Some((
        format!("{year:04}-{month:02}-01"),
        format!("{next_year:04}-{next_month:02}-01"),
    ))
}

fn postgrest_in_filter(values: &[String]) -> String {
    let values = values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");

    format!("in.({values})")
}

fn latest_invoice_context(mut rows: Vec<LatestInvoiceRow>) -> Vec<LatestInvoiceContext> {
    rows.retain(|row| {
        row.finance_invoices
            .as_ref()
            .and_then(|invoice| {
                invoice.completed_at.as_deref()?;
                comparable_timestamp_key(invoice.valid_until.as_deref())
            })
            .is_some()
    });
    rows.sort_by(|a, b| {
        let a_invoice = a.finance_invoices.as_ref();
        let b_invoice = b.finance_invoices.as_ref();
        let a_valid_until =
            comparable_timestamp_key(a_invoice.and_then(|invoice| invoice.valid_until.as_deref()));
        let b_valid_until =
            comparable_timestamp_key(b_invoice.and_then(|invoice| invoice.valid_until.as_deref()));
        let a_created_at =
            comparable_timestamp_key(a_invoice.and_then(|invoice| invoice.created_at.as_deref()));
        let b_created_at =
            comparable_timestamp_key(b_invoice.and_then(|invoice| invoice.created_at.as_deref()));

        b_valid_until
            .cmp(&a_valid_until)
            .then_with(|| b_created_at.cmp(&a_created_at))
    });

    let mut seen_group_ids = BTreeSet::new();
    let mut latest_invoices = Vec::new();

    for row in rows {
        let Some(group_id) = row.user_group_id.filter(|group_id| !group_id.is_empty()) else {
            continue;
        };

        if !seen_group_ids.insert(group_id.clone()) {
            continue;
        }

        let Some(invoice) = row.finance_invoices else {
            continue;
        };

        latest_invoices.push(LatestInvoiceContext {
            group_id,
            valid_until: invoice.valid_until,
            created_at: invoice.created_at.unwrap_or_default(),
        });
    }

    latest_invoices
}

fn comparable_timestamp_key(value: Option<&str>) -> Option<(i32, u32, u32, u32, u32, u32)> {
    let value = value?.trim();
    let (date, time) = value.split_once('T').unwrap_or((value, ""));
    let mut date_parts = date.split('-');
    let year = date_parts.next()?.parse::<i32>().ok()?;
    let month = date_parts.next()?.parse::<u32>().ok()?;
    let day = date_parts.next()?.parse::<u32>().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut time_parts = time.split([':', '.', '+', '-', 'Z']);
    let hour = time_parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let minute = time_parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let second = time_parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);

    Some((year, month, day, hour, minute, second))
}

fn subscription_context_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(SUBSCRIPTION_CONTEXT_PATH_PREFIX)?
        .strip_suffix(SUBSCRIPTION_CONTEXT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn empty_subscription_context_response() -> BackendResponse {
    no_store_response(json_response(200, empty_subscription_context()))
}

fn empty_subscription_context() -> SubscriptionContextResponse {
    SubscriptionContextResponse {
        attendance: json!([]),
        latest_invoices: Vec::new(),
    }
}

fn unauthorized_response(status: u16) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": "Unauthorized" })))
}

fn subscription_context_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": SUBSCRIPTION_CONTEXT_ERROR_MESSAGE }),
    ))
}
