use super::*;

// ---------------------------------------------------------------------------
// CMS editor capabilities (mirrors getExternalProjectCmsEditorCapabilities)
// ---------------------------------------------------------------------------

const EXTERNAL_PROJECT_DISPLAY_NAMES: &[(&str, &str)] = &[
    ("exocorpse", "Exocorpse"),
    ("junly", "Junly"),
    ("kendra", "Kendra"),
    ("shu", "Shu"),
    ("theguyser", "TheGuyser"),
    ("yashie", "Yashie"),
    ("shiraoki", "Shiraoki"),
    ("yoola", "Yoola"),
];

fn default_collections_for_adapter(adapter: &str) -> Vec<&'static str> {
    match adapter {
        "exocorpse" => vec!["portfolio-art", "writing", "games"],
        "kendra" => vec!["profile", "voice-reels", "credits", "studio", "contact"],
        "junly" => vec![
            "research-projects",
            "game-projects",
            "artworks",
            "feed-posts",
            "music-tracks",
            "singleton-sections",
        ],
        "theguyser" => vec![
            "panel-content",
            "awards",
            "gallery",
            "experience",
            "contact-social",
        ],
        "shu" => vec![
            "profile",
            "projects",
            "games",
            "contact",
            "town-stops",
            "asset-library",
        ],
        "yashie" => vec![
            "profile",
            "writing-worlds",
            "gallery",
            "blog-posts",
            "shop-products",
            "social-links",
        ],
        "shiraoki" => vec![
            "site-config",
            "launch-gate",
            "navigation",
            "editorial-sections",
            "shopify-settings",
        ],
        "yoola" => vec!["artworks", "lore-capsules", "singleton-sections"],
        _ => Vec::new(),
    }
}

fn slug_to_label(slug: &str) -> String {
    slug.split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn dedupe_strings(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let trimmed = value.trim().to_owned();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.clone()) {
            result.push(trimmed);
        }
    }
    result
}

pub(super) fn build_cms_capabilities(binding: &Value, collections: &[Value]) -> Value {
    let adapter = binding.get("adapter").and_then(Value::as_str);
    let canonical_project = binding.get("canonical_project");

    let app_label = canonical_project
        .and_then(|p| p.get("display_name"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            adapter.and_then(|adapter| {
                EXTERNAL_PROJECT_DISPLAY_NAMES
                    .iter()
                    .find(|(key, _)| *key == adapter)
                    .map(|(_, name)| (*name).to_owned())
            })
        })
        .unwrap_or_else(|| "External project".to_owned());

    let base = json!({
        "adapter": adapter,
        "appLabel": app_label,
        "collectionViews": build_collection_views(binding, collections),
        "contentModel": {
            "enabled": true,
            "fieldDefinitionsEnabled": true,
        },
        "defaultViewId": "all",
        "featuredEntryRules": if adapter == Some("yoola") {
            json!([{
                "collectionSlugs": ["artworks"],
                "id": "yoola-featured-artwork",
                "label": "Featured artwork",
                "maxItems": 1,
                "metadataKey": "featured",
            }])
        } else {
            json!([])
        },
        "media": {
            "assetTypes": ["image", "video", "audio", "file"],
            "enabled": true,
            "supportsAltText": true,
            "supportsCoverSelection": true,
            "supportsUploads": true,
        },
        "navigationLabel": app_label,
        "preview": {
            "enabled": true,
            "entryPreviewEnabled": true,
        },
        "taxonomies": build_taxonomies(adapter),
        "version": 1,
        "workflow": {
            "enabled": true,
            "scheduledPublishingEnabled": true,
            "statuses": ["draft", "scheduled", "published", "archived"],
        },
    });

    merge_capabilities(base, metadata_capability_override(canonical_project))
}

fn configured_collection_slugs(binding: &Value) -> Vec<String> {
    let adapter = binding.get("adapter").and_then(Value::as_str);
    let mut values: Vec<String> = adapter
        .map(|adapter| {
            default_collections_for_adapter(adapter)
                .into_iter()
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    if let Some(allowed) = binding
        .get("canonical_project")
        .and_then(|p| p.get("allowed_collections"))
        .and_then(Value::as_array)
    {
        for item in allowed {
            if let Some(slug) = item.as_str() {
                values.push(slug.to_owned());
            }
        }
    }
    dedupe_strings(values)
}

fn build_collection_views(binding: &Value, collections: &[Value]) -> Value {
    let configured_slugs = configured_collection_slugs(binding);
    let actual_slugs: Vec<String> = collections
        .iter()
        .filter_map(|c| c.get("slug").and_then(Value::as_str).map(str::to_owned))
        .collect();
    let slug_candidates = dedupe_strings(
        configured_slugs
            .iter()
            .cloned()
            .chain(actual_slugs.iter().cloned()),
    );

    let mut views = vec![json!({
        "id": "all",
        "includeAll": true,
        "label": "All content",
        "navigationLabel": "Library",
    })];

    // hasGameLikeCollections: join configured + actual slugs, lowercase, contains 'game'.
    let combined = configured_slugs
        .iter()
        .cloned()
        .chain(actual_slugs.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if combined.contains("game") {
        let game_slugs: Vec<String> = slug_candidates
            .iter()
            .filter(|slug| slug.to_lowercase().contains("game"))
            .cloned()
            .collect();
        views.push(json!({
            "id": "games",
            "collectionSlugs": game_slugs,
            "collectionTypes": ["game", "games"],
            "createCollection": {
                "collectionType": "game",
                "description": "Playable projects and game pages.",
                "emptyHint": "Create a games collection and start adding playable project entries.",
                "entryTitle": "Untitled game",
                "slug": "games",
                "title": "Games",
            },
            "label": "Games",
            "navigationLabel": "Games",
        }));
    }

    for collection in collections {
        let slug = collection.get("slug").and_then(Value::as_str).unwrap_or("");
        let title = collection
            .get("title")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty());
        let label = title
            .map(str::to_owned)
            .unwrap_or_else(|| slug_to_label(slug));
        let collection_type = collection.get("collection_type").and_then(Value::as_str);
        // [collection_type].filter(Boolean): drop null/empty string.
        let collection_types: Vec<&str> = collection_type
            .filter(|value| !value.is_empty())
            .into_iter()
            .collect();
        views.push(json!({
            "id": format!("collection:{slug}"),
            "collectionSlugs": [slug],
            "collectionTypes": collection_types,
            "description": collection.get("description"),
            "label": label,
            "navigationLabel": label,
        }));
    }

    Value::Array(views)
}

fn build_taxonomies(adapter: Option<&str>) -> Value {
    if adapter != Some("yoola") {
        return json!([]);
    }
    json!([
        {
            "categoryField": "categoryOptions",
            "collectionSlugs": ["artworks"],
            "id": "yoola-gallery-taxonomy",
            "label": "Gallery taxonomy",
            "sectionCollectionSlugs": ["singleton-sections"],
            "sectionSlug": "gallery",
            "sectionTitle": "Gallery",
            "tagField": "tagOptions",
        },
        {
            "categoryField": "categoryOptions",
            "collectionSlugs": ["lore-capsules", "writing"],
            "collectionTypes": ["lore", "writing"],
            "id": "yoola-writing-taxonomy",
            "label": "Writing taxonomy",
            "sectionCollectionSlugs": ["singleton-sections"],
            "sectionSlug": "writing",
            "sectionTitle": "Writing",
            "tagField": "tagOptions",
        }
    ])
}

/// Mirrors getMetadataCapabilityOverride: { ...legacy, ...direct } where
/// legacy = metadata.cmsEditor, direct = metadata.cmsEditorCapabilities.
fn metadata_capability_override(canonical_project: Option<&Value>) -> Map<String, Value> {
    let metadata = canonical_project
        .and_then(|p| p.get("metadata"))
        .map(as_json_object_owned)
        .unwrap_or_default();
    let direct = metadata
        .get("cmsEditorCapabilities")
        .map(as_json_object_owned)
        .unwrap_or_default();
    let legacy = metadata
        .get("cmsEditor")
        .map(as_json_object_owned)
        .unwrap_or_default();

    let mut merged = legacy;
    for (key, value) in direct {
        merged.insert(key, value);
    }
    merged
}

/// Mirrors mergeCapabilities(base, override).
fn merge_capabilities(base: Value, override_map: Map<String, Value>) -> Value {
    let Value::Object(mut result) = base else {
        return base;
    };

    // Spread override over base first (shallow), then re-apply the structured rules.
    for (key, value) in &override_map {
        result.insert(key.clone(), value.clone());
    }

    let get_override = |key: &str| override_map.get(key);
    let get_override_object = |key: &str| -> Map<String, Value> {
        override_map
            .get(key)
            .map(as_json_object_owned)
            .unwrap_or_default()
    };

    // collectionViews: override array or base.
    if let Some(value) = get_override("collectionViews")
        && value.is_array()
    {
        result.insert("collectionViews".to_owned(), value.clone());
    }

    // contentModel: { ...base.contentModel, ...override.contentModel }.
    {
        let mut content_model = result
            .get("contentModel")
            .map(as_json_object_owned)
            .unwrap_or_default();
        // result currently has override's spread value; rebuild from base + override.
        // base.contentModel was overwritten above; reconstruct from override only is wrong,
        // so merge override on top of the (already merged) value retains base keys.
        for (key, value) in get_override_object("contentModel") {
            content_model.insert(key, value);
        }
        result.insert("contentModel".to_owned(), Value::Object(content_model));
    }

    // featuredEntryRules: override array or base.
    if let Some(value) = get_override("featuredEntryRules")
        && value.is_array()
    {
        result.insert("featuredEntryRules".to_owned(), value.clone());
    }

    // media: { ...base.media, ...override.media, assetTypes: dedupe([...base, ...override]) }.
    {
        let mut media = result
            .get("media")
            .map(as_json_object_owned)
            .unwrap_or_default();
        let override_media = get_override_object("media");
        for (key, value) in &override_media {
            media.insert(key.clone(), value.clone());
        }
        // assetTypes deduped from base.media.assetTypes ++ override.media.assetTypes.
        let mut asset_types: Vec<String> = Vec::new();
        // base media assetTypes are the canonical 4 from `base` json above.
        for value in ["image", "video", "audio", "file"] {
            asset_types.push(value.to_owned());
        }
        for value in as_string_array_vec(override_media.get("assetTypes")) {
            asset_types.push(value);
        }
        media.insert("assetTypes".to_owned(), json!(dedupe_strings(asset_types)));
        result.insert("media".to_owned(), Value::Object(media));
    }

    // preview: { ...base.preview, ...override.preview }.
    {
        let mut preview = result
            .get("preview")
            .map(as_json_object_owned)
            .unwrap_or_default();
        for (key, value) in get_override_object("preview") {
            preview.insert(key, value);
        }
        result.insert("preview".to_owned(), Value::Object(preview));
    }

    // taxonomies: override array or base.
    if let Some(value) = get_override("taxonomies")
        && value.is_array()
    {
        result.insert("taxonomies".to_owned(), value.clone());
    }

    // version: always 1.
    result.insert("version".to_owned(), json!(1));

    // workflow: { ...base.workflow, ...override.workflow, statuses: override array or base }.
    {
        let mut workflow = result
            .get("workflow")
            .map(as_json_object_owned)
            .unwrap_or_default();
        let override_workflow = get_override_object("workflow");
        for (key, value) in &override_workflow {
            workflow.insert(key.clone(), value.clone());
        }
        // statuses: override.workflow.statuses if array, else base.
        match override_workflow.get("statuses") {
            Some(value) if value.is_array() => {
                workflow.insert("statuses".to_owned(), value.clone());
            }
            _ => {
                workflow.insert(
                    "statuses".to_owned(),
                    json!(["draft", "scheduled", "published", "archived"]),
                );
            }
        }
        result.insert("workflow".to_owned(), Value::Object(workflow));
    }

    Value::Object(result)
}
