use super::*;

// ---------------------------------------------------------------------------
// Schema helpers (mirror getSchemaFromBinding / getCollectionSchema /
// normalizeCollectionSchema / withFieldDefinitionsFromDatabase /
// fieldDefinitionToSyncField in sync.ts).
// ---------------------------------------------------------------------------

/// asSyncSchema: a value is a sync schema iff it is an object with an array
/// `collections` field.
fn as_sync_schema(value: Option<&Value>) -> Option<Value> {
    match value {
        Some(Value::Object(map)) if map.get("collections").map(Value::is_array) == Some(true) => {
            Some(Value::Object(map.clone()))
        }
        _ => None,
    }
}

/// getSchemaFromBinding: deliveryProfile = binding.canonical_project.delivery_profile,
/// then asSyncSchema(deliveryProfile.schema) ?? { collections: [] }.
pub(super) fn get_schema_from_binding(binding: &Value) -> Value {
    let delivery_profile = binding
        .get("canonical_project")
        .and_then(|p| p.get("delivery_profile"))
        .map(as_record_owned)
        .unwrap_or_default();

    as_sync_schema(delivery_profile.get("schema")).unwrap_or_else(|| json!({ "collections": [] }))
}

/// normalizeCollectionSchema: builds the canonical collection schema object.
fn normalize_collection_schema(value: &Value) -> Value {
    json!({
        "assetTypes": array_or_empty(value.get("assetTypes")),
        "blockTypes": array_or_empty(value.get("blockTypes")),
        "collection_type": value.get("collection_type").cloned().unwrap_or(Value::Null),
        "config": as_record_value(value.get("config")),
        "description": value.get("description").cloned().unwrap_or(Value::Null),
        "metadataFields": array_or_empty(value.get("metadataFields")),
        "profileFields": array_or_empty(value.get("profileFields")),
        "slug": value.get("slug").cloned().unwrap_or(Value::Null),
        "title": value.get("title").cloned().unwrap_or(Value::Null),
    })
}

/// getCollectionSchema:
///   config = asRecord(collection.config)
///   configSchema = asSyncSchema({ collections: [config.schema] })?.collections[0]
///   canonicalCollectionSchema = canonicalSchema.collections.find(slug === collection.slug)
///   return normalizeCollectionSchema(canonicalCollectionSchema ?? configSchema ?? fallback)
pub(super) fn get_collection_schema(collection: &Value, canonical_schema: &Value) -> Value {
    let config = as_record_owned(collection.get("config").unwrap_or(&Value::Null));

    // configSchema: wrap config.schema in { collections: [..] } and re-extract.
    let wrapped = json!({ "collections": [config.get("schema").cloned().unwrap_or(Value::Null)] });
    let config_schema = as_sync_schema(Some(&wrapped))
        .and_then(|schema| {
            schema
                .get("collections")
                .and_then(Value::as_array)
                .and_then(|items| items.first().cloned())
        })
        .filter(|v| v.is_object());

    let collection_slug = collection.get("slug").and_then(Value::as_str);
    let canonical_collection_schema = canonical_schema
        .get("collections")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("slug").and_then(Value::as_str) == collection_slug)
                .cloned()
        });

    let source = canonical_collection_schema
        .or(config_schema)
        .unwrap_or_else(|| {
            json!({
                "collection_type": collection.get("collection_type").cloned().unwrap_or(Value::Null),
                "config": Value::Object(config.clone()),
                "description": collection.get("description").cloned().unwrap_or(Value::Null),
                "slug": collection.get("slug").cloned().unwrap_or(Value::Null),
                "title": collection.get("title").cloned().unwrap_or(Value::Null),
            })
        });

    normalize_collection_schema(&source)
}

/// fieldDefinitionToSyncField:
///   { defaultValue: default_value ?? undefined, description, key, label,
///     options, required: is_required, type: field_type }
/// `undefined` keys are omitted from JSON (serde_json::Map without the key).
fn field_definition_to_sync_field(definition: &Value) -> Value {
    let mut field = Map::new();
    // defaultValue: only present when default_value is not null/absent.
    if let Some(default_value) = definition.get("default_value")
        && !default_value.is_null()
    {
        field.insert("defaultValue".to_owned(), default_value.clone());
    }
    field.insert(
        "description".to_owned(),
        definition
            .get("description")
            .cloned()
            .unwrap_or(Value::Null),
    );
    field.insert(
        "key".to_owned(),
        definition.get("key").cloned().unwrap_or(Value::Null),
    );
    field.insert(
        "label".to_owned(),
        definition.get("label").cloned().unwrap_or(Value::Null),
    );
    field.insert(
        "options".to_owned(),
        definition.get("options").cloned().unwrap_or(Value::Null),
    );
    field.insert(
        "required".to_owned(),
        definition
            .get("is_required")
            .cloned()
            .unwrap_or(Value::Null),
    );
    field.insert(
        "type".to_owned(),
        definition.get("field_type").cloned().unwrap_or(Value::Null),
    );
    Value::Object(field)
}

/// getFieldsForScope: filter is_enabled && collection_id === collectionId &&
/// field_scope === fieldScope, sort by sort_order asc then created_at asc,
/// map to sync field.
fn get_fields_for_scope(
    field_definitions: &[Value],
    collection_id: Option<&str>,
    field_scope: &str,
) -> Vec<Value> {
    let mut matched: Vec<&Value> = field_definitions
        .iter()
        .filter(|definition| {
            definition.get("is_enabled").and_then(Value::as_bool) == Some(true)
                && definition_collection_id(definition) == collection_id.map(str::to_owned)
                && definition.get("field_scope").and_then(Value::as_str) == Some(field_scope)
        })
        .collect();

    matched.sort_by(|left, right| {
        let order = sort_order_of(left).cmp(&sort_order_of(right));
        if order == std::cmp::Ordering::Equal {
            created_at_of(left).cmp(&created_at_of(right))
        } else {
            order
        }
    });

    matched
        .into_iter()
        .map(field_definition_to_sync_field)
        .collect()
}

fn definition_collection_id(definition: &Value) -> Option<String> {
    definition
        .get("collection_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
}

/// withFieldDefinitionsFromDatabase:
///   globalProfileFields = getFieldsForScope(fieldDefs, null, 'profile_data')
///   globalMetadataFields = getFieldsForScope(fieldDefs, null, 'metadata')
///   collections.map: when studioCollection exists by slug, attach
///     metadataFields / profileFields (db-backed when non-empty, else schema's).
pub(super) fn with_field_definitions_from_database(
    collections: &[Value],
    field_definitions: &[Value],
    schema: Value,
) -> Value {
    let mut collection_by_slug: Map<String, Value> = Map::new();
    for collection in collections {
        if let Some(slug) = collection.get("slug").and_then(Value::as_str) {
            collection_by_slug.insert(slug.to_owned(), collection.clone());
        }
    }

    let global_profile_fields = get_fields_for_scope(field_definitions, None, "profile_data");
    let global_metadata_fields = get_fields_for_scope(field_definitions, None, "metadata");

    let Value::Object(mut schema_map) = schema else {
        return json!({ "collections": [] });
    };

    let schema_collections = schema_map
        .get("collections")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let new_collections: Vec<Value> = schema_collections
        .into_iter()
        .map(|collection| {
            let slug = collection.get("slug").and_then(Value::as_str);
            let Some(studio_collection) = slug.and_then(|slug| collection_by_slug.get(slug)) else {
                return collection;
            };
            let studio_collection_id = studio_collection.get("id").and_then(Value::as_str);

            let profile_fields =
                get_fields_for_scope(field_definitions, studio_collection_id, "profile_data");
            let metadata_fields =
                get_fields_for_scope(field_definitions, studio_collection_id, "metadata");

            let Value::Object(mut map) = collection else {
                return Value::Null;
            };
            let metadata_value = if metadata_fields.is_empty() {
                array_or_empty(map.get("metadataFields"))
            } else {
                Value::Array(metadata_fields)
            };
            let profile_value = if profile_fields.is_empty() {
                array_or_empty(map.get("profileFields"))
            } else {
                Value::Array(profile_fields)
            };
            map.insert("metadataFields".to_owned(), metadata_value);
            map.insert("profileFields".to_owned(), profile_value);
            Value::Object(map)
        })
        .collect();

    schema_map.insert("collections".to_owned(), Value::Array(new_collections));

    let metadata_value = if global_metadata_fields.is_empty() {
        array_or_empty(schema_map.get("metadataFields"))
    } else {
        Value::Array(global_metadata_fields)
    };
    let profile_value = if global_profile_fields.is_empty() {
        array_or_empty(schema_map.get("profileFields"))
    } else {
        Value::Array(global_profile_fields)
    };
    schema_map.insert("metadataFields".to_owned(), metadata_value);
    schema_map.insert("profileFields".to_owned(), profile_value);

    Value::Object(schema_map)
}
