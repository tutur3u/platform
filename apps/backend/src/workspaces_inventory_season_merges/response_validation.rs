//! Reject malformed provider data before it can become a confirmable review.
use super::validation::uuid;
use serde_json::Value;
fn nonempty(value: &Value, key: &str) -> bool {
    value
        .get(key)
        .and_then(Value::as_str)
        .is_some_and(|s| !s.is_empty())
}
fn id(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_str).is_some_and(uuid)
}
fn count(value: &Value, key: &str) -> bool {
    value
        .get(key)
        .and_then(Value::as_u64)
        .is_some_and(|n| n <= 9_007_199_254_740_991)
}
fn period(value: &Value) -> bool {
    id(value, "id")
        && nonempty(value, "name")
        && ["description", "starts_at", "ends_at", "time_zone"]
            .iter()
            .all(|key| {
                value
                    .get(*key)
                    .is_some_and(|v| v.is_null() || v.is_string())
            })
        && matches!(
            value.get("pricing_mode").and_then(Value::as_str),
            Some("legacy" | "scheduled")
        )
        && matches!(
            value.get("product_scope").and_then(Value::as_str),
            Some("all" | "allowlist" | "blocklist")
        )
}
fn bounded(value: &Value, key: &str, predicate: impl Fn(&Value) -> bool) -> bool {
    value
        .get(key)
        .and_then(Value::as_array)
        .is_some_and(|rows| rows.len() <= 50 && rows.iter().all(predicate))
}
fn identity(row: &Value) -> bool {
    id(row, "productId")
        && ["productName", "unitName", "warehouseName"]
            .iter()
            .all(|key| nonempty(row, key))
}
fn time(row: &Value, key: &str, nullable: bool) -> bool {
    // Provider timestamps must be RFC3339-shaped; PostgreSQL owns the values.
    row.get(key).is_some_and(|v| {
        (nullable && v.is_null())
            || v.as_str().is_some_and(|s| {
                s.len() >= 20
                    && s.as_bytes().get(10) == Some(&b'T')
                    && (s.ends_with('Z')
                        || s.as_bytes()
                            .get(s.len().saturating_sub(6))
                            .is_some_and(|c| *c == b'+' || *c == b'-'))
            })
    })
}
pub(super) fn valid(value: &Value, execute: bool) -> bool {
    if execute {
        return value.get("merged") == Some(&Value::Bool(true))
            && id(value, "targetId")
            && count(value, "importedPriceCount");
    }
    id(value, "version")
        && time(value, "cutoff", false)
        && time(value, "expiresAt", false)
        && value
            .get("page")
            .and_then(Value::as_u64)
            .is_some_and(|n| (1..=100000).contains(&n))
        && value.get("source").is_some_and(period)
        && value.get("target").is_some_and(period)
        && [
            "sourceRuleCount",
            "targetRuleCount",
            "sourceRuleConflictCount",
            "targetRuleConflictCount",
            "futurePriceCount",
            "conflictCount",
            "assignmentCount",
            "historicalQuoteCount",
        ]
        .iter()
        .all(|key| count(value, key))
        && value.get("hasMore").is_some_and(Value::is_boolean)
        && value
            .get("blockers")
            .and_then(Value::as_array)
            .is_some_and(|rows| rows.iter().all(Value::is_string))
        && ["sourceRules", "targetRules"]
            .iter()
            .all(|key| bounded(value, key, |row| id(row, "id") && nonempty(row, "name")))
        && bounded(value, "futurePrices", |row| {
            identity(row)
                && ["id", "unitId", "warehouseId"]
                    .iter()
                    .all(|key| id(row, key))
                && nonempty(row, "currency")
                && row.get("price").is_some_and(Value::is_number)
                && time(row, "validFrom", false)
                && time(row, "validTo", true)
        })
        && bounded(value, "conflicts", |row| {
            identity(row)
                && id(row, "sourcePriceId")
                && id(row, "targetPriceId")
                && ["sourceCurrency", "targetCurrency"]
                    .iter()
                    .all(|key| nonempty(row, key))
                && ["sourcePrice", "targetPrice"]
                    .iter()
                    .all(|key| row.get(*key).is_some_and(Value::is_number))
                && ["sourceFrom", "targetFrom"]
                    .iter()
                    .all(|key| time(row, key, false))
                && ["sourceTo", "targetTo"]
                    .iter()
                    .all(|key| time(row, key, true))
        })
}
