use super::*;

pub(super) async fn load_workspace_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    invoice_safe_only: bool,
    wallet_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let select = if invoice_safe_only {
        INVOICE_SAFE_WALLET_SELECT
    } else {
        FULL_WALLET_SELECT
    };

    let mut params: Vec<(&str, String)> = vec![
        ("select", select.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc".to_owned()),
    ];
    if let Some(ids) = wallet_ids {
        params.push(("id", format!("in.({})", ids.join(","))));
    }

    let Some(url) = contact_data.rest_url("workspace_wallets", &params) else {
        return Err(());
    };
    let response = send_private_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let mut data = response.json::<Vec<Value>>().map_err(|_| ())?;

    if invoice_safe_only {
        return Ok(data);
    }

    attach_and_flatten_credit_data(contact_data, outbound, &mut data).await?;
    attach_wallet_audit_data(contact_data, outbound, &mut data).await;

    Ok(data)
}

async fn attach_and_flatten_credit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) -> Result<(), ()> {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.contains(&id.to_owned())
        {
            wallet_ids.push(id.to_owned());
        }
    }

    if wallet_ids.is_empty() {
        return Ok(());
    }

    let Some(url) = contact_data.rest_url(
        "credit_wallets",
        &[
            (
                "select",
                "wallet_id, limit, statement_date, payment_date".to_owned(),
            ),
            ("wallet_id", format!("in.({})", wallet_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let credit_rows = response.json::<Vec<CreditWalletRow>>().map_err(|_| ())?;
    let mut credit_by_wallet: std::collections::HashMap<String, &CreditWalletRow> =
        std::collections::HashMap::new();
    for row in &credit_rows {
        credit_by_wallet.insert(row.wallet_id.clone(), row);
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        if let (Some(id), Some(obj)) = (id, wallet.as_object_mut())
            && let Some(credit) = credit_by_wallet.get(&id)
        {
            obj.insert("limit".to_owned(), credit.limit.clone());
            obj.insert("statement_date".to_owned(), credit.statement_date.clone());
            obj.insert("payment_date".to_owned(), credit.payment_date.clone());
        }
    }

    Ok(())
}

async fn attach_wallet_audit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.contains(&id.to_owned())
        {
            wallet_ids.push(id.to_owned());
        }
    }

    if wallet_ids.is_empty() {
        return;
    }

    let statuses = match fetch_wallet_audit_statuses(contact_data, outbound, &wallet_ids).await {
        Ok(statuses) => statuses,
        Err(()) => return,
    };

    let mut by_wallet: std::collections::HashMap<String, &AuditStatusRow> =
        std::collections::HashMap::new();
    for status in &statuses {
        by_wallet.insert(status.wallet_id.clone(), status);
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        if let (Some(id), Some(obj)) = (id, wallet.as_object_mut())
            && let Some(status) = by_wallet.get(&id)
        {
            obj.insert(
                "audit_actual_balance".to_owned(),
                opt_number(status.latest_actual_balance.as_ref()),
            );
            obj.insert(
                "audit_balance".to_owned(),
                json!(checkpoint_number(status.audited_balance.as_ref())),
            );
            obj.insert(
                "audit_checkpoint_id".to_owned(),
                opt_string(&status.latest_checkpoint_id),
            );
            obj.insert(
                "audit_checked_at".to_owned(),
                opt_string(&status.latest_checked_at),
            );
            obj.insert(
                "audit_ledger_balance".to_owned(),
                json!(checkpoint_number(status.ledger_balance.as_ref())),
            );
            obj.insert(
                "audit_post_checkpoint_delta".to_owned(),
                json!(checkpoint_number(status.post_checkpoint_delta.as_ref())),
            );
            obj.insert(
                "audit_post_checkpoint_transaction_count".to_owned(),
                count_number(status.post_checkpoint_transaction_count.as_ref()),
            );
            obj.insert(
                "audit_status".to_owned(),
                json!(clamp_status(&status.status)),
            );
            obj.insert(
                "audit_variance".to_owned(),
                json!(checkpoint_number(status.variance.as_ref())),
            );
        }
    }
}

async fn fetch_wallet_audit_statuses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_ids: &[String],
) -> Result<Vec<AuditStatusRow>, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_WALLET_CHECKPOINT_AUDIT_STATUS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&AuditStatusRpcRequest {
        _wallet_ids: wallet_ids,
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

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response.json::<Vec<AuditStatusRow>>().unwrap_or_default())
}
