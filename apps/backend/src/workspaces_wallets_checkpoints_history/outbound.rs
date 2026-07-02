use super::*;

// ---------------------------------------------------------------------------
// Permission RPC (has_workspace_permission), file-local copy of finance_auth's
// private helper since it is not exported.
// ---------------------------------------------------------------------------

pub(super) async fn has_workspace_permission(
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
    let body = json!({
        "p_permission": permission,
        "p_user_id": user_id,
        "p_ws_id": ws_id,
    })
    .to_string();
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

    if !is_success(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

pub(super) async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

pub(super) async fn private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &Value,
) -> Result<OutboundResponse, ()> {
    let rpc_url = contact_data.rpc_url(function).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body_text = serde_json::to_string(body).map_err(|_| ())?;

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body_text),
        )
        .await
        .map_err(|_| ())
}

/// Heuristic equivalent of `isCheckpointStorageMissing`: a non-2xx response
/// whose body mentions checkpoint storage objects + a "missing" indicator.
pub(super) fn response_is_storage_missing(response: &OutboundResponse) -> bool {
    let Ok(value) = response.json::<Value>() else {
        return false;
    };
    let text = error_text(&value).to_lowercase();

    let mentions = text.contains("workspace_wallet_checkpoints")
        || text.contains("wallet_checkpoint")
        || text.contains("get_wallet_ledger_balance_at")
        || text.contains("list_wallet_checkpoint_intervals")
        || text.contains("create_workspace_wallet_checkpoints_batch")
        || text.contains("get_wallet_checkpoint_audit_status")
        || text.contains("create_wallet_checkpoint_reconciliation");

    if !mentions {
        return false;
    }

    let code = value.get("code").and_then(Value::as_str).unwrap_or("");
    if matches!(code, "42P01" | "42883" | "PGRST202" | "PGRST205") {
        return true;
    }

    text.contains("does not exist")
        || text.contains("could not find")
        || text.contains("schema cache")
}

pub(super) fn error_text(value: &Value) -> String {
    ["message", "details", "hint"]
        .iter()
        .filter_map(|key| value.get(*key).and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}
