//! Handler for `GET /api/v1/workspaces/:wsId/whiteboards/:boardId/image-url`.
//!
//! Ports `GET` from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/whiteboards/[boardId]/image-url/route.ts`.
//! `POST` and all other methods return `None` (Next.js handles them).
//!
//! ## Auth
//!
//! Mirrors `requireWhiteboardAccess`: session token (no app sessions),
//! workspace-ID normalisation, then `workspace_members` check (`type=MEMBER`).
//! The membership query uses the service-role key (RLS bypassed); semantics are
//! identical for valid members.
//!
//! ## Response shapes
//!
//! - `200 { "signedUrl": "..." }` (no-store) on success.
//! - `400 { "error": "..." }` — missing/invalid `path` param or path prefix.
//! - `401 { "error": "Unauthorized" }` — no session.
//! - `403 { "error": "Workspace access denied" }` — not a MEMBER.
//! - `500 { "error": "..." }` — upstream failure.
//!
//! ## Behavior gaps vs. legacy
//!
//! - Zod UUID validation of `boardId` is omitted; the handler rejects only
//!   empty segments or segments containing `/`.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const WHITEBOARDS_SEGMENT: &str = "/whiteboards/";
const IMAGE_URL_SUFFIX: &str = "/image-url";
const STORAGE_SIGN_EXPIRES_IN: u64 = 3600;
const PERSONAL_WS_SLUG: &str = "personal";
const INTERNAL_WS_SLUG: &str = "internal";
const ROOT_WS_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Deserialize)]
struct WsIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct SignedUrlResponse {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_whiteboards_boardid_image_url_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, board_id) = extract_segments(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, board_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    board_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return err(500, "Internal server error");
    }

    let Some(token) = supabase_auth::request_access_token(request) else {
        return err(401, "Unauthorized");
    };

    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &token, outbound)
            .await
            .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err(401, "Unauthorized");
    };

    let ws_id =
        match normalize_ws_id(&config.contact_data, outbound, raw_ws_id, &user_id, &token).await {
            Ok(id) => id,
            Err(()) => return err(500, "Internal server error"),
        };

    match is_member(&config.contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return err(403, "Workspace access denied"),
        Err(()) => return err(500, "Internal server error"),
    }

    let Some(path) = path_query_param(request.url) else {
        return err(400, "path is required");
    };

    let prefix = format!("{ws_id}/whiteboards/{board_id}/");
    if !path.starts_with(&prefix) || path.contains("..") {
        return err(400, "Invalid whiteboard image path");
    }

    match sign_storage_url(&config.contact_data, outbound, &path).await {
        Some(url) => no_store_response(json_response(200, json!({ "signedUrl": url }))),
        None => err(500, "Failed to load whiteboard image"),
    }
}

async fn normalize_ws_id(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw: &str,
    user_id: &str,
    token: &str,
) -> Result<String, ()> {
    let resolved = if raw.trim().eq_ignore_ascii_case(INTERNAL_WS_SLUG) {
        ROOT_WS_ID.to_owned()
    } else {
        raw.to_owned()
    };

    if resolved == ROOT_WS_ID {
        return Ok(ROOT_WS_ID.to_owned());
    }

    if raw.trim().eq_ignore_ascii_case(PERSONAL_WS_SLUG) {
        return personal_ws_id(cd, outbound, user_id, token).await;
    }

    if !is_ws_uuid(&resolved) {
        let handle = raw.trim().to_lowercase();
        if is_ws_handle(&handle) {
            if let Some(id) = ws_id_by_handle(cd, outbound, &handle, Some(token)).await? {
                return Ok(id);
            }
            if let Some(id) = ws_id_by_handle(cd, outbound, &handle, None).await? {
                return Ok(id);
            }
        }
    }

    Ok(resolved)
}

async fn personal_ws_id(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    token: &str,
) -> Result<String, ()> {
    let url = cd
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
    let resp = rest_get(cd, outbound, &url, Some(token)).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<WsIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id)
        .ok_or(())
}

/// Lookup a workspace ID by handle. Pass `Some(token)` to use caller auth
/// (RLS active) or `None` to use the service-role key (RLS bypassed).
async fn ws_id_by_handle(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = cd
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = rest_get(cd, outbound, &url, token).await?;
    if !(200..300).contains(&resp.status) {
        return Ok(None);
    }
    Ok(resp
        .json::<Vec<WsIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id))
}

async fn is_member(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = cd
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
    let resp = rest_get(cd, outbound, &url, None).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|r| r.membership_type.as_deref())
        == Some("MEMBER"))
}

/// POST to Supabase Storage sign endpoint; returns a signed URL valid for
/// `STORAGE_SIGN_EXPIRES_IN` seconds.
async fn sign_storage_url(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_path: &str,
) -> Option<String> {
    let auth_root = cd.auth_url("")?;
    let base = auth_root.trim_end_matches('/').strip_suffix("/auth/v1")?;
    let url = format!("{base}/storage/v1/object/sign/workspaces/{storage_path}");
    let key = cd.service_role_key()?;
    let bearer = format!("Bearer {key}");
    let body = format!("{{\"expiresIn\":{STORAGE_SIGN_EXPIRES_IN}}}");

    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .ok()?;

    if !(200..300).contains(&resp.status) {
        return None;
    }
    resp.json::<SignedUrlResponse>()
        .ok()
        .and_then(|r| r.signed_url)
}

/// GET against a Supabase REST endpoint. Pass `Some(token)` for caller auth
/// or `None` to use the service-role key.
async fn rest_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    token: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let key = cd.service_role_key().ok_or(())?;
    let auth = match token {
        Some(t) => format!("Bearer {t}"),
        None => format!("Bearer {key}"),
    };
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

/// Extract `(wsId, boardId)` from
/// `/api/v1/workspaces/{wsId}/whiteboards/{boardId}/image-url`.
///
/// Returns `None` when the path does not match, when either segment is empty,
/// or when a segment contains `/`.
fn extract_segments(path: &str) -> Option<(&str, &str)> {
    let tail = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = tail.split_once(WHITEBOARDS_SEGMENT)?;
    let board_id = after_ws.strip_suffix(IMAGE_URL_SUFFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || board_id.is_empty() || board_id.contains('/') {
        return None;
    }

    Some((ws_id, board_id))
}

fn path_query_param(request_url: Option<&str>) -> Option<String> {
    let url = url::Url::parse(request_url?).ok()?;
    url.query_pairs()
        .find_map(|(k, v)| (k == "path" && !v.is_empty()).then(|| v.into_owned()))
}

fn err(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn is_ws_uuid(value: &str) -> bool {
    value.trim().len() == 36
        && value.trim().chars().enumerate().all(|(i, ch)| match i {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn is_ws_handle(value: &str) -> bool {
    let n = value.len();
    n > 0
        && n <= 64
        && value.chars().enumerate().all(|(i, ch)| {
            let edge = i == 0 || i + 1 == n;
            ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!edge && matches!(ch, '_' | '-'))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";
    const BOARD: &str = "22222222-2222-4222-8222-222222222222";

    #[test]
    fn extract_segments_happy_path() {
        let path = format!("/api/v1/workspaces/{WS}/whiteboards/{BOARD}/image-url");
        assert_eq!(extract_segments(&path), Some((WS, BOARD)));
    }

    #[test]
    fn extract_segments_rejects_wrong_prefix() {
        assert!(
            extract_segments(&format!(
                "/api/v2/workspaces/{WS}/whiteboards/{BOARD}/image-url"
            ))
            .is_none()
        );
    }

    #[test]
    fn extract_segments_rejects_wrong_suffix() {
        assert!(
            extract_segments(&format!(
                "/api/v1/workspaces/{WS}/whiteboards/{BOARD}/other"
            ))
            .is_none()
        );
    }

    #[test]
    fn extract_segments_rejects_empty_ws_id() {
        assert!(
            extract_segments(&format!(
                "/api/v1/workspaces//whiteboards/{BOARD}/image-url"
            ))
            .is_none()
        );
    }

    #[test]
    fn extract_segments_rejects_empty_board_id() {
        assert!(
            extract_segments(&format!("/api/v1/workspaces/{WS}/whiteboards//image-url")).is_none()
        );
    }

    #[test]
    fn extract_segments_rejects_slash_in_board_id() {
        assert!(
            extract_segments(&format!(
                "/api/v1/workspaces/{WS}/whiteboards/a/b/image-url"
            ))
            .is_none()
        );
    }

    #[test]
    fn path_query_param_extracts_value() {
        let url = format!(
            "https://app.example.com/api/v1/workspaces/{WS}/whiteboards/{BOARD}/image-url\
             ?path={WS}/whiteboards/{BOARD}/img.png"
        );
        let expected = format!("{WS}/whiteboards/{BOARD}/img.png");
        assert_eq!(
            path_query_param(Some(&url)).as_deref(),
            Some(expected.as_str())
        );
    }

    #[test]
    fn path_query_param_returns_none_when_absent() {
        let url =
            format!("https://app.example.com/api/v1/workspaces/{WS}/whiteboards/{BOARD}/image-url");
        assert!(path_query_param(Some(&url)).is_none());
    }

    #[test]
    fn path_query_param_returns_none_for_empty_value() {
        let url = format!(
            "https://app.example.com/api/v1/workspaces/{WS}/whiteboards/{BOARD}/image-url?path="
        );
        assert!(path_query_param(Some(&url)).is_none());
    }

    #[test]
    fn is_ws_uuid_accepts_valid() {
        assert!(is_ws_uuid(WS));
    }

    #[test]
    fn is_ws_uuid_rejects_slug() {
        assert!(!is_ws_uuid("my-workspace"));
    }

    #[test]
    fn is_ws_handle_accepts_valid() {
        assert!(is_ws_handle("my-workspace"));
    }

    #[test]
    fn is_ws_handle_rejects_uppercase() {
        assert!(!is_ws_handle("My-Workspace"));
    }

    #[test]
    fn is_ws_handle_rejects_leading_hyphen() {
        assert!(!is_ws_handle("-myworkspace"));
    }
}
