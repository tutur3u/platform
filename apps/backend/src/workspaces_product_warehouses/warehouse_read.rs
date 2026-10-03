use crate::{
    APPLICATION_JSON, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};
use serde_json::{Value, json};

pub(crate) async fn fetch(
    config: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &[(&str, String)],
    paginate: bool,
) -> Result<OutboundResponse, ()> {
    let response = read(
        config,
        outbound,
        "inventory_active_warehouses",
        params,
        paginate,
    )
    .await?;
    if (200..300).contains(&response.status) {
        return Ok(response);
    }
    let error = response.json::<Value>().map_err(|_| ())?;
    if !matches!(error["code"].as_str(), Some("42P01" | "PGRST205")) {
        return Err(());
    }

    if !verify_legacy(config, outbound, ws_id).await? {
        return Err(());
    }

    let response = read(config, outbound, "inventory_warehouses", params, paginate).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    // Reject a migration committed between the witness and the raw read.
    if !verify_legacy(config, outbound, ws_id).await? {
        return Err(());
    }
    Ok(response)
}

fn is_legacy(value: &Value, ws_id: &str) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    if object.contains_key("inventoryMergeSchema") {
        return false;
    }
    let Some(rows) = object.get("warehouses").and_then(Value::as_array) else {
        return false;
    };
    rows.iter().all(|row| {
        row["id"].as_str().is_some_and(|id| !id.is_empty())
            && row["ws_id"]
                .as_str()
                .is_some_and(|id| id.eq_ignore_ascii_case(ws_id))
            && row
                .get("name")
                .is_some_and(|name| name.is_null() || name.is_string())
    })
}

async fn read(
    config: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
    paginate: bool,
) -> Result<OutboundResponse, ()> {
    let url = config.rest_url(table, params).ok_or(())?;
    let key = config.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &bearer)
        .with_header("apikey", key)
        .with_header("Accept-Profile", "private");
    if paginate {
        request = request.with_header("Prefer", "count=exact");
    }
    outbound.send(request).await.map_err(|_| ())
}

async fn verify_legacy(
    config: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    // This pre-existing RPC executes the CURRENT SQL body despite stale metadata.
    // Its marker is installed in the SAME transaction that creates merge aliases.
    let url = config
        .rpc_url("get_inventory_product_form_options")
        .ok_or(())?;
    let key = config.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");
    let body = json!({ "p_ws_id": ws_id }).to_string();
    let baseline = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key)
                .with_header("Content-Profile", "private")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&baseline.status) {
        return Err(());
    }
    Ok(is_legacy(&baseline.json::<Value>().map_err(|_| ())?, ws_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_workspace_uuid_casing_preserves_same_identity_only() {
        let lower = "abcdef00-0000-4000-8000-000000000000";
        let value = json!({"warehouses":[{"id":"ordinary","name":"Main","ws_id":lower}]});
        assert!(is_legacy(&value, &lower.to_uppercase()));
        assert!(!is_legacy(&value, "abcdef00-0000-4000-8000-000000000001"));
        assert!(!is_legacy(
            &json!({"warehouses":[],"inventoryMergeSchema":null}),
            lower
        ));
    }
}
