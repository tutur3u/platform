use super::*;

// ---------------------------------------------------------------------------
// Asset decoration (mirrors buildDeliveryAssetUrl + studio asset mapping)
// ---------------------------------------------------------------------------

pub(super) fn decorate_asset(workspace_id: &str, mut asset: Value) -> Value {
    let id = asset.get("id").and_then(Value::as_str).map(str::to_owned);
    let revision = asset
        .get("updated_at")
        .and_then(Value::as_str)
        .map(|value| {
            value
                .chars()
                .filter(char::is_ascii_digit)
                .collect::<String>()
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "0".to_owned());
    let asset_type = asset
        .get("asset_type")
        .and_then(Value::as_str)
        .map(str::to_owned);

    let asset_url = build_delivery_asset_url(workspace_id, id.as_deref(), &revision, false);
    let preview_url = if asset_type.as_deref() == Some("image") {
        build_delivery_asset_url(workspace_id, id.as_deref(), &revision, true)
    } else {
        asset_url.clone()
    };

    if let Value::Object(map) = &mut asset {
        map.insert("asset_url".to_owned(), json!(asset_url));
        map.insert("assetRevision".to_owned(), json!(revision));
        map.insert("preview_url".to_owned(), json!(preview_url));
    }
    asset
}

/// Mirrors buildDeliveryAssetUrl. `preview` selects the EPM image preview
/// transform (width=1600, height=1600, quality=82, resize=cover). The legacy
/// code calls URLSearchParams.set in order: width, height, resize, quality.
fn build_delivery_asset_url(
    workspace_id: &str,
    asset_id: Option<&str>,
    revision: &str,
    preview: bool,
) -> Option<String> {
    // If there is no id we cannot build a delivery URL. The legacy code never hits
    // this branch (assets always have an id), so this is a defensive fallback.
    let asset_id = asset_id?;

    let base = format!(
        "/api/v1/workspaces/{workspace_id}/external-projects/assets/{asset_id}?v={revision}"
    );
    if !preview {
        return Some(base);
    }

    // Preview transform query (stable order matching the legacy .set() calls).
    Some(format!(
        "{base}&width=1600&height=1600&resize=cover&quality=82"
    ))
}

// ---------------------------------------------------------------------------
// Delivery collections (mirrors collectionsPayload assembly)
// ---------------------------------------------------------------------------

pub(super) struct DeliveryCollection {
    slug: Option<String>,
    title: Option<String>,
    collection_type: Option<String>,
    entries: Vec<DeliveryEntry>,
}

struct DeliveryEntry {
    /// Full raw entry row (used for profile_data / metadata / slug / etc.).
    row: Value,
    /// Markdown content extracted from the first markdown block (if any).
    markdown: Option<String>,
    /// Decorated assets belonging to this entry, in the delivery shape.
    assets: Vec<DeliveryAsset>,
}

struct DeliveryAsset {
    asset_type: Option<String>,
    id: Option<String>,
    alt_text: Option<String>,
    /// `assetUrl` field in the delivery asset shape.
    asset_url: Option<String>,
    caption: Option<String>,
}

pub(super) fn build_delivery_collections(
    collections: &[Value],
    entries: &[Value],
    assets: &[Value],
    blocks: &[Value],
) -> Vec<DeliveryCollection> {
    collections
        .iter()
        .map(|collection| {
            let collection_id = collection.get("id").and_then(Value::as_str);
            let collection_entries: Vec<DeliveryEntry> = entries
                .iter()
                .filter(|entry| entry.get("collection_id").and_then(Value::as_str) == collection_id)
                .map(|entry| {
                    let entry_id = entry.get("id").and_then(Value::as_str);
                    let entry_assets: Vec<DeliveryAsset> = assets
                        .iter()
                        .filter(|asset| asset.get("entry_id").and_then(Value::as_str) == entry_id)
                        .map(|asset| DeliveryAsset {
                            asset_type: asset
                                .get("asset_type")
                                .and_then(Value::as_str)
                                .map(str::to_owned),
                            id: asset.get("id").and_then(Value::as_str).map(str::to_owned),
                            alt_text: asset
                                .get("alt_text")
                                .and_then(Value::as_str)
                                .map(str::to_owned),
                            // `assetUrl` mirrors the studio asset's asset_url.
                            asset_url: asset
                                .get("asset_url")
                                .and_then(Value::as_str)
                                .map(str::to_owned),
                            caption: find_asset_caption(asset),
                        })
                        .collect();
                    let markdown = find_markdown_block_markdown(blocks, entry_id);
                    DeliveryEntry {
                        row: entry.clone(),
                        markdown,
                        assets: entry_assets,
                    }
                })
                .collect();

            DeliveryCollection {
                slug: collection
                    .get("slug")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                title: collection
                    .get("title")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                collection_type: collection
                    .get("collection_type")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                entries: collection_entries,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Loading data (mirrors buildExternalProjectLoadingData)
// ---------------------------------------------------------------------------

pub(super) fn build_loading_data(
    adapter: Option<&str>,
    collections: &[DeliveryCollection],
) -> Value {
    let Some(adapter) = adapter else {
        return Value::Null;
    };

    if adapter == "yoola" {
        return build_yoola_loading_data(collections);
    }

    let mut sections = Map::new();
    for collection in collections {
        let key = collection.slug.clone().unwrap_or_default();
        sections.insert(
            key,
            json!({
                "collectionType": collection.collection_type,
                "entryCount": collection.entries.len(),
                "title": collection.title,
            }),
        );
    }

    json!({
        "adapter": adapter,
        "sections": Value::Object(sections),
    })
}

fn build_yoola_loading_data(collections: &[DeliveryCollection]) -> Value {
    let find = |slug: &str| collections.iter().find(|c| c.slug.as_deref() == Some(slug));
    let empty: Vec<DeliveryEntry> = Vec::new();

    let artworks_entries = find("artworks").map(|c| &c.entries).unwrap_or(&empty);
    let lore_entries = find("lore-capsules").map(|c| &c.entries).unwrap_or(&empty);
    let singleton_entries = find("singleton-sections")
        .map(|c| &c.entries)
        .unwrap_or(&empty);

    // artworks
    let artworks: Vec<Value> = artworks_entries
        .iter()
        .map(|entry| {
            let profile = as_json_object(entry.row.get("profile_data"));
            let lead_asset = entry
                .assets
                .iter()
                .find(|asset| asset.asset_type.as_deref() == Some("image"));
            json!({
                "altText": lead_asset.and_then(|a| a.alt_text.clone()),
                "assetId": lead_asset.and_then(|a| a.id.clone()),
                "assetUrl": lead_asset.and_then(|a| a.asset_url.clone()),
                "caption": lead_asset.and_then(|a| a.caption.clone()),
                "category": as_string(profile.get("category")),
                "entryId": entry.row.get("id"),
                "height": as_nullable_number(profile.get("height")),
                "label": as_string(profile.get("label")),
                "note": as_string(profile.get("note")),
                "orientation": as_string(profile.get("orientation")),
                "rarity": as_string(profile.get("rarity")),
                "slug": entry.row.get("slug"),
                "summary": entry.row.get("summary"),
                "title": entry.row.get("title"),
                "width": as_nullable_number(profile.get("width")),
                "year": as_string(profile.get("year")),
            })
        })
        .collect();

    // artworkBySlug lookup map (slug -> artwork value).
    let mut artwork_by_slug: Map<String, Value> = Map::new();
    for artwork in &artworks {
        if let Some(slug) = artwork.get("slug").and_then(Value::as_str) {
            artwork_by_slug.insert(slug.to_owned(), artwork.clone());
        }
    }

    // loreCapsules
    let lore_capsules: Vec<Value> = lore_entries
        .iter()
        .map(|entry| {
            let profile = as_json_object(entry.row.get("profile_data"));
            let artwork_entry = as_string(profile.get("artworkSlug"))
                .and_then(|slug| artwork_by_slug.get(&slug).cloned());
            let body_markdown = entry.markdown.clone();
            json!({
                "artworkAssetUrl": artwork_entry
                    .as_ref()
                    .and_then(|a| a.get("assetUrl").cloned())
                    .unwrap_or(Value::Null),
                "artworkEntryId": artwork_entry
                    .as_ref()
                    .and_then(|a| a.get("entryId").cloned())
                    .unwrap_or(Value::Null),
                "bodyMarkdown": body_markdown,
                "channel": as_string(profile.get("channel")),
                "date": as_string(profile.get("date")),
                "entryId": entry.row.get("id"),
                "excerptMarkdown": entry.markdown.clone(),
                "metadata": as_json_object_value(entry.row.get("metadata")),
                "profileData": Value::Object(profile.clone()),
                "slug": entry.row.get("slug"),
                "status": as_string(profile.get("status")),
                "subtitle": entry.row.get("subtitle"),
                "summary": entry.row.get("summary"),
                "tags": as_string_array(profile.get("tags")),
                "teaser": as_string(profile.get("teaser")),
                "title": entry.row.get("title"),
            })
        })
        .collect();

    // singletonSections: Object keyed by slug.
    let mut singleton_sections: Map<String, Value> = Map::new();
    for entry in singleton_entries {
        let slug = entry
            .row
            .get("slug")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_default();
        singleton_sections.insert(
            slug.clone(),
            json!({
                "bodyMarkdown": entry.markdown.clone(),
                "entryId": entry.row.get("id"),
                "metadata": as_json_object_value(entry.row.get("metadata")),
                "profileData": as_json_object_value(entry.row.get("profile_data")),
                "slug": entry.row.get("slug"),
                "subtitle": entry.row.get("subtitle"),
                "summary": entry.row.get("summary"),
                "title": entry.row.get("title"),
            }),
        );
    }

    // artworksByCategory (category default 'UNCATEGORIZED').
    let mut artworks_by_category: Map<String, Value> = Map::new();
    for artwork in &artworks {
        let category = artwork
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or("UNCATEGORIZED")
            .to_owned();
        artworks_by_category
            .entry(category)
            .or_insert_with(|| Value::Array(Vec::new()));
    }
    // Second pass to push in order (entry() above borrows mutably; do push now).
    for artwork in &artworks {
        let category = artwork
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or("UNCATEGORIZED")
            .to_owned();
        if let Some(Value::Array(list)) = artworks_by_category.get_mut(&category) {
            list.push(artwork.clone());
        }
    }

    // configuredArtworkCategories: gallery section profileData.categoryOptions
    // intersected (case-insensitive) with available categories.
    let gallery_profile = singleton_sections
        .get("gallery")
        .and_then(|section| section.get("profileData"))
        .map(as_json_object_owned)
        .unwrap_or_default();
    let available_categories: std::collections::HashSet<String> = artworks_by_category
        .keys()
        .map(|category| category.to_lowercase())
        .collect();
    let configured_categories: Vec<String> =
        normalize_string_array(gallery_profile.get("categoryOptions"))
            .into_iter()
            .filter(|category| available_categories.contains(&category.to_lowercase()))
            .collect();

    json!({
        "adapter": "yoola",
        "artworkCategories": configured_categories,
        "artworks": artworks,
        "artworksByCategory": Value::Object(artworks_by_category),
        "featuredArtwork": artworks.first().cloned().unwrap_or(Value::Null),
        "loreCapsules": lore_capsules,
        "singletonSections": Value::Object(singleton_sections),
    })
}

/// Mirrors findMarkdownBlockMarkdown: first block of type 'markdown' whose
/// content.markdown is a string, for the given entry id.
fn find_markdown_block_markdown(blocks: &[Value], entry_id: Option<&str>) -> Option<String> {
    blocks
        .iter()
        .filter(|block| block.get("entry_id").and_then(Value::as_str) == entry_id)
        .find(|block| {
            block.get("block_type").and_then(Value::as_str) == Some("markdown")
                && block
                    .get("content")
                    .and_then(|content| content.get("markdown"))
                    .and_then(Value::as_str)
                    .is_some()
        })
        .and_then(|block| {
            block
                .get("content")
                .and_then(|content| content.get("markdown"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
}

fn find_asset_caption(asset: &Value) -> Option<String> {
    as_string(as_json_object(asset.get("metadata")).get("caption"))
}
