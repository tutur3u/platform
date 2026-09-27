use serde::Deserialize;

use super::send_service_role_request;
use crate::{contact, outbound::OutboundHttpClient};

const DEFAULT_REASSESSMENT_DAYS: i64 = 14;

#[derive(Deserialize)]
struct ConfigRow {
    value: Option<String>,
}

pub(super) async fn load_reassessment_days(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let params = [
        ("select", "value".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("id", "eq.TUTORING_POLICY".to_owned()),
        ("limit", "1".to_owned()),
    ];
    let url = contact_data
        .rest_url("workspace_configs", &params)
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<ConfigRow>>().map_err(|_| ())?;
    let configured = rows
        .first()
        .and_then(|row| row.value.as_deref())
        .and_then(|value| serde_json::from_str::<serde_json::Value>(value).ok())
        .and_then(|value| value.get("reassessmentDays")?.as_i64());
    Ok(configured
        .filter(|days| (1..=90).contains(days))
        .unwrap_or(DEFAULT_REASSESSMENT_DAYS))
}

pub(super) fn current_utc_day() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| (elapsed.as_secs() / 86_400) as i64)
        .unwrap_or(0)
}

pub(super) fn reassessment_due(resolved_at: Option<&str>, days: i64, today: i64) -> bool {
    resolved_at
        .and_then(iso_day)
        .is_none_or(|resolved_day| today - resolved_day >= days)
}

fn iso_day(value: &str) -> Option<i64> {
    let date = value.get(..10)?;
    let (year, rest) = date.split_once('-')?;
    let (month, day) = rest.split_once('-')?;
    let year: i64 = year.parse().ok()?;
    let month: i64 = month.parse().ok()?;
    let day: i64 = day.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let adjusted_year = year - i64::from(month <= 2);
    let era = adjusted_year.div_euclid(400);
    let year_of_era = adjusted_year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let year_day = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(era * 146_097 + year_day - 719_468)
}

#[cfg(test)]
mod tests {
    use super::{iso_day, reassessment_due};

    #[test]
    fn completed_support_returns_for_review_after_configured_days() {
        let today = iso_day("2026-09-27").unwrap();
        assert!(!reassessment_due(Some("2026-09-20T10:00:00Z"), 14, today));
        assert!(reassessment_due(Some("2026-09-13T10:00:00Z"), 14, today));
        assert!(reassessment_due(None, 14, today));
    }
}
