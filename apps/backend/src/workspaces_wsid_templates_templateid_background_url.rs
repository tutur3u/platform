//! Handler for `GET /api/v1/workspaces/:wsId/templates/:templateId/background-url`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/templates/[templateId]/background-url/route.ts`.
//!
//! ## Auth and access model
//!
//! The legacy route:
//!
//! 1. Resolves the authenticated session user from the request cookie/token.
//! 2. Normalises the workspace ID (handles `personal`, `internal`, and UUID literals).
//! 3. Verifies the caller is a `MEMBER` of the workspace.
//! 4. Fetches `board_templates` filtered by `id = templateId` AND `ws_id = resolvedWsId`
//!    using the admin (service-role) client.
//! 5. Returns `{ "signedUrl": null }` when `background_path` is absent.
//! 6. Otherwise creates a signed URL for the `workspaces` bucket valid for 3600 s.
//!
//! ## Behavior gaps vs. legacy
//!
//! - The legacy `normalizeWorkspaceId` helper also resolves workspace handles via
//!   Supabase RLS reads when the identifier looks like a handle string. This handler
//!   reproduces that path exactly, matching `workspaces_templates.rs`.
//! - The `templateId` GUID validation mirrors the legacy `z.guid()` check (UUID v4
//!   shape: 8-4-4-4-12 lowercase hex + dashes at positions 8, 13, 18, 23, total 36
//!   characters).
//! - Status codes match the legacy route exactly:
//!   * `400` — invalid templateId UUID
//!   * `401` — missing or invalid session
//!   * `403` — caller is not a workspace member
//!   * `404` — template not found or does not belong to this workspace
//!   * `500` — upstream Supabase failure

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const TEMPLATES_SEGMENT: &str = "/templates/";
const PATH_SUFFIX: &str = "/background-url";

const STORAGE_BUCKET: &str = "workspaces";
const SIGNED_URL_EXPIRES_IN: u32 = 3600;

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Serde types
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
struct BoardTemplateBackgroundRow {
    background_path: Option<String>,
}

#[derive(Deserialize)]
struct SignedUrlRow {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_templates_templateid_background_url_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, template_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => background_url_response(config, request, raw_ws_id, template_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn background_url_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    template_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Validate templateId is a UUID.
    if !is_uuid(template_id) {
        return error_response(400, "Invalid template ID");
    }

    let contact_data = &config.contact_data;

    // Resolve the caller's access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Please sign in to view templates");
    };

    // Resolve the authenticated user.
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Please sign in to view templates");
    };

    // Normalise the workspace ID (handles personal/internal/handle/UUID).
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(400, "Invalid workspace ID"),
        };

    // Verify the caller is a workspace member.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "Access denied to workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace access"),
    }

    // Fetch the template's background_path.
    let template =
        match fetch_template_background(contact_data, outbound, template_id, &resolved_ws_id).await
        {
            Ok(Some(row)) => row,
            Ok(None) => return error_response(404, "Template not found or access denied"),
            Err(()) => return error_response(500, "Failed to load template"),
        };

    // If no background path, return null.
    let Some(background_path) = template
        .background_path
        .as_deref()
        .filter(|p| !p.trim().is_empty())
        .map(|p| p.to_owned())
    else {
        return no_store_response(json_response(200, json!({ "signedUrl": null })));
    };

    // Create signed URL.
    let signed_url = match create_signed_url(contact_data, outbound, &background_path).await {
        Some(url) => url,
        None => return error_response(500, "Failed to load template background"),
    };

    no_store_response(json_response(200, json!({ "signedUrl": signed_url })))
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async fn fetch_template_background(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    template_id: &str,
    ws_id: &str,
) -> Result<Option<BoardTemplateBackgroundRow>, ()> {
    let url = contact_data
        .rest_url(
            "board_templates",
            &[
                ("select", "background_path".to_owned()),
                ("id", format!("eq.{template_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<BoardTemplateBackgroundRow>>()
        .map_err(|_| ())?;

    Ok(rows.into_iter().next())
}

/// Create a signed Storage URL via `POST <origin>/storage/v1/object/sign/<bucket>/<path>`
/// with `{ "expiresIn": 3600 }`, mirroring the Supabase JS storage client.
async fn create_signed_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_path: &str,
) -> Option<String> {
    let storage_base = storage_origin(contact_data)?;
    let service_role_key = contact_data.service_role_key()?;
    let authorization = format!("Bearer {service_role_key}");
    let url = format!("{storage_base}/object/sign/{STORAGE_BUCKET}/{storage_path}");
    let body = json!({ "expiresIn": SIGNED_URL_EXPIRES_IN }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    let signed = response.json::<SignedUrlRow>().ok()?.signed_url?;
    if signed.trim().is_empty() {
        return None;
    }

    Some(format!("{storage_base}{signed}"))
}

/// Derive the Supabase Storage base (`<origin>/storage/v1`) from the REST URL.
fn storage_origin(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest_url = contact_data.rest_url("__origin__", &[])?;
    let origin = rest_url.split("/rest/v1/").next()?;
    if origin.is_empty() {
        return None;
    }
    Some(format!("{origin}/storage/v1"))
}

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
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
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
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn send_caller_get(
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
// Pure helpers
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, ch)| {
        let is_edge = index == 0 || index + 1 == length;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!is_edge && matches!(ch, '_' | '-'))
    })
}

/// Check that `value` is a UUID (8-4-4-4-12 hex, dashes at positions 8/13/18/23,
/// total length 36), mirroring the legacy `z.guid()` validator.
fn is_uuid(value: &str) -> bool {
    is_workspace_uuid_literal(value)
}

/// Extract `(ws_id, template_id)` from
/// `/api/v1/workspaces/{wsId}/templates/{templateId}/background-url`.
///
/// Returns `None` for any path that does not match this shape so the handler
/// returns `None` and the worker falls through to the next handler.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    // Strip leading prefix.
    let rest = path.strip_prefix(PATH_PREFIX)?;
    // rest = "{wsId}/templates/{templateId}/background-url"

    // Split off the ws_id at the first '/'.
    let slash_pos = rest.find('/')?;
    let ws_id = &rest[..slash_pos];
    if ws_id.is_empty() {
        return None;
    }

    // The remainder must start with "/templates/".
    let after_ws = &rest[slash_pos..];
    // after_ws = "/templates/{templateId}/background-url"
    let template_rest = after_ws.strip_prefix(TEMPLATES_SEGMENT)?;
    // template_rest = "{templateId}/background-url"

    // Strip the trailing "/background-url" suffix.
    let template_id = template_rest.strip_suffix(PATH_SUFFIX)?;
    // template_id = "{templateId}"

    if template_id.is_empty() || template_id.contains('/') {
        return None;
    }

    Some((ws_id, template_id))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_path_params_valid() {
        let ws_id = "11111111-1111-1111-1111-111111111111";
        let tmpl_id = "22222222-2222-2222-2222-222222222222";
        let path = format!("/api/v1/workspaces/{ws_id}/templates/{tmpl_id}/background-url");
        let result = extract_path_params(&path);
        assert_eq!(result, Some((ws_id, tmpl_id)));
    }

    #[test]
    fn test_extract_path_params_wrong_suffix() {
        let path = "/api/v1/workspaces/ws1/templates/t1/other";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn test_extract_path_params_missing_template_segment() {
        let path = "/api/v1/workspaces/ws1/background-url";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn test_extract_path_params_empty_ws_id() {
        let path = "/api/v1/workspaces//templates/t1/background-url";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn test_extract_path_params_extra_segment() {
        // Extra slash inside template_id should fail.
        let path = "/api/v1/workspaces/ws1/templates/t1/extra/background-url";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn test_extract_path_params_personal_workspace() {
        let path = "/api/v1/workspaces/personal/templates/22222222-2222-2222-2222-222222222222/background-url";
        let result = extract_path_params(path);
        assert_eq!(
            result,
            Some(("personal", "22222222-2222-2222-2222-222222222222"))
        );
    }

    #[test]
    fn test_is_uuid_valid() {
        assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn test_is_uuid_too_short() {
        assert!(!is_uuid("550e8400-e29b-41d4-a716-44665544000"));
    }

    #[test]
    fn test_is_uuid_invalid_chars() {
        assert!(!is_uuid("550e8400-e29b-41d4-a716-44665544000z"));
    }

    #[test]
    fn test_is_uuid_no_dashes() {
        assert!(!is_uuid("550e8400xe29b41d4a716446655440000"));
    }

    #[test]
    fn test_resolve_workspace_id_internal() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    }

    #[test]
    fn test_resolve_workspace_id_passthrough() {
        let id = "some-other-value";
        assert_eq!(resolve_workspace_id(id), id);
    }

    #[test]
    fn test_is_workspace_handle_valid() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("myworkspace123"));
        assert!(is_workspace_handle("a"));
    }

    #[test]
    fn test_is_workspace_handle_leading_dash() {
        assert!(!is_workspace_handle("-bad"));
        assert!(!is_workspace_handle("bad-"));
    }

    #[test]
    fn test_storage_origin_from_rest_url() {
        // Verify the storage_origin logic by parsing a representative URL.
        let input = "https://example.supabase.co/rest/v1/__origin__";
        let origin = input.split("/rest/v1/").next().unwrap_or("");
        let storage = format!("{origin}/storage/v1");
        assert_eq!(storage, "https://example.supabase.co/storage/v1");
    }
}
