use serde_json::{Map, Value};
use std::collections::HashMap;

const CONFIGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const CONFIGS_PATH_SUFFIX: &str = "/settings/configs";
const DEFAULT_CATEGORY_CONFIG_ID: &str = "default_category_id";
const DEFAULT_CURRENCY_CONFIG_ID: &str = "DEFAULT_CURRENCY";
const DEFAULT_SUBSCRIPTION_CATEGORY_CONFIG_ID: &str = "DEFAULT_SUBSCRIPTION_CATEGORY_ID";
const DEFAULT_WALLET_CONFIG_ID: &str = "default_wallet_id";

pub(super) const DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID: &str =
    "DATABASE_DEFAULT_INCLUDED_GROUPS";

const INVOICE_CREATION_DEFAULT_CONFIG_IDS: [&str; 4] = [
    DEFAULT_WALLET_CONFIG_ID,
    DEFAULT_CATEGORY_CONFIG_ID,
    DEFAULT_SUBSCRIPTION_CATEGORY_CONFIG_ID,
    DEFAULT_CURRENCY_CONFIG_ID,
];

pub(super) fn configs_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(CONFIGS_PATH_PREFIX)?
        .strip_suffix(CONFIGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Parse the `ids` query param: split on commas, trim each entry, drop empties,
/// and de-duplicate preserving first-occurrence order. Mirrors the legacy
/// `searchParams.get('ids')?.split(',').map(trim)` -> `new Set` -> `filter(Boolean)`.
pub(super) fn parse_config_ids(request_url: Option<&str>) -> Vec<String> {
    let Some(raw) = request_url
        .and_then(|value| url::Url::parse(value).ok())
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(key, _)| key == "ids")
                .map(|(_, value)| value.into_owned())
        })
    else {
        return Vec::new();
    };

    let mut ids: Vec<String> = Vec::new();
    for part in raw.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !ids.iter().any(|existing| existing == trimmed) {
            ids.push(trimmed.to_owned());
        }
    }

    ids
}

pub(super) fn is_invoice_creation_default_read(ids: &[String]) -> bool {
    !ids.is_empty()
        && ids.iter().all(|id| {
            INVOICE_CREATION_DEFAULT_CONFIG_IDS
                .iter()
                .any(|allowed| allowed == id)
        })
}

/// Build the success body: an object keyed by each requested id. The synthetic
/// `DATABASE_DEFAULT_INCLUDED_GROUPS` id maps to the comma-joined group ids (or
/// `null` when none); every other id maps to its stored value (or `null`).
pub(super) fn build_result(
    ids: &[String],
    config_values: &HashMap<String, String>,
    included_groups: &[String],
) -> Value {
    let mut map = Map::new();

    for id in ids {
        if id == DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID {
            let value = if included_groups.is_empty() {
                Value::Null
            } else {
                Value::String(included_groups.join(","))
            };
            map.insert(id.clone(), value);
            continue;
        }

        let value = config_values
            .get(id)
            .map(|value| Value::String(value.clone()))
            .unwrap_or(Value::Null);
        map.insert(id.clone(), value);
    }

    Value::Object(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_ws_id_from_matching_path() {
        assert_eq!(
            configs_ws_id("/api/v1/workspaces/abc/settings/configs"),
            Some("abc")
        );
        assert_eq!(
            configs_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/settings/configs"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn rejects_non_matching_paths() {
        assert_eq!(configs_ws_id("/api/workspaces/abc/settings/configs"), None);
        assert_eq!(configs_ws_id("/api/v1/workspaces/abc/settings"), None);
        assert_eq!(
            configs_ws_id("/api/v1/workspaces/abc/settings/configs/extra"),
            None
        );
        assert_eq!(configs_ws_id("/api/v1/workspaces//settings/configs"), None);
        assert_eq!(
            configs_ws_id("/api/v1/workspaces/abc/extra/settings/configs"),
            None
        );
        assert_eq!(configs_ws_id("/api/v1/workspaces/abc"), None);
    }

    #[test]
    fn parses_ids_trimming_deduping_and_dropping_empties() {
        assert_eq!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs?ids=%20BRAND_NAME%20,REPORT_INTRO,,BRAND_NAME"
            )),
            vec!["BRAND_NAME".to_owned(), "REPORT_INTRO".to_owned()]
        );
    }

    #[test]
    fn parses_empty_ids_as_no_entries() {
        assert!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs"
            ))
            .is_empty()
        );
        assert!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs?ids="
            ))
            .is_empty()
        );
        assert!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs?ids=%20,%20,"
            ))
            .is_empty()
        );
        assert!(parse_config_ids(Some("not a url")).is_empty());
        assert!(parse_config_ids(None).is_empty());
    }

    #[test]
    fn recognizes_homogeneous_invoice_default_reads() {
        assert!(is_invoice_creation_default_read(&[
            DEFAULT_WALLET_CONFIG_ID.to_owned(),
            DEFAULT_CATEGORY_CONFIG_ID.to_owned(),
            DEFAULT_SUBSCRIPTION_CATEGORY_CONFIG_ID.to_owned(),
            DEFAULT_CURRENCY_CONFIG_ID.to_owned(),
        ]));
        assert!(!is_invoice_creation_default_read(&[]));
        assert!(!is_invoice_creation_default_read(&[
            DEFAULT_WALLET_CONFIG_ID.to_owned(),
            "BRAND_NAME".to_owned(),
        ]));
    }

    #[test]
    fn build_result_maps_config_values_and_null_for_missing() {
        let ids = vec!["BRAND_NAME".to_owned(), "REPORT_INTRO".to_owned()];
        let mut values = HashMap::new();
        values.insert("BRAND_NAME".to_owned(), "Acme".to_owned());

        assert_eq!(
            build_result(&ids, &values, &[]),
            json!({ "BRAND_NAME": "Acme", "REPORT_INTRO": null })
        );
    }

    #[test]
    fn build_result_joins_default_included_groups() {
        let ids = vec![DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID.to_owned()];
        let values = HashMap::new();
        let groups = vec!["g1".to_owned(), "g2".to_owned()];

        assert_eq!(
            build_result(&ids, &values, &groups),
            json!({ "DATABASE_DEFAULT_INCLUDED_GROUPS": "g1,g2" })
        );
    }

    #[test]
    fn build_result_uses_null_for_empty_default_included_groups() {
        let ids = vec![DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID.to_owned()];
        let values = HashMap::new();

        assert_eq!(
            build_result(&ids, &values, &[]),
            json!({ "DATABASE_DEFAULT_INCLUDED_GROUPS": null })
        );
    }

    #[test]
    fn build_result_mixes_groups_and_config_values() {
        let ids = vec![
            DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID.to_owned(),
            DEFAULT_CURRENCY_CONFIG_ID.to_owned(),
        ];
        let mut values = HashMap::new();
        values.insert(DEFAULT_CURRENCY_CONFIG_ID.to_owned(), "USD".to_owned());
        let groups = vec!["g1".to_owned()];

        assert_eq!(
            build_result(&ids, &values, &groups),
            json!({ "DATABASE_DEFAULT_INCLUDED_GROUPS": "g1", "DEFAULT_CURRENCY": "USD" })
        );
    }
}
