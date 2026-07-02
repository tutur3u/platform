//! Handler for `GET /api/v1/live/session`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/live/session/route.ts`.
//!
//! Only the GET method is migrated. POST and DELETE fall through to the
//! still-active Next.js route (this handler returns `None` for them).
//!
//! ## GET behaviour
//!
//! Query parameters:
//!
//! - `wsId` — workspace UUID (or `personal` / a handle slug)
//! - `scopeKey` — one of the fixed keys (`mira:default`,
//!   `assistant:web-dashboard`) or a dynamic key of the form
//!   `assistant:<chat-uuid>`
//!
//! Auth flow:
//!
//! 1. Extract the caller's Supabase access token (Bearer or cookie).
//! 2. Resolve the user ID via the Supabase Auth `/user` endpoint.
//! 3. Normalize the workspace ID (UUID pass-through, `personal` → lookup,
//!    handle slug → lookup).
//! 4. Verify the caller is a `MEMBER` of the workspace
//!    (`workspace_members` table, caller access token / RLS).
//! 5. If the scope is `assistant:<chat-uuid>`, verify the caller owns the
//!    chat (`ai_chats` table, caller access token / RLS).
//! 6. Query `live_api_sessions` for a non-expired row matching
//!    `user_id`, `ws_id`, and `scope_key`.
//! 7. Return `{ "sessionHandle": "<handle>" }` or `{ "sessionHandle": null }`.
//!
//! ## Behavior gaps vs. legacy
//!
//! - The legacy `normalizeWorkspaceId` resolves workspace *handles* via both
//!   a caller-token RLS pass and a service-role admin pass. This handler
//!   replicates that logic locally. Workspaces with handles that are not
//!   directly reachable via either path will fall through and be used verbatim
//!   (likely returning a 403 from the membership check), matching the legacy
//!   throw → 404 path.
//! - The `live_api_sessions` table is queried with the service-role key (rows
//!   are still scoped to `user_id = <authenticated user>`), whereas the legacy
//!   route uses the caller-session Supabase client (RLS). Functional results
//!   are identical given the explicit filter.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ─── Constants ───────────────────────────────────────────────────────────────

const LIVE_SESSION_PATH: &str = "/api/v1/live/session";
const MIRA_LIVE_SCOPE_KEY: &str = "mira:default";
const WEB_ASSISTANT_LIVE_SCOPE_KEY: &str = "assistant:web-dashboard";
const ASSISTANT_CHAT_SCOPE_PREFIX: &str = "assistant:";
const LIVE_SESSION_SCOPE_KEY_MAX_LENGTH: usize = 80;
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// ─── Data types ──────────────────────────────────────────────────────────────

/// Validated live-session scope key.
#[derive(Debug)]
enum ValidScopeKey<'a> {
    /// One of the pre-defined fixed scopes (no extra ownership check needed).
    Fixed,
    /// A dynamic assistant chat scope — the caller must own the chat.
    AssistantChat { chat_id: &'a str },
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
struct LiveApiSessionRow {
    session_handle: Option<String>,
}

// ─── Public handler ───────────────────────────────────────────────────────────

pub(crate) async fn handle_live_session_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != LIVE_SESSION_PATH {
        return None;
    }

    // GET only; all other methods fall through to Next.js.
    Some(match request.method {
        "GET" => live_session_get_response(config, request, outbound).await,
        _ => return None,
    })
}

// ─── GET implementation ───────────────────────────────────────────────────────

async fn live_session_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Parse query params.
    let ws_id_raw = match query_param(request.url, "wsId") {
        Some(v) => v,
        None => {
            return error_response(400, "Missing wsId or scopeKey parameter");
        }
    };
    let scope_key_str = match query_param(request.url, "scopeKey") {
        Some(v) => v,
        None => {
            return error_response(400, "Missing wsId or scopeKey parameter");
        }
    };

    // 2. Validate scope key.
    let scope = match validate_scope_key(&scope_key_str) {
        Some(s) => s,
        None => {
            return error_response(400, "Invalid scopeKey");
        }
    };

    // 3. Authenticate caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    if !config.contact_data.configured() {
        return null_session_handle_response();
    }

    // 4. Normalize workspace ID.
    let ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        &ws_id_raw,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(id)) => id,
        Ok(None) | Err(()) => {
            return error_response(404, "Workspace not found");
        }
    };

    // 5. Verify workspace membership (MEMBER type, caller token / RLS).
    match verify_workspace_membership(
        &config.contact_data,
        outbound,
        &ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(MembershipResult::Member) => {}
        Ok(MembershipResult::NotMember) => {
            return error_response(403, "You are not a member of this workspace");
        }
        Ok(MembershipResult::LookupFailed) | Err(()) => {
            return error_response(500, "Failed to verify workspace access");
        }
    }

    // 6. Verify scope ownership (only for assistant-chat scopes).
    if let ValidScopeKey::AssistantChat { chat_id } = scope {
        match verify_chat_ownership(
            &config.contact_data,
            outbound,
            chat_id,
            &user_id,
            &access_token,
        )
        .await
        {
            Ok(true) => {}
            Ok(false) => {
                // Chat not found or not owned by the caller.
                return error_response(403, "Invalid scopeKey");
            }
            Err(()) => {
                return error_response(500, "Failed to verify live session scope");
            }
        }
    }

    // 7. Fetch stored session handle.
    fetch_session_handle_response(
        &config.contact_data,
        outbound,
        &user_id,
        &ws_id,
        &scope_key_str,
    )
    .await
}

// ─── Scope key validation ─────────────────────────────────────────────────────

fn validate_scope_key(key: &str) -> Option<ValidScopeKey<'_>> {
    if key.is_empty() || key.len() > LIVE_SESSION_SCOPE_KEY_MAX_LENGTH {
        return None;
    }

    if key == MIRA_LIVE_SCOPE_KEY || key == WEB_ASSISTANT_LIVE_SCOPE_KEY {
        return Some(ValidScopeKey::Fixed);
    }

    let chat_id = key.strip_prefix(ASSISTANT_CHAT_SCOPE_PREFIX)?;
    if is_valid_uuid(chat_id) {
        Some(ValidScopeKey::AssistantChat { chat_id })
    } else {
        None
    }
}

/// Validates that `value` is a lowercase UUID in the standard
/// `8-4-4-4-12` hex pattern (case-insensitive per the TypeScript original).
fn is_valid_uuid(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }
    value.chars().enumerate().all(|(i, c)| match i {
        8 | 13 | 18 | 23 => c == '-',
        _ => c.is_ascii_hexdigit(),
    })
}

// ─── Workspace ID normalization ───────────────────────────────────────────────

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    // 'internal' is an alias for the root workspace.
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    // If it looks like a UUID already, use it verbatim.
    if is_valid_uuid(resolved.trim()) {
        return Ok(Some(resolved));
    }

    // Handle slug lookup — try caller token first, then service role.
    let handle = raw_ws_id.trim().to_lowercase();
    if let Some(id) =
        workspace_id_by_handle(contact_data, outbound, &handle, false, access_token).await?
    {
        return Ok(Some(id));
    }
    if let Some(id) =
        workspace_id_by_handle(contact_data, outbound, &handle, true, access_token).await?
    {
        return Ok(Some(id));
    }

    // Fall back to the resolved identifier verbatim (may fail membership check).
    Ok(Some(resolved))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
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
    let response = send_get_request(contact_data, outbound, &url, false, access_token).await?;

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

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    use_service_role: bool,
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
    let response =
        send_get_request(contact_data, outbound, &url, use_service_role, access_token).await?;

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

// ─── Workspace membership ─────────────────────────────────────────────────────

enum MembershipResult {
    Member,
    NotMember,
    LookupFailed,
}

async fn verify_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<MembershipResult, ()> {
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

    let response = send_get_request(contact_data, outbound, &url, false, access_token).await?;

    if !(200..300).contains(&response.status) {
        // A non-2xx from the membership table means the lookup failed (e.g. RLS
        // error or network problem) — treat as 500 on the outer path.
        return Ok(MembershipResult::LookupFailed);
    }

    let rows = response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?;

    match rows.into_iter().next() {
        None => Ok(MembershipResult::NotMember),
        Some(row) => {
            let mtype = row.membership_type.unwrap_or_default();
            // Legacy default requiredType is 'MEMBER'; only that type passes.
            if mtype == "MEMBER" {
                Ok(MembershipResult::Member)
            } else {
                Ok(MembershipResult::NotMember)
            }
        }
    }
}

// ─── Chat ownership verification ──────────────────────────────────────────────

async fn verify_chat_ownership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    chat_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "ai_chats",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{chat_id}")),
                ("creator_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_get_request(contact_data, outbound, &url, false, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(!rows.is_empty())
}

// ─── Session handle fetch ─────────────────────────────────────────────────────

async fn fetch_session_handle_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    ws_id: &str,
    scope_key: &str,
) -> BackendResponse {
    // Use service-role key; rows are still scoped to the authenticated user via
    // the explicit user_id filter (mirroring legacy behaviour of selecting only
    // non-expired rows owned by the caller).
    let url = match contact_data.rest_url(
        "live_api_sessions",
        &[
            ("select", "session_handle,expires_at".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("scope_key", format!("eq.{scope_key}")),
            ("expires_at", "gt.now()".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) {
        Some(u) => u,
        None => return null_session_handle_response(),
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return null_session_handle_response(),
    };
    let bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return null_session_handle_response(),
    };

    if !(200..300).contains(&response.status) {
        return null_session_handle_response();
    }

    let session_handle = response
        .json::<Vec<LiveApiSessionRow>>()
        .ok()
        .and_then(|rows| rows.into_iter().next())
        .and_then(|row| row.session_handle)
        .filter(|h| !h.is_empty());

    no_store_response(json_response(
        200,
        json!({ "sessionHandle": session_handle }),
    ))
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/// Sends an authenticated GET request.  When `use_service_role` is true the
/// service-role key is used as the Bearer token; otherwise the caller's
/// `access_token` is used.
async fn send_get_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    use_service_role: bool,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let token = if use_service_role {
        service_role_key
    } else {
        access_token
    };
    let bearer = format!("Bearer {token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ─── URL query param helper ───────────────────────────────────────────────────

fn query_param(url: Option<&str>, key: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        if k == key {
            let decoded = url::form_urlencoded::parse(format!("{k}={v}").as_bytes())
                .next()
                .map(|(_, val)| val.into_owned())
                .unwrap_or_default();
            if decoded.is_empty() {
                return None;
            }
            return Some(decoded);
        }
    }
    None
}

// ─── Response helpers ─────────────────────────────────────────────────────────

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn null_session_handle_response() -> BackendResponse {
    no_store_response(json_response(200, json!({ "sessionHandle": null })))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_valid_uuid ────────────────────────────────────────────────────────

    #[test]
    fn valid_uuid_accepted() {
        assert!(is_valid_uuid("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_valid_uuid("00000000-0000-0000-0000-000000000000"));
    }

    #[test]
    fn invalid_uuid_rejected() {
        assert!(!is_valid_uuid("not-a-uuid"));
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-44665544000")); // 35 chars
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-4466554400000")); // 37 chars
        assert!(!is_valid_uuid("550e8400xe29b-41d4-a716-446655440000")); // wrong separator
    }

    // ── validate_scope_key ───────────────────────────────────────────────────

    #[test]
    fn fixed_scope_keys_are_valid() {
        assert!(matches!(
            validate_scope_key(MIRA_LIVE_SCOPE_KEY),
            Some(ValidScopeKey::Fixed)
        ));
        assert!(matches!(
            validate_scope_key(WEB_ASSISTANT_LIVE_SCOPE_KEY),
            Some(ValidScopeKey::Fixed)
        ));
    }

    #[test]
    fn assistant_chat_scope_with_valid_uuid_accepted() {
        let key = "assistant:550e8400-e29b-41d4-a716-446655440000";
        match validate_scope_key(key) {
            Some(ValidScopeKey::AssistantChat { chat_id }) => {
                assert_eq!(chat_id, "550e8400-e29b-41d4-a716-446655440000");
            }
            other => panic!("expected AssistantChat, got {other:?}"),
        }
    }

    #[test]
    fn assistant_prefix_without_valid_uuid_rejected() {
        assert!(validate_scope_key("assistant:not-a-uuid").is_none());
        assert!(validate_scope_key("assistant:").is_none());
    }

    #[test]
    fn empty_scope_key_rejected() {
        assert!(validate_scope_key("").is_none());
    }

    #[test]
    fn scope_key_exceeding_max_length_rejected() {
        let long_key = "a".repeat(LIVE_SESSION_SCOPE_KEY_MAX_LENGTH + 1);
        assert!(validate_scope_key(&long_key).is_none());
    }

    #[test]
    fn unknown_fixed_key_rejected() {
        assert!(validate_scope_key("mira:other").is_none());
        assert!(validate_scope_key("arbitrary:key").is_none());
    }

    // ── query_param ──────────────────────────────────────────────────────────

    #[test]
    fn query_param_extracted_from_url() {
        let url = "https://example.com/api/v1/live/session?wsId=abc123&scopeKey=mira%3Adefault";
        assert_eq!(query_param(Some(url), "wsId"), Some("abc123".to_owned()));
        assert_eq!(
            query_param(Some(url), "scopeKey"),
            Some("mira:default".to_owned())
        );
    }

    #[test]
    fn query_param_absent_returns_none() {
        let url = "https://example.com/api/v1/live/session?wsId=abc";
        assert!(query_param(Some(url), "scopeKey").is_none());
    }

    #[test]
    fn query_param_with_no_url_returns_none() {
        assert!(query_param(None, "wsId").is_none());
    }

    // ── path guard ───────────────────────────────────────────────────────────

    #[test]
    fn path_guard_exact_match_only() {
        assert_eq!(LIVE_SESSION_PATH, "/api/v1/live/session");
        // Ensure sub-paths would not accidentally match an `==` comparison.
        assert!("/api/v1/live/session/extra" != LIVE_SESSION_PATH);
        assert!("/api/v1/live" != LIVE_SESSION_PATH);
    }
}
