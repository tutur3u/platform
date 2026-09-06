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
    assert_eq!(parse_content_range_count("*/*"), None);
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

#[test]
fn validates_the_pagination_used_by_the_route() {
    assert_eq!(parse_pagination(None, None), Ok((1, 10)));
    assert_eq!(parse_pagination(Some(""), Some("")), Ok((1, 10)));
    assert_eq!(parse_pagination(Some("3abc"), Some("100")), Ok((3, 100)));
    assert_eq!(parse_pagination(Some("1"), Some("1")), Ok((1, 1)));
    for invalid in ["0", "-1", "abc"] {
        assert_eq!(parse_pagination(Some(invalid), None), Err(INVALID_PAGE_MSG));
    }
    for invalid in ["0", "101", "-1", "abc"] {
        assert_eq!(
            parse_pagination(None, Some(invalid)),
            Err(INVALID_PAGE_SIZE_MSG)
        );
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
        ("GET", "/api/v1/workspaces/my-team/meetings", None, None),
        (
            "GET",
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/meetings",
            Some("Bearer ttr_app_test"),
            None,
        ),
        (
            "GET",
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/meetings",
            None,
            Some("tuturuuu_app_session=ttr_app_test"),
        ),
        (
            "POST",
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/meetings",
            None,
            None,
        ),
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

#[test]
fn accepts_only_literal_workspace_uuids_for_the_partial_port() {
    assert!(is_workspace_uuid("00000000-0000-0000-0000-000000000000"));
    assert!(is_workspace_uuid("AABBCCDD-1234-5678-9ABC-DEF012345678"));
    assert!(!is_workspace_uuid("my-team"));
    assert!(!is_workspace_uuid("00000000-0000-0000-0000-00000000000z"));
}
