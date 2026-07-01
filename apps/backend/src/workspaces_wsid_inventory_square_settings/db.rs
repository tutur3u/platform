use super::*;

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

pub(super) async fn load_square_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<SquareSettingsResponse, ()> {
    // Parallel fetch of the three private-schema tables.
    let (settings_result, connections_result, app_credentials_result) = futures_join(
        fetch_settings_row(contact_data, outbound, ws_id),
        fetch_connection_rows(contact_data, outbound, ws_id),
        fetch_app_credential_rows(contact_data, outbound, ws_id),
    )
    .await;

    let settings_row = settings_result?;
    let connection_rows = connections_result?;
    let app_credential_rows = app_credentials_result?;

    // Effective environment: defaults to "sandbox" when no row exists.
    let environment = settings_row
        .as_ref()
        .and_then(|r| r.environment.clone())
        .unwrap_or_else(|| "sandbox".to_owned());

    let readiness = compute_readiness(
        &environment,
        settings_row.as_ref(),
        &connection_rows,
        &app_credential_rows,
    );

    let connections = connection_rows.into_iter().map(map_connection).collect();
    let app_credentials = app_credential_rows
        .into_iter()
        .map(map_app_credential)
        .collect();

    Ok(SquareSettingsResponse {
        ws_id: ws_id.to_owned(),
        environment,
        location_id: settings_row.as_ref().and_then(|r| r.location_id.clone()),
        location_name: settings_row.as_ref().and_then(|r| r.location_name.clone()),
        device_id: settings_row.as_ref().and_then(|r| r.device_id.clone()),
        device_name: settings_row.as_ref().and_then(|r| r.device_name.clone()),
        sandbox_device_id: settings_row
            .as_ref()
            .and_then(|r| r.sandbox_device_id.clone()),
        readiness,
        app_credentials,
        connections,
    })
}

/// Mirrors `computeReadiness` from `square/settings.ts`.
pub(super) fn compute_readiness(
    environment: &str,
    settings: Option<&SquareSettingsRow>,
    connections: &[SquareConnectionRow],
    app_credentials: &[SquareAppCredentialRow],
) -> ReadinessResponse {
    let mut issues: Vec<String> = Vec::new();

    let connection = connections
        .iter()
        .find(|c| c.environment.as_deref() == Some(environment));

    if connection.and_then(|c| c.status.as_deref()) != Some("ready") {
        issues.push("connection_missing".to_owned());
    }

    if connection.and_then(|c| c.auth_method.as_deref()) == Some("oauth") {
        let app_credential = app_credentials
            .iter()
            .find(|a| a.environment.as_deref() == Some(environment));

        let conn_scopes: Vec<&str> = connection
            .and_then(|c| c.scopes.as_ref())
            .map(|s| s.iter().map(String::as_str).collect())
            .unwrap_or_default();

        let scopes_missing = SQUARE_OAUTH_SCOPES
            .iter()
            .any(|required| !conn_scopes.contains(required));
        if scopes_missing {
            issues.push("scopes_missing".to_owned());
        }

        let has_app_credentials = app_credential
            .map(|a| a.application_id.is_some() && a.application_secret_encrypted.is_some())
            .unwrap_or(false);
        if !has_app_credentials {
            issues.push("app_credentials_missing".to_owned());
        }
    }

    let has_webhook_key = connection
        .and_then(|c| c.webhook_signature_key_encrypted.as_deref())
        .is_some();
    if !has_webhook_key {
        issues.push("webhook_signature_missing".to_owned());
    }

    let has_location = settings.and_then(|s| s.location_id.as_deref()).is_some();
    if !has_location {
        issues.push("location_missing".to_owned());
    }

    let usable_device = if environment == "sandbox" {
        settings.and_then(|s| s.sandbox_device_id.as_deref().or(s.device_id.as_deref()))
    } else {
        settings.and_then(|s| s.device_id.as_deref())
    };
    if usable_device.is_none() {
        issues.push("device_missing".to_owned());
    }

    let ready = issues.is_empty();
    ReadinessResponse { ready, issues }
}

pub(super) fn map_connection(row: SquareConnectionRow) -> ConnectionResponse {
    ConnectionResponse {
        environment: row.environment.unwrap_or_default(),
        auth_method: row.auth_method.unwrap_or_default(),
        merchant_id: row.merchant_id,
        access_token_last4: row.access_token_last4,
        access_token_fingerprint: row.access_token_fingerprint,
        refresh_token_last4: row.refresh_token_last4,
        token_expires_at: row.token_expires_at,
        scopes: row.scopes.unwrap_or_default(),
        status: row.status.unwrap_or_default(),
        last_validated_at: row.last_validated_at,
        last_error: row.last_error,
        updated_at: row.updated_at,
        webhook_signature_key_last4: row.webhook_signature_key_last4,
    }
}

pub(super) fn map_app_credential(row: SquareAppCredentialRow) -> AppCredentialResponse {
    AppCredentialResponse {
        environment: row.environment.unwrap_or_default(),
        application_id: row.application_id,
        application_secret_last4: row.application_secret_last4,
        application_secret_fingerprint: row.application_secret_fingerprint,
        oauth_redirect_url: row.oauth_redirect_url,
        webhook_notification_url: row.webhook_notification_url,
        updated_at: row.updated_at,
    }
}

pub(super) async fn fetch_settings_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<SquareSettingsRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_square_settings",
        &[
            (
                "select",
                "environment,location_id,location_name,device_id,device_name,sandbox_device_id"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<SquareSettingsRow>(&response)
}

pub(super) async fn fetch_connection_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<SquareConnectionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_square_connections",
        &[
            (
                "select",
                "environment,auth_method,merchant_id,access_token_fingerprint,access_token_last4,refresh_token_last4,token_expires_at,scopes,webhook_signature_key_encrypted,webhook_signature_key_last4,status,last_validated_at,last_error,updated_at"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "environment.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<SquareConnectionRow>>().map_err(|_| ())
}

pub(super) async fn fetch_app_credential_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<SquareAppCredentialRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_square_app_credentials",
        &[
            (
                "select",
                "environment,application_id,application_secret_encrypted,application_secret_fingerprint,application_secret_last4,oauth_redirect_url,webhook_notification_url,updated_at"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "environment.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<SquareAppCredentialRow>>()
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Sequential join helper
// ---------------------------------------------------------------------------

/// Tiny sequential join: runs three futures one after the other and returns
/// all three results as a tuple.  This avoids pulling in `futures` as a new
/// dependency while still allowing the call site to look like a parallel join.
///
/// # Note
///
/// For a genuine parallel fetch the crate would need `futures::join!` or
/// `tokio::join!`.  Because the porting contract forbids adding dependencies
/// and `tokio::join!` is not currently used elsewhere in this crate, the
/// three fetches run sequentially here.  The latency impact is minimal
/// compared with the auth-lookup round-trips that precede them.
pub(super) async fn futures_join<A, B, C, FA, FB, FC>(fa: FA, fb: FB, fc: FC) -> (A, B, C)
where
    FA: std::future::Future<Output = A>,
    FB: std::future::Future<Output = B>,
    FC: std::future::Future<Output = C>,
{
    let a = fa.await;
    let b = fb.await;
    let c = fc.await;
    (a, b, c)
}
