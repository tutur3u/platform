use super::*;
use crate::outbound::{OutboundHttpClient, OutboundRequest};

struct NoOutbound;

impl OutboundHttpClient for NoOutbound {
    fn send<'a>(&'a self, _: OutboundRequest<'a>) -> crate::outbound::OutboundFuture<'a> {
        panic!("delegated tutoring requests must not read Supabase")
    }
}

#[tokio::test]
async fn tutoring_app_sessions_and_unported_methods_fall_through_to_next() {
    let config = BackendConfig::new("test", "tutoring");
    for (path, handler) in [
        (
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/tutoring/sessions",
            0,
        ),
        (
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/tutoring/queue",
            1,
        ),
        (
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/tutoring/export",
            2,
        ),
    ] {
        for (method, authorization, cookie) in [
            ("GET", Some("Bearer ttr_app_test"), None),
            ("GET", None, Some("tuturuuu_app_session=ttr_app_test")),
            ("POST", None, None),
        ] {
            let request = BackendRequest {
                authorization,
                body_text: None,
                cookie,
                if_none_match: None,
                method,
                origin: None,
                path,
                referer: None,
                request_id: None,
                url: None,
            };
            let response = match handler {
                0 => {
                    handle_workspaces_wsid_tutoring_sessions_route(&config, request, &NoOutbound)
                        .await
                }
                1 => {
                    crate::workspaces_tutoring_queue::handle_workspaces_tutoring_queue_route(
                        &config,
                        request,
                        &NoOutbound,
                    )
                    .await
                }
                _ => {
                    crate::workspaces_tutoring_export::handle_workspaces_tutoring_export_route(
                        &config,
                        request,
                        &NoOutbound,
                    )
                    .await
                }
            };
            assert!(response.is_none(), "{method} {path} should fall through");
        }
    }
}

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
