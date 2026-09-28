use super::*;

#[test]
fn tasks_app_session_is_limited_to_task_images() {
    assert!(storage_share_app_session_targets("task-images/media.png").contains(&"tasks"));
    assert!(!storage_share_app_session_targets("finance/receipt.pdf").contains(&"tasks"));
    assert!(sanitize_path("task-images/../finance/receipt.pdf").is_none());
}

// ── storage_share_path_param ──────────────────────────────────────────────

#[test]
fn path_param_matches_exact_route() {
    let ws = storage_share_path_param("/api/v1/workspaces/abc-123/storage/share");
    assert_eq!(ws, Some("abc-123"));
}

#[test]
fn path_param_matches_uuid_ws_id() {
    let id = "00000000-0000-0000-0000-000000000001";
    let path = format!("/api/v1/workspaces/{id}/storage/share");
    assert_eq!(storage_share_path_param(&path), Some(id));
}

#[test]
fn path_param_rejects_extra_segments() {
    assert!(storage_share_path_param("/api/v1/workspaces/abc/storage/share/extra").is_none());
}

#[test]
fn path_param_rejects_wrong_tail() {
    assert!(storage_share_path_param("/api/v1/workspaces/abc/storage/object").is_none());
}

#[test]
fn path_param_rejects_missing_ws_id() {
    assert!(storage_share_path_param("/api/v1/workspaces//storage/share").is_none());
}

// ── sanitize_path ─────────────────────────────────────────────────────────

#[test]
fn sanitize_path_simple() {
    assert_eq!(sanitize_path("foo/bar"), Some("foo/bar".to_owned()));
}

#[test]
fn sanitize_path_strips_leading_slash() {
    assert_eq!(sanitize_path("/foo/bar"), Some("foo/bar".to_owned()));
}

#[test]
fn sanitize_path_rejects_dotdot() {
    assert!(sanitize_path("foo/../bar").is_none());
}

#[test]
fn sanitize_path_rejects_dotdot_segment() {
    assert!(sanitize_path("..").is_none());
}

#[test]
fn sanitize_path_empty_returns_empty() {
    assert_eq!(sanitize_path(""), Some(String::new()));
}

// ── is_reserved_mobile_deployment_drive_path ──────────────────────────────

#[test]
fn reserved_path_blocked_for_root_ws() {
    assert!(is_reserved_mobile_deployment_drive_path(
        ROOT_WORKSPACE_ID,
        ".tuturuuu/mobile-deployment-vault"
    ));
}

#[test]
fn reserved_path_blocked_sub_path_for_root_ws() {
    assert!(is_reserved_mobile_deployment_drive_path(
        ROOT_WORKSPACE_ID,
        ".tuturuuu/mobile-deployment-vault/foo"
    ));
}

#[test]
fn reserved_path_not_blocked_for_non_root_ws() {
    assert!(!is_reserved_mobile_deployment_drive_path(
        "some-other-ws-id",
        ".tuturuuu/mobile-deployment-vault"
    ));
}

// ── finance_transaction_id_from_storage_path ──────────────────────────────

#[test]
fn finance_tx_id_extracted() {
    assert_eq!(
        finance_transaction_id_from_storage_path("finance/transactions/tx-abc-123/receipt.pdf"),
        Some("tx-abc-123")
    );
}

#[test]
fn finance_tx_id_not_extracted_for_other_paths() {
    assert!(finance_transaction_id_from_storage_path("task-images/img.png").is_none());
}

// ── parse_share_query ─────────────────────────────────────────────────────

fn make_url(qs: &str) -> url::Url {
    url::Url::parse(&format!(
        "https://example.com/api/v1/workspaces/ws/storage/share?{qs}"
    ))
    .unwrap()
}

#[test]
fn parse_query_path_only() {
    let url = make_url("path=foo%2Fbar");
    let q = parse_share_query(Some(&url)).unwrap();
    assert_eq!(q.path, "foo/bar");
    assert!(q.expires_in.is_none());
    assert!(q.width.is_none());
}

#[test]
fn parse_query_missing_path_errors() {
    let url = make_url("expiresIn=3600");
    assert!(parse_share_query(Some(&url)).is_err());
}

#[test]
fn parse_query_expires_in_valid() {
    let url = make_url("path=foo&expiresIn=3600");
    let q = parse_share_query(Some(&url)).unwrap();
    assert_eq!(q.expires_in, Some(3600));
}

#[test]
fn parse_query_expires_in_too_small() {
    let url = make_url("path=foo&expiresIn=10");
    assert!(parse_share_query(Some(&url)).is_err());
}

#[test]
fn parse_query_transform_requires_dimension() {
    // resize present but no width/height — should fail the superRefine rule.
    let url = make_url("path=foo&resize=cover");
    assert!(parse_share_query(Some(&url)).is_err());
}

#[test]
fn parse_query_transform_with_width() {
    let url = make_url("path=foo&width=800&resize=cover");
    let q = parse_share_query(Some(&url)).unwrap();
    assert_eq!(q.width, Some(800));
    assert_eq!(q.resize.as_deref(), Some("cover"));
}

#[test]
fn parse_query_invalid_resize_value() {
    let url = make_url("path=foo&width=800&resize=stretch");
    assert!(parse_share_query(Some(&url)).is_err());
}

// ── storage_base_url ──────────────────────────────────────────────────────

#[test]
fn storage_base_url_derived() {
    let cd = contact::ContactDataConfig::new("https://proj.supabase.co", "service-role-key-value");
    let base = storage_base_url(&cd);
    assert_eq!(base.as_deref(), Some("https://proj.supabase.co/storage/v1"));
}

// ── is_uuid_literal ───────────────────────────────────────────────────────

#[test]
fn uuid_literal_valid() {
    assert!(is_uuid_literal("00000000-0000-0000-0000-000000000000"));
}

#[test]
fn uuid_literal_invalid_short() {
    assert!(!is_uuid_literal("00000000-0000-0000-0000"));
}
