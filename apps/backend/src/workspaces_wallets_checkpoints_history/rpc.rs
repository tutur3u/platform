use super::*;

// ---------------------------------------------------------------------------
// Row decoding type (local to audit status only)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct AuditStatusRow {
    audited_balance: Option<Value>,
    checkpoint_ledger_balance: Option<Value>,
    latest_actual_balance: Option<Value>,
    latest_checked_at: Option<String>,
    latest_checkpoint_id: Option<String>,
    ledger_balance: Option<Value>,
    post_checkpoint_delta: Option<Value>,
    post_checkpoint_transaction_count: Option<Value>,
    status: Option<String>,
    variance: Option<Value>,
    wallet_id: String,
}

// ---------------------------------------------------------------------------
// Ledger balance RPC (get_wallet_ledger_balance_at)
// ---------------------------------------------------------------------------

pub(super) async fn ledger_balance_for_read(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    checked_at: &str,
    fallback_ledger_balance: f64,
) -> Result<f64, ()> {
    let mut body = Map::new();
    body.insert(
        "_checked_at".to_owned(),
        Value::String(checked_at.to_owned()),
    );
    body.insert("_wallet_id".to_owned(), Value::String(wallet_id.to_owned()));

    match private_rpc(
        contact_data,
        outbound,
        "get_wallet_ledger_balance_at",
        &Value::Object(body),
    )
    .await
    {
        Ok(response) => {
            if is_success(response.status) {
                let value = response.json::<Value>().map_err(|_| ())?;
                Ok(value_to_number(&value).unwrap_or(0.0))
            } else if response_is_storage_missing(&response) {
                Ok(fallback_ledger_balance)
            } else {
                Err(())
            }
        }
        Err(()) => Err(()),
    }
}

// ---------------------------------------------------------------------------
// Interval RPC (list_wallet_checkpoint_intervals)
// ---------------------------------------------------------------------------

pub(super) async fn list_checkpoint_intervals(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
    limit: i64,
) -> Result<Vec<IntervalRow>, BuildError> {
    let mut body = Map::new();
    body.insert("_limit".to_owned(), Value::from(limit));
    body.insert("_wallet_id".to_owned(), Value::String(wallet_id.to_owned()));

    let response = private_rpc(
        contact_data,
        outbound,
        "list_wallet_checkpoint_intervals",
        &Value::Object(body),
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    if !is_success(response.status) {
        if response_is_storage_missing(&response) {
            return Ok(Vec::new());
        }
        return Err(BuildError::Internal);
    }

    response
        .json::<Vec<IntervalRow>>()
        .map_err(|_| BuildError::Internal)
}

pub(super) fn history_interval_value(
    row: &IntervalRow,
    currency: &str,
    wallet_id: &str,
    wallet_name: Option<&str>,
) -> Value {
    let variance = to_number(&row.interval_variance);
    json!({
        "actual_delta": to_number(&row.actual_delta),
        "end_actual_balance": to_number(&row.end_actual_balance),
        "end_checked_at": row.end_checked_at,
        "end_checkpoint_id": row.end_checkpoint_id,
        "interval_variance": variance,
        "is_clean": variance == 0.0,
        "ledger_delta": to_number(&row.ledger_delta),
        "start_actual_balance": to_number(&row.start_actual_balance),
        "start_checked_at": row.start_checked_at,
        "start_checkpoint_id": row.start_checkpoint_id,
        "transaction_count": to_number(&row.transaction_count),
        "currency": currency,
        "wallet_id": wallet_id,
        "wallet_name": wallet_name,
    })
}

// ---------------------------------------------------------------------------
// Audit status RPC (get_wallet_checkpoint_audit_status)
// ---------------------------------------------------------------------------

pub(super) async fn list_wallet_audit_statuses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_ids: &[String],
) -> Result<Vec<AuditStatusRow>, BuildError> {
    if wallet_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut body = Map::new();
    body.insert(
        "_wallet_ids".to_owned(),
        Value::Array(wallet_ids.iter().cloned().map(Value::String).collect()),
    );

    let response = private_rpc(
        contact_data,
        outbound,
        "get_wallet_checkpoint_audit_status",
        &Value::Object(body),
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    if !is_success(response.status) {
        if response_is_storage_missing(&response) {
            return Ok(Vec::new());
        }
        return Err(BuildError::Internal);
    }

    response
        .json::<Vec<AuditStatusRow>>()
        .map_err(|_| BuildError::Internal)
}

pub(super) fn sanitize_audit_statuses_by_window(
    rows: Vec<AuditStatusRow>,
    window_starts_by_wallet_id: &HashMap<String, String>,
) -> Vec<Value> {
    if window_starts_by_wallet_id.is_empty() {
        return rows.iter().map(normalize_audit_status_value).collect();
    }

    rows.into_iter()
        .map(|row| {
            let visible = match row.latest_checked_at.as_deref() {
                None => true,
                Some(checked_at) => checkpoint_visible_for_wallet(
                    checked_at,
                    &row.wallet_id,
                    window_starts_by_wallet_id,
                ),
            };

            if visible {
                return normalize_audit_status_value(&row);
            }

            // Out-of-window: collapse to a no_checkpoint status seeded from the
            // ledger balance (matches sanitizeAuditStatusesByWindow).
            let ledger_balance = to_number(&row.ledger_balance);
            json!({
                "audited_balance": ledger_balance,
                "checkpoint_ledger_balance": Value::Null,
                "latest_actual_balance": Value::Null,
                "latest_checked_at": Value::Null,
                "latest_checkpoint_id": Value::Null,
                "ledger_balance": ledger_balance,
                "post_checkpoint_delta": 0.0,
                "post_checkpoint_transaction_count": 0.0,
                "status": "no_checkpoint",
                "variance": 0.0,
                "wallet_id": row.wallet_id,
            })
        })
        .collect()
}

fn normalize_audit_status_value(row: &AuditStatusRow) -> Value {
    let status = row
        .status
        .as_deref()
        .filter(|status| matches!(*status, "clean" | "no_checkpoint" | "unresolved"))
        .unwrap_or("no_checkpoint");

    json!({
        "audited_balance": to_number(&row.audited_balance),
        "checkpoint_ledger_balance": nullable_number(&row.checkpoint_ledger_balance),
        "latest_actual_balance": nullable_number(&row.latest_actual_balance),
        "latest_checked_at": row.latest_checked_at,
        "latest_checkpoint_id": row.latest_checkpoint_id,
        "ledger_balance": to_number(&row.ledger_balance),
        "post_checkpoint_delta": to_number(&row.post_checkpoint_delta),
        "post_checkpoint_transaction_count": to_number(&row.post_checkpoint_transaction_count),
        "status": status,
        "variance": to_number(&row.variance),
        "wallet_id": row.wallet_id,
    })
}
