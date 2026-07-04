use super::*;

/// Mirrors `getInventorySales({ limit: windowLimit, offset: 0, wsId })`: the
/// private-schema `get_inventory_sales` RPC returning rows shaped
/// `{ sale, total_count }`. The count is read from the first row's `total_count`;
/// the sale objects are collected (truthy filter) in order.
pub(super) async fn fetch_finance_sales(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    window_limit: i64,
) -> Result<SalesPage, ()> {
    let url = contact_data.rpc_url(INVENTORY_SALES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_limit": window_limit,
        "p_offset": 0,
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
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

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<InventorySalesRpcRow>>()
        .map_err(|_| ())?;
    let count = rows
        .first()
        .and_then(|row| row.total_count.as_ref())
        .map(value_as_count)
        .unwrap_or(0);
    let data = rows
        .into_iter()
        .filter_map(|row| row.sale)
        .filter(|sale| !sale.is_null())
        .collect();

    Ok(SalesPage { count, data })
}

/// Mirrors `listCompletedCheckoutSales({ limit: windowLimit, offset: 0, wsId })`:
/// reads completed `private.inventory_checkout_sessions` rows (with exact count)
/// and their lines, then maps each session into the `InventorySaleSummary` shape
/// via `mapCheckoutSaleSummary`.
pub(super) async fn fetch_checkout_sales(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    window_limit: i64,
) -> Result<SalesPage, ()> {
    // `normalizeLimitOffset(windowLimit, 0)` -> limit clamped to [1, 100],
    // offset clamped to >= 0; `.range(offset, offset + limit - 1)`. supabase-js
    // `.range()` translates to `offset`/`limit` query params for PostgREST.
    let limit = window_limit.clamp(1, 100);

    let url = contact_data
        .rest_url(
            "inventory_checkout_sessions",
            &[
                ("select", CHECKOUT_HISTORY_SELECT.to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("status", "eq.completed".to_owned()),
                ("order", "completed_at.desc,created_at.desc".to_owned()),
                ("offset", "0".to_owned()),
                ("limit", limit.to_string()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let content_range_count = response
        .header("content-range")
        .and_then(parse_content_range);
    let rows = response.json::<Vec<CheckoutSessionRow>>().map_err(|_| ())?;
    let count = content_range_count.unwrap_or(rows.len() as i64);

    let session_ids: Vec<String> = rows.iter().filter_map(|row| row.id.clone()).collect();
    let lines = fetch_checkout_lines(contact_data, outbound, &session_ids).await?;

    let data = rows
        .into_iter()
        .map(|row| map_checkout_sale_summary(&row, &lines))
        .collect();

    Ok(SalesPage { count, data })
}

async fn fetch_checkout_lines(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_ids: &[String],
) -> Result<Vec<CheckoutLineRow>, ()> {
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }

    let url = contact_data
        .rest_url(
            "inventory_checkout_lines",
            &[
                ("select", CHECKOUT_LINE_SELECT.to_owned()),
                (
                    "checkout_session_id",
                    format!("in.({})", session_ids.join(",")),
                ),
            ],
        )
        .ok_or(())?;

    let response = send_private_rest_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<CheckoutLineRow>>().map_err(|_| ())
}

/// Mirrors `mapCheckoutSaleSummary`: builds the `InventorySaleSummary` JSON for a
/// completed checkout session, deriving `items_count` / `total_quantity` from its
/// lines.
fn map_checkout_sale_summary(row: &CheckoutSessionRow, lines: &[CheckoutLineRow]) -> Value {
    let session_lines: Vec<&CheckoutLineRow> = lines
        .iter()
        .filter(|line| line.checkout_session_id.as_deref() == row.id.as_deref())
        .collect();

    let items_count = session_lines.len() as i64;
    let total_quantity: f64 = session_lines
        .iter()
        .map(|line| line.quantity.as_ref().map(value_as_number).unwrap_or(0.0))
        .sum();

    // `customer_name: row.customer_name || row.customer_email || row.public_token`
    // (JS truthiness: empty strings fall through).
    let customer_name = first_truthy_string([
        row.customer_name.as_deref(),
        row.customer_email.as_deref(),
        row.public_token.as_deref(),
    ]);

    let mut sale = Map::new();
    sale.insert("category_name".to_owned(), Value::Null);
    sale.insert("completed_at".to_owned(), string_or_null(&row.completed_at));
    sale.insert("created_at".to_owned(), string_or_null(&row.created_at));
    sale.insert("creator_name".to_owned(), Value::Null);
    sale.insert("currency".to_owned(), string_or_null(&row.currency));
    sale.insert("customer_name".to_owned(), customer_name);
    sale.insert("id".to_owned(), string_or_null(&row.id));
    sale.insert("items_count".to_owned(), json!(items_count));
    sale.insert("note".to_owned(), string_or_null(&row.note));
    sale.insert("notice".to_owned(), string_or_null(&row.public_token));
    sale.insert("owners".to_owned(), Value::Array(Vec::new()));
    sale.insert("paid_amount".to_owned(), value_or_null(&row.total_amount));
    sale.insert(
        "polar_order_id".to_owned(),
        string_or_null(&row.polar_order_id),
    );
    sale.insert("public_token".to_owned(), string_or_null(&row.public_token));
    sale.insert(
        "source".to_owned(),
        Value::String("checkout_session".to_owned()),
    );
    sale.insert("total_quantity".to_owned(), number_value(total_quantity));
    sale.insert("wallet_name".to_owned(), Value::Null);

    Value::Object(sale)
}

/// Mirrors `normalizeFinanceSale`: forces `source: 'finance_invoice'`, defaults
/// `currency` to null and `owners` to `[]` when missing.
pub(super) fn normalize_finance_sale(sale: Value) -> Value {
    let mut object = match sale {
        Value::Object(map) => map,
        other => return other,
    };

    if !object
        .get("currency")
        .map(|v| !v.is_null())
        .unwrap_or(false)
    {
        object.insert("currency".to_owned(), Value::Null);
    }
    if !object.get("owners").map(|v| v.is_array()).unwrap_or(false) {
        object.insert("owners".to_owned(), Value::Array(Vec::new()));
    }
    object.insert(
        "source".to_owned(),
        Value::String("finance_invoice".to_owned()),
    );

    Value::Object(object)
}

/// Mirrors `saleTimestamp`: `Date(completed_at ?? created_at).getTime()`, with
/// 0 for missing/invalid timestamps. RFC3339 timestamps sort correctly as
/// epoch-millis; an unparseable timestamp resolves to 0.
pub(super) fn sale_timestamp(sale: &Value) -> i64 {
    let timestamp = sale
        .get("completed_at")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .or_else(|| sale.get("created_at").and_then(Value::as_str))
        .filter(|value| !value.is_empty());

    timestamp.map(parse_timestamp_millis).unwrap_or(0)
}
