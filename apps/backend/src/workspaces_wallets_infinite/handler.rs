use super::*;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

pub(super) async fn wallets_infinite_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return internal_error_response("Error fetching transaction wallets");
    }

    // --- Auth ---------------------------------------------------------------
    let Some(access_token) = request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // --- Resolve workspace + permissions -----------------------------------
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(id)) => id,
            // Missing/None normalization or unauthorized permission context maps
            // to the legacy 401 "Unauthorized" from getFinanceRouteContext.
            Ok(None) => return message_response(401, UNAUTHORIZED_MESSAGE),
            Err(()) => return internal_error_response("Error fetching transaction wallets"),
        };

    let permissions = match effective_workspace_permissions_for_user(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(permissions)) => permissions,
        Ok(None) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return internal_error_response("Error fetching transaction wallets"),
    };

    // --- Load wallets (mirrors base wallets GET branching) ------------------
    let wallets = match load_visible_wallets(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &permissions,
    )
    .await
    {
        Ok(wallets) => wallets,
        Err(error) => return error,
    };

    // --- Apply infinite envelope -------------------------------------------
    finite_envelope_response(request.url, wallets)
}

/// Mirrors the base wallets `GET` permission tiers and returns the wallet rows
/// the caller is allowed to see.
pub(super) async fn load_visible_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    permissions: &EffectiveWorkspacePermissions,
) -> Result<Vec<Value>, BackendResponse> {
    let has_manage_finance = permissions.has("manage_finance");
    let has_create_invoices = permissions.has("create_invoices");
    let can_read_wallet_financial_fields =
        has_manage_finance || permissions.has("view_transactions");

    let default_invoice_wallet_id = if has_create_invoices {
        workspace_config_value(contact_data, outbound, ws_id, "default_wallet_id")
            .await
            .unwrap_or_default()
    } else {
        None
    };

    let can_read_all_for_invoice_creation = has_create_invoices
        && (default_invoice_wallet_id.is_none()
            || can_set_any_finance_wallet_on_create(permissions));

    // Tier 1: full manage_finance access.
    if has_manage_finance {
        return load_workspace_wallets(
            contact_data,
            outbound,
            ws_id,
            /* invoice_safe_only */ false,
            None,
        )
        .await
        .map_err(|_| internal_error_response("Error fetching transaction wallets"));
    }

    // Tier 2: invoice creators with override/no-default get every wallet
    // (invoice-safe fields only).
    if can_read_all_for_invoice_creation {
        return load_workspace_wallets(
            contact_data,
            outbound,
            ws_id,
            /* invoice_safe_only */ true,
            None,
        )
        .await
        .map_err(|_| internal_error_response("Error fetching transaction wallets"));
    }

    // Tier 3: wallet whitelist by role.
    let default_invoice_wallet_ids: Vec<String> = default_invoice_wallet_id
        .as_ref()
        .map(|id| vec![id.clone()])
        .unwrap_or_default();

    let user_role_ids = match workspace_user_role_ids(contact_data, outbound, ws_id, user_id).await
    {
        Ok(role_ids) => role_ids,
        Err(()) => return Err(internal_error_response("Error fetching user roles")),
    };

    if user_role_ids.is_empty() {
        if default_invoice_wallet_ids.is_empty() {
            return Ok(Vec::new());
        }

        let wallets = load_workspace_wallets(
            contact_data,
            outbound,
            ws_id,
            /* invoice_safe_only */ !can_read_wallet_financial_fields,
            Some(&default_invoice_wallet_ids),
        )
        .await
        .map_err(|_| internal_error_response("Error fetching wallet details"))?;

        return Ok(wallets);
    }

    let whitelist_rows = match wallet_whitelist_rows(contact_data, outbound, &user_role_ids).await {
        Ok(rows) => rows,
        Err(()) => {
            return Err(internal_error_response(
                "Error fetching whitelisted wallets",
            ));
        }
    };

    if whitelist_rows.is_empty() && default_invoice_wallet_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut wallet_ids: Vec<String> = Vec::new();
    for row in &whitelist_rows {
        if let Some(id) = row.wallet_id.as_ref()
            && !wallet_ids.iter().any(|existing| existing == id)
        {
            wallet_ids.push(id.clone());
        }
    }
    for id in &default_invoice_wallet_ids {
        if !wallet_ids.iter().any(|existing| existing == id) {
            wallet_ids.push(id.clone());
        }
    }

    let mut wallets = load_workspace_wallets(
        contact_data,
        outbound,
        ws_id,
        /* invoice_safe_only */ !can_read_wallet_financial_fields,
        Some(&wallet_ids),
    )
    .await
    .map_err(|_| internal_error_response("Error fetching wallet details"))?;

    // Attach the most-permissive viewing window per wallet (only when the caller
    // can read financial fields, mirroring legacy behavior).
    if can_read_wallet_financial_fields {
        let window_map = build_wallet_window_map(&whitelist_rows);
        for wallet in &mut wallets {
            let id = wallet.get("id").and_then(Value::as_str).map(str::to_owned);
            let window = id.as_ref().and_then(|id| window_map.get(id));
            if let Some(object) = wallet.as_object_mut() {
                match window {
                    Some(window) => {
                        object.insert(
                            "viewing_window".to_owned(),
                            window
                                .viewing_window
                                .clone()
                                .map(Value::String)
                                .unwrap_or(Value::Null),
                        );
                        object.insert(
                            "custom_days".to_owned(),
                            window.custom_days.map(Value::from).unwrap_or(Value::Null),
                        );
                    }
                    None => {
                        // Legacy spreads `walletMap.get(id)?.viewing_window`,
                        // which yields `undefined` and is dropped by JSON when
                        // there is no whitelist entry for this wallet. Mirror
                        // that by leaving both keys absent.
                    }
                }
            }
        }
    }

    Ok(wallets)
}

// ---------------------------------------------------------------------------
// Infinite-scroll envelope
// ---------------------------------------------------------------------------

pub(super) fn finite_envelope_response(
    request_url: Option<&str>,
    wallets: Vec<Value>,
) -> BackendResponse {
    let limit = parse_bounded_integer(
        query_value(request_url, "limit"),
        DEFAULT_LIMIT,
        1,
        MAX_LIMIT,
    );
    let offset = parse_bounded_integer(query_value(request_url, "offset"), 0, 0, 1_000_000_000);
    let normalized_query = query_value(request_url, "q").map(|value| value.trim().to_lowercase());

    let filtered: Vec<Value> = match normalized_query.as_deref() {
        Some(query) if !query.is_empty() => wallets
            .into_iter()
            .filter(|wallet| wallet_name(wallet).to_lowercase().contains(query))
            .collect(),
        // Legacy only filters when `q` is a non-empty (trimmed) string.
        _ => wallets,
    };

    let total = filtered.len() as i64;
    let start = offset.min(total);
    let end = (offset + limit).min(total);
    let data: Vec<Value> = filtered[start as usize..end as usize].to_vec();
    let data_len = data.len() as i64;

    let next_offset = if offset + data_len < total {
        Some(offset + data_len)
    } else {
        None
    };

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "hasMore": next_offset.is_some(),
            "nextOffset": next_offset,
            "totalCount": total,
        }),
    ))
}

pub(super) fn wallet_name(wallet: &Value) -> String {
    wallet
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

pub(super) fn parse_bounded_integer(
    value: Option<String>,
    fallback: i64,
    min: i64,
    max: i64,
) -> i64 {
    let Some(value) = value else {
        return fallback;
    };
    // Mirror JS `Number.parseInt(value, 10)` (leading digits, ignores trailing).
    match parse_leading_integer(&value) {
        Some(parsed) => parsed.clamp(min, max),
        None => fallback,
    }
}

pub(super) fn parse_leading_integer(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.chars().peekable();
    let mut result = String::new();

    if matches!(chars.peek(), Some('+') | Some('-')) {
        result.push(chars.next().unwrap());
    }

    while let Some(&character) = chars.peek() {
        if character.is_ascii_digit() {
            result.push(character);
            chars.next();
        } else {
            break;
        }
    }

    if result.is_empty() || result == "+" || result == "-" {
        return None;
    }

    result.parse::<i64>().ok()
}
