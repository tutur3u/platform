use serde::Deserialize;
use std::collections::HashMap;

use crate::{
    APPLICATION_JSON, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

#[derive(Deserialize)]
struct ConfigRow {
    id: String,
    value: Option<String>,
}

#[derive(Deserialize)]
struct GroupRow {
    group_id: Option<String>,
}

pub(super) async fn fetch_workspace_configs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    config_ids: &[String],
) -> Result<HashMap<String, String>, ()> {
    // Legacy only queries `workspace_configs` when there is at least one
    // non-synthetic id to look up.
    if config_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let in_list = format!("in.({})", config_ids.join(","));
    let url = contact_data
        .rest_url(
            "workspace_configs",
            &[
                ("select", "id,value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", in_list),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<ConfigRow>>().map_err(|_| ())?;
    let mut map = HashMap::new();
    for row in rows {
        if let Some(value) = row.value {
            map.insert(row.id, value);
        }
    }

    Ok(map)
}

pub(super) async fn fetch_default_included_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_default_included_user_groups",
            &[
                ("select", "group_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<GroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .collect())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    // Legacy reads with the admin (service-role) client, bypassing RLS; the read
    // is scoped purely by the `ws_id` filter.
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}
