use super::*;

// -- path guard ----------------------------------------------------------

#[test]
fn extract_ws_id_matches_canonical_path() {
    let ws_id = extract_ws_id("/api/v1/workspaces/abc-123/inventory/square-settings").unwrap();
    assert_eq!(ws_id, "abc-123");
}

#[test]
fn extract_ws_id_rejects_wrong_suffix() {
    assert!(extract_ws_id("/api/v1/workspaces/abc-123/inventory/polar-settings").is_none());
}

#[test]
fn extract_ws_id_rejects_extra_segments() {
    assert!(extract_ws_id("/api/v1/workspaces/abc-123/inventory/square-settings/extra").is_none());
}

#[test]
fn extract_ws_id_rejects_empty_ws_id() {
    assert!(extract_ws_id("/api/v1/workspaces//inventory/square-settings").is_none());
}

// -- workspace id helpers ------------------------------------------------

#[test]
fn is_workspace_uuid_literal_accepts_uuid() {
    assert!(is_workspace_uuid_literal(
        "00000000-0000-0000-0000-000000000000"
    ));
    assert!(is_workspace_uuid_literal(
        "550e8400-e29b-41d4-a716-446655440000"
    ));
}

#[test]
fn is_workspace_uuid_literal_rejects_non_uuid() {
    assert!(!is_workspace_uuid_literal("not-a-uuid"));
    assert!(!is_workspace_uuid_literal(""));
}

#[test]
fn is_workspace_handle_accepts_valid_handles() {
    assert!(is_workspace_handle("my-workspace"));
    assert!(is_workspace_handle("workspace123"));
    assert!(is_workspace_handle("a"));
}

#[test]
fn is_workspace_handle_rejects_edge_hyphens() {
    assert!(!is_workspace_handle("-bad"));
    assert!(!is_workspace_handle("bad-"));
}

#[test]
fn is_workspace_handle_rejects_empty() {
    assert!(!is_workspace_handle(""));
}

#[test]
fn resolve_workspace_id_maps_internal_to_root() {
    assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
    assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
}

#[test]
fn resolve_workspace_id_passes_through_other_values() {
    assert_eq!(resolve_workspace_id("my-ws"), "my-ws");
}

// -- readiness computation -----------------------------------------------

fn ready_connection(env: &str) -> SquareConnectionRow {
    SquareConnectionRow {
        environment: Some(env.to_owned()),
        auth_method: Some("manual".to_owned()),
        merchant_id: None,
        access_token_fingerprint: None,
        access_token_last4: None,
        refresh_token_last4: None,
        token_expires_at: None,
        scopes: Some(Vec::new()),
        webhook_signature_key_encrypted: Some("encrypted".to_owned()),
        webhook_signature_key_last4: Some("abcd".to_owned()),
        status: Some("ready".to_owned()),
        last_validated_at: None,
        last_error: None,
        updated_at: None,
    }
}

fn settings_with_location_and_device(env: &str) -> SquareSettingsRow {
    SquareSettingsRow {
        environment: Some(env.to_owned()),
        location_id: Some("LOC1".to_owned()),
        location_name: None,
        device_id: Some("DEV1".to_owned()),
        device_name: None,
        sandbox_device_id: None,
    }
}

#[test]
fn compute_readiness_fully_ready_manual() {
    let settings = settings_with_location_and_device("production");
    let connection = ready_connection("production");
    let result = compute_readiness("production", Some(&settings), &[connection], &[]);
    assert!(result.ready);
    assert!(result.issues.is_empty());
}

#[test]
fn compute_readiness_missing_connection() {
    let settings = settings_with_location_and_device("production");
    let result = compute_readiness("production", Some(&settings), &[], &[]);
    assert!(!result.ready);
    assert!(result.issues.contains(&"connection_missing".to_owned()));
    assert!(
        result
            .issues
            .contains(&"webhook_signature_missing".to_owned())
    );
}

#[test]
fn compute_readiness_missing_location() {
    let settings = SquareSettingsRow {
        environment: Some("sandbox".to_owned()),
        location_id: None,
        location_name: None,
        device_id: Some("DEV1".to_owned()),
        device_name: None,
        sandbox_device_id: None,
    };
    let connection = ready_connection("sandbox");
    let result = compute_readiness("sandbox", Some(&settings), &[connection], &[]);
    assert!(!result.ready);
    assert!(result.issues.contains(&"location_missing".to_owned()));
}

#[test]
fn compute_readiness_sandbox_uses_sandbox_device_id() {
    let settings = SquareSettingsRow {
        environment: Some("sandbox".to_owned()),
        location_id: Some("LOC1".to_owned()),
        location_name: None,
        device_id: None,
        device_name: None,
        sandbox_device_id: Some("SANDBOX_DEV".to_owned()),
    };
    let connection = ready_connection("sandbox");
    let result = compute_readiness("sandbox", Some(&settings), &[connection], &[]);
    assert!(
        result.ready,
        "sandbox_device_id should satisfy device check"
    );
}

#[test]
fn compute_readiness_scopes_missing_for_oauth() {
    let settings = settings_with_location_and_device("production");
    let mut connection = ready_connection("production");
    connection.auth_method = Some("oauth".to_owned());
    connection.scopes = Some(vec!["MERCHANT_PROFILE_READ".to_owned()]);

    let app_credential = SquareAppCredentialRow {
        environment: Some("production".to_owned()),
        application_id: Some("app_id".to_owned()),
        application_secret_encrypted: Some("secret".to_owned()),
        application_secret_fingerprint: None,
        application_secret_last4: None,
        oauth_redirect_url: None,
        webhook_notification_url: None,
        updated_at: None,
    };

    let result = compute_readiness(
        "production",
        Some(&settings),
        &[connection],
        &[app_credential],
    );
    assert!(!result.ready);
    assert!(result.issues.contains(&"scopes_missing".to_owned()));
}

// -- response shaping helpers --------------------------------------------

#[test]
fn map_connection_defaults_empty_option_strings() {
    let row = SquareConnectionRow {
        environment: None,
        auth_method: None,
        merchant_id: None,
        access_token_fingerprint: None,
        access_token_last4: None,
        refresh_token_last4: None,
        token_expires_at: None,
        scopes: None,
        webhook_signature_key_encrypted: None,
        webhook_signature_key_last4: None,
        status: None,
        last_validated_at: None,
        last_error: None,
        updated_at: None,
    };
    let resp = map_connection(row);
    assert_eq!(resp.environment, "");
    assert_eq!(resp.scopes, Vec::<String>::new());
}

#[test]
fn extend_unique_deduplicates() {
    let mut perms = vec!["a".to_owned(), "b".to_owned()];
    extend_unique(&mut perms, vec!["b".to_owned(), "c".to_owned()]);
    assert_eq!(perms, vec!["a", "b", "c"]);
}
