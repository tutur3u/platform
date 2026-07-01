use super::*;

// ---------------------------------------------------------------------------
// Snapshot builder (mirrors buildExternalProjectSyncSnapshot in sync.ts).
//
// Note: generatedAt is server-generated; the legacy code defaults it to
// `new Date().toISOString()`. We mirror that with `now_iso8601()`.
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
pub(super) fn build_external_project_sync_snapshot(
    binding: &Value,
    workspace_id: &str,
    collections: &[Value],
    entries: &[Value],
    blocks: &[Value],
    assets: &[Value],
    field_definitions: &[Value],
) -> Value {
    let canonical_schema = get_schema_from_binding(binding);

    // collectionsById, blocksById
    // blocksByEntryId / assetsByEntryId
    let mut blocks_by_entry_id: Map<String, Value> = Map::new();
    for block in blocks {
        if let Some(entry_id) = block.get("entry_id").and_then(Value::as_str) {
            blocks_by_entry_id
                .entry(entry_id.to_owned())
                .or_insert_with(|| Value::Array(Vec::new()));
            if let Some(Value::Array(list)) = blocks_by_entry_id.get_mut(entry_id) {
                list.push(block.clone());
            }
        }
    }

    // blocksById lookup (block id -> block) for asset -> entry resolution and
    // for asset block stable_source_id lookup.
    let mut blocks_by_id: Map<String, Value> = Map::new();
    for block in blocks {
        if let Some(id) = block.get("id").and_then(Value::as_str) {
            blocks_by_id.insert(id.to_owned(), block.clone());
        }
    }

    let mut assets_by_entry_id: Map<String, Value> = Map::new();
    for asset in assets {
        // assetEntryId = asset.entry_id ?? (asset.block_id ? blocksById[block].entry_id : null)
        let asset_entry_id = asset
            .get("entry_id")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| {
                asset
                    .get("block_id")
                    .and_then(Value::as_str)
                    .and_then(|block_id| blocks_by_id.get(block_id))
                    .and_then(|block| block.get("entry_id"))
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            });

        let Some(entry_id) = asset_entry_id else {
            continue;
        };
        assets_by_entry_id
            .entry(entry_id.clone())
            .or_insert_with(|| Value::Array(Vec::new()));
        if let Some(Value::Array(list)) = assets_by_entry_id.get_mut(&entry_id) {
            list.push(asset.clone());
        }
    }

    // collectionsById (id -> collection)
    let mut collections_by_id: Map<String, Value> = Map::new();
    for collection in collections {
        if let Some(id) = collection.get("id").and_then(Value::as_str) {
            collections_by_id.insert(id.to_owned(), collection.clone());
        }
    }

    // schema = { ...canonicalSchema, collections: studio.collections.map(getCollectionSchema) }
    let schema_collections: Vec<Value> = collections
        .iter()
        .map(|collection| get_collection_schema(collection, &canonical_schema))
        .collect();
    let mut schema = canonical_schema.clone();
    if let Value::Object(map) = &mut schema {
        map.insert("collections".to_owned(), Value::Array(schema_collections));
    } else {
        schema = json!({ "collections": schema_collections });
    }

    let db_backed_schema =
        with_field_definitions_from_database(collections, field_definitions, schema);

    // content.entries
    let mut content_entries: Vec<Value> = Vec::new();
    for entry in entries {
        let collection_id = entry.get("collection_id").and_then(Value::as_str);
        let collection = collection_id.and_then(|id| collections_by_id.get(id));
        let collection_slug = collection
            .and_then(|c| c.get("slug"))
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| collection_id.unwrap_or_default().to_owned());

        let entry_id = entry.get("id").and_then(Value::as_str).unwrap_or_default();

        // entryKey = entry.stable_source_id ?? `${collectionSlug}/${entry.slug}`
        let entry_slug = entry
            .get("slug")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let entry_key = entry
            .get("stable_source_id")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| format!("{collection_slug}/{entry_slug}"));

        // assets sorted by sort_order asc, mapped to sync asset shape.
        let mut entry_assets: Vec<Value> = assets_by_entry_id
            .get(entry_id)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        entry_assets.sort_by_key(sort_order_of);
        let mapped_assets: Vec<Value> = entry_assets
            .iter()
            .map(|asset| {
                let block_stable_source_id = asset
                    .get("block_id")
                    .and_then(Value::as_str)
                    .and_then(|block_id| blocks_by_id.get(block_id))
                    .and_then(|block| block.get("stable_source_id"))
                    .and_then(|v| if v.is_null() { None } else { Some(v.clone()) })
                    .unwrap_or(Value::Null);
                json!({
                    "altText": asset.get("alt_text").cloned().unwrap_or(Value::Null),
                    "assetType": asset.get("asset_type").cloned().unwrap_or(Value::Null),
                    "blockStableSourceId": if asset
                        .get("block_id")
                        .map(|v| !v.is_null())
                        .unwrap_or(false)
                    {
                        block_stable_source_id
                    } else {
                        Value::Null
                    },
                    "id": asset.get("id").cloned().unwrap_or(Value::Null),
                    "metadata": as_record_value(asset.get("metadata")),
                    "sortOrder": asset.get("sort_order").cloned().unwrap_or(Value::Null),
                    "sourceUrl": asset.get("source_url").cloned().unwrap_or(Value::Null),
                    "stableSourceId": null_if_absent(asset.get("stable_source_id")),
                    "storagePath": asset.get("storage_path").cloned().unwrap_or(Value::Null),
                })
            })
            .collect();

        // blocks sorted by sort_order asc, mapped to sync block shape.
        let mut entry_blocks: Vec<Value> = blocks_by_entry_id
            .get(entry_id)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        entry_blocks.sort_by_key(sort_order_of);
        let mapped_blocks: Vec<Value> = entry_blocks
            .iter()
            .map(|block| {
                json!({
                    "blockType": block.get("block_type").cloned().unwrap_or(Value::Null),
                    "content": as_record_value(block.get("content")),
                    "id": block.get("id").cloned().unwrap_or(Value::Null),
                    "sortOrder": block.get("sort_order").cloned().unwrap_or(Value::Null),
                    "stableSourceId": null_if_absent(block.get("stable_source_id")),
                    "title": block.get("title").cloned().unwrap_or(Value::Null),
                })
            })
            .collect();

        // stableSourceId: entry.stable_source_id ?? entryKey
        let stable_source_id = entry
            .get("stable_source_id")
            .and_then(|v| if v.is_null() { None } else { Some(v.clone()) })
            .unwrap_or_else(|| Value::String(entry_key.clone()));

        content_entries.push(json!({
            "assets": mapped_assets,
            "blocks": mapped_blocks,
            "collectionSlug": collection_slug,
            "id": entry.get("id").cloned().unwrap_or(Value::Null),
            "metadata": as_record_value(entry.get("metadata")),
            "profileData": as_record_value(entry.get("profile_data")),
            "publishedAt": entry.get("published_at").cloned().unwrap_or(Value::Null),
            "scheduledFor": entry.get("scheduled_for").cloned().unwrap_or(Value::Null),
            "slug": entry.get("slug").cloned().unwrap_or(Value::Null),
            "stableSourceId": stable_source_id,
            "status": entry.get("status").cloned().unwrap_or(Value::Null),
            "subtitle": entry.get("subtitle").cloned().unwrap_or(Value::Null),
            "summary": entry.get("summary").cloned().unwrap_or(Value::Null),
            "title": entry.get("title").cloned().unwrap_or(Value::Null),
        }));
    }

    // adapter: binding.adapter ?? 'yoola'
    let snapshot_adapter = binding
        .get("adapter")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| DEFAULT_ADAPTER.to_owned());

    json!({
        "adapter": snapshot_adapter,
        "canonicalProjectId": binding.get("canonical_id").cloned().unwrap_or(Value::Null),
        "content": { "entries": content_entries },
        "generatedAt": now_iso8601(),
        "schema": db_backed_schema,
        "version": 1,
        "workspaceId": workspace_id,
    })
}
