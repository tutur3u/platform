use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const AVAILABLE_MEMBERS_PATH: &str = "/api/v1/integrations/discord/available-members";

const MISSING_PARAMETERS_MESSAGE: &str = "Missing required parameters";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const DISCORD_NOT_ALLOWED_MESSAGE: &str = "Discord integration not allowed for this user";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";
const INTEGRATION_NOT_FOUND_MESSAGE: &str = "Discord integration not found";
const FETCH_MEMBERS_FAILED_MESSAGE: &str = "Failed to fetch available members";
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

#[derive(Deserialize)]
struct LinkedMemberRow {
    platform_user_id: Option<String>,
}

pub(crate) async fn handle_integrations_discord_available_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AVAILABLE_MEMBERS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => available_members_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn available_members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = parse_query(request.url);
    let ws_id = query.ws_id.as_deref().unwrap_or("");
    let discord_guild_id = query.discord_guild_id.as_deref().unwrap_or("");
    let search = query.query.as_deref().unwrap_or("");

    if ws_id.is_empty() || discord_guild_id.is_empty() {
        return message_response(400, MISSING_PARAMETERS_MESSAGE);
    }

    let contact_data = &config.contact_data;

    // Authenticate the session user.
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

    // Check if user has Discord integration permission.
    match platform_discord_allowed(contact_data, outbound, &user_id, &access_token).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, DISCORD_NOT_ALLOWED_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    }

    // Check workspace membership (requires MEMBER type).
    match verify_workspace_member(contact_data, outbound, ws_id, &user_id, &access_token).await {
        Ok(MembershipState::Member) => {}
        Ok(MembershipState::NotMember) => return message_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Verify the Discord integration belongs to the workspace.
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

    // Get the user IDs already linked to this Discord guild.
    let linked_user_ids =
        match linked_user_ids(contact_data, outbound, discord_guild_id, &access_token).await {
            Ok(ids) => ids,
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // Fetch available workspace members.
    match available_members(
        contact_data,
        outbound,
        ws_id,
        search,
        &linked_user_ids,
        &access_token,
    )
    .await
    {
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

async fn linked_user_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    discord_guild_id: &str,
    access_token: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "discord_guild_members",
        &[
            ("select", "platform_user_id".to_owned()),
            ("discord_guild_id", format!("eq.{discord_guild_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LinkedMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.platform_user_id)
        .collect())
}

async fn available_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    search: &str,
    linked_user_ids: &[String],
    access_token: &str,
) -> Result<Value, ()> {
    let mut params: Vec<(&str, String)> = vec![
        (
            "select",
            "user_id,created_at,users:user_id(id,display_name,avatar_url,handle)".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", "20".to_owned()),
    ];

    // Exclude already-linked members if any exist.
    if !linked_user_ids.is_empty() {
        params.push(("user_id", format!("not.in.({})", linked_user_ids.join(","))));
    }

    // Add search filter if query is provided.
    let trimmed = search.trim();
    if !trimmed.is_empty() {
        params.push((
            "or",
            format!("(users.display_name.ilike.%{trimmed}%,users.handle.ilike.%{trimmed}%)"),
        ));
    }

    let Some(url) = contact_data.rest_url("workspace_members", &params) else {
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

struct AvailableMembersQuery {
    ws_id: Option<String>,
    discord_guild_id: Option<String>,
    query: Option<String>,
}

fn parse_query(request_url: Option<&str>) -> AvailableMembersQuery {
    let mut ws_id = None;
    let mut discord_guild_id = None;
    let mut query = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "wsId" if ws_id.is_none() => ws_id = Some(value.into_owned()),
                "discordGuildId" if discord_guild_id.is_none() => {
                    discord_guild_id = Some(value.into_owned());
                }
                "query" if query.is_none() => query = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    AvailableMembersQuery {
        ws_id,
        discord_guild_id,
        query,
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
