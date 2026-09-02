use super::*;

// --- path extraction ---

#[test]
fn extracts_ws_id_from_valid_path() {
    let ws_id = extract_ws_id("/api/v1/workspaces/abc-123/tutoring/sessions");
    assert_eq!(ws_id, Some("abc-123"));
}

#[test]
fn returns_none_for_wrong_prefix() {
    assert!(extract_ws_id("/api/v2/workspaces/abc-123/tutoring/sessions").is_none());
}

#[test]
fn returns_none_for_wrong_suffix() {
    assert!(extract_ws_id("/api/v1/workspaces/abc-123/tutoring/queue").is_none());
}

#[test]
fn returns_none_for_extra_segment() {
    assert!(extract_ws_id("/api/v1/workspaces/abc/extra/tutoring/sessions").is_none());
}

#[test]
fn returns_none_for_empty_ws_id() {
    assert!(extract_ws_id("/api/v1/workspaces//tutoring/sessions").is_none());
}

// --- Content-Range parsing ---

#[test]
fn parses_content_range_count() {
    assert_eq!(parse_content_range_count(Some("0-19/57")), 57);
    assert_eq!(parse_content_range_count(Some("*/100")), 100);
    assert_eq!(parse_content_range_count(Some("0-0/1")), 1);
    assert_eq!(parse_content_range_count(None), 0);
    assert_eq!(parse_content_range_count(Some("garbage")), 0);
}

// --- UUID validation ---

#[test]
fn accepts_valid_uuid() {
    assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
}

#[test]
fn rejects_short_uuid() {
    assert!(!is_uuid("550e8400-e29b-41d4-a716"));
}

// --- date validation ---

#[test]
fn accepts_valid_date() {
    assert!(is_date_str("2025-01-15"));
}

#[test]
fn rejects_invalid_date_format() {
    assert!(!is_date_str("25-01-15"));
    assert!(!is_date_str("2025/01/15"));
    assert!(!is_date_str("not-a-date"));
}

// --- int parsing ---

#[test]
fn parse_int_min_rejects_below_minimum() {
    assert!(parse_int_min("0", 1).is_none());
}

#[test]
fn parse_int_min_accepts_valid() {
    assert_eq!(parse_int_min("5", 1), Some(5));
}

// --- query parsing ---

#[test]
fn parse_query_defaults() {
    let q = parse_query(None).unwrap();
    assert_eq!(q.page, 1);
    assert_eq!(q.page_size, 20);
    assert!(q.from_date.is_none());
    assert!(!q.sort_ascending);
}

#[test]
fn parse_query_accepts_ascending_sort_order() {
    let q = parse_query(Some(
        "https://example.com/api/v1/workspaces/ws/tutoring/sessions?sortOrder=asc",
    ))
    .unwrap();
    assert!(q.sort_ascending);

    let q = parse_query(Some(
        "https://example.com/api/v1/workspaces/ws/tutoring/sessions?sortOrder=desc",
    ))
    .unwrap();
    assert!(!q.sort_ascending);
}

#[test]
fn parse_query_rejects_unknown_sort_order() {
    let err = parse_query(Some(
        "https://example.com/api/v1/workspaces/ws/tutoring/sessions?sortOrder=sideways",
    ))
    .unwrap_err();
    assert!(matches!(err, QueryParseError::InvalidSortOrder));
}

#[test]
fn parse_query_with_filters() {
    let q = parse_query(Some(
        "https://example.com/api/v1/workspaces/ws/tutoring/sessions\
         ?fromDate=2025-01-01&toDate=2025-06-30\
         &reasonType=ABSENT_RECOVERY&attendanceStatus=DONE\
         &page=2&pageSize=10",
    ))
    .unwrap();
    assert_eq!(q.from_date.as_deref(), Some("2025-01-01"));
    assert_eq!(q.to_date.as_deref(), Some("2025-06-30"));
    assert_eq!(q.reason_type.as_deref(), Some("ABSENT_RECOVERY"));
    assert_eq!(q.attendance_status.as_deref(), Some("DONE"));
    assert_eq!(q.page, 2);
    assert_eq!(q.page_size, 10);
}

#[test]
fn parse_query_rejects_invalid_reason_type() {
    let result = parse_query(Some("https://example.com/?reasonType=UNKNOWN"));
    assert!(matches!(result, Err(QueryParseError::InvalidReasonType)));
}

#[test]
fn parse_query_rejects_page_size_over_max() {
    let result = parse_query(Some("https://example.com/?pageSize=101"));
    assert!(matches!(result, Err(QueryParseError::InvalidPageSize)));
}
