//! Handler for `GET /api/v1/workspaces/:wsId/logo`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/logo/route.ts`.
//!
//! Legacy GET behavior (step-by-step):
//!
//! 1. `withSessionAuth` authenticates the caller. A missing or invalid session
//!    token surfaces as `401 Unauthorized` before the handler runs.
//! 2. `getPermissions({ wsId, request })` resolves the workspace id (`personal` /
//!    `internal` / handle lookup) and verifies the caller is a workspace `MEMBER`.
//!    A `null` result (not authenticated, workspace not found, or not a member)
//!    -> `403 { "message": "Workspace access denied" }`.
//! 3. Read `workspaces.logo_url` with the caller's session client (RLS active).
//!    On DB error -> `500 { "message": "Internal server error" }`.
//! 4. If `logo_url` is absent or empty -> `200 { "url": null }`.
//! 5. If `logo_url` fails the `isSafeWorkspaceLogoPath` guard ->
//!    `200 { "url": null }`.
//! 6. Create a 15-minute (`60 * 15 = 900 s`) Supabase Storage signed URL for
//!    the `logo_url` path in the `workspaces` bucket. On signing error ->
//!    `500 { "message": "Internal server error" }`.
//! 7. Respond `200 { "url": "<fully-qualified signed url> | null" }` with
//!    `Cache-Control: private, max-age=30, stale-while-revalidate=30`.
//!
//! ONLY the GET method is migrated. PATCH and DELETE fall through to the
//! still-active Next.js route via `return None`.
//!
//! Behavior gaps:
//!
//! - The legacy route reads `workspaces` via the caller's Supabase session
//!   (RLS active). This port reads with the service-role key, scoped by
//!   `ws_id`, which matches the legacy result because workspace-member RLS on
//!   `workspaces` allows members to read their own workspace.
//! - Workspace-id normalization is reproduced locally (mirroring
//!   `workspaces_users_avatar.rs`): `internal` maps to the root UUID, `personal`
//!   maps to the user's personal workspace, and handle slugs are resolved via
//!   handle lookup.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

const LOGO_PATH_PREFIX: &str = "/api/v1/workspaces/";
const LOGO_PATH_SUFFIX: &str = "/logo";

const STORAGE_BUCKET: &str = "workspaces";
/// 60 * 15 seconds — mirrors `createSignedUrl(path, 60 * 15)` in the legacy route.
const SIGNED_URL_EXPIRES_IN: u32 = 900;

const LOGO_CACHE_CONTROL: &str = "private, max-age=30, stale-while-revalidate=30";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const LOGOS_DIRECTORY: &str = "logos";
const LOGO_FILENAME_PREFIX: &str = "logo-";

const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// ---------------------------------------------------------------------------
// Deserialization rows.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceLogoRow {
    logo_url: Option<String>,
}

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
struct SignedUrlRow {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_logo_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = logo_ws_id(request.path)?;

    Some(match request.method {
        "GET" => logo_get_response(config, request, raw_ws_id, outbound).await,
        // Only GET is migrated; fall through to the still-active Next.js route
        // for PATCH, DELETE, and all other methods.
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler.
// ---------------------------------------------------------------------------

async fn logo_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Step 1: authenticate the caller (mirrors `withSessionAuth`).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return unauthorized_response();
    };

    // Step 2: normalize workspace id and verify membership
    // (mirrors `getPermissions({ wsId, request })`).
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(id) => id,
            Err(()) => return workspace_access_denied_response(),
        };

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return workspace_access_denied_response(),
        Err(()) => return internal_server_error_response(),
    }

    // Step 3: read workspaces.logo_url.
    let logo_url = match fetch_logo_url(contact_data, outbound, &resolved_ws_id).await {
        Ok(url) => url,
        Err(()) => return internal_server_error_response(),
    };

    // Step 4: absent or empty logo_url.
    let Some(logo_url) = logo_url.filter(|url| !url.is_empty()) else {
        return logo_url_response(None);
    };

    // Step 5: path safety guard.
    if !is_safe_workspace_logo_path(&logo_url, &resolved_ws_id) {
        return logo_url_response(None);
    }

    // Step 6: create a 15-minute signed URL.
    match create_signed_url(contact_data, outbound, &logo_url).await {
        Some(signed_url) => logo_url_response(Some(&signed_url)),
        None => internal_server_error_response(),
    }
}

// ---------------------------------------------------------------------------
// Path matching: /api/v1/workspaces/<wsId>/logo.
// ---------------------------------------------------------------------------

fn logo_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(LOGO_PATH_PREFIX)?
        .strip_suffix(LOGO_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Logo path safety (mirrors `isSafeWorkspaceLogoPath` in the legacy route).
// ---------------------------------------------------------------------------

/// Returns `true` when `file_path` matches the pattern
/// `<workspace_id>/logos/logo-<digits>.<safe_ext>` and every segment
/// passes the `isSafePathSegment` check from the legacy route.
fn is_safe_workspace_logo_path(file_path: &str, workspace_id: &str) -> bool {
    // filePath !== filePath.trim()
    if file_path != file_path.trim() {
        return false;
    }
    // isSafePathSegment(workspaceId)
    if !is_safe_path_segment(workspace_id) {
        return false;
    }

    let segments: Vec<&str> = file_path.split('/').collect();
    if segments.len() != 3 {
        return false;
    }

    let path_workspace_id = segments[0];
    let directory = segments[1];
    let filename = segments[2];

    if path_workspace_id.is_empty() || directory.is_empty() || filename.is_empty() {
        return false;
    }

    path_workspace_id == workspace_id
        && directory == LOGOS_DIRECTORY
        && segments.iter().all(|s| is_safe_path_segment(s))
        && is_safe_logo_filename(filename)
}

/// Mirrors the legacy `isSafePathSegment` helper:
/// no empty string, no `.` or `..`, no backslashes, and the URL-decoded form
/// must also contain no `/` or `\` and not equal `.` or `..`.
fn is_safe_path_segment(segment: &str) -> bool {
    if segment.is_empty() || segment == "." || segment == ".." {
        return false;
    }
    if segment.contains('\\') {
        return false;
    }
    // Mirror try { decodeURIComponent(segment) } catch { return false }.
    let decoded = percent_decode(segment);
    if decoded == "." || decoded == ".." || decoded.contains('/') || decoded.contains('\\') {
        return false;
    }
    true
}

/// Mirrors the `SAFE_LOGO_FILENAME_PATTERN = /^logo-\d+\.(png|jpg|jpeg|gif|webp|svg)$/`.
fn is_safe_logo_filename(filename: &str) -> bool {
    let Some(rest) = filename.strip_prefix(LOGO_FILENAME_PREFIX) else {
        return false;
    };
    let Some(dot_pos) = rest.rfind('.') else {
        return false;
    };
    let digits = &rest[..dot_pos];
    let ext = &rest[dot_pos + 1..];
    !digits.is_empty()
        && digits.chars().all(|c| c.is_ascii_digit())
        && matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
}

/// Minimal percent-decode used only for the safety guard.
/// Mirrors JavaScript `decodeURIComponent` for the characters relevant here.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                    out.push((hi << 4) | lo);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            other => {
                out.push(other);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Database reads.
// ---------------------------------------------------------------------------

async fn fetch_logo_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "logo_url".to_owned()),
                ("id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<WorkspaceLogoRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| row.logo_url))
}

// ---------------------------------------------------------------------------
// Signed URL creation (mirrored from `workspaces_users_avatar.rs`).
// ---------------------------------------------------------------------------

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

/// Derive `<origin>/storage/v1` from `ContactDataConfig`.
/// Mirrors the helper in `workspaces_users_avatar.rs`.
fn storage_origin(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest_url = contact_data.rest_url("__origin__", &[])?;
    let origin = rest_url.split("/rest/v1/").next()?;
    if origin.is_empty() {
        return None;
    }
    Some(format!("{origin}/storage/v1"))
}

// ---------------------------------------------------------------------------
// Workspace id normalization + membership verification.
// Copied/adapted from `workspaces_users_avatar.rs`.
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_workspace_lookup_identifier(&handle) {
            if let Some(id) =
                workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
            {
                return Ok(id);
            }
            if let Some(id) =
                workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
            {
                return Ok(id);
            }
        }
    }

    Ok(resolved)
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
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
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
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
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

// ---------------------------------------------------------------------------
// HTTP request helpers.
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
// Response builders.
// ---------------------------------------------------------------------------

/// `200 { "url": <signed_url> | null }` with the legacy cache header.
fn logo_url_response(url: Option<&str>) -> BackendResponse {
    let body = match url {
        Some(u) => json!({ "url": u }),
        None => json!({ "url": null }),
    };
    let mut response = json_response(200, body);
    response.cache_control = Some(LOGO_CACHE_CONTROL);
    response
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn workspace_access_denied_response() -> BackendResponse {
    json_response(403, json!({ "message": WORKSPACE_ACCESS_DENIED_MESSAGE }))
}

fn internal_server_error_response() -> BackendResponse {
    json_response(500, json!({ "message": INTERNAL_SERVER_ERROR_MESSAGE }))
}

// ---------------------------------------------------------------------------
// Tests (pure/sync helpers only).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- logo_ws_id ---

    #[test]
    fn logo_ws_id_matches_canonical_uuid_path() {
        assert_eq!(
            logo_ws_id("/api/v1/workspaces/11111111-1111-4111-8111-111111111111/logo"),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn logo_ws_id_matches_personal_slug() {
        assert_eq!(
            logo_ws_id("/api/v1/workspaces/personal/logo"),
            Some("personal")
        );
    }

    #[test]
    fn logo_ws_id_rejects_extra_segments() {
        assert_eq!(logo_ws_id("/api/v1/workspaces/ws-1/logo/extra"), None);
    }

    #[test]
    fn logo_ws_id_rejects_wrong_suffix() {
        assert_eq!(logo_ws_id("/api/v1/workspaces/ws-1/settings"), None);
    }

    #[test]
    fn logo_ws_id_rejects_missing_v1() {
        assert_eq!(logo_ws_id("/api/workspaces/ws-1/logo"), None);
    }

    #[test]
    fn logo_ws_id_rejects_empty_ws_id() {
        assert_eq!(logo_ws_id("/api/v1/workspaces//logo"), None);
    }

    #[test]
    fn logo_ws_id_rejects_nested_ws_id() {
        assert_eq!(logo_ws_id("/api/v1/workspaces/a/b/logo"), None);
    }

    #[test]
    fn logo_ws_id_rejects_unrelated_path() {
        assert_eq!(logo_ws_id("/api/health"), None);
    }

    // --- is_safe_workspace_logo_path ---

    #[test]
    fn safe_path_accepts_valid_png() {
        assert!(is_safe_workspace_logo_path(
            "11111111-1111-4111-8111-111111111111/logos/logo-1234567890.png",
            "11111111-1111-4111-8111-111111111111"
        ));
    }

    #[test]
    fn safe_path_accepts_all_valid_extensions() {
        let ws_id = "11111111-1111-4111-8111-111111111111";
        for ext in ["png", "jpg", "jpeg", "gif", "webp", "svg"] {
            let path = format!("{ws_id}/logos/logo-1.{ext}");
            assert!(
                is_safe_workspace_logo_path(&path, ws_id),
                "extension {ext} should be accepted"
            );
        }
    }

    #[test]
    fn safe_path_rejects_wrong_workspace_id() {
        assert!(!is_safe_workspace_logo_path(
            "other-id/logos/logo-1.png",
            "11111111-1111-4111-8111-111111111111"
        ));
    }

    #[test]
    fn safe_path_rejects_wrong_directory() {
        assert!(!is_safe_workspace_logo_path(
            "11111111-1111-4111-8111-111111111111/avatars/logo-1.png",
            "11111111-1111-4111-8111-111111111111"
        ));
    }

    #[test]
    fn safe_path_rejects_too_few_segments() {
        assert!(!is_safe_workspace_logo_path(
            "11111111-1111-4111-8111-111111111111/logo-1.png",
            "11111111-1111-4111-8111-111111111111"
        ));
    }

    #[test]
    fn safe_path_rejects_too_many_segments() {
        assert!(!is_safe_workspace_logo_path(
            "11111111-1111-4111-8111-111111111111/logos/sub/logo-1.png",
            "11111111-1111-4111-8111-111111111111"
        ));
    }

    #[test]
    fn safe_path_rejects_leading_whitespace() {
        assert!(!is_safe_workspace_logo_path(
            " 11111111-1111-4111-8111-111111111111/logos/logo-1.png",
            "11111111-1111-4111-8111-111111111111"
        ));
    }

    #[test]
    fn safe_path_rejects_dot_traversal() {
        assert!(!is_safe_workspace_logo_path(
            "../other/logos/logo-1.png",
            "../other"
        ));
        assert!(!is_safe_workspace_logo_path("ws/./logo-1.png", "ws"));
    }

    #[test]
    fn safe_path_rejects_bad_filename() {
        let ws_id = "11111111-1111-4111-8111-111111111111";
        assert!(!is_safe_workspace_logo_path(
            &format!("{ws_id}/logos/avatar-1.png"),
            ws_id
        ));
        assert!(!is_safe_workspace_logo_path(
            &format!("{ws_id}/logos/logo-.png"),
            ws_id
        ));
        assert!(!is_safe_workspace_logo_path(
            &format!("{ws_id}/logos/logo-1.bmp"),
            ws_id
        ));
    }

    // --- is_safe_logo_filename ---

    #[test]
    fn safe_logo_filename_accepts_valid() {
        assert!(is_safe_logo_filename("logo-0.png"));
        assert!(is_safe_logo_filename("logo-1234567890.jpeg"));
        assert!(is_safe_logo_filename("logo-99.svg"));
    }

    #[test]
    fn safe_logo_filename_rejects_no_prefix() {
        assert!(!is_safe_logo_filename("image-1.png"));
    }

    #[test]
    fn safe_logo_filename_rejects_no_digits() {
        assert!(!is_safe_logo_filename("logo-.png"));
    }

    #[test]
    fn safe_logo_filename_rejects_non_digits() {
        assert!(!is_safe_logo_filename("logo-abc.png"));
    }

    #[test]
    fn safe_logo_filename_rejects_unsafe_extension() {
        assert!(!is_safe_logo_filename("logo-1.bmp"));
        assert!(!is_safe_logo_filename("logo-1.exe"));
    }

    // --- is_safe_path_segment ---

    #[test]
    fn safe_segment_accepts_normal_identifiers() {
        assert!(is_safe_path_segment("logos"));
        assert!(is_safe_path_segment("11111111-1111-4111-8111-111111111111"));
        assert!(is_safe_path_segment("logo-123.png"));
    }

    #[test]
    fn safe_segment_rejects_empty() {
        assert!(!is_safe_path_segment(""));
    }

    #[test]
    fn safe_segment_rejects_dot_and_dotdot() {
        assert!(!is_safe_path_segment("."));
        assert!(!is_safe_path_segment(".."));
    }

    #[test]
    fn safe_segment_rejects_backslash() {
        assert!(!is_safe_path_segment("foo\\bar"));
    }

    #[test]
    fn safe_segment_rejects_encoded_slash() {
        assert!(!is_safe_path_segment("foo%2Fbar"));
    }

    // --- is_workspace_uuid_literal ---

    #[test]
    fn uuid_literal_accepts_valid_v4() {
        assert!(is_workspace_uuid_literal(
            "11111111-1111-4111-8111-111111111111"
        ));
    }

    #[test]
    fn uuid_literal_rejects_too_short() {
        assert!(!is_workspace_uuid_literal("11111111-1111-4111-8111"));
    }

    #[test]
    fn uuid_literal_rejects_non_hex() {
        assert!(!is_workspace_uuid_literal(
            "zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz"
        ));
    }

    // --- resolve_workspace_id ---

    #[test]
    fn resolve_internal_slug_to_root_uuid() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    }

    #[test]
    fn resolve_other_ids_pass_through() {
        assert_eq!(resolve_workspace_id("personal"), "personal");
        assert_eq!(
            resolve_workspace_id("11111111-1111-4111-8111-111111111111"),
            "11111111-1111-4111-8111-111111111111"
        );
    }
}
