//! Handler for `GET /api/v1/integrations/discord/members`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/integrations/discord/members/route.ts`.
//!
//! The legacy route also exposes `POST` (link a Discord member) and `DELETE`
//! (unlink a Discord member). Only `GET` is migrated here; for every other
//! method this handler returns `None` so the worker falls through to the
//! still-live Next.js route.
//!
//! The legacy GET flow is:
//!   1. `getCurrentUser()` -> `401 { message: "Unauthorized" }` if no session.
//!   2. require `wsId` and `discordGuildId` query params ->
//!      `400 { message: "Missing required parameters" }`.
//!   3. read `platform_user_roles.allow_discord_integrations` for the user ->
//!      `403 { message: "Discord integration not allowed for this user" }` when
//!      falsy.
//!   4. `verifyWorkspaceMembershipType` (default `MEMBER`) ->
//!      `500 { message: "Failed to verify workspace access" }` on a lookup error,
//!      `403 { message: "Access denied to workspace" }` when not a member.
//!   5. verify the Discord integration belongs to the workspace ->
//!      `404 { message: "Discord integration not found" }` when missing.
//!   6. read `discord_guild_members` (with the `platform_user_id` user join)
//!      ordered by `created_at desc` -> `200 { data: <rows> }`; an upstream read
//!      error yields `500 { message: "Failed to fetch guild members" }`.
//!      Any thrown error yields `500 { message: "Internal server error" }`.
//!
//! Auth/data access mirror the sibling
//! `integrations_discord_available_members.rs`: the caller's Supabase access
//! token is resolved from the request and forwarded on every REST read (RLS
//! active), matching the legacy session-scoped `createClient()` behaviour. The
//! legacy route sets no explicit cache headers; reads are returned `no-store`.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MEMBERS_PATH: &str = "/api/v1/integrations/discord/members";

const MISSING_PARAMETERS_MESSAGE: &str = "Missing required parameters";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const DISCORD_NOT_ALLOWED_MESSAGE: &str = "Discord integration not allowed for this user";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";
const INTEGRATION_NOT_FOUND_MESSAGE: &str = "Discord integration not found";
const FETCH_MEMBERS_FAILED_MESSAGE: &str = "Failed to fetch guild members";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct PlatformUserRoleRow {
    allow_discord_integrations: Option<bool>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct IntegrationRow {
    #[allow(dead_code)]
    id: Option<Value>,
}

pub(crate) async fn handle_integrations_discord_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MEMBERS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => members_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate the session user (legacy `getCurrentUser`).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // 2. Require the query params (legacy checks these after auth).
    let query = parse_query(request.url);
    let ws_id = query.ws_id.as_deref().unwrap_or("");
    let discord_guild_id = query.discord_guild_id.as_deref().unwrap_or("");

    if ws_id.is_empty() || discord_guild_id.is_empty() {
        return message_response(400, MISSING_PARAMETERS_MESSAGE);
    }

    // 3. Check the platform-level Discord integration permission.
    match platform_discord_allowed(contact_data, outbound, &user_id, &access_token).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, DISCORD_NOT_ALLOWED_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    }

    // 4. Check workspace membership (default required type is MEMBER).
    match verify_workspace_member(contact_data, outbound, ws_id, &user_id, &access_token).await {
        Ok(MembershipState::Member) => {}
        Ok(MembershipState::NotMember) => return message_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // 5. Verify the Discord integration belongs to the workspace.
    match integration_exists(
        contact_data,
        outbound,
        ws_id,
        discord_guild_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(404, INTEGRATION_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    }

    // 6. Fetch the Discord guild members for this guild.
    match guild_members(contact_data, outbound, discord_guild_id, &access_token).await {
        Ok(members) => no_store_response(json_response(200, json!({ "data": members }))),
        Err(()) => message_response(500, FETCH_MEMBERS_FAILED_MESSAGE),
    }
}

async fn platform_discord_allowed(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "platform_user_roles",
        &[
            ("select", "allow_discord_integrations".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<PlatformUserRoleRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.allow_discord_integrations)
        .unwrap_or(false))
}

enum MembershipState {
    Member,
    NotMember,
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<MembershipState, ()> {
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();

    match membership {
        Some(row) if row.membership_type.as_deref() == Some("MEMBER") => {
            Ok(MembershipState::Member)
        }
        _ => Ok(MembershipState::NotMember),
    }
}

async fn integration_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    discord_guild_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "discord_integrations",
        &[
            ("select", "id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("discord_guild_id", format!("eq.{discord_guild_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<IntegrationRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn guild_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    discord_guild_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    // Mirror the legacy `select('*, users:platform_user_id (id, display_name,
    // avatar_url, handle)')` with `order('created_at', { ascending: false })`.
    let Some(url) = contact_data.rest_url(
        "discord_guild_members",
        &[
            (
                "select",
                "*,users:platform_user_id(id,display_name,avatar_url,handle)".to_owned(),
            ),
            ("discord_guild_id", format!("eq.{discord_guild_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

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

struct MembersQuery {
    ws_id: Option<String>,
    discord_guild_id: Option<String>,
}

fn parse_query(request_url: Option<&str>) -> MembersQuery {
    let mut ws_id = None;
    let mut discord_guild_id = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "wsId" if ws_id.is_none() => ws_id = Some(value.into_owned()),
                "discordGuildId" if discord_guild_id.is_none() => {
                    discord_guild_id = Some(value.into_owned());
                }
                _ => {}
            }
        }
    }

    MembersQuery {
        ws_id,
        discord_guild_id,
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_query_extracts_both_params() {
        let query = parse_query(Some(
            "https://app.tuturuuu.com/api/v1/integrations/discord/members?wsId=ws-1&discordGuildId=guild-9",
        ));
        assert_eq!(query.ws_id.as_deref(), Some("ws-1"));
        assert_eq!(query.discord_guild_id.as_deref(), Some("guild-9"));
    }

    #[test]
    fn parse_query_missing_params_are_none() {
        let query = parse_query(Some(
            "https://app.tuturuuu.com/api/v1/integrations/discord/members",
        ));
        assert!(query.ws_id.is_none());
        assert!(query.discord_guild_id.is_none());
    }

    #[test]
    fn parse_query_handles_invalid_url() {
        let query = parse_query(Some("not a url"));
        assert!(query.ws_id.is_none());
        assert!(query.discord_guild_id.is_none());

        let query = parse_query(None);
        assert!(query.ws_id.is_none());
        assert!(query.discord_guild_id.is_none());
    }

    #[test]
    fn parse_query_uses_first_occurrence() {
        let query = parse_query(Some(
            "https://app.tuturuuu.com/x?wsId=first&wsId=second&discordGuildId=g1",
        ));
        assert_eq!(query.ws_id.as_deref(), Some("first"));
        assert_eq!(query.discord_guild_id.as_deref(), Some("g1"));
    }

    #[test]
    fn path_guard_matches_exact_mount() {
        assert_eq!(MEMBERS_PATH, "/api/v1/integrations/discord/members");
    }

    #[test]
    fn message_response_shapes_message_payload() {
        let response = message_response(404, INTEGRATION_NOT_FOUND_MESSAGE);
        assert_eq!(response.status, 404);
    }
}
