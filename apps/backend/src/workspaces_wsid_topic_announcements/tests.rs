use super::*;

#[test]
fn ws_id_extracted_from_exact_path() {
    assert_eq!(
        topic_announcements_ws_id("/api/v1/workspaces/abc/topic-announcements"),
        Some("abc")
    );
}

#[test]
fn ws_id_rejects_unrelated_and_nested_paths() {
    assert_eq!(topic_announcements_ws_id("/api/v1/workspaces/abc"), None);
    assert_eq!(
        topic_announcements_ws_id("/api/v1/workspaces/abc/topic-announcements/templates"),
        None
    );
    assert_eq!(
        topic_announcements_ws_id("/api/v1/workspaces//topic-announcements"),
        None
    );
    assert_eq!(
        topic_announcements_ws_id("/api/v2/workspaces/abc/topic-announcements"),
        None
    );
}

#[test]
fn parse_list_query_defaults() {
    let query = parse_list_query(Some(
        "https://x.test/api/v1/workspaces/abc/topic-announcements",
    ))
    .unwrap();
    assert_eq!(
        query,
        ListQuery {
            contact_id: None,
            page: 1,
            page_size: 20,
            q: String::new(),
            status: "active".to_owned(),
        }
    );
    assert_eq!(query.offset(), 0);
}

#[test]
fn parse_list_query_reads_all_fields() {
    let url = "https://x.test/p?page=3&pageSize=10&q=%20hello%20&status=sent&contactId=11111111-1111-4111-8111-111111111111";
    let query = parse_list_query(Some(url)).unwrap();
    assert_eq!(query.page, 3);
    assert_eq!(query.page_size, 10);
    assert_eq!(query.q, "hello");
    assert_eq!(query.status, "sent");
    assert_eq!(
        query.contact_id.as_deref(),
        Some("11111111-1111-4111-8111-111111111111")
    );
    assert_eq!(query.offset(), 20);
}

#[test]
fn parse_list_query_rejects_invalid_inputs() {
    assert!(parse_list_query(Some("https://x.test/p?status=bogus")).is_err());
    assert!(parse_list_query(Some("https://x.test/p?page=0")).is_err());
    assert!(parse_list_query(Some("https://x.test/p?page=abc")).is_err());
    assert!(parse_list_query(Some("https://x.test/p?page=2.5")).is_err());
    assert!(parse_list_query(Some("https://x.test/p?pageSize=101")).is_err());
    assert!(parse_list_query(Some("https://x.test/p?contactId=not-a-uuid")).is_err());
    assert!(parse_list_query(Some("https://x.test/p?contactId=")).is_err());
    // Empty page value coerces to 0 -> below min(1).
    assert!(parse_list_query(Some("https://x.test/p?page=")).is_err());
}

#[test]
fn parse_list_query_last_value_wins() {
    let query = parse_list_query(Some("https://x.test/p?status=draft&status=all")).unwrap();
    assert_eq!(query.status, "all");
}

#[test]
fn status_filter_branches_match_legacy() {
    assert_eq!(
        status_filter("active"),
        Some(("status", "neq.cancelled".to_owned()))
    );
    assert_eq!(status_filter("all"), None);
    assert_eq!(
        status_filter("sent"),
        Some(("status", "eq.sent".to_owned()))
    );
}

#[test]
fn content_range_count_parsing() {
    assert_eq!(parse_content_range_count(Some("0-19/142")), Some(142));
    assert_eq!(parse_content_range_count(Some("*/0")), Some(0));
    assert_eq!(parse_content_range_count(Some("0-9/*")), None);
    assert_eq!(parse_content_range_count(None), None);
}

#[test]
fn total_pages_matches_ceil_with_min_one() {
    assert_eq!(total_pages(0, 20), 1);
    assert_eq!(total_pages(20, 20), 1);
    assert_eq!(total_pages(21, 20), 2);
    assert_eq!(total_pages(142, 20), 8);
}

#[test]
fn file_name_normalization_strips_generated_prefix() {
    assert_eq!(
        normalize_attachment_file_name("11111111-1111-4111-8111-111111111111-report.pdf"),
        "report.pdf"
    );
    // Keeps a non-generated name untouched, and strips path segments.
    assert_eq!(
        normalize_attachment_file_name("folder/sub\\photo.png"),
        "photo.png"
    );
    // Not a valid UUID prefix -> unchanged base name.
    assert_eq!(
        normalize_attachment_file_name("not-a-uuid-file.txt"),
        "not-a-uuid-file.txt"
    );
    // Empty -> fallback.
    assert_eq!(normalize_attachment_file_name(""), "attachment");
}

#[test]
fn size_bytes_number_conversion() {
    assert_eq!(size_bytes_to_number(Some(&json!(1024))), json!(1024));
    assert_eq!(size_bytes_to_number(Some(&json!("2048"))), json!(2048));
    assert_eq!(size_bytes_to_number(Some(&Value::Null)), json!(0));
    assert_eq!(size_bytes_to_number(None), json!(0));
}

#[test]
fn js_truthy_matches_javascript() {
    assert!(js_truthy(&json!(true)));
    assert!(!js_truthy(&json!(false)));
    assert!(!js_truthy(&Value::Null));
    assert!(!js_truthy(&json!(0)));
    assert!(js_truthy(&json!(1)));
    assert!(!js_truthy(&json!("")));
    assert!(js_truthy(&json!("x")));
}

#[test]
fn map_announcement_row_shapes_response_element() {
    let mut row = Map::new();
    row.insert("id".to_owned(), json!("a1"));
    row.insert("title".to_owned(), json!("Hi"));
    // Stale embedded keys should be overwritten.
    row.insert("group".to_owned(), json!("stale"));

    let mapped = map_announcement_row(
        row,
        vec![json!({ "id": "att1" })],
        vec![json!({ "id": "c1" })],
        json!({ "id": "g1", "name": "Group" }),
    );

    assert_eq!(mapped["id"], json!("a1"));
    assert_eq!(mapped["title"], json!("Hi"));
    assert_eq!(mapped["attachments"], json!([{ "id": "att1" }]));
    assert_eq!(mapped["contacts"], json!([{ "id": "c1" }]));
    assert_eq!(mapped["group"], json!({ "id": "g1", "name": "Group" }));
}

#[test]
fn serialize_contact_renames_columns() {
    let mut contact = Map::new();
    contact.insert("id".to_owned(), json!("c1"));
    contact.insert("created_at".to_owned(), json!("2026-01-01T00:00:00Z"));
    contact.insert("email".to_owned(), json!("a@b.test"));
    contact.insert("name".to_owned(), json!("Alice"));
    contact.insert("archived".to_owned(), json!(false));
    contact.insert("tags".to_owned(), json!(["x"]));
    contact.insert("metadata".to_owned(), json!({ "k": "v" }));
    contact.insert("workspace_user_id".to_owned(), json!("wu1"));

    let serialized = serialize_contact(&contact, "verified");
    assert_eq!(serialized["id"], json!("c1"));
    assert_eq!(serialized["createdAt"], json!("2026-01-01T00:00:00Z"));
    assert_eq!(serialized["verificationStatus"], json!("verified"));
    assert_eq!(serialized["workspaceUserId"], json!("wu1"));
    assert_eq!(serialized["metadata"], json!({ "k": "v" }));
}

#[test]
fn serialize_attachment_renames_and_normalizes() {
    let mut attachment = Map::new();
    attachment.insert("id".to_owned(), json!("att1"));
    attachment.insert("content_type".to_owned(), json!("application/pdf"));
    attachment.insert("created_at".to_owned(), json!("2026-01-01T00:00:00Z"));
    attachment.insert(
        "file_name".to_owned(),
        json!("11111111-1111-4111-8111-111111111111-report.pdf"),
    );
    attachment.insert("size_bytes".to_owned(), json!("4096"));
    attachment.insert("storage_path".to_owned(), json!("topic/x"));
    attachment.insert("storage_provider".to_owned(), json!("r2"));

    let serialized = serialize_attachment(&attachment);
    assert_eq!(serialized["contentType"], json!("application/pdf"));
    assert_eq!(serialized["fileName"], json!("report.pdf"));
    assert_eq!(serialized["sizeBytes"], json!(4096));
    assert_eq!(serialized["storageProvider"], json!("r2"));
}

#[test]
fn distinct_group_ids_dedupes() {
    let mut a = Map::new();
    a.insert("group_id".to_owned(), json!("g1"));
    let mut b = Map::new();
    b.insert("group_id".to_owned(), json!("g1"));
    let mut c = Map::new();
    c.insert("group_id".to_owned(), json!("g2"));
    let mut d = Map::new();
    d.insert("group_id".to_owned(), Value::Null);

    assert_eq!(
        distinct_group_ids(&[a, b, c, d]),
        vec!["g1".to_owned(), "g2".to_owned()]
    );
}

#[test]
fn resolve_group_maps_or_nulls() {
    let groups = vec![("g1".to_owned(), "Group One".to_owned())];
    let mut row = Map::new();
    row.insert("group_id".to_owned(), json!("g1"));
    assert_eq!(
        resolve_group(&row, &groups),
        json!({ "id": "g1", "name": "Group One" })
    );

    let mut missing = Map::new();
    missing.insert("group_id".to_owned(), json!("g9"));
    assert_eq!(resolve_group(&missing, &groups), Value::Null);

    assert_eq!(resolve_group(&Map::new(), &groups), Value::Null);
}
