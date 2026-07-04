use super::*;

// ---------------------------------------------------------------------------
// Row models (only the columns we read directly; full rows are preserved as
// `Value` where the legacy code uses `select('*')`).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

// ---------------------------------------------------------------------------
// Binding / data queries (service-role REST, mirroring the sibling handler)
// ---------------------------------------------------------------------------

pub(super) async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role_request(contact_data, outbound, &url).await
        && is_success(response.status)
        && let Ok(Some(row)) = decode_first_row::<BindingRow>(&response)
    {
        return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
    }
    // Any binding-table failure falls through to the secrets dual-read.

    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!("in.({ENABLED_SECRET},{CANONICAL_ID_SECRET})"),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
    let canonical_id = rows
        .iter()
        .find(|row| row.name.as_deref() == Some(CANONICAL_ID_SECRET))
        .and_then(|row| row.value.clone());
    let enabled = rows.iter().any(|row| {
        row.name.as_deref() == Some(ENABLED_SECRET) && row.value.as_deref() == Some("true")
    });

    Ok((canonical_id, enabled))
}

pub(super) async fn canonical_project_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<Value>(&response)
}

pub(super) async fn list_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
    extra: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let mut params: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];
    params.extend(extra.iter().cloned());

    let Some(url) = contact_data.rest_url(table, &params) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

pub(super) async fn list_rows_by_entry_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
    entry_ids: &[String],
) -> Result<Vec<Value>, ()> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    let in_clause = format!("in.({})", entry_ids.join(","));
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("entry_id", in_clause),
            ("order", "sort_order.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

pub(super) async fn send_caller_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

pub(super) async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

pub(super) fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

pub(super) fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}
