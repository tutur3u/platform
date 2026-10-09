use super::*;

// --- path guard ---

#[test]
fn extract_ws_id_happy_path() {
    assert_eq!(
        extract_ws_id("/api/v1/workspaces/00000000-0000-0000-0000-000000000001/users/approvals"),
        Some("00000000-0000-0000-0000-000000000001")
    );
}

#[test]
fn extract_ws_id_rejects_extra_segments() {
    assert!(extract_ws_id("/api/v1/workspaces/abc/extra/users/approvals").is_none());
}

#[test]
fn extract_ws_id_rejects_wrong_prefix() {
    assert!(extract_ws_id("/api/v2/workspaces/abc/users/approvals").is_none());
}

#[test]
fn extract_ws_id_rejects_wrong_suffix() {
    assert!(extract_ws_id("/api/v1/workspaces/abc/users/pending").is_none());
}

// --- query parsing ---

#[test]
fn parse_query_requires_kind() {
    assert!(parse_query(Some("http://host/path")).is_none());
}

#[test]
fn parse_query_rejects_invalid_kind() {
    assert!(parse_query(Some("http://host/path?kind=unknown")).is_none());
}

#[test]
fn parse_query_reports_defaults() {
    let q = parse_query(Some("http://host/path?kind=reports")).unwrap();
    assert!(matches!(q.kind, ApprovalKind::Reports));
    assert_eq!(q.status, "all");
    assert_eq!(q.page, 1);
    assert_eq!(q.limit, 10);
    assert!(q.group_id.is_none());
    assert!(q.user_id.is_none());
    assert!(q.creator_id.is_none());
}

#[test]
fn parse_query_posts_with_filters() {
    let q = parse_query(Some(
        "http://host/path?kind=posts&status=pending&page=3&limit=25&groupId=g1&userId=u1",
    ))
    .unwrap();
    assert!(matches!(q.kind, ApprovalKind::Posts));
    assert_eq!(q.status, "pending");
    assert_eq!(q.page, 3);
    assert_eq!(q.limit, 25);
    assert_eq!(q.group_id.as_deref(), Some("g1"));
    assert_eq!(q.user_id.as_deref(), Some("u1"));
}

#[test]
fn parse_query_clamps_limit_over_100() {
    // Out-of-range limit keeps the default.
    let q = parse_query(Some("http://host/path?kind=reports&limit=999")).unwrap();
    assert_eq!(q.limit, 10);
}

#[test]
fn parse_query_ignores_invalid_status() {
    let q = parse_query(Some("http://host/path?kind=reports&status=bogus")).unwrap();
    assert_eq!(q.status, "all");
}

// --- page_range ---

#[test]
fn page_range_first_page_default_limit() {
    assert_eq!(page_range(1, 10), "0-9");
}

#[test]
fn page_range_second_page() {
    assert_eq!(page_range(2, 10), "10-19");
}

// --- ceil_div ---

#[test]
fn ceil_div_exact() {
    assert_eq!(ceil_div(20, 10), 2);
}

#[test]
fn ceil_div_remainder() {
    assert_eq!(ceil_div(21, 10), 3);
}

#[test]
fn ceil_div_zero_total() {
    assert_eq!(ceil_div(0, 10), 0);
}

// --- summarize_queue_status ---

#[test]
fn summarize_none_all_zeros() {
    let counts = summarize_queue_status(None);
    for s in POST_EMAIL_QUEUE_STATUSES {
        assert_eq!(counts[s], json!(0), "status {s} should be 0");
    }
}

#[test]
fn summarize_sent_marks_one() {
    let counts = summarize_queue_status(Some("sent"));
    assert_eq!(counts["sent"], json!(1));
    assert_eq!(counts["queued"], json!(0));
}

#[test]
fn summarize_queued_marks_one() {
    let counts = summarize_queue_status(Some("queued"));
    assert_eq!(counts["queued"], json!(1));
    assert_eq!(counts["sent"], json!(0));
}

// --- first_nonempty_str ---

#[test]
fn first_nonempty_str_picks_first_present() {
    let obj = json!({ "a": null, "b": "hello", "c": "world" });
    assert_eq!(first_nonempty_str(&obj, &["a", "b", "c"]), json!("hello"));
}

#[test]
fn first_nonempty_str_returns_null_when_all_absent() {
    let obj = json!({});
    assert_eq!(first_nonempty_str(&obj, &["x", "y"]), Value::Null);
}
