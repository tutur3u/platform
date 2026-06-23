use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeSet;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_WORKSPACE_MESSAGE: &str = "Invalid workspace ID";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NO_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const FETCH_BOARDS_FAILED_MESSAGE: &str = "Failed to fetch boards";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const WORKSPACES_BOARDS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_BOARDS_PATH_SUFFIX: &str = "/boards";

// Mirrors the embedded select used by the legacy route. PostgREST returns the
// nested `task_lists` array under each board row.
const BOARDS_SELECT: &str = "id,name,created_at,task_lists(id,name,status,color,position,deleted)";

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
struct UserPrivateEmailRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct TaskBoardShareRow {
    board_id: Option<String>,
}

pub(crate) async fn handle_workspaces_boards_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_boards_ws_id(request.path)?;

    Some(match request.method {
        "GET" => boards_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn boards_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // The legacy route authenticates the caller's Supabase session (also allowing
    // calendar/tasks app sessions) and then reads data through the admin client.
    // Here we authenticate the bearer/cookie access token and perform reads with
    // the service-role key (admin client equivalent), restricting non-members via
    // guest-share board IDs.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(auth_user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = auth_user
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    if !is_workspace_uuid_literal(&normalized_ws_id) {
        return message_response(400, INVALID_WORKSPACE_MESSAGE);
    }

    let is_member =
        match verify_workspace_member(contact_data, outbound, &normalized_ws_id, &user_id).await {
            Ok(is_member) => is_member,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    // For non-members, fall back to guest-share access scoped to specific boards.
    let guest_board_ids = if is_member {
        Vec::new()
    } else {
        match load_guest_share_board_ids(
            contact_data,
            outbound,
            &normalized_ws_id,
            &user_id,
            auth_user.email.as_deref(),
        )
        .await
        {
            Ok(ids) => ids,
            // The legacy guest-share loader throws on query failure, surfacing as a
            // 500 from the route's outer catch.
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    };

    if !is_member && guest_board_ids.is_empty() {
        return message_response(403, NO_ACCESS_MESSAGE);
    }

    match fetch_boards(
        contact_data,
        outbound,
        &normalized_ws_id,
        if is_member {
            None
        } else {
            Some(&guest_board_ids)
        },
    )
    .await
    {
        Ok(boards) => no_store_response(json_response(200, json!({ "boards": boards }))),
        Err(()) => message_response(500, FETCH_BOARDS_FAILED_MESSAGE),
    }
}

async fn fetch_boards(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    restrict_board_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let mut params = vec![
        ("select", BOARDS_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("deleted_at", "is.null".to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];

    if let Some(board_ids) = restrict_board_ids {
        params.push(("id", in_filter(board_ids)));
    }

    let Some(url) = contact_data.rest_url("workspace_boards", &params) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn load_guest_share_board_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    auth_email: Option<&str>,
) -> Result<Vec<String>, ()> {
    // Mirror loadTaskBoardGuestSharesForWorkspace: prefer the auth email, otherwise
    // fall back to user_private_details.email, then query shares by user_id and by
    // email (separately), unioning the resulting board IDs.
    let recipient_email = match normalize_share_email(auth_email) {
        Some(email) => Some(email),
        None => fetch_user_private_email(contact_data, outbound, user_id).await?,
    };

    let mut board_ids = BTreeSet::<String>::new();

    let by_user = query_share_board_ids(
        contact_data,
        outbound,
        ws_id,
        ("shared_with_user_id", format!("eq.{user_id}")),
    )
    .await?;
    board_ids.extend(by_user);

    if let Some(email) = recipient_email {
        let by_email = query_share_board_ids(
            contact_data,
            outbound,
            ws_id,
            ("shared_with_email", format!("eq.{email}")),
        )
        .await?;
        board_ids.extend(by_email);
    }

    Ok(board_ids.into_iter().collect())
}

async fn query_share_board_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    recipient_filter: (&str, String),
) -> Result<Vec<String>, ()> {
    // Embed workspace_boards!inner to apply the ws_id + non-deleted board filter,
    // matching the legacy helper's join filters.
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            (
                "select",
                "board_id,workspace_boards!inner(id,ws_id,deleted_at)".to_owned(),
            ),
            ("workspace_boards.ws_id", format!("eq.{ws_id}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
            (recipient_filter.0, recipient_filter.1),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskBoardShareRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.board_id)
        .collect())
}

async fn fetch_user_private_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "email".to_owned()),
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
        .json::<Vec<UserPrivateEmailRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.email)
        .and_then(|email| normalize_share_email(Some(&email))))
}

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

fn in_filter(values: &[String]) -> String {
    let joined = values
        .iter()
        .map(|value| value.as_str())
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

fn normalize_share_email(email: Option<&str>) -> Option<String> {
    let normalized = email?.trim().to_lowercase();
    (!normalized.is_empty()).then_some(normalized)
}

fn workspaces_boards_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_BOARDS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_BOARDS_PATH_SUFFIX)?;

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
    no_store_response(json_response(status, json!({ "error": message })))
}
