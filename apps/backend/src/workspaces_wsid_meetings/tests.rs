use super::*;

// --- meetings_ws_id path guard ---

#[test]
fn path_guard_matches_exact_meetings_path() {
    assert_eq!(
        meetings_ws_id("/api/v1/workspaces/abc-123/meetings"),
        Some("abc-123")
    );
}

#[test]
fn path_guard_rejects_subpath() {
    // `/api/v1/workspaces/:wsId/meetings/:meetingId` must not match.
    assert_eq!(
        meetings_ws_id("/api/v1/workspaces/abc-123/meetings/xyz"),
        None
    );
}

#[test]
fn path_guard_rejects_wrong_suffix() {
    assert_eq!(meetings_ws_id("/api/v1/workspaces/abc-123/other"), None);
}

#[test]
fn path_guard_rejects_empty_ws_id() {
    assert_eq!(meetings_ws_id("/api/v1/workspaces//meetings"), None);
}

// --- parse_content_range_count ---

#[test]
fn content_range_parses_normal() {
    assert_eq!(parse_content_range_count("0-9/42"), Some(42));
}

#[test]
fn content_range_parses_empty_star_slash_total() {
    assert_eq!(parse_content_range_count("*/0"), Some(0));
}

#[test]
fn content_range_parses_star_star() {
    assert_eq!(parse_content_range_count("*/*"), Some(0));
}

#[test]
fn content_range_rejects_malformed() {
    assert_eq!(parse_content_range_count("garbage"), None);
}

// --- parse_js_int ---

#[test]
fn parse_js_int_plain_number() {
    assert_eq!(parse_js_int("10"), Some(10));
}

#[test]
fn parse_js_int_with_trailing_garbage() {
    assert_eq!(parse_js_int("3abc"), Some(3));
}

#[test]
fn parse_js_int_nan() {
    assert_eq!(parse_js_int("abc"), None);
}

#[test]
fn parse_js_int_negative() {
    assert_eq!(parse_js_int("-5"), Some(-5));
}

#[test]
fn parse_js_int_zero() {
    assert_eq!(parse_js_int("0"), Some(0));
}

// --- page / pageSize validation logic ---

#[test]
fn default_page_is_one() {
    assert_eq!(DEFAULT_PAGE, 1);
}

#[test]
fn default_page_size_is_ten() {
    assert_eq!(DEFAULT_PAGE_SIZE, 10);
}

#[test]
fn max_page_size_is_hundred() {
    assert_eq!(MAX_PAGE_SIZE, 100);
}

#[test]
fn page_size_boundary_valid() {
    for v in [1_i64, 50, 100] {
        assert!((1..=MAX_PAGE_SIZE).contains(&v));
    }
}

#[test]
fn page_size_boundary_invalid() {
    for v in [0_i64, 101, -1] {
        assert!(!(1..=MAX_PAGE_SIZE).contains(&v));
    }
}

struct NoOutbound;

impl OutboundHttpClient for NoOutbound {
    fn send<'a>(&'a self, _: OutboundRequest<'a>) -> crate::outbound::OutboundFuture<'a> {
        panic!("delegated requests must not read Supabase")
    }
}

#[tokio::test]
async fn delegates_app_sessions_aliases_and_mutations_to_next() {
    let config = BackendConfig::new("test", "meetings");
    for (method, path, authorization, cookie) in [
        ("GET", "/api/v1/workspaces/personal/meetings", None, None),
        ("GET", "/api/v1/workspaces/INTERNAL/meetings", None, None),
        (
            "GET",
            "/api/v1/workspaces/abc/meetings",
            Some("Bearer ttr_app_test"),
            None,
        ),
        (
            "GET",
            "/api/v1/workspaces/abc/meetings",
            None,
            Some("tuturuuu_app_session=ttr_app_test"),
        ),
        ("POST", "/api/v1/workspaces/abc/meetings", None, None),
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
        assert!(
            handle_workspaces_wsid_meetings_route(&config, request, &NoOutbound)
                .await
                .is_none()
        );
    }
}
