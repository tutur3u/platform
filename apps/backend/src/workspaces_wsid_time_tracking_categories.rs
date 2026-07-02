//! Handler for `GET /api/v1/workspaces/:wsId/time-tracking/categories`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/categories/route.ts`.
//!
//! Auth model: resolve the authenticated session user via
//! `resolveSessionAuthContext` with `allowAppSessionAuth: true`, normalize the
//! workspace slug, then require workspace membership.  The data read uses the
//! service-role client (RLS bypassed, scoped by `ws_id` filter).
//!
//! Legacy status codes:
//!
//! - no/invalid session              -> `401 { "error": "Unauthorized" }`
//! - membership lookup error         -> `500 { "error": "Failed to verify workspace access" }`
//! - not a workspace member          -> `403 { "error": "Workspace access denied" }`
//! - categories query failure        -> `500 { "error": "Internal server error" }`
//! - success                         -> `200 { "categories": [...] }`
//!
//! POST is left to the still-live Next.js route (returns `None` for non-GET).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/time-tracking/categories";
const INTERNAL_SLUG: &str = "internal";
const PERSONAL_SLUG: &str = "personal";
const ROOT_WS_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Deserialize)]
struct WsIdRow {
    id: Option<String>,
}
#[derive(Deserialize)]
struct MemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_time_tracking_categories_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return err(500, "Internal server error");
    }

    let Some(token) = supabase_auth::request_access_token_allowing_app_sessions(request) else {
        return err(401, "Unauthorized");
    };
    let Some(user_id) = supabase_auth::fetch_supabase_auth_user(cd, &token, outbound)
        .await
        .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err(401, "Unauthorized");
    };

    let ws_id = match normalize_ws_id(cd, outbound, raw_ws_id, &user_id, &token).await {
        Ok(Some(id)) => id,
        _ => return err(500, "Failed to verify workspace access"),
    };

    match verify_member(cd, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return err(403, "Workspace access denied"),
        Err(()) => return err(500, "Failed to verify workspace access"),
    }

    match fetch_categories(cd, outbound, &ws_id).await {
        Ok(cats) => no_store_response(json_response(200, json!({ "categories": cats }))),
        Err(()) => err(500, "Internal server error"),
    }
}

async fn fetch_categories(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = cd
        .rest_url(
            "time_tracking_categories",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "name".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

/// Resolves a workspace slug (personal/internal/handle/UUID) to a UUID.
async fn normalize_ws_id(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw: &str,
    user_id: &str,
    token: &str,
) -> Result<Option<String>, ()> {
    let t = raw.trim();
    if t.is_empty() {
        return Ok(None);
    }
    if t.eq_ignore_ascii_case(INTERNAL_SLUG) {
        return Ok(Some(ROOT_WS_ID.to_owned()));
    }
    if t.eq_ignore_ascii_case(PERSONAL_SLUG) {
        return personal_ws_id(cd, outbound, user_id, token).await.map(Some);
    }
    if is_uuid(t) {
        return Ok(Some(t.to_owned()));
    }
    let handle = t.to_lowercase();
    if is_handle(&handle) {
        if let Some(id) = ws_by_handle(cd, outbound, &handle, Some(token)).await? {
            return Ok(Some(id));
        }
        if let Some(id) = ws_by_handle(cd, outbound, &handle, None).await? {
            return Ok(Some(id));
        }
        return Ok(Some(handle));
    }
    Ok(None)
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
    let resp = caller_get(cd, outbound, &url, token).await?;
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

/// Looks up a workspace by handle using the caller token (when `Some`) or
/// service role (when `None`).
async fn ws_by_handle(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    caller_token: Option<&str>,
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
    let resp = match caller_token {
        Some(t) => caller_get(cd, outbound, &url, t).await?,
        None => svc_get(cd, outbound, &url).await?,
    };
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

async fn verify_member(
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
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<MemberRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|r| r.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn caller_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    token: &str,
) -> Result<OutboundResponse, ()> {
    let svc = cd.service_role_key().ok_or(())?;
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {token}"))
                .with_header("apikey", svc),
        )
        .await
        .map_err(|_| ())
}

async fn svc_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let svc = cd.service_role_key().ok_or(())?;
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {svc}"))
                .with_header("apikey", svc),
        )
        .await
        .map_err(|_| ())
}

fn is_uuid(v: &str) -> bool {
    v.len() == 36
        && v.chars().enumerate().all(|(i, ch)| match i {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn is_handle(v: &str) -> bool {
    let len = v.len();
    if len == 0 || len > 64 {
        return false;
    }
    v.chars().enumerate().all(|(i, ch)| {
        let edge = i == 0 || i + 1 == len;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!edge && matches!(ch, '_' | '-'))
    })
}

fn err(status: u16, msg: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": msg })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/abc-123/time-tracking/categories"),
            Some("abc-123")
        );
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/uuid-here/time-tracking/categories"),
            Some("uuid-here")
        );
    }

    #[test]
    fn path_guard_rejects_invalid_paths() {
        assert_eq!(
            extract_ws_id("/api/v1/workspaces//time-tracking/categories"),
            None
        );
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/a/b/time-tracking/categories"),
            None
        );
        assert_eq!(extract_ws_id("/api/v1/workspaces/abc"), None);
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/abc/time-tracking/categories/extra"),
            None
        );
        assert_eq!(extract_ws_id("/totally/unrelated"), None);
    }

    #[test]
    fn uuid_check() {
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(!is_uuid("personal"));
        assert!(!is_uuid(""));
    }

    #[test]
    fn handle_check() {
        assert!(is_handle("my-ws"));
        assert!(is_handle("ws_1"));
        assert!(!is_handle("-bad"));
        assert!(!is_handle("bad-"));
        assert!(!is_handle(""));
    }

    #[test]
    fn error_response_shapes_body() {
        let resp = err(403, "Workspace access denied");
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "error": "Workspace access denied" }));
    }
}
