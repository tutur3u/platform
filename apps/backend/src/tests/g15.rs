use super::*;

#[test]
fn legacy_workspace_slide_item_routes_return_not_implemented() {
    for method in ["PUT", "DELETE"] {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(method, "/api/v1/workspaces/acme/slides/slide-123"),
        );

        assert_eq!(response.status, 501);
        assert_eq!(response.body["message"], "Not implemented");
    }
}

#[test]
fn legacy_workspace_slide_item_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/api/v1/workspaces/acme/slides/slide-123"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("PUT, DELETE"));
}

#[test]
fn legacy_grouped_score_names_migration_is_disabled_in_dev() {
    let response = route_request(
        &BackendConfig::new("development", "backend"),
        request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH),
    );

    assert_eq!(response.status, 410);
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert_eq!(response.body["error"], "MIGRATION_DISABLED");
    assert_eq!(
        response.body["message"],
        GROUPED_SCORE_NAMES_MIGRATION_DISABLED_MESSAGE
    );
}

#[test]
fn legacy_grouped_score_names_migration_requires_dev_mode() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH),
    );

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Forbidden");
    assert_eq!(
        response.body["message"],
        "Infrastructure migration routes are only accessible in development mode"
    );
    assert_eq!(
        response.body["hint"],
        "These routes are intended for internal data migration and should not be used in production."
    );
}

#[test]
fn legacy_grouped_score_names_migration_allows_local_e2e_bypass() {
    let mut config = BackendConfig::new("production", "backend");
    config.local_e2e_migration_access = true;

    let response = route_request(&config, request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH));

    assert_eq!(response.status, 410);
    assert_eq!(response.body["error"], "MIGRATION_DISABLED");
}

#[test]
fn legacy_grouped_score_names_migration_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("development", "backend"),
        request("GET", GROUPED_SCORE_NAMES_MIGRATION_PATH),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("PUT"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[test]
fn obsolete_infrastructure_migration_routes_are_disabled_in_dev() {
    for (method, path) in [
        ("PUT", "/api/v1/infrastructure/migrate/score-names"),
        ("PUT", "/api/v1/infrastructure/migrate/classes"),
        ("PUT", "/api/v1/infrastructure/migrate/lessons"),
        ("PUT", "/api/v1/infrastructure/migrate/payment-methods"),
        ("GET", "/api/v1/infrastructure/migrate/class-scores"),
        ("PATCH", "/api/v1/infrastructure/migrate/workspace-users"),
        (
            "POST",
            "/api/v1/infrastructure/migrate/ensure-platform-users",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 410, "{method} {path}");
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
        assert_eq!(
            response.body["message"],
            OBSOLETE_INFRASTRUCTURE_MIGRATION_DISABLED_MESSAGE
        );
    }
}

#[test]
fn obsolete_infrastructure_migration_routes_require_dev_mode() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request("PUT", "/api/v1/infrastructure/migrate/score-names"),
    );

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Forbidden");
    assert_eq!(
        response.body["message"],
        "Infrastructure migration routes are only accessible in development mode"
    );
}

#[test]
fn obsolete_infrastructure_migration_routes_preserve_legacy_allowed_methods() {
    for (method, path, allow) in [
        ("GET", "/api/v1/infrastructure/migrate/score-names", "PUT"),
        (
            "POST",
            "/api/v1/infrastructure/migrate/class-scores",
            "GET, PUT",
        ),
        (
            "DELETE",
            "/api/v1/infrastructure/migrate/workspace-users",
            "GET, PUT, PATCH",
        ),
        (
            "GET",
            "/api/v1/infrastructure/migrate/ensure-platform-users",
            "POST",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 405, "{method} {path}");
        assert_eq!(response.allow, Some(allow));
        assert_eq!(response.body["error"], "method not allowed");
    }
}

#[test]
fn obsolete_workspace_migration_routes_are_disabled_in_dev() {
    for (method, path) in [
        ("PUT", "/api/workspaces/acme/products/categories/migrate"),
        ("PUT", "/api/workspaces/acme/products/units/migrate"),
        (
            "PUT",
            "/api/workspaces/acme/transactions/categories/migrate",
        ),
        ("PUT", "/api/workspaces/acme/users/indicators/migrate"),
        (
            "PUT",
            "/api/workspaces/acme/users/indicators/groups/migrate",
        ),
        ("PUT", "/api/workspaces/acme/wallets/migrate"),
        ("PUT", "/api/workspaces/acme/wallets/transactions/migrate"),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 410, "{method} {path}");
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
        assert_eq!(
            response.body["message"],
            OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE
        );
    }
}

#[test]
fn obsolete_workspace_migration_routes_require_dev_mode() {
    let response = route_request(
        &BackendConfig::new("production", "backend"),
        request("PUT", "/api/workspaces/acme/products/categories/migrate"),
    );

    assert_eq!(response.status, 403);
    assert_eq!(response.body["error"], "Forbidden");
    assert_eq!(
        response.body["message"],
        "Infrastructure migration routes are only accessible in development mode"
    );
}

#[test]
fn obsolete_workspace_migration_routes_reject_unsupported_methods() {
    for (method, path, allow) in [
        (
            "GET",
            "/api/workspaces/acme/products/categories/migrate",
            "PUT",
        ),
        ("POST", "/api/workspaces/acme/wallets/migrate", "PUT"),
        (
            "DELETE",
            "/api/workspaces/acme/users/indicators/groups/migrate",
            "PUT",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 405, "{method} {path}");
        assert_eq!(response.allow, Some(allow));
        assert_eq!(response.body["error"], "method not allowed");
    }
}

#[test]
fn retired_workspace_data_migration_routes_return_disabled_response() {
    for (method, path, message) in [
        (
            "GET",
            "/api/v1/workspaces/acme/encryption/migrate",
            RETIRED_WORKSPACE_ENCRYPTION_MIGRATION_DISABLED_MESSAGE,
        ),
        (
            "POST",
            "/api/v1/workspaces/acme/encryption/migrate",
            RETIRED_WORKSPACE_ENCRYPTION_MIGRATION_DISABLED_MESSAGE,
        ),
        (
            "POST",
            "/api/v1/workspaces/acme/storage/migrate",
            RETIRED_WORKSPACE_STORAGE_MIGRATION_DISABLED_MESSAGE,
        ),
        (
            "GET",
            "/api/v2/workspaces/acme/migrate/wallet-types",
            RETIRED_WORKSPACE_EXPORT_MIGRATION_DISABLED_MESSAGE,
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 410, "{method} {path}");
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
        assert_eq!(response.body["message"], message);
    }
}

#[test]
fn retired_workspace_data_migration_routes_reject_unsupported_methods() {
    for (method, path, allow) in [
        (
            "PUT",
            "/api/v1/workspaces/acme/encryption/migrate",
            "GET, POST",
        ),
        ("GET", "/api/v1/workspaces/acme/storage/migrate", "POST"),
        (
            "POST",
            "/api/v2/workspaces/acme/migrate/wallet-types",
            "GET",
        ),
    ] {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request(method, path),
        );

        assert_eq!(response.status, 405, "{method} {path}");
        assert_eq!(response.allow, Some(allow));
        assert_eq!(response.body["error"], "method not allowed");
    }
}

#[test]
fn legacy_well_known_routes_return_cacheable_empty_404() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/.well-known/appspecific/com.chrome.devtools.json"),
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.cache_control, Some(WELL_KNOWN_CACHE_CONTROL));
    assert_eq!(response.content_type, None);
    assert!(response.body_empty);
}

#[test]
fn legacy_well_known_head_routes_return_cacheable_empty_404() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("HEAD", "/.well-known/security.txt"),
    );

    assert_eq!(response.status, 404);
    assert_eq!(response.cache_control, Some(WELL_KNOWN_CACHE_CONTROL));
    assert_eq!(response.content_type, None);
    assert!(response.body_empty);
}

#[test]
fn legacy_well_known_routes_reject_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", "/.well-known/security.txt"),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET, HEAD"));
    assert_eq!(response.content_type, Some(APPLICATION_JSON));
    assert!(!response.body_empty);
}

#[test]
fn legacy_serwist_worker_route_decommissions_old_registration() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", SERWIST_SERVICE_WORKER_PATH),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.content_type, Some("application/javascript"));
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert!(response.headers.iter().any(|(name, value)| {
        *name == "cdn-cache-control" && value == NO_STORE_CDN_CACHE_CONTROL
    }));
    assert!(
        response
            .headers
            .iter()
            .any(|(name, value)| { *name == "service-worker-allowed" && value == "/" })
    );
    let body = response.body_text.as_deref().unwrap();
    assert!(body.contains("self.skipWaiting()"));
    assert!(body.contains("self.registration.unregister()"));
}

#[test]
fn legacy_serwist_route_serves_deterministic_source_map_metadata() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", SERWIST_SOURCE_MAP_PATH),
    );

    assert_eq!(response.status, 200);
    assert_eq!(
        response.content_type,
        Some("application/json; charset=UTF-8")
    );
    assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    assert_eq!(
        response.body_text.as_deref(),
        Some(SERWIST_DECOMMISSION_SOURCE_MAP)
    );
}

#[test]
fn legacy_serwist_route_rejects_unsupported_methods() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("POST", SERWIST_SERVICE_WORKER_PATH),
    );

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body["error"], "method not allowed");
}

#[test]
fn legacy_serwist_route_returns_empty_404_for_unknown_artifacts() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/serwist/unknown.js"),
    );

    assert_eq!(response.status, 404);
    assert!(response.body_empty);
    assert_eq!(response.content_type, None);
}

#[test]
fn json_responses_advertise_security_headers() {
    let expected = [
        (
            "content-security-policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        ),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
    ];

    assert_eq!(json_security_headers(), expected.as_slice());
}

#[test]
fn readyz_requires_internal_token() {
    let response = route_request(
        &BackendConfig::new("test", "backend"),
        request("GET", "/readyz"),
    );

    assert_eq!(response.status, 503);
    assert_eq!(response.body["ok"], false);
}

#[test]
fn migration_status_is_runtime_neutral() {
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/status"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ok"], true);
    assert_eq!(response.body["backend"]["runtime"], "rust");
    assert_eq!(
        response.body["routeOwnership"]["manifest"],
        MIGRATION_MANIFEST_PATH
    );
}

#[test]
fn migration_status_reports_contact_data_layer_readiness() {
    let response = route_request(
        &backend_config_with_contact_data(),
        authorized_request("GET", "/api/migration/status"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["contactData"]["configured"], true);
    assert_eq!(response.body["contactData"]["missing"], json!([]));
    assert_eq!(
        response.body["contactData"]["supabaseOrigin"],
        "https://project-ref.supabase.co"
    );
    assert!(
        !response
            .body
            .to_string()
            .contains("test-service-role-secret")
    );
}

#[test]
fn migration_manifest_endpoint_returns_checked_inventory() {
    let manifest = parse_route_manifest().unwrap();
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/manifest"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body["summary"]["total"].as_u64(),
        Some(manifest.summary.total as u64)
    );
    assert_eq!(
        response.body["summary"]["total"].as_u64(),
        Some(response.body["routes"].as_array().unwrap().len() as u64)
    );
    assert_eq!(
        response.body["summary"]["methodCounts"]["GET"].as_u64(),
        manifest
            .summary
            .method_counts
            .get("GET")
            .map(|count| *count as u64)
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["routePath"] == "/api/health"
                && route["methods"].as_array().unwrap().len() == 1
                && route["methods"][0] == "GET")
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["routePath"] == "/serwist/:path"
                && route["methods"].as_array().unwrap().len() == 1
                && route["methods"][0] == "GET"
                && route["status"] == "migrated")
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|route| route["routePath"] == "/~recover-browser-state"
                && route["methods"].as_array().unwrap().len() == 2
                && route["methods"][0] == "GET"
                && route["methods"][1] == "POST"
                && route["status"] == "migrated")
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(
                |route| route["routePath"] == "/api/workspaces/:wsId/products/categories/migrate"
                    && route["methods"].as_array().unwrap().len() == 1
                    && route["methods"][0] == "PUT"
                    && route["status"] == "accepted-removal"
                    && route["targetOwner"] == "rust-backend",
            )
    );
    assert!(
        response.body["routes"]
            .as_array()
            .unwrap()
            .iter()
            .any(
                |route| route["routePath"] == "/api/workspaces/:wsId/categories"
                    && route["status"] == "accepted-removal"
            )
    );
    assert_eq!(
        response.body["generatedBy"],
        "scripts/tanstack-migration-manifest.js"
    );
}

#[test]
fn migration_cutover_gates_block_while_legacy_routes_remain() {
    let manifest = parse_route_manifest().unwrap();
    let counts = migration_route_counts(&manifest.routes);
    let response = route_request(
        &backend_config_with_internal_token(),
        authorized_request("GET", "/api/migration/cutover-gates"),
    );

    assert_eq!(response.status, 200);
    assert_eq!(response.body["ok"], false);
    assert_eq!(
        response.body["manifest"],
        "apps/tanstack-web/migration/route-manifest.json"
    );
    assert_eq!(
        response.body["summary"]["total"].as_u64(),
        Some(manifest.summary.total as u64)
    );
    assert_eq!(
        response.body["counts"]["acceptedRemoval"].as_u64(),
        Some(counts.accepted_removal as u64)
    );
    assert_eq!(
        response.body["counts"]["legacyNext"].as_u64(),
        Some(counts.legacy_next as u64)
    );
    assert_eq!(
        response.body["counts"]["migrated"].as_u64(),
        Some(counts.migrated as u64)
    );
    assert!(
        response.body["gates"]
            .as_array()
            .unwrap()
            .iter()
            .any(|gate| gate["id"] == "backend-owned-routes-mapped" && gate["ok"] == true)
    );
}
