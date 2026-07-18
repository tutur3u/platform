//! Handler for `GET /api/workspaces/:wsId/invite-links/:linkId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/invite-links/[linkId]/route.ts`
//! (GET only; PATCH and DELETE return `None` so Next.js still handles them).
//!
//! ## Auth model
//!
//! The legacy GET handler:
//!
//! 1. Resolves the caller's Supabase session user (`resolveAuthenticatedSessionUser`).
//! 2. Verifies the caller is a workspace member (`verifyWorkspaceMembershipType`).
//! 3. Fetches a single row from `workspace_invite_links_with_stats` filtered by
//!    both `id` and `ws_id`, returns 404 when not found.
//! 4. Fetches `workspace_invite_link_uses` with embedded user rows, ordered by
//!    `joined_at` descending; ignores fetch errors (uses `[]` fallback).
//! 5. Normalizes and returns `InviteLinkDetails` (`normalizeInviteLinkDetails`).
//!
//! This handler reproduces all status codes and JSON shapes exactly:
//!
//! - Missing or invalid session      -> `401 { "error": "Unauthorized" }`
//! - Membership DB error             -> `500 { "error": "Failed to verify workspace membership" }`
//! - Caller not a workspace member   -> `403 { "error": "You are not a member of this workspace" }`
//! - Link not found or fetch error   -> `404 { "error": "Invite link not found" }`
//! - Configuration/upstream failure  -> `500 { "error": "Internal server error" }`
//! - Success                         -> `200 InviteLinkDetails`
//!
//! ## Behavior gaps vs. legacy
//!
//! - **PATCH / DELETE return `None`**: the still-live Next.js route handles those
//!   methods.
//! - **Data reads use service-role key**: the legacy route reads via the caller's
//!   session (RLS active). This handler uses the service-role key after
//!   independently verifying membership, which is functionally equivalent for
//!   equality-filtered queries.
//! - **No workspace-ID alias resolution**: callers must supply a UUID, not a slug
//!   alias such as `personal`.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/workspaces/";
const INVITE_LINKS_SEGMENT: &str = "/invite-links/";

// ── path guard ────────────────────────────────────────────────────────────────

/// Extract `(ws_id, link_id)` from `/api/workspaces/:wsId/invite-links/:linkId`.
///
/// Returns `None` when the path does not match this handler's pattern exactly,
/// including when either segment is empty or contains a `/`.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, link_id) = rest.split_once(INVITE_LINKS_SEGMENT)?;
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if link_id.is_empty() || link_id.contains('/') {
        return None;
    }
    Some((ws_id, link_id))
}

// ── entry point ───────────────────────────────────────────────────────────────

pub(crate) async fn handle_workspaces_wsid_invite_links_linkid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, raw_link_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => get_invite_link_response(config, request, raw_ws_id, raw_link_id, outbound).await,
        _ => return None,
    })
}

// ── GET handler ───────────────────────────────────────────────────────────────

async fn get_invite_link_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_link_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    // Step 1: resolve the caller from a satellite app session or a regular
    // Supabase browser session.
    let user_id = if contact::request_has_app_session_token(request) {
        contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .ok()
        .map(|identity| identity.id)
    } else {
        let access_token = supabase_auth::request_access_token(request);
        match access_token {
            Some(access_token) => supabase_auth::fetch_supabase_auth_user(
                &config.contact_data,
                &access_token,
                outbound,
            )
            .await
            .and_then(|user| user.id),
            None => None,
        }
    }
    .filter(|id| !id.trim().is_empty());
    let Some(user_id) = user_id else {
        return error_response(401, "Unauthorized");
    };

    // Step 2: verify workspace membership.
    match check_workspace_membership(&config.contact_data, outbound, raw_ws_id, &user_id).await {
        MembershipResult::Ok => {}
        MembershipResult::NotMember => {
            return error_response(403, "You are not a member of this workspace");
        }
        MembershipResult::LookupFailed => {
            return error_response(500, "Failed to verify workspace membership");
        }
    }

    // Step 3: fetch the invite link with stats.
    let link =
        match fetch_invite_link_with_stats(&config.contact_data, outbound, raw_ws_id, raw_link_id)
            .await
        {
            Ok(Some(row)) => row,
            Ok(None) => return error_response(404, "Invite link not found"),
            Err(()) => return error_response(404, "Invite link not found"),
        };

    // Step 4: fetch uses (best-effort; errors yield an empty list per legacy).
    let uses = fetch_invite_link_uses(&config.contact_data, outbound, raw_link_id)
        .await
        .unwrap_or_default();

    // Step 5: normalize and return.
    let payload = build_invite_link_details(link, uses);
    no_store_response(json_response(200, payload))
}

// ── data structs ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct InviteLinkStatsRow {
    id: Option<String>,
    ws_id: Option<String>,
    code: Option<String>,
    creator_id: Option<String>,
    max_uses: Option<i64>,
    expires_at: Option<String>,
    created_at: Option<String>,
    current_uses: Option<i64>,
    is_expired: Option<bool>,
    is_full: Option<bool>,
    member_type: Option<String>,
    #[serde(rename = "type")]
    invite_type: Option<String>,
}

#[derive(Deserialize)]
struct InviteLinkUseRow {
    id: String,
    user_id: String,
    joined_at: String,
    /// PostgREST embedded join: may be an object or a one-element array.
    users: Option<Value>,
}

// ── fetch helpers ─────────────────────────────────────────────────────────────

enum MembershipResult {
    Ok,
    NotMember,
    LookupFailed,
}

async fn check_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> MembershipResult {
    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return MembershipResult::LookupFailed,
    };

    let url = match contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "user_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) {
        Some(u) => u,
        None => return MembershipResult::LookupFailed,
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
        Err(_) => return MembershipResult::LookupFailed,
    };

    if !(200..300).contains(&response.status) {
        return MembershipResult::LookupFailed;
    }

    match response.json::<Vec<Value>>() {
        Ok(rows) if !rows.is_empty() => MembershipResult::Ok,
        Ok(_) => MembershipResult::NotMember,
        Err(_) => MembershipResult::LookupFailed,
    }
}

async fn fetch_invite_link_with_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    link_id: &str,
) -> Result<Option<InviteLinkStatsRow>, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;

    let url = contact_data
        .rest_url(
            "workspace_invite_links_with_stats",
            &[
                ("select", "*".to_owned()),
                ("id", format!("eq.{link_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let bearer = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<InviteLinkStatsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_invite_link_uses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    link_id: &str,
) -> Result<Vec<InviteLinkUseRow>, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;

    // PostgREST embedded join: `users:user_id(id,display_name,avatar_url,handle)`
    let url = contact_data
        .rest_url(
            "workspace_invite_link_uses",
            &[
                (
                    "select",
                    "id,user_id,joined_at,users:user_id(id,display_name,avatar_url,handle)"
                        .to_owned(),
                ),
                ("invite_link_id", format!("eq.{link_id}")),
                ("order", "joined_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;

    let bearer = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<InviteLinkUseRow>>().map_err(|_| ())
}

// ── pure helpers ──────────────────────────────────────────────────────────────

/// Mirror `memberTypeFromInviteStatsRow`: prefer `member_type`, fall back to
/// `type`; uppercase; default to `"MEMBER"` when absent or empty.
fn member_type_from_stats_row(row: &InviteLinkStatsRow) -> String {
    let raw = row
        .member_type
        .as_deref()
        .or(row.invite_type.as_deref())
        .unwrap_or("");
    let upper = raw.trim().to_uppercase();
    if upper.is_empty() {
        "MEMBER".to_owned()
    } else {
        upper
    }
}

/// Mirror `normalizeInviteLinkJoinedUser`: unwrap array shape, fill `id` from
/// `user_id` when the embedded user record is absent.
fn normalize_joined_user(users_value: &Option<Value>, fallback_user_id: &str) -> Value {
    let user: Option<Value> = match users_value {
        None => None,
        Some(Value::Array(arr)) => arr.first().cloned(),
        Some(obj) => Some(obj.clone()),
    };

    let get_str = |key: &str| -> Value {
        user.as_ref()
            .and_then(|u| u.get(key))
            .cloned()
            .unwrap_or(Value::Null)
    };

    let id = user
        .as_ref()
        .and_then(|u| u.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or(fallback_user_id);

    json!({
        "id": id,
        "display_name": get_str("display_name"),
        "avatar_url": get_str("avatar_url"),
        "handle": get_str("handle"),
    })
}

/// Build the `InviteLinkDetails` payload mirroring `normalizeInviteLinkDetails`.
fn build_invite_link_details(link: InviteLinkStatsRow, uses: Vec<InviteLinkUseRow>) -> Value {
    let member_type = member_type_from_stats_row(&link);

    let normalized_uses: Vec<Value> = uses
        .into_iter()
        .map(|u| {
            let user = normalize_joined_user(&u.users, &u.user_id);
            json!({
                "id": u.id,
                "user_id": u.user_id,
                "joined_at": u.joined_at,
                "user": user,
            })
        })
        .collect();

    json!({
        "id": link.id.unwrap_or_default(),
        "ws_id": link.ws_id.unwrap_or_default(),
        "code": link.code.unwrap_or_default(),
        "creator_id": link.creator_id.unwrap_or_default(),
        "max_uses": link.max_uses,
        "expires_at": link.expires_at,
        "created_at": link.created_at.unwrap_or_default(),
        "current_uses": link.current_uses.unwrap_or(0),
        "is_expired": link.is_expired.unwrap_or(false),
        "is_full": link.is_full.unwrap_or(false),
        "memberType": member_type,
        "uses": normalized_uses,
    })
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // --- extract_path_params ---

    #[test]
    fn path_guard_matches_valid_uuids() {
        let ws = "11111111-1111-4111-8111-111111111111";
        let lk = "22222222-2222-4222-8222-222222222222";
        let path = format!("/api/workspaces/{ws}/invite-links/{lk}");
        assert_eq!(extract_path_params(&path), Some((ws, lk)));
    }

    #[test]
    fn path_guard_rejects_no_link_id() {
        let path = "/api/workspaces/ws1/invite-links";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn path_guard_rejects_trailing_slash_after_link_id() {
        let path = "/api/workspaces/ws1/invite-links/link1/extra";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        let path = "/api/workspaces//invite-links/link1";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn path_guard_rejects_empty_link_id() {
        let path = "/api/workspaces/ws1/invite-links/";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn path_guard_rejects_wrong_prefix() {
        let path = "/api/v1/workspaces/ws1/invite-links/link1";
        assert!(extract_path_params(path).is_none());
    }

    // --- member_type_from_stats_row ---

    fn make_stats_row(member_type: Option<&str>, invite_type: Option<&str>) -> InviteLinkStatsRow {
        InviteLinkStatsRow {
            id: None,
            ws_id: None,
            code: None,
            creator_id: None,
            max_uses: None,
            expires_at: None,
            created_at: None,
            current_uses: None,
            is_expired: None,
            is_full: None,
            member_type: member_type.map(str::to_owned),
            invite_type: invite_type.map(str::to_owned),
        }
    }

    #[test]
    fn member_type_defaults_to_member() {
        assert_eq!(
            member_type_from_stats_row(&make_stats_row(None, None)),
            "MEMBER"
        );
    }

    #[test]
    fn member_type_uses_member_type_field() {
        assert_eq!(
            member_type_from_stats_row(&make_stats_row(Some("GUEST"), None)),
            "GUEST"
        );
    }

    #[test]
    fn member_type_falls_back_to_type_field() {
        assert_eq!(
            member_type_from_stats_row(&make_stats_row(None, Some("guest"))),
            "GUEST"
        );
    }

    #[test]
    fn member_type_prefers_member_type_over_type() {
        assert_eq!(
            member_type_from_stats_row(&make_stats_row(Some("MEMBER"), Some("GUEST"))),
            "MEMBER"
        );
    }

    // --- normalize_joined_user ---

    #[test]
    fn normalize_user_null_falls_back_to_user_id() {
        let result = normalize_joined_user(&None, "user-abc");
        assert_eq!(result["id"], json!("user-abc"));
        assert_eq!(result["display_name"], Value::Null);
    }

    #[test]
    fn normalize_user_object_shape() {
        let user =
            json!({ "id": "u1", "display_name": "Alice", "avatar_url": null, "handle": "alice" });
        let result = normalize_joined_user(&Some(user), "fallback");
        assert_eq!(result["id"], json!("u1"));
        assert_eq!(result["display_name"], json!("Alice"));
        assert_eq!(result["handle"], json!("alice"));
    }

    #[test]
    fn normalize_user_array_shape_unwraps_first() {
        let user = json!({ "id": "u2", "display_name": "Bob", "avatar_url": null, "handle": null });
        let arr = Value::Array(vec![user]);
        let result = normalize_joined_user(&Some(arr), "fallback");
        assert_eq!(result["id"], json!("u2"));
        assert_eq!(result["display_name"], json!("Bob"));
    }

    #[test]
    fn normalize_user_empty_array_falls_back_to_user_id() {
        let arr = Value::Array(vec![]);
        let result = normalize_joined_user(&Some(arr), "fallback-id");
        assert_eq!(result["id"], json!("fallback-id"));
    }

    // --- build_invite_link_details ---

    fn make_full_stats_row() -> InviteLinkStatsRow {
        InviteLinkStatsRow {
            id: Some("link-1".to_owned()),
            ws_id: Some("ws-1".to_owned()),
            code: Some("ABC123".to_owned()),
            creator_id: Some("creator-1".to_owned()),
            max_uses: Some(10),
            expires_at: None,
            created_at: Some("2024-01-01T00:00:00Z".to_owned()),
            current_uses: Some(3),
            is_expired: Some(false),
            is_full: Some(false),
            member_type: Some("MEMBER".to_owned()),
            invite_type: None,
        }
    }

    #[test]
    fn build_details_shapes_payload_correctly() {
        let row = make_full_stats_row();
        let uses: Vec<InviteLinkUseRow> = vec![];
        let payload = build_invite_link_details(row, uses);

        assert_eq!(payload["id"], json!("link-1"));
        assert_eq!(payload["ws_id"], json!("ws-1"));
        assert_eq!(payload["code"], json!("ABC123"));
        assert_eq!(payload["creator_id"], json!("creator-1"));
        assert_eq!(payload["max_uses"], json!(10));
        assert_eq!(payload["current_uses"], json!(3));
        assert_eq!(payload["is_expired"], json!(false));
        assert_eq!(payload["is_full"], json!(false));
        assert_eq!(payload["memberType"], json!("MEMBER"));
        assert_eq!(payload["uses"], json!([]));
    }
}
