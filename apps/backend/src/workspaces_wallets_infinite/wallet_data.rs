use super::*;

// ---------------------------------------------------------------------------
// Workspace config + role lookups (public schema)
// ---------------------------------------------------------------------------

pub(super) async fn workspace_config_value(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    config_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_configs",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{config_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceConfigRow>(&response)?
        .and_then(|row| row.value)
        .filter(|value| !value.is_empty()))
}

pub(super) async fn workspace_user_role_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            ("select", "role_id,workspace_roles!inner(ws_id)".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<RoleMemberRow>>().map_err(|_| ())?;
    let mut role_ids: Vec<String> = Vec::new();
    for row in rows {
        if let Some(id) = row.role_id
            && !role_ids.iter().any(|existing| existing == &id)
        {
            role_ids.push(id);
        }
    }
    Ok(role_ids)
}

pub(super) async fn wallet_whitelist_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_ids: &[String],
) -> Result<Vec<WhitelistRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            ("select", "wallet_id,viewing_window,custom_days".to_owned()),
            ("role_id", in_filter(role_ids)),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<WhitelistRow>>().map_err(|_| ())
}

pub(super) fn build_wallet_window_map(rows: &[WhitelistRow]) -> BTreeMap<String, WalletWindow> {
    let mut map: BTreeMap<String, WalletWindow> = BTreeMap::new();
    for row in rows {
        let Some(wallet_id) = row.wallet_id.as_ref() else {
            continue;
        };
        let candidate = WalletWindow {
            viewing_window: row.viewing_window.clone(),
            custom_days: row.custom_days,
        };
        match map.get(wallet_id) {
            None => {
                map.insert(wallet_id.clone(), candidate);
            }
            Some(existing) => {
                let existing_days =
                    viewing_window_days(existing.viewing_window.as_deref(), existing.custom_days);
                let current_days =
                    viewing_window_days(candidate.viewing_window.as_deref(), candidate.custom_days);
                if current_days > existing_days {
                    map.insert(wallet_id.clone(), candidate);
                }
            }
        }
    }
    map
}

pub(super) fn viewing_window_days(window: Option<&str>, custom_days: Option<i64>) -> i64 {
    match window {
        None => 30,
        Some("1_day") => 1,
        Some("3_days") => 3,
        Some("7_days") => 7,
        Some("2_weeks") => 14,
        Some("1_month") => 30,
        Some("1_quarter") => 90,
        Some("1_year") => 365,
        Some("custom") => match custom_days {
            Some(days) if days >= 1 => days,
            _ => 30,
        },
        Some(_) => 30,
    }
}

// ---------------------------------------------------------------------------
// Wallet DB queries
// ---------------------------------------------------------------------------

/// Loads `private.workspace_wallets` rows for a workspace, optionally filtered
/// to a set of wallet ids, and attaches credit + audit data the way the legacy
/// `loadWorkspaceWallets` helper does.
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
        params.push(("id", in_filter(ids)));
    }

    let Some(url) = contact_data.rest_url("workspace_wallets", &params) else {
        return Err(());
    };
    let response =
        send_private_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let mut wallets = response.json::<Vec<Value>>().map_err(|_| ())?;

    if invoice_safe_only {
        // Invoice-safe select never requests credit data and never attaches
        // audit data (legacy returns the rows verbatim).
        return Ok(wallets);
    }

    // Attach credit data (FULL_WALLET_SELECT mirrors the legacy
    // `credit_wallets(limit, statement_date, payment_date)` relation, flattened).
    attach_wallet_credit_data(contact_data, outbound, &mut wallets).await?;

    // Attach best-effort audit data (storage-missing failures are swallowed and
    // the wallets returned unchanged, matching legacy behavior).
    attach_wallet_audit_data(contact_data, outbound, &mut wallets).await;

    Ok(wallets)
}

/// Mirrors `attachWalletCreditData` + `flattenWalletCreditData`: looks up the
/// matching `credit_wallets` row per wallet id and flattens
/// `{ limit, statement_date, payment_date }` onto each wallet.
pub(super) async fn attach_wallet_credit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) -> Result<(), ()> {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.iter().any(|existing| existing == id)
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
                "wallet_id,limit,statement_date,payment_date".to_owned(),
            ),
            ("wallet_id", in_filter(&wallet_ids)),
        ],
    ) else {
        return Err(());
    };
    // credit_wallets lives in the public schema.
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let credit_rows = response.json::<Vec<CreditWalletRow>>().map_err(|_| ())?;
    let mut credit_by_id: BTreeMap<String, &CreditWalletRow> = BTreeMap::new();
    for row in &credit_rows {
        if let Some(id) = row.wallet_id.as_ref() {
            credit_by_id.insert(id.clone(), row);
        }
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        let credit = id.as_ref().and_then(|id| credit_by_id.get(id).copied());
        if let (Some(object), Some(credit)) = (wallet.as_object_mut(), credit) {
            // Flatten matches `flattenWalletCreditData`.
            insert_optional_number(object, "limit", credit.limit);
            insert_optional_number(object, "statement_date", credit.statement_date);
            insert_optional_number(object, "payment_date", credit.payment_date);
        }
    }

    Ok(())
}

/// Mirrors `attachWalletAuditData` + `listWalletAuditStatuses`: calls the
/// `private.get_wallet_checkpoint_audit_status` RPC and decorates each wallet
/// with `audit_*` fields. Errors are swallowed (wallets returned unchanged),
/// matching the legacy try/catch and storage-missing fallbacks.
pub(super) async fn attach_wallet_audit_data(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallets: &mut [Value],
) {
    let mut wallet_ids: Vec<String> = Vec::new();
    for wallet in wallets.iter() {
        if let Some(id) = wallet.get("id").and_then(Value::as_str)
            && !wallet_ids.iter().any(|existing| existing == id)
        {
            wallet_ids.push(id.to_owned());
        }
    }

    if wallet_ids.is_empty() {
        return;
    }

    let Some(url) = contact_data.rpc_url("get_wallet_checkpoint_audit_status") else {
        return;
    };
    let body = json!({ "_wallet_ids": wallet_ids }).to_string();
    let Some(service_role_key) = contact_data.service_role_key() else {
        return;
    };
    let authorization = format!("Bearer {service_role_key}");

    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
    else {
        return;
    };

    if !is_success_status(response.status) {
        // Storage-missing or any error -> swallow, wallets unchanged.
        return;
    }

    let Ok(statuses) = response.json::<Vec<AuditStatusRow>>() else {
        return;
    };

    let mut status_by_id: BTreeMap<String, &AuditStatusRow> = BTreeMap::new();
    for status in &statuses {
        if let Some(id) = status.wallet_id.as_ref() {
            status_by_id.insert(id.clone(), status);
        }
    }

    for wallet in wallets.iter_mut() {
        let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
        let status = id.as_ref().and_then(|id| status_by_id.get(id).copied());
        if let (Some(object), Some(status)) = (wallet.as_object_mut(), status) {
            object.insert(
                "audit_actual_balance".to_owned(),
                opt_number_value(status.latest_actual_balance),
            );
            object.insert(
                "audit_balance".to_owned(),
                number_value(status.audited_balance),
            );
            object.insert(
                "audit_checkpoint_id".to_owned(),
                status
                    .latest_checkpoint_id
                    .clone()
                    .map(Value::String)
                    .unwrap_or(Value::Null),
            );
            object.insert(
                "audit_checked_at".to_owned(),
                status
                    .latest_checked_at
                    .clone()
                    .map(Value::String)
                    .unwrap_or(Value::Null),
            );
            object.insert(
                "audit_ledger_balance".to_owned(),
                number_value(status.ledger_balance),
            );
            object.insert(
                "audit_post_checkpoint_delta".to_owned(),
                number_value(status.post_checkpoint_delta),
            );
            object.insert(
                "audit_post_checkpoint_transaction_count".to_owned(),
                Value::from(status.post_checkpoint_transaction_count.unwrap_or(0)),
            );
            object.insert(
                "audit_status".to_owned(),
                Value::String(normalize_audit_status(status.status.as_deref())),
            );
            object.insert("audit_variance".to_owned(), number_value(status.variance));
        }
    }
}
