use super::*;

// ---------------------------------------------------------------------------
// Viewing-window helpers (checkpoints/access.ts)
// ---------------------------------------------------------------------------

pub(super) fn viewing_window_days(viewing_window: Option<&str>, custom_days: Option<i64>) -> i64 {
    match viewing_window {
        Some("custom") => match custom_days {
            Some(days) if days >= 1 => days,
            _ => DEFAULT_VIEWING_WINDOW_DAYS,
        },
        Some("1_day") => 1,
        Some("3_days") => 3,
        Some("7_days") => 7,
        Some("2_weeks") => 14,
        Some("1_month") => 30,
        Some("1_quarter") => 90,
        Some("1_year") => 365,
        Some(_) => DEFAULT_VIEWING_WINDOW_DAYS,
        None => DEFAULT_VIEWING_WINDOW_DAYS,
    }
}

/// `now - days` as a millisecond-precision ISO-8601 UTC string, matching
/// JS `new Date(...).toISOString()`.
pub(super) fn checkpoint_window_start(days: i64) -> String {
    let now_ms = now_unix_millis();
    let start_ms = now_ms - days * 24 * 60 * 60 * 1000;
    iso8601_from_millis(start_ms)
}

pub(super) fn build_checkpoint_window_starts(
    rows: &[WalletWhitelistWindowRow],
) -> HashMap<String, String> {
    // For each wallet pick the widest (largest days) window.
    let mut widest: HashMap<String, i64> = HashMap::new();
    for row in rows {
        let Some(wallet_id) = row.wallet_id.as_ref() else {
            continue;
        };
        let days = viewing_window_days(row.viewing_window.as_deref(), row.custom_days);
        let entry = widest.entry(wallet_id.clone()).or_insert(days);
        if days > *entry {
            *entry = days;
        }
    }

    widest
        .into_iter()
        .map(|(wallet_id, days)| (wallet_id, checkpoint_window_start(days)))
        .collect()
}

pub(super) fn oldest_window_start(window_starts: &HashMap<String, String>) -> Option<String> {
    let mut oldest: Option<(i64, String)> = None;
    for start in window_starts.values() {
        if let Some(time) = parse_iso_millis(start) {
            match &oldest {
                Some((oldest_time, _)) if *oldest_time <= time => {}
                _ => oldest = Some((time, start.clone())),
            }
        }
    }
    oldest.map(|(_, start)| start)
}

pub(super) fn is_at_or_after_window_start(checked_at: &str, window_start: &str) -> bool {
    match (parse_iso_millis(checked_at), parse_iso_millis(window_start)) {
        (Some(checked), Some(window)) => checked >= window,
        _ => false,
    }
}

pub(super) fn checkpoint_visible_for_wallet(
    checked_at: &str,
    wallet_id: &str,
    window_starts: &HashMap<String, String>,
) -> bool {
    match window_starts.get(wallet_id) {
        None => true,
        Some(window_start) => is_at_or_after_window_start(checked_at, window_start),
    }
}

pub(super) fn filter_checkpoint_rows_by_window(
    rows: Vec<CheckpointRow>,
    window_starts: &HashMap<String, String>,
) -> Vec<CheckpointRow> {
    if window_starts.is_empty() {
        return rows;
    }
    rows.into_iter()
        .filter(|row| checkpoint_visible_for_wallet(&row.checked_at, &row.wallet_id, window_starts))
        .collect()
}

pub(super) fn interval_visible(
    interval: &IntervalRow,
    wallet_id: &str,
    window_starts: &HashMap<String, String>,
) -> bool {
    let Some(window_start) = window_starts.get(wallet_id) else {
        return true;
    };
    is_at_or_after_window_start(&interval.start_checked_at, window_start)
        && is_at_or_after_window_start(&interval.end_checked_at, window_start)
}
