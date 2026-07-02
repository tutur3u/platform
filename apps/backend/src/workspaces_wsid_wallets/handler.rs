use super::*;

pub(super) async fn wallets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE);
    }
    let contact_data = &config.contact_data;

    let Some(user) = authenticated_finance_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let Ok(Some(ws_id)) = normalize_workspace_id(contact_data, outbound, raw_ws_id, &user).await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match is_workspace_member(contact_data, outbound, &ws_id, &user.id).await {
        Ok(true) => {}
        Ok(false) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    }

    let has_manage_finance = match permission(
        contact_data,
        outbound,
        &ws_id,
        MANAGE_FINANCE_PERMISSION,
        &user.id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let has_create_invoices = match permission(
        contact_data,
        outbound,
        &ws_id,
        CREATE_INVOICES_PERMISSION,
        &user.id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let has_view_transactions = match permission(
        contact_data,
        outbound,
        &ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        &user.id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let can_read_wallet_financial_fields = has_manage_finance || has_view_transactions;

    let default_invoice_wallet_id = if has_create_invoices {
        workspace_config(contact_data, outbound, &ws_id, DEFAULT_WALLET_CONFIG_ID)
            .await
            .unwrap_or_default()
    } else {
        None
    };

    let can_read_all_wallets_for_invoice_creation = if has_create_invoices {
        if default_invoice_wallet_id.is_none() {
            true
        } else {
            let can_change = match permission(
                contact_data,
                outbound,
                &ws_id,
                CHANGE_FINANCE_WALLETS_PERMISSION,
                &user.id,
            )
            .await
            {
                Ok(value) => value,
                Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
            };
            if can_change {
                true
            } else {
                match permission(
                    contact_data,
                    outbound,
                    &ws_id,
                    SET_FINANCE_WALLETS_ON_CREATE_PERMISSION,
                    &user.id,
                )
                .await
                {
                    Ok(value) => value,
                    Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
                }
            }
        }
    } else {
        false
    };

    if has_manage_finance {
        return match load_workspace_wallets(contact_data, outbound, &ws_id, false, None).await {
            Ok(data) => no_store_response(json_response(200, Value::Array(data))),
            Err(()) => message_response(500, ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE),
        };
    }

    if can_read_all_wallets_for_invoice_creation {
        return match load_workspace_wallets(contact_data, outbound, &ws_id, true, None).await {
            Ok(data) => no_store_response(json_response(200, Value::Array(data))),
            Err(()) => message_response(500, ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE),
        };
    }

    let default_invoice_wallet_ids: Vec<String> =
        default_invoice_wallet_id.clone().into_iter().collect();

    let role_ids = match fetch_role_ids(contact_data, outbound, &ws_id, &user.id).await {
        Ok(role_ids) => role_ids,
        Err(()) => return message_response(500, ERROR_FETCHING_USER_ROLES_MESSAGE),
    };

    if role_ids.is_empty() {
        if default_invoice_wallet_ids.is_empty() {
            return no_store_response(json_response(200, Value::Array(Vec::new())));
        }

        return match load_workspace_wallets(
            contact_data,
            outbound,
            &ws_id,
            !can_read_wallet_financial_fields,
            Some(&default_invoice_wallet_ids),
        )
        .await
        {
            Ok(data) => no_store_response(json_response(200, Value::Array(data))),
            Err(()) => message_response(500, ERROR_FETCHING_WALLET_DETAILS_MESSAGE),
        };
    }

    let whitelist = match fetch_whitelist(contact_data, outbound, &role_ids).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, ERROR_FETCHING_WHITELISTED_WALLETS_MESSAGE),
    };

    if whitelist.is_empty() && default_invoice_wallet_ids.is_empty() {
        return no_store_response(json_response(200, Value::Array(Vec::new())));
    }

    let mut wallet_ids: Vec<String> = Vec::new();
    for row in &whitelist {
        if let Some(id) = &row.wallet_id
            && !wallet_ids.contains(id)
        {
            wallet_ids.push(id.clone());
        }
    }
    for id in &default_invoice_wallet_ids {
        if !wallet_ids.contains(id) {
            wallet_ids.push(id.clone());
        }
    }

    let wallets = match load_workspace_wallets(
        contact_data,
        outbound,
        &ws_id,
        !can_read_wallet_financial_fields,
        Some(&wallet_ids),
    )
    .await
    {
        Ok(data) => data,
        Err(()) => return message_response(500, ERROR_FETCHING_WALLET_DETAILS_MESSAGE),
    };

    let wallet_map = build_wallet_window_map(&whitelist);

    let wallets_with_window: Vec<Value> = if can_read_wallet_financial_fields {
        wallets
            .into_iter()
            .map(|mut wallet| {
                if let Some(obj) = wallet.as_object_mut() {
                    let window = obj
                        .get("id")
                        .and_then(Value::as_str)
                        .and_then(|id| wallet_map.get(id));
                    if let Some(window) = window {
                        obj.insert("viewing_window".to_owned(), window.viewing_window.clone());
                        obj.insert("custom_days".to_owned(), window.custom_days.clone());
                    }
                }
                wallet
            })
            .collect()
    } else {
        wallets
    };

    no_store_response(json_response(200, Value::Array(wallets_with_window)))
}
