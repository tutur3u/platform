use super::*;

#[test]
fn migration_progress_groups_remaining_route_ownership() {
    let manifest = parse_route_manifest().unwrap();
    let progress = route_manifest_progress(&manifest.routes);
    let rust_backend_progress = progress
        .by_owner
        .iter()
        .find(|bucket| bucket.key == "rust-backend")
        .unwrap();
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/progress"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ok"], false);
    assert_eq!(
        response.body["manifest"],
        "apps/tanstack-web/migration/route-manifest.json"
    );
    assert_eq!(
        response.body["progress"]["totals"]["acceptedRemoval"].as_u64(),
        Some(progress.totals.accepted_removal as u64)
    );
    assert_eq!(
        response.body["progress"]["totals"]["remaining"].as_u64(),
        Some(progress.totals.remaining as u64)
    );
    assert_eq!(
        response.body["progress"]["totals"]["migrated"].as_u64(),
        Some(progress.totals.migrated as u64)
    );
    assert_eq!(
        response.body["progress"]["byOwner"][0]["key"],
        "rust-backend"
    );
    assert_eq!(
        response.body["progress"]["byOwner"][0]["remaining"].as_u64(),
        Some(rust_backend_progress.remaining as u64)
    );
    assert_eq!(response.body["progress"]["byKind"][0]["key"], "api");
    assert!(
        response.body["progress"]["topLegacyRoutes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["targetOwner"] == "rust-backend" && route["methods"].is_array())
    );
}

#[test]
fn migration_inventory_endpoints_require_internal_authorization() {
    let mut config = backend_config_with_internal_token();

    for path in [
        "/api/migration/status",
        "/api/migration/manifest",
        "/api/migration/progress",
        "/api/migration/cutover-gates",
    ] {
        let response = route_request(&config, request("GET", path));

        assert_eq!(response.status, 401);
        assert_eq!(response.body["error"], "unauthorized");
    }

    config.internal_token.clear();
    let response = route_request(&config, request("GET", "/api/migration/status"));

    assert_eq!(response.status, 503);
    assert_eq!(
        response.body["error"],
        "backend internal token is not configured"
    );
}

#[test]
fn protected_jobs_require_authorization() {
    let config = backend_config_with_internal_token();

    let response = route_request(&config, request("POST", "/internal/jobs/noop"));

    assert_eq!(response.status, 401);
}

#[test]
fn protected_jobs_reject_unknown_jobs() {
    let config = backend_config_with_internal_token();

    let response = route_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer secret"),
            body_text: None,
            cookie: None,
            method: "POST",
            origin: None,
            path: "/internal/jobs/unknown",
            referer: None,
            request_id: Some("request-123"),
            url: Some("https://tuturuuu.localhost/internal/jobs/unknown"),
        },
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.body["requestId"], "request-123");
}

#[test]
fn noop_job_accepts_authorized_requests() {
    let mut config = BackendConfig::new("test", "backend");
    config.internal_token = "secret".to_owned();

    let response = route_request(
        &config,
        BackendRequest {
            authorization: Some("Bearer secret"),
            body_text: None,
            cookie: None,
            method: "POST",
            origin: None,
            path: "/internal/jobs/noop",
            referer: None,
            request_id: Some("request-123"),
            url: Some("https://tuturuuu.localhost/internal/jobs/noop"),
        },
    );

    assert_eq!(response.status, 202);
    assert_eq!(response.body["accepted"], true);
    assert_eq!(response.body["job"], "noop");
    assert_eq!(response.body["requestId"], "request-123");
}

#[test]
fn unsupported_methods_report_allow_header() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", "/healthz"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
}
