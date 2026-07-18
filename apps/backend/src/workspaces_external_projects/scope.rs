use super::*;
use std::collections::HashSet;

const MAX_SCOPED_COLLECTIONS: usize = 24;

pub(super) struct StudioScope {
    definition_ids: HashSet<String>,
    included_collection_ids: HashSet<String>,
    pub(super) source_collection_ids: HashSet<String>,
}

impl StudioScope {
    pub(super) fn from_rows(
        collection_slugs: &[String],
        collections: &[Value],
        definitions: &[Value],
        targets: &[Value],
    ) -> Self {
        let requested_slugs: HashSet<&str> = collection_slugs.iter().map(String::as_str).collect();
        let source_collection_ids: HashSet<String> = collections
            .iter()
            .filter(|collection| {
                collection
                    .get("slug")
                    .and_then(Value::as_str)
                    .is_some_and(|slug| requested_slugs.contains(slug))
            })
            .filter_map(row_id)
            .collect();
        let definition_ids: HashSet<String> = definitions
            .iter()
            .filter(|definition| {
                definition
                    .get("source_collection_id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| source_collection_ids.contains(id))
            })
            .filter_map(row_id)
            .collect();
        let mut included_collection_ids = source_collection_ids.clone();
        for target_collection_id in targets.iter().filter_map(|target| {
            let definition_id = target
                .get("relation_definition_id")
                .and_then(Value::as_str)?;
            if !definition_ids.contains(definition_id) {
                return None;
            }
            target
                .get("target_collection_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        }) {
            included_collection_ids.insert(target_collection_id);
        }

        Self {
            definition_ids,
            included_collection_ids,
            source_collection_ids,
        }
    }

    pub(super) fn collection_filter(&self) -> String {
        in_filter(&self.included_collection_ids)
    }

    pub(super) fn source_collection_filter(&self) -> String {
        in_filter(&self.source_collection_ids)
    }

    pub(super) fn includes_collection(&self, row: &Value) -> bool {
        row_id(row).is_some_and(|id| self.included_collection_ids.contains(&id))
    }

    pub(super) fn includes_definition(&self, row: &Value) -> bool {
        row_id(row).is_some_and(|id| self.definition_ids.contains(&id))
    }

    pub(super) fn includes_target(&self, row: &Value) -> bool {
        row.get("relation_definition_id")
            .and_then(Value::as_str)
            .is_some_and(|id| self.definition_ids.contains(id))
    }
}

pub(super) fn parse_collection_slugs(request_url: Option<&str>) -> Result<Vec<String>, ()> {
    let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) else {
        return Ok(Vec::new());
    };
    let mut collection_slugs = Vec::new();

    for (_, value) in url
        .query_pairs()
        .filter(|(key, _)| key == "collectionSlugs")
    {
        for slug in value
            .split(',')
            .map(str::trim)
            .filter(|slug| !slug.is_empty())
        {
            if !valid_collection_slug(slug) {
                return Err(());
            }
            if !collection_slugs.iter().any(|existing| existing == slug) {
                collection_slugs.push(slug.to_owned());
            }
        }
    }

    (collection_slugs.len() <= MAX_SCOPED_COLLECTIONS)
        .then_some(collection_slugs)
        .ok_or(())
}

pub(super) fn row_id(row: &Value) -> Option<String> {
    row.get("id").and_then(Value::as_str).map(str::to_owned)
}

fn in_filter(ids: &HashSet<String>) -> String {
    let mut ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    ids.sort_unstable();
    format!("in.({})", ids.join(","))
}

fn valid_collection_slug(slug: &str) -> bool {
    slug.len() <= 80
        && slug.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_deduplicated_collection_scopes() {
        assert_eq!(
            parse_collection_slugs(Some(
                "https://example.com/api?collectionSlugs=stories,tags&collectionSlugs=stories"
            )),
            Ok(vec!["stories".to_owned(), "tags".to_owned()])
        );
    }

    #[test]
    fn rejects_malformed_collection_scopes() {
        assert!(
            parse_collection_slugs(Some(
                "https://example.com/api?collectionSlugs=stories%2Fprivate"
            ))
            .is_err()
        );
    }

    #[test]
    fn includes_relation_target_collections() {
        let scope = StudioScope::from_rows(
            &["stories".to_owned()],
            &[
                json!({ "id": "stories", "slug": "stories" }),
                json!({ "id": "worlds", "slug": "worlds" }),
                json!({ "id": "characters", "slug": "characters" }),
            ],
            &[
                json!({ "id": "story-world", "source_collection_id": "stories" }),
                json!({ "id": "world-character", "source_collection_id": "worlds" }),
            ],
            &[
                json!({ "relation_definition_id": "story-world", "target_collection_id": "worlds" }),
                json!({ "relation_definition_id": "world-character", "target_collection_id": "characters" }),
            ],
        );

        assert!(scope.includes_collection(&json!({ "id": "stories" })));
        assert!(scope.includes_collection(&json!({ "id": "worlds" })));
        assert!(!scope.includes_collection(&json!({ "id": "characters" })));
    }
}
