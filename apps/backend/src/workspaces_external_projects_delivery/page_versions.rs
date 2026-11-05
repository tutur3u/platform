use super::*;

pub(super) async fn attach(
    config: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    entries: &mut [Value],
) -> Result<(), ()> {
    let ids: Vec<String> = entries.iter().filter_map(|e|
        e.get("published_page_version_id").and_then(Value::as_str).map(str::to_owned)
    ).collect();
    let mut versions = Vec::new();
    for chunk in ids.chunks(50) {
        let url = config.rest_url("workspace_external_project_page_versions", &[
            ("select", "id,ws_id,entry_id,schema_version,data,status".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "eq.published".to_owned()),
            ("id", format!("in.({})", chunk.join(","))),
        ]).ok_or(())?;
        versions.extend(fetch_rows(config, outbound, &url).await?);
    }
    for entry in entries {
        let page = published_page(entry, &versions, ws_id);
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("publishedPageVersion".to_owned(), page);
        }
    }
    Ok(())
}

fn published_page(entry: &Value, versions: &[Value], ws_id: &str) -> Value {
    let Some(pointer) = entry.get("published_page_version_id").and_then(Value::as_str) else {
        return Value::Null;
    };
    let version = versions.iter().find(|v|
        v.get("id").and_then(Value::as_str) == Some(pointer)
        && v.get("ws_id").and_then(Value::as_str) == Some(ws_id)
        && v.get("entry_id").and_then(Value::as_str) == entry.get("id").and_then(Value::as_str)
        && v.get("status").and_then(Value::as_str) == Some("published")
    );
    match version {
        Some(v) => json!({ "id": v["id"], "blocks": v["data"], "schema_version": v["schema_version"] }),
        None => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_delivers_the_same_entry_and_workspace_published_pointer() {
        let entry = json!({"id":"entry", "published_page_version_id":"v1"});
        let valid = json!({"id":"v1", "ws_id":"site", "entry_id":"entry", "status":"published", "schema_version":1, "data":{"content":[]}});
        assert_eq!(published_page(&entry, &[valid.clone()], "site")["schema_version"], 1);
        for (key, value) in [("ws_id", "other"), ("entry_id", "other"), ("status", "draft"), ("id", "newer-draft")] {
            let mut invalid = valid.clone();
            invalid[key] = json!(value);
            assert!(published_page(&entry, &[invalid], "site").is_null());
        }
        assert!(published_page(&json!({"id":"entry"}), &[valid], "site").is_null());
    }
}


pub(super) fn cache_control(payload: &Value) -> (&'static str, &'static str) {
    let has_pages = payload["collections"].as_array().is_some_and(|collections| {
        collections.iter().any(|c| c["entries"].as_array().is_some_and(|entries| {
            entries.iter().any(|e| e.get("publishedPageVersion").is_some_and(|v| !v.is_null()))
        }))
    });
    if has_pages {
        ("public, max-age=0, s-maxage=30", "max-age=30")
    } else {
        (PUBLIC_DELIVERY_CACHE_CONTROL, "max-age=86400, stale-while-revalidate=43200")
    }
}
