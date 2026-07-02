//! Handler for `GET /api/workspaces/:wsId/invite-links`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/invite-links/route.ts` (GET only).
//!
//! ## Auth model
//!
//! The legacy GET handler:
//!
//! 1. Resolves the caller's Supabase session user (`resolveAuthenticatedSessionUser`).
//! 2. Verifies the caller is a workspace member (`verifyWorkspaceMembershipType`).
//! 3. Reads `workspace_invite_links_with_stats` ordered by `created_at` descending.
//!
//! This handler reproduces that path using Supabase Bearer-token auth:
//!
//! - Missing or invalid session   -> `401 { "error": "Unauthorized" }`
//! - Membership DB error          -> `500 { "error": "Failed to verify workspace membership" }`
//! - Caller not a workspace member -> `403 { "error": "You are not a member of this workspace" }`
//! - Upstream data error          -> `500 { "error": "Failed to fetch invite links" }`
//! - Success                      -> `200 [...]` (array, empty when no rows)
//!
//! ## Behavior gaps vs. legacy
//!
//! - **POST returns `None`**: the still-live Next.js route handles POST (and
//!   all other non-GET methods).
//! - **No workspace-ID alias resolution**: the legacy handler passes `wsId`
//!   verbatim to the Supabase query; this handler does the same. Callers must
//!   supply a UUID, not a slug alias such as `personal`.
//! - **Data read uses service-role key**: the legacy route reads via the
//!   caller's session (RLS active). This handler uses the service-role key
//!   after independently verifying membership, which is functionally
//!   equivalent for a simple `ws_id` equality filter.

use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/workspaces/";
const PATH_SUFFIX: &str = "/invite-links";

pub(crate) async fn handle_workspaces_wsid_invite_links_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = invite_links_ws_id(request.path)?;

    Some(match request.method {
        "GET" => invite_links_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn invite_links_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return error_response(500, "Failed to fetch invite links");
    }

    // Step 1: resolve authenticated user from Bearer session token.
    let access_token = match supabase_auth::request_access_token(request) {
        Some(token) => token,
        None => return error_response(401, "Unauthorized"),
    };

    let user = match supabase_auth::fetch_supabase_auth_user(
        &config.contact_data,
        &access_token,
        outbound,
    )
    .await
    {
        Some(user) => user,
        None => return error_response(401, "Unauthorized"),
    };

    let user_id = match user.id.filter(|id| !id.trim().is_empty()) {
        Some(id) => id,
        None => return error_response(401, "Unauthorized"),
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

    // Step 3: fetch invite links.
    match fetch_invite_links(&config.contact_data, outbound, raw_ws_id).await {
        Ok(links) => no_store_response(json_response(200, links)),
        Err(()) => error_response(500, "Failed to fetch invite links"),
    }
}

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

    // Any non-empty JSON array means the user is a member.
    match response.json::<Vec<serde_json::Value>>() {
        Ok(rows) if !rows.is_empty() => MembershipResult::Ok,
        Ok(_) => MembershipResult::NotMember,
        Err(_) => MembershipResult::LookupFailed,
    }
}

async fn fetch_invite_links(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<serde_json::Value, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;

    let url = contact_data
        .rest_url(
            "workspace_invite_links_with_stats",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.desc".to_owned()),
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

    // Return the raw array; fall back to an empty array on parse failure to
    // mirror the legacy `inviteLinks || []` fallback.
    Ok(response
        .json::<serde_json::Value>()
        .unwrap_or(serde_json::Value::Array(Vec::new())))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn invite_links_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_valid_uuid_path() {
        let ws_id = "11111111-1111-4111-8111-111111111111";
        let path = format!("/api/workspaces/{ws_id}/invite-links");
        assert_eq!(invite_links_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn path_guard_rejects_wrong_prefix() {
        let path = "/api/v1/workspaces/some-id/invite-links";
        assert_eq!(invite_links_ws_id(path), None);
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        let path = "/api/workspaces/some-id/invite-links/extra";
        assert_eq!(invite_links_ws_id(path), None);
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        let path = "/api/workspaces//invite-links";
        assert_eq!(invite_links_ws_id(path), None);
    }

    #[test]
    fn path_guard_rejects_slash_in_ws_id() {
        let path = "/api/workspaces/a/b/invite-links";
        assert_eq!(invite_links_ws_id(path), None);
    }

    #[test]
    fn path_guard_extracts_short_slug() {
        let path = "/api/workspaces/my-workspace/invite-links";
        assert_eq!(invite_links_ws_id(path), Some("my-workspace"));
    }
}
