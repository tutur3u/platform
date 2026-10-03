use crate::{
    APPLICATION_JSON, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};
use serde_json::Value;

/// Filter aliases before warehouse pagination/count, with old-schema compatibility.
pub(crate) async fn warehouse_alias_filter(
    config: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    let url = config
        .rest_url(
            "inventory_identity_merges",
            &[
                ("select", "source_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("kind", "eq.warehouse".to_owned()),
            ],
        )
        .ok_or(())?;
    let key = config.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key)
                .with_header("Accept-Profile", "private"),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        let body = response.json::<Value>().map_err(|_| ())?;
        return if matches!(body["code"].as_str(), Some("42P01" | "PGRST205")) {
            Ok(None)
        } else {
            Err(())
        };
    }
    alias_filter(&response.json::<Vec<Value>>().map_err(|_| ())?)
}

fn alias_filter(rows: &[Value]) -> Result<Option<String>, ()> {
    let mut ids = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row["source_id"].as_str().ok_or(())?;
        if id.len() != 36
            || !id.bytes().enumerate().all(|(index, byte)| {
                if matches!(index, 8 | 13 | 18 | 23) {
                    byte == b'-'
                } else {
                    byte.is_ascii_hexdigit()
                }
            })
        {
            return Err(());
        }
        ids.push(id);
    }
    Ok((!ids.is_empty()).then(|| format!("not.in.({})", ids.join(","))))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn filters_durable_aliases_and_preserves_old_schema_empty_choices() {
        assert_eq!(alias_filter(&[]), Ok(None));
        assert_eq!(
            alias_filter(&[json!({"source_id":"00009000-0000-4000-8000-000000000030"})]),
            Ok(Some(
                "not.in.(00009000-0000-4000-8000-000000000030)".to_owned()
            ))
        );
    }
    #[test]
    fn rejects_malformed_filter_inputs() {
        assert_eq!(
            alias_filter(&[json!({"source_id":"foo),id.eq.other"})]),
            Err(())
        );
        assert_eq!(alias_filter(&[json!({})]), Err(()));
    }
}
