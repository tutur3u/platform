use super::*;

fn response(status: u16, body: serde_json::Value) -> OutboundResponse {
    OutboundResponse {
        status,
        body_text: body.to_string(),
        headers: Vec::new(),
    }
}

fn snapshot() -> serde_json::Value {
    json!({
        "totalSize": 25.5, "fileCount": 2, "scannedObjectLimit": 1000,
        "truncated": false, "largestFile": {"name":"a", "size":20.5, "createdAt":""},
        "smallestFile": null,
    })
}

#[test]
fn cache_reuses_snapshot_but_reads_live_quota_and_preserves_fractional_sizes() {
    let source = response(200, snapshot());
    let first = cache_response(&source, 100).unwrap().unwrap();
    let second = cache_response(&source, 50).unwrap().unwrap();
    assert_eq!(first["totalSize"], 25.5);
    assert_eq!(first["largestFile"]["size"], 20.5);
    assert_eq!(first["storageLimit"], 100);
    assert_eq!(first["usagePercentage"], 25.5);
    assert_eq!(second["usagePercentage"], 51.0);
    assert_eq!(
        cache_response(&source, 0).unwrap().unwrap()["usagePercentage"],
        0.0
    );
    assert_eq!(
        cache_response(&source, 1).unwrap().unwrap()["usagePercentage"],
        100.0
    );
}

#[test]
fn only_missing_rpc_or_null_data_use_the_scan_fallback() {
    for code in ["PGRST202", "42883"] {
        assert!(
            cache_response(&response(404, json!({"code":code})), 100)
                .unwrap()
                .is_none()
        );
    }
    assert!(
        cache_response(&response(200, serde_json::Value::Null), 100)
            .unwrap()
            .is_none()
    );
    for code in ["42501", "PGRST301", "XX000"] {
        assert!(cache_response(&response(403, json!({"code":code})), 100).is_err());
    }
    let malformed = OutboundResponse {
        status: 500,
        body_text: "bad".into(),
        headers: Vec::new(),
    };
    assert!(cache_response(&malformed, 100).is_err());
}

#[test]
fn malformed_cache_never_becomes_a_success_or_scan() {
    for key in ["largestFile", "smallestFile"] {
        let mut payload = snapshot();
        payload.as_object_mut().unwrap().remove(key);
        assert!(cache_response(&response(200, payload), 100).is_err());
    }
    for (key, value) in [
        ("totalSize", json!(-1)),
        ("fileCount", json!(1.5)),
        ("scannedObjectLimit", json!(0)),
        ("truncated", json!("false")),
        (
            "largestFile",
            json!({"name":"a", "size":-1, "createdAt":""}),
        ),
    ] {
        let mut payload = snapshot();
        payload[key] = value;
        assert!(
            cache_response(&response(200, payload), 100).is_err(),
            "{key}"
        );
    }
    let mut payload = snapshot();
    payload["providerSecret"] = json!("unexpected");
    assert!(
        cache_response(&response(200, payload), 100)
            .unwrap()
            .unwrap()
            .get("providerSecret")
            .is_none()
    );
}

#[test]
fn configured_r2_falls_through_and_partial_config_matches_next_supabase_fallback() {
    let mut secrets: Vec<_> = DRIVE_SECRETS
        .iter()
        .map(|name| SecretRow {
            name: Some((*name).to_owned()),
            value: Some("configured".to_owned()),
        })
        .collect();
    secrets[0].value = Some(" R2 ".to_owned());
    assert!(configured_r2(&secrets));
    for index in 1..5 {
        let old = secrets[index].value.take();
        assert!(!configured_r2(&secrets));
        secrets[index].value = old;
    }
    secrets[0].value = Some("supabase".to_owned());
    assert!(!configured_r2(&secrets));
}
