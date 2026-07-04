//! Public delivery endpoint for workspace external projects.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/delivery/route.ts`.
//!
//! Only the public (non-`preview`) GET path is ported here. The `?preview=true`
//! branch in the legacy route requires `requireWorkspaceExternalProjectAccess`
//! (app-session JWTs, app-coordination tokens, and the workspace permissions
//! engine), which is not available in this backend framework. For that branch
//! we return `None` so the request falls through to the legacy Next.js app.
//!
//! The public path uses the service-role REST credentials exclusively (the
//! legacy route uses `createAdminClient()` with no caller auth), so there is no
//! membership/permission check here — delivery is public for enabled
//! workspaces.

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/delivery";

const EXTERNAL_PROJECT_ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const EXTERNAL_PROJECT_CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const UNAVAILABLE_MESSAGE: &str = "External project delivery unavailable for this workspace";
const FAILURE_MESSAGE: &str = "Failed to build external project delivery payload";

pub(crate) async fn handle_workspaces_external_projects_delivery_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = delivery_ws_id(request.path)?;

    // `?preview=true` is not portable (requires the permissions engine + app
    // tokens). Fall through to the legacy Next.js app for previews.
    if preview_requested(request.url) {
        return None;
    }

    Some(match request.method {
        "GET" => delivery_response(config, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn delivery_response(
    config: &BackendConfig,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let binding = match resolve_binding(contact_data, outbound, ws_id).await {
        Ok(binding) => binding,
        Err(()) => return error_response(500, FAILURE_MESSAGE),
    };

    // Mirror `if (!binding.enabled || !binding.canonical_project)`.
    if !binding.enabled || binding.canonical_project.is_none() {
        return error_response(404, UNAVAILABLE_MESSAGE);
    }

    match build_delivery_payload(contact_data, outbound, ws_id, &binding).await {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => error_response(500, FAILURE_MESSAGE),
    }
}

// --- Binding resolution ------------------------------------------------------

struct ResolvedBinding {
    enabled: bool,
    canonical_id: Option<String>,
    /// Adapter copied from the canonical project row (`null` when missing).
    adapter: Option<String>,
    /// The canonical project row as a raw JSON object, present only when
    /// `enabled && canonical_project.is_active` (mirrors the legacy gating).
    canonical_project: Option<Value>,
}

async fn resolve_binding(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<ResolvedBinding, ()> {
    let (canonical_id, enabled) = read_binding_state(contact_data, outbound, ws_id).await?;

    let mut adapter: Option<String> = None;
    let mut canonical_project_row: Option<Value> = None;

    if let Some(canonical_id) = canonical_id.as_deref()
        && let Some(row) = fetch_canonical_project(contact_data, outbound, canonical_id).await
    {
        adapter = row
            .get("adapter")
            .and_then(Value::as_str)
            .map(str::to_owned);
        canonical_project_row = Some(row);
    }

    let is_active = canonical_project_row
        .as_ref()
        .and_then(|row| row.get("is_active"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // `canonical_project: enabled && canonical_project?.is_active ? row : null`.
    let canonical_project = if enabled && is_active {
        canonical_project_row
    } else {
        None
    };

    // `enabled: enabled && Boolean(canonicalId) && Boolean(is_active)`.
    let resolved_enabled = enabled && canonical_id.is_some() && is_active;

    Ok(ResolvedBinding {
        enabled: resolved_enabled,
        canonical_id,
        adapter,
        canonical_project,
    })
}

/// Dual-read: prefer `workspace_external_project_bindings`, fall back to
/// `workspace_secrets`. Returns `(canonicalId, enabled)`.
async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    // First-class binding table (may not exist yet -> treat errors as "no row").
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role_get(contact_data, outbound, &url).await
        && (200..300).contains(&response.status)
        && let Ok(rows) = response.json::<Vec<Value>>()
        && let Some(row) = rows.into_iter().next()
    {
        let canonical_id = row
            .get("canonical_project_id")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let enabled = row
            .get("is_enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        return Ok((canonical_id, enabled));
    }
    // Any error / no row -> fall through to secrets.

    // Legacy secrets fallback.
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!(
                    "in.({EXTERNAL_PROJECT_ENABLED_SECRET},{EXTERNAL_PROJECT_CANONICAL_ID_SECRET})"
                ),
            ),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut canonical_id: Option<String> = None;
    let mut enabled = false;

    for row in &rows {
        let name = row.get("name").and_then(Value::as_str);
        let value = row.get("value").and_then(Value::as_str);
        match name {
            Some(EXTERNAL_PROJECT_CANONICAL_ID_SECRET) if canonical_id.is_none() => {
                canonical_id = value.map(str::to_owned);
            }
            Some(EXTERNAL_PROJECT_ENABLED_SECRET) if value == Some("true") => {
                enabled = true;
            }
            _ => {}
        }
    }

    Ok((canonical_id, enabled))
}

async fn fetch_canonical_project(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Option<Value> {
    // Mirror the legacy `const { data } = await admin...maybeSingle()` which
    // swallows lookup errors and treats them as "no canonical project".
    let url = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;

    let response = send_service_role_get(contact_data, outbound, &url)
        .await
        .ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }

    response
        .json::<Vec<Value>>()
        .unwrap_or_default()
        .into_iter()
        .next()
}

// --- Payload builder ---------------------------------------------------------

async fn build_delivery_payload(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    binding: &ResolvedBinding,
) -> Result<Value, ()> {
    // `if (!binding.canonical_id || !binding.adapter) throw`.
    let (Some(canonical_id), Some(adapter)) =
        (binding.canonical_id.as_deref(), binding.adapter.as_deref())
    else {
        return Err(());
    };

    // profileData: prefer canonical_project.delivery_profile, else fixtures.
    // Fixtures are not ported (1891 LOC, adapter-specific); when
    // delivery_profile is null we emit `{}`. See module docs / notes.
    let profile_data = binding
        .canonical_project
        .as_ref()
        .and_then(|row| row.get("delivery_profile"))
        .filter(|value| !value.is_null())
        .map(as_json_object_value)
        .unwrap_or_else(|| Value::Object(Map::new()));

    let collections = list_collections(contact_data, outbound, ws_id).await?;
    let entries = list_entries(contact_data, outbound, ws_id).await?;

    let entry_ids: Vec<String> = entries
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let blocks = list_blocks(contact_data, outbound, ws_id, &entry_ids).await?;
    let assets = list_assets(contact_data, outbound, ws_id, &entry_ids).await?;

    let collections_payload =
        build_collections_payload(ws_id, &collections, &entries, &blocks, &assets);
    let loading_data = build_loading_data(adapter, &collections_payload);

    Ok(json!({
        "adapter": adapter,
        "canonicalProjectId": canonical_id,
        "collections": collections_payload,
        "generatedAt": generated_at(),
        "loadingData": loading_data,
        "profileData": profile_data,
        "workspaceId": ws_id,
    }))
}

fn build_collections_payload(
    ws_id: &str,
    collections: &[Value],
    entries: &[Value],
    blocks: &[Value],
    assets: &[Value],
) -> Vec<Value> {
    collections
        .iter()
        .map(|collection| {
            let collection_id = collection.get("id").and_then(Value::as_str);

            let collection_entries: Vec<Value> = entries
                .iter()
                .filter(|entry| entry.get("collection_id").and_then(Value::as_str) == collection_id)
                .map(|entry| {
                    let entry_id = entry.get("id").and_then(Value::as_str);

                    let entry_assets: Vec<Value> = assets
                        .iter()
                        .filter(|asset| asset.get("entry_id").and_then(Value::as_str) == entry_id)
                        .map(|asset| build_delivery_asset(ws_id, asset))
                        .collect();

                    let entry_blocks: Vec<Value> = blocks
                        .iter()
                        .filter(|block| block.get("entry_id").and_then(Value::as_str) == entry_id)
                        .cloned()
                        .collect();

                    // `{ ...entry, assets, blocks }` (full entry row preserved).
                    let mut obj = as_object(entry);
                    obj.insert("assets".to_owned(), Value::Array(entry_assets));
                    obj.insert("blocks".to_owned(), Value::Array(entry_blocks));
                    Value::Object(obj)
                })
                .collect();

            // `{ ...collection, entries }` (full collection row preserved).
            let mut obj = as_object(collection);
            obj.insert("entries".to_owned(), Value::Array(collection_entries));
            Value::Object(obj)
        })
        .collect()
}

/// Mirror the `assets.map(...)` projection plus `buildDeliveryAssetUrl`.
fn build_delivery_asset(ws_id: &str, asset: &Value) -> Value {
    let id = asset.get("id").and_then(Value::as_str);
    let source_url = asset
        .get("source_url")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());

    // buildDeliveryAssetUrl (no transform in delivery payload).
    let asset_url = match (source_url, id) {
        (Some(source), _) => Some(source.to_owned()),
        (None, Some(id)) => Some(format!(
            "/api/v1/workspaces/{ws_id}/external-projects/assets/{id}"
        )),
        (None, None) => None,
    };

    json!({
        "alt_text": asset.get("alt_text").cloned().unwrap_or(Value::Null),
        "asset_type": asset.get("asset_type").cloned().unwrap_or(Value::Null),
        "assetUrl": asset_url,
        "block_id": asset.get("block_id").cloned().unwrap_or(Value::Null),
        "entry_id": asset.get("entry_id").cloned().unwrap_or(Value::Null),
        "id": asset.get("id").cloned().unwrap_or(Value::Null),
        "metadata": asset.get("metadata").cloned().unwrap_or(Value::Null),
        "sort_order": asset.get("sort_order").cloned().unwrap_or(Value::Null),
        "source_url": asset.get("source_url").cloned().unwrap_or(Value::Null),
        "storage_path": asset.get("storage_path").cloned().unwrap_or(Value::Null),
    })
}

// --- Loading data ------------------------------------------------------------

fn build_loading_data(adapter: &str, collections: &[Value]) -> Value {
    if adapter == "yoola" {
        return build_yoola_loading_data(collections);
    }

    // Generic adapter loading data.
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

    // Artworks.
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

    // Lore capsules.
    let lore_capsules: Vec<Value> = collection_entries("lore-capsules")
        .iter()
        .map(|entry| build_yoola_lore_capsule(entry, &artwork_by_slug))
        .collect();

    // Singleton sections (slug -> section item).
    let mut singleton_sections: Map<String, Value> = Map::new();
    for entry in collection_entries("singleton-sections") {
        let slug = entry
            .get("slug")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        singleton_sections.insert(slug, build_yoola_section(entry));
    }

    // artworksByCategory.
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

    // Configured artwork categories filtered by availability.
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

// --- Supabase reads ----------------------------------------------------------

async fn list_collections(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_collections",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "title.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_entries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    // Non-preview delivery: includeDrafts === false -> status = published.
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_entries",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "eq.published".to_owned()),
            ("order", "sort_order.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_blocks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    entry_ids: &[String],
) -> Result<Vec<Value>, ()> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_blocks",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("entry_id", format!("in.({})", entry_ids.join(","))),
            ("order", "sort_order.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_assets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    entry_ids: &[String],
) -> Result<Vec<Value>, ()> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_assets",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("entry_id", format!("in.({})", entry_ids.join(","))),
            ("order", "sort_order.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<Vec<Value>, ()> {
    let response = send_service_role_get(contact_data, outbound, url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_service_role_get(
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

// --- Small value helpers (mirror the TS helpers) -----------------------------

fn as_object(value: &Value) -> Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

/// `asJsonObject`: object passthrough, otherwise `{}`.
fn as_json_object_value(value: &Value) -> Value {
    if value.is_object() {
        value.clone()
    } else {
        Value::Object(Map::new())
    }
}

/// Read a field of `entry` as a JSON object map (or empty map).
fn json_object_field(entry: &Value, key: &str) -> Map<String, Value> {
    entry
        .get(key)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

/// `asString`: non-empty trimmed string -> the original string, else null.
fn as_string(value: Option<&Value>) -> Value {
    match value.and_then(Value::as_str) {
        Some(text) if !text.trim().is_empty() => Value::String(text.to_owned()),
        _ => Value::Null,
    }
}

/// `asNullableNumber`: finite number -> number, else null.
fn as_nullable_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) if number.as_f64().is_some_and(f64::is_finite) => {
            Value::Number(number.clone())
        }
        _ => Value::Null,
    }
}

/// `asStringArray`: array of strings (drops non-strings).
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

/// `normalizeStringArray`: trim, drop empties, dedupe (preserving first-seen).
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

/// `findAssetCaption`: asset.metadata.caption as string-or-null.
fn find_asset_caption(asset: Option<&Value>) -> Value {
    let metadata = asset
        .and_then(|asset| asset.get("metadata"))
        .and_then(Value::as_object);
    as_string(metadata.and_then(|metadata| metadata.get("caption")))
}

/// `findMarkdownBlockMarkdown`: first markdown block's `content.markdown`.
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

// --- Misc --------------------------------------------------------------------

/// Mirrors `new Date().toISOString()`.
fn generated_at() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format_iso8601_millis(now)
}

/// Format milliseconds-since-epoch as an ISO 8601 UTC string with millis,
/// matching `new Date().toISOString()`. Mirrors the proven helpers in
/// `auth_mfa_mobile_approvals.rs` / `hive_ai_credits.rs`.
fn format_iso8601_millis(unix_millis: u128) -> String {
    let unix_millis = unix_millis as i64;
    let seconds = unix_millis.div_euclid(1_000);
    let millis = unix_millis.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    (year + if month <= 2 { 1 } else { 0 }, month, day)
}

fn delivery_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn preview_requested(request_url: Option<&str>) -> bool {
    let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        return false;
    };
    url.query_pairs()
        .any(|(name, value)| name == "preview" && value == "true")
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
