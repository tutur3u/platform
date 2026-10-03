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
