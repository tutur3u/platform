use super::{AccountRow, ConnectionRow, DashboardRow, SyncHealthSummary};

const RUNNING_WINDOW_SECONDS: i64 = 5 * 60;
const STALE_WINDOW_SECONDS: i64 = 45 * 60;

fn timestamp(value: Option<&str>) -> i64 {
    value.and_then(parse_rfc3339_epoch_seconds).unwrap_or(0)
}

// Source parity with apps/calendar/src/lib/calendar/sync-health.ts.
// This backend remains a future migration target, not the production owner.
pub(super) fn classify_calendar_sync_health(
    accounts: &[AccountRow],
    connections: &[ConnectionRow],
    recent_runs: &[DashboardRow],
    now_seconds: i64,
) -> SyncHealthSummary {
    let mut runs: Vec<_> = recent_runs.iter().collect();
    runs.sort_by_key(|run| std::cmp::Reverse(timestamp(run.start_time.as_deref())));
    let last_success = runs
        .iter()
        .find(|run| matches!(run.status.as_deref(), Some("completed" | "success")));
    let last_failure = runs
        .iter()
        .find(|run| run.status.as_deref() == Some("failed"));
    let latest = runs.first();
    let currently_running = runs.iter().any(|run| {
        let age = now_seconds - timestamp(run.start_time.as_deref());
        run.status.as_deref() == Some("running") && (0..RUNNING_WINDOW_SECONDS).contains(&age)
    });
    let latest_age = latest.map(|run| now_seconds - timestamp(run.start_time.as_deref()));
    let retry_after_seconds = latest_age
        .filter(|age| (0..30).contains(age))
        .map(|age| 30 - age);
    let mut result = SyncHealthSummary {
        state: "healthy",
        reason: "ok".to_owned(),
        currently_running,
        retry_after_seconds,
        last_success_at: last_success.and_then(|run| run.end_time.clone()),
        last_failure_at: last_failure
            .and_then(|run| run.end_time.clone().or_else(|| run.start_time.clone())),
    };
    let orphaned = connections.iter().any(|connection| {
        connection.is_enabled == Some(true)
            && connection.auth_token_id.as_ref().is_some_and(|id| {
                !id.is_null()
                    && !accounts
                        .iter()
                        .any(|account| account.id.as_ref() == Some(id))
            })
    });
    let (state, reason) = if orphaned {
        ("degraded", "reconnect_required")
    } else if accounts.is_empty() {
        ("disconnected", "no_accounts")
    } else if currently_running {
        ("syncing", "running")
    } else if !connections
        .iter()
        .any(|connection| connection.is_enabled == Some(true))
    {
        ("paused", "no_enabled_calendars")
    } else if latest.is_some_and(|run| run.status.as_deref() == Some("running")) {
        ("degraded", "sync_stalled")
    } else if latest.is_some_and(|run| run.status.as_deref() == Some("failed")) {
        (
            "degraded",
            latest
                .and_then(|run| run.error_type.as_deref())
                .filter(|value| !value.is_empty())
                .unwrap_or("last_run_failed"),
        )
    } else if last_success.is_none() {
        ("degraded", "not_synced")
    } else if now_seconds - timestamp(result.last_success_at.as_deref()) > STALE_WINDOW_SECONDS {
        ("degraded", "sync_stale")
    } else {
        ("healthy", "ok")
    };
    result.state = state;
    result.reason = reason.to_owned();
    result
}

#[cfg(test)]
mod tests;

// Self-contained RFC3339 -> epoch-seconds parser (no chrono dependency
// available in this crate). Mirrors the parser in
// workspaces_user_groups_sessions_group_summaries.rs.
fn parse_rfc3339_epoch_seconds(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if value.len() < 19 {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    if bytes.get(4) != Some(&b'-') {
        return None;
    }
    let month: i64 = value.get(5..7)?.parse().ok()?;
    if bytes.get(7) != Some(&b'-') {
        return None;
    }
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let sep = bytes.get(10)?;
    if *sep != b'T' && *sep != b't' && *sep != b' ' {
        return None;
    }
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    if bytes.get(13) != Some(&b':') {
        return None;
    }
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    if bytes.get(16) != Some(&b':') {
        return None;
    }
    let second: i64 = value.get(17..19)?.parse().ok()?;

    let mut rest = &value[19..];
    if rest.starts_with('.') {
        let frac_end = rest[1..]
            .find(|c: char| !c.is_ascii_digit())
            .map(|index| index + 1)
            .unwrap_or(rest.len());
        rest = &rest[frac_end..];
    }

    let offset_seconds = if rest.is_empty() || rest == "Z" || rest == "z" {
        0
    } else {
        let sign = match rest.as_bytes().first() {
            Some(b'+') => 1,
            Some(b'-') => -1,
            _ => return None,
        };
        let body = &rest[1..];
        let (oh, om) = if let Some((h, m)) = body.split_once(':') {
            (h, m)
        } else if body.len() == 4 {
            (&body[0..2], &body[2..4])
        } else if body.len() == 2 {
            (body, "0")
        } else {
            return None;
        };
        let oh: i64 = oh.parse().ok()?;
        let om: i64 = om.parse().ok()?;
        sign * (oh * 3600 + om * 60)
    };

    let days = days_from_civil(year, month, day);
    let utc = days * 86_400 + hour * 3600 + minute * 60 + second - offset_seconds;
    Some(utc)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}
