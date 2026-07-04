use super::*;

pub(super) async fn history_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let limit = checkpoint_limit(request.url);

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
        // Legacy returns 401 Unauthorized when there is no authenticated user or
        // the workspace cannot be resolved (getFinanceRouteContext path).
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, "Unauthorized");
        }
        // Legacy returns 403 "Insufficient permissions" when view_transactions is
        // absent (getWalletRouteContext path).
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, ERROR_FETCHING_HISTORY);
        }
    };

    match build_history(config, outbound, &authorization, limit).await {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(BuildError::Checkpoints) => message_response(500, ERROR_FETCHING_CHECKPOINTS),
        Err(BuildError::Internal) => message_response(500, ERROR_FETCHING_HISTORY),
    }
}

pub(super) async fn build_history(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    limit: i64,
) -> Result<Value, BuildError> {
    let contact_data = &config.contact_data;
    let ws_id = &authorization.ws_id;
    let user_id = &authorization.user_id;

    // manage_finance holders see every wallet; otherwise wallets are limited to
    // the role whitelist.
    let has_manage_finance = has_workspace_permission(
        contact_data,
        outbound,
        ws_id,
        MANAGE_FINANCE_PERMISSION,
        user_id,
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    let access = list_accessible_checkpoint_wallets(
        contact_data,
        outbound,
        ws_id,
        user_id,
        has_manage_finance,
    )
    .await
    .map_err(|_| BuildError::Internal)?;

    let wallet_ids: Vec<String> = access.wallets.iter().map(|w| w.id.clone()).collect();

    if wallet_ids.is_empty() {
        return Ok(empty_payload());
    }

    // --- Checkpoints from private.workspace_wallet_checkpoints --------------
    let oldest_window_start = oldest_window_start(&access.window_starts_by_wallet_id);
    let checkpoint_rows = match fetch_checkpoint_rows(
        contact_data,
        outbound,
        &wallet_ids,
        oldest_window_start.as_deref(),
        limit,
    )
    .await
    {
        Ok(rows) => rows,
        Err(CheckpointFetchError::StorageMissing) => {
            // Wallets are still returned in this degraded shape.
            return Ok(wallets_only_payload(&access.wallets));
        }
        Err(CheckpointFetchError::Failed) => return Err(BuildError::Checkpoints),
    };

    let checkpoint_rows =
        filter_checkpoint_rows_by_window(checkpoint_rows, &access.window_starts_by_wallet_id);

    // Enrich every checkpoint with a fresh ledger balance (per-row RPC).
    let mut checkpoints = Vec::with_capacity(checkpoint_rows.len());
    for row in &checkpoint_rows {
        let current_ledger = ledger_balance_for_read(
            contact_data,
            outbound,
            &row.wallet_id,
            &row.checked_at,
            to_number(&row.ledger_balance),
        )
        .await
        .map_err(|_| BuildError::Internal)?;
        checkpoints.push(normalize_checkpoint(row, Some(current_ledger)));
    }

    // Latest checkpoint per wallet (rows are already ordered newest-first).
    let mut seen_wallets: HashMap<String, ()> = HashMap::new();
    let mut latest_checkpoints = Vec::new();
    for row in &checkpoint_rows {
        if seen_wallets.contains_key(&row.wallet_id) {
            continue;
        }
        seen_wallets.insert(row.wallet_id.clone(), ());
        let current_ledger = ledger_balance_for_read(
            contact_data,
            outbound,
            &row.wallet_id,
            &row.checked_at,
            to_number(&row.ledger_balance),
        )
        .await
        .map_err(|_| BuildError::Internal)?;
        latest_checkpoints.push(normalize_checkpoint(row, Some(current_ledger)));
    }

    // --- Intervals per wallet ----------------------------------------------
    let wallet_by_id: HashMap<&str, &SummaryWallet> =
        access.wallets.iter().map(|w| (w.id.as_str(), w)).collect();
    let mut intervals: Vec<Value> = Vec::new();
    for wallet_id in &wallet_ids {
        let raw_intervals =
            list_checkpoint_intervals(contact_data, outbound, wallet_id, limit).await?;
        let wallet = wallet_by_id.get(wallet_id.as_str());
        let currency = wallet
            .map(|w| w.currency.clone())
            .unwrap_or_else(|| "USD".to_owned());
        let wallet_name = wallet.and_then(|w| w.name.clone());

        for interval in raw_intervals {
            if !interval_visible(&interval, wallet_id, &access.window_starts_by_wallet_id) {
                continue;
            }
            intervals.push(history_interval_value(
                &interval,
                &currency,
                wallet_id,
                wallet_name.as_deref(),
            ));
        }
    }
    // intervals.sort((a, b) => b.end_checked_at.localeCompare(a.end_checked_at))
    intervals.sort_by(|a, b| {
        let a_key = a
            .get("end_checked_at")
            .and_then(Value::as_str)
            .unwrap_or("");
        let b_key = b
            .get("end_checked_at")
            .and_then(Value::as_str)
            .unwrap_or("");
        b_key.cmp(a_key)
    });

    // --- Audit statuses -----------------------------------------------------
    let audit_statuses = list_wallet_audit_statuses(contact_data, outbound, &wallet_ids).await?;
    let audit_statuses =
        sanitize_audit_statuses_by_window(audit_statuses, &access.window_starts_by_wallet_id);

    // --- Totals -------------------------------------------------------------
    let totals = summarize_checkpoint_totals(&latest_checkpoints);

    Ok(json!({
        "audit_statuses": audit_statuses,
        "checkpoints": checkpoints.iter().map(checkpoint_value).collect::<Vec<_>>(),
        "intervals": intervals,
        "latest_checkpoints": latest_checkpoints.iter().map(checkpoint_value).collect::<Vec<_>>(),
        "totals_by_currency": totals,
        "wallets": access.wallets.iter().map(summary_wallet_value).collect::<Vec<_>>(),
    }))
}
