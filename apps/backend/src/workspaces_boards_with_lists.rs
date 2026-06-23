use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/boards-with-lists";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_WORKSPACE_MESSAGE: &str = "Invalid workspace ID";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const MEMBERSHIP_LOOKUP_FAILED_DETAIL: &str = "membership_lookup_failed";
const NO_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const FETCH_BOARDS_FAILED_MESSAGE: &str = "Failed to fetch boards";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// ---------- Response/data shapes ----------

#[derive(Serialize)]
struct BoardsResponse {
    boards: Vec<BoardOut>,
}

#[derive(Serialize)]
struct BoardOut {
    id: String,
    name: Option<String>,
    created_at: Option<String>,
    default_list_id: Option<String>,
    task_lists: Vec<TaskListOut>,
}

#[derive(Serialize)]
struct TaskListOut {
    id: String,
    name: Option<String>,
    status: Option<String>,
    color: Option<String>,
    position: Option<i64>,
    deleted: Option<bool>,
}

// ---------- Inbound (PostgREST) shapes ----------

#[derive(Deserialize)]
struct BoardRow {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    default_list_id: Option<String>,
    #[serde(default)]
    task_lists: Vec<TaskListRow>,
}

#[derive(Deserialize)]
struct BoardRowNoDefault {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    task_lists: Vec<TaskListRow>,
}

#[derive(Deserialize)]
struct TaskListRow {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    position: Option<i64>,
    #[serde(default)]
    deleted: Option<bool>,
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
struct UserPrivateEmailRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct TaskBoardShareRow {
    #[serde(default)]
    board_id: Option<String>,
}

// ---------- Entry point ----------

pub(crate) async fn handle_workspaces_boards_with_lists_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = boards_with_lists_ws_id(request.path)?;

    Some(match request.method {
        "GET" => boards_with_lists_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn boards_with_lists_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth: this route allows app-session auth (calendar/tasks) in legacy, so
    // accept bearer/cookie tokens even when an app session token is present.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(auth_user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = auth_user
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let user_email = auth_user.email.clone();

    // Normalize workspace id (handles `personal`, `internal`, handles).
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    if !is_uuid_literal(&ws_id) {
        return error_response(400, INVALID_WORKSPACE_MESSAGE);
    }

    // Membership check (mirrors verifyWorkspaceMembershipType; lookup failure -> 500).
    let membership = match verify_workspace_member(contact_data, outbound, &ws_id, &user_id).await {
        Ok(membership) => membership,
        Err(()) => {
            return error_response_with_detail(
                500,
                MEMBERSHIP_LOOKUP_FAILED_MESSAGE,
                MEMBERSHIP_LOOKUP_FAILED_DETAIL,
            );
        }
    };

    // For non-members, resolve guest-shared board access.
    let guest_board_ids = if membership {
        Vec::new()
    } else {
        match load_guest_board_ids(
            contact_data,
            outbound,
            &ws_id,
            &user_id,
            user_email.as_deref(),
        )
        .await
        {
            Ok(ids) => ids,
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    };

    if !membership && guest_board_ids.is_empty() {
        return error_response(403, NO_ACCESS_MESSAGE);
    }

    let restrict_board_ids: Option<&[String]> = if membership {
        None
    } else {
        Some(&guest_board_ids)
    };

    match fetch_boards(contact_data, outbound, &ws_id, restrict_board_ids).await {
        Ok(boards) => no_store_response(json_response(200, BoardsResponse { boards })),
        Err(()) => error_response(500, FETCH_BOARDS_FAILED_MESSAGE),
    }
}

// ---------- Boards fetch (with default_list_id fallback) ----------

async fn fetch_boards(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    restrict_board_ids: Option<&[String]>,
) -> Result<Vec<BoardOut>, ()> {
    // Primary: select including default_list_id.
    let primary_select =
        "id,name,created_at,default_list_id,task_lists(id,name,status,color,position,deleted)";
    let url = build_boards_url(contact_data, ws_id, restrict_board_ids, primary_select).ok_or(())?;
    let response = service_role_get(contact_data, outbound, &url).await?;

    if is_success(response.status) {
        let rows = response.json::<Vec<BoardRow>>().map_err(|_| ())?;
        return Ok(rows.into_iter().map(board_row_to_out).collect());
    }

    // Fallback: some environments may not have default_list_id migrated yet.
    // PostgREST returns 4xx with code 42703 / message mentioning the column.
    if column_missing_error(&response, "default_list_id") {
        let fallback_select =
            "id,name,created_at,task_lists(id,name,status,color,position,deleted)";
        let url =
            build_boards_url(contact_data, ws_id, restrict_board_ids, fallback_select).ok_or(())?;
        let response = service_role_get(contact_data, outbound, &url).await?;
        if !is_success(response.status) {
            return Err(());
        }
        let rows = response.json::<Vec<BoardRowNoDefault>>().map_err(|_| ())?;
        return Ok(rows.into_iter().map(board_row_no_default_to_out).collect());
    }

    Err(())
}

fn build_boards_url(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    restrict_board_ids: Option<&[String]>,
    select: &str,
) -> Option<String> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", select.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("deleted_at", "is.null".to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];

    if let Some(ids) = restrict_board_ids {
        // `.in.(id1,id2,...)` — empty handled by caller (never reaches here empty).
        let joined = ids.join(",");
        params.push(("id", format!("in.({joined})")));
    }

    contact_data.rest_url("workspace_boards", &params)
}

fn board_row_to_out(row: BoardRow) -> BoardOut {
    BoardOut {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        default_list_id: row.default_list_id,
        task_lists: row.task_lists.into_iter().map(task_list_to_out).collect(),
    }
}

fn board_row_no_default_to_out(row: BoardRowNoDefault) -> BoardOut {
    BoardOut {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        default_list_id: None,
        task_lists: row.task_lists.into_iter().map(task_list_to_out).collect(),
    }
}

fn task_list_to_out(row: TaskListRow) -> TaskListOut {
    TaskListOut {
        id: row.id,
        name: row.name,
        status: row.status,
        color: row.color,
        position: row.position,
        deleted: row.deleted,
    }
}

/// Best-effort detection of the PostgREST "undefined column" error so we can
/// retry without `default_list_id`. The error body carries `code: "42703"` or a
/// message that references the missing column.
fn column_missing_error(response: &OutboundResponse, column: &str) -> bool {
    #[derive(Deserialize)]
    struct PgError {
        #[serde(default)]
        code: Option<String>,
        #[serde(default)]
        message: Option<String>,
    }

    match response.json::<PgError>() {
        Ok(err) => {
            err.code.as_deref() == Some("42703")
                || err
                    .message
                    .as_deref()
                    .map(|m| m.contains(column))
                    .unwrap_or(false)
        }
        Err(_) => false,
    }
}

// ---------- Guest share board ids ----------

async fn load_guest_board_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    auth_email: Option<&str>,
) -> Result<Vec<String>, ()> {
    let recipient_email = match normalize_email(auth_email) {
        Some(email) => Some(email),
        None => get_user_private_email(contact_data, outbound, user_id).await?,
    };

    let mut board_ids: BTreeSet<String> = BTreeSet::new();

    // Shares matched by user id.
    for id in query_share_board_ids(
        contact_data,
        outbound,
        ws_id,
        ("shared_with_user_id", user_id),
    )
    .await?
    {
        board_ids.insert(id);
    }

    // Shares matched by recipient email (if available).
    if let Some(email) = recipient_email.as_deref() {
        for id in query_share_board_ids(contact_data, outbound, ws_id, ("shared_with_email", email))
            .await?
        {
            board_ids.insert(id);
        }
    }

    Ok(board_ids.into_iter().collect())
}

async fn query_share_board_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    matcher: (&str, &str),
) -> Result<Vec<String>, ()> {
    let (filter_key, filter_value) = matcher;
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            (
                "select",
                "board_id,workspace_boards!inner(id,ws_id,deleted_at)".to_owned(),
            ),
            ("workspace_boards.ws_id", format!("eq.{ws_id}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
            (filter_key, format!("eq.{filter_value}")),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskBoardShareRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.board_id)
        .filter(|id| !id.is_empty())
        .collect())
}

async fn get_user_private_email(
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

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<UserPrivateEmailRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.email)
        .as_deref()
        .and_then(|email| normalize_email(Some(email))))
}

fn normalize_email(email: Option<&str>) -> Option<String> {
    let normalized = email?.trim().to_lowercase();
    (!normalized.is_empty()).then_some(normalized)
}

// ---------- Workspace id normalization + membership ----------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved);
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

    Ok(resolved)
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

// ---------- Outbound helpers ----------

async fn caller_get(
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

async fn service_role_get(
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

// ---------- Pure helpers ----------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn boards_with_lists_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
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
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_uuid_literal(value: &str) -> bool {
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn error_response_with_detail(status: u16, message: &str, details: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "error": message, "details": details }),
    ))
}
