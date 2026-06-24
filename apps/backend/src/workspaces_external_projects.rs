//! Port of the legacy `GET /api/v1/workspaces/:wsId/external-projects` route.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/route.ts`
//!
//! The legacy handler composes three libraries:
//!   - `requireWorkspaceExternalProjectAccess({ mode: 'read', ... })` (access.ts)
//!   - `getWorkspaceExternalProjectStudioData(...)` (store.ts)
//!   - `getExternalProjectCmsEditorCapabilities(...)` (cms-capabilities.ts)
//!
//! and returns `{ binding, ...studio, cmsCapabilities }`.
//!
//! Auth note: the legacy access helper also supports app-coordination tokens and
//! app-session (`cms`) tokens. This port mirrors the *Supabase user session*
//! branch only (cookie or bearer), matching the approach already taken by the
//! sibling `workspace_external_projects_summary` handler. App-token / app-session
//! flows must continue to be served by the legacy Next.js route until ported.

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
const FAILED_MESSAGE: &str = "Failed to load external project studio";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects";

// ---------------------------------------------------------------------------
// Row models (only the columns we read directly; full rows are preserved as
// `Value` to keep the response shape byte-for-byte identical to the legacy
// `select('*')` payloads).
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

pub(crate) async fn handle_workspaces_external_projects_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_external_projects_ws_id(request.path)?;

    Some(match request.method {
        "GET" => studio_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn studio_response(
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

    // ----- Load studio data (mirrors getWorkspaceExternalProjectStudioData) ----

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
    // option (Object.hasOwn is false). Ordered sort_order asc, created_at asc.
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

    let import_jobs = match list_recent_rows(
        contact_data,
        outbound,
        "workspace_external_project_import_jobs",
        &resolved_ws_id,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };
    let publish_events = match list_recent_rows(
        contact_data,
        outbound,
        "workspace_external_project_publish_events",
        &resolved_ws_id,
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
    let raw_assets = match list_rows_by_entry_ids(
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

    // assets: clone each row and inject asset_url + preview_url.
    let assets: Vec<Value> = raw_assets
        .into_iter()
        .map(|asset| decorate_asset(&resolved_ws_id, asset))
        .collect();

    // loadingData: built from delivery collections (collection -> entries ->
    // {assets, blocks}). adapter is the first entry's source_adapter (or null).
    let first_entry_source_adapter = entries
        .first()
        .and_then(|entry| entry.get("source_adapter"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let delivery_collections = build_delivery_collections(&collections, &entries, &assets, &blocks);
    let loading_data =
        build_loading_data(first_entry_source_adapter.as_deref(), &delivery_collections);

    // cmsCapabilities: built from binding + collections + fieldDefinitions.
    let binding = json!({
        "adapter": adapter,
        "canonical_id": canonical_id,
        "canonical_project": canonical_project,
        "enabled": binding_enabled,
        "workspace_id": resolved_ws_id,
    });
    let cms_capabilities = build_cms_capabilities(&binding, &collections);

    // Final payload: { binding, ...studio, cmsCapabilities }.
    let body = json!({
        "binding": binding,
        "assets": assets,
        "blocks": blocks,
        "collections": collections,
        "entries": entries,
        "fieldDefinitions": field_definitions,
        "importJobs": import_jobs,
        "loadingData": loading_data,
        "publishEvents": publish_events,
        "cmsCapabilities": cms_capabilities,
    });

    json_response(200, body)
}

// ---------------------------------------------------------------------------
// Asset decoration (mirrors buildDeliveryAssetUrl + studio asset mapping)
// ---------------------------------------------------------------------------

fn decorate_asset(workspace_id: &str, mut asset: Value) -> Value {
    let id = asset.get("id").and_then(Value::as_str).map(str::to_owned);
    let source_url = asset
        .get("source_url")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let asset_type = asset
        .get("asset_type")
        .and_then(Value::as_str)
        .map(str::to_owned);

    let asset_url =
        build_delivery_asset_url(workspace_id, id.as_deref(), source_url.as_deref(), false);
    let preview_url = if asset_type.as_deref() == Some("image") {
        build_delivery_asset_url(workspace_id, id.as_deref(), source_url.as_deref(), true)
    } else {
        asset_url.clone()
    };

    if let Value::Object(map) = &mut asset {
        map.insert("asset_url".to_owned(), json!(asset_url));
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
    source_url: Option<&str>,
    preview: bool,
) -> Option<String> {
    if let Some(source) = source_url {
        // Legacy returns asset.source_url verbatim when present.
        return Some(source.to_owned());
    }

    // If there is no id we cannot build a delivery URL. The legacy code never hits
    // this branch (assets always have an id), so this is a defensive fallback.
    let asset_id = asset_id?;

    let base = format!("/api/v1/workspaces/{workspace_id}/external-projects/assets/{asset_id}");
    if !preview {
        return Some(base);
    }

    // Preview transform query (stable order matching the legacy .set() calls).
    Some(format!(
        "{base}?width=1600&height=1600&resize=cover&quality=82"
    ))
}

// ---------------------------------------------------------------------------
// Delivery collections (mirrors collectionsPayload assembly)
// ---------------------------------------------------------------------------

struct DeliveryCollection {
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

fn build_delivery_collections(
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

fn build_loading_data(adapter: Option<&str>, collections: &[DeliveryCollection]) -> Value {
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

fn dedupe_strings(values: impl IntoIterator<Item = String>) -> Vec<String> {
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

fn build_cms_capabilities(binding: &Value, collections: &[Value]) -> Value {
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

// ---------------------------------------------------------------------------
// JSON coercion helpers (mirror store.ts / cms-capabilities.ts helpers)
// ---------------------------------------------------------------------------

fn as_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
        _ => None,
    }
}

fn as_nullable_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(n)) if n.as_f64().map(f64::is_finite).unwrap_or(false) => {
            Value::Number(n.clone())
        }
        _ => Value::Null,
    }
}

fn as_string_array(value: Option<&Value>) -> Value {
    json!(as_string_array_vec(value))
}

fn as_string_array_vec(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

fn normalize_string_array(value: Option<&Value>) -> Vec<String> {
    dedupe_strings(as_string_array_vec(value))
}

fn as_json_object(value: Option<&Value>) -> Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    }
}

fn as_json_object_owned(value: &Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    }
}

/// Like as_json_object but yields a JSON value (object), mirroring asJsonObject's
/// use as an embedded value in the response.
fn as_json_object_value(value: Option<&Value>) -> Value {
    Value::Object(as_json_object(value))
}

// ---------------------------------------------------------------------------
// Binding / data queries (service-role REST, mirroring the summary handler)
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

async fn list_recent_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    list_rows(
        contact_data,
        outbound,
        table,
        ws_id,
        &[
            ("order", "created_at.desc".to_owned()),
            ("limit", "10".to_owned()),
        ],
    )
    .await
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

fn workspaces_external_projects_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    // ws_id must be a single path segment so we never collide with subpaths such
    // as `/external-projects/summary` or `/external-projects/assets/:id`.
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
