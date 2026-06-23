//! Port of the legacy
//! `GET /api/v1/workspaces/:wsId/external-projects/sync/snapshot` route.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/sync/snapshot/route.ts`
//!
//! The legacy handler composes:
//!   - `requireWorkspaceExternalProjectAccess({ mode: 'read', ... })` (access.ts)
//!   - `getWorkspaceExternalProjectSyncSnapshot({ binding, workspaceId }, admin)`
//!     (sync.ts) which itself loads `getWorkspaceExternalProjectStudioData`
//!     (store.ts) and runs `buildExternalProjectSyncSnapshot`.
//!
//! and returns the snapshot object verbatim (`NextResponse.json(snapshot)`), or
//! `{ error: 'Failed to load external project sync snapshot' }` with status 500
//! on failure.
//!
//! Auth note: the legacy access helper also supports app-coordination tokens and
//! app-session (`cms`) tokens. This port mirrors the *Supabase user session*
//! branch only (cookie or bearer), matching the approach already taken by the
//! sibling `workspaces_external_projects` handler. App-token / app-session flows
//! must continue to be served by the legacy Next.js route until ported.
//!
//! The access/normalize/binding/permission machinery is a direct copy of the
//! sibling `workspaces_external_projects.rs` handler (same route prefix, same
//! `mode: 'read'` access policy). The only behavioural difference is the body:
//! this handler emits `buildExternalProjectSyncSnapshot(...)` instead of the
//! studio payload.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_PERMISSION: &str = "admin";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const FAILED_MESSAGE: &str = "Failed to load external project sync snapshot";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/sync/snapshot";

const DEFAULT_ADAPTER: &str = "yoola";

// ---------------------------------------------------------------------------
// Row models (only the columns we read directly; full rows are preserved as
// `Value` where the legacy code uses `select('*')`).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_external_projects_sync_snapshot_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_external_projects_sync_snapshot_ws_id(request.path)?;

    Some(match request.method {
        "GET" => snapshot_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn snapshot_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, FAILED_MESSAGE);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(401, "Unauthorized"),
        };

    // Resolve binding (dual-read: bindings table then secrets fallback).
    let (canonical_id, enabled) =
        match read_binding_state(contact_data, outbound, &resolved_ws_id).await {
            Ok(state) => state,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };

    let canonical_project = match canonical_id.as_deref() {
        Some(id) => match canonical_project_row(contact_data, outbound, id).await {
            Ok(project) => project,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        },
        None => None,
    };

    let canonical_active = canonical_project
        .as_ref()
        .and_then(|p| p.get("is_active"))
        .and_then(Value::as_bool)
        == Some(true);
    let binding_enabled = enabled && canonical_id.is_some() && canonical_active;
    let adapter = if binding_enabled {
        canonical_project
            .as_ref()
            .and_then(|p| p.get("adapter"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    } else {
        None
    };

    // Mirror legacy access ordering: binding must be enabled with an active
    // canonical project (404) before permission errors surface.
    if !binding_enabled {
        return error_response(404, UNAVAILABLE_MESSAGE);
    }

    // Permission: read mode allowed when workspace grants manage/publish external
    // projects, OR root workspace grants manage_external_projects /
    // manage_workspace_roles.
    let workspace_permissions = match effective_permissions(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(permissions) => permissions,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let workspace_allowed = permission_set_allows(
        &workspace_permissions,
        &["manage_external_projects", "publish_external_projects"],
    );

    let allowed = if workspace_allowed {
        true
    } else {
        let root_permissions = match effective_permissions(
            contact_data,
            outbound,
            ROOT_WORKSPACE_ID,
            &user_id,
            &access_token,
        )
        .await
        {
            Ok(permissions) => permissions,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };
        permission_set_allows(
            &root_permissions,
            &["manage_external_projects", "manage_workspace_roles"],
        )
    };

    if !allowed {
        return error_response(403, "Forbidden");
    }

    // ----- Load raw studio data (mirrors getWorkspaceExternalProjectStudioData;
    // the snapshot builder consumes collections/entries/blocks/assets/
    // fieldDefinitions only, not the delivery loadingData). ----

    let collections = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_collections",
        &resolved_ws_id,
        &[("order", "title.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    // entries: includeDrafts => no status filter; ordered sort_order asc, created_at asc.
    let entries = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_entries",
        &resolved_ws_id,
        &[("order", "sort_order.asc,created_at.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    // fieldDefinitions: includeDisabled => no is_enabled filter, no collectionId
    // option. Ordered sort_order asc, created_at asc.
    let field_definitions = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_field_definitions",
        &resolved_ws_id,
        &[("order", "sort_order.asc,created_at.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let entry_ids: Vec<String> = entries
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let blocks = match list_rows_by_entry_ids(
        contact_data,
        outbound,
        "workspace_external_project_blocks",
        &resolved_ws_id,
        &entry_ids,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };
    let assets = match list_rows_by_entry_ids(
        contact_data,
        outbound,
        "workspace_external_project_assets",
        &resolved_ws_id,
        &entry_ids,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let binding = json!({
        "adapter": adapter,
        "canonical_id": canonical_id,
        "canonical_project": canonical_project,
        "enabled": binding_enabled,
        "workspace_id": resolved_ws_id,
    });

    let snapshot = build_external_project_sync_snapshot(
        &binding,
        &resolved_ws_id,
        &collections,
        &entries,
        &blocks,
        &assets,
        &field_definitions,
    );

    json_response(200, snapshot)
}

// ---------------------------------------------------------------------------
// Snapshot builder (mirrors buildExternalProjectSyncSnapshot in sync.ts).
//
// Note: generatedAt is server-generated; the legacy code defaults it to
// `new Date().toISOString()`. We mirror that with `now_iso8601()`.
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn build_external_project_sync_snapshot(
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
fn get_schema_from_binding(binding: &Value) -> Value {
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
fn get_collection_schema(collection: &Value, canonical_schema: &Value) -> Value {
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
fn with_field_definitions_from_database(
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

// ---------------------------------------------------------------------------
// JSON coercion helpers
// ---------------------------------------------------------------------------

/// asRecord: object pass-through, else {} (also drops arrays, matching the TS
/// `!Array.isArray` guard).
fn as_record_owned(value: &Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    }
}

/// asRecord as an embedded value (object).
fn as_record_value(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Object(map)) => Value::Object(map.clone()),
        _ => Value::Object(Map::new()),
    }
}

/// `value ?? []`: returns the array verbatim when present, else `[]`.
fn array_or_empty(value: Option<&Value>) -> Value {
    match value {
        Some(v @ Value::Array(_)) => v.clone(),
        _ => Value::Array(Vec::new()),
    }
}

/// `value ?? null` distinguishing absent/null (both -> null) from a present
/// value.
fn null_if_absent(value: Option<&Value>) -> Value {
    match value {
        Some(v) if !v.is_null() => v.clone(),
        _ => Value::Null,
    }
}

/// sort_order as i64 (default 0 when absent / non-numeric).
fn sort_order_of(value: &Value) -> i64 {
    value.get("sort_order").and_then(Value::as_i64).unwrap_or(0)
}

/// created_at as a comparable string (empty when absent).
fn created_at_of(value: &Value) -> String {
    value
        .get("created_at")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

/// Mirrors the legacy `generatedAt = new Date().toISOString()` default.
/// Reuses the proven `now_iso8601` pattern from `shared_task_boards.rs`.
fn now_iso8601() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let days = now / 86_400;
    let secs_of_day = now % 86_400;
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    let (year, month, day) = civil_from_days(days as i64);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

// Howard Hinnant's days-from-civil algorithm, inverted.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

// ---------------------------------------------------------------------------
// Binding / data queries (service-role REST, mirroring the sibling handler)
// ---------------------------------------------------------------------------

async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role_request(contact_data, outbound, &url).await
        && is_success(response.status)
        && let Ok(Some(row)) = decode_first_row::<BindingRow>(&response)
    {
        return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
    }
    // Any binding-table failure falls through to the secrets dual-read.

    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!("in.({ENABLED_SECRET},{CANONICAL_ID_SECRET})"),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
    let canonical_id = rows
        .iter()
        .find(|row| row.name.as_deref() == Some(CANONICAL_ID_SECRET))
        .and_then(|row| row.value.clone());
    let enabled = rows.iter().any(|row| {
        row.name.as_deref() == Some(ENABLED_SECRET) && row.value.as_deref() == Some("true")
    });

    Ok((canonical_id, enabled))
}

async fn canonical_project_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<Value>(&response)
}

async fn list_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
    extra: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let mut params: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];
    params.extend(extra.iter().cloned());

    let Some(url) = contact_data.rest_url(table, &params) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn list_rows_by_entry_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
    entry_ids: &[String],
) -> Result<Vec<Value>, ()> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    let in_clause = format!("in.({})", entry_ids.join(","));
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("entry_id", in_clause),
            ("order", "sort_order.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Permissions (mirrors getPermissions composition used by access.ts)
// ---------------------------------------------------------------------------

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

fn permission_set_allows(permissions: &EffectivePermissions, wanted: &[&str]) -> bool {
    permissions.has_all_permissions
        || wanted
            .iter()
            .any(|wanted| permissions.permissions.iter().any(|value| value == wanted))
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<EffectivePermissions, ()> {
    let membership_type =
        workspace_membership_type(contact_data, outbound, ws_id, user_id, access_token)
            .await?
            .unwrap_or_default();

    if membership_type.is_empty() {
        return Ok(EffectivePermissions {
            has_all_permissions: false,
            permissions: Vec::new(),
        });
    }

    let workspace = workspace_row(contact_data, outbound, ws_id).await?;
    let is_creator = membership_type == "MEMBER"
        && workspace.as_ref().and_then(|row| row.creator_id.as_deref()) == Some(user_id);

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(EffectivePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    })
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    decode_first_row::<WorkspaceRow>(&response)
}

async fn workspace_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in &rows {
        collect_role_permissions(row, &mut permissions);
    }
    Ok(permissions)
}

async fn workspace_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{membership_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

// ---------------------------------------------------------------------------
// Workspace id normalization
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_workspace_handle_candidate(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<WorkspaceIdRow>(&response)?
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn send_caller_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

fn workspaces_external_projects_sync_snapshot_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    // ws_id must be a single path segment.
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle_candidate(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}
