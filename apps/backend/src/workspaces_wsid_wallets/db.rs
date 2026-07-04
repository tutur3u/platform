use super::*;

// ---------------------------------------------------------------------------
// Viewing-window helper
// ---------------------------------------------------------------------------

pub(super) struct WalletWindow {
    pub(super) viewing_window: Value,
    pub(super) custom_days: Value,
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
// Role membership + wallet whitelist
// ---------------------------------------------------------------------------

pub(super) async fn fetch_role_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            ("select", "role_id, workspace_roles!inner(ws_id)".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RoleMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.role_id)
        .collect())
}

pub(super) async fn fetch_whitelist(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_ids: &[String],
) -> Result<Vec<WhitelistRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            (
                "select",
                "wallet_id, viewing_window, custom_days".to_owned(),
            ),
            ("role_id", format!("in.({})", role_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<WhitelistRow>>().map_err(|_| ())
}

pub(super) fn build_wallet_window_map(
    whitelist: &[WhitelistRow],
) -> std::collections::HashMap<String, WalletWindow> {
    let mut map: std::collections::HashMap<String, (Option<String>, Option<i64>)> =
        std::collections::HashMap::new();

    for item in whitelist {
        let Some(wallet_id) = &item.wallet_id else {
            continue;
        };
        match map.get(wallet_id) {
            None => {
                map.insert(
                    wallet_id.clone(),
                    (item.viewing_window.clone(), item.custom_days),
                );
            }
            Some((existing_window, existing_custom)) => {
                let existing_days =
                    viewing_window_days(existing_window.as_deref(), *existing_custom);
                let current_days =
                    viewing_window_days(item.viewing_window.as_deref(), item.custom_days);
                if current_days > existing_days {
                    map.insert(
                        wallet_id.clone(),
                        (item.viewing_window.clone(), item.custom_days),
                    );
                }
            }
        }
    }

    map.into_iter()
        .map(|(wallet_id, (window, custom))| {
            (
                wallet_id,
                WalletWindow {
                    viewing_window: window.map_or(Value::Null, Value::String),
                    custom_days: custom.map_or(Value::Null, |c| json!(c)),
                },
            )
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Workspace config
// ---------------------------------------------------------------------------

pub(super) async fn workspace_config(
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
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceConfigRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .filter(|value| !value.is_empty()))
}

// ---------------------------------------------------------------------------
// Permissions (has_workspace_permission RPC)
// ---------------------------------------------------------------------------

pub(super) async fn permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

pub(super) async fn is_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_public_rest_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .is_empty())
}
