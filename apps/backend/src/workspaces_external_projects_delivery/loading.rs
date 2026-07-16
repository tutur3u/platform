use serde_json::{Map, Value, json};

pub(super) fn build_loading_data(adapter: &str, collections: &[Value]) -> Value {
    if adapter == "yoola" {
        return build_yoola_loading_data(collections);
    }

    let mut sections = Map::new();
    for collection in collections {
        let slug = collection
            .get("slug")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let entry_count = collection
            .get("entries")
            .and_then(Value::as_array)
            .map(|entries| entries.len())
            .unwrap_or(0);
        sections.insert(
            slug.to_owned(),
            json!({
                "collectionType": collection.get("collection_type").cloned().unwrap_or(Value::Null),
                "entryCount": entry_count,
                "title": collection.get("title").cloned().unwrap_or(Value::Null),
            }),
        );
    }

    json!({
        "adapter": adapter,
        "sections": Value::Object(sections),
    })
}

fn build_yoola_loading_data(collections: &[Value]) -> Value {
    let empty: Vec<Value> = Vec::new();
    let collection_entries = |slug: &str| -> &[Value] {
        collections
            .iter()
            .find(|collection| collection.get("slug").and_then(Value::as_str) == Some(slug))
            .and_then(|collection| collection.get("entries"))
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&empty)
    };

    let artworks: Vec<Value> = collection_entries("artworks")
        .iter()
        .map(build_yoola_artwork)
        .collect();

    let mut artwork_by_slug: Map<String, Value> = Map::new();
    for artwork in &artworks {
        if let Some(slug) = artwork.get("slug").and_then(Value::as_str) {
            artwork_by_slug.insert(slug.to_owned(), artwork.clone());
        }
    }

    let lore_capsules: Vec<Value> = collection_entries("lore-capsules")
        .iter()
        .map(|entry| build_yoola_lore_capsule(entry, &artwork_by_slug))
        .collect();

    let mut singleton_sections: Map<String, Value> = Map::new();
    for entry in collection_entries("singleton-sections") {
        let slug = entry
            .get("slug")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        singleton_sections.insert(slug, build_yoola_section(entry));
    }

    let mut artworks_by_category: Map<String, Value> = Map::new();
    for artwork in &artworks {
        let category = artwork
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or("UNCATEGORIZED")
            .to_owned();
        if !artworks_by_category.contains_key(&category) {
            artworks_by_category.insert(category.clone(), Value::Array(Vec::new()));
        }
        if let Some(Value::Array(bucket)) = artworks_by_category.get_mut(&category) {
            bucket.push(artwork.clone());
        }
    }

    let available_categories: std::collections::HashSet<String> = artworks_by_category
        .keys()
        .map(|category| category.to_lowercase())
        .collect();
    let gallery_profile = singleton_sections
        .get("gallery")
        .and_then(|section| section.get("profileData"))
        .map(as_json_object_value)
        .unwrap_or_else(|| Value::Object(Map::new()));
    let configured_categories: Vec<Value> =
        normalize_string_array(gallery_profile.get("categoryOptions"))
            .into_iter()
            .filter(|category| available_categories.contains(&category.to_lowercase()))
            .map(Value::String)
            .collect();

    let featured_artwork = artworks.first().cloned().unwrap_or(Value::Null);

    json!({
        "adapter": "yoola",
        "artworkCategories": configured_categories,
        "artworks": artworks,
        "artworksByCategory": Value::Object(artworks_by_category),
        "featuredArtwork": featured_artwork,
        "loreCapsules": lore_capsules,
        "singletonSections": Value::Object(singleton_sections),
    })
}

fn build_yoola_artwork(entry: &Value) -> Value {
    let profile = json_object_field(entry, "profile_data");
    let assets = entry.get("assets").and_then(Value::as_array);
    let lead_asset = assets.and_then(|assets| {
        assets
            .iter()
            .find(|asset| asset.get("asset_type").and_then(Value::as_str) == Some("image"))
    });

    json!({
        "altText": lead_asset
            .and_then(|asset| asset.get("alt_text"))
            .cloned()
            .unwrap_or(Value::Null),
        "assetId": lead_asset
            .and_then(|asset| asset.get("id"))
            .cloned()
            .unwrap_or(Value::Null),
        "assetUrl": lead_asset
            .and_then(|asset| asset.get("assetUrl"))
            .cloned()
            .unwrap_or(Value::Null),
        "caption": find_asset_caption(lead_asset),
        "category": as_string(profile.get("category")),
        "entryId": entry.get("id").cloned().unwrap_or(Value::Null),
        "height": as_nullable_number(profile.get("height")),
        "label": as_string(profile.get("label")),
        "note": as_string(profile.get("note")),
        "orientation": as_string(profile.get("orientation")),
        "rarity": as_string(profile.get("rarity")),
        "slug": entry.get("slug").cloned().unwrap_or(Value::Null),
        "summary": entry.get("summary").cloned().unwrap_or(Value::Null),
        "title": entry.get("title").cloned().unwrap_or(Value::Null),
        "width": as_nullable_number(profile.get("width")),
        "year": as_string(profile.get("year")),
    })
}

fn build_yoola_lore_capsule(entry: &Value, artwork_by_slug: &Map<String, Value>) -> Value {
    let profile = json_object_field(entry, "profile_data");
    let artwork_slug = profile
        .get("artworkSlug")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let artwork_entry = artwork_slug.and_then(|slug| artwork_by_slug.get(slug));
    let markdown = find_markdown_block_markdown(entry);

    json!({
        "artworkAssetUrl": artwork_entry
            .and_then(|artwork| artwork.get("assetUrl"))
            .cloned()
            .unwrap_or(Value::Null),
        "artworkEntryId": artwork_entry
            .and_then(|artwork| artwork.get("entryId"))
            .cloned()
            .unwrap_or(Value::Null),
        "bodyMarkdown": markdown.clone(),
        "channel": as_string(profile.get("channel")),
        "date": as_string(profile.get("date")),
        "entryId": entry.get("id").cloned().unwrap_or(Value::Null),
        "excerptMarkdown": markdown,
        "metadata": json_object_field(entry, "metadata"),
        "profileData": Value::Object(profile.clone()),
        "slug": entry.get("slug").cloned().unwrap_or(Value::Null),
        "status": as_string(profile.get("status")),
        "subtitle": entry.get("subtitle").cloned().unwrap_or(Value::Null),
        "summary": entry.get("summary").cloned().unwrap_or(Value::Null),
        "tags": as_string_array(profile.get("tags")),
        "teaser": as_string(profile.get("teaser")),
        "title": entry.get("title").cloned().unwrap_or(Value::Null),
    })
}

fn build_yoola_section(entry: &Value) -> Value {
    json!({
        "bodyMarkdown": find_markdown_block_markdown(entry),
        "entryId": entry.get("id").cloned().unwrap_or(Value::Null),
        "metadata": json_object_field(entry, "metadata"),
        "profileData": Value::Object(json_object_field(entry, "profile_data")),
        "slug": entry.get("slug").cloned().unwrap_or(Value::Null),
        "subtitle": entry.get("subtitle").cloned().unwrap_or(Value::Null),
        "summary": entry.get("summary").cloned().unwrap_or(Value::Null),
        "title": entry.get("title").cloned().unwrap_or(Value::Null),
    })
}

pub(super) fn as_json_object_value(value: &Value) -> Value {
    if value.is_object() {
        value.clone()
    } else {
        Value::Object(Map::new())
    }
}

fn json_object_field(entry: &Value, key: &str) -> Map<String, Value> {
    entry
        .get(key)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn as_string(value: Option<&Value>) -> Value {
    match value.and_then(Value::as_str) {
        Some(text) if !text.trim().is_empty() => Value::String(text.to_owned()),
        _ => Value::Null,
    }
}

fn as_nullable_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) if number.as_f64().is_some_and(f64::is_finite) => {
            Value::Number(number.clone())
        }
        _ => Value::Null,
    }
}

fn as_string_array(value: Option<&Value>) -> Value {
    let items: Vec<Value> = value
        .and_then(Value::as_array)
        .map(|array| {
            array
                .iter()
                .filter(|item| item.is_string())
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    Value::Array(items)
}

fn normalize_string_array(value: Option<&Value>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    if let Some(array) = value.and_then(Value::as_array) {
        for item in array {
            if let Some(text) = item.as_str() {
                let trimmed = text.trim();
                if !trimmed.is_empty() && seen.insert(trimmed.to_owned()) {
                    result.push(trimmed.to_owned());
                }
            }
        }
    }
    result
}

fn find_asset_caption(asset: Option<&Value>) -> Value {
    let metadata = asset
        .and_then(|asset| asset.get("metadata"))
        .and_then(Value::as_object);
    as_string(metadata.and_then(|metadata| metadata.get("caption")))
}

fn find_markdown_block_markdown(entry: &Value) -> Value {
    let Some(blocks) = entry.get("blocks").and_then(Value::as_array) else {
        return Value::Null;
    };

    let markdown_block = blocks.iter().find(|block| {
        block.get("block_type").and_then(Value::as_str) == Some("markdown")
            && block
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| content.get("markdown"))
                .is_some_and(Value::is_string)
    });

    let content = markdown_block
        .and_then(|block| block.get("content"))
        .and_then(Value::as_object);
    as_string(content.and_then(|content| content.get("markdown")))
}
