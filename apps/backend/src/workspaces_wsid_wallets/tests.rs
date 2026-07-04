use super::*;

#[test]
fn path_guard_matches_exact_wallets_path() {
    assert_eq!(
        wallets_ws_id("/api/workspaces/abc-123/wallets"),
        Some("abc-123")
    );
}

#[test]
fn path_guard_matches_uuid_ws_id() {
    let uuid = "00000000-0000-0000-0000-000000000001";
    let path = format!("/api/workspaces/{uuid}/wallets");
    assert_eq!(wallets_ws_id(&path), Some(uuid));
}

#[test]
fn path_guard_rejects_v1_prefix() {
    assert_eq!(wallets_ws_id("/api/v1/workspaces/abc-123/wallets"), None);
}

#[test]
fn path_guard_rejects_sub_path() {
    assert_eq!(wallets_ws_id("/api/workspaces/abc-123/wallets/extra"), None);
}

#[test]
fn path_guard_rejects_empty_ws_id() {
    assert_eq!(wallets_ws_id("/api/workspaces//wallets"), None);
}

#[test]
fn path_guard_rejects_unrelated_path() {
    assert_eq!(wallets_ws_id("/api/workspaces/abc-123/transactions"), None);
}

#[test]
fn viewing_window_days_1_day() {
    assert_eq!(viewing_window_days(Some("1_day"), None), 1);
}

#[test]
fn viewing_window_days_custom_valid() {
    assert_eq!(viewing_window_days(Some("custom"), Some(45)), 45);
}

#[test]
fn viewing_window_days_custom_zero_falls_back() {
    assert_eq!(viewing_window_days(Some("custom"), Some(0)), 30);
}

#[test]
fn viewing_window_days_none_defaults_to_30() {
    assert_eq!(viewing_window_days(None, None), 30);
}

#[test]
fn checkpoint_number_from_finite_f64() {
    assert_eq!(checkpoint_number(Some(&json!(1.5))), 1.5);
}

#[test]
fn checkpoint_number_from_string() {
    assert_eq!(checkpoint_number(Some(&json!("2.5"))), 2.5);
}

#[test]
fn checkpoint_number_null_gives_zero() {
    assert_eq!(checkpoint_number(None), 0.0);
}

#[test]
fn clamp_status_known_values() {
    assert_eq!(clamp_status(&Some("clean".to_owned())), "clean");
    assert_eq!(clamp_status(&Some("unresolved".to_owned())), "unresolved");
    assert_eq!(clamp_status(&Some("other".to_owned())), "no_checkpoint");
    assert_eq!(clamp_status(&None), "no_checkpoint");
}

#[test]
fn is_workspace_uuid_literal_valid() {
    assert!(is_workspace_uuid_literal(
        "00000000-0000-0000-0000-000000000000"
    ));
}

#[test]
fn is_workspace_uuid_literal_rejects_short() {
    assert!(!is_workspace_uuid_literal("abc"));
}

#[test]
fn is_workspace_handle_valid() {
    assert!(is_workspace_handle("my-workspace"));
    assert!(is_workspace_handle("ws123"));
}

#[test]
fn is_workspace_handle_rejects_empty() {
    assert!(!is_workspace_handle(""));
}

#[test]
fn is_workspace_handle_rejects_leading_dash() {
    assert!(!is_workspace_handle("-bad"));
}
