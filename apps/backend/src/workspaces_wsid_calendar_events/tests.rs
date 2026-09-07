use super::*;

#[test]
fn ws_id_matches_exact_mount_path() {
    assert_eq!(
        calendar_events_ws_id("/api/v1/workspaces/ws-123/calendar/events"),
        Some("ws-123")
    );
}

#[test]
fn ws_id_ignores_unrelated_paths() {
    // Missing `v1` prefix.
    assert_eq!(
        calendar_events_ws_id("/api/workspaces/ws-123/calendar/events"),
        None
    );
    // Trailing segment (e.g. a specific event ID).
    assert_eq!(
        calendar_events_ws_id("/api/v1/workspaces/ws-123/calendar/events/evt-1"),
        None
    );
    // Sibling resource.
    assert_eq!(
        calendar_events_ws_id("/api/v1/workspaces/ws-123/calendar/categories"),
        None
    );
    // Short path must not panic.
    assert_eq!(calendar_events_ws_id("/api/v1/workspaces"), None);
}

#[test]
fn ws_id_rejects_empty_workspace_segment() {
    assert_eq!(
        calendar_events_ws_id("/api/v1/workspaces//calendar/events"),
        None
    );
}

#[test]
fn parse_date_range_params_accepts_both_params() {
    let result = parse_date_range_params(Some(
        "https://example.com/api/v1/workspaces/ws-1/calendar/events\
         ?start_at=2024-01-01T00:00:00Z&end_at=2024-01-31T23:59:59Z",
    ));
    assert_eq!(
        result,
        Some((
            "2024-01-01T00:00:00Z".to_owned(),
            "2024-01-31T23:59:59Z".to_owned()
        ))
    );
}

#[test]
fn parse_date_range_params_rejects_missing_start_at() {
    let result = parse_date_range_params(Some(
        "https://example.com/api/path?end_at=2024-01-31T23:59:59Z",
    ));
    assert!(result.is_none());
}

#[test]
fn parse_date_range_params_rejects_missing_end_at() {
    let result = parse_date_range_params(Some(
        "https://example.com/api/path?start_at=2024-01-01T00:00:00Z",
    ));
    assert!(result.is_none());
}

#[test]
fn parse_date_range_params_rejects_empty_values() {
    let result = parse_date_range_params(Some(
        "https://example.com/api/path?start_at=&end_at=2024-01-31T23:59:59Z",
    ));
    assert!(result.is_none());
}

#[test]
fn parse_date_range_params_returns_none_for_missing_url() {
    assert!(parse_date_range_params(None).is_none());
}

#[test]
fn error_response_uses_legacy_error_key() {
    let resp = error_response(400, DATES_REQUIRED_MESSAGE);
    assert_eq!(resp.status, 400);
    assert_eq!(
        resp.body,
        json!({ "error": "Start and end dates are required" })
    );

    let resp = error_response(401, UNAUTHORIZED_MESSAGE);
    assert_eq!(resp.status, 401);
    assert_eq!(resp.body, json!({ "error": "Unauthorized" }));

    let resp = error_response(403, ACCESS_DENIED_MESSAGE);
    assert_eq!(resp.status, 403);
    assert_eq!(resp.body, json!({ "error": "Workspace access denied" }));

    let resp = error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
    assert_eq!(resp.status, 500);
    assert_eq!(
        resp.body,
        json!({ "error": "Failed to verify workspace membership" })
    );
}

struct PagedEvents {
    urls: std::sync::Mutex<Vec<String>>,
}
impl OutboundHttpClient for PagedEvents {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> crate::outbound::OutboundFuture<'a> {
        let mut urls = self.urls.lock().unwrap();
        let first = urls.is_empty();
        urls.push(request.url.to_string());
        let count = if first { 1000 } else { 1 };
        let body = (0..count)
            .map(|id| json!({"id": format!("{}-{id}", if first { "first" } else { "last" })}))
            .collect::<Vec<_>>();
        Box::pin(async move {
            Ok(OutboundResponse {
                status: 200,
                headers: vec![],
                body_text: json!(body).to_string(),
            })
        })
    }
}

#[tokio::test]
async fn full_year_reads_beyond_database_row_limit() {
    let outbound = PagedEvents {
        urls: std::sync::Mutex::new(vec![]),
    };
    let config = contact::ContactDataConfig::new("https://example.supabase.co", "test-key");
    let events = fetch_calendar_events(&config, &outbound, "workspace", "2026-01-01", "2027-01-01")
        .await
        .unwrap();
    assert_eq!(events.len(), 1001);
    let urls = outbound.urls.lock().unwrap();
    assert_eq!(urls.len(), 2);
    let next = url::Url::parse(&urls[1]).unwrap();
    let params: std::collections::HashMap<_, _> = next.query_pairs().collect();
    assert_eq!(params.get("offset").unwrap(), "1000");
    assert_eq!(params.get("ws_id").unwrap(), "eq.workspace");
    assert_eq!(params.get("order").unwrap(), "start_at.asc,id.asc");
}
