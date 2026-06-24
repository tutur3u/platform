use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const ROLE_NOT_FOUND_MESSAGE: &str = "Role not found";
const ERROR_FETCHING_MESSAGE: &str = "Error fetching role members";

#[derive(Deserialize)]
struct RoleIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct RawUserPrivateDetails {
    email: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PrivateDetails {
    One(RawUserPrivateDetails),
    Many(Vec<RawUserPrivateDetails>),
}

#[derive(Deserialize)]
struct RawRoleMemberUser {
    id: Option<String>,
    display_name: Option<String>,
    #[serde(default)]
    full_name: Option<String>,
    avatar_url: Option<String>,
    #[serde(default)]
    user_private_details: Option<PrivateDetails>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum RoleMemberUsers {
    One(Box<RawRoleMemberUser>),
    Many(Vec<RawRoleMemberUser>),
}

#[derive(Deserialize)]
struct RawRoleMemberRecord {
    user_id: String,
    #[serde(default)]
    users: Option<RoleMemberUsers>,
}

#[derive(Serialize)]
struct NormalizedRoleMember {
    id: String,
    display_name: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
}

pub(crate) async fn handle_workspaces_roles_roleid_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, role_id) = parse_role_members_path(request.path)?;

    Some(match request.method {
        "GET" => role_members_response(config, request, ws_id, role_id, outbound).await,
        // Other methods (e.g. POST) are NOT migrated yet; fall through to the
        // still-active Next.js route by returning None.
        _ => return None,
    })
}

async fn role_members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    role_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Verify the caller is authenticated (mirrors createClient() session).
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // 1. Confirm the role exists and belongs to this workspace (RLS-scoped via
    //    the caller's access token, matching the legacy .single() lookup).
    match role_exists(
        &config.contact_data,
        outbound,
        ws_id,
        role_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(404, ROLE_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(404, ROLE_NOT_FOUND_MESSAGE),
    }

    // 2. Fetch role members with embedded user + private email details.
    let (rows, count) =
        match role_members(&config.contact_data, outbound, role_id, &access_token).await {
            Ok(value) => value,
            Err(()) => return message_response(500, ERROR_FETCHING_MESSAGE),
        };

    let members: Vec<NormalizedRoleMember> = rows
        .into_iter()
        .map(normalize_role_member)
        .filter(|member| !member.id.is_empty())
        .collect();

    let resolved_count = count.unwrap_or(members.len());

    no_store_response(json_response(
        200,
        json!({ "data": members, "count": resolved_count }),
    ))
}

fn normalize_role_member(record: RawRoleMemberRecord) -> NormalizedRoleMember {
    let user = record.users.and_then(|users| match users {
        RoleMemberUsers::One(user) => Some(*user),
        RoleMemberUsers::Many(mut many) => {
            if many.is_empty() {
                None
            } else {
                Some(many.swap_remove(0))
            }
        }
    });

    let email = user.as_ref().and_then(|user| {
        user.user_private_details
            .as_ref()
            .and_then(|details| match details {
                PrivateDetails::One(detail) => detail.email.clone(),
                PrivateDetails::Many(many) => many.first().and_then(|detail| detail.email.clone()),
            })
    });

    let id = user
        .as_ref()
        .and_then(|user| user.id.clone())
        .unwrap_or(record.user_id);

    NormalizedRoleMember {
        id,
        display_name: user.as_ref().and_then(|user| user.display_name.clone()),
        full_name: user.as_ref().and_then(|user| user.full_name.clone()),
        avatar_url: user.as_ref().and_then(|user| user.avatar_url.clone()),
        email,
    }
}

async fn role_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_roles",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{role_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response =
        send_caller_rest_request(contact_data, outbound, &url, access_token, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RoleIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .is_some())
}

async fn role_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_id: &str,
    access_token: &str,
) -> Result<(Vec<RawRoleMemberRecord>, Option<usize>), ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "user_id, users:user_id(id, display_name, avatar_url, user_private_details(email))"
                    .to_owned(),
            ),
            ("role_id", format!("eq.{role_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(
        contact_data,
        outbound,
        &url,
        access_token,
        Some("count=exact"),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = response
        .header("content-range")
        .and_then(parse_content_range_count);

    let rows = response
        .json::<Vec<RawRoleMemberRecord>>()
        .map_err(|_| ())?;

    Ok((rows, count))
}

fn parse_content_range_count(content_range: &str) -> Option<usize> {
    // PostgREST returns e.g. "0-9/42" or "*/42"; the total follows the slash.
    content_range
        .rsplit('/')
        .next()
        .and_then(|total| total.trim().parse::<usize>().ok())
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
    prefer: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(prefer) = prefer {
        outbound_request = outbound_request.with_header("Prefer", prefer);
    }

    outbound.send(outbound_request).await.map_err(|_| ())
}

fn parse_role_members_path(path: &str) -> Option<(&str, &str)> {
    let trimmed = path.trim_matches('/');
    let segments: Vec<&str> = trimmed
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "roles"
        && !segments[5].is_empty()
        && segments[6] == "members"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
