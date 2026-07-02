use super::*;

// ---------------------------------------------------------------------------
// Row decoding types (local to wallet access only)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RoleMemberRow {
    role_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct SummaryWalletRow {
    id: Option<String>,
    name: Option<String>,
    currency: Option<Value>,
    balance: Option<Value>,
    #[serde(rename = "type")]
    wallet_type: Option<String>,
    icon: Option<String>,
    image_src: Option<String>,
}

// ---------------------------------------------------------------------------
// Wallet access (listAccessibleCheckpointWallets)
// ---------------------------------------------------------------------------

pub(super) async fn list_accessible_checkpoint_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    has_manage_finance: bool,
) -> Result<CheckpointWalletAccess, ()> {
    let mut window_starts_by_wallet_id: HashMap<String, String> = HashMap::new();
    let mut restricted_wallet_ids: Option<Vec<String>> = None;

    if !has_manage_finance {
        let role_ids = role_ids_for_member(contact_data, outbound, ws_id, user_id).await?;
        if role_ids.is_empty() {
            return Ok(CheckpointWalletAccess {
                wallets: Vec::new(),
                window_starts_by_wallet_id,
            });
        }

        let whitelist_rows = whitelist_window_rows(contact_data, outbound, &role_ids).await?;
        window_starts_by_wallet_id = build_checkpoint_window_starts(&whitelist_rows);

        // Unique wallet ids (preserve first-seen order).
        let mut seen: HashMap<String, ()> = HashMap::new();
        let mut ids = Vec::new();
        for row in &whitelist_rows {
            if let Some(wallet_id) = row.wallet_id.as_ref()
                && seen.insert(wallet_id.clone(), ()).is_none()
            {
                ids.push(wallet_id.clone());
            }
        }

        if ids.is_empty() {
            return Ok(CheckpointWalletAccess {
                wallets: Vec::new(),
                window_starts_by_wallet_id,
            });
        }

        restricted_wallet_ids = Some(ids);
    }

    let wallets = fetch_summary_wallets(
        contact_data,
        outbound,
        ws_id,
        restricted_wallet_ids.as_deref(),
    )
    .await?;

    Ok(CheckpointWalletAccess {
        wallets,
        window_starts_by_wallet_id,
    })
}

pub(super) async fn role_ids_for_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    // workspace_role_members joined to workspace_roles!inner(ws_id) filtered by
    // ws_id. PostgREST embedded filter expressed as workspace_roles.ws_id=eq...
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<RoleMemberRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|row| row.role_id).collect())
}

pub(super) async fn whitelist_window_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_ids: &[String],
) -> Result<Vec<WalletWhitelistWindowRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_wallet_whitelist",
        &[
            ("select", "wallet_id,viewing_window,custom_days".to_owned()),
            ("role_id", format!("in.({})", role_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<WalletWhitelistWindowRow>>()
        .map_err(|_| ())
}

pub(super) async fn fetch_summary_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    restricted_wallet_ids: Option<&[String]>,
) -> Result<Vec<SummaryWallet>, ()> {
    let mut params = vec![
        (
            "select",
            "id,name,currency,balance,type,icon,image_src".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc".to_owned()),
    ];
    if let Some(ids) = restricted_wallet_ids {
        params.push(("id", format!("in.({})", ids.join(","))));
    }

    let Some(url) = contact_data.rest_url("workspace_wallets", &params) else {
        return Err(());
    };
    // private schema read.
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<SummaryWalletRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().map(normalize_summary_wallet).collect())
}

pub(super) fn normalize_summary_wallet(row: SummaryWalletRow) -> SummaryWallet {
    SummaryWallet {
        id: row.id.unwrap_or_default(),
        name: row.name,
        currency: row
            .currency
            .as_ref()
            .and_then(value_to_string)
            .unwrap_or_else(|| "USD".to_owned()),
        balance: to_number(&row.balance),
        wallet_type: row.wallet_type,
        icon: row.icon,
        image_src: row.image_src,
    }
}
