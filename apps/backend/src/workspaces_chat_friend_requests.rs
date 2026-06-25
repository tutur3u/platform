use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// NOTE on path matching: this route lives at
// `/api/v1/workspaces/:wsId/chat/friend-requests`. We extract the dynamic
// `:wsId` segment by stripping the fixed prefix/suffix, mirroring the
// `workspace_habits_access_ws_id` helper in `workspace_habits_access.rs`.
const WORKSPACE_CHAT_FRIEND_REQUESTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_CHAT_FRIEND_REQUESTS_PATH_SUFFIX: &str = "/chat/friend-requests";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FAILED_TO_LOAD_FRIEND_REQUESTS_MESSAGE: &str = "Failed to load friend requests";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";

const CHAT_LIST_FRIEND_REQUESTS_RPC: &str = "chat_list_friend_requests";
const PRIVATE_SCHEMA: &str = "private";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_chat_friend_requests_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspaces_chat_friend_requests_ws_id(request.path)?;

    // Only GET is migrated; every other method must fall through to the still
    // active Next.js route (e.g. POST creates a friend request). Returning None
    // here lets the worker proxy those methods to the legacy handler instead of
    // emitting a spurious 405.
    Some(match request.method {
        "GET" => friend_requests_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn friend_requests_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    // Legacy `resolveChatRouteContext` resolves permissions via `getPermissions`
    // and rejects with 401 when the caller has no permissions for the workspace
    // (i.e. is not a member) and with 403 when the `view_chat` permission is
    // absent. The backend does not yet replicate the full RBAC permission
    // resolver, so we approximate the gate with a workspace membership check:
    // non-members get 401 (matching `permissions === null`). See notes about the
    // `view_chat` permission gap.
    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match call_chat_list_friend_requests(&config.contact_data, outbound, &resolved_ws_id, &user_id)
        .await
    {
        Ok(requests) => no_store_response(json_response(
            200,
            json!({
                "accepted": requests.accepted,
                "incoming": requests.incoming,
                "outgoing": requests.outgoing,
            }),
        )),
        Err(status) => {
            // Mirror `chatRpcErrorResponse`: surface the mapped status with a
            // generic message. We deliberately do not echo raw RPC error bodies.
            message_response(status, FAILED_TO_LOAD_FRIEND_REQUESTS_MESSAGE)
        }
    }
}

struct FriendRequests {
    accepted: serde_json::Value,
    incoming: serde_json::Value,
    outgoing: serde_json::Value,
}

async fn call_chat_list_friend_requests(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<FriendRequests, u16> {
    let Some(url) = contact_data.rpc_url(CHAT_LIST_FRIEND_REQUESTS_RPC) else {
        return Err(500);
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(500);
    };

    // The legacy route invokes the RPC through the admin client targeting the
    // `private` schema. PostgREST selects a non-public schema via the
    // Content-Profile / Accept-Profile headers.
    let body = json!({
        "p_actor_user_id": user_id,
        "p_ws_id": ws_id,
    })
    .to_string();
    let authorization = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return Err(500),
    };

    if !(200..300).contains(&response.status) {
        return Err(map_chat_rpc_error_status(&response));
    }

    let value = response.json::<serde_json::Value>().map_err(|_| 500_u16)?;

    // The RPC returns a JSON object with `accepted`/`incoming`/`outgoing`
    // arrays. Missing keys collapse to empty arrays, matching the legacy
    // `requests?.accepted ?? []` fallbacks.
    Ok(FriendRequests {
        accepted: requests_array(&value, "accepted"),
        incoming: requests_array(&value, "incoming"),
        outgoing: requests_array(&value, "outgoing"),
    })
}

fn requests_array(value: &serde_json::Value, key: &str) -> serde_json::Value {
    value
        .get(key)
        .filter(|inner| inner.is_array())
        .cloned()
        .unwrap_or_else(|| json!([]))
}

// Mirror of `getChatRpcErrorStatus` in `apps/web/src/lib/chat/private-rpc.ts`.
// PostgREST returns the Postgres error code and message in the JSON body; we map
// them to the same HTTP statuses the legacy route produced.
fn map_chat_rpc_error_status(response: &OutboundResponse) -> u16 {
    let parsed = serde_json::from_str::<serde_json::Value>(&response.body_text).ok();
    let code = parsed
        .as_ref()
        .and_then(|value| value.get("code"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let message = parsed
        .as_ref()
        .and_then(|value| value.get("message"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_lowercase();

    if code == "42501"
        || message.contains("forbidden")
        || message.contains("permission")
        || message.contains("required")
    {
        return 403;
    }

    if message.contains("not_found") || message.contains("not found") {
        return 404;
    }

    if code == "22023"
        || message.contains("invalid")
        || message.contains("empty")
        || message.contains("too_large")
        || message.contains("requires")
        || message.contains("target")
    {
        return 400;
    }

    500
}

// ---------------------------------------------------------------------------
// Workspace identifier normalization + membership verification.
//
// These helpers are file-local copies of the private fns in
// `workspace_habits_access.rs`. They are intentionally duplicated rather than
// shared: the originals are `pub(crate)`-private to that module and the task
// constraints forbid editing other files. Membership lookups use the service
// role key (RLS-bypassing) for the same reasons the habits reference does.
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

fn workspaces_chat_friend_requests_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_CHAT_FRIEND_REQUESTS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_CHAT_FRIEND_REQUESTS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
