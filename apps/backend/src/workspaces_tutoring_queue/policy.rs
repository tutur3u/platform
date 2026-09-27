use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

use super::send_service_role_request;
use crate::{contact, outbound::OutboundHttpClient};

const DEFAULT_REASSESSMENT_DAYS: i64 = 14;
const DEFAULT_ABSENCE_LOOKBACK_DAYS: i64 = 28;

pub(super) struct QueuePolicy {
    pub(super) reassessment_days: i64,
    pub(super) absence_lookback_days: i64,
    pub(super) weak_content_review_days: i64,
    pub(super) group_exclusions: Vec<GroupExclusion>,
}

#[derive(Deserialize)]
pub(super) struct GroupExclusion {
    scope: String,
    #[serde(rename = "match")]
    match_kind: String,
    value: String,
}

#[derive(Deserialize)]
struct ConfigRow {
    id: String,
    value: Option<String>,
}

pub(super) async fn load_queue_policy(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<QueuePolicy, ()> {
    let params = [
        ("select", "id,value".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("id", "like.TUTORING_POLICY*".to_owned()),
    ];
    let url = contact_data
        .rest_url("workspace_configs", &params)
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<ConfigRow>>().map_err(|_| ())?;
    let configured = decode_policy_rows(&rows);
    let easy_center = configured
        .as_ref()
        .and_then(|value| value.get("preset")?.as_str())
        == Some("easy_center");
    Ok(QueuePolicy {
        reassessment_days: configured
            .as_ref()
            .and_then(|value| value.get("reassessmentDays")?.as_i64())
            .filter(|days| (1..=90).contains(days))
            .unwrap_or(DEFAULT_REASSESSMENT_DAYS),
        absence_lookback_days: configured
            .as_ref()
            .and_then(|value| value.get("absenceLookbackDays")?.as_i64())
            .filter(|days| (1..=365).contains(days))
            .unwrap_or(DEFAULT_ABSENCE_LOOKBACK_DAYS),
        weak_content_review_days: configured
            .as_ref()
            .and_then(|value| value.get("weakContentReviewDays")?.as_i64())
            .filter(|days| (0..=90).contains(days))
            .unwrap_or(if easy_center { 14 } else { 0 }),
        group_exclusions: configured
            .as_ref()
            .and_then(|value| value.get("groupExclusions")?.as_array())
            .filter(|rules| rules.len() <= 30)
            .map(|rules| {
                rules
                    .iter()
                    .filter_map(|rule| serde_json::from_value(rule.clone()).ok())
                    .collect()
            })
            .unwrap_or_else(|| {
                if easy_center {
                    vec![GroupExclusion {
                        scope: "all".to_owned(),
                        match_kind: "contains".to_owned(),
                        value: "DDT".to_owned(),
                    }]
                } else {
                    Vec::new()
                }
            }),
    })
}

fn decode_policy_rows(rows: &[ConfigRow]) -> Option<Value> {
    let values: BTreeMap<&str, &str> = rows
        .iter()
        .filter_map(|row| Some((row.id.as_str(), row.value.as_deref()?)))
        .collect();
    let base: Value = serde_json::from_str(values.get("TUTORING_POLICY")?).ok()?;
    if base.get("format").and_then(Value::as_str) != Some("chunks-v1") {
        return Some(base);
    }
    let parts = usize::try_from(base.get("parts")?.as_u64()?).ok()?;
    if !(1..=100).contains(&parts) {
        return None;
    }
    let mut json = String::new();
    for index in 0..parts {
        json.push_str(values.get(format!("TUTORING_POLICY_PART_{index}").as_str())?);
    }
    serde_json::from_str(&json).ok()
}

pub(super) fn group_excluded(policy: &QueuePolicy, group_name: &str, reason: &str) -> bool {
    let name = group_name.trim().to_lowercase();
    policy.group_exclusions.iter().any(|rule| {
        if rule.scope != "all" && rule.scope != reason {
            return false;
        }
        let value = rule.value.trim().to_lowercase();
        if value.is_empty() {
            return false;
        }
        match rule.match_kind.as_str() {
            "exact" => name == value,
            "prefix" => name.starts_with(&value),
            "suffix" => name.ends_with(&value),
            "contains" => name.contains(&value),
            _ => false,
        }
    })
}

pub(super) fn unchanged_feedback_since(rows: &[(String, String)]) -> Option<String> {
    let (latest_content, latest_date) = rows.first()?;
    let normalized = latest_content
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if normalized.is_empty() {
        return None;
    }
    let mut since = latest_date.clone();
    for (content, date) in rows.iter().skip(1) {
        if content.split_whitespace().collect::<Vec<_>>().join(" ") != normalized {
            break;
        }
        since = date.clone();
    }
    Some(since)
}

pub(super) fn content_review_due(since: Option<&str>, days: i64, today: i64) -> bool {
    days > 0
        && since
            .and_then(iso_day)
            .is_some_and(|first_day| today - first_day >= days)
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

pub(super) fn iso_day(value: &str) -> Option<i64> {
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
    use super::{
        ConfigRow, GroupExclusion, QueuePolicy, content_review_due, decode_policy_rows,
        group_excluded, iso_day, reassessment_due, unchanged_feedback_since,
    };

    #[test]
    fn completed_support_returns_for_review_after_configured_days() {
        let today = iso_day("2026-09-27").unwrap();
        assert!(!reassessment_due(Some("2026-09-20T10:00:00Z"), 14, today));
        assert!(reassessment_due(Some("2026-09-13T10:00:00Z"), 14, today));
        assert!(reassessment_due(None, 14, today));
    }

    #[test]
    fn chunked_policy_preserves_editable_rules() {
        let rows = vec![
            ConfigRow {
                id: "TUTORING_POLICY".to_owned(),
                value: Some(r#"{"format":"chunks-v1","parts":2}"#.to_owned()),
            },
            ConfigRow {
                id: "TUTORING_POLICY_PART_0".to_owned(),
                value: Some(r#"{"weakContentReviewDays":14,"group"#.to_owned()),
            },
            ConfigRow {
                id: "TUTORING_POLICY_PART_1".to_owned(),
                value: Some(
                    r#"Exclusions":[{"scope":"all","match":"contains","value":"DDT"}]}"#.to_owned(),
                ),
            },
        ];
        let configured = decode_policy_rows(&rows).unwrap();
        assert_eq!(configured["weakContentReviewDays"], 14);
        assert_eq!(configured["groupExclusions"][0]["value"], "DDT");
        assert!(decode_policy_rows(&rows[..2]).is_none());
    }

    #[test]
    fn group_exclusions_and_review_interval_follow_policy() {
        let policy = QueuePolicy {
            reassessment_days: 14,
            absence_lookback_days: 21,
            weak_content_review_days: 14,
            group_exclusions: vec![GroupExclusion {
                scope: "all".to_owned(),
                match_kind: "contains".to_owned(),
                value: "DDT".to_owned(),
            }],
        };
        assert!(group_excluded(&policy, "Kindergarten ddt", "make_up"));
        assert!(!group_excluded(&policy, "Class 246", "weak_support"));
        let since = unchanged_feedback_since(&[
            ("Unit 3".to_owned(), "2026-09-26T10:00:00Z".to_owned()),
            ("Unit  3".to_owned(), "2026-09-12T10:00:00Z".to_owned()),
        ]);
        assert_eq!(since.as_deref(), Some("2026-09-12T10:00:00Z"));
        assert!(content_review_due(
            since.as_deref(),
            policy.weak_content_review_days,
            iso_day("2026-09-27").unwrap()
        ));
    }
}
