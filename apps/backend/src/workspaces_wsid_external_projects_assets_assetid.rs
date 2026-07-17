//! Handler for `GET /api/v1/workspaces/:wsId/external-projects/assets/:assetId`.
//!
//! Ports the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route.ts`.
//! PATCH and DELETE return `None` to fall through to the still-active Next.js route.
//!
//! ## Behavior gaps vs. the legacy GET handler
//!
//! The legacy GET handler covers three delivery cases:
//!
//! - **Published asset with `source_url`**: redirects 307 to the URL.
//!   This case is fully ported here.
//! - **Non-published asset**: calls `requireWorkspaceExternalProjectAccess`
//!   (app-session / app-coordination / Supabase user JWT + workspace
//!   permissions engine). The permissions engine is not available in this
//!   backend framework, so this case returns `None` to fall through to the
//!   Next.js route.
//! - **Asset with `storage_path`**: resolves the workspace storage provider
//!   (Supabase Storage or R2) and creates a provider-specific signed read URL,
//!   then redirects 307. Provider SDK calls are not available here, so these
//!   requests return `None` to fall through to the Next.js route.
//!
//! The transform query parameters (`width`, `height`, `resize`, `quality`,
//! `format`) are only relevant for the Supabase Storage signed-URL case and
//! are therefore not parsed here.
//!
//! ## Auth model
//!
//! All Supabase reads in this handler use the service-role key (no caller
//! token forwarding). This mirrors the legacy route's use of `createAdminClient()`
//! for binding and asset lookups.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";
const ASSET_REDIRECT_CACHE_CONTROL: &str =
    "public, max-age=300, s-maxage=518400, stale-while-revalidate=43200";

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

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

#[derive(Deserialize)]
struct CanonicalActiveRow {
    is_active: Option<bool>,
}

/// Nested entry row returned via a PostgREST `!inner` join.
#[derive(Deserialize)]
struct EntryStatusNested {
    status: Option<String>,
}

#[derive(Deserialize)]
struct AssetRow {
    source_url: Option<String>,
    workspace_external_project_entries: Option<EntryStatusNested>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_external_projects_assets_assetid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (ws_id, asset_id) = extract_path_params(request.path)?;

    // Only GET is ported. PATCH and DELETE fall through to the Next.js route.
    if request.method != "GET" {
        return None;
    }

    get_asset_response(config, ws_id, asset_id, outbound).await
}

// ---------------------------------------------------------------------------
// GET logic
// ---------------------------------------------------------------------------

async fn get_asset_response(
    config: &BackendConfig,
    ws_id: &str,
    asset_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return Some(error_json(500, "Failed to resolve external project asset"));
    }

    // Check workspace binding (dual-read: bindings table then secrets fallback).
    let (canonical_id, enabled) = match read_binding_state(contact_data, outbound, ws_id).await {
        Ok(state) => state,
        Err(()) => {
            return Some(error_json(500, "Failed to resolve external project asset"));
        }
    };

    let canonical_active = match canonical_id.as_deref() {
        Some(id) => match canonical_project_active(contact_data, outbound, id).await {
            Ok(active) => active,
            Err(()) => {
                return Some(error_json(500, "Failed to resolve external project asset"));
            }
        },
        None => false,
    };

    // Mirror legacy: `if (!binding.enabled || !binding.canonical_project)`.
    let binding_enabled = enabled && canonical_id.is_some() && canonical_active;
    if !binding_enabled {
        return Some(error_json(
            404,
            "External project delivery unavailable for this workspace",
        ));
    }

    // Fetch the asset row together with its entry status.
    let asset = match fetch_asset(contact_data, outbound, ws_id, asset_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return Some(error_json(404, "Asset not found")),
        Err(()) => return Some(error_json(500, "Failed to resolve external project asset")),
    };

    let entry_status = asset
        .workspace_external_project_entries
        .as_ref()
        .and_then(|entry| entry.status.as_deref());

    // Non-published assets require `requireWorkspaceExternalProjectAccess`
    // (complex auth not available here). Fall through so Next.js handles the
    // authentication and conditional delivery.
    if entry_status != Some("published") {
        return None;
    }

    // Published + source_url: mirror `NextResponse.redirect(asset.source_url, { status: 307 })`.
    if let Some(source_url) = asset.source_url.filter(|url| !url.is_empty()) {
        let is_http = url::Url::parse(&source_url)
            .ok()
            .is_some_and(|url| matches!(url.scheme(), "http" | "https"));
        if !is_http {
            return Some(error_json(404, "Asset not available"));
        }
        return Some(redirect_307(&source_url, ws_id, asset_id));
    }

    // Published + storage_path: requires a provider-specific signed read URL
    // (Supabase Storage or R2). Not available in this backend framework; fall
    // through to Next.js which will generate and redirect to the signed URL.
    None
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

async fn fetch_asset(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    asset_id: &str,
) -> Result<Option<AssetRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_assets",
        &[
            (
                "select",
                "source_url,workspace_external_project_entries!inner(status)".to_owned(),
            ),
            ("id", format!("eq.{asset_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<AssetRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

/// Dual-read: prefer `workspace_external_project_bindings`, fall back to
/// `workspace_secrets`. Returns `(canonicalId, enabled)`.
async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    // First-class bindings table (may not exist yet; treat errors as "no row").
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role_get(contact_data, outbound, &url).await
        && (200..300).contains(&response.status)
        && let Ok(rows) = response.json::<Vec<BindingRow>>()
        && let Some(row) = rows.into_iter().next()
    {
        return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
    }

    // Legacy secrets fallback.
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

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
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

async fn canonical_project_active(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "is_active".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CanonicalActiveRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.is_active)
        == Some(true))
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

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn error_json(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn redirect_307(url: &str, ws_id: &str, asset_id: &str) -> BackendResponse {
    let mut response = BackendResponse {
        allow: None,
        body: Value::Null,
        body_empty: true,
        body_text: None,
        cache_control: None,
        content_type: None,
        headers: Vec::new(),
        status: 307,
    };
    response.cache_control = Some(ASSET_REDIRECT_CACHE_CONTROL);
    response.headers.push(("location", url.to_owned()));
    response.headers.push((
        "vercel-cdn-cache-control",
        "max-age=518400, stale-while-revalidate=43200".to_owned(),
    ));
    response.headers.push((
        "vercel-cache-tag",
        format!("external-project-workspace-{ws_id},external-project-asset-{asset_id}"),
    ));
    response
}

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

/// Extract `(ws_id, asset_id)` from a path matching
/// `/api/v1/workspaces/{wsId}/external-projects/assets/{assetId}`.
/// Returns `None` for any other path shape.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix("/api/v1/workspaces/")?;
    // rest = "{wsId}/external-projects/assets/{assetId}"
    let (ws_id, tail) = rest.split_once('/')?;
    if ws_id.is_empty() {
        return None;
    }
    let asset_id = tail.strip_prefix("external-projects/assets/")?;
    if asset_id.is_empty() || asset_id.contains('/') {
        return None;
    }
    Some((ws_id, asset_id))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_valid_uuid_params() {
        let (ws_id, asset_id) = extract_path_params(
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000001\
             /external-projects/assets/00000000-0000-0000-0000-000000000002",
        )
        .unwrap();
        assert_eq!(ws_id, "00000000-0000-0000-0000-000000000001");
        assert_eq!(asset_id, "00000000-0000-0000-0000-000000000002");
    }

    #[test]
    fn extract_slug_params() {
        let (ws_id, asset_id) =
            extract_path_params("/api/v1/workspaces/my-ws/external-projects/assets/img-42")
                .unwrap();
        assert_eq!(ws_id, "my-ws");
        assert_eq!(asset_id, "img-42");
    }

    #[test]
    fn extract_rejects_wrong_suffix() {
        // entries route — not assets
        assert!(
            extract_path_params("/api/v1/workspaces/ws1/external-projects/entries/asset1")
                .is_none()
        );
    }

    #[test]
    fn extract_rejects_empty_asset_id() {
        assert!(extract_path_params("/api/v1/workspaces/ws1/external-projects/assets/").is_none());
    }

    #[test]
    fn extract_rejects_trailing_segment() {
        // extra path segment after assetId must not match
        assert!(
            extract_path_params("/api/v1/workspaces/ws1/external-projects/assets/id/extra")
                .is_none()
        );
    }

    #[test]
    fn extract_rejects_wrong_api_version() {
        assert!(
            extract_path_params("/api/v2/workspaces/ws1/external-projects/assets/id").is_none()
        );
    }

    #[test]
    fn extract_rejects_empty_ws_id() {
        assert!(extract_path_params("/api/v1/workspaces//external-projects/assets/id").is_none());
    }

    #[test]
    fn redirect_307_sets_location_header() {
        let response = redirect_307("https://example.com/image.png", "ws1", "asset1");
        assert_eq!(response.status, 307);
        assert!(
            response.headers.iter().any(
                |(name, value)| *name == "location" && value == "https://example.com/image.png"
            ),
            "expected location header to be set"
        );
        assert!(response.body_empty, "redirect body should be empty");
        assert_eq!(response.cache_control, Some(ASSET_REDIRECT_CACHE_CONTROL));
    }

    #[test]
    fn error_json_sets_status_and_body() {
        let response = error_json(404, "Asset not found");
        assert_eq!(response.status, 404);
        assert_eq!(response.body["error"], "Asset not found");
    }
}
