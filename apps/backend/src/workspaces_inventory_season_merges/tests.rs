use super::*;
fn request<'a>(
    method: &'a str,
    path: &'a str,
    url: Option<&'a str>,
    body: Option<&'a str>,
) -> BackendRequest<'a> {
    BackendRequest {
        method,
        path,
        url,
        body_text: body,
        authorization: None,
        cookie: None,
        if_none_match: None,
        origin: None,
        referer: None,
        request_id: None,
    }
}
#[test]
fn unrelated_and_short_paths_are_safe() {
    for path in [
        "",
        "/",
        "/api",
        "/api/v1/workspaces/a",
        "/api/v1/workspaces/a/inventory/merges",
        "/api/v1/workspaces/a/b/inventory/sales-periods/merges",
    ] {
        assert!(validation::ws(path).is_none());
    }
    assert_eq!(
        validation::ws("/api/v1/workspaces/personal/inventory/sales-periods/merges"),
        Some("personal")
    );
}
#[test]
fn role_conjunction_does_not_accept_source_id_as_authority() {
    let values = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    for items in [
        &["update_invoices", "delete_invoices"][..],
        &["manage_inventory_catalog", "delete_invoices"][..],
        &["update_inventory", "update_invoices"][..],
    ] {
        assert!(!authorization::permitted(&values(items)));
    }
    for catalog in ["manage_inventory_catalog", "update_inventory"] {
        assert!(authorization::permitted(&values(&[
            catalog,
            "update_invoices",
            "delete_invoices"
        ])));
    }
    assert!(authorization::permitted(&values(&["admin"])));
}
#[test]
fn paging_preserves_server_token_and_rejects_invalid_input() {
    let url = "https://test/api?sourceId=00000000-0000-4000-8000-000000000001&targetId=00000000-0000-4000-8000-000000000002&version=00000000-0000-4000-8000-000000000003&page=6";
    let args = validation::input(request("GET", "", Some(url), None)).unwrap();
    assert_eq!(args["p_page"], 6);
    assert_eq!(args["p_preview_id"], "00000000-0000-4000-8000-000000000003");
    assert!(
        validation::input(request(
            "GET",
            "",
            Some(&url.replace("page=6", "page=0")),
            None
        ))
        .is_none()
    );
    assert!(validation::input(request("POST", "", None, Some("{}"))).is_none());
    assert!(validation::input(request("POST", "", None, Some("not json"))).is_none());
}
#[test]
fn sanitized_conflict_and_readiness_errors_are_uncached() {
    for (code, status) in [
        ("40001", 409),
        ("23514", 409),
        ("55P03", 409),
        ("23503", 404),
        ("42501", 403),
        ("PGRST202", 503),
        ("55000", 503),
        ("unknown", 500),
    ] {
        assert_eq!(failure(Some(code)).status, status);
    }
}

#[test]
fn malformed_provider_is_never_confirmable() {
    for data in [json!(null), json!({}), json!({"version":"forged"})] {
        assert!(!response_validation::valid(&data, false));
    }
    assert!(response_validation::valid(
        &json!({"merged":true,"targetId":"00000000-0000-4000-8000-000000000002","importedPriceCount":2}),
        true
    ));
    assert!(!response_validation::valid(
        &json!({"merged":true,"targetId":"uuid","importedPriceCount":-1}),
        true
    ));
}

#[test]
fn timestamp_contract_matches_web_calendar_and_offset_validation() {
    for (value, expected) in [
        ("2024-02-29T00:00:00Z", true),
        ("2000-02-29T23:59:59.123456+23:59", true),
        ("2026-10-03T12:30:00-07:00", true),
        ("1900-02-29T00:00:00Z", false),
        ("2026-02-29T00:00:00Z", false),
        ("2026-04-31T00:00:00Z", false),
        ("2026-10-03T24:00:00Z", false),
        ("2026-10-03T12:30Z", false),
        ("2026-10-03T12:30:60Z", false),
        ("2026-10-03T12:30:00+24:00", false),
        ("2026-10-03T12:30:00+00:60", false),
        ("2026-10-03T12:30:00.Z", false),
        ("2026-10-03T12:30:00", false),
    ] {
        assert_eq!(timestamp::valid(value), expected, "{value}");
    }
}
#[test]
fn apply_counts_accept_integral_json_floats_but_reject_unsafe_or_fractional_values() {
    for (count, expected) in [
        (json!(2.0), true),
        (json!(0), true),
        (json!(2.5), false),
        (json!(-1), false),
        (json!(9007199254740992u64), false),
    ] {
        assert_eq!(
            response_validation::valid(
                &json!({"merged":true,"targetId":"00000000-0000-4000-8000-000000000002","importedPriceCount":count}),
                true
            ),
            expected
        );
    }
}

#[test]
fn preview_page_and_required_period_contract_match_web() {
    let period = json!({"id":"00000000-0000-4000-8000-000000000002","name":"Season","description":null,"starts_at":"date-only permitted by Web","ends_at":null,"time_zone":null,"pricing_mode":"scheduled","product_scope":"all"});
    let mut value = json!({"version":"00000000-0000-4000-8000-000000000004","cutoff":"2026-10-03T12:30:00Z","expiresAt":"2026-10-03T12:35:00Z","page":1.0,"source":period,"target":period,"sourceRuleCount":0.0,"targetRuleCount":0,"sourceRuleConflictCount":0,"targetRuleConflictCount":0,"futurePriceCount":0,"conflictCount":0,"assignmentCount":0,"historicalQuoteCount":0,"hasMore":false,"blockers":[],"sourceRules":[],"targetRules":[],"futurePrices":[],"conflicts":[]});
    assert!(response_validation::valid(&value, false));
    for page in [json!(0), json!(1.5), json!(100001)] {
        value["page"] = page;
        assert!(!response_validation::valid(&value, false));
    }
    value["page"] = json!(1);
    value["source"].as_object_mut().unwrap().remove("time_zone");
    assert!(!response_validation::valid(&value, false));
    value["source"]["time_zone"] = Value::Null;
    value["source"]["pricing_mode"] = json!("invalid");
    assert!(!response_validation::valid(&value, false));
}
