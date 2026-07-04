use super::*;

// ---------------------------------------------------------------------------
// Checkpoint rows
// ---------------------------------------------------------------------------

pub(super) async fn fetch_checkpoint_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_ids: &[String],
    oldest_window_start: Option<&str>,
    limit: i64,
) -> Result<Vec<CheckpointRow>, CheckpointFetchError> {
    let mut params = vec![
        ("select", WALLET_CHECKPOINT_SELECT.to_owned()),
        ("wallet_id", format!("in.({})", wallet_ids.join(","))),
        // .order('checked_at', desc).order('created_at', desc)
        ("order", "checked_at.desc,created_at.desc".to_owned()),
        ("limit", (limit * wallet_ids.len() as i64).to_string()),
    ];
    if let Some(window_start) = oldest_window_start {
        params.push(("checked_at", format!("gte.{window_start}")));
    }

    let Some(url) = contact_data.rest_url("workspace_wallet_checkpoints", &params) else {
        return Err(CheckpointFetchError::Failed);
    };
    let response = service_role_get(contact_data, outbound, &url, true)
        .await
        .map_err(|_| CheckpointFetchError::Failed)?;

    if !is_success(response.status) {
        if response_is_storage_missing(&response) {
            return Err(CheckpointFetchError::StorageMissing);
        }
        return Err(CheckpointFetchError::Failed);
    }

    response
        .json::<Vec<CheckpointRow>>()
        .map_err(|_| CheckpointFetchError::Failed)
}

pub(super) fn normalize_checkpoint(
    row: &CheckpointRow,
    current_ledger_balance: Option<f64>,
) -> NormalizedCheckpoint {
    let actual_balance = to_number(&row.actual_balance);
    let ledger_balance = to_number(&row.ledger_balance);
    let current_ledger = current_ledger_balance.unwrap_or(ledger_balance);

    NormalizedCheckpoint {
        actual_balance,
        checked_at: row.checked_at.clone(),
        created_at: row.created_at.clone(),
        created_by: row.created_by.clone(),
        currency: row.currency.clone().unwrap_or_default(),
        current_ledger_balance: current_ledger,
        current_variance: actual_balance - current_ledger,
        id: row.id.clone(),
        ledger_balance,
        note: row.note.clone(),
        original_variance: actual_balance - ledger_balance,
        updated_at: row.updated_at.clone(),
        wallet_id: row.wallet_id.clone(),
    }
}

pub(super) fn checkpoint_value(checkpoint: &NormalizedCheckpoint) -> Value {
    json!({
        "actual_balance": checkpoint.actual_balance,
        "checked_at": checkpoint.checked_at,
        "created_at": checkpoint.created_at,
        "created_by": checkpoint.created_by,
        "currency": checkpoint.currency,
        "current_ledger_balance": checkpoint.current_ledger_balance,
        "current_variance": checkpoint.current_variance,
        "id": checkpoint.id,
        "ledger_balance": checkpoint.ledger_balance,
        "note": checkpoint.note,
        "original_variance": checkpoint.original_variance,
        "updated_at": checkpoint.updated_at,
        "wallet_id": checkpoint.wallet_id,
    })
}

pub(super) fn summary_wallet_value(wallet: &SummaryWallet) -> Value {
    json!({
        "balance": wallet.balance,
        "currency": wallet.currency,
        "icon": wallet.icon,
        "id": wallet.id,
        "image_src": wallet.image_src,
        "name": wallet.name,
        "type": wallet.wallet_type,
    })
}
