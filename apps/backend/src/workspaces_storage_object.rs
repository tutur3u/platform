use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const STORAGE_OBJECT_APP_SESSION_TARGETS: [&str; 2] = ["drive", "finance"];
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const GET_WALLET_TRANSACTIONS_RPC: &str = "get_wallet_transactions_with_permissions";
const VIEW_DRIVE_PERMISSION: &str = "view_drive";
const MOBILE_DEPLOYMENT_DRIVE_PREFIX: &str = ".tuturuuu/mobile-deployment-vault";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FILE_NOT_FOUND_MESSAGE: &str = "File not found";
const INVALID_PATH_MESSAGE: &str = "Invalid file path";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const INVALID_ROUTE_PARAMS_MESSAGE: &str = "Invalid route params";

#[derive(Clone, Debug)]
struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct StorageObjectRow {
    id: Option<String>,
    name: Option<String>,
    metadata: Option<serde_json::Value>,
    bucket_id: Option<String>,
    created_at: Option<serde_json::Value>,
    updated_at: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct StorageObjectData {
    id: Option<String>,
    name: String,
    path: String,
    #[serde(rename = "fullPath")]
    full_path: String,
    #[serde(rename = "bucketId")]
    bucket_id: Option<String>,
    size: serde_json::Value,
    mimetype: String,
    #[serde(rename = "createdAt")]
    created_at: serde_json::Value,
    #[serde(rename = "updatedAt")]
    updated_at: serde_json::Value,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct WalletTransactionsRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
    p_transaction_ids: [&'a str; 1],
    p_limit: i64,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(crate) async fn handle_workspaces_storage_object_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, object_id) = storage_object_path_params(request.path)?;

    Some(match request.method {
        "GET" => storage_object_response(config, request, raw_ws_id, object_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn storage_object_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    object_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, INTERNAL_ERROR_MESSAGE);
    }

    // Mirror the legacy route param validation: id must be a UUID.
    if !is_uuid_literal(object_id) {
        return message_response(400, INVALID_ROUTE_PARAMS_MESSAGE);
    }

    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let normalized_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) => return message_response(401, UNAUTHORIZED_MESSAGE),
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    let object = match fetch_storage_object(&config.contact_data, outbound, object_id).await {
        Ok(Some(object)) => object,
        Ok(None) => return message_response(404, FILE_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let Some(object_name) = object.name.as_deref().filter(|name| !name.is_empty()) else {
        return message_response(404, FILE_NOT_FOUND_MESSAGE);
    };
    let object_name = object_name.to_owned();

    // Ensure the file belongs to the workspace.
    let prefix = format!("{normalized_ws_id}/");
    let Some(relative_path) = object_name.strip_prefix(&prefix) else {
        return message_response(403, FORBIDDEN_MESSAGE);
    };

    let Some(sanitized_path) = sanitize_path(relative_path) else {
        return message_response(400, INVALID_PATH_MESSAGE);
    };
    if sanitized_path.is_empty() {
        // sanitizePath('') => '' which is falsy in the legacy route.
        return message_response(400, INVALID_PATH_MESSAGE);
    }

    if is_reserved_mobile_deployment_drive_path(&normalized_ws_id, &sanitized_path) {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    let can_read =
        match can_read_storage_object(config, outbound, &normalized_ws_id, &sanitized_path, &user)
            .await
        {
            Ok(can_read) => can_read,
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    if !can_read {
        return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
    }

    let display_name = object_name.rsplit('/').next().unwrap_or("").to_owned();

    let metadata = object.metadata.unwrap_or(serde_json::Value::Null);
    let size = match metadata.get("size") {
        Some(value) if !value.is_null() => value.clone(),
        _ => json!(0),
    };
    let mimetype = metadata
        .get("mimetype")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("application/octet-stream")
        .to_owned();

    let data = StorageObjectData {
        id: object.id,
        name: display_name,
        path: sanitized_path,
        full_path: object_name,
        bucket_id: object.bucket_id,
        size,
        mimetype,
        created_at: object.created_at.unwrap_or(serde_json::Value::Null),
        updated_at: object.updated_at.unwrap_or(serde_json::Value::Null),
    };

    no_store_response(json_response(200, json!({ "data": data })))
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) = contact::resolve_app_session_identity(
            config,
            request,
            &STORAGE_OBJECT_APP_SESSION_TARGETS,
        ) && let Some(id) = non_empty(identity.id)
        {
            return Some(AuthenticatedUser {
                access_token: None,
                id,
            });
        }

        if let Ok(identity) = contact::resolve_cli_app_session_identity(config, request)
            && let Some(id) = non_empty(identity.id)
        {
            return Some(AuthenticatedUser {
                access_token: None,
                id,
            });
        }
    }

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty(user.id?)?;

    Some(AuthenticatedUser {
        access_token: Some(access_token),
        id,
    })
}

async fn can_read_storage_object(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    sanitized_path: &str,
    user: &AuthenticatedUser,
) -> Result<bool, ()> {
    // `!permissions.withoutPermission('view_drive')` == `containsPermission('view_drive')`.
    if has_workspace_permission(
        &config.contact_data,
        outbound,
        ws_id,
        VIEW_DRIVE_PERMISSION,
        &user.id,
    )
    .await?
    {
        return Ok(true);
    }

    can_access_finance_transaction_storage_path(config, outbound, ws_id, sanitized_path, user).await
}

async fn can_access_finance_transaction_storage_path(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    sanitized_path: &str,
    user: &AuthenticatedUser,
) -> Result<bool, ()> {
    let Some(transaction_id) = finance_transaction_id_from_storage_path(sanitized_path) else {
        return Ok(false);
    };

    let rpc_url = config
        .contact_data
        .rpc_url(GET_WALLET_TRANSACTIONS_RPC)
        .ok_or(())?;
    let service_role_key = config.contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&WalletTransactionsRequest {
        p_ws_id: ws_id,
        p_user_id: &user.id,
        p_transaction_ids: [transaction_id],
        p_limit: 1,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // Legacy: `return !error && (data?.length ?? 0) > 0;`
    if !is_success_status(response.status) {
        return Ok(false);
    }

    let rows = response.json::<Vec<serde_json::Value>>().map_err(|_| ())?;

    Ok(!rows.is_empty())
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

async fn fetch_storage_object(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    object_id: &str,
) -> Result<Option<StorageObjectRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "objects",
        &[
            (
                "select",
                "id,name,metadata,bucket_id,created_at,updated_at".to_owned(),
            ),
            ("id", format!("eq.{object_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                // The legacy route queries `storage.objects` via the storage schema.
                .with_header("Accept-Profile", "storage"),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<StorageObjectRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
        {
            return Ok(Some(workspace_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

/// Extract the dynamic `(wsId, objectId)` segments for
/// `/api/v1/workspaces/:wsId/storage/object/:id`.
fn storage_object_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "storage"
        && segments[5] == "object"
        && !segments[6].is_empty()
    {
        Some((segments[3], segments[6]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn finance_transaction_id_from_storage_path(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.first() == Some(&"finance")
        && segments.get(1) == Some(&"transactions")
        && segments.get(2).is_some_and(|id| !id.is_empty())
    {
        segments.get(2).copied()
    } else {
        None
    }
}

/// Mirror of `sanitizePath` from `@tuturuuu/utils/storage-path`.
/// Returns `None` for invalid paths, otherwise the normalized path (possibly empty).
fn sanitize_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return Some(String::new());
    }

    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim().trim_matches('/');

    let segments: Vec<&str> = trimmed
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    for segment in &segments {
        if *segment == ".." || *segment == "." || segment.is_empty() {
            return None;
        }
        if segment.contains("..") {
            return None;
        }
    }

    Some(segments.join("/"))
}

/// Mirror of `isReservedMobileDeploymentDrivePath`.
fn is_reserved_mobile_deployment_drive_path(ws_id: &str, sanitized_path: &str) -> bool {
    if resolve_workspace_id(ws_id) != ROOT_WORKSPACE_ID {
        return false;
    }

    // `sanitized_path` here is already the result of sanitizePath in the caller, but the
    // legacy helper re-sanitizes; a sanitized path never re-sanitizes to None.
    let Some(normalized) = sanitize_path(sanitized_path) else {
        return false;
    };

    normalized == MOBILE_DEPLOYMENT_DRIVE_PREFIX
        || normalized.starts_with(&format!("{MOBILE_DEPLOYMENT_DRIVE_PREFIX}/"))
        || (!normalized.is_empty()
            && MOBILE_DEPLOYMENT_DRIVE_PREFIX.starts_with(&format!("{normalized}/")))
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
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
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

fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
