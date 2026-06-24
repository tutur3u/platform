//! Handler for `GET /api/v1/workspaces/:wsId/users/avatar`.
//!
//! Ported from `apps/web/src/app/api/v1/workspaces/[wsId]/users/avatar/route.ts`.
//!
//! ONLY the `GET` method is migrated here. The legacy route also defines a
//! `POST` (signed upload URL creation, gated on `manage_users`) which is NOT
//! migrated yet — this handler returns `None` for every non-`GET` method so the
//! Cloudflare Worker falls through to the still-active Next.js route for `POST`.
//!
//! Legacy GET behavior:
//!   1. Read the `path` query param. Missing/empty -> 400
//!      `{ "message": "path is required" }`.
//!   2. Require `path.startsWith(`${wsId}/users/`)` using the RAW `wsId` URL
//!      slug (NOT a normalized workspace id) -> otherwise 400
//!      `{ "message": "Invalid path" }`.
//!   3. `getPermissions({ wsId, request })` — resolves the workspace id
//!      (`personal`/`internal` slugs + handle lookup), verifies the
//!      authenticated user is a `MEMBER`, and returns the permission set. The GET
//!      only checks that permissions are truthy (any member). When the caller is
//!      not a member (or no user / lookup failure), `getPermissions` returns
//!      `null` -> 404 `{ "error": "Not found" }`.
//!   4. Create a 1-year (`60*60*24*365`) signed Storage read URL for `path` in
//!      the `workspaces` bucket. On signing error -> 500
//!      `{ "message": "Error generating signed read URL" }`.
//!   5. On success return 200 with the raw Supabase `createSignedUrl` data
//!      shape: `{ "signedUrl": "<fully-qualified url>" }`.
//!
//! Notes / assumptions:
//!   - The legacy route relies on RLS via the caller's Supabase session inside
//!     `getPermissions`. This Worker port performs the membership check with the
//!     service-role key (mirroring `workspace_habits_access.rs`) after resolving
//!     the authenticated user from the bearer token, then signs with the
//!     service-role key. The `createSignedUrl` call in the legacy route already
//!     used the admin (service-role) client, so the signing privilege matches.
//!   - `getPermissions` collapses "no authenticated user", "lookup failure", and
//!     "not a member" all into a `null` return (the route then responds 404
//!     `{ "error": "Not found" }`). To faithfully reproduce that single 404
//!     branch, ANY failure to positively confirm membership maps to the same 404
//!     here (we do NOT surface 401/500 for the membership stage, unlike
//!     `workspace_habits_access.rs`, because the legacy GET never returns those).
//!   - The `path.startsWith(`${wsId}/users/`)` guard intentionally uses the raw
//!     URL `wsId` (e.g. `personal`, a handle, or a uuid) exactly as the legacy
//!     route does — it runs BEFORE permission resolution, so a request whose
//!     `path` does not begin with the literal slug is rejected with 400 even for
//!     a valid member.
//!   - Several helpers (workspace-id normalization, membership verification,
//!     signed-url creation, storage origin derivation, REST request helpers) are
//!     COPIED file-locally from `workspace_habits_access.rs` /
//!     `workspaces_meetings_recordings_play.rs` rather than shared, to keep this
//!     module self-contained without editing any existing file.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const STORAGE_BUCKET: &str = "workspaces";
/// 60 * 60 * 24 * 365 (one year), mirroring the legacy `createSignedUrl` expiry.
const SIGNED_URL_EXPIRES_IN: u32 = 31_536_000;

const PATH_REQUIRED_MESSAGE: &str = "path is required";
const INVALID_PATH_MESSAGE: &str = "Invalid path";
const NOT_FOUND_MESSAGE: &str = "Not found";
const SIGN_ERROR_MESSAGE: &str = "Error generating signed read URL";

// ---------------------------------------------------------------------------
// Deserialization rows.
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
struct SignedUrlRow {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_users_avatar_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_users_avatar_ws_id(request.path)?;

    Some(match request.method {
        "GET" => avatar_get_response(config, request, raw_ws_id, outbound).await,
        // The legacy route still owns POST (and any future methods); fall through
        // to Next.js by returning None for everything except GET.
        _ => return None,
    })
}

async fn avatar_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. `path` query param is required.
    let Some(path) = query_param(request.url, "path").filter(|value| !value.is_empty()) else {
        return message_response(400, PATH_REQUIRED_MESSAGE);
    };

    // 2. Ensure the path is within the workspace's user avatars directory.
    //    Uses the RAW wsId slug exactly like the legacy route.
    let required_prefix = format!("{raw_ws_id}/users/");
    if !path.starts_with(&required_prefix) {
        return message_response(400, INVALID_PATH_MESSAGE);
    }

    // 3. getPermissions: resolve user + workspace, verify MEMBER. Any failure to
    //    positively confirm membership collapses to the legacy 404 branch.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(404, NOT_FOUND_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(404, NOT_FOUND_MESSAGE);
    };

    let Ok(resolved_ws_id) =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token).await
    else {
        return error_response(404, NOT_FOUND_MESSAGE);
    };

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
    }

    // 4. Create the 1-year signed read URL from the `workspaces` bucket.
    match create_signed_url(contact_data, outbound, &path).await {
        Some(signed_url) => {
            no_store_response(json_response(200, json!({ "signedUrl": signed_url })))
        }
        None => message_response(500, SIGN_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Path matching: /api/v1/workspaces/<wsId>/users/avatar
// ---------------------------------------------------------------------------

fn workspaces_users_avatar_ws_id(path: &str) -> Option<&str> {
    let segments = crate::path_segments(path);

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "users"
        && segments[5] == "avatar"
        && !segments[3].is_empty()
    {
        Some(segments[3])
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Query param parsing (first occurrence, URL-decoded).
// ---------------------------------------------------------------------------

fn query_param(url: Option<&str>, key: &str) -> Option<String> {
    let query = url?.split_once('?').map(|(_, query)| query)?;
    for pair in query.split('&') {
        let (raw_key, raw_value) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        if url_decode(raw_key) == key {
            return Some(url_decode(raw_value));
        }
    }
    None
}

fn url_decode(input: &str) -> String {
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
// Signed URL creation (workspaces bucket, service role).
// Copied from workspaces_meetings_recordings_play.rs.
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

/// Derive the Supabase Storage base (`<origin>/storage/v1`) from the REST base
/// URL. `ContactDataConfig` exposes no raw origin accessor, so reuse `rest_url`
/// and rewrite the `/rest/v1/...` segment to `/storage/v1`.
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
// Copied/adapted from workspace_habits_access.rs.
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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
// REST request helpers (copied from workspace_habits_access.rs).
// ---------------------------------------------------------------------------

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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
// Workspace identifier helpers (copied from workspace_habits_access.rs).
// ---------------------------------------------------------------------------

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
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
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

// ---------------------------------------------------------------------------
// Response helpers.
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}
