use super::*;
use serde_json::json;

fn health(runs: serde_json::Value, enabled: bool) -> SyncHealthSummary {
    let accounts = serde_json::from_value::<Vec<AccountRow>>(
        json!([{"id":"account", "provider":"google", "expires_at":"2026-07-01T00:00:00Z"}]),
    )
    .unwrap();
    let connections = serde_json::from_value::<Vec<ConnectionRow>>(
        json!([{"auth_token_id":"account", "is_enabled":enabled}]),
    )
    .unwrap();
    let runs = serde_json::from_value::<Vec<DashboardRow>>(runs).unwrap();
    classify_calendar_sync_health(
        &accounts,
        &connections,
        &runs,
        timestamp(Some("2026-09-06T12:00:00Z")),
    )
}

#[test]
fn completed_sync_is_healthy_despite_access_token_expiry() {
    let result = health(
        json!([{"status":"completed", "start_time":"2026-09-06T11:50:00Z", "end_time":"2026-09-06T11:51:00Z"}]),
        true,
    );
    assert_eq!(result.state, "healthy");
    assert!(result.last_success_at.is_some());
}

#[test]
fn stale_running_record_is_recoverable() {
    let result = health(
        json!([{"status":"running", "start_time":"2026-07-20T07:09:42Z"}]),
        true,
    );
    assert_eq!(result.reason, "sync_stalled");
    assert!(!result.currently_running);
    assert_eq!(result.retry_after_seconds, None);
}

#[test]
fn missing_or_old_sync_is_not_healthy() {
    assert_eq!(health(json!([]), true).reason, "not_synced");
    assert_eq!(health(json!([{"status":"completed", "start_time":"2026-09-06T10:00:00Z", "end_time":"2026-09-06T10:01:00Z"}]), true).reason, "sync_stale");
    assert_eq!(health(json!([]), false).state, "paused");
}

#[test]
fn cooldown_is_computed_from_latest_run_not_stored_snapshot() {
    let result = health(
        json!([{"status":"failed", "start_time":"2026-09-06T11:59:50Z", "cooldown_remaining_seconds":30}]),
        true,
    );
    assert_eq!(result.retry_after_seconds, Some(20));
}

#[test]
fn enabled_orphaned_connection_requires_reconnect() {
    let connections = serde_json::from_value::<Vec<ConnectionRow>>(
        json!([{"auth_token_id":"inactive-account", "is_enabled":true}]),
    )
    .unwrap();
    let result = classify_calendar_sync_health(
        &[],
        &connections,
        &[],
        timestamp(Some("2026-09-06T12:00:00Z")),
    );
    assert_eq!(result.reason, "reconnect_required");
}
