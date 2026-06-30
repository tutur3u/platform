//! Handler for `/api/v1/workspaces/:wsId/inventory/storefronts/:storefrontId`.
//!
//! Ported from the legacy Next.js route:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/storefronts/[storefrontId]/route.ts`
//!
//! Only the **GET** method is migrated here. The legacy route also defines
//! `PATCH` (update storefront) and `DELETE` (delete storefront) — those methods
//! are NOT migrated and this handler returns `None` for them so the Cloudflare
//! worker falls through to the still-active Next.js route.
//!
//! GET semantics:
//!
//! 1. Authenticate the caller (bearer / cookie token).
//! 2. Authorize the caller for `canViewInventoryCatalog` — any of the six
//!    inventory catalog permissions grants access.
//! 3. Fetch the storefront row from `private.inventory_storefronts`.
//! 4. Fetch the listings count from `private.inventory_storefront_listings`
//!    by retrieving all `id` values and counting them in-process.
//! 5. Fetch sections from `private.inventory_storefront_sections` ordered
//!    by `sort_order` then `created_at`.
//! 6. If sections exist, fetch items from
//!    `private.inventory_storefront_section_items` (same ordering).
//! 7. Map all rows to the camelCase `InventoryStorefront` JSON shape and
//!    return `{ data: <storefront> }`.
//!
//! Behavior gap — listings count: the legacy `getStorefrontListingsCount`
//! sends a HEAD request with `Prefer: count=exact` and reads the count from the
//! `Content-Range` response header. The outbound HTTP client used here does not
//! expose response headers, so this handler fetches the listing `id` values
//! instead and counts them in-process. For storefronts with more listings than
//! PostgREST's default page limit the count may be underreported.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_INFIX: &str = "/inventory/storefronts/";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to load inventory storefront";

/// Mirrors `canViewInventoryCatalog` in
/// `apps/web/src/lib/inventory/permissions.ts` — access is granted when the
/// caller holds ANY of these workspace permissions.
const VIEW_INVENTORY_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

// ------ Supabase REST row shapes ------

#[derive(Deserialize)]
struct StorefrontRow {
    id: String,
    ws_id: Option<String>,
    slug: Option<String>,
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    visibility: Option<String>,
    cover_image_url: Option<String>,
    hero_image_url: Option<String>,
    accent_color: Option<String>,
    currency: Option<String>,
    checkout_mode: Option<String>,
    theme_preset: Option<String>,
    layout_style: Option<String>,
    surface_style: Option<String>,
    corner_style: Option<String>,
    show_inventory_badges: Option<bool>,
    analytics_enabled: Option<bool>,
    polar_environment: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct ListingIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct SectionRow {
    id: String,
    ws_id: Option<String>,
    storefront_id: Option<String>,
    section_type: Option<String>,
    status: Option<String>,
    title: Option<String>,
    description: Option<String>,
    image_url: Option<String>,
    href: Option<String>,
    sort_order: Option<i64>,
    metadata: Option<Value>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct SectionItemRow {
    id: String,
    ws_id: Option<String>,
    storefront_id: Option<String>,
    section_id: Option<String>,
    listing_id: Option<String>,
    bundle_id: Option<String>,
    title: Option<String>,
    description: Option<String>,
    image_url: Option<String>,
    href: Option<String>,
    sort_order: Option<i64>,
    metadata: Option<Value>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

// ------ Public handler ------

pub(crate) async fn handle_workspaces_wsid_inventory_storefronts_storefrontid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, storefront_id) = extract_path_segments(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, storefront_id, outbound).await,
        // PATCH and DELETE are handled by the still-active Next.js route.
        _ => return None,
    })
}

// ------ GET implementation ------

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    storefront_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_catalog(&config.contact_data, request, raw_ws_id, outbound).await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match fetch_storefront(&config.contact_data, outbound, &ws_id, storefront_id).await {
        Ok(Some(data)) => no_store_response(json_response(200, json!({ "data": data }))),
        Ok(None) => no_store_response(json_response(404, json!({ "message": NOT_FOUND_MESSAGE }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for `canViewInventoryCatalog` — grants access when the
/// caller holds ANY of the six inventory-catalog permissions.
async fn authorize_inventory_catalog(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_CATALOG_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // Forbidden for a single permission does not deny access — the
            // caller might hold a different catalog permission.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Fetches the storefront, its listings count, and its sections (with items),
/// then maps everything to the camelCase `InventoryStorefront` JSON shape.
async fn fetch_storefront(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    storefront_id: &str,
) -> Result<Option<Value>, ()> {
    // 1. Main storefront row.
    let storefronts_url = contact_data.rest_url(
        "inventory_storefronts",
        &[
            (
                "select",
                "id,ws_id,slug,name,description,status,visibility,cover_image_url,\
hero_image_url,accent_color,currency,checkout_mode,theme_preset,layout_style,\
surface_style,corner_style,show_inventory_badges,analytics_enabled,\
polar_environment,created_at,updated_at"
                    .to_owned(),
            ),
            ("id", format!("eq.{storefront_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    );
    let Some(storefronts_url) = storefronts_url else {
        return Err(());
    };

    let storefront_resp =
        send_private_service_role_get(contact_data, outbound, &storefronts_url).await?;

    if !(200..300).contains(&storefront_resp.status) {
        return Err(());
    }

    let rows = storefront_resp
        .json::<Vec<StorefrontRow>>()
        .map_err(|_| ())?;
    let Some(row) = rows.into_iter().next() else {
        return Ok(None);
    };

    // 2. Listings count — fetch all ids and count in-process (see behavior gap note).
    let listings_count = fetch_listings_count(contact_data, outbound, storefront_id).await?;

    // 3. Sections.
    let sections = fetch_sections(contact_data, outbound, ws_id, storefront_id).await?;

    // 4. Map to the camelCase InventoryStorefront shape.
    let storefront = map_storefront(row, listings_count, sections);
    Ok(Some(storefront))
}

/// Fetches all listing ids for the given storefront and returns their count.
async fn fetch_listings_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storefront_id: &str,
) -> Result<i64, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_storefront_listings",
        &[
            ("select", "id".to_owned()),
            ("storefront_id", format!("eq.{storefront_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<ListingIdRow>>().map_err(|_| ())?;
    Ok(rows.len() as i64)
}

/// Fetches sections (ordered by sort_order, created_at) and, if any exist,
/// their section items (same ordering).
async fn fetch_sections(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    storefront_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(sections_url) = contact_data.rest_url(
        "inventory_storefront_sections",
        &[
            (
                "select",
                "id,ws_id,storefront_id,section_type,status,title,description,\
image_url,href,sort_order,metadata,created_at,updated_at"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("storefront_id", format!("eq.{storefront_id}")),
            ("order", "sort_order.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let resp = send_private_service_role_get(contact_data, outbound, &sections_url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }

    let section_rows = resp.json::<Vec<SectionRow>>().map_err(|_| ())?;
    if section_rows.is_empty() {
        return Ok(Vec::new());
    }

    // Collect section ids for the IN filter.
    let section_ids: Vec<String> = section_rows.iter().map(|s| s.id.clone()).collect();
    let in_filter = format!("in.({})", section_ids.join(","));

    let Some(items_url) = contact_data.rest_url(
        "inventory_storefront_section_items",
        &[
            (
                "select",
                "id,ws_id,storefront_id,section_id,listing_id,bundle_id,\
title,description,image_url,href,sort_order,metadata,created_at,updated_at"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("storefront_id", format!("eq.{storefront_id}")),
            ("section_id", in_filter),
            ("order", "sort_order.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let items_resp = send_private_service_role_get(contact_data, outbound, &items_url).await?;
    if !(200..300).contains(&items_resp.status) {
        return Err(());
    }

    let item_rows = items_resp.json::<Vec<SectionItemRow>>().map_err(|_| ())?;

    // Group items by section_id.
    let mut items_by_section: std::collections::HashMap<String, Vec<Value>> =
        std::collections::HashMap::new();
    for item in item_rows {
        if let Some(ref sid) = item.section_id {
            items_by_section
                .entry(sid.clone())
                .or_default()
                .push(map_section_item(item));
        }
    }

    let sections = section_rows
        .into_iter()
        .map(|section| {
            let id = section.id.clone();
            let items = items_by_section.remove(&id).unwrap_or_default();
            map_section(section, items)
        })
        .collect();

    Ok(sections)
}

// ------ Mapping helpers ------

/// Maps a raw `StorefrontRow` + derived counts/sections to the camelCase
/// `InventoryStorefront` shape returned by the legacy `mapStorefront` function.
fn map_storefront(row: StorefrontRow, listings_count: i64, sections: Vec<Value>) -> Value {
    json!({
        "id": row.id,
        "wsId": row.ws_id,
        "slug": row.slug,
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "visibility": row.visibility,
        "coverImageUrl": row.cover_image_url,
        "heroImageUrl": row.hero_image_url,
        "accentColor": row.accent_color,
        "currency": row.currency,
        "checkoutMode": row.checkout_mode.unwrap_or_else(|| "polar".to_owned()),
        "themePreset": row.theme_preset.unwrap_or_else(|| "minimal".to_owned()),
        "layoutStyle": row.layout_style.unwrap_or_else(|| "grid".to_owned()),
        "surfaceStyle": row.surface_style.unwrap_or_else(|| "solid".to_owned()),
        "cornerStyle": row.corner_style.unwrap_or_else(|| "rounded".to_owned()),
        "showInventoryBadges": row.show_inventory_badges.unwrap_or(true),
        "analyticsEnabled": row.analytics_enabled.unwrap_or(true),
        "polarEnvironment": row.polar_environment.unwrap_or_else(|| "production".to_owned()),
        "listingsCount": listings_count,
        "sections": sections,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

/// Maps a raw `SectionRow` + its items to the camelCase
/// `InventoryStorefrontSection` shape returned by the legacy `mapStorefrontSection`.
fn map_section(row: SectionRow, items: Vec<Value>) -> Value {
    json!({
        "id": row.id,
        "wsId": row.ws_id,
        "storefrontId": row.storefront_id,
        "sectionType": row.section_type,
        "status": row.status,
        "title": row.title,
        "description": row.description,
        "imageUrl": row.image_url,
        "href": row.href,
        "sortOrder": row.sort_order,
        "metadata": row.metadata.unwrap_or_else(|| json!({})),
        "items": items,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

/// Maps a raw `SectionItemRow` to the camelCase
/// `InventoryStorefrontSectionItem` shape returned by the legacy
/// `mapStorefrontSectionItem`.
fn map_section_item(row: SectionItemRow) -> Value {
    json!({
        "id": row.id,
        "wsId": row.ws_id,
        "storefrontId": row.storefront_id,
        "sectionId": row.section_id,
        "listingId": row.listing_id,
        "bundleId": row.bundle_id,
        "title": row.title,
        "description": row.description,
        "imageUrl": row.image_url,
        "href": row.href,
        "sortOrder": row.sort_order,
        "metadata": row.metadata.unwrap_or_else(|| json!({})),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

// ------ Outbound HTTP helper ------

/// Sends a GET request to `url` using the service-role key and the
/// `Accept-Profile: private` header to access private-schema tables.
async fn send_private_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ------ Auth error mapping ------

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

// ------ Path extraction ------

/// Extracts `(raw_ws_id, storefront_id)` from
/// `/api/v1/workspaces/:wsId/inventory/storefronts/:storefrontId`.
///
/// Returns `None` for any path that does not match exactly (e.g. deeper paths
/// that belong to a more specific handler).
fn extract_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_INFIX)?;
    let storefront_id = after_ws;

    if ws_id.is_empty()
        || ws_id.contains('/')
        || storefront_id.is_empty()
        || storefront_id.contains('/')
    {
        return None;
    }

    Some((ws_id, storefront_id))
}

// ------ Tests ------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_path_segments_matches_valid_path() {
        let (ws_id, sf_id) =
            extract_path_segments("/api/v1/workspaces/ws-123/inventory/storefronts/sf-456")
                .unwrap();
        assert_eq!(ws_id, "ws-123");
        assert_eq!(sf_id, "sf-456");
    }

    #[test]
    fn extract_path_segments_rejects_too_deep() {
        // Paths with trailing segments belong to sub-handlers.
        assert!(
            extract_path_segments(
                "/api/v1/workspaces/ws-123/inventory/storefronts/sf-456/listings"
            )
            .is_none()
        );
    }

    #[test]
    fn extract_path_segments_rejects_prefix_only() {
        assert!(
            extract_path_segments("/api/v1/workspaces/ws-123/inventory/storefronts/").is_none()
        );
    }

    #[test]
    fn extract_path_segments_rejects_unrelated_path() {
        assert!(extract_path_segments("/api/v1/workspaces/ws-123/inventory/categories").is_none());
    }

    #[test]
    fn extract_path_segments_rejects_empty_ws_id() {
        assert!(
            extract_path_segments("/api/v1/workspaces//inventory/storefronts/sf-456").is_none()
        );
    }

    #[test]
    fn map_storefront_applies_defaults() {
        let row = StorefrontRow {
            id: "sf-1".to_owned(),
            ws_id: Some("ws-1".to_owned()),
            slug: None,
            name: Some("My Store".to_owned()),
            description: None,
            status: Some("published".to_owned()),
            visibility: Some("public".to_owned()),
            cover_image_url: None,
            hero_image_url: None,
            accent_color: None,
            currency: Some("USD".to_owned()),
            checkout_mode: None,
            theme_preset: None,
            layout_style: None,
            surface_style: None,
            corner_style: None,
            show_inventory_badges: None,
            analytics_enabled: None,
            polar_environment: None,
            created_at: None,
            updated_at: None,
        };
        let value = map_storefront(row, 42, Vec::new());
        assert_eq!(value["checkoutMode"], "polar");
        assert_eq!(value["themePreset"], "minimal");
        assert_eq!(value["layoutStyle"], "grid");
        assert_eq!(value["surfaceStyle"], "solid");
        assert_eq!(value["cornerStyle"], "rounded");
        assert_eq!(value["showInventoryBadges"], true);
        assert_eq!(value["analyticsEnabled"], true);
        assert_eq!(value["polarEnvironment"], "production");
        assert_eq!(value["listingsCount"], 42);
        assert_eq!(value["sections"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn map_section_sets_metadata_default() {
        let row = SectionRow {
            id: "sec-1".to_owned(),
            ws_id: None,
            storefront_id: None,
            section_type: Some("featured".to_owned()),
            status: Some("published".to_owned()),
            title: None,
            description: None,
            image_url: None,
            href: None,
            sort_order: Some(0),
            metadata: None,
            created_at: None,
            updated_at: None,
        };
        let value = map_section(row, Vec::new());
        assert_eq!(value["metadata"], json!({}));
        assert_eq!(value["items"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn map_section_item_sets_metadata_default() {
        let row = SectionItemRow {
            id: "item-1".to_owned(),
            ws_id: None,
            storefront_id: None,
            section_id: Some("sec-1".to_owned()),
            listing_id: None,
            bundle_id: None,
            title: Some("Widget".to_owned()),
            description: None,
            image_url: None,
            href: None,
            sort_order: Some(1),
            metadata: None,
            created_at: None,
            updated_at: None,
        };
        let value = map_section_item(row);
        assert_eq!(value["metadata"], json!({}));
        assert_eq!(value["title"], "Widget");
    }
}
